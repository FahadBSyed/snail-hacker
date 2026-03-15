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
                    if (this.currentBush) this.currentBush.exit();
                    this.hidingInBush = false;
                    this.currentBush  = null;
                    this._setBodyAlpha(1);
                    this._targetBush  = nextBush;
                    this._state       = 'DASHING';
                } else {
                    // No closer bush — attack
                    if (this.currentBush) this.currentBush.exit();
                    this.hidingInBush = false;
                    this.currentBush  = null;
                    this._setBodyAlpha(1);
                    this._state       = 'ATTACK';
                }
            }
            this._updateSegments();
            return 'alive';
        }

        if (this._state === 'ENTERING' || this._state === 'DASHING') {
            const spd = this._state === 'ENTERING'
                ? CONFIG.SNAKES.SIDEWINDER.SPEED_SLOW
                : CONFIG.SNAKES.SIDEWINDER.SPEED_DASH;

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
                        this.hidingInBush = true;
                        this.currentBush  = this._targetBush;
                        this._targetBush  = null;
                        this._setBodyAlpha(0.2);
                        this._state       = 'HIDING';
                    } else {
                        // Occupied — try a different bush
                        this._targetBush = this._nearestFreeBush();
                        if (!this._targetBush) this._state = 'ATTACK';
                    }
                } else {
                    this._moveToward(this._targetBush, spd, dt);
                }
            }
            this._pushHistory(time);
            this._updateSegments();
            return 'alive';
        }

        // ATTACK — direct fast dash at Gerald
        if (this._state === 'ATTACK') {
            this._moveToward(this.scene.snail, CONFIG.SNAKES.SIDEWINDER.SPEED_DASH, dt);
            const dist = Phaser.Math.Distance.Between(
                this.x, this.y, this.scene.snail.x, this.scene.snail.y,
            );
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
            if (!b.active || b._scorched || b.isOccupied) continue;
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
            if (!b.active || b._scorched || b.isOccupied || b === this.currentBush) continue;
            const d2station = Phaser.Math.Distance.Between(b.x, b.y, sx, sy);
            if (d2station >= curDist) continue;   // not closer to station
            const d2self = Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y);
            if (d2self < bestDist) { bestDist = d2self; best = b; }
        }
        return best;
    }

    _setBodyAlpha(alpha) {
        this.setAlpha(alpha);
        for (const img of this._bodyImgs) img.setAlpha(alpha);
        if (this._tailImg) this._tailImg.setAlpha(alpha);
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
        if (this.currentBush && this.currentBush.active && this.currentBush.isOccupied) {
            this.currentBush.exit();
        }
        for (const img of this._bodyImgs) { if (img && img.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg && this._tailImg.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
