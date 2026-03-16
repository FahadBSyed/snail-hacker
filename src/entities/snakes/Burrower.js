import { CONFIG } from '../../config.js';
import { applyHitReaction, tickHitWiggle, applyWiggleToSegments, spawnDustCloud } from './snakeHitReaction.js';
import { initPath, tickSnakePath } from './snakePathfinding.js';

/**
 * Burrower — World 2 snake that phases underground to become invulnerable.
 *
 * State machine:
 *   SURFACE      — visible, chasing Gerald at SPEED_SURFACE
 *   WARN_BURROW  — slows, plays dust-puff, sinks over TRANSITION_DURATION ms
 *   UNDERGROUND  — invisible (container hidden), moves at SPEED_UNDERGROUND;
 *                  ground-ripple graphic visible at current position
 *   WARN_EMERGE  — stops moving, ground cracks at position, waits TRANSITION_DURATION ms
 *   SURFACE      — emerges, resumes chasing
 *
 * A looping timer drives transitions:
 *   surface for SURFACE_DURATION → warn_burrow for TRANSITION_DURATION →
 *   underground for UNDERGROUND_DURATION → warn_emerge for TRANSITION_DURATION → loop
 */
export default class Burrower extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(44);

        const cfg = CONFIG.SNAKES.BURROWER;
        this.health    = cfg.HEALTH;
        this.speed     = cfg.SPEED_SURFACE;
        this.radius    = cfg.RADIUS;
        this.alienType = 'burrower';

        this.hidingInBush  = false;

        this._state        = 'SURFACE';
        this._stateTimer   = cfg.SURFACE_DURATION;   // ms until next transition
        this._stunMs       = 0;

        this._hitReacting      = false;
        this._hitGen           = 0;
        this._hitWiggleMs      = 0;
        this._hitWiggleElapsed = 0;

        // Jitter — same side-to-side slither as BasicSnake, applied while chasing
        this._jitterMs       = 0;
        this._jitterDir      = 1;
        this._jitterCooldown = Phaser.Math.Between(
            CONFIG.SNAKES.JITTER_COOLDOWN_MIN, CONFIG.SNAKES.JITTER_COOLDOWN_MAX,
        );

        // History for body segments
        this._spacing  = CONFIG.SNAKES.BODY_SPACING;
        const segCount = cfg.SEGMENT_COUNT;
        this._history  = [{ x, y }];

        this._buildVisuals(scene, segCount);
        initPath(this);

        // Ground ripple — shown while underground
        this._ripple = scene.add.graphics();
        this._ripple.setDepth(20);
        this._ripple.setVisible(false);
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(1, 4, 24, 7);
        shadow.setScale(1.3);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-burrower-head');
        this._headImg.setOrigin(0.5, 0.5).setScale(0.65);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-burrower-body');
            img.setOrigin(0.5, 0.5).setScale(1.3).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-burrower-tail');
        this._tailImg.setOrigin(0.5, 0.5).setScale(1.3).setDepth(this.depth - 2);
    }

    takeDamage(amount) {
        if (this._state === 'UNDERGROUND' || this._state === 'WARN_EMERGE') return false;
        this.health -= amount;
        if (this.health <= 0) return true;
        applyHitReaction(this);
        return false;
    }

    takeDamageRaw(amount) {
        this.health -= amount;
        return this.health <= 0;
    }

    update(time, delta) {
        if (!this.active) return 'alive';
        const cfg = CONFIG.SNAKES.BURROWER;
        const dt  = delta / 1000;

        if (this._stunMs > 0) {
            this._stunMs -= delta;
            this._updateSegments();
            return 'alive';
        }

        tickHitWiggle(this, delta);

        // Advance state timer
        this._stateTimer -= delta;

        if (this._state === 'SURFACE') {
            this._setVisible(true);
            const snail    = this.scene.snail;
            const mult     = this.scene.enemySpeedMultiplier || 1.0;
            const toTarget = tickSnakePath(this, delta, snail.x, snail.y);
            let moveAngle;

            if (this._jitterMs > 0) {
                this._jitterMs -= delta;
                moveAngle = toTarget + this._jitterDir * (Math.PI / 2);
                if (this._jitterMs <= 0) {
                    this._jitterCooldown = Phaser.Math.Between(
                        CONFIG.SNAKES.JITTER_COOLDOWN_MIN, CONFIG.SNAKES.JITTER_COOLDOWN_MAX,
                    );
                }
            } else {
                if (this._jitterCooldown > 0) this._jitterCooldown -= delta;
                if (this._jitterCooldown <= 0) {
                    this._jitterMs  = CONFIG.SNAKES.JITTER_DURATION;
                    this._jitterDir = Math.random() < 0.5 ? 1 : -1;
                    moveAngle = toTarget + this._jitterDir * (Math.PI / 2);
                } else {
                    moveAngle = toTarget;
                }
            }

            this.x += Math.cos(moveAngle) * cfg.SPEED_SURFACE * mult * dt;
            this.y += Math.sin(moveAngle) * cfg.SPEED_SURFACE * mult * dt;
            this._headImg.setRotation(moveAngle);

            const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 20) {
                this._pushHistory(time);
                this._updateSegments();
                return 'reached_snail';
            }

            if (this._stateTimer <= 0) {
                this._transition('WARN_BURROW');
            }

        } else if (this._state === 'WARN_BURROW') {
            // Slow down and fade slightly during warn
            const progress = 1 - (this._stateTimer / cfg.TRANSITION_DURATION);
            this.setAlpha(1 - progress * 0.5);

            if (this._stateTimer <= 0) {
                // Going under — soil displaced outward and slightly upward
                spawnDustCloud(this.scene, this.x, this.y, {
                    count: 14, spreadX: 50, spreadY: 18, upBias: 18, duration: 500,
                    colors: [0x88aacc, 0x6699bb, 0xaaccdd, 0x5577aa, 0x99bbcc],
                });
                this._transition('UNDERGROUND');
            }

        } else if (this._state === 'UNDERGROUND') {
            this._setVisible(false);
            this.setAlpha(1);
            const snail    = this.scene.snail;
            const mult     = this.scene.enemySpeedMultiplier || 1.0;
            const toTarget = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
            let moveAngle;

            if (this._jitterMs > 0) {
                this._jitterMs -= delta;
                moveAngle = toTarget + this._jitterDir * (Math.PI / 2);
                if (this._jitterMs <= 0) {
                    this._jitterCooldown = Phaser.Math.Between(
                        CONFIG.SNAKES.JITTER_COOLDOWN_MIN, CONFIG.SNAKES.JITTER_COOLDOWN_MAX,
                    );
                }
            } else {
                if (this._jitterCooldown > 0) this._jitterCooldown -= delta;
                if (this._jitterCooldown <= 0) {
                    this._jitterMs  = CONFIG.SNAKES.JITTER_DURATION;
                    this._jitterDir = Math.random() < 0.5 ? 1 : -1;
                    moveAngle = toTarget + this._jitterDir * (Math.PI / 2);
                } else {
                    moveAngle = toTarget;
                }
            }

            this.x += Math.cos(moveAngle) * cfg.SPEED_UNDERGROUND * mult * dt;
            this.y += Math.sin(moveAngle) * cfg.SPEED_UNDERGROUND * mult * dt;

            // Animate ground ripple
            this._drawRipple(this.x, this.y, time);

            if (this._stateTimer <= 0) {
                this._transition('WARN_EMERGE');
            }

        } else if (this._state === 'WARN_EMERGE') {
            // Stationary — ground cracking effect
            this._drawEmergeWarning(this.x, this.y, time);

            if (this._stateTimer <= 0) {
                this._ripple.setVisible(false);
                // Emerging — soil erupts upward and outward more forcefully
                spawnDustCloud(this.scene, this.x, this.y, {
                    count: 18, spreadX: 58, spreadY: 22, upBias: 38, duration: 580,
                    colors: [0x88aacc, 0x6699bb, 0xaaccdd, 0x5577aa, 0x99bbcc],
                });
                this._setVisible(true);
                this.setAlpha(1);
                this._transition('SURFACE');
            }
        }

        this._pushHistory(time);
        this._updateSegments();
        return 'alive';
    }

    _transition(newState) {
        const cfg = CONFIG.SNAKES.BURROWER;
        this._state = newState;
        switch (newState) {
            case 'WARN_BURROW':   this._stateTimer = cfg.TRANSITION_DURATION;   break;
            case 'UNDERGROUND':   this._stateTimer = cfg.UNDERGROUND_DURATION;  break;
            case 'WARN_EMERGE':   this._stateTimer = cfg.TRANSITION_DURATION;   break;
            case 'SURFACE':       this._stateTimer = cfg.SURFACE_DURATION;      break;
        }
    }

    _setVisible(show) {
        this._headImg.setVisible(show);
        for (const img of this._bodyImgs) img.setVisible(show);
        this._tailImg.setVisible(show);
        this._ripple.setVisible(!show && (
            this._state === 'UNDERGROUND' || this._state === 'WARN_EMERGE'
        ));
    }

    _drawRipple(x, y, time) {
        const g = this._ripple;
        g.clear();
        g.setVisible(true);
        // Two expanding ellipses offset by time phase
        const t1 = (time % 600) / 600;
        const t2 = ((time + 300) % 600) / 600;
        const drawEllipse = (t) => {
            const rx = 20 + t * 18;
            const ry = 8  + t * 6;
            g.lineStyle(2, 0x8b6914, (1 - t) * 0.8);
            g.strokeEllipse(x, y + 6, rx * 2, ry * 2);
        };
        drawEllipse(t1);
        drawEllipse(t2);
    }

    _drawEmergeWarning(x, y, time) {
        const g = this._ripple;
        g.clear();
        g.setVisible(true);
        // Pulsing bright crack lines
        const pulse = 0.5 + 0.5 * Math.sin(time / 100);
        g.lineStyle(2, 0xffcc44, pulse);
        g.strokeEllipse(x, y + 4, 36, 14);
        // Small spikes outward
        for (let i = 0; i < 6; i++) {
            const a  = (i / 6) * Math.PI * 2;
            const r1 = 14;
            const r2 = 20 + pulse * 4;
            g.lineStyle(1, 0xff8800, pulse * 0.8);
            g.beginPath();
            g.moveTo(x + Math.cos(a) * r1, y + 4 + Math.sin(a) * r1 * 0.4);
            g.lineTo(x + Math.cos(a) * r2, y + 4 + Math.sin(a) * r2 * 0.4);
            g.strokePath();
        }
    }

    _pushHistory(time) {
        const last = this._history[0];
        if (last && Phaser.Math.Distance.Between(this.x, this.y, last.x, last.y) < 2) return;
        this._history.unshift({ x: this.x, y: this.y });
        if (this._history.length > 300) this._history.length = 300;
    }

    _updateSegments() {
        const sp = this._spacing;
        for (let i = 0; i < this._bodyImgs.length; i++) {
            const idx  = (i + 1) * sp;
            const pos  = this._histAt(idx);
            const prev = this._histAt(idx - sp);
            this._bodyImgs[i].setPosition(pos.x, pos.y);
            this._bodyImgs[i].setRotation(Math.atan2(prev.y - pos.y, prev.x - pos.x));
        }
        const ti  = (this._bodyImgs.length + 1) * sp;
        const tp  = this._histAt(ti);
        const tpr = this._histAt(ti - sp);
        this._tailImg.setPosition(tp.x, tp.y);
        this._tailImg.setRotation(Math.atan2(tpr.y - tp.y, tpr.x - tp.x));
        applyWiggleToSegments(this);
    }

    _histAt(i) {
        if (this._history.length === 0) return { x: this.x, y: this.y };
        return this._history[Math.min(i, this._history.length - 1)];
    }

    destroy(fromScene) {
        if (this._ripple && this._ripple.active) this._ripple.destroy();
        for (const img of this._bodyImgs) { if (img && img.active) img.destroy(); }
        this._bodyImgs = [];
        if (this._tailImg && this._tailImg.active) { this._tailImg.destroy(); this._tailImg = null; }
        super.destroy(fromScene);
    }
}
