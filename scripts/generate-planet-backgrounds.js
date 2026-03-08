#!/usr/bin/env node
/**
 * Generates 20 alien planet surface backgrounds (1280×720).
 * Output: assets/backgrounds/bg-{00..19}.svg
 * Run:    node scripts/generate-planet-backgrounds.js
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'backgrounds');
mkdirSync(outDir, { recursive: true });

const W = 1280, H = 720;

// ── Mulberry32 seeded PRNG ───────────────────────────────────────────────────
function makePRNG(seed) {
    let s = (seed | 0) + 1;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
    const h = parseInt(hex.replace('#', ''), 16);
    return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}
function rgbToHex([r, g, b]) {
    return '#' + [r, g, b]
        .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
        .join('');
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
    const [r1, g1, b1] = hexToRgb(c1);
    const [r2, g2, b2] = hexToRgb(c2);
    return rgbToHex([lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t)]);
}
function darken(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
}
function lighten(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}

// ── Terrain helpers ───────────────────────────────────────────────────────────
function makeTerrain(rng, yBase, amplitude, numPts, smoothPasses = 3) {
    const ys = Array.from({ length: numPts + 1 }, () => yBase + (rng() * 2 - 1) * amplitude);
    for (let pass = 0; pass < smoothPasses; pass++) {
        for (let i = 1; i < ys.length - 1; i++) {
            ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
        }
    }
    const step = W / numPts;
    const pts = [`0,${H}`];
    for (let i = 0; i <= numPts; i++) pts.push(`${(i * step).toFixed(1)},${ys[i].toFixed(1)}`);
    pts.push(`${W},${H}`);
    return pts.join(' ');
}

// ── Flora generators (origin = base of element, y-up) ────────────────────────

function mushroom(rng, stemColor, capColor, s = 1) {
    const h   = (22 + rng() * 18) * s;
    const sw  = (3  + rng() * 2)  * s;
    const cw  = (14 + rng() * 12) * s;
    const ch  = (6  + rng() * 7)  * s;
    // Optional spots on cap
    const spots = Math.floor(rng() * 4);
    let spotSvg = '';
    for (let i = 0; i < spots; i++) {
        const sx = (rng() * 2 - 1) * cw * 0.6;
        const sy = -h - ch * 0.3 + (rng() * 2 - 1) * ch * 0.4;
        const sr = (1.5 + rng() * 2) * s;
        spotSvg += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="${lighten(capColor, 0.25)}" opacity="0.7"/>`;
    }
    return `<rect x="${(-sw / 2).toFixed(1)}" y="${(-h).toFixed(1)}" width="${sw.toFixed(1)}" height="${h.toFixed(1)}" fill="${stemColor}"/>
<ellipse cx="0" cy="${(-h).toFixed(1)}" rx="${cw.toFixed(1)}" ry="${ch.toFixed(1)}" fill="${capColor}"/>
${spotSvg}`;
}

function crystal(rng, color, s = 1) {
    const count = 3 + Math.floor(rng() * 4);
    const bright = lighten(color, 0.25);
    let svg = '';
    for (let i = 0; i < count; i++) {
        const h   = (12 + rng() * 32) * s;
        const hw  = (3  + rng() * 5)  * s;
        const ox  = (rng() * 2 - 1) * 12 * s;
        const lean = (rng() * 2 - 1) * 0.25;
        svg += `<polygon points="${(ox + lean * h).toFixed(1)},${(-h).toFixed(1)} ${(ox + hw).toFixed(1)},0 ${(ox - hw).toFixed(1)},0" fill="${color}" opacity="${(0.75 + rng() * 0.2).toFixed(2)}"/>`;
        // Highlight edge
        svg += `<line x1="${(ox + lean * h).toFixed(1)}" y1="${(-h).toFixed(1)}" x2="${(ox + hw * 0.3).toFixed(1)}" y2="0" stroke="${bright}" stroke-width="0.8" opacity="0.5"/>`;
    }
    return svg;
}

function bush(rng, color, s = 1) {
    const rx = (14 + rng() * 14) * s;
    const ry = (9  + rng() * 9)  * s;
    const shade = darken(color, 0.2);
    return `<ellipse cx="0" cy="${(-ry * 0.7).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}" opacity="0.9"/>
<ellipse cx="${(rx * 0.2).toFixed(1)}" cy="${(-ry * 1.1).toFixed(1)}" rx="${(rx * 0.35).toFixed(1)}" ry="${(ry * 0.4).toFixed(1)}" fill="${shade}" opacity="0.35"/>`;
}

function spine(rng, color, s = 1) {
    const h  = (24 + rng() * 20) * s;
    const sw = (4  + rng() * 4)  * s;
    let svg = `<rect x="${(-sw / 2).toFixed(1)}" y="${(-h).toFixed(1)}" width="${sw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="${(sw * 0.3).toFixed(1)}"/>`;
    // 1–3 side arms
    const arms = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < arms; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const ay   = -(h * (0.35 + rng() * 0.35));
        const alen = (10 + rng() * 12) * s * side;
        const atop = ay - sw * 0.5;
        svg += `<rect x="${(side > 0 ? sw / 2 : sw / 2 + alen).toFixed(1)}" y="${atop.toFixed(1)}" width="${Math.abs(alen).toFixed(1)}" height="${sw.toFixed(1)}" fill="${color}" rx="${(sw * 0.3).toFixed(1)}"/>`;
        // Tip cap
        const tipX = side > 0 ? sw / 2 + Math.abs(alen) : sw / 2 + alen;
        svg += `<circle cx="${tipX.toFixed(1)}" cy="${(atop + sw / 2).toFixed(1)}" r="${(sw * 0.6).toFixed(1)}" fill="${lighten(color, 0.15)}"/>`;
    }
    return svg;
}

function fern(rng, color, s = 1) {
    const h    = (22 + rng() * 16) * s;
    const n    = 4 + Math.floor(rng() * 4);
    const sw   = (1.5 + rng() * 1.5) * s;
    const bright = lighten(color, 0.2);
    let svg = `<line x1="0" y1="0" x2="0" y2="${(-h).toFixed(1)}" stroke="${color}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>`;
    for (let i = 0; i < n; i++) {
        const t    = (i + 1) / (n + 1);
        const y    = -h * t;
        const len  = (7 + rng() * 13) * s;
        const side = i % 2 === 0 ? 1 : -1;
        const ang  = (25 + rng() * 30) * side * Math.PI / 180;
        const dx   = Math.cos(ang) * len;
        const dy   = -Math.abs(Math.sin(ang)) * len;
        svg += `<line x1="0" y1="${y.toFixed(1)}" x2="${dx.toFixed(1)}" y2="${(y + dy).toFixed(1)}" stroke="${bright}" stroke-width="${(sw * 0.75).toFixed(1)}" stroke-linecap="round" opacity="0.85"/>`;
    }
    return svg;
}

function tendril(rng, color, s = 1) {
    // Drooping vine-like plant
    const h = (28 + rng() * 20) * s;
    const tendrils = 3 + Math.floor(rng() * 4);
    let svg = `<line x1="0" y1="0" x2="0" y2="${(-h).toFixed(1)}" stroke="${color}" stroke-width="${(2.5 * s).toFixed(1)}" stroke-linecap="round"/>`;
    for (let i = 0; i < tendrils; i++) {
        const ty  = -(h * (0.3 + rng() * 0.6));
        const len = (12 + rng() * 18) * s;
        const side = Math.sign(rng() - 0.5) || 1;
        const droop = len * 0.4;
        svg += `<path d="M0,${ty.toFixed(1)} C${(side * len * 0.3).toFixed(1)},${ty.toFixed(1)} ${(side * len).toFixed(1)},${(ty + droop).toFixed(1)} ${(side * len).toFixed(1)},${(ty + droop).toFixed(1)}" stroke="${lighten(color, 0.15)}" stroke-width="${(1.2 * s).toFixed(1)}" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    }
    return svg;
}

// ── Rock generators ───────────────────────────────────────────────────────────

function boulder(rng, color, s = 1) {
    const rx   = (16 + rng() * 18) * s;
    const ry   = (10 + rng() * 12) * s;
    const cy_  = -ry * 0.7;
    const shad = darken(color, 0.25);
    const hi   = lighten(color, 0.15);
    return `<ellipse cx="0" cy="${cy_.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}" opacity="0.92"/>
<ellipse cx="${(rx * 0.25).toFixed(1)}" cy="${(cy_ - ry * 0.3).toFixed(1)}" rx="${(rx * 0.35).toFixed(1)}" ry="${(ry * 0.2).toFixed(1)}" fill="${shad}" opacity="0.3"/>
<ellipse cx="${(-rx * 0.2).toFixed(1)}" cy="${(cy_ + ry * 0.1).toFixed(1)}" rx="${(rx * 0.2).toFixed(1)}" ry="${(ry * 0.15).toFixed(1)}" fill="${hi}" opacity="0.2"/>`;
}

function shard(rng, color, s = 1) {
    const h    = (20 + rng() * 28) * s;
    const w    = (10 + rng() * 14) * s;
    const lean = (rng() * 2 - 1) * 0.35;
    const notch = rng() > 0.5;
    const shad = darken(color, 0.3);
    let svg = `<polygon points="${(lean * h).toFixed(1)},${(-h).toFixed(1)} ${(w / 2).toFixed(1)},0 ${(-w / 2).toFixed(1)},0" fill="${color}" opacity="0.9"/>`;
    if (notch) {
        // Shaded face
        svg += `<polygon points="${(lean * h).toFixed(1)},${(-h).toFixed(1)} ${(w * 0.05).toFixed(1)},0 ${(w / 2).toFixed(1)},0" fill="${shad}" opacity="0.4"/>`;
    }
    return svg;
}

function stack(rng, color, s = 1) {
    const n = 2 + Math.floor(rng() * 3);
    let svg = '', y = 0;
    for (let i = 0; i < n; i++) {
        const w   = (20 + rng() * 24 - i * 5) * s;
        const h   = (5  + rng() * 8) * s;
        const ox  = (rng() * 2 - 1) * 5 * s;
        const col = i % 2 === 0 ? color : lighten(color, 0.1);
        svg += `<rect x="${(ox - w / 2).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" opacity="0.92" rx="1"/>`;
        y -= h;
    }
    return svg;
}

// ── 20 Palettes ───────────────────────────────────────────────────────────────
// Each: skyTop, skyHor (horizon sky), fog, gFar (far ground), gNear (near ground),
//        rock, flora, accent (flora highlight), cel (celestial body)
const PALETTES = [
    // 00 — Rust Desert: burnt-orange ground, hazy red-brown sky
    { name: 'rust-desert',
      skyTop:'#160a06', skyHor:'#5c2a14', fog:'#7a4828',
      gFar:'#3e1c0c', gNear:'#251008', rock:'#1a0a04', flora:'#6a2e12', accent:'#904030',
      cel:'#c06040' },

    // 01 — Frozen Wastes: slate-blue ice, cold pale sky
    { name: 'frozen-wastes',
      skyTop:'#060c16', skyHor:'#1e3050', fog:'#344e68',
      gFar:'#1c2e40', gNear:'#101c2c', rock:'#0c1620', flora:'#2c4258', accent:'#486880',
      cel:'#a0c0d8' },

    // 02 — Sulfur Flats: pale yellow-green ground, murky yellow sky
    { name: 'sulfur-flats',
      skyTop:'#10100a', skyHor:'#3c3c10', fog:'#525224',
      gFar:'#2c2c0c', gNear:'#1a1a06', rock:'#101006', flora:'#4a4a1a', accent:'#625e28',
      cel:'#b0a840' },

    // 03 — Obsidian Plains: near-black with blue sheen, deep indigo sky
    { name: 'obsidian-plains',
      skyTop:'#020408', skyHor:'#0e1626', fog:'#161e30',
      gFar:'#0c1018', gNear:'#060810', rock:'#0a0e18', flora:'#141e2e', accent:'#202e44',
      cel:'#3050a0' },

    // 04 — Fungal Marsh: muted mauve ground, grey-pink overcast sky
    { name: 'fungal-marsh',
      skyTop:'#120c12', skyHor:'#342030', fog:'#4a3048',
      gFar:'#22141e', gNear:'#140c16', rock:'#0e0810', flora:'#3c1e30', accent:'#562844',
      cel:'#805070' },

    // 05 — Crystal Tundra: pale lavender ground, violet-grey sky
    { name: 'crystal-tundra',
      skyTop:'#0c0a18', skyHor:'#26204a', fog:'#3a2e62',
      gFar:'#201a3a', gNear:'#100e22', rock:'#0a0818', flora:'#302850', accent:'#463e70',
      cel:'#a090e0' },

    // 06 — Ash Fields: uniform grey everywhere, monochrome
    { name: 'ash-fields',
      skyTop:'#0c0c0e', skyHor:'#26262c', fog:'#383840',
      gFar:'#1e1e22', gNear:'#121214', rock:'#0c0c0e', flora:'#2e2e32', accent:'#424248',
      cel:'#909098' },

    // 07 — Amber Steppe: warm gold-brown ground, orange-tan sky
    { name: 'amber-steppe',
      skyTop:'#180e06', skyHor:'#4c3014', fog:'#604020',
      gFar:'#321e0a', gNear:'#1e1006', rock:'#160c04', flora:'#402810', accent:'#5c4020',
      cel:'#d09040' },

    // 08 — Teal Mudflats: dark teal ground, foggy teal-grey sky
    { name: 'teal-mudflats',
      skyTop:'#020e0c', skyHor:'#102820', fog:'#183828',
      gFar:'#0c1e18', gNear:'#060e0c', rock:'#040a08', flora:'#102018', accent:'#183028',
      cel:'#408060' },

    // 09 — Chalk Plateau: off-white ground, pale grey-blue sky
    { name: 'chalk-plateau',
      skyTop:'#121416', skyHor:'#32384a', fog:'#444e5c',
      gFar:'#2a3040', gNear:'#1a1e28', rock:'#121418', flora:'#323a4c', accent:'#424e62',
      cel:'#b0bcd0' },

    // 10 — Bronze Jungle: olive-bronze ground, warm grey-green canopy sky
    { name: 'bronze-jungle',
      skyTop:'#080a04', skyHor:'#242412', fog:'#303422',
      gFar:'#1a1a0a', gNear:'#0e0e06', rock:'#080804', flora:'#282e16', accent:'#363e1e',
      cel:'#80781e' },

    // 11 — Magenta Waste: deep rose-grey ground, dim rose-mauve sky
    { name: 'magenta-waste',
      skyTop:'#120a10', skyHor:'#321828', fog:'#421e34',
      gFar:'#221018', gNear:'#12080e', rock:'#0c0608', flora:'#2e1220', accent:'#42182e',
      cel:'#a04070' },

    // 12 — Slate Cliffs: blue-grey slate ground, cool silver-grey sky
    { name: 'slate-cliffs',
      skyTop:'#060a10', skyHor:'#1a2234', fog:'#26303e',
      gFar:'#121a26', gNear:'#080c14', rock:'#060a10', flora:'#182030', accent:'#22303e',
      cel:'#708090' },

    // 13 — Olive Savanna: dark olive-green ground, hazy yellow-grey sky
    { name: 'olive-savanna',
      skyTop:'#0a0c06', skyHor:'#2a2c14', fog:'#3a3c22',
      gFar:'#1e2210', gNear:'#0e1008', rock:'#0a0c06', flora:'#2a3014', accent:'#3a3e1e',
      cel:'#909830' },

    // 14 — Crimson Bog: dark red-purple ground, overcast maroon sky
    { name: 'crimson-bog',
      skyTop:'#0e0608', skyHor:'#301216', fog:'#40181e',
      gFar:'#200c0e', gNear:'#100608', rock:'#080406', flora:'#2a0e12', accent:'#3e151c',
      cel:'#803040' },

    // 15 — Ice Caves: pale cyan-tinted ice, faint blue sky
    { name: 'ice-caves',
      skyTop:'#060e1a', skyHor:'#14263e', fog:'#1e3652',
      gFar:'#102032', gNear:'#080e1a', rock:'#060c16', flora:'#183248', accent:'#224a60',
      cel:'#60c0e0' },

    // 16 — Desert Ochre: medium tan-orange ground, warm salmon sky
    { name: 'desert-ochre',
      skyTop:'#1a1208', skyHor:'#4e3418', fog:'#624428',
      gFar:'#3c2610', gNear:'#221408', rock:'#160e06', flora:'#3c2c12', accent:'#52401e',
      cel:'#e0a050' },

    // 17 — Dark Jungle: very dark green ground, dim canopy sky
    { name: 'dark-jungle',
      skyTop:'#030604', skyHor:'#0c1a0e', fog:'#101e12',
      gFar:'#081008', gNear:'#040a04', rock:'#030804', flora:'#0e1a0e', accent:'#162214',
      cel:'#204020' },

    // 18 — Storm Plains: stormy blue-grey ground, dramatic overcast sky
    { name: 'storm-plains',
      skyTop:'#060c18', skyHor:'#141e32', fog:'#202c42',
      gFar:'#101824', gNear:'#080c16', rock:'#060a10', flora:'#141e2c', accent:'#1e2c3e',
      cel:'#4060a0' },

    // 19 — Dusk Violet: deep purple-black ground, purple-to-amber dusk sky
    { name: 'dusk-violet',
      skyTop:'#0a0614', skyHor:'#241032', fog:'#321842',
      gFar:'#1a0c26', gNear:'#0e0618', rock:'#080412', flora:'#1e1030', accent:'#2c1840',
      cel:'#c06020' },
];

// ── Pick flora/rock by type name ──────────────────────────────────────────────
const FLORA_TYPES = ['mushroom', 'crystal', 'bush', 'spine', 'fern', 'tendril'];
const ROCK_TYPES  = ['boulder', 'shard', 'stack'];

function makeFlora(rng, pal, scale) {
    const type = FLORA_TYPES[Math.floor(rng() * FLORA_TYPES.length)];
    switch (type) {
        case 'mushroom': return mushroom(rng, pal.flora, pal.accent, scale);
        case 'crystal':  return crystal(rng, pal.accent, scale);
        case 'bush':     return bush(rng, pal.flora, scale);
        case 'spine':    return spine(rng, pal.flora, scale);
        case 'fern':     return fern(rng, pal.flora, scale);
        case 'tendril':  return tendril(rng, pal.flora, scale);
    }
}

function makeRock(rng, pal, scale) {
    const type = ROCK_TYPES[Math.floor(rng() * ROCK_TYPES.length)];
    switch (type) {
        case 'boulder': return boulder(rng, pal.rock, scale);
        case 'shard':   return shard(rng, pal.rock, scale);
        case 'stack':   return stack(rng, pal.rock, scale);
    }
}

// ── Main SVG generator ────────────────────────────────────────────────────────
function generateBG(index, pal) {
    const rng = makePRNG(index * 137 + 42);

    const horizonY = 355 + (rng() * 2 - 1) * 35; // 320–390

    // ── Celestial body (moon / sun in sky) ───────────────────────────────────
    const celX   = 80 + rng() * (W - 160);
    const celY   = 30 + rng() * (horizonY - 90);
    const celR   = 14 + rng() * 22;
    const celOpacity = 0.35 + rng() * 0.3;
    const celestial = [
        `<circle cx="${celX.toFixed(1)}" cy="${celY.toFixed(1)}" r="${(celR * 2.8).toFixed(1)}" fill="${pal.cel}" opacity="${(celOpacity * 0.18).toFixed(2)}"/>`,
        `<circle cx="${celX.toFixed(1)}" cy="${celY.toFixed(1)}" r="${(celR * 1.6).toFixed(1)}" fill="${pal.cel}" opacity="${(celOpacity * 0.25).toFixed(2)}"/>`,
        `<circle cx="${celX.toFixed(1)}" cy="${celY.toFixed(1)}" r="${celR.toFixed(1)}" fill="${pal.cel}" opacity="${celOpacity.toFixed(2)}"/>`,
    ].join('\n  ');

    // Optional second smaller moon
    let moon2 = '';
    if (rng() > 0.55) {
        const mx = 80 + rng() * (W - 160);
        const my = 30 + rng() * (horizonY - 80);
        const mr = 6 + rng() * 10;
        const mop = 0.2 + rng() * 0.2;
        const mc = lighten(pal.skyTop, 0.3);
        moon2 = `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${(mr * 1.6).toFixed(1)}" fill="${mc}" opacity="${(mop * 0.3).toFixed(2)}"/>
  <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${mr.toFixed(1)}" fill="${mc}" opacity="${mop.toFixed(2)}"/>`;
    }

    // ── Terrain layers ────────────────────────────────────────────────────────
    // Far silhouette: wide smooth hills against sky
    const farAmp  = 40 + rng() * 45;
    const farTerrain = makeTerrain(rng, horizonY - 10, farAmp, 22, 5);
    // Near terrain: slightly lower, rougher
    const nearAmp = 25 + rng() * 30;
    const nearTerrain = makeTerrain(rng, horizonY + 25, nearAmp, 18, 3);

    // ── Ground texture patches (flat ellipses on ground) ─────────────────────
    const patchCount = 25 + Math.floor(rng() * 20);
    const patches = [];
    for (let i = 0; i < patchCount; i++) {
        const px  = rng() * W;
        const py  = horizonY + 35 + rng() * (H - horizonY - 55);
        const prx = 18 + rng() * 55;
        const pry = 4  + rng() * 10;
        const pc  = rng() > 0.5 ? darken(pal.gNear, 0.18 + rng() * 0.2) : lighten(pal.gNear, 0.05 + rng() * 0.08);
        patches.push(`<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${prx.toFixed(1)}" ry="${pry.toFixed(1)}" fill="${pc}" opacity="${(0.25 + rng() * 0.3).toFixed(2)}"/>`);
    }

    // ── Ground cracks / fissures ──────────────────────────────────────────────
    const crackCount = 6 + Math.floor(rng() * 8);
    const cracks = [];
    const crackColor = darken(pal.gNear, 0.35);
    for (let i = 0; i < crackCount; i++) {
        const cx_  = rng() * W;
        const cy_  = horizonY + 40 + rng() * (H - horizonY - 70);
        const len  = 25 + rng() * 55;
        const ang  = rng() * Math.PI;
        const ex   = cx_ + Math.cos(ang) * len;
        const ey   = cy_ + Math.sin(ang) * len * 0.4;
        const mx   = (cx_ + ex) / 2 + (rng() * 2 - 1) * 18;
        const my   = (cy_ + ey) / 2 + (rng() * 2 - 1) * 8;
        const sw   = (0.4 + rng() * 0.9).toFixed(1);
        const op   = (0.25 + rng() * 0.35).toFixed(2);
        cracks.push(`<path d="M${cx_.toFixed(1)},${cy_.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${crackColor}" stroke-width="${sw}" fill="none" opacity="${op}"/>`);
    }

    // ── Flora elements (clustered near terrain line) ──────────────────────────
    const floraCount = 10 + Math.floor(rng() * 10);
    const floraEls = [];
    for (let i = 0; i < floraCount; i++) {
        const fx  = rng() * W;
        const fy  = horizonY + 18 + rng() * 70;
        const fs  = 0.5 + rng() * 0.9;
        const fop = (0.5 + rng() * 0.45).toFixed(2);
        const inner = makeFlora(rng, pal, fs);
        floraEls.push(`<g transform="translate(${fx.toFixed(1)},${fy.toFixed(1)})" opacity="${fop}">${inner}</g>`);
    }

    // ── Rock formations scattered across ground ───────────────────────────────
    const rockCount = 6 + Math.floor(rng() * 8);
    const rockEls = [];
    for (let i = 0; i < rockCount; i++) {
        const rx  = rng() * W;
        const ry  = horizonY + 12 + rng() * (H - horizonY - 60);
        const rs  = 0.6 + rng() * 1.1;
        const inner = makeRock(rng, pal, rs);
        rockEls.push(`<g transform="translate(${rx.toFixed(1)},${ry.toFixed(1)})">${inner}</g>`);
    }

    // ── Large foreground elements (partial, at screen bottom) ─────────────────
    const fgCount = 2 + Math.floor(rng() * 3);
    const fgEls = [];
    for (let i = 0; i < fgCount; i++) {
        const fx  = rng() * W;
        const fy  = H - 10 - rng() * 50;
        const fs  = 1.4 + rng() * 1.1;
        const inner = rng() < 0.45 ? makeFlora(rng, pal, fs) : makeRock(rng, pal, fs);
        fgEls.push(`<g transform="translate(${fx.toFixed(1)},${fy.toFixed(1)})" opacity="${(0.55 + rng() * 0.3).toFixed(2)}">${inner}</g>`);
    }

    // ── Atmospheric dust particles ────────────────────────────────────────────
    const dustCount = 20 + Math.floor(rng() * 25);
    const dust = [];
    for (let i = 0; i < dustCount; i++) {
        const dx  = rng() * W;
        const dy  = horizonY - 30 + rng() * 100;
        const dr  = (0.8 + rng() * 1.8).toFixed(1);
        const dop = (0.08 + rng() * 0.18).toFixed(2);
        dust.push(`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${dr}" fill="${pal.fog}" opacity="${dop}"/>`);
    }

    // ── Assemble SVG ─────────────────────────────────────────────────────────
    const fogTop = Math.max(0, horizonY - 100);
    const fogH   = 140;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.skyTop}"/>
      <stop offset="85%" stop-color="${pal.skyHor}"/>
      <stop offset="100%" stop-color="${lerpColor(pal.skyHor, pal.fog, 0.5)}"/>
    </linearGradient>
    <linearGradient id="fog${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.fog}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${pal.fog}" stop-opacity="0.5"/>
    </linearGradient>
    <linearGradient id="ground${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.gFar}"/>
      <stop offset="100%" stop-color="${darken(pal.gNear, 0.15)}"/>
    </linearGradient>
    <filter id="sfar${index}"><feGaussianBlur stdDeviation="2.5"/></filter>
  </defs>

  <!-- Sky gradient -->
  <rect width="${W}" height="${H}" fill="url(#sky${index})"/>

  <!-- Celestial body -->
  ${celestial}
  ${moon2}

  <!-- Atmospheric haze at horizon -->
  <rect x="0" y="${fogTop.toFixed(0)}" width="${W}" height="${fogH}" fill="url(#fog${index})"/>

  <!-- Far terrain silhouette (blurred) -->
  <polygon points="${farTerrain}" fill="${pal.gFar}" filter="url(#sfar${index})" opacity="0.88"/>

  <!-- Near terrain -->
  <polygon points="${nearTerrain}" fill="${pal.gNear}" opacity="0.96"/>

  <!-- Ground base fill -->
  <rect x="0" y="${(horizonY + 40).toFixed(0)}" width="${W}" height="${(H - horizonY - 40).toFixed(0)}" fill="url(#ground${index})"/>

  <!-- Ground texture patches -->
  ${patches.join('\n  ')}

  <!-- Ground cracks -->
  ${cracks.join('\n  ')}

  <!-- Flora -->
  ${floraEls.join('\n  ')}

  <!-- Rocks -->
  ${rockEls.join('\n  ')}

  <!-- Foreground elements -->
  ${fgEls.join('\n  ')}

  <!-- Atmospheric dust -->
  ${dust.join('\n  ')}
</svg>`;
}

// ── Write all 20 ─────────────────────────────────────────────────────────────
for (let i = 0; i < PALETTES.length; i++) {
    const svg      = generateBG(i, PALETTES[i]);
    const filename = `bg-${String(i).padStart(2, '0')}.svg`;
    writeFileSync(join(outDir, filename), svg, 'utf8');
    console.log(`✓ ${filename}  (${PALETTES[i].name})`);
}
console.log(`\n${PALETTES.length} backgrounds written to ${outDir}`);
