// audio.ts — gravity heard as harmony.
//
// Three layers, always sounding so it is never silent:
//   1. BED DRONE  — a low root + octave from the central mass (the tonic sky).
//   2. BODY VOICES — one faint sine per orbiting body, pitched by its orbital
//      frequency (pitch ∝ 1/period). These are the "raw" sound of gravity: as
//      two bodies approach a resonance their voices drift toward a beat-free
//      interval, but on their own they wobble.
//   3. LOCK DYADS  — the EVENTS. When a pair locks to a small-integer period
//      ratio, we ring a sustained just-intonation dyad snapped to the EXACT
//      ratio (root + root·p/q), pure and consonant, blooming with lock strength.
//      The audible difference between the wobbling raw voices and the pure
//      snapped dyad IS the moment of falling into consonance.
//
// Safety: everything sums through a DynamicsCompressor into a master gain capped
// at 0.14 (< 0.16) before destination. No scheduling faster than a few Hz.
// Determinism: no nondeterministic sources — all values are fixed constants.

export interface BodyVoiceT {
  id: number;
  freq: number;
  gain: number; // 0..1 loudness weight (by mass)
  pan: number; // -1..1
}

export interface LockVoiceT {
  key: string;
  rootFreq: number;
  ratio: number; // exact p/q
  strength: number; // 0..1
  pan: number; // -1..1
  fresh: boolean; // first frame of this lock → attack pulse
}

export interface AudioTelemetry {
  bodies: BodyVoiceT[];
  locks: LockVoiceT[];
}

export interface AudioEngine {
  resume: () => Promise<void>;
  render: (t: AudioTelemetry) => void;
  setMuted: (m: boolean) => void;
  stop: () => void;
  dispose: () => void;
}

const MASTER_GAIN = 0.14; // hard ceiling < 0.16

interface BodyVoice {
  osc: OscillatorNode;
  oct: OscillatorNode;
  octGain: GainNode;
  amp: GainNode;
  pan: StereoPannerNode;
  freq: number;
}

interface LockVoice {
  root: OscillatorNode;
  top: OscillatorNode;
  topShimmer: OscillatorNode; // octave above the top, faint sparkle
  shimmerGain: GainNode;
  amp: GainNode;
  pan: StereoPannerNode;
  filt: BiquadFilterNode;
}

export function createAudio(): AudioEngine {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio unavailable");
  const ctx = new Ctx();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 26;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.28;

  const master = ctx.createGain();
  master.gain.value = 0;
  comp.connect(master);
  master.connect(ctx.destination);

  let muted = false;
  let alive = true;

  // ── layer 1: bed drone (central mass) ──────────────────────────────────────
  const ROOT = 52; // Hz, low tonic
  const droneAmp = ctx.createGain();
  droneAmp.gain.value = 0.03;
  droneAmp.connect(comp);
  const droneOscs: OscillatorNode[] = [];
  {
    const now = ctx.currentTime;
    const mk = (mult: number, level: number, detune: number) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = ROOT * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(droneAmp);
      o.start(now);
      droneOscs.push(o);
    };
    mk(1, 1.0, 0);
    mk(2, 0.5, 3); // octave, a hair detuned → slow shimmer
    mk(3, 0.14, -4); // twelfth, very quiet
  }

  // ── layer 2 + 3 buses ──────────────────────────────────────────────────────
  const bodyBus = ctx.createGain();
  bodyBus.gain.value = 0.5; // raw body voices sit under the locks
  bodyBus.connect(comp);

  const lockBus = ctx.createGain();
  lockBus.gain.value = 1.0; // the events sit forward
  lockBus.connect(comp);

  const bodies = new Map<number, BodyVoice>();
  const locks = new Map<string, LockVoice>();

  const makeBody = (freq: number): BodyVoice => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const oct = ctx.createOscillator();
    oct.type = "sine";
    oct.frequency.value = freq * 2;
    const octGain = ctx.createGain();
    octGain.gain.value = 0.22;
    const amp = ctx.createGain();
    amp.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    osc.connect(amp);
    oct.connect(octGain);
    octGain.connect(amp);
    amp.connect(pan);
    pan.connect(bodyBus);
    osc.start(now);
    oct.start(now);
    return { osc, oct, octGain, amp, pan, freq };
  };

  const dropBody = (v: BodyVoice) => {
    const now = ctx.currentTime;
    v.amp.gain.cancelScheduledValues(now);
    v.amp.gain.setValueAtTime(Math.max(0.0001, v.amp.gain.value), now);
    v.amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    for (const o of [v.osc, v.oct]) {
      try {
        o.stop(now + 0.4);
      } catch {
        /* already stopped */
      }
    }
    setTimeout(() => {
      try {
        v.pan.disconnect();
        v.amp.disconnect();
        v.octGain.disconnect();
      } catch {
        /* gone */
      }
    }, 500);
  };

  const makeLock = (rootFreq: number, ratio: number): LockVoice => {
    const now = ctx.currentTime;
    const root = ctx.createOscillator();
    root.type = "sine";
    root.frequency.value = rootFreq;
    const top = ctx.createOscillator();
    top.type = "sine";
    top.frequency.value = rootFreq * ratio; // EXACT just-intonation interval
    const topShimmer = ctx.createOscillator();
    topShimmer.type = "sine";
    topShimmer.frequency.value = rootFreq * ratio * 2;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.16;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = rootFreq * 6;
    filt.Q.value = 0.6;
    const amp = ctx.createGain();
    amp.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    root.connect(filt);
    top.connect(filt);
    topShimmer.connect(shimmerGain);
    shimmerGain.connect(filt);
    filt.connect(amp);
    amp.connect(pan);
    pan.connect(lockBus);
    root.start(now);
    top.start(now);
    topShimmer.start(now);
    return { root, top, topShimmer, shimmerGain, amp, pan, filt };
  };

  const dropLock = (v: LockVoice, immediate = false) => {
    const now = ctx.currentTime;
    const tail = immediate ? 0.08 : 0.6;
    v.amp.gain.cancelScheduledValues(now);
    v.amp.gain.setValueAtTime(Math.max(0.0001, v.amp.gain.value), now);
    v.amp.gain.exponentialRampToValueAtTime(0.0001, now + tail);
    for (const o of [v.root, v.top, v.topShimmer]) {
      try {
        o.stop(now + tail + 0.05);
      } catch {
        /* already stopped */
      }
    }
    setTimeout(
      () => {
        try {
          v.pan.disconnect();
          v.amp.disconnect();
          v.filt.disconnect();
          v.shimmerGain.disconnect();
        } catch {
          /* gone */
        }
      },
      (tail + 0.2) * 1000,
    );
  };

  const resume = async () => {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_GAIN, now + 1.2);
  };

  const render = (t: AudioTelemetry) => {
    if (!alive) return;
    const now = ctx.currentTime;

    // layer 2: reconcile body voices
    const seenB = new Set<number>();
    for (const bt of t.bodies) {
      seenB.add(bt.id);
      let v = bodies.get(bt.id);
      if (!v) {
        v = makeBody(bt.freq);
        bodies.set(bt.id, v);
      } else if (Math.abs(v.freq - bt.freq) > 0.01) {
        v.freq = bt.freq;
        v.osc.frequency.setTargetAtTime(bt.freq, now, 0.08);
        v.oct.frequency.setTargetAtTime(bt.freq * 2, now, 0.08);
      }
      const target = 0.006 + bt.gain * 0.05;
      v.amp.gain.setTargetAtTime(target, now, 0.15);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, bt.pan)), now, 0.2);
    }
    for (const [id, v] of bodies) {
      if (!seenB.has(id)) {
        dropBody(v);
        bodies.delete(id);
      }
    }

    // layer 3: reconcile lock dyads
    const seenL = new Set<string>();
    for (const lt of t.locks) {
      seenL.add(lt.key);
      let v = locks.get(lt.key);
      if (!v) {
        v = makeLock(lt.rootFreq, lt.ratio);
        locks.set(lt.key, v);
      } else {
        // keep the root tracking the (slowly drifting) outer body
        v.root.frequency.setTargetAtTime(lt.rootFreq, now, 0.1);
        v.top.frequency.setTargetAtTime(lt.rootFreq * lt.ratio, now, 0.1);
        v.topShimmer.frequency.setTargetAtTime(
          lt.rootFreq * lt.ratio * 2,
          now,
          0.1,
        );
        v.filt.frequency.setTargetAtTime(lt.rootFreq * 6, now, 0.15);
      }
      const target = 0.02 + lt.strength * 0.09;
      if (lt.fresh) {
        // gentle bell-like onset so a new lock is unmistakable
        v.amp.gain.cancelScheduledValues(now);
        v.amp.gain.setValueAtTime(Math.max(0.0001, v.amp.gain.value), now);
        v.amp.gain.linearRampToValueAtTime(target * 1.35, now + 0.05);
        v.amp.gain.setTargetAtTime(target, now + 0.06, 0.25);
      } else {
        v.amp.gain.setTargetAtTime(target, now, 0.18);
      }
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, lt.pan)), now, 0.2);
    }
    for (const [key, v] of locks) {
      if (!seenL.has(key)) {
        dropLock(v);
        locks.delete(key);
      }
    }
  };

  const setMuted = (m: boolean) => {
    muted = m;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(m ? 0 : MASTER_GAIN, now + 0.2);
  };

  const stop = () => {
    alive = false;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.08);
    for (const v of bodies.values()) dropBody(v);
    for (const v of locks.values()) dropLock(v, true);
    bodies.clear();
    locks.clear();
  };

  const dispose = () => {
    alive = false;
    for (const o of droneOscs) {
      try {
        o.stop();
      } catch {
        /* stopped */
      }
    }
    for (const v of bodies.values())
      for (const o of [v.osc, v.oct]) {
        try {
          o.stop();
        } catch {
          /* stopped */
        }
      }
    for (const v of locks.values())
      for (const o of [v.root, v.top, v.topShimmer]) {
        try {
          o.stop();
        } catch {
          /* stopped */
        }
      }
    bodies.clear();
    locks.clear();
    ctx.close().catch(() => {});
  };

  return { resume, render, setMuted, stop, dispose };
}
