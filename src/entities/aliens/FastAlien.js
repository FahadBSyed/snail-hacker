const SPEED  = 150;
const RADIUS = 12;
const HEALTH = 10;
const TARGET_X = 640;
const TARGET_Y = 360;

export default class FastAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = HEALTH;
        this.speed     = SPEED;
        this.radius    = RADIUS;
        this.alienType = 'fast';

        // Base trajectory angle toward station
        this.angle    = Phaser.Math.Angle.Between(x, y, TARGET_X, TARGET_Y);
        // Perpendicular direction for zigzag
        this.perpAngle = this.angle + Math.PI / 2;
        // Track base (straight-line) position separately
        this.baseX = x;
        this.baseY = y;
        this.t = 0;

        // Draw: purple triangle pointing in direction of travel
        const gfx = scene.add.graphics();
        // Triangle pointing up (rotated by movement angle in update)
        gfx.fillStyle(0xaa44ff, 1);
        gfx.fillTriangle(0, -RADIUS, -RADIUS * 0.75, RADIUS * 0.7, RADIUS * 0.75, RADIUS * 0.7);
        // Eye dots
        gfx.fillStyle(0xffffff, 0.8);
        gfx.fillCircle(-3, -2, 2);
        gfx.fillCircle(3, -2, 2);
        this.gfx = gfx;
        this.add(gfx);

        // Rotate graphic to face travel direction
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
        this.t += dt;

        // Advance base position along straight-line trajectory
        this.baseX += Math.cos(this.angle) * this.speed * speedMult * dt;
        this.baseY += Math.sin(this.angle) * this.speed * speedMult * dt;

        // Apply sinusoidal zigzag perpendicular to travel
        const zigzag = Math.sin(this.t * 4.5) * 32;
        this.x = this.baseX + Math.cos(this.perpAngle) * zigzag;
        this.y = this.baseY + Math.sin(this.perpAngle) * zigzag;

        // Check proximity to station using base position
        const dist = Phaser.Math.Distance.Between(this.x, this.y, TARGET_X, TARGET_Y);
        if (dist < 50) return 'reached_station';
        return 'alive';
    }
}
