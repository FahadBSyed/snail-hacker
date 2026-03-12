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

Protect the central **Hacking Station** (cyan hexagon at screen center) from 10 escalating waves of aliens. Intermissions occur after every wave.

---

## File Structure

```
snail-hacker/
├── index.html                    ← Phaser CDN + <script type="module" src="src/main.js">
├── PLAN.md                       ← Full implementation plan — read before starting work
├── CHANGELOG.md                  ← Per-session progress log — check for current state
├── assets/
│   ├── backgrounds/              ← bg-00.svg … bg-19.svg (procedural planet backdrops,
│   │                                loaded per-wave in GameScene.preload())
│   ├── sounds/                   ← Optional audio file overrides (see soundOverrides.js)
│   └── sprites/
│       ├── PALETTE_SWAPS.md      ← Documents colour palettes for all alien sprite types
│       ├── alien/                ← alien-{frog,fast,tank,bomber,shield,boss}-{dir}.svg
│       │                            8-directional saucer sprites per type (48 SVGs)
│       ├── frog/                 ← frog-{dir}.svg + frog-hop-{dir}-f{00..03}.svg
│       │                            on-foot alien frog (20 SVGs: 4 idle + 16 hop frames)
│       ├── props/                ← rock-{0,1,2}.svg + mushroom-{0,1}.svg
│       │                            greyscale props, colorised at runtime per biome
│       ├── snail/                ← snail-{dir}.svg (4 base sprites)
│       │                            snail-walk-{dir}-f{00..05}.svg (24 walk frames)
│       │                            snail-idle-{dir}-f{00..11}.svg (48 idle frames)
│       │                            snail-hit-{dir}-f{00..15}.svg (64 hit frames)
│       ├── station/              ← station-mainframe.svg, station-gun.svg
│       └── terminal/             ← terminal-{reload,turret,shield,slow,repair}.svg
├── scripts/
│   ├── generate-snail-sprites.js       ← Base directional snail SVGs
│   ├── generate-walk-idle-sprites.js   ← Walk (6 frames) + idle (12 frames) per direction
│   ├── generate-damage-sprites.js      ← Hit animation frames (64 SVGs)
│   ├── generate-alien-enemy-sprites.js ← All alien saucer types (40 SVGs)
│   ├── generate-alien-saucer-sprites.js← Base saucer geometry shared by alien generator
│   ├── generate-boss-sprite.js         ← Boss saucer (8 directional SVGs, 96×96)
│   ├── generate-frog-sprites.js        ← On-foot frog idle + hop frames (20 SVGs)
│   ├── generate-planet-backgrounds.js  ← Procedural planet/nebula backgrounds (20 SVGs)
│   ├── generate-prop-sprites.js        ← Greyscale rock + mushroom props (5 SVGs)
│   └── generate-station-sprites.js     ← Mainframe + gun + 5 terminal sprites (7 SVGs)
└── src/
    ├── main.js                   ← Phaser.Game config (1280×720, scene registration)
    ├── config.js                 ← All balance values: DEFAULTS, live CONFIG object,
    │                                localStorage persistence, saveConfig/resetConfig
    ├── soundOverrides.js         ← Maps SoundSynth names to audio file paths/volumes
    ├── data/
    │   └── propPalettes.js       ← 20 biome palettes (rock + flora colours per wave)
    ├── scenes/
    │   ├── MenuScene.js          ← Title screen + controls summary; DEV_MODE shows
    │   │                            an in-browser balance config editor overlay
    │   ├── GameScene.js          ← Core loop: orchestrates all entities; sections are
    │   │                            create() setup, wave-flow helpers (_startEscapePhase,
    │   │                            _playDropInAnimation, _boardEscapeShip), gameplay
    │   │                            actions (_startHack, _activateSlowField, etc.),
    │   │                            drone (_setupDrone, _droneFire, _renderDroneGfx),
    │   │                            alien spawning, and update()
    │   ├── HUD.js                ← All HUD display objects + update methods; created once
    │   │                            in GameScene.create() as this.hud = new HUD(scene, opts)
    │   ├── PauseScene.js         ← Overlay scene (ESC/P); resumes parent scene
    │   ├── IntermissionScene.js  ← Between-wave: flavor text, upgrade card selection,
    │   │                            station heal, 5s auto-advance
    │   ├── GameOverScene.js      ← Station destroyed; shows wave + score, restart button
    │   └── VictoryScene.js       ← Wave 10 complete; score-based rating
    ├── entities/
    │   ├── Snail.js              ← P1 avatar; WASD + hackingActive flag + directional
    │   │                            sprites + 64-frame hit animation + shield()
    │   ├── Projectile.js         ← P2 bullet; fast Arc, self-destroys off-screen
    │   ├── HackingStation.js     ← Central hexagon; health, shield, heal, procedural draw
    │   ├── Terminal.js           ← Hackable console; IDLE/ACTIVE/COOLING_DOWN states,
    │   │                            proximity detection, [E] prompt, cooldown timer,
    │   │                            droneActivate() for autonomous drone use
    │   ├── DefenseStation.js     ← Auto-turret (CANNON); fires at nearest alien when active
    │   ├── EscapeShip.js         ← End-of-wave rescue saucer; hover-bob, boarding prompt
    │   ├── Battery.js            ← Droppable power cell; P2 grab-hand pickup
    │   ├── HealthDrop.js         ← Droppable health pickup for Gerald
    │   ├── BossProjectile.js     ← Slow-homing boss attacks (blackhole / emp / terminallock);
    │   │                            each type has unique visuals + on-hit flash/wobble
    │   ├── Decoy.js              ← Deployable fake snail that draws alien fire
    │   ├── EmpMine.js            ← Placeable AoE electric mine; detonates on alien proximity
    │   ├── FrogEscape.js         ← Decorative post-kill frog that hops off-screen
    │   ├── aliens/
    │   │   ├── alienUtils.js     ← DIRS array + angleToDir(rad) shared by all alien types
    │   │   ├── BaseAlien.js      ← Shared constructor, takeDamage, straight-line update
    │   │   ├── BasicAlien.js     ← Extends BaseAlien; 60 px/s straight movement
    │   │   ├── FastAlien.js      ← Extends BaseAlien; 150 px/s + sinusoidal zigzag override
    │   │   ├── TankAlien.js      ← Extends BaseAlien; 38 px/s, 30 HP
    │   │   ├── BomberAlien.js    ← Extends BaseAlien; AoE blast on death or snail contact
    │   │   ├── ShieldAlien.js    ← Extends BaseAlien; rotating energy ring blocks projectiles
    │   │   │                        until within SHIELD_DROP_DIST of the snail
    │   │   └── BossAlien.js      ← Wave-10 boss; elliptical orbit, phase-shift, 4 attacks,
    │   │                            shield mechanic, enrage at 50% HP
    │   └── shared/
    │       └── CooldownTimer.js  ← Reusable cooldown arc-fill + countdown text widget
    ├── systems/
    │   ├── CollisionSystem.js    ← Pure functions: checkProjectileCollisions(scene),
    │   │                            checkBomberBlast(scene, bx, by), spawnDeathBurst(scene, …)
    │   ├── WaveManager.js        ← 10-wave spawn config; intermission after every wave
    │   ├── ReloadBuffer.js       ← Passive "RELOAD" detection from global keydown stream
    │   ├── SoundSynth.js         ← Procedural Web Audio sound effects; play(name) dispatch;
    │   │                            playLooped(name) for continuous sounds; file overrides
    │   ├── TeleportSystem.js     ← Right-drag targeting line; teleports snail on release
    │   ├── GrabHandSystem.js     ← P2 right-click grab mechanic for batteries and items
    │   └── SlimeTrail.js         ← Spawns fading mucus decals behind Gerald while moving
    └── minigames/
        ├── HackMinigame.js       ← Central station word-typing hack; fills wave progress bar
        ├── MathMinigame.js       ← Single-digit arithmetic hack (alternates with typing)
        ├── FroggerMinigame.js    ← Boss fight shield-break; navigate traffic lanes with WASD
        ├── HelicopterMinigame.js ← SPACE-thrust helicopter through wall gaps
        ├── RhythmMinigame.js     ← Hit a bouncing indicator inside a target zone, N beats
        └── SequenceMinigame.js   ← Type 4–6 random (non-WASD) keys in order within timer
```

---

## Plan and Changelog

- **`PLAN.md`** — Implementation plan across 28 steps in 3 phases, plus key tension resolutions (RELOAD-vs-WASD, teleport-cancels-minigame, minigame-suppresses-movement).
- **`CHANGELOG.md`** — Per-session log of completed steps. Always check this to understand the current state of the codebase before making changes.

### Keeping docs up to date

After completing any change, **always** update the relevant markdown files before committing:

1. **`CHANGELOG.md`** — Add or append to the current session's entry. Describe what changed and why (new features, bug fixes, config additions, file additions). Use the same heading style as existing entries (`### Feature Name` with bullet details).
2. **`assets/sprites/PALETTE_SWAPS.md`** — Update whenever a new alien sprite type is added or an existing palette is changed.
3. **Any other `*.md` files** in the repo — Update if the change affects the information they document.

Do **not** modify `CLAUDE.md` itself unless the user explicitly asks.

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

> **Important:** Whenever you add, remove, or rename a key in `DEFAULTS`, you **must** increment `CONFIG_VERSION` at the top of `config.js`. The loader compares the stored version against the current one; if they differ it discards the stale localStorage value and falls back to `DEFAULTS`. Forgetting this means players who have an old config cached will silently miss the new key and see `undefined` at runtime.

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

### `setTint` / `setTintFill` are no-ops in Canvas mode

This project uses `Phaser.CANVAS` (set in `src/main.js`). In Canvas mode, Phaser's `setTint()` and `setTintFill()` methods on Sprites and Images **do nothing** — they are WebGL-only features. Do **not** use tinting to colour-shift sprites or flash objects on hit.

Instead, use one of:
- **Procedural graphics redraws** — clear and redraw a `Graphics` child each frame with the desired colour (the standard approach everywhere in this codebase).
- **Alpha flash overlay** — keep a pre-drawn coloured `Graphics` child at alpha 0, then tween its alpha to 1 and back (see `BossProjectile.onHit()` for a worked example).
- **SVG `feColorMatrix` filter** — bake the tinted colour directly into the SVG asset (used for Gerald's hit-animation frames in `assets/sprites/snail/`).
