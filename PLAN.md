# SNAIL HACKER - Implementation Plan

## Project Structure

```
snail-hacker/
├── index.html
├── src/
│   ├── main.js                  ← Phaser.Game config, scene registration
│   ├── scenes/
│   │   ├── MenuScene.js
│   │   ├── GameScene.js
│   │   ├── IntermissionScene.js
│   │   ├── GameOverScene.js
│   │   └── VictoryScene.js
│   ├── entities/
│   │   ├── Snail.js
│   │   ├── aliens/
│   │   │   ├── AlienBase.js
│   │   │   ├── BasicAlien.js
│   │   │   ├── FastAlien.js
│   │   │   ├── TankAlien.js
│   │   │   └── BomberAlien.js
│   │   ├── Projectile.js
│   │   ├── HackingStation.js
│   │   ├── Terminal.js
│   │   └── DefenseStation.js
│   ├── systems/
│   │   ├── WaveManager.js
│   │   ├── ReloadBuffer.js
│   │   └── TeleportSystem.js
│   ├── minigames/
│   │   ├── SequenceMinigame.js
│   │   ├── RhythmMinigame.js
│   │   └── TypingMinigame.js
│   └── ui/
│       ├── HUD.js
│       └── MinigameDisplay.js
└── assets/audio/
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
- Alien vs Station (within ~50px of center): `station.takeDamage(10)`, destroy alien

### Step 7: Hacking Station
- `HackingStation.js`: large cyan hexagon at (640, 360)
- Health: 100, glow alpha proportional to health/100
- `takeDamage(amount)` method
- Game over when health <= 0 → `this.scene.start('GameOverScene', { wave, score })`
- Red health bar at top-left (placeholder)

### Step 8: GameOverScene
- Accept `{ wave, score }` data
- Render "STATION DESTROYED", wave reached, score
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
- Semi-transparent circle around station, `stationShielded = true`
- Blocks alien damage for 4s
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
- Every 3 waves: intermission (5s), +20 station health (capped 100)
- HUD: wave number + countdown timer
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
- 5s auto-advance countdown
- Health restore before returning to GameScene

### Step 21: VictoryScene
- Trigger after wave 10 (or endless mode)
- Flavor victory text, final score + wave count

### Step 22: Audio Integration
- Free assets from OpenGameArt/Freesound
- Load in preload(), `playSound(key)` helper
- Wire all events: shoot, alien_death, alien_reach_station, reload_complete, reload_typing, terminal_activate, minigame_success/fail, teleport, station_damage, wave_start, game_over
- Looping background music at volume 0.3

### Step 23: Full HUD
- Top-left: red health bar (200×20px) + "STATION INTEGRITY"
- Top-right: 10 bullet-icon shapes, grey out consumed
- Top-center: wave number + countdown timer
- Bottom-center: MinigameDisplay (visible only during minigame)
- Snail overhead: state text + reload progress bar
- Warnings: "LOW AMMO" (ammo ≤ 2), "CANNON READY", "SHIELD READY"

### Step 24: Visual Polish
- Starfield background (100-200 white dots, optional parallax)
- Projectile trail particles
- Alien death burst (color-matched)
- Teleport warp rings (expanding at origin, contracting at destination, 0.3s)
- Station glow driven by health/100, pulse tween when health < 30
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

---

## Key Tension Resolutions

| Tension | Resolution |
|---|---|
| RELOAD buffer vs WASD | Buffer appends passively on keydown; Phaser CursorKeys reads key state independently |
| Teleport cancels minigame | TeleportSystem calls activeMinigame.cancel() and reloadBuffer.cancel(), snail flashes red |
| Minigame suppresses movement | Snail.update() gates WASD on !hackingActive; teleport bypasses this gate |
| Difficulty balance | HUD warnings with 3-5s lead time; WaveManager ramps gradually |
