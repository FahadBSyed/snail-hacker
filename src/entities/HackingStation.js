import { CONFIG } from '../config.js';

export default class HackingStation extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health = CONFIG.STATION.MAX_HEALTH;
        this.maxHealth = CONFIG.STATION.MAX_HEALTH;
        this.radius = CONFIG.STATION.RADIUS;

        // Draw hexagon
        const gfx = scene.add.graphics();
        this.gfx = gfx;
        this.add(gfx);
        this.drawStation();

        // Hack progress bar (shown above station)
        this.hackBarBg    = scene.add.rectangle(0, -70, 104, 12, 0x223333).setOrigin(0.5);
        this.hackBarFill  = scene.add.rectangle(-50, -70, 0, 8, 0x00ffcc).setOrigin(0, 0.5);
        this.hackBarLabel = scene.add.text(0, -82, 'HACK PROGRESS', {
            fontSize: '8px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5);
        this.add(this.hackBarBg);
        this.add(this.hackBarFill);
        this.add(this.hackBarLabel);

        // E prompt (hidden until snail is nearby)
        this.ePrompt = scene.add.text(0, this.radius + 25, '[E] HACK TERMINAL', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#00000099',
            padding: { x: 4, y: 2 },
        }).setOrigin(0.5).setVisible(false);
        this.add(this.ePrompt);

        this.isNearby = false;
        this.powered  = true;
        this.offlineLabel = null;
    }

    drawStation(offline = false) {
        const g   = this.gfx;
        const r   = this.radius;
        const col = offline ? 0xff3311 : 0x00ffcc;
        g.clear();

        // Outer glow
        g.fillStyle(col, offline ? 0.08 : 0.15);
        g.fillCircle(0, 0, r + 15);

        // Hexagon body
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }

        g.fillStyle(offline ? 0x1a0505 : 0x0a2a2a, 1);
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 6; i++) g.lineTo(points[i].x, points[i].y);
        g.closePath();
        g.fillPath();

        g.lineStyle(2.5, col, offline ? 0.5 : 0.9);
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 6; i++) g.lineTo(points[i].x, points[i].y);
        g.closePath();
        g.strokePath();

        // Inner detail hexagon
        g.lineStyle(1, col, offline ? 0.1 : 0.2);
        g.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const px = Math.cos(angle) * (r * 0.4);
            const py = Math.sin(angle) * (r * 0.4);
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.closePath();
        g.strokePath();
    }

    /** Switch the station's powered state — redraws visuals and manages offline label. */
    setPowered(on) {
        this.powered = on;
        this.drawStation(!on);
        if (!on) {
            if (!this.offlineLabel) {
                this.offlineLabel = this.scene.add.text(0, this.radius + 40, 'POWER OUT!\nFIND BATTERY', {
                    fontSize: '11px', fontFamily: 'monospace', color: '#ff4444',
                    backgroundColor: '#00000099', padding: { x: 4, y: 2 }, align: 'center',
                }).setOrigin(0.5, 0).setDepth(201);
                this.add(this.offlineLabel);
                this.scene.tweens.add({
                    targets: this.offlineLabel, alpha: 0.2, yoyo: true, repeat: -1, duration: 400,
                });
            }
        } else {
            if (this.offlineLabel) {
                this.offlineLabel.destroy();
                this.offlineLabel = null;
            }
        }
    }

    /** Update proximity detection — called each frame from GameScene */
    updateProximity(snail) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        const near = dist < CONFIG.TERMINALS.PROXIMITY + this.radius
            && !snail.hackingActive
            && !snail.carryingBattery
            && this.powered;
        if (near !== this.isNearby) {
            this.isNearby = near;
            this.ePrompt.setVisible(near);
        }
    }

    /** Update hack progress bar — fraction 0 to 1 */
    setHackProgress(fraction) {
        this.hackBarFill.width = 100 * Math.min(1, Math.max(0, fraction));
    }

    // ── Legacy methods — kept for potential future use ───────────────────────

    shield(duration) {
        if (this.shielded) return false;
        this.shielded = true;

        this.shieldGfx = this.scene.add.graphics().setDepth(50);
        const shieldR = this.radius + 35;
        this.shieldGfx.fillStyle(0x4488ff, 0.15);
        this.shieldGfx.fillCircle(this.x, this.y, shieldR);
        this.shieldGfx.lineStyle(2.5, 0x88ccff, 0.8);
        this.shieldGfx.strokeCircle(this.x, this.y, shieldR);

        this.shieldTween = this.scene.tweens.add({
            targets: this.shieldGfx,
            alpha: 0.45,
            duration: 550,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        this.scene.time.delayedCall(duration, () => this.unshield());
        return true;
    }

    unshield() {
        if (!this.shielded) return;
        this.shielded = false;
        if (this.shieldTween) { this.shieldTween.stop(); this.shieldTween = null; }
        if (this.shieldGfx)   { this.shieldGfx.destroy(); this.shieldGfx = null; }
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        return this.health <= 0;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }
}
