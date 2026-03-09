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
import MathMinigame from '../minigames/MathMinigame.js';
import RhythmMinigame from '../minigames/RhythmMinigame.js';
import SequenceMinigame from '../minigames/SequenceMinigame.js';
import TypingMinigame from '../minigames/TypingMinigame.js';
import Battery from '../entities/Battery.js';
import WaveManager from '../systems/WaveManager.js';
import EscapeShip from '../entities/EscapeShip.js';
import SoundSynth from '../systems/SoundSynth.js';
import HUD from './HUD.js';
import { spawnDeathBurst, checkBomberBlast, checkProjectileCollisions } from '../systems/CollisionSystem.js';

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
        Snail.registerAnims(this);
        this.snail = new Snail(this, 300, 400);
        if (this.startSnailHp < CONFIG.SNAIL.MAX_HEALTH) {
            this.snail.health = this.startSnailHp;
        }

        // ── Hack state ────────────────────────────────────────────────────────
        this.activeHack    = null;   // current HackMinigame instance
        this.hackProgress  = 0;      // words completed this wave (persists across cancels)
        this.hackThreshold = this._wordsForWave(this.startWave);
        this._hackMode     = 'typing'; // alternates to 'math' on each battery spawn

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
            this.hud.updateAmmo(this.ammo);
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
                    if (u.type === 'DRONE') return false; // drone has no physical terminal
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
                this.hud.updateAmmo(this.ammo);
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
        this.hud = new HUD(this, {
            wave:          this.startWave,
            hackThreshold: this.hackThreshold,
            ammoMax:       this.ammoMax,
            score:         this.startScore,
        });
        this.hud.updateAmmo(this.ammo);
        this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
        this.hud.updateGrab(this.grabSystem.statusText, this.grabSystem.statusColor);

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

                // Position snail but keep it hidden and locked until drop-in completes
                this.snail.setVisible(false);
                this.snail.setAlpha(1).setScale(1);
                this.snail.x = 300;
                this.snail.y = 400;
                this.snail.hackingActive = true;

                this.station.setHackProgress(0);
                this.hud.updateWave(this.wave);
                this.hud.updateHack(this.hackProgress, this.hackThreshold);
                this.soundSynth.play('waveStart');
                this.logDebug(`Wave ${wave} started — need ${this.hackThreshold} words`);

                // Pause alien spawning until drop-in completes
                this.waveManager.active = false;

                this._playDropInAnimation(300, 400, () => {
                    this.snail.hackingActive = false;
                    this.snail.setState('IDLE');
                    this.waveManager.active = true;
                    this.soundSynth.play('waveBegin');
                    this.logDebug('Drop-in complete — player in control, spawning active');
                });
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
                            this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                        },
                    });
                    break;
                case 'DRONE':
                    this._setupDrone();
                    break;
                default:
                    break;
            }
            if (term) this.terminals.push(term);
        }
    }

    _setupDrone() {
        // Small yellow diamond that orbits the station inside the terminal ring.
        // Uses a Container so Phaser tweens can animate its world position.
        this._droneAngle  = Math.random() * Math.PI * 2;
        this._droneOrbit  = 115; // px — inside the upgrade terminal ring (180px)
        this._droneSpeed  = 0.55; // radians per second
        this._droneFlying = false;

        const startX = 640 + Math.cos(this._droneAngle) * this._droneOrbit;
        const startY = 360 + Math.sin(this._droneAngle) * this._droneOrbit;
        this._droneGfx = this.add.graphics();
        this._renderDroneGfx(false);
        this._droneContainer = this.add.container(startX, startY, [this._droneGfx]).setDepth(60);

        // First activation: random time within DRONE_FIRST_SHOT_MAX, then fixed cooldown loop.
        const firstDelay = Math.random() * CONFIG.TERMINALS.DRONE_FIRST_SHOT_MAX;
        this._droneTimer = this.time.delayedCall(firstDelay, () => {
            this._droneFire();
            this._droneTimer = this.time.addEvent({
                delay:    CONFIG.TERMINALS.DRONE_COOLDOWN,
                loop:     true,
                callback: () => this._droneFire(),
            });
        });
    }

    /** Redraw the drone diamond at container-local (0, 0). */
    _renderDroneGfx(flash) {
        const gfx = this._droneGfx;
        const s   = flash ? 10 : 7;
        gfx.clear();
        gfx.fillStyle(flash ? 0xffffff : 0xffdd44, flash ? 1 : 0.92);
        gfx.beginPath();
        gfx.moveTo( 0, -s);
        gfx.lineTo( s,  0);
        gfx.lineTo( 0,  s);
        gfx.lineTo(-s,  0);
        gfx.closePath();
        gfx.fillPath();
        if (!flash) {
            gfx.lineStyle(1.5, 0xffffff, 0.55);
            gfx.strokePath();
        }
    }

    _droneFire() {
        if (!this._droneContainer || !this._droneContainer.active) return;

        // Collect eligible terminals: IDLE, and skip REPAIR if Gerald is at full health.
        const eligible = this.terminals.filter(t => {
            if (t.terminalState !== 'IDLE') return false;
            if (t.label === 'REPAIR' && this.snail.health >= this.snail.maxHealth) return false;
            if (t.label === 'RELOAD' && this.ammo >= this.ammoMax) return false;
            return true;
        });
        if (eligible.length === 0) return;

        const target = Phaser.Utils.Array.GetRandom(eligible);
        this._droneFlying = true;

        // Phase 1 — fly to the target terminal
        this.tweens.add({
            targets:  this._droneContainer,
            x:        target.x,
            y:        target.y,
            duration: 500,
            ease:     'Sine.easeInOut',
            onComplete: () => {
                // Phase 2 — flash at terminal, activate, play sound
                this._renderDroneGfx(true);
                this.soundSynth.play('droneActivate');
                target.droneActivate();
                this.logDebug(`Drone autonomously activated: ${target.label}`);

                // Phase 3 — brief pause, then return to orbit
                this.time.delayedCall(350, () => {
                    if (!this._droneContainer || !this._droneContainer.active) return;
                    this._renderDroneGfx(false);
                    const returnX = 640 + Math.cos(this._droneAngle) * this._droneOrbit;
                    const returnY = 360 + Math.sin(this._droneAngle) * this._droneOrbit;
                    this.tweens.add({
                        targets:  this._droneContainer,
                        x:        returnX,
                        y:        returnY,
                        duration: 600,
                        ease:     'Sine.easeInOut',
                        onComplete: () => { this._droneFlying = false; },
                    });
                });
            },
        });
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

        const remaining   = this.hackThreshold - this.hackProgress;
        const MinigameCls = this._hackMode === 'math' ? MathMinigame : HackMinigame;
        this.activeHack = new MinigameCls(this, {
            wordsRequired: remaining,
            onWordComplete: (_count) => {
                this.hackProgress++;
                this.hud.updateHack(this.hackProgress, this.hackThreshold);
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

        // Toggle hack minigame mode so the next hack session uses the other type
        this._hackMode = this._hackMode === 'typing' ? 'math' : 'typing';

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

    /**
     * Drop-in intro animation for each wave start.
     * The EscapeShip descends from off the top of the screen, drops Gerald off
     * at (dropX, dropY), then ascends and is destroyed. Only then is control
     * handed to the player and alien spawning started.
     */
    _playDropInAnimation(dropX, dropY, onComplete) {
        // Ship starts fully formed just above the visible area
        const ship = new EscapeShip(this, dropX, -110, { skipIntro: true });

        const spawnExhaust = () => this.time.addEvent({
            delay: 60, loop: true,
            callback: () => {
                if (!ship.active) return;
                const ex = this.add.circle(
                    ship.x + Phaser.Math.Between(-22, 22),
                    ship.y + 18,
                    Phaser.Math.Between(3, 7), 0x00ccff, 0.75,
                ).setDepth(48);
                this.tweens.add({
                    targets: ex, y: ex.y + 35, alpha: 0, scaleX: 0.2, scaleY: 0.2,
                    duration: 320, onComplete: () => ex.destroy(),
                });
            },
        });

        // ── Phase 1: descend to drop-off hover position ───────────────────────
        const descentExhaust = spawnExhaust();
        this.tweens.add({
            targets:  ship,
            y:        dropY - 65,   // hover above snail drop point
            duration: 1100,
            ease:     'Power2.easeOut',
            onComplete: () => {
                descentExhaust.remove(false);
                ship.startHoverBob();

                // ── Phase 2: reveal snail below the ship ──────────────────────
                this.snail.setVisible(true);
                this.snail.setAlpha(0);
                this.snail.setScale(0.1);
                this.tweens.add({
                    targets:  this.snail,
                    alpha:    1,
                    scaleX:   1,
                    scaleY:   1,
                    duration: 280,
                    ease:     'Back.easeOut',
                });

                // ── Phase 3: brief hover pause, then ascend ───────────────────
                this.time.delayedCall(550, () => {
                    const ascentExhaust = spawnExhaust();
                    this.tweens.add({
                        targets:  ship,
                        y:        -200,
                        duration: 850,
                        ease:     'Power2.easeIn',
                        onComplete: () => {
                            ascentExhaust.remove(false);
                            ship.destroy();
                            onComplete();
                        },
                    });
                });
            },
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
            spawnDeathBurst(this, alien.x, alien.y, burstColor);
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

    // ── Main update loop ──────────────────────────────────────────────────────

    update(time, delta) {
        this.grabSystem.update(delta);
        this.hud.updateGrab(this.grabSystem.statusText, this.grabSystem.statusColor);
        if (!this.boardingShip) this.snail.update(time, delta);

        // ── Drone orbit animation ─────────────────────────────────────────────
        if (this._droneContainer && this._droneContainer.active && !this._droneFlying) {
            this._droneAngle += this._droneSpeed * (delta / 1000);
            this._droneContainer.x = 640 + Math.cos(this._droneAngle) * this._droneOrbit;
            this._droneContainer.y = 360 + Math.sin(this._droneAngle) * this._droneOrbit;
        }

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
                    checkBomberBlast(this, bx, by);
                } else {
                    const died = this.snail.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
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
        checkProjectileCollisions(this);

        // Health drop pickups
        this.healthDrops = this.healthDrops.filter(drop => {
            if (!drop.active) return false;
            if (drop.checkPickup(this.snail.x, this.snail.y)) {
                const healed = Math.min(
                    CONFIG.HEALTH_DROP.AMOUNT,
                    this.snail.maxHealth - this.snail.health,
                );
                this.snail.health += healed;
                this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
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
