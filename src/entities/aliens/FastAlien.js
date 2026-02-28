import { CONFIG } from '../../config.js';

const DIRS = [
    'right', 'diag-right-down', 'down', 'diag-left-down',
    'left',  'diag-left-up',    'up',   'diag-right-up',
];

function angleToDir(rad) {
    const a = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return DIRS[Math.round(a / (Math.PI / 4)) % 8];
}

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
        this.facing    = 'right';

        this.sprite = scene.add.image(0, 0, 'alien-fast-right');
        this.add(this.sprite);
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

        // Swap texture when direction sector changes
        const dir = angleToDir(this.angle);
        if (dir !== this.facing) {
            this.facing = dir;
            this.sprite.setTexture(`alien-fast-${dir}`);
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
