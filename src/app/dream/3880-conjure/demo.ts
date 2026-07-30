// ── 3880-conjure · seeded synthetic hand path (headless self-demo) ─────────
//
// No camera exists in the review environment, so this drives a plausible
// moving 21-landmark hand that periodically forms a clean "conjure" shape
// (coherent — fingers extended, evenly fanned, held steady) then goes sloppy
// (fingers unevenly curled + jittering, and briefly leaves the frame
// entirely), on a fixed 9s loop. A hands-off reviewer SEES the particle
// field gather + scatter and HEARS the chord bloom + decohere without
// touching anything.
//
// Deterministic: per-landmark phase offsets are drawn once from
// mulberry32(0x3880) at construction; all subsequent motion is a pure
// function of performance.now() (passed in by the caller). No Math.random,
// no Date.now / new Date anywhere in this file.

import type { HandLandmark } from "./handLoader";
import { mulberry32, SEED } from "./rng";
import { n1, n01 } from "./noise";

const PERIOD_MS = 9000;
// hand-absent window inside the sloppy phase — exercises "hand left frame"
const ABSENT_FROM = 5300;
const ABSENT_TO = 5750;

function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

function coherentEnvelope(t: number): number {
  if (t < 3200) return 1;
  if (t < 3800) return 1 - smooth((t - 3200) / 600);
  if (t < 7000) return 0;
  if (t < 7700) return smooth((t - 7000) / 700);
  return 1;
}

interface Phases {
  hand: number;
  fan: number[]; // per-finger fan wander
  curl: number[]; // per-finger curl wander
  wob: number[][]; // per-finger per-segment wobble
  wrist: number;
  tilt: number;
  thumb: number;
}

export interface SyntheticHand {
  sample(nowMs: number): HandLandmark[] | null;
}

export function createSyntheticHand(): SyntheticHand {
  const rng = mulberry32(SEED);
  const phases: Phases = {
    hand: rng() * Math.PI * 2,
    fan: [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2),
    curl: [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2),
    wob: [0, 1, 2, 3].map(() => [rng(), rng(), rng()].map((v) => v * Math.PI * 2)),
    wrist: rng() * Math.PI * 2,
    tilt: rng() * Math.PI * 2,
    thumb: rng() * Math.PI * 2,
  };
  const t0 = rng() * 1000; // small deterministic time offset so loops don't align to 0 oddly

  function fingerChain(
    mcp: { x: number; y: number },
    angleBase: number,
    curlFrac: number,
    wobble: [number, number, number],
    lens: [number, number, number],
  ): [HandLandmark, HandLandmark, HandLandmark] {
    let pos = { x: mcp.x, y: mcp.y };
    let ang = angleBase;
    const out: HandLandmark[] = [];
    for (let seg = 0; seg < 3; seg++) {
      const bend = curlFrac * (0.5 + seg * 0.28) + wobble[seg];
      ang += bend;
      pos = {
        x: pos.x + Math.cos(ang) * lens[seg],
        y: pos.y + Math.sin(ang) * lens[seg],
      };
      out.push({ x: pos.x, y: pos.y, z: 0 });
    }
    return out as [HandLandmark, HandLandmark, HandLandmark];
  }

  function sample(nowMs: number): HandLandmark[] | null {
    const t = ((nowMs + t0) % PERIOD_MS + PERIOD_MS) % PERIOD_MS;
    if (t >= ABSENT_FROM && t < ABSENT_TO) return null;

    const coh = coherentEnvelope(t);
    const rough = 1 - coh;
    const tt = nowMs + t0;

    // hand center drifts gently; height sweeps continuously (never quantized)
    const cx = 0.5 + 0.05 * n1(tt, phases.hand, 0.00037);
    const heightWave = 0.5 + 0.32 * Math.sin((tt / PERIOD_MS) * Math.PI * 2 * 1.4 + phases.hand);
    const cy = 1 - heightWave + 0.015 * n1(tt, phases.wrist, 0.006) * rough;
    const s = 0.15;

    const wristJitter = rough * 0.018;
    const wrist: HandLandmark = {
      x: cx + n1(tt, phases.wrist, 0.01) * wristJitter,
      y: cy + n1(tt, phases.wrist + 1, 0.011) * wristJitter,
      z: 0,
    };

    // hand orientation (drives tilt → pan continuously, independent of coherence)
    const theta = -Math.PI / 2 + 0.35 * Math.sin(tt * 0.00018 + phases.tilt);
    const perp = theta + Math.PI / 2;
    const dirT = { x: Math.cos(theta), y: Math.sin(theta) };
    const dirP = { x: Math.cos(perp), y: Math.sin(perp) };

    const palmLen = s * 1.0;
    const knuckleSpacing = s * 0.55;
    const mcps = [0, 1, 2, 3].map((j) => ({
      x: wrist.x + dirT.x * palmLen + dirP.x * (j - 1.5) * knuckleSpacing,
      y: wrist.y + dirT.y * palmLen + dirP.y * (j - 1.5) * knuckleSpacing,
    }));

    const fanCoherent = [-0.42, -0.14, 0.14, 0.42];
    const fingerLenScale = [1.0, 1.05, 0.95, 0.8];

    const fingerPts: HandLandmark[][] = [];
    for (let j = 0; j < 4; j++) {
      const fanSloppy = fanCoherent[j] + n1(tt, phases.fan[j], 0.0031) * 0.55;
      const fanOffset = fanCoherent[j] + rough * (fanSloppy - fanCoherent[j]);
      const angleBase = theta + fanOffset;

      const curlFrac = rough * (0.32 + 0.5 * n01(tt, phases.curl[j], 0.0026));
      const wobble: [number, number, number] = [
        rough * 0.22 * n1(tt, phases.wob[j][0], 0.02),
        rough * 0.22 * n1(tt, phases.wob[j][1], 0.021),
        rough * 0.22 * n1(tt, phases.wob[j][2], 0.022),
      ];
      const lenScale = fingerLenScale[j] * s;
      const lens: [number, number, number] = [
        0.3 * lenScale,
        0.2 * lenScale,
        0.16 * lenScale,
      ];
      fingerPts.push(fingerChain(mcps[j], angleBase, curlFrac, wobble, lens));
    }

    // thumb: swings independently to also demonstrate the pinch control
    const thumbSwing = -0.95 + 0.5 * Math.sin(tt * 0.0009 + phases.thumb * 2);
    const thumbAngle = theta + thumbSwing;
    const thumbCmc: HandLandmark = {
      x: wrist.x + dirT.x * s * 0.28 + dirP.x * -0.6 * s * 0.55,
      y: wrist.y + dirT.y * s * 0.28 + dirP.y * -0.6 * s * 0.55,
      z: 0,
    };
    const thumbChain = fingerChain(
      thumbCmc,
      thumbAngle,
      rough * 0.15,
      [rough * 0.1 * n1(tt, phases.thumb, 0.02), 0, 0],
      [0.22 * s, 0.16 * s, 0.14 * s],
    );

    const out: HandLandmark[] = new Array(21);
    out[0] = wrist;
    out[1] = thumbCmc;
    out[2] = thumbChain[0];
    out[3] = thumbChain[1];
    out[4] = thumbChain[2];
    for (let j = 0; j < 4; j++) {
      const base = 5 + j * 4;
      out[base] = { x: mcps[j].x, y: mcps[j].y, z: 0 };
      out[base + 1] = fingerPts[j][0];
      out[base + 2] = fingerPts[j][1];
      out[base + 3] = fingerPts[j][2];
    }
    return out;
  }

  return { sample };
}
