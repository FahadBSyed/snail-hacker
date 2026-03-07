import { CONFIG } from '../../config.js';

// 8 direction names, ordered to match sector indices 0–7.
// Sector 0 is centred on 0 rad (right); each sector is π/4 wide, going CW.
const DIRS = [
    'right', 'diag-right-down', 'down', 'diag-left-down',
    'left',  'diag-left-up',    'up',   'diag-right-up',
];

/**
 * Map a Phaser movement angle (radians, 0=right, CW in screen-space)
 * to one of the 8 direction texture-key suffixes.
 */
function angleToDir(rad) {
    // Normalise to [0, 2π)
    const a = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return DIRS[Math.round(a / (Math.PI / 4)) % 8];
}

export default class BasicAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = CONFIG.ALIENS.BASIC.HEALTH;
        this.speed     = CONFIG.ALIENS.BASIC.SPEED;
        this.radius    = CONFIG.ALIENS.BASIC.RADIUS;
        this.alienType = 'basic';
        this.facing    = 'right';

        this.sprite = scene.add.image(0, 0, 'alien-frog-right');
        this.add(this.sprite);
    }

    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    update(time, delta) {
        const dt        = delta / 1000;
        const speedMult = this.scene.alienSpeedMultiplier || 1.0;
        const snail     = this.scene.snail;

        const angle = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
        this.x += Math.cos(angle) * this.speed * speedMult * dt;
        this.y += Math.sin(angle) * this.speed * speedMult * dt;

        // Swap texture when direction sector changes
        const dir = angleToDir(angle);
        if (dir !== this.facing) {
            this.facing = dir;
            this.sprite.setTexture(`alien-frog-${dir}`);
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
