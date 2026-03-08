/**
 * Runs a Phaser time-event loop for a cooldown period.
 *
 * @param {Phaser.Scene} scene
 * @param {number}       duration   — total cooldown in ms
 * @param {number}       pollMs     — how often to fire onTick (ms)
 * @param {function}     onTick     — called each poll with (remaining, pct)
 *                                     remaining: ms left, pct: 0→1 elapsed fraction
 * @param {function}     onComplete — called once when cooldown ends
 * @returns {{ cancel: function }} — call cancel() to abort early
 */
export function startCooldown(scene, duration, pollMs, onTick, onComplete) {
    const startTime = scene.time.now;

    const timer = scene.time.addEvent({
        delay: pollMs,
        loop:  true,
        callback: () => {
            const elapsed   = scene.time.now - startTime;
            const remaining = Math.max(0, duration - elapsed);
            const pct       = Math.min(1, elapsed / duration);

            onTick(remaining, pct);

            if (remaining <= 0) {
                timer.remove(false);
                onComplete();
            }
        },
    });

    return { cancel: () => timer.remove(false) };
}
