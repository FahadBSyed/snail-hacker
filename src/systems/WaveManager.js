/**
 * WaveManager — controls enemy spawning across 10 waves with intermissions.
 *
 * Supports two worlds, selected via opts.world (default 1):
 *   World 1 — Alien Invasion: saucer enemies, budget+bias spawn system
 *   World 2 — The Snake Pit: snake enemies, simpler interval-based spawning
 *
 * World 1 spawning uses a budget+bias system (see SPAWN_BUDGET in config.js):
 *   Budget regenerates at (BASE_REGEN + (wave-1) * WAVE_REGEN) $/s, capped at MAX_BUDGET.
 *   Each frame a spend check fires:
 *     • Roll Math.random() < bias  → formation branch
 *     • Otherwise                  → single-alien branch
 *   Bias increases at BIAS_RATE/s since the last formation, capped at 1.0.
 *
 * World 2 spawning uses a simple time-interval system: one snake every
 * spawnInterval ms, type picked randomly from the wave pool.
 *
 * Intermission after waves 3, 6, 9. Victory after wave 10.
 */

import { CONFIG } from '../config.js';
import { getEligibleFormations, alienCost, formationCost } from './FormationManager.js';

// ── World 1: Alien Invasion ──────────────────────────────────────────────────
const WAVE_CONFIGS = [
    { wave: 1,  spawnInterval: 2000, duration: 30000, types: ['basic'] },
    { wave: 2,  spawnInterval: 1800, duration: 35000, types: ['basic', 'fast'] },
    { wave: 3,  spawnInterval: 1500, duration: 40000, types: ['basic', 'fast', 'tank'] },
    { wave: 4,  spawnInterval: 1400, duration: 40000, types: ['basic', 'tank', 'bomber'] },
    { wave: 5,  spawnInterval: 1200, duration: 45000, types: ['basic', 'bomber', 'shield'] },
    { wave: 6,  spawnInterval: 1100, duration: 50000, types: ['basic', 'fast', 'tank', 'shield'] },
    { wave: 7,  spawnInterval: 1000, duration: 50000, types: ['basic', 'fast', 'tank', 'bomber', 'shield'] },
    { wave: 8,  spawnInterval:  900, duration: 55000, types: ['basic', 'fast', 'tank', 'bomber', 'shield'] },
    { wave: 9,  spawnInterval:  800, duration: 55000, types: ['basic', 'fast', 'tank', 'bomber', 'shield'] },
    { wave: 10, spawnInterval:  700, duration: 65000, types: [] }, // boss wave — no normal spawns
];

// ── World 2: The Snake Pit ───────────────────────────────────────────────────
// spawnInterval is ~30% longer than alien equivalent (snakes spawn less frequently).
// bushCount is passed to GameScene so it can place bush cover objects each wave.
const SNAKE_WAVE_CONFIGS = [
    { wave: 1,  spawnInterval: 2600, duration: 30000, types: ['basic-snake'],                                           bushCount: 4 },
    { wave: 2,  spawnInterval: 2400, duration: 35000, types: ['basic-snake', 'sidewinder'],                             bushCount: 4 },
    { wave: 3,  spawnInterval: 2200, duration: 40000, types: ['basic-snake', 'sidewinder'],                             bushCount: 5 },
    { wave: 4,  spawnInterval: 2000, duration: 40000, types: ['basic-snake', 'sidewinder', 'burrower'],                 bushCount: 5 },
    { wave: 5,  spawnInterval: 1800, duration: 45000, types: ['basic-snake', 'burrower', 'spitter'],                    bushCount: 6 },
    { wave: 6,  spawnInterval: 1600, duration: 50000, types: ['basic-snake', 'sidewinder', 'burrower', 'spitter'],      bushCount: 6 },
    { wave: 7,  spawnInterval: 1400, duration: 50000, types: ['basic-snake', 'sidewinder', 'burrower', 'spitter', 'python'], bushCount: 6 },
    { wave: 8,  spawnInterval: 1200, duration: 55000, types: ['basic-snake', 'sidewinder', 'burrower', 'spitter', 'python'], bushCount: 7 },
    { wave: 9,  spawnInterval: 1000, duration: 55000, types: ['basic-snake', 'sidewinder', 'burrower', 'spitter', 'python'], bushCount: 7 },
    { wave: 10, spawnInterval:  900, duration: 65000, types: [],                                                        bushCount: 0 }, // anaconda boss
];

const INTERMISSION_AFTER = new Set([3, 6, 9]);
const MAX_WAVE = 10;

export default class WaveManager {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts
     * @param {number}   [opts.world=1]       — 1 = Alien Invasion, 2 = Snake Pit
     * @param {number}   [opts.startWave=1]
     * @param {function} opts.onSpawn         — (type: string) => void
     * @param {function} opts.onFormation     — (formation: object) => void  (world 1 only)
     * @param {function} opts.onWaveStart     — (wave, duration) => void
     * @param {function} opts.onWaveEnd       — (wave) => void
     */
    constructor(scene, opts) {
        this.scene       = scene;
        this.onSpawn     = opts.onSpawn;
        this.onFormation = opts.onFormation;
        this.onWaveStart = opts.onWaveStart;
        this.onWaveEnd   = opts.onWaveEnd;

        this.world        = opts.world     || 1;
        this.wave         = opts.startWave || 1;
        this.active       = false;
        this.elapsed      = 0;
        this.graceElapsed = 0;
        this.budget       = 0;
        this.bias         = 0;
        this._spawnTimer  = 0;  // world 2: simple interval timer
    }

    getConfig() {
        const configs = this.world === 2 ? SNAKE_WAVE_CONFIGS : WAVE_CONFIGS;
        const idx = Math.min(this.wave - 1, configs.length - 1);
        return configs[idx];
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
        const bud = CONFIG.SPAWN_BUDGET;
        this.elapsed      = 0;
        this.graceElapsed = 0;
        this.budget       = bud.STARTING_BUDGET + (this.wave - 1) * bud.STARTING_BUDGET_PER_WAVE;
        this.bias         = 0;
        this._spawnTimer  = 0;
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

        // Boss wave — enemy spawning suppressed; boss handles its own attacks
        if (cfg.types.length === 0) return;

        // ── World 2: simple interval-based spawning ──────────────────────────
        if (this.world === 2) {
            this._spawnTimer += delta;
            if (this._spawnTimer >= cfg.spawnInterval) {
                this._spawnTimer = 0;
                const type = Phaser.Utils.Array.GetRandom(cfg.types);
                if (this.onSpawn) this.onSpawn(type);
            }
            return;
        }

        // ── World 1: budget+bias spawning ────────────────────────────────────
        const dt  = delta / 1000;
        const bud = CONFIG.SPAWN_BUDGET;

        // Regenerate budget
        const regenRate = (bud.BASE_REGEN + (this.wave - 1) * bud.WAVE_REGEN)
                        * (this.wave <= 5 ? 1.25 : 1);
        this.budget = Math.min(this.budget + regenRate * dt, bud.MAX_BUDGET);

        // Accumulate formation bias
        this.bias = Math.min(this.bias + bud.BIAS_RATE * dt, 1);

        // Spend check
        const minSingleCost = Math.min(...cfg.types.map(alienCost));
        if (this.budget < minSingleCost) return;

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
