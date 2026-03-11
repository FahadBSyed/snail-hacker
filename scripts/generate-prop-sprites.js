#!/usr/bin/env node
/**
 * Generates greyscale prop sprites (rocks + mushrooms) in oblique top-down style.
 * Inspired by Pokemon Gen 2/3 overworld art: only the TOP surface and the
 * SOUTH-FACING front face are rendered — no left/right side faces.
 *
 * Sprites are pure greyscale so Phaser's setTint(color) maps them to any palette.
 * White (#fff) → pure tint color; mid-grey → mid-brightness; black → stays black.
 *
 * Output: assets/sprites/props/rock-{0,1,2}.svg  mushroom-{0,1}.svg
 * Run:    node scripts/generate-prop-sprites.js
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'sprites', 'props');
mkdirSync(outDir, { recursive: true });

function f(n) { return n.toFixed(2); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fl(a, b, t) { return f(lerp(a, b, t)); }

function svg(w, h, content) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n  ${content}\n</svg>`;
}

// ── Greyscale palette ─────────────────────────────────────────────────────────
// When tinted in Phaser (multiply blend), these map the tint color across the
// full luminance range of the sprite.
const C = {
    shadow:    '#0c0c0c',   // ground drop shadow
    darkest:   '#1c1c1c',   // deepest crevices
    dark:      '#363636',   // shaded front face bottom
    midDark:   '#4e4e4e',   // front face base
    mid:       '#686868',   // front face upper / secondary
    midLight:  '#868686',   // top surface base
    light:     '#a4a4a4',   // top surface highlight
    lighter:   '#c2c2c2',   // top surface mid-highlight
    highlight: '#dedede',   // soft specular
    specular:  '#f2f2f2',   // bright specular spot
};

// ─── Rock ─────────────────────────────────────────────────────────────────────
// Structure (back-to-front draw order):
//   1. ground shadow ellipse
//   2. front face trapezoid (the south-facing wall)
//   3. front face shading (lighter upper band, darker lower band)
//   4. brow shadow ellipse (depth between top face and front face)
//   5. top face ellipse
//   6. top face highlights
//
// cfg fields (all as fraction of w or h):
//   topYRatio   vertical center of top ellipse
//   topRxRatio  top ellipse x-radius
//   topRyRatio  top ellipse y-radius
//   fBotRatio   front face bottom y
//   taperBot    front face bottom half-width relative to top (0-1, 1=no taper)
function makeRock(w, h, cfg = {}) {
    const cx    = w / 2;
    const topCy = h * (cfg.topYRatio  ?? 0.40);
    const topRx = w * (cfg.topRxRatio ?? 0.43);
    const topRy = h * (cfg.topRyRatio ?? 0.21);

    const fTop  = topCy;
    const fBot  = h * (cfg.fBotRatio  ?? 0.87);
    const fWTop = topRx;                          // front face half-width at top
    const fWBot = fWTop * (cfg.taperBot ?? 0.80); // slightly narrower at bottom

    // Trapezoid path helper
    function trap(t0, t1) {
        const yt = lerp(fTop, fBot, t0);
        const yb = lerp(fTop, fBot, t1);
        const wt = lerp(fWTop, fWBot, t0);
        const wb = lerp(fWTop, fWBot, t1);
        return `M${f(cx-wt)},${f(yt)} L${f(cx+wt)},${f(yt)} L${f(cx+wb)},${f(yb)} L${f(cx-wb)},${f(yb)} Z`;
    }

    return [
        // 1. Ground shadow
        `<ellipse cx="${f(cx)}" cy="${f(h*0.93)}" rx="${f(w*0.36)}" ry="${f(h*0.075)}" fill="${C.shadow}" opacity="0.34"/>`,

        // 2. Front face base (full trapezoid)
        `<path d="${trap(0, 1)}" fill="${C.midDark}"/>`,

        // 3a. Upper lighter band on front face (ambient top-light)
        `<path d="${trap(0, 0.38)}" fill="${C.mid}" opacity="0.55"/>`,

        // 3b. Lower shadow band (falls into shadow)
        `<path d="${trap(0.60, 1)}" fill="${C.darkest}" opacity="0.40"/>`,

        // 4. Brow shadow: dark ellipse straddles the top/front junction.
        //    The top face (drawn next) covers the upper half; the lower portion
        //    shows as a dark crescent on the front face, selling the overhang depth.
        //    cy pushed well past the top ellipse center so enough crescent is visible.
        `<ellipse cx="${f(cx)}" cy="${f(topCy + topRy*0.72)}" rx="${f(topRx*0.96)}" ry="${f(topRy*0.66)}" fill="${C.darkest}" opacity="0.38"/>`,

        // 5. Top face ellipse
        `<ellipse cx="${f(cx)}" cy="${f(topCy)}" rx="${f(topRx)}" ry="${f(topRy)}" fill="${C.midLight}"/>`,

        // 6a. Top face broad highlight (NW quadrant, soft)
        `<ellipse cx="${f(cx - topRx*0.22)}" cy="${f(topCy - topRy*0.22)}" rx="${f(topRx*0.62)}" ry="${f(topRy*0.60)}" fill="${C.lighter}" opacity="0.46"/>`,

        // 6b. Specular spot (strong light catch, upper-left)
        `<ellipse cx="${f(cx - topRx*0.30)}" cy="${f(topCy - topRy*0.30)}" rx="${f(topRx*0.24)}" ry="${f(topRy*0.22)}" fill="${C.specular}" opacity="0.36"/>`,
    ].join('\n  ');
}

// ─── Mushroom ─────────────────────────────────────────────────────────────────
// Structure (back-to-front draw order):
//   1. ground shadow
//   2. stem front face rectangle
//   3. stem shading
//   4. stem top ellipse (connects stem to cap)
//   5. cap undershade ellipse (underside of cap, casts down)
//   6. cap top ellipse (main dome)
//   7. cap highlights
//   8. spots (raised wart-like markings)
//   9. cap rim edge
//
// cfg fields:
//   stemWRatio    stem half-width (fraction of w)
//   stemTopRatio  y where stem meets cap (fraction of h)
//   capCyRatio    cap dome vertical center (fraction of h)
//   capRxRatio    cap dome x-radius (fraction of w)
//   capRyRatio    cap dome y-radius (fraction of h)
//   spots         array of {ox, oy, r} (all fractions of respective cap radii)
function makeMushroom(w, h, cfg = {}) {
    const cx = w / 2;
    const stemW   = w  * (cfg.stemWRatio    ?? 0.20);
    const stemTop = h  * (cfg.stemTopRatio  ?? 0.62);
    const stemBot = h  * 0.90;
    const capCy   = h  * (cfg.capCyRatio    ?? 0.37);
    const capRx   = w  * (cfg.capRxRatio    ?? 0.44);
    const capRy   = h  * (cfg.capRyRatio    ?? 0.22);

    const spots = cfg.spots ?? [
        { ox: -0.24, oy: -0.10, r: 0.11 },
        { ox:  0.22, oy: -0.16, r: 0.08 },
        { ox:  0.05, oy:  0.08, r: 0.06 },
    ];

    return [
        // 1. Ground shadow
        `<ellipse cx="${f(cx)}" cy="${f(h*0.94)}" rx="${f(w*0.40)}" ry="${f(h*0.07)}" fill="${C.shadow}" opacity="0.30"/>`,

        // 2. Stem front face (rounded rect)
        `<rect x="${f(cx - stemW)}" y="${f(stemTop)}" width="${f(stemW*2)}" height="${f(stemBot - stemTop)}" rx="${f(stemW*0.45)}" fill="${C.light}"/>`,

        // 3a. Stem highlight (left side, lighter)
        `<rect x="${f(cx - stemW)}" y="${f(stemTop)}" width="${f(stemW*0.65)}" height="${f(stemBot - stemTop)}" rx="${f(stemW*0.45)}" fill="${C.specular}" opacity="0.30"/>`,

        // 3b. Stem shadow (right side, darker)
        `<rect x="${f(cx + stemW*0.35)}" y="${f(stemTop)}" width="${f(stemW*0.65)}" height="${f(stemBot - stemTop)}" rx="${f(stemW*0.45)}" fill="${C.dark}" opacity="0.38"/>`,

        // 3c. Stem bottom fade (ground contact gets darker)
        `<rect x="${f(cx - stemW)}" y="${f(lerp(stemTop, stemBot, 0.70))}" width="${f(stemW*2)}" height="${f((stemBot - stemTop)*0.30)}" rx="${f(stemW*0.45)}" fill="${C.dark}" opacity="0.30"/>`,

        // 4. Stem top ellipse (visible flat top of stem inside cap)
        `<ellipse cx="${f(cx)}" cy="${f(stemTop)}" rx="${f(stemW*1.05)}" ry="${f(stemW*0.48)}" fill="${C.lighter}"/>`,

        // 5. Cap undershade: dark ellipse at cap bottom — underside of cap
        //    overhanging the stem, creating depth and rim shadow
        `<ellipse cx="${f(cx)}" cy="${f(capCy + capRy*0.58)}" rx="${f(capRx*0.88)}" ry="${f(capRy*0.50)}" fill="${C.darkest}" opacity="0.45"/>`,

        // 6. Cap top face (main dome)
        `<ellipse cx="${f(cx)}" cy="${f(capCy)}" rx="${f(capRx)}" ry="${f(capRy)}" fill="${C.mid}"/>`,

        // 7a. Cap broad highlight
        `<ellipse cx="${f(cx - capRx*0.18)}" cy="${f(capCy - capRy*0.18)}" rx="${f(capRx*0.60)}" ry="${f(capRy*0.57)}" fill="${C.lighter}" opacity="0.48"/>`,

        // 7b. Cap specular spot
        `<ellipse cx="${f(cx - capRx*0.26)}" cy="${f(capCy - capRy*0.28)}" rx="${f(capRx*0.20)}" ry="${f(capRy*0.18)}" fill="${C.specular}" opacity="0.40"/>`,

        // 8. Spots (raised wart-like markings)
        //    Each spot = light halo (bump catching light) + dark core (center shadow)
        ...spots.flatMap(s => {
            const sx = cx + capRx * s.ox;
            const sy = capCy + capRy * s.oy;
            const srx = capRx * s.r;
            const sry = capRy * s.r * 0.82;
            return [
                `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(srx*1.30)}" ry="${f(sry*1.28)}" fill="${C.highlight}" opacity="0.28"/>`,
                `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(srx)}" ry="${f(sry)}" fill="${C.lighter}" opacity="0.60"/>`,
                `<ellipse cx="${f(sx + srx*0.18)}" cy="${f(sy + sry*0.18)}" rx="${f(srx*0.42)}" ry="${f(sry*0.42)}" fill="${C.mid}" opacity="0.35"/>`,
            ];
        }),

        // 9. Cap outer rim (thin dark ellipse defining edge)
        `<ellipse cx="${f(cx)}" cy="${f(capCy)}" rx="${f(capRx)}" ry="${f(capRy)}" fill="none" stroke="${C.darkest}" stroke-width="1.4" opacity="0.45"/>`,
    ].join('\n  ');
}

// ─── Variants ─────────────────────────────────────────────────────────────────

const ROCKS = [
    // rock-0: compact round boulder
    {
        w: 40, h: 34,
        cfg: { topYRatio: 0.41, topRxRatio: 0.43, topRyRatio: 0.22, fBotRatio: 0.88, taperBot: 0.82 },
    },
    // rock-1: wide flat slab
    {
        w: 60, h: 40,
        cfg: { topYRatio: 0.38, topRxRatio: 0.45, topRyRatio: 0.18, fBotRatio: 0.86, taperBot: 0.88 },
    },
    // rock-2: tall chunky boulder
    {
        w: 48, h: 58,
        cfg: { topYRatio: 0.35, topRxRatio: 0.42, topRyRatio: 0.20, fBotRatio: 0.89, taperBot: 0.76 },
    },
];

const MUSHROOMS = [
    // mushroom-0: compact single stalk
    {
        w: 32, h: 52,
        cfg: {
            stemWRatio: 0.20, stemTopRatio: 0.63,
            capCyRatio: 0.36, capRxRatio: 0.44, capRyRatio: 0.22,
            spots: [
                { ox: -0.26, oy: -0.08, r: 0.11 },
                { ox:  0.22, oy: -0.16, r: 0.08 },
                { ox:  0.06, oy:  0.10, r: 0.06 },
            ],
        },
    },
    // mushroom-1: larger domed cap
    {
        w: 48, h: 70,
        cfg: {
            stemWRatio: 0.17, stemTopRatio: 0.65,
            capCyRatio: 0.33, capRxRatio: 0.46, capRyRatio: 0.24,
            spots: [
                { ox: -0.30, oy: -0.10, r: 0.10 },
                { ox:  0.26, oy: -0.18, r: 0.09 },
                { ox:  0.10, oy:  0.06, r: 0.07 },
                { ox: -0.12, oy:  0.14, r: 0.05 },
            ],
        },
    },
];

// ─── Write files ──────────────────────────────────────────────────────────────
for (let i = 0; i < ROCKS.length; i++) {
    const { w, h, cfg } = ROCKS[i];
    const name = `rock-${i}.svg`;
    writeFileSync(join(outDir, name), svg(w, h, makeRock(w, h, cfg)), 'utf8');
    console.log(`✓ ${name}  (${w}×${h})`);
}

for (let i = 0; i < MUSHROOMS.length; i++) {
    const { w, h, cfg } = MUSHROOMS[i];
    const name = `mushroom-${i}.svg`;
    writeFileSync(join(outDir, name), svg(w, h, makeMushroom(w, h, cfg)), 'utf8');
    console.log(`✓ ${name}  (${w}×${h})`);
}

console.log(`\nSprites written to ${outDir}`);
console.log('Runtime tinting: spriteObj.setTint(0xRRGGBB) in Phaser');
