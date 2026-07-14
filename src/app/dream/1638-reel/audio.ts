// 1638-reel — audio.ts
//
// A small cinematic generative score. Everything is driven by the shared
// dramatic-tension signal coming from story.ts, so the music obeys the same
// beat sheet as the image.
//
//   • a pad/drone BED (four detuned oscillators + a sub) that voices the
//     current act's chord; dissonance, detune and register scale with tension
//   • a recurring MOTIF voice with an internal look-ahead scheduler; the motif
//     is re-voiced per act (plain → lifted → driven → inverted at the climax →
//     resolved at the end) — the memory of the piece
//   • an air/atmosphere noise layer that swells at high tension
//   • master path through a DynamicsCompressor, master gain kept LOW (≤0.14)
//
// All scheduling is anchored to ctx.currentTime; no wall clock, no Math.random
// (a seeded PRNG supplies every micro-variation).

import {
  MODES,
  MOTIF,
  SEED,
  degreeToMidi,
  makeRng,
  midiToFreq,
  type Beat,
  type MotifTransform,
} from "./story";

export interface ReelAudio {
  /** Push the current dramatic state each frame. */
  setState(beat: Beat, tension: number): void;
  /** Advance the look-ahead scheduler using the audio clock. */
  schedule(): void;
  /** Reset the motif to bar one (used on Restart / act jumps). */
  reseat(): void;
  stop(): void;
}

const LOOKAHEAD = 0.12; // seconds of scheduling horizon per call

function transformMotif(
  transform: MotifTransform,
): { degrees: number[]; octave: number; rateMul: number; gate: number } {
  const base = MOTIF;
  switch (transform) {
    case "lift":
      return { degrees: base, octave: 1, rateMul: 1.1, gate: 0.9 };
    case "drive":
      return { degrees: base, octave: 0, rateMul: 1.35, gate: 0.7 };
    case "stretch":
      return { degrees: base, octave: 1, rateMul: 0.75, gate: 1.4 };
    case "invert": {
      // contour inverted around its peak, thrown up an octave: the same shape
      // turned against itself at the height of the drama.
      const peak = Math.max(...base);
      return {
        degrees: base.map((d) => peak - d),
        octave: 2,
        rateMul: 1.5,
        gate: 0.55,
      };
    }
    case "descend":
      return { degrees: base, octave: -1, rateMul: 0.8, gate: 1.1 };
    case "resolve":
      // slow, low, and it lands on the tonic — the motif finally at rest.
      return { degrees: [...base, 0], octave: -1, rateMul: 0.55, gate: 1.8 };
    case "plain":
    default:
      return { degrees: base, octave: 0, rateMul: 1.0, gate: 1.0 };
  }
}

export function makeReelAudio(ctx: AudioContext, peak: number): ReelAudio {
  const rng = makeRng(SEED);
  const now0 = ctx.currentTime;

  // ── master chain ───────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 26;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.02;
  comp.release.value = 0.35;
  master.connect(comp);
  comp.connect(ctx.destination);
  // fade the master in over the first two seconds (a slow film fade-up)
  master.gain.setValueAtTime(0, now0);
  master.gain.linearRampToValueAtTime(Math.min(0.14, peak), now0 + 2.2);

  // ── a shared reverb-ish space: feedback delay ──────────────────────────
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.33;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  // ── pad bed: four detuned oscillators through a lowpass ────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 700;
  padFilter.Q.value = 0.7;
  padFilter.connect(padGain);
  padGain.connect(master);
  padGain.connect(delay);

  const padOscs: OscillatorNode[] = [];
  const padVoiceGains: GainNode[] = [];
  for (let i = 0; i < 4; i++) {
    const o = ctx.createOscillator();
    o.type = i < 2 ? "sawtooth" : "triangle";
    const g = ctx.createGain();
    g.gain.value = 0.0;
    o.connect(g);
    g.connect(padFilter);
    o.start(now0);
    padOscs.push(o);
    padVoiceGains.push(g);
  }

  // ── sub drone (sine, one octave below root) ────────────────────────────
  const sub = ctx.createOscillator();
  sub.type = "sine";
  const subGain = ctx.createGain();
  subGain.gain.value = 0.0;
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now0);

  // ── motif voice mixer ──────────────────────────────────────────────────
  const motifBus = ctx.createGain();
  motifBus.gain.value = 0.0;
  motifBus.connect(master);
  motifBus.connect(delay);

  // ── air / atmosphere: filtered noise that swells with tension ──────────
  const noiseLen = 2 * ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = rng() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 900;
  airFilter.Q.value = 0.6;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.0;
  noise.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(master);
  noise.start(now0);

  // ── running state ──────────────────────────────────────────────────────
  let curBeat: Beat | null = null;
  let curTension = 0;
  let nextNoteTime = now0 + 2.4; // let the fade-up breathe before the first motif note
  let step = 0;

  function chordFreqs(beat: Beat, tension: number): number[] {
    const mode = MODES[beat.mode];
    // triad off the root plus a colour tone; add a biting tension tone as the
    // drama rises (a minor 2nd / tritone cluster near the climax).
    const degrees = [0, 2, 4, 6];
    const notes = degrees.map((d) => degreeToMidi(beat.root, mode, d));
    if (tension > 0.72) {
      // a dissonant neighbour a semitone above the third — audible strain
      notes[3] = degreeToMidi(beat.root, mode, 2) + 1;
    }
    return notes.map((m) => midiToFreq(m));
  }

  function setState(beat: Beat, tension: number): void {
    const t = ctx.currentTime;
    curTension = tension;
    if (beat !== curBeat) {
      curBeat = beat;
      // let the scheduler retime the motif to the new act's density
      step = step % Math.max(1, transformMotif(beat.transform).degrees.length);
    }

    const freqs = chordFreqs(beat, tension);
    const detune = 4 + tension * 22; // cents of spread — wider = more unstable
    for (let i = 0; i < padOscs.length; i++) {
      const f = freqs[i % freqs.length];
      padOscs[i].frequency.setTargetAtTime(f, t, 0.4);
      const sign = i % 2 === 0 ? 1 : -1;
      const spread = detune * (0.3 + 0.7 * (i / padOscs.length));
      padOscs[i].detune.setTargetAtTime(sign * spread, t, 0.4);
      padVoiceGains[i].gain.setTargetAtTime(0.16, t, 0.6);
    }

    // register + brightness open up with tension
    const cutoff = 420 + tension * 2600 + Math.sin(t * 0.2) * 60;
    padFilter.frequency.setTargetAtTime(cutoff, t, 0.5);
    padGain.gain.setTargetAtTime(0.5 - tension * 0.12, t, 0.6);

    sub.frequency.setTargetAtTime(midiToFreq(beat.root - 12), t, 0.5);
    subGain.gain.setTargetAtTime(0.26 + tension * 0.12, t, 0.6);

    motifBus.gain.setTargetAtTime(0.14 + tension * 0.1, t, 0.4);

    // air swells in the top third of the tension range
    const air = Math.max(0, tension - 0.45) * 0.09;
    airGain.gain.setTargetAtTime(air, t, 0.7);
    airFilter.frequency.setTargetAtTime(700 + tension * 3500, t, 0.6);
    airFilter.Q.setTargetAtTime(0.5 + tension * 2.0, t, 0.6);

    // the shared space gets longer + more present as drama builds
    wet.gain.setTargetAtTime(0.22 + tension * 0.16, t, 0.6);
    fb.gain.setTargetAtTime(0.3 + tension * 0.18, t, 0.6);
  }

  function playMotifNote(when: number): void {
    if (!curBeat) return;
    const mode = MODES[curBeat.mode];
    const tf = transformMotif(curBeat.transform);
    const degrees = tf.degrees;
    const idx = step % degrees.length;
    const degree = degrees[idx] + tf.octave * mode.length;
    const midi = degreeToMidi(curBeat.root, mode, degree);
    const freq = midiToFreq(midi);

    const rate = curBeat.rate * tf.rateMul * (0.75 + curTension * 0.6);
    const beatDur = 1 / Math.max(0.15, rate);
    const dur = Math.min(2.6, beatDur * tf.gate);

    // a slightly detuned pair for warmth; timbre brightens with tension
    const g = ctx.createGain();
    g.gain.value = 0;
    const peakLvl = 0.5 + curTension * 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peakLvl, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(motifBus);

    const oscs: OscillatorNode[] = [];
    for (let v = 0; v < 2; v++) {
      const o = ctx.createOscillator();
      o.type = curTension > 0.7 ? "sawtooth" : v === 0 ? "triangle" : "sine";
      o.frequency.value = freq;
      o.detune.value = (v === 0 ? -1 : 1) * (2 + curTension * 6);
      o.connect(g);
      o.start(when);
      o.stop(when + dur + 0.1);
      oscs.push(o);
    }
    // tidy up the nodes after the note has fully decayed
    oscs[oscs.length - 1].onended = () => {
      for (const o of oscs) {
        try {
          o.disconnect();
        } catch {}
      }
      try {
        g.disconnect();
      } catch {}
    };

    step++;
  }

  function schedule(): void {
    if (!curBeat) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (nextNoteTime < horizon && guard < 16) {
      guard++;
      playMotifNote(nextNoteTime);
      const rate = curBeat.rate * (0.75 + curTension * 0.6);
      let interval = 1 / Math.max(0.15, rate);
      // a little deterministic rubato so the line breathes; a rest on the
      // downbeat return keeps the motif from feeling mechanical
      interval *= 0.9 + rng() * 0.2;
      if (step % MOTIF.length === 0) interval *= 1.6; // phrase breath
      nextNoteTime += interval;
    }
  }

  function reseat(): void {
    step = 0;
    nextNoteTime = ctx.currentTime + 0.3;
  }

  function stop(): void {
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0, t, 0.15);
    } catch {}
    const stopAt = t + 0.4;
    const nodes: (OscillatorNode | AudioBufferSourceNode)[] = [
      ...padOscs,
      sub,
      noise,
    ];
    for (const n of nodes) {
      try {
        n.stop(stopAt);
      } catch {}
    }
    setTimeout(() => {
      const all: AudioNode[] = [
        ...padOscs,
        ...padVoiceGains,
        sub,
        subGain,
        padFilter,
        padGain,
        motifBus,
        noise,
        airFilter,
        airGain,
        delay,
        fb,
        wet,
        comp,
        master,
      ];
      for (const n of all) {
        try {
          n.disconnect();
        } catch {}
      }
    }, 500);
  }

  return { setState, schedule, reseat, stop };
}
