const STORAGE_KEY = 'snail-hacker-config';
const CONFIG_VERSION = 22;  // increment whenever DEFAULTS change in a breaking way

export const DEFAULTS = {
    DEV_MODE: true,
    DEV_START_WAVE: 1,   // DEV_MODE only — jump to this wave (1 = normal start; >1 picks upgrades first)
    _version: CONFIG_VERSION,

    PLAYER: {
        SNAIL_SPEED:       40,    // px/s
        STARTING_AMMO:     35,
        MAX_AMMO:          35,
        PROJECTILE_SPEED:    3200,  // px/s
        PROJECTILE_RADIUS:   4,     // px
        AMMO_2_REGEN_RATE:   1,     // bullets per second (Ammo Boost II passive)
    },

    SNAIL: {
        MAX_HEALTH:           100,
        INVINCIBILITY_MS:    3000,  // ms of i-frames after taking damage
        HEALTH_2_REGEN_RATE:  0.5,  // HP/s — passive regen when Health Boost II is owned
    },


    HACK: {
        BASE_WORDS:   10,  // words required to complete wave 1
        WORDS_GROWTH:  3,  // additional words required per wave above wave 1
    },

    HEALTH_DROP: {
        CHANCE:          0.3,   // probability per alien kill
        AMOUNT:         25,     // HP restored on pickup
        RADIUS:         12,     // px — pickup collision radius
        LIFETIME:     8000,     // ms before auto-despawn
        GRAVITATE_SPEED: 80,    // px/s — drops home toward snail when Health Boost II is owned
    },


    GRAB: {
        MAX_PICKUP_DISTANCE: 24,   // px — cursor must be within this radius of the snail to grab
        MAX_SPEED:           400,  // px/s — max speed while carrying snail or battery
        COOLDOWN:              7,   // s — cooldown after releasing (shared between snail and battery grabs)
        QUICK_GRAB_2_COOLDOWN: 0.5, // s — cooldown when Quick Grab II is owned
        MAX_CURSOR_DIST:      48,   // px — max distance cursor can stray from held object (= snail sprite width)
    },

    BATTERY: {
        SPAWN_RADIUS:      200,   // px from station center where the battery spawns
        SNAIL_PICKUP_DIST: 35,    // px — snail auto-picks up battery within this range
        DELIVERY_DIST:     55,    // px — snail must be within station.radius + this to deliver
        MOUSE_PICKUP_DIST: 18,    // px — mouse can grab battery within this range
        MOUSE_MAX_DRAG:    220,   // px — max total distance mouse can move battery per grab
        POWER_LOSS_WORDS:  10,    // words typed before station loses power again
    },

    ALIENS: {
        BASIC:  { SPEED: 60,  RADIUS: 16, HEALTH: 10 },
        FAST:   { SPEED: 150, RADIUS: 12, HEALTH: 10 },
        TANK:   { SPEED: 38,  RADIUS: 18, HEALTH: 30 },
        BOMBER: { SPEED: 50,  RADIUS: 18, HEALTH: 10 },
        SHIELD: { SPEED: 55,  RADIUS: 16, HEALTH: 10, SHIELD_DROP_DIST: 200 },
    },

    DAMAGE: {
        ALIEN_HIT_STATION:     10,
        ALIEN_HIT_SNAIL:       20,
        PROJECTILE_HIT_ALIEN:  10,
        BOMBER_BLAST_RADIUS:   100,
        BOMBER_BLAST_STATION:  25,
        BOMBER_BLAST_SNAIL:    40,
        BOMBER_BLAST_ALIEN:    10,
        ALIEN_REACH_DISTANCE:  50,   // px — legacy; snail contact uses alien.radius + 20
        SLOW_SPEED_MULTIPLIER: 0.4,  // fraction of normal speed under SlowField
    },

    TERMINALS: {
        PROXIMITY:        50,    // px — activation range
        FAILURE_COOLDOWN: 3000,  // ms — cooldown on minigame failure

        CANNON: {
            DURATION: 25000,  // ms — how long the turret fires
            COOLDOWN: 20000,  // ms — post-effect rest (total lockout = DURATION + this)
        },
        RELOAD: {
            COOLDOWN:     8000,  // ms — cooldown after reload use
            ORBIT_RADIUS: 260,   // px — terminal orbits the station at this radius
        },
        REPAIR: {
            COOLDOWN: 12000,  // ms — terminal cooldown after repair
            HEAL:     25,     // HP restored per repair
        },
        SHIELD: {
            DURATION: 12000,  // ms — how long the shield lasts
            COOLDOWN: 25000,  // ms — post-effect rest (total lockout = DURATION + this)
        },
        SLOW: {
            DURATION: 25000,  // ms — how long SlowField lasts
            COOLDOWN: 18000,  // ms — post-effect rest (total lockout = DURATION + this)
        },
        DRONE: {
            FIRST_SHOT_MAX: 10000,  // ms — drone fires at a random time within this window each round
            COOLDOWN:       60000,  // ms — cooldown between subsequent drone activations
        },
        DECOY: {
            DURATION: 25000,  // ms — how long the decoy lure lasts
            COOLDOWN: 22000,  // ms — terminal cooldown after deploying decoy
            HEALTH:   200,    // HP — aliens chip away at this; 0 destroys decoy early
        },
        EMP: {
            SPAWN_INTERVAL:  5000,  // ms between each mine spawn while active
            ACTIVE_DURATION: 25000, // ms of continuous mine spawning (5 mines total)
            COOLDOWN:        30000, // ms — post-effect rest (total lockout = ACTIVE_DURATION + this)
        },

        // ── Tier II active upgrades ────────────────────────────────────────
        CANNON_2: {
            DURATION:      37500,  // ms — 1.5× Tier I
            COOLDOWN:      20000,  // ms
            FIRE_INTERVAL:   500,  // ms — 2× faster than Tier I (1000 ms)
        },
        SHIELD_2: {
            DURATION: 18000,  // ms — 1.5× Tier I
            COOLDOWN: 25000,  // ms
        },
        SLOW_2: {
            DURATION:         25000,  // ms
            COOLDOWN:         18000,  // ms
            SPEED_MULTIPLIER:  0.15,  // slows aliens to 15% speed (vs 40% for Tier I)
        },
        REPAIR_2: {
            COOLDOWN:       12000,  // ms
            HEAL:              50,  // HP restored immediately
            REGEN_DURATION:  5000,  // ms of passive regen after the instant heal
            REGEN_RATE:         6,  // HP/s during regen (30 HP total)
        },
        DRONE_2: {
            FIRST_SHOT_MAX: 10000,  // ms
            COOLDOWN:       20000,  // ms — 3× faster than Tier I (60 000 ms)
        },
        DECOY_2: {
            DURATION: 37500,  // ms — 1.5× Tier I; invulnerable (no HP)
            COOLDOWN: 22000,  // ms
        },
        EMP_2: {
            SPAWN_INTERVAL:  5000,  // ms between paired mine spawns
            ACTIVE_DURATION: 25000, // ms of continuous spawning (5 pairs = 10 mines)
            COOLDOWN:        30000, // ms
            BLAST_RADIUS:      300, // px — 1.5× Tier I (200 px)
        },

        // ── Tier II passive upgrades (terminal-activated) ──────────────────
        SPEED_2: {
            DURATION:         15000,  // ms — how long the speed burst lasts
            COOLDOWN:         20000,  // ms — post-effect rest
            SPEED_MULTIPLIER:     3,  // 3× base speed while active
        },
    },

    EMP: {
        MINE_DAMAGE:      30,   // damage dealt to all aliens in blast — ignores shields
        BLAST_RADIUS:     200,  // px — both trigger distance and explosion AoE
        MINE_PICKUP_DIST: 20,   // px — cursor proximity to grab a mine
    },

    CANNON: {
        FIRE_INTERVAL: 1000,   // ms between auto-shots while active
        COOLDOWN:      20000,  // ms — cannon's own recharge after activation
    },

    MINIGAMES: {
        SEQUENCE_TIME_LIMIT:   4000,  // ms to complete key sequence
        RHYTHM_BEATS_REQUIRED: 1,     // beats to win rhythm minigame
        RHYTHM_MAX_MISSES:     0,     // allowed misses before failure (0 = must hit every beat)
        RHYTHM_BEAT_TIMEOUT:   2500,  // ms before auto-miss per beat
        TYPING_MS_PER_CHAR:    1500,  // ms per character in typing minigame
        FROGGER_TIME_LIMIT:   45000,  // ms before frogger minigame expires
        FROGGER_CROSSINGS:        3,  // successful crossings needed to win

        HELICOPTER_GRAVITY:       140,  // px/s² downward pull
        HELICOPTER_THRUST:       -130,  // px/s² upward acceleration while SPACE held
        HELICOPTER_MAX_VEL_DOWN:   90,  // terminal fall speed (px/s)
        HELICOPTER_MAX_VEL_UP:     75,  // max upward speed (px/s)
        HELICOPTER_WALL_SPEED:     90,  // wall scroll speed (px/s)
        HELICOPTER_WALL_SPACING:  120,  // horizontal distance between wall pairs (px)
        HELICOPTER_GAP_HEIGHT:     65,  // vertical gap opening (px)
        HELICOPTER_WALLS_PER_WORD:  1,  // walls cleared per progress point
    },

    RELOAD: {
        DELAY: 2000,  // ms after typing RELOAD before ammo refills
    },

    RICOCHET: {
        BASE_CHANCE:   0.8,   // probability of first bounce
        FALLOFF:       0.5,   // chance multiplier each successive bounce (0.8 → 0.4 → 0.2 …)
        SEARCH_RADIUS: 240,   // px — max distance to find next ricochet target
    },

    RICOCHET_2: {
        FALLOFF:       1.0,   // no chance reduction — every bounce stays at BASE_CHANCE
        SEARCH_RADIUS: 480,   // px — 2× Tier I search distance
    },

    LASER_2: {
        SNAP_RADIUS: 80,   // px — auto-aim snaps to nearest alien within this distance of cursor
    },

    PROPS: {
        SNAIL_RADIUS:    18,  // px — snail collision circle
        TERMINAL_RADIUS: 26,  // px — terminal collision circle
        ROCK_RADIUS:     16,  // px — rock prop collision circle
        MUSH_RADIUS:     13,  // px — mushroom prop collision circle
    },

    INTERMISSION: {
        HEAL_AMOUNT:       20,  // HP restored to snail between waves
        AUTO_ADVANCE_SECS: 5,   // seconds before auto-advancing
    },

    UPGRADES: {
        ORBIT_RADIUS:   180,  // px from station center for upgrade terminals
        MIN_SEPARATION:  80,  // min px between any two upgrade terminals
        CARDS_OFFERED:    3,  // max cards shown per upgrade selection wave
    },

    WAVES: {
        SPAWN_GRACE_MS: 3000,  // ms of no-spawn buffer at the start of each wave
    },

    SPAWN_BUDGET: {
        // Budget regenerates at (BASE_REGEN + (wave-1) * WAVE_REGEN) $/s, capped at MAX_BUDGET.
        // A spend check fires each frame; one alien or formation is purchased when affordable.
        STARTING_BUDGET:          0,  // budget each wave begins with
        STARTING_BUDGET_PER_WAVE: 0,  // additional starting budget per wave number (wave N gets + (N-1) * this)

        BASE_REGEN:   0.6,  // $/s on wave 1
        WAVE_REGEN:   0.3,  // additional $/s per wave (wave 9 → 3.0 $/s total)
        MAX_BUDGET:   25,   // cap — enough to save for the priciest formation (Phalanx ≈ $21)

        // Formation bias increases at BIAS_RATE/s since the last formation spawn (0→1).
        // At the spend check, Math.random() < bias → try formation branch (withhold if none
        // affordable); otherwise spend on a random single alien the budget can cover.
        BIAS_RATE:    0.05, // /s — reaches 1.0 after 20 s without a formation

        // Per-type alien costs; formation cost = sum of member costs.
        ALIEN_COSTS: {
            BASIC:  1,
            FAST:   2,
            TANK:   3,
            BOMBER: 2,
            SHIELD: 3,
        },
    },

    ESCAPE: {
        BOARD_RADIUS:    40,   // px — snail must be within this distance to board the ship
        ASCENT_DURATION: 1200, // ms for the ship to fly off the top of the screen
    },

    BOSS: {
        HP:                  200,   // total hit points
        PHASE_SHIFT_HP:      100,   // damage taken before each phase shift
        ORBIT_RADIUS_X:      500,   // horizontal semi-axis (px)
        ORBIT_RADIUS_Y:      130,   // vertical semi-axis (px)
        MIN_ORBIT_DIST:      400,   // px — boss is never closer than this to the station center
        MAX_ORBIT_Y:         490,   // px — y ceiling; keeps boss above the FroggerMinigame panel
        ALIEN_BURST_SPREAD:   40,   // px between side-by-side burst aliens (perpendicular to attack vector)
        ORBIT_SPEED:         0.4,   // rad/s base oscillation speed
        ENRAGE_HP:           100,   // HP threshold for enrage
        ENRAGE_ORBIT_MULT:   1.5,
        ENRAGE_COOLDOWN_MULT: 0.7,
        SHIELD_DROP_WORDS:     3,   // frogger crossings required to drop shield
        SHIELD_DOWN_DURATION: 5000, // ms shield stays down after breaking
        ALIEN_BURST_COUNT: 3,       // FastAliens spawned per burst attack
        BLACK_HOLE_HP:           30,   // projectile hits required to destroy a black hole
        BLACK_HOLE_SPEED:        80,   // px/s — slow homing toward Gerald
        BLACK_HOLE_RADIUS:       14,   // collision + visual radius (px)
        EMP_HP:                  20,   // shots to destroy an EMP projectile
        EMP_SPEED:              100,   // px/s — homes toward the station
        TERMINAL_LOCK_HP:        20,   // shots to destroy a terminal lock EMP
        TERMINAL_LOCK_SPEED:    100,   // px/s — homes toward target terminal
        TERMINAL_LOCK_DURATION: 15000, // ms terminal stays locked
        ATTACK_COOLDOWNS: {
            ALIEN_BURST:    5000,   // ms between alien burst attacks
            BLACK_HOLE:     8000,   // ms between black hole shots
            EMP:           12000,   // ms between EMP shots
            TERMINAL_LOCK: 15000,   // ms between terminal lock EMP shots
        },
    },
};

// ─── Persistence ────────────────────────────────────────────────────────────

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        const val = source[key];
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
            deepMerge(target[key], val);
        } else {
            target[key] = val;
        }
    }
    return target;
}

function loadConfig() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Discard saved config if it was written by an older version of the game.
            if (parsed._version !== CONFIG_VERSION) {
                console.info('[config] Version mismatch — resetting to defaults.');
                return structuredClone(DEFAULTS);
            }
            return deepMerge(structuredClone(DEFAULTS), parsed);
        }
    } catch (e) {
        console.warn('[config] Failed to load saved config:', e);
    }
    return structuredClone(DEFAULTS);
}

/** Live config — read by all game systems. Mutated by the in-game editor. */
export const CONFIG = loadConfig();

/** Persist current CONFIG to localStorage. */
export function saveConfig() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
    } catch (e) {
        console.warn('[config] Failed to save config:', e);
    }
}

/** Reset CONFIG to DEFAULTS and persist. */
export function resetConfig() {
    const fresh = structuredClone(DEFAULTS);
    for (const key of Object.keys(CONFIG)) delete CONFIG[key];
    Object.assign(CONFIG, fresh);
    saveConfig();
}
