import { CONFIG } from '../../config.js';
import BaseAlien from './BaseAlien.js';

export default class BasicAlien extends BaseAlien {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.alienType = 'basic';
        this.spriteKey = 'alien-frog';
        this.health = CONFIG.ALIENS.BASIC.HEALTH;
        this.speed  = CONFIG.ALIENS.BASIC.SPEED;
        this.radius = CONFIG.ALIENS.BASIC.RADIUS;
        this._initSprite();
    }
}
