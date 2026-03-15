import { CONFIG } from '../../config.js';

/**
 * Python — World 2 multi-segment snake.
 *
 * Body structure:
 *   - Head (container origin): the ONLY targetable hit zone for damage.
 *   - Body segments (world-space images): deflect projectiles without taking damage.
 *     CollisionSystem checks `python._bodyHitboxes` and destroys the projectile with
 *     a spark but does NOT call takeDamage.
 *   - Exception: when the Python has 3 or fewer segments remaining, the tail-end
 *     segments also count as targetable (exposed tail hitboxes added to the head check).
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

        this._history = [{ x, y }];

        // Jitter — side-to-side slither
        const sc             = CONFIG.SNAKES;
        this._jitterMs       = 0;
        this._jitterDir      = 1;
        this._jitterCooldown = Phaser.Math.Between(sc.JITTER_COOLDOWN_MIN, sc.JITTER_COOLDOWN_MAX);

        this._buildVisuals(scene, cfg.SEGMENT_COUNT);
        this._rebuildBodyHitboxes();
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(1, 5, 28, 9);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-python-head');
        this._headImg.setOrigin(0.5, 0.5).setScale(0.5);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-python-body');
            img.setOrigin(0.5, 0.5).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-python-tail');
        this._tailImg.setOrigin(0.5, 0.5).setDepth(this.depth - 2);
    }

    /** Rebuild `_bodyHitboxes` from current segment positions. */
    _rebuildBodyHitboxes() {
        const cfg      = CONFIG.SNAKES.PYTHON;
        const bodyR    = cfg.BODY_RADIUS;
        const tailSegs = cfg.TAIL_HITBOX_SEGS;

        // When few segments remain, expose the tail end as a secondary hitbox
        const tailThreshold = tailSegs;
        const exposeTail    = this._segCount <= tailThreshold;

        // Body hitboxes: segments that block projectiles (don't damage the python)
        // We exclude tail segments when they're exposed (they become head hitboxes)
        this._bodyHitboxes = [];
        const protectedCount = exposeTail ? Math.max(0, this._segCount - tailSegs) : this._segCount;
        for (let i = 0; i < protectedCount; i++) {
            const img = this._bodyImgs[i];
            if (img && img.active) {
                this._bodyHitboxes.push({ x: img.x, y: img.y, r: bodyR });
            }
        }

        // Exposed tail hitboxes: treated identically to the head (deal damage on hit)
        this._tailHitboxes = [];
        if (exposeTail) {
            for (let i = protectedCount; i < this._segCount; i++) {
                const img = this._bodyImgs[i];
                if (img && img.active) {
                    this._tailHitboxes.push({ x: img.x, y: img.y, r: bodyR });
                }
            }
        }
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
            this._rebuildBodyHitboxes();
        }

        return this.health <= 0;
    }

    takeDamageRaw(amount) {
        return this.takeDamage(amount);
    }

    update(time, delta) {
        if (!this.active) return 'alive';
        const dt    = delta / 1000;
        const mult  = this.scene.alienSpeedMultiplier || 1.0;
        const snail = this.scene.snail;

        const toTarget = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
        let moveAngle;

        if (this._jitterMs > 0) {
            this._jitterMs -= delta;
            moveAngle = toTarget + this._jitterDir * (Math.PI / 2);
            if (this._jitterMs <= 0) {
                this._jitterCooldown = Phaser.Math.Between(
                    CONFIG.SNAKES.JITTER_COOLDOWN_MIN, CONFIG.SNAKES.JITTER_COOLDOWN_MAX,
                );
            }
        } else {
            if (this._jitterCooldown > 0) this._jitterCooldown -= delta;
            if (this._jitterCooldown <= 0) {
                this._jitterMs  = CONFIG.SNAKES.JITTER_DURATION;
                this._jitterDir = Math.random() < 0.5 ? 1 : -1;
                moveAngle = toTarget + this._jitterDir * (Math.PI / 2);
            } else {
                moveAngle = toTarget;
            }
        }

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
