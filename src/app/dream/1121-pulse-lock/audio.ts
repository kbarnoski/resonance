/**
 * 1121 · Pulse-Lock — sonification of two-body Kuramoto coupling.
 *
 * Signal path:
 *   voices ─┬─▶ toneBus ─▶ brightness (lowpass) ─┐
 *           └─▶ reverbSend ─▶ convolver ─▶ wet ───┴─▶ master ─▶ limiter ─▶ out
 *
 *   • Person A / B each drive a warm swelling pad + a bell on every beat, tuned
 *     to a shared just-intonation scale (root / fifth) so they are always
 *     consonant.
 *   • A third "union" voice blooms as the phase difference shrinks toward lock:
 *     two roots whose detune collapses from a beating shimmer to a fused unison,
 *     plus a soft fifth. Brightness and reverb open as alignment rises.
 *   • The master is peak-tamed by a DynamicsCompressor limiter.
 */

const F0 = 196.0; // G3 — warm root
const FIFTH = 1.5; // just fifth (3:2)
const BELL_PARTIAL = 2.76; // inharmonic bell-ish partial

type Voice = { osc: OscillatorNode; gain: GainNode };

export interface PulseAudio {
  begin: () => void;
  /** Per-frame continuous update from the Kuramoto state. */
  update: (
    swellA: number,
    swellB: number,
    alignment: number,
    lock: number,
  ) => void;
  /** Discrete beat: fire a bell for one side. */
  pulse: (side: "a" | "b", intensity: number) => void;
  /** Soft transient acknowledging a human tap. */
  tapAccent: (side: "a" | "b") => void;
  stop: () => void;
}

function makeReverbImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buf;
}

export function makePulseAudio(ctx: AudioContext): PulseAudio {
  // ── master chain ────────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(limiter);

  const brightness = ctx.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = 700;
  brightness.Q.value = 0.6;
  brightness.connect(master);

  const toneBus = ctx.createGain();
  toneBus.gain.value = 1;
  toneBus.connect(brightness);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbImpulse(ctx, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.05;
  convolver.connect(wet);
  wet.connect(master);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.9;
  reverbSend.connect(convolver);

  const connectVoice = (node: AudioNode) => {
    node.connect(toneBus);
    node.connect(reverbSend);
  };

  // ── continuous pads (one per person) ─────────────────────────────────────
  const makePad = (freq: number, type: OscillatorType): Voice => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    connectVoice(gain);
    osc.start();
    return { osc, gain };
  };
  const padA = makePad(F0, "triangle");
  const padB = makePad(F0 * FIFTH, "sine");

  // ── union voice: two roots (collapsing detune) + a soft fifth ────────────
  const unionGain = ctx.createGain();
  unionGain.gain.value = 0.0001;
  connectVoice(unionGain);

  const uA = ctx.createOscillator();
  uA.type = "sine";
  uA.frequency.value = F0;
  uA.detune.value = 9;
  const uB = ctx.createOscillator();
  uB.type = "sine";
  uB.frequency.value = F0;
  uB.detune.value = -9;
  const uFifth = ctx.createOscillator();
  uFifth.type = "sine";
  uFifth.frequency.value = F0 * FIFTH;
  const uFifthGain = ctx.createGain();
  uFifthGain.gain.value = 0.35;
  uA.connect(unionGain);
  uB.connect(unionGain);
  uFifth.connect(uFifthGain);
  uFifthGain.connect(unionGain);
  uA.start();
  uB.start();
  uFifth.start();

  const bellFreq = { a: F0, b: F0 * FIFTH };
  let stopped = false;

  const fireBell = (freq: number, amp: number) => {
    if (stopped) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(amp, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 1.4);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * BELL_PARTIAL;
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;

    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    connectVoice(g);

    o1.start(now);
    o2.start(now);
    o1.stop(now + 1.5);
    o2.stop(now + 1.5);
    window.setTimeout(() => {
      g.disconnect();
      g2.disconnect();
    }, 1700);
  };

  return {
    begin() {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.85, now + 1.2);
    },

    update(swellA, swellB, alignment, lock) {
      if (stopped) return;
      const now = ctx.currentTime;
      const tc = 0.08;
      // Pads breathe with each oscillator's phase swell.
      padA.gain.gain.setTargetAtTime(0.02 + 0.06 * swellA, now, tc);
      padB.gain.gain.setTargetAtTime(0.018 + 0.05 * swellB, now, tc);
      // Union blooms with lock; its detune collapses from beating → fused.
      unionGain.gain.setTargetAtTime(0.16 * lock, now, tc);
      const det = (1 - alignment) * 18;
      uA.detune.setTargetAtTime(det, now, tc);
      uB.detune.setTargetAtTime(-det, now, tc);
      // Brightness + reverb open as the pair aligns.
      brightness.frequency.setTargetAtTime(700 + alignment * 5200, now, tc);
      wet.gain.setTargetAtTime(0.05 + alignment * 0.4, now, tc);
    },

    pulse(side, intensity) {
      fireBell(bellFreq[side], 0.1 + 0.16 * Math.max(0, Math.min(1, intensity)));
    },

    tapAccent(side) {
      // A quiet, slightly detuned click so a tap feels acknowledged at once.
      fireBell(bellFreq[side] * 2, 0.05);
    },

    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.2);
      const oscs = [padA.osc, padB.osc, uA, uB, uFifth];
      window.setTimeout(() => {
        for (const o of oscs) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        }
      }, 400);
    },
  };
}
