import { CONFIG } from '../config.js';

// Keys that won't conflict with WASD movement
const VALID_KEYS = ['F', 'G', 'H', 'J', 'K', 'L', 'Q', 'X', 'Z', 'B', 'N', 'M'];

export default class SequenceMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {number} [opts.length] — sequence length (4-6)
     * @param {function} opts.onSuccess
     * @param {function} opts.onFailure
     */
    constructor(scene, opts) {
        this.scene = scene;
        this.onSuccess = opts.onSuccess;
        this.onFailure = opts.onFailure;
        this.cancelled = false;
        this.timeLimit = CONFIG.MINIGAMES.SEQUENCE_TIME_LIMIT;

        // Generate random sequence
        const len = opts.length || Phaser.Math.Between(4, 6);
        this.sequence = [];
        for (let i = 0; i < len; i++) {
            this.sequence.push(Phaser.Utils.Array.GetRandom(VALID_KEYS));
        }
        this.pointer = 0; // current position in sequence

        // --- Display at bottom-center ---
        this.container = scene.add.container(640, 620).setDepth(200);

        // Background panel
        const panelWidth = len * 50 + 20;
        this.panel = scene.add.rectangle(0, 0, panelWidth, 60, 0x111122, 0.9)
            .setStrokeStyle(2, 0x44ddff, 0.8);
        this.container.add(this.panel);

        // Title
        this.title = scene.add.text(0, -22, 'TYPE THE SEQUENCE', {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#44ddff',
        }).setOrigin(0.5);
        this.container.add(this.title);

        // Timer bar
        const timerWidth = panelWidth - 20;
        this.timerBg = scene.add.rectangle(0, 22, timerWidth, 4, 0x333344).setOrigin(0.5);
        this.timerFill = scene.add.rectangle(-timerWidth / 2, 22, timerWidth, 4, 0x44ddff).setOrigin(0, 0.5);
        this.container.add(this.timerBg);
        this.container.add(this.timerFill);

        // Key letters
        this.keyTexts = [];
        const startX = -(len - 1) * 25;
        for (let i = 0; i < len; i++) {
            const txt = scene.add.text(startX + i * 50, -2, this.sequence[i], {
                fontSize: '22px',
                fontFamily: 'monospace',
                fontStyle: 'bold',
                color: '#aaaaaa',
            }).setOrigin(0.5);
            this.keyTexts.push(txt);
            this.container.add(txt);
        }

        // Brief grace period — prevents the E keypress that opened this terminal
        // from being captured, and gives the player a moment to read the sequence.
        this.ready = false;
        scene.time.delayedCall(300, () => {
            if (this.cancelled) return;
            this.ready = true;
            this.startTime = scene.time.now;
            this.timerEvent = scene.time.addEvent({
                delay: 50,
                loop: true,
                callback: () => this.updateTimer(),
            });
            this.keyHandler = (event) => this.handleKey(event);
            scene.input.keyboard.on('keydown', this.keyHandler);
        });
    }

    updateTimer() {
        if (this.cancelled) return;
        const elapsed = this.scene.time.now - this.startTime;
        const pct = Math.max(0, 1 - elapsed / this.timeLimit);
        const maxWidth = this.panel.width - 20;
        this.timerFill.width = maxWidth * pct;

        // Color shift as time runs out
        if (pct < 0.3) {
            this.timerFill.fillColor = 0xff4444;
        } else if (pct < 0.6) {
            this.timerFill.fillColor = 0xffdd44;
        }

        if (elapsed >= this.timeLimit) {
            this.finish(false);
        }
    }

    handleKey(event) {
        if (this.cancelled) return;
        const key = event.key.toUpperCase();
        if (key.length !== 1 || key < 'A' || key > 'Z') return;

        const expected = this.sequence[this.pointer];
        if (key === expected) {
            // Correct — highlight green
            this.keyTexts[this.pointer].setColor('#44ff44');
            this.pointer++;

            if (this.pointer >= this.sequence.length) {
                // All correct!
                this.finish(true);
            }
        } else {
            // Wrong — flash red and reset
            this.scene.soundSynth?.play('error');
            this.flashWrong();
        }
    }

    flashWrong() {
        // Flash all remaining keys red briefly, then reset
        for (let i = this.pointer; i < this.keyTexts.length; i++) {
            this.keyTexts[i].setColor('#ff4444');
        }
        this.scene.time.delayedCall(200, () => {
            if (this.cancelled) return;
            // Reset all keys back to original state
            for (let i = 0; i < this.keyTexts.length; i++) {
                this.keyTexts[i].setColor(i < this.pointer ? '#44ff44' : '#aaaaaa');
            }
        });
    }

    finish(success) {
        if (this.cancelled) return;
        this.cancelled = true;
        this.cleanup();
        if (success) {
            this.onSuccess();
        } else {
            this.onFailure();
        }
    }

    cancel() {
        if (this.cancelled) return;
        this.cancelled = true;
        this.cleanup();
        this.onFailure();
    }

    cleanup() {
        if (this.keyHandler) this.scene.input.keyboard.off('keydown', this.keyHandler);
        if (this.timerEvent) this.timerEvent.remove(false);
        if (this.container) this.container.destroy();
    }
}
