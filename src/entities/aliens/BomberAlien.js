import { CONFIG } from '../../config.js';

const DIRS = [
    'right', 'diag-right-down', 'down', 'diag-left-down',
    'left',  'diag-left-up',    'up',   'diag-right-up',
];

function angleToDir(rad) {
    const a = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return DIRS[Math.round(a / (Math.PI / 4)) % 8];
}

export default class BomberAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = CONFIG.ALIENS.BOMBER.HEALTH;
        this.speed     = CONFIG.ALIENS.BOMBER.SPEED;
        this.radius    = CONFIG.ALIENS.BOMBER.RADIUS;
        this.alienType = 'bomber';
        this.facing    = 'right';

        this.sprite = scene.add.image(0, 0, 'alien-bomber-right');
        this.add(this.sprite);

        // Pulsing glow tween
        this.glowTween = scene.tweens.add({
            targets:  this.sprite,
            alpha:    0.6,
            duration: 400,
            ease:     'Sine.easeInOut',
            yoyo:     true,
            repeat:   -1,
        });
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0 && this.glowTween) {
            this.glowTween.stop();
            this.glowTween = null;
        }
        return this.health <= 0;
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
            this.sprite.setTexture(`alien-bomber-${dir}`);
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
        return 'alive';
    }
}
