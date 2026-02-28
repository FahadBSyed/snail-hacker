import { CONFIG } from '../config.js';

// Texture keys for each direction (loaded in GameScene.preload)
const DIR_TEXTURES = {
    right: 'snail-right',
    left:  'snail-left',
    up:    'snail-up',
    down:  'snail-down',
};

export default class Snail extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.state = 'IDLE'; // IDLE | MOVING | HACKING
        this.hackingActive = false;
        this.facing = 'right'; // current facing direction

        // --- Sprite (uses preloaded SVG textures) ---
        this.sprite = scene.add.image(0, 0, DIR_TEXTURES.right);
        this.add(this.sprite);

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

    setFacing(direction) {
        if (this.facing !== direction) {
            this.facing = direction;
            this.sprite.setTexture(DIR_TEXTURES[direction]);
        }
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
            this.x += dx * CONFIG.PLAYER.SNAIL_SPEED * dt;
            this.y += dy * CONFIG.PLAYER.SNAIL_SPEED * dt;
            this.setState('MOVING');

            // Update facing direction — horizontal takes priority over vertical
            if (dx > 0)      this.setFacing('right');
            else if (dx < 0) this.setFacing('left');
            else if (dy < 0) this.setFacing('up');
            else if (dy > 0) this.setFacing('down');
        } else {
            this.setState('IDLE');
        }

        // Clamp to screen bounds (with a small margin for the sprite size)
        const margin = 24;
        this.x = Phaser.Math.Clamp(this.x, margin, 1280 - margin);
        this.y = Phaser.Math.Clamp(this.y, margin, 720 - margin);
    }
}
