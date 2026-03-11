/**
 * HUD — owns all GameScene heads-up display elements.
 *
 * Created once in GameScene.create() via:
 *   this.hud = new HUD(scene, { wave, hackThreshold, ammoMax, score });
 *
 * All update methods accept explicit values so GameScene doesn't need to
 * store redundant refs; the HUD owns its own Phaser objects.
 */
export default class HUD {
    constructor(scene, { wave, hackThreshold, ammoMax, score }) {
        this.scene  = scene;
        this.ammoMax = ammoMax;

        // ── Snail health bar — top-left ───────────────────────────────────────
        scene.add.text(10, 10, 'GERALD HP', {
            fontSize: '12px', fontFamily: 'monospace', color: '#44ff88',
        }).setDepth(100);
        this.healthBarBg   = scene.add.rectangle(10, 28, 204, 14, 0x333333).setOrigin(0, 0).setDepth(100);
        this.healthBarFill = scene.add.rectangle(12, 30, 200, 10, 0x44ff44).setOrigin(0, 0).setDepth(100);

        // ── Wave label — top-centre-left ──────────────────────────────────────
        this.waveLabel = scene.add.text(510, 10, `WAVE ${wave}`, {
            fontSize: '14px', fontFamily: 'monospace', color: '#ffdd44',
        }).setOrigin(0.5, 0).setDepth(100);

        // ── Hack progress — below wave label ──────────────────────────────────
        this.hackProgressLabel = scene.add.text(510, 28, `HACK: 0 / ${hackThreshold}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#00ffcc',
        }).setOrigin(0.5, 0).setDepth(100);

        // ── Score — top-centre ────────────────────────────────────────────────
        this.scoreLabel = scene.add.text(640, 10, `SCORE: ${score}`, {
            fontSize: '18px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(100);

        // ── Ammo — top-right (counter + bullet icon) ──────────────────────────
        this._ammoMax = ammoMax;

        // Small procedural bullet icon
        const bulletGfx = scene.add.graphics().setDepth(100);
        this._drawBulletIcon(bulletGfx, 1252, 18);
        this._bulletIcon = bulletGfx;

        this.ammoCounter = scene.add.text(1244, 10, `${ammoMax}/${ammoMax}`, {
            fontSize: '14px', fontFamily: 'monospace', color: '#ffdd44',
        }).setOrigin(1, 0).setDepth(100);

        this.lowAmmoLabel = scene.add.text(1270, 38, '! LOW AMMO !', {
            fontSize: '10px', fontFamily: 'monospace', color: '#ff4444',
        }).setOrigin(1, 0).setDepth(100).setVisible(false);

        // ── Grab hand status — below ammo ─────────────────────────────────────
        this.grabLabel = scene.add.text(1270, 54, 'GRAB: READY', {
            fontSize: '10px', fontFamily: 'monospace', color: '#cc66ff',
        }).setOrigin(1, 0).setDepth(100);
    }

    /** Draw a small bullet icon (casing + tip) centred on (cx, cy). */
    _drawBulletIcon(g, cx, cy, color = 0xffdd44) {
        g.clear();
        // Casing
        g.fillStyle(color, 1);
        g.fillRect(cx - 3, cy - 5, 6, 9);
        // Tip (triangle)
        g.fillTriangle(cx - 3, cy - 5, cx + 3, cy - 5, cx, cy - 10);
        // Rim highlight
        g.fillStyle(0xffffff, 0.35);
        g.fillRect(cx - 3, cy + 2, 6, 2);
    }

    updateAmmo(ammo) {
        const low = ammo <= 2 && ammo > 0;
        const hexColor = low ? 0xff4444 : 0xffdd44;
        const cssColor = low ? '#ff4444' : '#ffdd44';
        this.ammoCounter.setText(`${ammo}/${this._ammoMax}`).setColor(cssColor);
        this._drawBulletIcon(this._bulletIcon, 1252, 18, hexColor);
        this.lowAmmoLabel.setVisible(low);
    }

    updateHealth(health, maxHealth) {
        const pct = health / maxHealth;
        this.healthBarFill.width = 200 * pct;
        if (pct > 0.5)       this.healthBarFill.fillColor = 0x44ff44;
        else if (pct > 0.25) this.healthBarFill.fillColor = 0xffdd44;
        else                 this.healthBarFill.fillColor = 0xff4444;
    }

    updateScore(score) {
        this.scoreLabel.setText(`SCORE: ${score}`);
    }

    updateWave(wave) {
        this.waveLabel.setText(`WAVE ${wave}`);
    }

    updateHack(progress, threshold, label = 'HACK') {
        this.hackProgressLabel.setText(`${label}: ${progress} / ${threshold}`);
    }

    // ── Boss HP bar ───────────────────────────────────────────────────────────

    showBossBar(hp, maxHp) {
        const scene  = this.scene;
        const cx     = 640;
        const BAR_W  = 400;
        const BAR_H  = 14;
        const barX   = cx - BAR_W / 2;
        const barY   = 50;

        this._bossMaxHp = maxHp;

        this._bossLabel = scene.add.text(cx, barY - 14, 'THE OVERLORD', {
            fontSize: '12px', fontFamily: 'monospace', color: '#ff4444',
        }).setOrigin(0.5, 1).setDepth(100);

        this._bossBg   = scene.add.rectangle(barX, barY, BAR_W, BAR_H, 0x330000).setOrigin(0, 0).setDepth(100);
        this._bossFill = scene.add.rectangle(barX + 1, barY + 1, BAR_W - 2, BAR_H - 2, 0xff2200).setOrigin(0, 0).setDepth(100);

        this._bossHpText = scene.add.text(cx, barY + BAR_H / 2, `${hp} / ${maxHp}`, {
            fontSize: '10px', fontFamily: 'monospace', color: '#ffffff',
        }).setOrigin(0.5, 0.5).setDepth(101);

        this.updateBossBar(hp);
    }

    updateBossBar(hp) {
        if (!this._bossFill) return;
        const pct = Math.max(0, hp / this._bossMaxHp);
        this._bossFill.width = Math.max(0, (400 - 2) * pct);
        this._bossHpText.setText(`${Math.max(0, hp)} / ${this._bossMaxHp}`);

        // Flash white on hit
        this._bossFill.fillColor = 0xffffff;
        this.scene.time.delayedCall(120, () => {
            if (this._bossFill) this._bossFill.fillColor = 0xff2200;
        });
    }

    hideBossBar() {
        this._bossLabel?.destroy();
        this._bossBg?.destroy();
        this._bossFill?.destroy();
        this._bossHpText?.destroy();
        this._bossLabel = this._bossBg = this._bossFill = this._bossHpText = null;
    }

    updateGrab(statusText, statusColor) {
        this.grabLabel.setText(statusText);
        this.grabLabel.setColor(statusColor);
    }
}
