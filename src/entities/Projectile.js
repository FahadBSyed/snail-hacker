import { CONFIG } from '../config.js';

export default class Projectile extends Phaser.GameObjects.Arc {
    constructor(scene, x, y, targetX, targetY) {
        super(scene, x, y, CONFIG.PLAYER.PROJECTILE_RADIUS, 0, 360, false, 0xffffaa, 1);
        scene.add.existing(this);

        // Calculate velocity toward target
        const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        this.vx = Math.cos(angle) * CONFIG.PLAYER.PROJECTILE_SPEED;
        this.vy = Math.sin(angle) * CONFIG.PLAYER.PROJECTILE_SPEED;

        // Spawn origin — used by CollisionSystem to skip body-hitbox checks until the
        // bullet has cleared the station (prevents instant-destroy when a Python body
        // segment overlaps the spawn point on the same frame the bullet is created).
        this.originX = x;
        this.originY = y;

        // Incremented each time the projectile ricochets; used to decay ricochet chance.
        this.ricochetBounces = 0;
    }

    update(time, delta) {
        const dt = delta / 1000;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Destroy when off-screen
        if (this.x < -20 || this.x > 1300 || this.y < -20 || this.y > 740) {
            this.destroy();
            return false;
        }
        return true;
    }
}
