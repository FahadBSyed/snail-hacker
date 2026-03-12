import { CONFIG } from '../config.js';
import Snail from '../entities/Snail.js';
import Projectile from '../entities/Projectile.js';
import BasicAlien from '../entities/aliens/BasicAlien.js';
import FastAlien from '../entities/aliens/FastAlien.js';
import TankAlien from '../entities/aliens/TankAlien.js';
import BomberAlien from '../entities/aliens/BomberAlien.js';
import ShieldAlien from '../entities/aliens/ShieldAlien.js';
import BossAlien from '../entities/aliens/BossAlien.js';
import BossProjectile from '../entities/BossProjectile.js';
import HackingStation from '../entities/HackingStation.js';
import GrabHandSystem from '../systems/GrabHandSystem.js';
import SlimeTrail from '../systems/SlimeTrail.js';
import Terminal from '../entities/Terminal.js';
import DefenseStation from '../entities/DefenseStation.js';
import HackMinigame from '../minigames/HackMinigame.js';
import FroggerMinigame from '../minigames/FroggerMinigame.js';
import MathMinigame from '../minigames/MathMinigame.js';
import RhythmMinigame from '../minigames/RhythmMinigame.js';
import HelicopterMinigame from '../minigames/HelicopterMinigame.js';
import Battery from '../entities/Battery.js';
import HealthDrop from '../entities/HealthDrop.js';
import FrogEscape from '../entities/FrogEscape.js'; // decorative escape frogs
import WaveManager from '../systems/WaveManager.js';
import EscapeShip from '../entities/EscapeShip.js';
import Decoy from '../entities/Decoy.js';
import EmpMine from '../entities/EmpMine.js';
import HUD from './HUD.js';
import { spawnDeathBurst, checkBomberBlast, checkProjectileCollisions, BURST_COLORS } from '../systems/CollisionSystem.js';
import { PROP_PALETTES } from '../data/propPalettes.js';

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

        const svgSize = { width: 48, height: 48 };
        // Snail directional sprites
        this.load.svg('snail-right', 'assets/sprites/snail/snail-right.svg', svgSize);
        this.load.svg('snail-left',  'assets/sprites/snail/snail-left.svg',  svgSize);
        this.load.svg('snail-up',    'assets/sprites/snail/snail-up.svg',    svgSize);
        this.load.svg('snail-down',  'assets/sprites/snail/snail-down.svg',  svgSize);
        // Walk, idle and damage animation frames
        for (const dir of ['right', 'left', 'up', 'down']) {
            for (let i = 0; i < 6; i++) {
                const f = `f${String(i).padStart(2, '0')}`;
                this.load.svg(`snail-walk-${dir}-${f}`, `assets/sprites/snail/snail-walk-${dir}-${f}.svg`, svgSize);
            }
            for (let i = 0; i < 12; i++) {
                const f = `f${String(i).padStart(2, '0')}`;
                this.load.svg(`snail-idle-${dir}-${f}`, `assets/sprites/snail/snail-idle-${dir}-${f}.svg`, svgSize);
            }
            for (let i = 0; i <= 15; i++) {
                const f = `f${String(i).padStart(2, '0')}`;
                this.load.svg(`snail-hit-${dir}-${f}`, `assets/sprites/snail/snail-hit-${dir}-${f}.svg`, svgSize);
            }
        }
        // On-foot frog sprites (4 cardinal directions, idle + 4 hop frames each)
        for (const dir of ['right', 'left', 'up', 'down']) {
            this.load.svg(`frog-${dir}`, `assets/sprites/frog/frog-${dir}.svg`, svgSize);
            for (const frame of ['f00', 'f01', 'f02', 'f03']) {
                this.load.svg(`frog-hop-${dir}-${frame}`,
                    `assets/sprites/frog/frog-hop-${dir}-${frame}.svg`, svgSize);
            }
        }

        // Alien sprites — 8 directions each
        const dirs = ['right', 'diag-right-down', 'down', 'diag-left-down',
                      'left',  'diag-left-up',    'up',   'diag-right-up'];
        for (const dir of dirs) {
            this.load.svg(`alien-frog-${dir}`,    `assets/sprites/alien/alien-frog-${dir}.svg`,    svgSize);
            this.load.svg(`alien-fast-${dir}`,    `assets/sprites/alien/alien-fast-${dir}.svg`,    svgSize);
            this.load.svg(`alien-tank-${dir}`,    `assets/sprites/alien/alien-tank-${dir}.svg`,    svgSize);
            this.load.svg(`alien-bomber-${dir}`,  `assets/sprites/alien/alien-bomber-${dir}.svg`,  svgSize);
            this.load.svg(`alien-shield-${dir}`,  `assets/sprites/alien/alien-shield-${dir}.svg`,  svgSize);
            this.load.svg(`alien-boss-${dir}`,    `assets/sprites/alien/alien-boss-${dir}.svg`,    { width: 96, height: 96 });
        }

        // Station + terminal sprites
        if (!this.textures.exists('station-mainframe')) {
            this.load.svg('station-mainframe', 'assets/sprites/station/station-mainframe.svg', { width: 96, height: 96 });
        }
        if (!this.textures.exists('station-gun')) {
            this.load.svg('station-gun', 'assets/sprites/station/station-gun.svg', { width: 48, height: 48 });
        }
        for (const key of ['terminal-reload', 'terminal-turret', 'terminal-shield', 'terminal-slow', 'terminal-repair']) {
            if (!this.textures.exists(key)) {
                this.load.svg(key, `assets/sprites/terminal/${key}.svg`, { width: 64, height: 64 });
            }
        }

        // ── Prop sprites (rocks + mushrooms) — loaded once, tinted per wave ──
        const PROP_SIZES = {
            'prop-rock-0':     { w: 40,  h: 34 },
            'prop-rock-1':     { w: 60,  h: 38 },
            'prop-rock-2':     { w: 46,  h: 56 },
            'prop-mushroom-0': { w: 32,  h: 52 },
            'prop-mushroom-1': { w: 48,  h: 68 },
        };
        for (const [key, sz] of Object.entries(PROP_SIZES)) {
            if (!this.textures.exists(key)) {
                const file = key.replace('prop-', '') + '.svg'; // rock-0.svg etc.
                this.load.svg(key, `assets/sprites/props/${file}`, { width: sz.w, height: sz.h });
            }
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

        // ── Boss ──────────────────────────────────────────────────────────────
        this.boss            = null;
        this.bossProjectiles = [];

        // ── Alien speed multiplier / slow field ───────────────────────────────
        this.alienSpeedMultiplier = 1.0;
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

        this.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
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

        // ── Battery / power state ─────────────────────────────────────────────
        this.battery        = null;   // Battery instance or null
        this.stationPowered = true;

        // ── Grab hand system (Player 2 — right-click to pick up snail or battery) ──
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
        this._rhythmLauncher   = rhythmLauncher;

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
        this.frogEscapes = [];
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
                this._spawnProps(wave);
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
        if (wave === 10) return CONFIG.BOSS.SHIELD_DROP_WORDS;
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
                        type:        'CANNON',
                        getAliens:   () => this.aliens,
                        alienFilter: (a) => !a.shielded,   // ignore shielded aliens
                    });
                    term = new Terminal(this, x, y + 25, {
                        label:          'TURRET',
                        cooldown:       CONFIG.TERMINALS.CANNON.DURATION + CONFIG.TERMINALS.CANNON.COOLDOWN,
                        color:          0xff8844,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => cannon.activate(),
                    });
                    break;
                }
                case 'SHIELD':
                    term = new Terminal(this, x, y, {
                        label:          'SHIELD',
                        cooldown:       CONFIG.TERMINALS.SHIELD.DURATION + CONFIG.TERMINALS.SHIELD.COOLDOWN,
                        color:          0x4488ff,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => { this.soundSynth.play('shieldActivate'); this.snail.shield(CONFIG.TERMINALS.SHIELD.DURATION); },
                    });
                    break;
                case 'SLOWFIELD':
                    term = new Terminal(this, x, y, {
                        label:          'SLOW',
                        cooldown:       CONFIG.TERMINALS.SLOW.DURATION + CONFIG.TERMINALS.SLOW.COOLDOWN,
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
                        cooldown:       CONFIG.TERMINALS.DECOY.COOLDOWN,
                        color:          0xff44cc,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateDecoy(),
                    });
                    break;
                case 'EMP_MINES':
                    term = new Terminal(this, x, y, {
                        label:          'EMP',
                        cooldown:       CONFIG.TERMINALS.EMP.ACTIVE_DURATION + CONFIG.TERMINALS.EMP.COOLDOWN,
                        color:          0x00ff88,
                        launchMinigame: this._rhythmLauncher,
                        onSuccess:      () => this._activateEmpMines(),
                    });
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
        const firstDelay = Math.random() * CONFIG.TERMINALS.DRONE.FIRST_SHOT_MAX;
        this._droneTimer = this.time.delayedCall(firstDelay, () => {
            this._droneFire();
            this._droneTimer = this.time.addEvent({
                delay:    CONFIG.TERMINALS.DRONE.COOLDOWN,
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

        this.time.delayedCall(CONFIG.TERMINALS.SLOW.DURATION, () => {
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

    /**
     * Detonate a mine: deal CONFIG.EMP.MINE_DAMAGE to every alien within
     * BLAST_RADIUS, bypassing shields. Shows an EMP ring + flash visual.
     */
    _empExplode(mine) {
        const { x, y } = mine;
        mine.destroy();

        this.soundSynth.play('explosion');

        // Expanding EMP ring
        const ring = this.add.circle(x, y, 8, 0x00ff88, 0).setDepth(70);
        ring.setStrokeStyle(3, 0x00ff88, 0.95);
        this.tweens.add({
            targets: ring,
            scaleX:  CONFIG.EMP.BLAST_RADIUS / 8,
            scaleY:  CONFIG.EMP.BLAST_RADIUS / 8,
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

        // Damage all aliens in blast radius — shields are bypassed
        for (const alien of this.aliens) {
            if (!alien.active || alien._dying) continue;
            const dist = Phaser.Math.Distance.Between(x, y, alien.x, alien.y);
            if (dist >= CONFIG.EMP.BLAST_RADIUS) continue;

            // Green hit flash on each affected alien
            const bx = alien.x, by = alien.y;
            const hitFlash = this.add.arc(bx, by, alien.radius, 0, 360, false, 0x00ff88, 0.75).setDepth(58);
            this.tweens.add({ targets: hitFlash, alpha: 0, duration: 240, onComplete: () => hitFlash.destroy() });
            this.tweens.add({ targets: alien, x: bx + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });

            const isBomber = alien.alienType === 'bomber';
            const died = alien.takeDamageRaw(CONFIG.EMP.MINE_DAMAGE); // bypasses shield override
            if (died) {
                this.score++;
                this.hud.updateScore(this.score);
                const burstColor = BURST_COLORS[alien.alienType] || 0xffffff;
                alien._dying = true;
                this.time.delayedCall(200, () => {
                    if (!alien.active) return;
                    spawnDeathBurst(this, bx, by, burstColor,
                        () => this.spawnFrogEscape(bx, by));
                    if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                        this.healthDrops.push(new HealthDrop(this, bx, by));
                    }
                    if (isBomber) checkBomberBlast(this, bx, by);
                    alien.destroy();
                });
            }
        }

        // Also damage the boss if in blast radius (boss is not in this.aliens)
        if (this.boss && this.boss.active && !this.boss._dying) {
            const dist = Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y);
            if (dist < CONFIG.EMP.BLAST_RADIUS) {
                const bx = this.boss.x, by = this.boss.y;
                const hitFlash = this.add.arc(bx, by, this.boss.radius, 0, 360, false, 0x00ff88, 0.75).setDepth(58);
                this.tweens.add({ targets: hitFlash, alpha: 0, duration: 240, onComplete: () => hitFlash.destroy() });
                this.tweens.add({ targets: this.boss, x: bx + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });
                const dead = this.boss.takeDamageRaw(CONFIG.EMP.MINE_DAMAGE); // 30% reduction applied in BossAlien.takeDamageRaw
                if (this.hud) this.hud.updateBossBar(this.boss.health);
                if (dead) this._bossDeath();
            }
        }
    }

    _startHack() {
        if (!this.stationPowered) return; // station offline — need battery first
        this.snail.hackingActive = true;
        this.snail.setState('HACKING');

        // ── Wave 10: Frogger minigame breaks boss shield ───────────────────────
        if (this.wave === 10) {
            this.activeHack = new FroggerMinigame(this, {
                pointsNeeded: this.hackThreshold,  // = BOSS.SHIELD_DROP_WORDS (3)
                onCrossing: (count) => {
                    this.hackProgress = count;
                    this.hud.updateHack(this.hackProgress, this.hackThreshold, 'SHIELD');
                    this.station.setHackProgress(this.hackProgress / this.hackThreshold);
                },
                onSuccess: () => {
                    this.activeHack = null;
                    this.snail.hackingActive = false;
                    this.snail.setState('IDLE');
                    // Drop the boss shield; it auto-re-raises after SHIELD_DOWN_DURATION
                    if (this.boss && this.boss.active && !this.boss._dying) {
                        this.boss.dropShield();
                        this.soundSynth.play('shieldReflect');
                        console.log('[boss] shield dropped by Frogger success');
                        this.logDebug('Boss shield broken! Shield down for 5s.');
                        this.time.delayedCall(CONFIG.BOSS.SHIELD_DOWN_DURATION, () => {
                            if (this.boss && this.boss.active && !this.boss._dying) {
                                this.boss.raiseShield();
                                this.logDebug('Boss shield back up.');
                            }
                        });
                    }
                    // Reset progress bar so player can break shield again
                    this.hackProgress = 0;
                    this.hud.updateHack(0, this.hackThreshold, 'SHIELD');
                    this.station.setHackProgress(0);
                },
                onFailure: () => {
                    this.activeHack = null;
                    this.snail.hackingActive = false;
                    this.snail.setState('IDLE');
                },
            });
            return;
        }

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

        const ex = sx + cos * tMax;
        const ey = sy + sin * tMax;

        // Hit all aliens along the ray
        const HIT_RADIUS = 18;
        const hitSet = new Set();  // track hits for ricochet to avoid re-targeting
        let ricochetOriginX = sx, ricochetOriginY = sy, ricochetBestAlong = 0;
        for (const alien of this.aliens) {
            if (!alien.active || alien._dying) continue;
            const rx    = alien.x - sx;
            const ry    = alien.y - sy;
            const along = rx * cos + ry * sin;
            if (along <= 0 || along > tMax) continue;
            const perp = Math.abs(rx * sin - ry * cos);
            if (perp > HIT_RADIUS) continue;

            const bx = alien.x, by = alien.y;

            if (alien.shielded) {
                alien.flashShield?.();
                this.soundSynth.play('shieldReflect');
                continue;
            }

            hitSet.add(alien);
            // Track the farthest hit alien as ricochet origin
            if (along > ricochetBestAlong) {
                ricochetBestAlong = along;
                ricochetOriginX = bx;
                ricochetOriginY = by;
            }

            // Hit flash + wobble (same as projectile hit)
            const hitFlash = this.add.arc(bx, by, alien.radius, 0, 360, false, 0xff2222, 0.75).setDepth(58);
            this.tweens.add({ targets: hitFlash, alpha: 0, duration: 200, onComplete: () => hitFlash.destroy() });
            this.tweens.add({ targets: alien, x: alien.x + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });

            const isBomber = alien.alienType === 'bomber';
            const died = alien.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
            if (died) {
                this.score++;
                this.hud.updateScore(this.score);
                alien._dying = true;
                this.time.delayedCall(200, () => {
                    if (!alien.active) return;
                    spawnDeathBurst(this, bx, by, BURST_COLORS[alien.alienType] || 0xffffff,
                        () => this.spawnFrogEscape(bx, by));
                    if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                        this.healthDrops.push(new HealthDrop(this, bx, by));
                    }
                    if (isBomber) checkBomberBlast(this, bx, by);
                    alien.destroy();
                });
            }
        }

        // Laser ricochet — fires from the farthest hit alien toward a new target
        if (this.ricochetEnabled && hitSet.size > 0) {
            this._fireLaserRicochet(ricochetOriginX, ricochetOriginY, 0, hitSet);
        }

        // Boss hit check (laser mode)
        if (this.boss && this.boss.active && !this.boss._dying) {
            const rx    = this.boss.x - sx;
            const ry    = this.boss.y - sy;
            const along = rx * cos + ry * sin;
            if (along > 0 && along <= tMax) {
                const perp = Math.abs(rx * sin - ry * cos);
                if (perp <= this.boss.radius) {
                    if (this.boss.shielded) {
                        this.boss.flashShield();
                        this.soundSynth.play('shieldReflect');
                    } else {
                        const flash = this.add.arc(this.boss.x, this.boss.y, this.boss.radius, 0, 360, false, 0xff2200, 0.55).setDepth(55);
                        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
                        this.boss.sprite.setAlpha(0.2);
                        this.time.delayedCall(80, () => { if (this.boss?.sprite) this.boss.sprite.setAlpha(1); });
                        const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                        console.log(`[boss] laser hit! hp=${this.boss.health} dead=${dead}`);
                        if (this.hud) this.hud.updateBossBar(this.boss.health);
                        if (dead) this._bossDeath();
                    }
                }
            }
        }

        // Boss projectile (black hole) hit check (laser mode)
        this.bossProjectiles = this.bossProjectiles.filter(bp => {
            if (!bp.active) return false;
            const rx    = bp.x - sx;
            const ry    = bp.y - sy;
            const along = rx * cos + ry * sin;
            if (along <= 0 || along > tMax) return true;
            const perp = Math.abs(rx * sin - ry * cos);
            if (perp > bp.radius + HIT_RADIUS) return true;

            const dead = bp.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
            this.soundSynth?.play('shieldReflect');
            if (dead) {
                spawnDeathBurst(this, bp.x, bp.y, 0x7722cc);
                bp.destroy();
                return false;
            }
            bp.onHit();
            return true;
        });

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
        const chance = CONFIG.RICOCHET.BASE_CHANCE * (CONFIG.RICOCHET.FALLOFF ** bounces);
        if (Math.random() > chance) return;

        // Find nearest valid alien not already hit, within search radius
        let nearest = null;
        let nearestDist = CONFIG.RICOCHET.SEARCH_RADIUS;
        for (const a of this.aliens) {
            if (!a.active || a._dying || a.shielded || hitSet.has(a)) continue;
            const d = Phaser.Math.Distance.Between(fromX, fromY, a.x, a.y);
            if (d < nearestDist) { nearest = a; nearestDist = d; }
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
            this.time.delayedCall(200, () => {
                if (!nearest.active) return;
                spawnDeathBurst(this, bx, by, BURST_COLORS[nearest.alienType] || 0xffffff,
                    () => this.spawnFrogEscape(bx, by));
                if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                    this.healthDrops.push(new HealthDrop(this, bx, by));
                }
                if (isBomber) checkBomberBlast(this, bx, by);
                nearest.destroy();
            });
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

    // ── Boss fight ────────────────────────────────────────────────────────────

    _spawnBoss() {
        const angle = 0; // enter from the right
        const bx = 640 + Math.cos(angle) * CONFIG.BOSS.ORBIT_RADIUS_X;
        const by = 360 + Math.sin(angle) * CONFIG.BOSS.ORBIT_RADIUS_Y;
        this.boss = new BossAlien(this, bx, by, {
            onAlienBurst: (bx, by) => {
                const count  = CONFIG.BOSS.ALIEN_BURST_COUNT;
                const spread = CONFIG.BOSS.ALIEN_BURST_SPREAD;
                // Spread aliens side-by-side perpendicular to the boss→station vector
                const toStation = Phaser.Math.Angle.Between(bx, by, 640, 360);
                const perp      = toStation + Math.PI / 2;
                const halfOff   = (count - 1) / 2;
                for (let i = 0; i < count; i++) {
                    const off = (i - halfOff) * spread;
                    this.spawnAlien('fast', bx + Math.cos(perp) * off, by + Math.sin(perp) * off);
                }
                this.logDebug(`Boss fires alien burst! (${count} FastAliens)`);
            },
            onBlackHole: (bx, by) => {
                this.bossProjectiles.push(new BossProjectile(this, bx, by, 'blackhole'));
                this.logDebug('Boss fires black hole!');
            },
            onEMP: (bx, by) => {
                this.bossProjectiles.push(new BossProjectile(this, bx, by, 'emp', {
                    targetX: this.station.x, targetY: this.station.y,
                }));
                this.logDebug('Boss fires EMP!');
            },
            onTerminalLockEMP: (bx, by) => {
                const eligible = this.terminals.filter(t =>
                    t.active && t.terminalState === 'IDLE' &&
                    t.label !== 'RELOAD' && t.label !== 'REPAIR',
                );
                if (eligible.length === 0) return;
                const target = Phaser.Math.RND.pick(eligible);
                this.bossProjectiles.push(new BossProjectile(this, bx, by, 'terminallock', {
                    targetX: target.x, targetY: target.y, targetTerminal: target,
                }));
                this.logDebug(`Boss fires terminal lock EMP at ${target.label}!`);
            },
        });
        this.hud.showBossBar(this.boss.health, CONFIG.BOSS.HP);
        this.logDebug('The Overlord has arrived!');
    }

    _bossDeath() {
        if (!this.boss || !this.boss.active) return;
        this.boss._dying = true;
        this.boss._phaseShifting = false;

        const bx = this.boss.x;
        const by = this.boss.y;

        // Heavy screen shake
        this.cameras.main.shake(600, 0.02);

        // Three staggered expanding rings
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 150, () => {
                const ring = this.add.arc(bx, by, this.boss ? this.boss.radius : 36, 0, 360, false, 0xff2200, 0).setDepth(60);
                ring.setStrokeStyle(4, 0xff4400, 1);
                this.tweens.add({
                    targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
                    duration: 500, ease: 'Power2.easeOut',
                    onComplete: () => ring.destroy(),
                });
            });
        }

        // Rapid white flash (8 flashes over 800ms)
        const flashTimer = this.time.addEvent({
            delay: 100, repeat: 7,
            callback: () => {
                if (this.boss && this.boss.active) {
                    this.boss.alpha = this.boss.alpha < 0.5 ? 1 : 0.15;
                }
            },
        });

        // Clear any lingering black holes immediately
        for (const bp of this.bossProjectiles) { if (bp.active) bp.destroy(); }
        this.bossProjectiles = [];

        // Final explosion + wave end
        this.time.delayedCall(900, () => {
            if (this.boss && this.boss.active) {
                spawnDeathBurst(this, bx, by, 0xff2200);
                spawnDeathBurst(this, bx, by, 0xff8800);
                this.cameras.main.flash(500, 255, 100, 0);
                this.boss.destroy();
                this.boss = null;
            }
            this.hud.hideBossBar();
            this.score += 50;
            this.hud.updateScore(this.score);
            this._completeWave();
        });
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

        // Stop alien spawning and clear remaining aliens
        
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

    // ── Frog escape (decorative) ───────────────────────────────────────────────

    /**
     * Spawn a decorative escape frog at (x, y) — called by spawnDeathBurst's
     * onComplete once the explosion has fully faded.
     * Capped at 5 concurrent frogs so late-wave kills don't flood the screen.
     */
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
    }

    /** Schedule a sporadic ribbet while aliens are alive; re-schedules itself. */
    _startRibbetTimer() {
        if (this._ribbetTimer) { this._ribbetTimer.remove(false); this._ribbetTimer = null; }
        const scheduleNext = () => {
            const delay = Phaser.Math.Between(3500, 9000);
            this._ribbetTimer = this.time.delayedCall(delay, () => {
                if (this.aliens.some(a => a.active)) {
                    this.soundSynth?.play('alienRibbet');
                }
                scheduleNext();
            });
        };
        scheduleNext();
    }

    spawnFrogEscape(x, y) {
        if (!this.sys.isActive()) return;
        if (Math.random() >= 0.25) return;
        if (this.frogEscapes.filter(f => f.active).length >= 5) return;
        const frog = new FrogEscape(this, x, y);
        this.frogEscapes.push(frog);
        this.soundSynth.play('alienRibbet');
    }

    // ── Alien spawning ─────────────────────────────────────────────────────────

    _randomEdgePosition() {
        // On wave 10 the FroggerMinigame occupies the bottom third (y > 480),
        // so clamp side-edge spawns to the top two-thirds to keep the boss
        // and its projectiles out of that region.
        const maxY = this.wave === 10 ? 460 : 670;
        const edge = Phaser.Math.Between(0, 2);
        if (edge === 0) return { x: Phaser.Math.Between(50, 1230), y: -20 };
        if (edge === 1) return { x: -20,  y: Phaser.Math.Between(50, maxY) };
        return           { x: 1300, y: Phaser.Math.Between(50, maxY) };
    }

    spawnAlien(type = 'basic', spawnX, spawnY) {
        const pos = (spawnX !== undefined)
            ? { x: spawnX, y: spawnY }
            : this._randomEdgePosition();
        const { x, y } = pos;
        let alien;
        switch (type) {
            case 'fast':   alien = new FastAlien(this, x, y);   break;
            case 'tank':   alien = new TankAlien(this, x, y);   break;
            case 'bomber': alien = new BomberAlien(this, x, y); break;
            case 'shield': alien = new ShieldAlien(this, x, y); break;
            default:       alien = new BasicAlien(this, x, y);
        }
        if (this.slowFieldActive) {
            alien._origSpeed = alien.speed;
            alien.speed = alien.speed * CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER;
        }
        this.aliens.push(alien);

        // Spawn sound: always for the first alien of a wave, 30% chance after
        if (!this._waveFirstAlienSpawned) {
            this._waveFirstAlienSpawned = true;
            this.soundSynth.play('alienSpawn');
        } else if (Math.random() < 0.3) {
            this.soundSynth.play('alienSpawn');
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
                const triggerR = CONFIG.EMP.BLAST_RADIUS;
                for (const alien of this.aliens) {
                    if (!alien.active || alien._dying) continue;
                    const d = Phaser.Math.Distance.Between(mine.x, mine.y, alien.x, alien.y);
                    if (d < triggerR) { triggered = true; break; }
                }
                if (!triggered && this.boss && this.boss.active && !this.boss._dying) {
                    const d = Phaser.Math.Distance.Between(mine.x, mine.y, this.boss.x, this.boss.y);
                    if (d < triggerR) triggered = true;
                }

                if (triggered) {
                    this._empExplode(mine); // mine.destroy() called inside
                } else {
                    surviving.push(mine);
                }
            }
            this.mines = surviving;
        }

        // Aliens — move and check contact with snail or decoy
        this.aliens = this.aliens.filter(alien => {
            if (!alien.active || alien._dying) return false;
            const status = alien.update(time, delta);

            if (status === 'reached_decoy') {
                const bx = alien.x, by = alien.y;
                const burstColor = BURST_COLORS[alien.alienType] || 0xff4444;
                alien.destroy();
                spawnDeathBurst(this, bx, by, burstColor,
                    () => this.spawnFrogEscape(bx, by));
                if (this.decoy && this.decoy.active) {
                    this.decoy.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                }
                return false;
            }

            if (status === 'reached_snail' && !this.boardingShip) {
                const isBomber = alien.alienType === 'bomber';
                const bx = alien.x, by = alien.y;
                const burstColor = BURST_COLORS[alien.alienType] || 0xff4444;
                alien.destroy();

                if (isBomber) {
                    checkBomberBlast(this, bx, by);
                } else if (this.snail.shielded) {
                    // Shield absorbs the hit — kill the alien, play shield sound, no damage
                    this.soundSynth.play('shieldReflect');
                    spawnDeathBurst(this, bx, by, burstColor,
                        () => this.spawnFrogEscape(bx, by));
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

        // Boss update + projectile collision (boss is NOT in this.aliens)
        if (this.boss && this.boss.active && !this.boss._dying) {
            this.boss.update(time, delta);

            // Projectile vs boss
            if (this.projectiles.length > 0) {
                console.log(`[boss] checking ${this.projectiles.length} proj vs boss @ (${Math.round(this.boss.x)},${Math.round(this.boss.y)}) shielded=${this.boss.shielded}`);
            }
            this.projectiles = this.projectiles.filter(proj => {
                if (!proj.active) return false;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, this.boss.x, this.boss.y);
                if (dist < this.boss.radius + CONFIG.PLAYER.PROJECTILE_RADIUS) {
                    proj.destroy();
                    if (this.boss.shielded) {
                        this.boss.flashShield();
                        this.soundSynth.play('shieldReflect');
                    } else {
                        // Red hit flash at boss position
                        const flash = this.add.arc(this.boss.x, this.boss.y, this.boss.radius, 0, 360, false, 0xff2200, 0.55).setDepth(55);
                        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
                        // Brief sprite flash (no position tween — orbit code owns boss.x/y)
                        this.boss.sprite.setAlpha(0.2);
                        this.time.delayedCall(80, () => { if (this.boss?.sprite) this.boss.sprite.setAlpha(1); });
                        const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                        console.log(`[boss] hit! hp=${this.boss.health} dead=${dead} shielded=${this.boss.shielded}`);
                        if (this.hud) this.hud.updateBossBar(this.boss.health);
                        if (dead) this._bossDeath();
                    }
                    return false;
                }
                return true;
            });
        }

        // Boss projectiles — update, P2 shots vs black hole, snail contact
        this.bossProjectiles = this.bossProjectiles.filter(bp => {
            if (!bp.active) return false;
            const alive = bp.update(time, delta, this.snail.x, this.snail.y);
            if (!alive) return false;

            // P2 projectile vs black hole
            for (const proj of this.projectiles) {
                if (!proj.active) continue;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, bp.x, bp.y);
                if (dist < bp.radius + CONFIG.PLAYER.PROJECTILE_RADIUS) {
                    proj.destroy();
                    const dead = bp.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                    this.soundSynth?.play('shieldReflect');
                    if (dead) {
                        spawnDeathBurst(this, bp.x, bp.y, 0x7722cc);
                        bp.destroy();
                        return false;
                    }
                    bp.onHit();
                    break;
                }
            }

            // Type-specific contact detection
            if (bp.active) {
                if (bp.projType === 'blackhole') {
                    const snailDist = Phaser.Math.Distance.Between(bp.x, bp.y, this.snail.x, this.snail.y);
                    if (snailDist < bp.radius + 12) {
                        this._warpSnail();
                        spawnDeathBurst(this, bp.x, bp.y, 0x7722cc);
                        bp.destroy();
                        return false;
                    }
                } else if (bp.projType === 'emp') {
                    const stationDist = Phaser.Math.Distance.Between(bp.x, bp.y, this.station.x, this.station.y);
                    if (stationDist < bp.radius + this.station.radius) {
                        this._triggerPowerLoss();
                        spawnDeathBurst(this, bp.x, bp.y, 0xffcc00);
                        bp.destroy();
                        return false;
                    }
                } else if (bp.projType === 'terminallock') {
                    const term = bp._targetTerminal;
                    if (!term || !term.active) { bp.destroy(); return false; }
                    const termDist = Phaser.Math.Distance.Between(bp.x, bp.y, term.x, term.y);
                    if (termDist < bp.radius + 28) {
                        term.forceLock(CONFIG.BOSS.TERMINAL_LOCK_DURATION);
                        spawnDeathBurst(this, bp.x, bp.y, 0xff4422);
                        bp.destroy();
                        return false;
                    }
                }
            }

            return bp.active;
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

        // Frog escapes — update movement and prune destroyed ones
        for (const frog of this.frogEscapes) {
            if (frog.active) frog.update(delta);
        }
        this.frogEscapes = this.frogEscapes.filter(f => f.active);

        // Cleanup
        this.projectiles     = this.projectiles.filter(p => p.active);
        this.aliens          = this.aliens.filter(a => a.active && !a._dying);
        this.healthDrops     = this.healthDrops.filter(d => d.active);
        this.bossProjectiles = this.bossProjectiles.filter(bp => bp.active);
    }

    // ── Black hole warp ───────────────────────────────────────────────────────

    /** Teleport Gerald to a random position far from the station. */
    _warpSnail() {
        // Cancel any active hack — same effect as P2 teleporting the snail
        if (this.activeHack)  { this.activeHack.cancel(); this.activeHack = null; }
        if (this.snail) this.snail.hackingActive = false;

        // Pick a random position at least 260px from station, inside the play area
        const angle = Math.random() * Math.PI * 2;
        const dist  = Phaser.Math.Between(260, 380);
        const wx    = Phaser.Math.Clamp(640 + Math.cos(angle) * dist, 80, 1200);
        const wy    = Phaser.Math.Clamp(360 + Math.sin(angle) * dist, 80, 460);

        // Collapse rings at origin, expand rings at destination
        this._spawnWarpRings(this.snail.x, this.snail.y, true);
        this.snail.x = wx;
        this.snail.y = wy;
        this._spawnWarpRings(wx, wy, false);

        this.soundSynth?.play('teleport');
        this.logDebug(`Black hole warp → (${Math.round(wx)}, ${Math.round(wy)})`);
    }

    /** Three staggered rings: collapse=true shrinks inward, false expands outward. */
    _spawnWarpRings(x, y, collapse) {
        for (let i = 0; i < 3; i++) {
            const r    = 8 + i * 14;
            const ring = this.add.arc(x, y, r, 0, 360, false, 0x0a0011, 0)
                .setStrokeStyle(2, collapse ? 0xbb44ff : 0x7722cc, 0.9).setDepth(62);
            this.tweens.add({
                targets:  ring,
                scaleX:   collapse ? 0.1 : 3.5,
                scaleY:   collapse ? 0.1 : 3.5,
                alpha:    0,
                delay:    i * 55,
                duration: 380,
                ease:     'Power2.easeOut',
                onComplete: () => ring.destroy(),
            });
        }
    }

    logDebug(message) {
        console.log(`[GameScene] ${message}`);
    }
}
