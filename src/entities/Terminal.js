import { CONFIG } from '../config.js';
import { startCooldown } from './shared/CooldownTimer.js';

// Map terminal label → SVG texture key loaded in GameScene.preload()
const LABEL_TO_SPRITE = {
    RELOAD: 'terminal-reload',
    TURRET: 'terminal-turret',
    SHIELD: 'terminal-shield',
    SLOW:   'terminal-slow',
    REPAIR: 'terminal-repair',
    DECOY:  'terminal-decoy',
    EMP:    'terminal-emp',
};

// Sprite is 64×64; the CRT screen sits roughly at y -8 relative to centre
const SPRITE_W = 64;
const SPRITE_H = 64;

export default class Terminal extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y
     * @param {object} opts
     * @param {string} opts.label — display name (e.g. "RELOAD", "TURRET")
     * @param {number} [opts.cooldown] — cooldown duration in ms
     * @param {function} opts.launchMinigame — called with (terminal, onSuccess, onFailure)
     * @param {function} opts.onSuccess — called when minigame succeeds
     */
    constructor(scene, x, y, opts) {
        super(scene, x, y);
        scene.add.existing(this);

        this.terminalState    = 'IDLE'; // IDLE | ACTIVE | EFFECT_ACTIVE | COOLING_DOWN
        this.cooldownDuration = opts.cooldown || 10000;
        this.effectDuration   = opts.effectDuration || 0;  // ms of "effect running" before cooldown starts
        this.launchMinigame   = opts.launchMinigame;
        this.onSuccess        = opts.onSuccess;
        this.label            = opts.label || 'TERMINAL';
        this.color            = opts.color || 0x44ffcc;

        // ── SVG sprite body ──────────────────────────────────────────────────
        const baseLabel = this.label.replace(/ II$/, '');
        const spriteKey = LABEL_TO_SPRITE[this.label] || LABEL_TO_SPRITE[baseLabel] || 'terminal-reload';
        this.bodyImg = scene.add.image(0, 0, spriteKey).setOrigin(0.5);
        this.add(this.bodyImg);

        // ── Highlight outline (graphics overlay drawn on top when nearby) ────
        this.gfx = scene.add.graphics();
        this.add(this.gfx);

        // ── Screen glow overlay (tinted rectangle over the CRT area) ────────
        // CRT screen is at approximately (0, -8) in sprite local space
        this.screenGlow = scene.add.rectangle(0, -8, SPRITE_W - 20, 18, this.color, 0.0);
        this.add(this.screenGlow);

        // ── Label text ───────────────────────────────────────────────────────
        const colorHex = '#' + this.color.toString(16).padStart(6, '0');
        this.labelText = scene.add.text(0, -SPRITE_H / 2 - 10, this.label, {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: colorHex,
        }).setOrigin(0.5);
        this.add(this.labelText);

        // ── E prompt (hidden by default) ─────────────────────────────────────
        this.ePrompt = scene.add.text(0, SPRITE_H / 2 + 4, '[E]', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setVisible(false);
        this.add(this.ePrompt);

        // ── Cooldown overlay ─────────────────────────────────────────────────
        this.cooldownOverlay = scene.add.rectangle(0, 0, SPRITE_W, SPRITE_H, 0x000000, 0.55).setVisible(false);
        this.add(this.cooldownOverlay);

        this.cooldownText = scene.add.text(0, 0, '', {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: '#888888',
        }).setOrigin(0.5).setVisible(false);
        this.add(this.cooldownText);

        this.snailNearby = false;
        this._setHighlight(false);
    }

    _setHighlight(highlighted) {
        const g = this.gfx;
        g.clear();
        if (highlighted) {
            g.lineStyle(2.5, 0xffffff, 0.85);
            g.strokeRect(-SPRITE_W / 2, -SPRITE_H / 2, SPRITE_W, SPRITE_H);
        }
        this.bodyImg.setAlpha(highlighted ? 1 : 0.85);
    }

    // Keep old name used internally
    drawTerminal(highlighted) { this._setHighlight(highlighted); }

    /**
     * Called each frame with the snail reference to check proximity
     * @param {import('./Snail.js').default} snail
     */
    updateProximity(snail) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        const near = dist < CONFIG.TERMINALS.PROXIMITY && this.terminalState === 'IDLE';

        if (near !== this.snailNearby) {
            this.snailNearby = near;
            this.ePrompt.setVisible(near);
            this.drawTerminal(near);
        }
    }

    /** Try to activate — returns true if activation started */
    tryActivate(snail) {
        if (!this.snailNearby || this.terminalState !== 'IDLE') return false;

        this.terminalState = 'ACTIVE';
        snail.hackingActive = true;
        snail.setState('HACKING');
        this.ePrompt.setVisible(false);
        this.screenGlow.fillColor = 0xffdd44;
        this.screenGlow.fillAlpha = 0.5;

        // Launch the assigned minigame
        this.launchMinigame(
            this,
            // onSuccess
            () => this.handleMinigameResult(snail, true),
            // onFailure
            () => this.handleMinigameResult(snail, false),
        );

        return true;
    }

    handleMinigameResult(snail, success) {
        snail.hackingActive = false;
        snail.setState('IDLE');
        this.screenGlow.fillColor = this.color;
        this.screenGlow.fillAlpha = 0.3;

        if (success && this.onSuccess) {
            this.onSuccess();
        }

        if (!success) {
            this.startCooldown(CONFIG.TERMINALS.FAILURE_COOLDOWN);
        } else if (this.effectDuration > 0) {
            this.startEffect(this.effectDuration, this.cooldownDuration);
        } else {
            this.startCooldown(this.cooldownDuration);
        }
    }

    /**
     * Show the terminal as "effect active" for effectDuration ms, then
     * automatically transition into the normal cooldown for cooldownDuration ms.
     * The terminal is locked (not hackable) during both phases.
     */
    startEffect(effectDuration, cooldownDuration) {
        if (this._effectHandle)   { this._effectHandle.cancel();   this._effectHandle   = null; }
        if (this._cooldownHandle) { this._cooldownHandle.cancel(); this._cooldownHandle = null; }

        this.terminalState = 'EFFECT_ACTIVE';
        this.snailNearby = false;
        this.ePrompt.setVisible(false);
        this.drawTerminal(false);

        // Bright screen glow while active
        this.screenGlow.fillColor = this.color;
        this.screenGlow.fillAlpha = 0.6;

        // Subtle dark overlay + countdown text in the terminal's own colour
        this.cooldownOverlay.setFillStyle(0x000000, 0.3).setVisible(true);
        const colorHex = '#' + this.color.toString(16).padStart(6, '0');
        this.cooldownText.setText('ACTIVE').setColor(colorHex).setVisible(true);

        this._effectHandle = startCooldown(
            this.scene, effectDuration, 100,
            (remaining) => {
                this.cooldownText.setText(`ACT ${Math.ceil(remaining / 1000)}s`);
            },
            () => {
                this._effectHandle = null;
                // Effect over — dim the screen and start the post-effect cooldown
                this.screenGlow.fillAlpha = 0;
                this.startCooldown(cooldownDuration);
            },
        );
    }

    startCooldown(duration) {
        // Cancel any in-flight timers before starting a new one
        if (this._effectHandle)   { this._effectHandle.cancel();   this._effectHandle   = null; }
        if (this._cooldownHandle) { this._cooldownHandle.cancel(); this._cooldownHandle = null; }

        this.terminalState = 'COOLING_DOWN';
        this.cooldownOverlay.setFillStyle(0x000000, 0.55);
        this.cooldownOverlay.setVisible(true);
        this.cooldownText.setColor('#888888').setVisible(true);
        this.snailNearby = false;
        this.drawTerminal(false);

        this._cooldownHandle = startCooldown(
            this.scene, duration, 100,
            (remaining) => {
                this.cooldownText.setText(`${Math.ceil(remaining / 1000)}s`);
            },
            () => {
                this._cooldownHandle = null;
                this.terminalState = 'IDLE';
                this.cooldownOverlay.setVisible(false);
                this.cooldownText.setVisible(false);
            },
        );
    }

    /**
     * Immediately lock this terminal into COOLING_DOWN for a fixed duration.
     * Called when a Terminal Lock EMP projectile hits. Shows a red "LOCKED!" overlay.
     * Safe to call even if the terminal is already cooling down.
     */
    forceLock(duration) {
        if (this.terminalState === 'ACTIVE') return; // don't interrupt a running minigame

        // Cancel any in-flight timers so their onComplete won't fire and override us
        if (this._effectHandle)   { this._effectHandle.cancel();   this._effectHandle   = null; }
        if (this._cooldownHandle) { this._cooldownHandle.cancel(); this._cooldownHandle = null; }

        this.terminalState = 'COOLING_DOWN';
        this.snailNearby = false;
        this.ePrompt.setVisible(false);
        this.drawTerminal(false);

        // Red locked overlay
        this.cooldownOverlay.setFillStyle(0x550000, 0.72).setVisible(true);
        this.cooldownText.setText('LOCKED!').setColor('#ff4422').setVisible(true);
        this.screenGlow.fillColor = 0xff2200;
        this.screenGlow.fillAlpha = 0.6;

        // Pulse the screen glow for the lock duration
        const pulseTween = this.scene.tweens.add({
            targets:  this.screenGlow,
            fillAlpha: 0.15,
            duration: 450,
            yoyo:     true,
            repeat:   -1,
        });

        // Unlock after duration
        this.scene.time.delayedCall(duration, () => {
            if (!this.active) return;
            pulseTween.stop();
            this.terminalState = 'IDLE';
            this.cooldownOverlay.setFillStyle(0x000000, 0.55).setVisible(false);
            this.cooldownText.setColor('#888888').setVisible(false);
            this.screenGlow.fillColor = this.color;
            this.screenGlow.fillAlpha = 0;
        });
    }

    /**
     * Autonomously activate this terminal (drone upgrade — no minigame).
     * Calls onSuccess and starts a full cooldown. Returns false if not IDLE.
     */
    droneActivate() {
        if (this.terminalState !== 'IDLE') return false;

        this.terminalState = 'ACTIVE';
        this.ePrompt.setVisible(false);
        this.screenGlow.fillColor = 0xffdd44;
        this.screenGlow.fillAlpha = 0.8;

        // Brief visible flash, then trigger success + cooldown
        this.scene.time.delayedCall(350, () => {
            if (!this.active) return;
            this.screenGlow.fillColor = this.color;
            this.screenGlow.fillAlpha = 0.3;
            if (this.onSuccess) this.onSuccess();
            this.startCooldown(this.cooldownDuration);
        });

        return true;
    }

    /** Cancel any active minigame on this terminal (e.g. from teleport) */
    cancelMinigame(snail) {
        if (this.terminalState === 'ACTIVE') {
            snail.hackingActive = false;
            snail.setState('IDLE');
            this.screenGlow.fillColor = this.color;
            this.screenGlow.fillAlpha = 0.3;
            this.startCooldown(CONFIG.TERMINALS.FAILURE_COOLDOWN);
        }
    }
}
