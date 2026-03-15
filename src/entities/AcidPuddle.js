import { CONFIG } from '../config.js';

/**
 * AcidPuddle — a timed slow zone left by Spitter acid globs.
 *
 * Placed in world space (not a container child of anything).
 * GameScene keeps `this.acidPuddles = []` and checks Gerald's overlap each frame.
 * Slows the snail to PUDDLE_SLOW_MULT × normal speed while inside.
 * Auto-destroys after PUDDLE_DURATION ms.
 */
export default class AcidPuddle extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(15);  // below snail but above background

        const cfg = CONFIG.SNAKES.SPITTER;

        this._gfx = scene.add.graphics();
        this.add(this._gfx);

        this._life    = cfg.PUDDLE_DURATION;
        this._maxLife = cfg.PUDDLE_DURATION;
        this.radius   = cfg.PUDDLE_RADIUS;

        this._draw(1.0);

        // Auto-destroy timer
        scene.time.delayedCall(cfg.PUDDLE_DURATION, () => {
            if (this.active) this.destroy();
        });
    }

    _draw(alpha) {
        const g   = this._gfx;
        const r   = CONFIG.SNAKES.SPITTER.PUDDLE_RADIUS;
        g.clear();
        g.fillStyle(0x88dd00, alpha * 0.35);
        g.fillEllipse(0, 0, r * 2, r * 1.4);
        g.lineStyle(1.5, 0xaaff22, alpha * 0.6);
        g.strokeEllipse(0, 0, r * 2, r * 1.4);
        // Bubble dots
        for (let i = 0; i < 5; i++) {
            const bx = Math.cos((i / 5) * Math.PI * 2) * r * 0.55;
            const by = Math.sin((i / 5) * Math.PI * 2) * r * 0.4;
            g.fillStyle(0xccff44, alpha * 0.5);
            g.fillCircle(bx, by, 3);
        }
    }

    update(delta) {
        if (!this.active) return;
        this._life -= delta;
        const t = Math.max(0, this._life / this._maxLife);
        this._draw(t);
    }
}
