#!/usr/bin/env node
/**
 * Generates SVG sprites for the Hacking Station and upgrade Terminals.
 *
 * Oblique top-down style (classic 2D Pokémon / SNES RPG):
 *   — objects have a visible front face (slight 3-D depth) and a flat top face
 *   — light comes from the upper-left; shadows fall lower-right
 *   — pixel-art-ish sharp edges, no blur filters
 *
 * Output files:
 *   assets/station-mainframe.svg        — mainframe body (static)
 *   assets/station-gun.svg              — turret gun (rotated at runtime)
 *   assets/terminal-reload.svg
 *   assets/terminal-turret.svg
 *   assets/terminal-shield.svg
 *   assets/terminal-slow.svg
 *   assets/terminal-repair.svg
 *
 * Run: node scripts/generate-station-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = join(__dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function svg(w, h, inner) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
        inner,
        `</svg>`,
    ].join('\n');
}

// Oblique top face: given a front-face rect (x, y, w, h) and a depth offset (dx, dy),
// returns the SVG polygon points string for the top parallelogram.
function topFacePoints(x, y, w, dx, dy) {
    // front-top-left → front-top-right → back-top-right → back-top-left
    return [
        [x,     y],
        [x + w, y],
        [x + w + dx, y + dy],
        [x     + dx, y + dy],
    ].map(([px, py]) => `${px},${py}`).join(' ');
}

// Oblique right-side face for a box.
function rightFacePoints(x, y, w, h, dx, dy) {
    // front-top-right → front-bottom-right → back-bottom-right → back-top-right
    return [
        [x + w,      y],
        [x + w,      y + h],
        [x + w + dx, y + h + dy],
        [x + w + dx, y     + dy],
    ].map(([px, py]) => `${px},${py}`).join(' ');
}

// ── Mainframe body ─────────────────────────────────────────────────────────────
// 96×96 canvas. Oblique box: 60 wide, 36 tall front face, 12px depth offset.
function stationMainframe() {
    const W = 96, H = 96;

    // Mainframe cabinet — front face
    const FX = 14, FY = 44, FW = 60, FH = 38;
    const DX = 18, DY = -10; // oblique depth: right and up

    // Colours
    const CASE_FRONT  = '#c8ccd4'; // light grey
    const CASE_TOP    = '#e2e4ea'; // lighter grey (top lit face)
    const CASE_SIDE   = '#9298a4'; // darker grey (right shadow face)
    const CASE_EDGE   = '#5a6070'; // outline / edge lines
    const PANEL_DARK  = '#1a1e2a'; // dark panel area on front
    const SCREEN_GLOW = '#00ffcc'; // CRT matrix display
    const LED_GREEN   = '#33ff44';
    const LED_RED     = '#ff3322';
    const LED_AMBER   = '#ffbb00';
    const VENT_DARK   = '#3a3e48';
    const VENT_LINE   = '#555a66';

    // Tape reel colours
    const REEL_RIM  = '#444a58';
    const REEL_FILL = '#2a2e38';
    const REEL_HUB  = '#888ea0';

    // Gun mount platform (small raised disc on top of cabinet)
    const MX = FX + FW / 2;        // centre x of cabinet
    const MOUNT_CY = FY + DY - 4;  // vertically above front-top edge

    const frontTop = FY + DY;           // y of top-face front edge
    const topPoints   = topFacePoints(FX, FY, FW, DX, DY);
    const rightPoints = rightFacePoints(FX, FY, FW, FH, DX, DY);

    return svg(W, H, `
  <!-- ── Cabinet oblique sides ── -->
  <polygon points="${topPoints}"   fill="${CASE_TOP}"  stroke="${CASE_EDGE}" stroke-width="1"/>
  <polygon points="${rightPoints}" fill="${CASE_SIDE}" stroke="${CASE_EDGE}" stroke-width="1"/>

  <!-- ── Cabinet front face ── -->
  <rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" fill="${CASE_FRONT}" stroke="${CASE_EDGE}" stroke-width="1"/>

  <!-- Dark panel strip across top of front face (contains LEDs) -->
  <rect x="${FX}" y="${FY}" width="${FW}" height="11" fill="${PANEL_DARK}" stroke="none"/>

  <!-- Status LEDs -->
  <circle cx="${FX + 7}"  cy="${FY + 5.5}" r="2.5" fill="${LED_GREEN}"/>
  <circle cx="${FX + 14}" cy="${FY + 5.5}" r="2.5" fill="${LED_GREEN}"/>
  <circle cx="${FX + 21}" cy="${FY + 5.5}" r="2.5" fill="${LED_AMBER}"/>
  <circle cx="${FX + 28}" cy="${FY + 5.5}" r="2.5" fill="${LED_RED}"/>
  <!-- LED glow halos -->
  <circle cx="${FX + 7}"  cy="${FY + 5.5}" r="4" fill="${LED_GREEN}"  opacity="0.25"/>
  <circle cx="${FX + 28}" cy="${FY + 5.5}" r="4" fill="${LED_RED}"    opacity="0.25"/>

  <!-- CRT matrix display (central, glowing) -->
  <rect x="${FX + 6}" y="${FY + 14}" width="30" height="19" rx="2" fill="${PANEL_DARK}" stroke="${SCREEN_GLOW}" stroke-width="1"/>
  <!-- Scan-line effect: thin horizontal lines -->
  <rect x="${FX + 7}"  y="${FY + 16}" width="28" height="1" fill="${SCREEN_GLOW}" opacity="0.6"/>
  <rect x="${FX + 7}"  y="${FY + 19}" width="28" height="1" fill="${SCREEN_GLOW}" opacity="0.4"/>
  <rect x="${FX + 7}"  y="${FY + 22}" width="28" height="1" fill="${SCREEN_GLOW}" opacity="0.6"/>
  <rect x="${FX + 7}"  y="${FY + 25}" width="20" height="1" fill="${SCREEN_GLOW}" opacity="0.3"/>
  <rect x="${FX + 7}"  y="${FY + 28}" width="24" height="1" fill="${SCREEN_GLOW}" opacity="0.5"/>
  <!-- Screen ambient glow -->
  <rect x="${FX + 6}" y="${FY + 14}" width="30" height="19" rx="2" fill="${SCREEN_GLOW}" opacity="0.07"/>

  <!-- Tape reels — right side of front face -->
  <!-- Left reel -->
  <circle cx="${FX + 44}" cy="${FY + 18}" r="8"   fill="${REEL_FILL}" stroke="${REEL_RIM}" stroke-width="1.5"/>
  <circle cx="${FX + 44}" cy="${FY + 18}" r="3"   fill="${REEL_HUB}"/>
  <!-- Reel spokes -->
  <line x1="${FX+44}" y1="${FY+12}" x2="${FX+44}" y2="${FY+15}" stroke="${REEL_RIM}" stroke-width="1"/>
  <line x1="${FX+44}" y1="${FY+21}" x2="${FX+44}" y2="${FY+24}" stroke="${REEL_RIM}" stroke-width="1"/>
  <line x1="${FX+38}" y1="${FY+18}" x2="${FX+41}" y2="${FY+18}" stroke="${REEL_RIM}" stroke-width="1"/>
  <line x1="${FX+47}" y1="${FY+18}" x2="${FX+50}" y2="${FY+18}" stroke="${REEL_RIM}" stroke-width="1"/>
  <!-- Right reel (smaller) -->
  <circle cx="${FX + 52}" cy="${FY + 26}" r="5.5" fill="${REEL_FILL}" stroke="${REEL_RIM}" stroke-width="1.5"/>
  <circle cx="${FX + 52}" cy="${FY + 26}" r="2"   fill="${REEL_HUB}"/>

  <!-- Vent grille (bottom-right of front face) -->
  <rect x="${FX + 38}" y="${FY + 17}" width="18" height="18" fill="none" stroke="none"/>
  <line x1="${FX+38}" y1="${FY+35}" x2="${FX+55}" y2="${FY+35}" stroke="${VENT_LINE}" stroke-width="0.8"/>
  <line x1="${FX+38}" y1="${FY+33}" x2="${FX+55}" y2="${FY+33}" stroke="${VENT_LINE}" stroke-width="0.8"/>
  <line x1="${FX+38}" y1="${FY+31}" x2="${FX+55}" y2="${FY+31}" stroke="${VENT_LINE}" stroke-width="0.8"/>

  <!-- Punch-card slot (bottom-left) -->
  <rect x="${FX + 5}" y="${FY + 36}" width="22" height="4" rx="1" fill="${PANEL_DARK}" stroke="${VENT_LINE}" stroke-width="0.8"/>

  <!-- ── Gun mount platform (raised disc on top face) ── -->
  <!-- Shadow/base ring on top face -->
  <ellipse cx="${MX + DX/2 + 2}" cy="${frontTop + 3}" rx="14" ry="6" fill="#00000033"/>
  <!-- Mount disc -->
  <ellipse cx="${MX + DX/2}" cy="${frontTop}"     rx="14" ry="6"   fill="${CASE_SIDE}" stroke="${CASE_EDGE}" stroke-width="1"/>
  <ellipse cx="${MX + DX/2}" cy="${frontTop - 4}" rx="11" ry="4.5" fill="${CASE_FRONT}" stroke="${CASE_EDGE}" stroke-width="0.8"/>
  <!-- Centre pivot hole -->
  <circle  cx="${MX + DX/2}" cy="${frontTop - 4}" r="3"   fill="${PANEL_DARK}" stroke="${CASE_EDGE}" stroke-width="0.8"/>
`);
}

// ── Gun sprite (rotated independently at runtime) ──────────────────────────────
// 48×48 canvas. The gun points RIGHT (0°) by default; pivot is at centre (24,24).
// Composed of: a squat boxy body + long barrel extending right.
function stationGun() {
    const W = 48, H = 48;

    const BODY_COL   = '#556070'; // gunmetal
    const BODY_TOP   = '#7a8898'; // lit top face
    const BODY_SIDE  = '#3a4450'; // shadow side
    const BARREL_COL = '#404a56';
    const BARREL_TOP = '#60707e';
    const BARREL_TIP = '#88aacc'; // muzzle highlight
    const EDGE       = '#1e262e';
    const SCOPE_COL  = '#002233';
    const SCOPE_LENS = '#00eeff';

    // Gun body: 14 wide × 10 tall, centred vertically, slightly left of centre
    const BX = 10, BY = 19, BW = 14, BH = 10;
    const BDX = 5, BDY = -4; // oblique depth

    // Barrel: extends from right side of body toward right edge
    const BARX  = BX + BW,  BARY  = BY + 2, BARW = 20, BARH = 6;
    const BARY2 = BARY + BARH - 1; // pre-computed to avoid nested template expressions
    const BBDX  = 5,         BBDY  = -3;

    return svg(W, H, `
  <!-- ── Barrel oblique top ── -->
  <polygon points="${topFacePoints(BARX, BARY, BARW, BBDX, BBDY)}"
           fill="${BARREL_TOP}" stroke="${EDGE}" stroke-width="0.8"/>

  <!-- ── Barrel front face ── -->
  <rect x="${BARX}" y="${BARY}" width="${BARW}" height="${BARH}"
        fill="${BARREL_COL}" stroke="${EDGE}" stroke-width="0.8"/>

  <!-- Barrel heat vents (thin lines on barrel side) -->
  <line x1="${BARX+4}"  y1="${BARY+1}" x2="${BARX+4}"  y2="${BARY2}" stroke="${BODY_SIDE}" stroke-width="0.7"/>
  <line x1="${BARX+8}"  y1="${BARY+1}" x2="${BARX+8}"  y2="${BARY2}" stroke="${BODY_SIDE}" stroke-width="0.7"/>
  <line x1="${BARX+12}" y1="${BARY+1}" x2="${BARX+12}" y2="${BARY2}" stroke="${BODY_SIDE}" stroke-width="0.7"/>

  <!-- Muzzle tip highlight -->
  <rect x="${BARX + BARW - 3}" y="${BARY}" width="3" height="${BARH}"
        fill="${BARREL_TIP}" stroke="${EDGE}" stroke-width="0.5" opacity="0.9"/>

  <!-- ── Gun body oblique faces ── -->
  <polygon points="${topFacePoints(BX, BY, BW, BDX, BDY)}"
           fill="${BODY_TOP}" stroke="${EDGE}" stroke-width="0.8"/>
  <polygon points="${rightFacePoints(BX, BY, BW, BH, BDX, BDY)}"
           fill="${BODY_SIDE}" stroke="${EDGE}" stroke-width="0.8"/>

  <!-- ── Gun body front face ── -->
  <rect x="${BX}" y="${BY}" width="${BW}" height="${BH}"
        fill="${BODY_COL}" stroke="${EDGE}" stroke-width="0.8"/>

  <!-- Scope on top of body -->
  <rect x="${BX + 3}" y="${BY - 4}" width="8" height="4" rx="1"
        fill="${SCOPE_COL}" stroke="${EDGE}" stroke-width="0.7"/>
  <circle cx="${BX + 7}" cy="${BY - 2}" r="1.5" fill="${SCOPE_LENS}" opacity="0.9"/>

  <!-- Pivot pin (centre of sprite, sits in mount hole) -->
  <circle cx="24" cy="24" r="3.5" fill="${BODY_COL}" stroke="${EDGE}" stroke-width="0.8"/>
  <circle cx="24" cy="24" r="1.5" fill="${EDGE}"/>
`);
}

// ── Terminal (CRT computer from the 80s) ──────────────────────────────────────
// 64×64 canvas. Oblique box with a chunky CRT monitor on a squat desk unit.
// opts: { screenColor, label, accentDetails }
function terminal({ screenColor = '#00ffcc', label = 'TERMINAL', accentFn = () => '' }) {
    const W = 64, H = 64;

    // Desk unit (bottom box)
    const DX = 10, DY = 40, DW = 44, DH = 18;
    const DDX = 12, DDY = -7; // oblique depth

    // Monitor (sits on top of desk)
    const MX = 14, MY = 14, MW = 36, MH = 26;
    const MDX = 10, MDY = -6;

    const PLASTIC     = '#c0bdb5'; // beige/cream CRT plastic
    const PLASTIC_TOP = '#d8d5cc';
    const PLASTIC_SHD = '#8a8880';
    const DESK_FRONT  = '#b8b5ad';
    const DESK_TOP    = '#ccc9c1';
    const DESK_SHD    = '#808070';
    const EDGE        = '#555045';
    const SCREEN_BG   = '#001a12';
    const BEZEL       = '#3a3730';
    const VENT        = '#999488';

    // Screen colour derived from terminal type
    const SC = screenColor;

    return svg(W, H, `
  <!-- ── Desk unit oblique faces ── -->
  <polygon points="${topFacePoints(DX, DY, DW, DDX, DDY)}"
           fill="${DESK_TOP}" stroke="${EDGE}" stroke-width="1"/>
  <polygon points="${rightFacePoints(DX, DY, DW, DH, DDX, DDY)}"
           fill="${DESK_SHD}" stroke="${EDGE}" stroke-width="1"/>
  <!-- Desk front face -->
  <rect x="${DX}" y="${DY}" width="${DW}" height="${DH}" fill="${DESK_FRONT}" stroke="${EDGE}" stroke-width="1"/>
  <!-- Drive bay slots on desk front -->
  <rect x="${DX+4}"  y="${DY+4}"  width="16" height="3" rx="0.5" fill="${BEZEL}" stroke="${VENT}" stroke-width="0.5"/>
  <rect x="${DX+4}"  y="${DY+9}"  width="16" height="3" rx="0.5" fill="${BEZEL}" stroke="${VENT}" stroke-width="0.5"/>
  <!-- Drive LED -->
  <circle cx="${DX+24}" cy="${DY+5.5}" r="1.5" fill="${SC}" opacity="0.9"/>
  <circle cx="${DX+24}" cy="${DY+5.5}" r="3"   fill="${SC}" opacity="0.2"/>
  <!-- Vent grille on desk right -->
  <line x1="${DX+32}" y1="${DY+3}"  x2="${DX+40}" y2="${DY+3}"  stroke="${VENT}" stroke-width="0.7"/>
  <line x1="${DX+32}" y1="${DY+6}"  x2="${DX+40}" y2="${DY+6}"  stroke="${VENT}" stroke-width="0.7"/>
  <line x1="${DX+32}" y1="${DY+9}"  x2="${DX+40}" y2="${DY+9}"  stroke="${VENT}" stroke-width="0.7"/>
  <line x1="${DX+32}" y1="${DY+12}" x2="${DX+40}" y2="${DY+12}" stroke="${VENT}" stroke-width="0.7"/>

  <!-- ── Monitor oblique faces ── -->
  <polygon points="${topFacePoints(MX, MY, MW, MDX, MDY)}"
           fill="${PLASTIC_TOP}" stroke="${EDGE}" stroke-width="1"/>
  <polygon points="${rightFacePoints(MX, MY, MW, MH, MDX, MDY)}"
           fill="${PLASTIC_SHD}" stroke="${EDGE}" stroke-width="1"/>
  <!-- Monitor front face (bezel) -->
  <rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" fill="${PLASTIC}" stroke="${EDGE}" stroke-width="1"/>
  <!-- CRT bezel inset -->
  <rect x="${MX+3}" y="${MY+3}" width="${MW-6}" height="${MH-7}" rx="2"
        fill="${BEZEL}" stroke="${EDGE}" stroke-width="0.8"/>
  <!-- CRT screen -->
  <rect x="${MX+5}" y="${MY+5}" width="${MW-10}" height="${MH-11}" rx="1"
        fill="${SCREEN_BG}" stroke="${SC}" stroke-width="0.8"/>

  <!-- Scan-line glow on screen -->
  <rect x="${MX+6}" y="${MY+7}"  width="${MW-12}" height="1.2" fill="${SC}" opacity="0.55"/>
  <rect x="${MX+6}" y="${MY+10}" width="${MW-12}" height="1.2" fill="${SC}" opacity="0.4"/>
  <rect x="${MX+6}" y="${MY+13}" width="${MW-12}" height="1.2" fill="${SC}" opacity="0.55"/>
  <rect x="${MX+6}" y="${MY+16}" width="${MW-14}" height="1.2" fill="${SC}" opacity="0.3"/>
  <!-- Screen ambient glow -->
  <rect x="${MX+5}" y="${MY+5}" width="${MW-10}" height="${MH-11}" rx="1"
        fill="${SC}" opacity="0.05"/>

  <!-- Screen glare highlight (top-left) -->
  <rect x="${MX+6}" y="${MY+5}" width="6" height="3" rx="1"
        fill="white" opacity="0.12"/>

  <!-- Indicator LED on bezel (bottom-right) -->
  <circle cx="${MX+MW-6}" cy="${MY+MH-5}" r="1.8" fill="${SC}"/>
  <circle cx="${MX+MW-6}" cy="${MY+MH-5}" r="3.5" fill="${SC}" opacity="0.2"/>

  <!-- Monitor brand badge (embossed strip) -->
  <rect x="${MX+MW/2-8}" y="${MY+MH-5}" width="16" height="2.5" rx="0.5"
        fill="${PLASTIC_SHD}" opacity="0.6"/>

  <!-- Type-specific accent detail -->
  ${accentFn({ MX, MY, MW, MH, DX, DY, DW, DH, SC, BEZEL })}
`);
}

// ── Terminal accent details ────────────────────────────────────────────────────

function accentReload({ MX, MY, MW, MH, DX, DY, SC }) {
    // Ammo counter digits on screen — looks like "010/010"
    return `
  <text x="${MX + MW/2}" y="${MY + MH - 4}" text-anchor="middle"
        font-family="monospace" font-size="5" fill="${SC}" opacity="0.9">010/010</text>
  <!-- Reload icon: circular arrow on desk surface -->
  <path d="M${DX+36},${DY+6.5} a4,4 0 1 1 0.01,0" fill="none" stroke="${SC}" stroke-width="1.2"
        stroke-dasharray="10,3" stroke-linecap="round"/>
  <polygon points="${DX+36},${DY+3} ${DX+33},${DY+7} ${DX+39},${DY+7}"
           fill="${SC}" opacity="0.8"/>`;
}

function accentTurret({ MX, MY, MW, MH, DX, DY, SC }) {
    // Small cannon icon on screen
    return `
  <rect x="${MX+8}" y="${MY+MH-7}" width="10" height="3" rx="0.5" fill="${SC}" opacity="0.7"/>
  <rect x="${MX+18}" y="${MY+MH-6.5}" width="5" height="2" rx="0.5" fill="${SC}" opacity="0.7"/>
  <!-- Target crosshair symbol on desk -->
  <circle cx="${DX+36}" cy="${DY+7}" r="4" fill="none" stroke="${SC}" stroke-width="0.9"/>
  <line x1="${DX+32}" y1="${DY+7}" x2="${DX+34}" y2="${DY+7}" stroke="${SC}" stroke-width="0.9"/>
  <line x1="${DX+38}" y1="${DY+7}" x2="${DX+40}" y2="${DY+7}" stroke="${SC}" stroke-width="0.9"/>
  <line x1="${DX+36}" y1="${DY+3}" x2="${DX+36}" y2="${DY+5}" stroke="${SC}" stroke-width="0.9"/>
  <line x1="${DX+36}" y1="${DY+9}" x2="${DX+36}" y2="${DY+11}" stroke="${SC}" stroke-width="0.9"/>`;
}

function accentShield({ MX, MY, MW, MH, DX, DY, SC }) {
    // Shield icon on screen
    return `
  <path d="M${MX+MW/2},${MY+MH-8} l-5,3 0,4 5,3 5,-3 0,-4 z"
        fill="none" stroke="${SC}" stroke-width="1" opacity="0.85"/>
  <!-- Shield bar on desk -->
  <rect x="${DX+28}" y="${DY+6}" width="14" height="3" rx="1" fill="${SC}" opacity="0.25"/>
  <rect x="${DX+28}" y="${DY+6}" width="10" height="3" rx="1" fill="${SC}" opacity="0.7"/>`;
}

function accentSlow({ MX, MY, MW, MH, DX, DY, SC }) {
    // Snowflake / clock icon on screen
    return `
  <!-- Simple 6-point slow field star -->
  <line x1="${MX+MW/2-5}" y1="${MY+MH-6}" x2="${MX+MW/2+5}" y2="${MY+MH-6}"
        stroke="${SC}" stroke-width="1" opacity="0.8"/>
  <line x1="${MX+MW/2-2.5}" y1="${MY+MH-10.3}" x2="${MX+MW/2+2.5}" y2="${MY+MH-1.7}"
        stroke="${SC}" stroke-width="1" opacity="0.8"/>
  <line x1="${MX+MW/2+2.5}" y1="${MY+MH-10.3}" x2="${MX+MW/2-2.5}" y2="${MY+MH-1.7}"
        stroke="${SC}" stroke-width="1" opacity="0.8"/>
  <!-- Clock face on desk -->
  <circle cx="${DX+36}" cy="${DY+7}" r="4.5" fill="none" stroke="${SC}" stroke-width="0.9"/>
  <line x1="${DX+36}" y1="${DY+7}" x2="${DX+36}" y2="${DY+3.5}" stroke="${SC}" stroke-width="1" stroke-linecap="round"/>
  <line x1="${DX+36}" y1="${DY+7}" x2="${DX+39}" y2="${DY+9}"   stroke="${SC}" stroke-width="1" stroke-linecap="round"/>`;
}

function accentRepair({ MX, MY, MW, MH, DX, DY, SC }) {
    // Cross / wrench icon on screen
    return `
  <!-- Health cross -->
  <rect x="${MX+MW/2-5}" y="${MY+MH-8}" width="10" height="3" rx="0.5" fill="${SC}" opacity="0.8"/>
  <rect x="${MX+MW/2-1.5}" y="${MY+MH-11}" width="3" height="9" rx="0.5" fill="${SC}" opacity="0.8"/>
  <!-- Wrench on desk -->
  <path d="M${DX+30},${DY+11} l6,-6 a2,2 0 0 1 4,3 l-6,6 a2,2 0 0 1 -4,-3z"
        fill="${SC}" opacity="0.7"/>
  <circle cx="${DX+33}" cy="${DY+10}" r="1.5" fill="none" stroke="${SC}" stroke-width="0.8"/>`;
}

// ── Write sprites ─────────────────────────────────────────────────────────────
const sprites = {
    'station-mainframe.svg': stationMainframe(),
    'station-gun.svg':       stationGun(),

    'terminal-reload.svg': terminal({
        screenColor: '#44ddff',
        label:       'RELOAD',
        accentFn:    accentReload,
    }),
    'terminal-turret.svg': terminal({
        screenColor: '#ffaa22',
        label:       'TURRET',
        accentFn:    accentTurret,
    }),
    'terminal-shield.svg': terminal({
        screenColor: '#44aaff',
        label:       'SHIELD',
        accentFn:    accentShield,
    }),
    'terminal-slow.svg': terminal({
        screenColor: '#cc66ff',
        label:       'SLOW',
        accentFn:    accentSlow,
    }),
    'terminal-repair.svg': terminal({
        screenColor: '#66ff88',
        label:       'REPAIR',
        accentFn:    accentRepair,
    }),
};

for (const [filename, content] of Object.entries(sprites)) {
    const path = join(outDir, filename);
    writeFileSync(path, content, 'utf-8');
    console.log(`✔  ${path}`);
}

console.log('\nDone — 7 SVGs generated.');
