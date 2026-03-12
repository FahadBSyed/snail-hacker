import { CONFIG } from '../config.js';

/**
 * EMP Mine — placed by the EMP_MINES terminal upgrade.
 * Sits on the ground until an alien enters trigger range, then explodes,
 * dealing CONFIG.EMP.MINE_DAMAGE to all aliens within BLAST_RADIUS
 * while ignoring ShieldAlien's energy shield.
 *
 * Can be grabbed by the P2 grab hand (state = 'ground' | 'mouse') and
 * repositioned anywhere on the arena.
 */
export default class EmpMine extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        /** @type {'ground'|'mouse'} */
        this.state           = 'ground';
        this.mousePickupDist = CONFIG.EMP.MINE_PICKUP_DIST;
        this.grabLabel       = 'MINE';        // shown in grab-hand status HUD

        this._buildVisual(scene);
    }

    _buildVisual(scene) {
        const r   = 16;
        const col = 0xffee22;

        // Outer pulsing aura (animated)
        this._aura = scene.add.graphics();
        this._aura.fillStyle(col, 0.22);
        this._aura.fillCircle(0, 0, r + 10);
        this.add(this._aura);
        scene.tweens.add({
            targets: this._aura, alpha: 0.05, yoyo: true, repeat: -1, duration: 700,
        });

        // Body
        const g = scene.add.graphics();

        // Dark fill
        g.fillStyle(0x080e14, 1);
        g.fillCircle(0, 0, r);

        // Outer ring
        g.lineStyle(2, col, 1);
        g.strokeCircle(0, 0, r);

        // Inner ring
        g.lineStyle(1, col, 0.45);
        g.strokeCircle(0, 0, r - 5);

        // Crosshair lines
        g.lineStyle(1, col, 0.5);
        g.beginPath(); g.moveTo(-(r - 2), 0); g.lineTo(r - 2, 0); g.strokePath();
        g.beginPath(); g.moveTo(0, -(r - 2)); g.lineTo(0, r - 2);  g.strokePath();

        // Diagonal tick marks at 45° on inner ring — classic mine look
        const tickR = r - 5;
        for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI / 2) + Math.PI / 4;
            const cx = Math.cos(a) * tickR, cy = Math.sin(a) * tickR;
            g.lineStyle(1.5, col, 0.8);
            g.beginPath();
            g.moveTo(cx - Math.cos(a) * 4, cy - Math.sin(a) * 4);
            g.lineTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
            g.strokePath();
        }

        // Center bright dot
        g.fillStyle(col, 1);
        g.fillCircle(0, 0, 3.5);

        this.add(g);

        // Dotted blast-radius indicator ring
        const br   = CONFIG.EMP.BLAST_RADIUS;
        const dots = 48;
        const blastRing = scene.add.graphics();
        blastRing.lineStyle(1, col, 0.25);
        for (let i = 0; i < dots; i++) {
            if (i % 2 === 0) continue;   // skip every other segment → dashed look
            const a0 = (i / dots) * Math.PI * 2;
            const a1 = ((i + 1) / dots) * Math.PI * 2;
            blastRing.beginPath();
            blastRing.arc(0, 0, br, a0, a1, false);
            blastRing.strokePath();
        }
        this.add(blastRing);

        // "EMP" label above
        this.add(scene.add.text(0, -(r + 11), 'EMP', {
            fontSize: '8px', fontFamily: 'monospace', color: '#ffee22',
        }).setOrigin(0.5));

        // Grab prompt (shown when P2 cursor is nearby — toggled by GrabHandSystem)
        this._prompt = scene.add.text(0, r + 8, '[GRAB]', {
            fontSize: '8px', fontFamily: 'monospace', color: '#ffee22',
            backgroundColor: '#00000099', padding: { x: 2, y: 1 },
        }).setOrigin(0.5).setVisible(false);
        this.add(this._prompt);
    }

    setPromptVisible(visible) {
        if (this._prompt) this._prompt.setVisible(visible);
    }
}
