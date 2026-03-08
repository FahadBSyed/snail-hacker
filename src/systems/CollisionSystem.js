import { CONFIG } from '../config.js';
import HealthDrop from '../entities/HealthDrop.js';

// ── Colour palette for death bursts ───────────────────────────────────────────
const BURST_COLORS = {
    basic:  0xdd3333,
    fast:   0xaa44ff,
    tank:   0x7799aa,
    bomber: 0xff7722,
};

/**
 * Expanding flash + debris-dot burst at (x, y).
 * Called on alien kill and when clearing aliens at wave end.
 */
export function spawnDeathBurst(scene, x, y, color = 0xff4444) {
    scene.soundSynth.play('explosion');

    // Expanding light pulse
    const pulse = scene.add.circle(x, y, 6, 0xff3300, 0.45).setDepth(53);
    scene.tweens.add({
        targets: pulse, scaleX: 9, scaleY: 9, alpha: 0,
        duration: 480, ease: 'Power2.easeOut', onComplete: () => pulse.destroy(),
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

    // Splash nearby aliens
    for (const a of scene.aliens) {
        if (!a.active) continue;
        if (Phaser.Math.Distance.Between(bx, by, a.x, a.y) < blastRadius) {
            a.takeDamage(CONFIG.DAMAGE.BOMBER_BLAST_ALIEN);
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

            proj.destroy();
            const isBomber = alien.alienType === 'bomber';
            const bx = alien.x, by = alien.y;
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
                    spawnDeathBurst(scene, bx, by, burstColor);

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
