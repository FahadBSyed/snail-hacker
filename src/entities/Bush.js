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
        this._sprite.setOrigin(0.5, 0.5);
        this.add(this._sprite);

        // White flash overlay for burn effect
        const cfg = CONFIG.BUSHES;
        this._flash = scene.add.graphics();
        this._flash.fillStyle(0xffffff, 1);
        this._flash.fillEllipse(0, -4, 60, 48);
        this._flash.setAlpha(0);
        this.add(this._flash);

        // Rustle tween (created once, replayed on enter)
        this._rustleTween = null;
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
        if (this.occupants.length === 1) this._playRustle();
        return true;
    }

    /**
     * A specific snake leaves voluntarily (e.g., resuming hunt).
     * Rustle stops only when the last occupant exits.
     */
    exit(snake) {
        const idx = this.occupants.indexOf(snake);
        if (idx === -1) return;
        this.occupants.splice(idx, 1);
        // Cache position so the snake can reveal parts as they physically exit the radius
        if (snake && snake.active) snake._lastBushPos = { x: this.x, y: this.y };
        if (this.occupants.length === 0) this._stopRustle();
    }

    /**
     * Force-eject ALL occupants (BURNER terminal or Gerald walks through).
     * Every ejected snake is briefly stunned.
     */
    flush() {
        if (this.occupants.length === 0) return;

        const toEject  = this.occupants.slice();
        this.occupants = [];
        this._stopRustle();

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
        this._doFlash(CONFIG.BUSHES.BURN_FLASH_ALPHA, 300);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _playRustle() {
        const dur = CONFIG.BUSHES.RUSTLE_DURATION;
        this._rustleTween = this.scene.tweens.add({
            targets:  this,
            angle:    { from: -4, to: 4 },
            duration: dur / 4,
            yoyo:     true,
            repeat:   1,
            ease:     'Sine.easeInOut',
            onComplete: () => { this.angle = 0; },
        });
    }

    _stopRustle() {
        if (this._rustleTween) {
            this._rustleTween.stop();
            this._rustleTween = null;
        }
        this.angle = 0;
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
