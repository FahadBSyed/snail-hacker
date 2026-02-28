export default class TeleportSystem {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {import('../entities/Snail.js').default} opts.snail
     * @param {import('./ReloadBuffer.js').default} opts.reloadBuffer
     * @param {function} opts.onTeleport — called after teleport with (x, y)
     */
    constructor(scene, opts) {
        this.scene = scene;
        this.snail = opts.snail;
        this.reloadBuffer = opts.reloadBuffer;
        this.onTeleport = opts.onTeleport;
        this.activeMinigame = null; // set externally when a minigame is active

        this.isDragging = false;
        this.dragLine = null;

        // Right-click drag start
        scene.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 2) return; // right button only
            this.isDragging = true;

            // Draw a drag indicator line
            if (!this.dragLine) {
                this.dragLine = scene.add.graphics().setDepth(90);
            }
        });

        // Drag visual
        scene.input.on('pointermove', (pointer) => {
            if (!this.isDragging || !pointer.rightButtonDown()) return;
            if (this.dragLine) {
                this.dragLine.clear();
                this.dragLine.lineStyle(1.5, 0x44ddff, 0.5);
                this.dragLine.beginPath();
                this.dragLine.moveTo(this.snail.x, this.snail.y);
                this.dragLine.lineTo(pointer.x, pointer.y);
                this.dragLine.strokePath();

                // Target circle
                this.dragLine.lineStyle(1, 0x44ddff, 0.6);
                this.dragLine.strokeCircle(pointer.x, pointer.y, 12);
            }
        });

        // Right-click release → teleport
        scene.input.on('pointerup', (pointer) => {
            if (pointer.button !== 2) return;
            if (!this.isDragging) return;
            this.isDragging = false;

            if (this.dragLine) {
                this.dragLine.clear();
            }

            // Clamp target to screen bounds
            const margin = 24;
            const tx = Phaser.Math.Clamp(pointer.x, margin, 1280 - margin);
            const ty = Phaser.Math.Clamp(pointer.y, margin, 720 - margin);

            this.teleportTo(tx, ty);
        });
    }

    teleportTo(x, y) {
        const oldX = this.snail.x;
        const oldY = this.snail.y;

        // Check if a minigame was active
        const wasMidAction = this.snail.hackingActive || this.reloadBuffer.isReloading;

        // Cancel reload buffer
        this.reloadBuffer.cancel();

        // Cancel active minigame
        if (this.activeMinigame && typeof this.activeMinigame.cancel === 'function') {
            this.activeMinigame.cancel();
        }

        // Move snail instantly
        this.snail.x = x;
        this.snail.y = y;

        // Particle burst at origin
        this.spawnWarpEffect(oldX, oldY);
        // Particle burst at destination
        this.spawnWarpEffect(x, y);

        // Flash snail red if teleported mid-action (TENSION_2)
        if (wasMidAction) {
            this.flashSnailRed();
        }

        if (this.onTeleport) this.onTeleport(x, y);
    }

    spawnWarpEffect(x, y) {
        // Create a ring of small circles that expand outward
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 / particleCount) * i;
            const particle = this.scene.add.circle(x, y, 3, 0x44ddff, 0.8).setDepth(80);

            this.scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * 30,
                y: y + Math.sin(angle) * 30,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: 300,
                ease: 'Power2',
                onComplete: () => particle.destroy(),
            });
        }
    }

    flashSnailRed() {
        this.snail.sprite.setTint(0xff4444);
        this.scene.time.delayedCall(300, () => {
            if (this.snail.sprite && this.snail.sprite.active) {
                this.snail.sprite.clearTint();
            }
        });
    }
}
