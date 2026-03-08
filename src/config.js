const STORAGE_KEY = 'snail-hacker-config';
const CONFIG_VERSION = 3;  // increment whenever DEFAULTS change in a breaking way

export const DEFAULTS = {
    DEV_MODE: true,
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
        DRONE_INTERVAL:   60000,  // ms between autonomous drone activations
    },

    CANNON: {
        FIRE_INTERVAL:   1000,   // ms between auto-shots while active
        ACTIVE_DURATION: 25000,  // ms of continuous firing
        COOLDOWN:        20000,  // ms — cannon's own recharge after activation
    },

    MINIGAMES: {
        SEQUENCE_TIME_LIMIT:   4000,  // ms to complete key sequence
        RHYTHM_BEATS_REQUIRED: 1,     // beats to win rhythm minigame
        RHYTHM_MAX_MISSES:     1,     // allowed misses before failure
        RHYTHM_BEAT_TIMEOUT:   2500,  // ms before auto-miss per beat
        TYPING_MS_PER_CHAR:    1500,  // ms per character in typing minigame
    },

    RELOAD: {
        DELAY: 2000,  // ms after typing RELOAD before ammo refills
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
