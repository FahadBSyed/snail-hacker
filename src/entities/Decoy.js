import { CONFIG } from '../config.js';

/**
 * Decoy lure beacon — deployed via the DECOY terminal upgrade.
 * All aliens retarget toward this instead of the snail while it's active.
 * Aliens that reach it deal damage to it; at 0 HP or after DECOY_DURATION it expires.
 */
export default class Decoy extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(40);

        this.maxHealth = CONFIG.TERMINALS.DECOY.HEALTH;
        this.health    = this.maxHealth;
        this.radius    = 18;

        this._gfx = scene.add.graphics();
        this.add(this._gfx);
        this._draw();

        // Pulse rings that expand outward
        this._spawnRing();
        this._ringTimer = scene.time.addEvent({
            delay: 650, loop: true, callback: () => this._spawnRing(),
        });

        // Duration limit
        this._expireTimer = scene.time.delayedCall(
            CONFIG.TERMINALS.DECOY.DURATION,
            () => this._expire(),
        );

        // Label floating above
        this._label = scene.add.text(x, y - 32, 'DECOY', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ff88ee', alpha: 0.8,
        }).setOrigin(0.5).setDepth(41);
    }

    _draw() {
        const g    = this._gfx;
        const hp   = this.health / this.maxHealth;
        const col  = 0xff44cc;
        g.clear();

        // Outer soft aura
        g.fillStyle(col, 0.12);
        g.fillCircle(0, 0, this.radius + 10);

        // Main body
        g.fillStyle(col, 0.85);
        g.fillCircle(0, 0, this.radius);

        // Bright core
        g.fillStyle(0xffffff, 0.55);
        g.fillCircle(0, 0, 6);

        // Cross-hair lines
        g.lineStyle(1, 0xffffff, 0.35);
        g.beginPath(); g.moveTo(-this.radius, 0); g.lineTo(this.radius, 0); g.strokePath();
        g.beginPath(); g.moveTo(0, -this.radius); g.lineTo(0, this.radius); g.strokePath();

        // Health bar (below the beacon)
        const bw = 32;
        const by = this.radius + 7;
        g.fillStyle(0x000000, 0.5);
        g.fillRect(-bw / 2, by, bw, 4);
        g.fillStyle(col, 1);
        g.fillRect(-bw / 2, by, bw * hp, 4);
    }

    _spawnRing() {
        if (!this.active) return;
        // Container at decoy world position with a graphics circle drawn at (0,0)
        // — tweening the container's scale expands from its center.
        const g = this.scene.add.graphics();
        g.lineStyle(2, 0xff44cc, 0.85);
        g.strokeCircle(0, 0, this.radius + 2);
        const c = this.scene.add.container(this.x, this.y, [g]).setDepth(39).setAlpha(0.9);
        this.scene.tweens.add({
            targets:  c,
            scaleX:   4.5,
            scaleY:   4.5,
            alpha:    0,
            duration: 900,
            ease:     'Sine.easeOut',
            onComplete: () => { g.destroy(); c.destroy(); },
        });
    }

    /** Called when an alien reaches the decoy. */
    takeDamage(amount) {
        this.health -= amount;
        this._draw();
        if (this.health <= 0) this._expire();
    }

    _expire() {
        if (!this.active) return;
        this._ringTimer.remove(false);
        this._expireTimer.remove(false);
        if (this._label && this._label.active) this._label.destroy();

        // Dissolve burst
        const flash = this.scene.add.circle(this.x, this.y, this.radius * 1.5, 0xff44cc, 0.7)
            .setDepth(45);
        this.scene.tweens.add({
            targets: flash, alpha: 0, scaleX: 4, scaleY: 4,
            duration: 450, onComplete: () => flash.destroy(),
        });

        if (this.scene) this.scene.decoy = null;
        this.destroy();
    }

    destroy(fromScene) {
        // Clean up timers if destroyed externally (e.g. scene shutdown)
        if (this._ringTimer)   this._ringTimer.remove(false);
        if (this._expireTimer) this._expireTimer.remove(false);
        if (this._label && this._label.active) this._label.destroy();
        super.destroy(fromScene);
    }
}
