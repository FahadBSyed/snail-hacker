import { CONFIG } from '../config.js';

// Only WASD — player focuses on timing, not key location
const VALID_KEYS = ['W', 'A', 'S', 'D'];

const BAR_WIDTH        = 360;
const TARGET_HALF      = 45;   // ±45px from center = 90px target zone
const INDICATOR_DURATION = 1100; // ms per direction (yoyo bounce) — visual only, not a balance knob

export default class RhythmMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {function} opts.onSuccess
     * @param {function} opts.onFailure
     */
    constructor(scene, opts) {
        this.scene      = scene;
        this.onSuccess  = opts.onSuccess;
        this.onFailure  = opts.onFailure;
        this.cancelled   = false;
        this.misses      = 0;
        this.currentBeat = 0;
        this.totalBeats  = CONFIG.MINIGAMES.RHYTHM_BEATS_REQUIRED;
        this.maxMisses   = CONFIG.MINIGAMES.RHYTHM_MAX_MISSES;
        this.beatTimeout = CONFIG.MINIGAMES.RHYTHM_BEAT_TIMEOUT;
        this.awaitingInput = false;
        this.beatTimer  = null;
        this.keyHandler = null;
        this.allObjects = [];

        this._createUI();
        // Brief grace period — prevents the E keypress that opened this terminal
        // from being captured, and gives the player a moment to see the UI.
        scene.time.delayedCall(300, () => {
            if (!this.cancelled) this._startBeat();
        });
    }

    _createUI() {
        const cx = 640;
        const by = 630; // bar y-center

        // Backdrop
        this._add(this.scene.add.rectangle(cx, by - 38, 450, 128, 0x000011, 0.92)
            .setStrokeStyle(1.5, 0xff88ff, 0.7).setDepth(200));

        // Title
        this._add(this.scene.add.text(cx, by - 93, 'RHYTHM HACK', {
            fontSize: '12px', fontFamily: 'monospace', color: '#ff88ff',
        }).setOrigin(0.5).setDepth(201));

        // Beat counter (left)
        this.beatCounter = this._add(this.scene.add.text(cx - 180, by - 73, `BEAT 1 / ${this.totalBeats}`, {
            fontSize: '10px', fontFamily: 'monospace', color: '#888888',
        }).setOrigin(0, 0.5).setDepth(201));

        // Miss counter (right)
        this.missCounter = this._add(this.scene.add.text(cx + 180, by - 73, 'MISS: 0', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ff6666',
        }).setOrigin(1, 0.5).setDepth(201));

        // Key to press
        this.keyDisplay = this._add(this.scene.add.text(cx, by - 48, '?', {
            fontSize: '34px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5).setDepth(201));

        // Bar background
        this._add(this.scene.add.rectangle(cx, by, BAR_WIDTH, 20, 0x222233).setDepth(201));

        // Target zone fill + border
        this.targetZone = this._add(
            this.scene.add.rectangle(cx, by, TARGET_HALF * 2, 20, 0x44ff88, 0.35).setDepth(202));
        this._add(this.scene.add.rectangle(cx, by, TARGET_HALF * 2, 20, 0x44ff88, 0)
            .setStrokeStyle(1.5, 0x44ff88, 0.9).setDepth(202));

        // Bouncing indicator
        this.indicator = this._add(
            this.scene.add.circle(cx - BAR_WIDTH / 2, by, 9, 0xffffff, 1).setDepth(203));

        // Start bounce tween immediately
        this.indicatorTween = this.scene.tweens.add({
            targets: this.indicator,
            x: cx + BAR_WIDTH / 2,
            duration: INDICATOR_DURATION,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        // Result flash
        this.resultText = this._add(this.scene.add.text(cx, by + 24, '', {
            fontSize: '13px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5).setDepth(201));
    }

    _add(obj) {
        this.allObjects.push(obj);
        return obj;
    }

    _startBeat() {
        if (this.cancelled) return;
        this.currentBeat++;
        this.beatCounter.setText(`BEAT ${this.currentBeat} / ${this.totalBeats}`);
        this.resultText.setText('');

        this.currentKey = Phaser.Utils.Array.GetRandom(VALID_KEYS);
        this.keyDisplay.setText(this.currentKey).setColor('#ffffff');
        this.indicator.setFillStyle(0xffffff);
        this.targetZone.fillColor = 0x44ff88;
        this.targetZone.fillAlpha = 0.35;

        this.awaitingInput = true;

        this.keyHandler = (event) => {
            if (!this.awaitingInput) return;
            const pressed = event.key.toUpperCase();
            if (!VALID_KEYS.includes(pressed)) return;
            this._handleKeyPress(pressed);
        };
        this.scene.input.keyboard.on('keydown', this.keyHandler);

        // Auto-miss after timeout
        this.beatTimer = this.scene.time.delayedCall(this.beatTimeout, () => {
            if (!this.awaitingInput) return;
            this._endBeatInput();
            this._recordMiss('TOO SLOW!');
        });
    }

    _endBeatInput() {
        this.awaitingInput = false;
        this.scene.input.keyboard.off('keydown', this.keyHandler);
        if (this.beatTimer) { this.beatTimer.remove(false); this.beatTimer = null; }
    }

    _handleKeyPress(key) {
        this._endBeatInput();
        const inZone = Math.abs(this.indicator.x - 640) <= TARGET_HALF;

        if (key === this.currentKey && inZone) {
            this.scene.soundSynth?.play('rhythmHit');
            this.indicator.setFillStyle(0x44ff88);
            this.targetZone.fillColor = 0x44ff88;
            this.targetZone.fillAlpha = 0.7;
            this.resultText.setText('HIT!').setColor('#44ff88');
            this.scene.time.delayedCall(450, () => this._advanceBeat());
        } else {
            this.scene.soundSynth?.play('error');
            this._recordMiss(key !== this.currentKey ? 'WRONG KEY!' : 'OFF BEAT!');
        }
    }

    _recordMiss(label) {
        this.misses++;
        this.missCounter.setText(`MISS: ${this.misses}`);
        this.indicator.setFillStyle(0xff4444);
        this.resultText.setText(label).setColor('#ff4444');

        if (this.misses > this.maxMisses) {
            this.scene.time.delayedCall(600, () => this._finish(false));
        } else {
            this.scene.time.delayedCall(450, () => this._advanceBeat());
        }
    }

    _advanceBeat() {
        if (this.cancelled) return;
        if (this.currentBeat >= this.totalBeats) {
            this._finish(true);
        } else {
            this._startBeat();
        }
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
        if (this.keyHandler) this.scene.input.keyboard.off('keydown', this.keyHandler);
        if (this.beatTimer) this.beatTimer.remove(false);
        this._cleanup();
    }

    _cleanup() {
        if (this.indicatorTween) this.indicatorTween.stop();
        for (const obj of this.allObjects) {
            if (obj && obj.active) obj.destroy();
        }
        this.allObjects = [];
    }
}
