# SNAIL HACKER - Implementation Plan

## Project Structure

```
snail-hacker/
├── index.html                    ← Phaser CDN + <script type="module" src="src/main.js">
├── assets/
│   ├── backgrounds/              ← bg-00.svg … bg-19.svg (procedural planet backdrops)
│   ├── alien-{frog,fast,tank,bomber}-{dir}.svg  ← 8-dir alien saucer sprites (32 total)
│   ├── snail-{right,left,up,down}.svg           ← Base directional walk sprites
│   └── snail-hit-{dir}-f{00..15}.svg            ← 64-frame Gerald damage animation
├── scripts/
│   ├── generate-snail-sprites.js          ← Base snail SVG generator
│   ├── generate-alien-enemy-sprites.js    ← Alien saucer sprite generator (all 4 types)
│   ├── generate-alien-saucer-sprites.js   ← Base saucer geometry helper
│   ├── generate-damage-sprites.js         ← Gerald hit animation frame generator
│   └── generate-planet-backgrounds.js    ← Procedural planet background generator
└── src/
    ├── main.js                   ← Phaser.Game config (1280×720, scene registration)
    ├── config.js                 ← All balance values: DEFAULTS, live CONFIG object,
    │                                localStorage persistence, saveConfig/resetConfig
    ├── scenes/
    │   ├── MenuScene.js
    │   ├── GameScene.js
    │   ├── HUD.js
    │   ├── PauseScene.js
    │   ├── IntermissionScene.js
    │   ├── GameOverScene.js
    │   └── VictoryScene.js
    ├── entities/
    │   ├── Snail.js
    │   ├── Projectile.js
    │   ├── HackingStation.js
    │   ├── Terminal.js
    │   ├── DefenseStation.js
    │   ├── EscapeShip.js
    │   ├── Battery.js
    │   ├── HealthDrop.js
    │   ├── aliens/
    │   │   ├── alienUtils.js
    │   │   ├── BaseAlien.js
    │   │   ├── BasicAlien.js
    │   │   ├── FastAlien.js
    │   │   ├── TankAlien.js
    │   │   └── BomberAlien.js
    │   └── shared/
    │       └── CooldownTimer.js
    ├── systems/
    │   ├── CollisionSystem.js
    │   ├── WaveManager.js
    │   ├── ReloadBuffer.js
    │   ├── SoundSynth.js
    │   ├── TeleportSystem.js
    │   └── GrabHandSystem.js
    └── minigames/
        ├── HackMinigame.js
        ├── SequenceMinigame.js
        ├── RhythmMinigame.js
        └── TypingMinigame.js
```

---

## Phase 1 — Core Playability

### Step 1: Project Bootstrap
- Create `index.html` with Phaser 3 CDN
- Create `src/main.js` with `Phaser.Game` config: `type: Phaser.CANVAS`, `width: 1280`, `height: 720`, dark background, `physics: { default: 'arcade' }`
- Register all scene classes (stubs for now)
- Verify the game boots to a blank canvas

### Step 2: MenuScene
- Render title text "SNAIL HACKER" at center-top
- Two-column control summary (P1: WASD/E/type, P2: left-click/right-drag)
- "START" button → `this.scene.start('GameScene')`

### Step 3: Snail Entity (Player 1)
- `Snail.js` extends `Phaser.GameObjects.Container`
- Draw with Graphics: tan/yellow oval body, brown spiral shell, two antennae with dot tips
- WASD movement at 40px/s, clamp to screen bounds
- State machine: IDLE | MOVING | HACKING
- Small overhead text showing current state

### Step 4: Mouse Shooting (Player 2)
- `ammo` variable (starts 10, max 10)
- Left-click (button 0): spawn `Projectile` aimed at click position, decrement ammo
- `Projectile.js`: small white/yellow circle, high velocity, self-destroy off-screen
- Ammo display in HUD top-right (placeholder text)

### Step 5: Basic Alien Spawn + Movement
- `BasicAlien.js`: red circle (~20px) with eye dots
- Timed spawn every 2s from top/left/right edges
- Move toward (640, 360) at 60px/s

### Step 6: Collision Detection
- `aliens` Group + `projectiles` Group
- Projectile vs Alien: destroy both, increment score
- Alien vs Gerald (contact): `snail.takeDamage(amount)`, alien destroyed
- Game over when Gerald's health reaches 0

### Step 7: Hacking Station
- `HackingStation.js`: large cyan hexagon at (640, 360)
- This is the object Gerald hacks **into** — it is the mission objective, not a health entity
- Displays hack progress visually (glow/outline shifts as the wave hack fills)
- Gerald walks to it and presses E to begin hacking; completing enough words fills the wave hack bar

### Step 8: GameOverScene
- Accept `{ wave, score }` data
- Render "GERALD IS DEAD" (or equivalent), wave reached, score
- "PLAY AGAIN" button → `this.scene.start('MenuScene')`

---

## Phase 2 — Co-op Mechanics

### Step 9: RELOAD Typing Detection
- `ReloadBuffer.js`: rolling string of last 6 characters
- Global `keydown` listener appends every key without suppressing WASD
- Check if buffer ends with "RELOAD"
- On match: `reloadInProgress = true`, 2s delay, then ammo = max
- Progress bar on snail overhead HUD
- `cancel()` method called on teleport

**TENSION_1 resolution:** Buffer appends passively; Phaser CursorKeys reads key state independently.

### Step 10: Teleport System
- `TeleportSystem.js`: right-button pointerdown → record dragStart
- Right-button pointerup: teleport snail to pointer position
- Particle burst at origin + destination (0.3s)
- Cancel reload buffer and active minigame
- Flash snail red if cancelled mid-hack (TENSION_2)

### Step 11: Terminal Entity
- `Terminal.js`: teal rectangle (~40×30px) with screen glow
- States: IDLE | ACTIVE | COOLING_DOWN
- Proximity check: snail within 30px → white outline + "E" prompt
- Press E → activate, launch assigned minigame, set `snail.hackingActive = true`
- After minigame: start cooldown, re-enable snail WASD
- Cooldown fill animation
- 3-5 terminals at hardcoded positions around center

**TENSION_3 resolution:** `Snail.update()` gates WASD on `!this.hackingActive`. Teleport moves container directly.

### Step 12: Sequence Minigame
- Generate 4-6 random keys (not WASD)
- Display at bottom-center, 4s timer
- Advance pointer on correct key (green), reset on wrong (red flash)
- Success → `onSuccess()`, Failure → `onFailure()`

### Step 13: Cannon Defense Station
- `DefenseStation.js` with type `CANNON`
- Geometric turret shape, distinct color
- Rhythm minigame to activate
- On success: auto-fire at nearest alien for 5s (once per second)
- Cooldown: 20s with fill animation

---

## Phase 3 — Content + Polish

### Step 14: Rhythm Minigame
- Horizontal bar with moving indicator + target zone
- 4-6 beats, key shown above bar
- >1 miss → failure; all beats with ≤1 miss → success

### Step 15: Typing Minigame
- Display word/phrase from predefined list
- Time limit: `phrase.length * 1500ms`
- Characters render green (correct) or red (wrong)
- Complete phrase → success; timer expire → failure

### Step 16: Shield Defense Station
- Sequence minigame to activate
- Semi-transparent circle around **Gerald** (follows him), `snail.shielded = true`
- Gerald's `takeDamage()` is a no-op while shielded
- Cooldown: 25s

### Step 17: SlowField Defense Station
- Typing minigame to activate
- All aliens speed × 0.4 for 6s
- Blue tint/particle field overlay
- Cooldown: 18s

### Step 18: Wave System
- `WaveManager.js`: config maps wave → { spawnInterval, duration, alienTypes }
- Wave 1: basic, 2000ms, 30s
- Wave 2: basic + fast, 1500ms, 40s
- Wave 3+: + tank, 1200ms, 50s
- Wave 5+: + bomber, 1000ms, 60s
- Intermission after every wave (upgrade card selection); IntermissionScene is the single inter-wave path
- HUD: wave number + hack progress bar
- **3-second spawn grace period** at the start of each wave (`CONFIG.WAVES.SPAWN_GRACE_MS`)

### Step 18b: Escape Ship Wave-End Flow *(added Session 3)*
- On hack completion, an `EscapeShip` spawns at a random inset edge instead of immediately ending the wave
- Enemies continue spawning until the snail boards the ship (proximity trigger, `CONFIG.ESCAPE.BOARD_RADIUS`)
- Boarding: remaining aliens burst and despawn, snail + ship tween off the top of the screen with exhaust particles (`CONFIG.ESCAPE.ASCENT_DURATION`)
- "WAVE X COMPLETE" splash shown after ascent; any key/click advances
- Snail HP and gun ammo are **fully restored** at the start of each new wave
- Works correctly across normal waves, intermission waves (3/6/9), and the final wave (10)

### Step 19: Remaining Alien Types
- `FastAlien.js`: purple triangle, ~150px/s, sinusoidal zigzag
- `TankAlien.js`: dark grey square, thick outline, ~40px/s, health 40
- `BomberAlien.js`: orange pentagon, pulsing glow, ~50px/s, AoE 25 damage within 100px on death
- **Directional sprites** for all four alien types (8 directions each, palette-swapped saucer + frog art)

### Step 20: IntermissionScene
- Flavor text array keyed by wave number
- Upgrade card selection (CANNON / SHIELD / SLOWFIELD / REPAIR) — up to 3 cards shown until all 4 acquired
- 5s auto-advance countdown
- Gerald's HP and ammo are restored to full at the start of each new wave

### Step 21: VictoryScene
- Trigger after wave 10 (or endless mode)
- Flavor victory text, final score + wave count

### Step 22: Audio Integration
- Free assets from OpenGameArt/Freesound
- Load in preload(), `playSound(key)` helper
- Wire all events: shoot, alien_death, alien_hit_gerald, reload_complete, terminal_activate, minigame_success/fail, teleport, gerald_damage, wave_start, game_over, upgrade_select, shield_activate, slow_activate
- Looping background music at volume 0.3

### Step 23: Full HUD
- Top-left: red health bar (200×20px) + "GERALD HP"
- Top-right: 10 bullet-icon shapes, grey out consumed
- Top-center: wave number + hack progress counter (words completed / threshold)
- Bottom-center: MinigameDisplay (visible only during minigame)
- Snail overhead: state text
- Warnings: "LOW AMMO" (ammo ≤ 2)

### Step 24: Visual Polish
- Starfield background (100-200 white dots, optional parallax)
- Projectile trail particles
- Alien death burst (color-matched)
- Teleport warp rings (expanding at origin, contracting at destination, 0.3s)
- Station glow shifts as hack progress fills
- Bomber pulse tween on outer glow (alpha 0.3 ↔ 1.0)

### Step 25: Game-Feel Polish *(added Session 4)*
- **Custom cursors** — Game-rendered Phaser Graphics objects (depth 1000) replace browser cursors: cyan crosshair (default), cyan grab hand (near grabbable + ready), dimmed hand + red prohibition circle (near grabbable + on cooldown). Real cursor hidden with `canvas.style.cursor = 'none'`.
- **Screen shake on gunfire** — `cameras.main.shake(90, 0.005)` on every shot.
- **Hit flash** — Scene-level red `Arc` overlaid at alien position on hit, fades out over 200ms. Canvas-renderer safe (no `setTintFill`).
- **Hit-stop wobble** — ±5px horizontal jerk tween (50ms/leg) on alien container on hit.
- **Delayed alien death** — 200ms delay between killing hit and destroy/burst; `_dying` flag prevents contact damage during the window.
- **Layered bullet glow trail** — Three-circle trail (outer halo, mid glow, bright core) emitted every 25ms for a light-emission look.
- **Alien death light pulse** — Two expanding circles (warm-red + orange) added to death burst before debris dots, simulating a radiant explosion flash.
- **Opaque wave-complete overlay** — Black background fully covers the game level during the wave complete splash.
- **Double-advance fix** — `advance()` on the wave complete splash guards against being called by both keyboard and pointer events; uses `advanced` flag + explicit `.off()` cleanup.

### Step 26: Upgrade System *(added Session 5)*
- **IntermissionScene after every wave** — All inter-wave flow routes through `IntermissionScene`; the old in-game splash overlay was removed. Flavor quotes added for all 9 pre-victory waves.
- **Card selection** — Up to 3 upgrade cards (CANNON / SHIELD / SLOWFIELD / REPAIR) shown at each intermission until all 4 are acquired. Player clicks or presses 1/2/3. Chosen upgrade is removed from the pool and carried in `scene.data.upgrades[]`.
- **Persistent terminals** — `GameScene` spawns all previously unlocked upgrade terminals at `CONFIG.UPGRADES.ORBIT_RADIUS` (180 px) from the station at wave start. RELOAD terminal placement avoids orbital overlap.
- **SHIELD → protects Gerald** — `Snail.shield(duration)` / `unshield()` wraps Gerald in a pulsing circle and makes `takeDamage()` a no-op for the duration.
- **Balance** — `CANNON.ACTIVE_DURATION`, `SHIELD_DURATION`, `SLOW_DURATION` raised to 25s. Rhythm minigame key pool narrowed to WASD. Upgrade card descriptions read from live CONFIG. `CONFIG_VERSION` bumped to 3.
- **Audio** — `upgradeSelect` (triumphant chord), `shieldActivate` (hum + ping), `slowActivate` (pitch-bend whoosh), `slowTick` (muffled tick + purple tint while active).

### Step 29: Station & Terminal Sprites *(added Session 8)*
- **`scripts/generate-station-sprites.js`** — Oblique top-down (SNES/Pokémon style) sprite generator for 7 assets: `station-mainframe.svg` (96×96), `station-gun.svg` (48×48), and five `terminal-*.svg` (64×64 each).
- **Mainframe** — 3D cabinet with visible front + top + right-shadow faces, CRT display, tape reels, punch-card slot, and a raised gun-mount platform. **Gun is a separate sprite** that rotates toward the player's crosshair, recoils on fire, and emits a muzzle-flash.
- **Terminals** — Color-coded CRT monitors on squat desks: reload (cyan), turret (orange), shield (blue), slow (purple), repair (green). Icon unique to each function baked into the screen art.
- All 7 SVGs loaded in `GameScene.preload()` with conditional caching (`this.textures.exists()` guard).

### Step 30: Passive Upgrade Cards *(added Session 8)*
- Four passive upgrades added alongside the active terminal upgrades (9 total in pool):
  - **HEALTH_BOOST** — Gerald max HP ×1.5 (100 → 150).
  - **AMMO_BOOST** — Magazine size ×1.5 (default 35 → ~52 bullets).
  - **LASER** — Hitscan left-click replaces projectiles (`_laserMode` flag in `GameScene`).
  - **SPEED_BOOST** — Gerald movement speed ×2 (40 → 80 px/s).
- Passive cards show "— PASSIVE —" badge; applied immediately in `GameScene.create()`; no terminal spawned.
- `_spawnUpgradeTerminals()` skips passive upgrades when placing orbital terminals.

### Step 31: Upgrade Stations → Rhythm Minigame *(added Session 8)*
- SHIELD, SLOWFIELD, and REPAIR terminals unified onto `RhythmMinigame` (previously Sequence and Typing).
- Key pool restricted to WASD — timing challenge, not key-hunting.
- Shared `rhythmLauncher` helper in `GameScene`; config: 1 beat required, 1 miss allowed, 2.5s timeout per beat.

### Step 32: Math Minigame + Battery Hack-Mode Rotation *(added Session 8)*
- **`src/minigames/MathMinigame.js`** — Single-digit addition/subtraction; same contract as `HackMinigame` (wordsRequired, onWordComplete, onSuccess, cancel()). Auto-submits on correct digit count; backspace supported; 180ms correct / 300ms wrong feedback delays.
- **Hack-mode toggle** — `_hackMode` (`'typing'` | `'math'`) in `GameScene` selects `HackMinigame` or `MathMinigame` at hack-start. Mode flips every time the station loses power (battery spawn event). Pattern: typing → battery → math → battery → typing → …
- **Battery delivery ship** — Flies in from a random off-screen radial direction, hovers while the `Battery` pops in (`scale 0→1`, `Back.easeOut`), then exits. Snail auto-picks up on contact and carries the battery to the station center to restore power.
- Config: `BATTERY.POWER_LOSS_WORDS` (15), `BATTERY.SPAWN_RADIUS` (200 px), `BATTERY.SNAIL_PICKUP_DIST` (35 px), `BATTERY.DELIVERY_DIST` (55 px).

### Step 28: Drone Polish *(added Session 7)*
- **Fly-to animation** — Drone physically travels from its orbit position to the chosen terminal before activating (500ms `Sine.easeInOut` tween), flashes white at arrival + plays sound, holds briefly, then returns to orbit (600ms tween). Refactored from world-coordinate Graphics redraw each frame to a Phaser `Container` with a local-origin child `Graphics` so tweens can move the object directly.
- **RELOAD terminal eligible** — Drone can now autonomously activate the RELOAD terminal; skipped when ammo is already at max (mirrors existing REPAIR skip-at-full-health guard).

### Step 27: Gerald Damage Animation *(added Session 6)*
- **64-frame SVG sprite sheet** — `scripts/generate-damage-sprites.js` produces `snail-hit-{right,left,up,down}-f{00..15}.svg`. Frames f00–f07: body withdraws into shell (feet/eyes/antennae retract, body shrinks). Frames f08–f15: shell pulses (alternating breathe scale).
- **feColorMatrix white tint** — Instead of a white rectangle overlay, an SVG `<filter>` with `feColorMatrix` linearly interpolates every pixel toward white (`new = src*(1-w) + w`). Tint weight per frame: f00=0.75, f01=0.45, f02=0.25, f03=0.10, shell-pulse even frames=0.45. Gerald's actual colours bleach and recover; no covering square.
- **Wired into game** — `GameScene.preload()` loads all 64 frames; `anims.create()` registers `snail-hit-{dir}` at 8 fps. `Snail.takeDamage()` plays the animation; the i-frame white-rectangle overlay was removed as the sprite animation now carries all visual feedback.

### Step 33: Boss Fight — The Overlord *(design locked, not yet implemented)*

Wave 10 triggers a boss fight instead of a normal alien wave. No normal aliens spawn during the boss fight (fast alien bursts are the exception — see below).

#### Boss Entity (`src/entities/aliens/BossAlien.js`)

- **Scale** — 2× the size of TankAlien. Distinct sprite; generate via a new `scripts/generate-boss-sprite.js`.
- **HP** — 200. Requires ~20 unshielded hits to kill. Config: `CONFIG.BOSS.HP`.
- **Phase-shift on damage threshold** — Each time the boss takes `CONFIG.BOSS.PHASE_SHIFT_HP` damage (default 50), it flies off-screen at high speed in a random direction, pauses 1.5s off-screen, then re-enters from a different random edge. While off-screen, it cannot be targeted. Phase-shift also resets its shield if the shield was down.
- **Movement** — Orbits the station at a fixed radius (`CONFIG.BOSS.ORBIT_RADIUS`, default 350px), oscillating its angle ±45° from its current position using a sinusoidal pattern. Never approaches the station. Config: `CONFIG.BOSS.ORBIT_SPEED`.
- **Enrage at 50% HP** — Below 100 HP (`CONFIG.BOSS.ENRAGE_HP`), orbit speed increases ×1.5 and all attack cooldowns decrease by 30%.

#### Shield Mechanic

- Boss spawns with shield active. Shield appearance mirrors `ShieldAlien` (rotating energy ring) but larger.
- Shield blocks all projectiles while up.
- **Shield drops** when P1 completes `CONFIG.BOSS.SHIELD_DROP_WORDS` words in the Frogger minigame (default 3 completions of the frogger run). Shield stays down for `CONFIG.BOSS.SHIELD_DOWN_DURATION` ms (default 5000ms), then the boss re-raises it.
- **Hack progress bar reused** — The existing wave hack-progress bar (top-center HUD) is repurposed during the boss fight to show progress toward the next shield drop. Label changes to "SHIELD BREAK" with a fill from 0 → `SHIELD_DROP_WORDS` completions. Bar resets on each shield-up.
- No power loss events during the boss fight (suppressed in `WaveManager`).

#### Frogger Minigame (`src/minigames/FroggerMinigame.js`)

Replaces the normal `HackMinigame` when the boss fight is active.

- **Layout** — A vertical strip rendered at the station (same screen position as the normal hack minigame). 4 horizontal lanes of traffic. A cursor starts on the left side; P1 must move it to the right side using WASD.
- **Traffic** — Each lane has 2–3 blockers moving left-to-right or right-to-left at different speeds. Contact with a blocker resets the cursor to the left side.
- **Win condition** — Cursor reaches the right edge. Fires `onWordComplete()` (incrementing the shield-break counter). Cursor immediately resets for the next run.
- **Cancel** — `cancel()` stops the minigame; called if snail is teleported mid-hack.
- **Movement gates** — `snail.hackingActive = true` while playing; WASD drives the frogger cursor, not Gerald. Gerald is stationary.

#### Boss Attacks

All cooldowns are in `CONFIG.BOSS` and affected by enrage at 50% HP.

| Attack | Description | Cooldown |
|---|---|---|
| **Black Hole** | Slow-moving dark projectile (`BossProjectile` type `blackhole`). Tracks toward Gerald. On contact with Gerald, teleports him to a random position far from the station (same mechanic as TeleportSystem but forced). Destroyable by P2 shots. | 8s |
| **EMP** | Slow-moving yellow projectile. On contact with the station, triggers a power-loss event identical to normal battery power loss (spawns a battery, halts hack progress, switches hack mode). Destroyable by P2 shots. | 12s |
| **Terminal Lock EMP** | Slow-moving red projectile. On contact with a terminal, forces that terminal into `COOLING_DOWN` state for `CONFIG.BOSS.TERMINAL_LOCK_DURATION` (default 15s). Targets a random non-RELOAD, non-REPAIR terminal. Terminal pulses red while locked. Destroyable by P2 shots. | 15s |
| **Alien Burst** | Spawns 2 `FastAlien` enemies at the boss's current position. Gives P2 targets to shoot while P1 hacks. | 10s |

Boss attacks are selected at random each cycle (weighted: Black Hole 25%, EMP 20%, Terminal Lock 20%, Alien Burst 35%). Boss cannot fire while phase-shifting.

#### Boss HP Bar (HUD addition)

- Prominent bar rendered at top-center **below** the wave label, replacing the wave counter during the boss fight.
- Bar: wide (400px), red fill with boss name "THE OVERLORD" above it.
- Shows current HP / max HP as a numeric label inside the bar.
- Flashes white briefly on each hit.
- `HUD.showBossBar(boss)` / `HUD.hideBossBar()` methods added.

#### Death Sequence

1. Final hit triggers `_dying` flag — boss stops moving and attacking.
2. Screen shake (heavy, `cameras.main.shake(600, 0.02)`).
3. Three expanding rings burst outward from boss center (0.5s each, staggered 150ms).
4. Boss sprite flashes rapidly (white tint, 100ms interval, 8 flashes).
5. Large debris burst (2× the normal alien death burst — more particles, mixed colors).
6. `cameras.main.flash(500, 255, 100, 0)` — orange screen flash.
7. Boss container destroyed. `GameScene` proceeds to the wave-complete / victory flow.

#### New Files

- `src/entities/aliens/BossAlien.js`
- `src/minigames/FroggerMinigame.js`
- `scripts/generate-boss-sprite.js`
- `assets/alien-boss-{right,left,up,down,diag-*}.svg` (8 directional sprites)

#### Config additions (`config.js` `DEFAULTS.BOSS`)

```js
BOSS: {
  HP: 200,
  PHASE_SHIFT_HP: 50,          // damage taken per phase shift trigger
  ORBIT_RADIUS: 350,
  ORBIT_SPEED: 0.4,            // radians/s base oscillation
  ENRAGE_HP: 100,
  ENRAGE_ORBIT_MULT: 1.5,
  ENRAGE_COOLDOWN_MULT: 0.7,
  SHIELD_DROP_WORDS: 3,        // frogger completions to drop shield
  SHIELD_DOWN_DURATION: 5000,  // ms shield stays down
  ATTACK_COOLDOWNS: {
    BLACK_HOLE: 8000,
    EMP: 12000,
    TERMINAL_LOCK: 15000,
    ALIEN_BURST: 10000,
  },
  TERMINAL_LOCK_DURATION: 15000,
  BLACK_HOLE_SPEED: 120,
  EMP_SPEED: 100,
  TERMINAL_LOCK_SPEED: 100,
  FROGGER_LANES: 4,
  FROGGER_BLOCKERS_PER_LANE: 2,
}
```

---

## Key Tension Resolutions

| Tension | Resolution |
|---|---|
| RELOAD buffer vs WASD | Buffer appends passively on keydown; Phaser CursorKeys reads key state independently |
| Teleport cancels minigame | TeleportSystem calls activeMinigame.cancel() and reloadBuffer.cancel(), snail flashes red |
| Minigame suppresses movement | Snail.update() gates WASD on !hackingActive; teleport bypasses this gate |
| Difficulty balance | HUD warnings with 3-5s lead time; WaveManager ramps gradually |
