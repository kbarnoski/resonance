// Spatial echo-self audio engine for 2340-echo-body.
//
// Two carrier voices, each through its own HRTF PannerNode:
//   - echo voice     : reads a TIME-DISPLACED copy of the body state
//   - present voice  : reads the live state, faint, so you hear the GAP
//
// The echo's temporal displacement DRIFTS over minutes: it starts ~2.25 s in the
// PAST (lags you) and slowly crosses through zero to a PREDICTIVE LEAD (~-1.0 s,
// anticipates you). When leading, the state is linearly extrapolated from the
// buffer's recent velocity. Long-form evolution — not a loop.

import type { MotionState } from "./motion";

export interface EchoSnapshot {
  live: MotionState;
  echo: MotionState;
  delaySec: number; // >0 echo lags (past), <0 echo leads (predicted future)
  elapsedSec: number;
  ready: boolean;
}

interface Sample {
  t: number; // seconds since start
  centroid: number;
  expansion: number;
}

// Temporal drift schedule.
const START_DELAY = 2.25; // echo begins 2.25 s behind you
const END_LEAD = -1.0; // ...and drifts to 1.0 s ahead of you
const DRIFT_DURATION = 300; // over 5 minutes

const MASTER = 0.22;

function lerp(a: number, b: number, u: number) {
  return a + (b - a) * u;
}

// One breathy, formant-shaped vocal voice: detuned saw pair -> two parallel
// formant bandpasses (+ a body lowpass) + filtered breath noise -> panner.
interface Voice {
  panner: PannerNode;
  gain: GainNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  vibrato: OscillatorNode;
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  breathBP: BiquadFilterNode;
  setPitch(freq: number, now: number): void;
  setFormants(c: number, e: number, now: number): void;
}

export class EchoBodyAudio {
  private ctx: AudioContext;
  private bus: GainNode;
  private comp: DynamicsCompressorNode;
  private echo!: Voice;
  private present!: Voice;
  private buffer: Sample[] = [];
  private t0 = 0;
  private started = false;
  private noiseBuf: AudioBuffer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.bus.connect(this.comp).connect(ctx.destination);

    // Shared looping breath-noise buffer.
    const len = Math.floor(ctx.sampleRate * 2);
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = nb.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
  }

  private buildVoice(baseFreq: number, level: number): Voice {
    const ctx = this.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 12;
    panner.rolloffFactor = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(panner).connect(this.bus);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "sawtooth";
    oscA.frequency.value = baseFreq;
    oscB.frequency.value = baseFreq;
    oscB.detune.value = 8;

    // Vibrato — the "breath" of a living voice.
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 4.6;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 5;
    vibrato.connect(vibDepth);
    vibDepth.connect(oscA.detune);
    vibDepth.connect(oscB.detune);

    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.5;
    oscA.connect(oscMix);
    oscB.connect(oscMix);

    // Two formants (vowel-ish) + a warm body lowpass.
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 520;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1400;
    f2.Q.value = 8;
    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = 380;
    body.Q.value = 0.7;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.6;

    oscMix.connect(f1).connect(gain);
    oscMix.connect(f2).connect(gain);
    oscMix.connect(body).connect(bodyGain).connect(gain);

    // Breath air.
    const breath = ctx.createBufferSource();
    breath.buffer = this.noiseBuf;
    breath.loop = true;
    const breathBP = ctx.createBiquadFilter();
    breathBP.type = "bandpass";
    breathBP.frequency.value = 900;
    breathBP.Q.value = 1.2;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.05;
    breath.connect(breathBP).connect(breathGain).connect(gain);

    oscA.start();
    oscB.start();
    vibrato.start();
    breath.start();

    return {
      panner,
      gain,
      oscA,
      oscB,
      vibrato,
      f1,
      f2,
      breathBP,
      setPitch(freq: number, now: number) {
        oscA.frequency.setTargetAtTime(freq, now, 0.12);
        oscB.frequency.setTargetAtTime(freq, now, 0.12);
      },
      setFormants(c: number, e: number, now: number) {
        // Expansion opens the vowel; centroid tilts its brightness.
        f1.frequency.setTargetAtTime(430 + e * 380, now, 0.15);
        f2.frequency.setTargetAtTime(1150 + c * 900, now, 0.15);
        breathBP.frequency.setTargetAtTime(700 + e * 900, now, 0.2);
      },
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.echo = this.buildVoice(110, 0.9);
    this.present = this.buildVoice(165, 0.28); // a fifth up, faint
    this.t0 = this.ctx.currentTime;
    // 1 s fade-in from silence.
    const now = this.ctx.currentTime;
    this.bus.gain.setValueAtTime(0, now);
    this.bus.gain.linearRampToValueAtTime(MASTER, now + 1);
  }

  /** Current temporal displacement of the echo (seconds). */
  private delayAt(elapsed: number): number {
    const u = Math.min(1, elapsed / DRIFT_DURATION);
    // ease-in-out so the crossing through "now" feels deliberate
    const eased = u * u * (3 - 2 * u);
    return lerp(START_DELAY, END_LEAD, eased);
  }

  private sampleAt(t: number): MotionState {
    const buf = this.buffer;
    if (buf.length === 0) {
      return { centroid: 0.5, expansion: 0.2, energy: 0 };
    }
    const first = buf[0];
    const last = buf[buf.length - 1];

    if (t >= last.t) {
      // Future: extrapolate from recent velocity (predictive lead).
      const ref = buf.length >= 2 ? buf[buf.length - 2] : last;
      const dt = last.t - ref.t || 1;
      const ahead = t - last.t;
      const vc = (last.centroid - ref.centroid) / dt;
      const ve = (last.expansion - ref.expansion) / dt;
      return {
        centroid: last.centroid + vc * ahead,
        expansion: last.expansion + ve * ahead,
        energy: last.expansion,
      };
    }
    if (t <= first.t) {
      return { centroid: first.centroid, expansion: first.expansion, energy: 0 };
    }
    // Past: find bracketing samples and interpolate.
    for (let i = buf.length - 1; i > 0; i--) {
      if (buf[i - 1].t <= t && t <= buf[i].t) {
        const a = buf[i - 1];
        const b = buf[i];
        const u = (t - a.t) / (b.t - a.t || 1);
        return {
          centroid: lerp(a.centroid, b.centroid, u),
          expansion: lerp(a.expansion, b.expansion, u),
          energy: lerp(a.expansion, b.expansion, u),
        };
      }
    }
    return { centroid: last.centroid, expansion: last.expansion, energy: 0 };
  }

  private place(voice: Voice, s: MotionState, radiusBase: number) {
    // azimuth from centroid, elevation + radius from expansion
    const az = (s.centroid - 0.5) * 2 * (Math.PI * 80) / 180; // +-80deg
    const el = Math.max(0, Math.min(1, s.expansion)) * (Math.PI * 50) / 180; // 0..50deg
    const r = radiusBase + Math.max(0, Math.min(1, s.expansion)) * 2.5;
    const x = r * Math.cos(el) * Math.sin(az);
    const y = r * Math.sin(el);
    const z = -r * Math.cos(el) * Math.cos(az); // forward = -z
    const now = this.ctx.currentTime;
    const p = voice.panner;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, now, 0.08);
      p.positionY.setTargetAtTime(y, now, 0.08);
      p.positionZ.setTargetAtTime(z, now, 0.08);
    } else {
      // Older Safari
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
        x,
        y,
        z,
      );
    }
  }

  /** Advance the engine one frame and return a viz snapshot. */
  update(nowMs: number, live: MotionState): EchoSnapshot {
    if (!this.started) {
      return { live, echo: live, delaySec: START_DELAY, elapsedSec: 0, ready: false };
    }
    const elapsed = this.ctx.currentTime - this.t0;
    // Push live sample onto the rolling buffer (keep ~8 s).
    this.buffer.push({ t: elapsed, centroid: live.centroid, expansion: live.expansion });
    while (this.buffer.length > 2 && this.buffer[0].t < elapsed - 8) {
      this.buffer.shift();
    }

    const delaySec = this.delayAt(elapsed);
    const echo = this.sampleAt(elapsed - delaySec);
    const echoState: MotionState = {
      centroid: Math.max(0, Math.min(1, echo.centroid)),
      expansion: Math.max(0, Math.min(1, echo.expansion)),
      energy: echo.energy,
    };

    const now = this.ctx.currentTime;
    // Echo voice — pitch rises slightly as the echo-body spreads.
    this.echo.setPitch(104 + echoState.expansion * 46, now);
    this.echo.setFormants(echoState.centroid, echoState.expansion, now);
    this.place(this.echo, echoState, 1.4);

    // Present voice — live, faint, closer in.
    this.present.setPitch(158 + live.expansion * 40, now);
    this.present.setFormants(live.centroid, live.expansion, now);
    this.place(this.present, live, 0.9);
    // Present presence fades with your stillness so the echo dominates.
    this.present.gain.gain.setTargetAtTime(0.12 + live.energy * 0.2, now, 0.2);

    return { live, echo: echoState, delaySec, elapsedSec: elapsed, ready: true };
  }

  dispose() {
    try {
      for (const v of [this.echo, this.present]) {
        if (!v) continue;
        try {
          v.oscA.stop();
          v.oscB.stop();
          v.vibrato.stop();
        } catch {
          /* already stopped */
        }
        v.gain.disconnect();
        v.panner.disconnect();
      }
      this.bus.disconnect();
      this.comp.disconnect();
    } catch {
      /* best-effort teardown */
    }
  }
}
