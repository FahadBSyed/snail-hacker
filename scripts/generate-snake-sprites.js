#!/usr/bin/env node
/**
 * Generates World 2 snake enemy sprites.
 *
 * Each snake type gets three sprites — all face RIGHT (snout/head-tip at right,
 * tail/neck at left). The entities rotate these at runtime; no 8-directional
 * variants needed.
 *
 *   snake-{type}-head.svg  (64×48) — alien space-suited snake head
 *   snake-{type}-body.svg  (32×24) — repeating body segment
 *   snake-{type}-tail.svg  (28×20) — tapered tail tip
 *
 * Boss (anaconda) gets larger variants:
 *   snake-anaconda-head.svg  (80×60)
 *   snake-anaconda-body.svg  (36×28)
 *   snake-anaconda-tail.svg  (32×24)
 *
 * Aesthetic: alien snake in a space suit. Each head has:
 *   — a glass bubble visor with visible alien slit-eyes inside
 *   — a metallic collar/neck ring connecting to the body
 *   — scale texture on the head hood
 *   — antennae
 * Body segments have overlapping scale plates and a glowing spine seam.
 *
 * Output: assets/sprites/snake/
 * Run: node scripts/generate-snake-sprites.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'sprites', 'snake');
mkdirSync(outDir, { recursive: true });

const r2 = (n) => +n.toFixed(2);

// ── Per-type palettes ─────────────────────────────────────────────────────────
const PALETTES = {
    basic: {
        headBase:    '#3a5228',  // olive green
        headMid:     '#4e6e34',
        headDark:    '#223018',
        scaleLines:  '#2a3e1c',
        collar:      '#485838',
        collarLight: '#607848',
        collarDark:  '#303824',
        visorFill:   'rgba(80,200,80,0.30)',
        visorRim:    '#78cc78',
        visorGlow:   '#a0ee88',
        eyeColor:    '#ccff44',
        accent:      '#8ab44a',  // antennae + glow
        bodyBase:    '#4a6630',
        bodyMid:     '#5a7838',
        spineLine:   '#7aaa50',
    },
    sidewinder: {
        headBase:    '#7a5618',
        headMid:     '#9e7228',
        headDark:    '#4e3410',
        scaleLines:  '#6a4a14',
        collar:      '#806020',
        collarLight: '#a88030',
        collarDark:  '#504010',
        visorFill:   'rgba(255,210,80,0.30)',
        visorRim:    '#e8b840',
        visorGlow:   '#ffdd88',
        eyeColor:    '#ffcc44',
        accent:      '#d49a28',
        bodyBase:    '#8a6022',
        bodyMid:     '#a27832',
        spineLine:   '#d4aa50',
    },
    python: {
        headBase:    '#1a2e18',
        headMid:     '#263c22',
        headDark:    '#0e1e0e',
        scaleLines:  '#142414',
        collar:      '#202e1e',
        collarLight: '#30422a',
        collarDark:  '#0e180e',
        visorFill:   'rgba(40,220,60,0.35)',
        visorRim:    '#44cc66',
        visorGlow:   '#66ee88',
        eyeColor:    '#44ff88',
        accent:      '#3a9a4a',
        bodyBase:    '#243828',
        bodyMid:     '#2e4830',
        spineLine:   '#44bb55',
    },
    burrower: {
        headBase:    '#5c3018',
        headMid:     '#7a4824',
        headDark:    '#3a1e0e',
        scaleLines:  '#4a2810',
        collar:      '#604028',
        collarLight: '#805030',
        collarDark:  '#3c2818',
        visorFill:   'rgba(200,140,50,0.32)',
        visorRim:    '#c88040',
        visorGlow:   '#e8aa60',
        eyeColor:    '#ffaa44',
        accent:      '#d46820',
        bodyBase:    '#6e3c20',
        bodyMid:     '#8a5030',
        spineLine:   '#cc7030',
    },
    spitter: {
        headBase:    '#3a5a10',
        headMid:     '#4e7818',
        headDark:    '#243808',
        scaleLines:  '#2e4a0c',
        collar:      '#405010',
        collarLight: '#587018',
        collarDark:  '#283408',
        visorFill:   'rgba(160,255,40,0.38)',
        visorRim:    '#a8ee28',
        visorGlow:   '#ccff66',
        eyeColor:    '#d4ff22',
        accent:      '#aae020',
        bodyBase:    '#486018',
        bodyMid:     '#5a7822',
        spineLine:   '#aad828',
    },
    anaconda: {
        headBase:    '#160822',
        headMid:     '#220e34',
        headDark:    '#0a0414',
        scaleLines:  '#1a0c2c',
        collar:      '#2a1040',
        collarLight: '#3c1a58',
        collarDark:  '#180828',
        visorFill:   'rgba(160,50,255,0.38)',
        visorRim:    '#aa44ff',
        visorGlow:   '#cc88ff',
        eyeColor:    '#cc44ff',
        accent:      '#cc44ff',
        gold:        '#ffcc44',  // boss-only gold trim
        bodyBase:    '#1e0c30',
        bodyMid:     '#2c1244',
        spineLine:   '#aa44ff',
    },
};

// ── Head sprite ───────────────────────────────────────────────────────────────
// W×H canvas. Snout points RIGHT. Neck/collar at LEFT.
function buildHead(W, H, pal, isBoss = false) {
    const {
        headBase, headMid, headDark, scaleLines,
        collar, collarLight, collarDark,
        visorFill, visorRim, visorGlow,
        eyeColor, accent, gold,
    } = pal;

    const cx = W / 2, cy = H / 2;

    // Layout constants proportional to canvas
    const collarW  = Math.round(W * 0.22);
    const headRX   = Math.round(W * 0.42);
    const headRY   = Math.round(H * 0.36);
    const headCX   = Math.round(W * 0.52);  // offset right to leave room for collar
    const headCY   = cy;
    const snoutCX  = Math.round(W * 0.88);
    const snoutRX  = Math.round(W * 0.14);
    const snoutRY  = Math.round(H * 0.20);

    // Visor centered slightly left-of-head-center (the "face" area)
    const visCX    = Math.round(W * 0.44);
    const visCY    = Math.round(H * 0.44);
    const visRX    = Math.round(W * 0.20);
    const visRY    = Math.round(H * 0.22);

    // Eyes (inside visor)
    const eyeOff   = Math.round(W * 0.08);
    const eyeRX    = Math.round(W * 0.04);
    const eyeRY    = Math.round(H * 0.10);
    const eyeY     = Math.round(H * 0.43);

    // Antennae base (top of head)
    const antBase  = Math.round(W * 0.38);
    const antTop1  = Math.round(W * 0.28);
    const antTop2  = Math.round(W * 0.50);
    const antTopY  = 2;
    const antBaseY = Math.round(H * 0.22);

    const bossGold = isBoss ? gold : null;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">

  <!-- Ground shadow -->
  <ellipse cx="${headCX+2}" cy="${H-5}" rx="${headRX-2}" ry="${Math.round(H*0.12)}" fill="#000000" opacity="0.22"/>

  <!-- Neck / collar (metallic ring at left) -->
  <rect x="1" y="${Math.round(H*0.25)}" width="${collarW}" height="${Math.round(H*0.50)}" rx="4" fill="${collar}" stroke="${collarDark}" stroke-width="1"/>
  <!-- Collar highlight edge -->
  <line x1="${Math.round(collarW*0.45)}" y1="${Math.round(H*0.27)}" x2="${Math.round(collarW*0.45)}" y2="${Math.round(H*0.73)}" stroke="${collarLight}" stroke-width="1.2" opacity="0.7"/>
  <!-- Collar ring bolts -->
  <circle cx="${Math.round(collarW*0.5)}" cy="${Math.round(H*0.28)}" r="2" fill="${collarDark}" stroke="${collarLight}" stroke-width="0.7"/>
  <circle cx="${Math.round(collarW*0.5)}" cy="${Math.round(H*0.72)}" r="2" fill="${collarDark}" stroke="${collarLight}" stroke-width="0.7"/>
  ${bossGold ? `<!-- Boss gold collar trim -->
  <rect x="1" y="${Math.round(H*0.25)}" width="${collarW}" height="2" fill="${bossGold}" opacity="0.8"/>
  <rect x="1" y="${Math.round(H*0.73)}" width="${collarW}" height="2" fill="${bossGold}" opacity="0.8"/>` : ''}

  <!-- Main head body -->
  <ellipse cx="${headCX}" cy="${headCY}" rx="${headRX}" ry="${headRY}" fill="${headBase}" stroke="${headDark}" stroke-width="1.2"/>
  <!-- Snout bulge -->
  <ellipse cx="${snoutCX}" cy="${headCY}" rx="${snoutRX}" ry="${snoutRY}" fill="${headMid}" stroke="${headDark}" stroke-width="1"/>

  <!-- Scale texture (diagonal stroke lines across head) -->
  ${[0.30, 0.44, 0.58, 0.70].map(xf => {
      const lx = Math.round(W * xf);
      return `<line x1="${lx}" y1="${Math.round(H*0.14)}" x2="${lx+6}" y2="${Math.round(H*0.86)}" stroke="${scaleLines}" stroke-width="1.1" opacity="0.55"/>`;
  }).join('\n  ')}
  <!-- Cross hatching on snout -->
  <line x1="${Math.round(W*0.76)}" y1="${Math.round(H*0.30)}" x2="${Math.round(W*0.92)}" y2="${Math.round(H*0.60)}" stroke="${headDark}" stroke-width="0.8" opacity="0.5"/>

  <!-- Head highlight (dorsal ridge) -->
  <ellipse cx="${headCX}" cy="${Math.round(H*0.24)}" rx="${Math.round(headRX*0.6)}" ry="${Math.round(headRY*0.3)}" fill="${headMid}" opacity="0.45"/>

  <!-- Visor dome (space helmet glass) -->
  <ellipse cx="${visCX}" cy="${visCY}" rx="${visRX}" ry="${visRY}" fill="${visorFill}" stroke="${visorRim}" stroke-width="1.4"/>
  <!-- Visor interior depth -->
  <ellipse cx="${visCX}" cy="${visCY}" rx="${visRX-2}" ry="${visRY-2}" fill="${visorGlow}" opacity="0.12"/>
  <!-- Visor glare (top-left) -->
  <ellipse cx="${Math.round(visCX - visRX*0.45)}" cy="${Math.round(visCY - visRY*0.45)}" rx="${Math.round(visRX*0.28)}" ry="${Math.round(visRY*0.22)}" fill="white" opacity="0.22" transform="rotate(-20,${Math.round(visCX - visRX*0.45)},${Math.round(visCY - visRY*0.45)})"/>

  <!-- Alien eyes (through visor) -->
  <ellipse cx="${visCX - eyeOff}" cy="${eyeY}" rx="${eyeRX}" ry="${eyeRY}" fill="${eyeColor}"/>
  <ellipse cx="${visCX + eyeOff}" cy="${eyeY}" rx="${eyeRX}" ry="${eyeRY}" fill="${eyeColor}"/>
  <!-- Slit pupils -->
  <ellipse cx="${visCX - eyeOff}" cy="${eyeY}" rx="${Math.max(1,Math.round(eyeRX*0.35))}" ry="${Math.round(eyeRY*0.85)}" fill="#111100"/>
  <ellipse cx="${visCX + eyeOff}" cy="${eyeY}" rx="${Math.max(1,Math.round(eyeRX*0.35))}" ry="${Math.round(eyeRY*0.85)}" fill="#111100"/>
  <!-- Eye glow -->
  <ellipse cx="${visCX - eyeOff}" cy="${eyeY}" rx="${eyeRX+2}" ry="${eyeRY+2}" fill="${eyeColor}" opacity="0.28"/>
  <ellipse cx="${visCX + eyeOff}" cy="${eyeY}" rx="${eyeRX+2}" ry="${eyeRY+2}" fill="${eyeColor}" opacity="0.28"/>

  <!-- Antennae -->
  <line x1="${antBase-4}" y1="${antBaseY}" x2="${antTop1}" y2="${antTopY}" stroke="${accent}" stroke-width="1.3" stroke-linecap="round"/>
  <circle cx="${antTop1}" cy="${antTopY}" r="${isBoss ? 3 : 2}" fill="${accent}"/>
  <circle cx="${antTop1}" cy="${antTopY}" r="${isBoss ? 5 : 3.5}" fill="${accent}" opacity="0.25"/>
  <line x1="${antBase+4}" y1="${antBaseY}" x2="${antTop2}" y2="${antTopY}" stroke="${accent}" stroke-width="1.3" stroke-linecap="round"/>
  <circle cx="${antTop2}" cy="${antTopY}" r="${isBoss ? 3 : 2}" fill="${accent}"/>
  <circle cx="${antTop2}" cy="${antTopY}" r="${isBoss ? 5 : 3.5}" fill="${accent}" opacity="0.25"/>

  <!-- Nostril dots on snout -->
  <circle cx="${Math.round(W*0.91)}" cy="${Math.round(H*0.38)}" r="1.3" fill="${headDark}" opacity="0.8"/>
  <circle cx="${Math.round(W*0.91)}" cy="${Math.round(H*0.62)}" r="1.3" fill="${headDark}" opacity="0.8"/>

  ${bossGold ? `<!-- Boss crown / crest detail -->
  <path d="M${Math.round(W*0.32)},${Math.round(H*0.10)} L${Math.round(W*0.36)},${Math.round(H*0.04)} L${Math.round(W*0.40)},${Math.round(H*0.10)} L${Math.round(W*0.44)},${Math.round(H*0.04)} L${Math.round(W*0.48)},${Math.round(H*0.10)}" fill="none" stroke="${bossGold}" stroke-width="1.8" stroke-linejoin="round" opacity="0.9"/>
  <!-- Boss eye glow rings -->
  <ellipse cx="${visCX - eyeOff}" cy="${eyeY}" rx="${eyeRX+4}" ry="${eyeRY+4}" fill="none" stroke="${bossGold}" stroke-width="0.8" opacity="0.4"/>
  <ellipse cx="${visCX + eyeOff}" cy="${eyeY}" rx="${eyeRX+4}" ry="${eyeRY+4}" fill="none" stroke="${bossGold}" stroke-width="0.8" opacity="0.4"/>` : ''}
</svg>`;
}

// ── Body segment sprite ────────────────────────────────────────────────────────
// W×H canvas. Horizontal pill. Rotated at runtime to follow heading.
function buildBody(W, H, pal) {
    const { bodyBase, bodyMid, headDark, scaleLines, spineLine } = pal;

    const padX = 2, padY = 4;
    const bW = W - padX * 2;
    const bH = H - padY * 2;
    const bX = padX, bY = padY;
    const rx = Math.round(bH / 2);  // pill radius = half height

    // Scale plate positions (3 arcs across the body)
    const plateX = [bX + bW*0.20, bX + bW*0.50, bX + bW*0.80].map(Math.round);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">

  <!-- Shadow -->
  <ellipse cx="${Math.round(W/2+1)}" cy="${Math.round(bY+bH+2)}" rx="${Math.round(bW/2-1)}" ry="3" fill="#000000" opacity="0.18"/>

  <!-- Body pill -->
  <rect x="${bX}" y="${bY}" width="${bW}" height="${bH}" rx="${rx}" fill="${bodyBase}" stroke="${headDark}" stroke-width="1"/>

  <!-- Dorsal ridge (lighter top surface) -->
  <ellipse cx="${Math.round(W/2)}" cy="${Math.round(bY + bH*0.30)}" rx="${Math.round(bW*0.42)}" ry="${Math.round(bH*0.20)}" fill="${bodyMid}" opacity="0.5"/>

  <!-- Scale plate arcs -->
  ${plateX.map(px => `<ellipse cx="${px}" cy="${Math.round(bY + bH*0.55)}" rx="${Math.round(bW*0.18)}" ry="${Math.round(bH*0.42)}" fill="none" stroke="${scaleLines}" stroke-width="1" opacity="0.6"/>`).join('\n  ')}

  <!-- Spine seam (glowing line along body center) -->
  <line x1="${bX + rx}" y1="${Math.round(H/2)}" x2="${bX + bW - rx}" y2="${Math.round(H/2)}" stroke="${spineLine}" stroke-width="1.2" opacity="0.7"/>
  <!-- Seam glow -->
  <line x1="${bX + rx}" y1="${Math.round(H/2)}" x2="${bX + bW - rx}" y2="${Math.round(H/2)}" stroke="${spineLine}" stroke-width="3" opacity="0.2"/>
</svg>`;
}

// ── Tail sprite ────────────────────────────────────────────────────────────────
// W×H canvas. Tapers to LEFT (tail tip). Right end connects to body.
function buildTail(W, H, pal) {
    const { bodyBase, bodyMid, headDark, scaleLines, spineLine } = pal;

    const cy = H / 2;
    // Path: rounded right end (body connection), tapering to a point at left
    const path = `M${W-4},${Math.round(cy - H*0.30)} Q${W},${cy} ${W-4},${Math.round(cy + H*0.30)} L4,${Math.round(cy + H*0.12)} Q1,${cy} 4,${Math.round(cy - H*0.12)} Z`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">

  <!-- Shadow -->
  <ellipse cx="${Math.round(W*0.6)}" cy="${Math.round(H-3)}" rx="${Math.round(W*0.36)}" ry="2.5" fill="#000000" opacity="0.15"/>

  <!-- Tail body -->
  <path d="${path}" fill="${bodyBase}" stroke="${headDark}" stroke-width="1"/>

  <!-- Dorsal ridge -->
  <ellipse cx="${Math.round(W*0.65)}" cy="${Math.round(H*0.32)}" rx="${Math.round(W*0.22)}" ry="${Math.round(H*0.16)}" fill="${bodyMid}" opacity="0.45"/>

  <!-- Scale hint -->
  <ellipse cx="${Math.round(W*0.70)}" cy="${Math.round(cy)}" rx="${Math.round(W*0.18)}" ry="${Math.round(H*0.38)}" fill="none" stroke="${scaleLines}" stroke-width="0.9" opacity="0.5"/>

  <!-- Spine seam -->
  <line x1="${Math.round(W*0.15)}" y1="${Math.round(cy)}" x2="${Math.round(W*0.85)}" y2="${Math.round(cy)}" stroke="${spineLine}" stroke-width="1" opacity="0.6"/>
</svg>`;
}

// ── Generate all sprites ──────────────────────────────────────────────────────
const TYPES = ['basic', 'sidewinder', 'python', 'burrower', 'spitter'];

for (const type of TYPES) {
    const pal = PALETTES[type];
    const headSvg = buildHead(64, 48, pal);
    const bodySvg = buildBody(32, 24, pal);
    const tailSvg = buildTail(28, 20, pal);

    writeFileSync(join(outDir, `snake-${type}-head.svg`), headSvg, 'utf-8');
    writeFileSync(join(outDir, `snake-${type}-body.svg`), bodySvg, 'utf-8');
    writeFileSync(join(outDir, `snake-${type}-tail.svg`), tailSvg, 'utf-8');
    console.log(`✔  snake-${type}-{head,body,tail}.svg`);
}

// Boss anaconda (larger sprites)
const bossPal  = PALETTES.anaconda;
const bossHead = buildHead(80, 60, bossPal, true);
const bossBody = buildBody(36, 28, bossPal);
const bossTail = buildTail(32, 24, bossPal);

writeFileSync(join(outDir, 'snake-anaconda-head.svg'), bossHead, 'utf-8');
writeFileSync(join(outDir, 'snake-anaconda-body.svg'), bossBody, 'utf-8');
writeFileSync(join(outDir, 'snake-anaconda-tail.svg'), bossTail, 'utf-8');
console.log(`✔  snake-anaconda-{head,body,tail}.svg`);

console.log(`\nDone — ${(TYPES.length + 1) * 3} snake SVGs generated in assets/sprites/snake/`);
