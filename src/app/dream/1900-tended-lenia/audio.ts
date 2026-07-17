// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the herbarium's sonification. The tended ecology IS the score.
//
//   JUST INTONATION (no pentatonic). Genome s maps to a ratio in a small 7-limit
//   set; the DOMINANT species sets the drone TONIC, and every other living
//   species sounds its own JI ratio AGAINST that tonic — so co-existing
//   populations produce real consonance and beating, and mixed zones (e.g. a 7/4
//   voice over a 5/4 voice) genuinely BITE. Because the tonic follows whichever
//   genome dominates, DIFFERENT TENDING → DIFFERENT DOMINANT → a different key
//   and a different piece.
//
//   Voices: one continuous pad per species band + a low tonic drone.
//     • population mass       → that voice's amplitude / presence
//     • center-of-mass x      → stereo pan
//     • center-of-mass y      → gentle octave-register drift
//     • a species blooming    → bright bell
//     • a takeover (new dom.) → mid chime (the key shifts)
//     • a species dying       → low soft pluck
//   MSPD-lite COMPLEXITY → master brightness (filter cutoff) + event density, so
//   you literally HEAR a colony becoming interesting.
//
//   Chain: voices → DynamicsCompressor (limiter) → master gain (≤0.18) → out.
//   Silent until the Start gesture; deterministic jitter (mulberry32 ^ 0x1900).
// ─────────────────────────────────────────────────────────────────────────────

import { SPECIES_COUNT, SPECIES_S, type FieldStats } from "./sim";

const MASTER = 0.18;
const ROOT_HZ = 98.0; // G2 — the low anchor the tonic ratio multiplies

// 7-limit just-intonation ratios (NOT pentatonic).
const JI = [1 / 1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 7 / 4, 15 / 8];

// map a genome s∈[0,1] to a JI ratio index.
function jiIndex(s: number) {
  return Math.max(0, Math.min(JI.length - 1, Math.round(s * (JI.length - 1))));
}

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filt: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  ratio: number; // this species' fixed JI ratio vs the tonic
  reg: number; // base octave register multiplier
}

export interface AudioEngine {
  start(): Promise<void>;
  update(stats: FieldStats, dt: number): void;
  setMuted(m: boolean): void;
  resume(): Promise<void>;
  running(): boolean;
  dispose(): void;
}

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let comp: DynamicsCompressorNode | null = null;
  let droneOscA: OscillatorNode | null = null;
  let droneOscB: OscillatorNode | null = null;
  let droneGain: GainNode | null = null;
  let droneFilt: BiquadFilterNode | null = null;
  const voices: Voice[] = [];

  let started = false;
  let muted = false;

  const smooth = new Array(SPECIES_COUNT).fill(0);
  const prevSmooth = new Array(SPECIES_COUNT).fill(0);
  const cooldown = new Array(SPECIES_COUNT).fill(0);
  let prevDominant = -1;
  let domCooldown = 0;
  let tonicRatio = 1;

  // per-species register (low→high) and timbre. Distinct waveforms per band.
  const REG = [
    { mult: 0.5, type: "sine" as OscillatorType, cutoff: 700, detune: 4 },
    { mult: 1.0, type: "triangle" as OscillatorType, cutoff: 1100, detune: 6 },
    { mult: 1.0, type: "triangle" as OscillatorType, cutoff: 1500, detune: 7 },
    { mult: 2.0, type: "sine" as OscillatorType, cutoff: 2400, detune: 5 },
    { mult: 2.0, type: "sine" as OscillatorType, cutoff: 3200, detune: 4 },
  ];

  async function start() {
    if (started) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume();

    master = ctx.createGain();
    master.gain.value = 0;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.3;
    comp.connect(master);
    master.connect(ctx.destination);

    const now = ctx.currentTime;

    // tonic drone — two slightly detuned oscillators, always present, low.
    droneOscA = ctx.createOscillator();
    droneOscB = ctx.createOscillator();
    droneOscA.type = "sine";
    droneOscB.type = "triangle";
    droneOscB.detune.value = 3;
    droneFilt = ctx.createBiquadFilter();
    droneFilt.type = "lowpass";
    droneFilt.frequency.value = 500;
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneOscA.frequency.value = ROOT_HZ;
    droneOscB.frequency.value = ROOT_HZ;
    droneOscA.connect(droneFilt);
    droneOscB.connect(droneFilt);
    droneFilt.connect(droneGain);
    droneGain.connect(comp);
    droneOscA.start(now);
    droneOscB.start(now);

    for (let i = 0; i < SPECIES_COUNT; i++) {
      const r = REG[i];
      const ratio = JI[jiIndex(SPECIES_S[i])];
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = r.type;
      oscB.type = r.type;
      oscB.detune.value = r.detune;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = r.cutoff;
      filt.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const pan = ctx.createStereoPanner();
      const f = ROOT_HZ * ratio * r.mult;
      oscA.frequency.value = f;
      oscB.frequency.value = f;
      oscA.connect(filt);
      oscB.connect(filt);
      filt.connect(gain);
      gain.connect(pan);
      pan.connect(comp);
      oscA.start(now);
      oscB.start(now);
      voices.push({ oscA, oscB, filt, gain, pan, ratio, reg: r.mult });
    }

    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER, now + 2.0);
    started = true;
  }

  // a bell / pluck: two sine partials with a fast-decay envelope.
  function ping(freq: number, amp: number, decay: number, pan: number, bright: number) {
    if (!ctx || !comp) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(comp);
    const partials = [
      { m: 1, a: 1 },
      { m: 2.01, a: 0.35 * bright },
      { m: 3.02, a: 0.16 * bright },
    ];
    for (const part of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * part.m;
      const og = ctx.createGain();
      og.gain.value = part.a;
      osc.connect(og);
      og.connect(g);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }
  }

  function update(stats: FieldStats, dt: number) {
    if (!ctx || !started || voices.length === 0) return;
    const now = ctx.currentTime;
    const tc = 0.4;
    const cx = Math.max(0, Math.min(1, dt * 3));
    const complexity = stats.complexity;

    // find the dominant species and its JI ratio → sets the drone tonic.
    let domMass = -1;
    let dominant = 0;
    for (let i = 0; i < SPECIES_COUNT; i++) {
      prevSmooth[i] = smooth[i];
      const sp = stats.species[i] ?? { mass: 0, cx: 0.5, cy: 0.5 };
      smooth[i] += (sp.mass - smooth[i]) * cx;
      if (smooth[i] > domMass) {
        domMass = smooth[i];
        dominant = i;
      }
    }
    // total living presence — near zero when the garden has flatlined.
    let alive = 0;
    for (let i = 0; i < SPECIES_COUNT; i++) alive += smooth[i];

    const targetTonic = JI[jiIndex(SPECIES_S[dominant])];
    tonicRatio += (targetTonic - tonicRatio) * 0.05;
    const tonicHz = ROOT_HZ * tonicRatio;

    // drone: present only while something lives; brightens with complexity.
    if (droneGain && droneOscA && droneOscB && droneFilt) {
      const dg = Math.min(0.32, Math.pow(Math.min(1, alive * 1.6), 0.7) * 0.34);
      droneGain.gain.setTargetAtTime(dg, now, tc);
      droneOscA.frequency.setTargetAtTime(tonicHz * 0.5, now, 0.5);
      droneOscB.frequency.setTargetAtTime(tonicHz * 0.5, now, 0.5);
      droneFilt.frequency.setTargetAtTime(360 + complexity * 900, now, 0.5);
    }

    for (let i = 0; i < SPECIES_COUNT; i++) {
      const v = voices[i];
      const sp = stats.species[i] ?? { mass: 0, cx: 0.5, cy: 0.5 };
      const pres = smooth[i];
      // amplitude from mass (compressed, capped)
      const target = Math.min(0.42, Math.pow(pres, 0.7) * 0.8);
      v.gain.gain.setTargetAtTime(target, now, tc);

      // pitch: THIS species' JI ratio against the current tonic, with a gentle
      // octave drift from center-of-mass y.
      const octDrift = Math.pow(2, Math.round((sp.cy - 0.5) * 2) / 1); // -1/0/+1 oct
      const f = tonicHz * v.ratio * v.reg * (octDrift || 1);
      v.oscA.frequency.setTargetAtTime(f, now, 0.5);
      v.oscB.frequency.setTargetAtTime(f, now, 0.5);

      // pan from center-of-mass x
      v.pan.pan.setTargetAtTime(sp.cx * 1.6 - 0.8, now, 0.5);

      // brightness rises with mass AND global complexity (hear structure)
      const cutoff = REG[i].cutoff * (0.55 + pres * 1.8 + complexity * 1.4);
      v.filt.frequency.setTargetAtTime(Math.min(9000, cutoff), now, 0.5);
    }

    // ── discrete events (density scaled up a touch by complexity) ──
    const bloomThresh = 0.16 - complexity * 0.05;
    for (let i = 0; i < SPECIES_COUNT; i++) {
      const rising = smooth[i] - prevSmooth[i];
      const sp = stats.species[i] ?? { mass: 0, cx: 0.5, cy: 0.5 };
      const pan = sp.cx * 1.6 - 0.8;
      if (now < cooldown[i]) continue;
      const vf = tonicRatio * JI[jiIndex(SPECIES_S[i])] * ROOT_HZ;
      if (rising > 0.01 && smooth[i] > bloomThresh) {
        // bloom → bright bell an octave up
        ping(vf * 2, 0.085, 1.5, pan, 1.0);
        cooldown[i] = now + 0.6 - complexity * 0.2;
      } else if (rising < -0.013 && prevSmooth[i] > 0.07 && smooth[i] < 0.04) {
        // dying → low soft pluck
        ping(vf * 0.5, 0.06, 2.4, pan, 0.3);
        cooldown[i] = now + 1.2;
      }
    }

    // takeover → the key shifts; ring a small JI chord on the new tonic.
    if (dominant !== prevDominant && prevDominant >= 0 && now > domCooldown && domMass > 0.16) {
      const base = ROOT_HZ * targetTonic;
      ping(base, 0.08, 1.8, 0, 1.0);
      ping(base * (5 / 4), 0.055, 1.8, -0.3, 1.0);
      ping(base * (3 / 2), 0.05, 1.8, 0.3, 1.0);
      domCooldown = now + 2.2;
    }
    prevDominant = dominant;
  }

  function setMuted(m: boolean) {
    muted = m;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.2);
    }
  }

  async function resume() {
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  function running() {
    return started && !!ctx && ctx.state === "running";
  }

  function dispose() {
    started = false;
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = null;
    comp = null;
    droneOscA = droneOscB = null;
    droneGain = null;
    droneFilt = null;
    voices.length = 0;
  }

  return { start, update, setMuted, resume, running, dispose };
}
