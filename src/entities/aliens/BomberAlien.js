import { CONFIG } from '../../config.js';

export default class BomberAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = CONFIG.ALIENS.BOMBER.HEALTH;
        this.speed     = CONFIG.ALIENS.BOMBER.SPEED;
        this.radius    = CONFIG.ALIENS.BOMBER.RADIUS;
        this.alienType = 'bomber';

        // Draw: orange pentagon
        const gfx = scene.add.graphics();
        const r = this.radius;
        const pts = [];
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
            pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
        // Outer glow circle
        gfx.fillStyle(0xff6600, 0.25);
        gfx.fillCircle(0, 0, r + 8);
        // Pentagon body
        gfx.fillStyle(0xff7722, 1);
        gfx.beginPath();
        gfx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 5; i++) gfx.lineTo(pts[i].x, pts[i].y);
        gfx.closePath();
        gfx.fillPath();
        // Border
        gfx.lineStyle(2, 0xffaa44, 0.8);
        gfx.beginPath();
        gfx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 5; i++) gfx.lineTo(pts[i].x, pts[i].y);
        gfx.closePath();
        gfx.strokePath();
        // Warning symbol (X)
        gfx.lineStyle(1.5, 0xffffff, 0.7);
        gfx.beginPath();
        gfx.moveTo(-5, -5); gfx.lineTo(5, 5);
        gfx.moveTo(5, -5);  gfx.lineTo(-5, 5);
        gfx.strokePath();

        this.add(gfx);

        // Pulsing glow tween
        this.glowTween = scene.tweens.add({
            targets: gfx,
            alpha: 0.6,
            duration: 400,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            if (this.glowTween) this.glowTween.stop();
            this.destroy();
            return true;
        }
        return false;
    }

    update(time, delta) {
        const dt = delta / 1000;
        const speedMult = this.scene.alienSpeedMultiplier || 1.0;
        const snail = this.scene.snail;

        // Steer toward snail each frame
        const angle = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
        this.x += Math.cos(angle) * this.speed * speedMult * dt;
        this.y += Math.sin(angle) * this.speed * speedMult * dt;

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
