/**
 * MathMinigame — simple add/subtract problem used as an alternative hack minigame.
 *
 * Shows one equation at a time (e.g. "7 + 3 = ?"). The player types the numeric
 * answer; submission is automatic when enough digits are entered. Each correct
 * answer counts as one "word" — identical reward to HackMinigame. The minigame
 * ends when wordsRequired problems are solved, or when cancel() is called.
 *
 * Interface is intentionally identical to HackMinigame so GameScene can swap
 * them transparently: wordsRequired / onWordComplete / onSuccess / onCancel / cancel().
 */
export default class MathMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {number}   opts.wordsRequired  — problems needed to complete this hack session
     * @param {function} [opts.onWordComplete] — called with (solvedSoFar) after each correct answer
     * @param {function} opts.onSuccess       — called when all problems solved
     * @param {function} [opts.onCancel]      — called when cancel() is invoked
     */
    constructor(scene, opts) {
        this.scene          = scene;
        this.wordsRequired  = opts.wordsRequired || 5;
        this.onWordComplete = opts.onWordComplete || null;
        this.onSuccess      = opts.onSuccess;
        this.onCancel       = opts.onCancel || null;

        this.cancelled       = false;
        this.wordsCompleted  = 0;
        this._typed          = '';
        this._answer         = 0;

        this._pickNewProblem();
        this._createUI();

        // Brief grace period so the E keypress that opened the terminal isn't captured.
        scene.time.delayedCall(250, () => {
            if (this.cancelled) return;
            this.keyHandler = (e) => this._handleKey(e);
            scene.input.keyboard.on('keydown', this.keyHandler);
        });
    }

    // ── Problem generation ────────────────────────────────────────────────────

    _pickNewProblem() {
        const add = Math.random() < 0.5;
        if (add) {
            this._a  = Phaser.Math.Between(1, 9);
            this._b  = Phaser.Math.Between(1, 9);
            this._op = '+';
        } else {
            // Ensure result >= 1 so the answer is never zero
            this._a  = Phaser.Math.Between(2, 9);
            this._b  = Phaser.Math.Between(1, this._a - 1);
            this._op = '-';
        }
        this._answer = this._op === '+' ? this._a + this._b : this._a - this._b;
        this._typed  = '';
    }

    // ── UI ───────────────────────────────────────────────────────────────────

    _createUI() {
        const cx = 640, cy = 610;
        this.container = this.scene.add.container(cx, cy).setDepth(200);

        const panelW = 420;
        const panel  = this.scene.add.rectangle(0, 0, panelW, 110, 0x001122, 0.93)
            .setStrokeStyle(2, 0x00ffcc, 0.85);
        this.container.add(panel);

        this.container.add(
            this.scene.add.text(0, -44, '[ HACKING TERMINAL ]', {
                fontSize: '11px', fontFamily: 'monospace', color: '#00ffcc',
            }).setOrigin(0.5),
        );

        const barW = panelW - 40;
        this.progressBg   = this.scene.add.rectangle(0, 37, barW, 7, 0x223333).setOrigin(0.5);
        this.progressFill = this.scene.add.rectangle(-barW / 2, 37, 1, 7, 0x00ffcc).setOrigin(0, 0.5);
        this.progressLabel = this.scene.add.text(0, 48, `0 / ${this.wordsRequired} SOLVED`, {
            fontSize: '9px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5);
        this.container.add(this.progressBg);
        this.container.add(this.progressFill);
        this.container.add(this.progressLabel);
        this._progressBarW = barW;

        // Word group — only the equation texts wobble, not the whole panel
        this._wordGroup = this.scene.add.container(0, 0);
        this.container.add(this._wordGroup);

        this._buildProblemDisplay();
    }

    _buildProblemDisplay() {
        if (this._problemText && this._problemText.active) this._problemText.destroy();
        if (this._inputText   && this._inputText.active)   this._inputText.destroy();

        // Left side: the equation up to the equals sign
        this._problemText = this.scene.add.text(-16, -6,
            `${this._a}  ${this._op}  ${this._b}  =`, {
                fontSize: '24px', fontFamily: 'monospace', color: '#aaaacc',
            }).setOrigin(1, 0.5);
        this._wordGroup.add(this._problemText);

        // Right side: the player's typed answer + cursor
        this._inputText = this.scene.add.text(-8, -6, '_', {
            fontSize: '24px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0, 0.5);
        this._wordGroup.add(this._inputText);
    }

    // ── Input handling ────────────────────────────────────────────────────────

    _handleKey(event) {
        if (this.cancelled) return;
        const key = event.key;

        if (key >= '0' && key <= '9') {
            this._typed += key;
            const cursor = this._typed.length < String(this._answer).length ? '_' : '';
            this._inputText.setText(this._typed + cursor);

            // Auto-submit once enough digits are entered
            if (this._typed.length >= String(this._answer).length) {
                this._checkAnswer();
            }
        } else if (key === 'Backspace' && this._typed.length > 0) {
            this._typed = this._typed.slice(0, -1);
            this._inputText.setText(this._typed.length > 0 ? this._typed + '_' : '_');
        }
    }

    _checkAnswer() {
        if (parseInt(this._typed, 10) === this._answer) {
            // Correct — flash the whole equation bright white-green
            this._problemText.setColor('#ccffcc');
            this._inputText.setColor('#ccffcc');
            this.wordsCompleted++;
            this._updateProgressUI();
            this.scene.soundSynth?.play('wordSuccess');
            this._wobble(false);
            if (this.onWordComplete) this.onWordComplete(this.wordsCompleted);

            if (this.wordsCompleted >= this.wordsRequired) {
                this.scene.time.delayedCall(180, () => {
                    if (!this.cancelled) this._finish();
                });
            } else {
                this.scene.time.delayedCall(180, () => {
                    if (!this.cancelled) {
                        this._pickNewProblem();
                        this._buildProblemDisplay();
                    }
                });
            }
        } else {
            // Wrong — flash red, clear input
            this.scene.soundSynth?.play('error');
            this._inputText.setColor('#ff4444');
            this._typed = '';
            this._wobble(true);
            this.scene.time.delayedCall(300, () => {
                if (!this.cancelled && this._inputText.active) {
                    this._inputText.setColor('#00ffcc');
                    this._inputText.setText('_');
                }
            });
        }
    }

    // ── Wobble feedback ───────────────────────────────────────────────────────

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

    // ── Progress ──────────────────────────────────────────────────────────────

    _updateProgressUI() {
        const pct = this.wordsCompleted / this.wordsRequired;
        this.progressFill.width = Math.max(1, this._progressBarW * pct);
        this.progressLabel.setText(`${this.wordsCompleted} / ${this.wordsRequired} SOLVED`);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    _finish() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (this.onSuccess) this.onSuccess();
    }

    /** Cancel without success (teleport or ESC). Progress is retained by caller. */
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
