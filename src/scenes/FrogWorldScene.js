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
                    this.soundSynth?.play('alienRibbet');
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
        this.soundSynth.play('alienRibbet');
    }

    /**
     * Guaranteed escape frog on boss death (bypasses the random gate).
     */
    _onBossDeathFx(bx, by) {
        if (!this.sys.isActive()) return;
        if (this.frogEscapes.filter(f => f.active).length >= 5) return;
        const frog = new FrogEscape(this, bx, by);
        this.frogEscapes.push(frog);
        this.soundSynth?.play('alienRibbet');
    }
}
