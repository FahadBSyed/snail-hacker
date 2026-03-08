#!/usr/bin/env node
/**
 * Generates invincibility-animation SVG frames for Gerald the Snail.
 *
 * When the snail takes damage he retreats into his shell and flashes white.
 *
 * Animation structure (3 seconds total, driven by Phaser):
 *   Phase 1 — Withdraw (1 s): frames f00–f07  snail retracts into shell
 *   Phase 2 — Shell    (1 s): frames f08–f15  shell only, white pulse
 *   Phase 3 — Extend   (1 s): Phaser replays f07→f00 in reverse; no extra files needed
 *
 * White flash baked into each frame via SVG full-frame overlay:
 *   f00=0.75  f01=0.45  f02=0.25  f03=0.10  f04–f07=0.00
 *   f08,f10,f12,f14=0.45  f09,f11,f13,f15=0.00
 *
 * Output: assets/snail-hit-{right,left,up,down}-f{00-15}.svg  (64 files)
 * Run:    node scripts/generate-damage-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'assets');
mkdirSync(OUT, { recursive: true });

const SIZE   = 48;

// ── Palette (matches generate-snail-sprites.js) ──────────────────────────────
const BODY   = '#E8D44D';
const SHELL1 = '#8B5E3C';
const SHELL2 = '#A0714F';
const SHELL3 = '#BD8C64';
const EYE    = '#1a1a1a';

// ── Helpers ───────────────────────────────────────────────────────────────────
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const f1    = (n) => n.toFixed(1);   // 1 decimal — coordinates
const f2    = (n) => n.toFixed(2);   // 2 decimals — opacities / small radii

function svgWrap(body) {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" ` +
        `width="${SIZE}" height="${SIZE}">\n${body}\n</svg>`
    );
}

// White flash overlay opacity per frame index 0-15
// (kept as documentation; overlay no longer rendered — animation alone signals damage)
const FLASH = [
    0.75, 0.45, 0.25, 0.10, 0.00, 0.00, 0.00, 0.00,  // f00–f07 (withdraw)
    0.45, 0.00, 0.45, 0.00, 0.45, 0.00, 0.45, 0.00,  // f08–f15 (shell pulse)
];

function flashRect(_opacity) {
    return '';  // white square removed — withdrawal animation is the visual cue
}

// ── RIGHT-facing withdrawal ───────────────────────────────────────────────────
// Shell fixed at cx=18,cy=24.  Body/antennae/eye retract leftward into shell.
// Shell opening (right side of shell): approximately x=28, y=24.

function rightSnailInner(t) {
    let s = '';

    // Slime trail — fades out first
    const slimeA = clamp(0.3 * (1 - t * 3));
    if (slimeA > 0.001) {
        s += `  <ellipse cx="16" cy="33" rx="4" ry="1.2" fill="${BODY}" opacity="${f2(slimeA)}"/>\n`;
    }

    // Shell — always drawn; stays fixed
    s += `  <circle cx="18" cy="24" r="12" fill="${SHELL1}"/>\n`;
    s += `  <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>\n`;
    s += `  <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>\n`;

    // Body — retracts toward shell opening, shrinks
    const bodyVis = clamp(1 - t * 1.4);
    if (bodyVis > 0.001) {
        const cx = f1(lerp(30, 27, t));
        const cy = f1(lerp(30, 26, t));
        const rx = f1(lerp(12,  0, t));
        const ry = f1(lerp( 5,  0, t));
        const op = bodyVis < 0.999 ? ` opacity="${f2(bodyVis)}"` : '';
        s += `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BODY}"${op}/>\n`;
    }

    // Antennae — retract toward shell opening
    const antVis = clamp(1 - t * 1.6);
    if (antVis > 0.001) {
        const op   = f2(antVis);
        const lx1  = f1(lerp(32, 26, t)), ly1 = f1(lerp(26, 25, t));
        const lx2  = f1(lerp(28, 24, t)), ly2 = f1(lerp(14, 22, t));
        const rx1  = f1(lerp(36, 26, t)), ry1 = f1(lerp(26, 25, t));
        const rx2  = f1(lerp(38, 24, t)), ry2 = f1(lerp(12, 22, t));
        const antOp = antVis < 0.999 ? ` opacity="${op}"` : '';
        s += `  <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"${antOp}/>\n`;
        s += `  <circle cx="${lx2}" cy="${ly2}" r="2" fill="${BODY}"${antOp}/>\n`;
        s += `  <line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"${antOp}/>\n`;
        s += `  <circle cx="${rx2}" cy="${ry2}" r="2" fill="${BODY}"${antOp}/>\n`;
    }

    // Eye — retracts toward shell
    const eyeVis = clamp(1 - t * 1.6);
    if (eyeVis > 0.001) {
        const ex   = f1(lerp(37.0, 26.0, t));
        const ey   = f1(lerp(27.0, 25.0, t));
        const eyeOp = eyeVis < 0.999 ? ` opacity="${f2(eyeVis)}"` : '';
        s += `  <circle cx="${ex}" cy="${ey}" r="1.8" fill="${EYE}"${eyeOp}/>\n`;
        if (eyeVis > 0.5) {
            const hx  = f1(lerp(37.6, 26.4, t));
            const hy  = f1(lerp(26.4, 24.6, t));
            const hop = f2((eyeVis - 0.5) * 2);
            s += `  <circle cx="${hx}" cy="${hy}" r="0.6" fill="white" opacity="${hop}"/>\n`;
        }
    }

    return s;
}

function rightShellInner(breathe) {
    const r1 = breathe ? '12.5' : '12';
    return (
        `  <circle cx="18" cy="24" r="${r1}" fill="${SHELL1}"/>\n` +
        `  <circle cx="19" cy="24" r="8"  fill="${SHELL2}"/>\n` +
        `  <circle cx="20" cy="24" r="4"  fill="${SHELL3}"/>\n` +
        // Sealed opening — small darkened ellipse on the right face of the shell
        `  <ellipse cx="28" cy="24" rx="1.8" ry="3" fill="${SHELL1}" opacity="0.75"/>\n`
    );
}

// ── UP-facing withdrawal ──────────────────────────────────────────────────────
// Shell dominant & centered.  Head/body peeks at top.  Retracts downward into shell.

function upSnailInner(t) {
    let s = '';

    // Slime trail at bottom — fades first
    const slimeA = clamp(0.3 * (1 - t * 3));
    if (slimeA > 0.001) {
        s += `  <ellipse cx="24" cy="40" rx="3" ry="1.5" fill="${BODY}" opacity="${f2(slimeA)}"/>\n`;
    }

    // Shell — always drawn
    s += `  <circle cx="24" cy="26" r="13" fill="${SHELL1}"/>\n`;
    s += `  <circle cx="24" cy="25" r="9"  fill="${SHELL2}"/>\n`;
    s += `  <circle cx="24" cy="24" r="5"  fill="${SHELL3}"/>\n`;

    // Body — retracts down into shell top (opening ~y=15)
    const bodyVis = clamp(1 - t * 1.4);
    if (bodyVis > 0.001) {
        const cy = f1(lerp(14, 20, t));
        const rx = f1(lerp( 6,  0, t));
        const ry = f1(lerp( 4,  0, t));
        const op = bodyVis < 0.999 ? ` opacity="${f2(bodyVis)}"` : '';
        s += `  <ellipse cx="24" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BODY}"${op}/>\n`;
    }

    // Antennae — retract toward shell top (~24, 16)
    const antVis = clamp(1 - t * 1.6);
    if (antVis > 0.001) {
        const op   = f2(antVis);
        const lx1  = f1(lerp(20, 23, t)), ly1 = f1(lerp(12, 17, t));
        const lx2  = f1(lerp(12, 22, t)), ly2 = f1(lerp( 4, 16, t));
        const rx1  = f1(lerp(28, 25, t)), ry1 = f1(lerp(12, 17, t));
        const rx2  = f1(lerp(36, 26, t)), ry2 = f1(lerp( 4, 16, t));
        const antOp = antVis < 0.999 ? ` opacity="${op}"` : '';
        s += `  <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"${antOp}/>\n`;
        s += `  <circle cx="${lx2}" cy="${ly2}" r="2" fill="${BODY}"${antOp}/>\n`;
        s += `  <line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"${antOp}/>\n`;
        s += `  <circle cx="${rx2}" cy="${ry2}" r="2" fill="${BODY}"${antOp}/>\n`;
    }

    return s;
}

function upShellInner(breathe) {
    const r1 = breathe ? '13.5' : '13';
    return (
        `  <circle cx="24" cy="26" r="${r1}" fill="${SHELL1}"/>\n` +
        `  <circle cx="24" cy="25" r="9"   fill="${SHELL2}"/>\n` +
        `  <circle cx="24" cy="24" r="5"   fill="${SHELL3}"/>\n` +
        // Sealed top opening
        `  <ellipse cx="24" cy="14" rx="3" ry="1.8" fill="${SHELL1}" opacity="0.75"/>\n`
    );
}

// ── DOWN-facing withdrawal ────────────────────────────────────────────────────
// Shell at top, body extends downward.  Retracts upward into shell bottom.

function downSnailInner(t) {
    let s = '';

    // Slime trail at top (behind snail) — fades first
    const slimeA = clamp(0.3 * (1 - t * 3));
    if (slimeA > 0.001) {
        s += `  <ellipse cx="24" cy="8" rx="3" ry="1.5" fill="${BODY}" opacity="${f2(slimeA)}"/>\n`;
    }

    // Shell — always drawn
    s += `  <circle cx="24" cy="18" r="13" fill="${SHELL1}"/>\n`;
    s += `  <circle cx="24" cy="19" r="9"  fill="${SHELL2}"/>\n`;
    s += `  <circle cx="24" cy="20" r="5"  fill="${SHELL3}"/>\n`;

    // Body — retracts up into shell bottom (opening ~y=28)
    const bodyVis = clamp(1 - t * 1.4);
    if (bodyVis > 0.001) {
        const cy = f1(lerp(34, 26, t));
        const rx = f1(lerp( 6,  0, t));
        const ry = f1(lerp( 5,  0, t));
        const op = bodyVis < 0.999 ? ` opacity="${f2(bodyVis)}"` : '';
        s += `  <ellipse cx="24" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BODY}"${op}/>\n`;
    }

    // Antennae — retract toward shell bottom (~24, 27)
    const antVis = clamp(1 - t * 1.6);
    if (antVis > 0.001) {
        const op   = f2(antVis);
        const lx1  = f1(lerp(20, 23, t)), ly1 = f1(lerp(32, 27, t));
        const lx2  = f1(lerp(14, 23, t)), ly2 = f1(lerp(42, 27, t));
        const rx1  = f1(lerp(28, 25, t)), ry1 = f1(lerp(32, 27, t));
        const rx2  = f1(lerp(34, 25, t)), ry2 = f1(lerp(42, 27, t));
        const antOp = antVis < 0.999 ? ` opacity="${op}"` : '';
        s += `  <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"${antOp}/>\n`;
        s += `  <circle cx="${lx2}" cy="${ly2}" r="2" fill="${BODY}"${antOp}/>\n`;
        s += `  <line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="${BODY}" stroke-width="1.5" stroke-linecap="round"${antOp}/>\n`;
        s += `  <circle cx="${rx2}" cy="${ry2}" r="2" fill="${BODY}"${antOp}/>\n`;
    }

    // Eyes — move up into shell
    const eyeVis = clamp(1 - t * 1.6);
    if (eyeVis > 0.001) {
        const lx   = f1(lerp(21, 23, t)), ly = f1(lerp(33, 26, t));
        const rx   = f1(lerp(27, 25, t)), ry = f1(lerp(33, 26, t));
        const eyeOp = eyeVis < 0.999 ? ` opacity="${f2(eyeVis)}"` : '';
        s += `  <circle cx="${lx}" cy="${ly}" r="2" fill="${EYE}"${eyeOp}/>\n`;
        s += `  <circle cx="${rx}" cy="${ry}" r="2" fill="${EYE}"${eyeOp}/>\n`;
        if (eyeVis > 0.5) {
            const hlx = f1(lerp(21.5, 23.3, t)), hly = f1(lerp(32.3, 25.5, t));
            const hrx = f1(lerp(27.5, 25.3, t)), hry = f1(lerp(32.3, 25.5, t));
            const hop = f2((eyeVis - 0.5) * 2);
            s += `  <circle cx="${hlx}" cy="${hly}" r="0.7" fill="white" opacity="${hop}"/>\n`;
            s += `  <circle cx="${hrx}" cy="${hry}" r="0.7" fill="white" opacity="${hop}"/>\n`;
        }
    }

    // Mouth — fades quickly
    const mouthVis = clamp(1 - t * 2.5);
    if (mouthVis > 0.001) {
        const y1 = f1(lerp(36, 30, t));
        const y2 = f1(lerp(38, 32, t));
        const op = f2(mouthVis);
        s += `  <path d="M22 ${y1} Q24 ${y2} 26 ${y1}" stroke="${EYE}" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="${op}"/>\n`;
    }

    return s;
}

function downShellInner(breathe) {
    const r1 = breathe ? '13.5' : '13';
    return (
        `  <circle cx="24" cy="18" r="${r1}" fill="${SHELL1}"/>\n` +
        `  <circle cx="24" cy="19" r="9"   fill="${SHELL2}"/>\n` +
        `  <circle cx="24" cy="20" r="5"   fill="${SHELL3}"/>\n` +
        // Sealed bottom opening
        `  <ellipse cx="24" cy="29" rx="3" ry="1.8" fill="${SHELL1}" opacity="0.75"/>\n`
    );
}

// ── Generate all frames ───────────────────────────────────────────────────────

const files = {};

for (let fi = 0; fi <= 15; fi++) {
    const fname  = `f${String(fi).padStart(2, '0')}`;
    const flash  = FLASH[fi];
    const isShell = fi >= 8;
    const breathe = isShell && (fi % 2 === 0); // f08,f10,f12,f14 pulse bigger

    // Build inner content per direction (no flash rect yet)
    const t = isShell ? 1 : fi / 7;

    const rightInner = isShell ? rightShellInner(breathe) : rightSnailInner(t);
    const upInner    = isShell ? upShellInner(breathe)    : upSnailInner(t);
    const downInner  = isShell ? downShellInner(breathe)  : downSnailInner(t);

    const fr = flashRect(flash);

    // Right
    files[`snail-hit-right-${fname}.svg`] = svgWrap(rightInner + fr);

    // Left — mirror right content, then overlay flash rect outside the transform
    files[`snail-hit-left-${fname}.svg`] = svgWrap(
        `  <g transform="translate(${SIZE},0) scale(-1,1)">\n${rightInner}  </g>\n` + fr,
    );

    // Up
    files[`snail-hit-up-${fname}.svg`] = svgWrap(upInner + fr);

    // Down
    files[`snail-hit-down-${fname}.svg`] = svgWrap(downInner + fr);
}

// ── Write files ───────────────────────────────────────────────────────────────
let count = 0;
for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(OUT, filename), content, 'utf-8');
    count++;
}

console.log(`✔  ${count} sprite frames written to ${OUT}`);
console.log('');
console.log('Animation guide (use in Phaser anims.create):');
console.log('  Withdraw (1 s): snail-hit-{dir}-f00 → f07   8 frames @ ~125 ms each');
console.log('  Shell    (1 s): snail-hit-{dir}-f08 → f15   8 frames @ ~125 ms each');
console.log('  Extend   (1 s): snail-hit-{dir}-f07 → f00   reverse, no extra files');
