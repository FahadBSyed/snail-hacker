/**
 * FrogEscape — a decorative, non-interactive frog that spawns at an alien's
 * death position once the explosion animation fades.
 *
 * It stands briefly (breathing animation), then picks the cardinal direction
 * toward the nearest screen edge and hops off, playing the 4-frame hop cycle.
 *
 * FrogEscape is NOT added to scene.aliens, so it is completely invisible to
 * the projectile collision system and all game logic.
 */

const HOP_FRAMES = ['f00', 'f01', 'f02', 'f03'];
const HOP_SPEED  = 190;  // px/s — quick enough to clear screen in a few seconds
const IDLE_MS    = 1400; // ms standing still before hopping
const HOP_FPS    = 9;    // animation frame rate during hop

/** Return 'right'|'left'|'up'|'down' — the cardinal toward the nearest edge. */
function nearestEdgeDir(scene, x, y) {
    const W = scene.scale.width, H = scene.scale.height;
    const candidates = [
        ['right', W - x],
        ['left',  x],
        ['down',  H - y],
        ['up',    y],
    ];
    return candidates.reduce((best, cur) => cur[1] < best[1] ? cur : best)[0];
}

export default class FrogEscape extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(40);  // above terrain, below death bursts (53+) and HUD

        this._dir        = nearestEdgeDir(scene, x, y);
        this._phase      = 'idle';
        this._vx         = 0;
        this._vy         = 0;
        this._frameIdx   = 0;
        this._frameCycle = null;
        this._idleTween  = null;

        // ── Blob shadow ──────────────────────────────────────────────────────
        const shadow = scene.add.ellipse(1, 5, 19, 6, 0x000000, 0.20);
        this.add(shadow);

        // ── Frog sprite (0.667× scale = 32×32 px) ───────────────────────────
        this._img = scene.add.image(0, 0, `frog-${this._dir}`).setScale(2 / 3);
        this.add(this._img);

        // ── Fade in ──────────────────────────────────────────────────────────
        this.setAlpha(0);
        scene.tweens.add({
            targets: this, alpha: 1, duration: 280, ease: 'Sine.easeOut',
        });

        // ── Idle breathe (gentle scale bob on the image) ─────────────────────
        this._idleTween = scene.tweens.add({
            targets: this._img,
            scaleX: 0.70, scaleY: 0.633,
            duration: 680,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        // ── Start hopping after idle period ──────────────────────────────────
        scene.time.delayedCall(IDLE_MS, () => {
            if (!this.active) return;
            this._startHop();
        });
    }

    _startHop() {
        this._phase = 'hop';

        // Stop idle breathe and reset image scale
        if (this._idleTween) { this._idleTween.stop(); this._idleTween = null; }
        this._img.setScale(2 / 3);

        // Set velocity toward the chosen edge
        const velMap = {
            right: [ HOP_SPEED,  0],
            left:  [-HOP_SPEED,  0],
            up:    [ 0, -HOP_SPEED],
            down:  [ 0,  HOP_SPEED],
        };
        [this._vx, this._vy] = velMap[this._dir];

        // Start hop frame cycle
        this._frameIdx = 0;
        this._img.setTexture(`frog-hop-${this._dir}-f00`);
        this._frameCycle = this.scene.time.addEvent({
            delay:    Math.round(1000 / HOP_FPS),
            loop:     true,
            callback: () => {
                if (!this.active) return;
                this._frameIdx = (this._frameIdx + 1) % 4;
                this._img.setTexture(`frog-hop-${this._dir}-${HOP_FRAMES[this._frameIdx]}`);
            },
        });
    }

    /**
     * Called by GameScene.update() every frame.
     * @param {number} delta  Frame delta in milliseconds.
     */
    update(delta) {
        if (this._phase !== 'hop') return;

        const dt = delta / 1000;
        this.x += this._vx * dt;
        this.y += this._vy * dt;

        // Destroy once safely off-screen
        const { width, height } = this.scene.scale;
        if (this.x < -80 || this.x > width + 80 ||
            this.y < -80 || this.y > height + 80) {
            this._cleanup();
        }
    }

    _cleanup() {
        if (this._frameCycle) { this._frameCycle.remove(false); this._frameCycle = null; }
        if (this._idleTween)  { this._idleTween.stop();         this._idleTween  = null; }
        if (this.active) this.destroy();
    }
}
