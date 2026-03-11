/**
 * Runtime palette data for prop tinting (rocks, mushrooms).
 * Mirrors the 20 biome palettes in scripts/generate-planet-backgrounds.js.
 * Index matches the background key: bg-{i}.svg ↔ PROP_PALETTES[i]
 *
 * rock  — tint for rock props    (hex string → parseInt(hex.slice(1), 16))
 * flora — tint for mushroom props
 */
export const PROP_PALETTES = [
    { rock: '#4a2010', flora: '#5a2e10' }, // 00 Rust Crags
    { rock: '#2c3c4e', flora: '#203048' }, // 01 Ice Sheet
    { rock: '#383810', flora: '#484818' }, // 02 Sulfur Flats
    { rock: '#14202c', flora: '#101c24' }, // 03 Basalt Plains
    { rock: '#2a1828', flora: '#3c2040' }, // 04 Fungal Floor
    { rock: '#242038', flora: '#302848' }, // 05 Crystal Wastes
    { rock: '#282830', flora: '#222228' }, // 06 Ash Waste
    { rock: '#3a2410', flora: '#4a3018' }, // 07 Desert Ochre
    { rock: '#102018', flora: '#182e20' }, // 08 Bog Mud
    { rock: '#2e3240', flora: '#282c38' }, // 09 Chalk Flat
    { rock: '#242414', flora: '#2e3018' }, // 10 Bronze Moss
    { rock: '#30202e', flora: '#3a2438' }, // 11 Brine Flat
    { rock: '#202a36', flora: '#1a2430' }, // 12 Slate Shore
    { rock: '#281e10', flora: '#302818' }, // 13 Dry Scrub
    { rock: '#2e1010', flora: '#381414' }, // 14 Blood Soil
    { rock: '#1e2e40', flora: '#182840' }, // 15 Glacial Ice
    { rock: '#382014', flora: '#442818' }, // 16 Clay Desert
    { rock: '#0e1a0e', flora: '#142014' }, // 17 Jungle Floor
    { rock: '#1c2430', flora: '#181e2c' }, // 18 Storm Plateau
    { rock: '#1a1228', flora: '#1e1430' }, // 19 Void Dust
];
