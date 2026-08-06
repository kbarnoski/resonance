"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7544-fordtree — "What if you could DESCEND the infinite tree of all
// just-intonation harmony — the Stern–Brocot / Ford-circle structure where
// every rational p/q is one tangent circle AND one musical interval — falling
// forever from the simple consonances (octave, fifth, fourth) toward the
// microtonal abyss, hearing each interval as you pass it?"
//
// THE OBJECT (a genuine first for this lab): the Stern–Brocot mediant tree
// restricted to the octave [1,2]. Between neighbours a/b and c/d sits the
// MEDIANT (a+c)/(b+d); repeated mediants enumerate every rational in lowest
// terms exactly once. Depth ↑ ⇒ bigger denominators ⇒ more microtonal ratios.
// Each rational p/q is drawn as its FORD CIRCLE: centre (p/q, 1/(2q²)),
// radius 1/(2q²), tangent to the x-axis; Stern–Brocot neighbours are mutually
// tangent — an infinitely nested tangent-circle packing. Camera falls toward
// the current node while the packing self-similarly reveals finer structure.
//
// NOT the lab's dissonance-curve / Sethares timbre-derived-scale line. This is
// a NUMBER-THEORETIC object — the rational continuum itself (Farey / Ford /
// Stern–Brocot), not a psychoacoustic dissonance measure. See README.
//
// Self-contained: SVG art + Web Audio + UI + README, all in this folder.
// Pure inline SVG (NO Canvas2D / WebGL / WebGPU). Deterministic (mulberry32).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── ViewBox world (art-layer units). Responsive via width/height 100%. ────────
const VB_W = 1000;
const VB_H = 640;
const AXIS_Y = 500; // the x-axis — the "microtonal abyss" the packing falls into
const APPARENT_R = 150; // target on-screen radius of the current circle (units)
const MIN_PX = 0.55; // cull circles smaller than this (bounded DOM)
const MAX_CIRCLES = 168; // hard cap on live SVG circles
const Q_RESURFACE = 100000; // denominator cap → resurface to the root, run forever
const ROOT_HZ = 98; // drone root ≈ G2

// ── Deterministic PRNG (repo bans Math.random / Date). ───────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Stern–Brocot frame: [la,lb, ra,rb] boundaries; its mediant is the node. ──
type Frame = [number, number, number, number];
const ROOT_FRAME: Frame = [1, 1, 2, 1]; // octave [1/1 , 2/1] → first mediant 3/2

function mediantP(f: Frame) {
  return f[0] + f[2];
}
function mediantQ(f: Frame) {
  return f[1] + f[3];
}

// Reconstruct the full mediant path (root → target rational in [1,2]).
function buildPathTo(tp: number, tq: number): Frame[] {
  const frames: Frame[] = [[...ROOT_FRAME] as Frame];
  let f: Frame = [...ROOT_FRAME] as Frame;
  for (let i = 0; i < 80; i++) {
    const p = mediantP(f);
    const q = mediantQ(f);
    // cross-multiply compare tp/tq vs p/q
    const cmp = tp * q - p * tq;
    if (cmp === 0) break;
    if (cmp < 0) f = [f[0], f[1], p, q]; // target is flatter → go left
    else f = [p, q, f[2], f[3]]; // target is sharper → go right
    frames.push([...f] as Frame);
  }
  return frames;
}

// ── Just-intonation interval names (Partch / Doty flavour). ──────────────────
const INTERVALS: Record<string, string> = {
  "1/1": "unison",
  "2/1": "octave",
  "3/2": "perfect fifth",
  "4/3": "perfect fourth",
  "5/4": "major third",
  "6/5": "minor third",
  "5/3": "major sixth",
  "8/5": "minor sixth",
  "9/8": "major tone",
  "10/9": "minor tone",
  "16/15": "diatonic semitone",
  "7/4": "harmonic seventh",
  "7/5": "septimal tritone",
  "10/7": "septimal tritone",
  "7/6": "septimal minor third",
  "9/7": "septimal major third",
  "11/8": "undecimal tritone",
  "16/11": "undecimal fifth",
  "13/8": "tridecimal sixth",
  "11/9": "undecimal neutral third",
  "15/8": "major seventh",
  "9/5": "greater just minor seventh",
};

function intervalName(p: number, q: number): string {
  const key = `${p}/${q}`;
  if (INTERVALS[key]) return INTERVALS[key];
  return "microtonal ratio";
}

function centsOf(value: number): number {
  return 1200 * Math.log2(value);
}

// ── A visible Ford circle, ready to render. ──────────────────────────────────
interface Circle {
  id: string; // "p/q" — stable key across frames (good reconciliation)
  cx: number;
  cy: number;
  r: number;
  q: number;
  depth: number;
  current: boolean;
}

// ── Violet-ramp colour for a circle by denominator / depth. ──────────────────
function colorFor(q: number, r: number, current: boolean) {
  // bigger circles (small q, ancestors) read faint & deep; small ones brighter
  const t = Math.min(1, Math.log(q + 1) / Math.log(600)); // 0 simple → 1 complex
  const light = 30 + t * 42; // deeper → brighter violet
  const sat = 55 + t * 25;
  const hue = 262 + t * 30; // violet → magenta as it gets microtonal
  const sizeFade = Math.max(0.12, Math.min(0.9, (APPARENT_R * 1.6) / (r + 8)));
  if (current) {
    return {
      fill: "hsla(288,90%,66%,0.20)",
      stroke: "hsl(290,95%,74%)",
      op: 1,
      sw: 2.4,
    };
  }
  return {
    fill: `hsla(${hue},${sat}%,${light}%,${0.05 + t * 0.06})`,
    stroke: `hsl(${hue},${sat}%,${light}%)`,
    op: sizeFade,
    sw: 1,
  };
}

// ── Camera-driven build of the visible packing (bounded + culled). ───────────
function buildVisibleCircles(
  cx: number,
  s: number,
  currentId: string,
): Circle[] {
  const out: Circle[] = [];
  const halfW = VB_W / 2 / s;
  const xlo = cx - halfW - 0.02;
  const xhi = cx + halfW + 0.02;
  const worldToScreenX = (x: number) => VB_W / 2 + (x - cx) * s;

  const pushRational = (p: number, q: number, depth: number) => {
    const value = p / q;
    const r = (s / (2 * q * q)); // 1/(2q²) * s
    if (r < MIN_PX) return;
    const sx = worldToScreenX(value);
    const sy = AXIS_Y - r; // centre sits radius r above the axis (tangent)
    // cull fully off-screen
    if (sx + r < -40 || sx - r > VB_W + 40) return;
    if (sy - r > VB_H + 40) return;
    const id = `${p}/${q}`;
    out.push({ id, cx: sx, cy: sy, r, q, depth, current: id === currentId });
  };

  // endpoints of the octave (q=1 giant anchor arcs)
  pushRational(1, 1, 0);
  pushRational(2, 1, 0);

  // recurse the mediant tree, pruning to the visible x-window
  const stack: { f: Frame; depth: number }[] = [{ f: ROOT_FRAME, depth: 0 }];
  let guard = 0;
  while (stack.length && out.length < MAX_CIRCLES && guard < 20000) {
    guard++;
    const { f, depth } = stack.pop()!;
    const p = mediantP(f);
    const q = mediantQ(f);
    if (q > Q_RESURFACE * 4) continue;
    const r = s / (2 * q * q);
    if (r < MIN_PX) continue; // subtree too small — cull
    const left = f[0] / f[1];
    const right = f[2] / f[3];
    if (right < xlo || left > xhi) continue; // subtree off-screen
    pushRational(p, q, depth);
    // children
    stack.push({ f: [p, q, f[2], f[3]], depth: depth + 1 });
    stack.push({ f: [f[0], f[1], p, q], depth: depth + 1 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO — sustained JI drone + per-interval bell/pad voices + reverb, all
// realising the true rational (no 12-TET, no pentatonic quantise). Params drift
// over minutes so the descent is a journey, not a loop.
// ─────────────────────────────────────────────────────────────────────────────
class FordAudio {
  ctx: AudioContext;
  master: GainNode;
  wet: GainNode;
  dry: GainNode;
  reverb: ConvolverNode;
  droneFilter: BiquadFilterNode;
  droneOscs: OscillatorNode[] = [];
  voices: { nodes: AudioNode[]; end: number }[] = [];
  disposed = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const now = this.ctx.currentTime;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.gain.linearRampToValueAtTime(0.9, now + 3);
    this.master.connect(this.ctx.destination);

    // reverb (deterministic decaying-noise impulse)
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.buildImpulse(3.4, 2.6);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.5;
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.62;
    this.reverb.connect(this.wet).connect(this.master);
    this.dry.connect(this.master);

    // sustained cosmic drone: root + fifth + sub, through a slow filter
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 700;
    this.droneFilter.Q.value = 0.7;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.16;
    this.droneFilter.connect(droneGain);
    droneGain.connect(this.dry);
    droneGain.connect(this.reverb);

    const droneSpec: [number, OscillatorType, number][] = [
      [ROOT_HZ, "sawtooth", 1],
      [ROOT_HZ * 1.5, "sawtooth", 0.6], // just fifth
      [ROOT_HZ * 0.5, "sine", 0.9], // sub
      [ROOT_HZ * 1.001, "sawtooth", 0.5], // gentle beat
    ];
    for (const [f, type, g] of droneSpec) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.droneFilter);
      o.start(now);
      this.droneOscs.push(o);
    }
  }

  buildImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = this.ctx.createBuffer(2, len, rate);
    const rng = mulberry32(0x7544);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (rng() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  // Voice one JI interval against the drone root. Simpler ratios ring pure &
  // long; complex/deep ratios beat, shimmer and decay faster.
  voice(value: number, q: number) {
    if (this.disposed || this.ctx.state === "closed") return;
    const now = this.ctx.currentTime;
    const consonance = Math.max(0.08, Math.min(1, 6 / q)); // small q → 1
    const dur = 1.1 + consonance * 2.6;
    const base = ROOT_HZ * 4 * value; // clear register (≈ G4..G5)

    const vGain = this.ctx.createGain();
    vGain.gain.value = 0;
    const peak = 0.06 + consonance * 0.12;
    vGain.gain.linearRampToValueAtTime(peak, now + 0.05);
    vGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 900 + consonance * 3600; // simple = brighter
    filt.connect(vGain);
    vGain.connect(this.dry);
    vGain.connect(this.reverb);

    const nodes: AudioNode[] = [vGain, filt];
    // partials realise the ratio's harmonic character
    const partials: [number, number, number][] = [
      [1, 1, 0],
      [2, 0.45, 0],
      [3, 0.18 * consonance, 0],
    ];
    // deeper (complex) ratios get a detuned partial → beating shimmer
    if (consonance < 0.6) partials.push([1, 0.5, (1 - consonance) * 9]);
    for (const [mult, g, detune] of partials) {
      const o = this.ctx.createOscillator();
      o.type = mult === 1 ? "triangle" : "sine";
      o.frequency.value = base * mult;
      o.detune.value = detune;
      const og = this.ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(filt);
      o.start(now);
      o.stop(now + dur + 0.1);
      nodes.push(o, og);
    }
    // also touch the interval one octave down for body
    const lowGain = this.ctx.createGain();
    lowGain.gain.value = 0;
    lowGain.gain.linearRampToValueAtTime(peak * 0.5, now + 0.08);
    lowGain.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    lowGain.connect(this.dry);
    lowGain.connect(this.reverb);
    const lo = this.ctx.createOscillator();
    lo.type = "sine";
    lo.frequency.value = ROOT_HZ * 2 * value;
    lo.connect(lowGain);
    lo.start(now);
    lo.stop(now + dur + 0.1);
    nodes.push(lowGain, lo);

    this.voices.push({ nodes, end: now + dur + 0.2 });
    // cull finished / overflowing voices
    this.pruneVoices(now);
  }

  pruneVoices(now: number) {
    // drop expired
    this.voices = this.voices.filter((v) => {
      if (v.end < now) {
        for (const n of v.nodes) {
          try {
            n.disconnect();
          } catch {
            /* already gone */
          }
        }
        return false;
      }
      return true;
    });
    // cap concurrency (drop oldest)
    while (this.voices.length > 7) {
      const v = this.voices.shift()!;
      for (const n of v.nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // long-form drift — phase advances slowly (minutes) off the frame counter
  drift(phase: number) {
    if (this.disposed || this.ctx.state === "closed") return;
    const t = this.ctx.currentTime;
    const cut = 620 + 380 * (0.5 + 0.5 * Math.sin(phase));
    this.droneFilter.frequency.setTargetAtTime(cut, t, 0.4);
    const wet = 0.4 + 0.22 * (0.5 + 0.5 * Math.sin(phase * 0.61 + 1.3));
    this.wet.gain.setTargetAtTime(wet, t, 0.5);
  }

  dispose() {
    this.disposed = true;
    const now = this.ctx.state === "closed" ? 0 : this.ctx.currentTime;
    for (const o of this.droneOscs) {
      try {
        o.stop(now);
      } catch {
        /* ignore */
      }
      try {
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
    for (const v of this.voices) {
      for (const n of v.nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }
    this.voices = [];
    try {
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {
        /* ignore */
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
interface Readout {
  p: number;
  q: number;
  cents: number;
  name: string;
  depth: number;
}

export default function FordTreePage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [readout, setReadout] = useState<Readout>({
    p: 3,
    q: 2,
    cents: centsOf(1.5),
    name: "perfect fifth",
    depth: 0,
  });
  const [auto, setAuto] = useState(true);
  const [audioOn, setAudioOn] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── engine refs (mutated by rAF + input, no re-render) ──────────────────────
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<FordAudio | null>(null);
  const pathRef = useRef<Frame[]>([[...ROOT_FRAME] as Frame]);
  const camRef = useRef({ cx: 1.5, logS: Math.log(APPARENT_R * 2 * 4) });
  const targetRef = useRef({ cx: 1.5, logS: Math.log(APPARENT_R * 2 * 4) });
  const autoRef = useRef(true);
  const rngRef = useRef(mulberry32(0x7544));
  const lastTRef = useRef(0);
  const dwellRef = useRef(0);
  const framePhaseRef = useRef(0);
  const lastIdRef = useRef("3/2");
  const apiRef = useRef<{
    branch: (dir: "left" | "right") => void;
    ascend: () => void;
    dive: (p: number, q: number) => void;
  } | null>(null);

  // point the camera + readout + audio at the current top-of-path node
  const focusCurrent = useCallback((sound: boolean) => {
    const f = pathRef.current[pathRef.current.length - 1];
    const p = mediantP(f);
    const q = mediantQ(f);
    const value = p / q;
    targetRef.current = {
      cx: value,
      logS: Math.log(APPARENT_R * 2 * q * q),
    };
    const id = `${p}/${q}`;
    if (id !== lastIdRef.current) {
      lastIdRef.current = id;
      setReadout({
        p,
        q,
        cents: centsOf(value),
        name: intervalName(p, q),
        depth: pathRef.current.length - 1,
      });
      if (sound) audioRef.current?.voice(value, q);
    }
  }, []);

  const resurface = useCallback(() => {
    pathRef.current = [[...ROOT_FRAME] as Frame];
    focusCurrent(true);
  }, [focusCurrent]);

  // ── build the api (branch / ascend / dive) once ─────────────────────────────
  useEffect(() => {
    apiRef.current = {
      branch(dir) {
        const stack = pathRef.current;
        const f = stack[stack.length - 1];
        const p = mediantP(f);
        const q = mediantQ(f);
        if (q > Q_RESURFACE) {
          resurface();
          return;
        }
        const child: Frame =
          dir === "left" ? [f[0], f[1], p, q] : [p, q, f[2], f[3]];
        stack.push(child);
        dwellRef.current = 0;
        focusCurrent(true);
      },
      ascend() {
        const stack = pathRef.current;
        if (stack.length > 1) {
          stack.pop();
          dwellRef.current = 0;
          focusCurrent(true);
        }
      },
      dive(p, q) {
        pathRef.current = buildPathTo(p, q);
        dwellRef.current = 0;
        focusCurrent(true);
      },
    };
  }, [focusCurrent, resurface]);

  // ── main animation loop (runs from mount; audio silent until Start) ─────────
  useEffect(() => {
    const step = (t: number) => {
      const last = lastTRef.current || t;
      const dt = Math.min(0.05, (t - last) / 1000);
      lastTRef.current = t;
      framePhaseRef.current += dt * 0.045; // ~2+ min per drift cycle

      // smooth camera fall (log-space zoom for exponential descent)
      const k = 1 - Math.exp(-dt / 0.85);
      const cam = camRef.current;
      const tgt = targetRef.current;
      cam.cx += (tgt.cx - cam.cx) * k;
      cam.logS += (tgt.logS - cam.logS) * k;

      // auto-descend once the camera has (nearly) arrived
      dwellRef.current += dt;
      if (autoRef.current) {
        const arrived =
          Math.abs(cam.logS - tgt.logS) < 0.18 && dwellRef.current > 1.15;
        if (arrived) {
          const f = pathRef.current[pathRef.current.length - 1];
          if (mediantQ(f) > Q_RESURFACE) {
            resurface();
          } else {
            apiRef.current?.branch(rngRef.current() < 0.5 ? "left" : "right");
          }
        }
      }

      const s = Math.exp(cam.logS);
      setCircles(buildVisibleCircles(cam.cx, s, lastIdRef.current));
      audioRef.current?.drift(framePhaseRef.current);

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [resurface]);

  // ── keyboard steering ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          apiRef.current?.branch("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          apiRef.current?.branch("right");
          break;
        case "ArrowUp":
          e.preventDefault();
          apiRef.current?.ascend();
          break;
        case " ":
          e.preventDefault();
          setAuto((a) => {
            autoRef.current = !a;
            return !a;
          });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── full teardown of audio on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    try {
      audioRef.current = new FordAudio();
      setAudioOn(true);
      setAudioError(false);
      // sound the current interval immediately on start
      const f = pathRef.current[pathRef.current.length - 1];
      audioRef.current.voice(mediantP(f) / mediantQ(f), mediantQ(f));
    } catch {
      setAudioError(true);
    }
  }, []);

  const toggleAuto = useCallback(() => {
    setAuto((a) => {
      autoRef.current = !a;
      return !a;
    });
  }, []);

  const centsStr = `${readout.cents >= 0 ? "+" : ""}${readout.cents.toFixed(1)}¢`;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* ── full-bleed SVG art ── */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="ft-void" cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor="#160a2e" />
            <stop offset="55%" stopColor="#0b0713" />
            <stop offset="100%" stopColor="#050208" />
          </radialGradient>
          <linearGradient id="ft-abyss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsla(280,80%,60%,0)" />
            <stop offset="100%" stopColor="hsla(280,80%,55%,0.22)" />
          </linearGradient>
          <filter id="ft-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#ft-void)" />

        {/* the x-axis — the microtonal abyss the packing is tangent to */}
        <rect
          x="0"
          y={AXIS_Y}
          width={VB_W}
          height={VB_H - AXIS_Y}
          fill="url(#ft-abyss)"
        />
        <line
          x1="0"
          y1={AXIS_Y}
          x2={VB_W}
          y2={AXIS_Y}
          stroke="hsla(285,90%,72%,0.35)"
          strokeWidth="1"
        />

        {/* the Ford-circle packing */}
        <g>
          {circles.map((c) => {
            const col = colorFor(c.q, c.r, c.current);
            return (
              <circle
                key={c.id}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill={col.fill}
                stroke={col.stroke}
                strokeWidth={col.sw}
                opacity={col.op}
                filter={c.current ? "url(#ft-glow)" : undefined}
              />
            );
          })}
        </g>
      </svg>

      {/* clickable overlay circles carry their true p/q for diving */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {circles
          // only interior nodes make good dive targets: skip the q=1 octave
          // anchors and the huge ancestor arcs that would swallow every click
          .filter((c) => c.q >= 2 && c.r < 320)
          .map((c) => {
            const [p, q] = c.id.split("/").map(Number);
            return (
              <circle
                key={c.id}
                cx={c.cx}
                cy={c.cy}
                r={Math.min(c.r + 3, 44)}
                fill="transparent"
                stroke="none"
                onClick={() => apiRef.current?.dive(p, q)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
      </svg>

      {/* ── top strip: title + README ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="pointer-events-auto max-w-[70%]">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ford Tree
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Falling through the infinite tree of just-intonation harmony.
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          <button
            onClick={() => setShowNotes(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Notes
          </button>
          <Link
            href="/dream/7544-fordtree/README.md"
            target="_blank"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            README
          </Link>
        </div>
      </div>

      {/* ── ratio readout ── */}
      <div className="pointer-events-none absolute left-4 top-24 sm:left-6 sm:top-28">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          now sounding · depth {readout.depth}
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-primary text-4xl font-semibold tracking-tight tabular-nums">
            {readout.p}/{readout.q}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {centsStr}
          </span>
        </div>
        <div className="mt-1 text-base text-foreground/80">{readout.name}</div>
      </div>

      {/* ── controls ── */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 sm:p-6">
        {audioError && (
          <p className="text-destructive text-sm">
            Web Audio is unavailable — the descent still runs, but silently.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!audioOn && !audioError && (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start sound
            </button>
          )}
          <button
            onClick={() => apiRef.current?.branch("left")}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            ← flatter
          </button>
          <button
            onClick={toggleAuto}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {auto ? "Pause descent" : "Auto-descend"}
          </button>
          <button
            onClick={() => apiRef.current?.ascend()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            ↑ ascend
          </button>
          <button
            onClick={() => apiRef.current?.branch("right")}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            sharper →
          </button>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          ← / → branch · space pause · ↑ ascend · click a circle to dive
        </p>
      </div>

      {/* ── design-notes modal ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Descending the rational continuum
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                Every positive rational{" "}
                <span className="font-mono text-foreground">p/q</span> is both a
                circle and an interval. The{" "}
                <span className="text-foreground">Stern–Brocot mediant tree</span>{" "}
                enumerates them exactly once: between neighbours a/b and c/d sits
                the mediant (a+c)/(b+d). Deeper ⇒ larger q ⇒ more microtonal.
              </p>
              <p>
                Each p/q is drawn as its{" "}
                <span className="text-foreground">Ford circle</span> — centre
                (p/q, 1/2q²), radius 1/2q², tangent to the axis and to its
                Stern–Brocot neighbours. The camera falls toward the current node
                while the packing self-similarly reveals finer structure.
              </p>
              <p>
                This is the number-theoretic object — Farey / Ford / Stern–Brocot,
                the rational continuum itself. It is{" "}
                <span className="text-foreground">not</span> a psychoacoustic
                dissonance curve.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
