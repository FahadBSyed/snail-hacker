#!/usr/bin/env node
/**
 * Generates World 2 (Snake Pit) terminal SVG sprites.
 *
 * Output files:
 *   assets/sprites/terminal/terminal-burner.svg   — flushes all snakes from bushes
 *   assets/sprites/terminal/terminal-mongoose.svg — spawns a mongoose NPC
 *
 * Run: node scripts/generate-snake-terminal-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const terminalDir = join(__dirname, '..', 'assets', 'sprites', 'terminal');
mkdirSync(terminalDir, { recursive: true });

// ── Helpers (same style as generate-station-sprites.js) ──────────────────────
function svg(w, h, inner) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
        inner,
        `</svg>`,
    ].join('\n');
}

function topFacePoints(x, y, w, dy) {
    return [
        [x,     y],
        [x + w, y],
        [x + w, y + dy],
        [x,     y + dy],
    ].map(([px, py]) => `${px},${py}`).join(' ');
}

function terminal({ screenColor = '#00ffcc', accentFn = () => '' }) {
    const W = 64, H = 64;

    const DX = 8,  DY = 42, DW = 48, DH = 18, DDY = -7;
    const MX = 10, MY = 14, MW = 44, MH = 26, MDY = -6;

    const PLASTIC     = '#c0bdb5';
    const PLASTIC_TOP = '#d8d5cc';
    const DESK_FRONT  = '#b8b5ad';
    const DESK_TOP    = '#ccc9c1';
    const EDGE        = '#555045';
    const SCREEN_BG   = '#001a12';
    const BEZEL       = '#3a3730';
    const VENT        = '#999488';
    const SC          = screenColor;

    return svg(W, H, `
  <!-- Desk top face -->
  <polygon points="${topFacePoints(DX, DY, DW, DDY)}" fill="${DESK_TOP}" stroke="${EDGE}" stroke-width="1"/>
  <rect x="${DX}" y="${DY}" width="${DW}" height="${DH}" fill="${DESK_FRONT}" stroke="${EDGE}" stroke-width="1"/>
  <rect x="${DX+4}"  y="${DY+4}" width="16" height="3" rx="0.5" fill="${BEZEL}" stroke="${VENT}" stroke-width="0.5"/>
  <rect x="${DX+4}"  y="${DY+9}" width="16" height="3" rx="0.5" fill="${BEZEL}" stroke="${VENT}" stroke-width="0.5"/>
  <circle cx="${DX+24}" cy="${DY+5.5}" r="1.5" fill="${SC}" opacity="0.9"/>
  <circle cx="${DX+24}" cy="${DY+5.5}" r="3"   fill="${SC}" opacity="0.2"/>
  <line x1="${DX+34}" y1="${DY+3}"  x2="${DX+44}" y2="${DY+3}"  stroke="${VENT}" stroke-width="0.7"/>
  <line x1="${DX+34}" y1="${DY+6}"  x2="${DX+44}" y2="${DY+6}"  stroke="${VENT}" stroke-width="0.7"/>
  <line x1="${DX+34}" y1="${DY+9}"  x2="${DX+44}" y2="${DY+9}"  stroke="${VENT}" stroke-width="0.7"/>
  <line x1="${DX+34}" y1="${DY+12}" x2="${DX+44}" y2="${DY+12}" stroke="${VENT}" stroke-width="0.7"/>

  <!-- Monitor top face -->
  <polygon points="${topFacePoints(MX, MY, MW, MDY)}" fill="${PLASTIC_TOP}" stroke="${EDGE}" stroke-width="1"/>
  <rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" fill="${PLASTIC}" stroke="${EDGE}" stroke-width="1"/>
  <rect x="${MX+3}" y="${MY+3}" width="${MW-6}" height="${MH-7}" rx="2" fill="${BEZEL}" stroke="${EDGE}" stroke-width="0.8"/>
  <rect x="${MX+5}" y="${MY+5}" width="${MW-10}" height="${MH-11}" rx="1" fill="${SCREEN_BG}" stroke="${SC}" stroke-width="0.8"/>
  <rect x="${MX+6}" y="${MY+7}"  width="${MW-12}" height="1.2" fill="${SC}" opacity="0.55"/>
  <rect x="${MX+6}" y="${MY+10}" width="${MW-12}" height="1.2" fill="${SC}" opacity="0.4"/>
  <rect x="${MX+6}" y="${MY+13}" width="${MW-12}" height="1.2" fill="${SC}" opacity="0.55"/>
  <rect x="${MX+5}" y="${MY+5}" width="${MW-10}" height="${MH-11}" rx="1" fill="${SC}" opacity="0.05"/>
  <rect x="${MX+6}" y="${MY+5}" width="7" height="3" rx="1" fill="white" opacity="0.12"/>
  <circle cx="${MX+MW-6}" cy="${MY+MH-5}" r="1.8" fill="${SC}"/>
  <circle cx="${MX+MW-6}" cy="${MY+MH-5}" r="3.5" fill="${SC}" opacity="0.2"/>
  <rect x="${MX+MW/2-8}" y="${MY+MH-5}" width="16" height="2.5" rx="0.5" fill="${PLASTIC_TOP}" opacity="0.6"/>

  ${accentFn({ MX, MY, MW, MH, DX, DY, DW, DH, SC, BEZEL })}
`);
}

// ── BURNER accent ─────────────────────────────────────────────────────────────
// Hot orange screen, flame icon on desk, warning bars on screen.
function accentBurner({ MX, MY, MW, MH, DX, DY, SC }) {
    // Flame shape on desk (right side) — three ascending teardrop lobes
    const fx = DX + 36, fy = DY + 3;
    return `
  <!-- Screen warning bars -->
  <rect x="${MX+6}" y="${MY+6}" width="${MW-12}" height="2" rx="0.5" fill="${SC}" opacity="0.7"/>
  <rect x="${MX+6}" y="${MY+17}" width="${MW-14}" height="2" rx="0.5" fill="${SC}" opacity="0.7"/>
  <!-- Exclamation mark on screen -->
  <rect x="${MX+MW/2-1.5}" y="${MY+8}" width="3" height="6" rx="1" fill="${SC}" opacity="0.9"/>
  <circle cx="${MX+MW/2}" cy="${MY+17}" r="1.8" fill="${SC}" opacity="0.9"/>
  <!-- Flame on desk -->
  <ellipse cx="${fx+3}"  cy="${fy+10}" rx="3.5" ry="6"   fill="#ff6600" opacity="0.95"/>
  <ellipse cx="${fx+7}"  cy="${fy+9}"  rx="3"   ry="5.5" fill="#ff4400" opacity="0.95"/>
  <ellipse cx="${fx+11}" cy="${fy+10}" rx="3.5" ry="6"   fill="#ff6600" opacity="0.95"/>
  <!-- Inner flame (brighter) -->
  <ellipse cx="${fx+5}"  cy="${fy+11}" rx="2"   ry="4"   fill="#ffcc00" opacity="0.9"/>
  <ellipse cx="${fx+9}"  cy="${fy+11}" rx="2"   ry="4"   fill="#ffcc00" opacity="0.9"/>
  <!-- Flame glow -->
  <ellipse cx="${fx+7}"  cy="${fy+10}" rx="7"   ry="8"   fill="#ff4400" opacity="0.15"/>`;
}

// ── MONGOOSE accent ───────────────────────────────────────────────────────────
// Amber screen, paw print on desk, small mongoose silhouette on screen.
function accentMongoose({ MX, MY, MW, MH, DX, DY, SC }) {
    const px = DX + 34, py = DY + 5;
    // Mongoose silhouette on screen: simple hunched mammal shape
    const sx = MX + 8, sy = MY + 8;
    return `
  <!-- Mongoose silhouette on screen (body + head + tail) -->
  <!-- Body -->
  <ellipse cx="${sx+12}" cy="${sy+6}" rx="9" ry="4.5" fill="${SC}" opacity="0.8"/>
  <!-- Head -->
  <ellipse cx="${sx+21}" cy="${sy+4}" rx="4.5" ry="3.5" fill="${SC}" opacity="0.8"/>
  <!-- Snout -->
  <ellipse cx="${sx+25}" cy="${sy+5}" rx="2.5" ry="1.8" fill="${SC}" opacity="0.8"/>
  <!-- Ear -->
  <ellipse cx="${sx+21}" cy="${sy+1}" rx="1.5" ry="2"   fill="${SC}" opacity="0.8"/>
  <!-- Tail (curved up) -->
  <path d="M${sx+3},${sy+7} Q${sx-3},${sy+2} ${sx},${sy-2}" fill="none" stroke="${SC}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <!-- Legs -->
  <line x1="${sx+8}"  y1="${sy+10}" x2="${sx+7}"  y2="${sy+14}" stroke="${SC}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <line x1="${sx+14}" y1="${sy+10}" x2="${sx+15}" y2="${sy+14}" stroke="${SC}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <!-- Paw print on desk -->
  <!-- Main pad -->
  <ellipse cx="${px+4}" cy="${py+10}" rx="3.5" ry="2.5" fill="${SC}" opacity="0.85"/>
  <!-- Toe pads -->
  <circle cx="${px+1}"  cy="${py+7}"  r="1.4" fill="${SC}" opacity="0.85"/>
  <circle cx="${px+4}"  cy="${py+6}"  r="1.4" fill="${SC}" opacity="0.85"/>
  <circle cx="${px+7}"  cy="${py+7}"  r="1.4" fill="${SC}" opacity="0.85"/>
  <circle cx="${px+9}"  cy="${py+9}"  r="1.2" fill="${SC}" opacity="0.75"/>`;
}

// ── Write ─────────────────────────────────────────────────────────────────────
const sprites = {
    'terminal-burner.svg':   terminal({ screenColor: '#ff4400', accentFn: accentBurner }),
    'terminal-mongoose.svg': terminal({ screenColor: '#dd8800', accentFn: accentMongoose }),
};

for (const [filename, content] of Object.entries(sprites)) {
    const path = join(terminalDir, filename);
    writeFileSync(path, content, 'utf-8');
    console.log(`✔  ${path}`);
}
console.log('\nDone — 2 snake-world terminal SVGs generated.');
