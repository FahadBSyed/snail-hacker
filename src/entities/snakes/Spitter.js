import { CONFIG } from '../../config.js';
import AcidGlob from '../AcidGlob.js';
import { applyHitReaction, tickHitWiggle, applyWiggleToSegments } from './snakeHitReaction.js';
import { initPath, tickSnakePath } from './snakePathfinding.js';

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
        this.speed         = cfg.SPEED;
        this.radius        = cfg.RADIUS;
        this.alienType     = 'spitter';
        this.hitFlashColor = 'white';

        this.hidingInBush = false;
        this.currentBush  = null;

        this._state        = 'KITE';
        this._spitCooldown = cfg.SPIT_COOLDOWN;  // first spit after on-screen delay + cooldown
        this._onScreenMs   = 0;                  // accumulated on-screen time; must reach 10 000 ms before spitting
        this._hideTimer    = 0;
        this._stunMs       = 0;

        this._hitReacting      = false;
        this._hitGen           = 0;
        this._hitWiggleMs      = 0;
        this._hitWiggleElapsed = 0;

        this._fadedParts     = new Set();
        this._lastBushPos    = null;
        this._bushEntryAngle = 0;

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
        initPath(this);
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(1, 4, 22, 7);
        shadow.setScale(1.3);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-spitter-head');
        this._headImg.setOrigin(0.5, 0.5).setScale(0.65);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-spitter-body');
            img.setOrigin(0.5, 0.5).setScale(1.3).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-spitter-tail');
        this._tailImg.setOrigin(0.5, 0.5).setScale(1.3).setDepth(this.depth - 2);
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

    takeDamage(amount, forceAllow = false) {
        // Block damage only when the head has fully entered the bush.
        // forceAllow = true when the caller already confirmed a visible segment was hit.
        if (!forceAllow && this.hidingInBush && this.alpha < 0.1) return false;
        const died = (this.health -= amount) <= 0;
        if (!died) {
            this._fleeToHide();
            applyHitReaction(this);
        }
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

        tickHitWiggle(this, delta);

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
            const mult = this.scene.enemySpeedMultiplier || 1.0;

            // Entry phase: slither through the bush so the whole body follows
            if (this.hidingInBush) {
                this._tickBushHide(this.currentBush.x, this.currentBush.y);
                if (this._fadedParts.size >= 2 + this._bodyImgs.length) {
                    this._state = 'HIDING';
                } else {
                    this.x += Math.cos(this._bushEntryAngle) * this.speed * mult * dt;
                    this.y += Math.sin(this._bushEntryAngle) * this.speed * mult * dt;
                }
                this._pushHistory(time);
                this._updateSegments();
                return 'alive';
            }

            if (!this._targetBush || !this._targetBush.active) {
                this._state = 'KITE';
            } else {
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
                        this._hideTimer   = cfg.HIDE_DURATION;
                        // Stay in FLEEING — entry phase handles the rest
                    } else {
                        this._state = 'KITE';   // bush scorched — resume kiting
                    }
                } else {
                    const fleeAngle = tickSnakePath(this, delta, this._targetBush.x, this._targetBush.y);
                    const mult = this.scene.enemySpeedMultiplier || 1.0;
                    this.x += Math.cos(fleeAngle) * this.speed * 2 * mult * dt;
                    this.y += Math.sin(fleeAngle) * this.speed * 2 * mult * dt;
                    this._headImg.setRotation(fleeAngle);
                }
            }
            this._pushHistory(time);
            this._updateSegments();
            return 'alive';
        }

        // ── KITE ──
        if (this._lastBushPos) this._tickBushReveal(this._lastBushPos.x, this._lastBushPos.y);

        const snail = this.scene.snail;
        const dist  = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        const mult  = this.scene.enemySpeedMultiplier || 1.0;

        if (dist < cfg.PREFERRED_MIN) {
            // Too close — back away
            const angle = Phaser.Math.Angle.Between(snail.x, snail.y, this.x, this.y);
            this.x += Math.cos(angle) * this.speed * mult * dt;
            this.y += Math.sin(angle) * this.speed * mult * dt;
            this._headImg.setRotation(angle + Math.PI);
        } else if (dist > cfg.PREFERRED_MAX) {
            // Too far — close in with jitter + pathfinding
            const toTarget = tickSnakePath(this, delta, snail.x, snail.y);
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
        } else {
            // In preferred range — strafe (perpendicular to snail direction)
            const toSnail = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
            const perp    = toSnail + Math.PI / 2;
            this.x += Math.cos(perp) * this.speed * 0.6 * mult * dt;
            this.y += Math.sin(perp) * this.speed * 0.6 * mult * dt;
            this._headImg.setRotation(toSnail);
        }

        // Only spit while on-screen, and only after being on-screen for 10 s total
        const onScreen = this.x > 0 && this.x < 1280 && this.y > 0 && this.y < 720;
        if (onScreen) {
            this._onScreenMs = Math.min(this._onScreenMs + delta, 10000);
            if (this._onScreenMs >= 10000) {
                this._spitCooldown -= delta;
                if (this._spitCooldown <= 0) {
                    this._spitCooldown = cfg.SPIT_COOLDOWN;
                    this._fireGlob();
                }
            }
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
        const mult  = this.scene.enemySpeedMultiplier || 1.0;
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
        applyWiggleToSegments(this);
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
