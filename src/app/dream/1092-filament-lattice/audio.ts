// audio.ts — the Filament Lattice instrument. Self-contained Web Audio built on
// the shared psychedelic engine (_shared/psych: droneBank + convolutionVoid).
//
// This is cycle-3 of 1089. 1089 sonified HOW MANY filaments touch each node
// (degree -> chord). Here we ALSO hear the graph itself:
//
//   • DEGREE (kept)      each node's filament degree -> a just-intonation chord
//                        (root / +fifth / +third / +ninth / full stack).
//   • CLUSTERING (new)   local clustering coefficient -> chord DENSITY/brightness:
//                        a tightly-woven neighbourhood sounds full and bright, an
//                        isolated bridge node thin and lonely.
//   • EDGES (new)        each graph edge sings an INTERVAL DYAD between its two
//                        endpoints' pitches, and a bright FM "connection formed"
//                        chime rings once when a new edge appears.
//   • ACCRETION (kept)   a coalescence bell at each merge; total connectivity
//                        drives an awe swell (brightness + reverb + drone drive)
//                        so the piece climbs tonally over minutes.
//
// Each node carries a fixed JI scale-degree so edges between distinct nodes form
// real musical intervals. If the audio device is absent (headless review) the
// caller catches the failure and the sim runs silently.

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb } from "../_shared/psych/convolutionVoid";

const NODE_ROOT = 110; // A2 — node pitch register
// Just-intonation scale-degrees; a node's `tone` indexes this so edge dyads are
// real intervals (fifths, thirds, ninths…).
const SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2, 9 / 4];

export function nodeFreq(tone: number): number {
  const n = SCALE.length;
  const idx = ((tone % n) + n) % n;
  return NODE_ROOT * SCALE[idx];
}

// Chord stack voiced on a node's own pitch as its degree rises.
const STACK = [1, 3 / 2, 5 / 4, 2, 9 / 8, 15 / 8];
function partialsForDegree(deg: number): number {
  if (deg < 1.5) return 1;
  if (deg < 2.5) return 2;
  if (deg < 3.5) return 3;
  if (deg < 4.5) return 4;
  if (deg < 5.5) return 5;
  return 6;
}

interface NodeVoice {
  oscs: OscillatorNode[];
  gains: GainNode[];
  bus: GainNode;
  pan: StereoPannerNode;
  freq: number;
}

interface EdgeVoice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gA: GainNode;
  gB: GainNode;
  bus: GainNode;
  pan: StereoPannerNode;
}

export interface NodeSnapshot {
  id: number;
  x: number;
  tone: number;
  degree: number;
  clustering: number;
  mass: number;
}

export interface EdgeSnapshot {
  key: string;
  aTone: number;
  bTone: number;
  x: number; // midpoint x for pan
  strength: number; // coverage 0..1
}

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  resume(): Promise<void>;
  update(
    nodes: NodeSnapshot[],
    edges: EdgeSnapshot[],
    energy: number,
    totalDegree: number,
    peakClustering: number,
    now: number,
  ): void;
  edgeChime(x: number, aTone: number, bTone: number): void;
  coalesce(x: number, mass: number): void;
  close(): void;
}

export function createAudio(): AudioEngine {
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 2.2);
  master.connect(ctx.destination);

  // Shared void reverb — the awe shimmer opens its wet as connectivity peaks.
  const reverb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.6, wet: 0.12 });
  reverb.output.connect(master);

  // Master brightness lowpass that opens with total connectivity (calm -> awe).
  const brightLP = ctx.createBiquadFilter();
  brightLP.type = "lowpass";
  brightLP.frequency.value = 520;
  brightLP.Q.value = 0.7;
  brightLP.connect(master);
  brightLP.connect(reverb.input);

  // Shared JI drone bed, driven by the awe signal.
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 55,
    ratios: [1, 3 / 2, 2],
    cutoffLow: 240,
    cutoffHigh: 2600,
    peakGain: 0.26,
  });

  const nodeVoices = new Map<number, NodeVoice>();
  const edgeVoices = new Map<string, EdgeVoice>();

  const makeNodeVoice = (freq: number): NodeVoice => {
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    bus.connect(pan);
    pan.connect(brightLP);
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (let p = 0; p < STACK.length; p++) {
      const o = ctx.createOscillator();
      o.type = p === 0 ? "sine" : "triangle";
      o.frequency.value = freq * STACK[p];
      o.detune.value = p % 2 === 0 ? -3 : 3;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(bus);
      o.start();
      oscs.push(o);
      gains.push(g);
    }
    return { oscs, gains, bus, pan, freq };
  };

  const releaseNodeVoice = (v: NodeVoice) => {
    const t = ctx.currentTime;
    v.bus.gain.cancelScheduledValues(t);
    v.bus.gain.setTargetAtTime(0.0001, t, 0.4);
    for (const o of v.oscs) {
      try {
        o.stop(t + 1.2);
      } catch {
        /* stopped */
      }
    }
  };

  const makeEdgeVoice = (aFreq: number, bFreq: number, x: number): EdgeVoice => {
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (x - 0.5) * 1.8));
    bus.connect(pan);
    pan.connect(brightLP);
    const mk = (f: number) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(bus);
      o.start();
      return { o, g };
    };
    const a = mk(aFreq);
    const b = mk(bFreq);
    return { oscA: a.o, oscB: b.o, gA: a.g, gB: b.g, bus, pan };
  };

  const releaseEdgeVoice = (v: EdgeVoice) => {
    const t = ctx.currentTime;
    v.bus.gain.cancelScheduledValues(t);
    v.bus.gain.setTargetAtTime(0.0001, t, 0.35);
    for (const o of [v.oscA, v.oscB]) {
      try {
        o.stop(t + 0.9);
      } catch {
        /* stopped */
      }
    }
  };

  return {
    ctx,
    master,
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },

    update(nodes, edges, energy, totalDegree, peakClustering, now) {
      const t = ctx.currentTime;
      const awe = Math.min(1, totalDegree / 24);
      const cutoff = 520 * Math.pow(4400 / 520, 0.3 * energy + 0.55 * awe + 0.15 * peakClustering);
      brightLP.frequency.setTargetAtTime(cutoff, t, 0.25);
      reverb.setWet(0.1 + awe * 0.5);
      drone.setDrive(0.25 + 0.55 * awe + 0.2 * energy);

      // ── node chord voices: degree -> partials, clustering -> density ───────
      const aliveIds = new Set<number>();
      for (const n of nodes) {
        aliveIds.add(n.id);
        let v = nodeVoices.get(n.id);
        if (!v) {
          v = makeNodeVoice(nodeFreq(n.tone));
          nodeVoices.set(n.id, v);
        }
        v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (n.x - 0.5) * 1.8)), t, 0.3);
        const level = Math.min(0.42, 0.05 + Math.sqrt(n.mass) * 0.045);
        v.bus.gain.setTargetAtTime(level, t, 0.35);
        const active = partialsForDegree(n.degree);
        // clustering thins/thickens the upper partials (lonely bridge -> thin).
        const density = 0.35 + 0.65 * n.clustering;
        for (let p = 0; p < v.gains.length; p++) {
          let target = 0.0001;
          if (p < active) {
            const base = 0.5 / (p + 1);
            target = p === 0 ? base : base * density;
          }
          v.gains[p].gain.setTargetAtTime(target, t, 0.4);
        }
        v.oscs[0].detune.setTargetAtTime(Math.sin(now * 0.3 + n.id) * 4, t, 0.5);
      }
      for (const [id, v] of nodeVoices) {
        if (!aliveIds.has(id)) {
          releaseNodeVoice(v);
          nodeVoices.delete(id);
        }
      }

      // ── edge dyads: a sustained interval between the two endpoints ─────────
      const aliveEdges = new Set<string>();
      for (const e of edges) {
        aliveEdges.add(e.key);
        let v = edgeVoices.get(e.key);
        if (!v) {
          v = makeEdgeVoice(nodeFreq(e.aTone), nodeFreq(e.bTone), e.x);
          edgeVoices.set(e.key, v);
        }
        v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (e.x - 0.5) * 1.8)), t, 0.3);
        const lvl = 0.03 + e.strength * 0.09;
        v.bus.gain.setTargetAtTime(lvl, t, 0.3);
        v.gA.gain.setTargetAtTime(0.5, t, 0.3);
        v.gB.gain.setTargetAtTime(0.5, t, 0.3);
      }
      for (const [key, v] of edgeVoices) {
        if (!aliveEdges.has(key)) {
          releaseEdgeVoice(v);
          edgeVoices.delete(key);
        }
      }
    },

    edgeChime(x, aTone, bTone) {
      // Bright FM bell when a new edge forms.
      const t = ctx.currentTime;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (x - 0.5) * 1.8));
      pan.connect(brightLP);
      pan.connect(reverb.input);

      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      const carFreq = nodeFreq(bTone) * 2;
      carrier.frequency.value = carFreq;
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = nodeFreq(aTone) * 2 * 1.41; // inharmonic ratio -> bell
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(carFreq * 1.4, t);
      modGain.gain.exponentialRampToValueAtTime(1, t + 1.2);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      carrier.connect(amp);
      amp.connect(pan);
      carrier.start(t);
      mod.start(t);
      carrier.stop(t + 1.7);
      mod.stop(t + 1.7);
    },

    coalesce(x, mass) {
      const t = ctx.currentTime;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (x - 0.5) * 1.8));
      pan.connect(brightLP);
      pan.connect(reverb.input);
      const base = NODE_ROOT * 4 * (1 + Math.min(1, mass * 0.1) * 0.5);
      for (const [ratio, lvl] of [[1, 0.15], [2.01, 0.08], [3.0, 0.045]] as const) {
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
      } catch {
        /* closing */
      }
      drone.stop();
      for (const [, v] of nodeVoices) for (const o of v.oscs) {
        try {
          o.stop(t + 0.5);
        } catch {
          /* stopped */
        }
      }
      for (const [, v] of edgeVoices) for (const o of [v.oscA, v.oscB]) {
        try {
          o.stop(t + 0.5);
        } catch {
          /* stopped */
        }
      }
      nodeVoices.clear();
      edgeVoices.clear();
      setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 600);
    },
  };
}
