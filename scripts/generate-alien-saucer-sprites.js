#!/usr/bin/env node
/**
 * Generates 8 directional SVG sprites for the BasicAlien: an alien frog
 * riding a flying saucer.
 *
 * SVG travel-angle convention (used internally):
 *   0° = moving right,  90° = moving down,  180° = moving left,  270° = moving up
 *
 * The frog's base pose faces right (+x). A single SVG <g> element is rotated
 * by the travel angle around the dome centre so eyes always track the direction
 * of movement. The engine glow is placed on the opposite (trailing) side.
 *
 * Output filenames match the texture keys in BasicAlien.js:
 *   assets/sprites/alien/alien-frog-{right,diag-right-down,down,diag-left-down,
 *                       left,diag-left-up,up,diag-right-up}.svg
 *
 * Run: node scripts/generate-alien-saucer-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = join(__dirname, '..', 'assets', 'sprites', 'alien');
mkdirSync(outDir, { recursive: true });

const SIZE = 48; // viewBox width and height

// ── Colour palette ────────────────────────────────────────────────────────────
const DISC_DARK  = '#50516a';
const DISC_MID   = '#80839a';
const DISC_LIGHT = '#a8b4c2';
const DOME_FILL  = '#001c12';
const DOME_RING  = '#44ddaa';
const FROG_GREEN = '#3cb83c';
const FROG_DARK  = '#1d6b1d';
const EYE_YEL    = '#dde840';
const PUPIL      = '#111100';
const GLOW_COL   = '#00ffcc';

// Six alternating rim lights evenly spaced around the disc
const RIM_COLORS = ['#ff4444', '#ffdd00', '#00ffcc', '#ff5555', '#ffee33', '#33ffdd'];

// Disc geometry (in SVG space)
const DX = 24, DY = 30, DRX = 19, DRY = 6;  // disc ellipse centre + radii
// Dome geometry
const DOME_CX = 24, DOME_CY = 21, DOME_R = 11;

/** Round to 2 decimal places to keep SVG tidy. */
const r2 = (n) => +n.toFixed(2);

/**
 * Build one sprite SVG.
 * @param {number} travelDeg  SVG-convention travel angle (0 = right, 90 = down, …)
 */
function alienFrogSVG(travelDeg) {
    const trailRad = ((travelDeg + 180) % 360) * (Math.PI / 180);

    // Engine-glow position: on the disc edge of the trailing side
    const glowX = r2(DX + Math.cos(trailRad) * DRX * 0.62);
    const glowY = r2(DY + Math.sin(trailRad) * DRY * 0.75);

    // Six rim lights — fixed positions (they don't rotate with the frog)
    const rimDots = RIM_COLORS.map((col, i) => {
        const a  = (i * 60) * (Math.PI / 180);
        const lx = r2(DX + Math.cos(a) * DRX * 0.88);
        const ly = r2(DY + Math.sin(a) * DRY * 0.88);
        return `  <circle cx="${lx}" cy="${ly}" r="1.8" fill="${col}" opacity="0.95"/>`;
    }).join('\n');

    // Frog group: base pose has eyes on the +x side (facing right).
    // The whole group is rotated by travelDeg around the dome centre.
    const rot = `rotate(${travelDeg}, ${DOME_CX}, ${DOME_CY})`;

    // Absolute SVG coords for base pose elements (all rotate together)
    const cx = DOME_CX, cy = DOME_CY; // shorthand

    const frog = [
        `  <g transform="${rot}">`,
        // Body (round green blob)
        `    <circle cx="${cx}"   cy="${cy}"   r="8"   fill="${FROG_GREEN}"/>`,
        // Head bump — pushed toward +x (leading side)
        `    <circle cx="${cx+4}" cy="${cy}"   r="6"   fill="${FROG_GREEN}"/>`,
        // Upper eye
        `    <circle cx="${cx+6}" cy="${cy-6}" r="4"   fill="${EYE_YEL}"/>`,
        `    <circle cx="${r2(cx+6.7)}" cy="${r2(cy-5.5)}" r="1.8" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(cx+5.2)}" cy="${r2(cy-7.2)}" r="0.7" fill="white"/>`,
        // Lower eye
        `    <circle cx="${cx+6}" cy="${cy+6}" r="4"   fill="${EYE_YEL}"/>`,
        `    <circle cx="${r2(cx+6.7)}" cy="${r2(cy+6.5)}" r="1.8" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(cx+5.2)}" cy="${r2(cy+4.8)}" r="0.7" fill="white"/>`,
        // Nostrils
        `    <circle cx="${cx+3}" cy="${r2(cy-1.4)}" r="1" fill="${FROG_DARK}"/>`,
        `    <circle cx="${cx+3}" cy="${r2(cy+1.4)}" r="1" fill="${FROG_DARK}"/>`,
        // Smile (small arc on the leading side)
        `    <path d="M ${cx+4} ${cy+2} Q ${cx+8} ${cy+3.5} ${cx+4} ${cy+5.5}"`,
        `          stroke="${FROG_DARK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
        `  </g>`,
    ].join('\n');

    return [
        `<svg xmlns="http://www.w3.org/2000/svg"`,
        `     viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
        ``,
        `  <!-- Engine glow (trailing side of disc) -->`,
        `  <ellipse cx="${glowX}" cy="${glowY}" rx="5" ry="3.5" fill="${GLOW_COL}" opacity="0.85"/>`,
        `  <ellipse cx="${glowX}" cy="${glowY}" rx="9" ry="5.5" fill="${GLOW_COL}" opacity="0.20"/>`,
        ``,
        `  <!-- Disc shadow -->`,
        `  <ellipse cx="${DX}" cy="${DY+3}" rx="${DRX-1}" ry="${DRY-1}" fill="black" opacity="0.22"/>`,
        ``,
        `  <!-- Saucer disc (three layers for a rim-depth illusion) -->`,
        `  <ellipse cx="${DX}" cy="${DY}"   rx="${DRX}"   ry="${DRY}"   fill="${DISC_DARK}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-1}" rx="${DRX-4}" ry="${DRY-1.5}" fill="${DISC_MID}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-2}" rx="${DRX-9}" ry="${DRY-2.5}" fill="${DISC_LIGHT}"/>`,
        ``,
        `  <!-- Rim accent lights -->`,
        rimDots,
        ``,
        `  <!-- Dome interior (dark tint so frog is readable) -->`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}" fill="${DOME_FILL}" opacity="0.78"/>`,
        ``,
        `  <!-- Frog (rotated to face travel direction) -->`,
        frog,
        ``,
        `  <!-- Dome glass ring + shine (drawn over frog to sell the glass bubble) -->`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}"`,
        `          fill="none" stroke="${DOME_RING}" stroke-width="1.8" opacity="0.75"/>`,
        `  <ellipse cx="${DOME_CX-3}" cy="${DOME_CY-4}" rx="3.5" ry="2.2"`,
        `           fill="white" opacity="0.13"/>`,
        ``,
        `</svg>`,
    ].join('\n');
}

// ── Direction table ────────────────────────────────────────────────────────────
// Keys match the texture keys used in BasicAlien.js.
// Values are the SVG travel angles (0° = right, 90° = down).
const DIRECTIONS = {
    'right':           0,
    'diag-right-down': 45,
    'down':            90,
    'diag-left-down':  135,
    'left':            180,
    'diag-left-up':    225,
    'up':              270,
    'diag-right-up':   315,
};

for (const [dir, angle] of Object.entries(DIRECTIONS)) {
    const filename = `alien-frog-${dir}.svg`;
    const path     = join(outDir, filename);
    writeFileSync(path, alienFrogSVG(angle), 'utf-8');
    console.log(`✔  ${path}`);
}

console.log('\nDone — 8 directional alien-frog SVGs generated.');
