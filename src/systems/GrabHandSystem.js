import { CONFIG } from '../config.js';

export default class GrabHandSystem {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {import('../entities/Snail.js').default} opts.snail
     * @param {function} opts.onPickup  – called immediately when the snail is grabbed,
     *                                    so GameScene can cancel any active hack/minigame
     */
    constructor(scene, opts) {
        this.scene    = scene;
        this.snail    = opts.snail;
        this.onPickup = opts.onPickup || (() => {});
        this.canvas   = scene.game.canvas;

        this.isHolding         = false;
        this.onCooldown        = false;
        this.cooldownRemaining = 0;  // seconds

        // Set default cursor (crosshair for P2 aiming)
        this.canvas.style.cursor = 'crosshair';

        // Right-click down → attempt pickup if cursor is close enough to the snail
        scene.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 2) return;
            if (this.isHolding || this.onCooldown) return;
            const dist = Phaser.Math.Distance.Between(
                pointer.x, pointer.y, this.snail.x, this.snail.y,
            );
            if (dist <= CONFIG.GRAB.MAX_PICKUP_DISTANCE) {
                this._pickup();
            }
        });

        // Right-click up → drop
        scene.input.on('pointerup', (pointer) => {
            if (pointer.button !== 2) return;
            if (this.isHolding) this._drop();
        });
    }

    _pickup() {
        this.isHolding = true;
        this.canvas.style.cursor = 'none';

        // Let GameScene cancel any active hack/minigame before taking control of the snail
        this.onPickup();

        // Suppress P1's WASD movement while grabbed
        this.snail.hackingActive = true;
        this.snail.setState('GRABBED');
    }

    _drop() {
        this.isHolding = false;
        this.snail.hackingActive = false;
        this.snail.setState('IDLE');

        this.onCooldown        = true;
        this.cooldownRemaining = CONFIG.GRAB.COOLDOWN;
        this.canvas.style.cursor = 'crosshair';
    }

    /**
     * Called every frame from GameScene.update().
     * Moves the snail toward the pointer (capped at max speed) while held.
     * Updates the hover cursor while not held.
     */
    update(delta) {
        const pointer = this.scene.input.activePointer;

        // Safety: release if right button was released outside the canvas
        if (this.isHolding && !pointer.rightButtonDown()) {
            this._drop();
        }

        // Countdown
        if (this.onCooldown) {
            this.cooldownRemaining -= delta / 1000;
            if (this.cooldownRemaining <= 0) {
                this.cooldownRemaining = 0;
                this.onCooldown = false;
            }
        }

        if (this.isHolding) {
            // Move snail toward pointer, capped at max speed
            const dx      = pointer.x - this.snail.x;
            const dy      = pointer.y - this.snail.y;
            const dist    = Math.sqrt(dx * dx + dy * dy);
            const maxMove = CONFIG.GRAB.MAX_SPEED * (delta / 1000);

            if (dist === 0 || dist <= maxMove) {
                this.snail.x = pointer.x;
                this.snail.y = pointer.y;
            } else {
                this.snail.x += (dx / dist) * maxMove;
                this.snail.y += (dy / dist) * maxMove;
            }

            // Keep snail on screen
            const margin = 24;
            this.snail.x = Phaser.Math.Clamp(this.snail.x, margin, 1280 - margin);
            this.snail.y = Phaser.Math.Clamp(this.snail.y, margin, 720 - margin);

        } else {
            // Hover cursor: 'grab' when within pickup range, 'crosshair' otherwise
            if (!this.onCooldown) {
                const dist = Phaser.Math.Distance.Between(
                    pointer.x, pointer.y, this.snail.x, this.snail.y,
                );
                this.canvas.style.cursor = dist <= CONFIG.GRAB.MAX_PICKUP_DISTANCE
                    ? 'grab'
                    : 'crosshair';
            }
        }
    }

    get statusText() {
        if (this.isHolding)  return 'GRAB: HOLDING';
        if (this.onCooldown) return `GRAB: ${Math.ceil(this.cooldownRemaining)}s`;
        return 'GRAB: READY';
    }

    get statusColor() {
        if (this.isHolding)  return '#ffcc00';
        if (this.onCooldown) return '#664466';
        return '#cc66ff';
    }
}
