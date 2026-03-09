import { CONFIG } from '../config.js';
import SoundSynth from '../systems/SoundSynth.js';
import { SOUND_OVERRIDES } from '../soundOverrides.js';

const FLAVOR_TEXT = {
    1: ['Not bad for a snail.', 'Gerald flexes his antenna.', 'They keep coming.'],
    2: ['The swarm thickens.', 'No time for slime trails.', 'The station creaks.'],
    3: ['The station holds... for now.', 'Gerald catches his breath.', 'Systems nominal. Barely.'],
    4: ['Four down. Six to go.', 'The aliens are regrouping.', 'Gerald checks his shell for dents.'],
    5: ['Halfway there.', 'The hum of the station steadies you.', 'Push through.'],
    6: ['Halfway through the assault.', 'The aliens are adapting.', 'More systems failing.'],
    7: ['Three waves left.', 'The air smells of burnt circuits.', 'Gerald will not yield.'],
    8: ['Almost there.', 'The station is barely holding.', 'One more push.'],
    9: ['One final wave.', 'Gerald knows what must be done.', 'The last stand approaches.'],
};

// Passive upgrades apply instantly on selection — no terminal is spawned.
const PASSIVE_UPGRADES = new Set(['HEALTH_BOOST', 'AMMO_BOOST', 'LASER', 'SPEED_BOOST']);

// All upgrade types that can be offered.
const UPGRADE_POOL = [
    'CANNON', 'SHIELD', 'SLOWFIELD', 'REPAIR', 'DRONE',
    'HEALTH_BOOST', 'AMMO_BOOST', 'LASER', 'SPEED_BOOST',
];

function getUpgradeDefs() {
    const cannonSecs = Math.round(CONFIG.CANNON.ACTIVE_DURATION / 1000);
    const shieldSecs = Math.round(CONFIG.TERMINALS.SHIELD_DURATION / 1000);
    const slowSecs   = Math.round(CONFIG.TERMINALS.SLOW_DURATION / 1000);
    const slowPct    = Math.round(CONFIG.DAMAGE.SLOW_SPEED_MULTIPLIER * 100);
    const repairHp   = CONFIG.TERMINALS.REPAIR_HEAL;
    const droneFirstSecs = Math.round(CONFIG.TERMINALS.DRONE_FIRST_SHOT_MAX / 1000);
    const droneCoolSecs  = Math.round(CONFIG.TERMINALS.DRONE_COOLDOWN / 1000);
    return {
        CANNON:       { label: 'AUTO TURRET',    color: 0xff8844, desc: `Hack to unleash an\nauto-targeting cannon\nfor ${cannonSecs}s.` },
        SHIELD:       { label: 'FORCE SHIELD',   color: 0x4488ff, desc: `Hack to project a shield\nthat blocks alien damage\nfor ${shieldSecs}s.` },
        SLOWFIELD:    { label: 'SLOW FIELD',     color: 0xaa44ff, desc: `Hack to slow all aliens\nto ${slowPct}% speed\nfor ${slowSecs}s.` },
        REPAIR:       { label: 'REPAIR KIT',     color: 0x44ff88, desc: `Hack to restore\n+${repairHp} HP to Gerald's shell.` },
        DRONE:        { label: 'AUTO DRONE',     color: 0xffdd44, desc: `Drone fires within ${droneFirstSecs}s\nof each round, then every\n${droneCoolSecs}s after.` },
        HEALTH_BOOST: { label: 'HEALTH BOOST',   color: 0xff6666, desc: `Gerald's max health\nincreases by 50%.` },
        AMMO_BOOST:   { label: 'AMMO BOOST',     color: 0xffcc44, desc: `Gun capacity increases\nby 50% more bullets\nbefore reload.` },
        LASER:        { label: 'HITSCAN LASER',  color: 0xff3333, desc: `Replaces bullets with\na piercing laser beam\nthat hits all enemies.` },
        SPEED_BOOST:  { label: 'SPEED BOOST',    color: 0x44ffdd, desc: `Gerald moves\nat double speed.` },
    };
}

export default class IntermissionScene extends Phaser.Scene {
    constructor() {
        super('IntermissionScene');
    }

    init(data = {}) {
        this.wave        = data.wave        || 1;
        this.score       = data.score       || 0;
        // Accept snailHealth (new) or stationHealth (legacy) — default to max
        this.snailHealth = data.snailHealth !== undefined ? data.snailHealth
                         : data.stationHealth !== undefined ? data.stationHealth
                         : CONFIG.SNAIL.MAX_HEALTH;
        this.upgrades       = data.upgrades    || [];
        this._advanced      = false;
        this.countdownTimer = null;
        // Pre-game setup mode: pick upgrades before starting at a later wave
        this._startupMode = data._startupMode || false;
        this._targetWave  = data._targetWave  || 1;
    }

    create() {
        this.soundSynth = new SoundSynth(SOUND_OVERRIDES);
        const cx           = 640;

        // In startup mode: if we've already collected all needed upgrades, go straight to game.
        if (this._startupMode && this.upgrades.length >= this._targetWave - 1) {
            this._advance();
            return;
        }

        const healedHealth = Math.min(CONFIG.SNAIL.MAX_HEALTH, this.snailHealth + CONFIG.INTERMISSION.HEAL_AMOUNT);
        const nextWave     = this.wave + 1;
        const flavors      = FLAVOR_TEXT[this.wave] || ['The fight continues.', 'Rest while you can.'];

        // Background
        this.add.rectangle(640, 360, 1280, 720, 0x000008, 1);
        for (let i = 0; i < 120; i++) {
            const sx = Phaser.Math.Between(0, 1280);
            const sy = Phaser.Math.Between(0, 720);
            const sz = Phaser.Math.FloatBetween(0.5, 1.5);
            this.add.circle(sx, sy, sz, 0xffffff, Phaser.Math.FloatBetween(0.2, 0.6));
        }

        if (this._startupMode) {
            // Pre-game upgrade selection — always show upgrade picker
            const available = UPGRADE_POOL.filter(t => !this.upgrades.some(u => u.type === t));
            this._buildStartupUpgradeLayout(cx, available);
            return;
        }

        // Determine available upgrades and whether this is an upgrade selection wave.
        const available     = UPGRADE_POOL.filter(t => !this.upgrades.some(u => u.type === t));
        const isUpgradeWave = available.length > 0;

        if (isUpgradeWave) {
            this._buildUpgradeLayout(cx, healedHealth, flavors, available);
        } else {
            this._buildNormalLayout(cx, healedHealth, nextWave, flavors);
        }
    }

    // ── Pre-game startup upgrade selection ────────────────────────────────────

    _buildStartupUpgradeLayout(cx, available) {
        const pickNum  = this.upgrades.length + 1;
        const pickTotal = this._targetWave - 1;

        // Header
        this.add.rectangle(cx, 78, 700, 2, 0x00ffcc, 0.4);
        this.add.text(cx, 52, `— STARTING AT WAVE ${this._targetWave} —`, {
            fontSize: '26px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5);
        this.add.rectangle(cx, 84, 700, 2, 0x00ffcc, 0.4);

        this.add.text(cx, 115, `PRE-GAME SETUP — UPGRADE ${pickNum} of ${pickTotal}`, {
            fontSize: '15px', fontFamily: 'monospace', color: '#776688',
        }).setOrigin(0.5);

        // Progress dots
        const dotSpacing = 18;
        const dotsStartX = cx - (pickTotal - 1) * dotSpacing / 2;
        for (let i = 0; i < pickTotal; i++) {
            const filled = i < this.upgrades.length;
            const color  = filled ? 0xaa44ff : 0x334455;
            this.add.circle(dotsStartX + i * dotSpacing, 143, 5, color, filled ? 1 : 0.6);
        }

        // Upgrade section header
        this.add.rectangle(cx, 180, 700, 1, 0xaa44ff, 0.4);
        this.add.text(cx, 205, 'CHOOSE STARTING UPGRADE', {
            fontSize: '24px', fontFamily: 'monospace', color: '#cc88ff',
        }).setOrigin(0.5);

        const offered = Phaser.Utils.Array.Shuffle(available.slice())
            .slice(0, CONFIG.UPGRADES.CARDS_OFFERED);
        this._showUpgradeCards(offered, cx, 390);
    }

    // ── Normal (non-upgrade) layout ───────────────────────────────────────────

    _buildNormalLayout(cx, healedHealth, nextWave, flavors) {
        // Title
        this.add.rectangle(cx, 130, 700, 2, 0xffdd44, 0.4);
        this.add.text(cx, 100, `— WAVE ${this.wave} HACKED —`, {
            fontSize: '30px', fontFamily: 'monospace', color: '#ffdd44',
        }).setOrigin(0.5);
        this.add.rectangle(cx, 160, 700, 2, 0xffdd44, 0.4);

        // Flavor text
        this.add.text(cx, 210, `"${Phaser.Utils.Array.GetRandom(flavors)}"`, {
            fontSize: '17px', fontFamily: 'monospace', color: '#999988', fontStyle: 'italic',
        }).setOrigin(0.5);

        // Score
        this.add.text(cx, 280, `SCORE: ${this.score}`, {
            fontSize: '26px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5);

        // Snail heal
        const gained    = healedHealth - this.snailHealth;
        const healColor = gained > 0 ? '#44ff88' : '#666666';
        const healMsg   = gained > 0
            ? `GERALD PATCHED UP  +${gained} HP  [ ${healedHealth} / ${CONFIG.SNAIL.MAX_HEALTH} ]`
            : 'GERALD AT FULL HEALTH';
        this.add.text(cx, 330, healMsg, {
            fontSize: '14px', fontFamily: 'monospace', color: healColor,
        }).setOrigin(0.5);

        // Next wave
        this.add.text(cx, 400, `NEXT: WAVE ${nextWave}`, {
            fontSize: '22px', fontFamily: 'monospace', color: '#88ccff',
        }).setOrigin(0.5);

        // Skip prompt + countdown
        this.add.text(cx, 490, '[ PRESS ANY KEY TO CONTINUE ]', {
            fontSize: '13px', fontFamily: 'monospace', color: '#445566',
        }).setOrigin(0.5);

        this.remaining     = CONFIG.INTERMISSION.AUTO_ADVANCE_SECS;
        this.countdownText = this.add.text(cx, 515, '', {
            fontSize: '12px', fontFamily: 'monospace', color: '#334455',
        }).setOrigin(0.5);
        this._updateCountdown();

        this.countdownTimer = this.time.addEvent({
            delay:  1000,
            repeat: CONFIG.INTERMISSION.AUTO_ADVANCE_SECS - 1,
            callback: () => {
                this.remaining--;
                this._updateCountdown();
                if (this.remaining <= 0) this._advance();
            },
        });

        this.input.keyboard.once('keydown', () => this._advance());
    }

    // ── Upgrade-selection layout ───────────────────────────────────────────────

    _buildUpgradeLayout(cx, healedHealth, flavors, available) {
        // Compact title
        this.add.rectangle(cx, 78, 700, 2, 0xffdd44, 0.4);
        this.add.text(cx, 52, `— WAVE ${this.wave} HACKED —`, {
            fontSize: '26px', fontFamily: 'monospace', color: '#ffdd44',
        }).setOrigin(0.5);
        this.add.rectangle(cx, 84, 700, 2, 0xffdd44, 0.4);

        // Flavor text
        this.add.text(cx, 112, `"${Phaser.Utils.Array.GetRandom(flavors)}"`, {
            fontSize: '14px', fontFamily: 'monospace', color: '#999988', fontStyle: 'italic',
        }).setOrigin(0.5);

        // Score + heal (compact, same row)
        const gained  = healedHealth - this.snailHealth;
        const healStr = gained > 0 ? `  +${gained} HP` : '  FULL HP';
        this.add.text(cx, 145, `SCORE: ${this.score}   |   GERALD${healStr}`, {
            fontSize: '14px', fontFamily: 'monospace', color: '#aaaaaa',
        }).setOrigin(0.5);

        // Upgrade section header
        this.add.rectangle(cx, 180, 700, 1, 0xaa44ff, 0.4);
        this.add.text(cx, 205, 'UPGRADE AVAILABLE', {
            fontSize: '24px', fontFamily: 'monospace', color: '#cc88ff',
        }).setOrigin(0.5);
        this.add.text(cx, 238, 'Choose an upgrade for the next wave:', {
            fontSize: '13px', fontFamily: 'monospace', color: '#776688',
        }).setOrigin(0.5);

        // Shuffle and limit to CARDS_OFFERED
        const offered = Phaser.Utils.Array.Shuffle(available.slice())
            .slice(0, CONFIG.UPGRADES.CARDS_OFFERED);

        this._showUpgradeCards(offered, cx, 390);
    }

    _showUpgradeCards(types, cx, cardY) {
        const cardW = 220;
        const cardH = 160;
        const gap   = 40;
        const total = types.length * cardW + (types.length - 1) * gap;
        const startX = cx - total / 2 + cardW / 2;

        let selected = false;
        const cards  = [];

        // Key listener (1/2/3)
        const keyListener = (event) => {
            if (selected) return;
            const idx = parseInt(event.key, 10) - 1;
            if (idx >= 0 && idx < cards.length) cards[idx].select();
        };
        this.input.keyboard.on('keydown', keyListener);

        const UPGRADE_DEFS = getUpgradeDefs();
        types.forEach((type, i) => {
            const def = UPGRADE_DEFS[type];
            const x   = startX + i * (cardW + gap);
            const colorHex = '#' + def.color.toString(16).padStart(6, '0');

            // Draw card background + border
            const gfx = this.add.graphics();
            const drawCard = (hover = false) => {
                gfx.clear();
                gfx.fillStyle(0x0d150d, 1);
                gfx.fillRoundedRect(x - cardW / 2, cardY - cardH / 2, cardW, cardH, 8);
                gfx.lineStyle(hover ? 3 : 2, def.color, hover ? 1.0 : 0.7);
                gfx.strokeRoundedRect(x - cardW / 2, cardY - cardH / 2, cardW, cardH, 8);
                // Color accent stripe at top
                gfx.fillStyle(def.color, 0.22);
                gfx.fillRect(x - cardW / 2 + 1, cardY - cardH / 2 + 1, cardW - 2, 30);
            };
            drawCard();

            // Label (inside accent stripe)
            this.add.text(x, cardY - cardH / 2 + 16, def.label, {
                fontSize: '12px', fontFamily: 'monospace', color: colorHex, fontStyle: 'bold',
            }).setOrigin(0.5);

            // Passive badge (shown just below accent stripe for passive upgrades)
            if (PASSIVE_UPGRADES.has(type)) {
                this.add.text(x, cardY - cardH / 2 + 40, '— PASSIVE —', {
                    fontSize: '9px', fontFamily: 'monospace', color: '#557755',
                }).setOrigin(0.5);
            }

            // Description
            this.add.text(x, cardY + 12, def.desc, {
                fontSize: '12px', fontFamily: 'monospace', color: '#aaaaaa', align: 'center',
                wordWrap: { width: cardW - 24 },
            }).setOrigin(0.5);

            // Key-number hint at bottom
            this.add.text(x, cardY + cardH / 2 - 18, `[ ${i + 1} ]`, {
                fontSize: '13px', fontFamily: 'monospace', color: '#ffdd44',
            }).setOrigin(0.5);

            // Interactive hit zone
            const zone = this.add.zone(x, cardY, cardW, cardH).setInteractive();
            zone.on('pointerover', () => { if (!selected) drawCard(true); });
            zone.on('pointerout',  () => { if (!selected) drawCard(false); });

            const select = () => {
                if (selected) return;
                selected = true;
                this.input.keyboard.off('keydown', keyListener);
                this.soundSynth.play('upgradeSelect');

                // Flash selected card bright, dim others
                drawCard(true);
                cards.forEach(c => { if (c !== cards[i]) c.gfx.setAlpha(0.3); });

                // Find a safe angle and record the upgrade
                const angle = this._findSafeUpgradeAngle();
                this.upgrades = [...this.upgrades, { type, angle }];

                // Brief pause, then advance
                this.time.delayedCall(550, () => this._advance());
            };

            zone.on('pointerdown', select);
            cards.push({ gfx, select });
        });

        // Prompt below the cards
        this.add.text(cx, cardY + cardH / 2 + 28, 'CLICK  OR  PRESS  1 / 2 / 3  TO SELECT', {
            fontSize: '13px', fontFamily: 'monospace', color: '#445566',
        }).setOrigin(0.5);
    }

    _findSafeUpgradeAngle() {
        const r      = CONFIG.UPGRADES.ORBIT_RADIUS;
        const minSep = CONFIG.UPGRADES.MIN_SEPARATION;
        let angle, attempts = 0;
        do {
            angle = Math.random() * Math.PI * 2;
            const safe = this.upgrades.every(u => {
                if (u.type === 'DRONE' || PASSIVE_UPGRADES.has(u.type)) return true; // no physical terminal
                const dx = r * (Math.cos(angle) - Math.cos(u.angle));
                const dy = r * (Math.sin(angle) - Math.sin(u.angle));
                return Math.sqrt(dx * dx + dy * dy) >= minSep;
            });
            if (safe) break;
            attempts++;
        } while (attempts < 100);
        return angle;
    }

    // ── Shared ────────────────────────────────────────────────────────────────

    _updateCountdown() {
        if (this.countdownText) {
            this.countdownText.setText(`Continuing in ${this.remaining}s...`);
        }
    }

    _advance() {
        if (this._advanced) return;
        this._advanced = true;
        if (this.countdownTimer) this.countdownTimer.remove(false);

        if (this._startupMode) {
            if (this.upgrades.length < this._targetWave - 1) {
                // Need more upgrades — loop back
                this.scene.start('IntermissionScene', {
                    wave: 0, score: 0, upgrades: this.upgrades,
                    _startupMode: true, _targetWave: this._targetWave,
                });
            } else {
                // All upgrades chosen — start at the target wave with full health
                this.scene.start('GameScene', {
                    wave:        this._targetWave,
                    score:       0,
                    snailHealth: CONFIG.SNAIL.MAX_HEALTH,
                    upgrades:    this.upgrades,
                });
            }
            return;
        }

        this.scene.start('GameScene', {
            wave:        this.wave + 1,
            score:       this.score,
            snailHealth: Math.min(CONFIG.SNAIL.MAX_HEALTH, this.snailHealth + CONFIG.INTERMISSION.HEAL_AMOUNT),
            upgrades:    this.upgrades,
        });
    }
}
