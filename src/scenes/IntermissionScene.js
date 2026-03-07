import { CONFIG } from '../config.js';

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
    }

    create() {
        const cx            = 640;
        const healedHealth  = Math.min(CONFIG.SNAIL.MAX_HEALTH, this.snailHealth + CONFIG.INTERMISSION.HEAL_AMOUNT);
        const nextWave      = this.wave + 1;

        // Background
        this.add.rectangle(640, 360, 1280, 720, 0x000008, 1);

        for (let i = 0; i < 120; i++) {
            const sx = Phaser.Math.Between(0, 1280);
            const sy = Phaser.Math.Between(0, 720);
            const sz = Phaser.Math.FloatBetween(0.5, 1.5);
            this.add.circle(sx, sy, sz, 0xffffff, Phaser.Math.FloatBetween(0.2, 0.6));
        }

        // Title
        this.add.rectangle(cx, 130, 700, 2, 0xffdd44, 0.4);
        this.add.text(cx, 100, `— WAVE ${this.wave} HACKED —`, {
            fontSize: '30px', fontFamily: 'monospace', color: '#ffdd44',
        }).setOrigin(0.5);
        this.add.rectangle(cx, 160, 700, 2, 0xffdd44, 0.4);

        // Flavor text
        const flavors = FLAVOR_TEXT[this.wave] || ['The fight continues.', 'Rest while you can.'];
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
            : `GERALD AT FULL HEALTH`;
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
        this._advanced     = false;
        this.countdownText = this.add.text(cx, 515, '', {
            fontSize: '12px', fontFamily: 'monospace', color: '#334455',
        }).setOrigin(0.5);
        this._updateCountdown();

        this.countdownTimer = this.time.addEvent({
            delay: 1000,
            repeat: CONFIG.INTERMISSION.AUTO_ADVANCE_SECS - 1,
            callback: () => {
                this.remaining--;
                this._updateCountdown();
                if (this.remaining <= 0) this._advance();
            },
        });

        this.input.keyboard.once('keydown', () => this._advance());
    }

    _updateCountdown() {
        this.countdownText.setText(`Continuing in ${this.remaining}s...`);
    }

    _advance() {
        if (this._advanced) return;
        this._advanced = true;
        if (this.countdownTimer) this.countdownTimer.remove(false);
        this.scene.start('GameScene', {
            wave:        this.wave + 1,
            score:       this.score,
            snailHealth: Math.min(CONFIG.SNAIL.MAX_HEALTH, this.snailHealth + CONFIG.INTERMISSION.HEAL_AMOUNT),
        });
    }
}
