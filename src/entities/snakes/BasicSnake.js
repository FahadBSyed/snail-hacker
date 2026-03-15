import { CONFIG } from '../../config.js';

/**
 * BasicSnake — World 2 ground enemy.
 *
 * Body rendering uses a distance-based position history (pushed every ≥2 px of
 * movement, frame-rate independent).  Segments are placed at history[i * BODY_SPACING].
 * A sinusoidal lateral wiggle is baked into the stored positions so the body
 * traces an S-curve behind the head.
 *
 * States:  HUNT → TO_BUSH → HIDING (hide timer) → HUNT …
 */
export default class BasicSnake extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        const cfg = CONFIG.SNAKES;
        const bc  = cfg.BASIC;

        this.health    = bc.HEALTH;
        this.speed     = bc.SPEED;
        this.radius    = bc.RADIUS;
        this.alienType = 'basic-snake';

        this.hidingInBush = false;
        this.currentBush  = null;
        this._stunMs      = 0;
        this._hideTimer   = 0;

        this._state      = 'HUNT';
        this._targetBush = null;

        // Jitter — side-to-side slither
        this._jitterMs       = 0;
        this._jitterDir      = 1;
        this._jitterCooldown = Phaser.Math.Between(
            cfg.JITTER_COOLDOWN_MIN, cfg.JITTER_COOLDOWN_MAX,
        );

        // Distance-based history: push only when moved ≥ 2 px
        this._spacing = cfg.BODY_SPACING;
        this._history = [{ x, y }];

        this._buildVisuals(scene, bc.SEGMENT_COUNT);

        if (Math.random() < bc.HIDE_CHANCE) this._state = 'TO_BUSH';
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(2, 8, 52, 16);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-basic-head');
        this._headImg.setOrigin(0.5, 0.5);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-basic-body');
            img.setOrigin(0.5, 0.5).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-basic-tail');
        this._tailImg.setOrigin(0.5, 0.5).setDepth(this.depth - 2);
    }

    /** Set alpha on the container (head) AND all world-space segment images. */
    _setBodyAlpha(alpha) {
        this.setAlpha(alpha);
        for (const img of this._bodyImgs) img.setAlpha(alpha);
        if (this._tailImg) this._tailImg.setAlpha(alpha);
    }

    takeDamage(amount) {
        if (this.hidingInBush) return false;
        this.health -= amount;
        return this.health <= 0;
    }

    takeDamageRaw(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    update(time, delta) {
        if (!this.active) return 'alive';
        const dt = delta / 1000;

        if (this._stunMs > 0) {
            this._stunMs -= delta;
            this._updateSegmentPositions();
            return 'alive';
        }

        if (this._state === 'HIDING') {
            this._hideTimer -= delta;
            if (this._hideTimer <= 0) {
                // Auto-emerge after hide timer expires
                if (this.currentBush) this.currentBush.exit(this);
                this.hidingInBush = false;
                this.currentBush  = null;
                this._setBodyAlpha(1);
                this._state = 'HUNT';
            } else {
                this._updateSegmentPositions();
                return 'alive';
            }
        }

        let targetX, targetY;

        if (this._state === 'TO_BUSH') {
            const bush = this._pickOrKeepBush();
            if (!bush) {
                this._state = 'HUNT';
            } else {
                this._targetBush = bush;
                targetX = bush.x;
                targetY = bush.y;

                const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
                if (dist < CONFIG.BUSHES.OCCUPY_RADIUS) {
                    if (bush.enter(this)) {
                        this.hidingInBush = true;
                        this.currentBush  = bush;
                        this._hideTimer   = Phaser.Math.Between(
                            CONFIG.SNAKES.BASIC.HIDE_TIMER_MIN,
                            CONFIG.SNAKES.BASIC.HIDE_TIMER_MAX,
                        );
                        this._setBodyAlpha(0.2);
                        this._state = 'HIDING';
                        this._updateSegmentPositions();
                        return 'alive';
                    } else {
                        this._targetBush = null;
                        this._state = 'HUNT';
                    }
                }
            }
        }

        if (this._state === 'HUNT') {
            const speedMult = this.scene.alienSpeedMultiplier || 1.0;
            const snail     = this.scene.snail;
            const toTarget  = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
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

            this.x += Math.cos(moveAngle) * this.speed * speedMult * dt;
            this.y += Math.sin(moveAngle) * this.speed * speedMult * dt;
            this._headImg.setRotation(moveAngle);

            const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 20) {
                this._pushHistory(time);
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

        this._pushHistory(time);
        this._updateSegmentPositions();
        return 'alive';
    }

    /**
     * Push the current head position to the history only when the snake has
     * moved ≥ 2 px since the last entry (distance-based, frame-rate independent).
     */
    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;

        this._history.unshift({
            x: this.x,
            y: this.y,
        });
        if (this._history.length > 500) this._history.length = 500;
    }

    _updateSegmentPositions() {
        const sp = this._spacing;
        for (let i = 0; i < this._bodyImgs.length; i++) {
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(Math.max(0, idx - sp));
            this._bodyImgs[i].setPosition(pos.x, pos.y);
            this._bodyImgs[i].setRotation(Math.atan2(prev.y - pos.y, prev.x - pos.x));
        }
        const ti  = (this._bodyImgs.length + 1) * sp;
        const tp  = this._histAt(ti);
        const tpr = this._histAt(Math.max(0, ti - sp));
        this._tailImg.setPosition(tp.x, tp.y);
        this._tailImg.setRotation(Math.atan2(tpr.y - tp.y, tpr.x - tp.x));
    }

    _histAt(i) {
        if (this._history.length === 0) return { x: this.x, y: this.y };
        return this._history[Math.min(i, this._history.length - 1)];
    }

    _pickOrKeepBush() {
        const bushes = this.scene.bushes;
        if (!bushes || bushes.length === 0) return null;
        if (
            this._targetBush &&
            this._targetBush.active &&
            !this._targetBush._scorched
        ) {
            return this._targetBush;
        }
        let best = null, bestDist = Infinity;
        for (const b of bushes) {
            if (!b.active || b._scorched) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y);
            if (d < bestDist) { bestDist = d; best = b; }
        }
        return best;
    }

    destroy(fromScene) {
        if (this.currentBush && this.currentBush.active && this.currentBush.isOccupied) {
            this.currentBush.exit(this);
        }
        for (const img of this._bodyImgs) { if (img && img.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg && this._tailImg.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
