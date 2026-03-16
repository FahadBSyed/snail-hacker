import { CONFIG } from '../config.js';

/**
 * Bush — a prop that snakes can hide inside for invulnerability.
 *
 * Multiple snakes can share the same bush simultaneously.
 *
 * States:
 *   normal   — lush green; available to occupy
 *   occupied — one or more snakes hiding inside; rustling tween plays
 *   scorched — charred; no longer provides cover
 *
 * Public API (called by snake classes, GameScene, CollisionSystem):
 *   enter(snake)   — snake requests entry; returns false only if scorched
 *   exit(snake)    — specific snake leaves voluntarily
 *   flush()        — force-eject ALL occupants (e.g., Gerald walks through, or BURNER fires)
 *   burn()         — scorch the bush; ejects all occupants
 */
export default class Bush extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(30);

        this.occupants  = [];   // all snakes currently hiding here
        this._scorched  = false;

        // Sprite child — swaps between 'bush' and 'bush-scorched' textures
        this._sprite = scene.add.image(0, 0, 'bush');
        this._sprite.setOrigin(0.5, 0.5).setScale(1.25);
        this.add(this._sprite);

        // White flash overlay for burn effect (scaled up 25% to match sprite)
        this._flash = scene.add.graphics();
        this._flash.fillStyle(0xffffff, 1);
        this._flash.fillEllipse(0, -5, 75, 60);
        this._flash.setAlpha(0);
        this.add(this._flash);

        this._swayTween = null;
        this._jerkTween = null;

        this._startSway();
    }

    // ── Backward-compat getters ─────────────────────────────────────────────

    get isOccupied() { return this.occupants.length > 0; }
    /** Returns the first occupant, or null (legacy single-occupant callers). */
    get occupant()   { return this.occupants[0] ?? null; }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * A snake tries to enter the bush.
     * Multiple snakes may occupy the same bush.
     * @returns {boolean} true if entry was accepted (false only if scorched).
     */
    enter(snake) {
        if (this._scorched) return false;

        this.occupants.push(snake);
        this._playJerk();
        return true;
    }

    /**
     * A specific snake leaves voluntarily (e.g., resuming hunt).
     */
    exit(snake) {
        const idx = this.occupants.indexOf(snake);
        if (idx === -1) return;
        this.occupants.splice(idx, 1);
        // Cache position so the snake can reveal parts as they physically exit the radius
        if (snake && snake.active) snake._lastBushPos = { x: this.x, y: this.y };
        this._playJerk();
    }

    /**
     * Force-eject ALL occupants (BURNER terminal or Gerald walks through).
     * Every ejected snake is briefly stunned.
     */
    flush() {
        if (this.occupants.length === 0) return;

        const toEject  = this.occupants.slice();
        this.occupants = [];
        this._playJerk();

        for (const snake of toEject) {
            if (snake && snake.active) {
                snake.hidingInBush = false;
                snake.currentBush  = null;
                snake._stunMs      = CONFIG.BUSHES.FLUSH_STUN_MS;
                snake._cancelBushAnim?.();   // cancel any in-progress hide/reveal
                snake._setBodyAlpha?.(1);    // instant reveal for abrupt flush
            }
        }
        this._doFlash(0.5, 200);
    }

    /**
     * Scorch the bush (BURNER terminal activated for this wave).
     * Ejects all occupants, changes sprite, permanently disables cover.
     */
    burn() {
        if (this.isOccupied) this.flush();

        this._scorched = true;
        this._sprite.setTexture('bush-scorched');

        // Stop all motion
        if (this._swayTween) { this._swayTween.stop(); this._swayTween = null; }
        if (this._jerkTween) { this._jerkTween.stop(); this._jerkTween = null; }
        this.angle = 0;

        this._doFlash(CONFIG.BUSHES.BURN_FLASH_ALPHA, 300);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /** Continuous gentle sway — staggered per bush so they don't all move in sync. */
    _startSway() {
        if (this._swayTween) { this._swayTween.stop(); this._swayTween = null; }
        const period = 1800 + Math.random() * 600;   // 1.8–2.4 s per half-swing
        this._swayTween = this.scene.tweens.add({
            targets:  this,
            angle:    { from: -2.5, to: 2.5 },
            duration: period,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
            delay:    Math.random() * period * 2,   // random phase offset
        });
    }

    /**
     * Quick damped jerk — played whenever a snake enters or exits.
     * Interrupts the sway tween and restarts it afterward.
     */
    _playJerk() {
        if (this._swayTween) { this._swayTween.stop(); this._swayTween = null; }
        if (this._jerkTween) { this._jerkTween.stop(); this._jerkTween = null; }
        this.angle = 0;

        this._jerkTween = this.scene.tweens.add({
            targets:  this,
            angle:    { from: -9, to: 9 },
            duration: 45,
            yoyo:     true,
            repeat:   4,
            ease:     'Sine.easeOut',
            onComplete: () => {
                this._jerkTween = null;
                this.angle = 0;
                this._startSway();
            },
        });
    }

    _doFlash(peakAlpha, duration) {
        this._flash.setAlpha(0);
        this.scene.tweens.add({
            targets:  this._flash,
            alpha:    { from: peakAlpha, to: 0 },
            duration,
            ease:     'Sine.easeOut',
        });
    }
}
