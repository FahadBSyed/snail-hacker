/**
 * Anaconda — World 2 boss snake.
 *
 * Body: same segment-history system as Python but 2× larger sprites
 * (already baked into the SVG assets) and the same scale factors.
 *
 * Attack cycle (repeating after ATTACK_COOLDOWN):
 *
 *   FIRST PASS — from inside the arena
 *   1. CIRCLING    — orbits arena polling for clear LOS to the snail.
 *   2. PEEKING     — stops in place; mouth-open frames telegraph the charge.
 *   3. CHARGING    — rockets in the fixed charge direction; continues through
 *                    the snail (one hit per sequence) until head exits screen.
 *
 *   WAIT
 *   4. EXITING     — drifts off-screen; waits until every body segment is gone,
 *                    then holds for 1 second.
 *
 *   SECOND PASS — from the exit edge
 *   5. EDGE_ENTER  — head returns to PEEK_INSET on the exit edge.
 *   6. EDGE_CIRCLE — slides along that edge toward the snail's cross-axis;
 *                    polls LOS (200 ms debounce) with updated charge direction.
 *   7. PEEKING     — mouth-open telegraph from the edge.
 *   8. CHARGING    — second charge; when head exits → SLITHER + cooldown.
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

const SCREEN_W     = 1280;
const SCREEN_H     = 720;
const PEEK_INSET   = 60;   // px — head sits this far inside the edge during edge peek
const OFF_SCREEN_M = 200;  // px past edge that counts as "fully exited"
const CHARGE_CONT_R = 48;  // px — contact radius against snail during charge
const EXIT_WAIT_MS  = 1000; // ms to wait after body fully clears before peeking

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

        // Charge fields
        this._chargeDir        = { nx: 1, ny: 0 };  // normalised charge direction
        this._chargePassCount  = 0;                  // 0 = first (arena), 1 = second (edge)
        this._chargeHitThisSeq = false;              // snail hit this charge sequence?
        this._chargeTouchedSnail = false;            // consumed by update() return value

        // Exit / edge-peek fields
        this._chargeExitEdge = 'right';  // 'left'|'right'|'top'|'bottom'
        this._bodyAllClear   = false;    // has every segment gone off-screen?
        this._exitWaitMs     = 0;        // ms elapsed after body clears

        // Pre-charge wait fields (extended LOS-verified delay before peeking)
        this._preChargeSource     = 'circling'; // which state we came from
        this._preChargeWaitMs     = 0;          // ms of unbroken LOS accumulated
        this._preChargeWaitTarget = 0;          // target duration (1–3 s, randomised)

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
        this._tailHitboxes = [];
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
            case 'slither':           this._tickSlither(delta, dt, cfg); break;
            case 'circling':          this._tickCircling(delta, dt, cfg); break;
            case 'pre_charge_wait':   this._tickPreChargeWait(delta, dt, cfg); break;
            case 'peeking':           this._tickPeeking(delta, cfg); break;
            case 'charging':          this._tickCharging(delta, dt, cfg); break;
            case 'exiting':           this._tickExiting(delta, dt, cfg); break;
            case 'edge_enter':        this._tickEdgeEnter(delta, dt, cfg); break;
            case 'edge_circle':       this._tickEdgeCircle(delta, dt, cfg); break;
        }

        this._pushHistory(time);
        this._updateSegments();
        this._rebuildBodyHitboxes();

        if (this.shielded) { this._shieldAngle += dt * 2.5; this._drawShield(); }

        // Charge contact — consumed once per frame
        if (this._chargeTouchedSnail) {
            this._chargeTouchedSnail = false;
            return 'reached_snail';
        }

        // Proximity contact only during normal movement phases
        if (this._attackPhase === 'slither' || this._attackPhase === 'circling') {
            const snail = this.scene.snail;
            const dist  = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 20) return 'reached_snail';
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

    // ── Circling — orbit arena, poll LOS ─────────────────────────────────────

    _tickCircling(delta, dt, cfg) {
        const snail = this.scene.snail;
        const mult  = this.scene.enemySpeedMultiplier || 1.0;
        const CX = 640, CY = 360;

        this._circleAngle += cfg.CIRCLE_SPEED * dt * mult;
        const tx = CX + Math.cos(this._circleAngle) * cfg.CIRCLE_RADIUS;
        const ty = CY + Math.sin(this._circleAngle) * cfg.CIRCLE_RADIUS;

        const toOrbit    = Math.atan2(ty - this.y, tx - this.x);
        const orbitDist  = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
        const orbitSpeed = Math.min(cfg.SPEED * 1.8 * mult, orbitDist * 5);

        this.x += Math.cos(toOrbit) * orbitSpeed * dt;
        this.y += Math.sin(toOrbit) * orbitSpeed * dt;
        this._headImg.setRotation(Math.atan2(snail.y - this.y, snail.x - this.x));

        if (this._hasLOS(snail.x, snail.y)) {
            this._losOkMs += delta;
            if (this._losOkMs >= 200) this._startPreChargeWait('circling');
        } else {
            this._losOkMs = 0;
        }
    }

    /** True if the straight line from head to (tx,ty) isn't blocked by own body. */
    _hasLOS(tx, ty) {
        const ox = this.x, oy = this.y;
        const dx = tx - ox, dy = ty - oy;
        const len = Math.hypot(dx, dy);
        if (len < 1) return true;
        const nx = dx / len, ny = dy / len;
        const r  = CONFIG.ANACONDA.BODY_RADIUS * 0.85;
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

    // ── First peek: stop in-arena, open mouth as telegraph ───────────────────

    _startFirstPeek() {
        const snail = this.scene.snail;
        const dx  = snail.x - this.x;
        const dy  = snail.y - this.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        this._chargeDir        = { nx: dx / len, ny: dy / len };
        this._chargePassCount  = 0;
        this._chargeHitThisSeq = false;
        this._attackPhase      = 'peeking';
        this._mouthFrameIdx    = 0;
        this._mouthTimer       = 0;
        this._losOkMs          = 0;
        this.scene.soundSynth?.play('snakeHiss');
    }

    // ── Pre-charge wait: hold with LOS verification 1–3 s before committing ──

    _startPreChargeWait(source) {
        this._preChargeSource     = source;
        this._preChargeWaitMs     = 0;
        this._preChargeWaitTarget = 1000 + Math.random() * 2000;  // 1–3 seconds
        this._losOkMs             = 0;
        this._attackPhase         = 'pre_charge_wait';
    }

    _tickPreChargeWait(delta, dt, cfg) {
        const snail = this.scene.snail;
        const mult  = this.scene.enemySpeedMultiplier || 1.0;

        // If we came from edge_circle, keep sliding along the edge so the aim stays live
        if (this._preChargeSource === 'edge_circle') {
            const speed = cfg.SPEED * mult;
            switch (this._chargeExitEdge) {
                case 'right':
                case 'left': {
                    const targetY = Phaser.Math.Clamp(snail.y, 80, SCREEN_H - 80);
                    const diff    = targetY - this.y;
                    this.y += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
                    break;
                }
                case 'top':
                case 'bottom': {
                    const targetX = Phaser.Math.Clamp(snail.x, 80, SCREEN_W - 80);
                    const diff    = targetX - this.x;
                    this.x += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
                    break;
                }
            }
            this._pinToEdge();
        }

        // Continuously update charge direction to track snail's live position
        const dx  = snail.x - this.x;
        const dy  = snail.y - this.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        this._chargeDir = { nx: dx / len, ny: dy / len };
        this._headImg.setRotation(Math.atan2(dy, dx));

        if (this._hasLOS(snail.x, snail.y)) {
            this._preChargeWaitMs += delta;
            if (this._preChargeWaitMs >= this._preChargeWaitTarget) {
                // Full wait elapsed with confirmed LOS — commit to charge telegraph
                if (this._preChargeSource === 'circling') {
                    this._startFirstPeek();
                } else {
                    // edge_circle path: charge dir already set; start mouth animation
                    this._chargePassCount  = this._chargePassCount || 1;
                    this._attackPhase      = 'peeking';
                    this._mouthFrameIdx    = 0;
                    this._mouthTimer       = 0;
                    this.scene.soundSynth?.play('snakeHiss');
                }
            }
        } else {
            // LOS broken — reset the accumulated wait; keep watching
            this._preChargeWaitMs = 0;
        }
    }

    // ── Peeking: hold in place, cycle mouth-open frames ──────────────────────

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

    // ── Charging: rocket through arena, continue past snail ──────────────────

    _tickCharging(delta, dt, cfg) {
        const mult  = this.scene.enemySpeedMultiplier || 1.0;
        const { nx, ny } = this._chargeDir;

        this.x += nx * cfg.CHARGE_SPEED * mult * dt;
        this.y += ny * cfg.CHARGE_SPEED * mult * dt;
        this._headImg.setRotation(Math.atan2(ny, nx));

        // One hit per full sequence
        if (!this._chargeHitThisSeq) {
            const snail = this.scene.snail;
            if (Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y) < this.radius + CHARGE_CONT_R) {
                this._chargeHitThisSeq   = true;
                this._chargeTouchedSnail = true;
            }
        }

        if (this._isOffScreen()) {
            this._chargePassCount++;
            if (this._chargePassCount < 2) {
                // First pass done — drift off, wait for body, peek from exit edge
                this._chargeExitEdge = this._computeExitEdge();
                this._bodyAllClear   = false;
                this._exitWaitMs     = 0;
                this._attackPhase    = 'exiting';
            } else {
                // Second pass done — return to slither
                this._endChargeSequence();
            }
        }
    }

    // ── Exiting: wait for entire snake to leave screen, then 1 s pause ───────

    _tickExiting(delta, dt, cfg) {
        // Keep moving at charge speed so the full body clears the screen promptly
        const mult = this.scene.enemySpeedMultiplier || 1.0;
        this.x += this._chargeDir.nx * cfg.CHARGE_SPEED * mult * dt;
        this.y += this._chargeDir.ny * cfg.CHARGE_SPEED * mult * dt;

        if (!this._bodyAllClear) {
            if (this._allOffScreen()) this._bodyAllClear = true;
            return; // still waiting for body
        }

        this._exitWaitMs += delta;
        if (this._exitWaitMs >= EXIT_WAIT_MS) {
            // Compute where on the exit edge the head should peek in
            this._edgePeekPos  = this._computeEdgePeekPos();
            this._attackPhase  = 'edge_enter';
        }
    }

    // ── Edge enter: head moves back to PEEK_INSET on the exit edge ───────────

    _tickEdgeEnter(delta, dt, cfg) {
        const speed = cfg.CHARGE_SPEED * 2.5;
        const { x: px, y: py } = this._edgePeekPos;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, px, py);

        if (dist < speed * dt + 4) {
            this.x = px;
            this.y = py;
            this._losOkMs     = 0;
            this._attackPhase = 'edge_circle';
        } else {
            const angle = Math.atan2(py - this.y, px - this.x);
            this.x += Math.cos(angle) * speed * dt;
            this.y += Math.sin(angle) * speed * dt;
            this._headImg.setRotation(angle);
        }
    }

    // ── Edge circle: slide along exit edge, aim at snail, poll LOS ───────────

    _tickEdgeCircle(delta, dt, cfg) {
        const snail = this.scene.snail;
        const mult  = this.scene.enemySpeedMultiplier || 1.0;
        const speed = cfg.SPEED * mult;

        // Slide along the edge toward the snail's cross-axis position
        switch (this._chargeExitEdge) {
            case 'right':
            case 'left': {
                const targetY = Phaser.Math.Clamp(snail.y, 80, SCREEN_H - 80);
                const diff    = targetY - this.y;
                this.y += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
                break;
            }
            case 'top':
            case 'bottom': {
                const targetX = Phaser.Math.Clamp(snail.x, 80, SCREEN_W - 80);
                const diff    = targetX - this.x;
                this.x += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
                break;
            }
        }
        // Keep head pinned at the edge inset depth
        this._pinToEdge();

        // Update charge direction each frame so it aims at snail's live position
        const dx  = snail.x - this.x;
        const dy  = snail.y - this.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        this._chargeDir = { nx: dx / len, ny: dy / len };
        this._headImg.setRotation(Math.atan2(dy, dx));

        // LOS check — body is off-screen so should clear quickly
        if (this._hasLOS(snail.x, snail.y)) {
            this._losOkMs += delta;
            if (this._losOkMs >= 200) this._startPreChargeWait('edge_circle');
        } else {
            this._losOkMs = 0;
        }
    }

    /** Pin the head's depth-axis coordinate to PEEK_INSET on the exit edge. */
    _pinToEdge() {
        switch (this._chargeExitEdge) {
            case 'right':  this.x = SCREEN_W - PEEK_INSET; break;
            case 'left':   this.x = PEEK_INSET;             break;
            case 'top':    this.y = PEEK_INSET;             break;
            case 'bottom': this.y = SCREEN_H - PEEK_INSET;  break;
        }
    }

    _endChargeSequence() {
        this._attackPhase    = 'slither';
        this._attackCooldown = CONFIG.ANACONDA.ATTACK_COOLDOWN;
        this._headImg.setTexture('snake-anaconda-head');
        this._mouthFrameIdx  = 0;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Which screen edge does the current charge direction exit from? */
    _computeExitEdge() {
        const { nx, ny } = this._chargeDir;
        if (Math.abs(nx) >= Math.abs(ny)) return nx > 0 ? 'right' : 'left';
        return ny > 0 ? 'bottom' : 'top';
    }

    /**
     * Peek position on the exit edge, aligned to the snail's current position
     * on the cross-axis so the second charge is naturally aimed.
     */
    _computeEdgePeekPos() {
        const snail = this.scene.snail;
        switch (this._chargeExitEdge) {
            case 'right':  return { x: SCREEN_W - PEEK_INSET, y: Phaser.Math.Clamp(snail.y, 80, SCREEN_H - 80) };
            case 'left':   return { x: PEEK_INSET,             y: Phaser.Math.Clamp(snail.y, 80, SCREEN_H - 80) };
            case 'bottom': return { x: Phaser.Math.Clamp(snail.x, 80, SCREEN_W - 80), y: SCREEN_H - PEEK_INSET };
            case 'top':    return { x: Phaser.Math.Clamp(snail.x, 80, SCREEN_W - 80), y: PEEK_INSET };
        }
    }

    /** True when the head AND every body segment/tail are outside the screen. */
    _allOffScreen() {
        if (!this._isOffScreen()) return false;  // head still on screen
        for (const img of this._bodyImgs) {
            if (!img || !img.active) continue;
            if (img.x > 0 && img.x < SCREEN_W && img.y > 0 && img.y < SCREEN_H) return false;
        }
        if (this._tailImg?.active) {
            if (this._tailImg.x > 0 && this._tailImg.x < SCREEN_W &&
                    this._tailImg.y > 0 && this._tailImg.y < SCREEN_H) return false;
        }
        return true;
    }

    _isOffScreen() {
        return (
            this.x < -OFF_SCREEN_M || this.x > SCREEN_W + OFF_SCREEN_M ||
            this.y < -OFF_SCREEN_M || this.y > SCREEN_H + OFF_SCREEN_M
        );
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
