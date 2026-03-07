/**
 * EscapeShip — spawns after a wave hack completes.
 * The snail must reach it to officially end the wave.
 * Draws a large, distinctive rescue saucer distinct from enemy ships.
 */
export default class EscapeShip extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(50);

        this.boardRadius = 40; // proximity threshold for boarding

        // ── Graphics ──────────────────────────────────────────────────────────
        const gfx = scene.add.graphics();
        this._draw(gfx);
        this.add(gfx);

        // ── "BOARD SHIP" prompt ───────────────────────────────────────────────
        this.prompt = scene.add.text(0, -58, '[ BOARD SHIP ]', {
            fontSize: '12px', fontFamily: 'monospace',
            color: '#00ffcc', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setAlpha(0).setDepth(110);
        this.add(this.prompt);

        // ── Hover bob ────────────────────────────────────────────────────────
        scene.tweens.add({
            targets: this,
            y: y - 8,
            duration: 900,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        // ── Rim-light pulse ───────────────────────────────────────────────────
        this._rimTween = scene.tweens.add({
            targets: gfx,
            alpha: 0.7,
            duration: 500,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        // ── Spawn pop-in ──────────────────────────────────────────────────────
        this.setScale(0);
        scene.tweens.add({
            targets: this,
            scaleX: 1, scaleY: 1,
            duration: 450,
            ease: 'Back.easeOut',
        });
    }

    _draw(g) {
        // Outer glow halo
        g.fillStyle(0x00ffcc, 0.12);
        g.fillEllipse(0, 12, 100, 32);

        // Shadow
        g.fillStyle(0x000000, 0.25);
        g.fillEllipse(2, 18, 80, 18);

        // Disc body — three-layer depth illusion
        g.fillStyle(0x335577, 1);
        g.fillEllipse(0, 10, 80, 24);
        g.fillStyle(0x5588aa, 1);
        g.fillEllipse(0, 8,  68, 18);
        g.fillStyle(0x88bbdd, 1);
        g.fillEllipse(0, 6,  48, 12);

        // Disc rim outline
        g.lineStyle(1.5, 0x00ffff, 0.7);
        g.strokeEllipse(0, 10, 80, 24);

        // Rim lights — alternating colours
        const rimCols = [0x00ffcc, 0xffdd00, 0x00ffcc, 0xffdd00, 0x00ffcc, 0xffdd00];
        rimCols.forEach((col, i) => {
            const a  = (i / rimCols.length) * Math.PI * 2;
            const lx = Math.cos(a) * 34;
            const ly = 10 + Math.sin(a) * 8;
            g.fillStyle(col, 0.95);
            g.fillCircle(lx, ly, 2.2);
        });

        // Dome interior
        g.fillStyle(0x001a22, 1);
        g.fillEllipse(0, -4, 42, 30);

        // Dome glass ring
        g.lineStyle(2, 0x00ffcc, 0.85);
        g.strokeEllipse(0, -4, 42, 30);

        // Dome shine
        g.fillStyle(0xffffff, 0.14);
        g.fillEllipse(-7, -10, 16, 9);

        // "ESCAPE" label inside dome
        // (drawn as simple short lines — text is added separately above)
    }

    /** Fade the boarding prompt in or out. */
    setPromptVisible(visible) {
        if (this._promptVisible === visible) return;
        this._promptVisible = visible;
        this.scene.tweens.add({
            targets: this.prompt,
            alpha: visible ? 1 : 0,
            duration: 150,
        });
    }

    /** Returns true when the snail is close enough to board. */
    checkProximity(sx, sy) {
        return Phaser.Math.Distance.Between(this.x, this.y, sx, sy) < this.boardRadius;
    }
}
