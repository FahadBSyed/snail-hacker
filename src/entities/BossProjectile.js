/**
 * BossProjectile — Slow-homing projectiles fired by The Overlord.
 *
 * type: 'blackhole'
 *   Homes toward Gerald. On contact: warps him to a random position.
 *   Visual: concentric dark/purple rings, near-black core.
 *
 * type: 'emp'
 *   Homes toward the station. On contact: triggers a power-loss event.
 *   Visual: yellow glowing sphere with electric rings.
 *
 * type: 'terminallock'
 *   Homes toward a specific terminal. On contact: locks it into COOLING_DOWN.
 *   Visual: red/orange glowing sphere.
 *   opts.targetTerminal — the Terminal instance to home toward.
 *
 * All types are destroyable by P2 projectiles and the laser upgrade.
 */

import { CONFIG } from '../config.js';

export default class BossProjectile extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y
     * @param {string} [type='blackhole']
     * @param {object} [opts={}]
     * @param {number}  [opts.targetX]        — fixed target X (emp / terminallock)
     * @param {number}  [opts.targetY]        — fixed target Y (emp / terminallock)
     * @param {object}  [opts.targetTerminal] — Terminal reference (terminallock only)
     */
    constructor(scene, x, y, type = 'blackhole', opts = {}) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(52);

        this.projType        = type;
        this._targetX        = opts.targetX        ?? 640;
        this._targetY        = opts.targetY        ?? 360;
        this._targetTerminal = opts.targetTerminal ?? null;

        const hpMap = {
            blackhole:    CONFIG.BOSS.BLACK_HOLE_HP,
            emp:          CONFIG.BOSS.EMP_HP,
            terminallock: CONFIG.BOSS.TERMINAL_LOCK_HP,
        };
        this.health = hpMap[type] ?? 20;
        this.radius = CONFIG.BOSS.BLACK_HOLE_RADIUS; // shared radius for all types

        this._gfx = scene.add.graphics();
        this.add(this._gfx);

        this._drawFrame(0);
    }

    // ── Visuals ───────────────────────────────────────────────────────────────

    _drawFrame(t) {
        switch (this.projType) {
            case 'emp':          this._drawEMP(t);          break;
            case 'terminallock': this._drawTerminalLock(t); break;
            default:             this._drawBlackHole(t);    break;
        }
    }

    _drawBlackHole(t) {
        const g = this._gfx;
        const r = this.radius;
        const p = Math.sin(t * 3) * 0.12 + 0.88;
        g.clear();
        g.fillStyle(0x330066, 0.18 * p);
        g.fillCircle(0, 0, r * 2.4);
        g.lineStyle(2, 0x7722cc, 0.55 * p);
        g.strokeCircle(0, 0, r * 1.7);
        g.lineStyle(1.5, 0xbb44ff, 0.85 * p);
        g.strokeCircle(0, 0, r * 1.1);
        g.fillStyle(0x0a0011, 1);
        g.fillCircle(0, 0, r);
        g.fillStyle(0xcc66ff, 0.65 * p);
        g.fillCircle(0, 0, 3);
    }

    _drawEMP(t) {
        const g = this._gfx;
        const r = this.radius;
        const p = Math.sin(t * 4) * 0.15 + 0.85;
        g.clear();
        // Outer halo
        g.fillStyle(0x554400, 0.22 * p);
        g.fillCircle(0, 0, r * 2.4);
        // Electric rings
        g.lineStyle(2, 0xffcc00, 0.6 * p);
        g.strokeCircle(0, 0, r * 1.7);
        g.lineStyle(1.5, 0xffee44, 0.9 * p);
        g.strokeCircle(0, 0, r * 1.1);
        // Core
        g.fillStyle(0xffcc00, 1);
        g.fillCircle(0, 0, r);
        // Bright centre
        g.fillStyle(0xffffff, 0.85 * p);
        g.fillCircle(0, 0, 4);
    }

    _drawTerminalLock(t) {
        const g = this._gfx;
        const r = this.radius;
        const p = Math.sin(t * 4) * 0.15 + 0.85;
        g.clear();
        // Outer halo
        g.fillStyle(0x550000, 0.22 * p);
        g.fillCircle(0, 0, r * 2.4);
        // Rings
        g.lineStyle(2, 0xff4400, 0.6 * p);
        g.strokeCircle(0, 0, r * 1.7);
        g.lineStyle(1.5, 0xff7733, 0.9 * p);
        g.strokeCircle(0, 0, r * 1.1);
        // Core
        g.fillStyle(0xff2200, 1);
        g.fillCircle(0, 0, r);
        // Bright centre
        g.fillStyle(0xff9966, 0.85 * p);
        g.fillCircle(0, 0, 4);
    }

    // ── Damage ────────────────────────────────────────────────────────────────

    /** Returns true when health reaches 0. */
    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    // ── Update ────────────────────────────────────────────────────────────────

    /** snailX/Y only used by 'blackhole' type; other types track their stored target. */
    update(time, delta, snailX, snailY) {
        const dt = delta / 1000;

        const tx = this.projType === 'blackhole' ? snailX : this._targetX;
        const ty = this.projType === 'blackhole' ? snailY : this._targetY;

        const speedMap = {
            blackhole:    CONFIG.BOSS.BLACK_HOLE_SPEED,
            emp:          CONFIG.BOSS.EMP_SPEED,
            terminallock: CONFIG.BOSS.TERMINAL_LOCK_SPEED,
        };
        const speed = speedMap[this.projType] ?? CONFIG.BOSS.BLACK_HOLE_SPEED;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);

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
