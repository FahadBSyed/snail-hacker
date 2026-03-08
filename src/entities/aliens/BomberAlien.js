import { CONFIG } from '../../config.js';
import BaseAlien from './BaseAlien.js';

export default class BomberAlien extends BaseAlien {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.alienType = 'bomber';
        this.spriteKey = 'alien-bomber';
        this.health = CONFIG.ALIENS.BOMBER.HEALTH;
        this.speed  = CONFIG.ALIENS.BOMBER.SPEED;
        this.radius = CONFIG.ALIENS.BOMBER.RADIUS;
        this._initSprite();

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
        const died = super.takeDamage(amount);
        if (died && this.glowTween) {
            this.glowTween.stop();
            this.glowTween = null;
        }
        return died;
    }
}
