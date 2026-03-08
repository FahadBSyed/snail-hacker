import { CONFIG } from '../../config.js';
import BaseAlien from './BaseAlien.js';
import { angleToDir } from './alienUtils.js';

export default class FastAlien extends BaseAlien {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.alienType = 'fast';
        this.spriteKey = 'alien-fast';
        this.health = CONFIG.ALIENS.FAST.HEALTH;
        this.speed  = CONFIG.ALIENS.FAST.SPEED;
        this.radius = CONFIG.ALIENS.FAST.RADIUS;
        this._initSprite();

        // Track base (straight-line) position separately for zigzag
        this.baseX = x;
        this.baseY = y;
        this.t = 0;

        // Lock initial steering angle toward snail at spawn
        this.angle     = Phaser.Math.Angle.Between(x, y, scene.snail.x, scene.snail.y);
        this.perpAngle = this.angle + Math.PI / 2;
    }

    // Overrides BaseAlien.update — sinusoidal zigzag perpendicular to travel
    update(time, delta) {
        const dt        = delta / 1000;
        const speedMult = this.scene.alienSpeedMultiplier || 1.0;
        const snail     = this.scene.snail;
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

        const dir = angleToDir(this.angle);
        if (dir !== this.facing) {
            this.facing = dir;
            this.sprite.setTexture(`${this.spriteKey}-${dir}`);
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        return dist < this.radius + 20 ? 'reached_snail' : 'alive';
    }
}
