import { CONFIG } from '../config.js';
import HealthDrop from '../entities/HealthDrop.js';

/**
 * Compute the lead-aim intercept point so a projectile travelling at `speed`
 * px/s from (fromX, fromY) will meet a target moving at (tvx, tvy) px/s.
 * Returns the world-space aim point; falls back to the target's current
 * position if no positive solution exists.
 */
function _leadIntercept(fromX, fromY, targetX, targetY, tvx, tvy, speed) {
    const rx = targetX - fromX;
    const ry = targetY - fromY;
    // Quadratic: (tvx²+tvy²-speed²)t² + 2(rx·tvx+ry·tvy)t + (rx²+ry²) = 0
    const a = tvx * tvx + tvy * tvy - speed * speed;
    const b = 2 * (rx * tvx + ry * tvy);
    const c = rx * rx + ry * ry;

    if (Math.abs(a) < 1) {
        // Near-degenerate: target barely moves vs bullet speed
        const t = Math.abs(b) > 0.001 ? -c / b : -1;
        return t > 0
            ? { x: targetX + tvx * t, y: targetY + tvy * t }
            : { x: targetX, y: targetY };
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) return { x: targetX, y: targetY };

    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    let t = -1;
    if      (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
    else if (t1 > 0)            t = t1;
    else if (t2 > 0)            t = t2;

    return t > 0
        ? { x: targetX + tvx * t, y: targetY + tvy * t }
        : { x: targetX, y: targetY };
}

/**
 * Attempt to ricochet `proj` after it hit `hitAlien` at (bx, by).
 * Finds the nearest valid (non-shielded, non-dead) alien within
 * CONFIG.RICOCHET.SEARCH_RADIUS, aims with lead prediction, and
 * repositions the projectile to continue flying.
 * Returns true if the ricochet happened (caller should NOT destroy proj).
 */
export function tryRicochetBullet(proj, scene, hitAlien, bx, by) {
    const falloff      = scene._ricochetFalloff      ?? CONFIG.RICOCHET.FALLOFF;
    const searchRadius = scene._ricochetSearchRadius ?? CONFIG.RICOCHET.SEARCH_RADIUS;
    const chance = CONFIG.RICOCHET.BASE_CHANCE * (falloff ** proj.ricochetBounces);
    if (Math.random() > chance) return false;

    // Find nearest valid alien
    let nearest = null;
    let nearestDist = searchRadius;
    for (const a of scene.aliens) {
        if (!a.active || a._dying || a.shielded || a === hitAlien) continue;
        const d = Phaser.Math.Distance.Between(bx, by, a.x, a.y);
        if (d < nearestDist) { nearest = a; nearestDist = d; }
    }
    if (!nearest) return false;

    // Compute target alien velocity (it moves toward snail/decoy)
    const atkTarget = (scene.decoy && scene.decoy.active) ? scene.decoy : scene.snail;
    const alienAngle = Phaser.Math.Angle.Between(nearest.x, nearest.y, atkTarget.x, atkTarget.y);
    const speedMult  = scene.alienSpeedMultiplier || 1.0;
    const tvx = Math.cos(alienAngle) * nearest.speed * speedMult;
    const tvy = Math.sin(alienAngle) * nearest.speed * speedMult;

    const bulletSpeed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
    const aim = _leadIntercept(bx, by, nearest.x, nearest.y, tvx, tvy, bulletSpeed);
    const aimAngle = Phaser.Math.Angle.Between(bx, by, aim.x, aim.y);

    // Redirect
    proj.vx = Math.cos(aimAngle) * bulletSpeed;
    proj.vy = Math.sin(aimAngle) * bulletSpeed;
    // Advance past the just-hit alien so the collision loop won't re-detect it
    const clearDist = nearest.radius + CONFIG.PLAYER.PROJECTILE_RADIUS + 2;
    proj.x = bx + Math.cos(aimAngle) * clearDist;
    proj.y = by + Math.sin(aimAngle) * clearDist;
    proj.ricochetBounces++;

    // Cyan spark at bounce point
    const spark = scene.add.arc(bx, by, 8, 0, 360, false, 0x44ffff, 0.9).setDepth(59);
    scene.tweens.add({
        targets: spark, scaleX: 3, scaleY: 3, alpha: 0,
        duration: 250, ease: 'Power2.easeOut', onComplete: () => spark.destroy(),
    });
    // Ghost trail line toward next target
    const trail = scene.add.graphics().setDepth(58);
    trail.lineStyle(1, 0x44ffff, 0.55);
    trail.lineBetween(bx, by, nearest.x, nearest.y);
    scene.tweens.add({ targets: trail, alpha: 0, duration: 200, onComplete: () => trail.destroy() });

    return true;
}

// ── Colour palette for death bursts ───────────────────────────────────────────
export const BURST_COLORS = {
    basic:  0xdd3333,
    fast:   0xaa44ff,
    tank:   0x7799aa,
    bomber: 0xff7722,
    shield: 0x00eeff,
};

/**
 * Expanding flash + debris-dot burst at (x, y).
 * Called on alien kill and when clearing aliens at wave end.
 *
 * @param {function|null} onComplete  Optional callback fired when the main
 *   pulse tween finishes (~480 ms) — i.e. once the explosion has fully faded.
 *   Used to spawn decorative escape frogs at the right moment.
 */
export function spawnDeathBurst(scene, x, y, color = 0xff4444, onComplete = null) {
    scene.soundSynth.play('explosion');

    // Expanding light pulse — onComplete fires when this fully fades
    const pulse = scene.add.circle(x, y, 6, 0xff3300, 0.45).setDepth(53);
    scene.tweens.add({
        targets: pulse, scaleX: 9, scaleY: 9, alpha: 0,
        duration: 480, ease: 'Power2.easeOut',
        onComplete: () => { pulse.destroy(); if (onComplete) onComplete(); },
    });

    // Bright inner flash
    const flash = scene.add.circle(x, y, 4, 0xff8833, 0.80).setDepth(54);
    scene.tweens.add({
        targets: flash, scaleX: 5, scaleY: 5, alpha: 0,
        duration: 260, ease: 'Power1.easeOut', onComplete: () => flash.destroy(),
    });

    // Debris dots
    const count = 7;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        const speed = Phaser.Math.Between(30, 70);
        const dot   = scene.add.circle(x, y, Phaser.Math.Between(2, 5), color, 0.9).setDepth(55);
        scene.tweens.add({
            targets: dot,
            x: x + Math.cos(angle) * speed,
            y: y + Math.sin(angle) * speed,
            alpha: 0, scaleX: 0.2, scaleY: 0.2,
            duration: Phaser.Math.Between(250, 450),
            ease: 'Power2',
            onComplete: () => dot.destroy(),
        });
    }
}

/**
 * Bomber AoE: damages snail + nearby aliens, shows expanding ring visual.
 * Triggers game-over if the snail dies.
 */
export function checkBomberBlast(scene, bx, by) {
    const blastRadius = CONFIG.DAMAGE.BOMBER_BLAST_RADIUS;

    // Snail in radius?
    if (Phaser.Math.Distance.Between(bx, by, scene.snail.x, scene.snail.y) < blastRadius) {
        if (scene.snail.shielded) {
            scene.soundSynth.play('shieldReflect');
        } else {
            const died = scene.snail.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_SNAIL);
            scene.hud.updateHealth(scene.snail.health, scene.snail.maxHealth);
            scene.soundSynth.play('damage');
            if (died) {
                if (scene.waveManager) scene.waveManager.active = false;
                if (scene.activeHack)  { scene.activeHack.cancel(); scene.activeHack = null; }
                scene.scene.start('GameOverScene', { wave: scene.wave, score: scene.score });
                return;
            }
        }
    }

    // Splash nearby aliens
    for (const a of scene.aliens) {
        if (!a.active || a._dying) continue;
        if (Phaser.Math.Distance.Between(bx, by, a.x, a.y) < blastRadius) {
            const killed = a.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_ALIEN);
            if (killed) {
                scene.score++;
                scene.hud.updateScore(scene.score);
                const ax = a.x, ay = a.y;
                const burstColor = BURST_COLORS[a.alienType] || 0xff4444;
                const wasChainBomber = a.alienType === 'bomber';
                a._dying = true;
                scene.time.delayedCall(120, () => {
                    if (!a.active) return;
                    spawnDeathBurst(scene, ax, ay, burstColor,
                        () => scene.spawnFrogEscape?.(ax, ay));
                    if (wasChainBomber) checkBomberBlast(scene, ax, ay);
                    a.destroy();
                });
            }
        }
    }

    // Expanding ring visual
    const ring = scene.add.circle(bx, by, 5, 0xff6600, 0.0).setDepth(60)
        .setStrokeStyle(3, 0xff8833, 0.9);
    scene.tweens.add({
        targets: ring,
        scaleX: blastRadius / 5,
        scaleY: blastRadius / 5,
        alpha: 0,
        duration: 350,
        ease: 'Power2',
        onComplete: () => ring.destroy(),
    });
}

/**
 * Projectile vs alien — call once per frame from GameScene.update().
 * Handles hit flash, wobble, score, death burst, health drops, and bomber blast.
 */
export function checkProjectileCollisions(scene) {
    for (const proj of scene.projectiles) {
        if (!proj.active) continue;
        for (const alien of scene.aliens) {
            if (!alien.active) continue;
            const dist = Phaser.Math.Distance.Between(proj.x, proj.y, alien.x, alien.y);
            if (dist >= alien.radius + CONFIG.PLAYER.PROJECTILE_RADIUS) continue;

            // Shield check — deflect the projectile without damaging the alien
            if (alien.shielded) {
                proj.destroy();
                alien.flashShield?.();
                scene.soundSynth?.play('shieldReflect');
                // Deflect spark at impact point
                const sx = proj.x, sy = proj.y;
                const spark = scene.add.arc(sx, sy, 5, 0, 360, false, 0x00eeff, 0.9).setDepth(58);
                scene.tweens.add({
                    targets: spark, scaleX: 3, scaleY: 3, alpha: 0,
                    duration: 220, ease: 'Power2.easeOut', onComplete: () => spark.destroy(),
                });
                break;
            }

            const isBomber = alien.alienType === 'bomber';
            const bx = alien.x, by = alien.y;

            // Ricochet: attempt bounce before deciding whether to destroy
            const ricocheted = scene.ricochetEnabled && !proj.fromCannon
                ? tryRicochetBullet(proj, scene, alien, bx, by)
                : false;
            if (!ricocheted) proj.destroy();

            const died = alien.takeDamage(CONFIG.DAMAGE.PROJECTILE_HIT_ALIEN);

            // Red flash overlay (works in Canvas renderer unlike setTint)
            const hitFlash = scene.add.arc(bx, by, alien.radius, 0, 360, false, 0xff2222, 0.75).setDepth(58);
            scene.tweens.add({
                targets: hitFlash, alpha: 0, duration: 200,
                onComplete: () => hitFlash.destroy(),
            });

            // Hit-stop wobble
            scene.tweens.add({
                targets: alien, x: alien.x + 5,
                duration: 50, ease: 'Sine.easeOut', yoyo: true, repeat: 1,
            });

            if (died) {
                scene.score++;
                scene.hud.updateScore(scene.score);
                const burstColor = BURST_COLORS[alien.alienType] || 0xffffff;

                // Mark dying so update loop skips it; destroy after flash settles
                alien._dying = true;
                scene.time.delayedCall(200, () => {
                    if (!alien.active) return;
                    spawnDeathBurst(scene, bx, by, burstColor,
                        () => scene.spawnFrogEscape?.(bx, by));

                    if (Math.random() < CONFIG.HEALTH_DROP.CHANCE) {
                        scene.healthDrops.push(new HealthDrop(scene, bx, by));
                    }

                    if (isBomber) checkBomberBlast(scene, bx, by);
                    alien.destroy();
                });
            }
            break;  // one projectile hits one alien
        }
    }
}
