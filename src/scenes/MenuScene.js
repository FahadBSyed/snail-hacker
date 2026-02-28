export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        this.add.text(centerX, 120, 'SNAIL HACKER', {
            fontSize: '64px',
            fontFamily: 'monospace',
            color: '#00ffcc',
        }).setOrigin(0.5);

        this.add.text(centerX, 220, 'A co-op arcade survival game', {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#aaaaaa',
        }).setOrigin(0.5);

        // Controls summary
        this.add.text(centerX - 200, 300, [
            'PLAYER 1 — THE SNAIL (Keyboard)',
            '  WASD: Move',
            '  E: Activate terminal',
            '  Type: Hack minigames + RELOAD',
        ].join('\n'), {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#ffdd44',
            lineSpacing: 6,
        });

        this.add.text(centerX + 40, 300, [
            'PLAYER 2 — THE SHOOTER (Mouse)',
            '  Left Click: Shoot',
            '  Right Drag: Teleport snail',
        ].join('\n'), {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#44ddff',
            lineSpacing: 6,
        });

        // Start button
        const startText = this.add.text(centerX, 500, '[ START GAME ]', {
            fontSize: '32px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        startText.on('pointerover', () => startText.setColor('#00ff88'));
        startText.on('pointerout', () => startText.setColor('#ffffff'));
        startText.on('pointerdown', () => {
            this.scene.start('GameScene');
        });
    }
}
