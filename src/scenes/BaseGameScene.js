import { CONFIG } from '../config.js';
import Snail from '../entities/Snail.js';
import Projectile from '../entities/Projectile.js';
import BasicFrog from '../entities/aliens/BasicAlien.js';
import FastFrog from '../entities/aliens/FastAlien.js';
import TankFrog from '../entities/aliens/TankAlien.js';
import BomberFrog from '../entities/aliens/BomberAlien.js';
import ShieldFrog from '../entities/aliens/ShieldAlien.js';
import HackingStation from '../entities/HackingStation.js';
import GrabHandSystem from '../systems/GrabHandSystem.js';
import SlimeTrail from '../systems/SlimeTrail.js';
import Terminal from '../entities/Terminal.js';
import DefenseStation from '../entities/DefenseStation.js';
import HackMinigame from '../minigames/HackMinigame.js';
import MathMinigame from '../minigames/MathMinigame.js';
import RhythmMinigame from '../minigames/RhythmMinigame.js';
import HelicopterMinigame from '../minigames/HelicopterMinigame.js';
import Battery from '../entities/Battery.js';
import HealthDrop from '../entities/HealthDrop.js';
import WaveManager from '../systems/WaveManager.js';
import EscapeShip from '../entities/EscapeShip.js';
import Decoy from '../entities/Decoy.js';
import EmpMine from '../entities/EmpMine.js';
import HUD from './HUD.js';
import { spawnDeathBurst, checkBomberBlast, checkProjectileCollisions, BURST_COLORS } from '../systems/CollisionSystem.js';
import { spawnSnakeDeathAnimation } from '../entities/snakes/snakeHitReaction.js';
import { PROP_PALETTES } from '../data/propPalettes.js';
import { ASSET_MANIFEST } from '../data/assetManifest.js';

const SNAKE_TYPES = new Set(['basic-snake', 'sidewinder', 'spitter', 'burrower', 'python']);

export default class BaseGameScene extends Phaser.Scene {
    constructor(key = 'BaseGameScene') {
        super(key);
    }

    init(data = {}) {
        this.world        = data.world       || 1;
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
        // ── Loading screen ─────────────────────────────────────────────────────
        const W = this.scale.width, H = this.scale.height;
        const cx = W / 2, cy = H / 2;
        const BAR_W = 420, BAR_H = 16;
        const barX = cx - BAR_W / 2, barY = cy + 30;

        // Solid background so the menu doesn't show through
        const loadBg = this.add.graphics();
        loadBg.fillStyle(0x0a0a0f, 1);
        loadBg.fillRect(0, 0, W, H);

        // Title
        const loadTitle = this.add.text(cx, cy - 90, 'SNAIL HACKER', {
            fontSize: '40px', fontFamily: 'monospace',
            color: '#00ffcc',
        }).setOrigin(0.5);

        // Subtitle / flavour
        const loadSubtitle = this.add.text(cx, cy - 44, '[ BOOTING SYSTEMS ]', {
            fontSize: '13px', fontFamily: 'monospace',
            color: '#006655', letterSpacing: 4,
        }).setOrigin(0.5);

        // Progress bar outline
        const barBorder = this.add.graphics();
        barBorder.lineStyle(1, 0x00ffcc, 0.35);
        barBorder.strokeRect(barX, barY, BAR_W, BAR_H);

        // Corner brackets for a terminal look
        const corner = (x, y, dx, dy) => {
            barBorder.lineStyle(2, 0x00ffcc, 0.8);
            barBorder.beginPath();
            barBorder.moveTo(x + dx * 10, y);
            barBorder.lineTo(x, y);
            barBorder.lineTo(x, y + dy * 10);
            barBorder.strokePath();
        };
        corner(barX - 4,          barY - 4,           1,  1);
        corner(barX + BAR_W + 4,  barY - 4,          -1,  1);
        corner(barX - 4,          barY + BAR_H + 4,   1, -1);
        corner(barX + BAR_W + 4,  barY + BAR_H + 4,  -1, -1);

        // Progress bar fill
        const barFill = this.add.graphics();

        // Percentage label
        const pctText = this.add.text(cx, barY + BAR_H + 14, '0%', {
            fontSize: '11px', fontFamily: 'monospace', color: '#00aa88',
        }).setOrigin(0.5);

        // Current-file status — scrolling terminal line
        const fileText = this.add.text(cx, barY - 18, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#004433',
        }).setOrigin(0.5);

        // Hook into loader events
        this.load.on('progress', (v) => {
            barFill.clear();
            barFill.fillStyle(0x00ffcc, 0.65);
            barFill.fillRect(barX + 1, barY + 1, (BAR_W - 2) * v, BAR_H - 2);
            pctText.setText(`${Math.round(v * 100)}%`);
        });

        this.load.on('fileprogress', (file) => {
            fileText.setText(file.key);
        });

        this.load.on('complete', () => {
            // Destroy all loading screen objects so they don't persist behind
            // the game scene that create() will build.
            [loadBg, loadTitle, loadSubtitle, barBorder, barFill, pctText, fileText].forEach(o => o.destroy());
        });

        // Background for this wave (only load if not already cached)
        if (!this.textures.exists(this.bgKey)) {
            this.load.svg(this.bgKey, `assets/backgrounds/${this.bgKey}.svg`, { width: 1280, height: 720 });
        }

        // ── Load all assets tagged for this world (or 'all' worlds) ──────────
        // The manifest skips world-specific assets that don't belong to this world,
        // e.g. frog/alien sprites are skipped in World 2 (snake world) and vice versa.
        for (const { key, path, size, worlds } of ASSET_MANIFEST) {
            if (worlds !== 'all' && !worlds.includes(this.world)) continue;
            if (this.textures.exists(key)) continue;
            this.load.svg(key, path, size);
        }
    }

    create() {
        // ── Alien planet surface background ──────────────────────────────────
        this.add.image(640, 360, this.bgKey).setDepth(-1);

        // ── Prop decorations (rocks + mushrooms) ──────────────────────────────
        this._propImages = [];
        this._spawnProps(this.startWave);

        this.input.mouse.disableContextMenu();

        // ── Sound synthesizer ─────────────────────────────────────────────────
        this.soundSynth = this.registry.get('soundSynth');

        // ── Hacking Station (center — objective to hack) ──────────────────────
        this.station = new HackingStation(this, 640, 360);

        // ── Snail (Player 1) ──────────────────────────────────────────────────
        Snail.registerAnims(this);
        this.snail      = new Snail(this, 300, 400);
        this.slimeTrail = new SlimeTrail(this);
        if (this.startSnailHp < CONFIG.SNAIL.MAX_HEALTH) {
            this.snail.health = this.startSnailHp;
        }

        // ── Hack state ────────────────────────────────────────────────────────
        this.activeHack    = null;   // current HackMinigame instance
        this.hackProgress  = 0;      // words completed this wave (persists across cancels)
        this.hackThreshold = this._wordsForWave(this.startWave);
        this._hackMode     = 'typing'; // alternates to 'math' on each battery spawn

        // ── Enemy speed multiplier / slow field ───────────────────────────────
        this.enemySpeedMultiplier = 1.0;
        this.slowFieldActive = false;

        // ── Shooting system (Player 2 — left-click) ───────────────────────────
        this.ammo    = CONFIG.PLAYER.STARTING_AMMO;
        this.ammoMax = CONFIG.PLAYER.MAX_AMMO;
        this.projectiles = [];
        this.mines       = [];

        // ── Passive upgrades — applied every wave from the persistent list ───────
        this._laserMode      = false;
        this.ricochetEnabled = false;
        for (const upgrade of this.upgradesList) {
            switch (upgrade.type) {
                case 'HEALTH_BOOST':
                    this.snail.maxHealth = Math.round(CONFIG.SNAIL.MAX_HEALTH * 1.5);
                    this.snail.health    = Math.min(this.snail.maxHealth, this.snail.health);
                    break;
                case 'SPEED_BOOST':
                    this.snail.speed = CONFIG.PLAYER.SNAIL_SPEED * 2;
                    break;
                case 'AMMO_BOOST':
                    this.ammoMax = Math.round(CONFIG.PLAYER.MAX_AMMO * 1.5);
                    this.ammo    = this.ammoMax;
                    // hud doesn't exist yet — ammoMax is passed to its constructor below
                    break;
                case 'LASER':
                    this._laserMode = true;
                    break;
                case 'RICOCHET':
                    this.ricochetEnabled = true;
                    break;
            }
        }

        // ── Battery / power state ─────────────────────────────────────────────
        this.battery        = null;   // Battery instance or null
        this.stationPowered = true;

        // ── Grab hand system (Player 2 — left-click to pick up snail or battery) ──
        this.grabSystem = new GrabHandSystem(this, {
            snail:      this.snail,
            getBattery: () => this.battery,
            getMines:   () => this.mines,
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
        if (this.upgradesList.some(u => u.type === 'QUICK_GRAB')) {
            this.grabSystem.cooldownMultiplier = 0.5;
        }
        if (this.upgradesList.some(u => u.type === 'QUICK_GRAB_2')) {
            this.grabSystem.cooldownMultiplier = CONFIG.GRAB.QUICK_GRAB_2_COOLDOWN / CONFIG.GRAB.COOLDOWN;
        }
        this._healthDropGravitate = this.upgradesList.some(u => u.type === 'HEALTH_2');
        this._laser2  = this.upgradesList.some(u => u.type === 'LASER_2');
        this._speed2  = this.upgradesList.some(u => u.type === 'SPEED_2');
        const hasRicochet2 = this.upgradesList.some(u => u.type === 'RICOCHET_2');
        this._ricochetFalloff      = hasRicochet2 ? CONFIG.RICOCHET_2.FALLOFF       : CONFIG.RICOCHET.FALLOFF;
        this._ricochetSearchRadius = hasRicochet2 ? CONFIG.RICOCHET_2.SEARCH_RADIUS : CONFIG.RICOCHET.SEARCH_RADIUS;

        // Shoot listener registered AFTER grabSystem so grab's pointerdown fires first,
        // ensuring grabSystem.hovering is already up-to-date when this check runs.
        this.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            if (this.grabSystem.hovering) return;  // grab consumed this click
            if (this.ammo <= 0) return;
            this.ammo--;
            if (this._laserMode) {
                this._fireLaser(pointer.x, pointer.y);
            } else {
                const proj = new Projectile(this, this.station.x, this.station.y, pointer.x, pointer.y);
                this.projectiles.push(proj);
            }
            this.hud.updateAmmo(this.ammo);
            this.cameras.main.shake(90, 0.005);
            this.soundSynth.play('shoot');
            this.station.fireEffect();
        });

        // Notify grabSystem when the scene is resumed from pause
        this.events.on('resume', () => this.grabSystem.onResume());

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
        // Store launcher so _spawnUpgradeTerminals can use it.
        this._rhythmLauncher  = rhythmLauncher;

        // Instant launcher — no minigame; pressing E succeeds immediately.
        this._instantLauncher = (_term, onSuccess, _onFailure) => { onSuccess(); };

        // RELOAD — orbits the hacking station at a fixed radius; relocates on each success.
        // Picks an angle that won't overlap existing upgrade terminals.
        const _placeReloadTerm = () => {
            const r = CONFIG.TERMINALS.RELOAD.ORBIT_RADIUS;
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
            cooldown: CONFIG.TERMINALS.RELOAD.COOLDOWN,
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

        // Speed II — passive: replace rhythm launcher with instant on every terminal
        if (this._speed2) {
            for (const term of this.terminals) {
                term.launchMinigame = this._instantLauncher;
            }
        }

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
            if (this.activeTerminalMinigame) {
                this.activeTerminalMinigame.cancel();
                this.activeTerminalMinigame = null;
            } else if (this.snail.hackingActive) {
                this._cancelHack();
            } else {
                this._openPause();
            }
        });

        // ── Game state ────────────────────────────────────────────────────────
        this.enemies      = [];
        this.bushes      = [];
        this.acidGlobs   = [];
        this.acidPuddles = [];
        this.healthDrops = [];

        // World 2 venom state
        this._venomActive = false;
        this._venomTimer  = null;
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

        // Ammo Boost II — passive bullet regen
        if (this.upgradesList.some(u => u.type === 'AMMO_2')) {
            this.time.addEvent({
                delay:    Math.round(1000 / CONFIG.PLAYER.AMMO_2_REGEN_RATE),
                loop:     true,
                callback: () => {
                    if (this.ammo < this.ammoMax) {
                        this.ammo++;
                        this.hud.updateAmmo(this.ammo);
                    }
                },
            });
        }

        // Health Boost II — passive HP regen
        if (this._healthDropGravitate) {
            this.time.addEvent({
                delay:    1000,
                loop:     true,
                callback: () => {
                    if (!this.snail?.active) return;
                    if (this.snail.health < this.snail.maxHealth) {
                        this.snail.health = Math.min(
                            this.snail.maxHealth,
                            this.snail.health + CONFIG.SNAIL.HEALTH_2_REGEN_RATE,
                        );
                        this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                    }
                },
            });
        }
        this.hud.updateGrab(this.grabSystem.statusText, this.grabSystem.statusColor);

        // ── Wave Manager ──────────────────────────────────────────────────────
        this.waveManager = new WaveManager(this, {
            world:     this.world,
            startWave: this.startWave,
            onSpawn: (type) => this.spawnEnemy(type),
            onFormation: (formation) => this._spawnFormation(formation),
            onWaveStart: (wave) => {
                this.wave          = wave;
                this._spawnProps(wave);
                this._spawnWorldEntities(this.waveManager.getConfig().bushCount || 0);
                this.hackProgress  = 0;
                this.hackThreshold = this._wordsForWave(wave);
                this.escapePhase  = false;
                this.boardingShip = false;
                if (this.escapeShip) { this.escapeShip.destroy(); this.escapeShip = null; }
                this._escapeShipSound?.stop(); this._escapeShipSound = null;

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
                this._waveFirstAlienSpawned = false;
                this._startRibbetTimer();
                this.logDebug(`Wave ${wave} started — need ${this.hackThreshold} words`);

                // Pause alien spawning until drop-in completes
                this.waveManager.active = false;

                this._playDropInAnimation(300, 400, () => {
                    this.snail.hackingActive = false;
                    this.snail.setState('IDLE');
                    this.waveManager.active = true;
                    this.soundSynth.play('waveBegin');
                    this.logDebug('Drop-in complete — player in control, spawning active');
                    if (wave === 10) this._spawnBoss();
                });
            },
            onWaveEnd: (wave) => {
                this.logDebug(`Wave ${wave} complete!`);
            },
        });
        this.waveManager.startWave();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Destroy any existing prop images and respawn rocks + mushrooms for the
     * given wave.  Palette color is derived from the wave's background index so
     * props always match the ground tone.  Positions are pseudo-random (seeded
     * per wave) and use rejection sampling to avoid the central safe zone and
     * screen edges.
     */
    _spawnProps(wave) {
        // Clear old prop images
        for (const img of this._propImages) img.destroy();
        this._propImages = [];

        // Palette index for this wave (mirrors background selection formula)
        const bgIdx   = ((wave - 1) * 7) % 20;
        const palette = PROP_PALETTES[bgIdx];

        // Normalise dark palette hex to a full-range tint RGB (brightest channel → 255)
        // so the multiply colorisation produces a visible, correctly-hued result.
        const brightenHex = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const maxC = Math.max(r, g, b) || 1;
            const k = 255 / maxC;
            return {
                r: Math.min(255, Math.round(r * k)),
                g: Math.min(255, Math.round(g * k)),
                b: Math.min(255, Math.round(b * k)),
            };
        };
        const rockRGB  = brightenHex(palette.rock);
        const floraRGB = brightenHex(palette.flora);

        // Build colorised texture keys keyed to bgIdx so they're cached and
        // reused if the same background recurs.
        const rockKey  = `prop-rock-tinted-${bgIdx}`;
        const floraKey = `prop-mushroom-tinted-${bgIdx}`;

        // Colorise each unique base key for this bg if not already cached.
        // Using Canvas 2D: draw greyscale → multiply blend tint colour →
        // destination-in with original to restore correct transparency.
        const ROCK_KEYS     = ['prop-rock-0', 'prop-rock-1', 'prop-rock-2'];
        const MUSHROOM_KEYS = ['prop-mushroom-0', 'prop-mushroom-1'];

        const ensureColorised = (sourceKeys, rgb, cachePrefix) => {
            const out = [];
            for (const src of sourceKeys) {
                const key = `${cachePrefix}-${src}-bg${bgIdx}`;
                if (!this.textures.exists(key)) {
                    this._colorisePropTexture(src, rgb, key);
                }
                out.push(key);
            }
            return out;
        };

        const rockKeys     = ensureColorised(ROCK_KEYS,     rockRGB,  'cr');
        const mushroomKeys = ensureColorised(MUSHROOM_KEYS, floraRGB, 'cm');

        // Seeded PRNG (mulberry32) — deterministic per wave
        let seed = wave * 1_000_003 + 7;
        const rng = () => {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4_294_967_296;
        };

        // Arena constraints
        const W = 1280, H = 720;
        const MARGIN    = 60;   // keep props away from screen edges
        const CLEAR_R   = 240;  // keep props away from station center (640,360)
        const MIN_GAP   = 38;   // minimum distance between any two prop centers
        const MAX_TRIES = 40;

        const placed = [];

        const tryPlace = (key) => {
            let tries = 0;
            while (tries < MAX_TRIES) {
                tries++;
                const x = MARGIN + rng() * (W - MARGIN * 2);
                const y = MARGIN + rng() * (H - MARGIN * 2);
                const dx = x - 640, dy = y - 360;
                if (dx * dx + dy * dy < CLEAR_R * CLEAR_R) continue;
                const tooClose = placed.some(p => {
                    const px = p.x - x, py = p.y - y;
                    return px * px + py * py < MIN_GAP * MIN_GAP;
                });
                if (tooClose) continue;
                placed.push({ x, y });
                const img = this.add.image(x, y, key).setDepth(y / 100);
                img._colRadius = key.startsWith('cm') ? CONFIG.PROPS.MUSH_RADIUS : CONFIG.PROPS.ROCK_RADIUS;
                this._propImages.push(img);
                return;
            }
        };

        const rockCount     = 1 + Math.floor(rng() * 2); // 3-4
        const mushroomCount =  1 + Math.floor(rng() * 2); //  3-4

        for (let i = 0; i < rockCount;     i++) tryPlace(rockKeys[Math.floor(rng() * rockKeys.length)]);
        for (let i = 0; i < mushroomCount; i++) tryPlace(mushroomKeys[Math.floor(rng() * mushroomKeys.length)]);
    }


    /**
     * Creates a colourised copy of a greyscale prop texture and registers it
     * under `newKey` in the Phaser texture cache.
     *
     * Method: Canvas 2D multiply compositing.
     *   1. Draw the greyscale source onto an offscreen canvas.
     *   2. Overlay a solid rect of the tint colour with 'multiply' blend —
     *      this colourises the pixels but also fills transparent areas.
     *   3. Re-draw the original source with 'destination-in' to restore the
     *      correct alpha (transparent pixels outside the prop shape).
     */
    _colorisePropTexture(sourceKey, rgb, newKey) {
        const texSrc = this.textures.get(sourceKey).source[0];
        const src = texSrc.image;               // HTMLCanvasElement or HTMLImageElement
        const w   = texSrc.width;
        const h   = texSrc.height;

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // 1. Greyscale base
        ctx.drawImage(src, 0, 0);

        // 2. Multiply tint (colorises but makes transparent bg opaque)
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        ctx.fillRect(0, 0, w, h);

        // 3. Restore original alpha mask
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(src, 0, 0);

        this.textures.addCanvas(newKey, canvas);
    }

    _wordsForWave(wave) {
        return CONFIG.HACK.BASE_WORDS + (wave - 1) * CONFIG.HACK.WORDS_GROWTH;
    }

    _spawnUpgradeTerminals() {
        const cx = 640, cy = 360;
        const r  = CONFIG.UPGRADES.ORBIT_RADIUS;

        // Build the owned-type set so we can skip T1s replaced by their T2.
        const ownedTypes = new Set(this.upgradesList.map(u => u.type));

        // Reverse map: T2 type → T1 type (used to resolve the T1's orbital angle).
        const T2_TO_T1 = {
            CANNON_2: 'CANNON', SHIELD_2: 'SHIELD', SLOWFIELD_2: 'SLOWFIELD',
            REPAIR_2: 'REPAIR', DRONE_2: 'DRONE', DECOY_2: 'DECOY', EMP_MINES_2: 'EMP_MINES',
            SPEED_2: 'SPEED_BOOST',
        };

        for (const upgrade of this.upgradesList) {
            // Skip the T1 when its T2 is also owned — the T2 entry below spawns
            // the replacement terminal at the T1's orbital angle.
            if (ownedTypes.has(upgrade.type + '_2')) continue;

            // T2 upgrades slot into the T1 predecessor's orbital position so the
            // terminal replaces the old one in exactly the same screen location.
            const t1Type = T2_TO_T1[upgrade.type];
            const angle  = t1Type
                ? (this.upgradesList.find(u => u.type === t1Type)?.angle ?? upgrade.angle)
                : upgrade.angle;

            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            let term;
            switch (upgrade.type) {
                case 'CANNON': {
                    const cannon = new DefenseStation(this, x, y - 30, {
                        type:        'CANNON',
                        getEnemies:   () => this.enemies,
                        enemyFilter: (a) => !a.shielded,   // ignore shielded aliens
                    });
                    term = new Terminal(this, x, y + 25, {
                        label:          'TURRET',
                        effectDuration: CONFIG.TERMINALS.CANNON.DURATION,
                        cooldown:       CONFIG.TERMINALS.CANNON.COOLDOWN,
                        color:          0xff8844,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => cannon.activate(),
                    });
                    break;
                }
                case 'SHIELD':
                    term = new Terminal(this, x, y, {
                        label:          'SHIELD',
                        effectDuration: CONFIG.TERMINALS.SHIELD.DURATION,
                        cooldown:       CONFIG.TERMINALS.SHIELD.COOLDOWN,
                        color:          0x4488ff,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => { this.soundSynth.play('shieldActivate'); this.snail.shield(CONFIG.TERMINALS.SHIELD.DURATION); },
                    });
                    break;
                case 'SLOWFIELD':
                    term = new Terminal(this, x, y, {
                        label:          'SLOW',
                        effectDuration: CONFIG.TERMINALS.SLOW.DURATION,
                        cooldown:       CONFIG.TERMINALS.SLOW.COOLDOWN,
                        color:          0xaa44ff,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateSlowField(),
                    });
                    break;
                case 'REPAIR':
                    term = new Terminal(this, x, y, {
                        label:          'REPAIR',
                        cooldown:       CONFIG.TERMINALS.REPAIR.COOLDOWN,
                        color:          0x44ff88,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => {
                            this.snail.health = Math.min(
                                this.snail.maxHealth,
                                this.snail.health + CONFIG.TERMINALS.REPAIR.HEAL,
                            );
                            this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                        },
                    });
                    break;
                case 'DRONE':
                    this._setupDrone();
                    break;
                case 'DECOY':
                    term = new Terminal(this, x, y, {
                        label:          'DECOY',
                        effectDuration: CONFIG.TERMINALS.DECOY.DURATION,
                        cooldown:       CONFIG.TERMINALS.DECOY.COOLDOWN,
                        color:          0xff44cc,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateDecoy(),
                    });
                    break;
                case 'EMP_MINES':
                    term = new Terminal(this, x, y, {
                        label:          'EMP',
                        effectDuration: CONFIG.TERMINALS.EMP.ACTIVE_DURATION,
                        cooldown:       CONFIG.TERMINALS.EMP.COOLDOWN,
                        color:          0x00ff88,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateEmpMines(),
                    });
                    break;

                // ── Tier II actives ────────────────────────────────────────
                case 'CANNON_2': {
                    const cannon2 = new DefenseStation(this, x, y - 30, {
                        type:           'CANNON II',
                        getEnemies:      () => this.enemies,
                        enemyFilter:    (a) => !a.shielded,
                        fireInterval:   CONFIG.TERMINALS.CANNON_2.FIRE_INTERVAL,
                        activeDuration: CONFIG.TERMINALS.CANNON_2.DURATION,
                    });
                    term = new Terminal(this, x, y + 25, {
                        label:          'TURRET II',
                        effectDuration: CONFIG.TERMINALS.CANNON_2.DURATION,
                        cooldown:       CONFIG.TERMINALS.CANNON_2.COOLDOWN,
                        color:          0xffaa66,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => cannon2.activate(),
                    });
                    break;
                }
                case 'SHIELD_2':
                    term = new Terminal(this, x, y, {
                        label:          'SHIELD II',
                        effectDuration: CONFIG.TERMINALS.SHIELD_2.DURATION,
                        cooldown:       CONFIG.TERMINALS.SHIELD_2.COOLDOWN,
                        color:          0x88bbff,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => {
                            this.soundSynth.play('shieldActivate');
                            this.snail.shield(CONFIG.TERMINALS.SHIELD_2.DURATION);
                            this._shieldLethal = true;
                            this.time.delayedCall(CONFIG.TERMINALS.SHIELD_2.DURATION,
                                () => { this._shieldLethal = false; });
                        },
                    });
                    break;
                case 'SLOWFIELD_2':
                    term = new Terminal(this, x, y, {
                        label:          'SLOW II',
                        effectDuration: CONFIG.TERMINALS.SLOW_2.DURATION,
                        cooldown:       CONFIG.TERMINALS.SLOW_2.COOLDOWN,
                        color:          0xcc88ff,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateSlowField(
                            CONFIG.TERMINALS.SLOW_2.SPEED_MULTIPLIER,
                            CONFIG.TERMINALS.SLOW_2.DURATION,
                        ),
                    });
                    break;
                case 'REPAIR_2':
                    term = new Terminal(this, x, y, {
                        label:          'REPAIR II',
                        effectDuration: CONFIG.TERMINALS.REPAIR_2.REGEN_DURATION,
                        cooldown:       CONFIG.TERMINALS.REPAIR_2.COOLDOWN,
                        color:          0x88ffcc,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => {
                            // Instant heal
                            this.snail.health = Math.min(
                                this.snail.maxHealth,
                                this.snail.health + CONFIG.TERMINALS.REPAIR_2.HEAL,
                            );
                            this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                            // Passive regen ticks
                            const tickMs    = 500;
                            const hpPerTick = CONFIG.TERMINALS.REPAIR_2.REGEN_RATE * (tickMs / 1000);
                            const maxTicks  = Math.round(CONFIG.TERMINALS.REPAIR_2.REGEN_DURATION / tickMs);
                            let ticks = 0;
                            this.hud.showRegen();
                            const regenTimer = this.time.addEvent({
                                delay: tickMs, loop: true,
                                callback: () => {
                                    if (!this.snail?.active) {
                                        this.hud.hideRegen();
                                        regenTimer.remove(false);
                                        return;
                                    }
                                    this.snail.health = Math.min(
                                        this.snail.maxHealth,
                                        this.snail.health + hpPerTick,
                                    );
                                    this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                                    if (++ticks >= maxTicks) {
                                        this.hud.hideRegen();
                                        regenTimer.remove(false);
                                    }
                                },
                            });
                        },
                    });
                    break;
                case 'DRONE_2':
                    this._setupDrone(CONFIG.TERMINALS.DRONE_2);
                    break;
                case 'DECOY_2':
                    term = new Terminal(this, x, y, {
                        label:          'DECOY II',
                        effectDuration: CONFIG.TERMINALS.DECOY_2.DURATION,
                        cooldown:       CONFIG.TERMINALS.DECOY_2.COOLDOWN,
                        color:          0xff88ee,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateDecoy2(),
                    });
                    break;
                case 'EMP_MINES_2':
                    term = new Terminal(this, x, y, {
                        label:          'EMP II',
                        effectDuration: CONFIG.TERMINALS.EMP_2.ACTIVE_DURATION,
                        cooldown:       CONFIG.TERMINALS.EMP_2.COOLDOWN,
                        color:          0xaaff44,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateEmpMines2(),
                    });
                    break;

                // SPEED_2 is a pure passive — handled after _spawnUpgradeTerminals; no terminal.

                default:
                    break;
            }
            if (term) this.terminals.push(term);
        }
    }

    _setupDrone(cfg = CONFIG.TERMINALS.DRONE) {
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

        // First activation: random time within FIRST_SHOT_MAX, then fixed cooldown loop.
        const firstDelay = Math.random() * cfg.FIRST_SHOT_MAX;
        this._droneTimer = this.time.delayedCall(firstDelay, () => {
            this._droneFire();
            this._droneTimer = this.time.addEvent({
                delay:    cfg.COOLDOWN,
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

    _activateSlowField(
        mult     = CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER,
        duration = CONFIG.TERMINALS.SLOW.DURATION,
    ) {
        if (this.slowFieldActive) return;
        this.slowFieldActive = true;
        this.soundSynth.play('slowActivate');

        for (const enemy of this.enemies) {
            if (!enemy.active || enemy._dying) continue;
            enemy._origSpeed = enemy._origSpeed || enemy.speed;
            enemy.speed = enemy._origSpeed * mult;
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

        this.time.delayedCall(duration, () => {
            this.slowFieldActive = false;

            // Stop tick, fade out overlay
            if (this.slowTickTimer) { this.slowTickTimer.remove(false); this.slowTickTimer = null; }
            if (this.slowOverlay) {
                this.tweens.add({
                    targets: this.slowOverlay, alpha: 0, duration: 500,
                    onComplete: () => { this.slowOverlay?.destroy(); this.slowOverlay = null; },
                });
            }

            for (const enemy of this.enemies) {
                if (!enemy.active) continue;
                if (enemy._origSpeed !== undefined) {
                    enemy.speed = enemy._origSpeed;
                    delete enemy._origSpeed;
                }
            }
        });
    }

    _activateDecoy() {
        // Destroy any existing decoy first
        if (this.decoy && this.decoy.active) this.decoy._expire();

        // Pick a random position in the arena, away from center and edges
        const angle = Math.random() * Math.PI * 2;
        const dist  = 180 + Math.random() * 180; // 180–360 px from center
        const dx    = Math.cos(angle) * dist;
        const dy    = Math.sin(angle) * dist;
        const x     = Phaser.Math.Clamp(640 + dx, 80, 1200);
        const y     = Phaser.Math.Clamp(360 + dy, 80, 640);

        this.decoy = new Decoy(this, x, y);
        this.soundSynth.play('slowActivate'); // reuse a sci-fi activation sound
    }

    _activateEmpMines() {
        // Cancel any previous spawner still running
        if (this._empSpawnTimer) { this._empSpawnTimer.remove(false); this._empSpawnTimer = null; }

        const spawnMine = () => {
            const angle = Math.random() * Math.PI * 2;
            const dist  = 120 + Math.random() * 230; // 120–350 px from center
            const x = Phaser.Math.Clamp(640 + Math.cos(angle) * dist, 60, 1220);
            const y = Phaser.Math.Clamp(360 + Math.sin(angle) * dist, 60, 660);
            this.mines.push(new EmpMine(this, x, y));
        };

        spawnMine(); // first mine immediately

        let spawned = 1;
        const maxMines = Math.floor(CONFIG.TERMINALS.EMP.ACTIVE_DURATION / CONFIG.TERMINALS.EMP.SPAWN_INTERVAL);
        this._empSpawnTimer = this.time.addEvent({
            delay:    CONFIG.TERMINALS.EMP.SPAWN_INTERVAL,
            loop:     true,
            callback: () => {
                spawnMine();
                spawned++;
                if (spawned >= maxMines) {
                    this._empSpawnTimer.remove(false);
                    this._empSpawnTimer = null;
                }
            },
        });
    }

    _activateDecoy2() {
        if (this.decoy && this.decoy.active) this.decoy._expire();

        const angle = Math.random() * Math.PI * 2;
        const dist  = 180 + Math.random() * 180;
        const dx    = Math.cos(angle) * dist;
        const dy    = Math.sin(angle) * dist;
        const px    = Phaser.Math.Clamp(640 + dx, 80, 1200);
        const py    = Phaser.Math.Clamp(360 + dy, 80, 640);

        this.decoy = new Decoy(this, px, py);
        // Override duration to Tier II and make the decoy invulnerable
        this.decoy._expireTimer.remove(false);
        this.decoy._expireTimer = this.time.delayedCall(
            CONFIG.TERMINALS.DECOY_2.DURATION, () => this.decoy?._expire());
        this.decoy.takeDamage = () => {};  // invulnerable — ignore alien hits
        this.soundSynth.play('slowActivate');
    }

    _activateEmpMines2() {
        if (this._empSpawnTimer) { this._empSpawnTimer.remove(false); this._empSpawnTimer = null; }

        const spawnPair = () => {
            const angle = Math.random() * Math.PI * 2;
            const dist  = 120 + Math.random() * 230;
            // Two mines on opposite sides of the station along the same axis
            for (const sign of [1, -1]) {
                const mx = Phaser.Math.Clamp(640 + Math.cos(angle) * dist * sign, 60, 1220);
                const my = Phaser.Math.Clamp(360 + Math.sin(angle) * dist * sign, 60, 660);
                const mine = new EmpMine(this, mx, my);
                mine.blastRadius = CONFIG.TERMINALS.EMP_2.BLAST_RADIUS;
                this.mines.push(mine);
            }
        };

        spawnPair(); // first pair immediately

        let spawned = 1;
        const maxSpawns = Math.floor(CONFIG.TERMINALS.EMP_2.ACTIVE_DURATION / CONFIG.TERMINALS.EMP_2.SPAWN_INTERVAL);
        this._empSpawnTimer = this.time.addEvent({
            delay:    CONFIG.TERMINALS.EMP_2.SPAWN_INTERVAL,
            loop:     true,
            callback: () => {
                spawnPair();
                spawned++;
                if (spawned >= maxSpawns) {
                    this._empSpawnTimer.remove(false);
                    this._empSpawnTimer = null;
                }
            },
        });
    }

    /**
     * Detonate a mine: deal CONFIG.EMP.MINE_DAMAGE to every alien within
     * BLAST_RADIUS, bypassing shields. Shows an EMP ring + flash visual.
     */
    _empExplode(mine) {
        const { x, y } = mine;
        const blastRadius = mine.blastRadius ?? CONFIG.EMP.BLAST_RADIUS;
        mine.destroy();

        this.soundSynth.play('explosion');

        // Expanding EMP ring
        const ring = this.add.circle(x, y, 8, 0x00ff88, 0).setDepth(70);
        ring.setStrokeStyle(3, 0x00ff88, 0.95);
        this.tweens.add({
            targets: ring,
            scaleX:  blastRadius / 8,
            scaleY:  blastRadius / 8,
            alpha:   0,
            duration: 500, ease: 'Power2.easeOut',
            onComplete: () => ring.destroy(),
        });

        // Central flash
        const flash = this.add.circle(x, y, 24, 0x00ff88, 0.8).setDepth(71);
        this.tweens.add({
            targets: flash, alpha: 0, scaleX: 2.5, scaleY: 2.5,
            duration: 280, onComplete: () => flash.destroy(),
        });

        // Damage all enemies in blast radius — shields are bypassed
        for (const enemy of this.enemies) {
            if (!enemy.active || enemy._dying) continue;
            const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
            if (dist >= blastRadius) continue;

            // Green hit flash on each affected enemy
            const bx = enemy.x, by = enemy.y;
            const hitFlash = this.add.arc(bx, by, enemy.radius, 0, 360, false, 0x00ff88, 0.75).setDepth(58);
            this.tweens.add({ targets: hitFlash, alpha: 0, duration: 240, onComplete: () => hitFlash.destroy() });
            this.tweens.add({ targets: enemy, x: bx + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });

            const isBomber = enemy.alienType === 'bomber';
            const died = enemy.takeDamageRaw(CONFIG.EMP.MINE_DAMAGE); // bypasses shield override
            if (died) {
                this.score++;
                this.hud.updateScore(this.score);
                enemy._dying = true;
                this._handleEnemyKilled(enemy, bx, by, isBomber);
            }
        }

        this._handleEmpBossCheck(x, y, blastRadius);
    }

    _startHack() {
        if (!this.stationPowered) return; // station offline — need battery first
        if (this.activeHack)      return; // already hacking — prevent double-activation
        this.snail.hackingActive = true;
        this.snail.setState('HACKING');

        // ── Wave 10: world-specific boss hack (e.g. Frogger in FrogWorldScene) ──
        if (this.wave === 10 && this._tryWave10Hack()) return;

        // ── Waves 1–9: typing / math / helicopter rotation ────────────────────
        const remaining   = this.hackThreshold - this.hackProgress;
        const MinigameCls = this._hackMode === 'math'       ? MathMinigame
                          : this._hackMode === 'helicopter' ? HelicopterMinigame
                          :                                   HackMinigame;
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

    /**
     * Fire a hitscan laser from the station toward (tx, ty).
     * Hits every alien along the ray (within HIT_RADIUS px) in one instant shot.
     */
    _fireLaser(tx, ty) {
        // LASER_2: snap aim to the nearest alien within SNAP_RADIUS of the cursor
        if (this._laser2) {
            let nearest = null, nearestDist = CONFIG.LASER_2.SNAP_RADIUS;
            for (const e of this.enemies) {
                if (!e.active || e._dying || e.shielded) continue;
                const d = Phaser.Math.Distance.Between(tx, ty, e.x, e.y);
                if (d < nearestDist) { nearest = e; nearestDist = d; }
            }
            if (nearest) { tx = nearest.x; ty = nearest.y; }
        }

        const sx  = this.station.x;
        const sy  = this.station.y;
        const angle = Phaser.Math.Angle.Between(sx, sy, tx, ty);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Find where the ray exits the screen
        let tMax = 9999;
        if (cos > 0)  tMax = Math.min(tMax, (1280 - sx) / cos);
        else if (cos < 0) tMax = Math.min(tMax, -sx / cos);
        if (sin > 0)  tMax = Math.min(tMax, (720 - sy) / sin);
        else if (sin < 0) tMax = Math.min(tMax, -sy / sin);

        // Hit aliens along the ray, front-to-back.
        // A shielded alien or one that survives the hit blocks the beam.
        // Only dead aliens let the laser pass through.
        const HIT_RADIUS = 18;
        const hitSet = new Set();  // track hits for ricochet to avoid re-targeting
        let ricochetOriginX = sx, ricochetOriginY = sy, ricochetBestAlong = 0;

        // Collect candidates sorted nearest-first so blocking works correctly
        const candidates = [];
        for (const enemy of this.enemies) {
            if (!enemy.active || enemy._dying) continue;
            const rx = enemy.x - sx;
            const ry = enemy.y - sy;
            const along = rx * cos + ry * sin;
            if (along <= 0 || along > tMax) continue;
            if (Math.abs(rx * sin - ry * cos) > HIT_RADIUS) continue;
            candidates.push({ enemy, along });
        }

        // Add Python body/tail segment candidates.
        // Body segments deflect the beam; red tail segments deal damage.
        for (const enemy of this.enemies) {
            if (!enemy.active || enemy._dying) continue;
            for (const seg of (enemy._bodyHitboxes || [])) {
                const rx = seg.x - sx, ry = seg.y - sy;
                const along = rx * cos + ry * sin;
                if (along <= 0 || along > tMax) continue;
                if (Math.abs(rx * sin - ry * cos) > HIT_RADIUS + seg.r) continue;
                candidates.push({ enemy, along, _pythonSeg: 'body', _seg: seg });
            }
            for (const seg of (enemy._tailHitboxes || [])) {
                const rx = seg.x - sx, ry = seg.y - sy;
                const along = rx * cos + ry * sin;
                if (along <= 0 || along > tMax) continue;
                if (Math.abs(rx * sin - ry * cos) > HIT_RADIUS + seg.r) continue;
                candidates.push({ enemy, along, _pythonSeg: 'tail', _seg: seg });
            }
        }

        candidates.sort((a, b) => a.along - b.along);

        let laserEnd = tMax;  // beam travels to screen edge unless blocked
        for (const { enemy, along, _pythonSeg, _seg } of candidates) {
            if (along > laserEnd) break;  // beam already blocked by an earlier entry

            const bx = _seg ? _seg.x : enemy.x;
            const by = _seg ? _seg.y : enemy.y;

            // ── Python non-red body segment: deflect beam, no damage ──
            if (_pythonSeg === 'body') {
                laserEnd = along;
                const spark = this.add.arc(bx, by, 5, 0, 360, false, 0xaaff44, 0.85).setDepth(58);
                this.tweens.add({ targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 180, onComplete: () => spark.destroy() });
                break;
            }

            // ── Python red (tail) segment: deal damage same as head hit ──
            if (_pythonSeg === 'tail') {
                hitSet.add(enemy);
                if (along > ricochetBestAlong) {
                    ricochetBestAlong = along;
                    ricochetOriginX = bx;
                    ricochetOriginY = by;
                }
                const hitFlash = this.add.arc(bx, by, _seg.r, 0, 360, false, 0xff2222, 0.75).setDepth(58);
                this.tweens.add({ targets: hitFlash, alpha: 0, duration: 200, onComplete: () => hitFlash.destroy() });
                this.tweens.add({ targets: enemy, x: enemy.x + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });
                const died = enemy.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                if (died) {
                    this.score++;
                    this.hud.updateScore(this.score);
                    enemy._dying = true;
                    if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                        this.healthDrops.push(new HealthDrop(this, bx, by));
                    }
                    spawnSnakeDeathAnimation(this, enemy);
                } else if (!this._laser2) {
                    laserEnd = along;
                    break;
                }
                continue;
            }

            if (enemy.shielded) {
                enemy.flashShield?.();
                this.soundSynth.play('shieldReflect');
                laserEnd = along;  // shield stops the beam here
                break;
            }

            hitSet.add(enemy);
            if (along > ricochetBestAlong) {
                ricochetBestAlong = along;
                ricochetOriginX = bx;
                ricochetOriginY = by;
            }

            // Hit flash + wobble (same as projectile hit)
            const hitFlash = this.add.arc(bx, by, enemy.radius, 0, 360, false, 0xff2222, 0.75).setDepth(58);
            this.tweens.add({ targets: hitFlash, alpha: 0, duration: 200, onComplete: () => hitFlash.destroy() });
            this.tweens.add({ targets: enemy, x: enemy.x + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });

            const isBomber = enemy.alienType === 'bomber';
            const died = enemy.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
            if (died) {
                this.score++;
                this.hud.updateScore(this.score);
                enemy._dying = true;
                if (SNAKE_TYPES.has(enemy.alienType)) {
                    if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                        this.healthDrops.push(new HealthDrop(this, bx, by));
                    }
                    spawnSnakeDeathAnimation(this, enemy);
                } else {
                    this.time.delayedCall(200, () => {
                        if (!enemy.active) return;
                        spawnDeathBurst(this, bx, by, BURST_COLORS[enemy.alienType] || 0xffffff,
                            () => this.spawnFrogEscape(bx, by));
                        if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                            this.healthDrops.push(new HealthDrop(this, bx, by));
                        }
                        if (isBomber) checkBomberBlast(this, bx, by);
                        enemy.destroy();
                    });
                }
                // Beam continues through enemies that die
            } else if (!this._laser2) {
                laserEnd = along;  // surviving enemy blocks the beam (Laser II passes through)
                break;
            }
        }

        // Destroy any acid globs the beam passes through
        if (this.acidGlobs) {
            for (let gi = this.acidGlobs.length - 1; gi >= 0; gi--) {
                const glob = this.acidGlobs[gi];
                if (!glob.active) continue;
                const rx = glob.x - sx;
                const ry = glob.y - sy;
                const along = rx * cos + ry * sin;
                if (along <= 0 || along > laserEnd) continue;
                if (Math.abs(rx * sin - ry * cos) > glob.radius + HIT_RADIUS) continue;
                glob.destroy();
                this.acidGlobs.splice(gi, 1);
                // Small pop effect
                const pop = this.add.arc(glob.x, glob.y, 10, 0, 360, false, 0x99ee00, 0.7).setDepth(55);
                this.tweens.add({ targets: pop, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 180, onComplete: () => pop.destroy() });
            }
        }

        // Laser ricochet — fires from the farthest hit alien toward a new target
        if (this.ricochetEnabled && hitSet.size > 0) {
            this._fireLaserRicochet(ricochetOriginX, ricochetOriginY, 0, hitSet);
        }

        laserEnd = this._handleLaserBossChecks(sx, sy, cos, sin, laserEnd, HIT_RADIUS) ?? laserEnd;

        const ex = sx + cos * laserEnd;
        const ey = sy + sin * laserEnd;

        // Laser beam visual — outer glow + inner beam + bright core, quick fade
        const gfx = this.add.graphics().setDepth(200);
        gfx.lineStyle(10, 0xff2200, 0.2);
        gfx.lineBetween(sx, sy, ex, ey);
        gfx.lineStyle(3, 0xff6644, 0.9);
        gfx.lineBetween(sx, sy, ex, ey);
        gfx.lineStyle(1, 0xffffff, 1);
        gfx.lineBetween(sx, sy, ex, ey);
        this.tweens.add({ targets: gfx, alpha: 0, duration: 150, onComplete: () => gfx.destroy() });
    }

    /**
     * Recursive laser ricochet chain.
     * Fires a secondary hitscan arc from (fromX, fromY) to the nearest valid
     * alien not already in hitSet. Chains with halving probability.
     */
    _fireLaserRicochet(fromX, fromY, bounces, hitSet) {
        const chance = CONFIG.RICOCHET.BASE_CHANCE * (this._ricochetFalloff ** bounces);
        if (Math.random() > chance) return;

        // Find nearest valid alien not already hit, within search radius
        let nearest = null;
        let nearestDist = this._ricochetSearchRadius;
        for (const e of this.enemies) {
            if (!e.active || e._dying || e.shielded || hitSet.has(e)) continue;
            const d = Phaser.Math.Distance.Between(fromX, fromY, e.x, e.y);
            if (d < nearestDist) { nearest = e; nearestDist = d; }
        }
        if (!nearest) return;

        hitSet.add(nearest);
        const tx = nearest.x, ty = nearest.y;

        // Cyan ricochet beam visual
        const gfx = this.add.graphics().setDepth(200);
        gfx.lineStyle(8, 0x44ffff, 0.15);
        gfx.lineBetween(fromX, fromY, tx, ty);
        gfx.lineStyle(2, 0x88ffff, 0.85);
        gfx.lineBetween(fromX, fromY, tx, ty);
        gfx.lineStyle(1, 0xffffff, 0.9);
        gfx.lineBetween(fromX, fromY, tx, ty);
        this.tweens.add({ targets: gfx, alpha: 0, duration: 200, onComplete: () => gfx.destroy() });

        // Cyan hit flash + wobble
        const hitFlash = this.add.arc(tx, ty, nearest.radius, 0, 360, false, 0x44ffff, 0.75).setDepth(58);
        this.tweens.add({ targets: hitFlash, alpha: 0, duration: 200, onComplete: () => hitFlash.destroy() });
        this.tweens.add({ targets: nearest, x: nearest.x + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });

        const isBomber = nearest.alienType === 'bomber';
        const bx = nearest.x, by = nearest.y;
        const died = nearest.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
        if (died) {
            this.score++;
            this.hud.updateScore(this.score);
            nearest._dying = true;
            this._handleEnemyKilled(nearest, bx, by, isBomber);
        }

        // Chain to next ricochet
        this._fireLaserRicochet(tx, ty, bounces + 1, hitSet);
    }

    /** Called when hackProgress hits a POWER_LOSS_WORDS multiple. */
    _triggerPowerLoss() {
        if (!this.stationPowered) return; // already offline
        this.stationPowered = false;
        if (this.activeHack) this.activeHack.cancel();

        this.station.setPowered(false);
        this.soundSynth.play('powerLoss');

        // Advance hack minigame rotation: typing → math → helicopter → typing → …
        this._hackMode = this._hackMode === 'typing'     ? 'math'
                       : this._hackMode === 'math'       ? 'helicopter'
                       :                                   'typing';

        // ── Delivery ship animation ───────────────────────────────────────────
        // Pick a drop point around the station, then enter from off-screen in
        // the same radial direction so the approach looks intentional.
        const angle = Math.random() * Math.PI * 2;
        const dropX = 640 + Math.cos(angle) * CONFIG.BATTERY.SPAWN_RADIUS;
        const dropY = 360 + Math.sin(angle) * CONFIG.BATTERY.SPAWN_RADIUS;

        // 800 px from screen center guarantees off-screen in any direction
        const entryX = 640 + Math.cos(angle) * 800;
        const entryY = 360 + Math.sin(angle) * 800;

        const ship = new EscapeShip(this, entryX, entryY, { skipIntro: true });
        const batteryShipSound = this.soundSynth.playLooped('ship');

        // Phase 1 — fly in to drop position
        this.tweens.add({
            targets:  ship,
            x:        dropX,
            y:        dropY,
            duration: 380,
            ease:     'Sine.easeInOut',
            onComplete: () => {
                if (!ship.active) return;

                // Phase 2 — drop the battery (scale pop-in for visual flair)
                this.battery = new Battery(this, dropX, dropY);
                this.battery.setScale(0);
                this.tweens.add({
                    targets: this.battery, scaleX: 1, scaleY: 1,
                    duration: 200, ease: 'Back.easeOut',
                });

                // Phase 3 — brief hover, then fly back off-screen
                this.time.delayedCall(280, () => {
                    if (!ship.active) return;
                    this.tweens.add({
                        targets:  ship,
                        x:        entryX,
                        y:        entryY,
                        duration: 350,
                        ease:     'Sine.easeIn',
                        onComplete: () => {
                            batteryShipSound?.stop();
                            ship._rimTween?.stop();
                            ship.destroy();
                        },
                    });
                });
            },
        });

        this.logDebug('Station lost power! Delivery ship inbound.');
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

    // ── Wave end / escape phase ───────────────────────────────────────────────

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
        this._escapeShipSound = this.soundSynth.playLooped('ship');

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

        const dropInSound = this.soundSynth.playLooped('ship');

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
                            dropInSound?.stop();
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

        // Stop enemy spawning and clear remaining enemies

        if (this.waveManager) this.waveManager.active = false;
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            const burstColor = { basic: 0xdd3333, fast: 0xaa44ff, tank: 0x7799aa, bomber: 0xff7722 }[enemy.alienType] || 0xffffff;
            spawnDeathBurst(this, enemy.x, enemy.y, burstColor);
            enemy.destroy();
        }
        this.enemies = [];

        this._clearWorldEntities();

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
                this._escapeShipSound?.stop(); this._escapeShipSound = null;
                this.snail.setVisible(false);
                this._showWaveCompleteSplash();
            },
        });
    }

    _showWaveCompleteSplash() {
        this.soundSynth.play('waveComplete');
        const wave = this.waveManager.wave;
        if (this.waveManager.isLastWave) {
            this.scene.start('VictoryScene', { wave, score: this.score, world: this.world });
        } else {
            this.scene.start('IntermissionScene', {
                wave,
                score:       this.score,
                snailHealth: this.snail.health,
                upgrades:    this.upgradesList,
                world:       this.world,
            });
        }
    }

    _openPause() {
        if (this.scene.isActive('PauseScene')) return;
        this.grabSystem.onPause();
        this.scene.launch('PauseScene', { callerKey: this.scene.key });
        this.scene.pause();
    }

    // ── Snail / world obstacle collision ─────────────────────────────────────

    /**
     * Push the snail out of any overlapping world obstacles (station, terminals, props).
     * Skipped entirely while the snail is being dragged by P2's grab hand.
     * Called after snail.update() every frame; runs up to 4 resolution passes so the
     * snail is always pushed clear even when wedged between two obstacles.
     */
    _resolveSnailCollisions() {
        if (this.snail.state === 'GRABBED') return;

        const snailR = CONFIG.PROPS.SNAIL_RADIUS;

        // Collect all circular obstacles for this frame
        const obstacles = [];
        obstacles.push({ x: this.station.x, y: this.station.y, r: this.station.radius });
        for (const term of this.terminals) {
            if (term.active) obstacles.push({ x: term.x, y: term.y, r: CONFIG.PROPS.TERMINAL_RADIUS });
        }
        for (const prop of this._propImages) {
            if (prop.active) obstacles.push({ x: prop.x, y: prop.y, r: prop._colRadius });
        }

        // Iterative push-out — repeated passes handle the snail wedged between two objects
        for (let iter = 0; iter < 4; iter++) {
            let anyOverlap = false;
            for (const obs of obstacles) {
                const dx = this.snail.x - obs.x;
                const dy = this.snail.y - obs.y;
                const distSq = dx * dx + dy * dy;
                const minDist = snailR + obs.r;
                if (distSq < minDist * minDist) {
                    anyOverlap = true;
                    const dist = Math.sqrt(distSq);
                    if (dist < 0.001) {
                        // Exactly on top — nudge right to break the tie
                        this.snail.x += minDist;
                    } else {
                        const push = minDist - dist;
                        this.snail.x += (dx / dist) * push;
                        this.snail.y += (dy / dist) * push;
                    }
                }
            }
            if (!anyOverlap) break;
        }

        // Re-clamp to screen bounds after any push
        const margin = 24;
        this.snail.x = Phaser.Math.Clamp(this.snail.x, margin, 1280 - margin);
        this.snail.y = Phaser.Math.Clamp(this.snail.y, margin, 720 - margin);

        this._resolveWorldSpecificCollisions();
    }


    /** No-op in base — overridden by FrogWorldScene to schedule sporadic ribbet sounds. */
    _startRibbetTimer() { }

    /** Returns the sound name to play on enemy spawn. Override per world. */
    _spawnSoundName() { return 'frogSpawn'; }

    /** No-op in base — overridden by FrogWorldScene to spawn decorative escape frogs. */
    spawnFrogEscape(_x, _y) { }

    // ── Enemy spawning ─────────────────────────────────────────────────────────

    /**
     * Spawn a formation of enemies from a random screen edge.
     *
     * Each member's world position is computed from:
     *   worldPos = anchor + member.perp * right + member.depth * forward
     *
     * where `forward` points from the edge toward the station center and
     * `right` is perpendicular (right-hand side as facing the station).
     *
     * Members are spawned with `formation.stagger` ms between each one,
     * in array order (front-of-formation members first).
     */
    _spawnFormation(formation) {
        // Pick a random edge: 0=top, 1=left, 2=right
        const edge = Phaser.Math.Between(0, 2);

        // Anchor point and edge basis vectors
        // A 200 px margin keeps the widest formations (max perp ≈160 px) fully on screen.
        let anchor, forward, right;
        if (edge === 0) {
            // Top edge
            anchor  = { x: Phaser.Math.Between(200, 1080), y: -20 };
            forward = { x: 0,  y:  1 };
            right   = { x: 1,  y:  0 };
        } else if (edge === 1) {
            // Left edge
            anchor  = { x: -20, y: Phaser.Math.Between(200, 520) };
            forward = { x:  1,  y:  0 };
            right   = { x:  0,  y:  1 };
        } else {
            // Right edge
            anchor  = { x: 1300, y: Phaser.Math.Between(200, 520) };
            forward = { x: -1,  y:  0 };
            right   = { x:  0,  y: -1 };
        }

        // Play a single warning sound for the whole formation
        this.soundSynth?.play('frogSpawn');

        // Stagger each member spawn
        formation.members.forEach((member, i) => {
            const delay = i * formation.stagger;
            this.time.delayedCall(delay, () => {
                if (!this.waveManager?.active) return;
                const wx = anchor.x + member.perp * right.x + member.depth * forward.x;
                const wy = anchor.y + member.perp * right.y + member.depth * forward.y;
                this.spawnEnemy(member.type, wx, wy);
            });
        });
    }

    _randomEdgePosition() {
        const maxY = this._spawnMaxY();
        const edge = Phaser.Math.Between(0, 2);
        if (edge === 0) return { x: Phaser.Math.Between(50, 1230), y: -20 };
        if (edge === 1) return { x: -20,  y: Phaser.Math.Between(50, maxY) };
        return           { x: 1300, y: Phaser.Math.Between(50, maxY) };
    }

    spawnEnemy(type = 'basic', spawnX, spawnY) {
        if (!this._canSpawnEnemyType(type)) return;

        const pos = (spawnX !== undefined)
            ? { x: spawnX, y: spawnY }
            : this._randomEdgePosition();
        const { x, y } = pos;
        let enemy;
        switch (type) {
            case 'fast':   enemy = new FastFrog(this, x, y);   break;
            case 'tank':   enemy = new TankFrog(this, x, y);   break;
            case 'bomber': enemy = new BomberFrog(this, x, y); break;
            case 'shield': enemy = new ShieldFrog(this, x, y); break;
            default:
                enemy = this._createWorldSpecificEnemy(type, x, y) ?? new BasicFrog(this, x, y);
        }
        if (this.slowFieldActive) {
            enemy._origSpeed = enemy.speed;
            enemy.speed = enemy.speed * CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER;
        }
        this.enemies.push(enemy);

        // Spawn sound: always for the first alien of a wave, 30% chance after
        if (!this._waveFirstAlienSpawned) {
            this._waveFirstAlienSpawned = true;
            this.soundSynth.play(this._spawnSoundName());
        } else if (Math.random() < 0.3) {
            this.soundSynth.play(this._spawnSoundName());
        }

    }

    // ── Main update loop ──────────────────────────────────────────────────────

    update(time, delta) {
        this.grabSystem.update(delta);
        this.hud.updateGrab(this.grabSystem.statusText, this.grabSystem.statusColor);
        if (!this.boardingShip) this.snail.update(time, delta);
        this._resolveSnailCollisions();
        this.slimeTrail.update(this.snail, delta);

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

        // Cancel the station hack if the snail wanders out of proximity range
        if (this.activeHack) {
            const hackDist = Phaser.Math.Distance.Between(
                this.station.x, this.station.y, this.snail.x, this.snail.y);
            if (hackDist > CONFIG.TERMINALS.PROXIMITY + this.station.radius) {
                this._cancelHack();
            }
        }

        // Gun tracking — rotate gun to face the current cursor position
        const ptr = this.input.activePointer;
        this.station.updateGunAngle(ptr.x, ptr.y);

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

        // Y-sort: snail, station, and terminals share the same depth layer.
        // Depth = y / 100 so objects lower on screen render in front.
        this.snail.setDepth(this.snail.y / 100);
        this.station.setDepth(this.station.y / 100);
        for (const terminal of this.terminals) {
            terminal.setDepth(terminal.y / 100);
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

        // EMP mines — check alien contact and trigger explosions
        if (this.mines.length > 0) {
            const surviving = [];
            for (const mine of this.mines) {
                if (!mine.active) continue;
                if (mine.state !== 'ground') { surviving.push(mine); continue; }

                let triggered = false;
                const triggerR = mine.blastRadius ?? CONFIG.EMP.BLAST_RADIUS;
                for (const enemy of this.enemies) {
                    if (!enemy.active || enemy._dying) continue;
                    const d = Phaser.Math.Distance.Between(mine.x, mine.y, enemy.x, enemy.y);
                    if (d < triggerR) { triggered = true; break; }
                }
                if (!triggered) triggered = this._checkBossForMineTrigger(mine, triggerR);

                if (triggered) {
                    this._empExplode(mine); // mine.destroy() called inside
                } else {
                    surviving.push(mine);
                }
            }
            this.mines = surviving;
        }

        // Enemies — move and check contact with snail or decoy
        this.enemies = this.enemies.filter(enemy => {
            if (!enemy.active || enemy._dying) return false;

            // Shield bounce: move away from snail for 3 s, then resume normal behaviour
            if (enemy._bounceUntil) {
                if (time < enemy._bounceUntil) {
                    const dt = delta / 1000;
                    enemy.x += enemy._bounceVx * dt;
                    enemy.y += enemy._bounceVy * dt;
                    // Keep body segments in sync during bounce
                    enemy._pushHistory?.(time);
                    enemy._updateSegmentPositions?.() ?? enemy._updateSegments?.();
                    return true;
                }
                delete enemy._bounceUntil;
                delete enemy._bounceVx;
                delete enemy._bounceVy;
            }

            const status = enemy.update(time, delta);

            if (status === 'reached_decoy') {
                // Deal damage first (Decoy II's takeDamage is a no-op — it's invulnerable)
                const dx = this.decoy ? this.decoy.x : enemy.x;
                const dy = this.decoy ? this.decoy.y : enemy.y;
                if (this.decoy && this.decoy.active) {
                    this.decoy.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.soundSynth.play('shieldReflect');
                }
                // Bounce away from the decoy for 3 s, then resume targeting normally
                const bounceAngle = Phaser.Math.Angle.Between(dx, dy, enemy.x, enemy.y);
                const bounceSpeed = enemy.speed * 2;
                enemy._bounceVx    = Math.cos(bounceAngle) * bounceSpeed;
                enemy._bounceVy    = Math.sin(bounceAngle) * bounceSpeed;
                enemy._bounceUntil = time + 3000;
                return true;
            }

            if (status === 'reached_snail' && !this.boardingShip) {
                const isBomber = enemy.alienType === 'bomber';
                const bx = enemy.x, by = enemy.y;
                const burstColor = BURST_COLORS[enemy.alienType] || 0xff4444;

                if (isBomber) {
                    enemy.destroy();
                    checkBomberBlast(this, bx, by);
                    return false;
                } else if (this.snail.shielded) {
                    this.soundSynth.play('shieldReflect');
                    if (this._shieldLethal) {
                        // Kill Shield (Tier II) — destroy the enemy on contact
                        enemy.destroy();
                        spawnDeathBurst(this, bx, by, burstColor,
                            () => this.spawnFrogEscape(bx, by));
                        return false;
                    }
                    // Standard shield — bounce the enemy away for 3 s
                    const bounceAngle = Phaser.Math.Angle.Between(
                        this.snail.x, this.snail.y, bx, by);
                    const bounceSpeed = enemy.speed * 2;
                    enemy._bounceVx   = Math.cos(bounceAngle) * bounceSpeed;
                    enemy._bounceVy   = Math.sin(bounceAngle) * bounceSpeed;
                    enemy._bounceUntil = time + 3000;
                    return true;
                } else {
                    const staysAlive = this._handleEnemySnailContact(enemy, bx, by, time);
                    const died = this.snail.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                    this.soundSynth.play('damage');
                    this._applyContactEffect();
                    if (died) {
                        if (this.waveManager) this.waveManager.active = false;
                        if (this.activeHack)  { this.activeHack.cancel(); this.activeHack = null; }
                        this.scene.start('GameOverScene', { wave: this.wave, score: this.score, world: this.world });
                        return false;
                    }
                    return staysAlive;
                }
            }
            return true;
        });

        // Collision checks (projectile vs alien)
        checkProjectileCollisions(this);

        this._updateWorldSpecific(time, delta);

        // Health drop pickups (+ gravitation when Health Boost II is owned)
        this.healthDrops = this.healthDrops.filter(drop => {
            if (!drop.active) return false;
            if (this._healthDropGravitate) drop.gravitate(this.snail.x, this.snail.y, delta);
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
        this.enemies     = this.enemies.filter(e => e.active && !e._dying);
        this.healthDrops = this.healthDrops.filter(d => d.active);
    }

    logDebug(message) {
        console.log(`[GameScene] ${message}`);
    }

    // ── World-specific hooks — override in subclasses ─────────────────────────

    /**
     * Called at wave start to spawn world-specific entities (e.g. bushes in World 2).
     * @param {number} bushCount - from wave config (ignored in World 1)
     */
    _spawnWorldEntities(_bushCount) { }

    /**
     * Called when a non-boss enemy is lethally hit. Handles death VFX,
     * health drop chance, bomber chain, and enemy.destroy().
     * Override in SnakeWorldScene to route snakes through spawnSnakeDeathAnimation.
     */
    _handleEnemyKilled(enemy, bx, by, isBomber = false) {
        const burstColor = BURST_COLORS[enemy.alienType] || 0xffffff;
        this.time.delayedCall(200, () => {
            if (!enemy.active) return;
            spawnDeathBurst(this, bx, by, burstColor, () => this.spawnFrogEscape(bx, by));
            if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                this.healthDrops.push(new HealthDrop(this, bx, by));
            }
            if (isBomber) checkBomberBlast(this, bx, by);
            enemy.destroy();
        });
    }

    /**
     * Called when an enemy reaches the snail (not bomber, not shielded).
     * Returns true if the enemy should stay alive (snake bounce), false if destroyed.
     * Override in SnakeWorldScene to implement snake bounce behaviour.
     */
    _handleEnemySnailContact(enemy, _bx, _by, _time) {
        enemy.destroy();
        return false;
    }

    /**
     * Called after snail takes damage from enemy contact.
     * Override in SnakeWorldScene to apply venom.
     */
    _applyContactEffect() { }

    /**
     * Called once per frame for world-specific update logic (acid globs, puddles).
     * Override in SnakeWorldScene.
     */
    _updateWorldSpecific(_time, _delta) { }

    /**
     * Called in _resolveSnailCollisions for world-specific obstacle checks.
     * Override in SnakeWorldScene to flush hiding snakes from bushes on contact.
     */
    _resolveWorldSpecificCollisions() { }

    /**
     * Called in _boardEscapeShip to destroy world-specific entities.
     * Override in SnakeWorldScene.
     */
    _clearWorldEntities() { }

    /**
     * Called at the end of _bossDeath with the boss's final position.
     * Override in FrogWorldScene to spawn a guaranteed decorative frog.
     */
    _onBossDeathFx(_bx, _by) { }

    /**
     * Called by spawnEnemy before creating an enemy to enforce world-specific caps.
     * Return false to cancel the spawn. Override in SnakeWorldScene.
     */
    _canSpawnEnemyType(_type) { return true; }

    /**
     * Called by spawnEnemy for unknown type strings (snake types in World 2).
     * Return the constructed enemy, or null to fall back to BasicFrog.
     * Override in SnakeWorldScene.
     */
    _createWorldSpecificEnemy(_type, _x, _y) { return null; }

    /**
     * Called when wave === 10 and the snail activates the station hack.
     * Override in FrogWorldScene to launch the Frogger boss-shield minigame.
     * Return true to signal that the wave-10 hack was handled (suppresses the
     * normal typing/math path); return false to fall through to the base logic.
     */
    _tryWave10Hack() { return false; }

    /**
     * Called after drop-in completes on wave 10 to spawn the world boss.
     * Override in FrogWorldScene.
     */
    _spawnBoss() { }

    /**
     * Called when the boss takes lethal damage.
     * Override in FrogWorldScene to run the boss death sequence.
     */
    _bossDeath() { }

    /**
     * Called by _handleEmpBlast after damaging normal enemies.
     * Override in FrogWorldScene to also damage the boss.
     */
    _handleEmpBossCheck(_x, _y, _blastRadius) { }

    /**
     * Called by _fireLaser after the enemy sweep.
     * Override in FrogWorldScene to check laser vs boss and boss projectiles.
     */
    _handleLaserBossChecks(_sx, _sy, _cos, _sin, _laserEnd, _hitRadius) { return _laserEnd; }

    /**
     * Called during mine proximity check; return true if the boss is close enough
     * to trigger the mine. Override in FrogWorldScene.
     */
    _checkBossForMineTrigger(_mine, _triggerR) { return false; }

    /**
     * Returns the maximum Y for side-edge enemy spawns.
     * Override in FrogWorldScene to clamp wave-10 spawns above the Frogger lane.
     */
    _spawnMaxY() { return 670; }
}
