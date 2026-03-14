# SNAIL HACKER — World 2: The Snake Pit

*Design document and implementation plan. Status: Draft.*

---

## Overview

World 2 is a parallel campaign selectable from the main menu, replacing the alien invasion theme with a reptilian jungle threat. 10 waves of snakes escalate to a climactic Anaconda boss fight. The core co-op loop (P1 hacks terminals, P2 shoots) is preserved; the **bush** mechanic adds a new spatial layer that forces both players to think about arena geometry.

---

## Open Questions (need decisions before implementation)

| # | Question | Recommendation |
|---|---|---|
| 1 | How is World 2 accessed? Same run after W10, alternate menu option, or always unlocked? | **Always available on menu** — simpler, avoids save-state complexity |
| 2 | Do upgrades carry over from World 1? | **No** — fresh upgrade pool per world; snake world could get world-specific upgrades |
| 3 | Does the escape ship still board at wave end? | **Yes** — keep identical flow; flavor text changes ("a mongoose lifts off") |
| 4 | Are bushes destructible by anything other than the BURNER terminal? | **No** — keep destruction gated on the terminal hack to make it meaningful |
| 5 | Do Python segments drop loot when destroyed? | **Yes, recommended** — small health/ammo chance per segment; rewards focused fire |

---

## World-Unique Mechanic: Bushes

### What They Are

Bushes are **static prop entities** scattered around the arena at wave start (4–7 per wave, config-driven). They are physical objects snakes can enter/exit; they do **not** block the snail's movement or player projectiles that miss a snake.

### Rules

- A snake **inside** a bush is **completely invulnerable** to projectiles.
- The snake sprite is partially visible (50% alpha, shifted slightly behind the bush sprite) — players can see *something* is there, but can't hurt it.
- The snail **can** walk into a bush (no collision). If Gerald walks through an occupied bush, hidden snakes are **flushed** immediately — they emerge and become vulnerable. This is P1's direct counterplay to hiding.
- Bushes do **not** regenerate mid-wave. Once burned (BURNER terminal), the cover is gone.
- Maximum **1 snake per bush** at a time. Snakes that try to hide in an occupied bush instead queue and approach the next nearest.

### Visual Design

- Rounded irregular blob shape, 48–64px wide.
- Green fill (`#2d6a2d`), dark green stroke, a few highlight dots.
- When a snake is hiding: bush gently rustles (subtle scale tween ±3%, period 1.2s).
- When burned: quick flash → charred grey remains (still visible but no longer provide cover — remove the invulnerability zone but keep the sprite as a scorch mark).

### Spawn Positions

Fixed per-wave layouts (not random) to ensure the arena is always readable. Early waves: bushes near edges (safe cover that's far from the station). Later waves: bushes closer to center, increasing threat radius.

---

## Snake Enemy Types

Snakes slither in from screen edges (no drop-in animation — they appear at the edge and move). They move **slower than frog aliens overall** but their bush-hiding makes the effective threat unpredictable. Spawn interval is ~30% longer than the alien equivalent.

All snakes share: sinusoidal body-wiggle motion (3–5px lateral oscillation layered on top of their heading), no directional sprites required — they always face their movement direction (single sprite rotated in-engine).

---

### 1. Basic Snake
*"Slithers toward the snail. Patient enough to wait."*

| Stat | Value |
|---|---|
| HP | 30 |
| Speed | 55 px/s |
| Contact damage | Same as BasicAlien |

**Behavior:**
- Moves toward Gerald at 55 px/s.
- Periodically (every 8–14s, randomized) decides to seek a bush instead. If a bush is free, it slithers to it and hides for 10–20s (randomized timer), then emerges and resumes hunting.
- "Coming out when another snake spawns" as originally proposed is ambiguous — **replace with a simple randomized hide timer** (10–20s). Feels more natural and is easier to tune.
- While hiding: does not attack, does not move.

**Design note:** The randomized hide timer is key. Players can't predict when it'll emerge, creating watchfulness pressure.

---

### 2. Sidewinder
*"Patient. Methodical. Always closer than you think."*

| Stat | Value |
|---|---|
| HP | 10 |
| Speed (open) | 35 px/s (slow, non-threatening) |
| Speed (dash) | 220 px/s |

**Behavior:**
- Moves very slowly toward Gerald while P2's cursor is within `CONFIG.SNAKES.SIDEWINDER.WATCH_RADIUS` (200px) of the snake's current bush.
- When the cursor moves away from the bush (beyond watch radius), the Sidewinder **dashes to the next nearest bush** — not directly at the player.
- Repeat: patient in bush → cursor away → dash to next bush → closer to station.
- When it has reached the bush nearest the station (or no closer bush exists), it switches to direct attack: dashes at Gerald.
- **Counterplay:** P2 must park the cursor near bushes that have Sidewinders in them, like a threat suppression minigame. P1 walking through a bush flushes it instantly.

**Design note:** This creates a *spatial attention* mechanic for P2. Watching many bushes simultaneously is impossible — Sidewinders create priority decisions.

---

### 3. Python
*"Ancient. Endless. One bullet isn't enough."*

| Stat | Value |
|---|---|
| Total HP | 100 (10 segments × 10 HP each) |
| Speed | 40 px/s |
| Contact damage | Standard |

**Behavior:**
- Body is composed of **10 visible segments** in a chain, each ~16px wide. The head (segment 0) leads.
- **Only the head is targetable.** Shots that hit body segments spark and bounce off.
- Exception: when Python is at 3 or fewer segments (late fight), the tail-end also becomes a hitbox (it's too short to protect fully).
- Each 10 HP of damage removes one tail segment — the body visually shrinks.
- Movement: head steers toward Gerald; each subsequent segment follows the previous one's path with a slight delay (classic snake follow-the-leader). No bush interaction.
- Does **not** use bushes. It's too large to hide.

**Open question:** Does the Python deal damage via body contact (any segment), or only head? **Recommendation: head + the 3 rearmost segments** — the middle body is "safe" to stand next to briefly. Adds texture to close-quarters.

**Visual:** Scaled gradient from bright green head to dark olive tail. Head has two yellow eye dots.

---

### 4. Burrower
*"Gone. Then suddenly not."*

| Stat | Value |
|---|---|
| HP | 30 |
| Speed (surface) | 65 px/s |
| Speed (underground) | 95 px/s |

**Behavior:**
- Straight-line charge toward Gerald.
- Burrow cycle (looping): surface 2.5s → burrow warn 0.5s → underground 2s → emerge warn 0.5s → surface.
- **While underground:** moves at 1.5× speed, completely invulnerable, no sprite visible (only a ground-ripple graphic at its position).
- **Burrow warn:** subtle dust puff + speed drop + slight sink animation (0.5s). Telegraphs the transition.
- **Emerge warn:** ground cracks/ripple where it will emerge (position is its underground position). Players have 0.5s to step away.
- **Counterplay:** P1 watches for the emerge tell and repositions. P2 times shots for the surface window.

**Design note:** Do NOT make burrow/surface intervals too short — 2.5s surface time gives P2 real shooting windows. The current numbers feel right.

---

### 5. Spitter
*"Keeps its distance. Punishes standing still."*

| Stat | Value |
|---|---|
| HP | 30 |
| Preferred range | 350–500 px from Gerald |
| Spit cooldown | 2.5s |

**Behavior:**
- Maintains preferred distance from Gerald (kites: moves away if Gerald gets close, circles if Gerald is at range).
- Every 2.5s: fires an **acid glob** projectile toward Gerald's current position (not predictive — fire-and-forget, not a tracking shot).
- On taking **any** damage: immediately darts to nearest free bush and hides for 6s, then resumes kiting.
- Does not re-emerge early from hiding even if Gerald is close.

**Acid glob:**
- Slow projectile (80 px/s). P2 can shoot it to destroy it mid-air.
- If it hits Gerald: 8 HP damage + **leaves an acid puddle** at impact point.
- **Acid puddle:** persistent 4s, 40px radius. The snail is slowed to 30% speed while inside it. Visually: bright yellow-green translucent circle, fades out.
- Multiple puddles can stack (slow doesn't stack, but the area coverage does).

**Design note:** Acid puddles are great for P1. They create no-go zones that force Gerald to path around them during hacking, making positioning harder. P2 shooting globs mid-air is a satisfying "save" moment.

---

## Boss: The Anaconda

*Wave 10 replacement. A living wall of scales that owns the arena.*

### Concept

Unlike the Overlord (who orbits and attacks from a fixed range), the Anaconda **moves across the screen** — it enters from one edge, sweeps through in a slow sinuous curve, and exits another edge. It is never stationary. Between passes it fires attacks from off-screen. Its body is so large it functions as a **moving obstacle** — colliding with any segment deals damage.

### Body Structure

- 24 segments total (each ~20px). Head is distinct (larger, 28px, with eye markings).
- Only the **head** is vulnerable to P2 shots.
- Body segments deal contact damage to Gerald if walked into.
- The Anaconda enters/exits at random edges; its path is a smooth Bezier or sinusoidal curve across the arena.

### Head Telegraph

The head **must** have a clear visual tell so P2 can reliably target it during fast passes. Implementation:

- The head pulses with a **bright yellow-white glow** (a radial gradient overlay, alpha tweened 0.4→1.0→0.4, period 600ms) at all times while the Anaconda is on-screen.
- When scales are **exposed** (bomb just hit, full-damage window): the glow shifts to **red-orange** and pulses faster (period 300ms) — unmistakable signal to "shoot now."
- An optional **targeting reticle** (thin white circle, 32px radius, 0.5 alpha) centers on the head. This disappears in phase 3 to increase difficulty — players must track the glow alone.
- Phase 3 fast passes: add a **motion blur trail** on the head (3 ghost images fading over 80ms) so its direction of movement is readable even when it's moving quickly.

### HP & Phase Structure

| Phase | HP Range | Behavior |
|---|---|---|
| Phase 1 | 400–250 | Slow passes (one cross per 8s), mild attacks |
| Phase 2 | 249–100 | Faster passes (6s), spawns Sidewinders between passes |
| Phase 3 (enrage) | 99–0 | Very fast passes (4s), spawns Burrowers, more frequent attacks |

### Shield Mechanic (replaces Frogger)

The Anaconda has **scales** instead of an energy shield. While its scales are intact, the head takes **50% reduced damage** (instead of full block).

Completing the **Snake Minigame** (see below) causes a bomb to land on the Anaconda, which:
1. Removes scale protection for 5s (head takes full damage).
2. Slows the Anaconda to 30% movement speed for 5s.
3. Deals 25 direct damage instantly.

### Attacks (between passes, fired from off-screen position)

| Attack | Description | Cooldown |
|---|---|---|
| **Venom Spit** | 3 acid globs fired in a spread toward Gerald's position. Identical to Spitter globs (destroyable, leave puddles). | 6s |
| **Constrict Zone** | A circular slow-field (identical to SLOW terminal effect) appears around the station center for 8s. | 15s |
| **Serpent Call** | Spawns 2 Sidewinders at random edges. | 20s |
| **Shed Skin** | Spawns a decoy snake body (non-moving, same sprite) that confuses targeting. Vanishes after 10s. | 25s (phase 2+) |

### Death Sequence

Same structure as the Overlord: `_dying` flag → screen shake → 3 expanding rings → segment-by-segment vanish (tail segments disappear first in sequence, 100ms apart) → large debris burst → orange flash → victory.

---

## The Snake Minigame

*Replaces FroggerMinigame for the World 2 boss fight.*

### Core Concept: "Tail Chaser"

A small grid (7×7 cells) is rendered at the bottom-center (same position as the Frogger panel). A simplified snake body moves through the grid automatically, tracing a growing path. P1 must navigate a **cursor** through the gaps in the snake's body using WASD — essentially threading a needle through a moving obstacle.

### Rules

- Snake body starts at 4 segments and grows by 1 every 2s (up to ~10 segments).
- P1's cursor starts at the grid's left edge and must reach the right edge to succeed.
- If the cursor touches a snake segment: reset to left edge (no fail, just reset — keeps frustration low).
- On cursor reaching right edge: **success** → bomb deploys → cursor resets for next run.
- No time limit on individual runs (the bomb is the incentive to go fast).
- `cancel()` on teleport, same contract as all minigames.

### Why This Works

- It's spatial and requires WASD focus (same control handoff as Frogger, so the tension resolution is identical).
- The growing snake body means each subsequent bomb gets harder to earn — the minigame naturally escalates alongside the boss.
- It's thematically perfect: you're "dodging the anaconda" on a small scale.

---

## My Suggested Design Additions

### World-Specific Terminals

Add two new terminals unique to the snake world (offered in the upgrade pool alongside the existing 4):

**BURNER Terminal**
- Minigame: Typing (type "BURN IT DOWN" or similar short phrase)
- Effect: All bushes ignite — snakes hiding inside are flushed immediately and stunned for 1.5s. Bushes become scorched (still visible, no longer provide cover) for the rest of the wave.
- Cooldown: 35s
- Strategic value: Hard counter to mass hiding. Best used when 3+ snakes are hiding simultaneously.

**MONGOOSE Terminal**
- Minigame: Rhythm (4 beats)
- Effect: Spawns a mongoose NPC for 12s. It auto-chases the nearest snake and bites it (deals 10 damage/bite, 1s between bites). Prioritizes hidden snakes — if a snake is in a bush, the mongoose enters the bush and chases it out.
- Cooldown: 40s
- Strategic value: Active threat that pressures hiding enemies without requiring P1 to reposition.

### Venomous Contact

When any snake damages Gerald, apply a **venom debuff** for 3s:
- Gerald's movement speed reduced by 30%.
- A purple tint on Gerald's overhead text (not a sprite tint — use a colored text overlay, canvas-safe).
- No stacking — refreshes on each contact.

This makes snake contact feel meaningfully different from alien contact, and incentivizes the shield terminal.

### Slither Trail

Snakes leave a faint **slither trail** (pale green, ~6px wide, fades over 1.5s) as they move. This is purely visual but helps players track where snakes came from and predict paths.

### Prop Palette Changes

The snake world uses a **jungle biome**: lush greens, warm browns, gold accents. The existing `propPalettes.js` system handles this — add 10 snake-world palettes (waves 1–10) with:
- Rock color: mossy brown/grey (`#6b5c3e`)
- Flora color: bright jungle green (`#3d8c3d`)

### Background Assets

Generate 10 new jungle backgrounds (`bg-s-00.svg` → `bg-s-09.svg`) distinct from the planet backdrops. Dense foliage borders, visible canopy, warm amber sky. Or: reuse existing backgrounds with a warm green color overlay (simpler, still effective).

---

## Implementation Plan

### Phase 1 — Foundation (Bushes + Basic Snake)

**Step W2-1: Bush entity**
- `src/entities/Bush.js` — Container with graphics blob, `isOccupied` flag
- Bush stores reference to occupying snake (`this.occupant`)
- `GameScene._spawnBushes(count)` at wave start; positions read from wave config
- Add to collision pass: skip snake in `checkProjectileCollisions` if `snake.hidingInBush`

**Step W2-2: World select UI**
- `MenuScene.js` — "WORLD 1: INVASION" and "WORLD 2: THE PIT" buttons
- Pass `{ world: 2 }` to `GameScene` via `scene.start`
- `GameScene.init()` reads world, passes to `WaveManager`

**Step W2-3: WaveManager snake config**
- `WaveManager.js` — add snake world wave table (10 waves, escalating types)
- Wave 1: Basic only, 4 bushes, 2500ms spawn interval
- Wave 3+: Sidewinder added, 5 bushes
- Wave 5+: Burrower + Spitter added, 6 bushes
- Wave 8+: Python added, 7 bushes, 1800ms interval
- Wave 10: Anaconda boss

**Step W2-4: BasicSnake entity**
- `src/entities/snakes/BasicSnake.js` extends BaseAlien pattern
- Sinusoidal wiggle overlay on movement
- Hide timer logic: pick nearest free bush, tween to it, set `hidingInBush = true`
- Gerald-walks-through flush: checked in `GameScene.update()` proximity loop

### Phase 2 — Remaining Enemy Types

**Step W2-5: Sidewinder**
- `src/entities/snakes/Sidewinder.js`
- Track P2 cursor distance to self each frame
- Bush-hop logic: on cursor-away event, pick next-nearest bush (closer to station than current)
- Terminal attack state when no closer bush exists

**Step W2-6: Python**
- `src/entities/snakes/Python.js`
- Segment chain: array of `{x, y}` history positions; each segment renders at `history[i * SPACING]`
- `takeDamage()` removes last segment, recalculates hitbox
- Head-only collision check in `CollisionSystem`

**Step W2-7: Burrower**
- `src/entities/snakes/Burrower.js`
- State machine: SURFACE → WARN_BURROW → UNDERGROUND → WARN_EMERGE → SURFACE
- Ground ripple graphic (expanding ellipse, fades) at underground position
- Dust puff tween on state transitions

**Step W2-8: Spitter + AcidGlob**
- `src/entities/snakes/Spitter.js` — kiting behavior, shoot-and-hide
- `src/entities/AcidGlob.js` — slow projectile, destroyable by P2, spawns AcidPuddle on hit
- `src/entities/AcidPuddle.js` — timed area, slows snail on overlap

### Phase 3 — Boss

**Step W2-9: Snake minigame**
- `src/minigames/SnakeMinigame.js` — 7×7 grid, moving snake body, cursor navigation
- Same contract as FroggerMinigame (onSuccess, onFailure, cancel())

**Step W2-10: AnacondaBoss entity**
- `src/entities/snakes/AnacondaBoss.js`
- Bezier path generation for screen-crossing movement
- 24-segment chain (same algorithm as Python but much longer)
- Scale mechanic (50% damage reduction until bomb hit)
- 3-phase behavior (speed + attack frequency)
- All 4 attacks wired to callbacks (same pattern as BossAlien)
- Head telegraph: pulsing glow overlay (Graphics child, redrawn each frame); color/speed driven by `_exposed` flag and current phase; targeting reticle shown in phases 1–2 only; 3-ghost motion trail in phase 3

**Step W2-11: Boss HUD adaptation**
- `HUD.showBossBar()` already exists — reuse it
- Change label to "THE ANACONDA"
- Add scale-status indicator (glowing icon next to HP bar: "SCALED" / "EXPOSED")

### Phase 4 — Polish

**Step W2-12: World-specific terminals**
- BURNER and MONGOOSE terminal types in `Terminal.js`
- Add to `GameScene._spawnUpgradeTerminals()` for snake world
- Add to `IntermissionScene` upgrade pool for world 2

**Step W2-13: Venom debuff**
- `GameScene`: on snake contact damage, set `this._snailVenomed = true`, start 3s timer
- `Snail.update()`: if venomed, apply 0.7× speed multiplier
- HUD: purple "VENOMED" text near snail health bar

**Step W2-14: Sprites + backgrounds**
- `scripts/generate-snake-sprites.js` — BasicSnake, Sidewinder, Spitter, Burrower (4 rotatable sprites)
- `scripts/generate-python-sprites.js` — head + body + tail segment sprites
- `scripts/generate-anaconda-sprites.js` — large head + body segments
- `scripts/generate-jungle-backgrounds.js` — 10 jungle SVGs
- `scripts/generate-bush-sprite.js` — bush + scorched variant

**Step W2-15: Config additions**
- New `CONFIG.SNAKES` block with all balance values
- `CONFIG.WORLD2_WAVES` array (parallel to `CONFIG.WAVES`)
- Bump `CONFIG_VERSION`

---

## Config Block (draft)

```js
SNAKES: {
    SPAWN_INTERVAL_MULT:   1.3,   // relative to alien spawn intervals
    BASIC: {
        HP: 30, SPEED: 55,
        HIDE_TIMER_MIN: 10000, HIDE_TIMER_MAX: 20000,
        HIDE_CHANCE: 0.4,          // probability of choosing to hide vs continuing to hunt
    },
    SIDEWINDER: {
        HP: 10, SPEED_SLOW: 35, SPEED_DASH: 220,
        WATCH_RADIUS: 200,         // px — cursor distance that suppresses dash
    },
    PYTHON: {
        HP_PER_SEGMENT: 10,
        SEGMENT_COUNT: 10,
        SEGMENT_SPACING: 18,       // px between segment centers
        SPEED: 40,
        TAIL_HITBOX_SEGMENTS: 3,   // how many tail segs are hittable when small
    },
    BURROWER: {
        HP: 30, SPEED_SURFACE: 65, SPEED_UNDERGROUND: 95,
        SURFACE_DURATION: 2500,
        UNDERGROUND_DURATION: 2000,
        TRANSITION_DURATION: 500,
    },
    SPITTER: {
        HP: 30,
        PREFERRED_RANGE: { MIN: 350, MAX: 500 },
        SPIT_COOLDOWN: 2500,
        HIDE_DURATION: 6000,
        GLOB_SPEED: 80,
        GLOB_DAMAGE: 8,
        PUDDLE_DURATION: 4000,
        PUDDLE_RADIUS: 40,
        PUDDLE_SLOW_MULT: 0.3,
    },
    VENOM: {
        DURATION: 3000,
        SPEED_MULT: 0.7,
    },
},
ANACONDA: {
    HP: 600,
    SEGMENT_COUNT: 24,
    SEGMENT_SPACING: 22,
    PHASE2_HP: 250,
    PHASE3_HP: 100,
    PASS_DURATION_P1: 8000,        // ms for one screen crossing, phase 1
    PASS_DURATION_P2: 6000,
    PASS_DURATION_P3: 4000,
    SCALE_DAMAGE_MULT: 0.5,
    BOMB_DAMAGE: 25,
    BOMB_SLOW_DURATION: 5000,
    BOMB_EXPOSED_DURATION: 5000,
    ATTACK_COOLDOWNS: {
        VENOM_SPIT: 6000,
        CONSTRICT: 15000,
        SERPENT_CALL: 20000,
        SHED_SKIN: 25000,
    },
},
BUSHES: {
    COUNT_BY_WAVE: [4, 4, 5, 5, 6, 6, 6, 7, 7, 0],   // wave 10 = boss, no bushes
    FLUSH_RADIUS: 30,              // Gerald proximity that flushes a hiding snake
    BURN_STUN_DURATION: 1500,
    MONGOOSE_DURATION: 12000,
    MONGOOSE_DAMAGE: 10,
    MONGOOSE_BITE_INTERVAL: 1000,
},
```

---

## What Else Should We Add?

Here are open design threads worth discussing:

**1. World 2 unique upgrades**
The current upgrade pool (Cannon, Shield, Slow, Repair, passives) all work fine in the snake world. But consider adding world-exclusive upgrades:
- **Antivenom** passive: venom duration halved, or immunity entirely at tier 2
- **Herpetologist** passive: reveals which bush each snake is hiding in (glowing outline through the bush)
- **Flamethrower** terminal: cone-shaped AoE shot that hits everything in a wedge, ignores bush cover for one shot

**2. Anaconda weak point telegraph** ✓ *Confirmed — see Head Telegraph section above.*
Pulsing yellow-white glow at all times; shifts red-orange during exposed window; reticle present in phases 1–2, removed in phase 3 for difficulty; motion-blur trail in phase 3 to keep direction readable.

**3. Python loot drops**
Each destroyed Python segment has a 20% chance to drop a health pickup. Rewards focused fire on the Python and gives P1 a reason to path near dying Pythons rather than avoiding them.

**4. Wave 10 bush suppression**
The Anaconda fight should have no bushes (table already shows 0). This focuses the fight on the boss mechanics without bush-hiding distractions.

**5. Sound design**
The snake world needs distinct audio:
- Hiss on snake spawn / snake contact
- Wet thud for acid glob impact
- Rumble for Burrower underground movement
- Low drone / jungle ambience for background music
- Distinctive "coiling" sound for Anaconda's Constrict attack

**6. Victory screen**
The VictoryScene should vary text for World 2. A simple `data.world` check in `VictoryScene.init()` swaps the flavor text.
