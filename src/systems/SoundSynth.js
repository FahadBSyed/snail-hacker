/**
 * SoundSynth — procedural Web Audio API sound effects with optional file overrides.
 *
 * Pass an overrides map (see src/soundOverrides.js) to the constructor,
 * then call preload() immediately to start fetching all audio files in the
 * background (no AudioContext — and therefore no user-gesture — required for
 * the network requests). Decoding happens automatically once the AudioContext
 * is created on the first play() call.
 *
 * AudioContext is still created lazily on first play() to satisfy browser
 * policy (requires a prior user gesture).
 */
export default class SoundSynth {
    constructor(overrides = {}) {
        this._ctx   = null;
        this.volume = 0.35;   // master volume 0–1

        // name -> {
        //   entries:    {url,volume}[]          — original config
        //   rawBuffers: {ab,volume}[] | null     — fetched ArrayBuffers, awaiting decode
        //   buffers:    {buf,volume}[] | null    — decoded AudioBuffers, ready to play
        //   fetching:   boolean
        //   decoding:   boolean
        // }
        this._overrides = new Map(
            Object.entries(overrides).map(([name, entries]) => [
                name, {
                    entries: entries.map(e =>
                        typeof e === 'string' ? { url: e, volume: 1.0 } : { volume: 1.0, ...e }
                    ),
                    rawBuffers: null,
                    buffers:    null,
                    fetching:   false,
                    decoding:   false,
                },
            ])
        );
    }

    /**
     * Fetch all override files now. No AudioContext required — call this as
     * early as possible (e.g. right after constructing the synth). Decoding
     * into AudioBuffers happens automatically once the context is available.
     */
    preload() {
        for (const [name, override] of this._overrides) {
            if (override.fetching || override.rawBuffers || override.buffers) continue;
            override.fetching = true;
            Promise.all(
                override.entries.map(({ url, volume }) =>
                    fetch(url)
                        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
                        .then(ab => ({ ab, volume }))
                        .catch(err => {
                            console.warn(`[SoundSynth] failed to fetch "${name}" → ${url}:`, err.message ?? err);
                            return null;
                        })
                )
            ).then(results => {
                override.rawBuffers = results.filter(Boolean);
                override.fetching   = false;
                // If the AudioContext already exists, kick off decode immediately.
                if (this._ctx && override.rawBuffers.length) this._decode(name, override);
            });
        }
    }

    /** Decode pending rawBuffers into AudioBuffers using the given context. */
    _decode(name, override) {
        if (override.decoding || override.buffers || !override.rawBuffers?.length) return;
        override.decoding = true;
        const ctx = this._ctx;
        Promise.all(
            override.rawBuffers.map(({ ab, volume }) =>
                // slice() so the ArrayBuffer stays detachable on re-decode attempts
                ctx.decodeAudioData(ab.slice(0))
                    .then(buf => ({ buf, volume }))
                    .catch(err => {
                        console.warn(`[SoundSynth] decode failed for "${name}":`, err.message ?? err);
                        return null;
                    })
            )
        ).then(results => {
            override.buffers  = results.filter(Boolean);
            override.decoding = false;
            if (override.buffers.length) {
                console.log(`[SoundSynth] ready: ${override.buffers.length} file(s) for "${name}"`);
            } else {
                console.warn(`[SoundSynth] all files failed for "${name}" — using procedural synth`);
            }
        });
    }

    /**
     * Play a sound on a continuous loop. Returns a handle `{ stop(fadeOut?) }`
     * where `fadeOut` is the fade-out duration in seconds (default 0.25).
     * First tries a decoded file override; if none is available falls back to
     * a procedural `_${name}_looped()` method. Returns null if neither exists.
     */
    playLooped(name) {
        const override = this._overrides.get(name);
        if (override?.buffers?.length) {
            const entry = override.buffers[Math.floor(Math.random() * override.buffers.length)];
            const ctx = this._ctx_get(), t = ctx.currentTime;
            const g = ctx.createGain();
            g.gain.setValueAtTime(this.volume * entry.volume, t);
            g.connect(ctx.destination);
            const src = ctx.createBufferSource();
            src.buffer = entry.buf;
            src.loop = true;
            src.connect(g);
            src.start(t);
            return {
                stop: (fadeOut = 0.25) => {
                    try {
                        const now = ctx.currentTime;
                        g.gain.setValueAtTime(g.gain.value, now);
                        g.gain.linearRampToValueAtTime(0, now + fadeOut);
                        src.stop(now + fadeOut);
                    } catch (_) {}
                },
            };
        }
        // Fall back to procedural looped implementation
        try { return this[`_${name}_looped`]?.() ?? null; } catch (_) { return null; }
    }

    /**
     * Create the AudioContext and immediately decode all pre-fetched files.
     * Call this on the first confirmed user gesture (e.g. a button click)
     * so that decoded buffers are ready before the first play() or playLooped().
     */
    warmup() {
        this._ctx_get();   // create (or resume) the AudioContext
        for (const [name, override] of this._overrides) {
            if (override.rawBuffers?.length) this._decode(name, override);
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    _ctx_get() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Re-resume on any future gesture in case the context was created
            // during scene setup before the browser settled the gesture state.
            const resume = () => { if (this._ctx.state === 'suspended') this._ctx.resume(); };
            window.addEventListener('pointerdown', resume, { once: false });
            window.addEventListener('keydown',     resume, { once: false });
        }
        if (this._ctx.state === 'suspended') this._ctx.resume();
        return this._ctx;
    }

    /** Gain node that fades from `level × volume` to silence over `decay` seconds. */
    _gain(ctx, level, t, decay) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(level * this.volume, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        g.connect(ctx.destination);
        return g;
    }

    /** Oscillator sweeping f0→f1 over `dur` seconds, connected to `dest`. */
    _osc(ctx, type, f0, f1, t, dur, dest) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 !== null) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        o.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.015);
        return o;
    }

    /** White-noise buffer source connected to `dest`. */
    _noise(ctx, dur, dest) {
        const n   = Math.ceil(ctx.sampleRate * (dur + 0.05));
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(dest);
        src.start(ctx.currentTime);
        return src;
    }

    /** Biquad filter node connected to `dest`; returns the filter. */
    _filter(ctx, type, freq, dest) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.connect(dest);
        return f;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    play(name) {
        const override = this._overrides.get(name);
        if (override) {
            if (override.buffers?.length) {
                // Already decoded — play a random entry immediately.
                const entry = override.buffers[Math.floor(Math.random() * override.buffers.length)];
                this._playBuffer(entry.buf, entry.volume);
                return;
            }
            // AudioContext is now available (user gesture has occurred). If we
            // have pre-fetched raw bytes waiting, kick off decode. If fetch
            // hasn't been started at all (preload() was never called), do the
            // old fetch-then-decode path as a fallback.
            const ctx = this._ctx_get();
            if (override.rawBuffers?.length) {
                this._decode(name, override);
            } else if (!override.fetching) {
                override.fetching = true;
                Promise.all(
                    override.entries.map(({ url, volume }) =>
                        fetch(url)
                            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
                            .then(ab => ({ ab, volume }))
                            .catch(err => {
                                console.warn(`[SoundSynth] failed to fetch "${name}" → ${url}:`, err.message ?? err);
                                return null;
                            })
                    )
                ).then(results => {
                    override.rawBuffers = results.filter(Boolean);
                    override.fetching   = false;
                    if (this._ctx) this._decode(name, override);
                });
            }
            // Fall through to procedural synth while loading (or if all files failed).
        }
        try { this[`_${name}`]?.(); } catch (_) { /* never let audio errors crash the game */ }
    }

    /** Play a decoded AudioBuffer at master volume × per-file volume. */
    _playBuffer(buf, volume = 1.0) {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.setValueAtTime(this.volume * volume, t);
        g.connect(ctx.destination);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(t);
    }

    // ── Sound definitions ──────────────────────────────────────────────────────

    /** Upgrade card selected — triumphant three-note ascending chord. */
    _upgradeSelect() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        [523.2, 659.3, 783.9].forEach((freq, i) => {
            const st = t + i * 0.07;
            const g  = this._gain(ctx, 0.28, st, 0.38);
            this._osc(ctx, 'sine', freq, freq, st, 0.35, g);
            const g2 = this._gain(ctx, 0.10, st, 0.38);
            this._osc(ctx, 'triangle', freq * 2, freq * 2, st, 0.35, g2);
        });
    }

    /** Force shield activated — rising electric hum + resonant ping. */
    _shieldActivate() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.38, t, 0.55);
        this._osc(ctx, 'sine', 200, 620, t, 0.50, g);
        const g2 = this._gain(ctx, 0.20, t + 0.35, 0.40);
        this._osc(ctx, 'sine', 880, 880, t + 0.35, 0.38, g2);
    }

    /** Slow field activated — deep descending pitch-bend whoosh. */
    _slowActivate() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const dur = 0.9;
        const g = this._gain(ctx, 0.45, t, dur);
        this._osc(ctx, 'sine', 440, 110, t, dur * 0.9, g);
        const ng  = this._gain(ctx, 0.18, t, dur * 0.6);
        const lpf = this._filter(ctx, 'lowpass', 800, ng);
        this._noise(ctx, dur * 0.55, lpf);
    }

    /** Slow field clock tick — quiet, muffled tick. */
    _slowTick() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.18, t, 0.06);
        this._osc(ctx, 'square', 1200, 900, t, 0.05, g);
        const ng  = this._gain(ctx, 0.10, t, 0.04);
        const hpf = this._filter(ctx, 'highpass', 3000, ng);
        this._noise(ctx, 0.03, hpf);
    }

    /** Auto-turret cannon shot — deeper thump + sharp crack. */
    _cannonFire() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Low thump
        const bg = this._gain(ctx, 0.55, t, 0.14);
        this._osc(ctx, 'sawtooth', 160, 40, t, 0.12, bg);
        // Sharp crack noise
        const ng  = this._gain(ctx, 0.30, t, 0.08);
        const hpf = this._filter(ctx, 'highpass', 2000, ng);
        this._noise(ctx, 0.07, hpf);
    }

    /** Gun shot — short sawtooth pitch-drop + highpass noise punch. */
    _shoot() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const pitch = 0.9 + Math.random() * 0.2;   // ±10% pitch variation
        const g = this._gain(ctx, 0.55, t, 0.11);
        this._osc(ctx, 'sawtooth', 220 * pitch, 50 * pitch, t, 0.09, g);
        const ng  = this._gain(ctx, 0.22, t, 0.07);
        const hpf = this._filter(ctx, 'highpass', 1200, ng);
        this._noise(ctx, 0.08, hpf);
    }

    /**
     * Snake death — comical descending slide-whistle whimper followed by a
     * soft muffled thud as the snake burrows underground.
     */
    _snakeDie() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Slide-whistle: sine sweeping from ~800 Hz down to ~150 Hz over 0.35 s
        const g1 = this._gain(ctx, 0.28, t, 0.38);
        this._osc(ctx, 'sine', 800, 150, t, 0.36, g1);
        // Soft harmonic layer at half pitch adds a cartoonish quality
        const g2 = this._gain(ctx, 0.12, t, 0.38);
        this._osc(ctx, 'sine', 400, 75, t, 0.36, g2);
        // Muffled thud at the end (burrowing impact)
        const tThud = t + 0.30;
        const gt = this._gain(ctx, 0.22, tThud, 0.12);
        this._osc(ctx, 'sine', 90, 30, tThud, 0.10, gt);
        const ng  = this._gain(ctx, 0.14, tThud, 0.08);
        const lpf = this._filter(ctx, 'lowpass', 400, ng);
        this._noise(ctx, 0.07, lpf);
    }

    /** Wrong key — low square buzz. */
    _error() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.38, t, 0.18);
        this._osc(ctx, 'square', 100, 80, t, 0.17, g);
    }

    /** Full word/phrase completed — rising sine arpeggio. */
    _wordSuccess() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.28, t, 0.22);
        this._osc(ctx, 'sine', 440, 880, t, 0.18, g);
    }

    /** Frogger hop — soft short blip, quiet so it doesn't fatigue on repeated presses. */
    _frogHop() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.14, t, 0.08);
        this._osc(ctx, 'sine', 520, 420, t, 0.07, g);
    }

    /** Rhythm minigame hit — bright short tone. */
    _rhythmHit() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.3, t, 0.15);
        this._osc(ctx, 'sine', 660, 660, t, 0.13, g);
        const g2 = this._gain(ctx, 0.12, t, 0.15);
        this._osc(ctx, 'sine', 990, 990, t, 0.13, g2);
    }

    /** Alien death — lowpass noise rumble + low boom. */
    _explosion() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const dur = 0.5;
        // Noise → lowpass filter → gain
        const ng  = this._gain(ctx, 0.75, t, dur);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(1400, t);
        lpf.frequency.exponentialRampToValueAtTime(80, t + dur * 0.8);
        lpf.connect(ng);
        this._noise(ctx, dur, lpf);
        // Low boom oscillator
        const bg = this._gain(ctx, 0.50, t, 0.38);
        this._osc(ctx, 'sine', 110, 22, t, 0.35, bg);
    }

    /** Snail or station takes damage — harsh sawtooth drop + noise impact. */
    _damage() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.5, t, 0.22);
        this._osc(ctx, 'sawtooth', 180, 45, t, 0.20, g);
        const ng  = this._gain(ctx, 0.30, t, 0.12);
        const lpf = this._filter(ctx, 'lowpass', 600, ng);
        this._noise(ctx, 0.12, lpf);
    }

    /** Health orb picked up — two ascending sine notes. */
    _healthPickup() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g1 = this._gain(ctx, 0.28, t,        0.14);
        this._osc(ctx, 'sine', 440, 440, t,        0.12, g1);
        const g2 = this._gain(ctx, 0.28, t + 0.12, 0.20);
        this._osc(ctx, 'sine', 660, 660, t + 0.12, 0.18, g2);
    }

    /** Battery picked up — quick two-part electronic blip. */
    _batteryPickup() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g1 = this._gain(ctx, 0.30, t,       0.10);
        this._osc(ctx, 'square', 600, 900, t,       0.08, g1);
        const g2 = this._gain(ctx, 0.25, t + 0.09, 0.12);
        this._osc(ctx, 'square', 900, 600, t + 0.09, 0.10, g2);
    }

    /** Snail grabbed — highpass noise whoosh + bass thump. */
    _grab() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Noise burst through a highpass filter
        const ng  = this._gain(ctx, 0.50, t, 0.20);
        const hpf = this._filter(ctx, 'highpass', 600, ng);
        this._noise(ctx, 0.18, hpf);
        // Short low thump for tactile impact
        const bg = this._gain(ctx, 0.38, t, 0.12);
        this._osc(ctx, 'sine', 180, 55, t, 0.10, bg);
    }

    /** Station loses power — descending alarm + crackle. */
    _powerLoss() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const dur = 0.85;
        const g = this._gain(ctx, 0.45, t, dur);
        this._osc(ctx, 'sawtooth', 520, 80, t, dur * 0.85, g);
        const ng  = this._gain(ctx, 0.18, t, 0.28);
        const hpf = this._filter(ctx, 'highpass', 2000, ng);
        this._noise(ctx, 0.28, hpf);
    }

    /** Station regains power — rising tone with harmonic shimmer. */
    _powerRegain() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const dur = 0.65;
        const g  = this._gain(ctx, 0.42, t, dur);
        this._osc(ctx, 'sine', 150, 600, t, dur * 0.85, g);
        const g2 = this._gain(ctx, 0.18, t, dur);
        this._osc(ctx, 'sine', 300, 1200, t, dur * 0.85, g2);
    }

    /** Escape ship boarding — rising noise whoosh + ascending sawtooth. */
    _escape() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const dur = 1.2;
        // Noise whoosh (highpass cutoff sweeps up)
        const ng  = this._gain(ctx, 0.45, t, dur);
        const hpf = ctx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.setValueAtTime(80, t);
        hpf.frequency.exponentialRampToValueAtTime(3000, t + dur * 0.9);
        hpf.connect(ng);
        this._noise(ctx, dur, hpf);
        // Ascending tone
        const g = this._gain(ctx, 0.32, t, dur);
        this._osc(ctx, 'sawtooth', 100, 800, t, dur * 0.9, g);
    }

    /** Wave cleared — ascending four-note arpeggio (C E G C). */
    _waveComplete() {
        const ctx  = this._ctx_get(), t = ctx.currentTime;
        const notes = [261.6, 329.6, 392.0, 523.2];
        notes.forEach((freq, i) => {
            const st = t + i * 0.13;
            const g  = this._gain(ctx, 0.32, st, 0.30);
            this._osc(ctx, 'sine', freq, freq, st, 0.28, g);
            const g2 = this._gain(ctx, 0.10, st, 0.30);
            this._osc(ctx, 'sine', freq * 2, freq * 2, st, 0.28, g2);
        });
    }

    /** Wave timer officially starts (drop-in complete) — bright bell chime, C–E–G. */
    _waveBegin() {
        const ctx   = this._ctx_get(), t = ctx.currentTime;
        const notes = [523.2, 659.3, 784.0];   // C5, E5, G5
        notes.forEach((freq, i) => {
            const st = t + i * 0.09;
            // Fundamental — long bell decay
            const g = this._gain(ctx, 0.30, st, 0.70);
            this._osc(ctx, 'sine', freq, freq, st, 0.68, g);
            // Octave shimmer
            const g2 = this._gain(ctx, 0.10, st, 0.45);
            this._osc(ctx, 'sine', freq * 2, freq * 2, st, 0.43, g2);
        });
    }

    /** Drone fires — quick robotic two-tone chirp. */
    _droneActivate() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g1 = this._gain(ctx, 0.22, t,        0.09);
        this._osc(ctx, 'square', 880, 1200, t,        0.08, g1);
        const g2 = this._gain(ctx, 0.22, t + 0.10, 0.12);
        this._osc(ctx, 'square', 1400, 1400, t + 0.10, 0.10, g2);
    }

    /** Bullet deflected off shield — metallic ping + highpass zip. */
    _shieldReflect() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Metallic ping — two harmonics, quick pitch-fall
        const g  = this._gain(ctx, 0.45, t, 0.28);
        this._osc(ctx, 'sine', 1800, 900, t, 0.25, g);
        const g2 = this._gain(ctx, 0.20, t, 0.18);
        this._osc(ctx, 'sine', 3200, 1600, t, 0.15, g2);
        // Brief ricochet zip noise
        const ng  = this._gain(ctx, 0.18, t, 0.07);
        const hpf = this._filter(ctx, 'highpass', 3000, ng);
        this._noise(ctx, 0.06, hpf);
    }

    /**
     * Gerald slithering — continuous soft looping sound for movement.
     * Returns a { stop(fadeOut?) } handle; caller must call stop() when done.
     *
     * Graph: looping white-noise buffer → bandpass (~280 Hz) → gain
     *        LFO (2.5 Hz sine) → gain.gain  [gentle amplitude ripple]
     */
    _slithering_looped() {
        const ctx = this._ctx_get();
        const t   = ctx.currentTime;
        const sr  = ctx.sampleRate;

        // 1-second white-noise buffer, set to loop for continuous playback
        const noiseBuf = ctx.createBuffer(1, sr, sr);
        const data     = noiseBuf.getChannelData(0);
        for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        noiseSrc.loop   = true;

        // Bandpass centred ~280 Hz, Q=3 — muffled wet sliding tone
        const bpf           = ctx.createBiquadFilter();
        bpf.type            = 'bandpass';
        bpf.frequency.value = 280;
        bpf.Q.value         = 3;

        // Master gain — quiet; volume scales with master
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.volume * 0.12, t);

        // LFO at 2.5 Hz adds a subtle rhythmic pulse matching the foot-wave
        const lfo           = ctx.createOscillator();
        lfo.type            = 'sine';
        lfo.frequency.value = 2.5;
        const lfoGain       = ctx.createGain();
        lfoGain.gain.value  = 0.035;   // ±3.5 % depth — barely perceptible
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start(t);

        noiseSrc.connect(bpf);
        bpf.connect(gain);
        gain.connect(ctx.destination);
        noiseSrc.start(t);

        return {
            stop: (fadeOut = 0.30) => {
                try {
                    const now = ctx.currentTime;
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(gain.gain.value, now);
                    gain.gain.linearRampToValueAtTime(0, now + fadeOut);
                    noiseSrc.stop(now + fadeOut);
                    lfo.stop(now + fadeOut);
                } catch (_) {}
            },
        };
    }

    /**
     * Victory fanfare — triumphant 8-note major arpeggio with harmonics,
     * followed by a sustained chord swell and a final bell shimmer.
     *
     * Structure:
     *   0.00 s — ascending arpeggio (C4 E4 G4 C5 E5 G5 C6 E6), staggered 90 ms
     *   0.72 s — warm chord swell (C4 + G4 + C5 + E5) with slow attack
     *   1.60 s — glittering high sine shimmer (C7 E7 G7) on top
     */
    _victory() {
        const ctx = this._ctx_get(), t = ctx.currentTime;

        // Arpeggio notes: two octaves of C major
        const arpNotes = [261.6, 329.6, 392.0, 523.2, 659.3, 784.0, 1046.5, 1318.5];
        arpNotes.forEach((freq, i) => {
            const st   = t + i * 0.09;
            const decay = 0.55 + i * 0.05;
            // Fundamental
            const g = this._gain(ctx, 0.26, st, decay);
            this._osc(ctx, 'sine', freq, freq, st, decay - 0.02, g);
            // Octave shimmer
            const g2 = this._gain(ctx, 0.09, st, decay * 0.7);
            this._osc(ctx, 'triangle', freq * 2, freq * 2, st, decay * 0.65, g2);
        });

        // Chord swell — four-voice sustained pad
        const swellStart = t + 0.72;
        const swellDur   = 1.8;
        [[261.6, 0.22], [392.0, 0.18], [523.2, 0.20], [659.3, 0.14]].forEach(([freq, amp]) => {
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, swellStart);
            g.gain.exponentialRampToValueAtTime(amp * this.volume, swellStart + 0.55);
            g.gain.exponentialRampToValueAtTime(0.0001, swellStart + swellDur);
            g.connect(ctx.destination);
            this._osc(ctx, 'sine', freq, freq, swellStart, swellDur, g);
        });

        // Bell shimmer at the top — three high sine notes with long decay
        const shimmerStart = t + 1.60;
        [2093.0, 2637.0, 3136.0].forEach((freq, i) => {
            const st = shimmerStart + i * 0.11;
            const g  = this._gain(ctx, 0.14, st, 1.8);
            this._osc(ctx, 'sine', freq, freq * 0.98, st, 1.75, g);
        });
    }

    /** Alien arrives on screen — descending saucer tone + noise impact. */
    _frogSpawn() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.26, t, 0.30);
        this._osc(ctx, 'sawtooth', 560, 110, t, 0.26, g);
        const ng  = this._gain(ctx, 0.13, t + 0.08, 0.18);
        const lpf = this._filter(ctx, 'lowpass', 500, ng);
        this._noise(ctx, 0.16, lpf);
    }

    /** Frog ribbet — low guttural gurgle then high chirp. */
    _frogRibbet() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Low "rrr" gurgle
        const g1 = this._gain(ctx, 0.20, t, 0.22);
        this._osc(ctx, 'triangle', 95, 68, t, 0.20, g1);
        // High "bit" chirp
        const g2 = this._gain(ctx, 0.16, t + 0.17, 0.20);
        this._osc(ctx, 'sine', 340, 210, t + 0.17, 0.18, g2);
    }

    /** Decorative escape frog hop — soft thud with a little texture. */
    _frogEscapeHop() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g = this._gain(ctx, 0.15, t, 0.13);
        this._osc(ctx, 'sine', 170, 75, t, 0.11, g);
        const ng  = this._gain(ctx, 0.07, t, 0.08);
        const lpf = this._filter(ctx, 'lowpass', 380, ng);
        this._noise(ctx, 0.07, lpf);
    }

    /**
     * Alien swarm movement hum — low throbbing sawtooth drone.
     * Returns { stop(fadeOut?), setVolume(v) } for dynamic volume control.
     */
    _alienSwarm_looped() {
        const ctx = this._ctx_get();
        const t   = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 52;

        // LFO throb at 3.5 Hz gives it an organic pulse
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 3.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 7;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = 280;
        lpf.Q.value = 1.5;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.connect(ctx.destination);

        osc.connect(lpf);
        lpf.connect(gain);
        osc.start(t);
        lfo.start(t);

        const self = this;
        return {
            setVolume(v) {
                try {
                    gain.gain.setTargetAtTime(Math.max(0, v) * self.volume, ctx.currentTime, 0.15);
                } catch (_) {}
            },
            stop(fadeOut = 0.5) {
                try {
                    const now = ctx.currentTime;
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(gain.gain.value, now);
                    gain.gain.linearRampToValueAtTime(0, now + fadeOut);
                    osc.stop(now + fadeOut);
                    lfo.stop(now + fadeOut);
                } catch (_) {}
            },
        };
    }

    // ── Boss sounds ────────────────────────────────────────────────────────────

    /**
     * Boss spawns — ominous low rumble building into a descending sawtooth horn sting.
     * Deep noise sweeps from sub-bass up to mid while a heavy sawtooth siren descends.
     */
    _bossSpawn() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Rumble: noise → lowpass cutoff sweeps 80→600 Hz over 1 s
        const ng  = this._gain(ctx, 0.55, t, 1.40);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(80, t);
        lpf.frequency.exponentialRampToValueAtTime(600, t + 1.0);
        lpf.connect(ng);
        this._noise(ctx, 1.35, lpf);
        // Sub-bass drone
        const bg = this._gain(ctx, 0.50, t, 1.20);
        this._osc(ctx, 'sawtooth', 55, 110, t, 1.15, bg);
        // Descending horn sting at 0.5 s
        const sg = this._gain(ctx, 0.48, t + 0.5, 0.80);
        this._osc(ctx, 'sawtooth', 660, 180, t + 0.5, 0.75, sg);
        // Octave shimmer on top of horn
        const hg = this._gain(ctx, 0.18, t + 0.5, 0.60);
        this._osc(ctx, 'sine', 1320, 360, t + 0.5, 0.55, hg);
    }

    /**
     * Boss fires black hole — dark gravitational pull: ultra-low descending sine + sub-bass
     * sawtooth + low-frequency noise whoosh. Feels heavy and menacing.
     */
    _bossBlackHole() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Primary descending gravitational tone
        const g = this._gain(ctx, 0.60, t, 0.90);
        this._osc(ctx, 'sine', 160, 22, t, 0.85, g);
        // Sub-bass sawtooth for extra weight
        const sg = this._gain(ctx, 0.35, t, 0.70);
        this._osc(ctx, 'sawtooth', 80, 28, t, 0.65, sg);
        // Low rumble noise
        const ng  = this._gain(ctx, 0.30, t, 0.60);
        const lpf = this._filter(ctx, 'lowpass', 220, ng);
        this._noise(ctx, 0.55, lpf);
        // Mid-freq whoosh trail
        const wg  = this._gain(ctx, 0.15, t + 0.08, 0.40);
        const bpf = this._filter(ctx, 'bandpass', 320, wg);
        this._noise(ctx, 0.35, bpf);
    }

    /**
     * Boss fires EMP — sharp electric crack followed by a buzzing discharge.
     * Broadband noise hit, rising square-wave buzz, sparkling high-freq residue.
     */
    _bossEMP() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Initial crack
        const cg  = this._gain(ctx, 0.70, t, 0.12);
        const hpf = this._filter(ctx, 'highpass', 1500, cg);
        this._noise(ctx, 0.12, hpf);
        // Electric buzz rising in pitch
        const bg = this._gain(ctx, 0.45, t, 0.55);
        this._osc(ctx, 'square', 100, 380, t, 0.50, bg);
        // Sparkling high-freq residue
        const sng = this._gain(ctx, 0.22, t + 0.05, 0.45);
        const bpf = this._filter(ctx, 'bandpass', 3500, sng);
        this._noise(ctx, 0.40, bpf);
        // Rising ping for the launch moment
        const pg = this._gain(ctx, 0.28, t + 0.12, 0.30);
        this._osc(ctx, 'sine', 440, 880, t + 0.12, 0.28, pg);
    }

    /**
     * Boss fires terminal-lock EMP — alarm siren feel to signal a specific threat:
     * descending sawtooth siren + secondary square alarm + sharp noise pop.
     */
    _bossTerminalLock() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Primary descending siren
        const g = this._gain(ctx, 0.48, t, 0.80);
        this._osc(ctx, 'sawtooth', 800, 220, t, 0.75, g);
        // Secondary lower alarm
        const g2 = this._gain(ctx, 0.28, t + 0.10, 0.65);
        this._osc(ctx, 'square', 400, 110, t + 0.10, 0.60, g2);
        // Sharp noise pop on launch
        const ng  = this._gain(ctx, 0.40, t, 0.10);
        const hpf = this._filter(ctx, 'highpass', 2000, ng);
        this._noise(ctx, 0.08, hpf);
    }

    /**
     * Boss deploys alien burst — mechanical thump + three staggered pings for
     * each ejected fast alien. Feels like a launch bay opening.
     */
    _bossAlienBurst() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Launch thump
        const bg = this._gain(ctx, 0.55, t, 0.18);
        this._osc(ctx, 'sine', 200, 40, t, 0.16, bg);
        const ng  = this._gain(ctx, 0.30, t, 0.12);
        const lpf = this._filter(ctx, 'lowpass', 800, ng);
        this._noise(ctx, 0.10, lpf);
        // Three quick pings — one per ejected alien
        [0.10, 0.18, 0.26].forEach((delay, i) => {
            const pg = this._gain(ctx, 0.22, t + delay, 0.14);
            this._osc(ctx, 'sine', 900 + i * 120, 500, t + delay, 0.12, pg);
        });
    }

    /**
     * Boss dies — massive multi-stage explosion: instant broadband impact, twin deep
     * sine booms, long decaying rumble, secondary blast, and a metallic ring.
     */
    _bossDeath() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const dur = 2.2;
        // Instant broadband impact burst
        const ig  = this._gain(ctx, 0.90, t, 0.22);
        const hpf = this._filter(ctx, 'highpass', 200, ig);
        this._noise(ctx, 0.22, hpf);
        // Deep boom #1
        const b1 = this._gain(ctx, 0.80, t, 0.90);
        this._osc(ctx, 'sine', 120, 18, t, 0.85, b1);
        // Deep boom #2 — slightly offset pitch and timing for thickness
        const b2 = this._gain(ctx, 0.55, t + 0.04, 0.80);
        this._osc(ctx, 'sine', 90, 14, t + 0.04, 0.75, b2);
        // Long rumble: noise → lowpass sweeping down
        const ng  = this._gain(ctx, 0.70, t, dur);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(1800, t);
        lpf.frequency.exponentialRampToValueAtTime(60, t + dur * 0.85);
        lpf.connect(ng);
        this._noise(ctx, dur, lpf);
        // Secondary blast at 0.3 s
        const sg = this._gain(ctx, 0.45, t + 0.30, 0.70);
        this._osc(ctx, 'sawtooth', 180, 25, t + 0.30, 0.65, sg);
        // Metallic ring overtone
        const rg = this._gain(ctx, 0.22, t, 0.55);
        this._osc(ctx, 'sine', 660, 440, t, 0.50, rg);
    }

    /**
     * Boss intro alert — ship klaxon that plays at the start of the boss spawn
     * cutscene. Five alternating square-wave alarm tones (880/660 Hz) with a
     * low sawtooth rumble underneath and a rising noise swell at the end.
     */
    _bossAlert() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        // Five alternating klaxon tones spaced 200 ms apart
        const tones = [880, 660, 880, 660, 880];
        tones.forEach((freq, i) => {
            const gt = this._gain(ctx, 0.28, t + i * 0.20, 0.18);
            this._osc(ctx, 'square', freq, freq, t + i * 0.20, 0.17, gt);
        });
        // Low sawtooth rumble beneath the tones
        const gr = this._gain(ctx, 0.18, t, 1.20);
        this._osc(ctx, 'sawtooth', 60, 60, t, 1.10, gr);
        // Rising noise swell at the end — anticipation sting
        const fn = this._filter(ctx, 'bandpass', 400, ctx.destination);
        fn.Q.value = 2;
        const gn = this._gain(ctx, 0.15, t + 0.80, 0.55);
        gn.disconnect(); gn.connect(fn);
        this._noise(ctx, 0.55, gn);
    }

    /** New wave beginning — two sharp alert beeps. */
    _waveStart() {
        const ctx = this._ctx_get(), t = ctx.currentTime;
        const g1 = this._gain(ctx, 0.32, t,        0.14);
        this._osc(ctx, 'square', 660, 660, t,        0.12, g1);
        const g2 = this._gain(ctx, 0.32, t + 0.18,  0.14);
        this._osc(ctx, 'square', 880, 880, t + 0.18, 0.12, g2);
    }
}
