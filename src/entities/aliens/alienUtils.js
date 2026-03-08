// 8 direction names ordered to match sector indices 0–7.
// Sector 0 is centred on 0 rad (right); each sector is π/4 wide, going CW.
export const DIRS = [
    'right', 'diag-right-down', 'down', 'diag-left-down',
    'left',  'diag-left-up',    'up',   'diag-right-up',
];

/**
 * Map a Phaser movement angle (radians, 0=right, CW in screen-space)
 * to one of the 8 direction texture-key suffixes.
 */
export function angleToDir(rad) {
    const a = ((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return DIRS[Math.round(a / (Math.PI / 4)) % 8];
}
