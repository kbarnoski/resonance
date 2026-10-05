"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 18888-emberfield — YOUR MEMORY of one of Karel's recordings as a FIELD OF
// EMBERS that FADE unless your attention keeps them warm. What survives at
// minute five is a self-portrait of where you looked.
//
// A piece about MEMORY AS FORGETTING — attention decay-and-renewal. A set of
// embers (cap 9) each hold a `warmth ∈ [0,1]` that DECAYS every frame
// (warmth *= exp(-dt/7), τ≈7s → full fade to silence in ~25s). Each ember
// sounds as a looped, band-filtered slice of one of Karel's REAL recordings:
// an AudioBufferSourceNode(loop) → BiquadFilter(bandpass, Q~6, center from the
// ember's vertical position) → GainNode(warmth^1.25·VOICE_GAIN) → StereoPanner
// (from horizontal position) → the shared safeMaster. Never ctx.destination.
//
// ATTENTION drives RENEWAL. A COARSE attention blob (~19% of the stage wide)
// comes from the face — head yaw/pitch sweep it around the stage. Dwelling
// attention on a region RECOVERS the warmth of nearby embers and slows their
// decay; a NOD (pitch oscillation) or a forward LEAN/PUSH (inter-eye distance
// grows) throws a stronger renewal pulse. Dwelling on an EMPTY region for ~1.2s
// PLANTS a new ember there (vertical → pitch), up to the cap of 9 — at cap, the
// coldest ember is retired first. So doing nothing empties the field; the
// surviving constellation is a map of attention.
//
// INPUT (graceful 3-state): `tracking · live` (face), `pointer · attention`
// (mouse/touch fallback), `demo · autonomous` (a drifting attention point tends
// a few embers while others fade — the idle screen stays alive). Always
// labelled so a fallback is never mistaken for live tracking.
//
// RENDER: Canvas 2D only — thousands of additive-blended glow sparks on
// near-black, motion-blur trails via a translucent fill each frame, radial
// gradients. Warm bone-gold / ember-amber (warm) → cold ash/slate (cold).
//
// Grounding: sustained attention as competing degradation & recovery processes
// (Rosenberg 2026, "A Temporal Hierarchy of Sustained Attention Dynamics";
// arXiv:2604.02059); memory reconsolidation on retrieval (arXiv:2609.16053 /
// LETHE arXiv:2609.04289). See README.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useImmersive, ImmersiveHud, ImmersiveToggle } from "../_shared/immersive";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createFaceTracker,
  startCamera,
  type FaceLandmarkerInst,
  type FaceResult,
  type Landmark,
} from "../_shared/cameraTracking";

// ── mechanism constants ──────────────────────────────────────────────────────
const EMBER_CAP = 9;
const DECAY_TAU = 7; // seconds — warmth *= exp(-dt/7)
const DECAY_TAU_ATTENDED = 26; // attention slows decay while you look
const DEATH_WARMTH = 0.025; // below this an ember dies → afterglow
const RENEW_RATE = 0.62; // warmth/sec recovered while attended
const PULSE_WARMTH = 0.42; // extra warmth from a nod / lean pulse
const ATTN_RADIUS = 0.19; // coarse attention blob, fraction of the stage
const DWELL_PLANT_MS = 1200; // dwell on empty dark to plant a new ember
const DWELL_MOVE = 0.07; // attention must stay within this to count as dwell
const VOICE_GAIN = 0.5; // per-ember audible gain ceiling
const F_LO = 160; // bandpass center at the BOTTOM of the stage (Hz)
const F_HI = 2600; // bandpass center at the TOP of the stage (Hz)
const MAX_SPARKS = 22; // per-ember spark cap (9×22 ≈ 200 total)
const SMOOTH_TC = 0.08; // audio param smoothing
const PUSH_RATIO = 1.4; // inter-eye > this × baseline → lean/push pulse

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// vertical position (0 top … 1 bottom) → bandpass center frequency.
function freqForY(ay: number): number {
  return F_LO * Math.pow(F_HI / F_LO, 1 - clamp01(ay));
}

// warmth → colour: cold ash/slate → warm bone-gold → hot ember-amber.
function emberColor(warmth: number): [number, number, number] {
  const w = clamp01(warmth);
  if (w < 0.5) {
    const t = w / 0.5; // ash → bone-gold
    return [
      Math.round(lerp(96, 236, t)),
      Math.round(lerp(104, 206, t)),
      Math.round(lerp(126, 150, t)),
    ];
  }
  const t = (w - 0.5) / 0.5; // bone-gold → ember-amber
  return [
    Math.round(lerp(236, 255, t)),
    Math.round(lerp(206, 158, t)),
    Math.round(lerp(150, 70, t)),
  ];
}

// ── types ────────────────────────────────────────────────────────────────────
interface Spark {
  ang: number; // orbit angle
  baseRad: number; // orbit radius, fraction of minDim
  spin: number; // angular velocity
  wob: number; // radial wobble rate
  phase: number;
  size: number; // sprite size, fraction of minDim
}

interface Voice {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode;
}

interface Ember {
  id: number;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  warmth: number;
  freq: number;
  sparks: Spark[];
  voice: Voice | null;
  dying: boolean;
}

interface Afterglow {
  x: number;
  y: number;
  t: number; // elapsed seconds
  life: number; // total seconds
  color: [number, number, number];
}

type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";
type Source = "demo" | "live" | "pointer";

// ── face landmark indices ──────────────────────────────────────────────────────
const NOSE = 1;
const EYE_R = 33; // person's right eye — appears on image LEFT
const EYE_L = 263; // person's left eye — appears on image RIGHT

interface FaceRead {
  ax: number; // attention point, normalized 0..1 (mirrored)
  ay: number;
  interEye: number; // normalized inter-eye distance (for lean/push)
  noseY: number; // raw nose y (for nod detection)
}

function readFace(res: FaceResult): FaceRead | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const nose = lm[NOSE];
  const eR = lm[EYE_R];
  const eL = lm[EYE_L];
  if (!nose || !eR || !eL) return null;
  // Mirror x so it reads like a mirror. Amplify around centre so a small head
  // turn sweeps the whole stage — but the blob is coarse (~19% wide), so this
  // stays forgiving rather than a precise cursor.
  const mx = 1 - nose.x;
  const ax = clamp(0.5 + (mx - 0.5) * 2.0, 0.04, 0.96);
  const ay = clamp(0.5 + (nose.y - 0.5) * 2.3, 0.04, 0.96);
  const interEye = Math.hypot(eL.x - eR.x, eL.y - eR.y);
  return { ax, ay, interEye, noseY: nose.y };
}

// ── one ember voice: looped real-recording slice → bandpass → gain → pan ───────
function buildVoice(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  freq: number,
  pan: number,
): Voice {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.playbackRate.value = 1;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 6;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(pan, -1, 1);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(master.input);

  // start at a per-ember offset into the track so embers don't phase-lock.
  const offset = Math.random() * Math.max(0.01, buffer.duration - 0.5);
  try {
    src.start(0, offset);
  } catch {
    src.start();
  }
  return { src, filter, gain, panner };
}

function makeSparks(): Spark[] {
  const out: Spark[] = [];
  for (let i = 0; i < MAX_SPARKS; i++) {
    out.push({
      ang: Math.random() * Math.PI * 2,
      baseRad: 0.012 + Math.random() * 0.085,
      spin: (Math.random() - 0.5) * 1.6,
      wob: 0.6 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      size: 0.006 + Math.random() * 0.016,
    });
  }
  return out;
}

export default function Emberfield() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [source, setSource] = useState<Source>("demo");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [emberCount, setEmberCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const runningRef = useRef(false);

  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const embersRef = useRef<Ember[]>([]);
  const glowsRef = useRef<Afterglow[]>([]);
  const nextIdRef = useRef(1);
  const emberCountRef = useRef(0); // mirror of emberCount (avoid per-frame setState)

  const attnRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const dwellRef = useRef<{ x: number; y: number; t: number }>({
    x: 0.5,
    y: 0.5,
    t: 0,
  });

  const camWantRef = useRef(false);
  const lastFaceRef = useRef(0);
  const lastTimeRef = useRef(0);
  const eyeBaseRef = useRef(0); // slow baseline inter-eye distance
  const noseHistRef = useRef<{ y: number; vy: number }>({ y: 0, vy: 0 });
  const nodRevRef = useRef<{ dir: number; times: number[] }>({
    dir: 0,
    times: [],
  });
  const pulseCoolRef = useRef(0); // cooldown so one gesture = one pulse

  const pointerRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    pulse: boolean;
  }>({ active: false, x: 0.5, y: 0.5, pulse: false });

  // ── DPR-aware canvas sizing ──────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }, []);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── plant / retire embers ──────────────────────────────────────────────────
  const retireEmber = useCallback((e: Ember) => {
    const v = e.voice;
    if (!v) return;
    const ctx = ctxRef.current;
    try {
      if (ctx) v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      window.setTimeout(() => {
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.src.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
          v.panner.disconnect();
        } catch {
          /* noop */
        }
      }, 420);
    } catch {
      /* ctx closing */
    }
    e.voice = null;
  }, []);

  const plantEmber = useCallback(
    (x: number, y: number, warmth: number) => {
      const embers = embersRef.current;
      if (embers.length >= EMBER_CAP) {
        // retire the coldest to make room
        let coldest = 0;
        for (let i = 1; i < embers.length; i++) {
          if (embers[i].warmth < embers[coldest].warmth) coldest = i;
        }
        retireEmber(embers[coldest]);
        embers.splice(coldest, 1);
      }
      const freq = freqForY(y);
      const ctx = ctxRef.current;
      const master = masterRef.current;
      const buffer = bufferRef.current;
      const voice =
        runningRef.current && ctx && master && buffer
          ? buildVoice(ctx, master, buffer, freq, x * 2 - 1)
          : null;
      embers.push({
        id: nextIdRef.current++,
        x,
        y,
        warmth,
        freq,
        sparks: makeSparks(),
        voice,
        dying: false,
      });
      emberCountRef.current = embers.length;
      setEmberCount(embers.length);
    },
    [retireEmber],
  );

  // ── the control + render loop ──────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const dt = lastTimeRef.current
      ? Math.min(0.05, (now - lastTimeRef.current) / 1000)
      : 0.016;
    lastTimeRef.current = now;
    if (pulseCoolRef.current > 0) pulseCoolRef.current -= dt;

    // 1. attention point + pulse, from the active source (camera > pointer > demo)
    let tx = 0.5;
    let ty = 0.5;
    let pulse = false;
    let label: Source = "demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      label = "live";
      const video = videoRef.current;
      try {
        if (video.readyState >= 2) {
          const res = trackerRef.current.detectForVideo(video, now);
          const f = readFace(res);
          if (f) {
            lastFaceRef.current = now;
            tx = f.ax;
            ty = f.ay;
            setCamState((s) => (s === "live" ? s : "live"));

            // lean / push — inter-eye distance grows past a slow baseline.
            if (eyeBaseRef.current === 0) eyeBaseRef.current = f.interEye;
            else
              eyeBaseRef.current = lerp(
                eyeBaseRef.current,
                Math.min(eyeBaseRef.current, f.interEye),
                1 - Math.exp(-dt / 4),
              ); // baseline tracks the resting (nearer-of) distance slowly
            const push = f.interEye > eyeBaseRef.current * PUSH_RATIO;

            // nod — vertical oscillation of the nose (two reversals quickly).
            const hist = noseHistRef.current;
            const vy = (f.noseY - hist.y) / Math.max(dt, 1e-3);
            if (Math.sign(vy) !== 0 && Math.sign(vy) !== nodRevRef.current.dir) {
              if (Math.abs(vy) > 0.25) {
                nodRevRef.current.dir = Math.sign(vy);
                nodRevRef.current.times.push(now);
                nodRevRef.current.times = nodRevRef.current.times.filter(
                  (t) => now - t < 900,
                );
              }
            }
            const nod = nodRevRef.current.times.length >= 2;
            hist.y = f.noseY;
            hist.vy = vy;

            if ((push || nod) && pulseCoolRef.current <= 0) {
              pulse = true;
              pulseCoolRef.current = 0.6;
              if (nod) nodRevRef.current.times = [];
            }
          } else {
            tx = attnRef.current.x;
            ty = attnRef.current.y;
            if (now - lastFaceRef.current > 900)
              setCamState((s) => (s === "lost" ? s : "lost"));
          }
        } else {
          tx = attnRef.current.x;
          ty = attnRef.current.y;
        }
      } catch {
        tx = attnRef.current.x;
        ty = attnRef.current.y;
      }
    } else if (pointerRef.current.active) {
      label = "pointer";
      tx = pointerRef.current.x;
      ty = pointerRef.current.y;
      if (pointerRef.current.pulse) {
        pulse = true;
        pointerRef.current.pulse = false;
      }
    } else {
      // DEMO — an autonomous attention point drifts slowly (Lissajous), tending
      // a few embers while others fade. Clearly labelled `demo`.
      label = "demo";
      tx = 0.5 + 0.34 * Math.sin(now * 0.00019) + 0.08 * Math.sin(now * 0.0007);
      ty = 0.5 + 0.3 * Math.cos(now * 0.00013) + 0.07 * Math.cos(now * 0.0009);
      // occasional autonomous pulse so the demo visibly renews, not just drifts.
      if (Math.sin(now * 0.0005) > 0.985 && pulseCoolRef.current <= 0) {
        pulse = true;
        pulseCoolRef.current = 1.2;
      }
    }
    setSource((s) => (s === label ? s : label));

    // 2. smooth the attention point (coarse, forgiving)
    const k = 1 - Math.exp(-dt / 0.18);
    const attn = attnRef.current;
    attn.x += (tx - attn.x) * k;
    attn.y += (ty - attn.y) * k;

    // 3. decay + renew every ember
    const embers = embersRef.current;
    const ctx = ctxRef.current;
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      const d = Math.hypot(e.x - attn.x, e.y - attn.y);
      const attended = d < ATTN_RADIUS;
      const tau = attended ? DECAY_TAU_ATTENDED : DECAY_TAU;
      e.warmth *= Math.exp(-dt / tau);
      if (attended) {
        const falloff = 1 - d / ATTN_RADIUS; // stronger at the centre
        e.warmth = clamp01(e.warmth + RENEW_RATE * falloff * dt);
        if (pulse) e.warmth = clamp01(e.warmth + PULSE_WARMTH * falloff);
      }
      // die → afterglow
      if (e.warmth <= DEATH_WARMTH) {
        glowsRef.current.push({
          x: e.x,
          y: e.y,
          t: 0,
          life: 1.1,
          color: emberColor(0.4),
        });
        retireEmber(e);
        embers.splice(i, 1);
        continue;
      }
      // drive the voice gain from warmth
      const v = e.voice;
      if (v && ctx) {
        v.gain.gain.setTargetAtTime(
          Math.pow(e.warmth, 1.25) * VOICE_GAIN,
          ctx.currentTime,
          SMOOTH_TC,
        );
      }
    }
    if (embers.length !== emberCountRef.current) {
      emberCountRef.current = embers.length;
      setEmberCount(embers.length);
    }

    // 4. dwell on an EMPTY dark region → plant a new ember (vertical → pitch)
    const dwell = dwellRef.current;
    const moved = Math.hypot(attn.x - dwell.x, attn.y - dwell.y);
    let nearEmber = false;
    for (const e of embers) {
      if (Math.hypot(e.x - attn.x, e.y - attn.y) < ATTN_RADIUS * 0.9) {
        nearEmber = true;
        break;
      }
    }
    if (moved > DWELL_MOVE || nearEmber) {
      dwell.x = attn.x;
      dwell.y = attn.y;
      dwell.t = 0;
    } else {
      dwell.t += dt;
      if (dwell.t >= DWELL_PLANT_MS / 1000 && embers.length < EMBER_CAP) {
        plantEmber(attn.x, attn.y, 0.7);
        dwell.t = -0.6; // brief refractory so one dwell plants one ember
      }
    }

    // 5. analyser energy → a gentle global shimmer boost
    let energy = 0;
    const bins = freqRef.current;
    const master = masterRef.current;
    if (master && bins) {
      master.analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i];
      energy = clamp01(sum / bins.length / 150);
    }

    // 6. RENDER — Canvas2D additive sparks on near-black with motion-blur trails
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (c && g) {
      const w = c.width;
      const h = c.height;
      const minDim = Math.min(w, h);

      // motion-blur: translucent near-black fill rather than a hard clear.
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(6,6,9,0.26)";
      g.fillRect(0, 0, w, h);

      g.globalCompositeOperation = "lighter";

      // coarse attention blob — a faint ring so you can read where you're looking
      {
        const cx = attn.x * w;
        const cy = attn.y * h;
        const r = ATTN_RADIUS * minDim;
        const ag = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        const a = label === "demo" ? 0.05 : 0.09;
        ag.addColorStop(0, `rgba(150,160,190,${a})`);
        ag.addColorStop(1, "rgba(150,160,190,0)");
        g.fillStyle = ag;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }

      // embers
      for (const e of embers) {
        const cx = e.x * w;
        const cy = e.y * h;
        const warmth = e.warmth;
        const [r, gg, b] = emberColor(warmth);

        // soft core glow
        const coreR = minDim * (0.03 + warmth * 0.1);
        const core = g.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        core.addColorStop(0, `rgba(${r},${gg},${b},${0.14 + warmth * 0.4})`);
        core.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        g.fillStyle = core;
        g.beginPath();
        g.arc(cx, cy, coreR, 0, Math.PI * 2);
        g.fill();

        // drifting spark swarm — count & brightness scale with warmth
        const n = Math.round(3 + warmth * (MAX_SPARKS - 3));
        for (let i = 0; i < n; i++) {
          const s = e.sparks[i];
          s.ang += s.spin * dt;
          const rad =
            s.baseRad *
            minDim *
            (0.55 + 0.6 * warmth) *
            (1 + 0.25 * Math.sin(now * 0.001 * s.wob + s.phase));
          const px = cx + Math.cos(s.ang) * rad;
          const py = cy + Math.sin(s.ang) * rad;
          const size = s.size * minDim * (0.5 + warmth) * (0.9 + energy * 0.5);
          const a = (0.08 + warmth * 0.5) * (0.6 + energy * 0.4);
          const sp = g.createRadialGradient(px, py, 0, px, py, size);
          sp.addColorStop(0, `rgba(${r},${gg},${b},${clamp01(a)})`);
          sp.addColorStop(1, `rgba(${r},${gg},${b},0)`);
          g.fillStyle = sp;
          g.beginPath();
          g.arc(px, py, size, 0, Math.PI * 2);
          g.fill();
        }
      }

      // afterglow rings — the brief dispersal of a dead ember
      const glows = glowsRef.current;
      for (let i = glows.length - 1; i >= 0; i--) {
        const gl = glows[i];
        gl.t += dt;
        const p = gl.t / gl.life;
        if (p >= 1) {
          glows.splice(i, 1);
          continue;
        }
        const cx = gl.x * w;
        const cy = gl.y * h;
        const rr = minDim * (0.02 + p * 0.16);
        const a = (1 - p) * 0.4;
        const [r2, g2, b2] = gl.color;
        g.strokeStyle = `rgba(${r2},${g2},${b2},${a})`;
        g.lineWidth = Math.max(1, minDim * 0.004 * (1 - p));
        g.beginPath();
        g.arc(cx, cy, rr, 0, Math.PI * 2);
        g.stroke();
        // a few dispersing sparks
        for (let k2 = 0; k2 < 6; k2++) {
          const ang = (k2 / 6) * Math.PI * 2;
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr;
          const sz = minDim * 0.01 * (1 - p);
          const sp = g.createRadialGradient(px, py, 0, px, py, sz);
          sp.addColorStop(0, `rgba(${r2},${g2},${b2},${a})`);
          sp.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
          g.fillStyle = sp;
          g.beginPath();
          g.arc(px, py, sz, 0, Math.PI * 2);
          g.fill();
        }
      }

      g.globalCompositeOperation = "source-over";
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, [plantEmber, retireEmber]);

  // ── seed the idle field + start the loop at mount (alive in <1s) ────────────
  useEffect(() => {
    resize();
    if (embersRef.current.length === 0) {
      const seeds = [
        [0.3, 0.42],
        [0.62, 0.35],
        [0.48, 0.66],
        [0.72, 0.6],
      ];
      for (const [x, y] of seeds) {
        embersRef.current.push({
          id: nextIdRef.current++,
          x,
          y,
          warmth: 0.55 + Math.random() * 0.25,
          freq: freqForY(y),
          sparks: makeSparks(),
          voice: null,
          dying: false,
        });
      }
      emberCountRef.current = embersRef.current.length;
      setEmberCount(embersRef.current.length);
    }
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [resize, runFrame]);

  // ── start audio (user gesture): load the track, voice every live ember ──────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      masterRef.current = master;
      freqRef.current = new Uint8Array(master.analyser.frequencyBinCount);

      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      bufferRef.current = buffer;
      setTrackTitle(title);

      runningRef.current = true;
      // give the embers already glowing on the idle screen their voices
      for (const e of embersRef.current) {
        if (!e.voice) {
          e.voice = buildVoice(ctx, master, buffer, e.freq, e.x * 2 - 1);
        }
      }
      setPhase("running");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start");
      setPhase("error");
    }
  }, [phase, trackId]);

  // ── camera opt-in: swap the demo drive for live face attention ──────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createFaceTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastFaceRef.current = performance.now();
      eyeBaseRef.current = 0;
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── pointer fallback: the pointer IS the attention point ────────────────────
  const pointerFrom = useCallback((e: ReactPointerEvent) => {
    const el = wrapRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }, []);
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (camWantRef.current) return; // live tracking owns attention
      const p = pointerFrom(e);
      pointerRef.current = { active: true, x: p.x, y: p.y, pulse: true };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [pointerFrom],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!pointerRef.current.active) return;
      const p = pointerFrom(e);
      pointerRef.current.x = p.x;
      pointerRef.current.y = p.y;
    },
    [pointerFrom],
  );
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      for (const e of embersRef.current) {
        const v = e.voice;
        if (!v) continue;
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.src.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
          v.panner.disconnect();
        } catch {
          /* noop */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const camLive = camState === "live" && source === "live";
  const camBad = camState === "denied" || camState === "failed";
  const running = phase === "running";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        onPointerDown={running ? onPointerDown : undefined}
        onPointerMove={running ? onPointerMove : undefined}
        onPointerUp={running ? onPointerUp : undefined}
        onPointerCancel={running ? onPointerUp : undefined}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {!running && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-black/70 px-6 py-10 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              memory as forgetting · attention keeps it warm
            </p>
            <h1 className="max-w-xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              A field of embers, each a band-filtered slice of Karel&apos;s
              recording, fades unless your attention keeps it warm. What survives
              at minute five is a self-portrait of where you looked.
            </h1>
            <div className="flex max-w-2xl flex-col gap-3">
              {COLLECTIONS.map((col) => (
                <div key={col.name} className="flex flex-col items-center gap-1.5">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {col.name}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {col.tracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTrackId(t.id)}
                        className={
                          "min-h-[44px] rounded-md border px-4 text-sm transition-colors " +
                          (trackId === t.id
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                        }
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "lighting the field…" : "Begin"}
            </button>
            <p className="max-w-md text-base text-muted-foreground">
              It opens on a self-tending demo field — no camera needed. Then add
              your camera to tend the embers with your attention, or move the
              pointer across the stage as a full manual fallback.
            </p>
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">{errMsg}</p>
            )}
          </div>
        )}

        {/* tracking-status line (always visible while the stage is active) */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 space-y-1 font-mono text-xs uppercase tracking-[0.18em]">
            {camState === "requesting" ? (
              <span className="text-muted-foreground">searching for a face…</span>
            ) : camLive ? (
              <span className="text-foreground">tracking · live</span>
            ) : camState === "lost" ? (
              <span className="text-destructive">
                no face · face the camera, look straight ahead
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">pointer · attention</span>
              </span>
            ) : source === "pointer" ? (
              <span className="text-muted-foreground">pointer · attention</span>
            ) : (
              <span className="text-muted-foreground">demo · autonomous</span>
            )}
            <div className="text-muted-foreground/70">
              {emberCount} / {EMBER_CAP} embers warm
            </div>
          </div>
        )}

        {/* chrome (hidden while immersive) */}
        {running && !immersive && (
          <>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {!camLive && (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={camState === "requesting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {camState === "requesting" ? "starting camera…" : "Use camera"}
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            <div className="absolute bottom-16 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                18888 · emberfield — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Look at an ember to keep it warm · nod or lean in for a stronger
                renewal · dwell on the dark to plant a new one · look away and
                watch memory cool, shrink and die.
              </p>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </>
        )}

        {/* immersive HUD */}
        {running && immersive && (
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Emberfield"
            description="Your memory of one of Karel's recordings as a field of embers that fade unless your attention keeps them warm — what survives is a self-portrait of where you looked."
            howTo={[
              "Let the camera see your face",
              "Look at an ember to keep it warm",
              "Nod or lean in for a stronger renewal pulse",
              "Look at the dark to plant a new ember",
              "Look away and watch memory fade",
            ]}
          />
        )}

        {/* design-notes modal */}
        {showNotes && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          >
            <div
              className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                emberfield — a self-portrait of attention
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Up to nine embers hold a <code>warmth ∈ [0,1]</code> that decays
                  every frame (<code>warmth ·= exp(−dt/7)</code>, τ≈7 s → a
                  neglected ember fades to silence in about twenty-five seconds).
                  Each ember sounds as a looped, band-filtered slice of one of
                  Karel&apos;s real recordings: an <code>AudioBufferSourceNode</code>{" "}
                  (loop, started at a per-ember offset) → a bandpass{" "}
                  <code>BiquadFilter</code> (Q≈6, centre set by the ember&apos;s
                  vertical position) → a <code>GainNode</code> (
                  <code>warmth^1.25 · VOICE_GAIN</code>) → a{" "}
                  <code>StereoPanner</code> (from the horizontal position) → the
                  shared safe-master bus, never the raw destination.
                </p>
                <p>
                  Attention drives renewal. A coarse attention blob (~19% of the
                  stage wide — a broad zone, not a pixel cursor) comes from the
                  face: the mirrored nose position, amplified, sweeps it as you
                  turn and tilt your head. Dwelling warmth on a region recovers
                  the embers near it (<code>warmth += renewRate · dt</code>) and
                  slows their decay; a nod (vertical oscillation of the nose) or a
                  forward lean (inter-eye distance growing past a slow baseline)
                  throws a stronger renewal pulse. Dwelling on an empty dark
                  region for ~1.2 s plants a new ember there, up to the cap of
                  nine — at cap, the coldest is retired first.
                </p>
                <p>
                  So doing nothing empties the field; the surviving constellation
                  is a map of where you looked. The render is Canvas 2D only:
                  additive glow sprites (<code>globalCompositeOperation =
                  &quot;lighter&quot;</code>) on near-black, motion-blur trails
                  from a translucent fill each frame, warm bone-gold / ember-amber
                  for warm embers cooling to ash/slate, and an expanding afterglow
                  ring when one dies. No camera? A labelled <em>demo · autonomous</em>{" "}
                  attention point drifts and tends the field; the pointer is a
                  first-class manual fallback.
                </p>
                <p>
                  Grounding: sustained attention as a limited resource governed by
                  competing degradation and recovery processes (Rosenberg 2026,
                  &ldquo;A Temporal Hierarchy of Sustained Attention
                  Dynamics&rdquo;; the dynamical-systems framing of competing
                  recovery and degradation, arXiv:2604.02059). The sibling idea is
                  memory reconsolidation on retrieval — a memory is re-written each
                  time it is recalled (arXiv:2609.16053; LETHE,
                  arXiv:2609.04289) — which is exactly what re-attending an ember
                  does here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
