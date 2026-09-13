"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17136 · Tidemark
//
//   ONE QUESTION
//   What if a recording remembered being HEARD — growing a geological
//   cross-section of collective attention across every listening session?
//
//   THE MEDIUM REMEMBERS. Pick one of Karel's real catalog tracks. As it plays,
//   the piece deposits sediment: the track's duration is split into ~120 time
//   buckets, and each frame adds "dwell" to the bucket under the playhead — so
//   pausing, replaying and lingering on a passage accretes MORE sediment there
//   (live analyser RMS weights louder-attended moments slightly heavier). When a
//   session ends we lay down ONE thin warm stratum across the x-axis (x = time in
//   the track, left→right); its per-x thickness blends this session's dwell with
//   the track's intrinsic "bedrock" (note-density × velocity from the analysis,
//   or per-bucket waveform RMS if analysis is absent). Oldest layers sit at the
//   bottom, newest on top — a growing tideline, a core sample of how the piece
//   has been listened to.
//
//   IT PERSISTS. Every stratum is written to IndexedDB (one record per track),
//   so a returning visitor re-forms the whole accreted history immediately. On a
//   COLD first load we pre-seed ~10–14 synthetic "remembered listens" from the
//   bedrock so the cross-section reads in the first three seconds; real sessions
//   layer on top. "Forget" clears both.
//
//   OUTPUT is Canvas2D, warm geological palette (umber → amber → ochre). AUDIO is
//   Karel's real catalog only, always through the safeMaster bus. Autonomous —
//   driven by playback + accreted memory; a click on a passage replays it.
//
//   REFS  the first three.js Conference (Codrops, 2026-09-10) — Mr.doob's
//   "cumulative complexity / persistent state", a living generative system that
//   grows rather than resets; Katie Paterson & dendrochronology / geological
//   core-sampling as the long-form-accretion art reference. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── Tunables ─────────────────────────────────────────────────────────────────

const BUCKETS = 120; // time-buckets across the track duration
const LAYER_CAP = 60; // max strata stored per track (drop oldest beyond this)
const SEED_MIN = 10; // synthetic "prior listens" pre-seeded on a cold load
const SEED_MAX = 14;
const MIN_LISTEN_SEC = 2.5; // don't deposit a stratum for a glance shorter than this
const DB_NAME = "tidemark-memory";
const STORE = "sediment";

const DEFAULT_TITLE = "Bath";

// ── Types ────────────────────────────────────────────────────────────────────

interface Layer {
  ts: number; // deposit timestamp (also stable-ish age)
  seeded: boolean; // true = synthetic pre-seed, false = a real listening
  profile: number[]; // per-bucket thickness, 0..~1, length BUCKETS
}

interface Readout {
  sessionN: number;
  layerCount: number;
  seededCount: number;
  peakTime: number; // seconds — most-returned passage
  duration: number;
}

// ── Small deterministic PRNG (mulberry32) for stable, distinct seed strata ────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Profile math ─────────────────────────────────────────────────────────────

function normalizeProfile(p: number[]): number[] {
  let max = 0;
  for (const v of p) if (v > max) max = v;
  if (max <= 0) return p.map(() => 0.3);
  return p.map((v) => v / max);
}

function smoothProfile(p: number[]): number[] {
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const a = p[i - 1] ?? p[i];
    const b = p[i];
    const c = p[i + 1] ?? p[i];
    out[i] = (a + 2 * b + c) / 4;
  }
  return out;
}

/** Bedrock from the analysis note-roll: per-bucket density × mean velocity. */
function computeBedrockFromNotes(
  notes: { midi: number; time: number; duration: number; velocity: number }[],
  duration: number,
): number[] | null {
  if (!notes.length || duration <= 0) return null;
  const dens = new Array(BUCKETS).fill(0);
  const vel = new Array(BUCKETS).fill(0);
  for (const n of notes) {
    const f = n.time / duration;
    if (f < 0 || f >= 1) continue;
    const b = Math.min(BUCKETS - 1, Math.floor(f * BUCKETS));
    dens[b] += 1;
    vel[b] += n.velocity;
  }
  const raw = dens.map((d, b) => (d > 0 ? d * (vel[b] / d / 127) : 0));
  const norm = normalizeProfile(smoothProfile(raw));
  // floor so every passage still shows some intrinsic weight
  return norm.map((v) => 0.15 + 0.85 * v);
}

/** Bedrock from the buffer's own per-bucket RMS (fallback when analysis null). */
function computeBedrockFromBuffer(buffer: AudioBuffer): number[] {
  const ch = buffer.getChannelData(0);
  const N = ch.length;
  const raw = new Array(BUCKETS).fill(0);
  for (let b = 0; b < BUCKETS; b++) {
    const start = Math.floor((b / BUCKETS) * N);
    const end = Math.floor(((b + 1) / BUCKETS) * N);
    const step = Math.max(1, Math.floor((end - start) / 400));
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += step) {
      const s = ch[i];
      sum += s * s;
      count++;
    }
    raw[b] = count > 0 ? Math.sqrt(sum / count) : 0;
  }
  const norm = normalizeProfile(smoothProfile(raw));
  return norm.map((v) => 0.15 + 0.85 * Math.pow(v, 0.7));
}

/** ~10–14 synthetic "prior-session" strata derived from bedrock, each distinct. */
function makeSeedLayers(bedrock: number[], seed: number): Layer[] {
  const rng = mulberry32(seed);
  const count = SEED_MIN + Math.floor(rng() * (SEED_MAX - SEED_MIN + 1));
  const now = Date.now();
  const layers: Layer[] = [];
  for (let i = 0; i < count; i++) {
    // low-frequency wobble so each pass reads as a distinct listening
    const phase = rng() * Math.PI * 2;
    const freq = 1.5 + rng() * 3.5;
    const baseline = 0.5 + rng() * 0.4;
    // one or two attention "hotspots" — where that listener lingered
    const hotN = 1 + (rng() < 0.5 ? 0 : 1);
    const hots: { c: number; w: number; a: number }[] = [];
    for (let h = 0; h < hotN; h++) {
      hots.push({ c: rng(), w: 0.04 + rng() * 0.08, a: 0.25 + rng() * 0.4 });
    }
    const profile = bedrock.map((bv, b) => {
      const f = b / BUCKETS;
      const wobble = 0.5 + 0.5 * Math.sin(phase + f * freq * Math.PI * 2);
      let v = bv * (0.45 + 0.55 * wobble) * baseline;
      for (const ho of hots) {
        const d = f - ho.c;
        v += ho.a * Math.exp(-(d * d) / (2 * ho.w * ho.w));
      }
      return Math.max(0.05, Math.min(1.1, v));
    });
    layers.push({
      ts: now - (count - i) * 86_400_000 - Math.floor(rng() * 3_600_000),
      seeded: true,
      profile,
    });
  }
  return layers;
}

/** Deposit profile for a real session: this session's dwell blended w/ bedrock. */
function blendSessionLayer(dwell: number[], bedrock: number[]): number[] {
  const dn = normalizeProfile(dwell);
  return bedrock.map((bv, b) => {
    const v = 0.6 * dn[b] + 0.4 * bv;
    return Math.max(0.05, Math.min(1.1, v));
  });
}

function formatClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── IndexedDB (all access wrapped; degrade to in-memory on any failure) ────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readLayers(trackId: string): Promise<Layer[] | null> {
  try {
    const db = await openDb();
    const layers = await new Promise<Layer[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(trackId);
      rq.onsuccess = () => {
        const val = rq.result as { layers?: Layer[] } | undefined;
        resolve(val?.layers ?? null);
      };
      rq.onerror = () => reject(rq.error);
    });
    db.close();
    return layers;
  } catch {
    return null;
  }
}

async function writeLayers(trackId: string, layers: Layer[]): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: trackId, layers }, trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

async function deleteLayers(trackId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* nothing to clear */
  }
}

// ── Drawing (warm geological palette; hex/hsl inside the canvas is allowed) ────

function layerColor(ageT: number, seeded: boolean): string {
  // ageT: 0 = oldest (bottom), 1 = newest (top)
  const hue = 22 + ageT * 20; // umber → amber → ochre
  let sat = 42 + ageT * 22; // %
  const light = 13 + ageT * 30; // %
  if (seeded) sat *= 0.8; // muted so seeds read as "remembered", not fresh
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

interface Scene {
  canvas: HTMLCanvasElement;
  layers: Layer[];
  liveProfile: number[] | null; // forming session, or null when idle
  playFrac: number; // 0..1 playhead position, <0 when not playing
  peakBucket: number; // most-returned bucket, -1 if none
  duration: number;
  rms: number;
}

function drawScene(scene: Scene): void {
  const { canvas } = scene;
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = parent.clientWidth;
  const cssH = parent.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // warm dark ground
  const bg = ctx.createLinearGradient(0, 0, 0, cssH);
  bg.addColorStop(0, "hsl(28 34% 9%)");
  bg.addColorStop(1, "hsl(20 40% 5%)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const padX = 18;
  const padTop = 16;
  const padBottom = 30; // room for the time scale
  const plotW = cssW - padX * 2;
  const plotH = cssH - padTop - padBottom;
  const baseY = padTop + plotH; // sediment sits on this floor and grows upward

  const bucketX = (b: number) => padX + (b / (BUCKETS - 1)) * plotW;

  // assemble the stack: stored layers (oldest→newest), then the live forming one
  const stack: Layer[] = scene.layers.slice();
  if (scene.liveProfile) {
    stack.push({ ts: Date.now(), seeded: false, profile: scene.liveProfile });
  }
  const total = stack.length;

  if (total === 0) {
    ctx.fillStyle = "hsl(35 25% 55%)";
    ctx.font = "13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("press play — the recording will remember", cssW / 2, baseY - plotH / 2);
    return;
  }

  // scale so the tallest column fills ~92% of the plot (compaction when deep)
  let maxCol = 0;
  for (let b = 0; b < BUCKETS; b++) {
    let sum = 0;
    for (const L of stack) sum += L.profile[b] ?? 0;
    if (sum > maxCol) maxCol = sum;
  }
  const unit = (plotH * 0.92) / Math.max(maxCol, 6);

  // draw layers bottom (oldest) → top (newest), each a filled sediment band
  const floor = new Array(BUCKETS).fill(baseY);
  for (let li = 0; li < total; li++) {
    const L = stack[li];
    const isLive = scene.liveProfile != null && li === total - 1;
    const ageT = total > 1 ? li / (total - 1) : 1;
    const grow = isLive ? 0.85 + 0.15 * Math.min(1, scene.rms * 4) : 1;

    // top boundary of this layer
    const top = new Array(BUCKETS);
    for (let b = 0; b < BUCKETS; b++) {
      top[b] = floor[b] - (L.profile[b] ?? 0) * unit * grow;
    }

    ctx.beginPath();
    ctx.moveTo(bucketX(0), floor[0]);
    for (let b = 1; b < BUCKETS; b++) ctx.lineTo(bucketX(b), floor[b]);
    for (let b = BUCKETS - 1; b >= 0; b--) ctx.lineTo(bucketX(b), top[b]);
    ctx.closePath();

    ctx.fillStyle = isLive ? "hsl(44 70% 50%)" : layerColor(ageT, L.seeded);
    if (isLive) ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    // thin bedding line at the top of each stratum
    ctx.beginPath();
    ctx.moveTo(bucketX(0), top[0]);
    for (let b = 1; b < BUCKETS; b++) ctx.lineTo(bucketX(b), top[b]);
    ctx.strokeStyle = "hsla(20 45% 5% / 0.45)";
    ctx.lineWidth = 0.75;
    ctx.stroke();

    for (let b = 0; b < BUCKETS; b++) floor[b] = top[b];
  }

  // the tideline: bright warm crest along the newest surface
  ctx.beginPath();
  ctx.moveTo(bucketX(0), floor[0]);
  for (let b = 1; b < BUCKETS; b++) ctx.lineTo(bucketX(b), floor[b]);
  ctx.strokeStyle = "hsla(46 85% 66% / 0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // most-returned passage marker
  if (scene.peakBucket >= 0) {
    const px = bucketX(scene.peakBucket);
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.moveTo(px, padTop);
    ctx.lineTo(px, baseY);
    ctx.strokeStyle = "hsla(40 75% 70% / 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "hsl(42 60% 68%)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = px > cssW * 0.7 ? "right" : "left";
    ctx.fillText("most returned", px + (px > cssW * 0.7 ? -4 : 4), padTop + 10);
  }

  // playhead
  if (scene.playFrac >= 0) {
    const hx = padX + scene.playFrac * plotW;
    ctx.beginPath();
    ctx.moveTo(hx, padTop);
    ctx.lineTo(hx, baseY);
    ctx.strokeStyle = "hsla(48 92% 78% / 0.6)";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = "hsl(48 92% 80%)";
    ctx.beginPath();
    ctx.arc(hx, padTop, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // time scale (left→right = time in the track)
  ctx.fillStyle = "hsla(35 25% 62% / 0.6)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText("0:00", padX, cssH - 10);
  ctx.textAlign = "center";
  ctx.fillText(formatClock(scene.duration / 2), padX + plotW / 2, cssH - 10);
  ctx.textAlign = "right";
  ctx.fillText(formatClock(scene.duration), padX + plotW, cssH - 10);
}

// ── Component ──────────────────────────────────────────────────────────────

function pickDefaultTrack(): string {
  return (
    REAL_TRACKS.find((t) => t.title === DEFAULT_TITLE)?.id ??
    REAL_TRACKS[0].id
  );
}

export default function TidemarkPage() {
  const [trackId, setTrackId] = useState<string>(pickDefaultTrack);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCanvas, setNoCanvas] = useState(false);
  const [storageMode, setStorageMode] = useState<"indexeddb" | "memory">("indexeddb");
  const [readout, setReadout] = useState<Readout>({
    sessionN: 1,
    layerCount: 0,
    seededCount: 0,
    peakTime: 0,
    duration: 0,
  });
  const [showNotes, setShowNotes] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const bedrockRef = useRef<number[] | null>(null);
  const durationRef = useRef<number>(0);
  const peakBucketRef = useRef<number>(-1);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const dwellRef = useRef<number[]>([]);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rmsRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);
  const finishedRef = useRef<boolean>(true);
  const listenedRef = useRef<number>(0);

  // most-returned passage across every stored + live layer
  const recomputePeak = useCallback(() => {
    const col = new Array(BUCKETS).fill(0);
    for (const L of layersRef.current)
      for (let b = 0; b < BUCKETS; b++) col[b] += L.profile[b] ?? 0;
    const live = dwellRef.current;
    if (playingRef.current && live.length) {
      const dn = normalizeProfile(live);
      for (let b = 0; b < BUCKETS; b++) col[b] += dn[b] * 0.5;
    }
    let peak = -1;
    let max = 0;
    for (let b = 0; b < BUCKETS; b++)
      if (col[b] > max) {
        max = col[b];
        peak = b;
      }
    peakBucketRef.current = max > 0 ? peak : -1;
    return peakBucketRef.current;
  }, []);

  const refreshReadout = useCallback(() => {
    const layers = layersRef.current;
    const seeded = layers.filter((l) => l.seeded).length;
    const real = layers.length - seeded;
    const peak = recomputePeak();
    const dur = durationRef.current;
    setReadout({
      sessionN: real + 1,
      layerCount: layers.length,
      seededCount: seeded,
      peakTime: peak >= 0 ? ((peak + 0.5) / BUCKETS) * dur : 0,
      duration: dur,
    });
  }, [recomputePeak]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let playFrac = -1;
    let live: number[] | null = null;
    if (playingRef.current && ctxRef.current) {
      const t = ctxRef.current.currentTime - startTimeRef.current;
      const dur = durationRef.current || 1;
      playFrac = Math.max(0, Math.min(1, t / dur));
      const bedrock = bedrockRef.current ?? new Array(BUCKETS).fill(0.3);
      live = blendSessionLayer(dwellRef.current, bedrock);
    }
    drawScene({
      canvas,
      layers: layersRef.current,
      liveProfile: live,
      playFrac,
      peakBucket: peakBucketRef.current,
      duration: durationRef.current,
      rms: rmsRef.current,
    });
  }, []);

  // persist with cap (drop oldest beyond LAYER_CAP)
  const persist = useCallback(async () => {
    if (layersRef.current.length > LAYER_CAP) {
      layersRef.current = layersRef.current.slice(
        layersRef.current.length - LAYER_CAP,
      );
    }
    if (storageMode === "indexeddb") {
      const ok = await writeLayers(trackId, layersRef.current);
      if (!ok) setStorageMode("memory");
    }
  }, [trackId, storageMode]);

  // deposit ONE stratum for the finishing session; idempotent per session
  const finishSession = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const listened = listenedRef.current;
    if (listened >= MIN_LISTEN_SEC) {
      const bedrock = bedrockRef.current ?? new Array(BUCKETS).fill(0.3);
      const profile = blendSessionLayer(dwellRef.current, bedrock);
      layersRef.current = [
        ...layersRef.current,
        { ts: Date.now(), seeded: false, profile },
      ];
      void persist();
    }
    refreshReadout();
    render();
  }, [persist, refreshReadout, render]);

  const teardownAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    playingRef.current = false;
    const src = sourceRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* detached */
      }
    }
    sourceRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ac = ctxRef.current;
    ctxRef.current = null;
    if (ac && ac.state !== "closed") void ac.close().catch(() => {});
  }, []);

  const stopPlayback = useCallback(() => {
    finishSession();
    teardownAudio();
    setPlaying(false);
  }, [finishSession, teardownAudio]);

  // rAF loop: accrete dwell under the playhead + redraw
  const loop = useCallback(() => {
    const ac = ctxRef.current;
    const master = masterRef.current;
    if (!ac || !master || !playingRef.current) return;
    const now = ac.currentTime;
    const dt = Math.max(0, now - lastFrameRef.current);
    lastFrameRef.current = now;
    const t = now - startTimeRef.current;
    const dur = durationRef.current || 1;

    // live RMS off the safeMaster tap
    const freq = freqRef.current;
    let rms = 0;
    if (freq) {
      master.analyser.getByteFrequencyData(freq);
      let s = 0;
      for (let i = 0; i < freq.length; i++) s += freq[i] * freq[i];
      rms = Math.sqrt(s / freq.length) / 255;
    }
    rmsRef.current = rms;

    if (t >= 0 && t < dur) {
      const b = Math.min(BUCKETS - 1, Math.floor((t / dur) * BUCKETS));
      // louder-attended moments weigh slightly more
      dwellRef.current[b] += dt * (0.6 + 0.8 * rms);
      listenedRef.current += dt;
    }

    render();
    rafRef.current = requestAnimationFrame(loop);
  }, [render]);

  const startPlayback = useCallback(async () => {
    setError(null);
    finishedRef.current = false;
    listenedRef.current = 0;
    dwellRef.current = new Array(BUCKETS).fill(0);

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    const ac = new Ctor();
    ctxRef.current = ac;
    try {
      await ac.resume();
    } catch {
      /* resume best-effort */
    }
    const master = createSafeMaster(ac);
    masterRef.current = master;
    freqRef.current = new Uint8Array(master.analyser.frequencyBinCount);

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(ac, trackId);
    } catch {
      setError("Couldn't load the recording — the remembered sediment still shows below.");
      teardownAudio();
      finishedRef.current = true;
      return;
    }
    if (ctxRef.current !== ac) return; // superseded (track change / unmount)

    bufferRef.current = loaded.buffer;
    durationRef.current = loaded.buffer.duration;

    const src = ac.createBufferSource();
    src.buffer = loaded.buffer;
    src.connect(master.input); // rule-10: bufferSource → safeMaster.input only
    src.onended = () => stopPlayback();
    sourceRef.current = src;
    startTimeRef.current = ac.currentTime;
    lastFrameRef.current = ac.currentTime;
    src.start(0);

    playingRef.current = true;
    setPlaying(true);
    refreshReadout();
    rafRef.current = requestAnimationFrame(loop);
  }, [trackId, teardownAudio, stopPlayback, refreshReadout, loop]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) stopPlayback();
    else void startPlayback();
  }, [startPlayback, stopPlayback]);

  // click a passage to replay it (continues the same session — accretes dwell)
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const ac = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    if (!playingRef.current || !ac || !master || !buffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const padX = 18;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - padX) / (rect.width - padX * 2)));
    const offset = frac * buffer.duration;

    const old = sourceRef.current;
    if (old) {
      old.onended = null;
      try {
        old.stop();
      } catch {
        /* stopped */
      }
      try {
        old.disconnect();
      } catch {
        /* detached */
      }
    }
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(master.input);
    src.onended = () => stopPlayback();
    sourceRef.current = src;
    startTimeRef.current = ac.currentTime - offset;
    src.start(0, offset);
  }, [stopPlayback]);

  // forget: clear real + seeded layers for this track (two-step confirm)
  const forget = useCallback(async () => {
    await deleteLayers(trackId);
    const bedrock = bedrockRef.current ?? new Array(BUCKETS).fill(0.3);
    const seeds = makeSeedLayers(bedrock, Math.floor(Date.now() % 1_000_000));
    layersRef.current = seeds;
    if (storageMode === "indexeddb") {
      const ok = await writeLayers(trackId, seeds);
      if (!ok) setStorageMode("memory");
    }
    setConfirmReset(false);
    refreshReadout();
    render();
  }, [trackId, storageMode, refreshReadout, render]);

  // load a track: persisted layers, bedrock, cold-load seeding
  const runLoadTrack = useCallback(
    async (id: string, cancelled: () => boolean) => {
      setError(null);
      setConfirmReset(false);
      layersRef.current = [];
      bedrockRef.current = null;
      durationRef.current = 0;
      render();

      // 1. persisted layers. readLayers returns null both for "no record" and
      // "blocked"; the seed write-back below confirms whether storage is usable.
      let stored = await readLayers(id);
      if (cancelled()) return;
      let mode: "indexeddb" | "memory" = "indexeddb";

      // 2. analysis → bedrock (+ duration estimate)
      const analysis = await loadTrackAnalysis(id).catch(() => null);
      if (cancelled()) return;
      let bedrock: number[] | null = null;
      let dur = 0;
      if (analysis && analysis.notes.length) {
        dur = analysis.notes.reduce(
          (m, n) => Math.max(m, n.time + n.duration),
          0,
        );
        bedrock = computeBedrockFromNotes(analysis.notes, dur);
      }

      // 3. fallback: decode the buffer for per-bucket RMS bedrock
      if (!bedrock) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) {
          const tmp = new Ctor();
          try {
            const loaded = await loadRealTrackBuffer(tmp, id);
            if (!cancelled()) {
              bedrock = computeBedrockFromBuffer(loaded.buffer);
              dur = loaded.buffer.duration;
            }
          } catch {
            /* leave bedrock null → flat fallback */
          } finally {
            void tmp.close().catch(() => {});
          }
        }
      }
      if (cancelled()) return;
      bedrock = bedrock ?? new Array(BUCKETS).fill(0.4);
      bedrockRef.current = bedrock;
      durationRef.current = dur;

      // 4. cold load with no stored record → pre-seed so it reads at a glance
      if (!stored || stored.length === 0) {
        stored = makeSeedLayers(bedrock, hashId(id));
        const ok = await writeLayers(id, stored);
        if (!ok) mode = "memory";
      }
      if (cancelled()) return;
      layersRef.current = stored;
      setStorageMode(mode);
      refreshReadout();
      render();
    },
    [refreshReadout, render],
  );

  // load-on-track-change; stop any playback first
  useEffect(() => {
    let cancelled = false;
    teardownAudio();
    setPlaying(false);
    void runLoadTrack(trackId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [trackId, runLoadTrack, teardownAudio]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      if (!finishedRef.current) finishSession();
      teardownAudio();
    };
  }, [finishSession, teardownAudio]);

  // no-2D-context guard + resize redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !canvas.getContext("2d")) {
      setNoCanvas(true);
      return;
    }
    const onResize = () => render();
    window.addEventListener("resize", onResize);
    render();
    return () => window.removeEventListener("resize", onResize);
  }, [render]);

  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const label =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 pb-8 pt-20 text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={label}>17136 · tidemark</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              A recording that remembers being heard
            </h1>
            <p className="mt-1 max-w-xl text-base text-muted-foreground">
              Every listening deposits a warm stratum of attention. Layers stack
              into a growing core sample — a geology of how the piece has been
              heard, across sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className={btnGhost}
          >
            Read the design notes
          </button>
        </header>

        <div className="relative min-h-[300px] flex-1 overflow-hidden rounded-lg border border-border">
          {noCanvas ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-base text-destructive">
              This browser has no 2D canvas context — the sediment view can&apos;t
              render here.
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className="block h-full w-full cursor-pointer"
              aria-label="Sediment cross-section of listening attention"
            />
          )}
        </div>

        {error && (
          <p className="text-base text-destructive" role="status">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={togglePlay} className={btnPrimary}>
            {playing ? "Pause" : "Play"}
          </button>

          <select
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
            aria-label="Choose a track"
          >
            {REAL_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>

          {confirmReset ? (
            <span className="flex items-center gap-2">
              <button type="button" onClick={forget} className={btnGhost}>
                Confirm — forget all
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className={btnGhost}
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className={btnGhost}
            >
              Forget / reset
            </button>
          )}
        </div>

        <div className="space-y-1">
          <p className={label}>
            session #{readout.sessionN} · {readout.layerCount} layers remembered ·
            most-returned passage at {formatClock(readout.peakTime)}
          </p>
          <p className="text-base text-muted-foreground">
            {readout.seededCount > 0
              ? `seeded with ${readout.seededCount} remembered listens · your sessions layer on top`
              : "all layers below are real listenings"}
            {storageMode === "memory" && " · storage blocked, remembering this session only"}
          </p>
          <p className="text-base text-muted-foreground">
            Click any passage while playing to replay it — attention accretes
            where you linger.
          </p>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Tidemark — design notes
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if a
                recording remembered being heard — growing a geological
                cross-section of collective attention across every listening
                session?
              </p>
              <p>
                <span className="text-foreground">The mechanism.</span> The
                track&apos;s duration is split into {BUCKETS} time-buckets. Each
                frame adds dwell to the bucket under the playhead (louder moments
                weigh slightly more), so pausing and replaying a passage accretes
                more sediment there. On pause or end, one thin stratum is
                deposited: its per-x thickness blends this session&apos;s dwell
                with the track&apos;s intrinsic bedrock (note-density × velocity
                from the analysis, or waveform RMS as a fallback).
              </p>
              <p>
                <span className="text-foreground">Persistence.</span> Every
                stratum is written to IndexedDB (one record per track, capped at{" "}
                {LAYER_CAP}). Returning re-stacks the whole history, oldest at the
                bottom. On a cold first load we pre-seed {SEED_MIN}–{SEED_MAX}
                &nbsp;synthetic remembered listens from the bedrock so the
                cross-section reads immediately; real sessions layer on top.
                Blocked storage degrades to a single in-memory session.
              </p>
              <p>
                <span className="text-foreground">References.</span> The
                cumulative, persistent-state growth idea from the first three.js
                Conference (Codrops, 2026); Katie Paterson and dendrochronology /
                geological core-sampling as the long-form-accretion art
                reference.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className={`mt-4 ${btnGhost}`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// stable numeric seed from a track id so a cold load is deterministic per track
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
