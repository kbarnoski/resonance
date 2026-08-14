// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot · audio.ts — the sounding scope.
//
//   There is ALWAYS something to draw with: a soft reference drone (root +
//   fifth) drones continuously so the scope has a signal even in silence, and a
//   RESONATOR voice glides to whatever pitch is currently locked, so the
//   instrument seems to sing back the note you are holding. Everything is routed
//   through createSafeMaster + createVoidReverb — NEVER ctx.destination.
//
//   The same AudioContext also owns a private mic tap: getUserMedia → an
//   AnalyserNode (time-domain only, never connected to the output, so no
//   feedback). readPitch() runs the in-folder YIN-lite estimator over that
//   window. This is the pitch that LOCKS a held vowel into a clean knot.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import { estimatePitch, type Pitch } from "./pitch";

type AudioCtor = typeof AudioContext;

export class ScopeAudio {
  readonly ctx: AudioContext;
  private readonly master: SafeMaster;
  private readonly reverb: VoidReverb;
  private readonly droneGain: GainNode;
  private readonly root: OscillatorNode;
  private readonly fifth: OscillatorNode;
  private readonly resonator: OscillatorNode;
  private readonly resonGain: GainNode;

  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private timeBuf: Float32Array | null = null;

  private started = false;
  private disposed = false;

  constructor(rootFreq: number) {
    const Ctor: AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = createSafeMaster(this.ctx, { gain: 0.8 });
    this.reverb = createVoidReverb(this.ctx, { seconds: 5, decay: 2.6, wet: 0.45 });
    this.reverb.output.connect(this.master.input);

    // Drone bus: a low sine root + a quiet fifth, blooming softly under it all.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0001;

    this.root = this.ctx.createOscillator();
    this.root.type = "sine";
    this.root.frequency.value = rootFreq;
    const rootG = this.ctx.createGain();
    rootG.gain.value = 0.16;
    this.root.connect(rootG);
    rootG.connect(this.droneGain);

    this.fifth = this.ctx.createOscillator();
    this.fifth.type = "sine";
    this.fifth.frequency.value = rootFreq * 1.5;
    const fifthG = this.ctx.createGain();
    fifthG.gain.value = 0.08;
    this.fifth.connect(fifthG);
    fifthG.connect(this.droneGain);

    // Resonator: a triangle voice that glides to the currently locked pitch,
    // so the instrument "sings back" the note you hold.
    this.resonator = this.ctx.createOscillator();
    this.resonator.type = "triangle";
    this.resonator.frequency.value = rootFreq * 2;
    this.resonGain = this.ctx.createGain();
    this.resonGain.gain.value = 0.0001;
    this.resonator.connect(this.resonGain);
    this.resonGain.connect(this.droneGain);

    const tone = this.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1600;
    tone.Q.value = 0.5;
    this.droneGain.connect(tone);
    tone.connect(this.reverb.input);
    tone.connect(this.master.input); // a little dry body under the wet tail
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* some browsers resolve resume() lazily */
      }
    }
  }

  /** Start the continuous drone. Idempotent. */
  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.root.start(now);
    this.fifth.start(now);
    this.resonator.start(now);
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.exponentialRampToValueAtTime(0.7, now + 3.5);
  }

  /** Open the mic and wire a time-domain analyser (never to the output). */
  async startMic(): Promise<boolean> {
    if (this.disposed || this.analyser) return this.analyser != null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      this.micStream = stream;
      const src = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.0; // raw window for autocorrelation
      src.connect(analyser); // NOT to destination — no feedback
      this.analyser = analyser;
      this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      return true;
    } catch {
      return false;
    }
  }

  /** Run YIN-lite over the current mic window. null when no mic / no pitch. */
  readPitch(): Pitch | null {
    const a = this.analyser;
    const buf = this.timeBuf;
    if (!a || !buf) return null;
    a.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
    return estimatePitch(buf, this.ctx.sampleRate);
  }

  /** Glide the resonator toward the locked pitch and lift its level with lock. */
  setResonance(freq: number, lock: number): void {
    if (this.disposed || !this.started) return;
    const now = this.ctx.currentTime;
    const f = Math.min(2000, Math.max(40, freq));
    this.resonator.frequency.setTargetAtTime(f, now, 0.12);
    const lvl = 0.0001 + 0.11 * Math.max(0, Math.min(1, lock));
    this.resonGain.gain.setTargetAtTime(lvl, now, 0.15);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of [this.root, this.fifth, this.resonator]) {
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
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.analyser?.disconnect();
      this.droneGain.disconnect();
      this.resonGain.disconnect();
      this.reverb.output.disconnect();
    } catch {
      /* graph gone */
    }
    this.micStream = null;
    this.analyser = null;
    this.timeBuf = null;
    this.master.disconnect();
    try {
      void this.ctx.close();
    } catch {
      /* already closing */
    }
  }
}
