/**
 * audio.ts — Web Audio engine for `1958-treatise-scroll`.
 *
 * The reader IS the performer: the page drives the engine each animation frame
 * with the current playhead position (`readY`), the smoothed scroll `energy`
 * (0..1, |velocity| normalised), and the marks currently in view. The engine
 * voices marks by OVERLAP with the playhead: when the playhead enters a mark's
 * vertical extent it triggers a note; when it leaves, the note releases.
 * Sustaining marks (lines / circles / boxes / arcs) therefore ring on for as
 * long as the reader parks the scroll over them — stopping = a held drone. Dots
 * and number-fields are one-shot plucks.
 *
 * Signal chain (house rules): voices → master gain (≤ 0.17) → tanh soft-clip
 * WaveShaper limiter → destination, plus a lowpassed feedback delay send for
 * warmth. Bounded polyphony (≤ 10 simultaneous voices) + a soft spine drone at
 * the tonic. No libraries, no Math.random, no wall-clock time.
 */

import { TONIC, type Mark } from "./score";

const MASTER_CEILING = 0.15; // house rule: ≤ 0.17
const MAX_VOICES = 10;

function tanhCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

interface Voice {
  markId: number;
  oscs: OscillatorNode[];
  vca: GainNode;
  filter: BiquadFilterNode;
  sustain: boolean;
  released: boolean;
  releaseAt: number; // ctx time a pluck/released voice can be reaped
}

export interface AudioEngine {
  readonly ctx: AudioContext;
  resume: () => Promise<void>;
  /** Drive the engine for one frame. */
  update: (readY: number, energy: number, marks: Mark[]) => Set<number>;
  setMuted: (m: boolean) => void;
  dispose: () => void;
}

export function createAudio(): AudioEngine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // master -> soft-clip limiter -> destination
  const master = ctx.createGain();
  master.gain.value = MASTER_CEILING;
  const limiter = ctx.createWaveShaper();
  limiter.curve = tanhCurve(1.2);
  limiter.oversample = "2x";
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // warmth: lowpassed feedback delay send
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.26;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const delayLP = ctx.createBiquadFilter();
  delayLP.type = "lowpass";
  delayLP.frequency.value = 1800;
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.28;
  delay.connect(delayLP);
  delayLP.connect(feedback);
  feedback.connect(delay);
  delayLP.connect(master);
  delaySend.connect(delay);

  // soft spine drone — the central reading thread, always faintly present
  const drone = ctx.createGain();
  drone.gain.value = 0;
  const droneA = ctx.createOscillator();
  droneA.type = "triangle";
  droneA.frequency.value = TONIC;
  const droneB = ctx.createOscillator();
  droneB.type = "sine";
  droneB.frequency.value = TONIC * 1.5; // a bare fifth above
  const droneLP = ctx.createBiquadFilter();
  droneLP.type = "lowpass";
  droneLP.frequency.value = 700;
  droneA.connect(droneLP);
  droneB.connect(droneLP);
  droneLP.connect(drone);
  drone.connect(master);
  droneA.start();
  droneB.start();

  const voices = new Map<number, Voice>();
  let muted = false;
  let disposed = false;

  function timbreFor(t: Mark["timbre"]): OscillatorType {
    if (t === "round") return "sine";
    if (t === "glass") return "triangle";
    return "triangle";
  }

  function noteOn(mark: Mark, energy: number) {
    if (voices.size >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const vca = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const root = mark.freqs[0] || TONIC;
    const bright = 1 + energy * 2.2;
    filter.frequency.value = Math.min(root * 4 * bright + 200, 6500);
    filter.Q.value = 0.7;
    filter.connect(vca);
    vca.connect(master);
    vca.connect(delaySend);

    const oscs: OscillatorNode[] = [];
    const type = timbreFor(mark.timbre);
    for (const f of mark.freqs.slice(0, 4)) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      // arcs glide their pitch as they cross the playhead
      if (mark.type === "arc") {
        osc.frequency.setValueAtTime(f * 0.94, now);
        osc.frequency.linearRampToValueAtTime(f * 1.06, now + 2.2);
      }
      // gentle detuned twin for body on sustained voices
      osc.detune.value = mark.sustain ? (oscs.length % 2 ? 5 : -5) : 0;
      osc.connect(filter);
      osc.start(now);
      oscs.push(osc);
    }

    const chordScale = 1 / Math.max(1, mark.freqs.length * 0.7);
    const peak = mark.gain * (0.55 + 0.45 * energy) * 0.9 * chordScale;
    const attack = mark.sustain ? 0.06 : 0.004;
    vca.gain.setValueAtTime(0.0001, now);
    vca.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + attack);

    let releaseAt = Infinity;
    if (!mark.sustain) {
      // pluck: decay to silence, reap shortly after
      const dur = 0.5 + mark.gain * 0.6;
      vca.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);
      releaseAt = now + attack + dur + 0.05;
    }

    voices.set(mark.id, {
      markId: mark.id,
      oscs,
      vca,
      filter,
      sustain: mark.sustain,
      released: false,
      releaseAt,
    });
  }

  function release(v: Voice) {
    if (v.released) return;
    v.released = true;
    const now = ctx.currentTime;
    const rel = v.sustain ? 0.9 : 0.15;
    v.vca.gain.cancelScheduledValues(now);
    const cur = Math.max(0.0002, v.vca.gain.value);
    v.vca.gain.setValueAtTime(cur, now);
    v.vca.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    v.releaseAt = now + rel + 0.05;
  }

  function reap(v: Voice) {
    for (const o of v.oscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    v.filter.disconnect();
    v.vca.disconnect();
    voices.delete(v.markId);
  }

  const PAD = 4; // px overlap pad so brief marks still fire while moving

  function update(readY: number, energy: number, marks: Mark[]): Set<number> {
    const active = new Set<number>();
    if (disposed) return active;
    const now = ctx.currentTime;

    // drone follows presence: a little louder as you read, soft when parked
    const droneTarget = muted ? 0 : 0.16 + energy * 0.12;
    drone.gain.setTargetAtTime(droneTarget, now, 0.15);
    master.gain.setTargetAtTime(muted ? 0 : MASTER_CEILING, now, 0.05);

    const overlapping = new Set<number>();
    for (const m of marks) {
      if (readY >= m.y0 - PAD && readY <= m.y1 + PAD) {
        overlapping.add(m.id);
        active.add(m.id);
        const existing = voices.get(m.id);
        if (!existing) {
          noteOn(m, energy);
        } else if (existing.sustain && !existing.released) {
          // ride brightness with reading energy while held
          existing.filter.frequency.setTargetAtTime(
            Math.min((m.freqs[0] || TONIC) * (2 + energy * 3) + 200, 6500),
            now,
            0.2,
          );
        }
      }
    }

    // release / reap
    for (const v of Array.from(voices.values())) {
      if (v.sustain && !v.released && !overlapping.has(v.markId)) release(v);
      if (now >= v.releaseAt) reap(v);
    }

    return active;
  }

  return {
    ctx,
    resume: async () => {
      if (ctx.state === "suspended") await ctx.resume();
    },
    update,
    setMuted: (m: boolean) => {
      muted = m;
    },
    dispose: () => {
      disposed = true;
      for (const v of Array.from(voices.values())) reap(v);
      try {
        droneA.stop();
        droneB.stop();
      } catch {
        /* noop */
      }
      droneA.disconnect();
      droneB.disconnect();
      droneLP.disconnect();
      drone.disconnect();
      delay.disconnect();
      delayLP.disconnect();
      feedback.disconnect();
      delaySend.disconnect();
      master.disconnect();
      limiter.disconnect();
      void ctx.close();
    },
  };
}
