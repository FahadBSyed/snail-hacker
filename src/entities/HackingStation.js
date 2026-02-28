const MAX_HEALTH = 100;
const RADIUS = 50;

export default class HackingStation extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health = MAX_HEALTH;
        this.maxHealth = MAX_HEALTH;
        this.radius = RADIUS;

        // Draw hexagon
        const gfx = scene.add.graphics();
        this.gfx = gfx;
        this.add(gfx);
        this.drawStation();

        // Health bar (positioned above station)
        this.healthBarBg = scene.add.rectangle(0, -70, 104, 12, 0x333333).setOrigin(0.5);
        this.healthBarFill = scene.add.rectangle(-50, -70, 100, 8, 0x44ff44).setOrigin(0, 0.5);
        this.add(this.healthBarBg);
        this.add(this.healthBarFill);
    }

    drawStation() {
        const g = this.gfx;
        g.clear();

        // Outer glow — alpha based on health
        const glowAlpha = 0.15 * (this.health / this.maxHealth);
        g.fillStyle(0x00ffcc, glowAlpha);
        g.fillCircle(0, 0, RADIUS + 15);

        // Hexagon body
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            points.push({
                x: Math.cos(angle) * RADIUS,
                y: Math.sin(angle) * RADIUS,
            });
        }

        g.fillStyle(0x0a2a2a, 1);
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 6; i++) {
            g.lineTo(points[i].x, points[i].y);
        }
        g.closePath();
        g.fillPath();

        // Hexagon outline — color shifts from cyan to red as health drops
        const healthPct = this.health / this.maxHealth;
        const r = Math.round(255 * (1 - healthPct));
        const gb = Math.round(255 * healthPct);
        const outlineColor = (r << 16) | (gb << 8) | gb;
        const outlineAlpha = 0.4 + 0.6 * healthPct;

        g.lineStyle(2.5, outlineColor, outlineAlpha);
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 6; i++) {
            g.lineTo(points[i].x, points[i].y);
        }
        g.closePath();
        g.strokePath();

        // Inner detail — small hexagon
        g.lineStyle(1, 0x00ffcc, 0.2);
        g.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const px = Math.cos(angle) * (RADIUS * 0.4);
            const py = Math.sin(angle) * (RADIUS * 0.4);
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.closePath();
        g.strokePath();
    }

    /** Activate a damage shield for `duration` ms. Returns false if already shielded. */
    shield(duration) {
        if (this.shielded) return false;
        this.shielded = true;

        this.shieldGfx = this.scene.add.graphics().setDepth(50);
        this.shieldGfx.fillStyle(0x4488ff, 0.15);
        this.shieldGfx.fillCircle(this.x, this.y, 85);
        this.shieldGfx.lineStyle(2.5, 0x88ccff, 0.8);
        this.shieldGfx.strokeCircle(this.x, this.y, 85);

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
        this.updateHealthBar();
        this.drawStation();
        return this.health <= 0;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
        this.updateHealthBar();
        this.drawStation();
    }

    updateHealthBar() {
        const pct = this.health / this.maxHealth;
        this.healthBarFill.width = 100 * pct;

        if (pct > 0.5) {
            this.healthBarFill.fillColor = 0x44ff44;
        } else if (pct > 0.25) {
            this.healthBarFill.fillColor = 0xffdd44;
        } else {
            this.healthBarFill.fillColor = 0xff4444;
        }

        // Pulse glow when low health
        if (pct <= 0.3 && !this._pulseTween) {
            this._pulseTween = this.scene.tweens.add({
                targets: this.gfx,
                alpha: 0.55,
                duration: 400,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1,
            });
        } else if (pct > 0.3 && this._pulseTween) {
            this._pulseTween.stop();
            this._pulseTween = null;
            this.gfx.alpha = 1;
        }
    }
}
