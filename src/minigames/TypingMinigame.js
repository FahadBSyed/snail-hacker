const PHRASES = [
    'FIREWALL', 'ENCRYPT', 'DECRYPT', 'BYPASS',
    'OVERRIDE', 'KERNEL', 'REBOOT', 'COMPILE',
    'EXECUTE', 'BUFFER', 'PROXY', 'ACCESS',
];

import { CONFIG } from '../config.js';

export default class TypingMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {string}   [opts.phrase] — override phrase (random if omitted)
     * @param {function} opts.onSuccess
     * @param {function} opts.onFailure
     */
    constructor(scene, opts) {
        this.scene      = scene;
        this.onSuccess  = opts.onSuccess;
        this.onFailure  = opts.onFailure;
        this.cancelled  = false;
        this.pointer    = 0;

        this.phrase    = opts.phrase || Phaser.Utils.Array.GetRandom(PHRASES);
        this.timeLimit = this.phrase.length * CONFIG.MINIGAMES.TYPING_MS_PER_CHAR;

        this._createUI();

        // Brief grace period — prevents the E keypress that opened this terminal
        // from being captured, and gives the player a moment to read the phrase.
        scene.time.delayedCall(300, () => {
            if (this.cancelled) return;
            this.startTime  = scene.time.now;
            this.timerEvent = scene.time.addEvent({ delay: 50, loop: true, callback: () => this._tick() });
            this.keyHandler = (e) => this._handleKey(e);
            scene.input.keyboard.on('keydown', this.keyHandler);
        });
    }

    _createUI() {
        const cx = 640;
        const cy = 625;
        const n  = this.phrase.length;
        const panelW = Math.max(280, n * 26 + 48);

        this.container = this.scene.add.container(cx, cy).setDepth(200);

        // Panel
        this.panel = this.scene.add.rectangle(0, 0, panelW, 88, 0x001122, 0.93)
            .setStrokeStyle(2, 0x44aaff, 0.85);
        this.container.add(this.panel);

        // Title
        this.container.add(this.scene.add.text(0, -33, 'TYPE TO HACK', {
            fontSize: '11px', fontFamily: 'monospace', color: '#44aaff',
        }).setOrigin(0.5));

        // Timer bar
        const barW = panelW - 28;
        this.timerBg   = this.scene.add.rectangle(0, 32, barW, 5, 0x333344).setOrigin(0.5);
        this.timerFill = this.scene.add.rectangle(-barW / 2, 32, barW, 5, 0x44aaff).setOrigin(0, 0.5);
        this.container.add(this.timerBg);
        this.container.add(this.timerFill);
        this._timerBarW = barW;

        // Word group — only the characters and cursor wobble, not the whole panel
        this._wordGroup = this.scene.add.container(0, 0);
        this.container.add(this._wordGroup);

        // Character display
        this.charTexts = [];
        const charSpacing = 26;
        const startX = -(n - 1) * charSpacing / 2;
        for (let i = 0; i < n; i++) {
            const ch = this.scene.add.text(startX + i * charSpacing, -3, this.phrase[i], {
                fontSize: '22px', fontFamily: 'monospace', color: '#777788',
            }).setOrigin(0.5);
            this.charTexts.push(ch);
            this._wordGroup.add(ch);
        }

        // Cursor underline under the next char to type
        this.cursor = this.scene.add.rectangle(startX, 12, 20, 2, 0xffffff, 0.9).setOrigin(0.5);
        this._wordGroup.add(this.cursor);
        this._startX = startX;
        this._charSpacing = charSpacing;
    }

    _tick() {
        if (this.cancelled) return;
        const elapsed = this.scene.time.now - this.startTime;
        const pct = Math.max(0, 1 - elapsed / this.timeLimit);
        this.timerFill.width = this._timerBarW * pct;

        if (pct < 0.3)       this.timerFill.fillColor = 0xff4444;
        else if (pct < 0.6)  this.timerFill.fillColor = 0xffdd44;

        if (elapsed >= this.timeLimit) this._finish(false);
    }

    _handleKey(event) {
        if (this.cancelled) return;
        const key = event.key.toUpperCase();
        if (key.length !== 1 || key < 'A' || key > 'Z') return;

        const expected = this.phrase[this.pointer];
        if (key === expected) {
            this.charTexts[this.pointer].setColor('#44ff44');
            this.pointer++;
            // Advance cursor
            if (this.pointer < this.phrase.length) {
                this.cursor.x = this._startX + this.pointer * this._charSpacing;
            }
            this._wobble(false);
            if (this.pointer >= this.phrase.length) this._finish(true);
        } else {
            // Flash current char red, then back to default
            this.scene.soundSynth?.play('error');
            const cur = this.charTexts[this.pointer];
            cur.setColor('#ff4444');
            this.scene.time.delayedCall(160, () => {
                if (!this.cancelled) cur.setColor('#777788');
            });
            this._wobble(true);
        }
    }

    _wobble(violent) {
        if (this._wobbleTween) this._wobbleTween.stop();
        this._wordGroup.y = 0;
        const amp = violent ? 10 : 3;
        const dur  = violent ? 40 : 60;
        const reps = violent ? 5  : 1;
        this._wobbleTween = this.scene.tweens.add({
            targets:  this._wordGroup,
            y:        amp,
            duration: dur,
            yoyo:     true,
            repeat:   reps,
            ease:     'Sine.easeInOut',
            onComplete: () => { if (this._wordGroup?.active) this._wordGroup.y = 0; },
        });
    }

    _finish(success) {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (success) this.onSuccess(); else this.onFailure();
    }

    cancel() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
    }

    _cleanup() {
        if (this.keyHandler) this.scene.input.keyboard.off('keydown', this.keyHandler);
        if (this.timerEvent) this.timerEvent.remove(false);
        if (this.container)  this.container.destroy();
    }
}
