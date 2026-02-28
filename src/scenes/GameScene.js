import { CONFIG } from '../config.js';
import Snail from '../entities/Snail.js';
import Projectile from '../entities/Projectile.js';
import BasicAlien from '../entities/aliens/BasicAlien.js';
import FastAlien from '../entities/aliens/FastAlien.js';
import TankAlien from '../entities/aliens/TankAlien.js';
import BomberAlien from '../entities/aliens/BomberAlien.js';
import HackingStation from '../entities/HackingStation.js';
import TeleportSystem from '../systems/TeleportSystem.js';
import Terminal from '../entities/Terminal.js';
import SequenceMinigame from '../minigames/SequenceMinigame.js';
import RhythmMinigame from '../minigames/RhythmMinigame.js';
import TypingMinigame from '../minigames/TypingMinigame.js';
import DefenseStation from '../entities/DefenseStation.js';
import WaveManager from '../systems/WaveManager.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data = {}) {
        this.startWave    = data.wave         || 1;
        this.startScore   = data.score        || 0;
        this.startHealth  = data.stationHealth !== undefined ? data.stationHealth : CONFIG.STATION.MAX_HEALTH;
    }

    preload() {
        // Snail directional SVGs — rasterized at 48×48 to match viewBox
        const svgSize = { width: 48, height: 48 };
        this.load.svg('snail-right', 'assets/snail-right.svg', svgSize);
        this.load.svg('snail-left',  'assets/snail-left.svg',  svgSize);
        this.load.svg('snail-up',    'assets/snail-up.svg',    svgSize);
        this.load.svg('snail-down',  'assets/snail-down.svg',  svgSize);
    }

    create() {
        // Dark starfield background
        for (let i = 0; i < 150; i++) {
            const x = Phaser.Math.Between(0, 1280);
            const y = Phaser.Math.Between(0, 720);
            const size = Phaser.Math.FloatBetween(0.5, 2);
            const alpha = Phaser.Math.FloatBetween(0.3, 0.8);
            this.add.circle(x, y, size, 0xffffff, alpha);
        }

        // --- Hacking Station (center) ---
        this.station = new HackingStation(this, 640, 360);
        // Apply health carried from intermission (or full health on fresh start)
        if (this.startHealth < CONFIG.STATION.MAX_HEALTH) {
            this.station.health = this.startHealth;
            this.station.updateHealthBar();
            this.station.drawStation();
        }

        // Disable right-click context menu on the canvas
        this.input.mouse.disableContextMenu();

        // --- ESC to pause ---
        this.input.keyboard.on('keydown-ESC', () => this._openPause());

        // --- Snail (Player 1) ---
        this.snail = new Snail(this, 300, 400);

        // --- Alien speed multiplier (1.0 = normal, 0.4 = SlowField) ---
        this.alienSpeedMultiplier = 1.0;

        // --- Shooting system (Player 2) ---
        this.ammo    = CONFIG.PLAYER.STARTING_AMMO;
        this.ammoMax = CONFIG.PLAYER.MAX_AMMO;
        this.projectiles = [];

        this.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return; // left-click only
            if (this.ammo <= 0) {
                this.logDebug('CLICK — no ammo!');
                return;
            }
            this.ammo--;
            const proj = new Projectile(this, this.station.x, this.station.y, pointer.x, pointer.y);
            this.projectiles.push(proj);
            this.updateAmmoDisplay();
            this.logDebug(`SHOOT → (${Math.round(pointer.x)}, ${Math.round(pointer.y)}) ammo: ${this.ammo}/${this.ammoMax}`);
        });

        // --- Teleport system (Player 2 right-click drag) ---
        this.teleportSystem = new TeleportSystem(this, {
            snail: this.snail,
            onTeleport: (x, y) => {
                this.logDebug(`Teleported Gerald to (${Math.round(x)}, ${Math.round(y)})`);
            },
        });

        // --- Defense stations ---
        // Left cannon — targets aliens on the left half of the screen
        this.cannon = new DefenseStation(this, 200, 150, {
            type: 'CANNON',
            getAliens: () => this.aliens,
            alienFilter: (a) => a.x < 640,
        });

        // Right cannon — targets aliens on the right half of the screen
        this.cannon2 = new DefenseStation(this, 1080, 150, {
            type: 'CANNON',
            getAliens: () => this.aliens,
            alienFilter: (a) => a.x >= 640,
        });

        // --- Terminals ---
        this.terminals = [];
        this.activeMinigame = null;

        // Shared wrapper that registers a minigame with the teleport system
        const launchMinigame = (MinigameClass, label, opts, onSuccess, onFailure) => {
            this.logDebug(`${label} minigame started!`);
            this.activeMinigame = new MinigameClass(this, {
                ...opts,
                onSuccess: () => {
                    this.activeMinigame = null;
                    this.teleportSystem.activeMinigame = null;
                    onSuccess();
                },
                onFailure: () => {
                    this.activeMinigame = null;
                    this.teleportSystem.activeMinigame = null;
                    onFailure();
                },
            });
            this.teleportSystem.activeMinigame = this.activeMinigame;
        };

        const makeSequenceLauncher = (label) => (term, onSuccess, onFailure) =>
            launchMinigame(SequenceMinigame, label, {}, onSuccess, onFailure);

        const makeRhythmLauncher = (label) => (term, onSuccess, onFailure) =>
            launchMinigame(RhythmMinigame, label, {}, onSuccess, onFailure);

        const makeTypingLauncher = (label) => (term, onSuccess, onFailure) =>
            launchMinigame(TypingMinigame, label, {}, onSuccess, onFailure);

        // 3×2 grid of terminals around the central station
        // Top row: y=220  Bottom row: y=500  Cols: x=390, 640, 890
        const terminalDefs = [
            { x: 390, y: 220, label: 'CANNON-L', cooldown: CONFIG.TERMINALS.CANNON_COOLDOWN, color: 0xff8844,
              launcher: makeRhythmLauncher('CANNON-L'),
              onSuccess: () => { this.cannon.activate(); this.logDebug('Left cannon activated!'); } },
            { x: 640, y: 220, label: 'RELOAD', cooldown: CONFIG.TERMINALS.RELOAD_COOLDOWN, color: 0x44ddff,
              launcher: makeSequenceLauncher('RELOAD'),
              onSuccess: () => {
                  this.ammo = this.ammoMax;
                  this.updateAmmoDisplay();
                  this.logDebug('Ammo reloaded!');
              } },
            { x: 890, y: 220, label: 'CANNON-R', cooldown: CONFIG.TERMINALS.CANNON_COOLDOWN, color: 0xff8844,
              launcher: makeRhythmLauncher('CANNON-R'),
              onSuccess: () => { this.cannon2.activate(); this.logDebug('Right cannon activated!'); } },
            { x: 390, y: 500, label: 'REPAIR', cooldown: CONFIG.TERMINALS.REPAIR_COOLDOWN, color: 0x44ff88,
              launcher: makeSequenceLauncher('REPAIR'),
              onSuccess: () => {
                  const before = this.station.health;
                  this.station.heal(CONFIG.TERMINALS.REPAIR_HEAL);
                  this.updateHealthDisplay();
                  this.logDebug(`Station repaired +${this.station.health - before} HP`);
              } },
            { x: 640, y: 500, label: 'SHIELD', cooldown: CONFIG.TERMINALS.SHIELD_COOLDOWN, color: 0x8866ff,
              launcher: makeSequenceLauncher('SHIELD'),
              onSuccess: () => {
                  const ok = this.station.shield(CONFIG.TERMINALS.SHIELD_DURATION);
                  this.logDebug(ok ? 'Shield up for 4s!' : 'Shield already active!');
              } },
            { x: 890, y: 500, label: 'SLOWFIELD', cooldown: CONFIG.TERMINALS.SLOW_COOLDOWN, color: 0x44aaff,
              launcher: makeTypingLauncher('SLOWFIELD'),
              onSuccess: () => { this.activateSlowField(CONFIG.TERMINALS.SLOW_DURATION); } },
        ];

        for (const def of terminalDefs) {
            const terminal = new Terminal(this, def.x, def.y, {
                label: def.label,
                cooldown: def.cooldown,
                color: def.color,
                launchMinigame: def.launcher,
                onSuccess: def.onSuccess,
            });
            this.terminals.push(terminal);
        }

        // E key to activate nearest terminal
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.eKey.on('down', () => {
            if (this.snail.hackingActive) return;
            for (const terminal of this.terminals) {
                if (terminal.tryActivate(this.snail)) {
                    break;
                }
            }
        });

        // --- Alien state ---
        this.aliens = [];
        this.score  = this.startScore;
        this.wave   = this.startWave;

        // --- Wave HUD (top-center-left) — must exist before startWave() fires onWaveStart ---
        this.waveLabel = this.add.text(510, 10, 'WAVE 1', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#ffdd44',
        }).setOrigin(0.5, 0).setDepth(100);

        this.waveTimerLabel = this.add.text(510, 28, '', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#888888',
        }).setOrigin(0.5, 0).setDepth(100);

        // --- Wave Manager ---
        this.waveManager = new WaveManager(this, {
            startWave: this.startWave,
            onSpawn: (type) => this.spawnAlien(type),
            onWaveStart: (wave, duration) => {
                this.wave = wave;
                this.updateWaveDisplay();
                this.logDebug(`Wave ${wave} started!`);
            },
            onWaveEnd: (wave) => {
                this.logDebug(`Wave ${wave} complete!`);
                if (this.waveManager.isLastWave) {
                    this.scene.start('VictoryScene', { wave, score: this.score });
                } else if (this.waveManager.isIntermissionWave) {
                    this.scene.start('IntermissionScene', {
                        wave,
                        score: this.score,
                        stationHealth: this.station.health,
                    });
                } else {
                    // Brief pause then next wave
                    this.time.delayedCall(2000, () => this.waveManager.nextWave());
                }
            },
        });
        this.waveManager.startWave();

        // --- Score HUD (top-center) ---
        this.scoreLabel = this.add.text(640, 10, `SCORE: ${this.startScore}`, {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(100);

        // --- Ammo HUD (top-right) — bullet icons ---
        this.ammoBullets = [];
        const bulletGap = 12;
        const bulletsStartX = 1270 - (this.ammoMax - 1) * bulletGap;
        for (let i = 0; i < this.ammoMax; i++) {
            const bx = bulletsStartX + i * bulletGap;
            const bullet = this.add.rectangle(bx, 18, 7, 14, 0xffdd44, 1).setDepth(100);
            this.ammoBullets.push(bullet);
        }

        // Low ammo warning
        this.lowAmmoLabel = this.add.text(1270, 38, '! LOW AMMO !', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ff4444',
        }).setOrigin(1, 0).setDepth(100).setVisible(false);

        this.updateAmmoDisplay();

        // --- Station health HUD (top-left) ---
        this.healthLabel = this.add.text(10, 10, 'STATION INTEGRITY', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#ff6666',
        }).setDepth(100);

        this.healthBarBg = this.add.rectangle(10, 30, 204, 16, 0x333333).setOrigin(0, 0).setDepth(100);
        this.healthBarFill = this.add.rectangle(12, 32, 200, 12, 0x44ff44).setOrigin(0, 0).setDepth(100);

    }

    // Redirect game-event logging to the browser console (no on-screen overlay)
    logDebug(message) {
        console.log(`[GameScene] ${message}`);
    }

    _openPause() {
        // Don't double-launch if PauseScene is already up
        if (this.scene.isActive('PauseScene')) return;
        this.scene.launch('PauseScene');
        this.scene.pause();
    }

    updateAmmoDisplay() {
        if (this.ammoBullets) {
            this.ammoBullets.forEach((b, i) => {
                const loaded = i < this.ammo;
                b.fillColor = loaded ? 0xffdd44 : 0x444444;
                b.fillAlpha  = loaded ? 1.0 : 0.4;
            });
        }
        if (this.lowAmmoLabel) {
            this.lowAmmoLabel.setVisible(this.ammo <= 2 && this.ammo > 0);
        }
    }

    updateScoreDisplay() {
        this.scoreLabel.setText(`SCORE: ${this.score}`);
    }

    updateWaveDisplay() {
        this.waveLabel.setText(`WAVE ${this.wave}`);
    }

    updateHealthDisplay() {
        const pct = this.station.health / this.station.maxHealth;
        this.healthBarFill.width = 200 * pct;

        if (pct > 0.5) {
            this.healthBarFill.fillColor = 0x44ff44;
        } else if (pct > 0.25) {
            this.healthBarFill.fillColor = 0xffdd44;
        } else {
            this.healthBarFill.fillColor = 0xff4444;
        }
    }

    activateSlowField(duration) {
        if (this.slowFieldActive) return;
        this.slowFieldActive = true;
        this.alienSpeedMultiplier = CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER;
        this.logDebug('SlowField active — aliens at 40% speed!');

        // Blue screen tint overlay
        if (!this.slowOverlay) {
            this.slowOverlay = this.add.rectangle(640, 360, 1280, 720, 0x1144aa, 0.12).setDepth(5);
        }
        this.slowOverlay.setVisible(true);

        this.time.delayedCall(duration, () => {
            this.slowFieldActive = false;
            this.alienSpeedMultiplier = 1.0;
            if (this.slowOverlay) this.slowOverlay.setVisible(false);
            this.logDebug('SlowField expired.');
        });
    }

    spawnDeathBurst(x, y, color = 0xff4444) {
        const count = 7;
        for (let i = 0; i < count; i++) {
            const angle  = (Math.PI * 2 / count) * i;
            const speed  = Phaser.Math.Between(30, 70);
            const dot    = this.add.circle(x, y, Phaser.Math.Between(2, 5), color, 0.9).setDepth(55);
            this.tweens.add({
                targets: dot,
                x: x + Math.cos(angle) * speed,
                y: y + Math.sin(angle) * speed,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: Phaser.Math.Between(250, 450),
                ease: 'Power2',
                onComplete: () => dot.destroy(),
            });
        }
    }

    triggerBomberExplosion(bx, by) {
        const blastRadius = CONFIG.DAMAGE.BOMBER_BLAST_RADIUS;

        // Damage station if in range
        const stDist = Phaser.Math.Distance.Between(bx, by, this.station.x, this.station.y);
        if (stDist < blastRadius) {
            if (!this.station.shielded) {
                const destroyed = this.station.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_STATION);
                this.updateHealthDisplay();
                this.logDebug(`Bomber AoE hit station! -${CONFIG.DAMAGE.BOMBER_BLAST_STATION} HP`);
                if (destroyed) {
                    this.scene.start('GameOverScene', { wave: this.wave, score: this.score });
                    return;
                }
            } else {
                this.logDebug('Shield absorbed bomber blast!');
            }
        }

        // Damage nearby aliens
        for (const a of this.aliens) {
            if (!a.active) continue;
            const d = Phaser.Math.Distance.Between(bx, by, a.x, a.y);
            if (d < blastRadius) a.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_ALIEN);
        }

        // Visual: expanding ring
        const ring = this.add.circle(bx, by, 5, 0xff6600, 0.0).setDepth(60)
            .setStrokeStyle(3, 0xff8833, 0.9);
        this.tweens.add({
            targets: ring,
            scaleX: blastRadius / 5,
            scaleY: blastRadius / 5,
            alpha: 0,
            duration: 350,
            ease: 'Power2',
            onComplete: () => ring.destroy(),
        });
    }

    _randomEdgePosition() {
        const edge = Phaser.Math.Between(0, 2);
        if (edge === 0) return { x: Phaser.Math.Between(50, 1230), y: -20 };
        if (edge === 1) return { x: -20,  y: Phaser.Math.Between(50, 670) };
        return           { x: 1300, y: Phaser.Math.Between(50, 670) };
    }

    spawnAlien(type = 'basic') {
        const { x, y } = this._randomEdgePosition();
        let alien;
        switch (type) {
            case 'fast':   alien = new FastAlien(this, x, y);   break;
            case 'tank':   alien = new TankAlien(this, x, y);   break;
            case 'bomber': alien = new BomberAlien(this, x, y); break;
            default:       alien = new BasicAlien(this, x, y);
        }
        this.aliens.push(alien);
    }

    checkCollisions() {
        // Projectile vs Alien
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            for (const alien of this.aliens) {
                if (!alien.active) continue;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, alien.x, alien.y);
                if (dist < alien.radius + CONFIG.PLAYER.PROJECTILE_RADIUS) {
                    proj.destroy();
                    const isBomber = alien.alienType === 'bomber';
                    const bx = alien.x, by = alien.y;
                    const died = alien.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                    if (died) {
                        this.score++;
                        this.updateScoreDisplay();
                        this.logDebug(`Alien destroyed! Score: ${this.score}`);
                        const burstColor = { basic: 0xdd3333, fast: 0xaa44ff, tank: 0x7799aa, bomber: 0xff7722 }[alien.alienType] || 0xffffff;
                        this.spawnDeathBurst(bx, by, burstColor);
                        if (isBomber) this.triggerBomberExplosion(bx, by);
                    }
                    break;
                }
            }
        }
    }

    update(time, delta) {
        this.snail.update(time, delta);

        // Wave manager tick
        if (this.waveManager) {
            this.waveManager.update(delta);
            const secs = Math.ceil(this.waveManager.timeRemaining / 1000);
            if (this.waveTimerLabel) this.waveTimerLabel.setText(`${secs}s left`);
        }

        // Update terminal proximity checks
        for (const terminal of this.terminals) {
            terminal.updateProximity(this.snail);
        }

        // Tick projectiles (with trail particles)
        this.projectiles = this.projectiles.filter(p => {
            if (!p.active) return false;
            // Emit a trail dot every ~40ms
            if (time - (p._lastTrail || 0) > 40) {
                p._lastTrail = time;
                const trail = this.add.circle(p.x, p.y, 2, 0xffffaa, 0.5).setDepth(30);
                this.tweens.add({
                    targets: trail, alpha: 0, scaleX: 0.3, scaleY: 0.3,
                    duration: 150, onComplete: () => trail.destroy(),
                });
            }
            return p.update(time, delta);
        });

        // Tick aliens
        this.aliens = this.aliens.filter(alien => {
            if (!alien.active) return false;
            const status = alien.update(time, delta);
            if (status === 'reached_station') {
                const isBomber = alien.alienType === 'bomber';
                const bx = alien.x, by = alien.y;
                alien.destroy();

                if (isBomber) {
                    this.triggerBomberExplosion(bx, by);
                } else if (this.station.shielded) {
                    this.logDebug('Shield absorbed alien hit!');
                } else {
                    const destroyed = this.station.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_STATION);
                    this.updateHealthDisplay();
                    this.logDebug(`Station hit! HP: ${this.station.health}/${this.station.maxHealth}`);
                    if (destroyed) {
                        if (this.waveManager) this.waveManager.active = false;
                        this.scene.start('GameOverScene', { wave: this.wave, score: this.score });
                    }
                }
                return false;
            }
            return true;
        });

        // Collision checks
        this.checkCollisions();

        // Clean up destroyed objects
        this.projectiles = this.projectiles.filter(p => p.active);
        this.aliens = this.aliens.filter(a => a.active);
    }
}
