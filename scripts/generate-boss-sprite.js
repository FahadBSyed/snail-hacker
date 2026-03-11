#!/usr/bin/env node
/**
 * Generates 8 directional SVG sprites for BossAlien (The Overlord).
 *
 * Differences from regular alien sprites:
 *   - 96×96 canvas (2× the standard 48×48)
 *   - Crimson dreadnought disc: 4 depth layers, 3 weapon pods, 12 rim lights
 *   - Boss frog: red pupils, angry V-brows, crown, arm stubs, snarl
 *   - Wider dome (r=20) with double glass ring
 *   - Triple engine glow
 *
 * Output: assets/sprites/alien/alien-boss-{right,diag-right-down,down,...}.svg  (8 files)
 * Run: node scripts/generate-boss-sprite.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = join(__dirname, '..', 'assets', 'sprites', 'alien');
mkdirSync(outDir, { recursive: true });

const SIZE = 96;

// ── Disc geometry (pushed toward canvas bottom, same as regular sprites scaled ×2) ──
const DX = 48, DY = 65;
const DRX = 38, DRY = 11;

// ── Dome geometry (floats above disc) ──
const DOME_CX = 48, DOME_CY = 40;
const DOME_R  = 20;

// ── Palette — crimson dreadnought ──────────────────────────────────────────────
const DISC_DARK   = '#2a0812';
const DISC_MID    = '#5c1828';
const DISC_ACCENT = '#8c2e42';
const DISC_LIGHT  = '#c04455';
const DOME_FILL   = '#140008';
const DOME_RING   = '#ff2244';
const GLOW_COL    = '#ff1133';

// ── Frog colours ──────────────────────────────────────────────────────────────
const FROG_GREEN = '#2eaa2e';
const FROG_LIGHT = '#4acc4a';
const FROG_DARK  = '#155a15';
const EYE_YEL    = '#dde840';
const PUPIL      = '#cc1111';   // menacing red pupils

// 12 rim lights — alternating crimson and gold (evenly spaced at 30° intervals)
const RIM_COLORS = [
    '#ff3344', '#ffcc00', '#ff4455', '#ffaa00',
    '#ff2233', '#ffdd11', '#ff5566', '#ffbb00',
    '#ff3344', '#ffcc00', '#ff4455', '#ffaa00',
];

const r2 = n => +n.toFixed(2);

// ── Frog group ─────────────────────────────────────────────────────────────────
// Base pose faces +x (right). Entire group is rotated by travelDeg around the
// dome centre so the frog always faces the direction of travel.
//
// All elements are sized to stay within dome radius 20 of (DOME_CX, DOME_CY).
// Verified: dist(dome_center, element_center) + element_radius ≤ 18.5 for all parts.
function bossFrog(travelDeg) {
    const rot = `rotate(${travelDeg}, ${DOME_CX}, ${DOME_CY})`;
    const cx = DOME_CX, cy = DOME_CY;

    return [
        `  <g transform="${rot}">`,

        // ── Body ──────────────────────────────────────────────────────────────
        // r=10, max reach from dome center = 10 ✓
        `    <circle cx="${cx}" cy="${cy}" r="10" fill="${FROG_GREEN}"/>`,
        `    <ellipse cx="${r2(cx-2)}" cy="${cy}" rx="6" ry="8" fill="${FROG_LIGHT}" opacity="0.30"/>`,

        // ── Head bump (leading side, +x in base pose) ─────────────────────────
        // rx=9 at cx+5=53 → rightmost x=62, dist from dome center = 14 ✓
        `    <ellipse cx="${r2(cx+5)}" cy="${cy}" rx="9" ry="7.5" fill="${FROG_GREEN}"/>`,
        `    <ellipse cx="${r2(cx+7)}" cy="${cy}" rx="5" ry="4"   fill="${FROG_LIGHT}" opacity="0.22"/>`,

        // ── Arm stubs (trailing side, gripping controls) ──────────────────────
        // centers at (cx-4, cy±9), max reach ≈ sqrt(4²+9²)+4 = 13.9 ✓
        `    <ellipse cx="${r2(cx-4)}" cy="${r2(cy-9)}" rx="4" ry="2.5" fill="${FROG_DARK}"`,
        `             transform="rotate(-35,${r2(cx-4)},${r2(cy-9)})"/>`,
        `    <ellipse cx="${r2(cx-4)}" cy="${r2(cy+9)}" rx="4" ry="2.5" fill="${FROG_DARK}"`,
        `             transform="rotate(35,${r2(cx-4)},${r2(cy+9)})"/>`,
        `    <circle  cx="${r2(cx-7)}" cy="${r2(cy-11)}" r="1.8" fill="${FROG_GREEN}"/>`,
        `    <circle  cx="${r2(cx-7)}" cy="${r2(cy+11)}" r="1.8" fill="${FROG_GREEN}"/>`,

        // ── Upper eye — center (57, 32), dist=12.0, +r4.5 = 16.5 ✓ ──────────
        `    <circle cx="${r2(cx+9)}"  cy="${r2(cy-8)}"  r="4.5" fill="${EYE_YEL}"/>`,
        `    <circle cx="${r2(cx+10)}" cy="${r2(cy-7)}"  r="2.2" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(cx+8)}"  cy="${r2(cy-9.5)}" r="1"  fill="white"/>`,
        // Angry upper brow — tip at (59, 26), dist = 17.8 ✓
        `    <path d="M ${r2(cx+4)} ${r2(cy-14)} L ${r2(cx+11)} ${r2(cy-10)}"`,
        `          stroke="${FROG_DARK}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,

        // ── Lower eye — center (57, 48), symmetric ✓ ─────────────────────────
        `    <circle cx="${r2(cx+9)}"  cy="${r2(cy+8)}"  r="4.5" fill="${EYE_YEL}"/>`,
        `    <circle cx="${r2(cx+10)}" cy="${r2(cy+9)}"  r="2.2" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(cx+8)}"  cy="${r2(cy+6.5)}" r="1"  fill="white"/>`,
        // Angry lower brow
        `    <path d="M ${r2(cx+4)} ${r2(cy+14)} L ${r2(cx+11)} ${r2(cy+10)}"`,
        `          stroke="${FROG_DARK}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,

        // ── Nostrils — dist ≈ 5.4 ✓ ──────────────────────────────────────────
        `    <circle cx="${r2(cx+5)}" cy="${r2(cy-2.5)}" r="1.5" fill="${FROG_DARK}"/>`,
        `    <circle cx="${r2(cx+5)}" cy="${r2(cy+2.5)}" r="1.5" fill="${FROG_DARK}"/>`,

        // ── Snarl — all points within r=14 of dome center ✓ ─────────────────
        `    <path d="M ${r2(cx+6)} ${r2(cy+3)} Q ${r2(cx+11)} ${r2(cy+4.5)} ${r2(cx+9)} ${r2(cy+8)}"`,
        `          stroke="${FROG_DARK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,

        `  </g>`,
    ].join('\n');
}

// ── Full sprite builder ───────────────────────────────────────────────────────
function buildSVG(travelDeg) {
    const trailRad = ((travelDeg + 180) % 360) * (Math.PI / 180);

    // Triple engine glow on trailing side
    const gx = r2(DX + Math.cos(trailRad) * DRX * 0.62);
    const gy = r2(DY + Math.sin(trailRad) * DRY * 0.75);

    // 12 rim lights at 30° spacing
    const rimDots = RIM_COLORS.map((col, i) => {
        const a  = (i * 30) * (Math.PI / 180);
        const lx = r2(DX + Math.cos(a) * DRX * 0.87);
        const ly = r2(DY + Math.sin(a) * DRY * 0.87);
        return `  <circle cx="${lx}" cy="${ly}" r="2.2" fill="${col}" opacity="0.95"/>`;
    }).join('\n');

    // 3 weapon pods on the disc face at 0°, 120°, 240° (dark socket + glowing emitter)
    const pods = [0, 120, 240].map(deg => {
        const rad = deg * (Math.PI / 180);
        const px  = r2(DX + Math.cos(rad) * DRX * 0.70);
        const py  = r2(DY + Math.sin(rad) * DRY * 0.70);
        return [
            `  <circle cx="${px}" cy="${py}" r="4.5" fill="${DISC_DARK}"/>`,
            `  <circle cx="${px}" cy="${py}" r="2.5" fill="${GLOW_COL}" opacity="0.72"/>`,
            `  <circle cx="${px}" cy="${py}" r="1"   fill="white"       opacity="0.60"/>`,
        ].join('\n');
    }).join('\n');

    return [
        `<svg xmlns="http://www.w3.org/2000/svg"`,
        `     viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
        ``,
        `  <!-- Triple engine glow (trailing side) -->`,
        `  <ellipse cx="${gx}" cy="${gy}" rx="12" ry="7"  fill="${GLOW_COL}" opacity="0.70"/>`,
        `  <ellipse cx="${gx}" cy="${gy}" rx="20" ry="12" fill="${GLOW_COL}" opacity="0.22"/>`,
        `  <ellipse cx="${gx}" cy="${gy}" rx="30" ry="18" fill="${GLOW_COL}" opacity="0.07"/>`,
        ``,
        `  <!-- Disc drop shadow -->`,
        `  <ellipse cx="${DX}" cy="${DY+5}" rx="${DRX+1}" ry="${DRY+2}" fill="black" opacity="0.28"/>`,
        ``,
        `  <!-- Disc — 4 depth layers (dark outer rim → bright inner plateau) -->`,
        `  <ellipse cx="${DX}" cy="${DY}"   rx="${DRX}"    ry="${DRY}"     fill="${DISC_DARK}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-1}" rx="${DRX-6}"  ry="${DRY-1.5}" fill="${DISC_MID}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-2}" rx="${DRX-14}" ry="${DRY-3}"   fill="${DISC_ACCENT}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-3}" rx="${DRX-22}" ry="${DRY-4.5}" fill="${DISC_LIGHT}"/>`,
        ``,
        `  <!-- Weapon pods (3 emitters, fixed — do not rotate with frog) -->`,
        pods,
        ``,
        `  <!-- 12 rim accent lights -->`,
        rimDots,
        ``,
        `  <!-- Dome interior (dark cavity behind glass) -->`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}" fill="${DOME_FILL}" opacity="0.84"/>`,
        ``,
        `  <!-- Boss frog (rotated to face travel direction) -->`,
        bossFrog(travelDeg),
        ``,
        `  <!-- Dome glass — outer ring, inner ring, shine highlight -->`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}"`,
        `          fill="none" stroke="${DOME_RING}" stroke-width="2.5" opacity="0.88"/>`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R - 3}"`,
        `          fill="none" stroke="${DOME_RING}" stroke-width="0.9" opacity="0.30"/>`,
        `  <ellipse cx="${DOME_CX - 5}" cy="${DOME_CY - 7}" rx="6" ry="4"`,
        `           fill="white" opacity="0.12"/>`,
        ``,
        `</svg>`,
    ].join('\n');
}

// ── Direction table (matches texture keys used in BossAlien.js) ───────────────
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
    const filename = `alien-boss-${dir}.svg`;
    const path     = join(outDir, filename);
    writeFileSync(path, buildSVG(angle), 'utf-8');
    console.log(`✔  ${path}`);
}

console.log('\nDone — 8 directional boss SVGs generated.');
