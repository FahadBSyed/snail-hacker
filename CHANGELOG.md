# SNAIL HACKER — Changelog

## Session 10k — 2026-03-11

### Upgrade Card Entrance and Selection Animations

Upgrade cards in the intermission scene now animate in and respond visually to selection.

- **Entrance**: Each card slides down from above the screen while expanding from a small scale to full size (`Back.easeOut`). Cards animate in left-to-right with a 140 ms stagger so they arrive sequentially rather than all at once.
- **Selection**: Selecting a card triggers a rapid alpha flash (5 pulses) combined with a full 360° spin. Non-selected cards fade to 25% opacity.
- **Implementation**: Refactored `_showUpgradeCards` in `src/scenes/IntermissionScene.js` to wrap each card's graphics + text objects in a `Phaser.GameObjects.Container`. All drawing coords are now container-local (origin at card center). Interactivity uses `container.setSize` + `container.setInteractive()` instead of a separate zone object.

### EMP Mines Bypass Boss Shield (with 30% Damage Reduction)

EMP mine explosions now penetrate the boss's energy shield, consistent with how they already bypass ShieldAlien shields. Because the EMP is not intended as the primary damage source against the boss, damage is reduced to 70% of `CONFIG.EMP.MINE_DAMAGE` when hitting the boss. Phase-shift accumulation is still tracked correctly so EMP hits can still contribute to triggering phase shifts.

- **`src/entities/aliens/BossAlien.js`** — added `takeDamageRaw(amount)` override. Skips the shield check (raw bypass), applies `amount * 0.7`, updates `_damageAccum`, and triggers `_phaseShift()` at the normal threshold. Still respects `_dying` guard.
- **`src/scenes/GameScene.js`** — fixed mine proximity trigger and `_empExplode` blast loop to also check `this.boss`. The boss was never in `this.aliens`, so mines never detonated near it and it was never caught in the blast damage loop. Also fixed `_empExplode` boss branch to update the boss health bar and check for boss death — the return value of `takeDamageRaw` was previously discarded, so a killing blow had no effect.

### Aliens Always Render Above Other Sprites

- **`src/entities/aliens/BaseAlien.js`** — added `setDepth(45)` in the constructor. All alien types (basic, fast, tank, bomber, shield, boss) now render at depth 45, above y-sorted terrain (0–7.2), decoy (39–41), frog escape (40), battery (42), and EMP mines (44). They stay below death-burst effects (53+), the escape ship (50), HUD (100), and cursor (1000).

### Snail Collision vs World Obstacles

The snail now collides with the hacking station, terminals, rocks, and mushrooms using circle-vs-circle resolution. Collision is skipped while P2's grab hand is carrying the snail (state `'GRABBED'`). On drop, the snail is automatically pushed out on the next frame(s) if it landed inside an obstacle.

- **`src/config.js`** — new `PROPS` block: `SNAIL_RADIUS` (18 px), `TERMINAL_RADIUS` (26 px), `ROCK_RADIUS` (16 px), `MUSH_RADIUS` (13 px).
- **`src/scenes/GameScene.js`**:
  - `_spawnProps`: each `Phaser.GameObjects.Image` now gets `img._colRadius` tagged at creation time (`MUSH_RADIUS` for mushroom keys starting with `'cm'`, `ROCK_RADIUS` otherwise).
  - `_resolveSnailCollisions()` — new method; builds an obstacle list (station + active terminals + active props), then runs up to 4 push-out passes per frame so the snail is always ejected even when wedged between two objects. Re-clamps to screen bounds after any push.
  - `update()` — calls `_resolveSnailCollisions()` immediately after `snail.update()`, before the slime trail, so the corrected position feeds all downstream systems.

### Y-Sort Depth Layer for Props, Terminals, Station, and Snail

All world-space objects (rocks, mushrooms, terminals, hacking station, snail) now share the same Y-sorted depth layer. Objects lower on screen (higher Y) render in front of objects higher on screen, giving correct overlap when the snail walks behind or in front of props.

- **`src/scenes/GameScene.js`**:
  - Props (rocks/mushrooms) created with `setDepth(y / 100)` instead of a fixed `-0.5`. Since props are static, depth is set once at spawn.
  - In `update()`, after terminal proximity checks: snail, station, and all terminals call `setDepth(entity.y / 100)` each frame. The `/ 100` normalization keeps all Y-sorted objects in roughly the `0–7.2` depth range, safely below existing effect layers (projectile trails at 29–31, hit flashes at 58, slow field at 50–71, drone at 60, teleport at 80–90, HUD at 100+).



### Fix Escape Frogs Never Spawning

`spawnFrogEscape()` guarded with `if (!this.active) return` — but `Phaser.Scene` has no `.active` property (only `Phaser.GameObjects.GameObject` does), so the value was always `undefined` (falsy), making the guard always fire and exit before any frog was created. Fixed by replacing the check with `if (!this.sys.isActive()) return`, which is the correct Phaser API for querying a scene's running state.

- **`src/scenes/GameScene.js`** — `spawnFrogEscape`: `!this.active` → `!this.sys.isActive()`.

### Escape Frogs — Decorative Post-Kill Frog Spawning

After every alien explosion fully fades (~680 ms after death), a small frog appears at the kill site and hops off-screen. Frogs cannot be shot, do not interact with anything, and are silently ignored by all game systems.

- **`src/entities/FrogEscape.js`** (new) — `Phaser.GameObjects.Container`; not in `scene.aliens` so the projectile/collision loop ignores it entirely.
  - Picks the cardinal direction toward the nearest screen edge.
  - Fades in over 280 ms, then idles ~1.4 s with a gentle scale-breathe tween.
  - Hops at 190 px/s, cycling the 4-frame hop animation at ~9 fps.
  - Self-destructs 80 px past the screen edge.
- **`src/systems/CollisionSystem.js`** — `spawnDeathBurst` gains an optional `onComplete` callback (5th param). Fires when the main pulse tween completes (480 ms). Both existing call sites in CollisionSystem now pass `() => scene.spawnFrogEscape?.(x, y)`.
- **`src/scenes/GameScene.js`**:
  - Preloads 20 frog SVGs from `assets/sprites/frog/` in `preload()`.
  - `this.frogEscapes = []` in `create()`; capped at 5 concurrent by `spawnFrogEscape()`.
  - `spawnFrogEscape(x, y)` method added near `spawnAlien`.
  - Frog update + array pruning added to `update()`.
  - All 5 `spawnDeathBurst` call sites in GameScene pass the frog spawn callback.

### On-Foot Frog Sprites + Hop Animation Frames

- **`scripts/generate-frog-sprites.js`** (new) — Generates 20 SVGs of the alien frog passenger on foot, without the flying saucer. Uses the same rotation trick as the saucer scripts: geometry is defined once in local coords (+x forward), and a `translate(24,24) rotate(deg)` transform produces all four cardinal directions.
  - **4 neutral idle sprites**: `assets/sprites/frog/frog-{right,left,up,down}.svg` — relaxed standing pose, four legs visible.
  - **16 hop frames** (4 dirs × 4 frames): `assets/sprites/frog/frog-hop-{dir}-f{00-03}.svg`
    - **f00** land/squash — wide body, legs splayed outward on impact
    - **f01** crouch — all legs pulled in, body compact, storing energy
    - **f02** leap — body elongated in travel direction, back legs sweeping back, front legs tucked
    - **f03** glide — back legs fully trailing, front legs reaching forward to land
  - Draw order: back legs → torso (belly highlight ellipse) → head/eyes/face → front legs.
  - Colours match the saucer frog passenger exactly (`#3cb83c` body, `#dde840` eyes, `#1d6b1d` outlines).

### Blob Drop Shadows on Gerald and Aliens

- **Approach**: a `Graphics` ellipse added as the first child of each entity Container (rendered before the sprite, therefore always behind it). Costs one `fillEllipse` per entity per frame — negligible on `Phaser.CANVAS`.
- **`src/entities/aliens/BaseAlien._initSprite()`** — shadow ellipse `(2, 10, 44×14 px)`, alpha 0.35 — applies automatically to BasicAlien, FastAlien, TankAlien, BomberAlien, ShieldAlien.
- **`src/entities/aliens/BossAlien` constructor** — shadow ellipse `(3, 14, 62×20 px)`, alpha 0.35 — proportionally larger for the 96×96 boss sprite.
- **`src/entities/Snail` constructor** — shadow ellipse `(2, 12, 46×16 px)`, alpha 0.30 — slightly softer than alien shadows.

### Victory Fanfare Sound Effect

- **`src/systems/SoundSynth.js` — `_victory()`** — New procedural sound played on the Victory screen. Three-part structure:
  - **Ascending arpeggio** (0.00 s): 8 notes over two octaves of C major (C4–E6), staggered 90 ms apart, each with a sine fundamental and triangle octave shimmer.
  - **Chord swell** (0.72 s): four-voice sustained pad (C4 G4 C5 E5) with a slow 550 ms attack then fade over 1.8 s.
  - **Bell shimmer** (1.60 s): three high sine partials (C7 E7 G7) with long 1.8 s decay, giving a glittering tail.
- **`src/scenes/VictoryScene.js`** — Calls `soundSynth.play('victory')` at the top of `create()`.

### Asset Reorganisation: station + terminal SVGs

- Moved `assets/station-*.svg` → `assets/sprites/station/` (2 files).
- Moved `assets/terminal-*.svg` → `assets/sprites/terminal/` (5 files).
- Updated load paths in `src/scenes/GameScene.js`.
- Updated `scripts/generate-station-sprites.js` to write to `stationDir` / `terminalDir` based on filename prefix.

## Session 10j — 2026-03-11

### Prop Sprite Redesign: Angular Rocks + Connected Mushrooms

- **`scripts/generate-prop-sprites.js`** — Full redesign of both prop types:
  - **Rocks**: replaced smooth-ellipse top + trapezoid front (which read as a cylinder) with angular polygon silhouettes. Each rock variant is now defined by an explicit `topPoly` (8-vertex angular top face) and `frontPoly` (7-vertex angular front face) sharing a ridge edge. Added crack lines (1–3 thin dark lines across the top face) and two separate face-outline strokes — no cross-face diagonals. Three variants: compact boulder (40×34), wide flat slab (60×38), tall multi-faceted boulder (46×56).
  - **Mushrooms**: fixed the cap/stem disconnect. `stemTopRatio` was set below `capCy + capRy` (the cap bottom), leaving a visible gap. Now `stemTopRatio` is set so the stem top is inside the cap dome (30% before cap bottom), and the cap dome/undershade elements are drawn after the stem, hiding the stem top and creating a clean visual join. Also increased `capRyRatio` from 0.22→0.26/0.28 for rounder caps. Sizes adjusted: mushroom-1 height 70→68.
- **`GameScene.js` preload sizes** — Updated `PROP_SIZES` to match new SVG canvas dimensions: rock-1 `60×40→60×38`, rock-2 `48×58→46×56`, mushroom-1 `48×70→48×68`.

### Prop Colorisation: Canvas 2D Multiply (replaces setTint)

- **Root cause**: `Phaser.CANVAS` renderer ignores `Image.setTint()` entirely — it's a WebGL pipeline feature.
- **`GameScene._colorisePropTexture(sourceKey, rgb, newKey)`** (new) — Creates a colourised copy of a greyscale prop texture using Canvas 2D: (1) draw greyscale source, (2) overlay solid tint rect with `globalCompositeOperation='multiply'` to colourize pixels (also fills transparent bg with tint), (3) re-draw source with `'destination-in'` to restore original alpha mask. Works in both Canvas and WebGL renderers.
- **`GameScene._spawnProps()`** — Replaced `setTint(brightenedRGB)` on each image with: compute per-variant colorised texture keys (e.g. `cr-prop-rock-0-bg7`), call `_colorisePropTexture` once per unique source×bgIdx combination, then use the colorised key for `this.add.image()`. Colorised textures are cached in Phaser's texture manager for the session lifetime.

## Session 10i — 2026-03-11

### Prop Spawning: Rocks + Mushrooms in GameScene

- **`src/data/propPalettes.js`** (new) — Runtime palette table (20 entries matching the 20 background biomes). Each entry has `rock` and `flora` hex colors used to tint props via Phaser's `setTint()`.
- **`GameScene.preload()`** — Loads the 5 prop SVGs (`prop-rock-{0,1,2}`, `prop-mushroom-{0,1}`) once into the texture cache on first visit.
- **`GameScene._spawnProps(wave)`** (new) — Destroys all existing prop images and respawns them for the given wave:
  - Derives `bgIdx = ((wave-1)*7) % 20` to select the matching palette.
  - Uses a mulberry32 PRNG seeded by wave number for deterministic-but-varied layouts.
  - Spawns 10–15 rocks and 5–8 mushrooms using rejection sampling: props stay ≥60 px from screen edges and ≥240 px from the station center (640,360), with ≥38 px spacing between props.
  - Props are placed at depth −0.5, above the background (−1) and below all game entities (0+).
- **`GameScene.create()`** — Initialises `this._propImages = []` and calls `_spawnProps(startWave)` immediately after the background image.
- **`GameScene onWaveStart`** — Calls `_spawnProps(wave)` at the top of each new wave so the layout refreshes with the new background palette.

### Prop Sprites: Greyscale Rocks + Mushrooms (Oblique Top-Down)

- **`scripts/generate-prop-sprites.js`** (new) — Generates 5 greyscale prop SVGs in Pokemon Gen 2/3 oblique top-down style: only the top face (ellipse) and south-facing front face (trapezoid) are visible — no left/right sides. Three rock variants and two mushroom variants.
- **Rock structure** (back-to-front draw order): ground drop-shadow → front face trapezoid with upper-light and lower-dark shading bands → brow-shadow dark crescent (creates visual depth at the top/front junction) → top face ellipse → broad highlight + specular spot.
- **Mushroom structure**: ground shadow → stem front face (rounded rect with left-highlight / right-shadow) → stem top ellipse → cap undershade ellipse (dark rim below cap) → cap dome ellipse → broad highlight + specular → wart spots (halo + light centre + dark core triple-layer) → cap rim edge stroke.
- **Pure greyscale** (#0c0c0c–#f2f2f2). Apply `gameObject.setTint(0xRRGGBB)` in Phaser to map any palette colour across the full luminance range at runtime — no shader needed.
- **`assets/sprites/props/rock-{0,1,2}.svg`** — 40×34, 60×40, 48×58 (compact round, wide flat slab, tall boulder).
- **`assets/sprites/props/mushroom-{0,1}.svg`** — 32×52, 48×70 (single stalk, large dome).

## Session 10h — 2026-03-11

### Background Rework: Ground Texture Only

- **`scripts/generate-planet-backgrounds.js`** — Removed all terrain detail generators (`topRock`, `topPebbles`, `topCrater`, `topPool`, `topRosette`, `topCrystal`, `topLichen`, `makeCrack`). Backgrounds now consist solely of: base fill, large overlapping ground-colour-variation blobs (`makeGroundTexture`), and dense multi-scale noise dots (`makeNoise`).
- **`makeNoise`** replaces the old fine stipple. Uses three size classes (fine dust 0.5–1.7 px, medium grit 1.5–4 px, coarse fleck 3–7 px) at low opacities, biased toward palette-derived lighter/darker/alt tints. 600–900 dots per background give a subtle rocky/dirty surface feel without any recognisable objects.
- All 20 palette biomes preserved unchanged.
- **`assets/backgrounds/bg-{00..19}.svg`** — Regenerated.

## Session 10g — 2026-03-10

### Boss Attacks: EMP + Terminal Lock EMP Projectiles

- **`src/entities/BossProjectile.js`** — Extended to support three types (`blackhole`, `emp`, `terminallock`). Constructor now takes `(scene, x, y, type, opts)` where `opts.targetX/Y` is the fixed homing target, and `opts.targetTerminal` is the Terminal reference for terminal lock. Per-type draw methods: yellow rings for EMP, red/orange for terminal lock. Per-type speed from config.
- **`src/config.js`** — Added `EMP_HP: 20`, `EMP_SPEED: 100`, `TERMINAL_LOCK_HP: 20`, `TERMINAL_LOCK_SPEED: 100`, `TERMINAL_LOCK_DURATION: 15000`, `ATTACK_COOLDOWNS.EMP: 12000`, `ATTACK_COOLDOWNS.TERMINAL_LOCK: 15000`.
- **`src/entities/Terminal.js`** — `startCooldown()` stores the handle in `this._cooldownHandle` and cancels any previous one before starting. New `forceLock(duration)`: forces COOLING_DOWN, shows red "LOCKED!" overlay + pulsing screen glow, auto-unlocks after duration.
- **`src/entities/aliens/BossAlien.js`** — Added `_empTimer`, `_terminalLockTimer`, `onEMP`, `onTerminalLockEMP`; both fire on their cooldowns (enrage-scaled).
- **`src/scenes/GameScene.js`** — `onEMP` spawns an EMP toward the station; `onTerminalLockEMP` picks a random IDLE non-RELOAD/non-REPAIR terminal and fires a terminal lock EMP toward it (no-op if no eligible targets). Contact: EMP on station → `_triggerPowerLoss()`; terminal lock on terminal → `term.forceLock()`.

## Session 10f — 2026-03-10

### Boss Attack: Black Hole Projectile

- **`src/entities/BossProjectile.js`** (new) — Slow-homing dark projectile. Draws a near-black core with concentric pulsing purple/violet rings. Homes toward Gerald at `CONFIG.BOSS.BLACK_HOLE_SPEED` (80 px/s). Absorbs `CONFIG.BOSS.BLACK_HOLE_HP` (30) projectile hits before dying.
- **`src/config.js`** — `BLACK_HOLE_HP: 30`, `BLACK_HOLE_SPEED: 80`, `BLACK_HOLE_RADIUS: 14`, `ATTACK_COOLDOWNS.BLACK_HOLE: 8000`.
- **`src/entities/aliens/BossAlien.js`** — Added `_blackHoleTimer` and `onBlackHole` callback; fires every `BLACK_HOLE` cooldown (scales with enrage multiplier).
- **`src/scenes/GameScene.js`**:
  - `this.bossProjectiles = []` maintained alongside `this.boss`; cleared on boss death.
  - `onBlackHole` callback pushes a `BossProjectile` from the boss's current position.
  - Update loop: homing movement, P2 shots destroy it (purple hit flash + death burst), snail contact calls `_warpSnail()`.
  - `_warpSnail()` — cancels active hack, teleports Gerald 260–380 px from station at a random angle (clamped to play area), plays collapse/expand warp-ring visuals, plays teleport sound.
  - `_spawnWarpRings(x, y, collapse)` — three staggered purple ring tweens.

## Session 10e — 2026-03-10

### FroggerMinigame: half-width sideways steps

- **`src/minigames/FroggerMinigame.js`** — `COLS` doubled (7 → 14), `CELL_W` halved (26 → 13); `GRID_W` stays 182 px (14×13). Each A/D hop now moves the frog half the previous distance. Collision hitbox inset updated proportionally (9 → 3 px each side) to keep the 7 px hitbox aligned with the drawn 5 px-radius circle.

## Session 10d — 2026-03-10

### Boss tuning: minimum orbit distance + burst frequency

- **`src/config.js`** — Three new/changed BOSS values:
  - `MIN_ORBIT_DIST: 260` (new) — boss is never closer than 260 px to the station center (doubles the previous effective minimum of ~130 px from the ellipse short axis)
  - `MAX_ORBIT_Y: 490` (new) — explicit y-ceiling that keeps the boss above the FroggerMinigame panel; previously this was an implicit side-effect of ORBIT_RADIUS_Y
  - `ATTACK_COOLDOWNS.ALIEN_BURST: 5000` (was 7000) — burst fires every 5 s instead of 7 s (~40% more frequent)
- **`src/entities/aliens/BossAlien.js`** — Orbit code now enforces both constraints after computing the ellipse position:
  - If within `MIN_ORBIT_DIST` of station, boss is pushed outward along the radial direction
  - `ny` clamped to ≤ `MAX_ORBIT_Y` so boss never enters the Frogger panel
  - Same constraints applied to `_reenter()` tween target so boss doesn't land close-in after a phase shift

## Session 10c — 2026-03-10

### Boss Fight — Damage Detection Fix

- **`src/entities/aliens/BossAlien.js`** — Collision radius increased 36→48 px to match the actual 96×96 sprite (visual radius = 48 px). Shots at the sprite edges were missing because the hitbox was smaller than the graphic. Added `console.log` inside `takeDamage` to report when damage is blocked vs applied.
- **`src/scenes/GameScene.js`**:
  - **Removed wobble tween** (`targets: this.boss, x: boss.x + 6`) from the boss hit path. That tween fought directly with the orbit code which overwrites `boss.x` every frame, causing Phaser's tween system to hold stale start/end values and corrupt the position. Replaced with a 80ms sprite alpha flash (sets `boss.sprite.alpha` to 0.2 then back to 1) which doesn't conflict with the Container's x/y.
  - Fixed `return true` → `return false` for inactive projectiles in the boss collision filter so stale destroyed projectiles are cleaned up correctly.
  - Added `console.log('[boss] hit!')` and `console.log('[boss] shield dropped')` to confirm the collision and shield-drop paths are being reached (aids debugging; can be removed after confirmation).

## Session 10b — 2026-03-10

### Boss Fight — Bug Fixes

- **`src/entities/aliens/BossAlien.js`** — `takeDamage` no longer blocks damage when `_phaseShifting`. The boss was immune during the entire 550ms exit tween (still visible on screen), making it appear undamageable after the shield drops. Now only `shielded` and `_dying` gate damage; the boss takes hits even while flying away.
- **`src/config.js`** — `BOSS.ORBIT_RADIUS` split into `ORBIT_RADIUS_X: 280` (horizontal) and `ORBIT_RADIUS_Y: 110` (vertical). The circular orbit with r=350 placed the boss at y≤710, deep inside the FroggerMinigame panel (centered at y=600, top at y=504). The ellipse keeps the boss within y=250–470, well above the panel. `PHASE_SHIFT_HP` raised 50→100 (boss now needs 10 hits before phase-shifting, giving players a fair damage window). `ALIEN_BURST_COUNT: 3` added (spawn count read from config). `ATTACK_COOLDOWNS.ALIEN_BURST` reduced 10 000→7 000ms so the burst fires noticeably during a fight.
- **`src/entities/aliens/BossAlien.js`** — Orbit calculation uses `ORBIT_RADIUS_X` / `ORBIT_RADIUS_Y` for both the live orbit and `_reenter()` target position.
- **`src/scenes/GameScene.js`** — `_spawnBoss()` uses the new ellipse axes for the spawn position. Burst callback reads `CONFIG.BOSS.ALIEN_BURST_COUNT` (3) instead of a hard-coded 2.

## Session 10 — 2026-03-10

### Boss Fight — The Overlord (Wave 10)

- **`src/entities/aliens/BossAlien.js`** — New boss entity. Does not extend BaseAlien (has fully custom movement and damage logic):
  - 200 HP; collision radius 36px; uses `alien-boss-{dir}` sprites loaded at 96×96
  - **Orbit movement**: base angle drifts at `ORBIT_SPEED × 0.35` rad/s; a `±45°` sinusoidal oscillation is layered on top for a wave-pattern path around the station at `ORBIT_RADIUS` (350px)
  - **Enrage at ≤100 HP**: orbit speed ×1.5, alien-burst cooldown ×0.7
  - **Shield mechanic**: spawns with a crimson/gold rotating two-arc energy ring (`_drawShield`); all projectile hits are blocked while `shielded` is true — `flashShield()` fires a brief burst ring and plays `shieldReflect`. `dropShield()` / `raiseShield()` called externally by GameScene
  - **Phase shift**: after accumulating every `PHASE_SHIFT_HP` (50) damage, boss flies off-screen (550ms `Power2.easeIn`), pauses 1.5s, then re-enters from a random new edge and tweens back to orbit (800ms). Phase shift re-raises the shield if it was dropped
  - **Alien burst attack**: fires every `ATTACK_COOLDOWNS.ALIEN_BURST` (10 000ms), calls `onAlienBurst(x, y)` callback; GameScene spawns 2 FastAliens at boss position
  - `takeDamage(amount)` returns false while shielded, phase-shifting, or dying; accumulates damage for phase-shift threshold

- **`src/systems/WaveManager.js`** — Wave 10 config changed to `types: []`; `update()` now returns early when `cfg.types.length === 0` (boss wave — all alien spawning suppressed; boss manages its own attacks)

- **`src/scenes/GameScene.js`**:
  - Imports `BossAlien`
  - Loads `alien-boss-{dir}` sprites at 96×96 in `preload()` (one per 8 directions, in the existing dir loop)
  - `this.boss = null` initialised in `create()`
  - `_wordsForWave(10)` now returns `CONFIG.BOSS.SHIELD_DROP_WORDS` (was `FROGGER_CROSSINGS`; both default to 3)
  - `onWaveStart` drop-in callback calls `_spawnBoss()` on wave 10
  - `_spawnBoss()`: places boss at right side of orbit radius, wires `onAlienBurst` → `spawnAlien('fast', x, y) × 2`, calls `hud.showBossBar()`
  - `_startHack()` wave-10 branch: `onSuccess` now drops boss shield + schedules `raiseShield()` after `SHIELD_DOWN_DURATION` (5000ms); resets `hackProgress` to 0 and bar to "SHIELD: 0/3" so the player can break it again. Does **not** call `_completeWave()` (wave ends only when boss dies)
  - Hack label in `onCrossing` changed to `'SHIELD'` so HUD reads "SHIELD: 1/3" etc.
  - Boss update + projectile collision block added in `update()` before `checkProjectileCollisions` — boss is intentionally **not** in `this.aliens`, so CollisionSystem does not handle it. Hit: red flash arc, wobble tween, `takeDamage`, `hud.updateBossBar`. Kill: `_bossDeath()`
  - `_bossDeath()`: sets `_dying`; heavy screen shake (600ms, 0.02 intensity); three staggered expanding rings; 8-flash rapid alpha pulse; 900ms later: two `spawnDeathBurst` calls (crimson + orange), `cameras.main.flash` (orange), boss destroyed, HUD bar hidden, +50 score, `_completeWave()`
  - `spawnAlien(type, spawnX?, spawnY?)`: accepts optional position for boss alien-burst spawns (falls back to `_randomEdgePosition()` when omitted)

- **`src/scenes/HUD.js`**:
  - `updateHack(progress, threshold, label = 'HACK')`: optional third arg overrides the "HACK" prefix (used by wave 10 to show "SHIELD")
  - `showBossBar(hp, maxHp)`: creates a 400px wide boss HP bar at top-center (y=50) with "THE OVERLORD" label above it. Red fill, current/max numeric label inside
  - `updateBossBar(hp)`: updates fill width + HP text; briefly flashes fill white (120ms) on each hit
  - `hideBossBar()`: destroys all boss-bar Phaser objects

- **`src/config.js`** — Added `BOSS` section to `DEFAULTS`:
  ```
  HP: 200, PHASE_SHIFT_HP: 50, ORBIT_RADIUS: 350, ORBIT_SPEED: 0.4,
  ENRAGE_HP: 100, ENRAGE_ORBIT_MULT: 1.5, ENRAGE_COOLDOWN_MULT: 0.7,
  SHIELD_DROP_WORDS: 3, SHIELD_DOWN_DURATION: 5000,
  ATTACK_COOLDOWNS: { ALIEN_BURST: 10000 }
  ```

## Session 9 — 2026-03-10

### FroggerMinigame wired to Wave 10

- **`src/scenes/GameScene.js`** — `_startHack()` now branches on `this.wave === 10` to launch `FroggerMinigame` instead of `HackMinigame`/`MathMinigame`. Callbacks map `onCrossing` → HUD + station progress, `onSuccess` → `_completeWave()`, `onFailure` → reset hack state (player can re-approach and retry). `FroggerMinigame` is imported at the top.
- **`src/scenes/GameScene.js`** — `_wordsForWave(10)` now returns `CONFIG.MINIGAMES.FROGGER_CROSSINGS` so the HUD hack-progress bar tracks crossings (0-3) rather than a word count.
- **`src/minigames/FroggerMinigame.js`** — Added optional `onCrossing(count)` callback, fired after each successful crossing so the caller can update external progress displays.
- To test wave 10: in DEV_MODE, open the config editor from the menu and set `DEV_START_WAVE` to `10`.

### FroggerMinigame

- **`src/minigames/FroggerMinigame.js`** — New minigame for the boss fight shield-break mechanic. Full Frogger-style game rendered inside a 456×398 panel centred on the screen:
  - 9×7 grid; row 0 = goal (green), row 6 = start (blue), rows 1–5 = traffic lanes
  - 5 traffic lanes with escalating speed/density toward the goal: lane 5 is 55 px/s, lane 1 is 200 px/s; direction alternates per lane; 2 cars per lane
  - Cars rendered with body, windscreen highlight, headlights (leading end), tail-lights (trailing end), per-lane colour
  - Frog avatar: green circle with yellow eyes + dark pupils always facing upward (toward goal); turns red on death
  - WASD hop movement (one cell per press, clamped at edges); 300 ms grace delay on start
  - Hit detection: 6 px inset hitbox on frog, 2 px inset on cars; checked every tick AND immediately after each hop
  - Getting hit → 600 ms red "✗ HIT!" flash, reset to centre of start row
  - Reaching goal row → score increments, 600 ms green "✓ SAFE!" flash, reset; `onSuccess` fires when score reaches `FROGGER_CROSSINGS`
  - Timer bar counts down; `onFailure` fires on expiry
  - Controls flash overlay for 1.8 s at start: semi-opaque grid cover, large ▲ arrow, "W A S D — HOP / REACH THE OTHER SIDE" label, then fades
  - Score displayed as `○ ○ ○` → `● ● ●` dot-fill in the header
  - Implements `cancel()` contract (called by TeleportSystem)
- **`src/config.js`** — Added `MINIGAMES.FROGGER_TIME_LIMIT` (45 000 ms) and `MINIGAMES.FROGGER_CROSSINGS` (3)
- **`src/systems/SoundSynth.js`** — Added `_frogHop()`: quiet 520→420 Hz sine blip (gain 0.14, 70 ms) played on each successful hop

### Boss Fight Design + Sprites

- **Boss fight design locked** — Added Step 33 to `PLAN.md` documenting the full Overlord boss fight: 200 HP phase-shifting boss, crimson dreadnought saucer, Frogger minigame replaces HackMinigame for shield-break mechanic, four attack types (Black Hole teleport, EMP power loss, Terminal Lock EMP, Fast Alien burst), enrage at 50% HP, multi-stage death sequence, boss HP bar HUD addition.
- **`scripts/generate-boss-sprite.js`** — New generator for 8 directional boss sprites (`assets/alien-boss-{dir}.svg`). Produces a 96×96 (2×) unique saucer design distinct from all regular alien palette swaps:
  - Crimson dreadnought disc with 4 depth layers (vs 3 on regular aliens)
  - 3 weapon pods at 0°/120°/240° on the disc face (dark socket + glowing emitter)
  - 12 rim lights alternating crimson/gold at 30° spacing (vs 6 at 60°)
  - Dome radius 20px, triple engine glow
  - Enhanced boss frog: red pupils, angry V-brows, arm stubs visible gripping controls, 3-spike gold crown with coloured jewels, snarl mouth instead of smile
  - Crown band sits at frog body's top edge; spike tips poke just above the dome glass at all 8 orientations
- **`assets/sprites/PALETTE_SWAPS.md`** — Added boss entry documenting all colours and the unique geometry differences.

## Session 1 — 2026-02-28

### Completed Steps
- **Step 1: Project Bootstrap** — Created `index.html` with Phaser 3 CDN, `src/main.js` with Phaser.Game config (1280×720 canvas, arcade physics, FIT scaling), registered all 5 scenes.
- **Step 2: MenuScene** — Title screen with "SNAIL HACKER" heading, two-column control summary (P1 keyboard, P2 mouse), interactive START button that transitions to GameScene.
- **Step 8: GameOverScene** — Displays wave reached and score, PLAY AGAIN button returns to menu.
- **VictoryScene (Step 21)** — Stub with score display and restart button.
- **IntermissionScene (Step 20)** — Stub with placeholder text.
- **Step 3: Snail Entity** — Created `Snail.js` extending `Phaser.GameObjects.Container`. WASD movement at 40px/s with diagonal normalization, screen-bounds clamping. State machine (IDLE/MOVING/HACKING) with overhead label. `hackingActive` flag gates WASD (prep for minigames). Integrated into GameScene with per-frame update. Directional SVG sprites (right/left/up/down) generated via `scripts/generate-snail-sprites.js`, loaded in preload, swapped based on movement direction (horizontal takes priority over vertical for diagonals).

### Additional Work
- Created full project directory structure (`src/scenes/`, `src/entities/`, `src/systems/`, `src/minigames/`, `src/ui/`, `assets/audio/`)
- GameScene includes: starfield background, placeholder station circle, debug input logger (shows last 5 keyboard/mouse events on screen, right-click context menu disabled)
- Wrote `PLAN.md` with the full implementation plan

- **Step 4: Mouse Shooting** — Created `Projectile.js` (white/yellow circle, 800px/s, self-destroys off-screen). Left-click fires from station center toward cursor, decrementing ammo (10/10 max). Ammo HUD top-right. Empty clicks blocked.
- **Step 5: Basic Alien Spawn** — Created `BasicAlien.js` (red circle with eyes, 60px/s toward center, 10 HP). Spawns every 2s from random edge (top/left/right). Reports `reached_station` within 50px of center.
- **Step 6: Collision Detection** — Circle-to-circle distance checks: projectile vs alien (destroys both, increments score), alien vs station (deals damage). Post-collision cleanup pass.
- **Step 7: Hacking Station** — Created `HackingStation.js`: cyan hexagon at (640,360), health 100, glow/outline shifts cyan→red with damage. Aliens deal 10 damage on arrival. HUD health bar (top-left, green/yellow/red). Game over at health 0 → GameOverScene with wave + score.

## Session 2 — 2026-02-28 (Phase 2: Co-op Mechanics)

### Completed Steps
- **Step 9: RELOAD → Station-based** — Replaced passive typing-based reload with a dedicated RELOAD terminal. Snail walks to the RELOAD terminal at (840,250), hacks it via sequence minigame, ammo refills to max on success. 8s cooldown. Removed `ReloadBuffer` from GameScene, cleaned up reload progress UI from Snail.js, removed ReloadBuffer dependency from TeleportSystem.
- **Step 10: Teleport System** — Created `TeleportSystem.js`: right-click drag shows targeting line + circle, release teleports snail instantly. Warp particle rings (8 circles expanding outward, 0.3s) at origin and destination. Cancels active reload buffer and minigame on teleport. Snail flashes red if teleported mid-action (TENSION_2 resolved). Target clamped to screen bounds.
- **Step 11: Terminal Entity** — Created `Terminal.js`: teal rectangle with screen glow, states IDLE/ACTIVE/COOLING_DOWN. Highlights white + shows [E] prompt when snail is within 50px. E key activates nearest terminal, sets snail to HACKING (suppresses WASD per TENSION_3). Cooldown timer with countdown text. 4 terminals placed around station.
- **Step 12: Sequence Minigame** — Created `SequenceMinigame.js`: displays 4-6 random keys (non-WASD) at bottom-center with 4s countdown bar. Correct key advances pointer (green), wrong key flashes red. Timer bar color-shifts as time runs out. Cancellable by teleport. Wired into all terminals.
- **Step 13: Cannon Defense Station** — Created `DefenseStation.js` (CANNON type): geometric turret at (200,150). Hacking the CANNON terminal triggers sequence minigame; on success, auto-fires at nearest alien once/second for 5s. 20s cooldown with arc fill animation. READY/FIRING/COOLDOWN status display.

- **Score HUD** — Live score display at top-center (replaces placeholder "GAME SCENE" label). Updates on every alien kill.
- **REPAIR Terminal** — TERM-3 converted to REPAIR (green, 12s cooldown). Hacking it restores 25 HP to the station (capped at max).
- **CANNON-R Terminal** — TERM-4 converted to CANNON-R. Activates a second cannon at (1080,150) that only targets aliens in the right half of the screen (x ≥ 640). Original left cannon now explicitly filters to x < 640.
- **Terminal colors** — Terminals now accept a `color` option; CANNON terminals are orange, RELOAD is cyan, REPAIR is green.

- **Step 14: Rhythm Minigame** — Bouncing indicator across a 360px bar with a 90px target zone. 5 beats, 1 miss allowed. Tween-driven indicator (1.1s yoyo). CANNON-L and CANNON-R now use RhythmMinigame. Refactored launcher helpers into shared `launchMinigame()` wrapper.
- **Step 15: Typing Minigame** — Random sci-fi phrase (FIREWALL, OVERRIDE, etc.). Timer = phrase.length × 1.5s. Correct key advances (green), wrong key flashes red. Used for SLOWFIELD terminal.
- **Step 16: Shield Station** — SHIELD terminal (purple, 25s cooldown, SequenceMinigame). Hacking activates a 4s blue shield around the station; alien hits and bomber blasts are ignored while shielded. Pulsing tween on the shield circle.
- **Step 17: SlowField Station** — SLOWFIELD terminal (cyan, 18s cooldown, TypingMinigame). Activates `alienSpeedMultiplier=0.4` for 6s; blue screen tint overlay. All alien types respect the multiplier.
- **Step 18: Wave System** — `WaveManager.js`: 10-wave config escalating spawnInterval (2000→700ms) and alien types. `GameScene.init(data)` accepts `{wave,score,stationHealth}` for intermission carryover. Wave HUD (number + countdown timer). Intermission after waves 3/6/9, Victory after wave 10.
- **Step 19: New Alien Types** — `FastAlien` (purple triangle, 150px/s, sinusoidal zigzag), `TankAlien` (grey square, 40px/s, 40 HP), `BomberAlien` (orange pentagon, 50px/s, pulsing glow, 25 AoE blast on death).
- **Step 20: IntermissionScene** — Wave-keyed flavor text, +20 HP station repair, score display, 5s auto-advance (any key skips), passes state to GameScene on resume.
- **Step 21: VictoryScene** — init() data handling, starfield, score-based rating (Recruit→Legendary).
- **Steps 23+24: HUD + Visual Polish** — Bullet-icon ammo display (10 rects, grey = consumed), LOW AMMO warning (≤2 ammo), projectile trail particles (fading dots every 40ms), alien death bursts (color-matched per type), station glow pulse tween when health < 30%.

### Steps Remaining
- **Step 22:** Audio integration (no assets bundled yet)

---

## Session 3 — 2026-03-07

### Alien Sprites
- **Directional sprites for all enemy types** — Added `scripts/generate-alien-enemy-sprites.js` which produces 8-directional SVG saucers for FastAlien (purple disc), TankAlien (steel-blue disc), and BomberAlien (orange/fire disc). Same geometry and frog passenger as BasicAlien; only the disc/dome/glow palette changes per type.
- Replaced procedural `scene.add.graphics()` drawing in `FastAlien.js`, `TankAlien.js`, and `BomberAlien.js` with sprite-swap logic identical to `BasicAlien`. BomberAlien retains its alpha-pulse tween on the sprite.
- `GameScene.preload()` now loads all four alien sprite sets (32 SVGs total) in a single loop.

### Wave-End Escape Ship Flow
- **EscapeShip entity** — New `src/entities/EscapeShip.js`: large blue/cyan rescue saucer (procedural graphics), hover-bob tween, rim-light pulse, pop-in scale animation, and a `[ BOARD SHIP ]` proximity prompt. `boardRadius` reads from `CONFIG.ESCAPE.BOARD_RADIUS`.
- **Escape phase** — After a hack completes, `_completeWave()` now calls `_startEscapePhase()` instead of immediately ending the wave. Enemies continue spawning. The escape ship appears at a random inset edge position (top/left/right) with a "HACK COMPLETE — REACH THE ESCAPE SHIP!" flash.
- **Boarding animation** — When the snail walks into the escape ship's `boardRadius`, `_boardEscapeShip()` fires: active hack/minigames are cancelled, remaining aliens burst and despawn, spawning stops, snail is moved onto the ship, and both tween off the top of the screen with cyan exhaust particles.
- **Wave Complete splash** — After the ship flies away, `_showWaveCompleteSplash()` shows a dimmed overlay with "WAVE X COMPLETE", score, and a blinking "PRESS ANY KEY TO CONTINUE" prompt. Input is gated behind a 700ms grace window to avoid accidental skips.
- Snail HP and gun ammo are **restored to full** at splash-show time, before the next wave starts.
- Transition from the splash correctly handles intermission waves (→ `IntermissionScene`), last wave (→ `VictoryScene`), and normal waves (→ `waveManager.nextWave()`).

### Wave Start Grace Period
- `WaveManager` now tracks `graceElapsed` and suppresses all spawning for `CONFIG.WAVES.SPAWN_GRACE_MS` (3000ms) at the start of each wave, giving players time to position after the wave-complete flow.

### Config Additions
Three new tunable entries in `DEFAULTS` (and therefore `CONFIG`):
- `WAVES.SPAWN_GRACE_MS: 3000` — no-spawn buffer at wave start
- `ESCAPE.BOARD_RADIUS: 40` — px proximity to trigger boarding
- `ESCAPE.ASCENT_DURATION: 1200` — ms for the ship's off-screen ascent

### Bug Fixes
- **Escape ship ghost on next wave** — `onWaveStart` now calls `escapeShip.destroy()` before nulling the reference; the lingering hover tween was snapping the old ship back into view.
- **Escape ship never spawning (power-loss race condition)** — `onWordComplete` called `_triggerPowerLoss()` which cancelled the active `HackMinigame` *before* `_finish()` could invoke `onSuccess`. On waves where `hackThreshold` is a multiple of `POWER_LOSS_WORDS` (waves 3 and 6 with defaults; wave 1 with small DEV-mode word counts), this blocked the escape phase entirely. Fixed by guarding: power loss only fires when `hackProgress < hackThreshold`.
- **`import` placement in WaveManager.js** — Moved `import { CONFIG }` to the top of the file.

---

## Session 4 — 2026-03-07

### Custom Cursors
- **Game-rendered cursors** — Replaced CSS `cursor:` string approach (unreliable with Phaser's input system) with three `Phaser.GameObjects.Graphics` objects drawn at depth 1000 and repositioned to the pointer every frame. `canvas.style.cursor = 'none'` hides the real cursor permanently.
- **Crosshair** — Cyan (#00ffcc) gap-cross with center ring and dot; shown by default and after releasing a grab.
- **Grab hand** — Cyan open-hand shape; shown when the pointer is within pickup range of the snail or a grounded battery and the grab is ready.
- **Cancel hand** — Same hand dimmed (#334433) with a red prohibition circle overlay; shown when hovering over a grabbable target while the grab is on cooldown.
- Holding the snail or battery hides all cursor graphics (the held object acts as the visual anchor).

### Combat Game-Feel
- **Screen shake on gunfire** — `cameras.main.shake(90, 0.005)` fires on every left-click shot.
- **Red hit flash** — Scene-level `Arc` object drawn at the alien's position on hit, alpha-tweened to 0 over 200ms. Uses a plain Canvas circle rather than `setTintFill` (which is a no-op in `Phaser.CANVAS` renderer).
- **Hit-stop wobble** — A quick ±5px horizontal jerk tween (50ms per leg, yoyo+repeat:1) plays on the alien container on every projectile hit.
- **Delayed death** — Alien destruction is deferred 200ms after a killing hit so the flash and wobble are visible before the burst spawns. A `_dying` flag is set immediately to prevent the alien from moving or triggering contact damage during that window.
- **Refactored `takeDamage`** — Removed `this.destroy()` from all four alien classes; `GameScene.checkCollisions()` now owns destruction timing for all types.

### Bullet & Death Visual Effects
- **Layered bullet glow trail** — Three overlapping circles emitted every 25ms: outer soft halo (r=9, amber, α=0.10), mid glow (r=5, yellow, α=0.25, shrinks), bright white core (r=2, α=0.80). Simulates a light-emitting projectile without post-processing.
- **Alien death light pulse** — Two expanding scale-tweened circles added to `spawnDeathBurst`: large warm-red pulse (r=6 → ×9, 480ms) and bright orange inner flash (r=4 → ×5, 260ms), fired before the debris dots.

### Wave Complete Screen
- **Opaque overlay** — Background alpha raised from 0.72 to 1 so the game level is fully hidden while the splash is active.

### Bug Fixes
- **Double wave increment on splash dismiss** — `keyboard.once` and `input.once` are on separate Phaser emitters; pressing a key then clicking (or vice versa) called `advance()` twice and ran `nextWave()` twice. Fixed with an `advanced` guard flag and explicit `.off()` calls to remove the sibling listener at the start of `advance()`.

## Session 5 — 2026-03-07 / 2026-03-08

### Audio Polish
- **Gunfire pitch variation** — `SoundSynth._shoot()` now multiplies both the start (220 Hz) and end (50 Hz) frequencies by a random factor in [0.9, 1.1] on every call, giving each shot a slightly different pitch and preventing the firing sound from feeling monotonous during sustained fire.

### Intermission After Every Wave
- `_showWaveCompleteSplash()` now routes directly to `IntermissionScene` after every non-final wave instead of only after waves 3/6/9. Added flavor quotes for waves 1, 2, 4, 5, 7, and 8. The old in-game splash overlay was removed; `IntermissionScene` is the single path for all inter-wave flow.

### Upgrade System (Step 26)
- **Card selection at intermissions** — Every intermission up to 4 upgrades are offered (CANNON, SHIELD, SLOWFIELD, REPAIR) as clickable cards. Selecting a card removes it from the pool permanently. Player presses 1/2/3 or clicks to choose.
- **Persistent terminals** — Selected upgrades are carried in scene data (`upgrades[]`) and spawned as terminals around the station at `CONFIG.UPGRADES.ORBIT_RADIUS` at the start of each subsequent wave. RELOAD terminal placement avoids overlapping any upgrade terminal.
- **SHIELD → protects Gerald** — `Snail.shield(duration)` / `unshield()` methods added; shield circle is a child of the Snail container so it follows Gerald. `takeDamage()` returns false while shielded. Rhythm minigame keys changed from the broad key pool to just WASD so timing is the challenge, not key hunting.
- **Bug fix** — Upgrade cards were only offered on wave 6 (`wave % 2 === 0` only matched multiples of 2 that were also ≤9 intermission waves). Fixed to offer cards at every intermission until all 4 are acquired.
- **Upgrade card descriptions live** — `getUpgradeDefs()` reads `CANNON.ACTIVE_DURATION`, `SHIELD_DURATION`, `SLOW_DURATION`, `SLOW_SPEED_MULTIPLIER`, `REPAIR_HEAL` at render time so card text always matches the actual balance values.

### Turret UX Improvements
- Turret type label moved left and status text moved right to eliminate overlap with the Terminal label beneath the DefenseStation.
- Barrel split into a separate Graphics object that rotates independently; 120ms tween toward target before each shot.
- `cannonFire` sound added to `SoundSynth` (low thump + sharp crack).
- `CANNON.ACTIVE_DURATION`, `SHIELD_DURATION`, and `SLOW_DURATION` extended from 4–6s to 25s so powers last long enough to matter. `CONFIG_VERSION` bumped to 2 to clear stale localStorage.

### Audio — Upgrade / Shield / Slow Field
- `upgradeSelect` — triumphant 3-note ascending chord on card pick.
- `shieldActivate` — rising electric hum + resonant ping.
- `slowActivate` — deep descending pitch-bend whoosh.
- `slowTick` — quiet muffled tick every second while slow field is active, with a purple screen tint (depth 50, α 0.10) fading in/out with the effect.

### Gerald Invincibility Frames
- `INVINCIBILITY_MS` extended from 1500 → 3000ms to prevent instant death when swarmed without ammo. Flash changed from alternating red/white to white-only pulses. `CONFIG_VERSION` bumped to 3.
- **Bug fixes (i-frame flash)** — `setTint(0xffffff)` is a no-op (multiplies by 1); `setTintFill` doesn't work reliably in Canvas renderer. Final solution: a 48×48 white `scene.add.rectangle` child on the Container, `setAlpha(0)` initially, tweened α 0→0.85 yoyo×6 over the full invincibility window. `fillAlpha=1` + `setAlpha(0)` distinction was required — setting `fillAlpha=0` made the fill transparent and the tween had nothing to show.

### Bug Fix — Slow Field Clock Tick After Expiry
- In Phaser 3.80 a `loop:true` TimerEvent can fire one extra time after `remove(false)` is called. Guarded `slowTick` callback with a `slowFieldActive` boolean so it never plays sound after the field expires.

---

## Session 6 — 2026-03-08

### Damage Animation — Gerald Hit Sprites
- **`scripts/generate-damage-sprites.js`** — New sprite generator producing 64 SVG frames (16 per direction: right/left/up/down). Frames f00–f07 show Gerald withdrawing into his shell (body shrinks, feet retract, eyes/antennae pull in); frames f08–f15 show the shell pulsing with an alternating breathe scale. Left frames are the right frames mirrored via `<g transform="scale(-1,1)">`.
- **feColorMatrix white tint** — Rather than a white rectangle overlay, frames with `FLASH[fi] > 0` are wrapped in an SVG `<filter>` using `feColorMatrix` to linearly interpolate every pixel toward white: `new_channel = src * (1-w) + w`. f00 (w=0.75) is nearly white; f03 (w=0.10) is a faint wash; shell-pulse frames alternate at w=0.45. No covering rectangle — Gerald's actual colours bleach out and recover together.
- **Wired into GameScene** — `GameScene.preload()` loads all 64 frames (`snail-hit-{dir}-f{00..15}`). An `anims.create()` call registers `snail-hit-{dir}` (8 fps, no repeat). `Snail.takeDamage()` plays the animation on the sprite; the existing i-frame white-rectangle overlay was removed since the sprite animation now carries the visual feedback.

---

## Session 8 — 2026-03-09

### HUD Ammo — Counter Instead of Individual Icons
- Replaced the row of individual bullet rectangles with a `current/max` text counter (e.g. `20/30`) plus a small procedural bullet icon (casing + triangular tip) to its right.
- Counter and icon both turn red when ammo is ≤ 2, matching the existing `! LOW AMMO !` warning.
- `hud._ammoMax` is updated in `GameScene` when the AMMO_BOOST passive upgrade applies so the denominator always reflects the current magazine size.

### Tank Alien — 50% Bigger Sprite
- `TankAlien._initSprite()` now calls `this.sprite.setScale(1.5)` after the base sprite is created, making the tank visually 50% larger than other alien types without touching any SVG assets or CONFIG values.

### Station & Terminal Sprites
- **`scripts/generate-station-sprites.js`** — New generator producing 7 SVG assets in oblique top-down style (classic SNES/Pokémon perspective): visible front face, top parallelogram, and right shadow face with light from upper-left.
- **`assets/station-mainframe.svg`** (96×96) — Classic mainframe cabinet with 3D oblique depth, CRT display, LED indicators, tape reels, punch-card slot, and a raised gun-mount platform on top.
- **`assets/station-gun.svg`** (48×48) — Separate rotatable turret gun with oblique barrel, scope, muzzle highlight, and pivot pin centered at (24,24) so it can be rotated independently of the mainframe. Rotates to face the player's crosshair; recoils and emits a muzzle-flash light burst on fire.
- **Five terminal SVGs** (64×64 each) — Each shows a CRT monitor on a squat desk unit, color-coded by function: `terminal-reload` (cyan, ammo counter + reload icon), `terminal-turret` (orange, cannon + crosshair), `terminal-shield` (blue, shield icon + bar), `terminal-slow` (purple, snowflake + clock face), `terminal-repair` (green, health cross + wrench).
- All 7 SVGs loaded in `GameScene.preload()` with conditional texture caching (avoids reloading across waves).

### Passive Upgrade Cards
- Four new passive upgrades added to the upgrade pool alongside the existing active terminals:
  - **HEALTH_BOOST** — Gerald's max HP raised by +50% (`CONFIG.SNAIL.MAX_HEALTH × 1.5`; default 100 → 150).
  - **AMMO_BOOST** — Magazine size raised by +50% (`CONFIG.PLAYER.MAX_AMMO × 1.5`; default 35 → ~52 bullets).
  - **LASER** — Hitscan laser replaces projectiles on left-click; sets `_laserMode = true` in `GameScene`.
  - **SPEED_BOOST** — Gerald's movement speed doubled (`CONFIG.PLAYER.SNAIL_SPEED × 2`; default 40 → 80 px/s).
- Passive card cards display a **"— PASSIVE —"** label beneath the color accent stripe to distinguish them from active terminal upgrades.
- Passive upgrades apply immediately in `GameScene.create()` and do **not** spawn a physical terminal — `_spawnUpgradeTerminals()` skips them entirely.
- All upgrade definitions (active + passive, 9 total) live in `IntermissionScene.getUpgradeDefs()` and read live CONFIG at render time so card text always reflects current balance values.

### All Upgrade Stations → Rhythm Minigame
- SHIELD, SLOWFIELD, and REPAIR terminals now all use `RhythmMinigame` instead of their previous minigames (SequenceMinigame and TypingMinigame respectively).
- Rhythm minigame restricted to **WASD keys only** — timing is the challenge, not key-hunting.
- A shared `rhythmLauncher` helper in `GameScene` constructs the minigame for all three terminals, keeping the wiring DRY.
- One beat required to succeed; one miss allowed (two misses = failure); 2.5s per-beat timeout.

### Math Minigame + Hack-Mode Rotation
- **`src/minigames/MathMinigame.js`** — New minigame implementing the same `wordsRequired / onWordComplete / onSuccess / cancel()` contract as `HackMinigame`. Presents single-digit addition or subtraction (`a + b =` / `a − b =`; subtraction guaranteed non-negative). Player types the numeric answer; auto-submits on correct digit count; backspace supported. Correct answer turns green (180ms before next problem); wrong answer turns red (300ms before reset).
- **Hack-mode rotation** — `GameScene` tracks a `_hackMode` flag (`'typing'` | `'math'`). The active hack class is chosen at start-of-hack: `HackMinigame` for `'typing'`, `MathMinigame` for `'math'`.
- **Rotation tied to battery spawns** — Every time the station loses power (`hackProgress` hits a `CONFIG.BATTERY.POWER_LOSS_WORDS` multiple), `_hackMode` toggles before the battery delivery ship animation plays. Pattern: typing → (battery) → math → (battery) → typing → …
- **Battery delivery animation** — A small ship flies in from off-screen along a random radial direction, hovers briefly, and exits. The `Battery` instance pops in (`scale 0 → 1`, `Back.easeOut`) while the ship hovers, then sits on the ground until the snail walks into it. Snail auto-picks up on contact and must carry it to the station center to restore power.
- New config keys: `BATTERY.POWER_LOSS_WORDS` (15), `BATTERY.SPAWN_RADIUS` (200 px), `BATTERY.SNAIL_PICKUP_DIST` (35 px), `BATTERY.DELIVERY_DIST` (55 px).

### Bug Fix — GameScene preload() Missing Closing Brace
- `GameScene.preload()` was missing its closing `}` after the terminal sprite loading loop. The parser hit the opening `{` of `create()` and threw `SyntaxError: Unexpected token '{'`, preventing the game from loading entirely. Fixed by inserting the missing brace.

---

## Session 7 — 2026-03-08

### Drone — Fly-to-Terminal Animation
- **Container refactor** — The drone was previously a raw `Graphics` object drawn at world coordinates each frame (untweenable). Replaced with a `Phaser.GameObjects.Container` (`_droneContainer`) positioned at the orbit location, with a child `Graphics` (`_droneGfx`) that draws the diamond at container-local (0, 0). Phaser tweens can now animate `_droneContainer.x`/`.y` smoothly.
- **Three-phase activation sequence** — When the drone selects a target terminal it now:
  1. Tweens to the terminal's world position (500 ms, `Sine.easeInOut`)
  2. Flashes white + plays `droneActivate` sound + calls `target.droneActivate()`, holds for 350 ms
  3. Tweens back to the stored orbit position (600 ms, `Sine.easeInOut`)
- **`_droneFlying` guard** — The orbit update in `GameScene.update()` checks `!this._droneFlying` so the container isn't snapped back to orbit coordinates while the flight tweens are in progress. Replaces the old `_droneFlashing` flag.
- **`_renderDroneGfx(flash)`** — Replaces the old `_drawDrone(gfx, x, y)` method. Draws the diamond at (0, 0) in normal (gold, s=7) or flash (white, s=10) style. Called only on state transitions, not every frame.

### Drone — RELOAD Terminal Eligible
- The drone can now autonomously activate the RELOAD terminal in addition to the upgrade terminals (CANNON, SHIELD, SLOWFIELD, REPAIR). The RELOAD terminal was already present in `this.terminals` with no explicit exclusion; a smart skip guard was added — `if (t.label === 'RELOAD' && this.ammo >= this.ammoMax) return false` — mirroring the existing REPAIR skip-at-full-health condition. The drone will not waste an action reloading a full magazine.

---

## Session 9 — 2026-03-09

### Bug Fixes
- **HUD ammo icon `setTint` crash** — `Graphics` objects have no `setTint` method (that belongs to Image/Sprite). `_drawBulletIcon` now accepts an optional `color` parameter and redraws the icon in cyan or red each call; `updateAmmo` passes the appropriate hex colour instead of calling `setTint`.
- **AudioContext autoplay warning** — When `SoundSynth._ctx_get()` creates the `AudioContext`, two persistent `pointerdown` / `keydown` listeners are registered on `window` to call `resume()` on every subsequent user gesture. This covers edge cases where the context is created during scene setup before the browser has fully settled a user gesture.

### ShieldAlien — New Enemy Type
- **`src/entities/aliens/ShieldAlien.js`** — Extends `BaseAlien`. Approaches the snail with a rotating cyan energy ring that blocks all incoming projectiles. Two overlapping arcs (thick `#00eeff` arc + offset `#0088cc` arc) form a "broken hex ring" silhouette; a pulsing white rim tween gives an electric shimmer. When the alien closes within `CONFIG.ALIENS.SHIELD.SHIELD_DROP_DIST` (130 px) of the snail, `_dropShield()` fires: the tween stops, an expanding ring burst tweens outward and fades, and the shield graphics are cleared — leaving the alien vulnerable but already dangerously close.
- **`config.js`** — `ALIENS.SHIELD: { SPEED: 55, RADIUS: 16, HEALTH: 15, SHIELD_DROP_DIST: 130 }`.
- **`CollisionSystem`** — Projectile vs alien now checks `alien.shielded` before the damage path. If shielded, the projectile is destroyed and a small cyan spark arc spawns at the impact point (scales 3×, fades in 220 ms); no damage, score, or death burst. Burst colour `0x00eeff` registered for shield type death.
- **`GameScene`** — Imports `ShieldAlien`; `case 'shield'` added to `spawnAlien` switch; `alien-shield-*` SVG textures loaded in `preload()`.
- **`WaveManager`** — `'shield'` added to the type pools for waves 5–10.

### alien-shield Sprites
- **`scripts/generate-alien-enemy-sprites.js`** — Added `shield` palette: dark-to-bright teal disc (`#082233` → `#1fa8cc`), `#00eeff` dome ring and glow (matching the in-game shield arc colour), cyan rim lights. Count message updated to 32 SVGs.
- **8 new SVG assets** generated: `assets/alien-shield-{right,left,up,down,diag-*}.svg`.

### Palette Swap Documentation
- **`assets/sprites/PALETTE_SWAPS.md`** — New reference file listing all 5 alien palettes (frog/basic = violet, fast = purple, tank = grey/steel, bomber = orange, shield = cyan/ice-blue) with per-element colour tables. The shared saucer geometry is described once at the top.

### Audio File Override System
- `src/soundOverrides.js` — new registry file mapping SoundSynth names to audio file entries. Each entry is a plain path string or a `{ url, volume }` object; multiple entries per name are supported and one is chosen at random on each play.
- `SoundSynth` constructor now accepts an optional `overrides` map. Entries are normalised to `{ url, volume }` internally. Files are fetched and decoded in the background on first `play()` call; the procedural synth plays as fallback until loading completes or permanently if loading fails. Per-file `volume` is multiplied by master volume at playback.
- `GameScene` and `IntermissionScene` both import and pass `SOUND_OVERRIDES` to their `SoundSynth` instance.
- `assets/sounds/` directory created with a `README.md` documenting all overrideable sound names and the `{ url, volume }` entry format.
- SoundSynth now logs `console.warn` for each file that fails to fetch or decode (HTTP status, decode error) and a summary warning when all files for a name fail. Successful loads log at `console.log`. Previously all errors were swallowed silently.

### DEV: Start at Arbitrary Wave with Pre-Game Upgrades
- `CONFIG.DEV_START_WAVE` (default 1, DEV_MODE only) — set to any wave number to jump directly there. Starting at wave N grants N−1 pre-game upgrade picks.
- `MenuScene` — on START, checks `CONFIG.DEV_MODE && CONFIG.DEV_START_WAVE > 1`; if so, routes to `IntermissionScene` in startup mode instead of directly to `GameScene`.
- `IntermissionScene` now accepts `_startupMode: true` and `_targetWave: N` in scene data. In startup mode it shows a "STARTING AT WAVE N — PRE-GAME SETUP" header with a pick counter (e.g. "UPGRADE 2 of 3") and progress dots. After each pick it loops back to itself until all N−1 upgrades are chosen, then starts `GameScene` at wave N with full health.
- `DEV_START_WAVE` also appears automatically in the in-browser balance config editor (it is a top-level numeric value).

### ShieldAlien — Shield Hit Feedback + Wider Drop Distance
- `ShieldAlien.flashShield()` — bright cyan/white flash ring expands + fades at the shield radius (250ms); rim tween kicked to full brightness for the duration.
- `SoundSynth._shieldReflect()` — metallic ping (two sine harmonics 1800→900 Hz, 3200→1600 Hz) + brief highpass noise zip, like a bullet bouncing off.
- `CollisionSystem.checkProjectileCollisions` — shield deflect block now calls `alien.flashShield()` and `scene.soundSynth.play('shieldReflect')`.
- `GameScene` cannon hit loop — added `alien.shielded` guard; shielded aliens trigger flash + sound and skip the red hit flash/wobble entirely.
- `CONFIG.ALIENS.SHIELD.SHIELD_DROP_DIST` increased 130 → 200.

### ShieldAlien — True Damage Immunity + 1-Shot Health
- `ShieldAlien.takeDamage()` override returns `false` immediately while `this.shielded` is true, blocking all damage sources (projectiles, bomber splash, cannon auto-fire) — not just the projectile deflection already handled in `CollisionSystem`.
- `CONFIG.ALIENS.SHIELD.HEALTH` reduced 15 → 10 so it dies in one shot once the shield drops (matches `PROJECTILE_HIT_ALIEN: 10`).

### Loading Screen
- `src/scenes/GameScene.js` — loading UI drawn at the start of `preload()` using Phaser's loader events. Shows "SNAIL HACKER / BOOTING SYSTEMS", a cyan progress bar with terminal corner-bracket decoration, a percentage counter, and a scrolling file-key status line. Hooks into `this.load.on('progress')`, `'fileprogress'`, and `'complete'`. Naturally replaced by `create()` once all assets are ready.

### Mucus Trail Particle Effect
- `src/systems/SlimeTrail.js` — new system; every 90 ms while Gerald is `MOVING`, spawns a procedural Graphics decal behind his foot. Each decal is a rotated ellipse (10–14 × 4–6 px, `0xA8C400`) plus a smaller satellite circle (`0x90B000`) offset backward, with random slight rotation and alpha (0.45–0.60). Placed at depth −0.5 so it renders above the background but beneath all entities. A Phaser `Quad.easeIn` tween fades the decal to zero over 3.5 s, then destroys the Graphics object.
- `src/scenes/GameScene.js` — imports `SlimeTrail`, instantiates it after the snail, and calls `slimeTrail.update(snail, delta)` each frame.

### Slithering Sound Effect
- `src/systems/SoundSynth.js` — extended `playLooped` to fall back to a procedural `_${name}_looped()` method when no file override is available. Added `_slithering_looped()`: looping 1-second white-noise buffer → bandpass filter (280 Hz, Q=3) → gain, with a 2.5 Hz LFO for a subtle rhythmic pulse that mirrors the foot-wave animation. Very quiet (0.12 × master volume). Returned handle has `stop(fadeOut)`.
- `src/entities/Snail.js` — `setState` now starts the slither loop when entering `MOVING` and fades it out (300 ms) when leaving. `_startSlither` / `_stopSlither` helpers manage the handle. `destroy()` override stops the sound immediately on scene teardown.

### Gerald Walk & Idle Animations
- `scripts/generate-walk-idle-sprites.js` — new generator producing 72 SVG frames:
  - **Walk** (24 files, 6 frames × 4 dirs): sine-wave ripple along the underside of the body (muscular foot wave); eye stalks bob vertically with each stride. Right/left use a wavy closed path replacing the body ellipse; up view bobs the whole shell; down view ripples and sways stalks.
  - **Idle** (48 files, 12 frames × 4 dirs): eye stalks drift side-to-side in a slow sinusoidal pattern; single blink at frame 6 (half-close → closed → half-open across frames 5–7).
- `src/scenes/GameScene.js` — preload now loads all walk/idle frame textures alongside existing hit frames.
- `src/entities/Snail.js` — `registerAnims` creates `snail-walk-{dir}` (10 fps, loop) and `snail-idle-{dir}` (8 fps, loop) animations. Added `_playCurrentAnim()` to select walk vs idle based on state, called from `setFacing`, `setState`, and after damage invincibility expires. Constructor starts idle immediately. Removed unused `DIR_TEXTURES` const.

### Gerald Sprite — Eyes Moved to Eye-Stalk Tips
- `generate-snail-sprites.js` — all 4 directional sprites updated. Antenna tip circles changed from `BODY` yellow to `EYE` black with white highlights. Old floating eye element (on the body near the face) removed from right/left and down views. Up view (rear) now shows dark eye-stalk tips too.
- `generate-damage-sprites.js` — same fix across all 64 hit-animation frames. The separate eye interpolation blocks (which tracked wrong body positions) are removed; eyes now live on the antenna tip circles and retract naturally with the antennae as Gerald withdraws into his shell. Regenerated all 68 SVGs.

### Auto-Turret Behaviour Tweaks
- **Shield-aware targeting**: turret now passes `alienFilter: (a) => !a.shielded` to `DefenseStation`, so it skips shield aliens whose energy ring is up and focuses fire on targetable enemies instead.
- **Minigame**: turret terminal now uses `_rhythmLauncher` (same as SHIELD/SLOW/REPAIR) instead of `_sequenceLauncher`.

### Auto-Turret Visual Redesign
- `DefenseStation.drawStation()` completely redrawn in the oblique top-down aesthetic of the `station-gun` / `station-mainframe` SVG sprites.
- **Base**: regular hexagon (flat-top, r=20) in gunmetal `#3a4450` outer / `#556070` inner, with a dark edge outline and a subtle `#00ffcc` accent ring at r=22 — echoes the hacking station's hex body and cyan glow.
- **Barrel group**: boxy gun body (14×10 px) with lit top strip (`#7a8898`) and shadow right strip (`#3a4450`); scope housing to the right with `#00eeff` glowing lens; narrow barrel (6×18 px) with lit left edge (`#60707e`), three heat-vent marks, and a `#88aacc` muzzle-tip highlight — all matching the palette from `stationGun()` in `generate-station-sprites.js`.
- Label text and cooldown arc colour changed from orange `#ff8844` / `0xff8844` to station cyan `#00ffcc` / `0x00ffcc` to match the new palette.

### Gerald Shield — Blocks Alien Contact Damage
- When a non-bomber alien reaches Gerald while `snail.shielded` is true, the alien is destroyed without dealing damage. The `shieldReflect` sound plays (same as the shield alien's projectile deflect sound) and a full death burst fires with the alien's type colour — so the alien still visually explodes and the kill is registered.
- `BURST_COLORS` is now exported from `CollisionSystem.js` so `GameScene` can look up the correct burst colour for the killed alien type.
- Bomber AoE blast is also blocked by the shield: `checkBomberBlast` now checks `scene.snail.shielded` and plays `shieldReflect` instead of dealing damage and playing the damage sound.

### Bug Fix — Bomber Blast Not Killing Nearby Aliens
- `checkBomberBlast` called `a.takeDamage()` but discarded the return value, so splash-damaged aliens that reached 0 HP kept walking. Fixed: when `takeDamage` returns true in the splash loop, the alien is marked `_dying`, score is incremented, a death burst fires after 120 ms, and the alien is destroyed. Chain bombers (a bomber killed by another bomber's blast) recursively call `checkBomberBlast` from their own position.

### SoundSynth — Shared Instance + Menu Warmup
- **Single shared instance** — `SoundSynth` is now created once in `main.js`, `preload()` is called immediately (HTTP fetches start while the menu is showing), and the instance is stored in `game.registry` under `'soundSynth'`.
- **`warmup()` method** — creates the `AudioContext` and decodes all already-fetched `rawBuffers` in one shot. Called on the START button `pointerdown` in `MenuScene`, which is a confirmed user gesture. By the time `GameScene` starts and the drop-in ship animation plays, all audio files are decoded and ready.
- **`GameScene` + `IntermissionScene`** — replaced `new SoundSynth(SOUND_OVERRIDES)` + `preload()` with `this.registry.get('soundSynth')`. Removed now-unused `SoundSynth` and `SOUND_OVERRIDES` imports from both files.

### Ship Sound — Looped Ambient During All Ship Appearances
- `SoundSynth.playLooped(name)` — new method that plays a decoded AudioBuffer on a continuous loop and returns a `{ stop(fadeOut?) }` handle (`fadeOut` defaults to 0.25s linear fade). Returns `null` if no decoded buffer is available, so callers can safely use `?.stop()`.
- **Drop-in animation** — starts the loop when the ship enters; stops it (with fade) in the Phase 3 ascent `onComplete` before `ship.destroy()`.
- **Battery delivery** — starts the loop when the delivery ship is created; stops it in the fly-out `onComplete` before `ship.destroy()`.
- **Wave escape** — `_startEscapePhase` stores the handle on `this._escapeShipSound`; `_boardEscapeShip` stops it when the ship disappears off the top. `onWaveStart` also clears the handle for safety.

### SoundSynth — Eager Preload
- **Separated fetch from decode** — `SoundSynth` override state now tracks four fields: `fetching`, `rawBuffers` (fetched `ArrayBuffer`s), `decoding`, and `buffers` (decoded `AudioBuffer`s ready to play), replacing the single `loading` boolean.
- **`preload()` method** — Kicks off `fetch()` for all override files immediately on call, with no `AudioContext` required (network requests don't need a user gesture). When the context becomes available (on first `play()`), any already-fetched raw buffers are decoded right away via the internal `_decode()` helper.
- **Called at scene create** — `GameScene.create()` and `IntermissionScene.create()` call `this.soundSynth.preload()` right after constructing the synth. By the time the player fires their first shot the files are already fetched and decoded, eliminating the first-play fallback to procedural synth.
- **Fallback preserved** — If `preload()` was never called (or all files failed), `play()` falls back to the old inline fetch-then-decode path, then to the procedural synth, as before.
