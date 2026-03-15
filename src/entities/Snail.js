import { CONFIG } from '../config.js';


export default class Snail extends Phaser.GameObjects.Container {
    /**
     * Register the directional hit animations with the scene's animation manager.
     * Must be called after the hit-frame textures are loaded (GameScene.preload).
     * Safe to call multiple times — skips any animation that already exists.
     */
    static registerAnims(scene) {
        for (const dir of ['right', 'left', 'up', 'down']) {
            // Walk cycle — 6 frames, loops
            if (!scene.anims.exists(`snail-walk-${dir}`)) {
                scene.anims.create({
                    key:       `snail-walk-${dir}`,
                    frames:    Array.from({ length: 6 }, (_, i) => ({
                        key: `snail-walk-${dir}-f${String(i).padStart(2, '0')}`,
                    })),
                    frameRate: 10,
                    repeat:    -1,
                });
            }

            // Idle — 12 frames, loops
            if (!scene.anims.exists(`snail-idle-${dir}`)) {
                scene.anims.create({
                    key:       `snail-idle-${dir}`,
                    frames:    Array.from({ length: 12 }, (_, i) => ({
                        key: `snail-idle-${dir}-f${String(i).padStart(2, '0')}`,
                    })),
                    frameRate: 8,
                    repeat:    -1,
                });
            }

            // Damage — withdraw → shell pulse → extend (reverse); one-shot
            if (!scene.anims.exists(`snail-hit-${dir}`)) {
                const frameKeys = [];
                for (let i = 0; i <= 15; i++) {
                    frameKeys.push({ key: `snail-hit-${dir}-f${String(i).padStart(2, '0')}` });
                }
                for (let i = 7; i >= 0; i--) {
                    frameKeys.push({ key: `snail-hit-${dir}-f${String(i).padStart(2, '0')}` });
                }
                scene.anims.create({
                    key:      `snail-hit-${dir}`,
                    frames:   frameKeys,
                    duration: CONFIG.SNAIL.INVINCIBILITY_MS,
                    repeat:   0,
                });
            }
        }
    }

    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.state = 'IDLE'; // IDLE | MOVING | HACKING | CARRYING | GRABBED
        this.hackingActive   = false;
        this.carryingBattery = false;
        this.facing = 'right'; // current facing direction

        this.health    = CONFIG.SNAIL.MAX_HEALTH;
        this.maxHealth = CONFIG.SNAIL.MAX_HEALTH;
        this.speed     = CONFIG.PLAYER.SNAIL_SPEED;
        this.invincible = false;
        this.shielded   = false;

        // --- Sprite (animated) ---
        const _shadow = scene.add.graphics();
        _shadow.fillStyle(0x000000, 0.30);
        _shadow.fillEllipse(2, 12, 46, 16);
        this.add(_shadow);

        this.sprite = scene.add.sprite(0, 0, 'snail-idle-right-f00');
        this.add(this.sprite);
        this._currentAnimKey = null;   // tracks playing anim to avoid redundant play() calls
        this._slitherHandle  = null;   // { stop() } returned by SoundSynth.playLooped('slithering')

        // --- Overhead state label ---
        this.stateLabel = scene.add.text(0, -30, 'IDLE', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 3, y: 1 },
        }).setOrigin(0.5);
        this.add(this.stateLabel);

        // --- WASD keys ---
        this.keys = scene.input.keyboard.addKeys({
            w: Phaser.Input.Keyboard.KeyCodes.W,
            a: Phaser.Input.Keyboard.KeyCodes.A,
            s: Phaser.Input.Keyboard.KeyCodes.S,
            d: Phaser.Input.Keyboard.KeyCodes.D,
        });

        // Start idle animation immediately (registerAnims must be called first)
        this._playCurrentAnim();
    }

    shield(duration) {
        if (this.shielded) return false;
        this.shielded = true;

        this.shieldGfx = this.scene.add.graphics();
        this.shieldGfx.fillStyle(0x4488ff, 0.15);
        this.shieldGfx.fillCircle(0, 0, 32);
        this.shieldGfx.lineStyle(2.5, 0x88ccff, 0.8);
        this.shieldGfx.strokeCircle(0, 0, 32);
        this.add(this.shieldGfx); // child of container — moves with Gerald

        this.shieldTween = this.scene.tweens.add({
            targets:  this.shieldGfx,
            alpha:    0.5,
            duration: 550,
            ease:     'Sine.easeInOut',
            yoyo:     true,
            repeat:   -1,
        });

        this.scene.time.delayedCall(duration, () => this.unshield());
        return true;
    }

    unshield() {
        if (!this.shielded) return;
        this.shielded = false;
        if (this.shieldTween) { this.shieldTween.stop(); this.shieldTween = null; }
        if (this.shieldGfx)   { this.shieldGfx.destroy(); this.shieldGfx = null; }
    }

    /**
     * Deal damage to the snail. Returns true if snail died.
     * Triggers invincibility frames + flash effect.
     */
    takeDamage(amount) {
        if (this.invincible || this.shielded) return false;
        this.health = Math.max(0, this.health - amount);
        this.invincible = true;

        // Play the directional withdraw → shell → extend animation.
        // White flash is baked into the sprite frames.
        this.sprite.play(`snail-hit-${this.facing}`);

        this.scene.time.delayedCall(CONFIG.SNAIL.INVINCIBILITY_MS, () => {
            this.invincible = false;
            this._currentAnimKey = null;  // force re-play after hit anim
            this._playCurrentAnim();
        });

        return this.health <= 0;
    }

    // Choose and play the correct looping animation based on current state + facing.
    _playCurrentAnim() {
        if (this.invincible) return;
        const key = this.state === 'MOVING'
            ? `snail-walk-${this.facing}`
            : `snail-idle-${this.facing}`;
        if (key !== this._currentAnimKey) {
            this._currentAnimKey = key;
            this.sprite.play(key);
        }
    }

    setFacing(direction) {
        if (this.facing !== direction) {
            this.facing = direction;
            this._playCurrentAnim();
        }
    }

    setState(newState) {
        if (this.state !== newState) {
            const wasMoving = this.state === 'MOVING';
            const isMoving  = newState === 'MOVING';
            this.state = newState;
            this.stateLabel.setText(newState);
            if (isMoving  && !wasMoving) this._startSlither();
            if (!isMoving && wasMoving)  this._stopSlither();
            this._playCurrentAnim();
        }
    }

    _startSlither() {
        if (this._slitherHandle) return;
        const synth = this.scene.registry.get('soundSynth');
        this._slitherHandle = synth?.playLooped('slithering') ?? null;
    }

    _stopSlither(fadeOut = 0.30) {
        this._slitherHandle?.stop(fadeOut);
        this._slitherHandle = null;
    }

    destroy() {
        this._stopSlither(0.05);
        super.destroy();
    }

    update(time, delta) {
        // Don't allow WASD movement while hacking
        if (this.hackingActive) {
            return;
        }

        const dt = delta / 1000;
        let dx = 0;
        let dy = 0;

        if (this.keys.a.isDown) dx -= 1;
        if (this.keys.d.isDown) dx += 1;
        if (this.keys.w.isDown) dy -= 1;
        if (this.keys.s.isDown) dy += 1;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }

        if (dx !== 0 || dy !== 0) {
            // Apply World 2 speed debuffs (venom + acid puddle) if active
            let sMult = 1;
            if (this.scene._venomActive)    sMult *= CONFIG.SNAKES.VENOM.SPEED_MULT;
            if (this.scene._snailInPuddle)  sMult *= CONFIG.SNAKES.SPITTER.PUDDLE_SLOW_MULT;
            this.x += dx * this.speed * sMult * dt;
            this.y += dy * this.speed * sMult * dt;
            this.setState('MOVING');

            // Update facing direction — horizontal takes priority over vertical
            if (dx > 0)      this.setFacing('right');
            else if (dx < 0) this.setFacing('left');
            else if (dy < 0) this.setFacing('up');
            else if (dy > 0) this.setFacing('down');
        } else {
            this.setState('IDLE');
        }

        // Clamp to screen bounds (with a small margin for the sprite size)
        const margin = 24;
        this.x = Phaser.Math.Clamp(this.x, margin, 1280 - margin);
        this.y = Phaser.Math.Clamp(this.y, margin, 720 - margin);
    }
}
