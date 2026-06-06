// Web Audio just-intonation drone/choir engine, parameterised by the local sky.
// A DynamicsCompressor acts as a brick-wall limiter so it can never blast.

import type { SkyState } from "./astronomy";
import { seasonBrightness } from "./astronomy";

// Just-intonation ratios. A "darker/minor" set and a "brighter/major" set;
// season morphs the chosen scale color.
const JI_MINOR = [1, 9 / 8, 6 / 5, 3 / 2, 8 / 5, 9 / 5]; // root, M2, m3, P5, m6, m7
const JI_MAJOR = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 15 / 8]; // root, M2, M3, P5, M6, M7

const ROOT_BASE = 55; // A1, the cellar root in Hz

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  ratio: number;
  octave: number;
  // smoothed target level
  target: number;
};

export type Engine = {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  voices: Voice[];
  shimmer: Voice; // moon voice
  lead: Voice; // panning lead
  lfo: OscillatorNode;
  setSky: (s: SkyState) => void;
  dispose: () => void;
  resume: () => Promise<void>;
};

function makeVoice(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  ratio: number,
  octave: number,
): Voice {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  // very slight detune for chorus warmth
  osc.detune.value = (Math.random() - 0.5) * 6;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const pan = ctx.createStereoPanner();
  pan.pan.value = 0;
  osc.connect(gain);
  gain.connect(pan);
  pan.connect(dest);
  osc.start();
  return { osc, gain, pan, ratio, octave, target: 0 };
}

export function createEngine(): Engine {
  const ctx = new AudioContext();

  // ── master + brick-wall limiter ──────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.0001;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // gentle ramp-in of the master so onset is never a click
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 4);

  // ── voices: a small evolving choir spread across octaves ──────────────────
  // We allocate fixed voices and re-tune them as the sky changes.
  const voices: Voice[] = [];
  // cellar drone (octave 0), mid cluster (octave 1), bright partials (octave 2/3)
  const layout: Array<[number, number, OscillatorType]> = [
    [0, 0, "sine"], // root drone
    [0, 0, "triangle"], // fifth-ish, set later
    [1, 1, "sine"], // mid
    [2, 1, "triangle"], // mid color
    [3, 2, "sine"], // bright
    [4, 3, "sine"], // brighter
  ];

  for (const [scaleIdx, octave, type] of layout) {
    const ratio = JI_MAJOR[scaleIdx % JI_MAJOR.length];
    const freq = ROOT_BASE * ratio * Math.pow(2, octave);
    voices.push(makeVoice(ctx, master, freq, type, ratio, octave));
  }

  const lead = voices[2]; // mid voice pans with azimuth
  // shimmer / moon voice: high, sine, waxes with illumination
  const shimmer = makeVoice(
    ctx,
    master,
    ROOT_BASE * (5 / 3) * Math.pow(2, 4),
    "sine",
    5 / 3,
    4,
  );

  // ── slow vibrato/breath LFO shared lightly across voices via detune ───────
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 4; // cents
  lfo.connect(lfoGain);
  for (const v of voices) lfoGain.connect(v.osc.detune);
  lfoGain.connect(shimmer.osc.detune);
  lfo.start();

  // azimuth → slow pan target, smoothed
  let panTarget = 0;

  function setSky(s: SkyState) {
    const now = ctx.currentTime;
    const ramp = 1.6; // seconds — long, contemplative glides

    // Season chooses scale color: blend minor (winter) → major (summer).
    const bright = seasonBrightness(s.dayOfYear); // 0 winter .. 1 summer
    const scale = JI_MINOR.map(
      (m, i) => m + (JI_MAJOR[i] - m) * bright,
    );
    // Season also nudges the root slightly: winter a touch lower (darker).
    const root = ROOT_BASE * (1 - 0.04 * (1 - bright));

    // Solar altitude → register & brightness.
    // alt -90..-18 deep night; -18..0 twilight bloom; 0..90 day brightness.
    const alt = s.sunAltDeg;
    // night: only cellar present. day: upper partials open up.
    const dayness = clamp01((alt + 6) / 12); // 0 below -6°, 1 above +6°
    const twilight = bell(alt, 0, 14); // peaks near horizon
    const night = clamp01((-6 - alt) / 12); // strong well below horizon

    // Re-tune & re-level each voice.
    voices.forEach((v, i) => {
      const ratio = scale[scaleIndexFor(i) % scale.length];
      const freq = root * ratio * Math.pow(2, v.octave);
      v.osc.frequency.setTargetAtTime(freq, now, ramp);

      let level = 0;
      switch (i) {
        case 0: // root drone — always present, loudest at night
          level = 0.22 + 0.1 * night;
          break;
        case 1: // low color — present always, blooms in twilight
          level = 0.1 + 0.12 * twilight;
          break;
        case 2: // mid lead — twilight bloom + some day
          level = 0.05 + 0.16 * twilight + 0.08 * dayness;
          break;
        case 3: // mid color
          level = 0.04 + 0.12 * twilight + 0.06 * dayness;
          break;
        case 4: // bright partial — day only
          level = 0.16 * dayness;
          break;
        case 5: // brightest partial — high day only
          level = 0.11 * dayness * dayness;
          break;
      }
      v.target = level;
      v.gain.gain.setTargetAtTime(level, now, ramp);
    });

    // Lead voice pans with azimuth: map 0..360° → -1..+1 (E positive-ish).
    // Use sin so the drift is smooth and symmetric across the day.
    panTarget = Math.sin((s.sunAzDeg - 180) * (Math.PI / 180)) * 0.85;
    lead.pan.pan.setTargetAtTime(panTarget, now, ramp);

    // Moon shimmer waxes with illumination; silent at new moon.
    const moonFreq = root * (5 / 3) * Math.pow(2, 4);
    shimmer.osc.frequency.setTargetAtTime(moonFreq, now, ramp);
    const moonLevel = 0.13 * s.moonIllum * s.moonIllum;
    shimmer.target = moonLevel;
    shimmer.gain.gain.setTargetAtTime(moonLevel, now, ramp);
    // moon shimmer pans opposite the sun, gently
    shimmer.pan.pan.setTargetAtTime(-panTarget * 0.6, now, ramp);
  }

  async function resume() {
    if (ctx.state !== "running") await ctx.resume();
  }

  function dispose() {
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.3);
      for (const v of voices) {
        try {
          v.osc.stop(now + 0.6);
        } catch {
          /* already stopped */
        }
      }
      try {
        shimmer.osc.stop(now + 0.6);
      } catch {
        /* already stopped */
      }
      try {
        lfo.stop(now + 0.6);
      } catch {
        /* already stopped */
      }
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 800);
    } catch {
      /* best effort */
    }
  }

  return {
    ctx,
    master,
    limiter,
    voices,
    shimmer,
    lead,
    lfo,
    setSky,
    dispose,
    resume,
  };
}

// Map voice index → scale index (which JI degree it plays).
function scaleIndexFor(i: number): number {
  // 0 root, 1 fifth, 2 third, 3 second/color, 4 sixth, 5 seventh
  const map = [0, 3, 2, 1, 4, 5];
  return map[i] ?? 0;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Bell curve peaking at center, width in same units.
function bell(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}
