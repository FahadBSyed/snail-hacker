export default class VictoryScene extends Phaser.Scene {
    constructor() {
        super('VictoryScene');
    }

    init(data = {}) {
        this.finalScore = data.score || 0;
        this.finalWave  = data.wave  || 10;
    }

    create() {
        const cx = 640;

        // Background
        this.add.rectangle(640, 360, 1280, 720, 0x000008, 1);
        for (let i = 0; i < 150; i++) {
            const sx = Phaser.Math.Between(0, 1280);
            const sy = Phaser.Math.Between(0, 720);
            const sz = Phaser.Math.FloatBetween(0.5, 2);
            this.add.circle(sx, sy, sz, 0xffffff, Phaser.Math.FloatBetween(0.3, 0.8));
        }

        // Banner
        this.add.rectangle(cx, 178, 800, 2, 0x00ff88, 0.5);
        this.add.text(cx, 150, 'GERALD SURVIVES!', {
            fontSize: '48px', fontFamily: 'monospace', color: '#00ff88',
        }).setOrigin(0.5);
        this.add.rectangle(cx, 208, 800, 2, 0x00ff88, 0.5);

        this.add.text(cx, 265, 'All waves defeated. The station is saved.', {
            fontSize: '16px', fontFamily: 'monospace', color: '#88aaaa', fontStyle: 'italic',
        }).setOrigin(0.5);

        // Stats
        this.add.text(cx, 340, `FINAL SCORE: ${this.finalScore}`, {
            fontSize: '30px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5);

        this.add.text(cx, 390, `WAVES COMPLETED: ${this.finalWave}`, {
            fontSize: '18px', fontFamily: 'monospace', color: '#cccccc',
        }).setOrigin(0.5);

        // Rating
        const rating = this._getRating(this.finalScore);
        this.add.text(cx, 440, rating.label, {
            fontSize: '20px', fontFamily: 'monospace', color: rating.color,
        }).setOrigin(0.5);

        // Replay
        const btn = this.add.text(cx, 530, '[ PLAY AGAIN ]', {
            fontSize: '28px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#00ff88'));
        btn.on('pointerout',  () => btn.setColor('#ffffff'));
        btn.on('pointerdown', () => this.scene.start('MenuScene'));
    }

    _getRating(score) {
        if (score >= 200) return { label: 'RATING: LEGENDARY', color: '#ffdd00' };
        if (score >= 120) return { label: 'RATING: ELITE',     color: '#ff8844' };
        if (score >= 60)  return { label: 'RATING: SOLDIER',   color: '#44ddff' };
        return                   { label: 'RATING: RECRUIT',   color: '#888888' };
    }
}
