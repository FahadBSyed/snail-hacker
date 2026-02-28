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
