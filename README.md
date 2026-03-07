# Snail Hacker

A 2-player co-op arcade survival game that runs in the browser. No build step required.

## How to Play

Open `index.html` in a browser (served over HTTP — e.g. `npx serve .` or any static server). Phaser 3 is loaded from CDN.

Two players share the same screen.

### Player 1 — The Snail (Keyboard)

| Key | Action |
|-----|--------|
| `W A S D` | Move Gerald the snail |
| `E` (near station) | Start hacking — type words to fill the hack bar |
| `E` (near terminal) | Activate a service terminal |
| `ESC` | Cancel active hack / pause |

Walk to the **Reload**, **Cannon**, **Shield**, or **SlowField** terminals around the arena and press `E` to trigger their minigames. Pick up a **Battery** by walking into it, then carry it back to the station when power is lost.

### Player 2 — The Shooter (Mouse)

| Input | Action |
|-------|--------|
| Left-click | Fire a projectile from the station toward the cursor |
| Right-click drag | Grab and relocate the snail (cancels active hack) |

Manage the 20-shot ammo budget. Player 1 must hack the **RELOAD** terminal to refill.

---

## Objective

Survive 10 escalating waves of alien invaders. Protect the central cyan **Hacking Station** — if it takes too much damage, it's game over.

To end each wave: complete the hack bar at the station, then run Gerald to the **Escape Ship** that appears near the edge of the screen. The ship flies away, and the wave is officially over.

Intermissions occur after waves 3, 6, and 9.

---

## Alien Types

| Alien | Colour | Behaviour |
|-------|--------|-----------|
| Basic | Green frog / grey saucer | Straight line toward snail, 60 px/s |
| Fast | Purple saucer | Sinusoidal zigzag, 150 px/s |
| Tank | Steel-blue saucer | Slow (38 px/s), 40 HP — takes many shots |
| Bomber | Orange saucer | AoE explosion on death or contact |

---

## Service Terminals

| Terminal | Minigame | Effect |
|----------|----------|--------|
| RELOAD | Rhythm | Refills P2 ammo to max; relocates after each use |
| CANNON-L / CANNON-R | Rhythm | Auto-turret fires at nearest alien for 5 s |
| SHIELD | Sequence | 4 s invincibility bubble around the station |
| SLOWFIELD | Typing | All aliens slowed to 40% speed for 6 s |

---

## Dev Mode

`DEV_MODE: true` in `config.js` adds an in-browser balance editor overlay on the Menu screen. All values are persisted to `localStorage`. Press **Reset** in the overlay to restore defaults.

---

## File Layout

```
snail-hacker/
├── index.html                        ← entry point (Phaser CDN)
├── src/
│   ├── main.js                       ← Phaser.Game config + scene list
│   ├── config.js                     ← all balance values (DEFAULTS + live CONFIG)
│   ├── scenes/
│   │   ├── MenuScene.js
│   │   ├── GameScene.js              ← main game loop
│   │   ├── PauseScene.js
│   │   ├── IntermissionScene.js
│   │   ├── GameOverScene.js
│   │   └── VictoryScene.js
│   ├── entities/
│   │   ├── Snail.js
│   │   ├── HackingStation.js
│   │   ├── Terminal.js
│   │   ├── DefenseStation.js
│   │   ├── EscapeShip.js
│   │   ├── Battery.js
│   │   ├── HealthDrop.js
│   │   ├── Projectile.js
│   │   └── aliens/
│   │       ├── BasicAlien.js
│   │       ├── FastAlien.js
│   │       ├── TankAlien.js
│   │       └── BomberAlien.js
│   ├── systems/
│   │   ├── WaveManager.js
│   │   └── GrabHandSystem.js
│   └── minigames/
│       ├── HackMinigame.js
│       ├── RhythmMinigame.js
│       ├── SequenceMinigame.js
│       └── TypingMinigame.js
├── assets/
│   ├── snail-{right,left,up,down}.svg
│   ├── alien-frog-*.svg              ← BasicAlien (8 directions)
│   ├── alien-fast-*.svg              ← FastAlien  (8 directions)
│   ├── alien-tank-*.svg              ← TankAlien  (8 directions)
│   └── alien-bomber-*.svg            ← BomberAlien (8 directions)
└── scripts/
    ├── generate-snail-sprites.js
    ├── generate-alien-saucer-sprites.js
    └── generate-alien-enemy-sprites.js
```
