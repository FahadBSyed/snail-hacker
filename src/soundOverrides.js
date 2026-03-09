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
 *   waveBegin, waveStart, droneActivate, upgradeSelect
 */
export const SOUND_OVERRIDES = {
    // Examples — uncomment and add your files to assets/sounds/:
    // shoot: [
    //     'assets/sounds/shoot-a.mp3',
    //     { url: 'assets/sounds/shoot-b.mp3', volume: 0.8 },
    // ],
    // explosion: ['assets/sounds/explosion.mp3'],
    // shieldReflect: [{ url: 'assets/sounds/ricochet.wav', volume: 0.6 }],
};
