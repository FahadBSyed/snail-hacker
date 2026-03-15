#!/usr/bin/env node
/**
 * Generates World 2 bush prop sprites.
 *
 * Bushes are arena cover objects — snakes can hide inside them.
 * Two variants:
 *   bush.svg         — lush green, provides cover
 *   bush-scorched.svg — grey/charred after BURNER terminal; no longer provides cover
 *
 * Output: assets/sprites/props/bush.svg, bush-scorched.svg
 * Run: node scripts/generate-bush-sprite.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'sprites', 'props');
mkdirSync(outDir, { recursive: true });

const W = 72, H = 60;

function svg(inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${inner}\n</svg>`;
}

// ── Lush bush ─────────────────────────────────────────────────────────────────
function bushLush() {
    const DARK    = '#1a4a1a';  // deep shadow green
    const MID     = '#2a6a2a';  // main body
    const LIGHT   = '#3a8a3a';  // mid highlights
    const BRIGHT  = '#50aa50';  // top highlights
    const GLINT   = '#80cc70';  // leaf shine
    const STEM    = '#5a3a18';  // woody stem at base

    return svg(`
  <!-- Ground shadow -->
  <ellipse cx="37" cy="56" rx="28" ry="5" fill="#000000" opacity="0.18"/>

  <!-- Stem -->
  <rect x="30" y="50" width="12" height="9" rx="3" fill="${STEM}"/>
  <rect x="33" y="48" width="6"  height="5" rx="2" fill="${STEM}" opacity="0.8"/>

  <!-- Outer foliage mass (dark base layer) -->
  <circle cx="36" cy="38" r="22" fill="${DARK}"/>
  <circle cx="20" cy="40" r="16" fill="${DARK}"/>
  <circle cx="52" cy="40" r="16" fill="${DARK}"/>

  <!-- Mid foliage layer -->
  <circle cx="36" cy="34" r="19" fill="${MID}"/>
  <circle cx="22" cy="37" r="14" fill="${MID}"/>
  <circle cx="50" cy="37" r="14" fill="${MID}"/>
  <circle cx="36" cy="45" r="12" fill="${MID}"/>

  <!-- Upper foliage (lighter, catching light) -->
  <circle cx="36" cy="28" r="15" fill="${LIGHT}"/>
  <circle cx="24" cy="31" r="11" fill="${LIGHT}"/>
  <circle cx="48" cy="31" r="11" fill="${LIGHT}"/>

  <!-- Top highlights -->
  <circle cx="36" cy="22" r="10" fill="${BRIGHT}"/>
  <circle cx="27" cy="26" r="7"  fill="${BRIGHT}"/>
  <circle cx="45" cy="26" r="7"  fill="${BRIGHT}"/>

  <!-- Leaf shine glints -->
  <ellipse cx="29" cy="18" rx="5" ry="3" fill="${GLINT}" opacity="0.8" transform="rotate(-25,29,18)"/>
  <ellipse cx="43" cy="17" rx="5" ry="3" fill="${GLINT}" opacity="0.7" transform="rotate(20,43,17)"/>
  <ellipse cx="20" cy="28" rx="4" ry="2.5" fill="${GLINT}" opacity="0.6" transform="rotate(-15,20,28)"/>
  <ellipse cx="53" cy="28" rx="4" ry="2.5" fill="${GLINT}" opacity="0.6" transform="rotate(15,53,28)"/>
  <ellipse cx="36" cy="14" rx="4" ry="2.5" fill="${GLINT}" opacity="0.65"/>

  <!-- Leaf edge details (small dark outlines to suggest individual leaves) -->
  <circle cx="17" cy="34" r="4" fill="${MID}" opacity="0.5"/>
  <circle cx="56" cy="34" r="4" fill="${MID}" opacity="0.5"/>
  <circle cx="14" cy="42" r="3" fill="${DARK}" opacity="0.6"/>
  <circle cx="58" cy="42" r="3" fill="${DARK}" opacity="0.6"/>
`);
}

// ── Scorched bush ─────────────────────────────────────────────────────────────
function bushScorched() {
    const ASH     = '#2a2a2a';  // charred main mass
    const CHAR    = '#1a1a1a';  // deep char
    const GREY    = '#4a4a4a';  // lighter ash
    const EMBER   = '#ff4400';  // hot ember glow
    const EMBER2  = '#ffaa00';  // warm ember
    const STEM    = '#2a1a0a';  // charred stem

    return svg(`
  <!-- Ground shadow (faint smoke stain) -->
  <ellipse cx="37" cy="56" rx="30" ry="6" fill="#000000" opacity="0.25"/>
  <!-- Smoke haze at base -->
  <ellipse cx="37" cy="50" rx="22" ry="4" fill="#555555" opacity="0.12"/>

  <!-- Charred stem -->
  <rect x="30" y="50" width="12" height="9" rx="3" fill="${STEM}"/>

  <!-- Outer charred mass -->
  <circle cx="36" cy="38" r="22" fill="${CHAR}"/>
  <circle cx="20" cy="40" r="16" fill="${CHAR}"/>
  <circle cx="52" cy="40" r="16" fill="${CHAR}"/>

  <!-- Mid ash layer -->
  <circle cx="36" cy="34" r="19" fill="${ASH}"/>
  <circle cx="22" cy="37" r="14" fill="${ASH}"/>
  <circle cx="50" cy="37" r="14" fill="${ASH}"/>

  <!-- Upper ash (slightly lighter — surface ash, not deep char) -->
  <circle cx="36" cy="28" r="14" fill="${GREY}"/>
  <circle cx="26" cy="31" r="10" fill="${GREY}"/>
  <circle cx="46" cy="31" r="10" fill="${GREY}"/>

  <!-- Crumbled silhouette details -->
  <circle cx="18" cy="35" r="5"  fill="${CHAR}" opacity="0.8"/>
  <circle cx="54" cy="35" r="5"  fill="${CHAR}" opacity="0.8"/>
  <circle cx="14" cy="43" r="4"  fill="${CHAR}" opacity="0.7"/>
  <circle cx="58" cy="43" r="4"  fill="${CHAR}" opacity="0.7"/>
  <circle cx="36" cy="16" r="6"  fill="${GREY}" opacity="0.5"/>

  <!-- Hot embers scattered across the surface -->
  <circle cx="28" cy="22" r="2"   fill="${EMBER}"  opacity="0.9"/>
  <circle cx="28" cy="22" r="4"   fill="${EMBER}"  opacity="0.3"/>
  <circle cx="44" cy="26" r="1.8" fill="${EMBER2}" opacity="0.9"/>
  <circle cx="44" cy="26" r="3.5" fill="${EMBER2}" opacity="0.25"/>
  <circle cx="20" cy="32" r="1.5" fill="${EMBER}"  opacity="0.8"/>
  <circle cx="52" cy="30" r="1.6" fill="${EMBER2}" opacity="0.8"/>
  <circle cx="36" cy="20" r="2.2" fill="${EMBER}"  opacity="0.85"/>
  <circle cx="36" cy="20" r="5"   fill="${EMBER}"  opacity="0.2"/>
  <circle cx="24" cy="40" r="1.3" fill="${EMBER2}" opacity="0.7"/>
  <circle cx="50" cy="38" r="1.4" fill="${EMBER}"  opacity="0.7"/>
  <circle cx="38" cy="34" r="1.2" fill="${EMBER2}" opacity="0.75"/>

  <!-- Ambient ember glow (faint orange halo over whole bush) -->
  <circle cx="36" cy="32" r="22" fill="${EMBER}" opacity="0.04"/>
`);
}

writeFileSync(join(outDir, 'bush.svg'),          bushLush(),     'utf-8');
writeFileSync(join(outDir, 'bush-scorched.svg'), bushScorched(), 'utf-8');
console.log('✔  bush.svg');
console.log('✔  bush-scorched.svg');
console.log('\nDone — 2 bush SVGs generated.');
