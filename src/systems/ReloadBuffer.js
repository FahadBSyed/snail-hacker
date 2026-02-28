const RELOAD_WORD = 'RELOAD';
const RELOAD_DELAY = 2000; // ms after last letter before ammo refills

export default class ReloadBuffer {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {function} opts.onReloadComplete — called when reload finishes
     * @param {function} opts.onReloadStart    — called when RELOAD word detected
     * @param {function} opts.onReloadCancel   — called when reload is cancelled
     * @param {function} opts.onBufferUpdate   — called with (buffer, matchCount) each keypress
     */
    constructor(scene, opts) {
        this.scene = scene;
        this.onReloadComplete = opts.onReloadComplete;
        this.onReloadStart = opts.onReloadStart;
        this.onReloadCancel = opts.onReloadCancel;
        this.onBufferUpdate = opts.onBufferUpdate;

        this.buffer = '';
        this.reloadInProgress = false;
        this.delayTimer = null;

        // Listen passively — does NOT consume keys or block WASD
        this.keyHandler = (event) => this.handleKey(event);
        scene.input.keyboard.on('keydown', this.keyHandler);
    }

    handleKey(event) {
        // Ignore if reload already in progress (waiting for delay)
        if (this.reloadInProgress) return;

        const key = event.key.toUpperCase();
        // Only buffer single alpha characters
        if (key.length !== 1 || key < 'A' || key > 'Z') return;

        this.buffer += key;

        // Keep buffer at RELOAD_WORD length (rolling window)
        if (this.buffer.length > RELOAD_WORD.length) {
            this.buffer = this.buffer.slice(-RELOAD_WORD.length);
        }

        // Calculate how many leading chars of RELOAD match the buffer tail
        let matchCount = 0;
        for (let i = 0; i < RELOAD_WORD.length; i++) {
            if (this.buffer.length > i && this.buffer[this.buffer.length - RELOAD_WORD.length + i] === RELOAD_WORD[i]) {
                matchCount = i + 1;
            } else {
                break;
            }
        }

        if (this.onBufferUpdate) {
            this.onBufferUpdate(this.buffer, matchCount);
        }

        // Check for full match
        if (this.buffer === RELOAD_WORD) {
            this.reloadInProgress = true;
            this.buffer = '';

            if (this.onReloadStart) this.onReloadStart();

            this.delayTimer = this.scene.time.delayedCall(RELOAD_DELAY, () => {
                this.reloadInProgress = false;
                this.delayTimer = null;
                if (this.onReloadComplete) this.onReloadComplete();
            });
        }
    }

    /** Cancel any in-progress reload and clear buffer */
    cancel() {
        this.buffer = '';
        if (this.reloadInProgress) {
            this.reloadInProgress = false;
            if (this.delayTimer) {
                this.delayTimer.remove(false);
                this.delayTimer = null;
            }
            if (this.onReloadCancel) this.onReloadCancel();
        }
    }

    /** True if currently in the 2s reload delay */
    get isReloading() {
        return this.reloadInProgress;
    }

    destroy() {
        this.scene.input.keyboard.off('keydown', this.keyHandler);
        this.cancel();
    }
}
