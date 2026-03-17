/**
 * Anaconda — World 2 boss snake.
 *
 * Body: same segment-history system as Python but 2× larger sprites
 * (already baked into the SVG assets) and the same scale factors.
 *
 * Attack cycle (repeating after ATTACK_COOLDOWN):
 *   1. CIRCLING  — orbits the arena at CIRCLE_RADIUS, polling for a clear
 *                  line-of-sight from the head to the snail.  The orbit
 *                  continues until LOS is unobstructed for ≥200 ms.
 *   2. MOUTH_OPEN — stops, cycles through the four opening-frame textures
 *                  over MOUTH_OPEN_DURATION ms, then holds fully open for
 *                  MOUTH_HOLD_MS ms.
 *   3. CHARGING  — charges at the snail's position captured at the start of
 *                  MOUTH_OPEN at CHARGE_SPEED px/s for up to CHARGE_DURATION ms.
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
        this._mouthFrameIdx  = 0;
        this._mouthTimer     = 0;
        this._chargeTarget   = null;
        this._chargeMs       = 0;

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
            case 'mouth_open': this._tickMouthOpen(delta, cfg); break;
            case 'charging':   this._tickCharging(delta, dt, cfg); break;
        }

        this._pushHistory(time);
        this._updateSegments();
        this._rebuildBodyHitboxes();

        if (this.shielded) { this._shieldAngle += dt * 2.5; this._drawShield(); }

        const snail = this.scene.snail;
        const dist  = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        if (dist < this.radius + 20) return 'reached_snail';
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
        // Pursuit speed — fast enough to stay on the orbit ring
        const orbitSpeed = Math.min(cfg.SPEED * 1.8 * mult, orbitDist * 5);

        this.x += Math.cos(toOrbit) * orbitSpeed * dt;
        this.y += Math.sin(toOrbit) * orbitSpeed * dt;
        this._headImg.setRotation(Math.atan2(snail.y - this.y, snail.x - this.x));

        if (this._hasLOS(snail.x, snail.y)) {
            this._losOkMs += delta;
            if (this._losOkMs >= 200) this._startMouthOpen();
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
            const px   = img.x - ox, py = img.y - oy;
            const along = px * nx + py * ny;
            if (along < 0 || along > len) continue;
            if (Math.abs(px * ny - py * nx) < r) return false;
        }
        return true;
    }

    // ── Mouth open ────────────────────────────────────────────────────────────

    _startMouthOpen() {
        const snail = this.scene.snail;
        this._attackPhase   = 'mouth_open';
        this._mouthFrameIdx = 0;
        this._mouthTimer    = 0;
        this._chargeTarget  = { x: snail.x, y: snail.y };
        this.scene.soundSynth?.play('snakeHiss');
    }

    _tickMouthOpen(delta, cfg) {
        this._mouthTimer += delta;
        const snail = this.scene.snail;

        // Step through frames evenly over MOUTH_OPEN_DURATION
        const frameDur   = cfg.MOUTH_OPEN_DURATION / (MOUTH_FRAMES.length - 1);
        const targetFrame = Math.min(
            Math.floor(this._mouthTimer / frameDur),
            MOUTH_FRAMES.length - 1,
        );
        if (targetFrame !== this._mouthFrameIdx) {
            this._mouthFrameIdx = targetFrame;
            this._headImg.setTexture(MOUTH_FRAMES[this._mouthFrameIdx]);
        }

        // Keep facing the snail while the mouth opens
        this._headImg.setRotation(Math.atan2(snail.y - this.y, snail.x - this.x));

        // Fully open + hold period expired → charge
        if (this._mouthFrameIdx >= MOUTH_FRAMES.length - 1 &&
                this._mouthTimer >= cfg.MOUTH_OPEN_DURATION + cfg.MOUTH_HOLD_MS) {
            this._startCharge();
        }
    }

    // ── Charge ────────────────────────────────────────────────────────────────

    _startCharge() {
        // Lock on to snail's current position
        const snail = this.scene.snail;
        this._chargeTarget = { x: snail.x, y: snail.y };
        this._attackPhase  = 'charging';
        this._chargeMs     = 0;
        this.scene.soundSynth?.play('snakeHiss');
    }

    _tickCharging(delta, dt, cfg) {
        this._chargeMs += delta;

        const { x: tx, y: ty } = this._chargeTarget;
        const angle = Math.atan2(ty - this.y, tx - this.x);
        const mult  = this.scene.enemySpeedMultiplier || 1.0;

        this.x += Math.cos(angle) * cfg.CHARGE_SPEED * mult * dt;
        this.y += Math.sin(angle) * cfg.CHARGE_SPEED * mult * dt;
        this._headImg.setRotation(angle);

        const arrived = Phaser.Math.Distance.Between(this.x, this.y, tx, ty) < 30;
        if (this._chargeMs >= cfg.CHARGE_DURATION || arrived) {
            this._endCharge();
        }
    }

    _endCharge() {
        this._attackPhase    = 'slither';
        this._attackCooldown = CONFIG.ANACONDA.ATTACK_COOLDOWN;
        this._headImg.setTexture('snake-anaconda-head');
        this._mouthFrameIdx  = 0;
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
