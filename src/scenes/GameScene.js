import Snail from '../entities/Snail.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    create() {
        // Dark starfield background
        for (let i = 0; i < 150; i++) {
            const x = Phaser.Math.Between(0, 1280);
            const y = Phaser.Math.Between(0, 720);
            const size = Phaser.Math.FloatBetween(0.5, 2);
            const alpha = Phaser.Math.FloatBetween(0.3, 0.8);
            this.add.circle(x, y, size, 0xffffff, alpha);
        }

        // Placeholder center station marker
        const centerX = 640;
        const centerY = 360;
        const stationGraphics = this.add.graphics();
        stationGraphics.lineStyle(2, 0x00ffcc, 0.6);
        stationGraphics.strokeCircle(centerX, centerY, 50);

        // Debug text area
        this.debugText = this.add.text(10, 680, '', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#00ff00',
        }).setOrigin(0, 1);

        this.debugLines = [];
        this.maxDebugLines = 5;

        this.logDebug('GameScene loaded. Listening for input...');

        // --- Keyboard input logging ---
        this.input.keyboard.on('keydown', (event) => {
            this.logDebug(`KEY DOWN: ${event.key} (code: ${event.code})`);
        });

        this.input.keyboard.on('keyup', (event) => {
            this.logDebug(`KEY UP:   ${event.key} (code: ${event.code})`);
        });

        // --- Mouse input logging ---
        this.input.on('pointerdown', (pointer) => {
            const btn = pointer.button === 0 ? 'LEFT' : pointer.button === 2 ? 'RIGHT' : `BTN${pointer.button}`;
            this.logDebug(`MOUSE DOWN: ${btn} at (${Math.round(pointer.x)}, ${Math.round(pointer.y)})`);
        });

        this.input.on('pointerup', (pointer) => {
            const btn = pointer.button === 0 ? 'LEFT' : pointer.button === 2 ? 'RIGHT' : `BTN${pointer.button}`;
            this.logDebug(`MOUSE UP:   ${btn} at (${Math.round(pointer.x)}, ${Math.round(pointer.y)})`);
        });

        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown) {
                const btn = pointer.button === 0 ? 'LEFT' : pointer.button === 2 ? 'RIGHT' : `BTN${pointer.button}`;
                this.logDebug(`MOUSE DRAG: ${btn} at (${Math.round(pointer.x)}, ${Math.round(pointer.y)})`);
            }
        });

        // Disable right-click context menu on the canvas
        this.input.mouse.disableContextMenu();

        // --- Snail (Player 1) ---
        this.snail = new Snail(this, 300, 400);

        this.logDebug('Gerald the Snail spawned at (300, 400)');

        // Scene label
        this.add.text(640, 20, 'GAME SCENE — Input Debug Mode', {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: '#888888',
        }).setOrigin(0.5, 0);
    }

    logDebug(message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        this.debugLines.push(`[${timestamp}] ${message}`);
        if (this.debugLines.length > this.maxDebugLines) {
            this.debugLines.shift();
        }
        this.debugText.setText(this.debugLines.join('\n'));
    }

    update(time, delta) {
        this.snail.update(time, delta);
    }
}
