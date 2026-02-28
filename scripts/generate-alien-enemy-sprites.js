#!/usr/bin/env node
/**
 * Generates 8 directional SVG sprites for FastAlien, TankAlien, and BomberAlien.
 * Same saucer/frog geometry as generate-alien-saucer-sprites.js; only the
 * colour palette changes per alien type.
 *
 * Output filenames:
 *   assets/alien-fast-{right,diag-right-down,down,…}.svg
 *   assets/alien-tank-{right,…}.svg
 *   assets/alien-bomber-{right,…}.svg
 *
 * Run: node scripts/generate-alien-enemy-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = join(__dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });

const SIZE = 48;

// Shared geometry (same as BasicAlien saucer)
const DX = 24, DY = 30, DRX = 19, DRY = 6;
const DOME_CX = 24, DOME_CY = 21, DOME_R = 11;

// Frog colours (same for all types — same passenger, different ship)
const FROG_GREEN = '#3cb83c';
const FROG_DARK  = '#1d6b1d';
const EYE_YEL    = '#dde840';
const PUPIL      = '#111100';

const r2 = (n) => +n.toFixed(2);

// ── Per-type palettes ─────────────────────────────────────────────────────────
const PALETTES = {
    fast: {
        prefix:    'alien-fast',
        discDark:  '#2d1a52',
        discMid:   '#5c3799',
        discLight: '#9966dd',
        domeFill:  '#120a2e',
        domeRing:  '#cc66ff',
        glowCol:   '#aa44ff',
        rimColors: ['#dd44ff', '#aa22ee', '#cc66ff', '#9900cc', '#ee55ff', '#bb33ee'],
    },
    tank: {
        prefix:    'alien-tank',
        discDark:  '#1e2a33',
        discMid:   '#445566',
        discLight: '#7a9aaa',
        domeFill:  '#001018',
        domeRing:  '#88aacc',
        glowCol:   '#4499cc',
        rimColors: ['#4499cc', '#6699aa', '#88aacc', '#336688', '#55aadd', '#7799bb'],
    },
    bomber: {
        prefix:    'alien-bomber',
        discDark:  '#5c2a10',
        discMid:   '#994422',
        discLight: '#dd7733',
        domeFill:  '#1c0800',
        domeRing:  '#ff7722',
        glowCol:   '#ff6600',
        rimColors: ['#ff4400', '#ffaa00', '#ff6600', '#ee3300', '#ffbb22', '#ff5500'],
    },
};

// ── Direction table ───────────────────────────────────────────────────────────
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

function buildSVG(travelDeg, palette) {
    const { discDark, discMid, discLight, domeFill, domeRing, glowCol, rimColors } = palette;

    const trailRad = ((travelDeg + 180) % 360) * (Math.PI / 180);
    const glowX = r2(DX + Math.cos(trailRad) * DRX * 0.62);
    const glowY = r2(DY + Math.sin(trailRad) * DRY * 0.75);

    const rimDots = rimColors.map((col, i) => {
        const a  = (i * 60) * (Math.PI / 180);
        const lx = r2(DX + Math.cos(a) * DRX * 0.88);
        const ly = r2(DY + Math.sin(a) * DRY * 0.88);
        return `  <circle cx="${lx}" cy="${ly}" r="1.8" fill="${col}" opacity="0.95"/>`;
    }).join('\n');

    const rot = `rotate(${travelDeg}, ${DOME_CX}, ${DOME_CY})`;
    const cx = DOME_CX, cy = DOME_CY;

    const frog = [
        `  <g transform="${rot}">`,
        `    <circle cx="${cx}"   cy="${cy}"   r="8"   fill="${FROG_GREEN}"/>`,
        `    <circle cx="${cx+4}" cy="${cy}"   r="6"   fill="${FROG_GREEN}"/>`,
        `    <circle cx="${cx+6}" cy="${cy-6}" r="4"   fill="${EYE_YEL}"/>`,
        `    <circle cx="${r2(cx+6.7)}" cy="${r2(cy-5.5)}" r="1.8" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(cx+5.2)}" cy="${r2(cy-7.2)}" r="0.7" fill="white"/>`,
        `    <circle cx="${cx+6}" cy="${cy+6}" r="4"   fill="${EYE_YEL}"/>`,
        `    <circle cx="${r2(cx+6.7)}" cy="${r2(cy+6.5)}" r="1.8" fill="${PUPIL}"/>`,
        `    <circle cx="${r2(cx+5.2)}" cy="${r2(cy+4.8)}" r="0.7" fill="white"/>`,
        `    <circle cx="${cx+3}" cy="${r2(cy-1.4)}" r="1" fill="${FROG_DARK}"/>`,
        `    <circle cx="${cx+3}" cy="${r2(cy+1.4)}" r="1" fill="${FROG_DARK}"/>`,
        `    <path d="M ${cx+4} ${cy+2} Q ${cx+8} ${cy+3.5} ${cx+4} ${cy+5.5}"`,
        `          stroke="${FROG_DARK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
        `  </g>`,
    ].join('\n');

    return [
        `<svg xmlns="http://www.w3.org/2000/svg"`,
        `     viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
        ``,
        `  <!-- Engine glow (trailing side of disc) -->`,
        `  <ellipse cx="${glowX}" cy="${glowY}" rx="5" ry="3.5" fill="${glowCol}" opacity="0.85"/>`,
        `  <ellipse cx="${glowX}" cy="${glowY}" rx="9" ry="5.5" fill="${glowCol}" opacity="0.20"/>`,
        ``,
        `  <!-- Disc shadow -->`,
        `  <ellipse cx="${DX}" cy="${DY+3}" rx="${DRX-1}" ry="${DRY-1}" fill="black" opacity="0.22"/>`,
        ``,
        `  <!-- Saucer disc (three layers for a rim-depth illusion) -->`,
        `  <ellipse cx="${DX}" cy="${DY}"   rx="${DRX}"   ry="${DRY}"   fill="${discDark}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-1}" rx="${DRX-4}" ry="${DRY-1.5}" fill="${discMid}"/>`,
        `  <ellipse cx="${DX}" cy="${DY-2}" rx="${DRX-9}" ry="${DRY-2.5}" fill="${discLight}"/>`,
        ``,
        `  <!-- Rim accent lights -->`,
        rimDots,
        ``,
        `  <!-- Dome interior -->`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}" fill="${domeFill}" opacity="0.78"/>`,
        ``,
        `  <!-- Frog (rotated to face travel direction) -->`,
        frog,
        ``,
        `  <!-- Dome glass ring + shine -->`,
        `  <circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}"`,
        `          fill="none" stroke="${domeRing}" stroke-width="1.8" opacity="0.75"/>`,
        `  <ellipse cx="${DOME_CX-3}" cy="${DOME_CY-4}" rx="3.5" ry="2.2"`,
        `           fill="white" opacity="0.13"/>`,
        ``,
        `</svg>`,
    ].join('\n');
}

for (const [type, palette] of Object.entries(PALETTES)) {
    for (const [dir, angle] of Object.entries(DIRECTIONS)) {
        const filename = `${palette.prefix}-${dir}.svg`;
        const path     = join(outDir, filename);
        writeFileSync(path, buildSVG(angle, palette), 'utf-8');
        console.log(`✔  ${path}`);
    }
}

console.log('\nDone — 24 directional enemy SVGs generated.');
