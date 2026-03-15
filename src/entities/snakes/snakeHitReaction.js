/**
 * snakeHitReaction — shared hit-flash + freeze + body-wiggle effect for all snake types.
 *
 * Usage in each snake class:
 *
 *   // constructor
 *   this._hitReacting       = false;
 *   this._hitGen            = 0;
 *   this._hitWiggleMs       = 0;
 *   this._hitWiggleElapsed  = 0;
 *
 *   // takeDamage — call only when snake survives the hit
 *   applyHitReaction(this);
 *
 *   // update — after the _stunMs early-return block
 *   tickHitWiggle(this, delta);
 *
 *   // _updateSegments — last line
 *   applyWiggleToSegments(this);
 */

const HIT_STUN_MS   = 130;   // ms frozen after being hit
const HIT_WIGGLE_MS = 220;   // ms of body-wiggle that follows the freeze

// ── Red texture generation ────────────────────────────────────────────────────

function _redKey(key) { return `${key}-hit-red`; }

/**
 * Generates a red-tinted version of a Phaser texture and caches it.
 * Uses the same Canvas-2D multiply-then-destination-in technique as
 * GameScene._colorisePropTexture() for rocks and mushrooms.
 */
function _ensureRed(scene, key) {
    const rk = _redKey(key);
    if (scene.textures.exists(rk)) return;

    const src = scene.textures.get(key).source[0];
    const { width: w, height: h, image: img } = src;

    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 1. Draw greyscale / coloured source
    ctx.drawImage(img, 0, 0);

    // 2. Multiply with red — colourises but makes transparent regions opaque
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(255, 60, 60)';
    ctx.fillRect(0, 0, w, h);

    // 3. Restore original alpha mask
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);

    scene.textures.addCanvas(rk, canvas);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Trigger a hit reaction on any snake instance.
 * Safe to call on rapid successive hits — a generation counter ensures only
 * the latest scheduled restore actually fires.
 *
 * @param {object} snake  Any of the five snake classes.
 */
export function applyHitReaction(snake) {
    const scene   = snake.scene;
    const bodyKey = snake._bodyImgs[0]?.texture.key;
    const tailKey = snake._tailImg?.texture.key;

    if (!snake._hitReacting) {
        // First hit: swap every visible part to its red twin
        snake._hitReacting = true;

        // Stash original keys BEFORE any swap (body/tail may be hidden on Python)
        snake._origHeadKey = snake._headImg.texture.key;
        snake._origBodyKey = bodyKey;
        snake._origTailKey = tailKey;

        _ensureRed(scene, snake._origHeadKey);
        if (bodyKey) _ensureRed(scene, bodyKey);
        if (tailKey) _ensureRed(scene, tailKey);

        snake._headImg.setTexture(_redKey(snake._origHeadKey));
        for (const img of snake._bodyImgs) {
            if (img.visible) img.setTexture(_redKey(bodyKey));
        }
        if (snake._tailImg) snake._tailImg.setTexture(_redKey(tailKey));
    }

    // Always extend freeze on repeat hits
    snake._stunMs = Math.max(snake._stunMs, HIT_STUN_MS);

    // Bump generation — cancels any previously scheduled restore
    snake._hitGen = (snake._hitGen || 0) + 1;
    const gen = snake._hitGen;

    // Start wiggle right after freeze ends
    scene.time.delayedCall(HIT_STUN_MS, () => {
        if (!snake.active || snake._hitGen !== gen) return;
        snake._hitWiggleMs      = HIT_WIGGLE_MS;
        snake._hitWiggleElapsed = 0;
    });

    // Restore original textures after freeze + wiggle
    scene.time.delayedCall(HIT_STUN_MS + HIT_WIGGLE_MS, () => {
        if (!snake.active || snake._hitGen !== gen) return;
        snake._hitReacting = false;
        snake._hitWiggleMs = 0;

        snake._headImg.setTexture(snake._origHeadKey);
        for (const img of snake._bodyImgs) {
            if (img.visible) img.setTexture(snake._origBodyKey);
        }
        if (snake._tailImg) snake._tailImg.setTexture(snake._origTailKey);
    });
}

/**
 * Decrement the wiggle countdown and advance the elapsed timer.
 * Call once per frame in update(), AFTER the _stunMs early-return block.
 *
 * @param {object} snake
 * @param {number} delta  Frame delta in ms (same value passed to update).
 */
export function tickHitWiggle(snake, delta) {
    if (snake._hitWiggleMs <= 0) return;
    snake._hitWiggleMs      -= delta;
    snake._hitWiggleElapsed += delta;
}

/**
 * Apply a lateral sinusoidal offset to each body segment and tail so the
 * whole body appears to thrash.  Must be called at the END of _updateSegments()
 * — after positions and rotations are already set — so the offsets are additive.
 *
 * The head image gets a small rotation delta (movement code already set its
 * rotation this frame, so adding here is safe for one frame).
 *
 * @param {object} snake
 */
export function applyWiggleToSegments(snake) {
    if (snake._hitWiggleMs <= 0) return;

    const elapsed = snake._hitWiggleElapsed;
    const t       = Math.min(elapsed, HIT_WIGGLE_MS) / HIT_WIGGLE_MS;
    const env     = Math.sin(t * Math.PI);   // smooth 0 → peak → 0 envelope
    const freq    = 0.094;                   // rad/ms  ≈ 3 cycles over 200 ms
    const amp     = 9;                       // px lateral amplitude

    for (let i = 0; i < snake._bodyImgs.length; i++) {
        const img = snake._bodyImgs[i];
        if (!img.visible) continue;
        const lat  = Math.sin(elapsed * freq + i * 1.1) * env * amp;
        const perp = img.rotation + Math.PI / 2;
        img.x += Math.cos(perp) * lat;
        img.y += Math.sin(perp) * lat;
    }

    if (snake._tailImg && snake._tailImg.visible) {
        const n    = snake._bodyImgs.length;
        const lat  = Math.sin(elapsed * freq + n * 1.1) * env * amp;
        const perp = snake._tailImg.rotation + Math.PI / 2;
        snake._tailImg.x += Math.cos(perp) * lat;
        snake._tailImg.y += Math.sin(perp) * lat;
    }

    // Head: small rotation delta (movement code sets rotation earlier this frame)
    snake._headImg.rotation += Math.sin(elapsed * freq - 1.1) * env * 0.2;
}

// ── Death animation ───────────────────────────────────────────────────────────

/**
 * Play a cartoon snake-death sequence: cry tears → burrow underground.
 *
 *   t=0 ms   — slide-whistle sound, 4 blue tears shoot from the head
 *   t=80 ms  — burrowing starts: head shrinks first, then body cascade, then tail
 *   t=80+dur — snake fully underground; destroy() called
 *
 * Called by CollisionSystem immediately when a snake dies.  The snake must
 * already have _dying = true so update() and collisions skip it.
 *
 * @param {Phaser.Scene} scene
 * @param {object}       snake  Any of the five snake classes.
 */
export function spawnSnakeDeathAnimation(scene, snake) {
    scene.soundSynth?.play('snakeDie');

    const hx = snake.x;
    const hy = snake.y;

    // ── 1. Tears ─────────────────────────────────────────────────────────────
    // Four tears in a fan above the head: far-left, left, right, far-right
    const TEAR_ANGLES_DEG = [-120, -80, -100, -60];
    for (let i = 0; i < TEAR_ANGLES_DEG.length; i++) {
        const rad  = TEAR_ANGLES_DEG[i] * Math.PI / 180;
        const dist = 28 + i * 8;

        const tear = scene.add.graphics().setDepth(62);
        tear.fillStyle(0x55ccff, 0.92);
        tear.fillEllipse(0, 0, 5, 7);   // small teardrop oval
        tear.setPosition(hx, hy);

        // Phase 1: quick outward arc (fast, ease-out)
        scene.tweens.add({
            targets:  tear,
            x:        hx + Math.cos(rad) * dist,
            y:        hy + Math.sin(rad) * dist,
            duration: 140,
            ease:     'Power2.easeOut',
            onComplete: () => {
                if (!tear.active) return;
                // Phase 2: gravity fall + fade
                scene.tweens.add({
                    targets:  tear,
                    y:        tear.y + 35,
                    alpha:    0,
                    duration: 210,
                    ease:     'Sine.easeIn',
                    onComplete: () => tear.destroy(),
                });
            },
        });
    }

    // ── 2. Dirt ripple at burrow point ───────────────────────────────────────
    scene.time.delayedCall(75, () => {
        const ripple = scene.add.graphics().setDepth(28);
        ripple.fillStyle(0x886644, 0.55);
        ripple.fillEllipse(0, 0, 40, 14);
        ripple.setPosition(hx, hy);
        scene.tweens.add({
            targets:  ripple,
            scaleX:   1.8,
            scaleY:   0.3,
            alpha:    0,
            duration: 320,
            ease:     'Power1.easeOut',
            onComplete: () => ripple.destroy(),
        });
    });

    // ── 3. Burrow cascade ────────────────────────────────────────────────────
    // Head disappears first, then body segments in order, then tail.
    const SEG_DELAY = 35;   // ms between each segment vanishing
    const SEG_DUR   = 180;  // ms for each shrink tween

    scene.time.delayedCall(80, () => {
        if (!snake.active) return;

        // Head container (also shrinks shadow inside it)
        scene.tweens.add({
            targets:  snake,
            scaleX:   0,
            scaleY:   0,
            duration: SEG_DUR,
            ease:     'Sine.easeIn',
        });

        // Body segments (cascade)
        snake._bodyImgs.forEach((img, i) => {
            if (!img || !img.active) return;
            scene.tweens.add({
                targets:  img,
                scaleX:   0,
                scaleY:   0,
                duration: SEG_DUR,
                delay:    (i + 1) * SEG_DELAY,
                ease:     'Sine.easeIn',
            });
        });

        // Tail — last to vanish; onComplete triggers final destroy
        const tailDelay = (snake._bodyImgs.length + 1) * SEG_DELAY;
        if (snake._tailImg && snake._tailImg.active) {
            scene.tweens.add({
                targets:  snake._tailImg,
                scaleX:   0,
                scaleY:   0,
                duration: SEG_DUR,
                delay:    tailDelay,
                ease:     'Sine.easeIn',
                onComplete: () => { if (snake.active) snake.destroy(); },
            });
        } else {
            // No tail (shouldn't happen, but be safe)
            scene.time.delayedCall(tailDelay + SEG_DUR, () => {
                if (snake.active) snake.destroy();
            });
        }
    });
}
