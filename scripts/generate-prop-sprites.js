#!/usr/bin/env node
/**
 * Generates greyscale prop sprites (rocks + mushrooms) in oblique top-down style.
 *
 * Rocks: angular polygon silhouettes split into top-face and front-face zones,
 * with crack lines — reads as rock not cylinder.
 *
 * Mushrooms: stem top is placed inside the cap dome so there is no gap.
 *
 * Sprites are pure greyscale so the Canvas-2D multiply colorisation in
 * GameScene._colorisePropTexture() maps them to any palette at runtime.
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

function svg(w, h, content) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${content}\n</svg>`;
}

// ── Greyscale palette ──────────────────────────────────────────────────────────
const C = {
    shadow:    '#0c0c0c',
    darkest:   '#1c1c1c',
    dark:      '#363636',
    midDark:   '#4e4e4e',
    mid:       '#686868',
    midLight:  '#868686',
    light:     '#a4a4a4',
    lighter:   '#c2c2c2',
    highlight: '#dedede',
    specular:  '#f2f2f2',
};

// pts array → SVG polygon points string
function pts(arr) { return arr.map(([x, y]) => `${f(x)},${f(y)}`).join(' '); }
// pts array → SVG path d string (M...L...Z)
function pathD(arr) {
    return `M${arr.map(([x, y]) => `${f(x)},${f(y)}`).join(' L')} Z`;
}

// ─── Rock ─────────────────────────────────────────────────────────────────────
// Each rock is defined by:
//   topPoly   – polygon vertices of the TOP FACE (lit from above, lighter)
//   frontPoly – polygon vertices of the FRONT FACE (south wall, darker)
//               topPoly and frontPoly share the "ridge" edge between them.
//   cracks    – array of [[x0,y0],[x1,y1]] crack line segments on top face
//   w, h      – canvas size
//
// Draw order:
//   1. ground shadow
//   2. front face base
//   3. front face shading bands
//   4. dark crease where top meets front (brow shadow line)
//   5. top face base
//   6. top face highlight polygon
//   7. crack lines
//   8. outer stroke
function makeRock({ w, h, topPoly, frontPoly, cracks = [], ridgeLeft, ridgeRight }) {
    const cx = w / 2;

    // Convex hull of all vertices for the outer stroke
    const allPoly = [...topPoly, ...frontPoly];

    // Shadow ellipse under the whole rock
    const shadowRx = w * 0.38;
    const shadowRy = h * 0.08;
    const shadowCy = h * 0.95;

    // Compute a highlight sub-polygon: upper-left 60% of topPoly for specular
    // (simple approach: scale topPoly inward toward its centroid, offset NW)
    const topCx = topPoly.reduce((s, p) => s + p[0], 0) / topPoly.length;
    const topCy = topPoly.reduce((s, p) => s + p[1], 0) / topPoly.length;
    const hlPoly = topPoly.map(([x, y]) => [
        lerp(topCx - 3, x, 0.55),
        lerp(topCy - 2, y, 0.55),
    ]);
    const specPoly = topPoly.map(([x, y]) => [
        lerp(topCx - 4, x, 0.28),
        lerp(topCy - 2.5, y, 0.28),
    ]);

    // Ridge midpoints for brow shadow
    const ridgeCx = (ridgeLeft[0] + ridgeRight[0]) / 2;
    const ridgeCy = (ridgeLeft[1] + ridgeRight[1]) / 2;
    const ridgeLen = Math.hypot(ridgeRight[0]-ridgeLeft[0], ridgeRight[1]-ridgeLeft[1]);

    const lines = [
        // 1. Ground shadow
        `  <ellipse cx="${f(cx)}" cy="${f(shadowCy)}" rx="${f(shadowRx)}" ry="${f(shadowRy)}" fill="${C.shadow}" opacity="0.35"/>`,

        // 2. Front face
        `  <polygon points="${pts(frontPoly)}" fill="${C.midDark}"/>`,

        // 3a. Upper lighter band on front face (top 40%)
        (() => {
            const ridge = [ridgeLeft, ridgeRight];
            const bottom = frontPoly.filter(p => p[1] > ridgeCy + 2);
            const midY = lerp(ridgeCy, Math.max(...bottom.map(p=>p[1])), 0.40);
            // slice band: ridge edge + bottom clipped at midY
            // use a simple rect-like quad
            const bandPts = [
                ridgeLeft,
                ridgeRight,
                [ridgeRight[0] + (ridgeRight[0]-cx)*0.04, midY],
                [ridgeLeft[0]  + (ridgeLeft[0] -cx)*0.04, midY],
            ];
            return `  <polygon points="${pts(bandPts)}" fill="${C.mid}" opacity="0.50"/>`;
        })(),

        // 3b. Lower dark band on front face (bottom 35%)
        (() => {
            const botY = Math.max(...frontPoly.map(p=>p[1]));
            const midY = lerp(ridgeCy, botY, 0.62);
            // rightmost and leftmost points at roughly midY level on the front face
            const rp = frontPoly.reduce((best, p) => p[0] > best[0] ? p : best);
            const lp = frontPoly.reduce((best, p) => p[0] < best[0] ? p : best);
            const bandPts = [
                [lerp(cx, lp[0], 0.80), midY],
                [lerp(cx, rp[0], 0.80), midY],
                rp,
                lp,
            ];
            return `  <polygon points="${pts(bandPts)}" fill="${C.darkest}" opacity="0.38"/>`;
        })(),

        // 4. Brow shadow (dark ellipse straddling ridge, selling depth)
        `  <ellipse cx="${f(ridgeCx)}" cy="${f(ridgeCy + 1.2)}" rx="${f(ridgeLen*0.52)}" ry="${f(ridgeLen*0.10)}" fill="${C.darkest}" opacity="0.42"/>`,

        // 5. Top face base
        `  <polygon points="${pts(topPoly)}" fill="${C.midLight}"/>`,

        // 6a. Broad highlight (covers ~55% of top face, offset NW)
        `  <polygon points="${pts(hlPoly)}" fill="${C.lighter}" opacity="0.45"/>`,

        // 6b. Specular spot (tight, upper-left)
        `  <polygon points="${pts(specPoly)}" fill="${C.specular}" opacity="0.33"/>`,

        // 7. Crack lines
        ...cracks.map(([a, b]) =>
            `  <line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${C.darkest}" stroke-width="0.9" opacity="0.55"/>`
        ),

        // 8. Outer edge strokes: one per face so no cross-face diagonals appear
        `  <polygon points="${pts(topPoly)}"   fill="none" stroke="${C.darkest}" stroke-width="0.9" stroke-linejoin="round" opacity="0.38"/>`,
        `  <polygon points="${pts(frontPoly)}" fill="none" stroke="${C.darkest}" stroke-width="0.9" stroke-linejoin="round" opacity="0.32"/>`,
    ];

    return lines.join('\n');
}

// ─── Mushroom ─────────────────────────────────────────────────────────────────
// Key fix: stemTopRatio is placed INSIDE the cap dome (below capCy, above
// capCy+capRy) so the cap ellipse covers the stem top — no visible gap.
function makeMushroom(w, h, cfg = {}) {
    const cx      = w / 2;
    const stemW   = w  * (cfg.stemWRatio    ?? 0.20);
    // stemTop must be < capCy + capRy (cap bottom) to overlap cap
    const capCy   = h  * (cfg.capCyRatio    ?? 0.36);
    const capRx   = w  * (cfg.capRxRatio    ?? 0.44);
    const capRy   = h  * (cfg.capRyRatio    ?? 0.26);
    const capBot  = capCy + capRy;
    // Place stem top INSIDE the cap: capBot - small margin
    const stemTop = h  * (cfg.stemTopRatio  ?? (capBot / h - 0.05));
    const stemBot = h  * 0.91;

    const spots = cfg.spots ?? [
        { ox: -0.24, oy: -0.10, r: 0.11 },
        { ox:  0.22, oy: -0.16, r: 0.08 },
        { ox:  0.05, oy:  0.08, r: 0.06 },
    ];

    return [
        // 1. Ground shadow
        `  <ellipse cx="${f(cx)}" cy="${f(h*0.95)}" rx="${f(w*0.40)}" ry="${f(h*0.055)}" fill="${C.shadow}" opacity="0.30"/>`,

        // 2. Stem front face (rounded rect)
        `  <rect x="${f(cx - stemW)}" y="${f(stemTop)}" width="${f(stemW*2)}" height="${f(stemBot - stemTop)}" rx="${f(stemW*0.40)}" fill="${C.light}"/>`,

        // 3a. Stem left highlight
        `  <rect x="${f(cx - stemW)}" y="${f(stemTop)}" width="${f(stemW*0.60)}" height="${f(stemBot - stemTop)}" rx="${f(stemW*0.40)}" fill="${C.specular}" opacity="0.28"/>`,

        // 3b. Stem right shadow
        `  <rect x="${f(cx + stemW*0.38)}" y="${f(stemTop)}" width="${f(stemW*0.62)}" height="${f(stemBot - stemTop)}" rx="${f(stemW*0.40)}" fill="${C.dark}" opacity="0.35"/>`,

        // 3c. Stem bottom darkens at ground
        `  <rect x="${f(cx - stemW)}" y="${f(lerp(stemTop, stemBot, 0.72))}" width="${f(stemW*2)}" height="${f((stemBot-stemTop)*0.28)}" rx="${f(stemW*0.40)}" fill="${C.dark}" opacity="0.28"/>`,

        // 4. Cap undershade: dark ellipse below cap center — overhanging rim
        `  <ellipse cx="${f(cx)}" cy="${f(capCy + capRy*0.55)}" rx="${f(capRx*0.90)}" ry="${f(capRy*0.48)}" fill="${C.darkest}" opacity="0.48"/>`,

        // 5. Cap dome
        `  <ellipse cx="${f(cx)}" cy="${f(capCy)}" rx="${f(capRx)}" ry="${f(capRy)}" fill="${C.mid}"/>`,

        // 6a. Cap broad highlight
        `  <ellipse cx="${f(cx - capRx*0.18)}" cy="${f(capCy - capRy*0.20)}" rx="${f(capRx*0.62)}" ry="${f(capRy*0.58)}" fill="${C.lighter}" opacity="0.50"/>`,

        // 6b. Specular spot
        `  <ellipse cx="${f(cx - capRx*0.28)}" cy="${f(capCy - capRy*0.30)}" rx="${f(capRx*0.22)}" ry="${f(capRy*0.20)}" fill="${C.specular}" opacity="0.42"/>`,

        // 7. Spots
        ...spots.flatMap(s => {
            const sx  = cx + capRx * s.ox;
            const sy  = capCy + capRy * s.oy;
            const srx = capRx * s.r;
            const sry = capRy * s.r * 0.82;
            return [
                `  <ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(srx*1.30)}" ry="${f(sry*1.28)}" fill="${C.highlight}" opacity="0.26"/>`,
                `  <ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(srx)}" ry="${f(sry)}" fill="${C.lighter}" opacity="0.58"/>`,
                `  <ellipse cx="${f(sx + srx*0.18)}" cy="${f(sy + sry*0.18)}" rx="${f(srx*0.42)}" ry="${f(sry*0.42)}" fill="${C.mid}" opacity="0.34"/>`,
            ];
        }),

        // 8. Cap rim stroke
        `  <ellipse cx="${f(cx)}" cy="${f(capCy)}" rx="${f(capRx)}" ry="${f(capRy)}" fill="none" stroke="${C.darkest}" stroke-width="1.3" opacity="0.42"/>`,
    ].join('\n');
}

// ─── Rock Variants ────────────────────────────────────────────────────────────
//
// Each rock: topPoly + frontPoly share ridge edge (ridgeLeft → ridgeRight).
// Vertices chosen so the shapes read as angular boulders.

const ROCKS = [
    // rock-0: compact blocky boulder (40×34)
    {
        w: 40, h: 34,
        topPoly:   [[7,13],[14,7],[22,6],[30,8],[36,13],[32,18],[20,20],[8,18]],
        frontPoly: [[8,18],[32,18],[34,22],[30,27],[20,29],[9,27],[6,22]],
        ridgeLeft:  [8, 18],
        ridgeRight: [32, 18],
        cracks: [
            [[16, 10], [23, 16]],
            [[24, 8],  [28, 14]],
        ],
    },
    // rock-1: wide flat slab (60×38)
    {
        w: 60, h: 38,
        topPoly:   [[6,14],[16,8],[30,6],[44,8],[54,14],[50,19],[30,22],[10,19]],
        frontPoly: [[10,19],[50,19],[52,24],[46,30],[30,33],[14,30],[8,24]],
        ridgeLeft:  [10, 19],
        ridgeRight: [50, 19],
        cracks: [
            [[18, 10], [28, 17]],
            [[36, 9],  [44, 15]],
            [[26, 14], [32, 20]],
        ],
    },
    // rock-2: tall chunky multi-faceted boulder (46×56)
    {
        w: 46, h: 56,
        topPoly:   [[8,18],[16,10],[24,8],[33,11],[40,18],[37,25],[23,28],[10,25]],
        frontPoly: [[10,25],[37,25],[39,33],[36,42],[28,48],[18,48],[10,42],[7,33]],
        ridgeLeft:  [10, 25],
        ridgeRight: [37, 25],
        cracks: [
            [[18, 12], [25, 22]],
            [[28, 11], [34, 20]],
            [[16, 30], [22, 42]],
        ],
    },
];

const MUSHROOMS = [
    // mushroom-0: compact single stalk (32×52)
    // capCy=0.36*52=18.7, capRy=0.26*52=13.5 → capBot=32.2 → stemTop < 32.2
    {
        w: 32, h: 52,
        cfg: {
            stemWRatio:   0.20,
            stemTopRatio: 0.58,   // y=30.2, inside cap (capBot≈32.2)
            capCyRatio:   0.36,
            capRxRatio:   0.44,
            capRyRatio:   0.26,
            spots: [
                { ox: -0.26, oy: -0.08, r: 0.11 },
                { ox:  0.22, oy: -0.16, r: 0.08 },
                { ox:  0.06, oy:  0.10, r: 0.06 },
            ],
        },
    },
    // mushroom-1: larger domed cap (48×68)
    // capCy=0.34*68=23.1, capRy=0.28*68=19.0 → capBot=42.1 → stemTop < 42.1
    {
        w: 48, h: 68,
        cfg: {
            stemWRatio:   0.17,
            stemTopRatio: 0.58,   // y=39.4, inside cap (capBot≈42.1)
            capCyRatio:   0.34,
            capRxRatio:   0.46,
            capRyRatio:   0.28,
            spots: [
                { ox: -0.30, oy: -0.10, r: 0.10 },
                { ox:  0.26, oy: -0.18, r: 0.09 },
                { ox:  0.10, oy:  0.06, r: 0.07 },
                { ox: -0.12, oy:  0.15, r: 0.05 },
            ],
        },
    },
];

// ─── Write files ──────────────────────────────────────────────────────────────
for (let i = 0; i < ROCKS.length; i++) {
    const r    = ROCKS[i];
    const name = `rock-${i}.svg`;
    writeFileSync(join(outDir, name), svg(r.w, r.h, makeRock(r)), 'utf8');
    console.log(`✓ ${name}  (${r.w}×${r.h})`);
}

for (let i = 0; i < MUSHROOMS.length; i++) {
    const { w, h, cfg } = MUSHROOMS[i];
    const name = `mushroom-${i}.svg`;
    writeFileSync(join(outDir, name), svg(w, h, makeMushroom(w, h, cfg)), 'utf8');
    console.log(`✓ ${name}  (${w}×${h})`);
}

console.log(`\nSprites written to ${outDir}`);
