import Projectile from './Projectile.js';
import { CONFIG } from '../config.js';
import { startCooldown } from './shared/CooldownTimer.js';

export default class DefenseStation extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y
     * @param {object} opts
     * @param {string} opts.type — 'CANNON' | 'SHIELD' | 'SLOWFIELD'
     * @param {function} opts.getAliens — returns current aliens array for targeting
     */
    constructor(scene, x, y, opts) {
        super(scene, x, y);
        scene.add.existing(this);

        this.stationType    = opts.type;
        this.getAliens      = opts.getAliens;
        this.alienFilter    = opts.alienFilter || (() => true);
        this.fireInterval   = opts.fireInterval   || CONFIG.CANNON.FIRE_INTERVAL;
        this.activeDuration = opts.activeDuration || CONFIG.TERMINALS.CANNON.DURATION;
        this.isActive = false;
        this.isOnCooldown = false;
        this.cooldownDuration = CONFIG.CANNON.COOLDOWN;

        // Base (circle + outline) — never rotates
        this.gfx = scene.add.graphics();
        this.add(this.gfx);

        // Barrel — rotates toward target
        this.barrelGfx = scene.add.graphics();
        this.add(this.barrelGfx);

        this.drawStation();

        // Label — left side of turret
        this.labelText = scene.add.text(-28, 0, this.stationType, {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#00ffcc',
        }).setOrigin(1, 0.5);
        this.add(this.labelText);

        // Status text — right side of turret
        this.statusText = scene.add.text(28, 0, 'READY', {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: '#44ff44',
        }).setOrigin(0, 0.5);
        this.add(this.statusText);

        // Cooldown arc (drawn over the station)
        this.cooldownGfx = scene.add.graphics();
        this.add(this.cooldownGfx);
    }

    drawStation() {
        const g = this.gfx;
        g.clear();
        this.barrelGfx.clear();

        if (this.stationType === 'CANNON' || this.stationType === 'CANNON II') {
            // Colour palette matching station-gun / station-mainframe SVG sprites
            const BODY_COL  = 0x556070; // gunmetal
            const BODY_LIT  = 0x7a8898; // lit top face
            const BODY_SHD  = 0x3a4450; // shadow face
            const BARREL    = 0x404a56; // barrel body
            const BARREL_LT = 0x60707e; // barrel lit edge
            const MUZ_TIP   = 0x88aacc; // muzzle highlight
            const EDGE      = 0x1e262e; // outline / dark edge
            const SCOPE_BG  = 0x002233; // scope housing
            const SCOPE_LNS = 0x00eeff; // scope lens (matches station gun)
            const ACCENT    = 0x00ffcc; // station cyan accent

            // Helper: trace a regular flat-top hexagon path
            const hexPath = (gfx, r) => {
                gfx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI / 3) * i - Math.PI / 6;
                    i === 0
                        ? gfx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                        : gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                gfx.closePath();
            };

            // ── Base platform: hexagon echoing the hacking station ─────────
            // Outer hex — dark shadow ring
            g.fillStyle(BODY_SHD, 1);
            hexPath(g, 20);
            g.fillPath();

            // Inner hex — lit top face
            g.fillStyle(BODY_COL, 1);
            hexPath(g, 14);
            g.fillPath();

            // Outer hex edge line
            g.lineStyle(1.5, EDGE, 1);
            hexPath(g, 20);
            g.strokePath();

            // Subtle accent ring (mirrors hacking station cyan glow)
            g.lineStyle(1.5, ACCENT, 0.4);
            g.strokeCircle(0, 0, 22);

            // Centre pivot pin
            g.fillStyle(BODY_LIT, 1);
            g.fillCircle(0, 0, 5);
            g.fillStyle(EDGE, 1);
            g.fillCircle(0, 0, 2.5);

            // ── Barrel group (rotates toward nearest alien) ────────────────
            // All coords are relative to the barrelGfx origin (= container centre).
            // At rotation=0 the barrel points UP (negative Y).
            const bg = this.barrelGfx;

            // Gun body — wider block just above the pivot, matches station-gun body proportions
            const BW = 14, BH = 10;
            const BX = -BW / 2, BY = -BH - 3;

            bg.fillStyle(BODY_COL, 1);
            bg.fillRect(BX, BY, BW, BH);
            bg.lineStyle(1, EDGE, 1);
            bg.strokeRect(BX, BY, BW, BH);

            // Lit top strip (simulates oblique top-face lighting)
            bg.fillStyle(BODY_LIT, 0.85);
            bg.fillRect(BX, BY, BW, 2.5);

            // Shadow right strip (simulates oblique side shadow)
            bg.fillStyle(BODY_SHD, 1);
            bg.fillRect(BX + BW - 3, BY + 2.5, 3, BH - 2.5);

            // Scope — mounted to the right of the body with glowing lens
            const SX = BX + BW + 1, SY = BY - 1;
            bg.fillStyle(SCOPE_BG, 1);
            bg.fillRect(SX, SY, 5, 4);
            bg.lineStyle(0.7, EDGE, 1);
            bg.strokeRect(SX, SY, 5, 4);
            bg.fillStyle(SCOPE_LNS, 0.9);
            bg.fillCircle(SX + 2.5, SY + 2, 1.5);

            // Barrel — narrower rectangle extending upward from body
            const BARW = 6, BARH = 18;
            const BARX = -BARW / 2, BARY = BY - BARH;

            bg.fillStyle(BARREL, 1);
            bg.fillRect(BARX, BARY, BARW, BARH);
            bg.lineStyle(0.8, EDGE, 1);
            bg.strokeRect(BARX, BARY, BARW, BARH);

            // Lit left edge of barrel (matches station-gun barrel highlight)
            bg.fillStyle(BARREL_LT, 1);
            bg.fillRect(BARX, BARY, 1.5, BARH);

            // Heat vent marks (matches station-gun barrel vent lines)
            bg.lineStyle(0.7, BODY_SHD, 1);
            for (let i = 0; i < 3; i++) {
                const vy = BARY + 4 + i * 4;
                bg.beginPath();
                bg.moveTo(BARX + 2.5, vy);
                bg.lineTo(BARX + BARW - 1, vy);
                bg.strokePath();
            }

            // Muzzle tip — cyan highlight matching station-gun barrel tip
            bg.fillStyle(MUZ_TIP, 0.9);
            bg.fillRect(BARX, BARY, BARW, 3.5);
            bg.lineStyle(0.5, EDGE, 1);
            bg.strokeRect(BARX, BARY, BARW, 3.5);
        }
    }

    /** Fire the cannon effect — auto-target nearest alien for duration */
    activate() {
        if (this.isActive || this.isOnCooldown) return;
        this.isActive = true;
        this.statusText.setText('FIRING').setColor('#ff4444');
        this.labelText.setColor('#ff4444');

        let shotsRemaining = Math.floor(this.activeDuration / this.fireInterval);
        const fireTimer = this.scene.time.addEvent({
            delay: this.fireInterval,
            repeat: shotsRemaining - 1,
            callback: () => {
                this.fireAtNearest();
            },
        });

        // After duration, stop and start cooldown
        this.scene.time.delayedCall(this.activeDuration, () => {
            this.isActive = false;
            this.startCooldown();
        });
    }

    fireAtNearest() {
        const aliens = this.getAliens().filter(a => a.active && this.alienFilter(a));
        if (!aliens || aliens.length === 0) return;

        // Find nearest alive alien
        let nearest = null;
        let nearestDist = Infinity;
        for (const alien of aliens) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, alien.x, alien.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = alien;
            }
        }

        if (!nearest) return;

        // Rotate barrel toward target quickly, then fire
        const dx = nearest.x - this.x;
        const dy = nearest.y - this.y;
        const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;

        this.scene.tweens.add({
            targets: this.barrelGfx,
            rotation: targetAngle,
            duration: 120,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (!this.active) return;
                this.scene.soundSynth?.play('shootTurret');
                const proj = new Projectile(this.scene, this.x, this.y, nearest.x, nearest.y);
                proj.fromCannon = true;
                if (this.scene.projectiles) {
                    this.scene.projectiles.push(proj);
                }
            },
        });
    }

    startCooldown() {
        this.isOnCooldown = true;
        this.statusText.setText('COOLDOWN').setColor('#888888');
        this.labelText.setColor('#888888');

        startCooldown(
            this.scene, this.cooldownDuration, 50,
            (remaining, pct) => {
                this.statusText.setText(`${Math.ceil(remaining / 1000)}s`);
                this.cooldownGfx.clear();
                this.cooldownGfx.lineStyle(3, 0x00ffcc, 0.35);
                this.cooldownGfx.beginPath();
                this.cooldownGfx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
                this.cooldownGfx.strokePath();
            },
            () => {
                this.isOnCooldown = false;
                this.cooldownGfx.clear();
                this.statusText.setText('READY').setColor('#44ff44');
                this.labelText.setColor('#00ffcc');
            },
        );
    }
}
