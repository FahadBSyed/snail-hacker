/**
 * HelicopterMinigame — side-scrolling copter obstacle minigame.
 *
 * The player pilots a small ship through a scrolling tunnel, dodging incoming
 * wall pairs. SPACE (held) thrusts upward; releasing lets gravity pull the
 * ship down. Flying past 2 wall pairs counts as one "word" (calls
 * onWordComplete). Touching a wall or the top/bottom boundary calls onCancel
 * (fail). Complete wordsRequired "words" to trigger onSuccess.
 *
 * Interface matches HackMinigame / MathMinigame exactly:
 *   opts.wordsRequired / opts.onWordComplete / opts.onSuccess / opts.onCancel
 *   cancel()
 */

// ── Layout (matches FroggerMinigame panel footprint) ──────────────────────────
const PANEL_W  = 310;
const PANEL_H  = 192;
const HEADER_H = 26;   // title + progress bar area
const PADDING  = 6;

// Play area dimensions (inside the panel border)
const PLAY_W = PANEL_W - PADDING * 2;           // 298
const PLAY_H = PANEL_H - HEADER_H - PADDING * 2; // 148

// Play area origin relative to container centre
const PLAY_OX = -PLAY_W / 2;
const PLAY_OY = -(PANEL_H / 2) + HEADER_H + PADDING;

// ── Physics ───────────────────────────────────────────────────────────────────
const GRAVITY      = 140;   // px/s² downward
const THRUST       = -130;  // acceleration while SPACE is held
const MAX_VEL_DOWN = 90;    // terminal velocity
const MAX_VEL_UP   = 75;

// ── Walls ─────────────────────────────────────────────────────────────────────
const WALL_SPEED      = 90;    // px/s scroll speed
const WALL_SPACING    = 120;   // horizontal gap between wall pairs
const WALL_WIDTH      = 14;    // thickness of each wall segment
const GAP_HEIGHT      = 52;    // vertical opening size the ship must pass through
const GAP_MIN_Y       = 10;    // min gap top edge from play area top
const WALLS_PER_WORD  = 2;     // wall pairs the player must pass to earn one "word"

// ── Ship ──────────────────────────────────────────────────────────────────────
const SHIP_X    = 40;   // fixed horizontal position (relative to play area left)
const SHIP_SIZE = 8;    // half-size for the hitbox / drawing

export default class HelicopterMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object}  opts
     * @param {number}   opts.wordsRequired   — wall-pairs/2 needed to complete
     * @param {function} [opts.onWordComplete] — called with (wordsSoFar) after each word
     * @param {function} opts.onSuccess
     * @param {function} [opts.onCancel]
     */
    constructor(scene, opts) {
        this.scene          = scene;
        this.wordsRequired  = opts.wordsRequired || 3;
        this.onWordComplete = opts.onWordComplete || null;
        this.onSuccess      = opts.onSuccess;
        this.onCancel       = opts.onCancel || null;

        this.cancelled      = false;
        this.wordsCompleted = 0;
        this._dead          = false;   // brief death flash in progress

        // Ship state (in play-area-local coordinates)
        this._shipY  = PLAY_H / 2;
        this._vel    = 0;            // px/s, positive = downward

        // Wall state — each wall: { x, gapY } where gapY is gap top edge (play-local)
        this._walls        = [];
        this._wallsPassed  = 0;      // total walls cleared this session
        this._nextWallX    = PLAY_W; // x of next wall to spawn (play-local)

        this._thrustHeld = false;

        this._createUI();
        this._bindKeys();

        // Game tick at ~60 fps
        this.tickEvent = scene.time.addEvent({
            delay: 16, loop: true,
            callback: this._tick, callbackScope: this,
        });
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    _createUI() {
        // Same anchor as FroggerMinigame (bottom third of screen, gameplay visible above)
        this.container = this.scene.add.container(640, 600).setDepth(200);

        // Background panel
        const panel = this.scene.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x001122, 0.93)
            .setStrokeStyle(2, 0x00ffcc, 0.85);
        this.container.add(panel);

        // Title
        this.container.add(
            this.scene.add.text(0, -(PANEL_H / 2) + 8, '[ HELICOPTER HACK ]', {
                fontSize: '11px', fontFamily: 'monospace', color: '#00ffcc',
            }).setOrigin(0.5, 0),
        );

        // Progress dots (one per wordsRequired)
        this._dotGfx = this.scene.add.graphics();
        this.container.add(this._dotGfx);
        this._drawDots();

        // Play area background
        const playBg = this.scene.add.rectangle(
            PLAY_OX + PLAY_W / 2, PLAY_OY + PLAY_H / 2,
            PLAY_W, PLAY_H, 0x000a18,
        );
        this.container.add(playBg);

        // Tunnel top/bottom borders
        const borderColor = 0x336677;
        const topBorder = this.scene.add.rectangle(
            PLAY_OX + PLAY_W / 2, PLAY_OY - 1,
            PLAY_W, 2, borderColor,
        ).setOrigin(0.5, 1);
        const botBorder = this.scene.add.rectangle(
            PLAY_OX + PLAY_W / 2, PLAY_OY + PLAY_H + 1,
            PLAY_W, 2, borderColor,
        ).setOrigin(0.5, 0);
        this.container.add(topBorder);
        this.container.add(botBorder);

        // Wall graphics (drawn each tick)
        this._wallGfx = this.scene.add.graphics();
        this.container.add(this._wallGfx);

        // Ship graphics (drawn each tick)
        this._shipGfx = this.scene.add.graphics();
        this.container.add(this._shipGfx);

        // "SPACE to fly" hint — disappears on first thrust
        this._hint = this.scene.add.text(
            PLAY_OX + PLAY_W / 2, PLAY_OY + PLAY_H / 2,
            'HOLD SPACE', {
                fontSize: '9px', fontFamily: 'monospace', color: '#446677',
            },
        ).setOrigin(0.5);
        this.container.add(this._hint);
    }

    _drawDots() {
        const g = this._dotGfx;
        g.clear();
        const total  = this.wordsRequired;
        const radius = 4;
        const step   = radius * 2 + 4;
        const startX = -(total - 1) * step / 2;
        const dotY   = -(PANEL_H / 2) + 20;
        for (let i = 0; i < total; i++) {
            const filled = i < this.wordsCompleted;
            g.fillStyle(filled ? 0x00ffcc : 0x223344, 1);
            g.fillCircle(startX + i * step, dotY, radius);
        }
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    _bindKeys() {
        this._spaceKey = this.scene.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.SPACE,
        );
    }

    // ── Game loop ─────────────────────────────────────────────────────────────

    _tick() {
        if (this.cancelled || this._dead) return;

        const dt = 16 / 1000; // fixed ~16 ms step

        // ── Thrust / gravity ──────────────────────────────────────────────────
        const thrusting = this._spaceKey?.isDown;
        if (thrusting && this._hint?.active) {
            this._hint.setAlpha(0);  // hide hint on first use
        }

        if (thrusting) {
            this._vel += THRUST * dt;
        } else {
            this._vel += GRAVITY * dt;
        }
        this._vel = Phaser.Math.Clamp(this._vel, -MAX_VEL_UP, MAX_VEL_DOWN);
        this._shipY += this._vel * dt;

        // ── Boundary collision ────────────────────────────────────────────────
        if (this._shipY - SHIP_SIZE < 0 || this._shipY + SHIP_SIZE > PLAY_H) {
            this._die();
            return;
        }

        // ── Spawn new walls ───────────────────────────────────────────────────
        if (this._nextWallX <= PLAY_W) {
            const gapY = Phaser.Math.Between(
                GAP_MIN_Y,
                PLAY_H - GAP_HEIGHT - GAP_MIN_Y,
            );
            this._walls.push({ x: this._nextWallX, gapY, scored: false });
            this._nextWallX += WALL_SPACING;
        }

        // ── Scroll & score walls ──────────────────────────────────────────────
        const scrollDx = WALL_SPEED * dt;
        this._nextWallX -= scrollDx;
        for (const wall of this._walls) {
            wall.x -= scrollDx;

            // Check if the ship's x just cleared the right edge of this wall
            if (!wall.scored && wall.x + WALL_WIDTH < SHIP_X) {
                wall.scored = true;
                this._wallsPassed++;
                this.scene.soundSynth?.play('jump');

                if (this._wallsPassed % WALLS_PER_WORD === 0) {
                    this.wordsCompleted++;
                    this._drawDots();
                    this.scene.soundSynth?.play('wordSuccess');
                    if (this.onWordComplete) this.onWordComplete(this.wordsCompleted);
                    if (this.wordsCompleted >= this.wordsRequired) {
                        this._finish();
                        return;
                    }
                }
            }

            // Wall–ship collision (AABB against the gap opening)
            const shipScreenX = SHIP_X;
            const shipScreenY = this._shipY;
            const wallLeft  = wall.x;
            const wallRight = wall.x + WALL_WIDTH;
            const gapTop    = wall.gapY;
            const gapBot    = wall.gapY + GAP_HEIGHT;

            if (shipScreenX + SHIP_SIZE > wallLeft && shipScreenX - SHIP_SIZE < wallRight) {
                // Horizontally overlapping — check if ship is outside the gap
                if (shipScreenY - SHIP_SIZE < gapTop || shipScreenY + SHIP_SIZE > gapBot) {
                    this._die();
                    return;
                }
            }
        }

        // Prune off-screen walls
        this._walls = this._walls.filter(w => w.x + WALL_WIDTH > -8);

        // ── Render ────────────────────────────────────────────────────────────
        this._render();
    }

    _render() {
        // Walls
        const wg = this._wallGfx;
        wg.clear();
        for (const wall of this._walls) {
            const wx = PLAY_OX + wall.x;
            const wy = PLAY_OY;

            // Colour shifts green as more walls are cleared in this word
            const progress = (this._wallsPassed % WALLS_PER_WORD) / WALLS_PER_WORD;
            const wallColor = Phaser.Display.Color.Interpolate.ColorWithColor(
                { r: 0x33, g: 0x55, b: 0x88 },
                { r: 0x11, g: 0xaa, b: 0x66 },
                100,
                Math.floor(progress * 100),
            );
            const color = Phaser.Display.Color.GetColor(wallColor.r, wallColor.g, wallColor.b);

            wg.fillStyle(color, 1);
            // Top segment (from top of play area down to gap top)
            wg.fillRect(wx, wy, WALL_WIDTH, wall.gapY);
            // Bottom segment (from gap bottom to play area bottom)
            wg.fillRect(wx, wy + wall.gapY + GAP_HEIGHT, WALL_WIDTH, PLAY_H - wall.gapY - GAP_HEIGHT);

            // Gap edge highlight lines
            wg.lineStyle(1, 0x00ffcc, 0.4);
            wg.beginPath();
            wg.moveTo(wx, wy + wall.gapY);
            wg.lineTo(wx + WALL_WIDTH, wy + wall.gapY);
            wg.moveTo(wx, wy + wall.gapY + GAP_HEIGHT);
            wg.lineTo(wx + WALL_WIDTH, wy + wall.gapY + GAP_HEIGHT);
            wg.strokePath();
        }

        // Ship — a small arrow/chevron pointing right
        const sg = this._shipGfx;
        sg.clear();
        const sx = PLAY_OX + SHIP_X;
        const sy = PLAY_OY + this._shipY;

        sg.fillStyle(0x00ffcc, 1);
        sg.fillTriangle(
            sx + SHIP_SIZE,     sy,                  // nose
            sx - SHIP_SIZE,     sy - SHIP_SIZE * 0.8, // top tail
            sx - SHIP_SIZE,     sy + SHIP_SIZE * 0.8, // bottom tail
        );
        // Engine glow
        sg.fillStyle(0xffffff, 0.5);
        sg.fillCircle(sx - SHIP_SIZE + 2, sy, 2);
    }

    // ── Die ───────────────────────────────────────────────────────────────────

    _die() {
        if (this._dead || this.cancelled) return;
        this._dead = true;

        // Red flash on the ship, then cancel
        this._shipGfx.clear();
        const sx = PLAY_OX + SHIP_X;
        const sy = PLAY_OY + this._shipY;
        this._shipGfx.fillStyle(0xff2222, 1);
        this._shipGfx.fillCircle(sx, sy, SHIP_SIZE + 4);

        this.scene.soundSynth?.play('error');

        this.scene.time.delayedCall(320, () => {
            if (!this.cancelled) this._fail();
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    _finish() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (this.onSuccess) this.onSuccess();
    }

    _fail() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (this.onCancel) this.onCancel();
    }

    cancel() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (this.onCancel) this.onCancel();
    }

    _cleanup() {
        if (this.tickEvent) { this.tickEvent.remove(false); this.tickEvent = null; }
        if (this._spaceKey) {
            this.scene.input.keyboard.removeKey(this._spaceKey);
            this._spaceKey = null;
        }
        if (this.container && this.container.active) this.container.destroy();
    }
}
