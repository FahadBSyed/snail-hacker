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
import HackMinigame from '../minigames/HackMinigame.js';
import HealthDrop from '../entities/HealthDrop.js';
import WaveManager from '../systems/WaveManager.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data = {}) {
        this.startWave    = data.wave        || 1;
        this.startScore   = data.score       || 0;
        // Accept snailHealth (new) or stationHealth (legacy from old intermission saves)
        this.startSnailHp = data.snailHealth !== undefined ? data.snailHealth
                          : data.stationHealth !== undefined ? data.stationHealth
                          : CONFIG.SNAIL.MAX_HEALTH;
    }

    preload() {
        const svgSize = { width: 48, height: 48 };
        this.load.svg('snail-right', 'assets/snail-right.svg', svgSize);
        this.load.svg('snail-left',  'assets/snail-left.svg',  svgSize);
        this.load.svg('snail-up',    'assets/snail-up.svg',    svgSize);
        this.load.svg('snail-down',  'assets/snail-down.svg',  svgSize);
    }

    create() {
        // ── Starfield background ──────────────────────────────────────────────
        for (let i = 0; i < 150; i++) {
            const x     = Phaser.Math.Between(0, 1280);
            const y     = Phaser.Math.Between(0, 720);
            const size  = Phaser.Math.FloatBetween(0.5, 2);
            const alpha = Phaser.Math.FloatBetween(0.3, 0.8);
            this.add.circle(x, y, size, 0xffffff, alpha);
        }

        this.input.mouse.disableContextMenu();

        // ── Hacking Station (center — objective to hack) ──────────────────────
        this.station = new HackingStation(this, 640, 360);

        // ── Snail (Player 1) ──────────────────────────────────────────────────
        this.snail = new Snail(this, 300, 400);
        if (this.startSnailHp < CONFIG.SNAIL.MAX_HEALTH) {
            this.snail.health = this.startSnailHp;
        }

        // ── Hack state ────────────────────────────────────────────────────────
        this.activeHack    = null;   // current HackMinigame instance
        this.hackProgress  = 0;      // words completed this wave (persists across cancels)
        this.hackThreshold = this._wordsForWave(this.startWave);

        // ── Alien speed multiplier ────────────────────────────────────────────
        this.alienSpeedMultiplier = 1.0;

        // ── Shooting system (Player 2 — left-click) ───────────────────────────
        this.ammo    = CONFIG.PLAYER.STARTING_AMMO;
        this.ammoMax = CONFIG.PLAYER.MAX_AMMO;
        this.projectiles = [];

        this.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            if (this.ammo <= 0) return;
            this.ammo--;
            // Fire from station toward cursor
            const proj = new Projectile(this, this.station.x, this.station.y, pointer.x, pointer.y);
            this.projectiles.push(proj);
            this.updateAmmoDisplay();
        });

        // ── Teleport system (Player 2 — right-click drag) ─────────────────────
        this.teleportSystem = new TeleportSystem(this, {
            snail: this.snail,
            onTeleport: (x, y) => {
                // Cancels hack if mid-session (handled inside TeleportSystem via activeMinigame ref)
                this.updateTeleportDisplay();
                this.logDebug(`Teleported to (${Math.round(x)}, ${Math.round(y)})`);
            },
        });

        // ── Service terminals ─────────────────────────────────────────────────
        // RELOAD — left side. P1 walks here to refill P2's ammo. No minigame needed.
        const reloadTerm = new Terminal(this, 160, 400, {
            label:    'RELOAD',
            cooldown: CONFIG.STATIONS.RELOAD_COOLDOWN,
            color:    0x44ddff,
            launchMinigame: (_term, onSuccess, _onFailure) => {
                this.time.delayedCall(80, () => onSuccess());
            },
            onSuccess: () => {
                this.ammo = this.ammoMax;
                this.updateAmmoDisplay();
                this.logDebug('Ammo reloaded!');
            },
        });

        // TELEPORT — right side. P1 walks here to recharge P2's teleport.
        const teleportTerm = new Terminal(this, 1120, 400, {
            label:    'TELEPORT',
            cooldown: CONFIG.STATIONS.TELEPORT_COOLDOWN,
            color:    0xcc66ff,
            launchMinigame: (_term, onSuccess, _onFailure) => {
                this.time.delayedCall(80, () => onSuccess());
            },
            onSuccess: () => {
                this.teleportSystem.recharge();
                this.updateTeleportDisplay();
                this.logDebug('Teleport recharged!');
            },
        });

        this.terminals = [reloadTerm, teleportTerm];

        // ── E key: open hack OR activate nearby terminal ───────────────────────
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.eKey.on('down', () => {
            if (this.snail.hackingActive) return; // already hacking
            if (this.station.isNearby) {
                this._startHack();
                return;
            }
            for (const terminal of this.terminals) {
                if (terminal.tryActivate(this.snail)) break;
            }
        });

        // ── ESC: cancel active hack, or pause ────────────────────────────────
        this.input.keyboard.on('keydown-ESC', () => {
            if (this.snail.hackingActive) {
                this._cancelHack();
            } else {
                this._openPause();
            }
        });

        // ── Game state ────────────────────────────────────────────────────────
        this.aliens      = [];
        this.healthDrops = [];
        this.score       = this.startScore;
        this.wave        = this.startWave;

        // ── HUD ───────────────────────────────────────────────────────────────
        this._createHUD();

        // ── Wave Manager ──────────────────────────────────────────────────────
        this.waveManager = new WaveManager(this, {
            startWave: this.startWave,
            onSpawn: (type) => this.spawnAlien(type),
            onWaveStart: (wave) => {
                this.wave          = wave;
                this.hackProgress  = 0;
                this.hackThreshold = this._wordsForWave(wave);
                this.station.setHackProgress(0);
                this.updateWaveDisplay();
                this.updateHackDisplay();
                this.logDebug(`Wave ${wave} started — need ${this.hackThreshold} words`);
            },
            onWaveEnd: (wave) => {
                this.logDebug(`Wave ${wave} complete!`);
                if (this.waveManager.isLastWave) {
                    this.scene.start('VictoryScene', { wave, score: this.score });
                } else if (this.waveManager.isIntermissionWave) {
                    this.scene.start('IntermissionScene', {
                        wave,
                        score:       this.score,
                        snailHealth: this.snail.health,
                    });
                } else {
                    this.time.delayedCall(2000, () => this.waveManager.nextWave());
                }
            },
        });
        this.waveManager.startWave();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _wordsForWave(wave) {
        return CONFIG.HACK.BASE_WORDS + (wave - 1) * CONFIG.HACK.WORDS_GROWTH;
    }

    _startHack() {
        this.snail.hackingActive = true;
        this.snail.setState('HACKING');

        const remaining = this.hackThreshold - this.hackProgress;
        this.activeHack = new HackMinigame(this, {
            wordsRequired: remaining,
            onWordComplete: (_count) => {
                this.hackProgress++;
                this.updateHackDisplay();
                this.station.setHackProgress(this.hackProgress / this.hackThreshold);
            },
            onSuccess: () => {
                this.activeHack = null;
                this.teleportSystem.activeMinigame = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
                this._completeWave();
            },
            onCancel: () => {
                this.activeHack = null;
                this.teleportSystem.activeMinigame = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
            },
        });

        // Register with teleport system so teleport can cancel the hack
        this.teleportSystem.activeMinigame = this.activeHack;
    }

    _cancelHack() {
        if (this.activeHack) {
            this.activeHack.cancel();
            // onCancel callback above resets state
        }
    }

    _completeWave() {
        this.logDebug(`Hack complete! Wave ${this.wave} done.`);

        // Clear remaining aliens with a satisfying burst
        for (const alien of this.aliens) {
            if (!alien.active) continue;
            const burstColor = { basic: 0xdd3333, fast: 0xaa44ff, tank: 0x7799aa, bomber: 0xff7722 }[alien.alienType] || 0xffffff;
            this.spawnDeathBurst(alien.x, alien.y, burstColor);
            alien.destroy();
        }
        this.aliens = [];

        this.waveManager.completeWave();
    }

    _openPause() {
        if (this.scene.isActive('PauseScene')) return;
        this.scene.launch('PauseScene');
        this.scene.pause();
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    _createHUD() {
        // Snail health — top-left
        this.add.text(10, 10, 'GERALD HP', {
            fontSize: '12px', fontFamily: 'monospace', color: '#44ff88',
        }).setDepth(100);
        this.healthBarBg   = this.add.rectangle(10, 28, 204, 14, 0x333333).setOrigin(0, 0).setDepth(100);
        this.healthBarFill = this.add.rectangle(12, 30, 200, 10, 0x44ff44).setOrigin(0, 0).setDepth(100);

        // Wave — top-centre-left
        this.waveLabel = this.add.text(510, 10, `WAVE ${this.startWave}`, {
            fontSize: '14px', fontFamily: 'monospace', color: '#ffdd44',
        }).setOrigin(0.5, 0).setDepth(100);

        // Hack progress — below wave label
        this.hackProgressLabel = this.add.text(510, 28, `HACK: 0 / ${this.hackThreshold}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5, 0).setDepth(100);

        // Score — top-centre
        this.scoreLabel = this.add.text(640, 10, `SCORE: ${this.startScore}`, {
            fontSize: '18px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(100);

        // Ammo — top-right (bullet icons)
        this.ammoBullets = [];
        const bulletGap      = 12;
        const bulletsStartX  = 1270 - (this.ammoMax - 1) * bulletGap;
        for (let i = 0; i < this.ammoMax; i++) {
            const bx = bulletsStartX + i * bulletGap;
            this.ammoBullets.push(this.add.rectangle(bx, 18, 7, 14, 0xffdd44, 1).setDepth(100));
        }

        this.lowAmmoLabel = this.add.text(1270, 38, '! LOW AMMO !', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ff4444',
        }).setOrigin(1, 0).setDepth(100).setVisible(false);

        // Teleport charge — below ammo
        this.teleportLabel = this.add.text(1270, 54, 'TELEPORT: READY', {
            fontSize: '10px', fontFamily: 'monospace', color: '#cc66ff',
        }).setOrigin(1, 0).setDepth(100);

        this.updateAmmoDisplay();
        this.updateHealthDisplay();
        this.updateTeleportDisplay();
    }

    updateAmmoDisplay() {
        if (this.ammoBullets) {
            this.ammoBullets.forEach((b, i) => {
                const loaded = i < this.ammo;
                b.fillColor = loaded ? 0xffdd44 : 0x444444;
                b.fillAlpha = loaded ? 1.0 : 0.4;
            });
        }
        if (this.lowAmmoLabel) {
            this.lowAmmoLabel.setVisible(this.ammo <= 2 && this.ammo > 0);
        }
    }

    updateHealthDisplay() {
        const pct = this.snail.health / this.snail.maxHealth;
        this.healthBarFill.width = 200 * pct;
        if (pct > 0.5)       this.healthBarFill.fillColor = 0x44ff44;
        else if (pct > 0.25) this.healthBarFill.fillColor = 0xffdd44;
        else                 this.healthBarFill.fillColor = 0xff4444;
    }

    updateScoreDisplay() {
        this.scoreLabel.setText(`SCORE: ${this.score}`);
    }

    updateWaveDisplay() {
        this.waveLabel.setText(`WAVE ${this.wave}`);
    }

    updateHackDisplay() {
        this.hackProgressLabel.setText(`HACK: ${this.hackProgress} / ${this.hackThreshold}`);
    }

    updateTeleportDisplay() {
        const charged = this.teleportSystem.charges > 0;
        this.teleportLabel.setText(charged ? 'TELEPORT: READY' : 'TELEPORT: EMPTY');
        this.teleportLabel.setColor(charged ? '#cc66ff' : '#664466');
    }

    // ── Alien spawning ─────────────────────────────────────────────────────────

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

    // ── Visual effects ────────────────────────────────────────────────────────

    spawnDeathBurst(x, y, color = 0xff4444) {
        const count = 7;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const speed = Phaser.Math.Between(30, 70);
            const dot   = this.add.circle(x, y, Phaser.Math.Between(2, 5), color, 0.9).setDepth(55);
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

        // Damage snail if in blast radius
        const snailDist = Phaser.Math.Distance.Between(bx, by, this.snail.x, this.snail.y);
        if (snailDist < blastRadius) {
            const died = this.snail.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_SNAIL);
            this.updateHealthDisplay();
            if (died) {
                if (this.waveManager) this.waveManager.active = false;
                if (this.activeHack)  { this.activeHack.cancel(); this.activeHack = null; }
                this.scene.start('GameOverScene', { wave: this.wave, score: this.score });
                return;
            }
        }

        // Damage nearby aliens from the blast
        for (const a of this.aliens) {
            if (!a.active) continue;
            const d = Phaser.Math.Distance.Between(bx, by, a.x, a.y);
            if (d < blastRadius) a.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_ALIEN);
        }

        // Expanding ring visual
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

    // ── Collision checks ──────────────────────────────────────────────────────

    checkCollisions() {
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
                        const burstColor = { basic: 0xdd3333, fast: 0xaa44ff, tank: 0x7799aa, bomber: 0xff7722 }[alien.alienType] || 0xffffff;
                        this.spawnDeathBurst(bx, by, burstColor);

                        // Random health drop on kill
                        if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                            this.healthDrops.push(new HealthDrop(this, bx, by));
                        }

                        if (isBomber) this.triggerBomberExplosion(bx, by);
                    }
                    break;
                }
            }
        }
    }

    // ── Main update loop ──────────────────────────────────────────────────────

    update(time, delta) {
        this.snail.update(time, delta);

        // Station proximity (shows/hides E prompt)
        this.station.updateProximity(this.snail);

        // Wave manager tick (handles spawning)
        if (this.waveManager) this.waveManager.update(delta);

        // Terminal proximity checks (RELOAD, TELEPORT stations)
        for (const terminal of this.terminals) {
            terminal.updateProximity(this.snail);
        }

        // Projectiles + trail particles
        this.projectiles = this.projectiles.filter(p => {
            if (!p.active) return false;
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

        // Aliens — move and check contact with snail
        this.aliens = this.aliens.filter(alien => {
            if (!alien.active) return false;
            const status = alien.update(time, delta);
            if (status === 'reached_snail') {
                const isBomber = alien.alienType === 'bomber';
                const bx = alien.x, by = alien.y;
                alien.destroy();

                if (isBomber) {
                    this.triggerBomberExplosion(bx, by);
                } else {
                    const died = this.snail.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.updateHealthDisplay();
                    if (died) {
                        if (this.waveManager) this.waveManager.active = false;
                        if (this.activeHack)  { this.activeHack.cancel(); this.activeHack = null; }
                        this.scene.start('GameOverScene', { wave: this.wave, score: this.score });
                        return false;
                    }
                }
                return false;
            }
            return true;
        });

        // Collision checks (projectile vs alien)
        this.checkCollisions();

        // Health drop pickups
        this.healthDrops = this.healthDrops.filter(drop => {
            if (!drop.active) return false;
            if (drop.checkPickup(this.snail.x, this.snail.y)) {
                const healed = Math.min(
                    CONFIG.HEALTH_DROP.AMOUNT,
                    this.snail.maxHealth - this.snail.health,
                );
                this.snail.health += healed;
                this.updateHealthDisplay();
                if (healed > 0) this.logDebug(`Health pickup! +${healed} HP`);
                drop.destroy();
                return false;
            }
            return true;
        });

        // Cleanup
        this.projectiles = this.projectiles.filter(p => p.active);
        this.aliens      = this.aliens.filter(a => a.active);
        this.healthDrops = this.healthDrops.filter(d => d.active);
    }

    logDebug(message) {
        console.log(`[GameScene] ${message}`);
    }
}
