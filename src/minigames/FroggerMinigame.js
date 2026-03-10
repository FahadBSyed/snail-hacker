/**
 * FroggerMinigame — boss fight shield-break mechanic.
 *
 * The player steers Gerald across a gauntlet of alien traffic using WASD.
 * Each time the frog reaches the far side it scores a crossing. Earn
 * {pointsNeeded} crossings before the timer expires to succeed.
 * Getting hit by traffic sends the frog back to the start.
 *
 * Traffic escalates as lanes approach the goal:
 *   Lane 5 (nearest start): slowest, widest gaps
 *   Lane 1 (nearest goal):  fastest, tightest gaps
 *
 * Controls:   W↑  A←  S↓  D→   (one cell per press)
 *
 * Contract (matches all other minigames):
 *   opts.onSuccess  — called when pointsNeeded crossings are made
 *   opts.onFailure  — called when the timer expires
 *   cancel()        — called by TeleportSystem; triggers onFailure
 */

import { CONFIG } from '../config.js';

// ── Layout ────────────────────────────────────────────────────────────────────
const COLS     = 9;
const ROWS     = 7;   // row 0 = goal, row 6 = start, rows 1–5 = traffic
const CELL_W   = 48;
const CELL_H   = 44;
const GRID_W   = COLS * CELL_W;  // 432
const GRID_H   = ROWS * CELL_H;  // 308
const HEADER_H = 46;             // title + score dots + timer bar
const FOOTER_H = 20;
const PADDING  = 12;
const PANEL_W  = GRID_W + 2 * PADDING;                      // 456
const PANEL_H  = HEADER_H + GRID_H + FOOTER_H + 2 * PADDING; // 398

// Grid origin relative to container centre (640, 360)
const GRID_OX = -GRID_W / 2;                                 // –216
const GRID_OY = -(PANEL_H / 2) + PADDING + HEADER_H;        // –141

// ── Lane definitions (row 1 = near goal = hardest; row 5 = near start = easiest) ──
const LANE_CONFIGS = [
    { row: 1, speed: 200, dir:  1, carW: 58, numCars: 2, color: 0xcc2211 },
    { row: 2, speed: 155, dir: -1, carW: 54, numCars: 2, color: 0xcc6611 },
    { row: 3, speed: 115, dir:  1, carW: 52, numCars: 2, color: 0xbbaa11 },
    { row: 4, speed:  80, dir: -1, carW: 50, numCars: 2, color: 0x77aa11 },
    { row: 5, speed:  55, dir:  1, carW: 50, numCars: 2, color: 0x1177bb },
];

export default class FroggerMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object}  opts
     * @param {number}  [opts.pointsNeeded]  crossings required to win
     * @param {number}  [opts.timeLimit]     ms before failure
     * @param {function} opts.onSuccess
     * @param {function} opts.onFailure
     */
    constructor(scene, opts) {
        this.scene        = scene;
        this.onSuccess    = opts.onSuccess;
        this.onFailure    = opts.onFailure;
        this.cancelled    = false;
        this.pointsNeeded = opts.pointsNeeded ?? CONFIG.MINIGAMES.FROGGER_CROSSINGS;
        this.timeLimit    = opts.timeLimit    ?? CONFIG.MINIGAMES.FROGGER_TIME_LIMIT;

        // Frog state
        this.frogCol = Math.floor(COLS / 2);  // 4 — horizontal centre
        this.frogRow = ROWS - 1;              // 6 — start row
        this.score   = 0;
        this.dead    = false;    // true during the brief death flash
        this.scoring = false;   // true during the crossing celebration flash

        // Build lanes with initial car positions
        this.lanes = LANE_CONFIGS.map(cfg => {
            const spacing = GRID_W / cfg.numCars;
            const cars = Array.from({ length: cfg.numCars }, (_, i) => ({
                // Spread cars evenly with a small random offset so they're not perfectly aligned
                x: i * spacing + Phaser.Math.Between(0, Math.floor(spacing * 0.4)),
            }));
            return { ...cfg, cars };
        });

        this._createUI();
        this._showControlsFlash();
        this._bindKeys();

        // Game update loop (~30 fps is plenty for this)
        this.tickEvent = scene.time.addEvent({
            delay: 33,
            loop: true,
            callback: this._tick,
            callbackScope: this,
        });

        this.startTime = scene.time.now;
    }

    // ── Coordinate helpers ────────────────────────────────────────────────────
    _cellCX(col) { return GRID_OX + col * CELL_W + CELL_W / 2; }
    _cellCY(row) { return GRID_OY + row * CELL_H + CELL_H / 2; }

    // ── UI construction ───────────────────────────────────────────────────────
    _createUI() {
        this.container = this.scene.add.container(640, 360).setDepth(200);

        // Panel background
        const panel = this.scene.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x04040f, 0.96)
            .setStrokeStyle(2, 0xff2244, 0.88);
        this.container.add(panel);

        // Title
        this.container.add(
            this.scene.add.text(0, -PANEL_H / 2 + 13, '[ FROGGER HACK ]', {
                fontSize: '13px', fontFamily: 'monospace', color: '#ff2244',
            }).setOrigin(0.5),
        );

        // Score dots  ○ ○ ○ → ● ● ●
        this.scoreText = this.scene.add.text(0, -PANEL_H / 2 + 29, this._scoreStr(), {
            fontSize: '15px', fontFamily: 'monospace', color: '#ffffff',
            letterSpacing: 6,
        }).setOrigin(0.5);
        this.container.add(this.scoreText);

        // Timer bar
        const barY     = -PANEL_H / 2 + HEADER_H - 7;
        const barW     = PANEL_W - 24;
        this.timerBg   = this.scene.add.rectangle(0, barY, barW, 4, 0x221122).setOrigin(0.5);
        this.timerFill = this.scene.add.rectangle(-barW / 2, barY, barW, 4, 0xff2244).setOrigin(0, 0.5);
        this.container.add(this.timerBg);
        this.container.add(this.timerFill);
        this._timerBarW = barW;

        // Live game graphics object (cleared + redrawn each tick)
        this.gfx = this.scene.add.graphics();
        this.container.add(this.gfx);

        // Static labels — added AFTER gfx so they render on top
        // Goal row: "▲ SAFE ZONE"
        this.container.add(
            this.scene.add.text(
                0, GRID_OY + CELL_H / 2,
                '▲  S A F E   Z O N E  ▲',
                { fontSize: '9px', fontFamily: 'monospace', color: '#00ff88', alpha: 0.7 },
            ).setOrigin(0.5).setAlpha(0.65),
        );
        // Start row: "START"
        this.container.add(
            this.scene.add.text(
                0, GRID_OY + (ROWS - 1) * CELL_H + CELL_H / 2,
                'S T A R T',
                { fontSize: '9px', fontFamily: 'monospace', color: '#2288cc' },
            ).setOrigin(0.5).setAlpha(0.55),
        );

        // Footer hint
        this.container.add(
            this.scene.add.text(0, PANEL_H / 2 - 10, 'W A S D — HOP  ·  REACH THE TOP', {
                fontSize: '9px', fontFamily: 'monospace', color: '#444455',
            }).setOrigin(0.5),
        );

        // Result flash text (crossing celebration / death notice)
        this.resultText = this.scene.add.text(
            0, GRID_OY + GRID_H / 2,
            '', { fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#44ff88' },
        ).setOrigin(0.5);
        this.container.add(this.resultText);

        // Draw the first static frame right away so the grid isn't blank
        this._drawFrame();
    }

    _scoreStr() {
        return Array.from({ length: this.pointsNeeded }, (_, i) =>
            i < this.score ? '●' : '○',
        ).join('  ');
    }

    // ── Controls flash overlay ────────────────────────────────────────────────
    _showControlsFlash() {
        // Semi-opaque overlay covering the grid area only
        this.flashGfx = this.scene.add.graphics();
        this.container.add(this.flashGfx);
        this.flashGfx.fillStyle(0x000011, 0.84);
        this.flashGfx.fillRect(GRID_OX, GRID_OY, GRID_W, GRID_H);

        // Big upward arrow in the centre of the grid
        const arrowY = GRID_OY + GRID_H / 2 - 56;
        this.flashArrow = this.scene.add.text(0, arrowY, '▲', {
            fontSize: '52px', fontFamily: 'monospace', color: '#33ff88',
        }).setOrigin(0.5);
        this.container.add(this.flashArrow);

        // Instruction text below the arrow
        this.flashLabel = this.scene.add.text(
            0, arrowY + 72,
            'W A S D  —  HOP\nREACH THE OTHER SIDE',
            { fontSize: '15px', fontFamily: 'monospace', color: '#ffffff', align: 'center' },
        ).setOrigin(0.5);
        this.container.add(this.flashLabel);

        // Fade out after 1.8 s
        this.scene.time.delayedCall(1800, () => {
            if (this.cancelled) return;
            this.scene.tweens.add({
                targets: [this.flashGfx, this.flashArrow, this.flashLabel],
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    [this.flashGfx, this.flashArrow, this.flashLabel].forEach(o => {
                        if (o?.active) o.destroy();
                    });
                    this.flashGfx = this.flashArrow = this.flashLabel = null;
                },
            });
        });
    }

    // ── Key bindings ──────────────────────────────────────────────────────────
    _bindKeys() {
        // Short grace period so the E key that opened the terminal isn't captured
        this.scene.time.delayedCall(300, () => {
            if (this.cancelled) return;
            this._kW = () => this._hop(0, -1);
            this._kS = () => this._hop(0,  1);
            this._kA = () => this._hop(-1, 0);
            this._kD = () => this._hop( 1, 0);
            this.scene.input.keyboard.on('keydown-W', this._kW);
            this.scene.input.keyboard.on('keydown-S', this._kS);
            this.scene.input.keyboard.on('keydown-A', this._kA);
            this.scene.input.keyboard.on('keydown-D', this._kD);
        });
    }

    // ── Game loop ─────────────────────────────────────────────────────────────
    _tick() {
        if (this.cancelled) return;

        const dt = 33 / 1000;  // fixed timestep (ms → seconds)

        // Advance every car
        for (const lane of this.lanes) {
            for (const car of lane.cars) {
                car.x += lane.speed * lane.dir * dt;
                // Wrap: right-moving cars exit right → re-enter from left
                if (lane.dir > 0 && car.x > GRID_W)              car.x -= GRID_W + lane.carW;
                // Wrap: left-moving cars exit left → re-enter from right
                if (lane.dir < 0 && car.x + lane.carW < 0)       car.x += GRID_W + lane.carW;
            }
        }

        this._drawFrame();
        this._updateTimer();

        // Continuous collision check — catches cars running into a stationary frog
        if (!this.dead && !this.scoring) this._checkCollision();
    }

    // ── Drawing ───────────────────────────────────────────────────────────────
    _drawFrame() {
        const g = this.gfx;
        g.clear();

        // ── Row backgrounds ───────────────────────────────────────────────────
        for (let row = 0; row < ROWS; row++) {
            const isGoal  = row === 0;
            const isStart = row === ROWS - 1;
            let bg;
            if (isGoal)        bg = 0x003318;
            else if (isStart)  bg = 0x001a2e;
            else               bg = row % 2 === 0 ? 0x1b0c08 : 0x150908;

            g.fillStyle(bg, 1);
            g.fillRect(GRID_OX, GRID_OY + row * CELL_H, GRID_W, CELL_H);
        }

        // Goal row border — bright green outline
        g.lineStyle(1.5, 0x00ff88, 0.55);
        g.strokeRect(GRID_OX + 1, GRID_OY + 1, GRID_W - 2, CELL_H - 2);

        // Start row border — muted blue outline
        g.lineStyle(1, 0x2288cc, 0.35);
        g.strokeRect(GRID_OX + 1, GRID_OY + (ROWS - 1) * CELL_H + 1, GRID_W - 2, CELL_H - 2);

        // Road centreline dashes in each traffic lane
        g.lineStyle(1, 0x443322, 0.5);
        for (let row = 1; row <= 5; row++) {
            const y = GRID_OY + row * CELL_H + CELL_H / 2;
            for (let x = GRID_OX + 4; x < GRID_OX + GRID_W - 4; x += 22) {
                g.strokeLineSegment(x, y, x + 12, y);
            }
        }

        // Direction arrows at far edges (subtle — one per lane)
        for (const lane of this.lanes) {
            const arrowY = GRID_OY + lane.row * CELL_H + CELL_H / 2;
            const arrowX = lane.dir > 0
                ? GRID_OX + GRID_W - 8   // right side → points right
                : GRID_OX + 8;           // left side  → points left
            g.fillStyle(lane.color, 0.25);
            if (lane.dir > 0) {
                g.fillTriangle(arrowX - 6, arrowY - 5, arrowX + 1, arrowY, arrowX - 6, arrowY + 5);
            } else {
                g.fillTriangle(arrowX + 6, arrowY - 5, arrowX - 1, arrowY, arrowX + 6, arrowY + 5);
            }
        }

        // ── Cars ─────────────────────────────────────────────────────────────
        for (const lane of this.lanes) {
            const rowTop = GRID_OY + lane.row * CELL_H;
            const bodyH  = CELL_H - 10;
            const bodyY  = rowTop + 5;

            for (const car of lane.cars) {
                const cx = GRID_OX + car.x;
                const cw = lane.carW;

                // Car body
                g.fillStyle(lane.color, 1);
                g.fillRoundedRect(cx, bodyY, cw, bodyH, 4);

                // Windscreen highlight
                g.fillStyle(0xffffff, 0.10);
                g.fillRoundedRect(cx + 4, bodyY + 3, cw - 8, Math.floor(bodyH * 0.45), 2);

                // Headlights at the leading end (based on travel direction)
                const lightX = lane.dir > 0 ? cx + cw - 5 : cx + 2;
                g.fillStyle(0xffffaa, 0.88);
                g.fillCircle(lightX, bodyY + 5, 2.5);
                g.fillCircle(lightX, bodyY + bodyH - 5, 2.5);

                // Tail-lights at the trailing end
                const tailX = lane.dir > 0 ? cx + 2 : cx + cw - 5;
                g.fillStyle(0xff3300, 0.65);
                g.fillCircle(tailX, bodyY + 5, 2);
                g.fillCircle(tailX, bodyY + bodyH - 5, 2);
            }
        }

        // ── Frog ─────────────────────────────────────────────────────────────
        const fx = this._cellCX(this.frogCol);
        const fy = this._cellCY(this.frogRow);
        const frogBody = this.dead ? 0xff3333 : 0x33cc44;
        const frogDark = this.dead ? 0xaa1111 : 0x1a7a2a;

        // Body
        g.fillStyle(frogBody, 1);
        g.fillCircle(fx, fy, 13);

        // Belly highlight
        g.fillStyle(0xffffff, 0.12);
        g.fillEllipse(fx - 2, fy + 1, 14, 10);

        if (!this.dead) {
            // Eyes (looking toward the goal = up = –y direction)
            g.fillStyle(0xdde840, 1);
            g.fillCircle(fx - 5, fy - 7, 4.5);
            g.fillCircle(fx + 5, fy - 7, 4.5);

            // Pupils
            g.fillStyle(0x111100, 1);
            g.fillCircle(fx - 5, fy - 6.5, 2);
            g.fillCircle(fx + 5, fy - 6.5, 2);

            // Eye shine
            g.fillStyle(0xffffff, 1);
            g.fillCircle(fx - 4, fy - 8, 0.9);
            g.fillCircle(fx + 6, fy - 8, 0.9);

            // Nostrils
            g.fillStyle(frogDark, 1);
            g.fillCircle(fx - 2, fy, 1.2);
            g.fillCircle(fx + 2, fy, 1.2);
        }
    }

    // ── Timer ─────────────────────────────────────────────────────────────────
    _updateTimer() {
        const elapsed = this.scene.time.now - this.startTime;
        const pct     = Math.max(0, 1 - elapsed / this.timeLimit);
        this.timerFill.width = this._timerBarW * pct;
        if (pct < 0.25)      this.timerFill.fillColor = 0xff3333;
        else if (pct < 0.55) this.timerFill.fillColor = 0xffdd33;
        else                 this.timerFill.fillColor = 0xff2244;

        if (elapsed >= this.timeLimit) this._finish(false);
    }

    // ── Movement ──────────────────────────────────────────────────────────────
    _hop(dc, dr) {
        if (this.cancelled || this.dead || this.scoring) return;

        const nCol = Phaser.Math.Clamp(this.frogCol + dc, 0, COLS - 1);
        const nRow = this.frogRow + dr;

        // Block hopping below the start row
        if (nRow >= ROWS) return;

        // Hopping into or above the goal row → score a crossing
        if (nRow <= 0) {
            this.frogCol = nCol;
            this.frogRow = 0;
            this._scoreCrossing();
            return;
        }

        this.frogCol = nCol;
        this.frogRow = nRow;
        this.scene.soundSynth?.play('frogHop');

        // Instant post-hop collision check
        if (!this.dead && !this.scoring) this._checkCollision();
    }

    // ── Crossing ─────────────────────────────────────────────────────────────
    _scoreCrossing() {
        this.scoring = true;
        this.score++;
        this.scoreText.setText(this._scoreStr());
        this.scene.soundSynth?.play('wordSuccess');

        this.resultText.setText('✓ SAFE!').setColor('#44ff88').setAlpha(1);

        this.scene.time.delayedCall(600, () => {
            if (this.cancelled) return;
            this.resultText.setText('');
            if (this.score >= this.pointsNeeded) {
                this._finish(true);
            } else {
                this._resetFrog();
                this.scoring = false;
            }
        });
    }

    // ── Collision ─────────────────────────────────────────────────────────────
    _checkCollision() {
        // Safe rows — no traffic
        if (this.frogRow === 0 || this.frogRow === ROWS - 1) return;

        const lane = this.lanes.find(l => l.row === this.frogRow);
        if (!lane) return;

        // Frog hitbox: 6 px inset on each side for a touch of forgiveness
        const frogL = this.frogCol * CELL_W + 6;
        const frogR = frogL + CELL_W - 12;

        for (const car of lane.cars) {
            // Car hitbox: 2 px inset
            const carL = car.x + 2;
            const carR = car.x + lane.carW - 2;
            if (carL < frogR && carR > frogL) {
                this._die();
                return;
            }
        }
    }

    _die() {
        if (this.dead || this.cancelled) return;
        this.dead = true;
        this.scene.soundSynth?.play('error');

        this.resultText.setText('✗ HIT!').setColor('#ff4444').setAlpha(1);

        this.scene.time.delayedCall(600, () => {
            if (this.cancelled) return;
            this.resultText.setText('');
            this._resetFrog();
            this.dead = false;
        });
    }

    _resetFrog() {
        this.frogCol = Math.floor(COLS / 2);
        this.frogRow = ROWS - 1;
    }

    // ── Finish / cancel ───────────────────────────────────────────────────────
    _finish(success) {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        if (success) this.onSuccess(); else this.onFailure();
    }

    cancel() {
        if (this.cancelled) return;
        this.cancelled = true;
        this._cleanup();
        this.onFailure();
    }

    _cleanup() {
        if (this.tickEvent) this.tickEvent.remove(false);
        this.scene.input.keyboard.off('keydown-W', this._kW);
        this.scene.input.keyboard.off('keydown-S', this._kS);
        this.scene.input.keyboard.off('keydown-A', this._kA);
        this.scene.input.keyboard.off('keydown-D', this._kD);
        if (this.container?.active) this.container.destroy();
    }
}
