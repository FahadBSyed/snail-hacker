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

### Steps Remaining
- **Step 9:** RELOAD typing detection + ammo refill
- **Step 10:** Teleport system (right-click drag)
- **Step 11:** Terminal entity — proximity, activation, cooldown
- **Step 12:** Sequence minigame
- **Step 13:** Cannon defense station
- **Step 14:** Rhythm minigame
- **Step 15:** Typing minigame
- **Step 16:** Shield defense station
- **Step 17:** SlowField defense station
- **Step 18:** Wave system + intermissions
- **Step 19:** Remaining alien types (fast, tank, bomber)
- **Step 20:** IntermissionScene — flavor text, health restore, auto-advance
- **Step 21:** VictoryScene — trigger condition, final score
- **Step 22:** Audio integration
- **Step 23:** Full HUD polish
- **Step 24:** Visual polish — particles, trails, glows
