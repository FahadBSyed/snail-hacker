#!/usr/bin/env node
/**
 * Generates 4 directional SVG sprites for Gerald the Snail.
 *
 * Poses:
 *   right — side view, shell left, body right, antennae tilted right
 *   left  — horizontal mirror of right
 *   up    — rear view, shell prominent, antennae splayed, moving away
 *   down  — front view, face/eyes visible, antennae up, moving toward camera
 *
 * Output: assets/snail-{right,left,up,down}.svg
 *
 * Run: node scripts/generate-snail-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });

const SIZE = 48; // viewBox is 48x48

// ── Color palette ──
const BODY    = '#E8D44D'; // tan/yellow
const SHELL1  = '#8B5E3C'; // outer shell (dark brown)
const SHELL2  = '#A0714F'; // mid shell
const SHELL3  = '#BD8C64'; // inner shell
const EYE     = '#1a1a1a';
const ANTENNA = BODY;

function svgWrap(inner) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
        inner,
        `</svg>`,
    ].join('\n');
}

// ── Right-facing (side view) ──
function snailRight() {
    return svgWrap(`
  <!-- shell -->
  <circle cx="18" cy="24" r="12" fill="${SHELL1}"/>
  <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>
  <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>

  <!-- body -->
  <ellipse cx="30" cy="30" rx="12" ry="5" fill="${BODY}"/>

  <!-- slime trail hint -->
  <ellipse cx="16" cy="33" rx="4" ry="1.2" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — eye at tip -->
  <line x1="32" y1="26" x2="28" y2="14" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="28" cy="14" r="2" fill="${EYE}"/>
  <circle cx="28.5" cy="13.3" r="0.6" fill="white"/>

  <!-- antenna right — eye at tip -->
  <line x1="36" y1="26" x2="38" y2="12" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="38" cy="12" r="2" fill="${EYE}"/>
  <circle cx="38.6" cy="11.3" r="0.6" fill="white"/>
`);
}

// ── Left-facing (mirror of right) ──
function snailLeft() {
    return svgWrap(`
  <g transform="translate(${SIZE}, 0) scale(-1, 1)">
    <!-- shell -->
    <circle cx="18" cy="24" r="12" fill="${SHELL1}"/>
    <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>
    <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>

    <!-- body -->
    <ellipse cx="30" cy="30" rx="12" ry="5" fill="${BODY}"/>

    <!-- slime trail hint -->
    <ellipse cx="16" cy="33" rx="4" ry="1.2" fill="${BODY}" opacity="0.3"/>

    <!-- antenna left -->
    <line x1="32" y1="26" x2="28" y2="14" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="28" cy="14" r="2" fill="${ANTENNA}"/>

    <!-- antenna right -->
    <line x1="36" y1="26" x2="38" y2="12" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="38" cy="12" r="2" fill="${ANTENNA}"/>

    <!-- eye -->
    <circle cx="37" cy="27" r="1.8" fill="${EYE}"/>
    <circle cx="37.6" cy="26.4" r="0.6" fill="white"/>
  </g>
`);
}

// ── Up-facing (rear view — shell prominent, moving away) ──
function snailUp() {
    return svgWrap(`
  <!-- shell (large, centered, dominant) -->
  <circle cx="24" cy="26" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="25" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="24" r="5"  fill="${SHELL3}"/>

  <!-- body peeking above shell -->
  <ellipse cx="24" cy="14" rx="6" ry="4" fill="${BODY}"/>

  <!-- slime trail hint -->
  <ellipse cx="24" cy="40" rx="3" ry="1.5" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left (splayed outward) — eye stalk tip visible from rear -->
  <line x1="20" y1="12" x2="12" y2="4" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="12" cy="4" r="2" fill="${EYE}"/>

  <!-- antenna right (splayed outward) — eye stalk tip visible from rear -->
  <line x1="28" y1="12" x2="36" y2="4" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="36" cy="4" r="2" fill="${EYE}"/>
`);
}

// ── Down-facing (front view — face visible, moving toward camera) ──
function snailDown() {
    return svgWrap(`
  <!-- shell (behind, at top) -->
  <circle cx="24" cy="18" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="19" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="20" r="5"  fill="${SHELL3}"/>

  <!-- body extending down from shell -->
  <ellipse cx="24" cy="34" rx="6" ry="5" fill="${BODY}"/>

  <!-- slime trail hint -->
  <ellipse cx="24" cy="8" rx="3" ry="1.5" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — eye at stalk tip -->
  <line x1="20" y1="32" x2="14" y2="42" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="14" cy="42" r="2" fill="${EYE}"/>
  <circle cx="14.6" cy="41.3" r="0.7" fill="white"/>

  <!-- antenna right — eye at stalk tip -->
  <line x1="28" y1="32" x2="34" y2="42" stroke="${ANTENNA}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="34" cy="42" r="2" fill="${EYE}"/>
  <circle cx="34.6" cy="41.3" r="0.7" fill="white"/>

  <!-- mouth (small friendly curve) -->
  <path d="M22 36 Q24 38 26 36" stroke="${EYE}" stroke-width="0.8" fill="none" stroke-linecap="round"/>
`);
}

// ── Write files ──
const sprites = {
    'snail-right.svg': snailRight(),
    'snail-left.svg':  snailLeft(),
    'snail-up.svg':    snailUp(),
    'snail-down.svg':  snailDown(),
};

for (const [filename, svg] of Object.entries(sprites)) {
    const path = join(outDir, filename);
    writeFileSync(path, svg, 'utf-8');
    console.log(`✔ ${path}`);
}

console.log('\nDone — 4 directional SVGs generated.');
