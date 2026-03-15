import { CONFIG } from '../../config.js';

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

        // History for body segments
        this._spacing  = CONFIG.SNAKES.BODY_SPACING;
        const segCount = cfg.SEGMENT_COUNT;
        const histLen  = (segCount + 2) * this._spacing + 60;
        this._history  = [];
        for (let i = 0; i < histLen; i++) this._history.push({ x, y });

        this._buildVisuals(scene, segCount);

        // Ground ripple — shown while underground
        this._ripple = scene.add.graphics();
        this._ripple.setDepth(20);
        this._ripple.setVisible(false);
    }

    _buildVisuals(scene, segCount) {
        const shadow = scene.add.graphics();
        shadow.fillStyle(0x000000, 0.25);
        shadow.fillEllipse(2, 8, 48, 14);
        this.add(shadow);

        this._headImg = scene.add.image(0, 0, 'snake-burrower-head');
        this._headImg.setOrigin(0.5, 0.5);
        this.add(this._headImg);

        this._bodyImgs = [];
        for (let i = 0; i < segCount; i++) {
            const img = scene.add.image(this.x, this.y, 'snake-burrower-body');
            img.setOrigin(0.5, 0.5).setDepth(this.depth - 1);
            this._bodyImgs.push(img);
        }
        this._tailImg = scene.add.image(this.x, this.y, 'snake-burrower-tail');
        this._tailImg.setOrigin(0.5, 0.5).setDepth(this.depth - 2);
    }

    takeDamage(amount) {
        if (this._state === 'UNDERGROUND' || this._state === 'WARN_BURROW') return false;
        this.health -= amount;
        return this.health <= 0;
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

        // Advance state timer
        this._stateTimer -= delta;

        if (this._state === 'SURFACE') {
            this._setVisible(true);
            const snail = this.scene.snail;
            const mult  = this.scene.alienSpeedMultiplier || 1.0;
            const angle = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
            this.x += Math.cos(angle) * cfg.SPEED_SURFACE * mult * dt;
            this.y += Math.sin(angle) * cfg.SPEED_SURFACE * mult * dt;
            this._headImg.setRotation(angle);

            const dist = Phaser.Math.Distance.Between(this.x, this.y, snail.x, snail.y);
            if (dist < this.radius + 20) {
                this._pushHistory();
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
                this._spawnDustPuff(this.x, this.y);
                this._transition('UNDERGROUND');
            }

        } else if (this._state === 'UNDERGROUND') {
            this._setVisible(false);
            this.setAlpha(1);
            const snail = this.scene.snail;
            const mult  = this.scene.alienSpeedMultiplier || 1.0;
            const angle = Phaser.Math.Angle.Between(this.x, this.y, snail.x, snail.y);
            this.x += Math.cos(angle) * cfg.SPEED_UNDERGROUND * mult * dt;
            this.y += Math.sin(angle) * cfg.SPEED_UNDERGROUND * mult * dt;

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
                this._spawnDustPuff(this.x, this.y);
                this._setVisible(true);
                this.setAlpha(1);
                this._transition('SURFACE');
            }
        }

        this._pushHistory();
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

    _spawnDustPuff(x, y) {
        for (let i = 0; i < 6; i++) {
            const angle  = Math.random() * Math.PI * 2;
            const speed  = 30 + Math.random() * 40;
            const circle = this.scene.add.circle(x, y, 4 + Math.random() * 4, 0xbbaa88, 0.7)
                .setDepth(46);
            this.scene.tweens.add({
                targets:  circle,
                x:        x + Math.cos(angle) * speed,
                y:        y + Math.sin(angle) * speed * 0.5,
                alpha:    0,
                scaleX:   0.1,
                scaleY:   0.1,
                duration: 400,
                ease:     'Sine.easeOut',
                onComplete: () => circle.destroy(),
            });
        }
    }

    _pushHistory() {
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
    }

    _histAt(i) {
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
