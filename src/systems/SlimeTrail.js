/**
 * SlimeTrail — spawns procedural mucus-blob decals behind Gerald as he moves.
 *
 * Each decal is a small organic blob (main ellipse + a trailing satellite circle)
 * drawn with Phaser Graphics, rendered at depth -0.5 (above the background,
 * below all game entities). Decals fade out with a slow ease-in curve over
 * LINGER_MS and then destroy themselves.
 *
 * Usage (GameScene):
 *   this.slimeTrail = new SlimeTrail(this);
 *   // in update():
 *   this.slimeTrail.update(this.snail, delta);
 */
export default class SlimeTrail {
    constructor(scene) {
        this._scene    = scene;
        this._timer    = 0;
        this._INTERVAL = 90;    // ms between decal spawns while moving
        this._LINGER   = 3500;  // ms for full fade-out
    }

    update(snail, delta) {
        if (snail.state !== 'MOVING') {
            this._timer = 0;
            return;
        }
        this._timer += delta;
        if (this._timer < this._INTERVAL) return;
        this._timer %= this._INTERVAL;
        this._spawn(snail.x, snail.y, snail.facing);
    }

    _spawn(sx, sy, facing) {
        // Offset the decal behind the snail's foot position
        const BEHIND = { right: [-10, 5], left: [10, 5], up: [0, 12], down: [0, -8] };
        const [bx, by] = BEHIND[facing] ?? [0, 5];

        // Small random jitter so sequential blobs don't perfectly stack
        const x = sx + bx + (Math.random() - 0.5) * 6;
        const y = sy + by + (Math.random() - 0.5) * 3;

        const g = this._scene.add.graphics();
        g.setDepth(-0.5);  // above background (depth -1), below entities (depth 0)

        // Blob dimensions — vary slightly each spawn
        const w = 10 + Math.random() * 4;   // 10..14 px wide
        const h =  4 + Math.random() * 2;   //  4..6  px tall

        // Slime: yellowish-green to match Gerald's colour family
        g.fillStyle(0xA8C400, 1);
        g.fillEllipse(0, 0, w, h);

        // Trailing satellite blob — offset backward along the blob's long axis
        const satelliteX = -(w * 0.35 + Math.random() * 2);
        const satelliteY = (Math.random() - 0.5) * 2;
        g.fillStyle(0x90B000, 1);   // slightly darker for the drip
        g.fillCircle(satelliteX, satelliteY, 1.5 + Math.random() * 1.2);

        // Random slight rotation for organic variety
        g.x        = x;
        g.y        = y;
        g.rotation = (Math.random() - 0.5) * 0.7;
        g.alpha    = 0.45 + Math.random() * 0.15;  // 0.45..0.60

        // Linger, then fade out and self-destruct
        this._scene.tweens.add({
            targets:    g,
            alpha:      0,
            duration:   this._LINGER,
            ease:       'Quad.easeIn',   // stays visible, then fades quickly at the end
            onComplete: () => g.destroy(),
        });
    }
}
