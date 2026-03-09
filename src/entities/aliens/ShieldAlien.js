import { CONFIG } from '../../config.js';
import BaseAlien from './BaseAlien.js';

/**
 * ShieldAlien — approaches the snail head-on with an energy shield that blocks
 * all incoming projectiles.  The shield drops the moment it comes within
 * SHIELD_DROP_DIST pixels of the snail, leaving it vulnerable but already
 * dangerously close.
 *
 * Visual language:
 *  • Hexagonal rotating ring while shielded (cyan → blue gradient look via
 *    two overlapping arcs, one thicker base + one bright rim flash)
 *  • Ring shrinks and explodes off when shield drops
 *  • Underlying sprite is alien-frog (same model as BasicAlien) — the shield
 *    is the primary visual differentiator
 */
export default class ShieldAlien extends BaseAlien {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.alienType = 'shield';
        this.spriteKey = 'alien-frog';
        this.health    = CONFIG.ALIENS.SHIELD.HEALTH;
        this.speed     = CONFIG.ALIENS.SHIELD.SPEED;
        this.radius    = CONFIG.ALIENS.SHIELD.RADIUS;
        this._initSprite();

        this.shielded  = true;
        this._shieldAngle = 0;   // rotates over time

        // Shield graphics child (drawn in update)
        this._shieldGfx = scene.add.graphics();
        this.add(this._shieldGfx);

        // Outer rim flash (additive-feel via alpha pulse tween)
        this._shieldRim = scene.add.graphics();
        this.add(this._shieldRim);

        this._rimTween = scene.tweens.add({
            targets:  this._shieldRim,
            alpha:    0.25,
            duration: 600,
            ease:     'Sine.easeInOut',
            yoyo:     true,
            repeat:   -1,
        });

        this._drawShield();
    }

    _drawShield() {
        const r   = this.radius + 11;   // ring radius
        const gfx = this._shieldGfx;
        const rim = this._shieldRim;
        gfx.clear();
        rim.clear();

        if (!this.shielded) return;

        // Base ring — cyan with slight transparency
        gfx.lineStyle(4, 0x00eeff, 0.82);
        gfx.beginPath();
        gfx.arc(0, 0, r, this._shieldAngle, this._shieldAngle + Math.PI * 1.65);
        gfx.strokePath();

        // Second arc offset 180° (gives a "broken hex ring" silhouette)
        gfx.lineStyle(4, 0x0088cc, 0.70);
        gfx.beginPath();
        gfx.arc(0, 0, r, this._shieldAngle + Math.PI, this._shieldAngle + Math.PI * 2.65);
        gfx.strokePath();

        // Inner fill hint — very faint blue disc
        gfx.fillStyle(0x00aaff, 0.07);
        gfx.fillCircle(0, 0, r - 2);

        // Rim: bright white flash ring (alpha is animated by tween)
        rim.lineStyle(2, 0xffffff, 0.9);
        rim.strokeCircle(0, 0, r + 1);
    }

    _dropShield() {
        this.shielded = false;

        if (this._rimTween) {
            this._rimTween.stop();
            this._rimTween = null;
        }

        // Burst-expand the ring and fade it out
        const burstGfx = this.scene.add.graphics().setDepth(57);
        const bx = this.x, by = this.y;
        const r  = this.radius + 11;

        burstGfx.lineStyle(3, 0x00eeff, 0.9);
        burstGfx.strokeCircle(0, 0, r);
        burstGfx.x = bx;
        burstGfx.y = by;

        this.scene.tweens.add({
            targets:  burstGfx,
            scaleX:   2.8,
            scaleY:   2.8,
            alpha:    0,
            duration: 340,
            ease:     'Power2.easeOut',
            onComplete: () => burstGfx.destroy(),
        });

        // Clear the shield children immediately
        this._shieldGfx.clear();
        this._shieldRim.clear();
        this._shieldRim.alpha = 1;
    }

    update(time, delta) {
        // Rotate shield ring
        if (this.shielded) {
            this._shieldAngle += (delta / 1000) * 1.8;   // ~1.8 rad/s
            this._drawShield();

            // Drop shield when close enough to the snail
            const dist = Phaser.Math.Distance.Between(
                this.x, this.y, this.scene.snail.x, this.scene.snail.y,
            );
            if (dist < CONFIG.ALIENS.SHIELD.SHIELD_DROP_DIST) {
                this._dropShield();
            }
        }

        return super.update(time, delta);
    }
}
