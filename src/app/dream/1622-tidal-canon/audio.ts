// audio.ts — the two-layer weld: discrete resonance LOCKS over an aggregate WASH.
//
// LAYER 1 — DISCRETE (the headline).  Each conductor has a faint raw "voice"
//   sine pitched by its instantaneous orbital frequency (freq ∝ 1/period). On
//   their own these wobble as the orbits perturb one another. The instant a
//   conductor PAIR sits near a small-integer period ratio we ring the EXACT
//   just-intonation dyad (root + root·p/q) as a clean bell pair — pure and
//   beat-free. Because pitch is tied to orbital frequency, the *period* ratio IS
//   the *frequency* ratio: a real interval, not a metaphor. You hear the raw
//   voices resolve from a wobble into the snapped dyad at the moment of lock.
//
// LAYER 2 — AGGREGATE (the wash).  A soft just-intonation pad under everything
//   whose brightness/agitation tracks the SWARM's dispersion: a tightly-bound
//   swarm → a calm warm bed; a violently sheared one → a brighter, restless
//   wash. Plus a slow breathing LFO so it evolves over minutes.
//
// Safety: master ceiling 0.14 (< 0.16) → DynamicsCompressor → destination.
// Gains are ramped; lock polyphony is capped (steal oldest). Determinism: no
// nondeterministic sources — every value is a fixed constant or physics input.

import type { Lock } from "./sim";

const MASTER = 0.14; // hard ceiling < 0.16
const MAX_LOCK_VOICES = 4;

interface RawVoice {
  osc: OscillatorNode;
  amp: GainNode;
  pan: StereoPannerNode;
}

interface LockVoice {
  key: string;
  root: OscillatorNode;
  top: OscillatorNode;
  shimmer: OscillatorNode;
  shimmerGain: GainNode;
  amp: GainNode;
  filt: BiquadFilterNode;
  panR: StereoPannerNode;
  panT: StereoPannerNode;
  bornAt: number;
}

export interface Telemetry {
  rawFreqs: number[]; // one per orbiting conductor
  rawPans: number[];
  locks: Lock[];
  agitation: number; // 0..1 swarm dispersion
}

export interface AudioEngine {
  resume: () => Promise<void>;
  render: (t: Telemetry) => void;
  setMuted: (m: boolean) => void;
  stop: () => void;
  now: () => number;
}

export function createAudio(): AudioEngine {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio unavailable");
  const ctx = new Ctx();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 26;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.3;

  const master = ctx.createGain();
  master.gain.value = 0;
  comp.connect(master);
  master.connect(ctx.destination);

  let muted = false;

  // ── aggregate wash: a low JI pad (root + fifth + octave) + breathing LFO ────
  const washRoot = 55; // A1
  const washFreqs = [washRoot, washRoot * (3 / 2), washRoot * 2];
  const washFilt = ctx.createBiquadFilter();
  washFilt.type = "lowpass";
  washFilt.frequency.value = 340;
  washFilt.Q.value = 0.7;
  const washGain = ctx.createGain();
  washGain.gain.value = 0.0;
  washFilt.connect(washGain);
  washGain.connect(comp);

  const washOscs: OscillatorNode[] = [];
  for (let i = 0; i < washFreqs.length; i++) {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = washFreqs[i];
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.28;
    o.connect(g);
    g.connect(washFilt);
    o.start();
    washOscs.push(o);
  }
  // slow breathing LFO on the wash amplitude (≈ 0.05 Hz)
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.05;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.5;
  breath.connect(breathGain);
  breathGain.connect(washGain.gain);
  breath.start();

  // a high "shear shimmer" that only opens up when the swarm is agitated
  const shearOsc = ctx.createOscillator();
  shearOsc.type = "triangle";
  shearOsc.frequency.value = washRoot * 6; // two octaves + fifth-ish
  const shearGain = ctx.createGain();
  shearGain.gain.value = 0;
  shearOsc.connect(shearGain);
  shearGain.connect(comp);
  shearOsc.start();

  // ── raw conductor voices (created lazily to match conductor count) ──────────
  const rawVoices: RawVoice[] = [];
  function ensureRaw(count: number) {
    while (rawVoices.length < count) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const amp = ctx.createGain();
      amp.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(amp);
      amp.connect(pan);
      pan.connect(comp);
      osc.start();
      rawVoices.push({ osc, amp, pan });
    }
  }

  const lockVoices = new Map<string, LockVoice>();

  function spawnLock(l: Lock) {
    if (lockVoices.size >= MAX_LOCK_VOICES) {
      // steal oldest
      let oldestKey = "";
      let oldest = Infinity;
      for (const [k, v] of lockVoices) {
        if (v.bornAt < oldest) {
          oldest = v.bornAt;
          oldestKey = k;
        }
      }
      const victim = lockVoices.get(oldestKey);
      if (victim) killLock(victim);
      lockVoices.delete(oldestKey);
    }
    const t = ctx.currentTime;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 2200;
    filt.Q.value = 0.9;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    filt.connect(amp);
    amp.connect(comp);

    const panR = ctx.createStereoPanner();
    const panT = ctx.createStereoPanner();
    panR.connect(filt);
    panT.connect(filt);

    const root = ctx.createOscillator();
    root.type = "sine";
    const rg = ctx.createGain();
    rg.gain.value = 0.6;
    root.connect(rg);
    rg.connect(panR);

    const top = ctx.createOscillator();
    top.type = "sine";
    const tg = ctx.createGain();
    tg.gain.value = 0.5;
    top.connect(tg);
    tg.connect(panT);

    // faint octave shimmer above the top → a bell-like sparkle at the lock
    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.0;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(panT);

    root.frequency.value = l.rootFreq;
    top.frequency.value = l.topFreq;
    shimmer.frequency.value = l.topFreq * 2;
    panR.pan.value = l.panRoot;
    panT.pan.value = l.panTop;

    root.start();
    top.start();
    shimmer.start();
    // soft bell attack
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.0001, t + 0.005);
    shimmerGain.gain.setValueAtTime(0.18, t);
    shimmerGain.gain.exponentialRampToValueAtTime(0.02, t + 1.4);

    lockVoices.set(l.key, {
      key: l.key,
      root,
      top,
      shimmer,
      shimmerGain,
      amp,
      filt,
      panR,
      panT,
      bornAt: t,
    });
  }

  function killLock(v: LockVoice) {
    const t = ctx.currentTime;
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setValueAtTime(Math.max(0.0001, v.amp.gain.value), t);
    v.amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    const stopAt = t + 0.6;
    v.root.stop(stopAt);
    v.top.stop(stopAt);
    v.shimmer.stop(stopAt);
  }

  function render(tel: Telemetry) {
    const t = ctx.currentTime;
    const target = muted ? 0 : 1;
    master.gain.setTargetAtTime(target * MASTER, t, 0.25);

    // raw conductor voices — pitch tracks orbital frequency (wobbles off-lock)
    ensureRaw(tel.rawFreqs.length);
    for (let i = 0; i < rawVoices.length; i++) {
      const v = rawVoices[i];
      if (i < tel.rawFreqs.length) {
        v.osc.frequency.setTargetAtTime(tel.rawFreqs[i], t, 0.05);
        v.pan.pan.setTargetAtTime(tel.rawPans[i] ?? 0, t, 0.1);
        v.amp.gain.setTargetAtTime(0.05, t, 0.2);
      } else {
        v.amp.gain.setTargetAtTime(0, t, 0.2);
      }
    }

    // aggregate wash — dispersion opens the filter & the shear shimmer
    const ag = Math.max(0, Math.min(1, tel.agitation));
    washFilt.frequency.setTargetAtTime(300 + ag * 1600, t, 0.4);
    washGain.gain.setTargetAtTime(0.16 + ag * 0.14, t, 0.6);
    shearGain.gain.setTargetAtTime(ag * ag * 0.03, t, 0.5);

    // discrete locks — spawn / update / retire
    const live = new Set<string>();
    for (const l of tel.locks) {
      live.add(l.key);
      let v = lockVoices.get(l.key);
      if (!v) {
        spawnLock(l);
        v = lockVoices.get(l.key);
      }
      if (!v) continue;
      // keep the dyad pure & snapped to the EXACT ratio
      v.root.frequency.setTargetAtTime(l.rootFreq, t, 0.08);
      v.top.frequency.setTargetAtTime(l.topFreq, t, 0.08);
      v.shimmer.frequency.setTargetAtTime(l.topFreq * 2, t, 0.08);
      v.panR.pan.setTargetAtTime(l.panRoot, t, 0.15);
      v.panT.pan.setTargetAtTime(l.panTop, t, 0.15);
      const g = 0.05 + l.strength * 0.14;
      v.amp.gain.setTargetAtTime(g, t, 0.12);
      v.filt.frequency.setTargetAtTime(1400 + l.strength * 2600, t, 0.2);
    }
    for (const [k, v] of [...lockVoices]) {
      if (!live.has(k)) {
        killLock(v);
        lockVoices.delete(k);
      }
    }
  }

  return {
    resume: () => ctx.resume(),
    render,
    setMuted: (m: boolean) => {
      muted = m;
    },
    now: () => ctx.currentTime,
    stop: () => {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0, t, 0.1);
      setTimeout(() => {
        try {
          for (const o of washOscs) o.stop();
          breath.stop();
          shearOsc.stop();
          for (const v of rawVoices) v.osc.stop();
          for (const [, v] of lockVoices) {
            v.root.stop();
            v.top.stop();
            v.shimmer.stop();
          }
          void ctx.close();
        } catch {
          /* already torn down */
        }
      }, 260);
    },
  };
}
