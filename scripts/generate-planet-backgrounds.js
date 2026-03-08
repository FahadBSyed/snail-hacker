#!/usr/bin/env node
/**
 * Generates 20 alien planet surface backgrounds (1280×720), top-down view.
 * Output: assets/backgrounds/bg-{00..19}.svg
 * Run:    node scripts/generate-planet-backgrounds.js
 *
 * Top-down means: no sky, no horizon. We're looking straight down at the
 * alien ground. Elements: ground texture patches, cracks/fissures, rocks
 * with drop shadows, craters, liquid pools, and alien flora viewed from above.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'backgrounds');
mkdirSync(outDir, { recursive: true });

const W = 1280, H = 720;

// Light comes from upper-left; shadows offset lower-right
const SHADOW_DX = 5;
const SHADOW_DY = 7;

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
function f(n) { return n.toFixed(1); }   // helper: 1 decimal place
function fi(n) { return Math.round(n).toString(); }

// ── Top-down element generators ───────────────────────────────────────────────
// All elements are centered at (0,0); caller wraps in <g transform="translate(x,y)">

// Irregular boulder/rock seen from directly above, with drop shadow
function topRock(rng, color, s = 1) {
    const rx   = (10 + rng() * 18) * s;
    const ry   = (7  + rng() * 12) * s;
    const rot  = rng() * 360;
    const shad = darken(color, 0.45);
    const hi   = lighten(color, 0.22);
    // Shadow is offset body, slightly stretched
    return `<g transform="rotate(${fi(rot)})">
<ellipse cx="${f(SHADOW_DX)}" cy="${f(SHADOW_DY)}" rx="${f(rx * 1.08)}" ry="${f(ry * 0.9)}" fill="${shad}" opacity="0.45"/>
<ellipse rx="${f(rx)}" ry="${f(ry)}" fill="${color}" opacity="0.92"/>
<ellipse cx="${f(-rx * 0.22)}" cy="${f(-ry * 0.28)}" rx="${f(rx * 0.38)}" ry="${f(ry * 0.28)}" fill="${hi}" opacity="0.28"/>
</g>`;
}

// Small pebble cluster
function topPebbles(rng, color, s = 1) {
    const n = 3 + Math.floor(rng() * 5);
    let svg = '';
    for (let i = 0; i < n; i++) {
        const ox  = (rng() * 2 - 1) * 14 * s;
        const oy  = (rng() * 2 - 1) * 10 * s;
        const pr  = (2 + rng() * 5) * s;
        const pc  = rng() > 0.5 ? lighten(color, 0.1) : darken(color, 0.1);
        svg += `<circle cx="${f(ox + SHADOW_DX * 0.5)}" cy="${f(oy + SHADOW_DY * 0.5)}" r="${f(pr * 1.05)}" fill="${darken(color, 0.4)}" opacity="0.35"/>`;
        svg += `<circle cx="${f(ox)}" cy="${f(oy)}" r="${f(pr)}" fill="${pc}" opacity="0.88"/>`;
    }
    return svg;
}

// Crater with rim, dark floor, and shadow crescent on lower-right wall
function topCrater(rng, rimColor, floorColor, s = 1) {
    const r    = (18 + rng() * 28) * s;
    const rimW = r * 0.18;
    const shad = darken(floorColor, 0.3);
    const hi   = lighten(rimColor, 0.15);
    return `<circle r="${f(r + rimW)}" fill="${hi}" opacity="0.45"/>
<circle r="${f(r + rimW * 0.5)}" fill="${rimColor}" opacity="0.6"/>
<circle r="${f(r)}" fill="${floorColor}" opacity="0.95"/>
<ellipse cx="${f(r * 0.22)}" cy="${f(r * 0.28)}" rx="${f(r * 0.72)}" ry="${f(r * 0.52)}" fill="${shad}" opacity="0.45"/>`;
}

// Liquid pool / acid pit — smooth ellipse with specular highlight
function topPool(rng, color, s = 1) {
    const rx   = (16 + rng() * 28) * s;
    const ry   = (8  + rng() * 16) * s;
    const rot  = rng() * 360;
    const spec = lighten(color, 0.35);
    const edge = darken(color, 0.2);
    return `<g transform="rotate(${fi(rot)})">
<ellipse rx="${f(rx * 1.06)}" ry="${f(ry * 1.06)}" fill="${edge}" opacity="0.4"/>
<ellipse rx="${f(rx)}" ry="${f(ry)}" fill="${color}" opacity="0.75"/>
<ellipse cx="${f(-rx * 0.18)}" cy="${f(-ry * 0.2)}" rx="${f(rx * 0.38)}" ry="${f(ry * 0.28)}" fill="${spec}" opacity="0.18"/>
</g>`;
}

// Alien rosette plant — N leaves radiating from centre, viewed from above
function topRosette(rng, color, s = 1) {
    const n      = 5 + Math.floor(rng() * 5);
    const leafRx = (7 + rng() * 9) * s;
    const leafRy = (2.5 + rng() * 3) * s;
    const reach  = leafRx * 0.7;
    const center = lighten(color, 0.25);
    let svg = '';
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * 360;
        const cx    = Math.cos(angle * Math.PI / 180) * reach;
        const cy    = Math.sin(angle * Math.PI / 180) * reach;
        svg += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(leafRx)}" ry="${f(leafRy)}" transform="rotate(${f(angle)},${f(cx)},${f(cy)})" fill="${color}" opacity="${f(0.7 + rng() * 0.25)}"/>`;
    }
    svg += `<circle cx="0" cy="0" r="${f(leafRy * 1.3)}" fill="${center}" opacity="0.8"/>`;
    return svg;
}

// Crystal cluster — star polygon(s) viewed from directly above
function topCrystal(rng, color, s = 1) {
    const count = 2 + Math.floor(rng() * 3);
    let svg = '';
    for (let c = 0; c < count; c++) {
        const n     = 4 + Math.floor(rng() * 4);
        const r     = (7 + rng() * 14) * s;
        const inner = r * (0.3 + rng() * 0.25);
        const rot   = rng() * 360;
        const ox    = (rng() * 2 - 1) * 8 * s;
        const oy    = (rng() * 2 - 1) * 6 * s;
        const shad  = darken(color, 0.35);
        let pts = '';
        for (let i = 0; i < n * 2; i++) {
            const ang = ((i / (n * 2)) * 360 + rot) * Math.PI / 180;
            const rad = i % 2 === 0 ? r : inner;
            pts += `${f(ox + Math.cos(ang) * rad)},${f(oy + Math.sin(ang) * rad)} `;
        }
        // shadow
        let ptsSh = '';
        for (let i = 0; i < n * 2; i++) {
            const ang = ((i / (n * 2)) * 360 + rot) * Math.PI / 180;
            const rad = i % 2 === 0 ? r : inner;
            ptsSh += `${f(ox + SHADOW_DX * 0.6 + Math.cos(ang) * rad)},${f(oy + SHADOW_DY * 0.6 + Math.sin(ang) * rad)} `;
        }
        svg += `<polygon points="${ptsSh.trim()}" fill="${shad}" opacity="0.35"/>`;
        svg += `<polygon points="${pts.trim()}" fill="${color}" opacity="0.82"/>`;
        svg += `<polygon points="${pts.trim()}" fill="${lighten(color, 0.4)}" transform="scale(0.38) translate(${f(ox / 0.38)},${f(oy / 0.38)})" opacity="0.45"/>`;
    }
    return svg;
}

// Lichen / moss patch — irregular blob
function topLichen(rng, color, s = 1) {
    const rx  = (12 + rng() * 16) * s;
    const ry  = (8  + rng() * 12) * s;
    const rot = rng() * 360;
    // Irregular blob using multiple overlapping ellipses
    const n = 4 + Math.floor(rng() * 4);
    let svg = '';
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const ex  = Math.cos(angle) * rx * (0.5 + rng() * 0.4);
        const ey  = Math.sin(angle) * ry * (0.4 + rng() * 0.5);
        const erx = (4 + rng() * rx * 0.6) * s;
        const ery = (3 + rng() * ry * 0.5) * s;
        svg += `<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(erx)}" ry="${f(ery)}" fill="${color}" opacity="${f(0.35 + rng() * 0.3)}"/>`;
    }
    return `<g transform="rotate(${fi(rot)})">${svg}</g>`;
}

// Crack / fissure — branching bezier path
function makeCrack(rng, color, x, y, angle, len, depth) {
    const ex  = x + Math.cos(angle) * len;
    const ey  = y + Math.sin(angle) * len;
    const mx  = (x + ex) / 2 + (rng() * 2 - 1) * len * 0.3;
    const my  = (y + ey) / 2 + (rng() * 2 - 1) * len * 0.15;
    const sw  = f(0.4 + rng() * 0.9 + depth * 0.3);
    const op  = f(0.28 + rng() * 0.28);
    let svg = `<path d="M${f(x)},${f(y)} Q${f(mx)},${f(my)} ${f(ex)},${f(ey)}" stroke="${color}" stroke-width="${sw}" fill="none" opacity="${op}" stroke-linecap="round"/>`;
    if (depth > 0) {
        // Branch
        if (rng() > 0.45) {
            const bAngle = angle + (rng() * 2 - 1) * 0.9;
            const midX   = mx;
            const midY   = my;
            svg += makeCrack(rng, color, midX, midY, bAngle, len * (0.45 + rng() * 0.3), depth - 1);
        }
        // Continue
        if (rng() > 0.35) {
            const nextAngle = angle + (rng() * 2 - 1) * 0.35;
            svg += makeCrack(rng, color, ex, ey, nextAngle, len * (0.5 + rng() * 0.35), depth - 1);
        }
    }
    return svg;
}

// ── 20 top-down biome palettes ────────────────────────────────────────────────
// base: dominant ground    alt: secondary ground patch
// dark: shadow/crack       rock: rock/boulder color
// flora: plants/lichen     crystal: crystal formations
// pool: liquid pools       rim: crater rim (lighter)   floor: crater floor (darker)
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

// ── Fine stipple: tiny dots simulating surface grain ─────────────────────────
function makeStipple(rng, pal, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const x  = rng() * W;
        const y  = rng() * H;
        const r  = f(0.6 + rng() * 1.4);
        const col = rng() > 0.6 ? lighten(pal.base, 0.12) : darken(pal.base, 0.15);
        const op  = f(0.15 + rng() * 0.25);
        out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${col}" opacity="${op}"/>`);
    }
    return out.join('\n  ');
}

// ── Main SVG generator ────────────────────────────────────────────────────────
function generateBG(index, pal) {
    const rng = makePRNG(index * 137 + 42);

    // Ground texture blobs
    const texture = makeGroundTexture(rng, pal, 35 + Math.floor(rng() * 20));

    // Cracks / fissures
    const crackLines = [];
    const crackCount = 5 + Math.floor(rng() * 8);
    for (let i = 0; i < crackCount; i++) {
        const cx    = rng() * W;
        const cy    = rng() * H;
        const angle = rng() * Math.PI * 2;
        const len   = 60 + rng() * 120;
        crackLines.push(makeCrack(rng, pal.dark, cx, cy, angle, len, 3));
    }

    // Liquid pools (drawn early so rocks sit on top)
    const poolEls = [];
    const poolCount = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < poolCount; i++) {
        const px = rng() * W;
        const py = rng() * H;
        const ps = 0.7 + rng() * 1.4;
        poolEls.push(`<g transform="translate(${f(px)},${f(py)})">${topPool(rng, pal.pool, ps)}</g>`);
    }

    // Craters
    const craterEls = [];
    const craterCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < craterCount; i++) {
        const cx = rng() * W;
        const cy = rng() * H;
        const cs = 0.7 + rng() * 1.6;
        craterEls.push(`<g transform="translate(${f(cx)},${f(cy)})">${topCrater(rng, pal.rim, pal.floor, cs)}</g>`);
    }

    // Lichen / moss patches
    const lichenEls = [];
    const lichenCount = 8 + Math.floor(rng() * 10);
    for (let i = 0; i < lichenCount; i++) {
        const lx = rng() * W;
        const ly = rng() * H;
        const ls = 0.6 + rng() * 1.2;
        lichenEls.push(`<g transform="translate(${f(lx)},${f(ly)})">${topLichen(rng, pal.flora, ls)}</g>`);
    }

    // Rocks (mid-size)
    const rockEls = [];
    const rockCount = 10 + Math.floor(rng() * 12);
    for (let i = 0; i < rockCount; i++) {
        const rx = rng() * W;
        const ry = rng() * H;
        const rs = 0.5 + rng() * 1.2;
        const inner = rng() > 0.35 ? topRock(rng, pal.rock, rs) : topPebbles(rng, pal.rock, rs);
        rockEls.push(`<g transform="translate(${f(rx)},${f(ry)})">${inner}</g>`);
    }

    // Crystals
    const crystalEls = [];
    const crystalCount = 4 + Math.floor(rng() * 6);
    for (let i = 0; i < crystalCount; i++) {
        const cx = rng() * W;
        const cy = rng() * H;
        const cs = 0.6 + rng() * 1.0;
        crystalEls.push(`<g transform="translate(${f(cx)},${f(cy)})">${topCrystal(rng, pal.crystal, cs)}</g>`);
    }

    // Alien rosette flora
    const floraEls = [];
    const floraCount = 8 + Math.floor(rng() * 10);
    for (let i = 0; i < floraCount; i++) {
        const fx  = rng() * W;
        const fy  = rng() * H;
        const fs  = 0.6 + rng() * 1.1;
        const fop = f(0.55 + rng() * 0.4);
        floraEls.push(`<g transform="translate(${f(fx)},${f(fy)})" opacity="${fop}">${topRosette(rng, pal.flora, fs)}</g>`);
    }

    // Fine stipple grain
    const stipple = makeStipple(rng, pal, 80 + Math.floor(rng() * 60));

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Base ground fill -->
  <rect width="${W}" height="${H}" fill="${pal.base}"/>

  <!-- Ground texture blobs -->
  ${texture}

  <!-- Fine surface stipple -->
  ${stipple}

  <!-- Cracks and fissures -->
  ${crackLines.join('\n  ')}

  <!-- Liquid pools -->
  ${poolEls.join('\n  ')}

  <!-- Craters -->
  ${craterEls.join('\n  ')}

  <!-- Lichen / moss patches -->
  ${lichenEls.join('\n  ')}

  <!-- Crystal formations -->
  ${crystalEls.join('\n  ')}

  <!-- Rocks and pebbles -->
  ${rockEls.join('\n  ')}

  <!-- Alien rosette flora -->
  ${floraEls.join('\n  ')}
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
