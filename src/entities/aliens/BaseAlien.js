import { angleToDir } from './alienUtils.js';

/**
 * Base class for all alien types.
 *
 * Subclasses must set in their constructor:
 *   this.alienType  — string key (e.g. 'basic')
 *   this.spriteKey  — texture prefix (e.g. 'alien-frog'), used as `${spriteKey}-${dir}`
 *   this.health, this.speed, this.radius — from CONFIG
 *
 * Subclasses may override:
 *   update(time, delta)   — for custom movement (e.g. FastAlien zigzag)
 *   takeDamage(amount)    — for side-effects on death (e.g. BomberAlien glow tween)
 */
export default class BaseAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(45);  // fly above terrain, props, snail, station, and ground items
        this.facing = 'right';
    }

    /** Initialise the sprite after subclass has set this.spriteKey */
    _initSprite() {
        const shadow = this.scene.add.graphics();
        shadow.fillStyle(0x000000, 0.35);
        shadow.fillEllipse(2, 10, 44, 14);
        this.add(shadow);

        this.sprite = this.scene.add.image(0, 0, `${this.spriteKey}-right`);
        this.add(this.sprite);
    }

    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    /** Apply damage unconditionally, bypassing any subclass shield override. */
    takeDamageRaw(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    /** Straight-line movement toward the decoy (if active) or snail. */
    update(time, delta) {
        const dt        = delta / 1000;
        const speedMult = this.scene.enemySpeedMultiplier || 1.0;
        const decoy     = this.scene.decoy;
        const target    = (decoy && decoy.active) ? decoy : this.scene.snail;

        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        this.x += Math.cos(angle) * this.speed * speedMult * dt;
        this.y += Math.sin(angle) * this.speed * speedMult * dt;

        const dir = angleToDir(angle);
        if (dir !== this.facing) {
            this.facing = dir;
            this.sprite.setTexture(`${this.spriteKey}-${dir}`);
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
        if (dist < this.radius + 20) {
            return (decoy && decoy.active) ? 'reached_decoy' : 'reached_snail';
        }
        return 'alive';
    }
}
