import { CONFIG } from '../../config.js';

export default class FastAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = CONFIG.ALIENS.FAST.HEALTH;
        this.speed     = CONFIG.ALIENS.FAST.SPEED;
        this.radius    = CONFIG.ALIENS.FAST.RADIUS;
        this.alienType = 'fast';

        // Track base (straight-line) position separately for zigzag
        this.baseX = x;
        this.baseY = y;
        this.t = 0;

        // Initialize angle toward snail at spawn
        this.angle     = Phaser.Math.Angle.Between(x, y, scene.snail.x, scene.snail.y);
        this.perpAngle = this.angle + Math.PI / 2;

        // Draw: purple triangle pointing in direction of travel
        const gfx = scene.add.graphics();
        const r = this.radius;
        gfx.fillStyle(0xaa44ff, 1);
        gfx.fillTriangle(0, -r, -r * 0.75, r * 0.7, r * 0.75, r * 0.7);
        // Eye dots
        gfx.fillStyle(0xffffff, 0.8);
        gfx.fillCircle(-3, -2, 2);
        gfx.fillCircle(3, -2, 2);
        this.gfx = gfx;
        this.add(gfx);

        this.gfx.rotation = this.angle + Math.PI / 2;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.destroy();
            return true;
        }
        return false;
    }

    update(time, delta) {
        const dt = delta / 1000;
        const speedMult = this.scene.alienSpeedMultiplier || 1.0;
        const snail = this.scene.snail;
        this.t += dt;

        // Re-steer base trajectory toward snail each frame
        this.angle     = Phaser.Math.Angle.Between(this.baseX, this.baseY, snail.x, snail.y);
        this.perpAngle = this.angle + Math.PI / 2;

        // Advance base position along steering angle
        this.baseX += Math.cos(this.angle) * this.speed * speedMult * dt;
        this.baseY += Math.sin(this.angle) * this.speed * speedMult * dt;

        // Apply sinusoidal zigzag perpendicular to travel
        const zigzag = Math.sin(this.t * 4.5) * 32;
        this.x = this.baseX + Math.cos(this.perpAngle) * zigzag;
        this.y = this.baseY + Math.sin(this.perpAngle) * zigzag;

        // Rotate graphic to face movement direction
        this.gfx.rotation = this.angle + Math.PI / 2;

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
