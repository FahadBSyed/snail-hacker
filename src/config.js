const STORAGE_KEY = 'snail-hacker-config';
const CONFIG_VERSION = 3;  // increment whenever DEFAULTS change in a breaking way

export const DEFAULTS = {
    DEV_MODE: true,
    DEV_START_WAVE: 1,   // DEV_MODE only — jump to this wave (1 = normal start; >1 picks upgrades first)
    _version: CONFIG_VERSION,

    PLAYER: {
        SNAIL_SPEED:       40,    // px/s
        STARTING_AMMO:     35,
        MAX_AMMO:          35,
        PROJECTILE_SPEED:  3200,  // px/s
        PROJECTILE_RADIUS: 4,     // px
    },

    SNAIL: {
        MAX_HEALTH:       100,
        INVINCIBILITY_MS: 3000,  // ms of i-frames after taking damage
    },

    STATION: {
        MAX_HEALTH: 100,
        RADIUS:     50,  // px — collision + visual radius
    },

    HACK: {
        BASE_WORDS:   20,  // words required to complete wave 1
        WORDS_GROWTH: 20,  // additional words required per wave above wave 1
    },

    HEALTH_DROP: {
        CHANCE:   0.3,    // probability per alien kill
        AMOUNT:   25,     // HP restored on pickup
        RADIUS:   12,     // px — pickup collision radius
        LIFETIME: 8000,   // ms before auto-despawn
    },

    STATIONS: {
        RELOAD_COOLDOWN:     8000,  // ms — cooldown after reload use
        RELOAD_ORBIT_RADIUS: 260,   // px — terminal orbits the station at this radius
    },

    GRAB: {
        MAX_PICKUP_DISTANCE: 60,   // px — cursor must be within this radius of the snail to grab
        MAX_SPEED:           400,  // px/s — max speed while carrying snail or battery
        COOLDOWN:            10,   // s — cooldown after releasing (shared between snail and battery grabs)
    },

    BATTERY: {
        SPAWN_RADIUS:      200,   // px from station center where the battery spawns
        SNAIL_PICKUP_DIST: 35,    // px — snail auto-picks up battery within this range
        DELIVERY_DIST:     55,    // px — snail must be within station.radius + this to deliver
        MOUSE_PICKUP_DIST: 50,    // px — mouse can grab battery within this range
        MOUSE_MAX_DRAG:    220,   // px — max total distance mouse can move battery per grab
        POWER_LOSS_WORDS:  15,    // words typed before station loses power again
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
        PROXIMITY:        50,     // px — activation range
        FAILURE_COOLDOWN: 3000,   // ms — cooldown on minigame failure
        CANNON_COOLDOWN:  20000,  // ms — terminal cooldown after triggering cannon
        RELOAD_COOLDOWN:  8000,
        REPAIR_COOLDOWN:  12000,
        REPAIR_HEAL:      25,     // HP restored per repair
        SHIELD_COOLDOWN:  25000,
        SHIELD_DURATION:  25000,  // ms — how long the shield lasts
        SLOW_COOLDOWN:    18000,
        SLOW_DURATION:    25000,  // ms — how long SlowField lasts
        DRONE_FIRST_SHOT_MAX: 10000,  // ms — drone fires at a random time within this window each round
        DRONE_COOLDOWN:       60000,  // ms — cooldown between subsequent drone activations
        DECOY_DURATION:       12000,  // ms — how long the decoy lure lasts
        DECOY_COOLDOWN:       22000,  // ms — terminal cooldown after deploying decoy
        DECOY_HEALTH:         60,     // HP — aliens chip away at this; 0 destroys decoy early
        EMP_SPAWN_INTERVAL:    5000,  // ms between each mine spawn while active
        EMP_ACTIVE_DURATION:  25000,  // ms of continuous mine spawning (5 mines total)
        EMP_COOLDOWN:         30000,  // ms — terminal cooldown after activation
    },

    EMP: {
        MINE_DAMAGE:       30,   // damage dealt to all aliens in blast — ignores shields
        MINE_TRIGGER_DIST: 32,   // px added to alien.radius — how close alien must be
        BLAST_RADIUS:      180,  // px — explosion AoE
        MINE_PICKUP_DIST:  45,   // px — cursor proximity to grab a mine
    },

    CANNON: {
        FIRE_INTERVAL:   1000,   // ms between auto-shots while active
        ACTIVE_DURATION: 25000,  // ms of continuous firing
        COOLDOWN:        20000,  // ms — cannon's own recharge after activation
    },

    MINIGAMES: {
        SEQUENCE_TIME_LIMIT:   4000,  // ms to complete key sequence
        RHYTHM_BEATS_REQUIRED: 1,     // beats to win rhythm minigame
        RHYTHM_MAX_MISSES:     0,     // allowed misses before failure (0 = must hit every beat)
        RHYTHM_BEAT_TIMEOUT:   2500,  // ms before auto-miss per beat
        TYPING_MS_PER_CHAR:    1500,  // ms per character in typing minigame
        FROGGER_TIME_LIMIT:   45000,  // ms before frogger minigame expires
        FROGGER_CROSSINGS:        3,  // successful crossings needed to win
    },

    RELOAD: {
        DELAY: 2000,  // ms after typing RELOAD before ammo refills
    },

    RICOCHET: {
        BASE_CHANCE:   0.8,   // probability of first bounce
        FALLOFF:       0.5,   // chance multiplier each successive bounce (0.8 → 0.4 → 0.2 …)
        SEARCH_RADIUS: 400,   // px — max distance to find next ricochet target
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

    ESCAPE: {
        BOARD_RADIUS:    40,   // px — snail must be within this distance to board the ship
        ASCENT_DURATION: 1200, // ms for the ship to fly off the top of the screen
    },

    BOSS: {
        HP:                  200,   // total hit points
        PHASE_SHIFT_HP:      100,   // damage taken before each phase shift
        ORBIT_RADIUS_X:      400,   // horizontal semi-axis (px)
        ORBIT_RADIUS_Y:      130,   // vertical semi-axis (px)
        MIN_ORBIT_DIST:      260,   // px — boss is never closer than this to the station center
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
