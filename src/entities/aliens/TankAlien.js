import { CONFIG } from '../../config.js';

const DIRS = [
    'right', 'diag-right-down', 'down', 'diag-left-down',
    'left',  'diag-left-up',    'up',   'diag-right-up',
];

function angleToDir(rad) {
    const a = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return DIRS[Math.round(a / (Math.PI / 4)) % 8];
}

export default class TankAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = CONFIG.ALIENS.TANK.HEALTH;
        this.speed     = CONFIG.ALIENS.TANK.SPEED;
        this.radius    = CONFIG.ALIENS.TANK.RADIUS;
        this.alienType = 'tank';
        this.facing    = 'right';

        this.sprite = scene.add.image(0, 0, 'alien-tank-right');
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

        const angle = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
        this.x += Math.cos(angle) * this.speed * speedMult * dt;
        this.y += Math.sin(angle) * this.speed * speedMult * dt;

        const dir = angleToDir(angle);
        if (dir !== this.facing) {
            this.facing = dir;
            this.sprite.setTexture(`alien-tank-${dir}`);
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
