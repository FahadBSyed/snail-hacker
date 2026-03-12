/**
 * FormationManager — defines all alien formations and helpers to filter by wave.
 *
 * Each formation has:
 *   id            — unique string
 *   name          — human-readable label (used in debug/HUD)
 *   requiredTypes — every type in this list must be in the wave's types array
 *   stagger       — ms delay between successive member spawns
 *   members       — ordered array of { type, perp, depth }
 *
 * Coordinate conventions (relative to spawn anchor on a screen edge):
 *   perp  — offset perpendicular to approach direction (+ = right-hand side as facing station)
 *   depth — offset along approach direction (+ = further into the screen toward station)
 *
 * Members are spawned in array order; front-of-formation members typically come first
 * so they have a slight positional lead when the full formation assembles.
 *
 * Spawn anchor ranges are chosen with a 200 px margin to keep max-perp=160 formations
 * fully on-screen regardless of which edge is chosen.
 */

export const FORMATIONS = [
    // ── 1. Shield Wall ──────────────────────────────────────────────────────────
    // Two shields up front protect three basics behind them.
    {
        id: 'shield_wall',
        name: 'Shield Wall',
        requiredTypes: ['shield', 'basic'],
        stagger: 120,
        members: [
            // Front row — shields (higher depth = further into screen = closer to station on entry)
            { type: 'shield', perp:  -60, depth:  90 },
            { type: 'shield', perp:   60, depth:  90 },
            // Back row — basics
            { type: 'basic',  perp:  -90, depth:   0 },
            { type: 'basic',  perp:    0, depth:   0 },
            { type: 'basic',  perp:   90, depth:   0 },
        ],
    },

    // ── 2. Spearhead ────────────────────────────────────────────────────────────
    // Fast alien tip punches through; two tanks anchor the rear flanks.
    {
        id: 'spearhead',
        name: 'Spearhead',
        requiredTypes: ['fast', 'tank'],
        stagger: 100,
        members: [
            { type: 'fast', perp:    0, depth: 140 }, // tip
            { type: 'fast', perp:  -70, depth:  70 }, // mid-left wing
            { type: 'fast', perp:   70, depth:  70 }, // mid-right wing
            { type: 'tank', perp: -110, depth:   0 }, // left anchor
            { type: 'tank', perp:  110, depth:   0 }, // right anchor
        ],
    },

    // ── 3. Bomber Escort ────────────────────────────────────────────────────────
    // Bombers weave through a checkerboard of fast escorts.
    {
        id: 'bomber_escort',
        name: 'Bomber Escort',
        requiredTypes: ['fast', 'bomber'],
        stagger: 80,
        members: [
            // Front row
            { type: 'fast',   perp:  -80, depth: 160 },
            { type: 'bomber', perp:    0, depth: 160 },
            { type: 'fast',   perp:   80, depth: 160 },
            // Middle row
            { type: 'bomber', perp:  -80, depth:  80 },
            { type: 'bomber', perp:   80, depth:  80 },
            // Back row
            { type: 'fast',   perp:  -80, depth:   0 },
            { type: 'bomber', perp:    0, depth:   0 },
            { type: 'fast',   perp:   80, depth:   0 },
        ],
    },

    // ── 4. Tank Vanguard ────────────────────────────────────────────────────────
    // Three tanks lead; three basics follow as a second wave.
    {
        id: 'tank_vanguard',
        name: 'Tank Vanguard',
        requiredTypes: ['tank', 'basic'],
        stagger: 80,
        members: [
            // Front row — tanks
            { type: 'tank',  perp:  -90, depth: 100 },
            { type: 'tank',  perp:    0, depth: 100 },
            { type: 'tank',  perp:   90, depth: 100 },
            // Back row — basics
            { type: 'basic', perp:  -90, depth:   0 },
            { type: 'basic', perp:    0, depth:   0 },
            { type: 'basic', perp:   90, depth:   0 },
        ],
    },

    // ── 5. Pincer ───────────────────────────────────────────────────────────────
    // Two fast columns flank the screen; basics close the center gap.
    {
        id: 'pincer',
        name: 'Pincer',
        requiredTypes: ['fast', 'basic'],
        stagger: 100,
        members: [
            // Left and right columns (spawn near edge, approach from both flanks)
            { type: 'fast',  perp: -160, depth:   0 },
            { type: 'fast',  perp:  160, depth:   0 },
            { type: 'fast',  perp: -160, depth:  80 },
            { type: 'fast',  perp:  160, depth:  80 },
            // Center basics trail behind
            { type: 'basic', perp:  -80, depth: 140 },
            { type: 'basic', perp:    0, depth: 140 },
            { type: 'basic', perp:   80, depth: 140 },
        ],
    },

    // ── 6. Diamond ──────────────────────────────────────────────────────────────
    // Tank tip, shield mid-wings, bombers at the wide rear.
    {
        id: 'diamond',
        name: 'Diamond',
        requiredTypes: ['tank', 'shield', 'bomber'],
        stagger: 100,
        members: [
            { type: 'tank',   perp:    0, depth: 180 }, // leading point
            { type: 'shield', perp: -100, depth: 120 }, // mid-left
            { type: 'shield', perp:  100, depth: 120 }, // mid-right
            { type: 'bomber', perp: -130, depth:  40 }, // rear-left
            { type: 'bomber', perp:  130, depth:  40 }, // rear-right
        ],
    },

    // ── 7. Turtle ───────────────────────────────────────────────────────────────
    // A slow tank core boxed in by four shields — very hard to crack.
    {
        id: 'turtle',
        name: 'Turtle',
        requiredTypes: ['shield', 'tank'],
        stagger: 120,
        members: [
            { type: 'shield', perp:  -80, depth:  80 }, // front-left
            { type: 'shield', perp:   80, depth:  80 }, // front-right
            { type: 'tank',   perp:    0, depth:  40 }, // core
            { type: 'shield', perp:  -80, depth:   0 }, // rear-left
            { type: 'shield', perp:   80, depth:   0 }, // rear-right
        ],
    },

    // ── 8. Blitz Line ───────────────────────────────────────────────────────────
    // Five fast aliens sweep across the full width simultaneously.
    {
        id: 'blitz_line',
        name: 'Blitz Line',
        requiredTypes: ['fast'],
        stagger: 50,
        members: [
            { type: 'fast', perp: -160, depth: 0 },
            { type: 'fast', perp:  -80, depth: 0 },
            { type: 'fast', perp:    0, depth: 0 },
            { type: 'fast', perp:   80, depth: 0 },
            { type: 'fast', perp:  160, depth: 0 },
        ],
    },

    // ── 9. Ambush Cross ─────────────────────────────────────────────────────────
    // Tank at the intersection; bombers extend along each arm of the cross.
    {
        id: 'ambush_cross',
        name: 'Ambush Cross',
        requiredTypes: ['tank', 'bomber'],
        stagger: 120,
        members: [
            { type: 'tank',   perp:    0, depth:  80 }, // center
            { type: 'bomber', perp:    0, depth: 160 }, // forward arm
            { type: 'bomber', perp: -100, depth:  80 }, // left arm
            { type: 'bomber', perp:  100, depth:  80 }, // right arm
            { type: 'bomber', perp:    0, depth:   0 }, // rear arm
        ],
    },

    // ── 10. Serpent ─────────────────────────────────────────────────────────────
    // Alternating fast/shield in a diagonal chain — materialises front to back.
    {
        id: 'serpent',
        name: 'Serpent',
        requiredTypes: ['fast', 'shield'],
        stagger: 200,
        members: [
            { type: 'fast',   perp: -150, depth: 250 },
            { type: 'shield', perp: -100, depth: 200 },
            { type: 'fast',   perp:  -50, depth: 150 },
            { type: 'shield', perp:    0, depth: 100 },
            { type: 'fast',   perp:   50, depth:  50 },
            { type: 'shield', perp:  100, depth:   0 },
        ],
    },

    // ── 11. Berserker Wave ──────────────────────────────────────────────────────
    // Three tanks in a vanguard line; three bombers ready to detonate behind them.
    {
        id: 'berserker_wave',
        name: 'Berserker Wave',
        requiredTypes: ['tank', 'bomber'],
        stagger: 80,
        members: [
            // Front row — tanks absorb first hits
            { type: 'tank',   perp: -120, depth:  70 },
            { type: 'tank',   perp:    0, depth:  70 },
            { type: 'tank',   perp:  120, depth:  70 },
            // Back row — bombers detonate when tanks die
            { type: 'bomber', perp: -120, depth:   0 },
            { type: 'bomber', perp:    0, depth:   0 },
            { type: 'bomber', perp:  120, depth:   0 },
        ],
    },

    // ── 12. Phalanx ─────────────────────────────────────────────────────────────
    // 3×3 block: six shields surround a central tank — the densest formation.
    {
        id: 'phalanx',
        name: 'Phalanx',
        requiredTypes: ['shield', 'tank'],
        stagger: 60,
        members: [
            // Front row
            { type: 'shield', perp:  -80, depth: 160 },
            { type: 'shield', perp:    0, depth: 160 },
            { type: 'shield', perp:   80, depth: 160 },
            // Middle row
            { type: 'shield', perp:  -80, depth:  80 },
            { type: 'tank',   perp:    0, depth:  80 },
            { type: 'shield', perp:   80, depth:  80 },
            // Back row
            { type: 'shield', perp:  -80, depth:   0 },
            { type: 'shield', perp:    0, depth:   0 },
            { type: 'shield', perp:   80, depth:   0 },
        ],
    },
];

/**
 * Returns formations whose requiredTypes are all present in the given wave types array.
 * @param {string[]} waveTypes
 * @returns {object[]}
 */
export function getEligibleFormations(waveTypes) {
    return FORMATIONS.filter(f =>
        f.requiredTypes.every(t => waveTypes.includes(t))
    );
}
