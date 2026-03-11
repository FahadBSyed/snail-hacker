#!/usr/bin/env node
/**
 * Generates on-foot frog sprites: the alien passenger dismounted from the
 * flying saucer, shown in top-down perspective with four visible legs.
 *
 * All geometry is defined in a local coordinate space centred at (0, 0),
 * with +x pointing forward (right in base pose). A single SVG group is
 * rotated by the travel angle around the canvas centre so the frog always
 * faces its direction of movement.
 *
 * Output:
 *   assets/sprites/frog/frog-{right,left,up,down}.svg             — 4 neutral idle
 *   assets/sprites/frog/frog-hop-{right,left,up,down}-f{00-03}.svg — 16 hop frames
 *
 * Hop cycle (4 frames, loops):
 *   f00 — land/squash  : wide body, legs splayed outward on impact
 *   f01 — crouch       : compact body, all legs pulled in, readying jump
 *   f02 — leap         : elongated body, back legs extending, front legs tucked
 *   f03 — glide        : back legs trailing behind, front legs reaching forward
 *
 * Run: node scripts/generate-frog-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = join(__dirname, '..', 'assets', 'sprites', 'frog');
mkdirSync(outDir, { recursive: true });

const SIZE = 48;

// Frog colour palette — matches the alien-frog saucer sprite passenger
const GREEN  = '#3cb83c';   // main body colour
const DARK   = '#1d6b1d';   // outlines, nostrils, smile, leg stroke
const BELLY  = '#5acc5a';   // lighter belly highlight ellipse
const EYE    = '#dde840';   // yellow eye
const PUPIL  = '#111100';   // near-black pupil

const r2 = n => +n.toFixed(2);

// ── Frame parameter definitions ───────────────────────────────────────────────
//
// Each frame describes body geometry and four leg Cubic-Bezier path strings.
// Coordinates are in LOCAL space: origin=(0,0) is the visual centre of the
// frog; +x points forward (rightward in the base right-facing pose).
//
//   tx, trx, try — torso ellipse: x-centre offset, x-radius, y-radius
//   hx, hr       — head circle: x-centre offset, radius
//   backUp/Dn    — upper / lower back leg paths  (–x direction, behind body)
//   frontUp/Dn   — upper / lower front leg paths (+x direction, leading side)
//
// Eyes are placed automatically at (hx+3, ±7) relative to local origin.
// Belly highlight is centred at (tx+1, 0) with radii trx×0.55, try×0.55.

const FRAMES = {

    // ── Neutral idle — relaxed, four legs comfortably extended ──────────────
    idle: {
        tx: -2,  trx: 9,    try: 8,
        hx: 6,   hr: 7,
        backUp:  'M -7,-4 C -12,-9  -14,-7  -13,-3',
        backDn:  'M -7,4  C -12,9   -14,7   -13,3',
        frontUp: 'M 9,-5  C 14,-10  16,-8   15,-4',
        frontDn: 'M 9,5   C 14,10   16,8    15,4',
    },

    // ── f00 — land / squash ──────────────────────────────────────────────────
    // Body compressed on impact (wider, shorter). Legs splayed wide outward,
    // front legs spread forward and back legs still trailing.
    f00: {
        tx: -2,  trx: 10.5, try: 9.5,
        hx: 5.5, hr: 6.5,
        backUp:  'M -7,-5 C -13,-12 -16,-9  -15,-3',
        backDn:  'M -7,5  C -13,12  -16,9   -15,3',
        frontUp: 'M 8,-6  C 14,-13  17,-10  16,-4',
        frontDn: 'M 8,6   C 14,13   17,10   16,4',
    },

    // ── f01 — crouch ─────────────────────────────────────────────────────────
    // Body compact and low. All four legs pulled close to the body, coiling
    // up stored energy before the jump.
    f01: {
        tx: -2,  trx: 10,   try: 9,
        hx: 5,   hr: 6.5,
        backUp:  'M -7,-4 C -10,-7  -11,-6  -10,-3',
        backDn:  'M -7,4  C -10,7   -11,6   -10,3',
        frontUp: 'M 8,-5  C 11,-7   12,-6   11,-4',
        frontDn: 'M 8,5   C 11,7    12,6    11,4',
    },

    // ── f02 — leap ───────────────────────────────────────────────────────────
    // Body elongated forward (wider in x, narrower in y). Back legs uncoiling
    // outward–backward in the thrust direction. Front legs tucked tight.
    f02: {
        tx: -1,  trx: 11,   try: 7,
        hx: 7,   hr: 6.5,
        backUp:  'M -8,-3 C -15,-5  -18,-2  -16,4',
        backDn:  'M -8,3  C -15,5   -18,2   -16,-4',
        frontUp: 'M 9,-4  C 12,-2   13,0    11,4',
        frontDn: 'M 9,4   C 12,2    13,0    11,-4',
    },

    // ── f03 — glide ──────────────────────────────────────────────────────────
    // Peak of the arc. Body still elongated. Back legs fully extended behind.
    // Front legs reaching forward, preparing for landing.
    f03: {
        tx: -1,  trx: 10,   try: 7.5,
        hx: 6.5, hr: 6.5,
        backUp:  'M -8,-4 C -15,-8  -17,-6  -15,-2',
        backDn:  'M -8,4  C -15,8   -17,6   -15,2',
        frontUp: 'M 10,-5 C 16,-11  18,-8   17,-3',
        frontDn: 'M 10,5  C 16,11   18,8    17,3',
    },
};

// ── SVG builder ───────────────────────────────────────────────────────────────

/**
 * Build one frog SVG frame.
 *
 * @param {number} travelDeg  SVG travel angle: 0=right, 90=down, 180=left, 270=up
 * @param {object} f          Frame parameters (see FRAMES above)
 */
function buildFrog(travelDeg, f) {
    const g = `translate(24,24) rotate(${travelDeg})`;

    // Eye x-position and belly ellipse radii are derived from body params
    const eyeX    = r2(f.hx + 3);
    const bellyRx = r2(f.trx * 0.55);
    const bellyRy = r2(f.try * 0.55);
    const bellyX  = r2(f.tx + 1);

    return [
        `<svg xmlns="http://www.w3.org/2000/svg"`,
        `     viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
        ``,
        `  <!-- Back legs (drawn first — behind body) -->`,
        `  <g transform="${g}" stroke="${DARK}" stroke-width="3" fill="none"`,
        `     stroke-linecap="round" stroke-linejoin="round">`,
        `    <path d="${f.backUp}"/>`,
        `    <path d="${f.backDn}"/>`,
        `  </g>`,
        ``,
        `  <!-- Torso + belly highlight -->`,
        `  <g transform="${g}">`,
        `    <ellipse cx="${f.tx}" cy="0" rx="${f.trx}" ry="${f.try}" fill="${GREEN}"/>`,
        `    <ellipse cx="${bellyX}" cy="0" rx="${bellyRx}" ry="${bellyRy}" fill="${BELLY}" opacity="0.35"/>`,
        `  </g>`,
        ``,
        `  <!-- Head and face -->`,
        `  <g transform="${g}">`,
        `    <circle cx="${f.hx}" cy="0" r="${f.hr}" fill="${GREEN}"/>`,
        ``,
        `    <!-- Upper eye (bulges upward from head) -->`,
        `    <circle cx="${eyeX}" cy="-7" r="3.5" fill="${EYE}"/>`,
        `    <circle cx="${r2(eyeX+0.8)}" cy="-6.5" r="1.6" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(eyeX-0.8)}" cy="-8.2" r="0.6" fill="white"/>`,
        ``,
        `    <!-- Lower eye (bulges downward from head) -->`,
        `    <circle cx="${eyeX}" cy="7" r="3.5" fill="${EYE}"/>`,
        `    <circle cx="${r2(eyeX+0.8)}" cy="7.5" r="1.6" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(eyeX-0.8)}" cy="5.8" r="0.6" fill="white"/>`,
        ``,
        `    <!-- Nostrils -->`,
        `    <circle cx="${r2(f.hx-2)}" cy="-1.5" r="1" fill="${DARK}"/>`,
        `    <circle cx="${r2(f.hx-2)}" cy="1.5"  r="1" fill="${DARK}"/>`,
        ``,
        `    <!-- Smile -->`,
        `    <path d="M ${r2(f.hx-1)} 2.5 Q ${r2(f.hx+4)} 4 ${r2(f.hx-1)} 6"`,
        `          stroke="${DARK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
        `  </g>`,
        ``,
        `  <!-- Front legs (drawn last — in front of body) -->`,
        `  <g transform="${g}" stroke="${DARK}" stroke-width="2.5" fill="none"`,
        `     stroke-linecap="round" stroke-linejoin="round">`,
        `    <path d="${f.frontUp}"/>`,
        `    <path d="${f.frontDn}"/>`,
        `  </g>`,
        ``,
        `</svg>`,
    ].join('\n');
}

// ── Direction table ───────────────────────────────────────────────────────────
// Only 4 cardinal directions for the on-foot frog (no diagonal walking).
const DIRS = { right: 0, down: 90, left: 180, up: 270 };

// ── Write idle sprites ────────────────────────────────────────────────────────
for (const [dir, deg] of Object.entries(DIRS)) {
    const path = join(outDir, `frog-${dir}.svg`);
    writeFileSync(path, buildFrog(deg, FRAMES.idle), 'utf-8');
    console.log(`✔  ${path}`);
}

// ── Write hop animation frames ────────────────────────────────────────────────
for (const [dir, deg] of Object.entries(DIRS)) {
    for (const frame of ['f00', 'f01', 'f02', 'f03']) {
        const path = join(outDir, `frog-hop-${dir}-${frame}.svg`);
        writeFileSync(path, buildFrog(deg, FRAMES[frame]), 'utf-8');
        console.log(`✔  ${path}`);
    }
}

console.log('\nDone — 20 frog SVGs generated.');
