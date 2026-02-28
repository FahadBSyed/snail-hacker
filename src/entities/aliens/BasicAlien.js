import { CONFIG } from '../../config.js';

export default class BasicAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health = CONFIG.ALIENS.BASIC.HEALTH;
        this.speed  = CONFIG.ALIENS.BASIC.SPEED;
        this.radius = CONFIG.ALIENS.BASIC.RADIUS;
        this.alienType = 'basic';

        // Draw: red circle with eye dots
        const gfx = scene.add.graphics();
        // Body
        gfx.fillStyle(0xdd3333, 1);
        gfx.fillCircle(0, 0, this.radius);
        // Eyes
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(-5, -4, 4);
        gfx.fillCircle(5, -4, 4);
        gfx.fillStyle(0x111111, 1);
        gfx.fillCircle(-4, -4, 2);
        gfx.fillCircle(6, -4, 2);
        this.add(gfx);
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.destroy();
            return true; // died
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
