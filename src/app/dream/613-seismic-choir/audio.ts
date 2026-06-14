// audio.ts — the sonification engine. Each quake becomes a resonant-body
// rumble: a noise/impulse excitation through a bank of LOW, slightly
// inharmonic resonant bandpass filters, with mag-scaled decay and a sub-bass
// swell for the largest events. Plus a dark, uneasy tectonic drone bed.
// Lineage: Florian Dombois — auditory seismology / Earthquake Sounds.

import type { Quake } from "./quakes";

type Ctx = AudioContext;

export type SeismicAudio = {
  ctx: Ctx;
  analyser: AnalyserNode;
  triggerQuake: (q: Quake) => void;
  setMuted: (m: boolean) => void;
  resume: () => Promise<void>;
  dispose: () => void;
};

// short white-noise burst buffer, reused for every excitation
function buildNoiseBuffer(ctx: Ctx): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Map a quake to its synthesis parameters.
// mag   → loudness + duration + lower fundamental (bigger = louder, longer, deeper)
// depth → brightness (shallow = brighter crack, deep = duller groan)
// lon   → stereo pan
// lat   → secondary timbre tilt (resonance Q / partial spread)
function quakeParams(q: Quake) {
  const mag = Math.max(0, Math.min(8, q.mag));
  const depthN = Math.max(0, Math.min(700, q.depthKm)) / 700; // 0 shallow → 1 deep
  // fundamental: 30–120 Hz, big quakes deeper
  const fund = 120 - (mag / 8) * 70 - depthN * 18; // ~32–120 Hz
  // gain: small quakes whisper, big quakes loud (still limited downstream)
  const gain = 0.04 + (mag / 8) * 0.4;
  // decay: sharp tick for small, long groan for big
  const decay = 0.18 + (mag / 8) * 5.5;
  // brightness of excitation: shallow = brighter
  const exciteCut = 400 + (1 - depthN) * 2600; // 400–3000 Hz
  // pan from longitude
  const pan = Math.max(-1, Math.min(1, q.lon / 180));
  // latitude tilts resonance sharpness (higher lat = tighter, more metallic ring)
  const q1 = 6 + (Math.abs(q.lat) / 90) * 14;
  return { mag, depthN, fund, gain, decay, exciteCut, pan, q1 };
}

export function createSeismicAudio(): SeismicAudio {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // ── master chain: gain → lowpass → compressor(limiter) → destination ──
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const masterLp = ctx.createBiquadFilter();
  masterLp.type = "lowpass";
  masterLp.frequency.value = 7000;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;

  master.connect(masterLp);
  masterLp.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  const noiseBuf = buildNoiseBuffer(ctx);

  // ── tectonic drone bed: dark, beating, inharmonic (minor-2nd / tritone) ──
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);
  // tension intervals over ~38 Hz: +1 (beat), tritone-ish, minor-2nd up high
  const droneFreqs = [38, 39.1, 53.8, 80.5];
  const droneOscs: OscillatorNode[] = [];
  for (const f of droneFreqs) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240;
    o.connect(lp);
    lp.connect(g);
    g.connect(droneGain);
    o.start();
    droneOscs.push(o);
  }
  // slow swell into the drone so it doesn't thump
  droneGain.gain.setTargetAtTime(0.5, ctx.currentTime, 4);

  let muted = false;

  function triggerQuake(q: Quake) {
    if (muted) return;
    const now = ctx.currentTime;
    const p = quakeParams(q);

    const pan = ctx.createStereoPanner();
    pan.pan.value = p.pan;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(pan);
    pan.connect(master);

    // excitation: short filtered noise burst (the "impact")
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const exLp = ctx.createBiquadFilter();
    exLp.type = "lowpass";
    exLp.frequency.value = p.exciteCut;
    src.connect(exLp);

    // resonant body: bank of slightly inharmonic low bandpass resonators
    // ratios are intentionally NOT integer → rock-like, not a synth pitch
    const ratios = [1, 1.94, 2.41, 3.77];
    for (let i = 0; i < ratios.length; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = p.fund * ratios[i];
      bp.Q.value = p.q1 * (1 + i * 0.3);
      const bg = ctx.createGain();
      bg.gain.value = 0.9 / (i + 1);
      exLp.connect(bp);
      bp.connect(bg);
      bg.connect(voiceGain);
    }

    // amplitude envelope: soft-ish attack (no speaker thump), long tail for big
    const attack = 0.006 + p.depthN * 0.02;
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(p.gain, now + attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.0008, now + p.decay);

    src.start(now);
    src.stop(now + p.decay + 0.1);

    // sub-bass sine swell for the largest events
    if (p.mag >= 4.2) {
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = p.fund * 0.5;
      const subG = ctx.createGain();
      const subPeak = 0.06 + (p.mag - 4.2) * 0.05;
      subG.gain.setValueAtTime(0, now);
      subG.gain.linearRampToValueAtTime(subPeak, now + 0.08); // soft attack
      subG.gain.exponentialRampToValueAtTime(0.0006, now + p.decay * 1.3);
      sub.connect(subG);
      subG.connect(pan);
      sub.start(now);
      sub.stop(now + p.decay * 1.3 + 0.1);
    }

    // tidy disconnects so nodes get GC'd
    const cleanupAt = (p.decay * 1.3 + 0.3) * 1000;
    window.setTimeout(() => {
      try {
        voiceGain.disconnect();
        pan.disconnect();
      } catch {
        /* already gone */
      }
    }, cleanupAt);
  }

  function setMuted(m: boolean) {
    muted = m;
    master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }

  async function resume() {
    if (ctx.state !== "running") await ctx.resume();
  }

  function dispose() {
    try {
      for (const o of droneOscs) o.stop();
    } catch {
      /* noop */
    }
    void ctx.close();
  }

  return { ctx, analyser, triggerQuake, setMuted, resume, dispose };
}
