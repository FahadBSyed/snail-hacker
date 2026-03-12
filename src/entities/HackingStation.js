import { CONFIG } from '../config.js';

// Offset of the gun mount platform centre relative to the container origin.
// Matches where the mount disc is drawn on station-mainframe.svg (96×96 canvas,
// mount centre ≈ (55, 30) in SVG coords → offset from image centre (48,48)).
const GUN_MOUNT_OX = 7;   // px right of container centre
const GUN_MOUNT_OY = -18; // px above container centre

export default class HackingStation extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);

        this.health    = 100;
        this.maxHealth = 100;

        // ── Mainframe body sprite ────────────────────────────────────────────
        this.bodyImg = scene.add.image(0, 0, 'station-mainframe').setOrigin(0.5);
        this.add(this.bodyImg);

        // Derive collision radius from the sprite's actual rendered size
        this.radius = this.bodyImg.width / 2;

        // ── Power-loss red overlay (Canvas-renderer-safe; no setTint) ──────────
        const hw = this.bodyImg.width / 2;
        const hh = this.bodyImg.height / 2;
        this._powerOverlay = scene.add.graphics();
        this._powerOverlay.fillStyle(0xff2200, 0.55);
        this._powerOverlay.fillRect(-hw, -hh, hw * 2, hh * 2);
        this._powerOverlay.setVisible(false);
        this.add(this._powerOverlay);

        // ── Gun sprite (rotates to face cursor; pivot at sprite centre) ──────
        this.gunImg = scene.add.image(GUN_MOUNT_OX, GUN_MOUNT_OY, 'station-gun').setOrigin(0.5);
        this.add(this.gunImg);

        // Muzzle-flash graphics (rendered at barrel tip, shown briefly on fire)
        this.muzzleGfx = scene.add.graphics();
        this.add(this.muzzleGfx);

        // ── Hack progress bar (shown above station) ──────────────────────────
        this.hackBarBg    = scene.add.rectangle(0, -70, 104, 12, 0x223333).setOrigin(0.5);
        this.hackBarFill  = scene.add.rectangle(-50, -70, 0, 8, 0x00ffcc).setOrigin(0, 0.5);
        this.hackBarLabel = scene.add.text(0, -82, 'HACK PROGRESS', {
            fontSize: '8px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5);
        this.add(this.hackBarBg);
        this.add(this.hackBarFill);
        this.add(this.hackBarLabel);

        // ── E prompt (hidden until snail is nearby) ──────────────────────────
        this.ePrompt = scene.add.text(0, this.radius + 25, '[E] HACK TERMINAL', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#00000099',
            padding: { x: 4, y: 2 },
        }).setOrigin(0.5).setVisible(false);
        this.add(this.ePrompt);

        this.isNearby  = false;
        this.powered   = true;
        this.offlineLabel = null;

        // Recoil tween handle (cancelled if a second shot fires during recoil)
        this._recoilTween = null;
        this._muzzleTimer = null;
    }

    // ── Gun tracking ─────────────────────────────────────────────────────────
    /**
     * Rotate the gun image to point at world-space (tx, ty).
     * Called every frame from GameScene.update().
     */
    updateGunAngle(tx, ty) {
        const angle = Phaser.Math.Angle.Between(
            this.x + GUN_MOUNT_OX, this.y + GUN_MOUNT_OY,
            tx, ty,
        );
        this.gunImg.setRotation(angle);
    }

    // ── Fire effect: recoil + muzzle flash ───────────────────────────────────
    /**
     * Call this immediately when P2 fires.
     * Plays a recoil animation and draws a brief muzzle flash at the barrel tip.
     */
    fireEffect() {
        const angle = this.gunImg.rotation;

        // Recoil: push gun backward along its axis, then spring forward
        if (this._recoilTween) this._recoilTween.stop();
        const BARREL_LEN = 14; // half barrel length (roughly, in px)
        const recoilX = GUN_MOUNT_OX - Math.cos(angle) * BARREL_LEN * 0.4;
        const recoilY = GUN_MOUNT_OY - Math.sin(angle) * BARREL_LEN * 0.4;
        this._recoilTween = this.scene.tweens.add({
            targets:  this.gunImg,
            x:        recoilX,
            y:        recoilY,
            duration: 55,
            ease:     'Sine.easeOut',
            yoyo:     true,
            onComplete: () => {
                this.gunImg.setPosition(GUN_MOUNT_OX, GUN_MOUNT_OY);
                this._recoilTween = null;
            },
        });

        // Muzzle flash: bright disc at barrel tip
        const MUZZLE_DIST = 26; // from gun mount centre to barrel tip
        const muzzleLocalX = GUN_MOUNT_OX + Math.cos(angle) * MUZZLE_DIST;
        const muzzleLocalY = GUN_MOUNT_OY + Math.sin(angle) * MUZZLE_DIST;

        const g = this.muzzleGfx;
        g.clear();
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(muzzleLocalX, muzzleLocalY, 5);
        g.fillStyle(0x88ddff, 0.7);
        g.fillCircle(muzzleLocalX, muzzleLocalY, 9);

        if (this._muzzleTimer) this._muzzleTimer.remove(false);
        this._muzzleTimer = this.scene.time.delayedCall(80, () => {
            g.clear();
            this._muzzleTimer = null;
        });
    }

    // ── Power state ──────────────────────────────────────────────────────────
    setPowered(on) {
        this.powered = on;
        this.bodyImg.setAlpha(on ? 1 : 0.55);
        this.gunImg.setAlpha(on ? 1 : 0.4);

        if (!on) {
            this._powerOverlay.setVisible(true).setAlpha(1);
            this._powerOverlayTween = this.scene.tweens.add({
                targets: this._powerOverlay, alpha: 0.1, yoyo: true, repeat: -1, duration: 350,
            });

            if (!this.offlineLabel) {
                this.offlineLabel = this.scene.add.text(0, this.radius + 40, 'POWER OUT!\nFIND BATTERY', {
                    fontSize: '11px', fontFamily: 'monospace', color: '#ff4444',
                    backgroundColor: '#00000099', padding: { x: 4, y: 2 }, align: 'center',
                }).setOrigin(0.5, 0).setDepth(201);
                this.add(this.offlineLabel);
                this.scene.tweens.add({
                    targets: this.offlineLabel, alpha: 0.2, yoyo: true, repeat: -1, duration: 400,
                });
            }
        } else {
            if (this._powerOverlayTween) {
                this._powerOverlayTween.stop();
                this._powerOverlayTween = null;
            }
            this._powerOverlay.setVisible(false);
            if (this.offlineLabel) {
                this.offlineLabel.destroy();
                this.offlineLabel = null;
            }
        }
    }

    // ── Proximity ─────────────────────────────────────────────────────────────
    updateProximity(snail) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
        const near = dist < CONFIG.TERMINALS.PROXIMITY + this.radius
            && !snail.hackingActive
            && !snail.carryingBattery
            && this.powered;
        if (near !== this.isNearby) {
            this.isNearby = near;
            this.ePrompt.setVisible(near);
        }
    }

    // ── Hack progress bar ────────────────────────────────────────────────────
    setHackProgress(fraction) {
        this.hackBarFill.width = 100 * Math.min(1, Math.max(0, fraction));
    }

    // ── Health ────────────────────────────────────────────────────────────────
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        return this.health <= 0;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }
}
