import { CONFIG } from '../../config.js';

/**
 * BasicSnake — World 2 ground enemy.
 *
 * The snake is drawn as a multi-segment worm:
 *   head  — rotated image, world-space (not a container child)
 *   body  — N rotated images spaced along a position history
 *   tail  — rotated image at the end
 *
 * All body/tail images are NOT children of this container; they are positioned
 * directly in world space each frame from the _history array. This avoids
 * double-transform issues because the container is positioned at the head.
 *
 * State machine:  SPAWN → HUNT → TO_BUSH → HIDING → HUNT …
 *
 * Returns from update():
 *   'alive'        — still moving
 *   'reached_snail'— head reached Gerald
 */
export default class BasicSnake extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);  // just below alien saucers (depth 45)

        const cfg = CONFIG.SNAKES;
        const bc  = cfg.BASIC;

        this.health    = bc.HEALTH;
        this.speed     = bc.SPEED;
        this.radius    = bc.RADIUS;
        this.alienType = 'basic-snake';

        // Bush interaction
        this.hidingInBush = false;
        this.currentBush  = null;

        // Stun (from bush flush)
        this._stunMs = 0;

        // Movement state
        this._state   = 'HUNT';
        this._targetBush = null;

        // Rolling history of past head positions used for body segment placement.
        // We keep enough entries to cover all segments.
        this._spacing   = cfg.BODY_SPACING;
        const segCount  = bc.SEGMENT_COUNT;
        const histLen   = (segCount + 2) * this._spacing + 60;  // +2 for tail
        this._history   = [];
        for (let i = 0; i < histLen; i++) {
            this._history.push({ x, y });
        }

        // Build visuals
        this._buildVisuals(scene, segCount);

        // Decide whether to seek a bush on spawn
        if (Math.random() < bc.HIDE_CHANCE) {
            this._state = 'TO_BUSH';
        }
    }

    // ── Visuals ─────────────────────────────────────────────────────────────

    _buildVisuals(scene, segCount) {
        // Ground shadow under the head
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(2, 8, 52, 16);
        this.add(shadow);

        // Head image — child of container so it moves with container position
        this._headImg = scene.add.image(0, 0, 'snake-basic-head');
        this._headImg.setOrigin(0.5, 0.5);
        this.add(this._headImg);

        // Body segments — world-space images (NOT container children)
        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-basic-body');
            img.setOrigin(0.5, 0.5);
            img.setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }

        // Tail — world-space image
        this._tailImg = scene.add.image(this.x, this.y, 'snake-basic-tail');
        this._tailImg.setOrigin(0.5, 0.5);
        this._tailImg.setDepth(this.depth - 2);
    }

    // ── Damage & death ──────────────────────────────────────────────────────

    takeDamage(amount) {
        if (this.hidingInBush) return false;   // fully invulnerable while hiding
        this.health -= amount;
        return this.health <= 0;
    }

    /** Bypass for e.g. AoE that shouldn't be blocked by bush cover. */
    takeDamageRaw(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    // ── Update ───────────────────────────────────────────────────────────────

    update(time, delta) {
        if (!this.active) return 'alive';

        const dt = delta / 1000;

        // ── Stun handling ──
        if (this._stunMs > 0) {
            this._stunMs -= delta;
            this._updateSegmentPositions();
            return 'alive';
        }

        if (this._state === 'HIDING') {
            // Perfectly still while hiding — just update visuals
            this._updateSegmentPositions();
            return 'alive';
        }

        // ── Movement target ──
        let targetX, targetY;

        if (this._state === 'TO_BUSH') {
            const bush = this._pickOrKeepBush();
            if (!bush) {
                this._state = 'HUNT';   // no bushes available — fall through to hunt
            } else {
                this._targetBush = bush;
                targetX = bush.x;
                targetY = bush.y;

                // Close enough to enter?
                const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
                if (dist < CONFIG.BUSHES.OCCUPY_RADIUS) {
                    if (bush.enter(this)) {
                        this.hidingInBush = true;
                        this.currentBush  = bush;
                        this._state       = 'HIDING';
                        this._updateSegmentPositions();
                        return 'alive';
                    } else {
                        // Bush was occupied — switch to hunting
                        this._targetBush = null;
                        this._state = 'HUNT';
                    }
                }
            }
        }

        if (this._state === 'HUNT') {
            const speedMult = this.scene.alienSpeedMultiplier || 1.0;
            const snail     = this.scene.snail;
            targetX = snail.x;
            targetY = snail.y;

            const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
            this.x += Math.cos(angle) * this.speed * speedMult * dt;
            this.y += Math.sin(angle) * this.speed * speedMult * dt;

            // Rotate head toward movement direction
            this._headImg.setRotation(angle);

            const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 20) {
                this._pushHistory();
                this._updateSegmentPositions();
                return 'reached_snail';
            }
        } else if (this._state === 'TO_BUSH') {
            const speedMult = this.scene.alienSpeedMultiplier || 1.0;
            const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
            this.x += Math.cos(angle) * this.speed * speedMult * dt;
            this.y += Math.sin(angle) * this.speed * speedMult * dt;
            this._headImg.setRotation(angle);
        }

        this._pushHistory();
        this._updateSegmentPositions();
        return 'alive';
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    _pushHistory() {
        this._history.unshift({ x: this.x, y: this.y });
        if (this._history.length > 300) this._history.length = 300;
    }

    _updateSegmentPositions() {
        const sp = this._spacing;

        for (let i = 0; i < this._bodyImgs.length; i++) {
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(idx - sp);
            const img  = this._bodyImgs[i];
            img.setPosition(pos.x, pos.y);
            img.setRotation(Math.atan2(prev.y - pos.y, prev.x - pos.x));
        }

        const tailIdx  = (this._bodyImgs.length + 1) * sp;
        const tailPos  = this._histAt(tailIdx);
        const tailPrev = this._histAt(tailIdx - sp);
        this._tailImg.setPosition(tailPos.x, tailPos.y);
        this._tailImg.setRotation(Math.atan2(tailPrev.y - tailPos.y, tailPrev.x - tailPos.x));
    }

    _histAt(i) {
        const idx = Math.min(i, this._history.length - 1);
        return this._history[idx];
    }

    /**
     * Find a non-scorched, unoccupied bush to head toward.
     * Re-uses _targetBush if it's still valid.
     */
    _pickOrKeepBush() {
        const bushes = this.scene.bushes;
        if (!bushes || bushes.length === 0) return null;

        // Re-use current target if still valid
        if (
            this._targetBush &&
            this._targetBush.active &&
            !this._targetBush._scorched &&
            (!this._targetBush.isOccupied || this._targetBush.occupant === this)
        ) {
            return this._targetBush;
        }

        // Pick nearest unoccupied, non-scorched bush
        let best = null, bestDist = Infinity;
        for (const b of bushes) {
            if (!b.active || b._scorched || b.isOccupied) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y);
            if (d < bestDist) { bestDist = d; best = b; }
        }
        return best;
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────

    destroy(fromScene) {
        // Release bush
        if (this.currentBush && this.currentBush.active && this.currentBush.isOccupied) {
            this.currentBush.exit();
        }

        // Destroy world-space body/tail images
        for (const img of this._bodyImgs) {
            if (img && img.active) img.destroy();
        }
        this._bodyImgs = [];

        if (this._tailImg && this._tailImg.active) {
            this._tailImg.destroy();
            this._tailImg = null;
        }

        super.destroy(fromScene);
    }
}
