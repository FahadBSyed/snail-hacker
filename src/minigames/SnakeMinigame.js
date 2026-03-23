/**
 * SnakeMinigame — boss fight shield-break mechanic for SnakeWorldScene.
 *
 * Classic Snake: steer the snake to eat pellets. Each pellet eaten counts
 * toward pointsNeeded (= BOSS.SHIELD_DROP_WORDS). Hitting your own tail or
 * a wall ends the attempt; timer expiry also fails.
 *
 * Tail grows by GROWTH_PER_PELLET segments per pellet, so the arena fills
 * quickly — the player doesn't need many pellets to win.
 *
 * Controls: WASD (suppress opposite direction to prevent 180° reversal)
 *
 * Panel size matches FroggerMinigame exactly (PANEL_W=194, PANEL_H=192),
 * anchored at (640, 600) so the main play area stays visible above it.
 *
 * Contract (matches all other minigames):
 *   opts.onSuccess  — called when pointsNeeded pellets are eaten
 *   opts.onFailure  — called when the timer expires or the snake crashes
 *   cancel()        — called by TeleportSystem; triggers onFailure
 */

import { CONFIG } from '../config.js';

// ── Layout (identical to FroggerMinigame panel) ───────────────────────────────
const CELL      = 14;              // px per grid cell
const COLS      = 13;              // 13 × 14 = 182 = GRID_W
const ROWS      = 11;              // 11 × 14 = 154 = GRID_H
const GRID_W    = COLS * CELL;     // 182
const GRID_H    = ROWS * CELL;     // 154
const HEADER_H  = 26;
const PADDING   = 6;
const PANEL_W   = GRID_W + 2 * PADDING;              // 194
const PANEL_H   = HEADER_H + GRID_H + 2 * PADDING;   // 192

// Grid origin relative to container centre
const GRID_OX   = -GRID_W / 2;                          // –91
const GRID_OY   = -(PANEL_H / 2) + PADDING + HEADER_H;  // –64

// Segments added to the snake per pellet eaten — high value means the arena
// fills fast, keeping run length short and tension high.
const GROWTH_PER_PELLET = 5;

// Ms between each snake movement step
const TICK_MS = 160;

export default class SnakeMinigame {
    /**
     * @param {Phaser.Scene} scene
     * @param {object}  opts
     * @param {number}   [opts.pointsNeeded]  pellets required to win
     * @param {number}   [opts.timeLimit]     ms before failure
     * @param {function} [opts.onPellet]      called with (pelletsSoFar) after each pellet
     * @param {function} opts.onSuccess
     * @param {function} opts.onFailure
     */
    constructor(scene, opts) {
        this.scene        = scene;
        this.onSuccess    = opts.onSuccess;
        this.onFailure    = opts.onFailure;
        this.onPellet     = opts.onPellet || null;
        this.cancelled    = false;
        this.pointsNeeded = opts.pointsNeeded ?? CONFIG.MINIGAMES.SNAKE_PELLETS_NEEDED;
        this.timeLimit    = opts.timeLimit    ?? CONFIG.MINIGAMES.SNAKE_TIME_LIMIT;

        // Snake body — array of { col, row }, head at index 0
        const midC = Math.floor(COLS / 2) - 1;
        const midR = Math.floor(ROWS / 2);
        this.body = [
            { col: midC + 1, row: midR },   // head
            { col: midC,     row: midR },
            { col: midC - 1, row: midR },
        ];
        this.dir           = { dc: 1, dr: 0 };   // moving right
        this.nextDir       = { dc: 1, dr: 0 };
        this.pendingGrowth = 0;
        this.score         = 0;
        this.dead          = false;
        this.waiting       = true;   // frozen until player gives first input
        this.startTime     = null;   // set on first keypress

        // Place first pellet
        this.pellet = this._randomPellet();

        this._createUI();
        this._showControlsFlash();
        this._bindKeys();

        // Movement tick (~6.25 steps/s)
        this.moveEvent = scene.time.addEvent({
            delay: TICK_MS, loop: true,
            callback: this._step, callbackScope: this,
        });

        // Render tick (~30 fps — decoupled from movement for smooth timer bar)
        this.renderEvent = scene.time.addEvent({
            delay: 33, loop: true,
            callback: this._render, callbackScope: this,
        });
    }

    // ── Coordinate helpers ────────────────────────────────────────────────────
    _cellX(col) { return GRID_OX + col * CELL; }
    _cellY(row) { return GRID_OY + row * CELL; }

    _randomPellet() {
        const occupied = new Set(this.body.map(s => `${s.col},${s.row}`));
        const free = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!occupied.has(`${c},${r}`)) free.push({ col: c, row: r });
            }
        }
        if (free.length === 0) return null;
        return free[Math.floor(Math.random() * free.length)];
    }

    // ── UI construction ───────────────────────────────────────────────────────
    _createUI() {
        // Bottom-third anchor — mirrors FroggerMinigame position exactly
        this.container = this.scene.add.container(640, 600).setDepth(200);

        // Panel background — green accent matches snake theme
        const panel = this.scene.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x04040f, 0.96)
            .setStrokeStyle(2, 0x44ff88, 0.88);
        this.container.add(panel);

        // Title
        this.container.add(
            this.scene.add.text(0, -PANEL_H / 2 + 13, '[ SNAKE HACK ]', {
                fontSize: '13px', fontFamily: 'monospace', color: '#44ff88',
            }).setOrigin(0.5),
        );

        // Score dots  ○ ○ ○ → ● ● ●
        this.scoreText = this.scene.add.text(0, -PANEL_H / 2 + 17, this._scoreStr(), {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
            letterSpacing: 4,
        }).setOrigin(0.5);
        this.container.add(this.scoreText);

        // Timer bar
        const barY     = -PANEL_H / 2 + HEADER_H - 4;
        const barW     = PANEL_W - 16;
        this.timerBg   = this.scene.add.rectangle(0, barY, barW, 3, 0x221122).setOrigin(0.5);
        this.timerFill = this.scene.add.rectangle(-barW / 2, barY, barW, 3, 0x44ff88).setOrigin(0, 0.5);
        this.container.add(this.timerBg);
        this.container.add(this.timerFill);
        this._timerBarW = barW;

        // Live game graphics (cleared + redrawn each render tick)
        this.gfx = this.scene.add.graphics();
        this.container.add(this.gfx);

        // Result flash text
        this.resultText = this.scene.add.text(
            0, GRID_OY + GRID_H / 2,
            '', { fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold', color: '#44ff88' },
        ).setOrigin(0.5);
        this.container.add(this.resultText);

        this._drawGrid();
    }

    _scoreStr() {
        return Array.from({ length: this.pointsNeeded }, (_, i) =>
            i < this.score ? '●' : '○',
        ).join('  ');
    }

    // ── Controls flash overlay ────────────────────────────────────────────────
    _showControlsFlash() {
        this.flashGfx = this.scene.add.graphics();
        this.container.add(this.flashGfx);
        this.flashGfx.fillStyle(0x000011, 0.84);
        this.flashGfx.fillRect(GRID_OX, GRID_OY, GRID_W, GRID_H);

        const arrowY = GRID_OY + GRID_H / 2 - 28;
        this.flashArrow = this.scene.add.text(0, arrowY, '▶', {
            fontSize: '26px', fontFamily: 'monospace', color: '#44ff88',
        }).setOrigin(0.5);
        this.container.add(this.flashArrow);

        this.flashLabel = this.scene.add.text(
            0, arrowY + 36,
            'WASD — STEER\nEAT THE PELLETS',
            { fontSize: '10px', fontFamily: 'monospace', color: '#ffffff', align: 'center' },
        ).setOrigin(0.5);
        this.container.add(this.flashLabel);

        // Auto-fade fallback if player somehow hasn't pressed anything after 3s
        this.scene.time.delayedCall(3000, () => {
            if (this.cancelled) return;
            this._dismissControls();
        });
    }

    // ── Key bindings ──────────────────────────────────────────────────────────
    _bindKeys() {
        // Short grace period so the E key that opened the terminal isn't captured
        this.scene.time.delayedCall(300, () => {
            if (this.cancelled) return;

            // Called on the very first WASD keypress — starts the clock and
            // dismisses the controls overlay immediately.
            const onFirstInput = () => {
                if (!this.waiting) return;
                this.waiting   = false;
                this.startTime = this.scene.time.now;
                this._dismissControls();
            };

            // Prevent 180° reversal — can't go back the way you came
            this._kW = () => { onFirstInput(); if (this.dir.dr !==  1) this.nextDir = { dc: 0, dr: -1 }; };
            this._kS = () => { onFirstInput(); if (this.dir.dr !== -1) this.nextDir = { dc: 0, dr:  1 }; };
            this._kA = () => { onFirstInput(); if (this.dir.dc !==  1) this.nextDir = { dc: -1, dr: 0 }; };
            this._kD = () => { onFirstInput(); if (this.dir.dc !== -1) this.nextDir = { dc:  1, dr: 0 }; };
            this.scene.input.keyboard.on('keydown-W', this._kW);
            this.scene.input.keyboard.on('keydown-S', this._kS);
            this.scene.input.keyboard.on('keydown-A', this._kA);
            this.scene.input.keyboard.on('keydown-D', this._kD);
        });
    }

    // Immediately fade and destroy the controls overlay (called on first input).
    _dismissControls() {
        const objs = [this.flashGfx, this.flashArrow, this.flashLabel].filter(o => o?.active);
        if (objs.length === 0) return;
        this.scene.tweens.add({
            targets: objs, alpha: 0, duration: 200,
            onComplete: () => objs.forEach(o => { if (o?.active) o.destroy(); }),
        });
        this.flashGfx = this.flashArrow = this.flashLabel = null;
    }

    // ── Game step (movement + collision) ─────────────────────────────────────
    _step() {
        if (this.cancelled || this.dead || this.waiting) return;

        // Commit queued direction
        this.dir = { ...this.nextDir };

        // Compute new head position
        const head = this.body[0];
        const nc   = head.col + this.dir.dc;
        const nr   = head.row + this.dir.dr;

        // Wall collision
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
            this._die();
            return;
        }

        // Self collision — check all segments that will still exist after the move.
        // If we're growing, the tail doesn't retract this step so all segments count.
        const checkLen = this.pendingGrowth > 0 ? this.body.length : this.body.length - 1;
        for (let i = 0; i < checkLen; i++) {
            if (this.body[i].col === nc && this.body[i].row === nr) {
                this._die();
                return;
            }
        }

        // Advance snake: place new head
        this.body.unshift({ col: nc, row: nr });

        // Safe growth: only keep the tail (grow) if doing so leaves the new head
        // at least one valid move. If keeping the tail would fully surround the
        // head, pop it anyway and keep the pendingGrowth count for a later step.
        if (this.pendingGrowth > 0) {
            if (this._headHasEscape()) {
                this.pendingGrowth--;   // growth applied this step
            } else {
                this.body.pop();        // defer growth — give head breathing room
            }
        } else {
            this.body.pop();
        }

        // Pellet pickup
        if (this.pellet && nc === this.pellet.col && nr === this.pellet.row) {
            this._eatPellet();
        }
    }

    // Returns true if the current head has at least one orthogonal neighbour
    // that is neither a wall nor occupied by the snake body.
    _headHasEscape() {
        const head     = this.body[0];
        const occupied = new Set(this.body.map(s => `${s.col},${s.row}`));
        return [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 }]
            .some(d => {
                const nc = head.col + d.dc;
                const nr = head.row + d.dr;
                return nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !occupied.has(`${nc},${nr}`);
            });
    }

    _eatPellet() {
        this.score++;
        this.pendingGrowth += GROWTH_PER_PELLET;
        this.scoreText.setText(this._scoreStr());
        this.scene.soundSynth?.play('wordSuccess');
        if (this.onPellet) this.onPellet(this.score);

        this.resultText.setText('✓ EATEN!').setColor('#44ff88').setAlpha(1);
        this.scene.time.delayedCall(400, () => {
            if (!this.cancelled) this.resultText.setText('');
        });

        if (this.score >= this.pointsNeeded) {
            // Brief pause so the final "EATEN!" flash is visible, then succeed
            this.scene.time.delayedCall(400, () => {
                if (!this.cancelled) this._finish(true);
            });
            return;
        }

        this.pellet = this._randomPellet();
    }

    _die() {
        if (this.dead || this.cancelled) return;
        this.dead = true;
        this.scene.soundSynth?.play('error');
        this.resultText.setText('✗ CRASHED!').setColor('#ff4444').setAlpha(1);

        // Pause briefly to show the dead-snake state, then fail
        this.scene.time.delayedCall(700, () => {
            if (this.cancelled) return;
            this._finish(false);
        });
    }

    // ── Render ────────────────────────────────────────────────────────────────
    _render() {
        if (this.cancelled) return;
        this._drawGrid();
        this._updateTimer();
    }

    _drawGrid() {
        const g = this.gfx;
        g.clear();

        // Background
        g.fillStyle(0x010810, 1);
        g.fillRect(GRID_OX, GRID_OY, GRID_W, GRID_H);

        // Subtle grid lines
        g.lineStyle(1, 0x0a2030, 0.5);
        for (let c = 0; c <= COLS; c++) {
            g.beginPath();
            g.moveTo(GRID_OX + c * CELL, GRID_OY);
            g.lineTo(GRID_OX + c * CELL, GRID_OY + GRID_H);
            g.strokePath();
        }
        for (let r = 0; r <= ROWS; r++) {
            g.beginPath();
            g.moveTo(GRID_OX,          GRID_OY + r * CELL);
            g.lineTo(GRID_OX + GRID_W, GRID_OY + r * CELL);
            g.strokePath();
        }

        // Pellet — bright yellow dot with a faint glow ring
        if (this.pellet) {
            const px = this._cellX(this.pellet.col) + CELL / 2;
            const py = this._cellY(this.pellet.row) + CELL / 2;
            g.fillStyle(0xffdd44, 1);
            g.fillCircle(px, py, 4);
            g.lineStyle(1, 0xffdd44, 0.35);
            g.strokeCircle(px, py, 6.5);
        }

        // Snake — drawn tail-to-head so head is always on top
        for (let i = this.body.length - 1; i >= 0; i--) {
            const seg    = this.body[i];
            const isHead = i === 0;
            const t      = i / Math.max(this.body.length - 1, 1);  // 0=head, 1=tail

            let color;
            if (this.dead) {
                color = 0xff4444;
            } else if (isHead) {
                color = 0x44ff88;
            } else {
                // Gradient: bright green head → dark green tail
                const greenCh = Math.round(0xff - (0xff - 0x55) * t);
                const blueCh  = Math.round(0x22 + (0x55 - 0x22) * (1 - t));
                color = (0x22 << 16) | (greenCh << 8) | blueCh;
            }

            g.fillStyle(color, 1);
            g.fillRect(
                this._cellX(seg.col) + 1,
                this._cellY(seg.row) + 1,
                CELL - 2,
                CELL - 2,
            );

            // Head eyes — two dots perpendicular to travel direction
            if (isHead && !this.dead) {
                const hx = this._cellX(seg.col) + CELL / 2;
                const hy = this._cellY(seg.row) + CELL / 2;
                const ex = -this.dir.dr * 2.5;   // perpendicular offset X
                const ey =  this.dir.dc * 2.5;   // perpendicular offset Y
                g.fillStyle(0x001a00, 1);
                g.fillCircle(hx + ex, hy + ey, 1.5);
                g.fillCircle(hx - ex, hy - ey, 1.5);
            }
        }
    }

    // ── Timer ─────────────────────────────────────────────────────────────────
    _updateTimer() {
        // startTime is null until the player gives their first input
        if (!this.startTime) return;
        const elapsed = this.scene.time.now - this.startTime;
        const pct     = Math.max(0, 1 - elapsed / this.timeLimit);
        this.timerFill.width = this._timerBarW * pct;
        if (pct < 0.25)      this.timerFill.fillColor = 0xff3333;
        else if (pct < 0.55) this.timerFill.fillColor = 0xffdd33;
        else                 this.timerFill.fillColor  = 0x44ff88;

        if (!this.dead && elapsed >= this.timeLimit) this._finish(false);
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
        if (this.moveEvent)   this.moveEvent.remove(false);
        if (this.renderEvent) this.renderEvent.remove(false);
        this.scene.input.keyboard.off('keydown-W', this._kW);
        this.scene.input.keyboard.off('keydown-S', this._kS);
        this.scene.input.keyboard.off('keydown-A', this._kA);
        this.scene.input.keyboard.off('keydown-D', this._kD);
        if (this.container?.active) this.container.destroy();
    }
}
