export default class Battery extends Phaser.GameObjects.Container {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y
     */
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(42);

        // 'ground' | 'snail' | 'mouse'
        this.state = 'ground';

        // Pulsing outer glow (drawn first so it's behind the body)
        const glow = scene.add.graphics();
        glow.fillStyle(0xffdd00, 0.18);
        glow.fillCircle(0, 0, 30);
        this.add(glow);
        scene.tweens.add({
            targets: glow, alpha: 0, yoyo: true, repeat: -1, duration: 550,
        });

        // Battery body
        const g = scene.add.graphics();
        // Dark background
        g.fillStyle(0x111111, 1);
        g.fillRect(-16, -9, 32, 18);
        // Yellow border
        g.lineStyle(2, 0xffdd00, 1);
        g.strokeRect(-16, -9, 32, 18);
        // Positive terminal nub
        g.fillStyle(0xffdd00, 1);
        g.fillRect(16, -5, 5, 10);
        // Green charge fill
        g.fillStyle(0x44ff88, 0.9);
        g.fillRect(-13, -6, 26, 12);
        this.add(g);

        // "BATT" label
        this.add(scene.add.text(0, 0, 'BATT', {
            fontSize: '7px', fontFamily: 'monospace', color: '#002200',
        }).setOrigin(0.5, 0.5));

        // "PICK UP" prompt, shown when snail is nearby (managed by GameScene)
        this.promptText = scene.add.text(0, -26, '[WALK INTO]', {
            fontSize: '9px', fontFamily: 'monospace', color: '#ffdd00',
            backgroundColor: '#00000099', padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setVisible(false);
        this.add(this.promptText);
    }

    /** Show/hide the pickup prompt (called from GameScene when snail is nearby). */
    setPromptVisible(visible) {
        this.promptText.setVisible(visible);
    }
}
