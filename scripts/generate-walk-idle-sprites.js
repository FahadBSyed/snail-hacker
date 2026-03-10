#!/usr/bin/env node
/**
 * Generates walk-cycle and idle animation frames for Gerald the Snail.
 *
 * Walk cycle — 6 frames, 10 fps (100 ms each = 600 ms loop):
 *   - Body = upper ellipse hump + rectangular foot prism below it.
 *   - Sine-wave ripple animates along the BOTTOM of the prism (muscular sole wave).
 *   - Eye stalks bob vertically with each stride.
 *   - Shell drawn LAST so it sits visually on top of the yellow body.
 *   Output: assets/snail-walk-{right,left,up,down}-f{00..05}.svg  (24 files)
 *
 * Idle animation — 12 frames, 8 fps (125 ms each ≈ 1.5 s loop):
 *   - Foot prism is flat (no wave).
 *   - Eye stalks gently drift side-to-side.
 *   - Single blink at frame 6 (half-close at 5, closed at 6, half-open at 7).
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

// ── Foot-prism path builders ───────────────────────────────────────────────────
// Each prism path: flat horizontal top edge, then sinusoidal bottom edge.
// wavePhase=null → flat prism (idle).

function prismPath(x0, x1, yTop, yBase, wavePhase, A, N) {
    const top = `M ${x0} ${yTop} L ${x1} ${yTop}`;
    if (wavePhase === null) {
        // Flat prism — no wave
        return `${top} L ${x1} ${yBase} L ${x0} ${yBase} Z`;
    }
    const STEPS = 12;
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
        const x      = x1 - (x1 - x0) * i / STEPS;  // right → left
        const ripple = A * Math.sin(wavePhase + (i / STEPS) * TAU * N);
        pts.push(`L ${f1(x)} ${f1(yBase + ripple)}`);
    }
    return `${top} ${pts.join(' ')} Z`;
}

// ── Right-view builders ────────────────────────────────────────────────────────
// Body = ellipse cx=30 cy=26 rx=12 ry=6  (spans y=20..32)
// Prism top y=30, base y=34 (overlaps ellipse bottom for seamless join)
// Shell drawn LAST.

function innerRight(phase, walkMode) {
    // walkMode: stalk bob + wavy prism. false: flat prism, drifting stalks.
    const bobY   = walkMode ? 1.0 * Math.sin(phase) : 0;
    const ltx = 28, lty = f1(14 + bobY);
    const rtx = 38, rty = f1(12 + bobY);

    const A = 0.6, N = 2;
    const foot = prismPath(18, 42, 30, 34, walkMode ? phase : null, A, N);

    // Idle stalk drift
    const driftX = walkMode ? 0 : 2.5 * Math.sin(phase);
    const iltx = f1(28 + driftX), irty = f1(12 + driftX);

    const [etx, ety]   = walkMode ? [ltx, lty] : [iltx, lty];
    const [etx2, ety2] = walkMode ? [rtx, rty] : [f1(38 + driftX), rty];

    return `
  <!-- body hump (ellipse) -->
  <ellipse cx="30" cy="26" rx="12" ry="6" fill="${BODY}"/>
  <!-- foot prism -->
  <path d="${foot}" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="14" cy="36" rx="4" ry="1.2" fill="${BODY}" opacity="0.25"/>

  <!-- antenna left — eye at stalk tip -->
  <line x1="32" y1="24" x2="${etx}" y2="${ety}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <!-- antenna right — eye at stalk tip -->
  <line x1="36" y1="24" x2="${etx2}" y2="${ety2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>

  <!-- shell LAST — sits on top of body -->
  <circle cx="18" cy="24" r="12" fill="${SHELL1}"/>
  <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>
  <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>
`;
}

// Eyes drawn on top of shell (separate pass so they're never covered)
function eyesRight(phase, walkMode, blinkStrength = 0) {
    const bobY   = walkMode ? 1.0 * Math.sin(phase) : 0;
    const driftX = walkMode ? 0 : 2.5 * Math.sin(phase);
    const ltx = f1(28 + driftX), lty = f1(14 + bobY);
    const rtx = f1(38 + driftX), rty = f1(12 + bobY);
    const r   = f1(2 * (1 - blinkStrength * 0.88));
    const showHL = blinkStrength < 0.5;
    return `
  <circle cx="${ltx}" cy="${lty}" r="${r}" fill="${EYE}"/>
  ${showHL ? `<circle cx="${f1(+ltx + 0.5)}" cy="${f1(+lty - 0.7)}" r="0.6" fill="white"/>` : ''}
  <circle cx="${rtx}" cy="${rty}" r="${r}" fill="${EYE}"/>
  ${showHL ? `<circle cx="${f1(+rtx + 0.6)}" cy="${f1(+rty - 0.7)}" r="0.6" fill="white"/>` : ''}
`;
}

function walkRight(phase) {
    return innerRight(phase, true) + eyesRight(phase, true);
}

function walkLeft(phase) {
    // Mirror: wrap entire right frame in a flip group
    return `
  <g transform="translate(${SIZE}, 0) scale(-1, 1)">
${walkRight(phase)}  </g>
`;
}

function idleRight(phase, blinkStrength) {
    return innerRight(phase, false) + eyesRight(phase, false, blinkStrength);
}

function idleLeft(phase, blinkStrength) {
    return `
  <g transform="translate(${SIZE}, 0) scale(-1, 1)">
${idleRight(phase, blinkStrength)}  </g>
`;
}

// ── Up-view builders ───────────────────────────────────────────────────────────
// Rear view: shell dominant. Head/stalks peek above shell.
// Foot prism peeks below shell (barely visible).
// Draw order: prism → shell → head body → stalks → eyes
// Shell is drawn AFTER the prism (on top of it), but BEFORE the head so head peeks above.

function walkUp(phase) {
    const shellBob = 0.8 * Math.sin(phase);
    const antBob   = 1.2 * Math.sin(phase);

    const shellCy = 26 + shellBob;
    const headCy  = 14 + shellBob * 0.5;
    const l1y = f1(12 + antBob * 0.5), l2y = f1(4 + antBob);

    // Tiny foot prism peeking below shell (shell bottom ≈ shellCy+13)
    const footTop = f1(shellCy + 12);
    const foot = prismPath(19, 29, +footTop, +footTop + 4, phase, 0.4, 1);

    return `
  <!-- foot prism peeking below shell -->
  <path d="${foot}" fill="${BODY}"/>

  <!-- shell (bobs with stride) — drawn over foot -->
  <circle cx="24" cy="${f1(shellCy)}"     r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="${f1(shellCy - 1)}" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="${f1(shellCy - 2)}" r="5"  fill="${SHELL3}"/>

  <!-- head body peeking above shell — drawn after shell -->
  <ellipse cx="24" cy="${f1(headCy)}" rx="6" ry="4" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="43" rx="3" ry="1.5" fill="${BODY}" opacity="0.25"/>

  <!-- antenna left — eye at tip (bobs) -->
  <line x1="20" y1="${l1y}" x2="12" y2="${l2y}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="12" cy="${l2y}" r="2" fill="${EYE}"/>

  <!-- antenna right — eye at tip (bobs) -->
  <line x1="28" y1="${l1y}" x2="36" y2="${l2y}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="36" cy="${l2y}" r="2" fill="${EYE}"/>
`;
}

function idleUp(phase, blinkStrength) {
    const driftX = 2 * Math.sin(phase);
    const l2x = f1(12 + driftX), r2x = f1(36 - driftX);  // stalks splay/pinch
    const eyeR = f1(2 * (1 - blinkStrength * 0.88));

    // Static foot prism (no wave for idle)
    const foot = prismPath(19, 29, 38, 42, null, 0, 0);

    return `
  <!-- foot prism (flat, idle) -->
  <path d="${foot}" fill="${BODY}"/>

  <!-- shell -->
  <circle cx="24" cy="26" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="25" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="24" r="5"  fill="${SHELL3}"/>

  <!-- head body -->
  <ellipse cx="24" cy="14" rx="6" ry="4" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="43" rx="3" ry="1.5" fill="${BODY}" opacity="0.25"/>

  <!-- antenna left -->
  <line x1="20" y1="12" x2="${l2x}" y2="4" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${l2x}" cy="4" r="${eyeR}" fill="${EYE}"/>

  <!-- antenna right -->
  <line x1="28" y1="12" x2="${r2x}" y2="4" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${r2x}" cy="4" r="${eyeR}" fill="${EYE}"/>
`;
}

// ── Down-view builders ─────────────────────────────────────────────────────────
// Front view: head faces camera (stalks point down-outward).
// Body = ellipse hump (cy=31) + foot prism (below, y=34..39, wavy).
// Shell at top (cy=18), drawn LAST.

function walkDown(phase) {
    const antSwayX = 1.5 * Math.sin(phase);
    const antBobY  = 1.0 * Math.sin(phase);
    const l2x = f1(14 + antSwayX * 0.5), l2y = f1(42 + antBobY);
    const r2x = f1(34 + antSwayX * 0.5), r2y = l2y;

    const foot = prismPath(18, 30, 34, 39, phase, 0.6, 1.5);

    return `
  <!-- body hump (ellipse) -->
  <ellipse cx="24" cy="31" rx="6" ry="5" fill="${BODY}"/>
  <!-- foot prism (sine-wave sole) -->
  <path d="${foot}" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="8" rx="3" ry="1.5" fill="${BODY}" opacity="0.25"/>

  <!-- antenna left — eye at stalk tip -->
  <line x1="20" y1="32" x2="${l2x}" y2="${l2y}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${l2x}" cy="${l2y}" r="2" fill="${EYE}"/>
  <circle cx="${f1(+l2x + 0.6)}" cy="${f1(+l2y - 0.7)}" r="0.7" fill="white"/>

  <!-- antenna right — eye at stalk tip -->
  <line x1="28" y1="32" x2="${r2x}" y2="${r2y}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${r2x}" cy="${r2y}" r="2" fill="${EYE}"/>
  <circle cx="${f1(+r2x + 0.6)}" cy="${f1(+r2y - 0.7)}" r="0.7" fill="white"/>

  <!-- mouth -->
  <path d="M22 33 Q24 35 26 33" stroke="${EYE}" stroke-width="0.8" fill="none" stroke-linecap="round"/>

  <!-- shell LAST — sits on top of body at top of frame -->
  <circle cx="24" cy="18" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="19" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="20" r="5"  fill="${SHELL3}"/>
`;
}

function idleDown(phase, blinkStrength) {
    const driftX = 2 * Math.sin(phase);
    const l2x = f1(14 + driftX * 0.6), l2y = '42';
    const r2x = f1(34 + driftX * 0.6), r2y = '42';
    const eyeR = f1(2 * (1 - blinkStrength * 0.88));
    const showHL = blinkStrength < 0.5;

    const foot = prismPath(18, 30, 34, 38, null, 0, 0);

    return `
  <!-- body hump (ellipse) -->
  <ellipse cx="24" cy="31" rx="6" ry="5" fill="${BODY}"/>
  <!-- foot prism (flat, idle) -->
  <path d="${foot}" fill="${BODY}"/>

  <!-- slime trail -->
  <ellipse cx="24" cy="8" rx="3" ry="1.5" fill="${BODY}" opacity="0.25"/>

  <!-- antenna left — drifting eye -->
  <line x1="20" y1="32" x2="${l2x}" y2="${l2y}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${l2x}" cy="${l2y}" r="${eyeR}" fill="${EYE}"/>
  ${showHL ? `<circle cx="${f1(+l2x + 0.6)}" cy="41.3" r="0.7" fill="white"/>` : ''}

  <!-- antenna right — drifting eye -->
  <line x1="28" y1="32" x2="${r2x}" y2="${r2y}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="${r2x}" cy="${r2y}" r="${eyeR}" fill="${EYE}"/>
  ${showHL ? `<circle cx="${f1(+r2x + 0.6)}" cy="41.3" r="0.7" fill="white"/>` : ''}

  <!-- mouth -->
  <path d="M22 33 Q24 35 26 33" stroke="${EYE}" stroke-width="0.8" fill="none" stroke-linecap="round"/>

  <!-- shell LAST -->
  <circle cx="24" cy="18" r="13" fill="${SHELL1}"/>
  <circle cx="24" cy="19" r="9"  fill="${SHELL2}"/>
  <circle cx="24" cy="20" r="5"  fill="${SHELL3}"/>
`;
}

// ── Blink per idle frame ───────────────────────────────────────────────────────
const IDLE_FRAMES = 12;
function blinkAt(fi) {
    if (fi === 6) return 1.0;
    if (fi === 5 || fi === 7) return 0.45;
    return 0;
}

// ── Generate all files ────────────────────────────────────────────────────────
const WALK_FRAMES = 6;
const files = {};

for (let fi = 0; fi < WALK_FRAMES; fi++) {
    const fname = `f${String(fi).padStart(2, '0')}`;
    const phase = (fi / WALK_FRAMES) * TAU;

    files[`snail-walk-right-${fname}.svg`] = svgWrap(walkRight(phase));
    files[`snail-walk-left-${fname}.svg`]  = svgWrap(walkLeft(phase));
    files[`snail-walk-up-${fname}.svg`]    = svgWrap(walkUp(phase));
    files[`snail-walk-down-${fname}.svg`]  = svgWrap(walkDown(phase));
}

for (let fi = 0; fi < IDLE_FRAMES; fi++) {
    const fname = `f${String(fi).padStart(2, '0')}`;
    const phase = (fi / IDLE_FRAMES) * TAU;
    const blink = blinkAt(fi);

    files[`snail-idle-right-${fname}.svg`] = svgWrap(idleRight(phase, blink));
    files[`snail-idle-left-${fname}.svg`]  = svgWrap(idleLeft(phase, blink));
    files[`snail-idle-up-${fname}.svg`]    = svgWrap(idleUp(phase, blink));
    files[`snail-idle-down-${fname}.svg`]  = svgWrap(idleDown(phase, blink));
}

let count = 0;
for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(OUT, filename), content, 'utf-8');
    count++;
}

console.log(`✔  ${count} frames written to ${OUT}`);
console.log('Walk:  snail-walk-{dir}-f00..05  (6 frames @ 10 fps = 600 ms loop)');
console.log('Idle:  snail-idle-{dir}-f00..11  (12 frames @ 8 fps ≈ 1.5 s loop)');
