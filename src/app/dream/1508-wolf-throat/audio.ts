// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the instrument that SINGS BACK.
//
//   The payoff of the Wolf Throat is hearing the wrongness you see. Two layers:
//
//     • DRONE BED — a warm, sustained harmonic complex on the scale's base
//       frequency (fundamental + a few partials). It is the fixed reference the
//       whole dissonance landscape is measured against, so the roughness on the
//       screen is literally the roughness this drone makes with your voice.
//
//     • THROAT VOICE — an additive, organ-ish sustained tone that glides to the
//       pitch you are singing (folded into the drone's register). When you land
//       on a consonant scale degree it locks in and blooms smooth; when you sing
//       a "wrong" microtone its partials beat against the drone and you HEAR the
//       ridge. It is never snapped — it tracks your voice continuously.
//
//   Signal: drone + throat → master gain (ramped from silence, peak ≤ 0.22) →
//   DynamicsCompressor limiter → destination. The mic is analysis-only and is
//   NEVER connected here, so there is no feedback howl. Full teardown on stop().
// ─────────────────────────────────────────────────────────────────────────────

import { harmonicComplex } from "./tunings";

const MASTER_PEAK = 0.22; // hard ceiling per spec
const DRONE_PARTIALS = 5; // must match the landscape reference count
const THROAT_PARTIALS = 3;
const GLIDE = 0.06; // seconds — how fast the throat chases the voice

export interface ThroatAudio {
  /** Retune the drone + landscape reference to a new base frequency. */
  setBase: (baseHz: number) => void;
  /** Sing back: glide the throat voice to `freqHz` at loudness `level` (0..1). */
  sing: (freqHz: number, level: number) => void;
  /** Ramp to silence and fully tear down all nodes + the context. */
  stop: () => void;
  /** True once the graph is live. */
  readonly ready: boolean;
}

interface DroneVoice {
  osc: OscillatorNode;
  gain: GainNode;
  mult: number;
}

interface ThroatVoice {
  osc: OscillatorNode;
  gain: GainNode;
  mult: number;
  baseGain: number;
}

export function createThroatAudio(baseHz: number): ThroatAudio | null {
  let ctx: AudioContext;
  try {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    ctx = new Ctor();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.14;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // A gentle lowpass keeps the whole thing warm rather than glassy.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  tone.Q.value = 0.6;
  tone.connect(master);

  // ── Drone bed: harmonic complex on the base, quieter as partials climb. ──
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.5;
  droneBus.connect(tone);
  const droneVoices: DroneVoice[] = [];
  const refPartials = harmonicComplex(baseHz, DRONE_PARTIALS);
  refPartials.forEach((p, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = p.f;
    // Slow chorus so the bed shimmers instead of sitting dead still.
    osc.detune.value = i === 0 ? 0 : (i % 2 === 0 ? 3 : -3);
    const gain = ctx.createGain();
    gain.gain.value = p.a * 0.28;
    osc.connect(gain);
    gain.connect(droneBus);
    osc.start();
    droneVoices.push({ osc, gain, mult: p.f / baseHz });
  });

  // ── Throat voice: additive, glides to the sung pitch, gated by `level`. ──
  const throatBus = ctx.createGain();
  throatBus.gain.value = 0.0001;
  throatBus.connect(tone);
  const throatVoices: ThroatVoice[] = [];
  for (let k = 1; k <= THROAT_PARTIALS; k++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = baseHz * k;
    const gain = ctx.createGain();
    const baseGain = 1 / (k * k * 0.9 + 0.1); // strong fundamental, softer tops
    gain.gain.value = baseGain;
    osc.connect(gain);
    gain.connect(throatBus);
    osc.start();
    throatVoices.push({ osc, gain, mult: k, baseGain });
  }

  // Fade the master up from silence.
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(MASTER_PEAK, ctx.currentTime + 1.4);

  function setBase(hz: number) {
    const now = ctx.currentTime;
    droneVoices.forEach((v) => {
      v.osc.frequency.setTargetAtTime(hz * v.mult, now, 0.08);
    });
  }

  function sing(freqHz: number, level: number) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const f = Math.max(20, freqHz);
    throatVoices.forEach((v) => {
      v.osc.frequency.setTargetAtTime(f * v.mult, now, GLIDE / 3);
    });
    const lvl = Math.max(0, Math.min(1, level));
    // Smooth the bus so onset/offset never clicks.
    throatBus.gain.setTargetAtTime(0.0001 + lvl * 0.9, now, 0.05);
  }

  function stop() {
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.3);
    } catch {
      /* context already closing */
    }
    const all = [...droneVoices.map((v) => v.osc), ...throatVoices.map((v) => v.osc)];
    setTimeout(() => {
      for (const osc of all) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          /* already gone */
        }
      }
      try {
        droneBus.disconnect();
        throatBus.disconnect();
        tone.disconnect();
        master.disconnect();
        limiter.disconnect();
      } catch {
        /* already gone */
      }
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    }, 360);
  }

  return {
    setBase,
    sing,
    stop,
    get ready() {
      return ctx.state !== "closed";
    },
  };
}
