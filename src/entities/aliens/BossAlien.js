import { CONFIG } from '../../config.js';
import { angleToDir } from './alienUtils.js';

/**
 * BossAlien — The Overlord. Wave 10 boss.
 *
 * Orbits the station sinusoidally at CONFIG.BOSS.ORBIT_RADIUS. Spawns with a
 * crimson/gold rotating energy shield that blocks all projectiles. Shield only
 * drops when P1 completes CONFIG.BOSS.SHIELD_DROP_WORDS Frogger crossings,
 * then re-raises after CONFIG.BOSS.SHIELD_DOWN_DURATION ms.
 *
 * Every ATTACK_COOLDOWNS.ALIEN_BURST ms, fires 2 FastAliens via onAlienBurst.
 *
 * Accumulates damage; on each PHASE_SHIFT_HP chunk it flies off-screen and
 * re-enters from a new edge (also re-raises shield if it was dropped).
 *
 * Enrages below ENRAGE_HP: orbit + burst attack speed increase.
 */
export default class BossAlien extends Phaser.GameObjects.Container {
    constructor(scene, x, y, opts = {}) {
        super(scene, x, y);
        scene.add.existing(this);

        this.alienType = 'boss';
        this.health    = CONFIG.BOSS.HP;
        this.radius    = 48;   // collision radius (sprite is 96×96 px → visual radius 48)

        this.shielded        = true;
        this._dying          = false;
        this._phaseShifting  = false;
        this._damageAccum    = 0;
        this._time           = 0;
        this._baseAngle      = Math.atan2(y - 360, x - 640);
        this._burstTimer        = 0;
        this._blackHoleTimer    = 0;
        this._empTimer          = 0;
        this._terminalLockTimer = 0;

        this.onAlienBurst      = opts.onAlienBurst      || null;
        this.onBlackHole       = opts.onBlackHole       || null;
        this.onEMP             = opts.onEMP             || null;
        this.onTerminalLockEMP = opts.onTerminalLockEMP || null;

        // ── Sprite ──────────────────────────────────────────────────────────────
        this.sprite = scene.add.image(0, 0, 'alien-boss-right');
        this.add(this.sprite);
        this.facing = 'right';

        // ── Shield graphics ─────────────────────────────────────────────────────
        this._shieldAngle = 0;
        this._shieldGfx   = scene.add.graphics();
        this._shieldRim   = scene.add.graphics();
        this.add(this._shieldGfx);
        this.add(this._shieldRim);

        this._rimTween = scene.tweens.add({
            targets:  this._shieldRim,
            alpha:    0.3,
            duration: 700,
            ease:     'Sine.easeInOut',
            yoyo:     true,
            repeat:   -1,
        });

        this._drawShield();
    }

    // ── Damage ──────────────────────────────────────────────────────────────────

    /** Returns true when health reaches 0. Blocked while shielded or dying only.
     *  The boss remains vulnerable even during a phase-shift exit so that a
     *  player who keeps shooting during the 550ms fly-away window still deals
     *  damage. */
    takeDamage(amount) {
        if (this.shielded || this._dying) {
            console.log(`[BossAlien] takeDamage blocked — shielded=${this.shielded} dying=${this._dying}`);
            return false;
        }

        this.health       -= amount;
        this._damageAccum += amount;

        // Phase shift on every PHASE_SHIFT_HP chunk of damage
        if (this._damageAccum >= CONFIG.BOSS.PHASE_SHIFT_HP && this.health > 0) {
            this._damageAccum = 0;
            this._phaseShift();
        }

        return this.health <= 0;
    }

    // ── Shield ──────────────────────────────────────────────────────────────────

    flashShield() {
        if (!this.shielded) return;
        const r  = this.radius + 22;
        const fg = this.scene.add.graphics().setDepth(57);
        fg.x = this.x; fg.y = this.y;
        fg.fillStyle(0xff4400, 0.25);
        fg.fillCircle(0, 0, r);
        fg.lineStyle(5, 0xffffff, 1.0);
        fg.strokeCircle(0, 0, r);
        this.scene.tweens.add({
            targets: fg, alpha: 0, scaleX: 1.2, scaleY: 1.2,
            duration: 250, ease: 'Power2.easeOut',
            onComplete: () => fg.destroy(),
        });
        if (this._rimTween) this._rimTween.pause();
        this._shieldRim.alpha = 1;
        this.scene.time.delayedCall(250, () => {
            if (this._rimTween) this._rimTween.resume();
        });
    }

    dropShield() {
        if (!this.shielded) return;
        this.shielded = false;

        if (this._rimTween) { this._rimTween.stop(); this._rimTween = null; }

        // Burst ring off
        const r  = this.radius + 22;
        const bg = this.scene.add.graphics().setDepth(57);
        bg.x = this.x; bg.y = this.y;
        bg.lineStyle(4, 0xff4400, 0.9);
        bg.strokeCircle(0, 0, r);
        this.scene.tweens.add({
            targets: bg, scaleX: 3.0, scaleY: 3.0, alpha: 0,
            duration: 400, ease: 'Power2.easeOut',
            onComplete: () => bg.destroy(),
        });

        this._shieldGfx.clear();
        this._shieldRim.clear();
        this._shieldRim.alpha = 1;
    }

    raiseShield() {
        if (this.shielded || this._dying) return;
        this.shielded = true;
        this._rimTween = this.scene.tweens.add({
            targets:  this._shieldRim,
            alpha:    0.3,
            duration: 700,
            ease:     'Sine.easeInOut',
            yoyo:     true,
            repeat:   -1,
        });
        this._drawShield();
    }

    // ── Phase shift ─────────────────────────────────────────────────────────────

    _phaseShift() {
        this._phaseShifting = true;

        // Fly off-screen fast
        const exitAngle = Math.random() * Math.PI * 2;
        const exitX     = this.x + Math.cos(exitAngle) * 1500;
        const exitY     = this.y + Math.sin(exitAngle) * 1500;

        this.scene.tweens.add({
            targets:  this,
            x:        exitX,
            y:        exitY,
            duration: 550,
            ease:     'Power2.easeIn',
            onComplete: () => {
                if (!this.active) return;
                this.scene.time.delayedCall(1500, () => {
                    if (!this.active) return;
                    this._reenter();
                });
            },
        });
    }

    _reenter() {
        // Re-raise shield if it was dropped before the phase shift
        if (!this.shielded) this.raiseShield();

        // Teleport just off a random edge
        const edges = [
            { x: Phaser.Math.Between(100, 1180), y: -80  },
            { x: -80,  y: Phaser.Math.Between(80, 640) },
            { x: 1360, y: Phaser.Math.Between(80, 640) },
            { x: Phaser.Math.Between(100, 1180), y: 800  },
        ];
        const entry = Phaser.Utils.Array.GetRandom(edges);
        this.x = entry.x;
        this.y = entry.y;

        // Pick a new orbit angle and tween to it (apply same distance constraints as orbit)
        const newAngle = Math.random() * Math.PI * 2;
        this._baseAngle = newAngle;
        this._time      = 0;
        const cfg = CONFIG.BOSS;
        let targetX = 640 + Math.cos(newAngle) * cfg.ORBIT_RADIUS_X;
        let targetY = 360 + Math.sin(newAngle) * cfg.ORBIT_RADIUS_Y;
        const rdx = targetX - 640, rdy = targetY - 360;
        const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rdist > 0 && rdist < cfg.MIN_ORBIT_DIST) {
            const scale = cfg.MIN_ORBIT_DIST / rdist;
            targetX = 640 + rdx * scale;
            targetY = 360 + rdy * scale;
        }
        if (targetY > cfg.MAX_ORBIT_Y) targetY = cfg.MAX_ORBIT_Y;

        this.scene.tweens.add({
            targets:  this,
            x:        targetX,
            y:        targetY,
            duration: 800,
            ease:     'Power2.easeOut',
            onComplete: () => {
                if (!this.active) return;
                this._phaseShifting = false;
            },
        });
    }

    // ── Graphics ────────────────────────────────────────────────────────────────

    _drawShield() {
        const gfx = this._shieldGfx;
        const rim = this._shieldRim;
        gfx.clear();
        rim.clear();

        if (!this.shielded) return;

        const r = this.radius + 22;

        // Two offset arcs give a "broken hex ring" silhouette in crimson/gold
        gfx.lineStyle(5, 0xff2200, 0.85);
        gfx.beginPath();
        gfx.arc(0, 0, r, this._shieldAngle, this._shieldAngle + Math.PI * 1.6);
        gfx.strokePath();

        gfx.lineStyle(5, 0xffaa00, 0.75);
        gfx.beginPath();
        gfx.arc(0, 0, r, this._shieldAngle + Math.PI, this._shieldAngle + Math.PI * 2.6);
        gfx.strokePath();

        // Very faint interior fill
        gfx.fillStyle(0xff4400, 0.05);
        gfx.fillCircle(0, 0, r - 2);

        // White rim (alpha animated by tween)
        rim.lineStyle(3, 0xffdd88, 0.9);
        rim.strokeCircle(0, 0, r + 1);
    }

    // ── Update ──────────────────────────────────────────────────────────────────

    update(time, delta) {
        if (this._dying || this._phaseShifting) return;

        const dt  = delta / 1000;
        const cfg = CONFIG.BOSS;

        const enraged  = this.health <= cfg.ENRAGE_HP;
        const orbitSpd = cfg.ORBIT_SPEED * (enraged ? cfg.ENRAGE_ORBIT_MULT : 1);
        const burstCd  = cfg.ATTACK_COOLDOWNS.ALIEN_BURST * (enraged ? cfg.ENRAGE_COOLDOWN_MULT : 1);

        // Sinusoidal orbit: base angle drifts slowly, ±45° oscillation layered on top.
        this._time      += dt;
        this._baseAngle += orbitSpd * 0.35 * dt;
        const offset     = Math.sin(this._time * orbitSpd) * (Math.PI / 4);
        const angle      = this._baseAngle + offset;

        let nx = 640 + Math.cos(angle) * cfg.ORBIT_RADIUS_X;
        let ny = 360 + Math.sin(angle) * cfg.ORBIT_RADIUS_Y;

        // Enforce minimum distance from station — push outward along the radial direction
        const dx = nx - 640, dy = ny - 360;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < cfg.MIN_ORBIT_DIST) {
            const scale = cfg.MIN_ORBIT_DIST / dist;
            nx = 640 + dx * scale;
            ny = 360 + dy * scale;
        }
        // y ceiling keeps boss above FroggerMinigame panel
        if (ny > cfg.MAX_ORBIT_Y) ny = cfg.MAX_ORBIT_Y;

        this.x = nx;
        this.y = ny;

        // Face toward station
        const faceAngle = Phaser.Math.Angle.Between(this.x, this.y, 640, 360);
        const dir = angleToDir(faceAngle);
        if (dir !== this.facing) {
            this.facing = dir;
            this.sprite.setTexture(`alien-boss-${dir}`);
        }

        // Rotate shield ring
        if (this.shielded) {
            this._shieldAngle += dt * 2.2;
            this._drawShield();
        }

        // Alien burst attack
        this._burstTimer += delta;
        if (this._burstTimer >= burstCd) {
            this._burstTimer = 0;
            if (this.onAlienBurst) this.onAlienBurst(this.x, this.y);
        }

        // Black hole attack
        const blackHoleCd = cfg.ATTACK_COOLDOWNS.BLACK_HOLE * (enraged ? cfg.ENRAGE_COOLDOWN_MULT : 1);
        this._blackHoleTimer += delta;
        if (this._blackHoleTimer >= blackHoleCd) {
            this._blackHoleTimer = 0;
            if (this.onBlackHole) this.onBlackHole(this.x, this.y);
        }

        // EMP attack
        const empCd = cfg.ATTACK_COOLDOWNS.EMP * (enraged ? cfg.ENRAGE_COOLDOWN_MULT : 1);
        this._empTimer += delta;
        if (this._empTimer >= empCd) {
            this._empTimer = 0;
            if (this.onEMP) this.onEMP(this.x, this.y);
        }

        // Terminal lock EMP attack
        const termLockCd = cfg.ATTACK_COOLDOWNS.TERMINAL_LOCK * (enraged ? cfg.ENRAGE_COOLDOWN_MULT : 1);
        this._terminalLockTimer += delta;
        if (this._terminalLockTimer >= termLockCd) {
            this._terminalLockTimer = 0;
            if (this.onTerminalLockEMP) this.onTerminalLockEMP(this.x, this.y);
        }
    }
}
