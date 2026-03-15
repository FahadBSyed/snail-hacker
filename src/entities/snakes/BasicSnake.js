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

        this._fadedParts      = new Set();   // parts currently at alpha 0 (inside a bush)
        this._lastBushPos     = null;        // cached on exit; used for position-based reveal
        this._bushEntryAngle  = 0;           // direction stored when head enters, used to slither through

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
        shadow.fillEllipse(1, 4, 26, 8);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-basic-head');
        this._headImg.setOrigin(0.5, 0.5).setScale(0.5);
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

    /** Instant alpha set on all parts (used by flush). Also clears the faded-parts set. */
    _setBodyAlpha(alpha) {
        this._fadedParts.clear();
        this.setAlpha(alpha);
        for (const img of this._bodyImgs) img.setAlpha(alpha);
        if (this._tailImg) this._tailImg.setAlpha(alpha);
    }

    /**
     * Fade any part whose world-position is within OCCUPY_RADIUS of (bx,by).
     * Called every frame while the snake is entering a bush.
     */
    _tickBushHide(bx, by) {
        const r = CONFIG.BUSHES.OCCUPY_RADIUS;
        for (const part of [this, ...this._bodyImgs, this._tailImg]) {
            if (!part || this._fadedParts.has(part)) continue;
            const px = (part === this) ? this.x : part.x;
            const py = (part === this) ? this.y : part.y;
            if (Phaser.Math.Distance.Between(px, py, bx, by) < r) {
                this._fadedParts.add(part);
                this.scene.tweens.add({ targets: part, alpha: 0, duration: 120, ease: 'Sine.easeOut' });
            }
        }
    }

    /**
     * Reveal any faded part that has moved outside OCCUPY_RADIUS of (bx,by).
     * Called every frame after the snake exits a bush. Clears _lastBushPos when done.
     */
    _tickBushReveal(bx, by) {
        const r = CONFIG.BUSHES.OCCUPY_RADIUS;
        for (const part of [this, ...this._bodyImgs, this._tailImg]) {
            if (!part || !this._fadedParts.has(part)) continue;
            const px = (part === this) ? this.x : part.x;
            const py = (part === this) ? this.y : part.y;
            if (Phaser.Math.Distance.Between(px, py, bx, by) >= r) {
                this._fadedParts.delete(part);
                this.scene.tweens.add({ targets: part, alpha: 1, duration: 120, ease: 'Sine.easeOut' });
            }
        }
        if (this._fadedParts.size === 0) this._lastBushPos = null;
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
                // Bush.exit() caches position into _lastBushPos for reveal loop
                if (this.currentBush) this.currentBush.exit(this);
                this.hidingInBush = false;
                this.currentBush  = null;
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
                if (dist < CONFIG.BUSHES.OCCUPY_RADIUS && !this.hidingInBush) {
                    if (bush.enter(this)) {
                        if (this._fadedParts.size > 0) { this._setBodyAlpha(1); this._lastBushPos = null; }
                        // Store approach direction so the whole body slithers through
                        this._bushEntryAngle = Phaser.Math.Angle.Between(this.x, this.y, bush.x, bush.y);
                        this.hidingInBush = true;
                        this.currentBush  = bush;
                        this._hideTimer   = Phaser.Math.Between(
                            CONFIG.SNAKES.BASIC.HIDE_TIMER_MIN,
                            CONFIG.SNAKES.BASIC.HIDE_TIMER_MAX,
                        );
                    } else {
                        this._targetBush = null;
                        this._state = 'HUNT';
                    }
                }
                // Check parts every frame during entry (head may have passed through center)
                if (this.hidingInBush) {
                    this._tickBushHide(bush.x, bush.y);
                    if (this._fadedParts.size >= 2 + this._bodyImgs.length) {
                        this._state = 'HIDING';
                    }
                }
            }
        }

        if (this._state === 'HUNT') {
            // Reveal parts that have physically exited the last bush
            if (this._lastBushPos) this._tickBushReveal(this._lastBushPos.x, this._lastBushPos.y);

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
            if (this.hidingInBush) {
                // Slither through the bush in the stored approach direction so
                // the body follows the same path and all segments cross the radius
                this.x += Math.cos(this._bushEntryAngle) * this.speed * speedMult * dt;
                this.y += Math.sin(this._bushEntryAngle) * this.speed * speedMult * dt;
                this._headImg.setRotation(this._bushEntryAngle);
            } else {
                const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
                this.x += Math.cos(angle) * this.speed * speedMult * dt;
                this.y += Math.sin(angle) * this.speed * speedMult * dt;
                this._headImg.setRotation(angle);
            }
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
        if (this.currentBush && this.currentBush.active) this.currentBush.exit(this);
        this._fadedParts.clear();
        for (const img of this._bodyImgs) { if (img && img.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg && this._tailImg.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
