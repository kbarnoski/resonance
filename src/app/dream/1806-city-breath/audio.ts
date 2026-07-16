// City Breath — audio engine.
//
// The city breathes as an AGGREGATE drone (fullness → pitch + brightness) with
// per-event PLUCKS layered on top:
//   * undock  = a warm Karplus-Strong plucked string, tuned by geography
//               (longitude → pentatonic pitch, latitude → stereo pan)
//   * return  = a softer, lower resonant tone
//
// Master chain: everything → DynamicsCompressor → master gain (<= 0.18) →
// destination. Audio only starts on a user gesture (start()).

const MASTER_GAIN = 0.16;

// A major-pentatonic lattice (semitone offsets), spanning a few octaves.
const PENTA = [0, 2, 4, 7, 9];
const BASE_MIDI = 45; // A2

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Map a fraction in [0,1] to a pentatonic frequency across ~3 octaves. */
function pentatonicFreq(frac: number): number {
  const steps = PENTA.length * 3; // 3 octaves of the scale
  const idx = Math.max(0, Math.min(steps - 1, Math.floor(frac * steps)));
  const octave = Math.floor(idx / PENTA.length);
  const degree = idx % PENTA.length;
  return midiToFreq(BASE_MIDI + octave * 12 + PENTA[degree]);
}

export class CityAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;

  // Aggregate drone.
  private droneOscs: OscillatorNode[] = [];
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  private reducedMotion = false;
  private started = false;

  constructor(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
  }

  get isRunning(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio unavailable");
    const ctx = new Ctx();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;
    comp.connect(master);
    master.connect(ctx.destination);
    this.master = master;
    this.comp = comp;

    // ---- aggregate drone -------------------------------------------------
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 600;
    droneFilter.Q.value = 0.7;
    droneFilter.connect(droneGain);
    droneGain.connect(comp);

    // Two detuned saws + a sub sine for warmth.
    const detunes = [-6, 7];
    for (const d of detunes) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 110;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      o.connect(g).connect(droneFilter);
      o.start();
      this.droneOscs.push(o);
    }
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 55;
    const subG = ctx.createGain();
    subG.gain.value = 0.22;
    sub.connect(subG).connect(droneFilter);
    sub.start();
    this.droneOscs.push(sub);

    // Slow tidal LFO breathing the filter cutoff.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = this.reducedMotion ? 0.02 : 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(droneFilter.frequency);
    lfo.start();

    this.droneFilter = droneFilter;
    this.droneGain = droneGain;
    this.lfo = lfo;
    this.lfoGain = lfoGain;

    // Fade the master in gently.
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, now + 1.5);

    this.started = true;
  }

  /** Update the aggregate drone from overall system fullness [0,1].
   *  Fuller city = warmer, brighter, slightly higher. */
  setFullness(fullness: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneFilter) return;
    const f = Math.max(0, Math.min(1, fullness));
    const now = ctx.currentTime;
    // Base pitch drifts about a fifth as the city fills.
    const base = 55 * Math.pow(2, f * 0.58); // 55..~82 Hz sub region
    for (const o of this.droneOscs) {
      const target = o.type === "sine" ? base : base * 2;
      o.frequency.setTargetAtTime(target, now, 2.5);
    }
    // Brightness tracks fullness.
    const cutoff = 320 + f * 1400;
    this.droneFilter.frequency.setTargetAtTime(cutoff, now, 2.0);
  }

  /** Karplus-Strong plucked string for an undock event. */
  pluckUndock(lonFrac: number, latFrac: number, magnitude: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.comp) return;
    const freq = pentatonicFreq(lonFrac);
    const pan = Math.max(-1, Math.min(1, latFrac * 2 - 1));
    const amp = Math.min(0.5, 0.22 + 0.06 * (magnitude - 1));
    this.karplus(freq, pan, amp, 0.5);
  }

  /** Softer, lower resonant tone for a return event. */
  toneReturn(lonFrac: number, latFrac: number, magnitude: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.comp) return;
    const now = ctx.currentTime;
    const freq = pentatonicFreq(lonFrac) * 0.5; // an octave lower
    const pan = Math.max(-1, Math.min(1, latFrac * 2 - 1));
    const amp = Math.min(0.28, 0.12 + 0.03 * (magnitude - 1));

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = freq * 4;
    filt.Q.value = 3;
    const g = ctx.createGain();
    g.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    osc.connect(filt).connect(g).connect(panner).connect(this.comp);
    const dur = 0.9;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    osc.onended = () => {
      try {
        osc.disconnect();
        filt.disconnect();
        g.disconnect();
        panner.disconnect();
      } catch {
        // already gone
      }
    };
  }

  // Karplus-Strong: a short filtered noise burst injected into a tuned
  // feedback delay loop (delay = 1/freq) with a damping lowpass.
  private karplus(freq: number, pan: number, amp: number, damp: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const period = 1 / freq;

    // Excitation: a couple of periods of filtered noise.
    const burstLen = Math.max(2, Math.ceil(ctx.sampleRate * period * 2));
    const buf = ctx.createBuffer(1, burstLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic-enough excitation via a tiny LCG seeded by the pitch.
    let seed = (Math.floor(freq * 100) ^ 0x1806) >>> 0;
    for (let i = 0; i < burstLen; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const delay = ctx.createDelay(1);
    delay.delayTime.value = period;
    const fb = ctx.createGain();
    fb.gain.value = 0.96; // sustain
    const loopFilter = ctx.createBiquadFilter();
    loopFilter.type = "lowpass";
    loopFilter.frequency.value = freq * (6 + 10 * (1 - damp));
    loopFilter.Q.value = 0.4;

    // Feedback loop: delay -> loopFilter -> fb -> delay
    delay.connect(loopFilter);
    loopFilter.connect(fb);
    fb.connect(delay);

    // Excite the loop.
    src.connect(delay);

    // Output envelope + pan.
    const out = ctx.createGain();
    out.gain.value = amp;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    delay.connect(out).connect(panner).connect(this.comp!);

    // Decay the feedback so the string dies away naturally.
    const life = 1.6;
    fb.gain.setValueAtTime(0.96, now);
    fb.gain.linearRampToValueAtTime(0.0, now + life);
    out.gain.setValueAtTime(amp, now);
    out.gain.setTargetAtTime(0.0001, now + life * 0.5, 0.5);

    src.start(now);
    src.stop(now + Math.min(0.1, burstLen / ctx.sampleRate + 0.01));

    // Clean up the loop nodes after it has rung out.
    const cleanupAt = (life + 0.4) * 1000;
    window.setTimeout(() => {
      try {
        src.disconnect();
        delay.disconnect();
        fb.disconnect();
        loopFilter.disconnect();
        out.disconnect();
        panner.disconnect();
      } catch {
        // already disconnected
      }
    }, cleanupAt);
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      for (const o of this.droneOscs) {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      }
      this.lfo?.stop();
    } catch {
      /* noop */
    }
    this.droneOscs = [];
    this.lfo = null;
    // Close context on the next tick so in-flight plucks can release.
    window.setTimeout(() => {
      ctx.close().catch(() => {
        /* noop */
      });
    }, 50);
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.started = false;
  }
}
