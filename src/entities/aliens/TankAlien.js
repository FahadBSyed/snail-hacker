import { CONFIG } from '../../config.js';
import BaseAlien from './BaseAlien.js';

export default class TankAlien extends BaseAlien {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.alienType = 'tank';
        this.spriteKey = 'alien-tank';
        this.health = CONFIG.ALIENS.TANK.HEALTH;
        this.speed  = CONFIG.ALIENS.TANK.SPEED;
        this.radius = CONFIG.ALIENS.TANK.RADIUS;
        this._initSprite();
    }
}
