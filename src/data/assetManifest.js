/**
 * Asset manifest — declares every loadable texture tagged by game world.
 *
 * worlds: 'all'  → loaded in every world
 *         [1]    → World 1 (Alien Invasion) only
 *         [2]    → World 2 (The Snake Pit) only
 *
 * GameScene.preload() iterates this list and skips entries whose worlds
 * array does not include the current world, avoiding loading assets that
 * won't be used (e.g. frog/alien sprites in the snake world).
 *
 * Background assets are NOT listed here — they are loaded dynamically per
 * wave in GameScene.preload() because the key varies per wave.
 */

const SVG48 = { width: 48, height: 48 };
const SVG64 = { width: 64, height: 64 };
const SVG96 = { width: 96, height: 96 };

// Snake sprite sizes — rotation-based (one sprite per part, rotated at runtime)
const SVG_SH = { width: 64, height: 48 };  // snake head
const SVG_SB = { width: 32, height: 24 };  // snake body segment
const SVG_ST = { width: 28, height: 20 };  // snake tail
const SVG_AH = { width: 138, height: 96 };  // anaconda head (boss, 2× python; +10px tongue)
const SVG_AB = { width: 64,  height: 48 };  // anaconda body segment
const SVG_AT = { width: 56,  height: 40 };  // anaconda tail

// Prop sizes (match existing assets)
const PROP_SIZES = {
    'prop-rock-0':     { width: 40, height: 34 },
    'prop-rock-1':     { width: 60, height: 38 },
    'prop-rock-2':     { width: 46, height: 56 },
    'prop-mushroom-0': { width: 32, height: 52 },
    'prop-mushroom-1': { width: 48, height: 68 },
};

const DIRS_4 = ['right', 'left', 'up', 'down'];
const DIRS_8 = ['right', 'diag-right-down', 'down', 'diag-left-down',
                'left',  'diag-left-up',    'up',   'diag-right-up'];

const W1  = [1];
const W2  = [2];
const ALL = 'all';

const entries = [];
const add = (key, path, size, worlds) => entries.push({ key, path, size, worlds });

// ── Snail (global — used in every world) ────────────────────────────────────
for (const dir of DIRS_4) {
    add(`snail-${dir}`, `assets/sprites/snail/snail-${dir}.svg`, SVG48, ALL);
    for (let i = 0; i < 6; i++) {
        const f = `f${String(i).padStart(2, '0')}`;
        add(`snail-walk-${dir}-${f}`, `assets/sprites/snail/snail-walk-${dir}-${f}.svg`, SVG48, ALL);
    }
    for (let i = 0; i < 12; i++) {
        const f = `f${String(i).padStart(2, '0')}`;
        add(`snail-idle-${dir}-${f}`, `assets/sprites/snail/snail-idle-${dir}-${f}.svg`, SVG48, ALL);
    }
    for (let i = 0; i <= 15; i++) {
        const f = `f${String(i).padStart(2, '0')}`;
        add(`snail-hit-${dir}-${f}`, `assets/sprites/snail/snail-hit-${dir}-${f}.svg`, SVG48, ALL);
    }
}

// ── Station + shared terminals (global) ─────────────────────────────────────
add('station-mainframe', 'assets/sprites/station/station-mainframe.svg', SVG96, ALL);
add('station-gun',       'assets/sprites/station/station-gun.svg',       SVG48, ALL);

for (const t of ['reload', 'turret', 'shield', 'slow', 'repair', 'decoy', 'emp']) {
    add(`terminal-${t}`, `assets/sprites/terminal/terminal-${t}.svg`, SVG64, ALL);
}

// ── Props (global — greyscale, palette-recoloured at runtime per biome) ─────
for (const [key, size] of Object.entries(PROP_SIZES)) {
    const file = key.replace('prop-', '') + '.svg';
    add(key, `assets/sprites/props/${file}`, size, ALL);
}

// ── World 1: on-foot frog sprites ───────────────────────────────────────────
for (const dir of DIRS_4) {
    add(`frog-${dir}`, `assets/sprites/frog/frog-${dir}.svg`, SVG48, W1);
    for (const frame of ['f00', 'f01', 'f02', 'f03']) {
        add(`frog-hop-${dir}-${frame}`, `assets/sprites/frog/frog-hop-${dir}-${frame}.svg`, SVG48, W1);
    }
}

// ── World 1: alien saucer sprites (8-directional) ───────────────────────────
for (const dir of DIRS_8) {
    for (const type of ['frog', 'fast', 'tank', 'bomber', 'shield']) {
        add(`alien-${type}-${dir}`, `assets/sprites/alien/alien-${type}-${dir}.svg`, SVG48, W1);
    }
    add(`alien-boss-${dir}`, `assets/sprites/alien/alien-boss-${dir}.svg`, SVG96, W1);
}

// ── World 2: snake sprites (rotation-based — single sprite rotated in-engine) ─
for (const type of ['basic', 'sidewinder', 'python', 'burrower', 'spitter']) {
    add(`snake-${type}-head`, `assets/sprites/snake/snake-${type}-head.svg`, SVG_SH, W2);
    add(`snake-${type}-body`, `assets/sprites/snake/snake-${type}-body.svg`, SVG_SB, W2);
    add(`snake-${type}-tail`, `assets/sprites/snake/snake-${type}-tail.svg`, SVG_ST, W2);
}
add('snake-anaconda-head', 'assets/sprites/snake/snake-anaconda-head.svg', SVG_AH, W2);
add('snake-anaconda-body', 'assets/sprites/snake/snake-anaconda-body.svg', SVG_AB, W2);
add('snake-anaconda-tail', 'assets/sprites/snake/snake-anaconda-tail.svg', SVG_AT, W2);
// Mouth-open animation (3 opening frames + held-open sprite)
add('snake-anaconda-head-open-f00', 'assets/sprites/snake/snake-anaconda-head-open-f00.svg', SVG_AH, W2);
add('snake-anaconda-head-open-f01', 'assets/sprites/snake/snake-anaconda-head-open-f01.svg', SVG_AH, W2);
add('snake-anaconda-head-open-f02', 'assets/sprites/snake/snake-anaconda-head-open-f02.svg', SVG_AH, W2);
add('snake-anaconda-head-open',     'assets/sprites/snake/snake-anaconda-head-open.svg',     SVG_AH, W2);

// ── World 2: bush props ──────────────────────────────────────────────────────
add('bush',          'assets/sprites/props/bush.svg',          { width: 72, height: 60 }, W2);
add('bush-scorched', 'assets/sprites/props/bush-scorched.svg', { width: 72, height: 60 }, W2);

// ── World 2: snake-world terminals ──────────────────────────────────────────
add('terminal-burner',   'assets/sprites/terminal/terminal-burner.svg',   SVG64, W2);
add('terminal-mongoose', 'assets/sprites/terminal/terminal-mongoose.svg', SVG64, W2);

export const ASSET_MANIFEST = entries;
