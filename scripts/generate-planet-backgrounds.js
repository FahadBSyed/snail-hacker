#!/usr/bin/env node
/**
 * Generates 20 alien planet surface backgrounds (1280×720), top-down view.
 * Output: assets/backgrounds/bg-{00..19}.svg
 * Run:    node scripts/generate-planet-backgrounds.js
 *
 * Pure ground texture: color-palette blobs + multi-scale noise dots.
 * No rocks, flora, pools, or craters — just a dirty/rocky surface feel.
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
function f(n) { return n.toFixed(1); }
function fi(n) { return Math.round(n).toString(); }

// ── 20 top-down biome palettes ────────────────────────────────────────────────
const PALETTES = [
    // 00 — Rust Crags: red-brown volcanic rock, iron dust
    { name: 'rust-crags',
      base:'#2a1008', alt:'#3c1a0c', dark:'#120604',
      rock:'#4a2010', flora:'#5a2e10', crystal:'#8a3818', pool:'#1e1006', rim:'#6a3018', floor:'#180804' },

    // 01 — Ice Sheet: pale blue-grey frozen surface, deep cracks
    { name: 'ice-sheet',
      base:'#141e28', alt:'#1c2a38', dark:'#0a1018',
      rock:'#2c3c4e', flora:'#203048', crystal:'#4a6880', pool:'#101c2c', rim:'#384e62', floor:'#0c1420' },

    // 02 — Sulfur Flats: yellow-green mineral deposits, pale and dusty
    { name: 'sulfur-flats',
      base:'#1e1e08', alt:'#2a2a0c', dark:'#101004',
      rock:'#383810', flora:'#484818', crystal:'#606028', pool:'#141402', rim:'#4a4a14', floor:'#0e0e04' },

    // 03 — Basalt Plains: near-black volcanic, blue-grey mineral sheen
    { name: 'basalt-plains',
      base:'#080c10', alt:'#0e1218', dark:'#040608',
      rock:'#14202c', flora:'#101c24', crystal:'#1c2e3e', pool:'#060a0e', rim:'#1a2830', floor:'#040608' },

    // 04 — Fungal Floor: muted purple-grey, alien mushroom clusters
    { name: 'fungal-floor',
      base:'#140c14', alt:'#1e1220', dark:'#0a060c',
      rock:'#2a1828', flora:'#3c2040', crystal:'#502848', pool:'#0e080e', rim:'#321e34', floor:'#0a060a' },

    // 05 — Crystal Wastes: lavender-grey ground, crystal formations
    { name: 'crystal-wastes',
      base:'#141020', alt:'#1c1830', dark:'#0c0a14',
      rock:'#242038', flora:'#302848', crystal:'#504880', pool:'#0e0c1a', rim:'#3a3460', floor:'#0a0810' },

    // 06 — Ash Waste: uniform grey, fine powdery texture
    { name: 'ash-waste',
      base:'#141416', alt:'#1c1c20', dark:'#0c0c0e',
      rock:'#282830', flora:'#222228', crystal:'#383840', pool:'#0e0e10', rim:'#303035', floor:'#0a0a0c' },

    // 07 — Desert Ochre: warm tan-brown sand, orange-tinted dunes
    { name: 'desert-ochre',
      base:'#201408', alt:'#2c1c0e', dark:'#100a04',
      rock:'#3a2410', flora:'#4a3018', crystal:'#5a3e20', pool:'#160e04', rim:'#4a3014', floor:'#100804' },

    // 08 — Bog Mud: dark teal-green boggy ground, murky pools
    { name: 'bog-mud',
      base:'#081410', alt:'#0e1c18', dark:'#040c08',
      rock:'#102018', flora:'#182e20', crystal:'#1e3828', pool:'#041008', rim:'#162820', floor:'#040c08' },

    // 09 — Chalk Flat: pale grey-white mineral deposit, fine texture
    { name: 'chalk-flat',
      base:'#1c2028', alt:'#242830', dark:'#10121a',
      rock:'#2e3240', flora:'#282c38', crystal:'#3e4454', pool:'#141618', rim:'#38404e', floor:'#0e1018' },

    // 10 — Bronze Moss: olive-bronze ground, lichen-covered rocks
    { name: 'bronze-moss',
      base:'#101008', alt:'#181810', dark:'#080804',
      rock:'#242414', flora:'#2e3018', crystal:'#3a3c20', pool:'#0a0a04', rim:'#2c2e14', floor:'#080804' },

    // 11 — Brine Flat: muted rose-grey, salt crystal deposits
    { name: 'brine-flat',
      base:'#1a1018', alt:'#241820', dark:'#100a10',
      rock:'#30202e', flora:'#3a2438', crystal:'#503048', pool:'#120c10', rim:'#382030', floor:'#0e080c' },

    // 12 — Slate Shore: dark blue-grey rocky shore, eroded stone
    { name: 'slate-shore',
      base:'#0c1018', alt:'#141820', dark:'#080c10',
      rock:'#202a36', flora:'#1a2430', crystal:'#2c3c4e', pool:'#08080e', rim:'#28343e', floor:'#080a0e' },

    // 13 — Dry Scrub: dark olive-brown, scattered organic debris
    { name: 'dry-scrub',
      base:'#141008', alt:'#1c180e', dark:'#0c0a06',
      rock:'#281e10', flora:'#302818', crystal:'#3c3218', pool:'#0c0a06', rim:'#2e2412', floor:'#0a0804' },

    // 14 — Blood Soil: deep crimson-brown, iron-rich with red pools
    { name: 'blood-soil',
      base:'#180808', alt:'#200c0c', dark:'#0c0404',
      rock:'#2e1010', flora:'#381414', crystal:'#501818', pool:'#100404', rim:'#3a1010', floor:'#0c0404' },

    // 15 — Glacial Ice: pale cyan, deep blue fissures, glassy pools
    { name: 'glacial-ice',
      base:'#0c1824', alt:'#142030', dark:'#080e18',
      rock:'#1e2e40', flora:'#182840', crystal:'#3060a0', pool:'#081420', rim:'#284060', floor:'#060c14' },

    // 16 — Clay Desert: warm ochre-red clay, cracked and dry
    { name: 'clay-desert',
      base:'#1e100a', alt:'#2a160e', dark:'#100806',
      rock:'#382014', flora:'#442818', crystal:'#5a3020', pool:'#140804', rim:'#3e2010', floor:'#0e0606' },

    // 17 — Jungle Floor: very dark green, leaf litter, roots
    { name: 'jungle-floor',
      base:'#060c06', alt:'#0a1008', dark:'#040804',
      rock:'#0e1a0e', flora:'#142014', crystal:'#1a2c18', pool:'#040804', rim:'#122014', floor:'#040804' },

    // 18 — Storm Plateau: stormy blue-grey, wind-scoured rock
    { name: 'storm-plateau',
      base:'#0c1018', alt:'#141820', dark:'#080a10',
      rock:'#1c2430', flora:'#181e2c', crystal:'#283a4e', pool:'#080c14', rim:'#20303e', floor:'#060a0e' },

    // 19 — Void Dust: deep purple-black with faint mineral glints
    { name: 'void-dust',
      base:'#0c0810', alt:'#120c18', dark:'#060408',
      rock:'#1a1228', flora:'#1e1430', crystal:'#2e1e50', pool:'#080610', rim:'#201630', floor:'#060408' },
];

// ── Ground texture: large overlapping translucent blobs ───────────────────────
function makeGroundTexture(rng, pal, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const x   = rng() * W;
        const y   = rng() * H;
        const rx  = 40 + rng() * 120;
        const ry  = 20 + rng() * 70;
        const rot = rng() * 360;
        const col = rng() > 0.5 ? pal.alt : lerpColor(pal.base, pal.alt, rng());
        const op  = f(0.12 + rng() * 0.22);
        out.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${fi(rot)},${f(x)},${f(y)})" fill="${col}" opacity="${op}"/>`);
    }
    return out.join('\n  ');
}

// ── Rocky noise: multi-scale dots simulating grit, pebble dust, mineral flecks
function makeNoise(rng, pal, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const x = rng() * W;
        const y = rng() * H;

        // Three size classes: fine dust, medium grit, coarse pebble-dust
        const roll = rng();
        let r, op;
        if (roll < 0.65) {
            // fine dust
            r  = 0.5 + rng() * 1.2;
            op = f(0.10 + rng() * 0.18);
        } else if (roll < 0.90) {
            // medium grit
            r  = 1.5 + rng() * 2.5;
            op = f(0.08 + rng() * 0.14);
        } else {
            // coarse fleck
            r  = 3.0 + rng() * 4.0;
            op = f(0.05 + rng() * 0.10);
        }

        // Bias toward lighter or darker than base
        const tint = rng();
        let col;
        if (tint < 0.35)      col = lighten(pal.base, 0.08 + rng() * 0.18);
        else if (tint < 0.65) col = darken(pal.base,  0.10 + rng() * 0.20);
        else                   col = lerpColor(pal.base, pal.alt, rng());

        out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${col}" opacity="${op}"/>`);
    }
    return out.join('\n  ');
}

// ── Main SVG generator ────────────────────────────────────────────────────────
function generateBG(index, pal) {
    const rng = makePRNG(index * 137 + 42);

    // Large ground-colour variation blobs
    const texture = makeGroundTexture(rng, pal, 35 + Math.floor(rng() * 20));

    // Dense multi-scale noise for rocky/dirty feel
    const noise = makeNoise(rng, pal, 600 + Math.floor(rng() * 300));

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Base ground fill -->
  <rect width="${W}" height="${H}" fill="${pal.base}"/>

  <!-- Ground colour variation blobs -->
  ${texture}

  <!-- Rocky / dirty surface noise -->
  ${noise}
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
