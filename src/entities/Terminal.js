const WIDTH = 40;
const HEIGHT = 30;
const PROXIMITY = 50; // px — activation range
const DEFAULT_COOLDOWN = 10000; // ms

export default class Terminal extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y
     * @param {object} opts
     * @param {string} opts.label — display name (e.g. "CANNON", "SHIELD")
     * @param {number} [opts.cooldown] — cooldown duration in ms
     * @param {function} opts.launchMinigame — called with (terminal, onSuccess, onFailure)
     * @param {function} opts.onSuccess — called when minigame succeeds
     */
    constructor(scene, x, y, opts) {
        super(scene, x, y);
        scene.add.existing(this);

        this.terminalState = 'IDLE'; // IDLE | ACTIVE | COOLING_DOWN
        this.cooldownDuration = opts.cooldown || DEFAULT_COOLDOWN;
        this.launchMinigame = opts.launchMinigame;
        this.onSuccess = opts.onSuccess;
        this.label = opts.label || 'TERMINAL';

        // --- Graphics ---
        this.gfx = scene.add.graphics();
        this.add(this.gfx);

        // Screen glow (inner rectangle)
        this.screenGlow = scene.add.rectangle(0, 0, WIDTH - 8, HEIGHT - 8, 0x44ffcc, 0.3);
        this.add(this.screenGlow);

        // Label text
        this.labelText = scene.add.text(0, -HEIGHT / 2 - 10, this.label, {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: '#44ffcc',
        }).setOrigin(0.5);
        this.add(this.labelText);

        // E prompt (hidden by default)
        this.ePrompt = scene.add.text(0, HEIGHT / 2 + 8, '[E]', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setVisible(false);
        this.add(this.ePrompt);

        // Cooldown overlay
        this.cooldownOverlay = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.6).setVisible(false);
        this.add(this.cooldownOverlay);

        this.cooldownText = scene.add.text(0, 0, '', {
            fontSize: '9px',
            fontFamily: 'monospace',
            color: '#888888',
        }).setOrigin(0.5).setVisible(false);
        this.add(this.cooldownText);

        this.snailNearby = false;
        this.drawTerminal(false);
    }

    drawTerminal(highlighted) {
        const g = this.gfx;
        g.clear();

        // Outer frame
        g.fillStyle(0x1a3333, 1);
        g.fillRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);

        // Outline — white if highlighted, teal otherwise
        const outlineColor = highlighted ? 0xffffff : 0x44ffcc;
        const outlineAlpha = highlighted ? 0.9 : 0.4;
        g.lineStyle(highlighted ? 2 : 1.5, outlineColor, outlineAlpha);
        g.strokeRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
    }

    /**
     * Called each frame with the snail reference to check proximity
     * @param {import('./Snail.js').default} snail
     */
    updateProximity(snail) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        const near = dist < PROXIMITY && this.terminalState === 'IDLE';

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
        this.screenGlow.fillColor = 0x44ffcc;
        this.screenGlow.fillAlpha = 0.3;

        if (success && this.onSuccess) {
            this.onSuccess();
        }

        // Start cooldown
        const cd = success ? this.cooldownDuration : 3000; // short cooldown on failure
        this.startCooldown(cd);
    }

    startCooldown(duration) {
        this.terminalState = 'COOLING_DOWN';
        this.cooldownOverlay.setVisible(true);
        this.cooldownText.setVisible(true);
        this.snailNearby = false;
        this.drawTerminal(false);

        const startTime = this.scene.time.now;
        const timer = this.scene.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => {
                const elapsed = this.scene.time.now - startTime;
                const remaining = Math.max(0, duration - elapsed);
                this.cooldownText.setText(`${Math.ceil(remaining / 1000)}s`);

                if (remaining <= 0) {
                    timer.remove(false);
                    this.terminalState = 'IDLE';
                    this.cooldownOverlay.setVisible(false);
                    this.cooldownText.setVisible(false);
                }
            },
        });
    }

    /** Cancel any active minigame on this terminal (e.g. from teleport) */
    cancelMinigame(snail) {
        if (this.terminalState === 'ACTIVE') {
            snail.hackingActive = false;
            snail.setState('IDLE');
            this.screenGlow.fillColor = 0x44ffcc;
            this.screenGlow.fillAlpha = 0.3;
            this.startCooldown(3000);
        }
    }
}
