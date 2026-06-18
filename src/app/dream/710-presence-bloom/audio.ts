// ── Presence Bloom · spatial audio engine ────────────────────────────────────
// Spatialization IS the instrument. ONE AudioListener at the origin (the user's
// ears). Every PERSISTENT voice is its own HRTF PannerNode at a fixed 3D point,
// with distance attenuation and a reverb send that GROWS with distance — far
// voices quieter + wetter, near voices present and dry. Voices accrete over
// minutes into an evolving spatial chord drawn from a slow D-Dorian modal field.

export interface VoiceState {
  id: number;
  // World position in metres (listener at origin). x right, y up, z toward user (+).
  pos: { x: number; y: number; z: number };
  freq: number;
  bornAt: number; // ctx time
  age: number; // seconds alive (updated each tick)
  level: number; // current rendered loudness 0..1 (for visuals)
  pulse: number; // 0..1 envelope shimmer (for visuals)
  fading: boolean;
}

interface VoiceNodes {
  state: VoiceState;
  osc: OscillatorNode;
  osc2: OscillatorNode; // a soft detuned partial for body
  gain: GainNode;
  panner: PannerNode;
  dry: GainNode;
  wet: GainNode; // reverb send
  lfo: OscillatorNode; // slow amplitude shimmer
  lfoGain: GainNode;
}

const MAX_VOICES = 24;

// D-Dorian modal field. Pitch classes spelled as scale degrees (D E F G A B C).
// We voice across several octaves and let a slow drift bias which region of the
// chord (Dm9 → Gmaj9 → Em11 → Dadd9) the next placed voice belongs to.
// Frequencies (Hz) of a 2.5-octave D-Dorian palette, homeward gravity on D & A.
const DDORIAN: number[] = (() => {
  // D Dorian degrees as semitone offsets from D: 0 2 3 5 7 9 10 (12...)
  const degrees = [0, 2, 3, 5, 7, 9, 10];
  const baseD = 146.83; // D3
  const out: number[] = [];
  for (let oct = 0; oct < 3; oct++) {
    for (const d of degrees) {
      out.push(baseD * Math.pow(2, oct + d / 12));
    }
  }
  return out.filter((f) => f < 1200); // keep it warm, not shrill
})();

// Build a short, smooth reverb impulse response (procedural — no asset).
function makeReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponential decay with a soft early build → cathedral-ish tail.
      const env = Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / (rate * 0.02)));
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

export class BloomAudio {
  ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private convolver: ConvolverNode;
  private reverbReturn: GainNode;
  private voices: VoiceNodes[] = [];
  private nextId = 0;
  private chordDrift = 0; // 0..1 slow phase across the modal regions
  private startedAt = 0;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.startedAt = ctx.currentTime;

    // Listener at origin, facing -z (default). Up is +y.
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
      L.forwardX.value = 0;
      L.forwardY.value = 0;
      L.forwardZ.value = -1;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001; // fade in on start

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeReverbIR(ctx, 3.4);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.9;

    // Dry master → comp → destination. Reverb return also → comp.
    this.master.connect(this.comp);
    this.convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  // Resume + fade master in (call inside the Start gesture).
  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.targetMaster(), now + 0.7);
  }

  // Master scales down as voices accrete so the sum never gets harsh.
  private targetMaster(): number {
    const n = this.voices.filter((v) => !v.state.fading).length;
    const g = 0.32 / (1 + n * 0.085);
    return Math.max(0.07, g);
  }

  // Pick the next pitch given the placement position + slow chord drift.
  private pickFreq(pos: { x: number; y: number; z: number }): number {
    // Drift biases the palette toward an evolving region of the field.
    // Map height + a drifting window onto the D-Dorian palette index.
    const drift = this.chordDrift;
    const heightBias = (pos.y + 1) / 2; // low placements → lower pitches
    const idxF =
      (heightBias * 0.6 + drift * 0.4 + Math.random() * 0.12) *
      (DDORIAN.length - 1);
    let idx = Math.round(idxF);
    idx = Math.max(0, Math.min(DDORIAN.length - 1, idx));
    return DDORIAN[idx];
  }

  // Place a persistent voice at a body-space point (x,y in [-1,1], z depth 0..1).
  placeVoice(bx: number, by: number, bz: number) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Map body space → world metres. Push voices out onto a shell around the
    // listener; depth pushes them nearer/farther along z.
    const radius = 3.2;
    const x = bx * radius;
    const y = by * radius * 0.7;
    // bz: 0 far .. 1 near. Map to z in front of the listener with spread.
    const z = (bz - 0.5) * 4.0 - 1.2;
    const pos = { x, y, z };

    const freq = this.pickFreq({ x: bx, y: by, z: bz });

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = freq * 2.001; // gentle octave partial
    osc2.detune.value = 4;

    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.18;
    osc2.connect(partialGain);

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    osc.connect(gain);
    partialGain.connect(gain);

    // Slow amplitude shimmer per voice (each breathes independently).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08 + Math.random() * 0.16;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.14;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.maxDistance = 18;
    panner.rolloffFactor = 1.1;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }

    gain.connect(panner);

    // Dry + wet sends. Wet (reverb) grows with distance.
    const dist = Math.hypot(x, y, z);
    const wetAmt = Math.min(0.9, 0.12 + (dist / panner.maxDistance) * 1.6);
    const dryAmt = Math.max(0.25, 1 - wetAmt * 0.7);

    const dry = ctx.createGain();
    dry.gain.value = dryAmt;
    const wet = ctx.createGain();
    wet.gain.value = wetAmt;

    panner.connect(dry);
    panner.connect(wet);
    dry.connect(this.master);
    wet.connect(this.convolver);

    // Soft attack — a voice blooms in over ~1.2s.
    const peak = 0.55;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 1.2);

    osc.start(now);
    osc2.start(now);
    lfo.start(now);

    const state: VoiceState = {
      id: this.nextId++,
      pos,
      freq,
      bornAt: now,
      age: 0,
      level: 0,
      pulse: 1, // bloom burst at placement
      fading: false,
    };
    this.voices.push({ state, osc, osc2, gain, panner, dry, wet, lfo, lfoGain });

    // Cap: fade the oldest when we exceed the limit.
    if (this.voices.length > MAX_VOICES) {
      const oldest = this.voices.find((v) => !v.state.fading);
      if (oldest) this.fadeOut(oldest);
    }

    // Re-balance master for the new count.
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.targetMaster(), now, 0.5);
  }

  private fadeOut(v: VoiceNodes) {
    v.state.fading = true;
    const now = this.ctx.currentTime;
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + 4.0);
    const stopAt = now + 4.3;
    try {
      v.osc.stop(stopAt);
      v.osc2.stop(stopAt);
      v.lfo.stop(stopAt);
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => {
      this.voices = this.voices.filter((x) => x !== v);
      try {
        v.panner.disconnect();
        v.dry.disconnect();
        v.wet.disconnect();
      } catch {
        /* noop */
      }
    }, 4500);
  }

  // Per-frame update: drive overall brightness from body energy, evolve drift,
  // and refresh per-voice level/pulse for the visuals. `energy` 0..1.
  tick(dt: number, energy: number) {
    const now = this.ctx.currentTime;
    // Chord drifts slowly over minutes (full cycle ~4 min).
    this.chordDrift = (Math.sin((now - this.startedAt) * 0.0065) + 1) / 2;

    // Body energy swells overall level; stillness eases it down (but voices
    // keep singing — master never drops to silence).
    const energized = this.targetMaster() * (0.62 + energy * 0.55);
    this.master.gain.setTargetAtTime(
      Math.min(0.34, energized),
      now,
      0.4,
    );

    for (const v of this.voices) {
      v.state.age = now - v.state.bornAt;
      // Approximate rendered level for visuals: attack ramp + shimmer + decay-free.
      const attack = Math.min(1, v.state.age / 1.2);
      const dist = Math.hypot(v.state.pos.x, v.state.pos.y, v.state.pos.z);
      const distAtten = 1.2 / (1.2 + dist * 0.5);
      v.state.level = v.state.fading
        ? Math.max(0, v.state.level - dt * 0.25)
        : attack * distAtten * (0.7 + energy * 0.4);
      // Pulse decays after placement; gentle re-bloom on high energy.
      v.state.pulse = Math.max(0, v.state.pulse - dt * 0.8) + energy * dt * 0.4;
      v.state.pulse = Math.min(1.4, v.state.pulse);
    }
  }

  // Snapshot for the renderer.
  snapshot(): VoiceState[] {
    return this.voices.map((v) => v.state);
  }

  voiceCount(): number {
    return this.voices.filter((v) => !v.state.fading).length;
  }

  async close() {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    } catch {
      /* noop */
    }
    for (const v of this.voices) {
      try {
        v.osc.stop(now + 0.35);
        v.osc2.stop(now + 0.35);
        v.lfo.stop(now + 0.35);
      } catch {
        /* noop */
      }
    }
    await new Promise((r) => window.setTimeout(r, 400));
    try {
      await this.ctx.close();
    } catch {
      /* noop */
    }
  }
}
