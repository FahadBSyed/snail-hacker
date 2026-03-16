import BaseGameScene from './BaseGameScene.js';
import FrogEscape from '../entities/FrogEscape.js';

/**
 * FrogWorldScene — World 1 (Frog aliens).
 *
 * Extends BaseGameScene with frog-world-specific behaviour:
 *   - spawnFrogEscape: 25% chance to spawn a decorative escape frog on enemy death
 *   - _onBossDeathFx:  guaranteed escape frog on boss kill
 *
 * All other gameplay is inherited from BaseGameScene.
 */
export default class FrogWorldScene extends BaseGameScene {
    constructor() {
        super('FrogWorldScene');
    }

    init(data = {}) {
        // Force world = 1 regardless of what data says
        super.init({ ...data, world: 1 });
    }

    // ── World-specific overrides ───────────────────────────────────────────────

    /**
     * 25% chance to spawn a decorative on-foot frog that hops off-screen.
     * Called after any frog-type enemy is destroyed.
     */
    spawnFrogEscape(x, y) {
        if (!this.sys.isActive()) return;
        if (Math.random() >= 0.25) return;
        if (this.frogEscapes.filter(f => f.active).length >= 5) return;
        const frog = new FrogEscape(this, x, y);
        this.frogEscapes.push(frog);
        this.soundSynth.play('alienRibbet');
    }

    /**
     * Guaranteed escape frog on boss death (bypasses the random gate).
     */
    _onBossDeathFx(bx, by) {
        if (!this.sys.isActive()) return;
        if (this.frogEscapes.filter(f => f.active).length >= 5) return;
        const frog = new FrogEscape(this, bx, by);
        this.frogEscapes.push(frog);
        this.soundSynth?.play('alienRibbet');
    }
}
