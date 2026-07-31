// ─────────────────────────────────────────────────────────────────────────
// 4168-surge · audio.ts — a self-composing EDM synthesis engine.
//
//   Everything is built by hand on the Web Audio API — no sample libraries,
//   no npm audio deps. The engine owns:
//
//     • a felt-piano-ish TOPLINE (detuned triangle partials, soft attack) —
//       the melodic MOTIF, the memory of the piece. Stated bare in the intro,
//       it RETURNS octave-stacked and re-orchestrated in the drops.
//     • a supersaw LEAD (7–9 detuned saws) through one resonant lowpass whose
//       cutoff we sweep with the arc energy — the classic "filter opens on the
//       drop" gesture.
//     • a monophonic sub-sine BASS, a pitch-enveloped sine KICK, noise HATS
//       and a noise CLAP, and sustained PADS.
//     • a SHEPARD RISER: octave-spaced sines under a raised-cosine window that
//       sweeps up in log-frequency and wraps every octave, so it seems to rise
//       forever. Its drive comes straight from the arc's build sections.
//
//   Two clocks cooperate: a look-ahead NOTE SCHEDULER (setInterval, sample-
//   accurate against ctx.currentTime) places the beat; per-frame setArc()
//   glides the macro mix + filter targets. Everything ramps (setTargetAtTime /
//   exponential ramps from 1e-4) so it is click-free, and a limiter guards the
//   master so the drops do not clip.
//
//   DETERMINISM: all randomness is a mulberry32(0x4168) PRNG — no Math.random,
//   no Date. The same set plays the same way every time.
// ─────────────────────────────────────────────────────────────────────────

import type { Phase } from "./arc";

// ── seeded PRNG (mulberry32) ──────────────────────────────────────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── musical material ──────────────────────────────────────────────────────
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // A natural minor
const BPM = 124;
const SEC_PER_16 = 60 / BPM / 4;

// chord progression: Am – F – C – G (i – VI – III – VII), one bar each.
// [bass-root semitones from A1, triad degrees for pads]
const PROG: { bassSemi: number; triad: number[] }[] = [
  { bassSemi: 0, triad: [0, 2, 4] }, // Am
  { bassSemi: 8, triad: [5, 0, 2] }, // F  (F over the A-minor field)
  { bassSemi: 3, triad: [2, 4, 6] }, // C
  { bassSemi: 10, triad: [4, 6, 1] }, // G
];

// The MOTIF — an 8-note topline over one bar (positions in 16ths, scale
// degrees, lengths in 16ths). This exact shape is what returns in the drops.
const MOTIF: { pos: number; deg: number; len: number }[] = [
  { pos: 0, deg: 4, len: 2 },
  { pos: 2, deg: 6, len: 2 },
  { pos: 4, deg: 7, len: 3 },
  { pos: 7, deg: 6, len: 1 },
  { pos: 8, deg: 4, len: 3 },
  { pos: 11, deg: 2, len: 1 },
  { pos: 12, deg: 4, len: 2 },
  { pos: 14, deg: 6, len: 2 },
];

function degToFreq(root: number, deg: number): number {
  const oct = Math.floor(deg / 7);
  const i = ((deg % 7) + 7) % 7;
  return root * Math.pow(2, (SCALE[i] + 12 * oct) / 12);
}
function semiToFreq(root: number, semi: number): number {
  return root * Math.pow(2, semi / 12);
}

export interface SurgeAudio {
  /** Per-frame macro update: glide bus gains + filter cutoff toward the arc. */
  setArc(phase: Phase, energy: number, riser: number): void;
  /** Advance the Shepard riser by dt seconds (call once per animation frame). */
  stepRiser(dt: number): void;
  /** 0..1 smoothed broadband RMS for the shader envelope. */
  getRms(): number;
  /** 0..1 smoothed low-band energy (kick/sub) for the visual pump. */
  getLow(): number;
  /** Layer an optional real-piano recording under the synth (looped bed). */
  setPianoBuffer(buf: AudioBuffer | null): void;
  /** Fade out + tear down the graph. */
  stop(): void;
}

export function makeSurgeAudio(ctx: AudioContext): SurgeAudio {
  const rng = makeRng(0x4168);

  // ── master chain: buses → master → limiter → analyser → out ──
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2.5);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  const timeBuf = new Uint8Array(analyser.fftSize);
  const freqBuf = new Uint8Array(analyser.frequencyBinCount);

  master.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // ── buses ──
  const mkBus = (g: number): GainNode => {
    const n = ctx.createGain();
    n.gain.value = g;
    n.connect(master);
    return n;
  };
  const padBus = mkBus(0);
  const pianoBus = mkBus(0);
  const drumBus = mkBus(0);
  const subBus = mkBus(0);
  const riserBus = mkBus(0);
  const sampleBus = mkBus(0);

  // lead runs through ONE shared resonant lowpass we sweep on the drop
  const leadFilter = ctx.createBiquadFilter();
  leadFilter.type = "lowpass";
  leadFilter.frequency.value = 400;
  leadFilter.Q.value = 9;
  const leadBus = ctx.createGain();
  leadBus.gain.value = 0;
  leadFilter.connect(leadBus);
  leadBus.connect(master);

  // gentle body lowpass on the felt piano
  const pianoFilter = ctx.createBiquadFilter();
  pianoFilter.type = "lowpass";
  pianoFilter.frequency.value = 3200;
  pianoFilter.connect(pianoBus);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.connect(padBus);

  // ── shared noise buffer (seeded) ──
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;

  // ── monophonic sub bass (one always-on sine, gated per note) ──
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = 55;
  const subGate = ctx.createGain();
  subGate.gain.value = 0.0001;
  subOsc.connect(subGate);
  subGate.connect(subBus);
  subOsc.start();

  // ── Shepard riser: octave-spaced sines under a raised-cosine window ──
  const RN = 8;
  const fLow = 32;
  const centerOct = 3.2;
  const sigmaOct = 1.5;
  const riserOscs: OscillatorNode[] = [];
  const riserGains: GainNode[] = [];
  for (let i = 0; i < RN; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(riserBus);
    o.start();
    riserOscs.push(o);
    riserGains.push(g);
  }
  let riserPhase = 0;
  let riserDrive = 0;

  // ── optional real-piano bed ──
  let sampleSrc: AudioBufferSourceNode | null = null;
  const setPianoBuffer = (buf: AudioBuffer | null) => {
    if (sampleSrc) {
      try {
        sampleSrc.stop();
      } catch {
        /* already stopped */
      }
      sampleSrc.disconnect();
      sampleSrc = null;
    }
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // a slow low-pass reuse of the piano filter path for cohesion
    src.connect(sampleBus);
    src.start(ctx.currentTime + 0.05);
    sampleSrc = src;
  };

  // ── voice factories (all click-free) ─────────────────────────────────────
  function makePiano(freq: number, t: number, dur: number, vel: number): void {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(pianoFilter);
    const parts: [number, number][] = [
      [1, 1],
      [2, 0.34],
      [3, 0.13],
      [4, 0.05],
    ];
    for (const [m, a] of parts) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq * m, t);
      o.detune.setValueAtTime((rng() * 2 - 1) * 5, t);
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.3);
    }
    const peak = Math.max(0.0002, vel);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function makeLead(
    freq: number,
    t: number,
    dur: number,
    vel: number,
    voices: number,
    octaves: number[],
  ): void {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(leadFilter);
    for (const oct of octaves) {
      for (let i = 0; i < voices; i++) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        const spread = ((i - (voices - 1) / 2) / voices) * 26;
        o.frequency.setValueAtTime(freq * Math.pow(2, oct), t);
        o.detune.setValueAtTime(spread + (rng() * 2 - 1) * 4, t);
        const og = ctx.createGain();
        og.gain.value = 1 / (voices * octaves.length);
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + dur + 0.15);
      }
    }
    const peak = Math.max(0.0002, vel);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.12);
  }

  function makeKick(t: number, vel: number): void {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g);
    g.connect(drumBus);
    o.start(t);
    o.stop(t + 0.32);
  }

  function makeHat(t: number, vel: number, open: boolean): void {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 1.4 + rng() * 0.3;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    const dur = open ? 0.14 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp);
    hp.connect(g);
    g.connect(drumBus);
    s.start(t, rng() * 0.5);
    s.stop(t + dur + 0.05);
  }

  function makeClap(t: number, vel: number): void {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.connect(drumBus);
    bp.connect(g);
    // three quick bursts = the classic clap texture
    for (let k = 0; k < 3; k++) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const st = t + k * 0.012;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, st);
      bg.gain.exponentialRampToValueAtTime(vel, st + 0.002);
      bg.gain.exponentialRampToValueAtTime(0.0001, st + 0.06);
      s.connect(bg);
      bg.connect(bp);
      s.start(st, rng() * 0.5);
      s.stop(st + 0.1);
    }
  }

  function makePad(triad: number[], t: number, dur: number): void {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(padFilter);
    for (const deg of triad) {
      const f = degToFreq(220, deg);
      for (let d = 0; d < 2; d++) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, t);
        o.detune.setValueAtTime((d === 0 ? -7 : 7) + (rng() * 2 - 1) * 3, t);
        const og = ctx.createGain();
        og.gain.value = 0.16;
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + dur * 0.35); // slow swell
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.15);
  }

  function bassNote(freq: number, t: number, dur: number, vel: number): void {
    subOsc.frequency.setTargetAtTime(freq, t, 0.006);
    subGate.gain.cancelScheduledValues(t);
    subGate.gain.setValueAtTime(Math.max(0.0001, subGate.gain.value), t);
    subGate.gain.exponentialRampToValueAtTime(vel, t + 0.01);
    subGate.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.2);
  }

  // ── the look-ahead note scheduler ─────────────────────────────────────────
  let step = 0;
  let nextTime = ctx.currentTime + 0.12;
  const arc = { phase: "intro" as Phase, energy: 0.1 };

  const scheduleStep = (s: number, t: number): void => {
    const pos = ((s % 16) + 16) % 16;
    const bar = Math.floor(s / 16);
    const chord = PROG[bar % PROG.length];
    const { phase, energy } = arc;

    const inDrop = phase === "drop1" || phase === "drop2";
    const big = phase === "drop2";
    const building = phase === "build1" || phase === "build2";

    // ── PADS: swell in on each bar for everything but the bare intro tail ──
    if (pos === 0 && phase !== "outro") {
      makePad(chord.triad, t, SEC_PER_16 * 16);
    } else if (pos === 0 && phase === "outro") {
      makePad(chord.triad, t, SEC_PER_16 * 24);
    }

    // ── TOPLINE MOTIF on felt piano ──
    // stated bare in intro/breakdown/outro; doubled softly under the drops.
    const note = MOTIF.find((n) => n.pos === pos);
    if (note) {
      const dur = note.len * SEC_PER_16;
      if (phase === "intro" || phase === "outro") {
        makePiano(degToFreq(440, note.deg), t, dur, 0.42);
      } else if (phase === "breakdown") {
        makePiano(degToFreq(440, note.deg), t, dur, 0.5);
        makePiano(degToFreq(220, note.deg), t, dur, 0.18); // octave shadow
      } else if (building) {
        makePiano(degToFreq(440, note.deg), t, dur, 0.24 + 0.2 * energy);
      } else if (inDrop) {
        // MEMORY RETURNS: motif re-orchestrated on the supersaw lead,
        // octave-stacked; drop 2 is wider (more voices, extra octave)
        // and adds a bright +2-octave sparkle the first drop never had.
        const octs = big ? [-1, 0, 1] : [0, 1];
        makeLead(degToFreq(440, note.deg), t, dur, big ? 0.5 : 0.42,
          big ? 9 : 6, octs);
        makePiano(degToFreq(440, note.deg), t, dur, 0.22); // body under lead
        if (big) makePiano(degToFreq(880, note.deg), t, dur * 0.6, 0.12);
      }
    }

    // ── DRUMS ──
    if (inDrop) {
      if (pos % 4 === 0) makeKick(t, 0.95); // four-on-the-floor
      if (pos === 4 || pos === 12) makeClap(t, 0.5); // backbeat
      if (pos % 2 === 0) makeHat(t, 0.16, false); // 8th closed hats
      if (pos % 2 === 1 && (big || rng() < 0.6))
        makeHat(t, 0.1, false); // 16th fills
      if (big && pos === 14) makeHat(t, 0.14, true); // open hat lift
    } else if (building) {
      // kick enters late; hats accelerate into a roll as energy climbs
      if (energy > 0.45 && pos % 4 === 0) makeKick(t, 0.6 + 0.3 * energy);
      if (energy > 0.3 && pos % 2 === 0) makeHat(t, 0.1 * energy, false);
      // rising 16th snare/hat roll in the final stretch
      if (energy > 0.62 && rng() < (energy - 0.62) * 3.5)
        makeHat(t, 0.12 * energy, false);
    }

    // ── BASS: drops get a driving offbeat sub; breakdown a soft pulse ──
    if (inDrop && (pos === 0 || pos === 6 || pos === 8 || pos === 14)) {
      bassNote(semiToFreq(55, chord.bassSemi), t, SEC_PER_16 * 2, 0.85);
    } else if (building && energy > 0.5 && pos === 0) {
      bassNote(semiToFreq(55, chord.bassSemi), t, SEC_PER_16 * 4, 0.4 * energy);
    }

    // ── DROP 2 extra: a bright 16th counter-arp for width/density ──
    if (big && pos % 2 === 1) {
      const arpDeg = chord.triad[(Math.floor(s / 2) % 3)] + 7;
      makeLead(degToFreq(440, arpDeg), t, SEC_PER_16, 0.14, 4, [0]);
    }
  };

  let schedTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    const ahead = ctx.currentTime + 0.14;
    while (nextTime < ahead) {
      scheduleStep(step, nextTime);
      step += 1;
      nextTime += SEC_PER_16;
    }
  }, 25);

  // ── per-frame macro glide + riser advance ─────────────────────────────────
  const setArc = (phase: Phase, energy: number, riser: number): void => {
    arc.phase = phase;
    arc.energy = energy;
    riserDrive = riser;
    const now = ctx.currentTime;
    const tc = 0.15;

    const inDrop = phase === "drop1" || phase === "drop2";
    const big = phase === "drop2";
    const building = phase === "build1" || phase === "build2";
    const quiet =
      phase === "intro" || phase === "breakdown" || phase === "outro";

    // bus targets
    const pad = quiet ? 0.28 : building ? 0.22 + 0.12 * energy : 0.16;
    const piano = quiet ? 0.5 : building ? 0.34 : 0.26;
    const lead = inDrop ? (big ? 0.42 : 0.32) : 0;
    const sub = inDrop ? (big ? 0.95 : 0.8) : building ? 0.3 * energy : 0.0001;
    const drum = inDrop ? 0.85 : building ? 0.5 : 0.0001;
    const riserG = building ? 0.28 * riser : 0.0001;
    const sample = quiet ? 0.5 : inDrop ? 0.35 : 0.25;

    padBus.gain.setTargetAtTime(pad, now, tc);
    pianoBus.gain.setTargetAtTime(piano, now, tc);
    leadBus.gain.setTargetAtTime(lead, now, tc);
    subBus.gain.setTargetAtTime(sub, now, tc);
    drumBus.gain.setTargetAtTime(drum, now, tc);
    riserBus.gain.setTargetAtTime(riserG, now, 0.08);
    sampleBus.gain.setTargetAtTime(sample * 0.5, now, tc);

    // FILTER OPENS ON THE DROP: cutoff tracks energy; wide open in drop 2.
    const cut = 320 + energy * energy * (big ? 8200 : 6000);
    leadFilter.frequency.setTargetAtTime(cut, now, 0.1);
    leadFilter.Q.setTargetAtTime(building ? 12 : 8, now, 0.2);
    padFilter.frequency.setTargetAtTime(600 + energy * 2600, now, tc);
  };

  const stepRiser = (dt: number): void => {
    const now = ctx.currentTime;
    const cdt = Math.min(0.1, Math.max(0, dt));
    // ascent rate + brightness scale with the riser drive; wraps every octave
    const rate = 0.05 + 0.35 * riserDrive;
    riserPhase += rate * cdt;
    riserPhase -= Math.floor(riserPhase);
    const level = 0.15 + 0.85 * riserDrive;
    for (let i = 0; i < RN; i++) {
      const oct = i + riserPhase;
      const freq = fLow * Math.pow(2, oct);
      riserOscs[i].frequency.setTargetAtTime(freq, now, 0.02);
      const d = (oct - centerOct) / sigmaOct;
      // raised-cosine-ish window via a gaussian; fades partials in/out
      const w = Math.exp(-0.5 * d * d) * level;
      riserGains[i].gain.setTargetAtTime(Math.min(1, Math.max(0, w)), now, 0.03);
    }
  };

  let rms = 0;
  let low = 0;
  const getRms = (): number => {
    analyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    const inst = Math.sqrt(sum / timeBuf.length);
    rms += (inst - rms) * 0.25;
    return Math.min(1, rms * 2.2);
  };
  const getLow = (): number => {
    analyser.getByteFrequencyData(freqBuf);
    // average the lowest ~8 bins (sub/kick band)
    let s = 0;
    const n = 8;
    for (let i = 0; i < n; i++) s += freqBuf[i];
    const inst = s / (n * 255);
    low += (inst - low) * 0.3;
    return Math.min(1, low * 1.3);
  };

  const stop = (): void => {
    if (schedTimer !== null) {
      clearInterval(schedTimer);
      schedTimer = null;
    }
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    } catch {
      /* ctx may be closing */
    }
    const killAt = now + 0.4;
    try {
      subOsc.stop(killAt);
      for (const o of riserOscs) o.stop(killAt);
    } catch {
      /* already stopped */
    }
    if (sampleSrc) {
      try {
        sampleSrc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  };

  return { setArc, stepRiser, getRms, getLow, setPianoBuffer, stop };
}
