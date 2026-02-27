export default class IntermissionScene extends Phaser.Scene {
    constructor() {
        super('IntermissionScene');
    }

    create() {
        this.add.text(640, 360, 'WAVE INTERMISSION', {
            fontSize: '32px',
            fontFamily: 'monospace',
            color: '#ffdd44',
        }).setOrigin(0.5);
    }
}
