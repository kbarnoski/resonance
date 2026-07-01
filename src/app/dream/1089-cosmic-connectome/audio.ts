// audio.ts — the cosmic-connectome instrument. Self-contained Web Audio.
//
// The CORE mapping (the never-done-in-lab part): each cosmic node's measured
// CONNECTIVITY (graph degree — how many distinct filaments radiate from it,
// Euclid Q1 2026's statistic) is turned into a just-intonation CHORD VOICING.
// A lonely node (degree 0–1) is a single root drone; a richly-connected
// super-cluster (degree 5+) rings a full luminous stack. So you literally HEAR
// how connected each node is; the web thickens into music as it accretes.
//
// Layers:
//   • Drone bed         — a soft JI sub, opened by the network's total energy.
//   • Per-node voices    — one polyphonic voice slot per alive node; the node's
//                          degree selects which JI partials sound and how loud,
//                          its x pans it L/R, its mass sets a base level.
//   • Coalescence bells  — a bright bell struck when two nodes merge.
//   • Awe swell          — as TOTAL connectivity peaks, a reverb-drenched high
//                          shimmer + brightness lift (cosmic-ambient → cosmic-awe).
//
// If the audio device is absent (headless review machine) createAudio() throws
// or resume() rejects; the caller catches it and the sim runs silently.

// Just-intonation partials above the root (pure ratios). Index by "how many
// filaments" — richer connectivity unlocks more of the stack.
const ROOT = 55; // A1
// degree → which of these ratios are voiced (cumulative).
// 0–1: [1]                 root drone only
// 2:   [1, 3/2]            root + just fifth (3:2)
// 3:   [1, 3/2, 5/4*2]     add a just major third an octave up (pentatonic-ish)
// 4:   + 9/8 * 2           add a ninth
// 5+:  + 2, 15/8*2         full luminous stack (octave + major seventh shimmer)
const STACK = [
  1, // root
  3 / 2, // just fifth
  (5 / 4) * 2, // major third +1 oct
  (9 / 8) * 2, // ninth +1 oct
  2, // octave
  (15 / 8) * 2, // major seventh +1 oct
];

// How many partials a given (smoothed) degree unlocks.
function partialsForDegree(deg: number): number {
  if (deg < 1.5) return 1;
  if (deg < 2.5) return 2;
  if (deg < 3.5) return 3;
  if (deg < 4.5) return 4;
  if (deg < 5.5) return 5;
  return 6;
}

// A per-node voice: a bank of oscillators (one per STACK partial) gated by gain.
interface NodeVoice {
  id: number;
  oscs: OscillatorNode[];
  gains: GainNode[]; // per-partial gate
  bus: GainNode; // node master (mass level)
  pan: StereoPannerNode;
  freqBase: number; // slight per-node detune of the whole voice
}

export interface NodeSnapshot {
  id: number;
  x: number; // 0..1 → pan
  degree: number; // smoothed connectivity
  mass: number;
  alive: boolean;
}

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  resume(): Promise<void>;
  // Called each visual frame with the live node graph + a calm energy signal.
  update(nodes: NodeSnapshot[], energy: number, totalDegree: number, now: number): void;
  // Struck when two nodes merge into a super-cluster.
  coalesce(x: number, mass: number): void;
  close(): void;
}

export function createAudio(): AudioEngine {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 2.2);

  // ── Reverb (simple algorithmic void) for the awe shimmer ──────────────────
  const convolver = ctx.createConvolver();
  {
    const len = ctx.sampleRate * 3.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
    }
    convolver.buffer = ir;
  }
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.35;
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.0; // opens with awe
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(master);
  master.connect(ctx.destination);

  // Gentle master lowpass that opens with total energy (calm → awe brightness).
  const brightLP = ctx.createBiquadFilter();
  brightLP.type = "lowpass";
  brightLP.frequency.value = 500;
  brightLP.Q.value = 0.6;
  brightLP.connect(master);
  brightLP.connect(reverbSend);

  // ── Drone bed — JI sub, always present, opened by energy ──────────────────
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.28;
  droneBus.connect(brightLP);
  const droneRatios = [1, 3 / 2, 2];
  const droneOscs: OscillatorNode[] = [];
  for (const ratio of droneRatios) {
    for (const cents of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = ratio === 1 ? "sine" : "triangle";
      o.frequency.value = ROOT * ratio;
      o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = (0.5 / ratio) * 0.5;
      o.connect(g);
      g.connect(droneBus);
      o.start();
      droneOscs.push(o);
    }
  }

  // ── Per-node voice pool (allocated lazily, reused by node id) ─────────────
  const voices = new Map<number, NodeVoice>();

  const makeVoice = (id: number): NodeVoice => {
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    bus.connect(pan);
    pan.connect(brightLP);
    // small per-node detune so a big graph shimmers rather than beats harshly
    const freqBase = ROOT * (1 + (Math.sin(id * 12.9898) * 0.5) * 0.01);
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (let p = 0; p < STACK.length; p++) {
      const o = ctx.createOscillator();
      o.type = p === 0 ? "sine" : "triangle";
      o.frequency.value = freqBase * STACK[p];
      o.detune.value = (p % 2 === 0 ? -3 : 3);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(bus);
      o.start();
      oscs.push(o);
      gains.push(g);
    }
    return { id, oscs, gains, bus, pan, freqBase };
  };

  const releaseVoice = (v: NodeVoice) => {
    const t = ctx.currentTime;
    v.bus.gain.cancelScheduledValues(t);
    v.bus.gain.setTargetAtTime(0.0001, t, 0.4);
    const killAt = t + 1.2;
    for (const o of v.oscs) {
      try { o.stop(killAt); } catch { /* already stopped */ }
    }
  };

  return {
    ctx,
    master,
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },
    update(nodes, energy, totalDegree, now) {
      const t = ctx.currentTime;
      // Brightness / awe: total connectivity across the whole web drives the
      // master lowpass + reverb return. Calm bed at low totals, awe at peak.
      const awe = Math.min(1, totalDegree / 22); // ~4 clusters at degree 5+
      const cutoff = 500 * Math.pow(4200 / 500, 0.35 * energy + 0.65 * awe);
      brightLP.frequency.setTargetAtTime(cutoff, t, 0.25);
      reverbReturn.gain.setTargetAtTime(0.05 + awe * 0.5, t, 0.4);
      droneBus.gain.setTargetAtTime(0.22 + energy * 0.14, t, 0.3);

      const aliveIds = new Set<number>();
      for (const n of nodes) {
        if (!n.alive) continue;
        aliveIds.add(n.id);
        let v = voices.get(n.id);
        if (!v) {
          v = makeVoice(n.id);
          voices.set(n.id, v);
        }
        // pan by x, node level by mass (sqrt so it doesn't dominate)
        v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (n.x - 0.5) * 1.8)), t, 0.3);
        const level = Math.min(0.5, 0.06 + Math.sqrt(n.mass) * 0.05);
        v.bus.gain.setTargetAtTime(level, t, 0.35);
        // degree → how many partials sound
        const active = partialsForDegree(n.degree);
        for (let p = 0; p < v.gains.length; p++) {
          const target = p < active ? 0.5 / (p + 1) : 0.0001;
          v.gains[p].gain.setTargetAtTime(target, t, 0.4);
        }
        // very slow vibrato on the root so voices feel alive
        v.oscs[0].detune.setTargetAtTime(Math.sin(now * 0.3 + n.id) * 4, t, 0.5);
      }
      // Release voices whose node has merged / died.
      for (const [id, v] of voices) {
        if (!aliveIds.has(id)) {
          releaseVoice(v);
          voices.delete(id);
        }
      }
    },
    coalesce(x, mass) {
      // A bright bell when a super-cluster forms — the accretion event heard.
      const t = ctx.currentTime;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (x - 0.5) * 1.8));
      pan.connect(brightLP);
      pan.connect(reverbSend);
      const base = ROOT * 4 * (1 + Math.min(1, mass * 0.1) * 0.5);
      // three inharmonic-ish partials → bell timbre
      for (const [ratio, lvl] of [[1, 0.16], [2.01, 0.09], [3.0, 0.05]] as const) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(lvl, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        o.connect(g);
        g.connect(pan);
        o.start(t);
        o.stop(t + 2.5);
      }
    },
    close() {
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      } catch { /* closing */ }
      for (const o of droneOscs) {
        try { o.stop(t + 0.5); } catch { /* stopped */ }
      }
      for (const [, v] of voices) {
        for (const o of v.oscs) {
          try { o.stop(t + 0.5); } catch { /* stopped */ }
        }
      }
      voices.clear();
      setTimeout(() => {
        ctx.close().catch(() => { /* already closed */ });
      }, 600);
    },
  };
}
