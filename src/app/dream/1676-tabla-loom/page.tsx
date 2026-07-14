"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

/* ────────────────────────────────────────────────────────────────────────────
   1676 · TABLA LOOM
   A physically-modeled Indian tabla played through a konnakol tala cycle.
   Drum voices are SYNTHESIZED (modal / banded resonators excited by noise
   bursts), never sampled. A lookahead clock advances a repeating tala; the
   spoken-rhythm syllables (theka) light up in sync on a circular tala wheel.

   Everything here is self-contained: Web Audio synthesis + Canvas2D viz + UI.
──────────────────────────────────────────────────────────────────────────── */

// ── Warm ochre / clay / ink art palette (canvas only) ───────────────────────
const INK = "#140f0a";
const INK_2 = "#1d1710";
const OCHRE = "#d99a4e";
const CLAY = "#b5643c";
const DEEP_CLAY = "#7a3b24";
const CREAM = "#ecd9b0";
const MUTED = "#8a6a44";

// ── Deterministic PRNG (mulberry32) — no Math.random in core paths ──────────
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── One deterministic white-noise buffer, reused by every excitation ────────
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rng = makeRng(0x7ab1a);
  for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
  return buf;
}

// ── Master chain: soft-clip drive (grit) → compressor → out ─────────────────
type Master = { input: GainNode };
function makeMaster(ctx: AudioContext): Master {
  const input = ctx.createGain();
  input.gain.value = 0.9;

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * 1.7); // gentle saturation for warmth/grit
  }
  shaper.curve = curve;
  shaper.oversample = "2x";

  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 5200;
  air.gain.value = 3.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  input.connect(shaper);
  shaper.connect(air);
  air.connect(comp);
  comp.connect(ctx.destination);
  return { input };
}

// ── Modal stroke: a bank of tuned decaying partials + a filtered noise tick.
//    This is the membrane character — inharmonic resonators, not a sine pad.
type ModalOpts = {
  f: number;
  ratios: number[];
  gains: number[];
  decays: number[];
  noiseAmt: number;
  noiseDur: number;
  noiseCut: number;
  bendRatio?: number; // pitch multiplier reached over bendTime (baya glide)
  bendTime?: number;
};
function modalStroke(
  ctx: AudioContext,
  noise: AudioBuffer,
  dest: AudioNode,
  t: number,
  vel: number,
  o: ModalOpts,
) {
  // Noise excitation (the "attack" transient / slap component).
  if (o.noiseAmt > 0) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = o.noiseCut;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    const peak = o.noiseAmt * vel;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(peak, t + 0.0015);
    ng.gain.exponentialRampToValueAtTime(0.0004, t + o.noiseDur);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    src.start(t);
    src.stop(t + o.noiseDur + 0.03);
  }

  // Tuned partials (the resonant ring / pitch of the drum).
  for (let i = 0; i < o.ratios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const f0 = o.f * o.ratios[i];
    osc.frequency.setValueAtTime(f0, t);
    if (o.bendRatio && o.bendTime) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, f0 * o.bendRatio),
        t + o.bendTime,
      );
    }
    const g = ctx.createGain();
    const peak = o.gains[i] * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0006, t + o.decays[i]);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + o.decays[i] + 0.05);
  }
}

// ── The bol roster. FD = treble (dayan) sur; FB tracks it for the baya. ─────
type PlayBol = (
  ctx: AudioContext,
  noise: AudioBuffer,
  dest: AudioNode,
  t: number,
  vel: number,
  fd: number,
) => void;

const fbOf = (fd: number) => 95 * (fd / 330);

// na / ta — rim strokes: bright, clear pitch, medium ring
const bolNa: PlayBol = (ctx, n, d, t, v, fd) =>
  modalStroke(ctx, n, d, t, v, {
    f: fd,
    ratios: [1, 2.0, 2.66],
    gains: [0.5, 0.34, 0.18],
    decays: [0.3, 0.2, 0.13],
    noiseAmt: 0.34,
    noiseDur: 0.012,
    noiseCut: 3900,
  });

const bolTa: PlayBol = (ctx, n, d, t, v, fd) =>
  modalStroke(ctx, n, d, t, v, {
    f: fd,
    ratios: [1, 1.98, 3.0],
    gains: [0.42, 0.3, 0.16],
    decays: [0.22, 0.15, 0.1],
    noiseAmt: 0.4,
    noiseDur: 0.01,
    noiseCut: 4600,
  });

// tin — open ringing rim: longer sustain, singing pitch
const bolTin: PlayBol = (ctx, n, d, t, v, fd) =>
  modalStroke(ctx, n, d, t, v, {
    f: fd,
    ratios: [1, 2.0, 3.0],
    gains: [0.58, 0.24, 0.1],
    decays: [0.62, 0.4, 0.24],
    noiseAmt: 0.2,
    noiseDur: 0.01,
    noiseCut: 4200,
  });

// tun — resonant open center: strong fundamental, long "tuuun", micro-bend
const bolTun: PlayBol = (ctx, n, d, t, v, fd) =>
  modalStroke(ctx, n, d, t, v, {
    f: fd * 0.75,
    ratios: [1, 2.01, 3.0],
    gains: [0.72, 0.2, 0.08],
    decays: [0.95, 0.42, 0.24],
    noiseAmt: 0.16,
    noiseDur: 0.012,
    noiseCut: 2600,
    bendRatio: 0.97,
    bendTime: 0.12,
  });

// ke / ka — closed slap on the baya: dead, non-resonant thud
const bolKe: PlayBol = (ctx, n, d, t, v, fd) => {
  modalStroke(ctx, n, d, t, v, {
    f: 120,
    ratios: [1, 1.9],
    gains: [0.3, 0.14],
    decays: [0.05, 0.04],
    noiseAmt: 0.6,
    noiseDur: 0.055,
    noiseCut: 850,
  });
  void fd;
};

// ge / ghe — the baya bass: resonant boom with the signature downward glide
const bolGe: PlayBol = (ctx, n, d, t, v, fd) => {
  const fb = fbOf(fd);
  modalStroke(ctx, n, d, t, v, {
    f: fb,
    ratios: [1, 1.6, 2.4],
    gains: [0.85, 0.26, 0.1],
    decays: [0.7, 0.4, 0.22],
    noiseAmt: 0.28,
    noiseDur: 0.02,
    noiseCut: 230,
    bendRatio: 0.6, // heel-pressure pitch drop
    bendTime: 0.19,
  });
};

// Composite two-handed bols (bass baya + treble dayan struck together).
const bolDha: PlayBol = (ctx, n, d, t, v, fd) => {
  bolGe(ctx, n, d, t, v, fd);
  bolNa(ctx, n, d, t, v * 0.92, fd);
};
const bolDhin: PlayBol = (ctx, n, d, t, v, fd) => {
  bolGe(ctx, n, d, t, v, fd);
  bolTin(ctx, n, d, t, v * 0.92, fd);
};

const BOLS: Record<string, PlayBol> = {
  na: bolNa,
  ta: bolTa,
  tin: bolTin,
  tun: bolTun,
  ke: bolKe,
  ge: bolGe,
  dha: bolDha,
  dhin: bolDhin,
};

// ── Tala definitions ────────────────────────────────────────────────────────
type Cell = { syl: string; bol: string };
type Tala = {
  name: string;
  count: number;
  vibhags: number[]; // group sizes, sum = count
  sam: number; // emphatic beat 1
  khali: number; // the "empty" / waved beat
  theka: Cell[];
};

const c = (syl: string, bol: string): Cell => ({ syl, bol });

const TALAS: Tala[] = [
  {
    name: "Teental",
    count: 16,
    vibhags: [4, 4, 4, 4],
    sam: 0,
    khali: 8,
    theka: [
      c("Dha", "dha"), c("Dhin", "dhin"), c("Dhin", "dhin"), c("Dha", "dha"),
      c("Dha", "dha"), c("Dhin", "dhin"), c("Dhin", "dhin"), c("Dha", "dha"),
      c("Dha", "dha"), c("Tin", "tin"), c("Tin", "tin"), c("Ta", "ta"),
      c("Ta", "ta"), c("Dhin", "dhin"), c("Dhin", "dhin"), c("Dha", "dha"),
    ],
  },
  {
    name: "Keherwa",
    count: 8,
    vibhags: [4, 4],
    sam: 0,
    khali: 4,
    theka: [
      c("Dha", "dha"), c("Ge", "ge"), c("Na", "na"), c("Ti", "ta"),
      c("Na", "na"), c("Ka", "ke"), c("Dhi", "dhin"), c("Na", "na"),
    ],
  },
  {
    name: "Jhaptal",
    count: 10,
    vibhags: [2, 3, 2, 3],
    sam: 0,
    khali: 5,
    theka: [
      c("Dhi", "dhin"), c("Na", "na"),
      c("Dhi", "dhin"), c("Dhi", "dhin"), c("Na", "na"),
      c("Ti", "tin"), c("Na", "na"),
      c("Dhi", "dhin"), c("Dhi", "dhin"), c("Na", "na"),
    ],
  },
  {
    name: "Rupak",
    count: 7,
    vibhags: [3, 2, 2],
    sam: 0,
    khali: 0, // rupak famously opens on the khali (empty) sam
    theka: [
      c("Tin", "tin"), c("Tin", "tin"), c("Na", "na"),
      c("Dhin", "dhin"), c("Na", "na"),
      c("Dhin", "dhin"), c("Na", "na"),
    ],
  },
];

function vibhagStarts(tala: Tala): Set<number> {
  const s = new Set<number>();
  let acc = 0;
  for (const g of tala.vibhags) {
    s.add(acc);
    acc += g;
  }
  return s;
}

// ── Playable pads (home-row keys) ───────────────────────────────────────────
type Pad = { label: string; bol: string; key: string; hue: string };
const PADS: Pad[] = [
  { label: "Ge", bol: "ge", key: "a", hue: DEEP_CLAY },
  { label: "Ke", bol: "ke", key: "s", hue: MUTED },
  { label: "Na", bol: "na", key: "d", hue: OCHRE },
  { label: "Tin", bol: "tin", key: "f", hue: OCHRE },
  { label: "Tun", bol: "tun", key: "g", hue: CLAY },
  { label: "Ta", bol: "ta", key: "h", hue: OCHRE },
  { label: "Dhin", bol: "dhin", key: "j", hue: CLAY },
  { label: "Dha", bol: "dha", key: "k", hue: CLAY },
];
const KEY_TO_PAD: Record<string, number> = PADS.reduce(
  (m, p, i) => ((m[p.key] = i), m),
  {} as Record<string, number>,
);

// ── Mutable transport & viz state (lives in refs, never re-rendered hot) ─────
type Transport = {
  playing: boolean;
  curMatra: number;
  nextMatra: number;
  matraStart: number; // clock time the current matra began
  matraDur: number;
  nextTime: number; // clock time of the next scheduled matra
};
type FlashEvent = { matra: number; time: number };
type Ripple = { x: number; y: number; r: number; max: number; a: number; hue: string };

const DESIGN_NOTES = [
  "Tabla Loom synthesizes a physically-modeled tabla — no samples. Each bol (drum stroke) is a small bank of tuned resonators excited by a short noise burst: modal / banded-waveguide synthesis after Perry Cook's PhISM and the Essl–Cook banded-waveguide percussion work.",
  "The rim strokes (na, ta, tin) ring with clear inharmonic partials; the baya bass (ge, and the bass half of dha/dhin) bends its pitch downward — the signature heel-pressure glide. dha = ge + na, dhin = ge + tin, struck together.",
  "A steady clock schedules the tala using AudioContext currentTime with a lookahead pump, not audio driven by setInterval. The spoken konnakol theka lights up matra-by-matra on the tala wheel — sam (beat 1) accented, khali (the empty beat) drawn hollow.",
  "Play along: tap the pads or use the home row (A S D F G H J K). Toggle the auto-theka to jam over the machine's groove or to play solo. Pick the tala and the lay (tempo).",
  "Circular tala-wheel framing follows Godfried Toussaint's rhythmic-necklace geometry; the konnakol / theka vocabulary is from the Hindustani & Carnatic tala tradition (Teental, Keherwa, Jhaptal, Rupak).",
];

export default function TablaLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // React state (cool path — UI only)
  const [started, setStarted] = useState(false);
  const [autoTheka, setAutoTheka] = useState(true);
  const [talaIdx, setTalaIdx] = useState(0);
  const [bpm, setBpm] = useState(150); // matras per minute (the lay)
  const [tune, setTune] = useState(330); // dayan sur (Hz)
  const [showNotes, setShowNotes] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [dispMatra, setDispMatra] = useState(0);
  const [padFlash, setPadFlash] = useState<number>(-1);

  // Engine refs
  const ctxRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const masterRef = useRef<Master | null>(null);
  const audioOnRef = useRef(false);
  const rafRef = useRef(0);
  const schedRef = useRef<number>(0);
  const transportRef = useRef<Transport>({
    playing: true,
    curMatra: 0,
    nextMatra: 0,
    matraStart: 0,
    matraDur: 0.4,
    nextTime: 0,
  });
  const flashQ = useRef<FlashEvent[]>([]);
  const nodePulse = useRef<number[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const centerGlow = useRef(0);

  // Live mirrors of cool state for the hot loops
  const autoThekaRef = useRef(autoTheka);
  const talaIdxRef = useRef(talaIdx);
  const bpmRef = useRef(bpm);
  const tuneRef = useRef(tune);
  const dispMatraRef = useRef(0);
  useEffect(() => void (autoThekaRef.current = autoTheka), [autoTheka]);
  useEffect(() => void (talaIdxRef.current = talaIdx), [talaIdx]);
  useEffect(() => void (bpmRef.current = bpm), [bpm]);
  useEffect(() => void (tuneRef.current = tune), [tune]);

  const clockNow = useCallback(() => {
    if (audioOnRef.current && ctxRef.current) return ctxRef.current.currentTime;
    return performance.now() / 1000;
  }, []);

  // Boot / resume the audio engine (must run inside a user gesture).
  const boot = useCallback(() => {
    try {
      if (!ctxRef.current) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) {
          setAudioBlocked(true);
          return;
        }
        const ctx = new AC();
        ctxRef.current = ctx;
        noiseRef.current = makeNoiseBuffer(ctx);
        masterRef.current = makeMaster(ctx);
      }
      const ctx = ctxRef.current;
      const finish = () => {
        if (ctx.state === "running") {
          if (!audioOnRef.current) {
            // Switch the transport clock from perf-time to audio-time.
            const tr = transportRef.current;
            tr.nextTime = ctx.currentTime + 0.06;
            tr.matraStart = ctx.currentTime;
            flashQ.current = [];
            audioOnRef.current = true;
          }
          setAudioBlocked(false);
          setStarted(true);
        }
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(finish).catch(() => setAudioBlocked(true));
      } else {
        finish();
      }
    } catch {
      setAudioBlocked(true);
    }
  }, []);

  // Trigger a single bol immediately (user agency).
  const strike = useCallback(
    (padIdx: number) => {
      boot();
      const ctx = ctxRef.current;
      const master = masterRef.current;
      const noise = noiseRef.current;
      const pad = PADS[padIdx];
      if (ctx && master && noise && audioOnRef.current) {
        const fn = BOLS[pad.bol];
        fn?.(ctx, noise, master.input, ctx.currentTime + 0.004, 1.0, tuneRef.current);
      }
      // Visual feedback regardless of audio state.
      centerGlow.current = 1;
      const cv = canvasRef.current;
      const cx = cv ? cv.clientWidth / 2 : 0;
      const cy = cv ? cv.clientHeight / 2 : 0;
      ripplesRef.current.push({
        x: cx,
        y: cy,
        r: 8,
        max: Math.min(cx, cy) * 0.9,
        a: 0.9,
        hue: pad.hue,
      });
      setPadFlash(padIdx);
      window.setTimeout(() => setPadFlash((p) => (p === padIdx ? -1 : p)), 110);
    },
    [boot],
  );

  // ── Lookahead scheduler (pump only; audio events land on ctx.currentTime) ──
  useEffect(() => {
    const tick = () => {
      const tr = transportRef.current;
      if (!tr.playing) return;
      const tala = TALAS[talaIdxRef.current];
      const dur = 60 / bpmRef.current;
      const now = clockNow();
      const ahead = 0.14;
      let guard = 0;
      while (tr.nextTime < now + ahead && guard++ < 64) {
        const m = ((tr.nextMatra % tala.count) + tala.count) % tala.count;
        if (audioOnRef.current && ctxRef.current && masterRef.current && noiseRef.current) {
          if (autoThekaRef.current) {
            const ctx = ctxRef.current;
            const cell = tala.theka[m];
            const starts = vibhagStarts(tala);
            const accent = m === tala.sam ? 1.0 : starts.has(m) ? 0.82 : 0.64;
            const when = Math.max(tr.nextTime, ctx.currentTime + 0.004);
            BOLS[cell.bol]?.(
              ctx,
              noiseRef.current,
              masterRef.current.input,
              when,
              accent,
              tuneRef.current,
            );
          }
        }
        flashQ.current.push({ matra: m, time: tr.nextTime });
        tr.curMatra = m;
        tr.matraStart = tr.nextTime;
        tr.matraDur = dur;
        tr.nextMatra += 1;
        tr.nextTime += dur;
      }
    };
    schedRef.current = window.setInterval(tick, 25);
    return () => window.clearInterval(schedRef.current);
  }, [clockNow]);

  // ── Init transport clock + attempt an unmuted-if-allowed boot on mount ─────
  useEffect(() => {
    const tr = transportRef.current;
    const t0 = performance.now() / 1000;
    tr.nextTime = t0 + 0.15;
    tr.matraStart = t0;
    tr.matraDur = 60 / bpmRef.current;
    // The global dream AudioCleanup auto-resumes contexts on any gesture and
    // in some headless contexts a context may already be allowed — try once so
    // the ghost can be audible where policy permits. Falls back to silent viz.
    boot();
    nodePulse.current = new Array(TALAS[talaIdxRef.current].count).fill(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset per-node pulses when the tala changes size.
  useEffect(() => {
    nodePulse.current = new Array(TALAS[talaIdx].count).fill(0);
    const tr = transportRef.current;
    tr.curMatra = 0;
    tr.nextMatra = 0;
    tr.nextTime = clockNow() + 0.1;
    tr.matraStart = clockNow();
    flashQ.current = [];
  }, [talaIdx, clockNow]);

  // ── Render loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();

    const frame = () => {
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;

      const tala = TALAS[talaIdxRef.current];
      const N = tala.count;
      const pulses = nodePulse.current;
      if (pulses.length !== N) nodePulse.current = new Array(N).fill(0);

      // Drain flash queue (visual beat aligned to the same clock as audio).
      const now = clockNow();
      const q = flashQ.current;
      while (q.length && q[0].time <= now) {
        const ev = q.shift()!;
        if (ev.matra < nodePulse.current.length) nodePulse.current[ev.matra] = 1;
        // Ripple at the struck node.
        spawnNodeRipple(ev.matra, tala);
        if (dispMatraRef.current !== ev.matra) {
          dispMatraRef.current = ev.matra;
          setDispMatra(ev.matra);
        }
      }

      drawScene(g, w, h, tala, now, dt);
      rafRef.current = requestAnimationFrame(frame);
    };

    function spawnNodeRipple(matra: number, tala: Tala) {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;
      const ang = -Math.PI / 2 + (2 * Math.PI * matra) / tala.count;
      const x = cx + Math.cos(ang) * R;
      const y = cy + Math.sin(ang) * R;
      const isSam = matra === tala.sam;
      ripplesRef.current.push({
        x,
        y,
        r: 6,
        max: isSam ? 70 : 46,
        a: isSam ? 0.95 : 0.7,
        hue: isSam ? CREAM : matra === tala.khali ? MUTED : OCHRE,
      });
    }

    function drawScene(
      ctx2: CanvasRenderingContext2D,
      W: number,
      H: number,
      tala: Tala,
      now: number,
      dt: number,
    ) {
      // Background wash.
      const bg = ctx2.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, INK_2);
      bg.addColorStop(1, INK);
      ctx2.fillStyle = bg;
      ctx2.fillRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.36;
      const N = tala.count;
      const starts = vibhagStarts(tala);
      const tr = transportRef.current;

      // Necklace polygon connecting the matras (Toussaint framing).
      ctx2.lineWidth = 1.2;
      ctx2.strokeStyle = "rgba(217,154,78,0.16)";
      ctx2.beginPath();
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / N;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        if (i === 0) ctx2.moveTo(x, y);
        else ctx2.lineTo(x, y);
      }
      ctx2.closePath();
      ctx2.stroke();

      // Playhead sweep (radial hand) from center to current position.
      const phase = tr.matraDur > 0 ? Math.min(1, Math.max(0, (now - tr.matraStart) / tr.matraDur)) : 0;
      const headMatra = tr.curMatra + phase;
      const headAng = -Math.PI / 2 + (2 * Math.PI * headMatra) / N;
      const grad = ctx2.createLinearGradient(cx, cy, cx + Math.cos(headAng) * R, cy + Math.sin(headAng) * R);
      grad.addColorStop(0, "rgba(236,217,176,0.02)");
      grad.addColorStop(1, "rgba(236,217,176,0.5)");
      ctx2.strokeStyle = grad;
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(cx, cy);
      ctx2.lineTo(cx + Math.cos(headAng) * (R + 14), cy + Math.sin(headAng) * (R + 14));
      ctx2.stroke();

      // Matra nodes.
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / N;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const isSam = i === tala.sam;
        const isKhali = i === tala.khali;
        const isVstart = starts.has(i);
        const pulse = nodePulse.current[i] ?? 0;

        const base = isSam ? 15 : isVstart ? 11 : 8;
        const rad = base + pulse * 9;

        // Halo on active pulse.
        if (pulse > 0.02) {
          ctx2.beginPath();
          ctx2.fillStyle = `rgba(217,154,78,${0.28 * pulse})`;
          ctx2.arc(x, y, rad + 12 + pulse * 10, 0, Math.PI * 2);
          ctx2.fill();
        }

        ctx2.beginPath();
        ctx2.arc(x, y, rad, 0, Math.PI * 2);
        if (isKhali) {
          // Khali = hollow (the "empty" beat).
          ctx2.lineWidth = 2;
          ctx2.strokeStyle = mixWarm(MUTED, CREAM, pulse);
          ctx2.stroke();
        } else {
          ctx2.fillStyle = isSam
            ? mixWarm(CLAY, CREAM, 0.35 + pulse * 0.5)
            : mixWarm(DEEP_CLAY, OCHRE, 0.25 + pulse * 0.7);
          ctx2.fill();
        }

        // Syllable label near the node (outside the ring).
        const lr = R + 34;
        const lx = cx + Math.cos(a) * lr;
        const ly = cy + Math.sin(a) * lr;
        const isCur = i === tr.curMatra;
        ctx2.font = `${isCur ? 600 : 400} ${isSam ? 14 : 12}px ui-sans-serif, system-ui, sans-serif`;
        ctx2.fillStyle = isCur
          ? CREAM
          : isKhali
            ? "rgba(138,106,68,0.85)"
            : "rgba(217,154,78,0.7)";
        ctx2.fillText(tala.theka[i].syl, lx, ly);

        // Decay the pulse.
        nodePulse.current[i] = Math.max(0, pulse - dt * 3.2);
      }

      // Sam marker ring (the emphatic downbeat).
      const samA = -Math.PI / 2 + (2 * Math.PI * tala.sam) / N;
      ctx2.beginPath();
      ctx2.arc(cx + Math.cos(samA) * R, cy + Math.sin(samA) * R, 22, 0, Math.PI * 2);
      ctx2.strokeStyle = "rgba(236,217,176,0.35)";
      ctx2.lineWidth = 1.4;
      ctx2.stroke();

      // Ripples (each strike's resonant flash).
      const rip = ripplesRef.current;
      for (let i = rip.length - 1; i >= 0; i--) {
        const p = rip[i];
        p.r += (p.max - p.r) * Math.min(1, dt * 6);
        p.a -= dt * 1.7;
        if (p.a <= 0) {
          rip.splice(i, 1);
          continue;
        }
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx2.strokeStyle = warmAlpha(p.hue, p.a);
        ctx2.lineWidth = 1.6;
        ctx2.stroke();
      }

      // Center readout: current syllable + tala name.
      centerGlow.current = Math.max(0, centerGlow.current - dt * 2.2);
      const curSyl = tala.theka[tr.curMatra]?.syl ?? "";
      ctx2.font = "600 34px ui-sans-serif, system-ui, sans-serif";
      ctx2.fillStyle = mixWarm(OCHRE, CREAM, 0.4 + centerGlow.current * 0.6);
      ctx2.fillText(curSyl, cx, cy - 6);
      ctx2.font = "500 11px ui-monospace, monospace";
      ctx2.fillStyle = "rgba(138,106,68,0.9)";
      ctx2.fillText(
        `${tala.name.toUpperCase()} · ${N} MATRA · ${tr.curMatra + 1}/${N}`,
        cx,
        cy + 24,
      );
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [clockNow]);

  // Keyboard drumming.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const idx = KEY_TO_PAD[k];
      if (idx !== undefined) {
        e.preventDefault();
        strike(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strike]);

  // Close audio on unmount (global cleanup also handles route changes).
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  const tala = TALAS[talaIdx];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tabla Loom
          </h1>
          <p className="mt-1 max-w-2xl text-base text-muted-foreground">
            A physically-modeled tabla you can play through a konnakol tala
            cycle — synthesized drum voices, a visible rhythmic structure.
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Canvas — the tala wheel */}
      <div className="relative overflow-hidden rounded-lg border border-border">
        <canvas
          ref={canvasRef}
          className="block h-[52vh] max-h-[560px] min-h-[340px] w-full touch-none"
        />
        {!started && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md bg-background/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-sm">
              ghost demo running — press play for sound
            </span>
          </div>
        )}
      </div>

      {audioBlocked && (
        <p className="mt-2 text-sm text-destructive">
          Audio is blocked by the browser. Press Play (a tap/click) to start the
          drum — the wheel keeps turning meanwhile.
        </p>
      )}

      {/* Primary controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => boot()}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {started ? "Playing" : "Play"}
        </button>
        <button
          onClick={() => setAutoTheka((v) => !v)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Auto-theka: {autoTheka ? "on" : "off"}
        </button>

        {/* Tala picker */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1">
          {TALAS.map((t, i) => (
            <button
              key={t.name}
              onClick={() => setTalaIdx(i)}
              className={`min-h-[36px] rounded-md px-3 text-sm transition-colors ${
                i === talaIdx
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tempo + tuning */}
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
            Lay {bpm}
          </span>
          <input
            type="range"
            min={70}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="h-1 w-40 cursor-pointer accent-primary"
          />
        </label>
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
            Sur {tune}Hz
          </span>
          <input
            type="range"
            min={260}
            max={420}
            value={tune}
            onChange={(e) => setTune(Number(e.target.value))}
            className="h-1 w-40 cursor-pointer accent-primary"
          />
        </label>
      </div>

      {/* Drum pads */}
      <div className="mt-5">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Play the bols — tap or home row
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {PADS.map((p, i) => (
            <button
              key={p.label}
              onPointerDown={(e) => {
                e.preventDefault();
                strike(i);
              }}
              className={`flex min-h-[64px] flex-col items-center justify-center rounded-md border text-sm transition-all ${
                padFlash === i
                  ? "border-primary bg-primary/25 text-foreground"
                  : "border-border bg-background/60 text-foreground hover:bg-accent"
              }`}
            >
              <span className="text-base font-medium">{p.label}</span>
              <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {p.key}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Current theka strip */}
      <div className="mt-5 overflow-x-auto">
        <div className="flex min-w-max gap-1">
          {tala.theka.map((cell, i) => {
            const isSam = i === tala.sam;
            const isKhali = i === tala.khali;
            const isVstart = vibhagStarts(tala).has(i);
            return (
              <div
                key={i}
                className={`flex min-w-[44px] flex-col items-center rounded-md border px-2 py-1.5 ${
                  isVstart ? "ml-2" : ""
                } ${
                  i === dispMatra
                    ? "border-primary bg-primary/20"
                    : "border-border bg-background/40"
                }`}
              >
                <span
                  className={`text-sm ${
                    i === dispMatra ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {cell.syl}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
                  {isSam ? "sam" : isKhali ? "khali" : i + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Tabla Loom — design notes
            </h2>
            <div className="mt-3 space-y-3">
              {DESIGN_NOTES.map((n, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {n}
                </p>
              ))}
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
      <PrototypeNav slugs={["1676-tabla-loom"]} />
    </div>
  );
}

// ── Small warm-color helpers (canvas only) ──────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function mixWarm(a: string, b: string, t: number): string {
  const tt = Math.min(1, Math.max(0, t));
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * tt);
  const g = Math.round(g1 + (g2 - g1) * tt);
  const bl = Math.round(b1 + (b2 - b1) * tt);
  return `rgb(${r},${g},${bl})`;
}
function warmAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, a))})`;
}
