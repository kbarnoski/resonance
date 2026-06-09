// Joyful, ESCALATING, RESOLVING mallet engine for the jelly storm.
//
// Pitched melodic synthesis only — warm marimba/mallet voices (triangle +
// sine with a light FM shimmer and fast decay) plus an always-on warm pad.
// NO drum-machine / kick-snare-hat grid (banned this cycle).
//
// The physics "energy" drives intensity:
//   low energy  -> sparse single mallet notes over a soft pad
//   high energy -> fast dense arpeggios climbing I–IV–V–I, building to a
//                  triumphant tutti chord
//   calming     -> the engine RESOLVES to the tonic major chord (the payoff)
//
// Key: G major. Real chords, full major scale (no pentatonic drift).
// Final brick-wall compressor keeps it kid-safe: full and energetic but
// never harsh, even at peak chaos.

// G major scale midi pitches across a couple of octaves (G, A, B, C, D, E, F#)
const SCALE = [
  55, 57, 59, 60, 62, 64, 66, // G3..F#4
  67, 69, 71, 72, 74, 76, 78, // G4..F#5
  79, 81, 83, 84, 86, 88, // G5..E6
];

// Diatonic triads in G major, as midi note arrays. I – IV – V – I journey.
const CHORDS: Record<string, number[]> = {
  I: [55, 59, 62], // G  B  D
  IV: [60, 64, 67], // C  E  G
  V: [62, 66, 69], // D  F# A
  vi: [57, 60, 64], // E  G  B  (relative minor color)
};
const PROGRESSION = ["I", "IV", "V", "I", "vi", "IV", "V", "I"];

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class JellyAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private padGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;

  private padOscs: OscillatorNode[] = [];
  private padFilter!: BiquadFilterNode;

  private started = false;
  private chordIdx = 0;
  private arpClock = 0; // seconds accumulator for arpeggio scheduling
  private arpStep = 0;
  private resolveTimer = 0; // counts low-energy time toward a resolve
  private lastEnergy = 0;

  get isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    await ctx.resume();

    this.limiter = ctx.createDynamicsCompressor();
    // brick-wall-ish limiter for kid safety
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8, 2.4);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.28;

    this.master.connect(this.limiter);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // always-on warm pad on the tonic so it's never silent
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.6;
    this.padGain.connect(this.padFilter);
    this.padFilter.connect(this.master);
    this.padFilter.connect(this.reverb);
    for (const m of CHORDS.I) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(m);
      const og = ctx.createGain();
      og.gain.value = 0.18;
      o.connect(og);
      og.connect(this.padGain);
      o.start();
      this.padOscs.push(o);
      // a soft beating detune voice
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = mtof(m) * 1.005;
      const og2 = ctx.createGain();
      og2.gain.value = 0.12;
      o2.connect(og2);
      og2.connect(this.padGain);
      o2.start();
      this.padOscs.push(o2);
    }
    // fade the pad in gently
    this.padGain.gain.setTargetAtTime(0.22, ctx.currentTime, 1.2);

    this.started = true;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // One warm mallet hit (triangle + sine body, light FM shimmer, fast decay).
  private mallet(freq: number, vel: number, when: number): void {
    const ctx = this.ctx!;
    const t = when;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const peak = Math.min(0.5, 0.18 + vel * 0.32);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    const dur = 0.5 + vel * 0.4;
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // body
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = freq;
    // FM shimmer
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 3.01;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.18);
    mod.connect(modGain);
    modGain.connect(body.frequency);

    // sine sub for warmth
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq * 0.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    sub.connect(subGain);
    subGain.connect(out);

    body.connect(out);
    out.connect(this.master);
    out.connect(this.reverb);

    body.start(t);
    mod.start(t);
    sub.start(t);
    body.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  // Play a pitched note for a spawn/collision, color chosen near the energy.
  noteOn(energy: number, vel = 0.6, hueBias = 0.5): void {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.001;
    // pick a scale degree: more energy -> reach higher
    const lo = Math.floor(hueBias * 4);
    const span = 5 + Math.floor(energy * 9);
    const idx = Math.min(
      SCALE.length - 1,
      lo + Math.floor(Math.random() * span)
    );
    this.mallet(mtof(SCALE[idx]), vel, t);
  }

  // A triumphant tutti chord (the build peak) — full diatonic triad spread.
  private tuttiChord(when: number, vel = 0.9): void {
    const chord = CHORDS[PROGRESSION[this.chordIdx % PROGRESSION.length]];
    const voices = [...chord, chord[0] + 12, chord[1] + 12, chord[2] + 12];
    voices.forEach((m, i) => {
      this.mallet(mtof(m), vel * (i < 3 ? 1 : 0.6), when + i * 0.012);
    });
  }

  // Resolve to the tonic G major chord — the satisfying payoff on calm.
  resolveToTonic(): void {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const tonic = [55, 59, 62, 67, 71, 74]; // G B D G B D, fat & bright
    tonic.forEach((m, i) => {
      this.mallet(mtof(m), 0.85 - i * 0.06, t + i * 0.05);
    });
    this.chordIdx = 0; // re-home the progression
    // brighten + swell the pad briefly to underline the landing
    this.padFilter.frequency.cancelScheduledValues(t);
    this.padFilter.frequency.setTargetAtTime(1600, t, 0.2);
    this.padFilter.frequency.setTargetAtTime(900, t + 0.9, 0.6);
    this.padGain.gain.setTargetAtTime(0.32, t, 0.1);
    this.padGain.gain.setTargetAtTime(0.22, t + 1.0, 0.8);
  }

  // Called every animation frame with current physics state.
  // Drives arpeggio density/tempo and the build->resolve arc.
  update(
    dt: number,
    energy: number,
    spawnPulse: number,
    impacts: number[]
  ): void {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;

    // pad responds to energy: more chaos -> brighter, fuller pad
    const padCut = 700 + energy * 2600 + spawnPulse * 600;
    this.padFilter.frequency.setTargetAtTime(padCut, ctx.currentTime, 0.12);
    this.padGain.gain.setTargetAtTime(
      0.2 + energy * 0.14,
      ctx.currentTime,
      0.2
    );

    // turn recent physics impacts into pitched notes immediately
    for (const hue of impacts) {
      this.noteOn(energy, 0.45 + energy * 0.4, hue);
    }

    // ESCALATION: arpeggio that climbs the progression, faster & denser
    // as energy rises. Below a floor, we go quiet & sparse.
    const active = energy + spawnPulse * 0.5;
    if (active > 0.12) {
      // step interval shrinks with energy: ~0.34s calm -> ~0.075s frantic
      const interval = 0.34 - Math.min(0.26, active * 0.3);
      this.arpClock += dt;
      if (this.arpClock >= interval) {
        this.arpClock = 0;
        const chord =
          CHORDS[PROGRESSION[this.chordIdx % PROGRESSION.length]];
        const note = chord[this.arpStep % chord.length];
        const oct = Math.floor(this.arpStep / chord.length) % 2;
        this.mallet(
          mtof(note + 12 + oct * 12),
          0.4 + active * 0.5,
          ctx.currentTime + 0.001
        );
        this.arpStep++;
        // advance chord every 4 arp steps -> walks I-IV-V-I
        if (this.arpStep % 4 === 0) {
          this.chordIdx++;
          // at a peak of chaos, drop a triumphant tutti chord
          if (active > 0.72 && this.chordIdx % 4 === 0) {
            this.tuttiChord(ctx.currentTime + 0.02, 0.85);
          }
        }
      }
    }

    // RESOLVE: when energy has fallen and stayed low after being high,
    // land on the tonic major chord.
    const calmedDown = energy < 0.1 && this.lastEnergy >= 0.1;
    if (energy < 0.12) {
      this.resolveTimer += dt;
    } else {
      this.resolveTimer = 0;
    }
    if (calmedDown || (this.resolveTimer > 0.9 && this.resolveTimer < 1.0)) {
      this.resolveToTonic();
      this.resolveTimer = 1.5; // debounce
    }
    this.lastEnergy = energy;
  }

  stop(): void {
    if (!this.ctx) return;
    try {
      for (const o of this.padOscs) o.stop();
    } catch {
      // already stopped
    }
    this.ctx.close();
    this.ctx = null;
    this.started = false;
    this.padOscs = [];
  }
}
