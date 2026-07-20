// Generative spectral engine for "Slow Radiance" — the DRIVER of the piece.
//
// Audio leads, visual follows: an autonomous harmonic sequencer evolves a
// drifting cluster of sustained spectral voices over minutes. Each voice
// exports a normalized position + warm colour so the diffusion field can
// render the exact chord you are hearing.
//
// Harmonic model: BOHLEN–PIERCE. The tritave (3:1) is split into 13 equal
// steps, so a pitch is BASE * 3^(k/13). This is a genuinely non-octave lattice
// — it deliberately avoids the banned just-intonation partial stack, 12-TET
// major/pentatonic scales, and the inharmonic bell ratios. Consonance in BP
// clusters around the 3:5:7 chord (steps 0,6,10); the engine slowly migrates
// the root and swaps between consonant and clustered voicings so harmony melts
// and re-forms over the full run.

import type { VoiceSource } from "./diffusion";

const BP_BASE = 55; // Hz — low anchor of the tritave lattice
const BP_STEPS = 13;
const TWO_PI = Math.PI * 2;

const PORT = 5.5; // pitch/position portamento time-constant (s) — always gliding
const AMP_TC = 4.0; // amplitude fade time-constant (s)

// BP "major" triad ≈ 3:5:7, and a clustered voicing that melts consonance.
const CHORD_CONSONANT = [0, 6, 10];
const CHORD_CLUSTER = [0, 4, 7];

// Warm bone / gold / amber palette + a single teal counter-accent (voice 5).
// Deliberately NOT violet (violet is reserved for UI chrome only).
const ROLE_COLOR: [number, number, number][] = [
  [1.0, 0.46, 0.14], // amber (bass)
  [1.0, 0.6, 0.2], // deep gold (bass)
  [1.0, 0.78, 0.34], // gold (mid)
  [0.98, 0.86, 0.6], // warm bone (mid)
  [1.0, 0.92, 0.78], // bone-white (high)
  [0.26, 0.82, 0.78], // teal counter-accent (high)
];

const VOICE_REGISTER = [0, 0, 1, 1, 2, 2]; // which tritave each voice sits in
const NUM_VOICES = 6;

function bpFreq(degree: number): number {
  return BP_BASE * Math.pow(3, degree / BP_STEPS);
}

// Map a BP degree + role to a field position. Pitch-class → angle around the
// nebula; register → radius from centre (per the brief).
function posFromDegree(degree: number, role: number): { x: number; y: number } {
  const pc = ((degree % BP_STEPS) + BP_STEPS) % BP_STEPS;
  const reg = Math.floor(degree / BP_STEPS);
  const theta = (pc / BP_STEPS) * TWO_PI + role * 0.16;
  const radius = 0.15 + reg * 0.11;
  return { x: 0.5 + radius * Math.cos(theta), y: 0.5 + radius * Math.sin(theta) };
}

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  vGain: GainNode;
  role: number;
  register: number;
  targetDeg: number;
  targetAmp: number;
  env: number; // JS-side amplitude mirror for visuals
  x: number;
  y: number;
  tx: number;
  ty: number;
  wander: number; // phase offset for gentle spatial drift
  toggleIn: number; // seconds until this voice re-voices / fades
}

export interface SpectralEngine {
  step(dt: number, tSec: number): void;
  getVoices(): VoiceSource[];
  stop(): void;
}

export function startSpectralEngine(ctx: AudioContext): SpectralEngine {
  const now0 = ctx.currentTime;

  // ── Master chain: voices → lowpass → master(breath) → compressor → out ────
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.05;
  compressor.release.value = 0.5;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.14;
  master.connect(compressor);

  // Slow "breath" LFO on master level (~16 s inhale/exhale).
  const breathLfo = ctx.createOscillator();
  breathLfo.frequency.value = 1 / 16;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 0.035;
  breathLfo.connect(breathDepth);
  breathDepth.connect(master.gain);
  breathLfo.start();

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1150;
  lowpass.Q.value = 0.4;
  lowpass.connect(master);

  const voices: Voice[] = [];
  for (let i = 0; i < NUM_VOICES; i++) {
    const register = VOICE_REGISTER[i];
    const deg = CHORD_CONSONANT[i % CHORD_CONSONANT.length] + register * BP_STEPS;
    const freq = bpFreq(deg);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;

    // Second partial slightly stretched + detuned → a soft beating spectrum.
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.011;
    osc2.detune.value = (i % 2 === 0 ? 1 : -1) * (4 + i);

    const vGain = ctx.createGain();
    vGain.gain.value = 0.0001;
    osc1.connect(vGain);
    osc2.connect(vGain);
    vGain.connect(lowpass);
    osc1.start();
    osc2.start();

    const p = posFromDegree(deg, i);
    const v: Voice = {
      osc1,
      osc2,
      vGain,
      role: i,
      register,
      targetDeg: deg,
      targetAmp: 0.16 + (register === 0 ? 0.06 : 0),
      env: 0.0001,
      x: p.x,
      y: p.y,
      tx: p.x,
      ty: p.y,
      wander: Math.random() * TWO_PI,
      toggleIn: 8 + Math.random() * 16,
    };
    // Fade the voice in gently.
    vGain.gain.setTargetAtTime(v.targetAmp, now0, AMP_TC);
    voices.push(v);
  }

  let chordRoot = 0; // migrating global transpose (in BP steps)
  let useCluster = false;
  let reharmIn = 12; // seconds until next reharmonisation
  let lpDriftIn = 9;
  let lastT = 0;

  function setVoiceDegree(v: Voice, deg: number): void {
    const t = ctx.currentTime;
    v.targetDeg = deg;
    const f = bpFreq(deg);
    v.osc1.frequency.setTargetAtTime(f, t, PORT);
    v.osc2.frequency.setTargetAtTime(f * 2.011, t, PORT);
    const p = posFromDegree(deg, v.role);
    v.tx = p.x;
    v.ty = p.y;
  }

  function setVoiceAmp(v: Voice, amp: number): void {
    v.targetAmp = amp;
    v.vGain.gain.setTargetAtTime(Math.max(0.0001, amp), ctx.currentTime, AMP_TC);
  }

  function reharmonize(): void {
    // Migrate the root by a small non-octave step so minute 6 ≠ minute 1.
    chordRoot += (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
    // Keep the lattice from wandering out of a pleasant range.
    if (chordRoot > 5) chordRoot -= 4;
    if (chordRoot < -5) chordRoot += 4;
    // Occasionally melt consonance into a cluster, or re-form it.
    if (Math.random() < 0.5) useCluster = !useCluster;
    const chord = useCluster ? CHORD_CLUSTER : CHORD_CONSONANT;

    for (const v of voices) {
      const tone = chord[Math.floor(Math.random() * chord.length)];
      const deg = chordRoot + tone + v.register * BP_STEPS;
      setVoiceDegree(v, deg);
    }
  }

  function step(dt: number, tSec: number): void {
    lastT = tSec;

    reharmIn -= dt;
    if (reharmIn <= 0) {
      reharmonize();
      reharmIn = 16 + Math.random() * 12;
    }

    // Slow lowpass drift keeps the timbre alive over minutes.
    lpDriftIn -= dt;
    if (lpDriftIn <= 0) {
      const f = 820 + Math.random() * 900;
      lowpass.frequency.setTargetAtTime(f, ctx.currentTime, 6);
      lpDriftIn = 8 + Math.random() * 10;
    }

    const kAmp = 1 - Math.exp(-dt / AMP_TC);
    const kPos = 1 - Math.exp(-dt / PORT);

    for (const v of voices) {
      // Per-voice fade in/out lifecycle so the texture is never static.
      v.toggleIn -= dt;
      if (v.toggleIn <= 0) {
        if (v.targetAmp > 0.02) {
          setVoiceAmp(v, 0.0);
          v.toggleIn = 6 + Math.random() * 10; // stay silent a while
        } else {
          // Return at a fresh chord tone.
          const chord = useCluster ? CHORD_CLUSTER : CHORD_CONSONANT;
          const tone = chord[Math.floor(Math.random() * chord.length)];
          setVoiceDegree(v, chordRoot + tone + v.register * BP_STEPS);
          setVoiceAmp(v, 0.14 + (v.register === 0 ? 0.06 : 0.02));
          v.toggleIn = 18 + Math.random() * 22;
        }
      }

      // Ease JS mirrors of amplitude + position for the visual field.
      v.env += (v.targetAmp - v.env) * kAmp;
      v.x += (v.tx - v.x) * kPos;
      v.y += (v.ty - v.y) * kPos;
    }
  }

  function getVoices(): VoiceSource[] {
    const out: VoiceSource[] = [];
    for (const v of voices) {
      const g = Math.max(0, Math.min(1, v.env / 0.22));
      // Gentle spatial breathing so knots never sit perfectly still.
      const wx = 0.02 * Math.sin(lastT * 0.06 + v.wander);
      const wy = 0.02 * Math.cos(lastT * 0.05 + v.wander * 1.3);
      const [cr, cg, cb] = ROLE_COLOR[v.role];
      out.push({
        x: Math.max(0.03, Math.min(0.97, v.x + wx)),
        y: Math.max(0.03, Math.min(0.97, v.y + wy)),
        r: cr,
        g: cg,
        b: cb,
        gain: g,
      });
    }
    return out;
  }

  function stop(): void {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0.0001, t, 0.25);
    for (const v of voices) {
      try {
        v.osc1.stop(t + 0.8);
        v.osc2.stop(t + 0.8);
      } catch {
        /* already stopped */
      }
    }
    try {
      breathLfo.stop(t + 0.8);
    } catch {
      /* already stopped */
    }
  }

  return { step, getVoices, stop };
}
