"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ─────────────────────────────────────────────────────────────────────────────
// 17120-breathline · "Does his rubato breathe on a hidden slow pulse?"
//
//   Karel's real recording plays, and from HIS note-roll we extract the thing an
//   ordinary visualiser throws away as noise: the beat-by-beat timing DEVIATION
//   (his expressive push-and-pull against a slow local tempo grid). Recent
//   motor-timing work found that this rubato is not random jitter — it carries a
//   shared, slow ~0.36 Hz "infra-delta" oscillation, a breath-like cycle running
//   underneath the playing. This piece recovers that breath from his actual take
//   and makes the whole field inhale (he leans back / lags) and exhale (he presses
//   forward / rushes), with the fast expressive tremor riding on the slow swell.
//
//   The reading is HIS timing. The safeMaster analyser only adds a faint glow.
//
//   Refs: bioRxiv 2026.03.27.714869, "Infra-delta oscillatory structure in
//   expressive piano performance" (shared ~0.36 Hz rubato oscillation); ASAP-
//   dataset work, Frontiers in Psychology 2026 (timing flexibility aligns with
//   dynamic shaping, largely independent of note density).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath"

// ── DSP constants ────────────────────────────────────────────────────────────
const GRID_DT = 0.05; // resample step for the deviation series (20 Hz)
const ONSET_CLUSTER = 0.045; // notes within this window count as one struck onset
const MA_WIN = 9; // moving-average window (onsets) for the slow local tempo grid
const DRIFT_HZ = 0.12; // remove very-slow drift below the infra-delta band
const BREATH_HZ = 0.5; // upper edge of the infra-delta band (~0.2–0.5 Hz)
const AMP_WIN_SEC = 4; // window for the rolling breath-amplitude
const AC_MIN_SEC = 2.0; // autocorrelation search: slowest breath (~0.5 Hz)
const AC_MAX_SEC = 5.0; // autocorrelation search: fastest resolved (~0.2 Hz)
const FALLBACK_PERIOD = 2.78; // ~0.36 Hz — the infra-delta prior when data is thin

const HIST = 900; // live scroll-graph ring length (frames)

// ── warm / organic art palette (canvas only — never in className) ─────────────
const BG = "#0b0a10";

// ── recovered-breath data for one take ───────────────────────────────────────
interface BreathData {
  dt: number;
  breath: Float32Array; // band-limited breath (~[-1,1]); +inhale / −exhale
  tremor: Float32Array; // fast expressive residual (~[-1,1])
  amp: Float32Array; // rolling breath amplitude (0..1)
  periodSec: number; // measured dominant slow period
  freqHz: number;
  duration: number;
  measured: boolean; // true when the period came from autocorrelation
}

// zero-phase one-pole low-pass (forward + backward pass)
function lowpass(x: Float32Array, hz: number, dt: number): Float32Array {
  const rc = 1 / (2 * Math.PI * hz);
  const a = dt / (dt + rc);
  const y = new Float32Array(x.length);
  let acc = x.length ? x[0] : 0;
  for (let i = 0; i < x.length; i++) {
    acc += a * (x[i] - acc);
    y[i] = acc;
  }
  acc = y.length ? y[y.length - 1] : 0;
  for (let i = y.length - 1; i >= 0; i--) {
    acc += a * (y[i] - acc);
    y[i] = acc;
  }
  return y;
}

// robust scale (90th-percentile absolute value) so one outlier can't flatten it
function normScale(x: Float32Array): number {
  if (!x.length) return 1;
  const a = Array.from(x, Math.abs).sort((p, q) => p - q);
  const v = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  return v > 1e-6 ? v : 1;
}

// Extract the hidden breath from HIS note-roll. Returns null when there are too
// few onsets to fit a tempo grid (caller then falls back to the envelope).
function computeBreath(notes: TrackNote[]): BreathData | null {
  if (!notes || notes.length < 24) return null;

  // 1. collapse near-simultaneous notes (chords) into single struck onsets
  const onsets: number[] = [];
  let last = -Infinity;
  for (const n of notes) {
    if (n.time - last > ONSET_CLUSTER) {
      onsets.push(n.time);
      last = n.time;
    }
  }
  if (onsets.length < 16) return null;

  // 2. inter-onset intervals, and a smoothed LOCAL tempo grid (moving average)
  const M = onsets.length - 1;
  const ioi = new Float32Array(M);
  for (let i = 0; i < M; i++) ioi[i] = Math.max(0.02, onsets[i + 1] - onsets[i]);

  const half = (MA_WIN - 1) / 2;
  const local = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    let s = 0;
    let c = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < M) {
        s += ioi[k];
        c++;
      }
    }
    local[i] = s / Math.max(1, c);
  }

  // 3. rubato deviation per interval: how much this gap LEADS or LAGS the local
  //    grid, as a signed fraction of a beat. +longer → he leans back (inhale).
  const devT: number[] = [];
  const devV: number[] = [];
  for (let i = 0; i < M; i++) {
    const fr = (ioi[i] - local[i]) / local[i];
    devT.push((onsets[i] + onsets[i + 1]) * 0.5);
    devV.push(Math.max(-1.5, Math.min(1.5, fr)));
  }

  // 4. resample the irregular deviation series onto a uniform grid
  const duration = Math.max(onsets[onsets.length - 1], devT[devT.length - 1]);
  const n = Math.max(8, Math.round(duration / GRID_DT) + 1);
  const grid = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i * GRID_DT;
    while (j < devT.length - 1 && devT[j + 1] < t) j++;
    if (t <= devT[0]) grid[i] = devV[0];
    else if (t >= devT[devT.length - 1]) grid[i] = devV[devV.length - 1];
    else {
      const f = (t - devT[j]) / Math.max(1e-4, devT[j + 1] - devT[j]);
      grid[i] = devV[j] + (devV[j + 1] - devV[j]) * f;
    }
  }

  // 5. band-limit toward infra-delta: strip very-slow drift, keep up to ~0.5 Hz.
  //    breath = the slow swell; tremor = the fast expressive detail above it.
  const drift = lowpass(grid, DRIFT_HZ, GRID_DT);
  const centered = new Float32Array(n);
  for (let i = 0; i < n; i++) centered[i] = grid[i] - drift[i];
  const breathRaw = lowpass(centered, BREATH_HZ, GRID_DT);
  const tremorRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) tremorRaw[i] = centered[i] - breathRaw[i];

  const bScale = normScale(breathRaw);
  const tScale = normScale(tremorRaw);
  const breath = new Float32Array(n);
  const tremor = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    breath[i] = Math.max(-1, Math.min(1, breathRaw[i] / bScale));
    tremor[i] = Math.max(-1, Math.min(1, tremorRaw[i] / tScale));
  }

  // 6. rolling breath amplitude (how strong the swing is right now)
  const win = Math.max(4, Math.round(AMP_WIN_SEC / GRID_DT));
  const ampRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = i - win; k <= i; k++) {
      if (k >= 0) {
        s += breath[k] * breath[k];
        c++;
      }
    }
    ampRaw[i] = Math.sqrt(s / Math.max(1, c));
  }
  const aScale = normScale(ampRaw);
  const amp = new Float32Array(n);
  for (let i = 0; i < n; i++) amp[i] = Math.max(0, Math.min(1, ampRaw[i] / aScale));

  // 7. recover the dominant slow PERIOD by autocorrelating the breath in-band
  let mean = 0;
  for (let i = 0; i < n; i++) mean += breath[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = breath[i] - mean;
    variance += d * d;
  }
  variance = variance / n || 1;

  const lagMin = Math.round(AC_MIN_SEC / GRID_DT);
  const lagMax = Math.min(n - 4, Math.round(AC_MAX_SEC / GRID_DT));
  let best = 0;
  let bestLag = Math.round(FALLBACK_PERIOD / GRID_DT);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i + lag < n; i++) {
      s += (breath[i] - mean) * (breath[i + lag] - mean);
      c++;
    }
    const r = s / Math.max(1, c);
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  const strength = best / variance; // normalised autocorrelation peak height
  const measured = strength > 0.08 && duration > AC_MAX_SEC * 2;
  const periodSec = measured ? bestLag * GRID_DT : FALLBACK_PERIOD;

  return {
    dt: GRID_DT,
    breath,
    tremor,
    amp,
    periodSec,
    freqHz: 1 / periodSec,
    duration,
    measured,
  };
}

function sampleAt(arr: Float32Array, dt: number, t: number): number {
  if (!arr.length) return 0;
  const x = t / dt;
  const i = Math.floor(x);
  if (i <= 0) return arr[0];
  if (i >= arr.length - 1) return arr[arr.length - 1];
  const f = x - i;
  return arr[i] + (arr[i + 1] - arr[i]) * f;
}

// ── the render ───────────────────────────────────────────────────────────────
interface Ring {
  r: number; // radius in canvas px
  a: number; // alpha 0..1
}

interface SceneState {
  breath: number; // -1..1
  tremor: number; // -1..1
  amp: number; // 0..1
  glow: number; // 0..1 secondary shimmer from the analyser
  reduced: boolean;
  histB: Float32Array;
  histD: Float32Array;
  histPos: number;
  histFilled: number;
  rings: Ring[];
  phase: number; // rolling angle for the tremor rim ripple
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  s: SceneState,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = W / dpr;
  const h = H / dpr;

  // graphite ground
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.44;
  const baseR = Math.min(w, h) * 0.17;
  const breath = s.breath;
  // inhale (lag / lean back) expands the aperture; exhale (rush) contracts it
  const R = baseR * (1 + breath * 0.5) * (1 + 0.18 * s.amp);
  const lum = 0.5 + 0.5 * s.amp; // brighter when the rubato swing is strong
  const shimmer = s.reduced ? 0 : s.glow;

  ctx.globalCompositeOperation = "lighter";

  // 1. emanating breath rings — the living substrate, spawned on each inhale peak
  for (const ring of s.rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(196,132,224,${(ring.a * 0.4).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // 2. soft outer halo (deep violet → warm), sized + brightened by the breath
  const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 3.3);
  halo.addColorStop(0, `rgba(122,79,208,${(0.20 * lum).toFixed(3)})`);
  halo.addColorStop(0.45, `rgba(88,46,180,${(0.12 * lum).toFixed(3)})`);
  halo.addColorStop(1, "rgba(20,14,40,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 3.3, 0, Math.PI * 2);
  ctx.fill();

  // 3. the luminous core aperture — warm amber/rose through violet
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
  const heat = 0.6 + 0.4 * lum + 0.25 * shimmer;
  core.addColorStop(0, `rgba(255,214,168,${Math.min(1, 0.85 * heat).toFixed(3)})`);
  core.addColorStop(0.35, `rgba(255,150,120,${Math.min(1, 0.6 * heat).toFixed(3)})`);
  core.addColorStop(0.7, `rgba(176,86,196,${(0.34 * heat).toFixed(3)})`);
  core.addColorStop(1, "rgba(60,30,90,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2);
  ctx.fill();

  // 4. the tremor rim — fast expressive detail riding on the slow swell
  const N = 220;
  const wob = R * (0.05 + 0.12 * Math.abs(s.tremor));
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const ripple =
      Math.sin(ang * 6 + s.phase) * 0.6 +
      Math.sin(ang * 11 - s.phase * 1.7) * 0.4;
    const rr = R * 1.02 + wob * ripple * (0.4 + 0.6 * Math.abs(s.tremor));
    const px = cx + Math.cos(ang) * rr;
    const py = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(255,190,150,${(0.28 + 0.4 * Math.abs(s.tremor)).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.globalCompositeOperation = "source-over";

  // 5. the breath-line graph — the recovered breath (bold) with the raw
  //    deviation (faint) riding on it, so you SEE both scales at once.
  const gTop = h * 0.82;
  const gH = Math.min(64, h * 0.11);
  const gMid = gTop;
  const gW = Math.min(w - 48, 720);
  const gx = (w - gW) / 2;
  const count = s.histFilled;
  if (count > 2) {
    // faint zero line
    ctx.strokeStyle = "rgba(150,140,170,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, gMid);
    ctx.lineTo(gx + gW, gMid);
    ctx.stroke();

    const idxAt = (k: number) =>
      (s.histPos - count + k + HIST * 2) % HIST;

    // raw deviation (breath + tremor) — the fine expressive detail
    ctx.strokeStyle = "rgba(255,180,150,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const v = s.histD[idxAt(k)];
      const px = gx + (k / (count - 1)) * gW;
      const py = gMid - v * gH;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // the recovered slow breath — the star of the graph
    ctx.strokeStyle = "rgba(198,138,228,0.95)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const v = s.histB[idxAt(k)];
      const px = gx + (k / (count - 1)) * gW;
      const py = gMid - v * gH;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // "now" marker at the leading edge
    const nowV = s.histB[idxAt(count - 1)];
    ctx.fillStyle = "rgba(255,214,168,0.95)";
    ctx.beginPath();
    ctx.arc(gx + gW, gMid - nowV * gH, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

type Phase = "idle" | "loading" | "playing";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dprRef = useRef(1);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);

  const dataRef = useRef<BreathData | null>(null);
  const demoTRef = useRef(0);
  const lastTsRef = useRef(0);

  // fallback (envelope-driven) state, used when a track has no note analysis
  const envSlowRef = useRef(0);
  const envMedRef = useRef(0);
  const envBaseRef = useRef(0);

  // live scroll-graph ring + emanating rings
  const histBRef = useRef<Float32Array>(new Float32Array(HIST));
  const histDRef = useRef<Float32Array>(new Float32Array(HIST));
  const histPosRef = useRef(0);
  const histFilledRef = useRef(0);
  const ringsRef = useRef<Ring[]>([]);
  const prevBreathRef = useRef(0);
  const prevSlopeRef = useRef(0);
  const phaseAngRef = useRef(0);

  const analyBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const glowRef = useRef(0);
  const reducedRef = useRef(false);

  const [track, setTrack] = useState(
    () => REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID) ?? REAL_TRACKS[0],
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<{ hz: number; sec: number; measured: boolean } | null>(
    null,
  );

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Load + analyse one track's timing into a recovered-breath signal.
  const loadBreath = useCallback(async (id: string) => {
    let data: BreathData | null = null;
    try {
      const analysis = await loadTrackAnalysis(id);
      if (analysis && analysis.notes.length > 0) {
        data = computeBreath(analysis.notes);
      }
    } catch {
      data = null;
    }
    dataRef.current = data;
    if (data) {
      setAnalysisMissing(false);
      setReadout({ hz: data.freqHz, sec: data.periodSec, measured: data.measured });
    } else {
      setAnalysisMissing(true);
      setReadout({ hz: 1 / FALLBACK_PERIOD, sec: FALLBACK_PERIOD, measured: false });
    }
    // reset the live state so the new take starts clean
    demoTRef.current = 0;
    histPosRef.current = 0;
    histFilledRef.current = 0;
    histBRef.current.fill(0);
    histDRef.current.fill(0);
    ringsRef.current = [];
    envSlowRef.current = 0;
    envMedRef.current = 0;
    envBaseRef.current = 0;
  }, []);

  // read a smoothed RMS off the safeMaster analyser (secondary glow + fallback)
  const readRms = useCallback((): number => {
    const master = masterRef.current;
    if (!master) return 0;
    const an = master.analyser;
    let buf = analyBufRef.current;
    if (!buf || buf.length !== an.fftSize) {
      buf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
      analyBufRef.current = buf;
    }
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }, []);

  const frame = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c2d = canvas.getContext("2d");
      if (!c2d) return;

      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt <= 0 || dt > 0.1) dt = 0.016;

      const playing = phaseRef.current === "playing";
      const data = dataRef.current;
      const reduced = reducedRef.current;

      // clock: real audio time when playing, else a slow looping preview clock
      let t: number;
      if (playing && ctxRef.current) {
        t = ctxRef.current.currentTime - startedAtRef.current;
      } else if (data && !reduced) {
        demoTRef.current += dt;
        if (demoTRef.current > data.duration) demoTRef.current = 0;
        t = demoTRef.current;
      } else {
        t = demoTRef.current; // frozen at rest for reduced-motion / no data
      }

      // secondary glow: analyser RMS (only while audio is actually running)
      const rms = playing ? readRms() : 0;
      glowRef.current += 0.2 * (Math.min(1, rms * 3.2) - glowRef.current);

      // current breath / tremor / amp scalars
      let breath: number;
      let tremor: number;
      let amp: number;
      if (data) {
        breath = sampleAt(data.breath, data.dt, t);
        tremor = sampleAt(data.tremor, data.dt, t);
        amp = sampleAt(data.amp, data.dt, t);
      } else if (playing) {
        // envelope fallback — recover a slow swell from the dynamic envelope
        const aSlow = dt / (dt + 1 / (2 * Math.PI * 0.35));
        const aMed = dt / (dt + 1 / (2 * Math.PI * 1.6));
        const aBase = dt / (dt + 1 / (2 * Math.PI * 0.06));
        envSlowRef.current += aSlow * (rms - envSlowRef.current);
        envMedRef.current += aMed * (rms - envMedRef.current);
        envBaseRef.current += aBase * (rms - envBaseRef.current);
        breath = Math.max(-1, Math.min(1, (envSlowRef.current - envBaseRef.current) * 7));
        tremor = Math.max(-1, Math.min(1, (rms - envMedRef.current) * 5));
        amp = Math.max(0, Math.min(1, envSlowRef.current * 3.2));
      } else {
        breath = 0;
        tremor = 0;
        amp = 0;
      }

      const dev = Math.max(-1, Math.min(1, breath + tremor * 0.7));

      // push into the scroll-graph ring
      histBRef.current[histPosRef.current] = breath;
      histDRef.current[histPosRef.current] = dev;
      histPosRef.current = (histPosRef.current + 1) % HIST;
      if (histFilledRef.current < HIST) histFilledRef.current++;

      // spawn an emanating ring on each inhale peak (breath crests high)
      if (!reduced) {
        const slope = breath - prevBreathRef.current;
        if (
          prevSlopeRef.current > 0 &&
          slope <= 0 &&
          breath > 0.28 &&
          ringsRef.current.length < 14
        ) {
          const baseR = Math.min(canvas.width, canvas.height) / dprRef.current * 0.17;
          ringsRef.current.push({ r: baseR * 1.2, a: 0.55 });
        }
        prevSlopeRef.current = slope;
        prevBreathRef.current = breath;
        // advance + fade the rings
        const spread = Math.min(canvas.width, canvas.height) / dprRef.current;
        const next: Ring[] = [];
        for (const ring of ringsRef.current) {
          ring.r += spread * 0.11 * dt;
          ring.a -= 0.28 * dt;
          if (ring.a > 0.01) next.push(ring);
        }
        ringsRef.current = next;
        phaseAngRef.current += dt * (0.6 + 1.4 * Math.abs(tremor));
      }

      drawScene(c2d, canvas.width, canvas.height, dprRef.current, {
        breath,
        tremor,
        amp,
        glow: glowRef.current,
        reduced,
        histB: histBRef.current,
        histD: histDRef.current,
        histPos: histPosRef.current,
        histFilled: histFilledRef.current,
        rings: ringsRef.current,
        phase: phaseAngRef.current,
      });
    },
    [readRms],
  );

  // one-time setup: canvas sizing, reduced-motion, initial breath extraction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    reducedRef.current = !!mq?.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq?.addEventListener?.("change", onMq);

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    dprRef.current = dpr;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(r.width * dpr));
      canvas.height = Math.max(2, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    void loadBreath(track.id);
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMq);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
    setPhase("idle");
    demoTRef.current = 0;
  }, []);

  const play = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();
      let master = masterRef.current;
      if (!master) {
        master = createSafeMaster(ctx);
        masterRef.current = master;
      }
      await loadBreath(track.id);
      const real = await loadRealTrackBuffer(ctx, track.id);
      try {
        sourceRef.current?.stop();
      } catch {
        /* none playing */
      }
      const src = ctx.createBufferSource();
      src.buffer = real.buffer;
      src.connect(master.input);
      src.onended = () => {
        if (sourceRef.current === src) stopAudio();
      };
      startedAtRef.current = ctx.currentTime;
      histPosRef.current = 0;
      histFilledRef.current = 0;
      histBRef.current.fill(0);
      histDRef.current.fill(0);
      ringsRef.current = [];
      src.start();
      sourceRef.current = src;
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start playback.");
      setPhase("idle");
    }
  }, [track, stopAudio, loadBreath]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stopAudio();
      void loadBreath(id);
    },
    [stopAudio, loadBreath],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {/* title block */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            breathline · infra-delta rubato
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            His rubato, breathing on a hidden pulse
          </h1>
          <p className="text-base text-muted-foreground">
            From Karel&apos;s own note timing we recover the slow breath under his
            playing — the field inhales when he leans back and lags the beat, and
            exhales when he presses forward. The fine tremor on the rim is the
            fast expressive detail riding on that swell.
          </p>
        </header>
      </div>

      {/* bottom control bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {analysisMissing && (
          <p className="text-sm text-muted-foreground">
            No note analysis for this take — the breath is driven from the
            recording&apos;s dynamic envelope instead. Audio still plays the real
            recording.
          </p>
        )}

        {readout && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            breath ≈ {readout.hz.toFixed(2)} Hz · {readout.sec.toFixed(1)} s{" "}
            {readout.measured ? "· measured from his timing" : "· infra-delta prior"}
          </p>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
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
                  {col.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
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
              {phase === "loading" ? "Loading…" : "Play his recording"}
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}

          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {phase === "playing" ? "playing" : "breath preview"} · {track.title}
          </span>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                A performer&apos;s rubato — the tiny beat-by-beat push and pull
                against a steady tempo — was long treated as noise. Recent
                motor-timing work argues it isn&apos;t: the deviations carry a
                shared, slow <strong>~0.36 Hz</strong> oscillation, an
                &ldquo;infra-delta&rdquo; cycle (~2.8 s period) running underneath
                the playing like a breath.
              </p>
              <p>
                <strong>How we recover it.</strong> From Karel&apos;s note-roll we
                collapse chords into struck onsets, fit a slow{" "}
                <span className="font-mono">local tempo grid</span> (a moving
                average of inter-onset intervals), and measure how much each
                interval <em>leads or lags</em> that grid — his signed rubato
                deviation. We resample it to a uniform 20 Hz series, strip the
                very-slow drift, and low-pass toward the infra-delta band
                (~0.2–0.5 Hz). What survives is the breath; the residual above it
                is the fast expressive tremor.
              </p>
              <p>
                <strong>The period is measured.</strong> Autocorrelating the
                band-limited breath over 2–5 s lags gives the take&apos;s dominant
                slow period, shown live in the readout. When a take is too short
                or the peak too weak, we fall back to the ~0.36 Hz prior and say
                so.
              </p>
              <p>
                <strong>The visual.</strong> The whole field inhales as he leans
                back (lags) and exhales as he presses forward (rushes); the rim
                carries the tremor, rings emanate on each inhale crest, and the
                graph shows the slow breath (violet) with the raw deviation
                (warm) riding on it. The audio&apos;s own loudness only adds a
                faint glow — the breath itself is driven by his <em>timing</em>,
                not an FFT.
              </p>
              <p>
                <strong>Honest caveat.</strong> This is an expressive reading, not
                a clinical measurement: the tempo grid and band edges are tuned by
                ear, and analysis quality varies by take.
              </p>
              <p>
                <strong>References.</strong> bioRxiv 2026.03.27.714869,{" "}
                <em>Infra-delta oscillatory structure in expressive piano
                performance</em>; ASAP-dataset work, <em>Frontiers in
                Psychology</em> 2026 (timing flexibility aligns with dynamic
                shaping, largely independent of note density).
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

      <PrototypeNav slugs={["17120-breathline"]} />
    </main>
  );
}
