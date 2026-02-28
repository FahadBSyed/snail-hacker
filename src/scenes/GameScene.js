import Snail from '../entities/Snail.js';
import Projectile from '../entities/Projectile.js';
import BasicAlien from '../entities/aliens/BasicAlien.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Snail directional SVGs — rasterized at 48×48 to match viewBox
        const svgSize = { width: 48, height: 48 };
        this.load.svg('snail-right', 'assets/snail-right.svg', svgSize);
        this.load.svg('snail-left',  'assets/snail-left.svg',  svgSize);
        this.load.svg('snail-up',    'assets/snail-up.svg',    svgSize);
        this.load.svg('snail-down',  'assets/snail-down.svg',  svgSize);
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

        // --- Shooting system (Player 2) ---
        this.ammo = 10;
        this.ammoMax = 10;
        this.projectiles = [];

        this.input.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return; // left-click only
            if (this.ammo <= 0) {
                this.logDebug('CLICK — no ammo!');
                return;
            }
            this.ammo--;
            const proj = new Projectile(this, 640, 360, pointer.x, pointer.y);
            this.projectiles.push(proj);
            this.updateAmmoDisplay();
            this.logDebug(`SHOOT → (${Math.round(pointer.x)}, ${Math.round(pointer.y)}) ammo: ${this.ammo}/${this.ammoMax}`);
        });

        // --- Alien spawning ---
        this.aliens = [];
        this.score = 0;
        this.spawnTimer = this.time.addEvent({
            delay: 2000, // every 2 seconds
            callback: this.spawnAlien,
            callbackScope: this,
            loop: true,
        });

        // --- Ammo HUD (top-right) ---
        this.ammoLabel = this.add.text(1270, 10, '', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#ffdd44',
        }).setOrigin(1, 0);
        this.updateAmmoDisplay();

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

    updateAmmoDisplay() {
        this.ammoLabel.setText(`AMMO: ${this.ammo} / ${this.ammoMax}`);
    }

    spawnAlien() {
        // Pick a random edge: 0=top, 1=left, 2=right
        const edge = Phaser.Math.Between(0, 2);
        let x, y;
        if (edge === 0) { // top
            x = Phaser.Math.Between(50, 1230);
            y = -20;
        } else if (edge === 1) { // left
            x = -20;
            y = Phaser.Math.Between(50, 670);
        } else { // right
            x = 1300;
            y = Phaser.Math.Between(50, 670);
        }

        const alien = new BasicAlien(this, x, y);
        this.aliens.push(alien);
    }

    checkCollisions() {
        // Projectile vs Alien
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            for (const alien of this.aliens) {
                if (!alien.active) continue;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, alien.x, alien.y);
                if (dist < alien.radius + 4) { // 4 = projectile radius
                    proj.destroy();
                    const died = alien.takeDamage(10);
                    if (died) {
                        this.score++;
                        this.logDebug(`Alien destroyed! Score: ${this.score}`);
                    }
                    break; // projectile can only hit one alien
                }
            }
        }
    }

    update(time, delta) {
        this.snail.update(time, delta);

        // Tick projectiles, remove destroyed ones
        this.projectiles = this.projectiles.filter(p => {
            if (!p.active) return false;
            return p.update(time, delta);
        });

        // Tick aliens
        this.aliens = this.aliens.filter(alien => {
            if (!alien.active) return false;
            const status = alien.update(time, delta);
            if (status === 'reached_station') {
                this.logDebug('Alien reached station! (placeholder damage)');
                alien.destroy();
                return false;
            }
            return true;
        });

        // Collision checks
        this.checkCollisions();

        // Clean up destroyed objects
        this.projectiles = this.projectiles.filter(p => p.active);
        this.aliens = this.aliens.filter(a => a.active);
    }
}
