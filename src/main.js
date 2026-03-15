import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import PauseScene from './scenes/PauseScene.js';
import IntermissionScene from './scenes/IntermissionScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import VictoryScene from './scenes/VictoryScene.js';
import SoundSynth from './systems/SoundSynth.js';
import { SOUND_OVERRIDES } from './soundOverrides.js';

// Create and preload the shared SoundSynth before the game starts so HTTP
// fetches run during the menu. warmup() is called on the START button click
// (user gesture) to create the AudioContext and decode all pre-fetched files.
const soundSynth = new SoundSynth(SOUND_OVERRIDES);
soundSynth.preload();

const config = {
    type: Phaser.CANVAS,
    width: 1280,
    height: 720,
    backgroundColor: '#0a0a0f',
    parent: document.body,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
        },
    },
    scene: [MenuScene, GameScene, PauseScene, IntermissionScene, GameOverScene, VictoryScene],
    input: {
        mouse: {
            target: null,
            capture: true,
        },
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const game = new Phaser.Game(config);
game.registry.set('soundSynth', soundSynth);

game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
