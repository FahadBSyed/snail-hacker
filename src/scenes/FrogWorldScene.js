import { CONFIG } from '../config.js';
import FrogEscape from '../entities/FrogEscape.js';
import BossAlien from '../entities/aliens/BossAlien.js';
import BossProjectile from '../entities/BossProjectile.js';
import FroggerMinigame from '../minigames/FroggerMinigame.js';
import { spawnDeathBurst } from '../systems/CollisionSystem.js';
import BaseGameScene from './BaseGameScene.js';

/**
 * FrogWorldScene — World 1 (Frog aliens).
 *
 * Extends BaseGameScene with all frog-world-specific behaviour:
 *   - Wave 10 boss: The Overlord (BossAlien) with cutscene, projectiles, death sequence
 *   - Wave 10 hack: FroggerMinigame breaks the boss shield
 *   - Ribbet ambient sound timer during active waves
 *   - FrogEscape: decorative on-foot frogs that hop off-screen after frog kills
 *   - Spawn clamping on wave 10 to keep enemies above the Frogger lane
 */
export default class FrogWorldScene extends BaseGameScene {
    constructor() {
        super('FrogWorldScene');
    }

    init(data = {}) {
        // Force world = 1 regardless of what data says
        super.init({ ...data, world: 1 });
    }

    create() {
        super.create();
        // Boss and decorative frog state — FrogWorldScene-only
        this.boss            = null;
        this.bossProjectiles = [];
        this.frogEscapes     = [];
    }

    // ── Word threshold ─────────────────────────────────────────────────────────

    /** Wave 10 uses the Frogger crossing count instead of the normal word target. */
    _wordsForWave(wave) {
        if (wave === 10) return CONFIG.MINIGAMES.FROGGER_CROSSINGS;
        return super._wordsForWave(wave);
    }

    // ── Enemy spawn clamping ───────────────────────────────────────────────────

    /**
     * On wave 10 the FroggerMinigame occupies the bottom third (y > 480),
     * so clamp side-edge spawns to the top two-thirds to keep the boss
     * and its projectiles clear of that region.
     */
    _spawnMaxY() {
        return this.wave === 10 ? 460 : 670;
    }

    // ── Wave 10 hack — Frogger shield-break ───────────────────────────────────

    /**
     * Launch the FroggerMinigame to break the boss shield.
     * Returns true so BaseGameScene._startHack() skips the normal typing path.
     */
    _tryWave10Hack() {
        this.activeHack = new FroggerMinigame(this, {
            pointsNeeded: this.hackThreshold,  // = BOSS.SHIELD_DROP_WORDS (3)
            onCrossing: (count) => {
                this.hackProgress = count;
                this.hud.updateHack(this.hackProgress, this.hackThreshold, 'SHIELD');
                this.station.setHackProgress(this.hackProgress / this.hackThreshold);
            },
            onSuccess: () => {
                this.activeHack = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
                // Drop the boss shield; it auto-re-raises after SHIELD_DOWN_DURATION
                if (this.boss && this.boss.active && !this.boss._dying) {
                    this.boss.dropShield();
                    this.soundSynth.play('shieldReflect');
                    console.log('[boss] shield dropped by Frogger success');
                    this.logDebug('Boss shield broken! Shield down for 5s.');
                    this.time.delayedCall(CONFIG.BOSS.SHIELD_DOWN_DURATION, () => {
                        if (this.boss && this.boss.active && !this.boss._dying) {
                            this.boss.raiseShield();
                            this.logDebug('Boss shield back up.');
                        }
                    });
                }
                // Reset progress bar so player can break shield again
                this.hackProgress = 0;
                this.hud.updateHack(0, this.hackThreshold, 'SHIELD');
                this.station.setHackProgress(0);
            },
            onFailure: () => {
                this.activeHack = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
            },
        });
        return true;
    }

    // ── Boss: per-frame update (called by BaseGameScene._updateWorldSpecific) ──

    _updateWorldSpecific(time, delta) {
        // Boss update + projectile vs boss collision
        if (this.boss && this.boss.active && !this.boss._dying) {
            this.boss.update(time, delta);

            this.projectiles = this.projectiles.filter(proj => {
                if (!proj.active) return false;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, this.boss.x, this.boss.y);
                if (dist < this.boss.radius + CONFIG.PLAYER.PROJECTILE_RADIUS) {
                    proj.destroy();
                    if (this.boss.shielded) {
                        this.boss.flashShield();
                        this.soundSynth.play('shieldReflect');
                    } else {
                        const flash = this.add.arc(this.boss.x, this.boss.y, this.boss.radius, 0, 360, false, 0xff2200, 0.55).setDepth(55);
                        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
                        this.boss.sprite.setAlpha(0.2);
                        this.time.delayedCall(80, () => { if (this.boss?.sprite) this.boss.sprite.setAlpha(1); });
                        const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                        if (this.hud) this.hud.updateBossBar(this.boss.health);
                        if (dead) this._bossDeath();
                    }
                    return false;
                }
                return true;
            });
        }

        // Boss projectiles — update, P2 shots vs projectiles, snail/station contact
        this.bossProjectiles = this.bossProjectiles.filter(bp => {
            if (!bp.active) return false;
            const alive = bp.update(time, delta, this.snail.x, this.snail.y);
            if (!alive) return false;

            // P2 projectile vs boss projectile
            for (const proj of this.projectiles) {
                if (!proj.active) continue;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, bp.x, bp.y);
                if (dist < bp.radius + CONFIG.PLAYER.PROJECTILE_RADIUS) {
                    proj.destroy();
                    const dead = bp.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                    this.soundSynth?.play('shieldReflect');
                    if (dead) {
                        spawnDeathBurst(this, bp.x, bp.y, 0x7722cc);
                        bp.destroy();
                        return false;
                    }
                    bp.onHit();
                    break;
                }
            }

            // Type-specific contact detection
            if (bp.active) {
                if (bp.projType === 'blackhole') {
                    const snailDist = Phaser.Math.Distance.Between(bp.x, bp.y, this.snail.x, this.snail.y);
                    if (snailDist < bp.radius + 12) {
                        this._warpSnail();
                        spawnDeathBurst(this, bp.x, bp.y, 0x7722cc);
                        bp.destroy();
                        return false;
                    }
                } else if (bp.projType === 'emp') {
                    const stationDist = Phaser.Math.Distance.Between(bp.x, bp.y, this.station.x, this.station.y);
                    if (stationDist < bp.radius + this.station.radius) {
                        this._triggerPowerLoss();
                        spawnDeathBurst(this, bp.x, bp.y, 0xffcc00);
                        bp.destroy();
                        return false;
                    }
                } else if (bp.projType === 'terminallock') {
                    const term = bp._targetTerminal;
                    if (!term || !term.active) { bp.destroy(); return false; }
                    const termDist = Phaser.Math.Distance.Between(bp.x, bp.y, term.x, term.y);
                    if (termDist < bp.radius + 28) {
                        term.forceLock(CONFIG.BOSS.TERMINAL_LOCK_DURATION);
                        spawnDeathBurst(this, bp.x, bp.y, 0xff4422);
                        bp.destroy();
                        return false;
                    }
                }
            }

            return bp.active;
        });

        // FrogEscape decorations — update movement, prune destroyed ones
        for (const frog of this.frogEscapes) {
            if (frog.active) frog.update(delta);
        }
        this.frogEscapes     = this.frogEscapes.filter(f => f.active);
        this.bossProjectiles = this.bossProjectiles.filter(bp => bp.active);
    }

    // ── Boss: EMP blast + laser hit hooks ─────────────────────────────────────

    _handleEmpBossCheck(x, y, blastRadius) {
        if (!this.boss || !this.boss.active || this.boss._dying) return;
        const dist = Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y);
        if (dist >= blastRadius) return;
        const bx = this.boss.x, by = this.boss.y;
        const hitFlash = this.add.arc(bx, by, this.boss.radius, 0, 360, false, 0x00ff88, 0.75).setDepth(58);
        this.tweens.add({ targets: hitFlash, alpha: 0, duration: 240, onComplete: () => hitFlash.destroy() });
        this.tweens.add({ targets: this.boss, x: bx + 5, duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1 });
        const dead = this.boss.takeDamageRaw(CONFIG.EMP.MINE_DAMAGE);
        if (this.hud) this.hud.updateBossBar(this.boss.health);
        if (dead) this._bossDeath();
    }

    _handleLaserBossChecks(sx, sy, cos, sin, laserEnd, hitRadius) {
        // Laser vs boss
        if (this.boss && this.boss.active && !this.boss._dying) {
            const rx    = this.boss.x - sx;
            const ry    = this.boss.y - sy;
            const along = rx * cos + ry * sin;
            if (along > 0 && along <= laserEnd) {
                const perp = Math.abs(rx * sin - ry * cos);
                if (perp <= this.boss.radius) {
                    if (this.boss.shielded) {
                        this.boss.flashShield();
                        this.soundSynth.play('shieldReflect');
                        laserEnd = along;   // stop beam at shield
                    } else {
                        const flash = this.add.arc(this.boss.x, this.boss.y, this.boss.radius, 0, 360, false, 0xff2200, 0.55).setDepth(55);
                        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
                        this.boss.sprite.setAlpha(0.2);
                        this.time.delayedCall(80, () => { if (this.boss?.sprite) this.boss.sprite.setAlpha(1); });
                        const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                        if (this.hud) this.hud.updateBossBar(this.boss.health);
                        if (dead) this._bossDeath();
                        else laserEnd = along;   // surviving boss blocks the beam
                    }
                }
            }
        }

        // Laser vs boss projectiles (black holes etc.)
        this.bossProjectiles = this.bossProjectiles.filter(bp => {
            if (!bp.active) return false;
            const rx    = bp.x - sx;
            const ry    = bp.y - sy;
            const along = rx * cos + ry * sin;
            if (along <= 0 || along > laserEnd) return true;
            const perp = Math.abs(rx * sin - ry * cos);
            if (perp > bp.radius + hitRadius) return true;
            const dead = bp.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
            this.soundSynth?.play('shieldReflect');
            if (dead) {
                spawnDeathBurst(this, bp.x, bp.y, 0x7722cc);
                bp.destroy();
                return false;
            }
            bp.onHit();
            return true;
        });

        return laserEnd;
    }

    _checkBossForMineTrigger(mine, triggerR) {
        if (!this.boss || !this.boss.active || this.boss._dying) return false;
        return Phaser.Math.Distance.Between(mine.x, mine.y, this.boss.x, this.boss.y) < triggerR;
    }

    // ── Black hole warp ───────────────────────────────────────────────────────

    /** Teleport Gerald to a random position far from the station. */
    _warpSnail() {
        if (this.activeHack) { this.activeHack.cancel(); this.activeHack = null; }
        if (this.snail) this.snail.hackingActive = false;

        const angle = Math.random() * Math.PI * 2;
        const dist  = Phaser.Math.Between(260, 380);
        const wx    = Phaser.Math.Clamp(640 + Math.cos(angle) * dist, 80, 1200);
        const wy    = Phaser.Math.Clamp(360 + Math.sin(angle) * dist, 80, 460);

        this._spawnWarpRings(this.snail.x, this.snail.y, true);
        this.snail.x = wx;
        this.snail.y = wy;
        this._spawnWarpRings(wx, wy, false);

        this.soundSynth?.play('teleport');
        this.logDebug(`Black hole warp → (${Math.round(wx)}, ${Math.round(wy)})`);
    }

    /** Three staggered rings: collapse=true shrinks inward, false expands outward. */
    _spawnWarpRings(x, y, collapse) {
        for (let i = 0; i < 3; i++) {
            const r    = 8 + i * 14;
            const ring = this.add.arc(x, y, r, 0, 360, false, 0x0a0011, 0)
                .setStrokeStyle(2, collapse ? 0xbb44ff : 0x7722cc, 0.9).setDepth(62);
            this.tweens.add({
                targets:  ring,
                scaleX:   collapse ? 0.1 : 3.5,
                scaleY:   collapse ? 0.1 : 3.5,
                alpha:    0,
                delay:    i * 55,
                duration: 380,
                ease:     'Power2.easeOut',
                onComplete: () => ring.destroy(),
            });
        }
    }

    // ── Boss spawn ─────────────────────────────────────────────────────────────

    _spawnBoss() {
        // ── Target orbit position ──────────────────────────────────────────────
        const orbitAngle = 0; // enter from the right
        const targetX = 640 + Math.cos(orbitAngle) * CONFIG.BOSS.ORBIT_RADIUS_X;
        const targetY = 360 + Math.sin(orbitAngle) * CONFIG.BOSS.ORBIT_RADIUS_Y;

        // ── Lock player + hide HUD for cutscene ───────────────────────────────
        this.snail.hackingActive = true;
        this.hud.hide();

        // ── Create boss off-screen right, frozen until cutscene ends ──────────
        this.boss = new BossAlien(this, 1480, targetY, {
            onEnemyBurst: (bx, by) => {
                const count  = CONFIG.BOSS.ALIEN_BURST_COUNT;
                const spread = CONFIG.BOSS.ALIEN_BURST_SPREAD;
                const toStation = Phaser.Math.Angle.Between(bx, by, 640, 360);
                const perp      = toStation + Math.PI / 2;
                const halfOff   = (count - 1) / 2;
                for (let i = 0; i < count; i++) {
                    const off = (i - halfOff) * spread;
                    this.spawnEnemy('fast', bx + Math.cos(perp) * off, by + Math.sin(perp) * off);
                }
                this.soundSynth?.play('bossAlienBurst');
                this.logDebug(`Boss fires enemy burst! (${count} FastFrogs)`);
            },
            onBlackHole: (bx, by) => {
                this.bossProjectiles.push(new BossProjectile(this, bx, by, 'blackhole'));
                this.soundSynth?.play('bossBlackHole');
                this.logDebug('Boss fires black hole!');
            },
            onEMP: (bx, by) => {
                this.bossProjectiles.push(new BossProjectile(this, bx, by, 'emp', {
                    targetX: this.station.x, targetY: this.station.y,
                }));
                this.soundSynth?.play('bossEMP');
                this.logDebug('Boss fires EMP!');
            },
            onTerminalLockEMP: (bx, by) => {
                const eligible = this.terminals.filter(t =>
                    t.active && t.terminalState === 'IDLE' &&
                    t.label !== 'RELOAD' && t.label !== 'REPAIR',
                );
                if (eligible.length === 0) return;
                const target = Phaser.Math.RND.pick(eligible);
                this.bossProjectiles.push(new BossProjectile(this, bx, by, 'terminallock', {
                    targetX: target.x, targetY: target.y, targetTerminal: target,
                }));
                this.soundSynth?.play('bossTerminalLock');
                this.logDebug(`Boss fires terminal lock EMP at ${target.label}!`);
            },
        });
        // Freeze AI and start invisible
        this.boss._phaseShifting = true;
        this.boss.setAlpha(0);

        // ── Alert sound + flashing WARNING text ───────────────────────────────
        this.soundSynth?.play('bossAlert');

        const warnText = this.add.text(640, 300, '!! WARNING !!', {
            fontSize: '34px', fontFamily: 'monospace', color: '#ff2200',
            stroke: '#000000', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(200).setAlpha(0);

        // Flash 4 times over ~1 second
        this.tweens.add({
            targets: warnText, alpha: 1, duration: 180,
            ease: 'Sine.easeOut', yoyo: true, repeat: 3, hold: 150,
        });

        // ── Anger particles — spawn continuously during the float-in ──────────
        const ANGER_COLORS = [0xff2200, 0xff5500, 0xffaa00, 0xff0044];
        const particleTimer = this.time.addEvent({
            delay: 70, loop: true,
            callback: () => {
                if (!this.boss?.active) return;
                const angle = Math.random() * Math.PI * 2;
                const dist  = Phaser.Math.Between(12, 55);
                const speed = Phaser.Math.Between(70, 200);
                const color = ANGER_COLORS[Math.floor(Math.random() * ANGER_COLORS.length)];
                const sz    = Phaser.Math.Between(4, 11);
                const px    = this.boss.x + Math.cos(angle) * dist;
                const py    = this.boss.y + Math.sin(angle) * dist;
                const p     = this.add.circle(px, py, sz, color, 0.9).setDepth(55);
                this.tweens.add({
                    targets:  p,
                    x:        px + Math.cos(angle) * speed,
                    y:        py + Math.sin(angle) * speed,
                    alpha:    0,
                    scaleX:   0.15,
                    scaleY:   0.15,
                    duration: Phaser.Math.Between(300, 600),
                    ease:     'Power2.easeOut',
                    onComplete: () => p.destroy(),
                });
            },
        });

        // ── Boss float-in — delayed slightly so alert plays first ─────────────
        this.time.delayedCall(350, () => {
            this.tweens.add({
                targets:  this.boss,
                x:        targetX,
                alpha:    1,
                duration: 1600,
                ease:     'Power2.easeOut',
                onComplete: () => {
                    particleTimer.remove(false);

                    // Swap WARNING for arrival title card
                    warnText.setText('THE OVERLORD').setFontSize('44px').setColor('#ff2200').setAlpha(1);
                    this.soundSynth?.play('bossSpawn');

                    // Hold title, then fade out and hand control back to players
                    this.time.delayedCall(900, () => {
                        this.tweens.add({
                            targets: warnText, alpha: 0, duration: 400,
                            onComplete: () => warnText.destroy(),
                        });
                        this.boss._phaseShifting = false;
                        this.snail.hackingActive = false;
                        this.hud.show();
                        this.hud.showBossBar(this.boss.health, CONFIG.BOSS.HP);
                        this.logDebug('The Overlord has arrived!');
                    });
                },
            });
        });
    }

    // ── Boss death ─────────────────────────────────────────────────────────────

    _bossDeath() {
        if (!this.boss || !this.boss.active) return;
        this.boss._dying = true;
        this.boss._phaseShifting = false;

        const bx = this.boss.x;
        const by = this.boss.y;

        // Heavy screen shake
        this.cameras.main.shake(600, 0.02);
        this.soundSynth?.play('bossDeath');

        // Three staggered expanding rings
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 150, () => {
                const ring = this.add.arc(bx, by, this.boss ? this.boss.radius : 36, 0, 360, false, 0xff2200, 0).setDepth(60);
                ring.setStrokeStyle(4, 0xff4400, 1);
                this.tweens.add({
                    targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
                    duration: 500, ease: 'Power2.easeOut',
                    onComplete: () => ring.destroy(),
                });
            });
        }

        // Rapid white flash (8 flashes over 800ms)
        this.time.addEvent({
            delay: 100, repeat: 7,
            callback: () => {
                if (this.boss && this.boss.active) {
                    this.boss.alpha = this.boss.alpha < 0.5 ? 1 : 0.15;
                }
            },
        });

        // Clear any lingering black holes immediately
        for (const bp of this.bossProjectiles) { if (bp.active) bp.destroy(); }
        this.bossProjectiles = [];

        // Final explosion + wave end
        this.time.delayedCall(900, () => {
            if (this.boss && this.boss.active) {
                spawnDeathBurst(this, bx, by, 0xff2200);
                spawnDeathBurst(this, bx, by, 0xff8800);
                this.cameras.main.flash(500, 255, 100, 0);
                this.boss.destroy();
                this.boss = null;
            }
            this._onBossDeathFx(bx, by);
            this.hud.hideBossBar();
            this.score += 50;
            this.hud.updateScore(this.score);
            this._completeWave();
        });
    }

    // ── Ambient ribbet sound ───────────────────────────────────────────────────

    /** Schedule a sporadic ribbet while aliens are alive; re-schedules itself. */
    _startRibbetTimer() {
        if (this._ribbetTimer) { this._ribbetTimer.remove(false); this._ribbetTimer = null; }
        const scheduleNext = () => {
            const delay = Phaser.Math.Between(3500, 9000);
            this._ribbetTimer = this.time.delayedCall(delay, () => {
                if (this.enemies.some(e => e.active)) {
                    this.soundSynth?.play('frogRibbet');
                }
                scheduleNext();
            });
        };
        scheduleNext();
    }

    // ── FrogEscape decorations ─────────────────────────────────────────────────

    /**
     * 25% chance to spawn a decorative on-foot frog that hops off-screen.
     * Called after any frog-type enemy is destroyed.
     */
    spawnFrogEscape(x, y) {
        if (!this.sys.isActive()) return;
        if (Math.random() >= 0.25) return;
        if (this.frogEscapes.filter(f => f.active).length >= 5) return;
        const frog = new FrogEscape(this, x, y);
        this.frogEscapes.push(frog);
        this.soundSynth.play('frogRibbet');
    }

    /**
     * Guaranteed escape frog on boss death (bypasses the random gate).
     */
    _onBossDeathFx(bx, by) {
        if (!this.sys.isActive()) return;
        if (this.frogEscapes.filter(f => f.active).length >= 5) return;
        const frog = new FrogEscape(this, bx, by);
        this.frogEscapes.push(frog);
        this.soundSynth?.play('frogRibbet');
    }
}
