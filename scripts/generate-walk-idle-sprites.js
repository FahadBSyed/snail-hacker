#!/usr/bin/env node
/**
 * Generates walk-cycle and idle animation frames for Gerald the Snail.
 *
 * Walk cycle — 6 frames, 10 fps (100 ms each = 600 ms loop):
 *   Sine-wave ripple along the underside of the body (muscular foot wave).
 *   Eye stalks bob vertically with each stride.
 *   Output: assets/snail-walk-{right,left,up,down}-f{00..05}.svg  (24 files)
 *
 * Idle animation — 12 frames, 8 fps (125 ms each ≈ 1.5 s loop):
 *   Eye stalks gently drift side-to-side.
 *   Single blink at frame 6 (half-close at 5, closed at 6, half-open at 7).
 *   Output: assets/snail-idle-{right,left,up,down}-f{00..11}.svg  (48 files)
 *
 * Run: node scripts/generate-walk-idle-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'assets');
mkdirSync(OUT, { recursive: true });

const SIZE = 48;
const TAU  = Math.PI * 2;

// Palette (matches other generators)
const BODY   = '#E8D44D';
const SHELL1 = '#8B5E3C';
const SHELL2 = '#A0714F';
const SHELL3 = '#BD8C64';
const EYE    = '#1a1a1a';

const f1 = n => n.toFixed(1);

function svgWrap(inner) {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" ` +
        `width="${SIZE}" height="${SIZE}">\n${inner}\n</svg>`
    );
}

// ── Body path helpers ──────────────────────────────────────────────────────────

// Right/left view: ellipse cx=30,cy=30,rx=12,ry=5 with a rippled bottom edge.
// wavePhase 0..TAU advances per frame; wave moves tail→head (correct snail locomotion).
function wavyBodyPathRight(wavePhase) {
    const cx = 30, cy = 30, rx = 12, ry = 5;
    const A = 1.3;   // ripple amplitude px
    const N = 2;     // crests along the foot

    // Top arc: cubic bezier approximating upper half of ellipse
    const top = `M ${cx - rx} ${cy} C ${cx - rx} ${cy - ry} ${cx + rx} ${cy - ry} ${cx + rx} ${cy}`;

    // Bottom wave: sample x from right (42) → left (18)
    const STEPS = 12;
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
        const x    = cx + rx - (2 * rx * i / STEPS);
        const tEll = (x - cx) / rx;
        const yBase = cy + ry * Math.sqrt(Math.max(0, 1 - tEll * tEll));
        const ripple = A * Math.sin(wavePhase + (i / STEPS) * TAU * N);
        pts.push(`L ${f1(x)} ${f1(yBase + ripple)}`);
    }

    return `${top} ${pts.join(' ')} Z`;
}

// Down view: body ellipse cx=24,cy=34,rx=6,ry=5 with rippled bottom.
function wavyBodyPathDown(wavePhase) {
    const cx = 24, cy = 34, rx = 6, ry = 5;
    const A = 1.0;
    const N = 1.5;

    const top = `M ${cx - rx} ${cy} C ${cx - rx} ${cy - ry} ${cx + rx} ${cy - ry} ${cx + rx} ${cy}`;

    const STEPS = 8;
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
        const x    = cx + rx - (2 * rx * i / STEPS);
        const tEll = (x - cx) / rx;
        const yBase = cy + ry * Math.sqrt(Math.max(0, 1 - tEll * tEll));
        const ripple = A * Math.sin(wavePhase + (i / STEPS) * TAU * N);
        pts.push(`L ${f1(x)} ${f1(yBase + ripple)}`);
    }

    return `${top} ${pts.join(' ')} Z`;
}

// ── Walk frame builders ────────────────────────────────────────────────────────

function walkRightInner(phase) {
    const bobY = 1.5 * Math.sin(phase);   // stalk tip vertical bob ±1.5 px

    // Left stalk: base (32,26) → tip (28, 14+bob)
    const ltx = 28, lty = 14 + bobY;
    // Right stalk: base (36,26) → tip (38, 12+bob)
    const rtx = 38, rty = 12 + bobY;

    return `
  <!-- shell -->
  <circle cx="18" cy="24" r="12" fill="${SHELL1}"/>
  <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>
  <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>

  <!-- body (wavy foot) -->
  <path d="${wavyBodyPathRight(phase)}" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="16" cy="33" rx="4" ry="1.2" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — eye at tip -->
  <line x1="32" y1="26" x2="${f1(ltx)}" y2="${f1(lty)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(ltx)}" cy="${f1(lty)}" r="2" fill="${EYE}"/>
  <circle cx="${f1(ltx + 0.5)}" cy="${f1(lty - 0.7)}" r="0.6" fill="white"/>

  <!-- antenna right — eye at tip -->
  <line x1="36" y1="26" x2="${f1(rtx)}" y2="${f1(rty)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(rtx)}" cy="${f1(rty)}" r="2" fill="${EYE}"/>
  <circle cx="${f1(rtx + 0.6)}" cy="${f1(rty - 0.7)}" r="0.6" fill="white"/>
`;
}

function walkLeft(phase) {
    // Mirror of right inside a flip transform
    return `
  <g transform="translate(${SIZE}, 0) scale(-1, 1)">
${walkRightInner(phase)}  </g>
`;
}

function walkUp(phase) {
    const shellBob = 0.8 * Math.sin(phase);
    const antBob   = 1.2 * Math.sin(phase);

    const shellCy = 26 + shellBob;
    const bodyCy  = 14 + shellBob * 0.5;

    // Left stalk: base (20, 12+bob*0.5) → tip (12, 4+bob)
    const l1y = 12 + antBob * 0.5, l2y = 4 + antBob;
    // Right stalk: base (28, l1y) → tip (36, l2y)

    return `
  <!-- shell (bobs with stride) -->
  <circle cx="24" cy="${f1(shellCy)}"     r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="${f1(shellCy - 1)}" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="${f1(shellCy - 2)}" r="5"  fill="${SHELL3}"/>

  <!-- body peeking above shell -->
  <ellipse cx="24" cy="${f1(bodyCy)}" rx="6" ry="4" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="40" rx="3" ry="1.5" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — eye at tip (bobs) -->
  <line x1="20" y1="${f1(l1y)}" x2="12" y2="${f1(l2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="12" cy="${f1(l2y)}" r="2" fill="${EYE}"/>

  <!-- antenna right — eye at tip (bobs) -->
  <line x1="28" y1="${f1(l1y)}" x2="36" y2="${f1(l2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="36" cy="${f1(l2y)}" r="2" fill="${EYE}"/>
`;
}

function walkDown(phase) {
    const antSwayX = 1.5 * Math.sin(phase);   // stalks sway side-to-side
    const antBobY  = 1.0 * Math.sin(phase);

    // Left stalk: base (20,32) → tip (14+sway, 42+bob)
    const l2x = 14 + antSwayX * 0.5, l2y = 42 + antBobY;
    // Right stalk: base (28,32) → tip (34+sway, 42+bob)
    const r2x = 34 + antSwayX * 0.5, r2y = l2y;

    return `
  <!-- shell (behind, at top) -->
  <circle cx="24" cy="18" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="19" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="20" r="5"  fill="${SHELL3}"/>

  <!-- body (wavy foot) -->
  <path d="${wavyBodyPathDown(phase)}" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="8" rx="3" ry="1.5" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — eye at stalk tip -->
  <line x1="20" y1="32" x2="${f1(l2x)}" y2="${f1(l2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(l2x)}" cy="${f1(l2y)}" r="2" fill="${EYE}"/>
  <circle cx="${f1(l2x + 0.6)}" cy="${f1(l2y - 0.7)}" r="0.7" fill="white"/>

  <!-- antenna right — eye at stalk tip -->
  <line x1="28" y1="32" x2="${f1(r2x)}" y2="${f1(r2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(r2x)}" cy="${f1(r2y)}" r="2" fill="${EYE}"/>
  <circle cx="${f1(r2x + 0.6)}" cy="${f1(r2y - 0.7)}" r="0.7" fill="white"/>

  <!-- mouth -->
  <path d="M22 36 Q24 38 26 36" stroke="${EYE}" stroke-width="0.8" fill="none" stroke-linecap="round"/>
`;
}

// ── Idle frame builders ────────────────────────────────────────────────────────
// blinkStrength: 0 = eyes fully open, 1 = eyes fully closed

function idleRightInner(phase, blinkStrength) {
    // Both stalks drift together left/right — snail looking around
    const driftX = 2.5 * Math.sin(phase);

    const ltx = 28 + driftX, lty = 14;
    const rtx = 38 + driftX, rty = 12;

    const eyeR = f1(2 * (1 - blinkStrength * 0.88));  // shrinks toward 0.24 when closed
    const showHighlight = blinkStrength < 0.5;

    return `
  <!-- shell -->
  <circle cx="18" cy="24" r="12" fill="${SHELL1}"/>
  <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>
  <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>

  <!-- body -->
  <ellipse cx="30" cy="30" rx="12" ry="5" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="16" cy="33" rx="4" ry="1.2" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — drifting eye -->
  <line x1="32" y1="26" x2="${f1(ltx)}" y2="${f1(lty)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(ltx)}" cy="${f1(lty)}" r="${eyeR}" fill="${EYE}"/>
  ${showHighlight ? `<circle cx="${f1(ltx + 0.5)}" cy="${f1(lty - 0.7)}" r="0.6" fill="white"/>` : ''}

  <!-- antenna right — drifting eye -->
  <line x1="36" y1="26" x2="${f1(rtx)}" y2="${f1(rty)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(rtx)}" cy="${f1(rty)}" r="${eyeR}" fill="${EYE}"/>
  ${showHighlight ? `<circle cx="${f1(rtx + 0.6)}" cy="${f1(rty - 0.7)}" r="0.6" fill="white"/>` : ''}
`;
}

function idleLeft(phase, blinkStrength) {
    return `
  <g transform="translate(${SIZE}, 0) scale(-1, 1)">
${idleRightInner(phase, blinkStrength)}  </g>
`;
}

function idleUp(phase, blinkStrength) {
    // Stalks drift inward/outward — rear view of snail looking around
    const driftX = 2 * Math.sin(phase);

    const l2x = 12 + driftX, l2y = 4;
    const r2x = 36 - driftX, r2y = 4;   // opposite direction = pinch/splay

    const eyeR = f1(2 * (1 - blinkStrength * 0.88));

    return `
  <!-- shell -->
  <circle cx="24" cy="26" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="25" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="24" r="5"  fill="${SHELL3}"/>

  <!-- body peeking above shell -->
  <ellipse cx="24" cy="14" rx="6" ry="4" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="40" rx="3" ry="1.5" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — drifting eye stalk tip -->
  <line x1="20" y1="12" x2="${f1(l2x)}" y2="${f1(l2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(l2x)}" cy="${f1(l2y)}" r="${eyeR}" fill="${EYE}"/>

  <!-- antenna right — drifting eye stalk tip -->
  <line x1="28" y1="12" x2="${f1(r2x)}" y2="${f1(r2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(r2x)}" cy="${f1(r2y)}" r="${eyeR}" fill="${EYE}"/>
`;
}

function idleDown(phase, blinkStrength) {
    const driftX = 2 * Math.sin(phase);

    const l2x = 14 + driftX * 0.6, l2y = 42;
    const r2x = 34 + driftX * 0.6, r2y = 42;

    const eyeR = f1(2 * (1 - blinkStrength * 0.88));
    const showHighlight = blinkStrength < 0.5;

    return `
  <!-- shell (behind, at top) -->
  <circle cx="24" cy="18" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="19" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="20" r="5"  fill="${SHELL3}"/>

  <!-- body -->
  <ellipse cx="24" cy="34" rx="6" ry="5" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="8" rx="3" ry="1.5" fill="${BODY}" opacity="0.3"/>

  <!-- antenna left — drifting eye -->
  <line x1="20" y1="32" x2="${f1(l2x)}" y2="${f1(l2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(l2x)}" cy="${f1(l2y)}" r="${eyeR}" fill="${EYE}"/>
  ${showHighlight ? `<circle cx="${f1(l2x + 0.6)}" cy="${f1(l2y - 0.7)}" r="0.7" fill="white"/>` : ''}

  <!-- antenna right — drifting eye -->
  <line x1="28" y1="32" x2="${f1(r2x)}" y2="${f1(r2y)}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${f1(r2x)}" cy="${f1(r2y)}" r="${eyeR}" fill="${EYE}"/>
  ${showHighlight ? `<circle cx="${f1(r2x + 0.6)}" cy="${f1(r2y - 0.7)}" r="0.7" fill="white"/>` : ''}

  <!-- mouth -->
  <path d="M22 36 Q24 38 26 36" stroke="${EYE}" stroke-width="0.8" fill="none" stroke-linecap="round"/>
`;
}

// ── Blink strength per idle frame ─────────────────────────────────────────────
// Frame 5: half-close, frame 6: fully closed, frame 7: half-open, all others: 0
const IDLE_FRAMES = 12;
function blinkAt(fi) {
    if (fi === 6) return 1.0;
    if (fi === 5 || fi === 7) return 0.45;
    return 0;
}

// ── Generate all files ────────────────────────────────────────────────────────
const WALK_FRAMES = 6;
const files = {};

// Walk frames
for (let fi = 0; fi < WALK_FRAMES; fi++) {
    const fname = `f${String(fi).padStart(2, '0')}`;
    const phase = (fi / WALK_FRAMES) * TAU;

    files[`snail-walk-right-${fname}.svg`] = svgWrap(walkRightInner(phase));
    files[`snail-walk-left-${fname}.svg`]  = svgWrap(walkLeft(phase));
    files[`snail-walk-up-${fname}.svg`]    = svgWrap(walkUp(phase));
    files[`snail-walk-down-${fname}.svg`]  = svgWrap(walkDown(phase));
}

// Idle frames
for (let fi = 0; fi < IDLE_FRAMES; fi++) {
    const fname  = `f${String(fi).padStart(2, '0')}`;
    const phase  = (fi / IDLE_FRAMES) * TAU;
    const blink  = blinkAt(fi);

    files[`snail-idle-right-${fname}.svg`] = svgWrap(idleRightInner(phase, blink));
    files[`snail-idle-left-${fname}.svg`]  = svgWrap(idleLeft(phase, blink));
    files[`snail-idle-up-${fname}.svg`]    = svgWrap(idleUp(phase, blink));
    files[`snail-idle-down-${fname}.svg`]  = svgWrap(idleDown(phase, blink));
}

// Write
let count = 0;
for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(OUT, filename), content, 'utf-8');
    count++;
}

console.log(`✔  ${count} frames written to ${OUT}`);
console.log('Walk:  snail-walk-{dir}-f00..05  (6 frames @ 10 fps = 600 ms loop)');
console.log('Idle:  snail-idle-{dir}-f00..11  (12 frames @ 8 fps ≈ 1.5 s loop)');
