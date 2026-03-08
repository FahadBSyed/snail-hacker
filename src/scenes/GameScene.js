import { CONFIG } from '../config.js';
import Snail from '../entities/Snail.js';
import Projectile from '../entities/Projectile.js';
import BasicAlien from '../entities/aliens/BasicAlien.js';
import FastAlien from '../entities/aliens/FastAlien.js';
import TankAlien from '../entities/aliens/TankAlien.js';
import BomberAlien from '../entities/aliens/BomberAlien.js';
import HackingStation from '../entities/HackingStation.js';
import GrabHandSystem from '../systems/GrabHandSystem.js';
import Terminal from '../entities/Terminal.js';
import DefenseStation from '../entities/DefenseStation.js';
import HackMinigame from '../minigames/HackMinigame.js';
import RhythmMinigame from '../minigames/RhythmMinigame.js';
import SequenceMinigame from '../minigames/SequenceMinigame.js';
import TypingMinigame from '../minigames/TypingMinigame.js';
import Battery from '../entities/Battery.js';
import HealthDrop from '../entities/HealthDrop.js';
import WaveManager from '../systems/WaveManager.js';
import EscapeShip from '../entities/EscapeShip.js';
import SoundSynth from '../systems/SoundSynth.js';

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
        this.upgradesList = data.upgrades || [];

        // Pick a deterministic background per wave (prime step gives good spread across 20)
        const bgIdx = ((this.startWave - 1) * 7) % 20;
        this.bgKey  = `bg-${String(bgIdx).padStart(2, '0')}`;
    }

    preload() {
        // Background for this wave (only load if not already cached)
        if (!this.textures.exists(this.bgKey)) {
            this.load.svg(this.bgKey, `assets/backgrounds/${this.bgKey}.svg`, { width: 1280, height: 720 });
        }

        const svgSize = { width: 48, height: 48 };
        // Snail directional sprites
        this.load.svg('snail-right', 'assets/snail-right.svg', svgSize);
        this.load.svg('snail-left',  'assets/snail-left.svg',  svgSize);
        this.load.svg('snail-up',    'assets/snail-up.svg',    svgSize);
        this.load.svg('snail-down',  'assets/snail-down.svg',  svgSize);
        // Damage / invincibility animation frames
        for (const dir of ['right', 'left', 'up', 'down']) {
            for (let i = 0; i <= 15; i++) {
                const f = `f${String(i).padStart(2, '0')}`;
                this.load.svg(`snail-hit-${dir}-${f}`, `assets/snail-hit-${dir}-${f}.svg`, svgSize);
            }
        }
        // Alien sprites — 8 directions each
        const dirs = ['right', 'diag-right-down', 'down', 'diag-left-down',
                      'left',  'diag-left-up',    'up',   'diag-right-up'];
        for (const dir of dirs) {
            this.load.svg(`alien-frog-${dir}`,    `assets/alien-frog-${dir}.svg`,    svgSize);
            this.load.svg(`alien-fast-${dir}`,    `assets/alien-fast-${dir}.svg`,    svgSize);
            this.load.svg(`alien-tank-${dir}`,    `assets/alien-tank-${dir}.svg`,    svgSize);
            this.load.svg(`alien-bomber-${dir}`,  `assets/alien-bomber-${dir}.svg`,  svgSize);
        }
    }

    create() {
        // ── Alien planet surface background ──────────────────────────────────
        this.add.image(640, 360, this.bgKey).setDepth(-1);

        this.input.mouse.disableContextMenu();

        // ── Sound synthesizer ─────────────────────────────────────────────────
        this.soundSynth = new SoundSynth();

        // ── Hacking Station (center — objective to hack) ──────────────────────
        this.station = new HackingStation(this, 640, 360);

        // ── Snail (Player 1) ──────────────────────────────────────────────────
        // Register per-direction damage animations (withdraw → shell pulse → extend).
        // 24 frames total: f00–f07 withdraw, f08–f15 shell, f07–f00 extend (reverse).
        for (const dir of ['right', 'left', 'up', 'down']) {
            if (!this.anims.exists(`snail-hit-${dir}`)) {
                const frameKeys = [];
                for (let i = 0; i <= 15; i++) {
                    frameKeys.push({ key: `snail-hit-${dir}-f${String(i).padStart(2, '0')}` });
                }
                for (let i = 7; i >= 0; i--) {
                    frameKeys.push({ key: `snail-hit-${dir}-f${String(i).padStart(2, '0')}` });
                }
                this.anims.create({
                    key:      `snail-hit-${dir}`,
                    frames:   frameKeys,
                    duration: CONFIG.SNAIL.INVINCIBILITY_MS,
                    repeat:   0,
                });
            }
        }

        this.snail = new Snail(this, 300, 400);
        if (this.startSnailHp < CONFIG.SNAIL.MAX_HEALTH) {
            this.snail.health = this.startSnailHp;
        }

        // ── Hack state ────────────────────────────────────────────────────────
        this.activeHack    = null;   // current HackMinigame instance
        this.hackProgress  = 0;      // words completed this wave (persists across cancels)
        this.hackThreshold = this._wordsForWave(this.startWave);

        // ── Alien speed multiplier / slow field ───────────────────────────────
        this.alienSpeedMultiplier = 1.0;
        this.slowFieldActive = false;

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
            this.cameras.main.shake(90, 0.005);
            this.soundSynth.play('shoot');
        });

        // ── Battery / power state ─────────────────────────────────────────────
        this.battery        = null;   // Battery instance or null
        this.stationPowered = true;

        // ── Grab hand system (Player 2 — right-click to pick up snail or battery) ──
        this.grabSystem = new GrabHandSystem(this, {
            snail:      this.snail,
            getBattery: () => this.battery,
            onPickup: () => {
                // Cancel any active hack or terminal minigame
                if (this.activeHack) this.activeHack.cancel();
                if (this.activeTerminalMinigame) {
                    this.activeTerminalMinigame.cancel();
                    this.activeTerminalMinigame = null;
                }
                // Drop battery if snail was carrying it
                if (this.battery && this.battery.state === 'snail') {
                    this.battery.state = 'ground';
                    this.snail.carryingBattery = false;
                }
                this.logDebug('Snail grabbed!');
            },
        });

        // ── Service terminals ─────────────────────────────────────────────────
        // Minigame launchers — each wraps the minigame and tracks it for grab-cancel support.
        this.activeTerminalMinigame = null;
        const rhythmLauncher = (_term, onSuccess, onFailure) => {
            const mg = new RhythmMinigame(this, {
                onSuccess: () => { this.activeTerminalMinigame = null; onSuccess(); },
                onFailure: () => { this.activeTerminalMinigame = null; onFailure(); },
            });
            this.activeTerminalMinigame = mg;
        };
        const sequenceLauncher = (_term, onSuccess, onFailure) => {
            const mg = new SequenceMinigame(this, {
                onSuccess: () => { this.activeTerminalMinigame = null; onSuccess(); },
                onFailure: () => { this.activeTerminalMinigame = null; onFailure(); },
            });
            this.activeTerminalMinigame = mg;
        };
        const typingLauncher = (_term, onSuccess, onFailure) => {
            const mg = new TypingMinigame(this, {
                onSuccess: () => { this.activeTerminalMinigame = null; onSuccess(); },
                onFailure: () => { this.activeTerminalMinigame = null; onFailure(); },
            });
            this.activeTerminalMinigame = mg;
        };
        // Store launchers so _spawnUpgradeTerminals can use them.
        this._sequenceLauncher = sequenceLauncher;
        this._typingLauncher   = typingLauncher;

        // RELOAD — orbits the hacking station at a fixed radius; relocates on each success.
        // Picks an angle that won't overlap existing upgrade terminals.
        const _placeReloadTerm = () => {
            const r = CONFIG.STATIONS.RELOAD_ORBIT_RADIUS;
            let angle, attempts = 0;
            do {
                angle = Math.random() * Math.PI * 2;
                const tooClose = this.upgradesList.some(u => {
                    const ur = CONFIG.UPGRADES.ORBIT_RADIUS;
                    const dx = r * Math.cos(angle) - ur * Math.cos(u.angle);
                    const dy = r * Math.sin(angle) - ur * Math.sin(u.angle);
                    return Math.sqrt(dx * dx + dy * dy) < CONFIG.UPGRADES.MIN_SEPARATION;
                });
                if (!tooClose) break;
                attempts++;
            } while (attempts < 50);
            reloadTerm.x = 640 + Math.cos(angle) * r;
            reloadTerm.y = 360 + Math.sin(angle) * r;
            reloadTerm.setScale(0);
            this.tweens.add({
                targets: reloadTerm, scaleX: 1, scaleY: 1,
                duration: 250, ease: 'Back.easeOut',
            });
        };

        const reloadTerm = new Terminal(this, 0, 0, {
            label:    'RELOAD',
            cooldown: CONFIG.STATIONS.RELOAD_COOLDOWN,
            color:    0x44ddff,
            launchMinigame: rhythmLauncher,
            onSuccess: () => {
                this.ammo = this.ammoMax;
                this.updateAmmoDisplay();
                _placeReloadTerm();
                this.logDebug('Ammo reloaded! Terminal relocated.');
            },
        });
        _placeReloadTerm(); // random initial placement

        this.terminals = [reloadTerm];

        // ── Upgrade terminals (carried over from previous waves) ───────────────
        this._spawnUpgradeTerminals();

        // ── E key: open hack OR activate nearby terminal ───────────────────────
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.eKey.on('down', () => {
            if (this.snail.hackingActive)   return; // already hacking
            if (this.snail.carryingBattery) return; // must deliver battery first
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

        // ── Escape phase state ────────────────────────────────────────────────
        this.escapePhase  = false;  // hack done, ship spawned
        this.boardingShip = false;  // snail reached ship, animation playing
        this.escapeShip   = null;

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
                this.escapePhase  = false;
                this.boardingShip = false;
                if (this.escapeShip) { this.escapeShip.destroy(); this.escapeShip = null; }
                // Restore snail for the new wave
                this.snail.setVisible(true);
                this.snail.x = 300;
                this.snail.y = 400;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
                this.station.setHackProgress(0);
                this.updateWaveDisplay();
                this.updateHackDisplay();
                this.soundSynth.play('waveStart');
                this.logDebug(`Wave ${wave} started — need ${this.hackThreshold} words`);
            },
            onWaveEnd: (wave) => {
                this.logDebug(`Wave ${wave} complete!`);
            },
        });
        this.waveManager.startWave();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _wordsForWave(wave) {
        return CONFIG.HACK.BASE_WORDS + (wave - 1) * CONFIG.HACK.WORDS_GROWTH;
    }

    _spawnUpgradeTerminals() {
        const cx = 640, cy = 360;
        const r  = CONFIG.UPGRADES.ORBIT_RADIUS;

        for (const upgrade of this.upgradesList) {
            const x = cx + Math.cos(upgrade.angle) * r;
            const y = cy + Math.sin(upgrade.angle) * r;

            let term;
            switch (upgrade.type) {
                case 'CANNON': {
                    const cannon = new DefenseStation(this, x, y - 30, {
                        type:      'CANNON',
                        getAliens: () => this.aliens,
                    });
                    term = new Terminal(this, x, y + 25, {
                        label:          'TURRET',
                        cooldown:       CONFIG.TERMINALS.CANNON_COOLDOWN,
                        color:          0xff8844,
                        launchMinigame: this._sequenceLauncher,
                        onSuccess:      () => cannon.activate(),
                    });
                    break;
                }
                case 'SHIELD':
                    term = new Terminal(this, x, y, {
                        label:          'SHIELD',
                        cooldown:       CONFIG.TERMINALS.SHIELD_COOLDOWN,
                        color:          0x4488ff,
                        launchMinigame: this._sequenceLauncher,
                        onSuccess:      () => { this.soundSynth.play('shieldActivate'); this.snail.shield(CONFIG.TERMINALS.SHIELD_DURATION); },
                    });
                    break;
                case 'SLOWFIELD':
                    term = new Terminal(this, x, y, {
                        label:          'SLOW',
                        cooldown:       CONFIG.TERMINALS.SLOW_COOLDOWN,
                        color:          0xaa44ff,
                        launchMinigame: this._typingLauncher,
                        onSuccess:      () => this._activateSlowField(),
                    });
                    break;
                case 'REPAIR':
                    term = new Terminal(this, x, y, {
                        label:          'REPAIR',
                        cooldown:       CONFIG.TERMINALS.REPAIR_COOLDOWN,
                        color:          0x44ff88,
                        launchMinigame: this._sequenceLauncher,
                        onSuccess:      () => {
                            this.snail.health = Math.min(
                                this.snail.maxHealth,
                                this.snail.health + CONFIG.TERMINALS.REPAIR_HEAL,
                            );
                            this.updateHealthDisplay();
                        },
                    });
                    break;
                default:
                    break;
            }
            if (term) this.terminals.push(term);
        }
    }

    _activateSlowField() {
        if (this.slowFieldActive) return;
        this.slowFieldActive = true;
        this.soundSynth.play('slowActivate');

        const mult = CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER;
        for (const alien of this.aliens) {
            if (!alien.active || alien._dying) continue;
            alien._origSpeed = alien._origSpeed || alien.speed;
            alien.speed = alien._origSpeed * mult;
        }

        // Screen tint — purple overlay, fades in
        this.slowOverlay = this.add.rectangle(640, 360, 1280, 720, 0xaa44ff, 0).setDepth(50);
        this.tweens.add({ targets: this.slowOverlay, alpha: 0.10, duration: 500, ease: 'Sine.easeOut' });

        // Clock tick every second while active
        this.slowTickTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => { if (this.slowFieldActive) this.soundSynth.play('slowTick'); },
        });

        this.time.delayedCall(CONFIG.TERMINALS.SLOW_DURATION, () => {
            this.slowFieldActive = false;

            // Stop tick, fade out overlay
            if (this.slowTickTimer) { this.slowTickTimer.remove(false); this.slowTickTimer = null; }
            if (this.slowOverlay) {
                this.tweens.add({
                    targets: this.slowOverlay, alpha: 0, duration: 500,
                    onComplete: () => { this.slowOverlay?.destroy(); this.slowOverlay = null; },
                });
            }

            for (const alien of this.aliens) {
                if (!alien.active) continue;
                if (alien._origSpeed !== undefined) {
                    alien.speed = alien._origSpeed;
                    delete alien._origSpeed;
                }
            }
        });
    }

    _startHack() {
        if (!this.stationPowered) return; // station offline — need battery first
        this.snail.hackingActive = true;
        this.snail.setState('HACKING');

        const remaining = this.hackThreshold - this.hackProgress;
        this.activeHack = new HackMinigame(this, {
            wordsRequired: remaining,
            onWordComplete: (_count) => {
                this.hackProgress++;
                this.updateHackDisplay();
                this.station.setHackProgress(this.hackProgress / this.hackThreshold);
                // Every N words the station loses power — but not if the hack just finished
                if (this.hackProgress < this.hackThreshold &&
                    this.hackProgress % CONFIG.BATTERY.POWER_LOSS_WORDS === 0) {
                    this._triggerPowerLoss();
                }
            },
            onSuccess: () => {
                this.activeHack = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
                this._completeWave();
            },
            onCancel: () => {
                this.activeHack = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
            },
        });
    }

    _cancelHack() {
        if (this.activeHack) {
            this.activeHack.cancel();
            // onCancel callback above resets state
        }
    }

    /** Called when hackProgress hits a POWER_LOSS_WORDS multiple. */
    _triggerPowerLoss() {
        if (!this.stationPowered) return; // already offline
        this.stationPowered = false;
        if (this.activeHack) this.activeHack.cancel();

        // Spawn battery at a random angle around the station
        const angle = Math.random() * Math.PI * 2;
        const r     = CONFIG.BATTERY.SPAWN_RADIUS;
        this.battery = new Battery(this, 640 + Math.cos(angle) * r, 360 + Math.sin(angle) * r);

        this.station.setPowered(false);
        this.soundSynth.play('powerLoss');
        this.logDebug('Station lost power! Battery spawned.');
    }

    /** Called when the snail reaches the station while carrying the battery. */
    _deliverBattery() {
        if (this.battery) {
            this.battery.destroy();
            this.battery = null;
        }
        this.snail.carryingBattery = false;
        this.snail.setState('IDLE');
        this.stationPowered = true;
        this.station.setPowered(true);
        this.soundSynth.play('powerRegain');
        this.logDebug('Battery delivered! Station back online.');
    }

    _completeWave() {
        this.logDebug(`Hack complete! Wave ${this.wave} — escape ship spawning.`);
        this._startEscapePhase();
    }

    _startEscapePhase() {
        this.escapePhase = true;

        // Spawn ship at a random inset edge position (fully on-screen)
        const sides = [
            { x: Phaser.Math.Between(150, 1130), y: 90  },
            { x: 110, y: Phaser.Math.Between(120, 600) },
            { x: 1170, y: Phaser.Math.Between(120, 600) },
        ];
        const pos = Phaser.Utils.Array.GetRandom(sides);
        this.escapeShip = new EscapeShip(this, pos.x, pos.y);

        // Instruction flash
        const msg = this.add.text(640, 180, 'HACK COMPLETE — REACH THE ESCAPE SHIP!', {
            fontSize: '20px', fontFamily: 'monospace', color: '#00ffcc',
            stroke: '#000000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(200).setAlpha(0);
        this.tweens.add({
            targets: msg, alpha: 1, duration: 300,
            yoyo: true, hold: 2500,
            onComplete: () => msg.destroy(),
        });
    }

    _boardEscapeShip() {
        if (this.boardingShip) return;
        this.boardingShip = true;

        // Cancel any active minigame/hack
        if (this.activeHack) { this.activeHack.cancel(); this.activeHack = null; }
        if (this.activeTerminalMinigame) {
            this.activeTerminalMinigame.cancel();
            this.activeTerminalMinigame = null;
        }
        this.snail.hackingActive = false;

        // Stop alien spawning and clear remaining aliens
        this.soundSynth.play('escape');
        if (this.waveManager) this.waveManager.active = false;
        for (const alien of this.aliens) {
            if (!alien.active) continue;
            const burstColor = { basic: 0xdd3333, fast: 0xaa44ff, tank: 0x7799aa, bomber: 0xff7722 }[alien.alienType] || 0xffffff;
            this.spawnDeathBurst(alien.x, alien.y, burstColor);
            alien.destroy();
        }
        this.aliens = [];

        // Move snail onto the ship
        this.escapeShip.setPromptVisible(false);
        this.snail.x = this.escapeShip.x;
        this.snail.y = this.escapeShip.y;

        // Exhaust particles during ascent
        const exhaustTimer = this.time.addEvent({
            delay: 55, loop: true,
            callback: () => {
                if (!this.escapeShip || !this.escapeShip.active) return;
                const ex = this.add.circle(
                    this.escapeShip.x + Phaser.Math.Between(-22, 22),
                    this.escapeShip.y + 18,
                    Phaser.Math.Between(3, 7), 0x00ccff, 0.75,
                ).setDepth(48);
                this.tweens.add({
                    targets: ex, y: ex.y + 35, alpha: 0, scaleX: 0.2, scaleY: 0.2,
                    duration: 320, onComplete: () => ex.destroy(),
                });
            },
        });

        // Tween ship + snail off the top of the screen
        this.tweens.add({
            targets: [this.snail, this.escapeShip],
            y: -200,
            duration: CONFIG.ESCAPE.ASCENT_DURATION,
            ease: 'Power2.easeIn',
            onComplete: () => {
                exhaustTimer.remove(false);
                this.snail.setVisible(false);
                this._showWaveCompleteSplash();
            },
        });
    }

    _showWaveCompleteSplash() {
        this.soundSynth.play('waveComplete');
        const wave = this.waveManager.wave;
        if (this.waveManager.isLastWave) {
            this.scene.start('VictoryScene', { wave, score: this.score });
        } else {
            this.scene.start('IntermissionScene', {
                wave,
                score:       this.score,
                snailHealth: this.snail.health,
                upgrades:    this.upgradesList,
            });
        }
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

        // Grab hand status — below ammo
        this.grabLabel = this.add.text(1270, 54, 'GRAB: READY', {
            fontSize: '10px', fontFamily: 'monospace', color: '#cc66ff',
        }).setOrigin(1, 0).setDepth(100);

        this.updateAmmoDisplay();
        this.updateHealthDisplay();
        this.updateGrabDisplay();
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

    updateGrabDisplay() {
        if (!this.grabLabel) return;
        this.grabLabel.setText(this.grabSystem.statusText);
        this.grabLabel.setColor(this.grabSystem.statusColor);
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
        if (this.slowFieldActive) {
            alien._origSpeed = alien.speed;
            alien.speed = alien.speed * CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER;
        }
        this.aliens.push(alien);
    }

    // ── Visual effects ────────────────────────────────────────────────────────

    spawnDeathBurst(x, y, color = 0xff4444) {
        this.soundSynth.play('explosion');
        // Expanding light pulse — large soft outer glow
        const pulse = this.add.circle(x, y, 6, 0xff3300, 0.45).setDepth(53);
        this.tweens.add({
            targets: pulse, scaleX: 9, scaleY: 9, alpha: 0,
            duration: 480, ease: 'Power2.easeOut', onComplete: () => pulse.destroy(),
        });
        // Bright inner flash
        const flash = this.add.circle(x, y, 4, 0xff8833, 0.80).setDepth(54);
        this.tweens.add({
            targets: flash, scaleX: 5, scaleY: 5, alpha: 0,
            duration: 260, ease: 'Power1.easeOut', onComplete: () => flash.destroy(),
        });

        // Debris dots
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
            this.soundSynth.play('damage');
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

                    // Red flash overlay — drawn as a scene-level circle so it works
                    // in Canvas renderer (setTint/setTintFill are no-ops on Canvas).
                    const flash = this.add.arc(bx, by, alien.radius, 0, 360, false, 0xff2222, 0.75).setDepth(58);
                    this.tweens.add({
                        targets: flash, alpha: 0, duration: 200,
                        onComplete: () => flash.destroy(),
                    });

                    // Hit-stop wobble: quick horizontal jerk on the container
                    this.tweens.add({
                        targets:  alien,
                        x:        alien.x + 5,
                        duration: 50,
                        ease:     'Sine.easeOut',
                        yoyo:     true,
                        repeat:   1,
                    });

                    if (died) {
                        this.score++;
                        this.updateScoreDisplay();
                        const burstColor = { basic: 0xdd3333, fast: 0xaa44ff, tank: 0x7799aa, bomber: 0xff7722 }[alien.alienType] || 0xffffff;

                        // Mark dying so the update loop skips it, then destroy after flash
                        alien._dying = true;
                        this.time.delayedCall(200, () => {
                            if (!alien.active) return;
                            this.spawnDeathBurst(bx, by, burstColor);

                            // Random health drop on kill
                            if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                                this.healthDrops.push(new HealthDrop(this, bx, by));
                            }

                            if (isBomber) this.triggerBomberExplosion(bx, by);
                            alien.destroy();
                        });
                    }
                    break;
                }
            }
        }
    }

    // ── Main update loop ──────────────────────────────────────────────────────

    update(time, delta) {
        this.grabSystem.update(delta);
        this.updateGrabDisplay();
        if (!this.boardingShip) this.snail.update(time, delta);

        // ── Battery logic ─────────────────────────────────────────────────────
        if (this.battery && this.battery.active) {
            if (this.battery.state === 'ground') {
                // Show pickup hint only when snail is close and not already busy
                const nearBatt = Phaser.Math.Distance.Between(
                    this.snail.x, this.snail.y, this.battery.x, this.battery.y,
                ) <= CONFIG.BATTERY.SNAIL_PICKUP_DIST * 2.5;
                this.battery.setPromptVisible(nearBatt && !this.snail.hackingActive);

                // Auto-pickup when snail walks into it
                if (!this.snail.hackingActive) {
                    const d = Phaser.Math.Distance.Between(
                        this.snail.x, this.snail.y, this.battery.x, this.battery.y,
                    );
                    if (d <= CONFIG.BATTERY.SNAIL_PICKUP_DIST) {
                        this.battery.state = 'snail';
                        this.battery.setPromptVisible(false);
                        this.snail.carryingBattery = true;
                        this.snail.setState('CARRYING');
                        this.soundSynth.play('batteryPickup');
                    }
                }
            } else if (this.battery.state === 'snail') {
                // Battery floats just above-right of snail so both are visible
                this.battery.x = this.snail.x + 22;
                this.battery.y = this.snail.y - 22;

                // Auto-deliver when snail reaches the station
                const d = Phaser.Math.Distance.Between(
                    this.snail.x, this.snail.y, this.station.x, this.station.y,
                );
                if (d <= this.station.radius + CONFIG.BATTERY.DELIVERY_DIST) {
                    this._deliverBattery();
                }
            }
            // state === 'mouse': position managed by GrabHandSystem.update()
        }

        // Station proximity (shows/hides E prompt) — suppress during escape phase
        if (!this.escapePhase) this.station.updateProximity(this.snail);

        // Escape ship proximity — snail must reach it to end the wave
        if (this.escapePhase && !this.boardingShip && this.escapeShip && this.escapeShip.active) {
            const near = this.escapeShip.checkProximity(this.snail.x, this.snail.y);
            this.escapeShip.setPromptVisible(near);
            if (near) this._boardEscapeShip();
        }

        // Wave manager tick (handles spawning)
        if (this.waveManager) this.waveManager.update(delta);

        // Terminal proximity checks
        for (const terminal of this.terminals) {
            terminal.updateProximity(this.snail);
        }

        // Projectiles + trail particles
        this.projectiles = this.projectiles.filter(p => {
            if (!p.active) return false;
            if (time - (p._lastTrail || 0) > 25) {
                p._lastTrail = time;
                // Outer soft glow
                const g1 = this.add.circle(p.x, p.y, 9, 0xffaa00, 0.10).setDepth(29);
                this.tweens.add({ targets: g1, alpha: 0, duration: 200, onComplete: () => g1.destroy() });
                // Mid glow
                const g2 = this.add.circle(p.x, p.y, 5, 0xffdd44, 0.25).setDepth(30);
                this.tweens.add({ targets: g2, alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 160, onComplete: () => g2.destroy() });
                // Bright core
                const g3 = this.add.circle(p.x, p.y, 2, 0xffffff, 0.80).setDepth(31);
                this.tweens.add({ targets: g3, alpha: 0, duration: 110, onComplete: () => g3.destroy() });
            }
            return p.update(time, delta);
        });

        // Aliens — move and check contact with snail
        this.aliens = this.aliens.filter(alien => {
            if (!alien.active || alien._dying) return false;
            const status = alien.update(time, delta);
            if (status === 'reached_snail' && !this.boardingShip) {
                const isBomber = alien.alienType === 'bomber';
                const bx = alien.x, by = alien.y;
                alien.destroy();

                if (isBomber) {
                    this.triggerBomberExplosion(bx, by);
                } else {
                    const died = this.snail.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.updateHealthDisplay();
                    this.soundSynth.play('damage');
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
                if (healed > 0) { this.soundSynth.play('healthPickup'); this.logDebug(`Health pickup! +${healed} HP`); }
                drop.destroy();
                return false;
            }
            return true;
        });

        // Cleanup
        this.projectiles = this.projectiles.filter(p => p.active);
        this.aliens      = this.aliens.filter(a => a.active && !a._dying);
        this.healthDrops = this.healthDrops.filter(d => d.active);
    }

    logDebug(message) {
        console.log(`[GameScene] ${message}`);
    }
}
