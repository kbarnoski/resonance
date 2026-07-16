// ─────────────────────────────────────────────────────────────────────────────
// 1778 — Gradient Lotus · audio.ts
//
// A self-playing WARM generative bed (no mic, no file required). A sustained
// lydian pad of gently detuned triangle/saw partials sits under a slow lowpass
// LFO and a code-generated void reverb; over the top, a generative voice plucks
// soft pentatonic bells that drift the harmony. An AnalyserNode taps the master
// bus so the visual can read six perceptual FFT bands each frame.
//
// The whole point of the piece is the RENDER substrate (CSS compositor), so the
// audio just has to (a) sound warm and alive from the first Begin, and (b) hand
// the visual six clean, smoothed energy bands. Optionally a dropped audio file
// can replace the generative bed through the same analyser.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

type Ctor = typeof AudioContext;

function resolveAudioContext(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: Ctor;
    webkitAudioContext?: Ctor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// A warm A-major pentatonic (A B C# E F#) spread across a few octaves, in Hz.
// These are the notes the generative voice draws from — no minor thirds, so it
// stays luminous rather than melancholy.
const PENTATONIC: number[] = [
  220.0, 246.94, 277.18, 329.63, 369.99, // octave 3
  440.0, 493.88, 554.37, 659.25, 739.99, // octave 4
  880.0, 987.77, // octave 5 shimmer
];

// Two lydian pad voicings (root A). The bed drifts between them for slow motion.
const PAD_CHORDS: number[][] = [
  [110.0, 164.81, 277.18, 415.3], // A2  E3  C#4  G#4  (Amaj7 / lydian colour)
  [123.47, 185.0, 311.13, 493.88], // B2  F#3 D#4  B4   (Bmaj lift)
];

export class LotusAudio {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private freq: Uint8Array<ArrayBuffer>;

  private master: GainNode; // final level, ramps in on start
  private busFilter: BiquadFilterNode; // lowpass the whole bed sits under
  private lfo: OscillatorNode; // slow filter-cutoff LFO
  private lfoGain: GainNode;
  private reverb: VoidReverb;

  private padGain: GainNode; // level of the sustained pad
  private padOscs: OscillatorNode[] = [];
  private padDetunes: OscillatorNode[] = []; // second, slightly detuned copies
  private padVoiceCount: number;

  private voiceBus: GainNode; // where generative bells sum before reverb
  private noteTimer = 0; // seconds until the next generative note
  private chordTimer = 0; // seconds until the next pad voicing change
  private chordIndex = 0;

  // Six smoothed perceptual bands, exposed to the visual each frame.
  readonly bands = new Float32Array(6);

  private disposed = false;
  private fileSource: AudioBufferSourceNode | null = null;

  constructor() {
    const Ctx = resolveAudioContext();
    if (!Ctx) throw new Error("Web Audio API unavailable");
    this.ctx = new Ctx();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // ── master + analyser tap ──
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.7, now + 3.5); // slow fade-in

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    // master -> analyser -> speakers (analyser is a pass-through tap)
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // ── bus lowpass with a slow opening LFO ──
    this.busFilter = ctx.createBiquadFilter();
    this.busFilter.type = "lowpass";
    this.busFilter.frequency.value = 900;
    this.busFilter.Q.value = 0.7;

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.06; // ~16 s sweep — pure breathing
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 620; // cutoff swings 280 .. 1520 Hz
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.busFilter.frequency);
    this.lfo.start();

    // ── reverb (code-generated void tail) ──
    this.reverb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.6, wet: 0.45 });

    // busFilter -> master (dry) and busFilter -> reverb -> master (wet)
    this.busFilter.connect(this.master);
    this.busFilter.connect(this.reverb.input);
    this.reverb.output.connect(this.master);

    // ── sustained pad ──
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.16;
    this.padGain.connect(this.busFilter);

    const chord = PAD_CHORDS[0];
    this.padVoiceCount = chord.length;
    for (let i = 0; i < chord.length; i++) {
      const f = chord[i];
      // Each pad note is a triangle plus a saw a few cents off for chorus.
      const a = ctx.createOscillator();
      a.type = "triangle";
      a.frequency.value = f;
      const b = ctx.createOscillator();
      b.type = "sawtooth";
      b.frequency.value = f;
      b.detune.value = i % 2 === 0 ? 6 : -6;

      const g = ctx.createGain();
      // Lower notes louder for a warm foundation, upper notes softer.
      g.gain.value = 0.9 / (1 + i * 0.7);
      const gb = ctx.createGain();
      gb.gain.value = 0.28 / (1 + i * 0.7);

      a.connect(g);
      g.connect(this.padGain);
      b.connect(gb);
      gb.connect(this.padGain);
      a.start();
      b.start();
      this.padOscs.push(a);
      this.padDetunes.push(b);
    }

    // ── generative voice bus (bells) — brighter, sits fully in the reverb ──
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;
    this.voiceBus.connect(this.busFilter);

    this.noteTimer = 0.6;
    this.chordTimer = 18;
  }

  /** Resume the context (must be called from a user gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /** Trigger one soft pentatonic bell with a long, gentle envelope. */
  private pluck(freq: number, level: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    // A faint octave partial for a glassy sheen.
    const shine = ctx.createOscillator();
    shine.type = "sine";
    shine.frequency.value = freq * 2;

    const shineGain = ctx.createGain();
    shineGain.gain.value = 0.22;
    shine.connect(shineGain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.35); // soft attack
    env.gain.exponentialRampToValueAtTime(0.0001, t + 3.4); // long release

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;

    osc.connect(env);
    shineGain.connect(env);
    env.connect(pan);
    pan.connect(this.voiceBus);

    osc.start(t);
    shine.start(t);
    osc.stop(t + 3.6);
    shine.stop(t + 3.6);
  }

  /** Glide the pad to the next lydian voicing over several seconds. */
  private shiftChord(): void {
    if (this.disposed) return;
    this.chordIndex = (this.chordIndex + 1) % PAD_CHORDS.length;
    const chord = PAD_CHORDS[this.chordIndex];
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.padVoiceCount; i++) {
      const f = chord[i % chord.length];
      this.padOscs[i]?.frequency.setTargetAtTime(f, t, 3.5);
      this.padDetunes[i]?.frequency.setTargetAtTime(f, t, 3.5);
    }
  }

  /** Advance the generative scheduler; call once per animation frame. */
  tick(dt: number): void {
    if (this.disposed) return;
    // Don't schedule generative bells while a dropped file is playing.
    if (!this.fileSource) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) {
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        // Higher notes softer so the mix never gets shrill.
        const level = 0.14 * (330 / Math.max(220, f)) + 0.05;
        this.pluck(f, level);
        // Occasionally a quick grace note a fifth up for sparkle.
        if (Math.random() < 0.3) {
          this.pluck(f * 1.5, level * 0.6);
        }
        this.noteTimer = 1.4 + Math.random() * 2.6;
      }
    }

    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      this.shiftChord();
      this.chordTimer = 16 + Math.random() * 8;
    }
  }

  /**
   * Read the analyser and reduce it to six log-spaced perceptual bands,
   * lightly time-smoothed. Values are 0..1. Called each frame by the visual.
   */
  readBands(): Float32Array {
    if (this.disposed) return this.bands;
    this.analyser.getByteFrequencyData(this.freq);
    const n = this.freq.length;
    // Log-spaced edges so bass/mid/treble are perceptually balanced.
    const edges = [0, 4, 10, 24, 60, 150, n];
    for (let b = 0; b < 6; b++) {
      let sum = 0;
      let count = 0;
      for (let i = edges[b]; i < edges[b + 1]; i++) {
        sum += this.freq[i];
        count++;
      }
      const raw = count > 0 ? sum / count / 255 : 0;
      // Mild expansion so quiet passages read as "closed", loud as "open".
      const shaped = Math.pow(raw, 1.25);
      // Exponential smoothing on top of the analyser's own smoothing.
      this.bands[b] += (shaped - this.bands[b]) * 0.25;
    }
    return this.bands;
  }

  /** Replace the generative bed with a dropped, looping audio file. */
  async playFile(data: ArrayBuffer): Promise<void> {
    if (this.disposed) return;
    const buffer = await this.ctx.decodeAudioData(data);
    // Duck the generative bed; the file drives the analyser now.
    const t = this.ctx.currentTime;
    this.padGain.gain.setTargetAtTime(0.02, t, 1.5);
    this.voiceBus.gain.setTargetAtTime(0.0, t, 1.5);
    this.fileSource?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.busFilter);
    src.start();
    this.fileSource = src;
  }

  /** Tear everything down. Safe to call twice. */
  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.3);
    } catch {
      /* ignore */
    }
    const stopNode = (o: OscillatorNode) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    };
    this.padOscs.forEach(stopNode);
    this.padDetunes.forEach(stopNode);
    stopNode(this.lfo);
    try {
      this.fileSource?.stop();
    } catch {
      /* ignore */
    }
    // Close the context shortly after the fade so we don't click.
    window.setTimeout(() => {
      this.ctx.close().catch(() => {
        /* ignore */
      });
    }, 400);
  }
}
