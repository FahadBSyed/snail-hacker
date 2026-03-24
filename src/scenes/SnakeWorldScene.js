import { CONFIG } from '../config.js';
import HealthDrop from '../entities/HealthDrop.js';
import Bush from '../entities/Bush.js';
import BasicSnake from '../entities/snakes/BasicSnake.js';
import Sidewinder from '../entities/snakes/Sidewinder.js';
import Python from '../entities/snakes/Python.js';
import Burrower from '../entities/snakes/Burrower.js';
import Spitter from '../entities/snakes/Spitter.js';
import Anaconda from '../entities/snakes/Anaconda.js';
import { spawnSnakeDeathAnimation } from '../entities/snakes/snakeHitReaction.js';
import { spawnDeathBurst, checkBomberBlast, BURST_COLORS } from '../systems/CollisionSystem.js';
import { buildNavGrid } from '../systems/PathfindingSystem.js';
import BaseGameScene from './BaseGameScene.js';
import SnakeMinigame from '../minigames/SnakeMinigame.js';

const SNAKE_TYPES = new Set(['basic-snake', 'sidewinder', 'spitter', 'burrower', 'python']);

/**
 * SnakeWorldScene — World 2 (Snake enemies).
 *
 * Extends BaseGameScene with snake-world-specific behaviour:
 *   - Bush props at fixed ring positions for Sidewinders to hide in
 *   - Acid globs + acid puddles (from Spitters)
 *   - Venom debuff applied on snake contact
 *   - Snake bounce on snail contact instead of destroy
 *   - Snake death animation via spawnSnakeDeathAnimation
 *   - World-specific enemy caps (total snakes, spitters, pythons)
 *   - No FrogEscape — spawnFrogEscape is a no-op
 */
export default class SnakeWorldScene extends BaseGameScene {
    constructor() {
        super('SnakeWorldScene');
    }

    init(data = {}) {
        // Force world = 2 regardless of what data says
        super.init({ ...data, world: 2 });
    }

    create() {
        super.create();
        this.boss = null;
    }

    // ── World-specific overrides ───────────────────────────────────────────────

    _spawnMaxY() {
        return 670;
    }

    // ── Boss: spawn cutscene ──────────────────────────────────────────────────

    _spawnBoss() {
        // Lock player + hide HUD for cutscene
        this.snail.hackingActive = true;
        this.hud.hide();

        // Create anaconda off-screen right; AI is live so it slithers in immediately
        this.boss = new Anaconda(this, 1400, 280);

        // Alert sound + flashing WARNING text
        this.soundSynth?.play('bossAlert');

        const warnText = this.add.text(640, 300, '!! THE ANACONDA !!', {
            fontSize: '22px', fontFamily: 'monospace', color: '#44ff88',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(110).setAlpha(0);

        this.tweens.add({ targets: warnText, alpha: 1, duration: 300, yoyo: true, repeat: 3 });

        // After 2.5 s: fade warning, restore HUD and player control
        this.time.delayedCall(2500, () => {
            this.tweens.add({
                targets: warnText, alpha: 0, duration: 400,
                onComplete: () => warnText.destroy(),
            });
            this.snail.hackingActive = false;
            this.hud.show();
            this.hud.showBossBar(this.boss.health, CONFIG.ANACONDA.HP, 'THE ANACONDA');
        });
    }

    // ── Boss: death sequence ─────────────────────────────────────────────────

    _bossDeath() {
        if (!this.boss || !this.boss.active) return;
        this.boss._dying = true;

        const bx = this.boss.x;
        const by = this.boss.y;

        this.cameras.main.shake(600, 0.02);
        this.soundSynth?.play('bossDeath');

        // Expanding rings
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 160, () => {
                const r    = this.boss ? this.boss.radius : 22;
                const ring = this.add.arc(bx, by, r, 0, 360, false, 0x44ff88, 0).setDepth(60);
                ring.setStrokeStyle(4, 0x22cc66, 1);
                this.tweens.add({
                    targets: ring, scaleX: 6, scaleY: 6, alpha: 0,
                    duration: 550, ease: 'Power2.easeOut',
                    onComplete: () => ring.destroy(),
                });
            });
        }

        // Rapid flash (head only)
        this.time.addEvent({
            delay: 100, repeat: 7,
            callback: () => {
                if (this.boss && this.boss.active) {
                    this.boss.alpha = this.boss.alpha < 0.5 ? 1 : 0.15;
                }
            },
        });

        // Final explosion + wave end
        this.time.delayedCall(900, () => {
            if (this.boss && this.boss.active) {
                spawnDeathBurst(this, bx, by, 0x44ff88);
                spawnDeathBurst(this, bx, by, 0x22aa44);
                this.cameras.main.flash(500, 0, 200, 50);
                this.boss.destroy();
                this.boss = null;
            }
            this.hud.hideBossBar();
            this.score += 50;
            this.hud.updateScore(this.score);
            this._completeWave();
        });
    }

    // ── Boss: EMP + mine hooks ────────────────────────────────────────────────

    _handleEmpBossCheck(x, y, blastRadius) {
        if (!this.boss || !this.boss.active || this.boss._dying) return;
        const dist = Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y);
        if (dist >= blastRadius) return;
        const bx = this.boss.x, by = this.boss.y;
        const hitFlash = this.add.arc(bx, by, this.boss.radius, 0, 360, false, 0x00ff88, 0.75).setDepth(58);
        this.tweens.add({ targets: hitFlash, alpha: 0, duration: 240, onComplete: () => hitFlash.destroy() });
        const dead = this.boss.takeDamageRaw(CONFIG.EMP.MINE_DAMAGE);
        if (this.hud) this.hud.updateBossBar(this.boss.health);
        if (dead) this._bossDeath();
    }

    _checkBossForMineTrigger(mine, triggerR) {
        if (!this.boss || !this.boss.active || this.boss._dying) return false;
        return Phaser.Math.Distance.Between(mine.x, mine.y, this.boss.x, this.boss.y) < triggerR;
    }

    /**
     * Spawn bushes at fixed concentric clock positions around the station.
     *   Ring 1 (r=350): 10 o'clock, 3 o'clock, 7 o'clock
     *   Ring 2 (r=250): 1 o'clock, 9 o'clock, 5 o'clock
     *   Slot 7  (r=310): 11 o'clock (used only when count ≥ 7)
     * Sidewinders naturally hop inward from ring 1 → ring 2 → attack.
     */
    _spawnWorldEntities(bushCount) {
        this._spawnBushes(bushCount);
        // Build nav grid after all static obstacles (station, terminals, bushes) are placed
        this.navGrid = buildNavGrid(this);
    }

    _spawnBushes(count) {
        for (const b of this.bushes) { if (b.active) b.destroy(); }
        this.bushes = [];
        if (!count) return;

        const CX = 640, CY = 360;
        const SLOTS = [
            // Ring 1 — outer (r=350)
            [350, 210],   // 10 o'clock
            [350,   0],   // 3  o'clock
            [350, 120],   // 7  o'clock
            // Ring 2 — inner (r=250)
            [250, 300],   // 1  o'clock
            [250, 180],   // 9  o'clock
            [250,  60],   // 5  o'clock
            // Slot 7 — mid (r=310)
            [310, 240],   // 11 o'clock
        ];

        // Clearance: terminal collision radius + bush occupy radius + small margin
        const CLEAR = CONFIG.PROPS.TERMINAL_RADIUS + CONFIG.BUSHES.OCCUPY_RADIUS + 10;

        const validSlots = SLOTS.filter(([r, deg]) => {
            const rad = deg * Math.PI / 180;
            const sx  = CX + r * Math.cos(rad);
            const sy  = CY + r * Math.sin(rad);
            return !(this.terminals ?? []).some(t =>
                Phaser.Math.Distance.Between(sx, sy, t.x, t.y) < CLEAR
            );
        });

        const n = Math.min(count, validSlots.length);
        for (let i = 0; i < n; i++) {
            const [r, deg] = validSlots[i];
            const rad = deg * Math.PI / 180;
            const x = CX + r * Math.cos(rad);
            const y = CY + r * Math.sin(rad);
            this.bushes.push(new Bush(this, x, y));
        }
    }

    /**
     * Handle a non-boss enemy being killed.
     * Snake types use spawnSnakeDeathAnimation; frog types (if any cross-world)
     * fall back to the base burst + health-drop logic.
     */
    _handleEnemyKilled(enemy, bx, by, isBomber = false) {
        if (SNAKE_TYPES.has(enemy.alienType)) {
            if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                this.time.delayedCall(120, () => {
                    this.healthDrops.push(new HealthDrop(this, bx, by));
                });
            }
            spawnSnakeDeathAnimation(this, enemy);
        } else {
            const burstColor = BURST_COLORS[enemy.alienType] || 0xffffff;
            this.time.delayedCall(200, () => {
                if (!enemy.active) return;
                spawnDeathBurst(this, bx, by, burstColor);
                if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                    this.healthDrops.push(new HealthDrop(this, bx, by));
                }
                if (isBomber) checkBomberBlast(this, bx, by);
                enemy.destroy();
            });
        }
    }

    /**
     * Snakes bounce away from the snail instead of despawning.
     * Returns true to keep the enemy alive in the enemies array.
     */
    _handleEnemySnailContact(enemy, bx, by, time) {
        if (SNAKE_TYPES.has(enemy.alienType)) {
            const bounceAngle = Phaser.Math.Angle.Between(this.snail.x, this.snail.y, bx, by);
            const bounceSpeed = enemy.speed * 2;
            enemy._bounceVx    = Math.cos(bounceAngle) * bounceSpeed;
            enemy._bounceVy    = Math.sin(bounceAngle) * bounceSpeed;
            enemy._bounceUntil = time + 3000;
            return true; // stays alive
        }
        enemy.destroy();
        return false;
    }

    /**
     * Apply venom debuff when a snake contacts the snail.
     */
    _applyContactEffect() {
        this._applyVenom();
    }

    /**
     * Update acid globs and acid puddles each frame.
     * Also tracks whether the snail is currently inside a puddle (slows movement).
     * Also updates the anaconda boss and handles projectile vs boss collisions.
     */
    _updateWorldSpecific(time, delta) {
        // Rebuild nav grid every 5 s to pick up mid-wave bush-scorch changes
        this._navRebuildMs = (this._navRebuildMs ?? 0) + delta;
        if (this._navRebuildMs >= 5000) {
            this._navRebuildMs = 0;
            this.navGrid = buildNavGrid(this);
        }

        // Acid globs — update position / landing; remove inactive
        this.acidGlobs = this.acidGlobs.filter(g => {
            if (!g.active) return false;
            g.update(delta);
            return g.active;
        });

        // Acid puddles — update fade; slow snail if inside one
        let inPuddle = false;
        this.acidPuddles = this.acidPuddles.filter(p => {
            if (!p.active) return false;
            p.update(delta);
            if (!p.active) return false;
            const d = Phaser.Math.Distance.Between(this.snail.x, this.snail.y, p.x, p.y);
            if (d < p.radius + 12) inPuddle = true;
            return true;
        });
        this._snailInPuddle = inPuddle;

        // ── Anaconda boss ────────────────────────────────────────────────────
        if (this.boss && this.boss.active && !this.boss._dying) {
            const result = this.boss.update(time, delta);

            // Head touches decoy → damage it and let the charge continue
            if (result === 'reached_decoy') {
                if (this.decoy && this.decoy.active) {
                    this.decoy.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.soundSynth?.play('shieldReflect');
                }
            }

            // Head touches snail → deal contact damage and apply venom
            if (result === 'reached_snail' && !this.boardingShip) {
                if (this.snail.shielded) {
                    this.soundSynth?.play('shieldReflect');
                } else {
                    const died = this.snail.takeDamage(CONFIG.DAMAGE.ALIEN_HIT_SNAIL);
                    this.hud.updateHealth(this.snail.health, this.snail.maxHealth);
                    this.soundSynth?.play('damage');
                    this._applyVenom();
                    if (died) {
                        if (this.waveManager) this.waveManager.active = false;
                        if (this.activeHack) { this.activeHack.cancel(); this.activeHack = null; }
                        this.scene.start('GameOverScene', { wave: this.wave, score: this.score, world: this.world });
                        return;
                    }
                }
            }

            // Projectile vs anaconda head or body
            const projR = CONFIG.PLAYER.PROJECTILE_RADIUS;
            this.projectiles = this.projectiles.filter(proj => {
                if (!proj.active) return false;

                // Head hit
                const headDist = Phaser.Math.Distance.Between(proj.x, proj.y, this.boss.x, this.boss.y);
                if (headDist < this.boss.radius + projR) {
                    proj.destroy();
                    if (this.boss.shielded) {
                        this.soundSynth?.play('shieldReflect');
                        const spark = this.add.arc(this.boss.x, this.boss.y, 6, 0, 360, false, 0x33bbff, 0.9).setDepth(58);
                        this.tweens.add({ targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 220, onComplete: () => spark.destroy() });
                    } else {
                        const flash = this.add.arc(this.boss.x, this.boss.y, this.boss.radius, 0, 360, false, 0xff2200, 0.55).setDepth(55);
                        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
                        const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                        if (this.hud) this.hud.updateBossBar(this.boss.health);
                        if (dead) this._bossDeath();
                    }
                    return false;
                }

                // Body segment hit
                for (const hb of (this.boss._bodyHitboxes || [])) {
                    if (Phaser.Math.Distance.Between(proj.x, proj.y, hb.x, hb.y) < hb.r + projR) {
                        proj.destroy();
                        if (this.boss.shielded) {
                            this.soundSynth?.play('shieldReflect');
                            const spark = this.add.arc(hb.x, hb.y, 6, 0, 360, false, 0x33bbff, 0.9).setDepth(58);
                            this.tweens.add({ targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 220, onComplete: () => spark.destroy() });
                        } else {
                            const flash = this.add.arc(hb.x, hb.y, hb.r, 0, 360, false, 0xff2200, 0.55).setDepth(55);
                            this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
                            const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
                            if (this.hud) this.hud.updateBossBar(this.boss.health);
                            if (dead) this._bossDeath();
                        }
                        return false;
                    }
                }

                return true;
            });
        }
    }

    /**
     * Laser vs anaconda: check head then every body segment, nearest-first.
     * Shielded hit: deflect + stop beam.  Unshielded hit: damage + stop beam.
     * Returns the (possibly shortened) laserEnd so the beam visual is correct.
     */
    _handleLaserBossChecks(sx, sy, cos, sin, laserEnd, hitRadius) {
        if (!this.boss || !this.boss.active || this.boss._dying) return laserEnd;

        // Build candidates: head + body segments
        const candidates = [];

        const hrx = this.boss.x - sx, hry = this.boss.y - sy;
        const hAlong = hrx * cos + hry * sin;
        if (hAlong > 0 && hAlong <= laserEnd &&
            Math.abs(hrx * sin - hry * cos) <= this.boss.radius + hitRadius) {
            candidates.push({ x: this.boss.x, y: this.boss.y, r: this.boss.radius, along: hAlong });
        }

        for (const hb of (this.boss._bodyHitboxes || [])) {
            const rx = hb.x - sx, ry = hb.y - sy;
            const along = rx * cos + ry * sin;
            if (along > 0 && along <= laserEnd &&
                Math.abs(rx * sin - ry * cos) <= hb.r + hitRadius) {
                candidates.push({ x: hb.x, y: hb.y, r: hb.r, along });
            }
        }

        if (candidates.length === 0) return laserEnd;
        candidates.sort((a, b) => a.along - b.along);
        const hit = candidates[0];

        if (this.boss.shielded) {
            this.soundSynth?.play('shieldReflect');
            // Blue spark at the impact point on the shield surface
            const spark = this.add.arc(hit.x, hit.y, 6, 0, 360, false, 0x33bbff, 0.9).setDepth(58);
            this.tweens.add({ targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 220, onComplete: () => spark.destroy() });
            return hit.along;
        }

        // Unshielded — deal damage and stop beam
        const flash = this.add.arc(hit.x, hit.y, hit.r, 0, 360, false, 0xff2200, 0.55).setDepth(55);
        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
        const dead = this.boss.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);
        if (this.hud) this.hud.updateBossBar(this.boss.health);
        if (dead) this._bossDeath();
        return hit.along;
    }

    /**
     * Flush hiding snakes when Gerald walks through an occupied bush.
     */
    _resolveWorldSpecificCollisions() {
        for (const bush of this.bushes) {
            if (!bush.active || !bush.isOccupied) continue;
            const d = Phaser.Math.Distance.Between(this.snail.x, this.snail.y, bush.x, bush.y);
            if (d < CONFIG.PROPS.SNAIL_RADIUS + CONFIG.BUSHES.OCCUPY_RADIUS) {
                bush.flush();
            }
        }
    }

    /**
     * Destroy bushes, acid globs, acid puddles, boss, and cancel venom on wave end.
     */
    _clearWorldEntities() {
        for (const bush of this.bushes)    { if (bush.active) bush.destroy(); }
        for (const g    of this.acidGlobs) { if (g.active) g.destroy(); }
        for (const p    of this.acidPuddles) { if (p.active) p.destroy(); }
        this.bushes      = [];
        this.acidGlobs   = [];
        this.acidPuddles = [];
        this._venomActive = false;
        if (this._venomTimer) { this._venomTimer.remove(false); this._venomTimer = null; }
        if (this.boss?.active) { this.boss.destroy(); this.boss = null; }
    }

    /**
     * Enforce the hard cap on total simultaneous snakes.
     * Also caps spitters at 3 and pythons at 2.
     */
    _canSpawnEnemyType(type) {
        if (SNAKE_TYPES.has(type)) {
            const snakeCount = this.enemies.filter(e => e.active && SNAKE_TYPES.has(e.alienType)).length;
            if (snakeCount >= CONFIG.SNAKES.MAX_SNAKES) return false;
        }
        if (type === 'spitter') {
            const spitterCount = this.enemies.filter(e => e.active && e.alienType === 'spitter').length;
            if (spitterCount >= 3) return false;
        }
        if (type === 'python') {
            const pythonCount = this.enemies.filter(e => e.active && e.alienType === 'python').length;
            if (pythonCount >= 2) return false;
        }
        return true;
    }

    /**
     * On wave 10 the SnakeMinigame panel occupies the bottom (y > 480),
     * so clamp side-edge spawns above that region.
     */
    _spawnMaxY() {
        return this.wave === 10 ? 460 : 670;
    }

    /**
     * Launch the SnakeMinigame to break the anaconda's shield.
     * Returns true so BaseGameScene._startHack() skips the normal typing path.
     */
    _tryWave10Hack() {
        this.activeHack = new SnakeMinigame(this, {
            pointsNeeded: this.hackThreshold,
            onPellet: (count) => {
                this.hackProgress = count;
                this.hud.updateHack(this.hackProgress, this.hackThreshold, 'SHIELD');
                this.station.setHackProgress(this.hackProgress / this.hackThreshold);
            },
            onSuccess: () => {
                this.activeHack = null;
                this.snail.hackingActive = false;
                this.snail.setState('IDLE');
                if (this.boss && this.boss.active && !this.boss._dying) {
                    this.boss.dropShield();
                    this.soundSynth?.play('shieldReflect');
                    this.time.delayedCall(CONFIG.BOSS.SHIELD_DOWN_DURATION, () => {
                        if (this.boss && this.boss.active && !this.boss._dying) {
                            this.boss.raiseShield();
                        }
                    });
                }
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

    /**
     * Construct snake-type enemies that BaseGameScene's switch doesn't know about.
     */
    _createWorldSpecificEnemy(type, x, y) {
        switch (type) {
            case 'basic-snake': return new BasicSnake(this, x, y);
            case 'sidewinder':  return new Sidewinder(this, x, y);
            case 'python':      return new Python(this, x, y);
            case 'burrower':    return new Burrower(this, x, y);
            case 'spitter':     return new Spitter(this, x, y);
            default:            return null;
        }
    }

    // ── World-specific sound hooks ─────────────────────────────────────────────

    /** Use snake spawn sound instead of frog spawn sound. */
    _spawnSoundName() { return 'snakeSpawn'; }

    /** Schedule a sporadic hiss while snakes are alive; re-schedules itself. */
    _startRibbetTimer() {
        if (this._hissTimer) { this._hissTimer.remove(false); this._hissTimer = null; }
        const scheduleNext = () => {
            const delay = Phaser.Math.Between(8000, 20000);
            this._hissTimer = this.time.delayedCall(delay, () => {
                if (this.enemies.some(e => e.active)) {
                    this.soundSynth?.play('snakeHiss');
                }
                scheduleNext();
            });
        };
        scheduleNext();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Apply the World 2 venom debuff to Gerald for VENOM.DURATION ms.
     * Re-calling while active simply refreshes the timer.
     * The speed penalty is applied directly in Snail.update() via scene._venomActive.
     */
    _applyVenom() {
        this._venomActive = true;
        if (this._venomTimer) this._venomTimer.remove(false);
        this._venomTimer = this.time.delayedCall(CONFIG.SNAKES.VENOM.DURATION, () => {
            this._venomActive = false;
            this._venomTimer  = null;
        });
        // Visual indicator — brief purple text over Gerald
        if (!this._venomLabel || !this._venomLabel.active) {
            this._venomLabel = this.add.text(0, -36, 'VENOMED', {
                fontSize: '10px', fontFamily: 'monospace', color: '#cc44ff',
            }).setOrigin(0.5).setDepth(60);
        }
        this._venomLabel.setPosition(this.snail.x, this.snail.y - 36);
        this._venomLabel.setAlpha(1);
        this.tweens.killTweensOf(this._venomLabel);
        this.tweens.add({
            targets:  this._venomLabel,
            alpha:    0,
            delay:    CONFIG.SNAKES.VENOM.DURATION - 400,
            duration: 400,
        });
    }
}
