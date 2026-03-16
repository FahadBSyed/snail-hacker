export default class PauseScene extends Phaser.Scene {
    constructor() {
        super('PauseScene');
    }

    init(data = {}) {
        this._callerKey = data.callerKey || 'FrogWorldScene';
    }

    create() {
        const cx = 640, cy = 360;

        // Semi-transparent backdrop over the frozen GameScene
        this.add.rectangle(cx, cy, 1280, 720, 0x000000, 0.65);

        // Panel
        this.add.rectangle(cx, cy, 420, 320, 0x0a0a1a, 0.95)
            .setStrokeStyle(2, 0x4444aa, 0.8);

        // Title
        this.add.text(cx, cy - 120, 'PAUSED', {
            fontSize: '42px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5);

        // Divider
        this.add.rectangle(cx, cy - 80, 320, 1.5, 0x4444aa, 0.6);

        // Control reminder
        this.add.text(cx, cy - 50, 'P1: WASD + E to hack\nP2: Left-click to shoot / grab\n     Right-drag to teleport', {
            fontSize: '13px', fontFamily: 'monospace', color: '#666688',
            align: 'center', lineSpacing: 6,
        }).setOrigin(0.5);

        // RESUME button
        const resumeBtn = this._makeButton(cx, cy + 40, '[ RESUME ]', '#44ff88');
        resumeBtn.on('pointerdown', () => this._resume());

        // MAIN MENU button
        const menuBtn = this._makeButton(cx, cy + 105, '[ MAIN MENU ]', '#aaaaaa');
        menuBtn.on('pointerdown', () => {
            this.scene.stop(this._callerKey);
            this.scene.start('MenuScene');
        });

        // ESC or P to resume
        this.input.keyboard.on('keydown-ESC', () => this._resume());
        this.input.keyboard.on('keydown-P',   () => this._resume());
    }

    _makeButton(x, y, label, color) {
        const btn = this.add.text(x, y, label, {
            fontSize: '26px', fontFamily: 'monospace', color,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setAlpha(0.7));
        btn.on('pointerout',  () => btn.setAlpha(1.0));
        return btn;
    }

    _resume() {
        this.scene.resume(this._callerKey);
        this.scene.stop();          // stop PauseScene itself
    }
}
