/* ── 3456-surge · sidechain-pumped EDM synth graph ───────────────────────
 *
 *  A self-contained Web Audio DSP graph (no npm, no AudioWorklet required):
 *
 *    kick       four-on-the-floor sine pitch-drop + click transient
 *    sub        deep sine on the chord root
 *    supersaw   7 detuned sawtooth oscillators summed → lowpass "pad/lead"
 *    snare      filtered white-noise burst (accelerates through the build)
 *    riser      white noise → rising bandpass, swept up during the build
 *
 *  Signature EDM SIDECHAIN "PUMP": the sub + supersaw are routed through a
 *  shared `duck` GainNode. On every kick we slam that gain down and let it
 *  recover over ~1/8-note via setTargetAtTime — so the pads visibly breathe
 *  around the kick, the deadmau5 / Eric Prydz pumping. (The canonical way is
 *  an AudioWorklet sidechain compressor — jadujoel/sidechain-compressor-
 *  audio-worklet — but a kick-clocked gain envelope is dependency-free and
 *  tight enough here.)
 *
 *  Timing uses a LOOKAHEAD SCHEDULER: a 25ms setInterval schedules ~120ms
 *  of note events ahead on the sample-accurate AudioContext clock.
 *
 *  Progression: A-minor EDM loop  i–VI–III–VII  (Am–F–C–G), equal
 *  temperament — evolving but NOT hard-quantised to a strict JI/pentatonic
 *  grid. The supersaw voices a fat power-chord over each root.
 */

import type { Phase } from "./arc";

const BPM = 128;
const SEC_PER_16TH = 60 / BPM / 4;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

// progression roots as MIDI (pad octave); sub sits one octave below.
const PROG: number[] = [45, 41, 48, 43]; // A2, F2, C3, G2

// 7 supersaw voices → a fat power-chord voicing (root/fifth/octave)
const SAW_OFFSETS = [0, 0, 7, 7, 12, 12, 19];
const SAW_DETUNE = [-14, -7, 6, 12, -5, 9, 3]; // cents

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface ArcSnapshot {
  phase: Phase;
  energy: number;
  dropPower: number;
}

export interface SurgeAudio {
  setArc: (phase: Phase, energy: number, dropPower: number) => void;
  /** 0..1 visual sidechain envelope for the shader, sampled at ctx time t */
  visualPump: (t: number) => number;
  stop: () => void;
  bpm: number;
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function makeSurgeAudio(
  ctx: AudioContext,
  masterLevel: number,
): SurgeAudio {
  // ── master chain: glue compressor → limiter → master gain ──────────────
  const master = ctx.createGain();
  master.gain.value = masterLevel;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.05;

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 6;
  glue.ratio.value = 4;
  glue.attack.value = 0.006;
  glue.release.value = 0.18;

  glue.connect(limiter);
  limiter.connect(master);
  master.connect(ctx.destination);

  // ── sidechain bus: sub + pad duck under every kick ─────────────────────
  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(glue);

  // ── sub bass ───────────────────────────────────────────────────────────
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  const subGain = ctx.createGain();
  subGain.gain.value = 0;
  subOsc.connect(subGain);
  subGain.connect(duck);
  subOsc.start();

  // ── supersaw pad/lead: 7 detuned saws → lowpass ────────────────────────
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 300;
  padFilter.Q.value = 0.9;
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  padFilter.connect(padGain);
  padGain.connect(duck);

  const saws: OscillatorNode[] = [];
  for (let i = 0; i < 7; i++) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.detune.value = SAW_DETUNE[i];
    const g = ctx.createGain();
    g.gain.value = 1 / 7;
    o.connect(g);
    g.connect(padFilter);
    o.start();
    saws.push(o);
  }

  // ── riser: white noise → rising bandpass ───────────────────────────────
  const noiseBuf = makeNoiseBuffer(ctx, 2);
  const riserSrc = ctx.createBufferSource();
  riserSrc.buffer = noiseBuf;
  riserSrc.loop = true;
  const riserBP = ctx.createBiquadFilter();
  riserBP.type = "bandpass";
  riserBP.frequency.value = 300;
  riserBP.Q.value = 3;
  const riserGain = ctx.createGain();
  riserGain.gain.value = 0;
  riserSrc.connect(riserBP);
  riserBP.connect(riserGain);
  riserGain.connect(glue); // riser is NOT ducked — it should push through
  riserSrc.start();

  // ── transient voices are one-shot; keep a reusable snare noise buffer ──
  const snareBuf = makeNoiseBuffer(ctx, 0.4);

  // ── live arc snapshot the scheduler reads ──────────────────────────────
  const arc: ArcSnapshot = { phase: "intro", energy: 0, dropPower: 0 };

  // visual sidechain envelope mirror (for the shader pump)
  let lastKickAt = -10;

  function triggerKick(time: number) {
    lastKickAt = time;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(1.0, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    osc.connect(g);
    g.connect(glue);
    osc.start(time);
    osc.stop(time + 0.35);

    // click transient
    const click = ctx.createBufferSource();
    click.buffer = snareBuf;
    const cf = ctx.createBiquadFilter();
    cf.type = "highpass";
    cf.frequency.value = 2200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.5, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
    click.connect(cf);
    cf.connect(cg);
    cg.connect(glue);
    click.start(time);
    click.stop(time + 0.03);

    // ── the sidechain pump: duck sub+pad, recover over ~1/8-note ─────────
    const dg = duck.gain;
    dg.cancelScheduledValues(time);
    dg.setValueAtTime(1, time);
    dg.setValueAtTime(0.14, time + 0.006);
    dg.setTargetAtTime(1, time + 0.02, SEC_PER_16TH * 1.6);
  }

  function triggerSnare(time: number, level: number) {
    const src = ctx.createBufferSource();
    src.buffer = snareBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(glue);
    src.start(time);
    src.stop(time + 0.16);
  }

  // ── retune sub + supersaw to a chord root (per bar) ─────────────────────
  function retune(rootMidi: number, time: number) {
    const subF = mtof(rootMidi - 12);
    subOsc.frequency.setTargetAtTime(subF, time, 0.02);
    for (let i = 0; i < 7; i++) {
      const f = mtof(rootMidi + SAW_OFFSETS[i]);
      saws[i].frequency.setTargetAtTime(f, time, 0.03);
    }
  }

  // ── per-16th-note scheduling ────────────────────────────────────────────
  let step16 = 0;
  let bar = 0;
  let nextNoteTime = ctx.currentTime + 0.08;

  function scheduleStep(step: number, time: number) {
    const { phase, energy } = arc;

    // retune on the downbeat of each bar
    if (step === 0) {
      retune(PROG[bar % PROG.length], time);
      bar++;
    }

    const beatHit = step % 4 === 0;
    const grooving = phase === "groove" || phase === "drop";

    // KICK — four-on-the-floor during drop + groove (also drives the pump)
    if (grooving && beatHit) {
      triggerKick(time);
    }

    // extra crash-ish snare on the very first beat of the drop
    if (phase === "drop" && step === 0) {
      triggerSnare(time, 0.6);
    }

    // SNARE / CLAP
    if (phase === "groove") {
      // backbeat clap on 2 & 4
      if (step % 8 === 4) triggerSnare(time, 0.45);
      // light hats on off-16ths
      if (step % 2 === 1) triggerSnare(time, 0.08);
    } else if (phase === "build") {
      // ACCELERATING snare roll — finer subdivision as energy climbs
      let div: number;
      if (energy < 0.3) div = 4; // quarters
      else if (energy < 0.55) div = 2; // eighths
      else if (energy < 0.8) div = 1; // sixteenths
      else div = 1; // sixteenths + flams (below)
      if (step % div === 0) {
        triggerSnare(time, 0.18 + energy * 0.25);
        if (energy >= 0.8) triggerSnare(time + SEC_PER_16TH * 0.5, 0.2);
      }
    }
  }

  // ── lookahead scheduler loop ────────────────────────────────────────────
  const timer = window.setInterval(() => {
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step16, nextNoteTime);
      nextNoteTime += SEC_PER_16TH;
      step16 = (step16 + 1) % 16;
    }
  }, LOOKAHEAD_MS);

  // ── continuous parameter mapping, called every animation frame ──────────
  function setArc(phase: Phase, energy: number, dropPower: number) {
    arc.phase = phase;
    arc.energy = energy;
    arc.dropPower = dropPower;
    const t = ctx.currentTime;

    // pad presence + brightness by phase
    let padTarget = 0;
    let padCutoff = 400;
    let subTarget = 0;
    let riserTarget = 0;
    let riserFreq = 300;

    switch (phase) {
      case "intro":
        padTarget = 0.12;
        padCutoff = 700;
        subTarget = 0.0;
        break;
      case "build":
        // pad swells and opens; riser sweeps up with energy
        padTarget = 0.1 + energy * 0.16;
        padCutoff = 300 + energy * energy * 7000;
        subTarget = 0.15 + energy * 0.25;
        riserTarget = 0.08 + energy * 0.5;
        riserFreq = 250 + energy * energy * 6500;
        break;
      case "peak":
        // brief tense gap: pad holds, riser tops out, everything poised
        padTarget = 0.14;
        padCutoff = 8000;
        subTarget = 0.1;
        riserTarget = 0.55;
        riserFreq = 7500;
        break;
      case "drop":
        padTarget = 0.34;
        padCutoff = 6000;
        subTarget = 0.5;
        riserTarget = 0;
        break;
      case "groove":
        padTarget = 0.26 + dropPower * 0.08;
        padCutoff = 3200 + dropPower * 2500;
        subTarget = 0.42 + dropPower * 0.12;
        riserTarget = 0;
        break;
      case "breakdown":
        padTarget = 0.14;
        padCutoff = 900;
        subTarget = 0.12;
        riserTarget = 0;
        break;
    }

    padGain.gain.setTargetAtTime(padTarget, t, 0.08);
    padFilter.frequency.setTargetAtTime(padCutoff, t, 0.06);
    subGain.gain.setTargetAtTime(subTarget, t, 0.08);
    riserGain.gain.setTargetAtTime(riserTarget, t, 0.05);
    riserBP.frequency.setTargetAtTime(riserFreq, t, 0.05);
  }

  function visualPump(t: number): number {
    const age = t - lastKickAt;
    if (age < 0 || age > 1) return 0;
    // kick-hit envelope: spikes to ~1 on the kick, decays over ~1/8-note,
    // so the tunnel visibly throbs outward on every beat (the visual pump)
    return Math.exp(-age / (SEC_PER_16TH * 1.4));
  }

  function stop() {
    window.clearInterval(timer);
    const t = ctx.currentTime;
    padGain.gain.setTargetAtTime(0, t, 0.05);
    subGain.gain.setTargetAtTime(0, t, 0.05);
    riserGain.gain.setTargetAtTime(0, t, 0.05);
    const stopAt = t + 0.2;
    try {
      subOsc.stop(stopAt);
      riserSrc.stop(stopAt);
      saws.forEach((o) => o.stop(stopAt));
    } catch {
      /* already stopped */
    }
  }

  return { setArc, visualPump, stop, bpm: BPM };
}
