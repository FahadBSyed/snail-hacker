import { CONFIG } from '../../config.js';

export default class TankAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = CONFIG.ALIENS.TANK.HEALTH;
        this.speed     = CONFIG.ALIENS.TANK.SPEED;
        this.radius    = CONFIG.ALIENS.TANK.RADIUS;
        this.alienType = 'tank';

        // Draw: dark grey square with thick armour outline
        const gfx = scene.add.graphics();
        const s = this.radius; // half-size

        // Body
        gfx.fillStyle(0x445566, 1);
        gfx.fillRect(-s, -s, s * 2, s * 2);
        // Thick border
        gfx.lineStyle(3.5, 0x88aacc, 0.85);
        gfx.strokeRect(-s, -s, s * 2, s * 2);
        // Visor slit
        gfx.fillStyle(0xdd4444, 0.9);
        gfx.fillRect(-s * 0.6, -4, s * 1.2, 6);

        this.add(gfx);
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

        // Steer toward snail each frame
        const angle = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
        this.x += Math.cos(angle) * this.speed * speedMult * dt;
        this.y += Math.sin(angle) * this.speed * speedMult * dt;

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
