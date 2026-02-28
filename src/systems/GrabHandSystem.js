import { CONFIG } from '../config.js';

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
        this.canvas     = scene.game.canvas;

        // null | 'snail' | Battery instance
        this.heldTarget        = null;
        this.batteryGrabOrigin = null;  // {x,y} where battery was when mouse grabbed it

        this.onCooldown        = false;
        this.cooldownRemaining = 0;     // seconds

        this.canvas.style.cursor = 'crosshair';

        // Right-click down → grab closest grabbable within range
        scene.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 2) return;
            if (this.heldTarget !== null || this.onCooldown) return;

            const battery    = this.getBattery();
            let candidate    = null;
            let candidateDist = Infinity;

            // Battery has grab priority if it's on the ground and in range
            if (battery && battery.state === 'ground') {
                const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, battery.x, battery.y);
                if (d <= CONFIG.BATTERY.MOUSE_PICKUP_DIST) {
                    candidate = battery; candidateDist = d;
                }
            }

            // Snail wins on tie (or if battery is not in range)
            const snailDist = Phaser.Math.Distance.Between(
                pointer.x, pointer.y, this.snail.x, this.snail.y,
            );
            if (snailDist <= CONFIG.GRAB.MAX_PICKUP_DISTANCE && snailDist < candidateDist) {
                candidate = 'snail';
            }

            if (candidate === 'snail') this._pickupSnail();
            else if (candidate)        this._pickupBattery(candidate);
        });

        // Right-click up → release
        scene.input.on('pointerup', (pointer) => {
            if (pointer.button !== 2) return;
            if (this.heldTarget !== null) this._drop();
        });
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    _pickupSnail() {
        this.heldTarget = 'snail';
        this.canvas.style.cursor = 'none';
        this.onPickup(); // let GameScene cancel hacks and drop battery if snail is carrying one
        this.snail.hackingActive = true;
        this.snail.setState('GRABBED');
    }

    _pickupBattery(battery) {
        this.heldTarget        = battery;
        this.batteryGrabOrigin = { x: battery.x, y: battery.y };
        battery.state          = 'mouse';
        this.canvas.style.cursor = 'none';
    }

    _drop() {
        if (this.heldTarget === 'snail') {
            this.snail.hackingActive = false;
            this.snail.setState('IDLE');
        } else if (this.heldTarget) {
            // Battery: stays at its current position on the ground
            this.heldTarget.state = 'ground';
        }
        this.heldTarget        = null;
        this.batteryGrabOrigin = null;
        this.onCooldown        = true;
        this.cooldownRemaining = CONFIG.GRAB.COOLDOWN;
        this.canvas.style.cursor = 'crosshair';
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

    // ── Public update ─────────────────────────────────────────────────────────

    update(delta) {
        const pointer = this.scene.input.activePointer;

        // Safety: if right button was released outside the canvas we still get the drop
        if (this.heldTarget !== null && !pointer.rightButtonDown()) {
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
            this._moveToward(this.snail, pointer, CONFIG.GRAB.MAX_SPEED, delta);

        } else if (this.heldTarget) {
            // Battery drag
            const battery = this.heldTarget;
            this._moveToward(battery, pointer, CONFIG.GRAB.MAX_SPEED, delta);

            // Auto-release when max drag distance from pickup origin is reached
            const dragDist = Phaser.Math.Distance.Between(
                battery.x, battery.y,
                this.batteryGrabOrigin.x, this.batteryGrabOrigin.y,
            );
            if (dragDist >= CONFIG.BATTERY.MOUSE_MAX_DRAG) {
                this._drop();
            }

        } else {
            // No hold: update hover cursor
            if (!this.onCooldown) {
                let nearGrabbable = false;

                const battery = this.getBattery();
                if (battery && battery.state === 'ground') {
                    const d = Phaser.Math.Distance.Between(
                        pointer.x, pointer.y, battery.x, battery.y,
                    );
                    if (d <= CONFIG.BATTERY.MOUSE_PICKUP_DIST) nearGrabbable = true;
                }

                if (!nearGrabbable) {
                    const d = Phaser.Math.Distance.Between(
                        pointer.x, pointer.y, this.snail.x, this.snail.y,
                    );
                    if (d <= CONFIG.GRAB.MAX_PICKUP_DISTANCE) nearGrabbable = true;
                }

                this.canvas.style.cursor = nearGrabbable ? 'grab' : 'crosshair';
            }
        }
    }

    // ── HUD helpers ───────────────────────────────────────────────────────────

    get statusText() {
        if (this.heldTarget === 'snail') return 'GRAB: SNAIL';
        if (this.heldTarget)             return 'GRAB: BATTERY';
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
