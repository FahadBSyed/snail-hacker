# assets/sounds/

Drop audio files here (mp3, ogg, wav, or any format supported by your browser),
then register them in `src/soundOverrides.js`.

## Usage

Edit `src/soundOverrides.js` and add entries for any sound you want to override:

```js
export const SOUND_OVERRIDES = {
    shoot: [
        'assets/sounds/shoot-a.mp3',
        'assets/sounds/shoot-b.mp3',   // multiple files = random pick each time
    ],
    explosion: ['assets/sounds/explosion.mp3'],
};
```

## Available sound names

| Name | Triggered by |
|---|---|
| `shoot` | Player fires a projectile |
| `explosion` | Alien death |
| `damage` | Snail or station takes damage |
| `shieldActivate` | Force shield terminal hacked |
| `shieldReflect` | Projectile deflected off shield alien |
| `slowActivate` | Slow field terminal hacked |
| `slowTick` | Slow field clock tick |
| `cannonFire` | Auto-turret fires |
| `error` | Wrong key in a minigame |
| `wordSuccess` | Word/phrase completed in minigame |
| `rhythmHit` | Rhythm minigame beat hit |
| `healthPickup` | Health orb collected |
| `batteryPickup` | Battery collected |
| `grab` | Snail grabbed by P2 |
| `powerLoss` | Station loses power |
| `powerRegain` | Station regains power |
| `escape` | Snail boards escape ship |
| `waveComplete` | Wave cleared |
| `waveBegin` | Drop-in animation complete, wave starts |
| `waveStart` | New wave alert beeps |
| `droneActivate` | Drone fires |
| `upgradeSelect` | Upgrade card chosen |

## Notes

- Files are fetched in the background on first `play()` call. The procedural
  synth plays as a fallback until loading is complete (or permanently if the
  fetch fails, e.g. when opening via `file://` without a local server).
- Multiple files per name are each loaded independently; any that fail to load
  are silently skipped. If all fail, the synth fallback stays active.
