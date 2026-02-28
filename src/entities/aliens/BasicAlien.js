const SPEED = 60; // px/s
const RADIUS = 16;
const HEALTH = 10;

// Target: center of screen (station)
const TARGET_X = 640;
const TARGET_Y = 360;

export default class BasicAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health = HEALTH;
        this.speed = SPEED;
        this.radius = RADIUS;
        this.alienType = 'basic';

        // Calculate angle toward station once at spawn
        this.angle = Phaser.Math.Angle.Between(x, y, TARGET_X, TARGET_Y);

        // Draw: red circle with eye dots
        const gfx = scene.add.graphics();
        // Body
        gfx.fillStyle(0xdd3333, 1);
        gfx.fillCircle(0, 0, RADIUS);
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
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        // Check if reached station vicinity
        const dist = Phaser.Math.Distance.Between(this.x, this.y, TARGET_X, TARGET_Y);
        if (dist < 50) {
            return 'reached_station';
        }
        return 'alive';
    }
}
