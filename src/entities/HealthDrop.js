import { CONFIG } from '../config.js';

export default class HealthDrop extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.pickupRadius = CONFIG.HEALTH_DROP.RADIUS;

        // Draw: green cross / plus symbol
        const gfx = scene.add.graphics();
        gfx.fillStyle(0x44ff66, 1);
        gfx.fillRect(-3, -9, 6, 18);   // vertical bar
        gfx.fillRect(-9, -3, 18, 6);   // horizontal bar
        gfx.lineStyle(1, 0xaaffaa, 0.5);
        gfx.strokeRect(-3, -9, 6, 18);
        gfx.strokeRect(-9, -3, 18, 6);
        this.add(gfx);

        // Soft glow ring
        const glow = scene.add.graphics();
        glow.fillStyle(0x44ff66, 0.18);
        glow.fillCircle(0, 0, 16);
        this.add(glow);

        // Pulse animation
        scene.tweens.add({
            targets: this,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 650,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        // Auto-despawn with fade
        scene.time.delayedCall(CONFIG.HEALTH_DROP.LIFETIME, () => {
            if (!this.active) return;
            scene.tweens.add({
                targets: this,
                alpha: 0,
                duration: 500,
                onComplete: () => { if (this.active) this.destroy(); },
            });
        });
    }

    /**
     * Returns true if the snail is close enough to pick this up.
     * Caller is responsible for destroying and applying the heal.
     */
    checkPickup(snailX, snailY) {
        if (!this.active) return false;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, snailX, snailY);
        return dist < this.pickupRadius + 22; // 22 ≈ snail collision radius
    }
}
