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

        this.stationType = opts.type;
        this.getAliens = opts.getAliens;
        this.alienFilter = opts.alienFilter || (() => true);
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
            color: '#ff8844',
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

        if (this.stationType === 'CANNON') {
            // Base — dark circle
            g.fillStyle(0x333344, 1);
            g.fillCircle(0, 0, 20);
            g.lineStyle(2, 0xff8844, 0.8);
            g.strokeCircle(0, 0, 20);

            // Barrel — separate graphics, points up at rotation=0
            const bg = this.barrelGfx;
            bg.fillStyle(0x555566, 1);
            bg.fillRect(-4, -28, 8, 16);
            bg.lineStyle(1.5, 0xff8844, 0.6);
            bg.strokeRect(-4, -28, 8, 16);

            // Muzzle dot
            bg.fillStyle(0xff8844, 0.8);
            bg.fillCircle(0, -28, 3);
        }
    }

    /** Fire the cannon effect — auto-target nearest alien for duration */
    activate() {
        if (this.isActive || this.isOnCooldown) return;
        this.isActive = true;
        this.statusText.setText('FIRING').setColor('#ff4444');
        this.labelText.setColor('#ff4444');

        let shotsRemaining = Math.floor(CONFIG.CANNON.ACTIVE_DURATION / CONFIG.CANNON.FIRE_INTERVAL);
        const fireTimer = this.scene.time.addEvent({
            delay: CONFIG.CANNON.FIRE_INTERVAL,
            repeat: shotsRemaining - 1,
            callback: () => {
                this.fireAtNearest();
            },
        });

        // After duration, stop and start cooldown
        this.scene.time.delayedCall(CONFIG.CANNON.ACTIVE_DURATION, () => {
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
                this.scene.soundSynth?.play('cannonFire');
                const proj = new Projectile(this.scene, this.x, this.y, nearest.x, nearest.y);
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
                this.cooldownGfx.lineStyle(3, 0xff8844, 0.3);
                this.cooldownGfx.beginPath();
                this.cooldownGfx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
                this.cooldownGfx.strokePath();
            },
            () => {
                this.isOnCooldown = false;
                this.cooldownGfx.clear();
                this.statusText.setText('READY').setColor('#44ff44');
                this.labelText.setColor('#ff8844');
            },
        );
    }
}
