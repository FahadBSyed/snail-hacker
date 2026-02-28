export default class TeleportSystem {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {import('../entities/Snail.js').default} opts.snail
     * @param {function} opts.onTeleport — called after teleport with (x, y)
     */
    constructor(scene, opts) {
        this.scene = scene;
        this.snail = opts.snail;
        this.onTeleport = opts.onTeleport;
        this.activeMinigame = null; // set externally when a minigame is active

        this.charges = 1; // P1 must visit the TELEPORT station to recharge
        this.isDragging = false;
        this.dragLine = null;

        // Right-click drag start
        scene.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 2) return;
            this.isDragging = true;
            if (!this.dragLine) {
                this.dragLine = scene.add.graphics().setDepth(90);
            }
        });

        // Drag visual — grey if no charge, cyan if charged
        scene.input.on('pointermove', (pointer) => {
            if (!this.isDragging || !pointer.rightButtonDown()) return;
            if (this.dragLine) {
                const hasCharge = this.charges > 0;
                const lineColor = hasCharge ? 0x44ddff : 0x886666;
                const circColor = hasCharge ? 0x44ddff : 0x886666;

                this.dragLine.clear();
                this.dragLine.lineStyle(1.5, lineColor, 0.5);
                this.dragLine.beginPath();
                this.dragLine.moveTo(this.snail.x, this.snail.y);
                this.dragLine.lineTo(pointer.x, pointer.y);
                this.dragLine.strokePath();

                this.dragLine.lineStyle(1, circColor, 0.6);
                this.dragLine.strokeCircle(pointer.x, pointer.y, 12);
            }
        });

        // Right-click release → teleport (if charged)
        scene.input.on('pointerup', (pointer) => {
            if (pointer.button !== 2) return;
            if (!this.isDragging) return;
            this.isDragging = false;

            if (this.dragLine) this.dragLine.clear();

            if (this.charges <= 0) return; // no charge — silently cancel

            const margin = 24;
            const tx = Phaser.Math.Clamp(pointer.x, margin, 1280 - margin);
            const ty = Phaser.Math.Clamp(pointer.y, margin, 720 - margin);

            this.teleportTo(tx, ty);
        });
    }

    teleportTo(x, y) {
        const oldX = this.snail.x;
        const oldY = this.snail.y;

        const wasMidAction = this.snail.hackingActive;

        // Cancel active minigame
        if (this.activeMinigame && typeof this.activeMinigame.cancel === 'function') {
            this.activeMinigame.cancel();
        }

        this.charges--;

        // Move snail instantly
        this.snail.x = x;
        this.snail.y = y;

        this.spawnWarpEffect(oldX, oldY);
        this.spawnWarpEffect(x, y);

        if (wasMidAction) {
            this.flashSnailRed();
        }

        if (this.onTeleport) this.onTeleport(x, y);
    }

    /** Restore one teleport charge (called by the TELEPORT station on success) */
    recharge() {
        this.charges = 1;
    }

    spawnWarpEffect(x, y) {
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
