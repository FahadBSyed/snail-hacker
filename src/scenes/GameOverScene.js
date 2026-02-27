export default class GameOverScene extends Phaser.Scene {
    constructor() {
        super('GameOverScene');
    }

    create(data) {
        const centerX = 640;

        this.add.text(centerX, 200, 'STATION DESTROYED', {
            fontSize: '48px',
            fontFamily: 'monospace',
            color: '#ff4444',
        }).setOrigin(0.5);

        this.add.text(centerX, 300, `Wave Reached: ${data.wave || 1}`, {
            fontSize: '24px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5);

        this.add.text(centerX, 340, `Score: ${data.score || 0}`, {
            fontSize: '24px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5);

        const restartText = this.add.text(centerX, 460, '[ PLAY AGAIN ]', {
            fontSize: '32px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        restartText.on('pointerover', () => restartText.setColor('#00ff88'));
        restartText.on('pointerout', () => restartText.setColor('#ffffff'));
        restartText.on('pointerdown', () => {
            this.scene.start('MenuScene');
        });
    }
}
