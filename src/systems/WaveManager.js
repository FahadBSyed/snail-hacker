/**
 * WaveManager — controls alien spawning across 10 waves with intermissions.
 *
 * Wave configs: spawnInterval (ms between spawns), duration (ms),
 * types (array of alienType strings to pick from randomly).
 *
 * Intermission after waves 3, 6, 9. Victory after wave 10.
 */

import { CONFIG } from '../config.js';

const WAVE_CONFIGS = [
    { wave: 1,  spawnInterval: 2000, duration: 30000, types: ['basic'] },
    { wave: 2,  spawnInterval: 1800, duration: 35000, types: ['basic', 'fast'] },
    { wave: 3,  spawnInterval: 1500, duration: 40000, types: ['basic', 'fast'] },
    { wave: 4,  spawnInterval: 1400, duration: 40000, types: ['basic', 'fast', 'tank'] },
    { wave: 5,  spawnInterval: 1200, duration: 45000, types: ['basic', 'fast', 'tank', 'bomber', 'shield'] },
    { wave: 6,  spawnInterval: 1100, duration: 50000, types: ['basic', 'fast', 'tank', 'bomber', 'shield'] },
    { wave: 7,  spawnInterval: 1000, duration: 50000, types: ['fast', 'tank', 'bomber', 'shield'] },
    { wave: 8,  spawnInterval:  900, duration: 55000, types: ['fast', 'tank', 'bomber', 'shield'] },
    { wave: 9,  spawnInterval:  800, duration: 55000, types: ['fast', 'tank', 'bomber', 'shield'] },
    { wave: 10, spawnInterval:  700, duration: 65000, types: ['basic', 'fast', 'tank', 'bomber', 'shield'] },
];

const INTERMISSION_AFTER = new Set([3, 6, 9]);
const MAX_WAVE = 10;

export default class WaveManager {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {number}   [opts.startWave=1]
     * @param {function} opts.onSpawn       — (type: string) => void
     * @param {function} opts.onWaveStart   — (wave, duration) => void
     * @param {function} opts.onWaveEnd     — (wave) => void — GameScene handles intermission/victory
     */
    constructor(scene, opts) {
        this.scene       = scene;
        this.onSpawn     = opts.onSpawn;
        this.onWaveStart = opts.onWaveStart;
        this.onWaveEnd   = opts.onWaveEnd;

        this.wave    = opts.startWave || 1;
        this.active  = false;
        this.elapsed = 0;
        this.spawnAccumulator = 0;
    }

    getConfig() {
        const idx = Math.min(this.wave - 1, WAVE_CONFIGS.length - 1);
        return WAVE_CONFIGS[idx];
    }

    get timeRemaining() {
        const cfg = this.getConfig();
        return Math.max(0, cfg.duration - this.elapsed);
    }

    get isIntermissionWave() {
        return INTERMISSION_AFTER.has(this.wave);
    }

    get isLastWave() {
        return this.wave >= MAX_WAVE;
    }

    startWave() {
        const cfg = this.getConfig();
        this.elapsed          = 0;
        this.graceElapsed     = 0;
        this.spawnAccumulator = 0;
        this.active = true;
        if (this.onWaveStart) this.onWaveStart(this.wave, cfg.duration);
    }

    /** Call from scene's update(time, delta) */
    update(delta) {
        if (!this.active) return;

        const cfg = this.getConfig();
        this.elapsed      += delta;
        this.graceElapsed += delta;

        // Grace period — no spawning for the first N ms of each wave
        if (this.graceElapsed < CONFIG.WAVES.SPAWN_GRACE_MS) return;

        // Spawn tick
        this.spawnAccumulator += delta;
        while (this.spawnAccumulator >= cfg.spawnInterval) {
            this.spawnAccumulator -= cfg.spawnInterval;
            const type = Phaser.Utils.Array.GetRandom(cfg.types);
            if (this.onSpawn) this.onSpawn(type);
        }

        // NOTE: Waves end via completeWave() when the hack is finished, not by timer.
    }

    /**
     * End the current wave immediately (called by GameScene when hack succeeds).
     * Stops spawning and fires onWaveEnd so GameScene can handle intermission/victory.
     */
    completeWave() {
        if (!this.active) return;
        this.active = false;
        if (this.onWaveEnd) this.onWaveEnd(this.wave);
    }

    /** Advance to next wave (called by GameScene after intermission or directly) */
    nextWave() {
        this.wave++;
        this.startWave();
    }
}
