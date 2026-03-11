/**
 * HackMinigame — continuous word-typing minigame used to hack the central station.
 *
 * Words are shown one at a time. Each correctly typed word increments the hack
 * progress. Wrong keystrokes flash red and reset the current character (delay
 * only — no penalty to overall score). The minigame ends when wordsRequired
 * words have been completed, or when cancel() is called (ESC / teleport).
 */

const WORD_POOL = [
    // Short (4–5 chars)
    'HACK', 'CODE', 'DATA', 'PING', 'ROOT', 'SUDO', 'NULL', 'BYTE',
    'LOOP', 'FLAG', 'PORT', 'CALL', 'PUSH', 'KILL', 'FORK',
    // Medium (6–7 chars)
    'SHELL', 'PATCH', 'VIRUS', 'CACHE', 'SPAWN', 'FETCH', 'DEBUG',
    'BUFFER', 'PROXY', 'ACCESS', 'SIGNAL', 'MODULE', 'BINARY',
    'PACKET', 'SOCKET', 'DAEMON', 'SCRIPT', 'REBOOT', 'KERNEL',
    // Long (8+ chars)
    'FIREWALL', 'ENCRYPT', 'DECRYPT', 'BYPASS', 'OVERRIDE',
    'COMPILE', 'EXECUTE', 'NETWORK', 'PAYLOAD', 'EXPLOIT',
    'TERMINAL', 'PROTOCOL', 'MATRIX',
];

export default class HackMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {number}   opts.wordsRequired — words needed to complete this hack session
     * @param {function} [opts.onWordComplete] — called with (wordsCompletedSoFar) after each word
     * @param {function} opts.onSuccess — called when all words are typed
     * @param {function} [opts.onCancel]  — called when cancel() is invoked
     */
    constructor(scene, opts) {
        this.scene         = scene;
        this.wordsRequired = opts.wordsRequired || 5;
        this.onWordComplete = opts.onWordComplete || null;
        this.onSuccess     = opts.onSuccess;
        this.onCancel      = opts.onCancel || null;

        this.cancelled       = false;
        this.wordsCompleted  = 0;
        this.pointer         = 0;
        this.phrase          = '';
        this.charTexts       = null;
        this.cursor          = null;

        this._pickNewWord();
        this._createUI();

        // Brief grace period — prevents the E keypress that opened the terminal
        // from being captured immediately.
        scene.time.delayedCall(250, () => {
            if (this.cancelled) return;
            this.keyHandler = (e) => this._handleKey(e);
            scene.input.keyboard.on('keydown', this.keyHandler);
        });
    }

    _pickNewWord() {
        this.phrase  = Phaser.Utils.Array.GetRandom(WORD_POOL);
        this.pointer = 0;
    }

    _createUI() {
        const cx = 640;
        const cy = 610;

        this.container = this.scene.add.container(cx, cy).setDepth(200);

        const panelW = 420;

        // Background panel
        const panel = this.scene.add.rectangle(0, 0, panelW, 110, 0x001122, 0.93)
            .setStrokeStyle(2, 0x00ffcc, 0.85);
        this.container.add(panel);

        // Title
        this.container.add(
            this.scene.add.text(0, -44, '[ HACKING TERMINAL ]', {
                fontSize: '11px', fontFamily: 'monospace', color: '#00ffcc',
            }).setOrigin(0.5),
        );

        // Progress bar (bottom of panel)
        const barW = panelW - 40;
        this.progressBg = this.scene.add.rectangle(0, 37, barW, 7, 0x223333).setOrigin(0.5);
        this.progressFill = this.scene.add.rectangle(-barW / 2, 37, 1, 7, 0x00ffcc).setOrigin(0, 0.5);
        this.progressLabel = this.scene.add.text(0, 48, `0 / ${this.wordsRequired} WORDS`, {
            fontSize: '9px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5);
        this.container.add(this.progressBg);
        this.container.add(this.progressFill);
        this.container.add(this.progressLabel);
        this._progressBarW = barW;

        // Word group — only the characters and cursor wobble, not the whole panel
        this._wordGroup = this.scene.add.container(0, 0);
        this.container.add(this._wordGroup);

        this._buildWordDisplay();
    }

    _buildWordDisplay() {
        // Tear down any previous word display
        if (this.charTexts) {
            this.charTexts.forEach(t => { if (t.active) t.destroy(); });
        }
        if (this.cursor && this.cursor.active) this.cursor.destroy();

        const n           = this.phrase.length;
        const charSpacing = 22;
        const startX      = -(n - 1) * charSpacing / 2;

        this.charTexts = [];
        for (let i = 0; i < n; i++) {
            const ch = this.scene.add.text(startX + i * charSpacing, -6, this.phrase[i], {
                fontSize: '20px', fontFamily: 'monospace', color: '#777788',
            }).setOrigin(0.5);
            this.charTexts.push(ch);
            this._wordGroup.add(ch);
        }

        // Cursor underline beneath the next character to type
        this.cursor = this.scene.add.rectangle(startX, 9, 18, 2, 0x00ffcc, 0.9).setOrigin(0.5);
        this._wordGroup.add(this.cursor);
        this._startX      = startX;
        this._charSpacing = charSpacing;
    }

    _handleKey(event) {
        if (this.cancelled) return;
        const key = event.key.toUpperCase();
        // Only accept single alphabetic characters
        if (key.length !== 1 || key < 'A' || key > 'Z') return;

        const expected = this.phrase[this.pointer];
        if (key === expected) {
            // Correct key
            this.charTexts[this.pointer].setColor('#44ff44');
            this.pointer++;

            if (this.pointer < this.phrase.length) {
                this.cursor.x = this._startX + this.pointer * this._charSpacing;
            }

            } else {
                this._wobble(false);
            }

            if (this.pointer >= this.phrase.length) {
                // Word complete — scale pop + white flash
                this.charTexts.forEach(t => { if (t.active) t.setColor('#ffffff'); });
                this._flashSuccess();
                this.wordsCompleted++;
                this._updateProgressUI();
                this.scene.soundSynth?.play('wordSuccess');

                if (this.onWordComplete) this.onWordComplete(this.wordsCompleted);

                if (this.wordsCompleted >= this.wordsRequired) {
                    this._finish();
                } else {
                    this.scene.time.delayedCall(350, () => {
                        if (!this.cancelled) {
                            this._pickNewWord();
                            this._buildWordDisplay();
                        }
                    });
                }
            }
        } else {
            // Wrong key — just a delay (flash red, no score penalty)
            this.scene.soundSynth?.play('error');
            const cur = this.charTexts[this.pointer];
            cur.setColor('#ff4444');
            this.scene.time.delayedCall(160, () => {
                if (!this.cancelled && cur.active) cur.setColor('#777788');
            });
            this._wobble(true);
        }
    }

    _flashSuccess() {
        if (this._wobbleTween) { this._wobbleTween.stop(); this._wordGroup.y = 0; }
        this._wordGroup.setScale(1);
        this.scene.tweens.add({
            targets:  this._wordGroup,
            scaleX:   1.18,
            scaleY:   1.18,
            duration: 100,
            yoyo:     true,
            ease:     'Sine.easeOut',
        });
    }

    _wobble(violent) {
        if (this._wobbleTween) this._wobbleTween.stop();
        this._wordGroup.y = 0;
        const amp = violent ? 10 : 2;
        const dur  = violent ? 40 : 55;
        const reps = violent ? 5  : 0;
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

    _updateProgressUI() {
        const pct = this.wordsCompleted / this.wordsRequired;
        this.progressFill.width = Math.max(1, this._progressBarW * pct);
        this.progressLabel.setText(`${this.wordsCompleted} / ${this.wordsRequired} WORDS`);
    }

    _finish() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (this.onSuccess) this.onSuccess();
    }

    /** Cancel the minigame without success (teleport or ESC). Progress is retained by caller. */
    cancel() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (this.onCancel) this.onCancel();
    }

    _cleanup() {
        if (this.keyHandler) this.scene.input.keyboard.off('keydown', this.keyHandler);
        if (this.container && this.container.active) this.container.destroy();
    }
}
