// ─────────────────────────────────────────────────────────────────────────────
// 11840-bodyloom · audio.ts — the spatial canon.
//
//   Sound exists ONLY from motion. Each body — the LIVE one you drive, plus every
//   committed loop of a past self — owns one warm voice placed in the room through
//   a real HRTF PannerNode. A voice's LOUDNESS tracks how fast that body is moving
//   right now and its PITCH tracks how high the hands are lifted, so a still body
//   (or a still recorded moment) falls silent, and a moving gesture keeps singing
//   from wherever it stands. Recording a loop drops a fixed voice into the room;
//   over a couple of minutes the empty room fills with a polyphonic canon.
//
//   Signal path (per voice):
//     osc(tri) + sub(sine) → gain → lowpass → PannerNode(HRTF) → reverb → master
//   The shared SafeMaster caps peaks; a light convolution void gives room air.
//   Every node is torn down on stop().
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import { clamp, clamp01 } from "./prng";

const ROOT = 174.6; // F3 — warm, human register
// Minor-pentatonic degrees (semitones) — always-consonant across the canon.
const SCALE = [0, 3, 5, 7, 10, 12];
// Per-loop transpositions so stacked past selves harmonise instead of clash.
const TRANSPOSE = [0, 7, 12, 3, -5, 5, 10, -2];

function heightToFreq(height: number, transpose: number): number {
  const h = clamp01(height);
  const idx = Math.min(SCALE.length - 1, Math.floor(h * SCALE.length));
  return ROOT * Math.pow(2, (SCALE[idx] + transpose) / 12);
}

interface Voice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode;
  transpose: number;
  peak: number;
}

export class LoomAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private reverb: VoidReverb;
  private live: Voice;
  private loops = new Map<number, Voice>();
  private running = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = createSafeMaster(this.ctx, { gain: 0.8 });
    // A short, soft void so the room has air without turning cavernous.
    this.reverb = createVoidReverb(this.ctx, { seconds: 2.4, decay: 2.8, wet: 0.22 });
    this.reverb.output.connect(this.master.input);

    // The live voice sits near and centred — your present self, front of room.
    this.live = this.makeVoice(0);
    this.placeVoice(this.live, 0, 0.05, 0.1);
  }

  get analyser(): AnalyserNode {
    return this.master.analyser;
  }

  private makeVoice(transpose: number): Voice {
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = ROOT;
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = ROOT / 2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 0.6;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.4;

    osc.connect(gain);
    sub.connect(gain);
    gain.connect(lp);
    lp.connect(panner);
    panner.connect(this.reverb.input);

    osc.start();
    sub.start();
    return { osc, sub, gain, lp, panner, transpose, peak: 0.14 };
  }

  private placeVoice(v: Voice, roomX: number, roomY: number, roomZ: number): void {
    // roomX: -1(left)..1(right); roomY: -1..1 up; roomZ: 0(near)..1(far).
    const px = roomX * 5;
    const py = roomY * 2;
    const pz = -1 - roomZ * 6; // deeper loops sit further back in the void
    const now = this.ctx.currentTime;
    if (v.panner.positionX) {
      v.panner.positionX.setValueAtTime(px, now);
      v.panner.positionY.setValueAtTime(py, now);
      v.panner.positionZ.setValueAtTime(pz, now);
    } else {
      v.panner.setPosition(px, py, pz);
    }
  }

  private drive(v: Voice, energy: number, height: number): void {
    const t = this.ctx.currentTime;
    const e = clamp01(energy);
    v.gain.gain.setTargetAtTime(e * v.peak, t, 0.09);
    if (e > 0.01) {
      const freq = heightToFreq(height, v.transpose);
      v.osc.frequency.setTargetAtTime(freq, t, 0.08);
      v.sub.frequency.setTargetAtTime(freq / 2, t, 0.08);
      // Brighter the harder the body is moving — filtered warmth, never hiss.
      v.lp.frequency.setTargetAtTime(clamp(480 + e * 1500, 400, 2200), t, 0.12);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;
  }

  /** Per-frame update of the present self. */
  updateLive(energy: number, height: number): void {
    this.drive(this.live, energy, height);
  }

  /** Register a committed loop as a fixed voice in the room. */
  addLoop(id: number, roomX: number, roomY: number, roomZ: number, tint: number): void {
    if (this.loops.has(id)) return;
    const v = this.makeVoice(TRANSPOSE[tint % TRANSPOSE.length]);
    v.peak = 0.1;
    this.placeVoice(v, roomX, roomY, roomZ);
    this.loops.set(id, v);
  }

  /** Per-frame update of one looping past self as its recording replays. */
  updateLoop(id: number, energy: number, height: number): void {
    const v = this.loops.get(id);
    if (v) this.drive(v, energy, height);
  }

  removeLoop(id: number): void {
    const v = this.loops.get(id);
    if (!v) return;
    this.loops.delete(id);
    this.teardownVoice(v);
  }

  clearLoops(): void {
    for (const v of this.loops.values()) this.teardownVoice(v);
    this.loops.clear();
  }

  private teardownVoice(v: Voice): void {
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, 0.05);
    window.setTimeout(() => {
      try {
        v.osc.stop();
        v.sub.stop();
      } catch {
        /* already stopped */
      }
      v.osc.disconnect();
      v.sub.disconnect();
      v.gain.disconnect();
      v.lp.disconnect();
      v.panner.disconnect();
    }, 200);
  }

  stop(): void {
    this.running = false;
    this.teardownVoice(this.live);
    this.clearLoops();
    window.setTimeout(() => {
      this.reverb.output.disconnect();
      this.master.disconnect();
      void this.ctx.close();
    }, 260);
  }
}
