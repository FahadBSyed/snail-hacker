import { CONFIG } from '../config.js';
import AcidPuddle from './AcidPuddle.js';

/**
 * AcidGlob — slow projectile fired by Spitter snakes.
 *
 * Fires toward Gerald's position at time of creation (not tracking).
 * Destroyable by P2 projectiles (CollisionSystem checks scene.acidGlobs).
 * On hitting Gerald: deals GLOB_DAMAGE and spawns an AcidPuddle.
 * Auto-destroys off-screen.
 */
export default class AcidGlob extends Phaser.GameObjects.Container {
    constructor(scene, x, y, targetX, targetY) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(42);

        const cfg   = CONFIG.SNAKES.SPITTER;
        this.radius = cfg.GLOB_RADIUS;
        this.health = 1;   // 1 hit to destroy (used by CollisionSystem)

        const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        this._vx    = Math.cos(angle) * cfg.GLOB_SPEED;
        this._vy    = Math.sin(angle) * cfg.GLOB_SPEED;

        // Visuals — acid green blob
        const g = scene.add.graphics();
        g.fillStyle(0x99ee00, 0.9);
        g.fillCircle(0, 0, cfg.GLOB_RADIUS);
        g.fillStyle(0xccff44, 0.6);
        g.fillCircle(-2, -2, cfg.GLOB_RADIUS * 0.45);
        this.add(g);

        // Drip effect — smaller trailing circle
        const drip = scene.add.graphics();
        drip.fillStyle(0x77cc00, 0.7);
        drip.fillCircle(0, 4, cfg.GLOB_RADIUS * 0.55);
        this.add(drip);
    }

    update(delta) {
        if (!this.active) return;
        const dt = delta / 1000;
        this.x += this._vx * dt;
        this.y += this._vy * dt;

        // Off-screen → destroy
        const W = this.scene.scale.width + 60;
        const H = this.scene.scale.height + 60;
        if (this.x < -60 || this.x > W || this.y < -60 || this.y > H) {
            this.destroy();
            return;
        }

        // Check Gerald overlap
        const snail = this.scene.snail;
        if (snail && snail.active) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 14) {
                this._hitGerald();
            }
        }
    }

    _hitGerald() {
        const cfg   = CONFIG.SNAKES.SPITTER;
        const scene = this.scene;

        // Damage
        if (scene.snail && scene.snail.active) {
            scene.snail.takeDamage?.(cfg.GLOB_DAMAGE);
            scene._applyVenom?.();
            // Flash HUD
            scene.hud?.flashSnailHp?.();
            scene.soundSynth?.play?.('alienHitSnail');
        }

        // Spawn puddle
        const puddle = new AcidPuddle(scene, this.x, this.y);
        scene.acidPuddles.push(puddle);

        // Splat particles
        this._splat();
        this.destroy();
    }

    _splat() {
        for (let i = 0; i < 5; i++) {
            const angle  = Math.random() * Math.PI * 2;
            const speed  = 20 + Math.random() * 30;
            const dot    = this.scene.add.circle(
                this.x, this.y, 2 + Math.random() * 3, 0x99ee00, 0.8,
            ).setDepth(46);
            this.scene.tweens.add({
                targets:  dot,
                x:        dot.x + Math.cos(angle) * speed,
                y:        dot.y + Math.sin(angle) * speed,
                alpha:    0,
                duration: 300,
                ease:     'Sine.easeOut',
                onComplete: () => dot.destroy(),
            });
        }
    }
}
