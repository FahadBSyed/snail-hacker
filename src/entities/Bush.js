import { CONFIG } from '../config.js';

/**
 * Bush — a prop that snakes can hide inside for invulnerability.
 *
 * States:
 *   normal   — lush green; available to occupy
 *   occupied — snake is hiding inside; rustling tween plays
 *   scorched — charred; no longer provides cover
 *
 * Public API (called by BasicSnake, GameScene, CollisionSystem):
 *   enter(snake)  — snake requests entry; returns false if occupied or scorched
 *   exit()        — snake leaves voluntarily
 *   flush()       — force-eject occupant (e.g., Gerald walks through, or BURNER fires)
 *   burn()        — scorch the bush; ejects occupant if any
 */
export default class Bush extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(30);

        this.isOccupied = false;
        this.occupant   = null;
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

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * A snake tries to enter the bush.
     * @returns {boolean} true if entry was accepted.
     */
    enter(snake) {
        if (this._scorched || this.isOccupied) return false;

        this.isOccupied = true;
        this.occupant   = snake;

        this._playRustle();
        return true;
    }

    /** The snake leaves voluntarily (e.g., hunting again). */
    exit() {
        const snake = this.occupant;
        this.isOccupied = false;
        this.occupant   = null;
        this._stopRustle();
        if (snake && snake.active) snake._setBodyAlpha?.(1);
    }

    /**
     * Force-eject the occupant (BURNER terminal or Gerald walks through).
     * The ejected snake is briefly stunned.
     */
    flush() {
        if (!this.isOccupied) return;

        const snake = this.occupant;
        this.exit();

        if (snake && snake.active) {
            snake.hidingInBush = false;
            snake.currentBush  = null;
            snake._stunMs      = CONFIG.BUSHES.FLUSH_STUN_MS;
            snake._setBodyAlpha?.(1);
            // Brief white flash on the bush to signal the flush
            this._doFlash(0.5, 200);
        }
    }

    /**
     * Scorch the bush (BURNER terminal activated for this wave).
     * Ejects any occupant, changes sprite, permanently disables cover.
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
