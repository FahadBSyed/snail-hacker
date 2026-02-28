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

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
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

        // Debug text area
        this.debugText = this.add.text(10, 680, '', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#00ff00',
        }).setOrigin(0, 1).setDepth(100);

        this.debugLines = [];
        this.maxDebugLines = 5;

        this.logDebug('GameScene started. P1: WASD+E  P2: click+drag');

        // Disable right-click context menu on the canvas
        this.input.mouse.disableContextMenu();

        // --- Snail (Player 1) ---
        this.snail = new Snail(this, 300, 400);

        this.logDebug('Gerald the Snail spawned at (300, 400)');

        // --- Alien speed multiplier (1.0 = normal, 0.4 = SlowField) ---
        this.alienSpeedMultiplier = 1.0;

        // --- Shooting system (Player 2) ---
        this.ammo = 10;
        this.ammoMax = 10;
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
            { x: 390, y: 220, label: 'CANNON-L', cooldown: 20000, color: 0xff8844,
              launcher: makeRhythmLauncher('CANNON-L'),
              onSuccess: () => { this.cannon.activate(); this.logDebug('Left cannon activated!'); } },
            { x: 640, y: 220, label: 'RELOAD', cooldown: 8000, color: 0x44ddff,
              launcher: makeSequenceLauncher('RELOAD'),
              onSuccess: () => {
                  this.ammo = this.ammoMax;
                  this.updateAmmoDisplay();
                  this.logDebug('Ammo reloaded!');
              } },
            { x: 890, y: 220, label: 'CANNON-R', cooldown: 20000, color: 0xff8844,
              launcher: makeRhythmLauncher('CANNON-R'),
              onSuccess: () => { this.cannon2.activate(); this.logDebug('Right cannon activated!'); } },
            { x: 390, y: 500, label: 'REPAIR', cooldown: 12000, color: 0x44ff88,
              launcher: makeSequenceLauncher('REPAIR'),
              onSuccess: () => {
                  const before = this.station.health;
                  this.station.heal(25);
                  this.updateHealthDisplay();
                  this.logDebug(`Station repaired +${this.station.health - before} HP`);
              } },
            { x: 640, y: 500, label: 'SHIELD', cooldown: 25000, color: 0x8866ff,
              launcher: makeSequenceLauncher('SHIELD'),
              onSuccess: () => {
                  const ok = this.station.shield(4000);
                  this.logDebug(ok ? 'Shield up for 4s!' : 'Shield already active!');
              } },
            { x: 890, y: 500, label: 'SLOWFIELD', cooldown: 18000, color: 0x44aaff,
              launcher: makeTypingLauncher('SLOWFIELD'),
              onSuccess: () => { this.activateSlowField(6000); } },
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

        // --- Alien spawning ---
        this.aliens = [];
        this.score = 0;
        this.wave = 1;
        this.spawnTimer = this.time.addEvent({
            delay: 2000,
            callback: this.spawnAlien,
            callbackScope: this,
            loop: true,
        });

        // --- Score HUD (top-center) ---
        this.scoreLabel = this.add.text(640, 10, 'SCORE: 0', {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(100);

        // --- Ammo HUD (top-right) ---
        this.ammoLabel = this.add.text(1270, 10, '', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#ffdd44',
        }).setOrigin(1, 0).setDepth(100);
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

    logDebug(message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        this.debugLines.push(`[${timestamp}] ${message}`);
        if (this.debugLines.length > this.maxDebugLines) {
            this.debugLines.shift();
        }
        this.debugText.setText(this.debugLines.join('\n'));
    }

    updateAmmoDisplay() {
        this.ammoLabel.setText(`AMMO: ${this.ammo} / ${this.ammoMax}`);
    }

    updateScoreDisplay() {
        this.scoreLabel.setText(`SCORE: ${this.score}`);
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
        this.alienSpeedMultiplier = 0.4;
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

    triggerBomberExplosion(bx, by) {
        const BLAST_RADIUS = 100;
        const BLAST_DAMAGE = 25;

        // Damage station if in range
        const stDist = Phaser.Math.Distance.Between(bx, by, this.station.x, this.station.y);
        if (stDist < BLAST_RADIUS) {
            if (!this.station.shielded) {
                const destroyed = this.station.takeDamage(BLAST_DAMAGE);
                this.updateHealthDisplay();
                this.logDebug(`Bomber AoE hit station! -${BLAST_DAMAGE} HP`);
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
            if (d < BLAST_RADIUS) a.takeDamage(10);
        }

        // Visual: expanding ring
        const ring = this.add.circle(bx, by, 5, 0xff6600, 0.0).setDepth(60)
            .setStrokeStyle(3, 0xff8833, 0.9);
        this.tweens.add({
            targets: ring,
            scaleX: BLAST_RADIUS / 5,
            scaleY: BLAST_RADIUS / 5,
            alpha: 0,
            duration: 350,
            ease: 'Power2',
            onComplete: () => ring.destroy(),
        });
    }

    spawnAlien() {
        const edge = Phaser.Math.Between(0, 2);
        let x, y;
        if (edge === 0) {
            x = Phaser.Math.Between(50, 1230);
            y = -20;
        } else if (edge === 1) {
            x = -20;
            y = Phaser.Math.Between(50, 670);
        } else {
            x = 1300;
            y = Phaser.Math.Between(50, 670);
        }

        const alien = new BasicAlien(this, x, y);
        this.aliens.push(alien);
    }

    checkCollisions() {
        // Projectile vs Alien
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            for (const alien of this.aliens) {
                if (!alien.active) continue;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, alien.x, alien.y);
                if (dist < alien.radius + 4) {
                    proj.destroy();
                    const isBomber = alien.alienType === 'bomber';
                    const bx = alien.x, by = alien.y;
                    const died = alien.takeDamage(10);
                    if (died) {
                        this.score++;
                        this.updateScoreDisplay();
                        this.logDebug(`Alien destroyed! Score: ${this.score}`);
                        if (isBomber) this.triggerBomberExplosion(bx, by);
                    }
                    break;
                }
            }
        }
    }

    update(time, delta) {
        this.snail.update(time, delta);

        // Update terminal proximity checks
        for (const terminal of this.terminals) {
            terminal.updateProximity(this.snail);
        }

        // Tick projectiles
        this.projectiles = this.projectiles.filter(p => {
            if (!p.active) return false;
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
                    const destroyed = this.station.takeDamage(10);
                    this.updateHealthDisplay();
                    this.logDebug(`Station hit! HP: ${this.station.health}/${this.station.maxHealth}`);
                    if (destroyed) {
                        if (this.spawnTimer) this.spawnTimer.remove(false);
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
