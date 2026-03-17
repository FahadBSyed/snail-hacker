/**
 * Anaconda — World 2 boss snake.
 *
 * Body: same segment-history system as Python but 2× larger sprites
 * (already baked into the SVG assets) and the same scale factors.
 *
 * Attack cycle (repeating after ATTACK_COOLDOWN):
 *   1. CIRCLING   — orbits the arena at CIRCLE_RADIUS, polling for a clear
 *                   line-of-sight from the head to the snail.
 *   2. PEEK_IN    — dashes off-screen to the entry edge opposite the charge
 *                   direction, then positions head just inside the game bounds.
 *   3. PEEKING    — holds at the edge; cycles through mouth-open frames as a
 *                   telegraphed warning (plays snakeHiss on entry).
 *   4. CHARGING   — rockets across the arena in the fixed charge direction.
 *                   Continues through the snail on contact (damage dealt once
 *                   per pass) until the head exits off-screen.
 *   5. RETURNING  — loops back to the same entry edge off-screen.
 *   6. PEEKING    — second peek-and-charge pass.
 *   7. CHARGING   — second charge.
 *   (back to SLITHER, cooldown resets)
 *
 * Shield: starts shielded; SnakeWorldScene._tryWave10Hack() breaks it.
 *   dropShield() / raiseShield() / flashShield() mirror BossAlien's API.
 */

import { CONFIG } from '../../config.js';
import { applyHitReaction, tickHitWiggle, applyWiggleToSegments } from './snakeHitReaction.js';

// Head texture keys in mouth-opening order
const MOUTH_FRAMES = [
    'snake-anaconda-head',
    'snake-anaconda-head-open-f00',
    'snake-anaconda-head-open-f01',
    'snake-anaconda-head-open-f02',
    'snake-anaconda-head-open',
];

const SCREEN_W       = 1280;
const SCREEN_H       = 720;
const PEEK_INSET     = 60;   // px — how far the head sits inside the edge during peek
const OFF_SCREEN_M   = 200;  // px past the edge that counts as "fully exited"
const CHARGE_CONT_R  = 48;   // px — contact radius against snail during charge

export default class Anaconda extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        const cfg       = CONFIG.ANACONDA;
        this.health     = cfg.HP;
        this.maxHp      = cfg.HP;
        this.speed      = cfg.SPEED;
        this.radius     = cfg.HEAD_RADIUS;
        this.alienType  = 'anaconda';
        this._dying     = false;

        this.hidingInBush = false;

        this._segCount = cfg.SEGMENT_COUNT;
        this._spacing  = cfg.SEGMENT_SPACING;

        // Hit-reaction fields (used by snakeHitReaction helpers)
        this._stunMs           = 0;
        this._hitReacting      = false;
        this._hitGen           = 0;
        this._hitWiggleMs      = 0;
        this._hitWiggleElapsed = 0;

        // Position history — larger cap than Python due to longer body
        this._history      = [{ x, y }];
        this._slitherTime  = 0;

        // Shield state
        this.shielded     = true;
        this._shieldGfx   = null;
        this._shieldAngle = 0;

        // Attack state machine
        this._attackPhase    = 'slither';
        this._attackCooldown = cfg.ATTACK_COOLDOWN * 0.5;  // quicker first attack
        this._circleAngle    = Math.atan2(y - 360, x - 640);
        this._losOkMs        = 0;

        // Peek-and-charge fields
        this._chargeDir        = { nx: 1, ny: 0 };  // normalised direction of current charge
        this._peekPos          = { x: 0, y: 0 };    // head position during peek (edge inset)
        this._chargePassCount  = 0;                  // how many passes completed this cycle
        this._chargeHitThisPass = false;             // flag: snail already hit this pass
        this._chargeTouchedSnail = false;            // consumed by update() return value

        // Mouth-open animation
        this._mouthFrameIdx = 0;
        this._mouthTimer    = 0;

        this._buildVisuals(scene, cfg.SEGMENT_COUNT);
        this._rebuildBodyHitboxes();
    }

    // ── Visuals ───────────────────────────────────────────────────────────────

    _buildVisuals(scene, segCount) {
        // Head (same scale as Python so it renders at ~2× Python's displayed size)
        this._headImg = scene.add.image(0, 0, 'snake-anaconda-head');
        this._headImg.setOrigin(0.5, 0.5).setScale(0.845);
        this.add(this._headImg);

        // Body segments (world-space — not children of container)
        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-anaconda-body');
            img.setOrigin(0.5, 0.5).setScale(1.69).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }

        // Tail
        this._tailImg = scene.add.image(this.x, this.y, 'snake-anaconda-tail');
        this._tailImg.setOrigin(0.5, 0.5).setScale(1.69).setDepth(this.depth - 2);

        // Shield ring graphics (drawn around the head)
        this._shieldGfx = scene.add.graphics().setDepth(this.depth + 2);
        this._drawShield();
    }

    // ── Shield ────────────────────────────────────────────────────────────────

    _drawShield() {
        const g = this._shieldGfx;
        g.clear();
        if (!this.shielded) return;

        const r = this.radius + 18;
        // Outer ring
        g.lineStyle(3, 0x44ff88, 0.7);
        g.strokeCircle(this.x, this.y, r);
        // Rotating arc accent
        const a1 = this._shieldAngle;
        const a2 = a1 + Math.PI * 0.6;
        g.lineStyle(4, 0x88ffcc, 0.9);
        g.beginPath();
        for (let i = 0; i <= 20; i++) {
            const a = a1 + (a2 - a1) * (i / 20);
            const px = this.x + Math.cos(a) * r;
            const py = this.y + Math.sin(a) * r;
            if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokePath();
    }

    dropShield() {
        this.shielded = false;
        this._shieldGfx.clear();
        // Green burst
        const burst = this.scene.add.circle(this.x, this.y, this.radius + 20, 0x44ff88, 0.6)
            .setDepth(this.depth + 3);
        this.scene.tweens.add({
            targets: burst, scaleX: 2.5, scaleY: 2.5, alpha: 0,
            duration: 400, ease: 'Power2.easeOut',
            onComplete: () => burst.destroy(),
        });
    }

    raiseShield() {
        this.shielded = true;
    }

    flashShield() {
        const flash = this.scene.add.circle(this.x, this.y, this.radius + 22, 0xffffff, 0.5)
            .setDepth(this.depth + 3);
        this.scene.tweens.add({
            targets: flash, alpha: 0, duration: 180,
            onComplete: () => flash.destroy(),
        });
    }

    // ── Damage ────────────────────────────────────────────────────────────────

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) return true;
        applyHitReaction(this);
        return false;
    }

    takeDamageRaw(amount) {
        return this.takeDamage(amount);
    }

    _onHitReactionEnd() { /* no segment recolouring needed */ }

    // ── Hitboxes ──────────────────────────────────────────────────────────────

    _rebuildBodyHitboxes() {
        const bodyR = CONFIG.ANACONDA.BODY_RADIUS;
        this._bodyHitboxes = [];
        this._tailHitboxes = [];   // kept for CollisionSystem compatibility
        for (let i = 0; i < this._segCount; i++) {
            const img = this._bodyImgs[i];
            if (!img || !img.active) continue;
            this._bodyHitboxes.push({ x: img.x, y: img.y, r: bodyR });
        }
    }

    // ── Main update ───────────────────────────────────────────────────────────

    update(time, delta) {
        if (!this.active) return 'alive';

        const dt  = delta / 1000;
        const cfg = CONFIG.ANACONDA;

        if (this._stunMs > 0) {
            this._stunMs -= delta;
            this._updateSegments();
            this._rebuildBodyHitboxes();
            if (this.shielded) { this._shieldAngle += dt * 2.5; this._drawShield(); }
            return 'alive';
        }

        tickHitWiggle(this, delta);

        switch (this._attackPhase) {
            case 'slither':    this._tickSlither(delta, dt, cfg); break;
            case 'circling':   this._tickCircling(delta, dt, cfg); break;
            case 'peek_in':    this._tickPeekIn(delta, dt, cfg); break;
            case 'peeking':    this._tickPeeking(delta, cfg); break;
            case 'charging':   this._tickCharging(delta, dt, cfg); break;
            case 'returning':  this._tickReturning(delta, dt, cfg); break;
        }

        this._pushHistory(time);
        this._updateSegments();
        this._rebuildBodyHitboxes();

        if (this.shielded) { this._shieldAngle += dt * 2.5; this._drawShield(); }

        // Charge contact — consume the flag set during _tickCharging
        if (this._chargeTouchedSnail) {
            this._chargeTouchedSnail = false;
            return 'reached_snail';
        }

        // Proximity contact during normal slither (not during charge passes)
        if (this._attackPhase === 'slither' || this._attackPhase === 'circling') {
            const snail = this.scene.snail;
            const dist  = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 20) return 'reached_snail';
        }

        return 'alive';
    }

    // ── Slither (Python-style approach with sine-wave oscillation) ────────────

    _tickSlither(delta, dt, cfg) {
        this._attackCooldown -= delta;
        if (this._attackCooldown <= 0) {
            this._attackPhase = 'circling';
            this._losOkMs     = 0;
            this._circleAngle = Math.atan2(this.y - 360, this.x - 640);
            return;
        }

        const snail    = this.scene.snail;
        const mult     = this.scene.enemySpeedMultiplier || 1.0;
        const toSnail  = Math.atan2(snail.y - this.y, snail.x - this.x);
        this._slitherTime += dt;
        const moveAngle = toSnail + cfg.SLITHER_AMPLITUDE *
            Math.sin(this._slitherTime * cfg.SLITHER_FREQUENCY * Math.PI * 2);

        this.x += Math.cos(moveAngle) * this.speed * mult * dt;
        this.y += Math.sin(moveAngle) * this.speed * mult * dt;
        this._headImg.setRotation(moveAngle);
    }

    // ── Circling — orbit arena centre, poll for clear LOS to snail ───────────

    _tickCircling(delta, dt, cfg) {
        const snail = this.scene.snail;
        const mult  = this.scene.enemySpeedMultiplier || 1.0;
        const CX = 640, CY = 360;

        this._circleAngle += cfg.CIRCLE_SPEED * dt * mult;

        const tx = CX + Math.cos(this._circleAngle) * cfg.CIRCLE_RADIUS;
        const ty = CY + Math.sin(this._circleAngle) * cfg.CIRCLE_RADIUS;

        const toOrbit = Math.atan2(ty - this.y, tx - this.x);
        const orbitDist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
        const orbitSpeed = Math.min(cfg.SPEED * 1.8 * mult, orbitDist * 5);

        this.x += Math.cos(toOrbit) * orbitSpeed * dt;
        this.y += Math.sin(toOrbit) * orbitSpeed * dt;
        this._headImg.setRotation(Math.atan2(snail.y - this.y, snail.x - this.x));

        if (this._hasLOS(snail.x, snail.y)) {
            this._losOkMs += delta;
            if (this._losOkMs >= 200) this._startPeekIn();
        } else {
            this._losOkMs = 0;
        }
    }

    /** True if the straight line from head to (tx, ty) isn't blocked by own body segments. */
    _hasLOS(tx, ty) {
        const ox = this.x, oy = this.y;
        const dx = tx - ox, dy = ty - oy;
        const len = Math.hypot(dx, dy);
        if (len < 1) return true;
        const nx = dx / len, ny = dy / len;
        const r  = CONFIG.ANACONDA.BODY_RADIUS * 0.85;
        // Skip the first 4 segments — always close to the head
        for (let i = 4; i < this._segCount; i++) {
            const img = this._bodyImgs[i];
            if (!img || !img.active || !img.visible) continue;
            const px    = img.x - ox, py = img.y - oy;
            const along = px * nx + py * ny;
            if (along < 0 || along > len) continue;
            if (Math.abs(px * ny - py * nx) < r) return false;
        }
        return true;
    }

    // ── Peek-in: dash off-screen to edge, then position head at PEEK_INSET ───

    _startPeekIn() {
        const snail = this.scene.snail;
        // Compute charge direction from current position toward snail
        const dx  = snail.x - this.x;
        const dy  = snail.y - this.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        this._chargeDir       = { nx: dx / len, ny: dy / len };
        this._chargePassCount = 0;
        this._peekPos         = this._computePeekPos();
        this._attackPhase     = 'peek_in';
        this._losOkMs         = 0;
    }

    /**
     * Compute the peek position: head just inside the screen edge on the side
     * OPPOSITE to the charge direction (so the charge travels toward the snail).
     * The cross-axis position is aligned to the snail's current location.
     */
    _computePeekPos() {
        const snail = this.scene.snail;
        const { nx, ny } = this._chargeDir;

        if (Math.abs(nx) >= Math.abs(ny)) {
            const clampedY = Phaser.Math.Clamp(snail.y, 80, SCREEN_H - 80);
            // Charging right → peek from left edge; charging left → from right edge
            return nx > 0
                ? { x: PEEK_INSET,          y: clampedY }
                : { x: SCREEN_W - PEEK_INSET, y: clampedY };
        } else {
            const clampedX = Phaser.Math.Clamp(snail.x, 80, SCREEN_W - 80);
            // Charging down → peek from top edge; charging up → from bottom edge
            return ny > 0
                ? { x: clampedX, y: PEEK_INSET }
                : { x: clampedX, y: SCREEN_H - PEEK_INSET };
        }
    }

    _tickPeekIn(delta, dt, cfg) {
        // Dash head to peek position at high speed (body trails off-screen behind it)
        const speed = cfg.CHARGE_SPEED * 2.5;
        const px    = this._peekPos.x;
        const py    = this._peekPos.y;
        const dist  = Phaser.Math.Distance.Between(this.x, this.y, px, py);

        if (dist < speed * dt + 4) {
            this.x = px;
            this.y = py;
            // Arrived at peek position — start mouth-open telegraph
            this._attackPhase   = 'peeking';
            this._mouthFrameIdx = 0;
            this._mouthTimer    = 0;
            this.scene.soundSynth?.play('snakeHiss');
        } else {
            const angle = Math.atan2(py - this.y, px - this.x);
            this.x += Math.cos(angle) * speed * dt;
            this.y += Math.sin(angle) * speed * dt;
            this._headImg.setRotation(angle);
        }
    }

    // ── Peeking: hold at edge, play mouth-open animation as telegraph ─────────

    _tickPeeking(delta, cfg) {
        this._mouthTimer += delta;

        // Face into the arena (charge direction)
        this._headImg.setRotation(Math.atan2(this._chargeDir.ny, this._chargeDir.nx));

        // Step through mouth-open frames evenly over MOUTH_OPEN_DURATION
        const frameDur    = cfg.MOUTH_OPEN_DURATION / (MOUTH_FRAMES.length - 1);
        const targetFrame = Math.min(
            Math.floor(this._mouthTimer / frameDur),
            MOUTH_FRAMES.length - 1,
        );
        if (targetFrame !== this._mouthFrameIdx) {
            this._mouthFrameIdx = targetFrame;
            this._headImg.setTexture(MOUTH_FRAMES[this._mouthFrameIdx]);
        }

        // Fully open + hold time expired → begin charge
        if (this._mouthFrameIdx >= MOUTH_FRAMES.length - 1 &&
                this._mouthTimer >= cfg.MOUTH_OPEN_DURATION + cfg.MOUTH_HOLD_MS) {
            this._attackPhase       = 'charging';
            this._chargeHitThisPass = false;
            this.scene.soundSynth?.play('snakeHiss');
        }
    }

    // ── Charging: rocket through arena, zoom past snail, exit off-screen ──────

    _tickCharging(delta, dt, cfg) {
        const mult   = this.scene.enemySpeedMultiplier || 1.0;
        const speed  = cfg.CHARGE_SPEED * mult;
        const { nx, ny } = this._chargeDir;

        this.x += nx * speed * dt;
        this.y += ny * speed * dt;
        this._headImg.setRotation(Math.atan2(ny, nx));

        // Check contact with snail once per pass
        if (!this._chargeHitThisPass) {
            const snail = this.scene.snail;
            const dist  = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + CHARGE_CONT_R) {
                this._chargeHitThisPass  = true;
                this._chargeTouchedSnail = true;  // consumed by update() return value
            }
        }

        // Transition when head is fully off-screen
        if (this._isOffScreen()) {
            this._chargePassCount++;
            if (this._chargePassCount < 2) {
                // Return to same entry edge for a second pass
                this._peekPos     = this._computePeekPos();
                this._attackPhase = 'returning';
            } else {
                // Two passes done — return to normal slithering
                this._endChargeSequence();
            }
        }
    }

    // ── Returning: loop back to the entry edge for the second peek ────────────

    _tickReturning(delta, dt, cfg) {
        const speed = cfg.CHARGE_SPEED * 2.5;
        const px    = this._peekPos.x;
        const py    = this._peekPos.y;
        const dist  = Phaser.Math.Distance.Between(this.x, this.y, px, py);

        if (dist < speed * dt + 4) {
            this.x = px;
            this.y = py;
            // Back at the edge — second peek-and-charge
            this._attackPhase   = 'peeking';
            this._mouthFrameIdx = 0;
            this._mouthTimer    = 0;
            this.scene.soundSynth?.play('snakeHiss');
        } else {
            const angle = Math.atan2(py - this.y, px - this.x);
            this.x += Math.cos(angle) * speed * dt;
            this.y += Math.sin(angle) * speed * dt;
            this._headImg.setRotation(angle);
        }
    }

    _endChargeSequence() {
        this._attackPhase    = 'slither';
        this._attackCooldown = CONFIG.ANACONDA.ATTACK_COOLDOWN;
        this._headImg.setTexture('snake-anaconda-head');
        this._mouthFrameIdx  = 0;
    }

    /** True when the head is far enough past any screen edge to count as exited. */
    _isOffScreen() {
        return (
            this.x < -OFF_SCREEN_M ||
            this.x > SCREEN_W + OFF_SCREEN_M ||
            this.y < -OFF_SCREEN_M ||
            this.y > SCREEN_H + OFF_SCREEN_M
        );
    }

    // ── Segment helpers ───────────────────────────────────────────────────────

    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;
        this._history.unshift({ x: this.x, y: this.y });
        // Larger cap — 24 segs × spacing × oversample
        if (this._history.length > 1500) this._history.length = 1500;
    }

    _updateSegments() {
        const sp = this._spacing;
        for (let i = 0; i < this._bodyImgs.length; i++) {
            if (i >= this._segCount) break;
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(idx - sp);
            this._bodyImgs[i].setPosition(pos.x, pos.y).setVisible(true);
            this._bodyImgs[i].setRotation(Math.atan2(prev.y - pos.y, prev.x - pos.x));
        }
        const ti  = (this._segCount + 1) * sp;
        const tp  = this._histAt(ti);
        const tpr = this._histAt(ti - sp);
        this._tailImg.setPosition(tp.x, tp.y);
        this._tailImg.setRotation(Math.atan2(tpr.y - tp.y, tpr.x - tp.x));
        applyWiggleToSegments(this);
    }

    _histAt(i) {
        if (this._history.length === 0) return { x: this.x, y: this.y };
        return this._history[Math.min(i, this._history.length - 1)];
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    destroy(fromScene) {
        if (this._shieldGfx?.active) this._shieldGfx.destroy();
        this._shieldGfx = null;
        for (const img of this._bodyImgs) { if (img?.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg?.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
