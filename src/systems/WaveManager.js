/**
 * WaveManager — controls alien spawning across 10 waves with intermissions.
 *
 * Spawning is driven by a single budget+bias system (see SPAWN_BUDGET in config.js):
 *
 *   Budget regenerates at (BASE_REGEN + (wave-1) * WAVE_REGEN) $/s, capped at MAX_BUDGET.
 *   Each frame a spend check fires:
 *     • Roll Math.random() < bias  → formation branch
 *         – pick a random eligible formation the budget can cover → spawn it, reset bias
 *         – if none affordable → withhold (budget accumulates toward a formation)
 *     • Otherwise → single-alien branch
 *         – pick a random affordable type from the wave pool → spawn it
 *   Bias increases at BIAS_RATE/s since the last formation, capped at 1.0.
 *
 * Intermission after waves 3, 6, 9. Victory after wave 10.
 */

import { CONFIG } from '../config.js';
import { getEligibleFormations, alienCost, formationCost } from './FormationManager.js';

const WAVE_CONFIGS = [
    { wave: 1,  spawnInterval: 2000, duration: 30000, types: ['basic'] },
    { wave: 2,  spawnInterval: 1800, duration: 35000, types: ['basic', 'fast'] },
    { wave: 3,  spawnInterval: 1500, duration: 40000, types: ['basic', 'fast', 'tank'] },
    { wave: 4,  spawnInterval: 1400, duration: 40000, types: ['basic', 'tank', 'bomber'] },
    { wave: 5,  spawnInterval: 1200, duration: 45000, types: ['basic', 'bomber', 'shield'] },
    { wave: 6,  spawnInterval: 1100, duration: 50000, types: ['basic', 'fast', 'tank', 'shield'] },
    { wave: 7,  spawnInterval: 1000, duration: 50000, types: ['fast', 'tank', 'bomber', 'shield'] },
    { wave: 8,  spawnInterval:  900, duration: 55000, types: ['fast', 'tank', 'bomber', 'shield'] },
    { wave: 9,  spawnInterval:  800, duration: 55000, types: ['fast', 'tank', 'bomber', 'shield'] },
    { wave: 10, spawnInterval:  700, duration: 65000, types: [] }, // boss wave — no normal spawns
];

const INTERMISSION_AFTER = new Set([3, 6, 9]);
const MAX_WAVE = 10;

export default class WaveManager {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {number}   [opts.startWave=1]
     * @param {function} opts.onSpawn       — (type: string) => void
     * @param {function} opts.onFormation   — (formation: object) => void
     * @param {function} opts.onWaveStart   — (wave, duration) => void
     * @param {function} opts.onWaveEnd     — (wave) => void
     */
    constructor(scene, opts) {
        this.scene       = scene;
        this.onSpawn     = opts.onSpawn;
        this.onFormation = opts.onFormation;
        this.onWaveStart = opts.onWaveStart;
        this.onWaveEnd   = opts.onWaveEnd;

        this.wave         = opts.startWave || 1;
        this.active       = false;
        this.elapsed      = 0;
        this.graceElapsed = 0;
        this.budget       = 0;
        this.bias         = 0;
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
        this.elapsed      = 0;
        this.graceElapsed = 0;
        this.budget       = 0;
        this.bias         = 0;
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

        // Boss wave — alien spawning suppressed; boss handles its own attacks
        if (cfg.types.length === 0) return;

        const dt  = delta / 1000;
        const bud = CONFIG.SPAWN_BUDGET;

        // ── Regenerate budget ────────────────────────────────────────────────
        const regenRate = (bud.BASE_REGEN + (this.wave - 1) * bud.WAVE_REGEN)
                        * (this.wave <= 5 ? 1.25 : 1);
        this.budget = Math.min(this.budget + regenRate * dt, bud.MAX_BUDGET);

        // ── Accumulate formation bias ────────────────────────────────────────
        this.bias = Math.min(this.bias + bud.BIAS_RATE * dt, 1);

        // ── Spend check ──────────────────────────────────────────────────────
        // Find the cheapest single alien we could buy this wave.
        const minSingleCost = Math.min(...cfg.types.map(alienCost));
        if (this.budget < minSingleCost) return; // can't afford anything yet

        if (Math.random() < this.bias) {
            // Formation branch — try to spend on a formation
            const eligible  = getEligibleFormations(cfg.types);
            const affordable = eligible.filter(f => formationCost(f) <= this.budget);

            if (affordable.length > 0) {
                const formation = Phaser.Utils.Array.GetRandom(affordable);
                this.budget -= formationCost(formation);
                this.bias    = 0;
                if (this.onFormation) this.onFormation(formation);
            }
            // else: withhold — don't spend on singles; let budget grow toward a formation
        } else {
            // Single-alien branch — pick freely from all wave-eligible types.
            // Deducting a pricey alien's cost (e.g. tank=$3) may send budget
            // slightly negative, creating a proportionally longer gap before the
            // next spend check — natural rate-limiting without starving heavy units.
            const type = Phaser.Utils.Array.GetRandom(cfg.types);
            this.budget -= alienCost(type);
            if (this.onSpawn) this.onSpawn(type);
        }

        // NOTE: Waves end via completeWave() when the hack is finished, not by timer.
    }

    /**
     * End the current wave immediately (called by GameScene when hack succeeds).
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
