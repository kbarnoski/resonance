// ─────────────────────────────────────────────────────────────────────────────
// 11680-corridor · audio.ts — the sounding engine.
//
//   Honors the standing directive to build around REAL recorded music: the
//   visitor can drop their own audio file (FileReader → decodeAudioData) and the
//   flythrough is driven by THAT. With no file, a seeded generative piano-ish
//   chorale (demo.ts PROGRESSION) self-plays so a muted phone still has something
//   to hear the moment it un-mutes.
//
//   ROUTING (non-negotiable): the AudioContext is created on a user gesture.
//   EVERY source connects to createSafeMaster().input — never ctx.destination.
//   A createVoidReverb tail gives the corridor its cavernous depth. The visuals
//   read master.analyser for the FFT. dispose() tears the whole graph down.
//
//   Feature extraction adds, over cloudveil: a spectral CENTROID (tints the end
//   light) and gated spectral-flux ONSET detection (surges the flythrough).
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import { mulberry32, SEED, mtof, clamp } from "./prng";
import { PROGRESSION, CHORD_SECONDS, chordVelocity, type Features } from "./demo";

type AudioCtor = typeof AudioContext;

export class CorridorAudio {
  readonly ctx: AudioContext;
  private readonly master: SafeMaster;
  private readonly reverb: VoidReverb;
  private readonly freqData: Uint8Array<ArrayBuffer>;
  private readonly prevMag: Float32Array;

  private readonly voices = new Set<OscillatorNode>();
  private fileSource: AudioBufferSourceNode | null = null;

  private choraleOn = false;
  private nextChordTime = 0;
  private chordIndex = 0;
  private readonly velRng = mulberry32(SEED ^ 0x9d1c);

  // smoothed feature state so the visuals never jitter frame-to-frame
  private sEnergy = 0.3;
  private sLow = 0.3;
  private sHigh = 0.2;
  private sCentroid = 0.4;

  // onset detection state (gated spectral flux)
  private fluxAvg = 0.01;
  private lastOnsetTime = -1;

  private disposed = false;

  constructor() {
    const Ctor: AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = createSafeMaster(this.ctx, { gain: 0.8 });
    this.reverb = createVoidReverb(this.ctx, { seconds: 5, decay: 2.4, wet: 0.55 });
    this.reverb.output.connect(this.master.input);

    const bins = this.master.analyser.frequencyBinCount;
    this.freqData = new Uint8Array(new ArrayBuffer(bins));
    this.prevMag = new Float32Array(bins);
  }

  /** Resume the context (must be called from the gesture handler). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* some browsers resolve resume() lazily */
      }
    }
  }

  /** Begin the seeded generative chorale. */
  startChorale(): void {
    if (this.disposed) return;
    this.choraleOn = true;
    this.nextChordTime = this.ctx.currentTime + 0.15;
    this.chordIndex = 0;
  }

  /** Decode + loop a visitor-supplied file. Throws on decode failure so the
   *  caller can surface an on-brand notice and fall back to the chorale. */
  async playFile(data: ArrayBuffer): Promise<void> {
    const buffer = await this.ctx.decodeAudioData(data);
    if (this.disposed) return;

    // hand playback to the file: silence the chorale, stop any prior file
    this.choraleOn = false;
    this.stopFile();

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // a little of the file into the void tail for the cavernous depth
    const send = this.ctx.createGain();
    send.gain.value = 0.35;
    src.connect(this.master.input);
    src.connect(send);
    send.connect(this.reverb.input);

    src.start();
    this.fileSource = src;
  }

  private stopFile(): void {
    if (this.fileSource) {
      try {
        this.fileSource.stop();
      } catch {
        /* already stopped */
      }
      try {
        this.fileSource.disconnect();
      } catch {
        /* graph gone */
      }
      this.fileSource = null;
    }
  }

  /** Look-ahead scheduler — call once per animation frame. Schedules the next
   *  chord slightly ahead of the audio clock so playback never gaps. */
  update(): void {
    if (this.disposed || !this.choraleOn) return;
    const now = this.ctx.currentTime;
    const lookahead = 0.5;
    while (this.nextChordTime < now + lookahead) {
      this.spawnChord(this.chordIndex, this.nextChordTime);
      this.chordIndex = (this.chordIndex + 1) % PROGRESSION.length;
      this.nextChordTime += CHORD_SECONDS;
    }
  }

  private spawnChord(index: number, startTime: number): void {
    const notes = PROGRESSION[index];
    const vel = chordVelocity(index);
    const dur = CHORD_SECONDS + 1.6; // legato overlap between chords
    const peak = 0.14 * vel;

    for (const midi of notes) {
      // slight per-note deterministic detune + level for an organic pad
      const detune = (this.velRng() - 0.5) * 6;
      const lvl = peak * (0.7 + 0.3 * this.velRng());
      const f = mtof(midi);

      const body = this.ctx.createOscillator();
      body.type = "triangle"; // piano-ish body
      body.frequency.value = f;
      body.detune.value = detune;

      const shimmer = this.ctx.createOscillator();
      shimmer.type = "sine"; // soft octave shimmer
      shimmer.frequency.value = f * 2;
      shimmer.detune.value = -detune;

      const shimmerGain = this.ctx.createGain();
      shimmerGain.gain.value = 0.18;
      shimmer.connect(shimmerGain);

      const warm = this.ctx.createBiquadFilter();
      warm.type = "lowpass";
      warm.frequency.value = 1400;
      warm.Q.value = 0.5;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, startTime);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, lvl), startTime + 0.9); // slow bloom
      env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur); // long release

      body.connect(warm);
      shimmerGain.connect(warm);
      warm.connect(env);
      env.connect(this.reverb.input); // wet path → void → master

      body.start(startTime);
      shimmer.start(startTime);
      const stopAt = startTime + dur + 0.1;
      body.stop(stopAt);
      shimmer.stop(stopAt);

      for (const o of [body, shimmer]) {
        this.voices.add(o);
        o.onended = () => {
          this.voices.delete(o);
          try {
            o.disconnect();
          } catch {
            /* graph gone */
          }
        };
      }
    }
  }

  /** Read the live analyser into a smoothed feature vector, including a gated
   *  spectral-flux onset for the beat-locked flythrough surge. */
  readFeatures(): Features {
    const freq = this.freqData;
    this.master.analyser.getByteFrequencyData(freq);
    const n = freq.length;

    const band = (lo: number, hi: number): number => {
      let sum = 0;
      let count = 0;
      for (let i = lo; i < hi && i < n; i++) {
        sum += freq[i];
        count++;
      }
      return count > 0 ? sum / (count * 255) : 0;
    };

    const low = band(2, 24);
    const high = band(120, 320);
    const energy = band(2, 320);

    // spectral centroid (brightness) over the audible span + positive spectral
    // flux (onset energy) in one pass.
    let wsum = 0;
    let msum = 0;
    let flux = 0;
    const prev = this.prevMag;
    for (let i = 2; i < n; i++) {
      const m = freq[i];
      wsum += m * i;
      msum += m;
      const d = m - prev[i];
      if (d > 0) flux += d;
      prev[i] = m;
    }
    const centroid = msum > 1 ? clamp(wsum / (msum * n) * 2.4, 0, 1) : this.sCentroid;
    const fluxNorm = flux / (n * 255);

    // one-pole smoothing → visuals breathe, never twitch
    const k = 0.12;
    this.sEnergy += (energy - this.sEnergy) * k;
    this.sLow += (low - this.sLow) * k;
    this.sHigh += (high - this.sHigh) * k;
    this.sCentroid += (centroid - this.sCentroid) * 0.08;

    // adaptive-threshold onset gate with a refractory window. fluxAvg is a slow
    // running floor; a hit is flux well above it, no more than ~8/s.
    this.fluxAvg += (fluxNorm - this.fluxAvg) * 0.05;
    let onset = 0;
    const now = this.ctx.currentTime;
    if (
      fluxNorm > this.fluxAvg * 1.6 + 0.003 &&
      (this.lastOnsetTime < 0 || now - this.lastOnsetTime > 0.12)
    ) {
      onset = clamp((fluxNorm - this.fluxAvg) * 14, 0, 1);
      this.lastOnsetTime = now;
    }

    return {
      energy: clamp(this.sEnergy * 1.7, 0, 1),
      low: clamp(this.sLow * 1.7, 0, 1),
      high: clamp(this.sHigh * 2.0, 0, 1),
      centroid: clamp(this.sCentroid, 0, 1),
      onset,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.choraleOn = false;

    this.stopFile();
    for (const o of this.voices) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      try {
        o.disconnect();
      } catch {
        /* graph gone */
      }
    }
    this.voices.clear();

    try {
      this.reverb.output.disconnect();
    } catch {
      /* graph gone */
    }
    this.master.disconnect();
    try {
      void this.ctx.close();
    } catch {
      /* already closing */
    }
  }
}
