// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sonification: the ecology's state IS the score.
//
//   Three species, three voices — one per genome band. Each voice is a
//   continuous pad in its own register with its own timbre, pitch-quantized to a
//   shared D major-pentatonic scale so the aggregate is always HARMONY:
//
//     species 0 (genome ~0.16)  low   warm triangle pad
//     species 1 (genome ~0.50)  mid   soft sawtooth pad   (violet — the accent)
//     species 2 (genome ~0.84)  high  airy sine pad
//
//   Continuous mappings (the slow morph over minutes):
//     • population mass  → that voice's amplitude / presence
//     • center of mass x → stereo pan; center of mass y → gentle pitch drift
//     • field motion     → a breath of filtered-noise shimmer
//
//   Discrete EVENTS (so the ear hears the ecology CHANGE, not a static pad):
//     • a species blooming (mass rising past a threshold)   → bright bell
//     • the dominant species changing (a collision/takeover) → mid chime
//     • a species going near-extinct                         → low soft pluck
//
//   Chain: every voice → master DynamicsCompressor → master gain (≤0.18) →
//   destination, with a 2 s fade-in on start and a clean teardown. All jitter is
//   deterministic (mulberry32 seeded 0x1836) — no bare Math.random / Date.now.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, type FieldStats } from "./sim";

const MASTER = 0.18;

// D major pentatonic (semitone offsets from the root) across octaves.
const PENT = [0, 2, 4, 7, 9];
const ROOT_MIDI = 38; // D2

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// nearest pentatonic MIDI note at-or-below a target index within a register.
function pentMidi(baseMidi: number, step: number) {
  const oct = Math.floor(step / PENT.length);
  const deg = ((step % PENT.length) + PENT.length) % PENT.length;
  return baseMidi + oct * 12 + PENT[deg];
}

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filt: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  baseMidi: number;
  register: number; // scale steps available in this voice's register
  curGain: number;
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
  let noiseGain: GainNode | null = null;
  const voices: Voice[] = [];
  const rng = mulberry32(0x1836 ^ 0x5eed);

  let started = false;
  let muted = false;

  // per-species event state
  const smooth = [0, 0, 0];
  const prevSmooth = [0, 0, 0];
  let prevDominant = -1;
  const cooldown = [0, 0, 0]; // per-species pluck cooldown (audio time)
  let domCooldown = 0;

  // voice registers: low / mid / high; distinct waveforms for distinct timbre.
  const REG = [
    { base: ROOT_MIDI, steps: 6, type: "triangle" as OscillatorType, cutoff: 900, detune: 6 },
    { base: ROOT_MIDI + 12, steps: 7, type: "sawtooth" as OscillatorType, cutoff: 1500, detune: 9 },
    { base: ROOT_MIDI + 24, steps: 8, type: "sine" as OscillatorType, cutoff: 3200, detune: 4 },
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
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;
    comp.connect(master);
    master.connect(ctx.destination);

    const now = ctx.currentTime;

    for (let i = 0; i < REG.length; i++) {
      const r = REG[i];
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
      const baseMidi = pentMidi(r.base, 0);
      oscA.frequency.value = midiToFreq(baseMidi);
      oscB.frequency.value = midiToFreq(baseMidi);
      oscA.connect(filt);
      oscB.connect(filt);
      filt.connect(gain);
      gain.connect(pan);
      pan.connect(comp);
      oscA.start(now);
      oscB.start(now);
      voices.push({ oscA, oscB, filt, gain, pan, baseMidi: r.base, register: r.steps, curGain: 0 });
    }

    // shimmer bed — a little filtered noise whose level follows field motion.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (rng() * 2 - 1) * 0.6;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const nfilt = ctx.createBiquadFilter();
    nfilt.type = "bandpass";
    nfilt.frequency.value = 2600;
    nfilt.Q.value = 0.7;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0001;
    noise.connect(nfilt);
    nfilt.connect(noiseGain);
    noiseGain.connect(comp);
    noise.start(now);

    // 2 s fade-in
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER, now + 2.0);

    started = true;
  }

  // a bell / pluck event: 2 sine partials with a fast-decay envelope.
  function ping(midi: number, amp: number, decay: number, pan: number, bright: number) {
    if (!ctx || !comp) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(comp);
    const f = midiToFreq(midi);
    const partials = [
      { m: 1, a: 1 },
      { m: 2.01, a: 0.4 * bright },
    ];
    for (const part of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * part.m;
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
    const tc = 0.35; // smoothing time-constant for pads

    // total mass normalizer so presence is relative to the whole ecology.
    let domMass = -1;
    let dominant = 0;

    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const sp = stats.species[i] ?? { mass: 0, cx: 0.5, cy: 0.5 };
      // smoothed presence
      prevSmooth[i] = smooth[i];
      smooth[i] += (sp.mass - smooth[i]) * Math.min(1, dt * 3);
      const pres = smooth[i];
      if (pres > domMass) {
        domMass = pres;
        dominant = i;
      }

      // amplitude from mass (compressed curve, capped)
      const target = Math.min(0.5, Math.pow(pres, 0.7) * 0.9);
      v.gain.gain.setTargetAtTime(target, now, tc);
      v.curGain = target;

      // pitch drift from center-of-mass y, quantized to the register's scale
      const step = Math.round(Math.max(0, Math.min(v.register, sp.cy * v.register)));
      const midi = pentMidi(v.baseMidi, step);
      const f = midiToFreq(midi);
      v.oscA.frequency.setTargetAtTime(f, now, 0.4);
      v.oscB.frequency.setTargetAtTime(f, now, 0.4);

      // pan from center-of-mass x
      v.pan.pan.setTargetAtTime(sp.cx * 1.6 - 0.8, now, 0.5);

      // filter opens a touch with more mass (brighter when a species thrives)
      v.filt.frequency.setTargetAtTime(REG[i].cutoff * (0.7 + pres * 2.2), now, 0.5);
    }

    // motion → shimmer bed
    if (noiseGain) {
      const sh = Math.min(0.05, stats.motion * 1.4);
      noiseGain.gain.setTargetAtTime(sh, now, 0.4);
    }

    // ── discrete events ──
    for (let i = 0; i < voices.length; i++) {
      const rising = smooth[i] - prevSmooth[i];
      const sp = stats.species[i] ?? { mass: 0, cx: 0.5, cy: 0.5 };
      const pan = sp.cx * 1.6 - 0.8;
      if (now < cooldown[i]) continue;
      // bloom — a species surging
      if (rising > 0.012 && smooth[i] > 0.18) {
        const step = 2 + Math.floor(rng() * (voices[i].register - 2));
        ping(pentMidi(voices[i].baseMidi + 12, step), 0.09, 1.6, pan, 1.0);
        cooldown[i] = now + 0.7;
      } else if (rising < -0.014 && prevSmooth[i] > 0.08 && smooth[i] < 0.05) {
        // near-extinction — a low soft toll
        ping(pentMidi(voices[i].baseMidi - 12, 0), 0.06, 2.4, pan, 0.3);
        cooldown[i] = now + 1.2;
      }
    }

    // dominance change — a collision / takeover chime (a small chord)
    if (dominant !== prevDominant && prevDominant >= 0 && now > domCooldown && domMass > 0.2) {
      const base = voices[dominant].baseMidi + 12;
      ping(pentMidi(base, 0), 0.08, 1.8, 0, 1.0);
      ping(pentMidi(base, 2), 0.06, 1.8, -0.3, 1.0);
      ping(pentMidi(base, 4), 0.05, 1.8, 0.3, 1.0);
      domCooldown = now + 2.5;
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
    noiseGain = null;
    voices.length = 0;
  }

  return { start, update, setMuted, resume, running, dispose };
}
