/**
 * A* pathfinding on a coarse 40 px grid.
 * Grid covers 1280×720 → 32 columns × 18 rows = 576 cells.
 *
 * buildNavGrid(scene)              — build blocked-cell set from current obstacles
 * findPath(grid, fx,fy, tx,ty)     — return array of {x,y} world-space waypoints
 *
 * The grid is built once per wave by SnakeWorldScene and stored on the scene as
 * `this.navGrid`.  Snakes read it once per second to recompute their path.
 */

export const CELL = 40;
const COLS = 32;   // Math.ceil(1280 / 40)
const ROWS = 18;   // Math.ceil(720  / 40)

function ck(col, row) { return row * COLS + col; }

function toCell(wx, wy) {
    return {
        col: Math.max(0, Math.min(COLS - 1, Math.floor(wx / CELL))),
        row: Math.max(0, Math.min(ROWS - 1, Math.floor(wy / CELL))),
    };
}

function center(col, row) {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

/**
 * Mark every grid cell whose centre is within (radius + CELL/2) of (wx,wy)
 * as blocked.  The half-cell inflation catches cells that only partially
 * overlap the obstacle circle.
 */
function markObstacle(blocked, wx, wy, radius) {
    const r  = radius + CELL * 0.5;
    const c0 = Math.max(0,        Math.floor((wx - r) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((wx + r) / CELL));
    const r0 = Math.max(0,        Math.floor((wy - r) / CELL));
    const r1 = Math.min(ROWS - 1, Math.floor((wy + r) / CELL));
    for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
            const cx = col * CELL + CELL / 2;
            const cy = row * CELL + CELL / 2;
            if (Math.hypot(cx - wx, cy - wy) <= r) blocked.add(ck(col, row));
        }
    }
}

/**
 * Build the nav grid from the current scene state.
 * Called once per wave after all static obstacles are placed.
 *
 * Obstacles: central station, all active terminals, all non-scorched bushes.
 * Bushes use a smaller effective radius (30 px) so the cells adjacent to a
 * bush are still reachable — snakes can path close enough to trigger entry.
 */
export function buildNavGrid(scene) {
    const blocked = new Set();

    // Central station
    if (scene.station) {
        markObstacle(blocked, scene.station.x, scene.station.y,
            (scene.station.radius ?? 48));
    }

    // Terminals
    for (const t of (scene.terminals ?? [])) {
        if (t?.active) markObstacle(blocked, t.x, t.y, 26);
    }

    // Bushes (smaller radius so snakes can reach the entry zone)
    for (const b of (scene.bushes ?? [])) {
        if (b?.active && !b._scorched) markObstacle(blocked, b.x, b.y, 30);
    }

    return { blocked };
}

// ── A* ────────────────────────────────────────────────────────────────────────

// 8-directional neighbours: [dCol, dRow, cost]
const DIRS = [
    [ 0, -1, 1],    [ 0,  1, 1],    [-1,  0, 1],    [ 1,  0, 1],
    [-1, -1, 1.414], [ 1, -1, 1.414], [-1,  1, 1.414], [ 1,  1, 1.414],
];

function octile(c0, r0, c1, r1) {
    const dx = Math.abs(c0 - c1);
    const dy = Math.abs(r0 - r1);
    return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
}

/** Snap a blocked cell to the nearest free neighbour within maxR cells. */
function snapFree(blocked, col, row, maxR = 3) {
    if (!blocked.has(ck(col, row))) return { col, row };
    let best = null, bestD = Infinity;
    for (let dr = -maxR; dr <= maxR; dr++) {
        for (let dc = -maxR; dc <= maxR; dc++) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
            if (!blocked.has(ck(nc, nr))) {
                const d = Math.hypot(dc, dr);
                if (d < bestD) { bestD = d; best = { col: nc, row: nr }; }
            }
        }
    }
    return best;
}

/**
 * A* from world position (fx,fy) to (tx,ty).
 * Returns an array of {x,y} cell-centre waypoints, NOT including the start
 * cell but including the goal cell.
 * Returns [] if already in the goal cell or no path exists.
 */
export function findPath(navGrid, fx, fy, tx, ty) {
    const { blocked } = navGrid;

    let sc = toCell(fx, fy);
    let gc = toCell(tx, ty);
    sc = snapFree(blocked, sc.col, sc.row) ?? sc;
    gc = snapFree(blocked, gc.col, gc.row) ?? gc;
    if (!sc || !gc) return [];
    if (sc.col === gc.col && sc.row === gc.row) return [];

    const gScore   = new Map([[ck(sc.col, sc.row), 0]]);
    const cameFrom = new Map();   // cell-key → {col, row}
    const open     = [{ col: sc.col, row: sc.row, f: octile(sc.col, sc.row, gc.col, gc.row) }];
    const closed   = new Set();

    while (open.length > 0) {
        // Pop node with lowest f (linear scan — 576 cells, trivially fast)
        let bi = 0;
        for (let i = 1; i < open.length; i++) {
            if (open[i].f < open[bi].f) bi = i;
        }
        const cur    = open.splice(bi, 1)[0];
        const curKey = ck(cur.col, cur.row);

        if (cur.col === gc.col && cur.row === gc.row) {
            // Reconstruct path from goal back to (but not including) the start
            const path = [];
            let node   = cur;
            while (cameFrom.has(ck(node.col, node.row))) {
                path.unshift(center(node.col, node.row));
                node = cameFrom.get(ck(node.col, node.row));
            }
            return path;
        }

        closed.add(curKey);

        for (const [dc, dr, cost] of DIRS) {
            const nc = cur.col + dc;
            const nr = cur.row + dr;
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
            const nk = ck(nc, nr);
            if (blocked.has(nk) || closed.has(nk)) continue;

            const ng = (gScore.get(curKey) ?? Infinity) + cost;
            if (ng < (gScore.get(nk) ?? Infinity)) {
                gScore.set(nk, ng);
                cameFrom.set(nk, { col: cur.col, row: cur.row });
                open.push({ col: nc, row: nr, f: ng + octile(nc, nr, gc.col, gc.row) });
            }
        }
    }

    return [];   // no path found
}
