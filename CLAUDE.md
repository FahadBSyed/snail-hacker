# SNAIL HACKER — Claude Guide

## What This Game Is

**Snail Hacker** is a 2-player co-op arcade survival game built with **Phaser 3**, running directly in the browser with no build step. Phaser is loaded from CDN; all source is plain ES modules.

### The Players

**Player 1 — The Snail (Keyboard)**
- Controls Gerald the snail with WASD across a top-down arena
- Walks to terminals and hacks them by pressing **E**
- Minigames activate defenses: cannons, shield, slow field, station repair, ammo reload
- Typing is also used passively — typing R-E-L-O-A-D anywhere triggers the ReloadBuffer

**Player 2 — The Shooter (Mouse)**
- **Left-click** to fire projectiles from the station toward the cursor
- **Right-click drag** to teleport the snail to any screen position (cancels active hacks)
- Must manage a 10-shot ammo budget; P1 must hack the RELOAD terminal to refill

### The Goal

Protect the central **Hacking Station** (cyan hexagon at screen center) from 10 escalating waves of aliens. Intermissions occur after waves 3, 6, and 9.

---

## File Structure

```
snail-hacker/
├── index.html                    ← Phaser CDN + <script type="module" src="src/main.js">
├── PLAN.md                       ← Full implementation plan — read before starting work
├── CHANGELOG.md                  ← Per-session progress log — check for current state
├── assets/
│   └── snail-{right,left,up,down}.svg    ← Directional sprites (procedurally generated)
├── scripts/
│   └── generate-snail-sprites.js         ← One-shot SVG generation script
└── src/
    ├── main.js                   ← Phaser.Game config (1280×720, scene registration)
    ├── config.js                 ← All balance values: DEFAULTS, live CONFIG object,
    │                                localStorage persistence, saveConfig/resetConfig
    ├── scenes/
    │   ├── MenuScene.js          ← Title screen + controls summary; DEV_MODE shows
    │   │                            an in-browser balance config editor overlay
    │   ├── GameScene.js          ← Core loop: orchestrates all entities; sections are
    │   │                            create() setup, wave-flow helpers (_startEscapePhase,
    │   │                            _playDropInAnimation, _boardEscapeShip), gameplay
    │   │                            actions (_startHack, _activateSlowField, etc.),
    │   │                            alien spawning, and update()
    │   ├── HUD.js                ← All HUD display objects + update methods; created once
    │   │                            in GameScene.create() as this.hud = new HUD(scene, opts)
    │   ├── PauseScene.js         ← Overlay scene (ESC/P); resumes parent scene
    │   ├── IntermissionScene.js  ← Between-wave: flavor text, station heal, 5s auto-advance
    │   ├── GameOverScene.js      ← Station destroyed; shows wave + score, restart button
    │   └── VictoryScene.js       ← Wave 10 complete; score-based rating
    ├── entities/
    │   ├── Snail.js              ← P1 avatar; WASD + hackingActive flag + directional sprites
    │   ├── Projectile.js         ← P2 bullet; fast Arc, self-destroys off-screen
    │   ├── HackingStation.js     ← Central hexagon; health, shield, heal, procedural draw
    │   ├── Terminal.js           ← Hackable console; IDLE/ACTIVE/COOLING_DOWN states,
    │   │                            proximity detection, [E] prompt, cooldown timer
    │   ├── DefenseStation.js     ← Auto-turret (CANNON); fires at nearest alien when active
    │   └── aliens/
    │       ├── alienUtils.js     ← DIRS array + angleToDir(rad) shared by all alien types
    │       ├── BaseAlien.js      ← Shared constructor, takeDamage, straight-line update
    │       ├── BasicAlien.js     ← Extends BaseAlien; 60 px/s straight movement
    │       ├── FastAlien.js      ← Extends BaseAlien; 150 px/s + sinusoidal zigzag override
    │       ├── TankAlien.js      ← Extends BaseAlien; 38 px/s, 30 HP
    │       └── BomberAlien.js    ← Extends BaseAlien; AoE blast on death or snail contact
    ├── systems/
    │   ├── CollisionSystem.js    ← Pure functions: checkProjectileCollisions(scene),
    │   │                            checkBomberBlast(scene, bx, by), spawnDeathBurst(scene, …)
    │   ├── WaveManager.js        ← 10-wave spawn config; intermission after waves 3/6/9
    │   ├── ReloadBuffer.js       ← Passive "RELOAD" detection from global keydown stream
    │   ├── SoundSynth.js         ← Procedural Web Audio sound effects; play(name) dispatch
    │   └── TeleportSystem.js     ← Right-drag targeting line; teleports snail on release
    └── minigames/
        ├── SequenceMinigame.js   ← Type 4–6 random (non-WASD) keys in order within timer
        ├── RhythmMinigame.js     ← Hit a bouncing indicator inside a target zone, N beats
        └── TypingMinigame.js     ← Type a sci-fi word against a per-character timer
```

---

## Plan and Changelog

- **`PLAN.md`** — Implementation plan across 24 steps in 3 phases, plus key tension resolutions (RELOAD-vs-WASD, teleport-cancels-minigame, minigame-suppresses-movement).
- **`CHANGELOG.md`** — Per-session log of completed steps. Always check this to understand the current state of the codebase before making changes.

---

## Coding Conventions

### No bundler — raw ES modules

Phaser is a CDN global, not an npm import. All local imports use relative paths with `.js` extensions.

```js
import { CONFIG } from '../config.js';     // correct
import Phaser from 'phaser';               // wrong — Phaser is a window global
```

### Phaser entity pattern

Game objects extend `Phaser.GameObjects.Container`. Children (graphics, text, sprites) are created with `scene.add.*` and added to the container with `this.add(child)`. The container is registered with `scene.add.existing(this)`.

```js
export default class MyThing extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);   // registers with scene graph

        const gfx = scene.add.graphics();
        gfx.fillStyle(0xff4444, 1);
        gfx.fillCircle(0, 0, 20);   // coords are relative to container origin
        this.add(gfx);              // child of container, not direct scene child
    }

    update(time, delta) { /* called explicitly from GameScene.update() */ }
}
```

### Procedural graphics

All visuals are drawn with `scene.add.graphics()`. Call `g.clear()` before redrawing to avoid accumulation. Draw calls use container-local coordinates (0,0 = container origin).

```js
const g = scene.add.graphics();
g.fillStyle(0x00ffcc, 0.8);   // hex color, alpha 0–1
g.fillCircle(0, 0, 30);
g.lineStyle(2, 0xffffff, 1);  // thickness, color, alpha
g.beginPath();
g.moveTo(-20, 0);
g.lineTo(20, 0);
g.strokePath();
```

### Balance values live in `config.js`

All tunable numbers belong in `DEFAULTS` in `src/config.js`. Read from the live `CONFIG` object at entity construction time — never at module load time.

```js
import { CONFIG } from '../config.js';

constructor(scene, x, y) {
    this.speed  = CONFIG.ALIENS.BASIC.SPEED;   // read at construction — picks up live value
    this.health = CONFIG.ALIENS.BASIC.HEALTH;
}
```

The `CONFIG` object is loaded from `localStorage` on page load, so changes persist. The in-browser editor (MenuScene, DEV_MODE only) writes back with `saveConfig()`.

### Scene transitions with data

Pass state between scenes via the second argument of `this.scene.start()`. Receive it in `init(data)`, which runs before `create()`.

```js
// Departing scene
this.scene.start('IntermissionScene', { wave: 3, score: 42, stationHealth: 75 });

// Arriving scene
init(data = {}) {
    this.wave          = data.wave          || 1;
    this.stationHealth = data.stationHealth ?? CONFIG.STATION.MAX_HEALTH;
}
```

### Time utilities — prefer Phaser's over `setTimeout`

`delayedCall` and `addEvent` are automatically paused when the scene is paused. `setTimeout` is not.

```js
this.scene.time.delayedCall(2000, () => doSomething());

const timer = this.scene.time.addEvent({
    delay: 100, loop: true, callback: () => tick(),
});
timer.remove(false);  // cancel without running callback
```

### Tweens

```js
this.scene.tweens.add({
    targets:  gameObject,      // Phaser object(s)
    alpha:    0,               // target value for property
    x:        400,
    duration: 300,             // ms
    ease:     'Sine.easeOut',
    yoyo:     false,           // reverse after completion
    repeat:   0,               // -1 = infinite
    onComplete: () => gameObject.destroy(),
});
```

### Input

```js
// Held key state (movement)
const keys = scene.input.keyboard.addKeys({
    w: Phaser.Input.Keyboard.KeyCodes.W,
    a: Phaser.Input.Keyboard.KeyCodes.A,
});
if (keys.w.isDown) { /* move up */ }

// Single press event
scene.input.keyboard.on('keydown-E', () => activate());
scene.input.keyboard.on('keydown', (event) => console.log(event.key));

// Mouse
scene.input.on('pointerdown', (pointer) => {
    if (pointer.button === 0) { /* left click */ }
    if (pointer.button === 2) { /* right click */ }
    pointer.x; pointer.y;       // world coordinates
});
```

### Delta-time movement

Always multiply by `delta / 1000` to convert milliseconds to seconds. Never move a fixed number of pixels per frame.

```js
update(time, delta) {
    const dt = delta / 1000;
    this.x += this.speed * dt;   // correct — frame-rate independent
    this.x += 3;                  // wrong — speed varies with frame rate
}
```

### Minigame contract

Every minigame class accepts `{ onSuccess, onFailure }` in its constructor options and exposes a `cancel()` method (called by `TeleportSystem` when the snail is teleported mid-hack).

```js
this.activeMinigame = new SequenceMinigame(scene, {
    onSuccess: () => { /* activate terminal effect */ },
    onFailure: () => { /* start short cooldown */ },
});
// Later, if teleport occurs:
this.activeMinigame.cancel();
```

### Overlay scenes (pause)

`PauseScene` is launched on top of `GameScene` without stopping it first (`this.scene.launch('PauseScene')`), then `this.scene.pause()` halts GameScene updates. Resume by calling `this.scene.resume('GameScene')` from PauseScene.
