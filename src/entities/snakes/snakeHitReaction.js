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
