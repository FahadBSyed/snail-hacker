# SNAIL HACKER — Changelog

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

### Bug Fix — Bomber Blast Not Killing Nearby Aliens
- `checkBomberBlast` called `a.takeDamage()` but discarded the return value, so splash-damaged aliens that reached 0 HP kept walking. Fixed: when `takeDamage` returns true in the splash loop, the alien is marked `_dying`, score is incremented, a death burst fires after 120 ms, and the alien is destroyed. Chain bombers (a bomber killed by another bomber's blast) recursively call `checkBomberBlast` from their own position.
