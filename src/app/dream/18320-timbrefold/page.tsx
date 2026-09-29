"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 18320-timbrefold · "What if you could reshape the resonant BODY / vocal tract
// of your own recording with your two hands — bending its timbre from glassy to
// woody to vowel-like, while its pitch and melody stay exactly the same?"
//
//   Source-filter model (Fant): the recording is the SOURCE (its glottal-like
//   fine structure — the exact notes, the melody, the pitch — is left untouched),
//   and your hands sculpt the FILTER: a movable vocal-tract built from four
//   peaking-biquad formants (F1..F4) in series that BOOST resonant regions,
//   imposing a resonant-body / vowel character on the piano without ever
//   touching playbackRate. A low/high-shelf pair adds the spectral-tilt axis.
//
//   Two-hand conducting (identical for camera / pointer / demo drive):
//     · right-hand height  → formant WARP (resonator size): 0.65 (large, chesty)
//                            … 1.7 (small, bright). Every Fn is multiplied by it.
//     · left-hand height   → spectral TILT: a ±10 dB low-shelf/high-shelf seesaw
//                            (low hand = dark/woody, high hand = bright/glassy).
//     · distance apart     → morph DEPTH 0..1: hands together = dry original,
//                            hands apart = fully vocal/morphed.
//     · midpoint x         → VOWEL sweep /u/→/o/→/a/→/e/→/i/ (Peterson–Barney).
//
//   Render: layered SVG, prismatic (frequency→spectral hue). (1) the glowing
//   formant-envelope curve — the visible "throat", peaks at the warped formants;
//   (2) a partial field of ~56 log-spaced spectral bars dancing to the analyser;
//   (3) a timbre-space constellation (brightness × resonator-size) with a comet
//   trail marking the trajectory of your conducting.
//
//   Refs: Grey (1977) multidimensional timbre space; Fant's source-filter model
//   of sound production / peaking-formant vocal-tract filtering; MuseTimbre —
//   Zero-Shot Timbre Transfer (arXiv:2609.30548) as the "timbre as a controllable
//   axis independent of pitch" inspiration.
// ─────────────────────────────────────────────────────────────────────────────

// ── vocal-tract model constants ──────────────────────────────────────────────

// Peterson–Barney style vowel formant tables (F1..F4 in Hz), ordered so that
// sliding the midpoint left→right sweeps /u/ → /o/ → /a/ → /e/ → /i/.
const VOWELS: { name: string; f: [number, number, number, number] }[] = [
  { name: "u", f: [300, 870, 2240, 3400] },
  { name: "o", f: [570, 840, 2410, 3400] },
  { name: "a", f: [730, 1090, 2440, 3400] },
  { name: "e", f: [530, 1840, 2480, 3400] },
  { name: "i", f: [270, 2290, 3010, 3400] },
];

// Per-formant boost (dB) at full morph depth, tapering F1→F4; and per-formant Q.
const FORMANT_BOOST_DB: [number, number, number, number] = [13, 12, 8, 5];
const FORMANT_Q: [number, number, number, number] = [6, 7, 7, 6];

const WARP_MIN = 0.65;
const WARP_MAX = 1.7;
const TILT_DB = 10; // ± shelf gain range for the spectral-tilt seesaw
const DIST_MAX = 1.6; // hand-separation that maps to full morph depth

// ── spectral / visual constants ──────────────────────────────────────────────

const FMIN = 70;
const FMAX = 8000;
const NBARS = 56;
const NSAMP = 148; // envelope-curve sample points
const SIGMA = 0.16; // log-freq width of each formant bump in the drawn envelope
const TRAIL = 44; // constellation comet-trail length

const LOG_MIN = Math.log(FMIN);
const LOG_MAX = Math.log(FMAX);

// log-spaced center frequencies for the partial-field bars
const BAR_FREQS: number[] = Array.from({ length: NBARS }, (_, i) =>
  Math.exp(LOG_MIN + ((i + 0.5) / NBARS) * (LOG_MAX - LOG_MIN)),
);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Prismatic frequency → spectral hue: low = deep red, high = violet. */
function freqColor(f: number, light = 60, sat = 92): string {
  const t = clamp((Math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN), 0, 1);
  const hue = t * 285; // red(0) → orange → yellow → green → blue → violet(285)
  return `hsl(${hue.toFixed(1)} ${sat}% ${light}%)`;
}

// ── unified control surface (identical downstream for all input sources) ──────

interface Controls {
  warp: number; // formant-frequency scale
  tilt: number; // -1 (dark) … +1 (bright)
  depth: number; // 0 (dry original) … 1 (fully vocal)
  vowel: number; // 0..1 across the vowel set
  active: boolean;
}

interface Hand {
  cx: number; // mirrored center x, ~[-1.2, 1.2]
  cy: number;
  height: number; // 0..1
  active: boolean;
}

/** Two raw hands → the four conducting axes (the one true mapping). */
function computeControls(a: Hand, b: Hand): Controls {
  // right hand = the one further to the +x side (mirrored, so screen-right)
  const right = a.cx >= b.cx ? a : b;
  const left = a.cx >= b.cx ? b : a;
  const midCx = (a.cx + b.cx) / 2;
  const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  return {
    warp: WARP_MIN + clamp(right.height, 0, 1) * (WARP_MAX - WARP_MIN),
    tilt: clamp(left.height, 0, 1) * 2 - 1,
    depth: clamp(dist / DIST_MAX, 0, 1),
    vowel: clamp((midCx + 1.2) / 2.4, 0, 1),
    active: a.active && b.active,
  };
}

/** Interpolate the vowel formant table at position p∈[0,1]. */
function computeVowelFormants(p: number): [number, number, number, number] {
  const s = clamp(p, 0, 1) * (VOWELS.length - 1);
  const i0 = Math.min(VOWELS.length - 2, Math.floor(s));
  const fr = s - i0;
  const a = VOWELS[i0].f;
  const b = VOWELS[i0 + 1].f;
  return [
    a[0] + (b[0] - a[0]) * fr,
    a[1] + (b[1] - a[1]) * fr,
    a[2] + (b[2] - a[2]) * fr,
    a[3] + (b[3] - a[3]) * fr,
  ];
}

/** Warped, clamped formant frequencies actually used (audio + visuals share). */
function computeWarpedFormants(
  c: Controls,
): [number, number, number, number] {
  const base = computeVowelFormants(c.vowel);
  return [
    clamp(base[0] * c.warp, 40, 13500),
    clamp(base[1] * c.warp, 40, 13500),
    clamp(base[2] * c.warp, 40, 13500),
    clamp(base[3] * c.warp, 40, 13500),
  ];
}

/** The drawn vocal-tract response (dB) at frequency f for a control state. */
function computeResponseDb(
  f: number,
  formants: [number, number, number, number],
  depth: number,
  tilt: number,
): number {
  const lf = Math.log(f);
  let r = 0;
  for (let n = 0; n < 4; n++) {
    const g = FORMANT_BOOST_DB[n] * depth;
    const d = (lf - Math.log(formants[n])) / SIGMA;
    r += g * Math.exp(-0.5 * d * d);
  }
  const tnorm = (lf - LOG_MIN) / (LOG_MAX - LOG_MIN);
  r += tilt * 7 * (tnorm - 0.5) * 2; // spectral tilt across the band
  return r;
}

// ── demo drive (autonomous virtual hands, slow Lissajous) ────────────────────

function computeDemoHands(t: number): [Hand, Hand] {
  const hA: Hand = {
    cx: -0.55 + 0.5 * Math.sin(t * 0.19),
    cy: 0,
    height: 0.5 + 0.4 * Math.sin(t * 0.23),
    active: true,
  };
  const hB: Hand = {
    cx: 0.6 + 0.5 * Math.sin(t * 0.19 + 2.0),
    cy: 0,
    height: 0.5 + 0.4 * Math.sin(t * 0.29 + 1.3),
    active: true,
  };
  // keep cy consistent with height so the separation distance reads naturally
  hA.cy = hA.height * 2.4 - 1.2;
  hB.cy = hB.height * 2.4 - 1.2;
  return [hA, hB];
}

// ── component ────────────────────────────────────────────────────────────────

type TrackingMode = "live" | "demo" | "lost" | "pointer";

export default function Page() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const formantRefs = useRef<BiquadFilterNode[]>([]);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const highShelfRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sampleRateRef = useRef(48000);

  // svg element refs (updated per frame, no React re-render)
  const fillPathRef = useRef<SVGPathElement | null>(null);
  const strokePathRef = useRef<SVGPathElement | null>(null);
  const barRefs = useRef<(SVGRectElement | null)[]>([]);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const dotGlowRef = useRef<SVGCircleElement | null>(null);
  const trailRef = useRef<SVGPolylineElement | null>(null);
  const trailPtsRef = useRef<{ x: number; y: number }[]>([]);

  // tracking
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraOnRef = useRef(false);
  const trackModeRef = useRef<TrackingMode>("demo");
  const fallbackRef = useRef(false); // pointer fallback engaged after cam fail
  const pointerRef = useRef({ x: 0.5, y: 0.5, spread: false, moved: false });

  // smoothed visual control state (mirrors the audio smoothing)
  const vizRef = useRef<Controls>({
    warp: 1,
    tilt: 0,
    depth: 0,
    vowel: 0.4,
    active: false,
  });

  const lastTsRef = useRef(0);
  const timeRef = useRef(0);
  const dimsRef = useRef({ w: 1200, h: 800 });

  const [dims, setDims] = useState({ w: 1200, h: 800 });
  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [trackMode, setTrackMode] = useState<TrackingMode>("demo");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [ui, setUi] = useState({ vowel: "a", depth: 0, warp: 1 });

  const { immersive, toggle } = useImmersive();

  // ── resize handling ────────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(2, Math.round(r.width));
      const h = Math.max(2, Math.round(r.height));
      dimsRef.current = { w, h };
      setDims({ w, h });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ── always-on render + control loop ──────────────────────────────────────────
  useEffect(() => {
    let uiTick = 0;

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt <= 0 || dt > 0.05) dt = 0.016;
      timeRef.current += dt;
      const t = timeRef.current;

      // ── gather the two hands + resolve the input mode ──────────────────────
      let target: Controls;
      let mode: TrackingMode;

      const tracker = trackerRef.current;
      const video = videoRef.current;
      if (cameraOnRef.current && tracker && video && video.readyState >= 2) {
        let res: { landmarks: { x: number; y: number; z: number }[][] } | null =
          null;
        try {
          res = tracker.detectForVideo(video, performance.now());
        } catch {
          res = null;
        }
        const lms = res?.landmarks ?? [];
        if (lms.length >= 2 && lms[0] && lms[1]) {
          const fa = computeHandFeatures(lms[0]);
          const fb = computeHandFeatures(lms[1]);
          target = computeControls(
            { cx: fa.cx, cy: fa.cy, height: fa.height, active: true },
            { cx: fb.cx, cy: fb.cy, height: fb.height, active: true },
          );
          mode = "live";
        } else if (lms.length === 1 && lms[0]) {
          // one hand only — keep it alive but flag that the second is missing
          const fa = computeHandFeatures(lms[0]);
          target = computeControls(
            { cx: fa.cx, cy: fa.cy, height: fa.height, active: true },
            { cx: fa.cx + 0.3, cy: fa.cy, height: fa.height, active: true },
          );
          mode = "lost";
        } else {
          const [dA, dB] = computeDemoHands(t);
          target = computeControls(dA, dB);
          mode = "lost";
        }
      } else if (fallbackRef.current && pointerRef.current.moved) {
        // pointer fallback: mouse x/y drive vowel + warp/tilt, click toggles depth
        const p = pointerRef.current;
        const primary: Hand = {
          cx: p.x * 2 - 1,
          cy: (1 - p.y) * 2 - 1,
          height: 1 - p.y,
          active: true,
        };
        const secondary: Hand = {
          cx: p.spread ? -(p.x * 2 - 1) : (p.x * 2 - 1) + 0.25,
          cy: (1 - p.y) * 2 - 1,
          height: 1 - p.y,
          active: true,
        };
        target = computeControls(primary, secondary);
        mode = "pointer";
      } else {
        const [dA, dB] = computeDemoHands(t);
        target = computeControls(dA, dB);
        mode = "demo";
      }

      if (mode !== trackModeRef.current) {
        trackModeRef.current = mode;
        setTrackMode(mode);
      }

      // ── smooth the visual control state (matches audio smoothing feel) ──────
      const v = vizRef.current;
      const k = 0.12;
      v.warp += (target.warp - v.warp) * k;
      v.tilt += (target.tilt - v.tilt) * k;
      v.depth += (target.depth - v.depth) * k;
      v.vowel += (target.vowel - v.vowel) * k;
      v.active = target.active;

      // ── drive the audio vocal-tract filter (pitch untouched) ────────────────
      const ac = ctxRef.current;
      const fbs = formantRefs.current;
      if (
        phaseRef.current === "playing" &&
        ac &&
        fbs.length === 4 &&
        lowShelfRef.current &&
        highShelfRef.current
      ) {
        const now = ac.currentTime;
        const formants = computeWarpedFormants(target);
        for (let n = 0; n < 4; n++) {
          const bq = fbs[n];
          bq.frequency.setTargetAtTime(formants[n], now, 0.12);
          bq.Q.setTargetAtTime(FORMANT_Q[n], now, 0.12);
          bq.gain.setTargetAtTime(FORMANT_BOOST_DB[n] * target.depth, now, 0.12);
        }
        // spectral tilt seesaw
        lowShelfRef.current.gain.setTargetAtTime(-target.tilt * TILT_DB, now, 0.13);
        highShelfRef.current.gain.setTargetAtTime(target.tilt * TILT_DB, now, 0.13);
      }

      // ── render the three SVG layers ─────────────────────────────────────────
      drawStage(t);

      uiTick++;
      if (uiTick % 10 === 0) {
        const vp = vizRef.current.vowel * (VOWELS.length - 1);
        const nm = VOWELS[Math.round(clamp(vp, 0, VOWELS.length - 1))].name;
        setUi({
          vowel: nm,
          depth: vizRef.current.depth,
          warp: vizRef.current.warp,
        });
      }
    };

    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      trackerRef.current?.close();
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── the SVG draw routine (called every frame) ────────────────────────────────
  const drawStage = useCallback((t: number) => {
    const { w, h } = dimsRef.current;
    const v = vizRef.current;
    const formants = computeWarpedFormants(v);

    const freqToX = (f: number) =>
      ((Math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * w;

    // ── layer 1: the formant-envelope curve (the visible "throat") ────────────
    const baseline = h * 0.62;
    const dbScale = h * 0.021;
    let top = "";
    for (let i = 0; i < NSAMP; i++) {
      const tt = i / (NSAMP - 1);
      const f = Math.exp(LOG_MIN + tt * (LOG_MAX - LOG_MIN));
      const x = tt * w;
      const r = computeResponseDb(f, formants, v.depth, v.tilt);
      const y = baseline - r * dbScale - 6; // slight lift so a dry line still reads
      top += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    if (strokePathRef.current) strokePathRef.current.setAttribute("d", top);
    if (fillPathRef.current) {
      fillPathRef.current.setAttribute(
        "d",
        top + `L${w} ${baseline} L0 ${baseline} Z`,
      );
    }

    // ── layer 2: the partial field ────────────────────────────────────────────
    const analyser = analyserRef.current;
    const data = freqDataRef.current;
    let energy = 0;
    if (analyser && data) {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < data.length; i++) energy += data[i];
    }
    const live = energy > 500;
    const sr = sampleRateRef.current;
    const nBins = data ? data.length : 512;
    const binHz = sr / (nBins * 2);
    const barW = (w / NBARS) * 0.62;
    for (let i = 0; i < NBARS; i++) {
      const el = barRefs.current[i];
      if (!el) continue;
      const f = BAR_FREQS[i];
      let mag: number;
      if (live && data) {
        const bin = Math.min(nBins - 1, Math.max(0, Math.round(f / binHz)));
        mag = data[bin] / 255;
      } else {
        mag = 0;
      }
      // synthetic floor keeps the field alive at idle, shaped by the envelope
      const resp = computeResponseDb(f, formants, v.depth, v.tilt);
      const floor =
        0.05 +
        0.03 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 0.35)) +
        0.16 * clamp(resp / 16, 0, 1);
      mag = Math.max(mag, floor);
      const bh = mag * h * 0.5;
      const x = freqToX(f) - barW / 2;
      el.setAttribute("x", x.toFixed(1));
      el.setAttribute("width", barW.toFixed(1));
      el.setAttribute("y", (h - bh).toFixed(1));
      el.setAttribute("height", bh.toFixed(1));
    }

    // ── layer 3: timbre-space constellation (drawn in its own 0..100 svg) ─────
    // brightness (tilt) on x, resonator-size (warp) on y (top = small/bright).
    const cx = (v.tilt * 0.5 + 0.5) * 100;
    const cy = 100 - ((v.warp - WARP_MIN) / (WARP_MAX - WARP_MIN)) * 100;
    const pts = trailPtsRef.current;
    pts.push({ x: cx, y: cy });
    if (pts.length > TRAIL) pts.shift();
    if (trailRef.current) {
      trailRef.current.setAttribute(
        "points",
        pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      );
    }
    if (dotRef.current) {
      dotRef.current.setAttribute("cx", cx.toFixed(1));
      dotRef.current.setAttribute("cy", cy.toFixed(1));
    }
    if (dotGlowRef.current) {
      dotGlowRef.current.setAttribute("cx", cx.toFixed(1));
      dotGlowRef.current.setAttribute("cy", cy.toFixed(1));
    }
  }, []);

  // ── audio: buffer source → 4 peaking formants → shelf pair → safeMaster ──────
  const play = useCallback(async () => {
    if (typeof window === "undefined") return;
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();
      sampleRateRef.current = ctx.sampleRate;

      let master = masterRef.current;
      if (!master) {
        master = createSafeMaster(ctx);
        masterRef.current = master;
      }
      analyserRef.current = master.analyser;
      freqDataRef.current = new Uint8Array(
        new ArrayBuffer(master.analyser.frequencyBinCount),
      );

      const wh = await loadRealTrackBuffer(ctx, trackRef.current.id);

      try {
        sourceRef.current?.stop();
      } catch {
        /* none */
      }
      sourceRef.current?.disconnect();

      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.loop = true;
      src.playbackRate.value = 1.0; // pitch stays TRUE — never changed

      // four peaking formants in series (the movable vocal tract)
      const formants: BiquadFilterNode[] = [];
      const startVowel = computeWarpedFormants(vizRef.current);
      for (let n = 0; n < 4; n++) {
        const bq = ctx.createBiquadFilter();
        bq.type = "peaking";
        bq.frequency.value = startVowel[n];
        bq.Q.value = FORMANT_Q[n];
        bq.gain.value = 0; // depth 0 → dry original until the hands open
        formants.push(bq);
      }
      // spectral-tilt shelf pair
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 260;
      lowShelf.gain.value = 0;
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 3200;
      highShelf.gain.value = 0;

      // src → F1 → F2 → F3 → F4 → lowshelf → highshelf → master.input
      src.connect(formants[0]);
      formants[0].connect(formants[1]);
      formants[1].connect(formants[2]);
      formants[2].connect(formants[3]);
      formants[3].connect(lowShelf);
      lowShelf.connect(highShelf);
      highShelf.connect(master.input);

      src.onended = () => {
        if (sourceRef.current === src) setPhase("idle");
      };
      src.start();

      sourceRef.current = src;
      formantRefs.current = formants;
      lowShelfRef.current = lowShelf;
      highShelfRef.current = highShelf;
      setPhase("playing");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load this recording.",
      );
      setPhase("idle");
    }
  }, []);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setPhase("idle");
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraOnRef.current || cameraBusy) return;
    setCameraBusy(true);
    setError(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      await startCamera(video);
      streamRef.current = video.srcObject as MediaStream | null;
      const tracker = await createHandTracker(2);
      trackerRef.current = tracker;
      cameraOnRef.current = true;
      fallbackRef.current = false;
    } catch {
      setError(
        "Camera or hand model unavailable — move the mouse to shape the body by hand, click to spread. The demo drive keeps it alive.",
      );
      cameraOnRef.current = false;
      fallbackRef.current = true;
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const tk = REAL_TRACKS.find((x) => x.id === id);
      if (!tk) return;
      setTrack(tk);
      if (phaseRef.current === "playing") stopAudio();
    },
    [stopAudio],
  );

  // pointer fallback handlers (only meaningful once fallback engaged)
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!fallbackRef.current) return;
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointerRef.current.x = clamp((e.clientX - r.left) / r.width, 0, 1);
    pointerRef.current.y = clamp((e.clientY - r.top) / r.height, 0, 1);
    pointerRef.current.moved = true;
  }, []);
  const onPointerDown = useCallback(() => {
    if (!fallbackRef.current) return;
    pointerRef.current.spread = !pointerRef.current.spread;
    pointerRef.current.moved = true;
  }, []);

  const depthPct = Math.round(ui.depth * 100);
  const bodyLabel =
    ui.depth < 0.12
      ? "dry · original piano"
      : ui.warp > 1.28
        ? `bright body · /${ui.vowel}/`
        : ui.warp < 0.92
          ? `woody body · /${ui.vowel}/`
          : `vocal body · /${ui.vowel}/`;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* ── the SVG stage fills everything ─────────────────────────────────── */}
      <div
        ref={stageRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
      >
        <svg
          className="block h-full w-full"
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="tf-prism" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="hsl(0 92% 58%)" />
              <stop offset="0.2" stopColor="hsl(28 94% 58%)" />
              <stop offset="0.4" stopColor="hsl(52 95% 60%)" />
              <stop offset="0.58" stopColor="hsl(135 78% 55%)" />
              <stop offset="0.78" stopColor="hsl(205 90% 60%)" />
              <stop offset="1" stopColor="hsl(278 88% 64%)" />
            </linearGradient>
            <linearGradient id="tf-prism-v" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="hsl(0 92% 58%)" stopOpacity="0.32" />
              <stop offset="0.4" stopColor="hsl(52 95% 60%)" stopOpacity="0.26" />
              <stop
                offset="0.58"
                stopColor="hsl(135 78% 55%)"
                stopOpacity="0.22"
              />
              <stop
                offset="1"
                stopColor="hsl(278 88% 64%)"
                stopOpacity="0.3"
              />
            </linearGradient>
            <filter id="tf-glow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="tf-glow-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* layer 2 — partial field (behind the envelope, additive glow) */}
          <g style={{ mixBlendMode: "screen" }}>
            {BAR_FREQS.map((f, i) => (
              <rect
                key={f}
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                x={0}
                y={0}
                width={4}
                height={0}
                rx={1.5}
                fill={freqColor(f, 58)}
                opacity={0.78}
              />
            ))}
          </g>

          {/* layer 1 — the formant-envelope "throat" curve */}
          <path
            ref={fillPathRef}
            d=""
            fill="url(#tf-prism-v)"
            filter="url(#tf-glow-soft)"
          />
          <path
            ref={strokePathRef}
            d=""
            fill="none"
            stroke="url(#tf-prism)"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#tf-glow)"
          />
        </svg>
      </div>

      <video ref={videoRef} className="hidden" playsInline muted />

      {/* ── layer 3 — timbre-space constellation (own coordinate svg) ───────── */}
      <div className="pointer-events-none absolute right-4 top-16 z-20 h-[184px] w-[184px] sm:h-[208px] sm:w-[208px]">
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          <rect
            x="1"
            y="1"
            width="98"
            height="98"
            rx="4"
            fill="hsl(240 30% 8% / 0.34)"
            stroke="hsl(240 20% 60% / 0.28)"
            strokeWidth="0.5"
          />
          {/* axes */}
          <line
            x1="50"
            y1="6"
            x2="50"
            y2="94"
            stroke="hsl(240 20% 70% / 0.16)"
            strokeWidth="0.4"
          />
          <line
            x1="6"
            y1="50"
            x2="94"
            y2="50"
            stroke="hsl(240 20% 70% / 0.16)"
            strokeWidth="0.4"
          />
          {/* vowel glyphs along the sweep */}
          {VOWELS.map((vw, i) => (
            <text
              key={vw.name}
              x={10 + (i / (VOWELS.length - 1)) * 80}
              y="14"
              fontSize="5"
              textAnchor="middle"
              fill={freqColor(computeVowelFormants(i / (VOWELS.length - 1))[1], 66)}
              opacity="0.7"
              fontFamily="monospace"
            >
              {vw.name}
            </text>
          ))}
          {/* pole labels */}
          <text x="50" y="99.2" fontSize="4.2" textAnchor="middle" fill="hsl(240 15% 72% / 0.6)" fontFamily="monospace">dark / large</text>
          <text x="50" y="21" fontSize="4.2" textAnchor="middle" fill="hsl(240 15% 72% / 0.6)" fontFamily="monospace">bright / small</text>
          <text x="3" y="52" fontSize="4.2" fill="hsl(240 15% 72% / 0.5)" fontFamily="monospace">dark</text>
          <text x="97" y="52" fontSize="4.2" textAnchor="end" fill="hsl(240 15% 72% / 0.5)" fontFamily="monospace">bright</text>
          {/* comet trail + dot */}
          <polyline
            ref={trailRef}
            points=""
            fill="none"
            stroke="hsl(280 85% 70%)"
            strokeWidth="1.1"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.5"
          />
          <circle ref={dotGlowRef} cx="50" cy="50" r="5.2" fill="hsl(200 90% 65% / 0.35)" />
          <circle ref={dotRef} cx="50" cy="50" r="2.4" fill="hsl(52 96% 72%)" />
        </svg>
      </div>

      {/* ── tracking status line — always visible ─────────────────────────── */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {trackMode === "live" && (
          <span className="text-muted-foreground">tracking · live</span>
        )}
        {trackMode === "demo" && (
          <span className="text-primary">demo · autonomous</span>
        )}
        {trackMode === "pointer" && (
          <span className="text-muted-foreground">pointer · fallback</span>
        )}
        {trackMode === "lost" && (
          <span className="text-destructive">
            tracking lost · show both hands to the camera
          </span>
        )}
        <span className="ml-3 text-muted-foreground/70">
          {bodyLabel} · depth {depthPct}%
        </span>
      </div>

      {/* functional error notice — kept visible even in fullscreen */}
      {error && (
        <p className="pointer-events-none absolute inset-x-4 top-12 z-30 max-w-xl text-sm text-destructive">
          {error}
        </p>
      )}

      {!immersive && (
        <>
          {/* title block — a light overlay, never a big header stack */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6 pt-12">
            <header className="max-w-2xl space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                timbrefold · reshape the resonant body of your recording
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Bend its timbre from glassy to woody to vowel-like — while the
                pitch and melody stay exactly the same.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                A source-filter vocal tract of four peaking formants rides on
                Karel&apos;s piano. Raise your right hand to shrink and brighten
                the body, your left to tilt it dark or glassy, spread both hands
                to make it sing, and slide them left↔right to sweep the vowel —
                the recording&apos;s notes never move.
              </p>
            </header>
          </div>

          {/* bottom control strip */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-6 pb-16">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  track
                </span>
                <select
                  value={track.id}
                  onChange={(e) => onSelectTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {phase !== "playing" ? (
                <button
                  onClick={() => void play()}
                  disabled={phase === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {phase === "loading" ? "Loading…" : `Play ${track.title}`}
                </button>
              ) : (
                <button
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Stop
                </button>
              )}

              <button
                onClick={() => void enableCamera()}
                disabled={cameraBusy || cameraOnRef.current}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                {cameraBusy
                  ? "Enabling camera…"
                  : cameraOnRef.current
                    ? "Camera on"
                    : "Shape it with your hands"}
              </button>

              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </div>

          <PrototypeNav
            slugs={["18320-timbrefold", "18304-murmuration", "18296-slowbloom"]}
          />
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Timbrefold"
        description="Karel's piano is the source; your two hands are the vocal tract. A movable bank of four peaking-biquad formants boosts resonant regions of the recording, imposing a resonant-body / vowel character — glassy, woody, or singing — while the pitch and melody stay exactly the same, because only the spectral envelope is shaped, never the playback rate. The prismatic SVG maps frequency to spectral hue."
        howTo={[
          "Raise your right hand to shrink and brighten the resonant body; lower it for a large, chesty one",
          "Raise your left hand to make it glassy, lower it to make it dark and woody",
          "Spread your hands apart to make it sing; bring them together to hear the untouched piano",
          "Slide both hands left to right to sweep the vowel from oo to ee",
          "Press f for fullscreen, i for info",
        ]}
      />

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong>The source-filter model.</strong> Fant&apos;s theory of
                sound production splits any voice into a <em>source</em> (the
                glottal buzz — its fine harmonic structure, which carries pitch)
                and a <em>filter</em> (the vocal tract, whose resonances —
                formants — colour the sound into vowels). Here the source is
                Karel&apos;s recording, played back untouched at rate 1.0. The
                filter is a bank of four <em>peaking</em> biquads in series (F1–F4)
                that <em>boost</em> the formant regions rather than isolating
                them, so the whole piano still sounds through — it just grows a
                resonant body.
              </p>
              <p>
                <strong>Why the pitch is preserved.</strong> Peaking filters and
                shelves only reshape the spectral <em>envelope</em> — how loud
                each region is. The harmonic fine structure that your ear reads
                as pitch and melody is left exactly where it was, and the buffer
                never changes playback rate. So the body morphs from glassy to
                woody to vowel-like while every note stays put.
              </p>
              <p>
                <strong>Your hands are the tract.</strong> Right-hand height sets
                the formant <em>warp</em> (0.65–1.7): all formant frequencies
                scale up for a small, bright resonator or down for a large,
                chesty one. Left-hand height tilts a ±10&nbsp;dB low-shelf/
                high-shelf seesaw between dark/woody and bright/glassy. The
                distance between your hands is the morph <em>depth</em> — together
                is the dry original (0&nbsp;dB of boost), apart is fully vocal.
                The midpoint of your hands sweeps the vowel across a
                Peterson–Barney table, /u/→/o/→/a/→/e/→/i/. Every parameter is
                smoothed with <code>setTargetAtTime</code>, so there is no zipper
                noise. Everything terminates in the shared safe-master bus.
              </p>
              <p>
                <strong>Prismatic palette.</strong> Frequency maps to spectral
                hue — deep red at the low end, through orange, yellow and green,
                to blue and violet at the top. The glowing envelope curve is the
                visible &quot;throat&quot;, its peaks sitting exactly on the warped
                formants; the partial field dances to the analyser; the corner
                constellation plots brightness × resonator-size with a comet
                trail that traces the path of your conducting.
              </p>
              <p>
                <strong>Degrades gracefully.</strong> No camera or model → a
                pointer fallback (mouse x/y shapes the body, click spreads the
                hands) plus a visible notice, while a labelled autonomous demo
                drive keeps the piece alive. The status line always says whether
                you are seeing <em>tracking · live</em>, <em>demo · autonomous</em>,
                a <em>pointer · fallback</em>, or a lost-hands hint.
              </p>
              <p>
                <strong>References.</strong> Grey, J.&nbsp;M. (1977),{" "}
                <em>Multidimensional perceptual scaling of musical timbres</em>{" "}
                (JASA 61:1270) — the timbre-space constellation. The source-filter
                model of sound production (Fant) / peaking-formant vocal-tract
                filtering. MuseTimbre — Zero-Shot Timbre Transfer
                (arXiv:2609.30548, 28&nbsp;Sep&nbsp;2026) — timbre as a
                controllable axis independent of pitch.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
