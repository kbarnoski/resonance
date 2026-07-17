// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the machine sings its own inner life.
//
// A single generative engine whose every parameter is driven by live telemetry.
// It is a steady but never-repeating groove that INTENSIFIES with machine load —
// the browser-inward cousin of Alunno & Bientinesi's "EDM-Inspired Supercomputer
// Sonification" (arXiv:2605.21874): real-time monitoring turned into coherent,
// virtually-infinite music.
//
// A lookahead scheduler walks a 16th-note grid. Each step it reads the newest
// telemetry snapshot and decides what to play, so the piece genuinely differs at
// minute 3 from second 3 — the machine's state has moved on.
//
//   MAPPINGS (musical, not a theremin):
//     • fps / jank        → rhythmic density + glitch/retrigger probability
//     • memory pressure   → sub-bass drone level + harmonic tension (a 2nd/♭9)
//     • network rtt       → delay/echo time ; downlink → lowpass brightness
//     • pointer restless  → lead arpeggio activity
//     • battery draining  → slow global downward detune (a tiring machine)
//       battery charging  → the detune lifts back to zero
//
//   Chain: voices → master lowpass → limiter (compressor) → master gain →
//   destination. Silent until start(). Deterministic glitch RNG (mulberry32).
// ─────────────────────────────────────────────────────────────────────────────

import type { Sample } from "./telemetry";

const MASTER = 0.22;

// A minor pentatonic — coherent no matter what the machine does.
const SCALE = [0, 3, 5, 7, 10];
const ROOT = 45; // A2

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function scaleMidi(base: number, step: number): number {
  const n = SCALE.length;
  const oct = Math.floor(step / n);
  const deg = ((step % n) + n) % n;
  return base + oct * 12 + SCALE[deg];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MachineAudio {
  start(): Promise<void>;
  setSample(s: Sample): void;
  setMuted(m: boolean): void;
  running(): boolean;
  dispose(): void;
}

export function createMachineAudio(): MachineAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let toneFilter: BiquadFilterNode | null = null;
  let delay: DelayNode | null = null;
  let delayFb: GainNode | null = null;
  let delayWet: GainNode | null = null;

  // continuous voices
  let droneA: OscillatorNode | null = null;
  let droneB: OscillatorNode | null = null;
  let droneGain: GainNode | null = null;
  let tensionOsc: OscillatorNode | null = null;
  let tensionGain: GainNode | null = null;

  let noiseBuf: AudioBuffer | null = null;

  let started = false;
  let muted = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const rng = mulberry32(0x1876);

  // latest telemetry (updated every frame from the page)
  let s: Sample | null = null;

  // scheduler state
  let step16 = 0;
  let nextNoteTime = 0;
  let detune = 0; // global cents offset, smoothed toward battery target
  let bar = 0;
  // slow harmonic drift so the groove wanders over minutes (never loops)
  let chordRoot = 0;

  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD = 0.12;

  function makeNoise(): AudioBuffer {
    const c = ctx as AudioContext;
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
    return buf;
  }

  // ── percussive / plucked one-shots ──────────────────────────────────────────
  function drawKick(t: number, amp: number): void {
    const c = ctx as AudioContext;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g);
    g.connect(limiter as DynamicsCompressorNode);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  function drawHat(t: number, amp: number, decay: number): void {
    const c = ctx as AudioContext;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1 + rng() * 0.6;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(hp);
    hp.connect(g);
    g.connect(limiter as DynamicsCompressorNode);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  // a short glitchy burst — the sound of a dropped/retriggered frame
  function drawGlitch(t: number, amp: number): void {
    const c = ctx as AudioContext;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.4 + rng() * 3.5;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 800 + rng() * 4000;
    bp.Q.value = 4 + rng() * 8;
    const g = c.createGain();
    const dur = 0.02 + rng() * 0.05;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(delay as DelayNode);
    g.connect(limiter as DynamicsCompressorNode);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // arpeggio / lead pluck (pitched, detuned globally by battery)
  function drawPluck(t: number, midi: number, amp: number): void {
    const c = ctx as AudioContext;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g);
    g.connect(delay as DelayNode);
    g.connect(toneFilter as BiquadFilterNode);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  // ── the scheduler: telemetry → notes on a 16th grid ─────────────────────────
  function scheduleStep(t: number): void {
    const snap = s;
    const load = snap ? snap.load : 0.3;
    const jank = snap ? snap.jank : 0;
    const restless = snap ? snap.restlessness : 0;
    const memR = snap && snap.mem ? snap.mem.ratio : 0.3;

    const beat = step16 % 4;
    const inBar = step16 % 16;

    // kick: four-on-the-floor once load is up; sparse + syncopated when calm
    if (inBar % 4 === 0) {
      drawKick(t, 0.9);
    } else if (load > 0.5 && inBar % 4 === 2 && rng() < load) {
      drawKick(t, 0.5);
    }

    // hats: density rises with fps headroom + load
    const hatChance = 0.25 + load * 0.7;
    if (beat % 2 === 1 || rng() < hatChance) {
      drawHat(t, 0.12 + load * 0.14, 0.03 + rng() * 0.04);
    }

    // glitch/retrigger: probability tracks jank directly
    const glitchP = jank * 0.9;
    if (rng() < glitchP) {
      const n = 1 + Math.floor(jank * 3);
      for (let k = 0; k < n; k++) {
        drawGlitch(t + k * 0.018, 0.1 + jank * 0.12);
      }
    }

    // lead arpeggio: activity from pointer restlessness (+ a floor so it breathes)
    const arpP = 0.08 + restless * 0.85;
    if (rng() < arpP) {
      const octave = restless > 0.5 && rng() < 0.4 ? 12 : 0;
      const stepDeg = chordRoot + Math.floor(rng() * 8);
      const midi = scaleMidi(ROOT + 24, stepDeg) + octave;
      drawPluck(t, midi, 0.09 + restless * 0.06);
    }

    // occasional bass root on the downbeat to anchor harmony to the drift
    if (inBar === 0) {
      drawPluck(t, scaleMidi(ROOT, chordRoot), 0.05);
    }

    // memory-pressure "tension" note: a dissonant 2nd that pulses when heap is full
    if (inBar === 8 && memR > 0.6 && rng() < memR) {
      drawPluck(t, scaleMidi(ROOT + 12, chordRoot + 1), 0.05 + (memR - 0.6) * 0.1);
    }
  }

  function advanceScheduler(): void {
    if (!ctx) return;
    const snap = s;
    const load = snap ? snap.load : 0.3;
    // tempo climbs with load: 92 → 138 bpm. The machine speeds up as it strains.
    const bpm = 92 + load * 46;
    const secPer16 = 60 / bpm / 4;

    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(nextNoteTime);
      nextNoteTime += secPer16;
      step16++;
      if (step16 % 16 === 0) {
        bar++;
        // wander the harmonic root every 2 bars by a scale step (slow drift)
        if (bar % 2 === 0) {
          const dir = rng() < 0.5 ? -1 : 1;
          chordRoot = ((chordRoot + dir) % 5 + 5) % 5;
        }
      }
    }
  }

  // ── continuous-parameter update (smooth, per-frame) ─────────────────────────
  function setSample(next: Sample): void {
    s = next;
    if (!ctx || !started) return;
    const now = ctx.currentTime;

    // memory pressure → sub-bass drone presence + tension partial
    const memR = next.mem ? next.mem.ratio : 0.3;
    if (droneGain) {
      const lvl = 0.04 + memR * 0.16;
      droneGain.gain.setTargetAtTime(lvl, now, 0.5);
    }
    if (tensionGain) {
      const tLvl = Math.max(0, memR - 0.45) * 0.14;
      tensionGain.gain.setTargetAtTime(tLvl, now, 0.6);
    }

    // network downlink → brightness (lowpass cutoff); missing net = mid brightness
    if (toneFilter) {
      const downlink = next.net ? next.net.downlink : 5;
      const cutoff = 500 + Math.min(1, downlink / 12) * 6500 + next.load * 1500;
      toneFilter.frequency.setTargetAtTime(cutoff, now, 0.3);
    }

    // network rtt → delay/echo time (20ms → ~400ms), scaled musically
    if (delay) {
      const rtt = next.net ? next.net.rtt : 60;
      const dt = Math.min(0.5, 0.08 + (rtt / 400) * 0.42);
      delay.delayTime.setTargetAtTime(dt, now, 0.4);
    }
    if (delayFb) {
      delayFb.gain.setTargetAtTime(0.28 + next.load * 0.28, now, 0.4);
    }

    // battery: draining → slow downward detune; charging → lift back toward 0
    let target = 0;
    if (next.battery) {
      if (next.battery.charging) target = 0;
      else target = -(1 - next.battery.level) * 55; // up to ~55 cents flat when empty
    }
    detune += (target - detune) * 0.02;
    if (droneA) droneA.detune.setTargetAtTime(detune - 6, now, 0.8);
    if (droneB) droneB.detune.setTargetAtTime(detune + 6, now, 0.8);
    if (tensionOsc) tensionOsc.detune.setTargetAtTime(detune, now, 0.8);
  }

  async function start(): Promise<void> {
    if (started) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume();

    master = ctx.createGain();
    master.gain.value = 0;

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 16; // brick-ish wall to avoid clipping
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 3000;
    toneFilter.Q.value = 0.7;

    // echo send used by leads + glitches
    delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.18;
    delayFb = ctx.createGain();
    delayFb.gain.value = 0.3;
    delayWet = ctx.createGain();
    delayWet.gain.value = 0.5;
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(toneFilter);

    toneFilter.connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);

    noiseBuf = makeNoise();

    const now = ctx.currentTime;

    // sub-bass drone (two slightly detuned saws through a lowpass)
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = "lowpass";
    droneLp.frequency.value = 160;
    droneA = ctx.createOscillator();
    droneB = ctx.createOscillator();
    droneA.type = "sawtooth";
    droneB.type = "sawtooth";
    const rootF = midiToFreq(ROOT - 12);
    droneA.frequency.value = rootF;
    droneB.frequency.value = rootF;
    droneA.detune.value = -6;
    droneB.detune.value = 6;
    droneA.connect(droneLp);
    droneB.connect(droneLp);
    droneLp.connect(droneGain);
    droneGain.connect(limiter);
    droneA.start(now);
    droneB.start(now);

    // memory-tension partial: a quiet ♭9 above the root, swells when heap fills
    tensionGain = ctx.createGain();
    tensionGain.gain.value = 0.0001;
    tensionOsc = ctx.createOscillator();
    tensionOsc.type = "sine";
    tensionOsc.frequency.value = midiToFreq(ROOT + 13);
    tensionOsc.connect(tensionGain);
    tensionGain.connect(toneFilter);
    tensionOsc.start(now);

    // 1.8s fade-in
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER, now + 1.8);

    nextNoteTime = ctx.currentTime + 0.08;
    step16 = 0;
    bar = 0;
    timer = setInterval(advanceScheduler, LOOKAHEAD_MS);
    started = true;
  }

  function setMuted(m: boolean): void {
    muted = m;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.15);
    }
  }

  function running(): boolean {
    return started && !!ctx && ctx.state === "running";
  }

  function dispose(): void {
    started = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = null;
    limiter = null;
    toneFilter = null;
    delay = null;
    delayFb = null;
    delayWet = null;
    droneA = null;
    droneB = null;
    droneGain = null;
    tensionOsc = null;
    tensionGain = null;
    noiseBuf = null;
  }

  return { start, setSample, setMuted, running, dispose };
}
