/**
 * soundOverrides.js — Audio file overrides for SoundSynth.
 *
 * Map any SoundSynth sound name to one or more audio file paths
 * (relative to index.html). On each play, one file is chosen at random.
 *
 * Files are fetched in the background on first play; the procedural synth
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
    // Example — uncomment and add your files to assets/sounds/:
    // shoot: [
    //     'assets/sounds/shoot-a.mp3',
    //     'assets/sounds/shoot-b.mp3',
    // ],
    // explosion: ['assets/sounds/explosion.mp3'],
    // shieldReflect: ['assets/sounds/ricochet.wav'],
};
