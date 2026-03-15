import { CONFIG } from '../../config.js';
import AcidGlob from '../AcidGlob.js';

/**
 * Spitter — World 2 snake that kites Gerald and fires acid globs.
 *
 * Behavior:
 *   - Maintains a preferred distance of PREFERRED_MIN–PREFERRED_MAX px from Gerald.
 *   - Every SPIT_COOLDOWN ms: fires an AcidGlob toward Gerald's current position.
 *   - On taking any damage: flees to nearest free bush and hides for HIDE_DURATION ms,
 *     then resumes kiting. (Does not re-emerge early.)
 *   - Does not emerge early from hiding even if Gerald is close.
 */
export default class Spitter extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        const cfg = CONFIG.SNAKES.SPITTER;
        this.health    = cfg.HEALTH;
        this.speed     = cfg.SPEED;
        this.radius    = cfg.RADIUS;
        this.alienType = 'spitter';

        this.hidingInBush = false;
        this.currentBush  = null;

        this._state        = 'KITE';
        this._spitCooldown = cfg.SPIT_COOLDOWN * (0.5 + Math.random() * 0.5);  // offset spawns
        this._hideTimer    = 0;
        this._stunMs       = 0;

        this._bushAnimTimers = [];   // pending delayedCall refs for hide/reveal sequences

        // Jitter — same side-to-side slither as BasicSnake, applied when closing in
        this._jitterMs       = 0;
        this._jitterDir      = 1;
        this._jitterCooldown = Phaser.Math.Between(
            CONFIG.SNAKES.JITTER_COOLDOWN_MIN, CONFIG.SNAKES.JITTER_COOLDOWN_MAX,
        );

        // History for body segments
        this._spacing  = CONFIG.SNAKES.BODY_SPACING;
        const segCount = cfg.SEGMENT_COUNT;
        this._history  = [{ x, y }];

        this._buildVisuals(scene, segCount);
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(2, 8, 44, 14);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-spitter-head');
        this._headImg.setOrigin(0.5, 0.5);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-spitter-body');
            img.setOrigin(0.5, 0.5).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-spitter-tail');
        this._tailImg.setOrigin(0.5, 0.5).setDepth(this.depth - 2);
    }

    _setBodyAlpha(alpha) {
        this.setAlpha(alpha);
        for (const img of this._bodyImgs) img.setAlpha(alpha);
        if (this._tailImg) this._tailImg.setAlpha(alpha);
    }

    _startHideAnimation() {
        this._cancelBushAnim();
        const parts = [this, ...this._bodyImgs, this._tailImg].filter(Boolean);
        parts.forEach((part, i) => {
            const t = this.scene.time.delayedCall(i * 65, () => {
                if (!this.active || !part.active) return;
                this.scene.tweens.add({ targets: part, alpha: 0, duration: 150, ease: 'Sine.easeOut' });
            });
            this._bushAnimTimers.push(t);
        });
    }

    _startRevealAnimation() {
        this._cancelBushAnim();
        const parts = [this, ...this._bodyImgs, this._tailImg].filter(Boolean);
        parts.forEach((part, i) => {
            const t = this.scene.time.delayedCall(i * 65, () => {
                if (!this.active || !part.active) return;
                this.scene.tweens.add({ targets: part, alpha: 1, duration: 150, ease: 'Sine.easeOut' });
            });
            this._bushAnimTimers.push(t);
        });
    }

    _cancelBushAnim() {
        for (const t of this._bushAnimTimers) t.remove(false);
        this._bushAnimTimers = [];
    }

    takeDamage(amount) {
        if (this.hidingInBush) return false;
        const died = (this.health -= amount) <= 0;
        if (!died) this._fleeToHide();
        return died;
    }

    takeDamageRaw(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    _fleeToHide() {
        if (this._state === 'HIDING' || this._state === 'FLEEING') return;
        const bush = this._nearestFreeBush();
        if (!bush) return;   // nowhere to hide
        this._targetBush = bush;
        this._state      = 'FLEEING';
    }

    update(time, delta) {
        if (!this.active) return 'alive';
        const cfg = CONFIG.SNAKES.SPITTER;
        const dt  = delta / 1000;

        if (this._stunMs > 0) {
            this._stunMs -= delta;
            this._updateSegments();
            return 'alive';
        }

        // ── HIDING ──
        if (this._state === 'HIDING') {
            this._hideTimer -= delta;
            if (this._hideTimer <= 0) {
                if (this.currentBush) this.currentBush.exit(this);
                this.hidingInBush = false;
                this.currentBush  = null;
                this._state       = 'KITE';
                // Reset spit cooldown so it doesn't fire immediately on emerge
                this._spitCooldown = cfg.SPIT_COOLDOWN * 0.5;
            }
            this._updateSegments();
            return 'alive';
        }

        // ── FLEEING → approach target bush ──
        if (this._state === 'FLEEING') {
            if (!this._targetBush || !this._targetBush.active) {
                this._state = 'KITE';
            } else {
                const dist = Phaser.Math.Distance.Between(
                    this.x, this.y, this._targetBush.x, this._targetBush.y,
                );
                if (dist < CONFIG.BUSHES.OCCUPY_RADIUS) {
                    if (this._targetBush.enter(this)) {
                        this.hidingInBush = true;
                        this.currentBush  = this._targetBush;
                        this._targetBush  = null;
                        this._startHideAnimation();
                        this._state       = 'HIDING';
                        this._hideTimer   = cfg.HIDE_DURATION;
                    } else {
                        this._state = 'KITE';   // bush scorched — resume kiting
                    }
                } else {
                    this._moveToward(this._targetBush, cfg.SPEED * 2, dt);
                }
            }
            this._pushHistory(time);
            this._updateSegments();
            return 'alive';
        }

        // ── KITE ──
        const snail = this.scene.snail;
        const dist  = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        const mult  = this.scene.alienSpeedMultiplier || 1.0;

        if (dist < cfg.PREFERRED_MIN) {
            // Too close — back away
            const angle = Phaser.Math.Angle.Between(snail.x, snail.y, this.x, this.y);
            this.x += Math.cos(angle) * cfg.SPEED * mult * dt;
            this.y += Math.sin(angle) * cfg.SPEED * mult * dt;
            this._headImg.setRotation(angle + Math.PI);
        } else if (dist > cfg.PREFERRED_MAX) {
            // Too far — close in with jitter
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

            this.x += Math.cos(moveAngle) * cfg.SPEED * mult * dt;
            this.y += Math.sin(moveAngle) * cfg.SPEED * mult * dt;
            this._headImg.setRotation(moveAngle);
        } else {
            // In preferred range — strafe (perpendicular to snail direction)
            const toSnail = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
            const perp    = toSnail + Math.PI / 2;
            this.x += Math.cos(perp) * cfg.SPEED * 0.6 * mult * dt;
            this.y += Math.sin(perp) * cfg.SPEED * 0.6 * mult * dt;
            this._headImg.setRotation(toSnail);
        }

        // Spit cooldown
        this._spitCooldown -= delta;
        if (this._spitCooldown <= 0) {
            this._spitCooldown = cfg.SPIT_COOLDOWN;
            this._fireGlob();
        }

        this._pushHistory(time);
        this._updateSegments();
        return 'alive';
    }

    _fireGlob() {
        const snail = this.scene.snail;
        if (!snail || !snail.active) return;
        const glob = new AcidGlob(this.scene, this.x, this.y, snail.x, snail.y);
        this.scene.acidGlobs.push(glob);
        this.scene.soundSynth?.play?.('bossProjectile');
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

    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;
        this._history.unshift({ x: this.x, y: this.y });
        if (this._history.length > 300) this._history.length = 300;
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
        const ti  = (this._bodyImgs.length + 1) * sp;
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
        if (this.currentBush && this.currentBush.active) this.currentBush.exit(this);
        this._cancelBushAnim();
        for (const img of this._bodyImgs) { if (img && img.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg && this._tailImg.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
