/* ── 3480-reverie · cinematic score engine ───────────────────────────────
 *
 *  A layered Web Audio synth driven by the affective director. Four layers:
 *
 *    · PAD BANK   — 5 detuned voices (saw + detuned saw) voicing the act's
 *                   chord. This is where the pivot-chord modulation lives.
 *    · BASS       — a sine sub + triangle body on the act's root.
 *    · LEAD       — one legato/portamento voice, sequenced by a lookahead
 *                   clock, walking the act's diatonic scale (chromatic
 *                   passing tones allowed — NO pentatonic safety net).
 *    · AMBIENT    — a looped seeded-noise bed through a bandpass whose
 *                   frequency tracks brightness: the riser (rise) / fall
 *                   (settle) texture across the bridges.
 *
 *  ── Pivot-chord / common-tone modulation ──
 *  Each act is a 5-voice chord; the three transitions each hold a COMMON TONE
 *  fixed while the other voices glide by minimal motion:
 *
 *    Act I  A minor  [A2 E3 A3 C4 E4]
 *      ↓ rise      pivot C4 held ;  A→F, E→F, A→Ab, E→F
 *    Act II F minor [F2 F3 Ab3 C4 F4]
 *      ↓ collapse  pivot C4 held ;  F→E, F→E, Ab→G, F→E  (dark → bright)
 *    Act III C major[C2 E3 G3 C4 E4]
 *      ↓ settle    pivots C4+E hold ; C→A, G→A          (relative minor)
 *    … back to Act I.
 *
 *  During a transition the pad frequencies log-interpolate index-by-index
 *  from the departing chord to the arriving chord, so the pivot literally
 *  stays put while its neighbors slide — audible common-tone modulation.
 *
 *  Master chain: master gain → gentle limiter (DynamicsCompressor) → out.
 *  Reverb send via a Convolver with a seeded, deterministic impulse.
 *  Everything is created lazily inside a user gesture by the caller.
 */

import type { ArcState } from "./arc";
import type { Affect } from "./director";

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

// ── chord tables (5 pad voices per act) ──────────────────────────────────
const CHORDS: number[][] = [
  [110.0, 164.81, 220.0, 261.63, 329.63], // Act I  A minor
  [87.31, 174.61, 207.65, 261.63, 349.23], // Act II F minor
  [65.41, 164.81, 196.0, 261.63, 329.63], // Act III C major
];
const BASS_ROOT = [55.0, 43.65, 32.7]; // A1, F1, C1

// diatonic scales for the lead (chromatic passing tones added in the walk)
const SCALES: number[][] = [
  // A natural minor
  [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0],
  // F natural minor
  [174.61, 196.0, 207.65, 233.08, 261.63, 277.18, 311.13, 349.23],
  // C major
  [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25],
];

function logLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / a, t);
}

interface PadVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
}

export interface ReverieAudio {
  setFrame(arc: ArcState, aff: Affect, dwell: number): void;
  stop(): void;
}

export function makeReverieAudio(
  ctx: AudioContext,
  master = 0.17,
): ReverieAudio {
  const now0 = ctx.currentTime;
  const rand = mulberry32(0x3480);

  // ── master chain: bus → limiter → out ──
  const masterGain = ctx.createGain();
  masterGain.gain.value = master;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.18;
  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  // ── reverb send (seeded impulse) ──
  const reverb = ctx.createConvolver();
  {
    const len = Math.floor(ctx.sampleRate * 2.6);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.4);
        d[i] = (rand() * 2 - 1) * decay;
      }
    }
    reverb.buffer = buf;
  }
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.9;
  reverb.connect(reverbGain);
  reverbGain.connect(masterGain);

  // ── pad bank ──
  const padBus = ctx.createGain();
  padBus.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.5;
  padBus.connect(padFilter);
  padFilter.connect(masterGain);
  padFilter.connect(reverb);

  const pads: PadVoice[] = [];
  for (let i = 0; i < 5; i++) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = i < 2 ? "triangle" : "sawtooth";
    const f = CHORDS[0][i];
    osc1.frequency.value = f;
    osc2.frequency.value = f;
    osc2.detune.value = 7 + i * 2; // slight spread for width
    const g = ctx.createGain();
    g.gain.value = 0;
    osc1.connect(g);
    osc2.connect(g);
    g.connect(padBus);
    osc1.start(now0);
    osc2.start(now0);
    pads.push({ osc1, osc2, gain: g });
  }

  // ── bass ──
  const bassSub = ctx.createOscillator();
  const bassBody = ctx.createOscillator();
  bassSub.type = "sine";
  bassBody.type = "triangle";
  bassSub.frequency.value = BASS_ROOT[0];
  bassBody.frequency.value = BASS_ROOT[0] * 2;
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0;
  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = "lowpass";
  bassFilter.frequency.value = 220;
  bassSub.connect(bassGain);
  bassBody.connect(bassGain);
  bassGain.connect(bassFilter);
  bassFilter.connect(masterGain);
  bassSub.start(now0);
  bassBody.start(now0);

  // ── lead (legato / portamento) ──
  const lead = ctx.createOscillator();
  lead.type = "triangle";
  lead.frequency.value = SCALES[0][0];
  const leadEnv = ctx.createGain();
  leadEnv.gain.value = 0;
  const leadFilter = ctx.createBiquadFilter();
  leadFilter.type = "lowpass";
  leadFilter.frequency.value = 1800;
  lead.connect(leadEnv);
  leadEnv.connect(leadFilter);
  leadFilter.connect(masterGain);
  leadFilter.connect(reverb);
  lead.start(now0);

  // ── ambient noise bed ──
  const noiseBuf = ctx.createBuffer(
    1,
    Math.floor(ctx.sampleRate * 2),
    ctx.sampleRate,
  );
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseBand = ctx.createBiquadFilter();
  noiseBand.type = "bandpass";
  noiseBand.frequency.value = 500;
  noiseBand.Q.value = 0.9;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseBand);
  noiseBand.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseGain.connect(reverb);
  noise.start(now0);

  // ── lead sequencer state ──
  let nextNoteTime = now0 + 0.15;
  let scaleIdx = 2; // start mid-scale
  const seqRand = mulberry32(0x3480 ^ 0x9e37);

  function currentChord(arc: ArcState): number[] {
    if (!arc.inTransition) return CHORDS[arc.fromAct];
    const from = CHORDS[arc.fromAct];
    const to = CHORDS[arc.toAct];
    const p = arc.segProgress;
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push(logLerp(from[i], to[i], p));
    return out;
  }

  function currentBass(arc: ArcState): number {
    if (!arc.inTransition) return BASS_ROOT[arc.fromAct];
    return logLerp(BASS_ROOT[arc.fromAct], BASS_ROOT[arc.toAct], arc.segProgress);
  }

  function currentScale(arc: ArcState): number[] {
    // switch the melodic scale at the bridge midpoint (harmony has pivoted)
    if (arc.inTransition && arc.segProgress > 0.5) return SCALES[arc.toAct];
    return SCALES[arc.fromAct];
  }

  function setFrame(arc: ArcState, aff: Affect, dwell: number): void {
    const t = ctx.currentTime;
    const tc = 0.06; // smoothing time-constant for portamento-free params

    // ── pads: voice frequencies (pivot-chord glide) ──
    const chord = currentChord(arc);
    for (let i = 0; i < 5; i++) {
      pads[i].osc1.frequency.setTargetAtTime(chord[i], t, 0.05);
      pads[i].osc2.frequency.setTargetAtTime(chord[i], t, 0.05);
      // higher voices bloom in with density + dwell (linger deepens)
      const bloom = i < 2 ? 1 : Math.max(0, aff.density * 1.3 + dwell * 0.5 - (i - 1) * 0.28);
      const vg = Math.min(0.5, 0.16 + bloom * 0.34);
      pads[i].gain.gain.setTargetAtTime(vg, t, tc);
    }
    // pad bus presence rises gently with arousal but never drops out
    padBus.gain.setTargetAtTime(0.34 + aff.arousal * 0.22, t, tc);
    padFilter.frequency.setTargetAtTime(
      500 + aff.brightness * 3200 + dwell * 800,
      t,
      tc,
    );

    // ── bass ──
    const broot = currentBass(arc);
    bassSub.frequency.setTargetAtTime(broot, t, 0.05);
    bassBody.frequency.setTargetAtTime(broot * 2, t, 0.05);
    bassGain.gain.setTargetAtTime(0.28 + aff.arousal * 0.12, t, tc);
    bassFilter.frequency.setTargetAtTime(140 + aff.arousal * 260, t, tc);

    // ── ambient riser / fall bed ──
    noiseBand.frequency.setTargetAtTime(
      220 + aff.brightness * 3600 + aff.arousal * 900,
      t,
      0.08,
    );
    noiseBand.Q.setTargetAtTime(0.7 + aff.arousal * 3.5, t, tc);
    // loudest during transitions (the bridge texture) and high arousal
    const bridge = arc.inTransition ? 0.06 : 0.0;
    noiseGain.gain.setTargetAtTime(
      0.012 + aff.arousal * 0.03 + bridge + dwell * 0.01,
      t,
      tc,
    );

    // ── lead sequencer (lookahead) ──
    leadFilter.frequency.setTargetAtTime(
      900 + aff.brightness * 3200,
      t,
      tc,
    );
    const scale = currentScale(arc);
    const interval = (1.5 - aff.tempo * 1.15) / (0.7 + aff.density * 0.9);
    const restProb = Math.max(0.05, 0.6 - aff.density * 0.55 - dwell * 0.2);
    while (nextNoteTime < t + 0.25) {
      const r = seqRand();
      if (r > restProb) {
        // random walk through the scale, occasional wider leap
        const stepR = seqRand();
        const step =
          stepR < 0.5 ? (seqRand() < 0.5 ? 1 : -1) : seqRand() < 0.5 ? 2 : -2;
        scaleIdx = Math.max(0, Math.min(scale.length - 1, scaleIdx + step));
        let freq = scale[scaleIdx];
        // occasional chromatic passing tone (no pentatonic safety net)
        if (seqRand() < 0.14) freq *= Math.pow(2, 1 / 12);
        const nt = nextNoteTime;
        lead.frequency.setTargetAtTime(freq, nt, 0.03); // legato glide
        const amp = 0.06 + aff.density * 0.06 + dwell * 0.03;
        leadEnv.gain.cancelScheduledValues(nt);
        leadEnv.gain.setTargetAtTime(amp, nt, 0.02);
        leadEnv.gain.setTargetAtTime(0.0001, nt + interval * 0.62, 0.12);
      }
      nextNoteTime += interval;
    }

    // ── master presence (subtle swell with arousal) ──
    masterGain.gain.setTargetAtTime(master * (0.82 + aff.arousal * 0.3), t, 0.2);
  }

  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(0, t, 0.08);
    const srcs: AudioScheduledSourceNode[] = [
      ...pads.flatMap((p) => [p.osc1, p.osc2]),
      bassSub,
      bassBody,
      lead,
      noise,
    ];
    for (const s of srcs) {
      try {
        s.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
  }

  return { setFrame, stop };
}
