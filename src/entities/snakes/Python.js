import { CONFIG } from '../../config.js';
import { applyHitReaction, tickHitWiggle, applyWiggleToSegments } from './snakeHitReaction.js';
import { initPath, tickSnakePath } from './snakePathfinding.js';

const PYTHON_RED_SEGS = 3;  // last N body segments are always red and targetable

/**
 * Python — World 2 multi-segment snake.
 *
 * Body structure:
 *   - Head (container origin): targetable hit zone for damage.
 *   - Body segments (world-space images): deflect projectiles without taking damage,
 *     EXCEPT the last PYTHON_RED_SEGS (3) segments, which are tinted red and always
 *     targetable.  CollisionSystem checks `python._bodyHitboxes` (non-red, deflect)
 *     and `python._tailHitboxes` (red, deal damage on hit).
 *   - As segments are removed by damage, the last 3 remaining are always kept red.
 *
 * Damage model:
 *   - Each hit to the head deals CONFIG.SNAKES.PYTHON.HP_PER_SEGMENT damage.
 *   - Every HP_PER_SEGMENT damage removes the last visible body segment.
 *   - `_bodyHitboxes` is rebuilt after each segment removal.
 *
 * No bush interaction (Python is too large to hide).
 */
export default class Python extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        const cfg = CONFIG.SNAKES.PYTHON;
        this.health    = cfg.HEALTH;
        this.speed     = cfg.SPEED;
        this.radius    = cfg.RADIUS;
        this.alienType = 'python';

        this.hidingInBush = false;  // never hides; field present for uniform CollisionSystem guard

        this._segCount    = cfg.SEGMENT_COUNT;  // current number of body segments
        this._spacing     = cfg.BODY_SPACING;

        this._stunMs           = 0;
        this._hitReacting      = false;
        this._hitGen           = 0;
        this._hitWiggleMs      = 0;
        this._hitWiggleElapsed = 0;

        this._history = [{ x, y }];

        // Sine-wave slither — continuous lateral oscillation toward the player
        this._slitherTime = 0;

        this._buildVisuals(scene, cfg.SEGMENT_COUNT);
        this._applySegmentColors();
        this._rebuildBodyHitboxes();
        initPath(this);
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(1, 5, 28, 9);
        shadow.setScale(1.69);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-python-head');
        this._headImg.setOrigin(0.5, 0.5).setScale(0.845);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-python-body');
            img.setOrigin(0.5, 0.5).setScale(1.69).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-python-tail');
        this._tailImg.setOrigin(0.5, 0.5).setScale(1.69).setDepth(this.depth - 2);
    }

    /**
     * Returns a Set of body-segment indices that are "exposed" weak points.
     * Indices are spread evenly across the current segment count so the three
     * spitter-textured segments are always visually distributed along the body.
     */
    _getRedIndices() {
        const n       = Math.min(PYTHON_RED_SEGS, this._segCount);
        const indices = new Set();
        for (let k = 0; k < n; k++) {
            indices.add(Math.floor((k + 1) * this._segCount / (n + 1)));
        }
        return indices;
    }

    /** Rebuild `_bodyHitboxes` / `_tailHitboxes` from current segment positions. */
    _rebuildBodyHitboxes() {
        const bodyR      = CONFIG.SNAKES.PYTHON.BODY_RADIUS;
        const redIndices = this._getRedIndices();
        this._bodyHitboxes = [];
        this._tailHitboxes = [];
        for (let i = 0; i < this._segCount; i++) {
            const img = this._bodyImgs[i];
            if (!img || !img.active) continue;
            const box = { x: img.x, y: img.y, r: bodyR };
            if (redIndices.has(i)) this._tailHitboxes.push(box);
            else                   this._bodyHitboxes.push(box);
        }
    }

    /** Texture exposed segments with the spitter body sprite; rest get the normal python body. */
    _applySegmentColors() {
        const redIndices = this._getRedIndices();
        for (let i = 0; i < this._segCount; i++) {
            const img = this._bodyImgs[i];
            if (!img || !img.active) continue;
            img.setTexture(redIndices.has(i) ? 'snake-spitter-body' : 'snake-python-body');
        }
    }

    /** Called by applyHitReaction after restoring textures — re-applies persistent red coloring. */
    _onHitReactionEnd() {
        this._applySegmentColors();
    }

    takeDamage(amount) {
        this.health -= amount;

        // Remove one tail segment per HP_PER_SEGMENT damage threshold crossed
        const cfg        = CONFIG.SNAKES.PYTHON;
        const segsDead   = Math.floor((cfg.HEALTH - Math.max(0, this.health)) / cfg.HP_PER_SEGMENT);
        const targetSegs = Math.max(0, cfg.SEGMENT_COUNT - segsDead);

        if (targetSegs < this._segCount) {
            // Remove segments from the tail
            while (this._segCount > targetSegs) {
                this._segCount--;
                const img = this._bodyImgs[this._segCount];
                if (img && img.active) img.setVisible(false);
            }
            this._applySegmentColors();
            this._rebuildBodyHitboxes();
        }

        if (this.health <= 0) return true;
        applyHitReaction(this);
        return false;
    }

    takeDamageRaw(amount) {
        return this.takeDamage(amount);
    }

    update(time, delta) {
        if (!this.active) return 'alive';

        if (this._stunMs > 0) {
            this._stunMs -= delta;
            this._updateSegments();
            this._rebuildBodyHitboxes();
            return 'alive';
        }

        tickHitWiggle(this, delta);

        const dt    = delta / 1000;
        const mult  = this.scene.enemySpeedMultiplier || 1.0;
        const snail = this.scene.snail;

        const toTarget = tickSnakePath(this, delta, snail.x, snail.y);
        let moveAngle;

        this._slitherTime += delta / 1000;
        const cfg = CONFIG.SNAKES.PYTHON;
        moveAngle = toTarget + cfg.SLITHER_AMPLITUDE * Math.sin(this._slitherTime * cfg.SLITHER_FREQUENCY * Math.PI * 2);

        this.x += Math.cos(moveAngle) * this.speed * mult * dt;
        this.y += Math.sin(moveAngle) * this.speed * mult * dt;
        this._headImg.setRotation(moveAngle);

        this._pushHistory(time);
        this._updateSegments();
        this._rebuildBodyHitboxes();  // update world-space positions each frame

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }

    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;
        this._history.unshift({ x: this.x, y: this.y });
        if (this._history.length > 600) this._history.length = 600;
    }

    _updateSegments() {
        const sp = this._spacing;
        for (let i = 0; i < this._bodyImgs.length; i++) {
            if (i >= this._segCount) break;
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(idx - sp);
            this._bodyImgs[i].setPosition(pos.x, pos.y).setVisible(true);
            this._bodyImgs[i].setRotation(Math.atan2(prev.y - pos.y, prev.x - pos.x));
        }
        const ti  = (this._segCount + 1) * sp;
        const tp  = this._histAt(ti);
        const tpr = this._histAt(ti - sp);
        this._tailImg.setPosition(tp.x, tp.y);
        this._tailImg.setRotation(Math.atan2(tpr.y - tp.y, tpr.x - tp.x));
        applyWiggleToSegments(this);
    }

    _histAt(i) {
        if (this._history.length === 0) return { x: this.x, y: this.y };
        return this._history[Math.min(i, this._history.length - 1)];
    }

    destroy(fromScene) {
        for (const img of this._bodyImgs) { if (img && img.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg && this._tailImg.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
