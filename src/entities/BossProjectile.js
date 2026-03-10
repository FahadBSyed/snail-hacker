/**
 * BossProjectile — Slow-homing projectile fired by The Overlord.
 *
 * type: 'blackhole'
 *   Visual: concentric dark/purple rings around a near-black core.
 *   Behaviour: homes toward the snail every frame at BLACK_HOLE_SPEED.
 *   On contact with Gerald: warps him to a random position far from the station.
 *   Destroyable: absorbs BLACK_HOLE_HP worth of projectile hits before popping.
 */

import { CONFIG } from '../config.js';

export default class BossProjectile extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(52);

        this.projType = 'blackhole';
        this.health   = CONFIG.BOSS.BLACK_HOLE_HP;
        this.radius   = CONFIG.BOSS.BLACK_HOLE_RADIUS;

        this._gfx = scene.add.graphics();
        this.add(this._gfx);

        this._drawFrame(0);
    }

    // ── Visuals ───────────────────────────────────────────────────────────────

    _drawFrame(t) {
        const g = this._gfx;
        const r = this.radius;
        const p = Math.sin(t * 3) * 0.12 + 0.88;  // gentle pulse [0.76 – 1.0]
        g.clear();

        // Outer halo
        g.fillStyle(0x330066, 0.18 * p);
        g.fillCircle(0, 0, r * 2.4);

        // Mid glow ring
        g.lineStyle(2, 0x7722cc, 0.55 * p);
        g.strokeCircle(0, 0, r * 1.7);

        // Inner ring
        g.lineStyle(1.5, 0xbb44ff, 0.85 * p);
        g.strokeCircle(0, 0, r * 1.1);

        // Near-black core
        g.fillStyle(0x0a0011, 1);
        g.fillCircle(0, 0, r);

        // Singularity bright centre point
        g.fillStyle(0xcc66ff, 0.65 * p);
        g.fillCircle(0, 0, 3);
    }

    // ── Damage ────────────────────────────────────────────────────────────────

    /** Returns true when health reaches 0. */
    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    // ── Update ────────────────────────────────────────────────────────────────

    /** Called each frame. snailX/Y are Gerald's current world position.
     *  Returns false if the projectile has left the screen (caller should skip). */
    update(time, delta, snailX, snailY) {
        const dt    = delta / 1000;
        const speed = CONFIG.BOSS.BLACK_HOLE_SPEED;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, snailX, snailY);

        this.x += Math.cos(angle) * speed * dt;
        this.y += Math.sin(angle) * speed * dt;

        this._drawFrame(time / 1000);

        if (this.x < -80 || this.x > 1360 || this.y < -80 || this.y > 800) {
            this.destroy();
            return false;
        }
        return true;
    }
}
