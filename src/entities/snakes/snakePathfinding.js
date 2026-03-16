/**
 * Shared A* path-following helpers for all snake types.
 *
 * Usage in a snake's constructor:
 *   initPath(this);
 *
 * Usage in a snake's update(), replacing a direct Phaser.Math.Angle.Between call:
 *   const toTarget = tickSnakePath(this, delta, targetX, targetY);
 *   // then apply jitter on top as usual
 *
 * The path is recomputed once per second from scene.navGrid.
 * Between recomputes the snake advances along stored waypoints.
 * If no navGrid exists (wrong world / not yet built) it falls back
 * to a direct bearing.
 */

import { findPath } from '../../systems/PathfindingSystem.js';

const REFRESH_MS   = 1000;   // ms between A* recomputes
const REACH_DIST   = 20;     // px — distance to pop a waypoint as "reached"

/** Call once in a snake constructor to initialise path state. */
export function initPath(snake) {
    snake._pathTimer = REFRESH_MS;   // triggers an immediate compute on first tick
    snake._path      = null;
}

/**
 * Update the path and return the bearing angle toward the next waypoint.
 *
 * @param {object} snake   The snake entity (needs .x, .y, .scene)
 * @param {number} delta   Frame delta in ms
 * @param {number} tx      Target world X
 * @param {number} ty      Target world Y
 * @returns {number}       Angle in radians
 */
export function tickSnakePath(snake, delta, tx, ty) {
    snake._pathTimer += delta;

    // Recompute A* once per second (or on first call when _path is null)
    if (snake._pathTimer >= REFRESH_MS || snake._path === null) {
        snake._pathTimer = 0;
        const navGrid = snake.scene.navGrid;
        snake._path = navGrid ? findPath(navGrid, snake.x, snake.y, tx, ty) : [];
    }

    const path = snake._path;

    // Advance past any waypoints the snake has already reached
    while (path.length > 0 &&
           Math.hypot(path[0].x - snake.x, path[0].y - snake.y) < REACH_DIST) {
        path.shift();
    }

    // Return bearing toward next waypoint, or fall back to direct bearing
    if (path.length > 0) {
        return Phaser.Math.Angle.Between(snake.x, snake.y, path[0].x, path[0].y);
    }
    return Phaser.Math.Angle.Between(snake.x, snake.y, tx, ty);
}
