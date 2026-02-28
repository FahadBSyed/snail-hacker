const SPEED  = 38;
const RADIUS = 18; // used for collision
const HEALTH = 40;
const TARGET_X = 640;
const TARGET_Y = 360;

export default class TankAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = HEALTH;
        this.speed     = SPEED;
        this.radius    = RADIUS;
        this.alienType = 'tank';

        this.angle = Phaser.Math.Angle.Between(x, y, TARGET_X, TARGET_Y);

        // Draw: dark grey square with thick armour outline
        const gfx = scene.add.graphics();
        const s = 18; // half-size

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
        this.x += Math.cos(this.angle) * this.speed * speedMult * dt;
        this.y += Math.sin(this.angle) * this.speed * speedMult * dt;

        const dist = Phaser.Math.Distance.Between(this.x, this.y, TARGET_X, TARGET_Y);
        if (dist < 50) return 'reached_station';
        return 'alive';
    }
}
