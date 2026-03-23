/**
 * Anaconda — World 2 boss snake.
 *
 * Body: same segment-history system as Python but 2× larger sprites
 * (already baked into the SVG assets) and the same scale factors.
 *
 * Attack cycle (repeating):
 *
 *   1. SLITHER       — (first entry only) sinusoidal approach toward snail.
 *   2. CIRCLING      — orbits arena centre; polls for 200 ms unbroken LOS → PEEKING.
 *   3. PEEKING       — holds position; mouth-open frames telegraph the charge over
 *                      MOUTH_OPEN_DURATION ms + MOUTH_HOLD_MS hold → CHARGING.
 *   4. CHARGING      — rockets in charge direction at CHARGE_SPEED; one snail hit
 *                      allowed per pass; exits off-screen → OFFSCREEN_WAIT.
 *   5. OFFSCREEN_WAIT — entire body hidden; head parked far off-screen; waits
 *                      OFFSCREEN_WAIT_MS, then respawns at the exit edge → EDGE_PEEK.
 *   6. EDGE_PEEK     — head teleported to just outside the exit edge with a fresh
 *                      position history (body stacked off-screen); slides inward to
 *                      PEEK_INSET while mouth opens; after MOUTH_HOLD_MS → CIRCLING.
 *
 * Charging alternates sides naturally: after EDGE_PEEK entry from edge X the snake
 * orbits the arena and fires toward the snail — typically across to the opposite side.
 * Body segments are always correctly oriented because history is rebuilt on each respawn.
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
const PEEK_INSET     = 60;   // px — head sits this far inside the edge during edge peek
const OFF_SCREEN_M   = 200;  // px past edge that counts as "fully exited" during charge
const CHARGE_CONT_R  = 48;   // px — contact radius against snail during charge
const EDGE_ENTER_DIST = 120; // px outside the screen edge where head spawns for edge peek

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
        this._history     = [{ x, y }];
        this._slitherTime = 0;

        // Shield state
        this.shielded     = true;
        this._shieldGfx   = null;
        this._shieldAngle = 0;

        // Attack state machine
        this._attackPhase    = 'slither';
        this._attackCooldown = cfg.ATTACK_COOLDOWN * 0.5;  // quicker first attack
        this._circleAngle    = Math.atan2(y - 360, x - 640);
        this._losOkMs        = 0;

        // Charge fields
        this._chargeDir          = { nx: 1, ny: 0 };  // normalised charge direction
        this._chargeHitThisPass  = false;              // target already hit this pass?
        this._chargeHitDecoy     = false;              // was the hit target the decoy?
        this._chargeTouchedSnail = false;              // consumed once per frame by update()
        this._chargeExitEdge     = 'right';            // 'left'|'right'|'top'|'bottom'
        this._chargeHeadExited   = false;              // head has crossed off-screen boundary

        // Offscreen wait timer (used in offscreen_wait state)
        this._offscreenWaitMs = 0;

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
        g.lineStyle(3, 0x44ff88, 0.7);
        g.strokeCircle(this.x, this.y, r);
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
        const burst = this.scene.add.circle(this.x, this.y, this.radius + 20, 0x44ff88, 0.6)
            .setDepth(this.depth + 3);
        this.scene.tweens.add({
            targets: burst, scaleX: 2.5, scaleY: 2.5, alpha: 0,
            duration: 400, ease: 'Power2.easeOut',
            onComplete: () => burst.destroy(),
        });
    }

    raiseShield() { this.shielded = true; }

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

    takeDamageRaw(amount) { return this.takeDamage(amount); }

    _onHitReactionEnd() { /* no segment recolouring needed */ }

    // ── Hitboxes ──────────────────────────────────────────────────────────────

    _rebuildBodyHitboxes() {
        const bodyR = CONFIG.ANACONDA.BODY_RADIUS;
        this._bodyHitboxes = [];
        for (let i = 0; i < this._segCount; i++) {
            const img = this._bodyImgs[i];
            if (!img || !img.active || !img.visible) continue;
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
            case 'slither':        this._tickSlither(delta, dt, cfg); break;
            case 'circling':       this._tickCircling(delta, dt, cfg); break;
            case 'peeking':        this._tickPeeking(delta, cfg); break;
            case 'charging':       this._tickCharging(delta, dt, cfg); break;
            case 'offscreen_wait': this._tickOffscreenWait(delta, cfg); break;
            case 'edge_peek':      this._tickEdgePeek(delta, dt, cfg); break;
        }

        this._pushHistory(time);
        this._updateSegments();
        this._rebuildBodyHitboxes();

        if (this.shielded) { this._shieldAngle += dt * 2.5; this._drawShield(); }

        // Charge contact — consumed once per frame
        if (this._chargeTouchedSnail) {
            this._chargeTouchedSnail = false;
            return this._chargeHitDecoy ? 'reached_decoy' : 'reached_snail';
        }

        // Proximity contact only during normal movement phases
        if (this._attackPhase === 'slither' || this._attackPhase === 'circling') {
            const target = this._getTarget();
            const dist   = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
            const decoy  = this.scene.decoy;
            if (dist < this.radius + 20) {
                return (decoy && decoy.active && target === decoy) ? 'reached_decoy' : 'reached_snail';
            }
        }

        return 'alive';
    }

    // ── Slither ───────────────────────────────────────────────────────────────

    _tickSlither(delta, dt, cfg) {
        this._attackCooldown -= delta;
        if (this._attackCooldown <= 0) {
            this._attackPhase = 'circling';
            this._losOkMs     = 0;
            this._circleAngle = Math.atan2(this.y - 360, this.x - 640);
            return;
        }

        const target    = this._getTarget();
        const mult      = this.scene.enemySpeedMultiplier || 1.0;
        const toTarget  = Math.atan2(target.y - this.y, target.x - this.x);
        this._slitherTime += dt;
        const moveAngle = toTarget + cfg.SLITHER_AMPLITUDE *
            Math.sin(this._slitherTime * cfg.SLITHER_FREQUENCY * Math.PI * 2);

        this.x += Math.cos(moveAngle) * this.speed * mult * dt;
        this.y += Math.sin(moveAngle) * this.speed * mult * dt;
        this._headImg.setRotation(moveAngle);
    }

    // ── Circling — orbit arena, poll LOS ─────────────────────────────────────

    _tickCircling(delta, dt, cfg) {
        const target = this._getTarget();
        const mult   = this.scene.enemySpeedMultiplier || 1.0;
        const CX = 640, CY = 360;

        this._circleAngle += cfg.CIRCLE_SPEED * dt * mult;
        const tx = CX + Math.cos(this._circleAngle) * cfg.CIRCLE_RADIUS;
        const ty = CY + Math.sin(this._circleAngle) * cfg.CIRCLE_RADIUS;

        const toOrbit    = Math.atan2(ty - this.y, tx - this.x);
        const orbitDist  = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
        const orbitSpeed = Math.min(cfg.SPEED * 1.8 * mult, orbitDist * 5);

        this.x += Math.cos(toOrbit) * orbitSpeed * dt;
        this.y += Math.sin(toOrbit) * orbitSpeed * dt;
        this._headImg.setRotation(Math.atan2(target.y - this.y, target.x - this.x));

        if (this._hasLOS(target.x, target.y)) {
            this._losOkMs += delta;
            if (this._losOkMs >= 200) this._startPeek();
        } else {
            this._losOkMs = 0;
        }
    }

    /** Returns the active decoy if one exists, otherwise the snail. */
    _getTarget() {
        const decoy = this.scene.decoy;
        return (decoy && decoy.active) ? decoy : this.scene.snail;
    }

    /**
     * True if the straight line from head to (tx,ty) isn't blocked by:
     *   • the anaconda's own body segments (skipping the first 4), or
     *   • the central hacking station.
     */
    _hasLOS(tx, ty) {
        const ox = this.x, oy = this.y;
        const dx = tx - ox, dy = ty - oy;
        const len = Math.hypot(dx, dy);
        if (len < 1) return true;
        const nx = dx / len, ny = dy / len;

        // Own body segments
        const bodyR = CONFIG.ANACONDA.BODY_RADIUS * 0.85;
        for (let i = 4; i < this._segCount; i++) {
            const img = this._bodyImgs[i];
            if (!img || !img.active || !img.visible) continue;
            const px    = img.x - ox, py = img.y - oy;
            const along = px * nx + py * ny;
            if (along < 0 || along > len) continue;
            if (Math.abs(px * ny - py * nx) < bodyR) return false;
        }

        // Hacking station — add a small margin so the anaconda clears it cleanly
        const station = this.scene.station;
        if (station?.active) {
            const sx    = station.x - ox, sy = station.y - oy;
            const along = sx * nx + sy * ny;
            if (along > 0 && along < len) {
                const stationR = station.radius + 16;
                if (Math.abs(sx * ny - sy * nx) < stationR) return false;
            }
        }

        return true;
    }

    // ── Peeking — hold in-arena, open mouth as charge telegraph ──────────────

    _startPeek() {
        const snail = this._getTarget();
        const dx  = snail.x - this.x;
        const dy  = snail.y - this.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        this._chargeDir          = { nx: dx / len, ny: dy / len };
        this._chargeHitThisPass  = false;
        this._chargeHitDecoy     = false;
        this._chargeHeadExited   = false;
        this._attackPhase        = 'peeking';
        this._mouthFrameIdx     = 0;
        this._mouthTimer        = 0;
        this._losOkMs           = 0;
        this.scene.soundSynth?.play('snakeHiss');
    }

    _tickPeeking(delta, cfg) {
        this._mouthTimer += delta;

        // Keep facing the charge direction
        this._headImg.setRotation(Math.atan2(this._chargeDir.ny, this._chargeDir.nx));

        const frameDur    = cfg.MOUTH_OPEN_DURATION / (MOUTH_FRAMES.length - 1);
        const targetFrame = Math.min(
            Math.floor(this._mouthTimer / frameDur),
            MOUTH_FRAMES.length - 1,
        );
        if (targetFrame !== this._mouthFrameIdx) {
            this._mouthFrameIdx = targetFrame;
            this._headImg.setTexture(MOUTH_FRAMES[this._mouthFrameIdx]);
        }

        if (this._mouthFrameIdx >= MOUTH_FRAMES.length - 1 &&
                this._mouthTimer >= cfg.MOUTH_OPEN_DURATION + cfg.MOUTH_HOLD_MS) {
            this._attackPhase = 'charging';
            this.scene.soundSynth?.play('snakeHiss');
        }
    }

    // ── Charging — rocket through arena, exit off-screen ─────────────────────

    _tickCharging(delta, dt, cfg) {
        const mult       = this.scene.enemySpeedMultiplier || 1.0;
        const { nx, ny } = this._chargeDir;

        this.x += nx * cfg.CHARGE_SPEED * mult * dt;
        this.y += ny * cfg.CHARGE_SPEED * mult * dt;
        this._headImg.setRotation(Math.atan2(ny, nx));

        // One hit per charge pass
        if (!this._chargeHitThisPass) {
            const target = this._getTarget();
            const decoy  = this.scene.decoy;
            if (Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) < this.radius + CHARGE_CONT_R) {
                this._chargeHitThisPass  = true;
                this._chargeTouchedSnail = true;
                this._chargeHitDecoy     = !!(decoy && decoy.active && target === decoy);
            }
        }

        // Record exit edge the moment the head crosses off-screen
        if (!this._chargeHeadExited && this._isOffScreen()) {
            this._chargeExitEdge   = this._computeExitEdge();
            this._chargeHeadExited = true;
        }

        // Wait for the tail to clear the screen before hiding + waiting
        if (this._chargeHeadExited && this._isTailOffScreen()) {
            this._chargeHeadExited = false;
            this._enterOffscreenWait();
        }
    }

    // ── Offscreen wait — hide snake, pause before re-entry ───────────────────

    _enterOffscreenWait() {
        // Hide body and tail so no segments streak across the screen
        for (const img of this._bodyImgs) img.setVisible(false);
        if (this._tailImg) this._tailImg.setVisible(false);

        // Park head far off-screen so it's not visible
        const { nx, ny } = this._chargeDir;
        this.x = 640 + nx * 2000;
        this.y = 360 + ny * 2000;

        // Collapse history to this single point — rebuilt cleanly on edge_peek entry
        this._history = [{ x: this.x, y: this.y }];

        this._offscreenWaitMs = 0;
        this._attackPhase     = 'offscreen_wait';
        this._headImg.setTexture('snake-anaconda-head');
        this._mouthFrameIdx   = 0;
    }

    _tickOffscreenWait(delta, cfg) {
        this._offscreenWaitMs += delta;
        if (this._offscreenWaitMs >= cfg.OFFSCREEN_WAIT_MS) {
            this._enterEdgePeek();
        }
    }

    // ── Edge peek — respawn at exit edge, slide in, open mouth, then circle ──

    _enterEdgePeek() {
        const target = this._getTarget();

        // Place head just outside the exit edge, aligned to target's cross-axis
        let ex, ey;
        switch (this._chargeExitEdge) {
            case 'right':
                ex = SCREEN_W + EDGE_ENTER_DIST;
                ey = Phaser.Math.Clamp(target.y, 80, SCREEN_H - 80);
                break;
            case 'left':
                ex = -EDGE_ENTER_DIST;
                ey = Phaser.Math.Clamp(target.y, 80, SCREEN_H - 80);
                break;
            case 'bottom':
                ex = Phaser.Math.Clamp(target.x, 80, SCREEN_W - 80);
                ey = SCREEN_H + EDGE_ENTER_DIST;
                break;
            case 'top':
                ex = Phaser.Math.Clamp(target.x, 80, SCREEN_W - 80);
                ey = -EDGE_ENTER_DIST;
                break;
        }

        // Teleport head to just outside the edge
        this.x = ex;
        this.y = ey;

        // Single-point history so all segments start stacked off-screen at the
        // spawn position. They will trail naturally behind as the head slides in.
        this._history = [{ x: ex, y: ey }];

        // Show body and tail — they'll emerge from behind the edge as head moves
        for (const img of this._bodyImgs) img.setPosition(ex, ey).setVisible(true);
        if (this._tailImg) this._tailImg.setPosition(ex, ey).setVisible(true);

        // Start mouth animation from the first frame
        this._mouthFrameIdx = 0;
        this._mouthTimer    = 0;
        this._headImg.setTexture(MOUTH_FRAMES[0]);
        this.scene.soundSynth?.play('snakeHiss');

        this._attackPhase = 'edge_peek';
    }

    _tickEdgePeek(delta, dt, cfg) {
        // Compute the peek target: PEEK_INSET inside the exit edge
        let tx, ty;
        switch (this._chargeExitEdge) {
            case 'right':  tx = SCREEN_W - PEEK_INSET; ty = this.y; break;
            case 'left':   tx = PEEK_INSET;             ty = this.y; break;
            case 'bottom': tx = this.x; ty = SCREEN_H - PEEK_INSET; break;
            case 'top':    tx = this.x; ty = PEEK_INSET;             break;
        }

        const slideSpeed = cfg.CHARGE_SPEED * 0.4;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);

        if (dist > 4) {
            // Slide head inward — body follows via history
            const angle = Math.atan2(ty - this.y, tx - this.x);
            this.x += Math.cos(angle) * Math.min(dist, slideSpeed * dt);
            this.y += Math.sin(angle) * Math.min(dist, slideSpeed * dt);
            this._headImg.setRotation(angle);
        } else {
            // Pinned at peek position — face into the arena
            this.x = tx;
            this.y = ty;
            this._headImg.setRotation(Math.atan2(360 - this.y, 640 - this.x));
        }

        // Advance mouth animation throughout the slide + hold
        this._mouthTimer += delta;
        const frameDur    = cfg.MOUTH_OPEN_DURATION / (MOUTH_FRAMES.length - 1);
        const targetFrame = Math.min(
            Math.floor(this._mouthTimer / frameDur),
            MOUTH_FRAMES.length - 1,
        );
        if (targetFrame !== this._mouthFrameIdx) {
            this._mouthFrameIdx = targetFrame;
            this._headImg.setTexture(MOUTH_FRAMES[this._mouthFrameIdx]);
        }

        // Once settled at peek position AND mouth fully open for hold duration → circling
        if (dist <= 4 &&
                this._mouthFrameIdx >= MOUTH_FRAMES.length - 1 &&
                this._mouthTimer >= cfg.MOUTH_OPEN_DURATION + cfg.MOUTH_HOLD_MS) {
            this._attackPhase   = 'circling';
            this._losOkMs       = 0;
            this._circleAngle   = Math.atan2(this.y - 360, this.x - 640);
            this._headImg.setTexture('snake-anaconda-head');
            this._mouthFrameIdx = 0;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Which screen edge does the current charge direction exit from? */
    _computeExitEdge() {
        const { nx, ny } = this._chargeDir;
        if (Math.abs(nx) >= Math.abs(ny)) return nx > 0 ? 'right' : 'left';
        return ny > 0 ? 'bottom' : 'top';
    }

    _isOffScreen() {
        return (
            this.x < -OFF_SCREEN_M || this.x > SCREEN_W + OFF_SCREEN_M ||
            this.y < -OFF_SCREEN_M || this.y > SCREEN_H + OFF_SCREEN_M
        );
    }

    /** True when every body segment AND the tail sprite are also off-screen. */
    _isTailOffScreen() {
        const margin = OFF_SCREEN_M;
        for (const img of this._bodyImgs) {
            if (!img || !img.active) continue;
            if (img.x > -margin && img.x < SCREEN_W + margin &&
                img.y > -margin && img.y < SCREEN_H + margin) return false;
        }
        if (this._tailImg?.active) {
            if (this._tailImg.x > -margin && this._tailImg.x < SCREEN_W + margin &&
                this._tailImg.y > -margin && this._tailImg.y < SCREEN_H + margin) return false;
        }
        return true;
    }

    // ── Segment helpers ───────────────────────────────────────────────────────

    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;
        this._history.unshift({ x: this.x, y: this.y });
        if (this._history.length > 1500) this._history.length = 1500;
    }

    _updateSegments() {
        const sp = this._spacing;
        for (let i = 0; i < this._bodyImgs.length; i++) {
            if (i >= this._segCount) break;
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(idx - sp);
            this._bodyImgs[i].setPosition(pos.x, pos.y);
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
