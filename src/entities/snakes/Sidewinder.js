import { CONFIG } from '../../config.js';

/**
 * Sidewinder — World 2 snake that hops between bushes when P2's cursor is not watching.
 *
 * Mechanic:
 *   1. Spawns and dashes to the nearest bush (ENTERING).
 *   2. While hiding (HIDING): if P2's cursor is within WATCH_RADIUS of this bush, it
 *      creeps very slowly toward Gerald; otherwise it dashes to the next bush that is
 *      closer to the station than the current one.
 *   3. When no closer bush exists it switches to ATTACK — a direct dash at Gerald.
 *
 * The "cursor watching" check uses the bush position, not the snake's position, so P2
 * must keep the cursor near each bush the Sidewinder is hiding in.
 */
export default class Sidewinder extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        const cfg = CONFIG.SNAKES.SIDEWINDER;
        this.health    = cfg.HEALTH;
        this.speed     = cfg.SPEED_SLOW;
        this.radius    = cfg.RADIUS;
        this.alienType = 'sidewinder';

        this.hidingInBush = false;
        this.currentBush  = null;

        this._state       = 'ENTERING';
        this._targetBush  = null;
        this._stunMs      = 0;

        this._fadedParts     = new Set();
        this._lastBushPos    = null;
        this._bushEntryAngle = 0;

        // Jitter — same side-to-side slither as BasicSnake, applied during ATTACK
        this._jitterMs       = 0;
        this._jitterDir      = 1;
        this._jitterCooldown = Phaser.Math.Between(
            CONFIG.SNAKES.JITTER_COOLDOWN_MIN, CONFIG.SNAKES.JITTER_COOLDOWN_MAX,
        );

        // Distance-based history: push only when moved ≥ 2 px
        this._spacing = CONFIG.SNAKES.BODY_SPACING;
        this._history = [{ x, y }];

        this._buildVisuals(scene, cfg.SEGMENT_COUNT);

        // Pick first target bush immediately
        this._targetBush = this._nearestFreeBush();
        if (!this._targetBush) this._state = 'ATTACK';
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(2, 8, 46, 14);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-sidewinder-head');
        this._headImg.setOrigin(0.5, 0.5);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-sidewinder-body');
            img.setOrigin(0.5, 0.5).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-sidewinder-tail');
        this._tailImg.setOrigin(0.5, 0.5).setDepth(this.depth - 2);
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
            this._updateSegments();
            return 'alive';
        }

        if (this._state === 'HIDING') {
            // Check if cursor is watching this bush
            const cursor = this.scene.input.activePointer;
            const bush   = this.currentBush;
            const cdist  = bush
                ? Phaser.Math.Distance.Between(cursor.x, cursor.y, bush.x, bush.y)
                : Infinity;
            const watched = cdist <= CONFIG.SNAKES.SIDEWINDER.WATCH_RADIUS;

            if (watched) {
                // Slowly creep toward Gerald
                this._moveToward(this.scene.snail, CONFIG.SNAKES.SIDEWINDER.SPEED_SLOW, dt);
            } else {
                // Cursor looked away — find next bush closer to station
                const nextBush = this._nextBushCloserToStation();
                if (nextBush) {
                    // Exit current bush
                    if (this.currentBush) this.currentBush.exit(this);
                    this.hidingInBush = false;
                    this.currentBush  = null;
                    this._targetBush  = nextBush;
                    this._state       = 'DASHING';
                } else {
                    // No closer bush — attack
                    if (this.currentBush) this.currentBush.exit(this);
                    this.hidingInBush = false;
                    this.currentBush  = null;
                    this._state       = 'ATTACK';
                }
            }
            this._updateSegments();
            return 'alive';
        }

        if (this._state === 'ENTERING' || this._state === 'DASHING') {
            const spd  = this._state === 'ENTERING'
                ? CONFIG.SNAKES.SIDEWINDER.SPEED_SLOW
                : CONFIG.SNAKES.SIDEWINDER.SPEED_DASH;
            const mult = this.scene.alienSpeedMultiplier || 1.0;

            // ── Entry phase: slither through the bush so the whole body follows ──
            if (this.hidingInBush) {
                this._tickBushHide(this.currentBush.x, this.currentBush.y);
                if (this._fadedParts.size >= 2 + this._bodyImgs.length) {
                    this._state = 'HIDING';
                } else {
                    this.x += Math.cos(this._bushEntryAngle) * spd * mult * dt;
                    this.y += Math.sin(this._bushEntryAngle) * spd * mult * dt;
                }
                this._pushHistory(time);
                this._updateSegments();
                return 'alive';
            }

            // Reveal parts still fading out from the previous bush
            if (this._lastBushPos) this._tickBushReveal(this._lastBushPos.x, this._lastBushPos.y);

            if (!this._targetBush || !this._targetBush.active) {
                this._targetBush = this._nearestFreeBush();
                if (!this._targetBush) { this._state = 'ATTACK'; }
            }

            if (this._targetBush && this._targetBush.active) {
                const dist = Phaser.Math.Distance.Between(
                    this.x, this.y, this._targetBush.x, this._targetBush.y,
                );
                if (dist < CONFIG.BUSHES.OCCUPY_RADIUS) {
                    if (this._targetBush.enter(this)) {
                        if (this._fadedParts.size > 0) { this._setBodyAlpha(1); this._lastBushPos = null; }
                        this._bushEntryAngle = Phaser.Math.Angle.Between(
                            this.x, this.y, this._targetBush.x, this._targetBush.y,
                        );
                        this.hidingInBush = true;
                        this.currentBush  = this._targetBush;
                        this._targetBush  = null;
                        // Stay in ENTERING/DASHING — entry phase handles the rest
                    } else {
                        // Scorched — try a different bush
                        this._targetBush = this._nearestFreeBush();
                        if (!this._targetBush) this._state = 'ATTACK';
                    }
                } else {
                    // Approach with jitter
                    const toTarget = Phaser.Math.Angle.Between(this.x, this.y, this._targetBush.x, this._targetBush.y);
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
                    this.x += Math.cos(moveAngle) * spd * mult * dt;
                    this.y += Math.sin(moveAngle) * spd * mult * dt;
                    this._headImg.setRotation(moveAngle);
                }
            }
            this._pushHistory(time);
            this._updateSegments();
            return 'alive';
        }

        // ATTACK — direct fast dash at Gerald, with jitter
        if (this._state === 'ATTACK') {
            if (this._lastBushPos) this._tickBushReveal(this._lastBushPos.x, this._lastBushPos.y);
            const snail    = this.scene.snail;
            const mult     = this.scene.alienSpeedMultiplier || 1.0;
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

            this.x += Math.cos(moveAngle) * CONFIG.SNAKES.SIDEWINDER.SPEED_DASH * mult * dt;
            this.y += Math.sin(moveAngle) * CONFIG.SNAKES.SIDEWINDER.SPEED_DASH * mult * dt;
            this._headImg.setRotation(moveAngle);

            const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            this._pushHistory(time);
            this._updateSegments();
            if (dist < this.radius + 20) return 'reached_snail';
        }

        return 'alive';
    }

    _moveToward(target, speed, dt) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const mult  = this.scene.alienSpeedMultiplier || 1.0;
        this.x += Math.cos(angle) * speed * mult * dt;
        this.y += Math.sin(angle) * speed * mult * dt;
        this._headImg.setRotation(angle);
    }

    _nearestFreeBush() {
        const bushes = this.scene.bushes;
        if (!bushes) return null;
        let best = null, bestDist = Infinity;
        for (const b of bushes) {
            if (!b.active || b._scorched) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y);
            if (d < bestDist) { bestDist = d; best = b; }
        }
        return best;
    }

    _nextBushCloserToStation() {
        const bushes = this.scene.bushes;
        if (!bushes) return null;
        const sx = 640, sy = 360;
        const curDist = this.currentBush
            ? Phaser.Math.Distance.Between(this.currentBush.x, this.currentBush.y, sx, sy)
            : Infinity;
        let best = null, bestDist = Infinity;
        for (const b of bushes) {
            if (!b.active || b._scorched || b === this.currentBush) continue;
            const d2station = Phaser.Math.Distance.Between(b.x, b.y, sx, sy);
            if (d2station >= curDist) continue;   // not closer to station
            const d2self = Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y);
            if (d2self < bestDist) { bestDist = d2self; best = b; }
        }
        return best;
    }

    _setBodyAlpha(alpha) {
        this._fadedParts.clear();
        this.setAlpha(alpha);
        for (const img of this._bodyImgs) img.setAlpha(alpha);
        if (this._tailImg) this._tailImg.setAlpha(alpha);
    }

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

    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;
        this._history.unshift({ x: this.x, y: this.y });
        if (this._history.length > 500) this._history.length = 500;
    }

    _updateSegments() {
        const sp = this._spacing;
        for (let i = 0; i < this._bodyImgs.length; i++) {
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(idx - sp);
            this._bodyImgs[i].setPosition(pos.x, pos.y);
            this._bodyImgs[i].setRotation(Math.atan2(prev.y - pos.y, prev.x - pos.x));
        }
        const ti   = (this._bodyImgs.length + 1) * sp;
        const tp   = this._histAt(ti);
        const tpr  = this._histAt(ti - sp);
        this._tailImg.setPosition(tp.x, tp.y);
        this._tailImg.setRotation(Math.atan2(tpr.y - tp.y, tpr.x - tp.x));
    }

    _histAt(i) {
        if (this._history.length === 0) return { x: this.x, y: this.y };
        return this._history[Math.min(i, this._history.length - 1)];
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
