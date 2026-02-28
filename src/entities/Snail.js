const SPEED = 40; // px/s — intentionally very slow

export default class Snail extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.state = 'IDLE'; // IDLE | MOVING | HACKING
        this.hackingActive = false;

        // --- Draw the snail with Graphics ---
        const gfx = scene.add.graphics();
        this.gfx = gfx;
        this.add(gfx);
        this.drawSnail();

        // --- Overhead state label ---
        this.stateLabel = scene.add.text(0, -30, 'IDLE', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 3, y: 1 },
        }).setOrigin(0.5);
        this.add(this.stateLabel);

        // --- WASD keys ---
        this.keys = scene.input.keyboard.addKeys({
            w: Phaser.Input.Keyboard.KeyCodes.W,
            a: Phaser.Input.Keyboard.KeyCodes.A,
            s: Phaser.Input.Keyboard.KeyCodes.S,
            d: Phaser.Input.Keyboard.KeyCodes.D,
        });
    }

    drawSnail() {
        const g = this.gfx;
        g.clear();

        // Shell — brown spiral (three concentric circles offset behind body)
        g.fillStyle(0x8B5E3C, 1);
        g.fillCircle(-4, -2, 12);
        g.fillStyle(0xA0714F, 1);
        g.fillCircle(-3, -2, 8);
        g.fillStyle(0xBD8C64, 1);
        g.fillCircle(-2, -2, 4);

        // Body — tan/yellow oval
        g.fillStyle(0xE8D44D, 1);
        g.fillEllipse(6, 4, 22, 10);

        // Left antenna
        g.lineStyle(1.5, 0xE8D44D, 1);
        g.beginPath();
        g.moveTo(14, -1);
        g.lineTo(18, -12);
        g.strokePath();
        g.fillStyle(0xE8D44D, 1);
        g.fillCircle(18, -12, 2);

        // Right antenna
        g.beginPath();
        g.moveTo(10, -1);
        g.lineTo(6, -14);
        g.strokePath();
        g.fillCircle(6, -14, 2);

        // Eye
        g.fillStyle(0x000000, 1);
        g.fillCircle(14, 2, 1.5);
    }

    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.stateLabel.setText(newState);
        }
    }

    update(time, delta) {
        // Don't allow WASD movement while hacking
        if (this.hackingActive) {
            return;
        }

        const dt = delta / 1000;
        let dx = 0;
        let dy = 0;

        if (this.keys.a.isDown) dx -= 1;
        if (this.keys.d.isDown) dx += 1;
        if (this.keys.w.isDown) dy -= 1;
        if (this.keys.s.isDown) dy += 1;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }

        if (dx !== 0 || dy !== 0) {
            this.x += dx * SPEED * dt;
            this.y += dy * SPEED * dt;
            this.setState('MOVING');
        } else {
            this.setState('IDLE');
        }

        // Clamp to screen bounds (with a small margin for the sprite size)
        const margin = 15;
        this.x = Phaser.Math.Clamp(this.x, margin, 1280 - margin);
        this.y = Phaser.Math.Clamp(this.y, margin, 720 - margin);
    }
}
