import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import IntermissionScene from './scenes/IntermissionScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import VictoryScene from './scenes/VictoryScene.js';

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
    scene: [MenuScene, GameScene, IntermissionScene, GameOverScene, VictoryScene],
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
