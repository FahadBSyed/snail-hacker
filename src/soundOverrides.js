/**
 * soundOverrides.js — Audio file overrides for SoundSynth.
 *
 * Map any SoundSynth sound name to one or more audio file entries.
 * On each play, one entry is chosen at random.
 *
 * Each entry is either a plain path string (uses master volume) or an object
 * with a `url` and an optional `volume` multiplier (0–1, applied on top of
 * the master volume):
 *
 *   'assets/sounds/shoot.mp3'                        // plain string, volume 1.0
 *   { url: 'assets/sounds/shoot.mp3', volume: 0.6 }  // quieter than master
 *
 * Files are fetched in the background on first play(); the procedural synth
 * is used as fallback until loading completes, or permanently if loading
 * fails (e.g. when running from file:// without a local server).
 *
 * All entries are optional — omit a name to keep its procedural sound.
 *
 * Valid sound names:
 *   shoot, explosion, damage, shieldActivate, shieldReflect, slowActivate,
 *   slowTick, cannonFire, error, wordSuccess, rhythmHit, healthPickup,
 *   batteryPickup, grab, powerLoss, powerRegain, escape, waveComplete,
 *   waveBegin, waveStart, droneActivate, upgradeSelect,
 *   slithering  ← looped via playLooped(); procedural fallback built-in
 */
export const SOUND_OVERRIDES = {
    error: [
         { url: 'assets/sounds/error-a.mp3', volume: 0.15 },
         { url: 'assets/sounds/error-b.mp3', volume: 0.15 },
         { url: 'assets/sounds/error-c.mp3', volume: 0.15 }
    ],
    explosion: [
         { url: 'assets/sounds/explosion-a.mp3', volume: 0.3 },
         { url: 'assets/sounds/explosion-b.mp3', volume: 0.55 },
         { url: 'assets/sounds/explosion-c.mp3', volume: 0.3 },
         { url: 'assets/sounds/explosion-d.mp3', volume: 0.3 }
    ],
    damage: [
         { url: 'assets/sounds/damage-a.mp3', volume: 0.3 },
         { url: 'assets/sounds/damage-b.mp3', volume: 0.4 },
         { url: 'assets/sounds/damage-c.mp3', volume: 0.3 }
    ],
    grab: [
        { url: 'assets/sounds/grab.mp3', volume: 0.6 }
    ],
    ship: [
        { url: 'assets/sounds/ship-a.mp3', volume: 0.6 }
    ],
    shoot: [
         { url: 'assets/sounds/shoot-b.mp3', volume: 0.1 }
    ],
    shootTurret: [
         { url: 'assets/sounds/shoot-d.mp3', volume: 0.085 }
    ],
    success: [
         { url: 'assets/sounds/success-a.mp3', volume: 0.4 },
         { url: 'assets/sounds/success-b.mp3', volume: 0.4 },
         { url: 'assets/sounds/success-c.mp3', volume: 0.4 },
         { url: 'assets/sounds/success-d.mp3', volume: 0.4 }
    ],
    waveStart: [
        { url: 'assets/sounds/wave-start.mp3', volume: 0.4 }
    ],
    waveBegin: [
        { url: 'assets/sounds/wave-start.mp3', volume: 0.4 }
    ],
    waveEnd: [
        { url: 'assets/sounds/wave-end.mp3', volume: 0.3 }
    ],
    waveComplete: [
        { url: 'assets/sounds/wave-end.mp3', volume: 0.3 }
    ]
    // explosion: ['assets/sounds/explosion.mp3'],
    // shieldReflect: [{ url: 'assets/sounds/ricochet.wav', volume: 0.6 }],
    // slithering: [{ url: 'assets/sounds/slithering.mp3', volume: 0.5 }],
};
