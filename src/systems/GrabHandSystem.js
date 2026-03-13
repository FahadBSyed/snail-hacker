import { CONFIG } from '../config.js';

// ── Cursor rendering helpers ───────────────────────────────────────────────────

/** Draw the cyan crosshair (origin = hotspot center) */
function _drawCrosshair(g) {
    g.clear();
    g.lineStyle(1.5, 0x00ffcc, 1);
    // horizontal arms with gap
    g.beginPath(); g.moveTo(-16, 0); g.lineTo(-5, 0); g.strokePath();
    g.beginPath(); g.moveTo(5,   0); g.lineTo(16, 0); g.strokePath();
    // vertical arms with gap
    g.beginPath(); g.moveTo(0, -16); g.lineTo(0, -5); g.strokePath();
    g.beginPath(); g.moveTo(0,   5); g.lineTo(0, 16); g.strokePath();
    // ring
    g.strokeCircle(0, 0, 4);
    // center dot
    g.fillStyle(0x00ffcc, 1);
    g.fillCircle(0, 0, 1.5);
}

/** Draw the closed-fist cursor (centered at origin — hotspot = center of fist). */
function _drawClosedHand(g) {
    g.clear();
    g.fillStyle(0x00ffcc, 1);
    // curled finger row (knuckles)
    g.fillRoundedRect(-12, -8, 24, 10, 3);
    // palm / fist body
    g.fillRoundedRect(-13, 2, 26, 14, 4);
    // thumb
    g.fillRoundedRect(-19, 3, 9, 9, 3);
}

/**
 * Draw the open grab hand.
 * Hotspot is tip of index finger → SVG coord (14,2), so all rects offset by (-14, -2).
 * @param {Phaser.GameObjects.Graphics} g
 * @param {boolean} cancel  — true = dimmed hand + red prohibition overlay
 */
function _drawHand(g, cancel) {
    g.clear();
    const col   = cancel ? 0x334433 : 0x00ffcc;
    const alpha = cancel ? 0.7 : 1;

    g.fillStyle(col, alpha);
    // fingers (index, middle, ring, pinky) and thumb — offset by (-14,-2)
    g.fillRoundedRect(-7,   1,  4, 14, 2);   // index
    g.fillRoundedRect(-2,   0,  4, 16, 2);   // middle
    g.fillRoundedRect( 3,   1,  4, 14, 2);   // ring
    g.fillRoundedRect( 8,   3,  4, 12, 2);   // pinky
    g.fillRoundedRect(-12, 10,  4,  9, 2);   // thumb
    // palm
    g.fillRoundedRect(-12, 14, 24, 12, 3);

    if (cancel) {
        // prohibition circle (top-right of the 32×32 SVG → offset by (-14,-2) = (10, 6))
        g.lineStyle(2, 0xff4444, 1);
        g.strokeCircle(10, 6, 7);
        g.fillStyle(0x000000, 0.45);
        g.fillCircle(10, 6, 7);
        // diagonal slash across circle
        g.lineStyle(2, 0xff4444, 1);
        g.beginPath(); g.moveTo(4.5, 0.5); g.lineTo(15.5, 11.5); g.strokePath();
    }
}

export default class GrabHandSystem {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {import('../entities/Snail.js').default}   opts.snail
     * @param {function}                                 opts.onPickup     – fired when snail is grabbed
     * @param {function(): import('../entities/Battery.js').default|null} opts.getBattery
     */
    constructor(scene, opts) {
        this.scene      = scene;
        this.snail      = opts.snail;
        this.onPickup   = opts.onPickup   || (() => {});
        this.getBattery = opts.getBattery || (() => null);
        this.getMines   = opts.getMines   || (() => []);
        this.canvas     = scene.game.canvas;

        // null | 'snail' | Battery instance
        this.heldTarget        = null;
        this.batteryGrabOrigin = null;  // {x,y} where battery was when mouse grabbed it

        this.onCooldown        = false;
        this.cooldownRemaining = 0;     // seconds
        this.cooldownMultiplier = 1.0;  // reduced by QUICK_GRAB upgrade

        // Dangle spring state (shared; only one object held at a time)
        this._prevHeldPos  = null;  // {x,y} last frame — for velocity calc
        this._dangAngle    = 0;     // current tilt in radians
        this._dangVel      = 0;     // angular velocity (rad/s)
        this._dangleTween  = null;  // return-to-zero tween

        // ── Custom cursor sprites (Phaser graphics, depth 1000) ─────────────
        this.canvas.style.cursor = 'none';

        this._gCrosshair = scene.add.graphics().setDepth(1000);
        this._gGrab      = scene.add.graphics().setDepth(1000);
        this._gCancel    = scene.add.graphics().setDepth(1000);
        this._gClosed    = scene.add.graphics().setDepth(1000);

        _drawCrosshair(this._gCrosshair);
        _drawHand(this._gGrab,   false);
        _drawHand(this._gCancel, true);
        _drawClosedHand(this._gClosed);

        this._gGrab.setVisible(false);
        this._gCancel.setVisible(false);
        this._gClosed.setVisible(false);
        // crosshair visible by default

        this._nearGrabbable = false;  // tracked in update() so GameScene can gate shooting

        // Left-click down → grab closest grabbable within range
        scene.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            if (this.heldTarget !== null || this.onCooldown) return;

            const battery    = this.getBattery();
            let candidate    = null;
            let candidateDist = Infinity;

            // Battery priority if on ground and in range
            if (battery && battery.state === 'ground') {
                const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, battery.x, battery.y);
                if (d <= CONFIG.BATTERY.MOUSE_PICKUP_DIST) {
                    candidate = battery; candidateDist = d;
                }
            }

            // Mines compete with battery — nearest wins
            for (const mine of this.getMines()) {
                if (mine.state !== 'ground' || !mine.active) continue;
                const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, mine.x, mine.y);
                if (d <= mine.mousePickupDist && d < candidateDist) {
                    candidate = mine; candidateDist = d;
                }
            }

            // Snail wins only if closer than all items
            const snailDist = Phaser.Math.Distance.Between(
                pointer.x, pointer.y, this.snail.x, this.snail.y,
            );
            if (snailDist <= CONFIG.GRAB.MAX_PICKUP_DISTANCE && snailDist < candidateDist) {
                candidate = 'snail';
            }

            if (candidate === 'snail') this._pickupSnail();
            else if (candidate)        this._pickupBattery(candidate);
        });

        // Left-click up → release
        scene.input.on('pointerup', (pointer) => {
            if (pointer.button !== 0) return;
            if (this.heldTarget !== null) this._drop();
        });
    }

    // ── Cursor helpers ────────────────────────────────────────────────────────

    _showCursor(which) {
        this._gCrosshair.setVisible(which === 'crosshair');
        this._gGrab.setVisible(which === 'grab');
        this._gCancel.setVisible(which === 'cancel');
        this._gClosed.setVisible(which === 'closed');
    }

    _positionCursor(x, y) {
        this._gCrosshair.setPosition(x, y);
        this._gGrab.setPosition(x, y);
        this._gCancel.setPosition(x, y);
        this._gClosed.setPosition(x, y);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /** Cancel any in-flight return-tween and reset spring state so a fresh pickup starts clean. */
    _resetDangle(obj) {
        if (this._dangleTween) { this._dangleTween.stop(); this._dangleTween = null; }
        if (obj) obj.setRotation(0);
        this._dangAngle   = 0;
        this._dangVel     = 0;
        this._prevHeldPos = null;
    }

    _pickupSnail() {
        this._resetDangle(this.snail);
        this.heldTarget = 'snail';
        this._showCursor('closed');
        this.scene.soundSynth?.play('grab');
        this.onPickup(); // let GameScene cancel hacks and drop battery if snail is carrying one
        this.snail.hackingActive = true;
        this.snail.setState('GRABBED');
    }

    _pickupBattery(battery) {
        this._resetDangle(battery);
        this.heldTarget        = battery;
        this.batteryGrabOrigin = { x: battery.x, y: battery.y };
        battery.state          = 'mouse';
        this._showCursor('closed');
    }

    _drop() {
        const releasedObj = (this.heldTarget === 'snail') ? this.snail : this.heldTarget;

        if (this.heldTarget === 'snail') {
            this.snail.hackingActive = false;
            this.snail.setState('IDLE');
        } else if (this.heldTarget) {
            // Battery: stays at its current position on the ground
            this.heldTarget.state = 'ground';
        }

        // Spring the rotation back to neutral
        this._dangAngle   = 0;
        this._dangVel     = 0;
        this._prevHeldPos = null;
        if (releasedObj && releasedObj.active) {
            this._dangleTween = this.scene.tweens.add({
                targets: releasedObj, rotation: 0, duration: 380,
                ease: 'Back.easeOut',
                onComplete: () => { this._dangleTween = null; },
            });
        }

        this.heldTarget        = null;
        this.batteryGrabOrigin = null;
        this.onCooldown        = true;
        this.cooldownRemaining = CONFIG.GRAB.COOLDOWN * this.cooldownMultiplier;
        this._showCursor('crosshair');
    }

    /**
     * Return a point clamped to within MAX_CURSOR_DIST of `obj`.
     * The cursor graphic and _moveToward both use this so the physics leash
     * is visible and consistent.
     */
    _clampCursor(pointer, obj) {
        const maxDist = CONFIG.GRAB.MAX_CURSOR_DIST;
        const dx = pointer.x - obj.x;
        const dy = pointer.y - obj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= maxDist) return { x: pointer.x, y: pointer.y };
        return { x: obj.x + (dx / dist) * maxDist, y: obj.y + (dy / dist) * maxDist };
    }

    _moveToward(target, pointer, maxSpeed, delta) {
        const dx      = pointer.x - target.x;
        const dy      = pointer.y - target.y;
        const dist    = Math.sqrt(dx * dx + dy * dy);
        const maxMove = maxSpeed * (delta / 1000);
        if (dist === 0 || dist <= maxMove) {
            target.x = pointer.x;
            target.y = pointer.y;
        } else {
            target.x += (dx / dist) * maxMove;
            target.y += (dy / dist) * maxMove;
        }
        const m  = 24;
        target.x = Phaser.Math.Clamp(target.x, m, 1280 - m);
        target.y = Phaser.Math.Clamp(target.y, m, 720 - m);
    }

    /**
     * Spring-damper tilt: velocity drives a target rotation, a spring pulls toward it,
     * damping prevents oscillation. Result feels like the object lags behind movement.
     */
    _applyDangle(obj, delta) {
        const dt = delta / 1000;

        // Velocity from position delta (px/s)
        const velX = this._prevHeldPos ? (obj.x - this._prevHeldPos.x) / dt : 0;
        this._prevHeldPos = { x: obj.x, y: obj.y };

        // Target tilt: rightward movement → clockwise lean, capped at ±22°
        const targetRot = Phaser.Math.Clamp(velX * 0.0009, -0.38, 0.38);

        // Spring-damper: accel = (target - current) * K  −  velocity * D
        const accel     = (targetRot - this._dangAngle) * 14 - this._dangVel * 7;
        this._dangVel  += accel * dt;
        this._dangAngle += this._dangVel * dt;

        obj.setRotation(this._dangAngle);
    }

    // ── Public update ─────────────────────────────────────────────────────────

    update(delta) {
        const pointer = this.scene.input.activePointer;

        // Safety: if left button was released outside the canvas we still get the drop
        if (this.heldTarget !== null && !pointer.leftButtonDown()) {
            this._drop();
        }

        // Cooldown countdown
        if (this.onCooldown) {
            this.cooldownRemaining -= delta / 1000;
            if (this.cooldownRemaining <= 0) {
                this.cooldownRemaining = 0;
                this.onCooldown = false;
            }
        }

        if (this.heldTarget === 'snail') {
            // Clamp cursor to MAX_CURSOR_DIST from the held object
            const cur = this._clampCursor(pointer, this.snail);
            this._positionCursor(cur.x, cur.y);
            this._moveToward(this.snail, cur, CONFIG.GRAB.MAX_SPEED, delta);
            this._applyDangle(this.snail, delta);

        } else if (this.heldTarget) {
            // Item drag (battery or mine)
            const item = this.heldTarget;
            const cur  = this._clampCursor(pointer, item);
            this._positionCursor(cur.x, cur.y);
            this._moveToward(item, cur, CONFIG.GRAB.MAX_SPEED, delta);
            this._applyDangle(item, delta);

            // Battery-only: auto-release when max drag distance is exceeded
            if (item === this.getBattery() && this.batteryGrabOrigin) {
                const dragDist = Phaser.Math.Distance.Between(
                    item.x, item.y,
                    this.batteryGrabOrigin.x, this.batteryGrabOrigin.y,
                );
                if (dragDist >= CONFIG.BATTERY.MOUSE_MAX_DRAG) this._drop();
            }

        } else {
            // No hold: cursor follows raw pointer
            this._positionCursor(pointer.x, pointer.y);

            // Pick cursor based on proximity + cooldown state
            let nearGrabbable = false;

            const battery = this.getBattery();
            if (battery && battery.state === 'ground') {
                const d = Phaser.Math.Distance.Between(
                    pointer.x, pointer.y, battery.x, battery.y,
                );
                if (d <= CONFIG.BATTERY.MOUSE_PICKUP_DIST) nearGrabbable = true;
            }

            if (!nearGrabbable) {
                for (const mine of this.getMines()) {
                    if (mine.state !== 'ground' || !mine.active) continue;
                    const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, mine.x, mine.y);
                    if (d <= mine.mousePickupDist) { nearGrabbable = true; break; }
                }
            }

            if (!nearGrabbable) {
                const d = Phaser.Math.Distance.Between(
                    pointer.x, pointer.y, this.snail.x, this.snail.y,
                );
                if (d <= CONFIG.GRAB.MAX_PICKUP_DISTANCE) nearGrabbable = true;
            }

            this._nearGrabbable = nearGrabbable;
            if (nearGrabbable) {
                this._showCursor(this.onCooldown ? 'cancel' : 'grab');
            } else {
                this._showCursor('crosshair');
            }
        }
    }

    // ── Public state ──────────────────────────────────────────────────────────

    /** True when the cursor is directly over a grabbable object (used by GameScene to gate shooting). */
    get hovering() { return this._nearGrabbable || this.heldTarget !== null; }

    // ── HUD helpers ───────────────────────────────────────────────────────────

    get statusText() {
        if (this.heldTarget === 'snail') return 'GRAB: SNAIL';
        if (this.heldTarget)             return `GRAB: ${this.heldTarget.grabLabel || 'BATTERY'}`;
        if (this.onCooldown)             return `GRAB: ${Math.ceil(this.cooldownRemaining)}s`;
        return 'GRAB: READY';
    }

    get statusColor() {
        if (this.heldTarget === 'snail') return '#ffcc00';
        if (this.heldTarget)             return '#44ff88';
        if (this.onCooldown)             return '#664466';
        return '#cc66ff';
    }
}
