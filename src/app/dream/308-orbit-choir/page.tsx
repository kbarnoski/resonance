"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Orbit Choir — a head-tracked HRTF spatial piece with a ~6-minute arc.
//
// CYCLE 2 (deepen, 2026-06-04): the voices are now Karel's own *Welcome Home*
// piano recordings, fetched live from the public /api/featured + /api/audio
// routes. Each track becomes a spatially-panned voice scattered around your
// head, blurred and detuned; over the arc they orbit inward, sharpen, and
// settle to natural pitch — you gather his album into a room around you, in the
// spirit of Janet Cardiff's *The Forty Part Motet* (forty singers as forty
// speakers you walk among). Turn your phone (or drag) to face a voice: it
// swells, sharpens, gathers home faster, and the phone gives a tiny haptic
// pulse the instant it locks home. The room remembers how far you gathered it
// across sessions (localStorage). If his album can't be reached, it falls back
// to the original synthesised resolving-chord choir so the piece is always
// demoable.
// ─────────────────────────────────────────────────────────────────────────────

const ARC_SECONDS = 360; // ~6 minutes
const MAX_VOICES = 7;

// Synth fallback — a warm natural-minor add9 with a stacked-fifth glow.
// A natural minor (A2) → E3 → A3 → C4 → E4 → B4(add9) → G4(b7).
const TARGET_HZ = [110.0, 164.81, 220.0, 261.63, 329.63, 493.88, 392.0];

// At t=0 each voice is detuned by these (semitone-ish) offsets into a cluster.
const START_DETUNE_SEMITONES = [-0.9, 1.4, -1.8, 0.7, -1.2, 2.1, -0.5];

// Scattered start azimuths (radians); resolve to an even spread over the arc.
const START_AZIMUTH = [0.4, 2.9, 1.1, 5.6, 3.7, 0.9, 4.4];

// localStorage key — "how far you'd gathered the room", 0..1.
const GATHER_KEY = "resonance.dream.orbit-choir.gather.v1";

// ── types ────────────────────────────────────────────────────────────────────

interface VoiceNodes {
  kind: "synth" | "stem";
  oscs: OscillatorNode[]; // synth only
  src: AudioBufferSourceNode | null; // stem only
  startRate: number; // stem: initial detuned playbackRate
  baseGain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  title: string;
  // arc state
  azimuth: number;
  radius: number;
  progress: number; // 0..1 personal resolution (shepherded forward)
  swell: number; // 0..1 facing swell (smoothed)
  resolvedFired: boolean; // haptic-once latch
}

type Phase = "idle" | "loading" | "running" | "resolved" | "no-audio";

// Public /api/featured shape (only the fields we read).
interface FeaturedRecording {
  id: string;
  title?: string | null;
}
interface FeaturedTrack {
  recordings?: FeaturedRecording | FeaturedRecording[] | null;
}
interface FeaturedAlbum {
  id: string;
  name?: string;
  artist?: string;
  description?: string;
  featured_album_tracks?: FeaturedTrack[];
}

// Narrow interfaces for legacy Web Audio fallbacks (no `any`).
interface LegacyPanner {
  setPosition(x: number, y: number, z: number): void;
  setOrientation(x: number, y: number, z: number): void;
}
interface LegacyListener {
  setPosition(x: number, y: number, z: number): void;
  setOrientation(
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ): void;
}
interface OrientationPermissionDOE {
  requestPermission?: () => Promise<"granted" | "denied">;
}

// ── helpers (NOT named useX) ───────────────────────────────────────────────────

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function semitonesToRatio(st: number): number {
  return Math.pow(2, st / 12);
}

function buzz(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported */
    }
  }
}

function readGather(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(GATHER_KEY);
    if (!raw) return 0;
    const o = JSON.parse(raw) as { p?: number };
    if (typeof o.p === "number" && o.p > 0 && o.p < 1) return o.p;
  } catch {
    /* ignore */
  }
  return 0;
}

function writeGather(p: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GATHER_KEY, JSON.stringify({ p, ts: Date.now() }));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function clearGather(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GATHER_KEY);
  } catch {
    /* ignore */
  }
}

// Synthesize a short reverb impulse from decaying filtered noise (no files).
function makeImpulse(actx: AudioContext): AudioBuffer {
  const rate = actx.sampleRate;
  const len = Math.round(rate * 2.6);
  const buf = actx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 2.4);
      const white = Math.random() * 2 - 1;
      last = last * 0.78 + white * 0.22;
      data[i] = last * decay;
    }
  }
  return buf;
}

// easeInOut for the macro arc so the resolution breathes rather than ramps.
function easeArc(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function applyPannerPosition(
  panner: PannerNode,
  x: number,
  y: number,
  z: number,
  when: number,
): void {
  const modern = panner as PannerNode & { positionX?: AudioParam };
  if (modern.positionX) {
    modern.positionX.setTargetAtTime(x, when, 0.08);
    (panner as PannerNode & { positionY: AudioParam }).positionY.setTargetAtTime(
      y,
      when,
      0.08,
    );
    (panner as PannerNode & { positionZ: AudioParam }).positionZ.setTargetAtTime(
      z,
      when,
      0.08,
    );
  } else {
    (panner as unknown as LegacyPanner).setPosition(x, y, z);
  }
}

function applyListenerForward(
  listener: AudioListener,
  yaw: number,
  when: number,
): void {
  const fx = Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const modern = listener as AudioListener & { forwardX?: AudioParam };
  if (modern.forwardX) {
    modern.forwardX.setTargetAtTime(fx, when, 0.05);
    (listener as AudioListener & { forwardY: AudioParam }).forwardY.setTargetAtTime(0, when, 0.05);
    (listener as AudioListener & { forwardZ: AudioParam }).forwardZ.setTargetAtTime(fz, when, 0.05);
    (listener as AudioListener & { upX: AudioParam }).upX.setValueAtTime(0, when);
    (listener as AudioListener & { upY: AudioParam }).upY.setValueAtTime(1, when);
    (listener as AudioListener & { upZ: AudioParam }).upZ.setValueAtTime(0, when);
  } else {
    (listener as unknown as LegacyListener).setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

// Pull up to `n` recording rows, spread evenly across the album's track list.
function spreadTracks(album: FeaturedAlbum, n: number): FeaturedRecording[] {
  const tracks = album.featured_album_tracks ?? [];
  const recs: FeaturedRecording[] = [];
  for (const t of tracks) {
    const r = Array.isArray(t.recordings) ? t.recordings[0] : t.recordings;
    if (r && r.id) recs.push(r);
  }
  if (recs.length <= n) return recs;
  const out: FeaturedRecording[] = [];
  for (let i = 0; i < n; i++) out.push(recs[Math.floor((i * recs.length) / n)]);
  return out;
}

// Fetch + decode Karel's featured album into per-voice AudioBuffers.
// Returns [] on any failure so the caller can fall back to the synth choir.
async function loadStems(
  actx: AudioContext,
): Promise<{ buffer: AudioBuffer; title: string }[]> {
  let albums: FeaturedAlbum[] = [];
  try {
    const res = await fetch("/api/featured");
    if (!res.ok) return [];
    albums = (await res.json()) as FeaturedAlbum[];
  } catch {
    return [];
  }
  if (!Array.isArray(albums) || albums.length === 0) return [];

  // Prefer an album that names "welcome" / "karel"; else the first.
  const album =
    albums.find((a) =>
      `${a.name ?? ""} ${a.artist ?? ""} ${a.description ?? ""}`
        .toLowerCase()
        .match(/welcome|karel/),
    ) ?? albums[0];

  const chosen = spreadTracks(album, MAX_VOICES);
  if (chosen.length === 0) return [];

  const loadOne = async (
    rec: FeaturedRecording,
  ): Promise<{ buffer: AudioBuffer; title: string } | null> => {
    try {
      const r = await fetch(`/api/audio/${encodeURIComponent(rec.id)}`);
      if (!r.ok) return null;
      const ctype = r.headers.get("content-type") || "";
      let data: ArrayBuffer;
      if (ctype.includes("application/json")) {
        const j = (await r.json()) as { url?: string };
        if (!j.url) return null;
        const ar = await fetch(j.url);
        if (!ar.ok) return null;
        data = await ar.arrayBuffer();
      } else {
        data = await r.arrayBuffer();
      }
      const buffer = await actx.decodeAudioData(data);
      return { buffer, title: rec.title || "untitled" };
    } catch {
      return null;
    }
  };

  const settled = await Promise.allSettled(chosen.map(loadOne));
  const out: { buffer: AudioBuffer; title: string }[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) out.push(s.value);
  }
  return out;
}

// ── component ──────────────────────────────────────────────────────────────────

export default function OrbitChoirPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [clock, setClock] = useState(0);
  const [sensorActive, setSensorActive] = useState(false);
  const [arcLabel, setArcLabel] = useState("scattered");
  const [sourceLabel, setSourceLabel] = useState("");
  const [facedTitle, setFacedTitle] = useState("");
  const [savedGather, setSavedGather] = useState(0);

  // audio refs
  const actxRef = useRef<AudioContext | null>(null);
  const voicesRef = useRef<VoiceNodes[]>([]);
  const masterRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const lastSaveRef = useRef(0);

  // interaction refs
  const yawRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef(0);
  const autoTourRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // restore the "how far you'd gathered the room" badge on mount
  useEffect(() => {
    setSavedGather(readGather());
  }, []);

  // ── canvas draw loop ─────────────────────────────────────────────────────────
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(139, 92, 246, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(196, 181, 253, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    const yaw = yawRef.current;
    const fx = cx + Math.sin(yaw) * R * 1.06;
    const fy = cy - Math.cos(yaw) * R * 1.06;
    ctx.strokeStyle = "rgba(196, 181, 253, 0.5)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(fx, fy);
    ctx.stroke();

    for (const v of voicesRef.current) {
      const vr = R * v.radius;
      const px = cx + Math.sin(v.azimuth) * vr;
      const py = cy - Math.cos(v.azimuth) * vr;
      const glow = 0.22 + v.swell * 0.55 + v.progress * 0.15;
      ctx.fillStyle = `rgba(167, 139, 250, ${Math.min(0.85, glow)})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + v.swell * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  // ── per-frame arc + interaction update ───────────────────────────────────────
  const tick = useCallback(() => {
    const actx = actxRef.current;
    if (!actx) return;
    const now = actx.currentTime;
    const elapsed = now - startTimeRef.current;
    const globalT = Math.min(1, elapsed / ARC_SECONDS);
    const eased = easeArc(globalT);

    if (autoTourRef.current) {
      yawRef.current = Math.sin(elapsed * 0.05) * 1.4;
    }
    const yaw = yawRef.current;
    applyListenerForward(actx.listener, yaw, now);

    let allResolved = true;
    let bestFace = 0;
    let bestTitle = "";
    for (let i = 0; i < voicesRef.current.length; i++) {
      const v = voicesRef.current[i];
      const n = voicesRef.current.length;

      let da = v.azimuth - yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const facing = Math.max(0, 1 - Math.abs(da) / 0.7);
      v.swell += (facing - v.swell) * 0.08;
      if (v.swell > bestFace) {
        bestFace = v.swell;
        bestTitle = v.title;
      }

      v.progress = Math.max(v.progress, globalT);
      if (facing > 0.35) {
        v.progress = Math.min(1, v.progress + facing * 0.0016);
      }
      const p = Math.max(eased, easeArc(v.progress));
      if (v.progress < 0.999) allResolved = false;

      // haptic: pulse once the instant a *faced* voice locks home
      if (!v.resolvedFired && v.progress >= 0.92 && v.swell > 0.35) {
        buzz(26);
        v.resolvedFired = true;
      }

      const targetAz = (i / n) * Math.PI * 2;
      const startAz = START_AZIMUTH[i % START_AZIMUTH.length];
      let azDelta = targetAz - startAz;
      while (azDelta > Math.PI) azDelta -= Math.PI * 2;
      while (azDelta < -Math.PI) azDelta += Math.PI * 2;
      v.azimuth = startAz + azDelta * p;

      v.radius = 1.0 - 0.55 * p;

      const dist = 1.2 + v.radius * 4.5;
      const px = Math.sin(v.azimuth) * dist;
      const pz = -Math.cos(v.azimuth) * dist;
      applyPannerPosition(v.panner, px, 0, pz, now);

      if (v.kind === "stem" && v.src) {
        // sharpen the recording: detuned + dark when scattered → true + bright
        const rate = v.startRate + (1 - v.startRate) * p;
        v.src.playbackRate.setTargetAtTime(rate, now, 0.5);
        const cutoff = 540 + p * 5600 + v.swell * 1800;
        v.filter.frequency.setTargetAtTime(cutoff, now, 0.3);
        const lvl = 0.09 + v.swell * 0.17 + p * 0.05;
        v.baseGain.gain.setTargetAtTime(lvl, now, 0.2);
      } else {
        // synth fallback: glide pitch from the detuned cluster to the chord
        const startHz =
          TARGET_HZ[i] * semitonesToRatio(START_DETUNE_SEMITONES[i]);
        const hz = startHz + (TARGET_HZ[i] - startHz) * p;
        for (let o = 0; o < v.oscs.length; o++) {
          const harmonic = o === 0 ? 1 : o === 1 ? 2 : 3;
          v.oscs[o].frequency.setTargetAtTime(hz * harmonic, now, 0.3);
        }
        const lvl = 0.16 + v.swell * 0.12 + p * 0.04;
        v.baseGain.gain.setTargetAtTime(lvl, now, 0.2);
      }
    }

    // persist gathered-progress at most ~every 4s, monotonic
    if (globalT > 0.01 && globalT < 0.999 && now - lastSaveRef.current > 4) {
      lastSaveRef.current = now;
      writeGather(globalT);
    }

    setClock(elapsed);
    setFacedTitle(bestFace > 0.45 ? bestTitle : "");
    setArcLabel(
      globalT < 0.12
        ? "scattered"
        : globalT < 0.45
          ? "drifting in"
          : globalT < 0.8
            ? "gathering"
            : globalT < 0.999
              ? "almost home"
              : "resolved",
    );

    if (allResolved && globalT >= 0.999 && phase === "running") {
      clearGather();
      buzz([18, 40, 18]);
      setPhase("resolved");
    }

    drawMap();
    rafRef.current = requestAnimationFrame(tick);
  }, [drawMap, phase]);

  // ── build the audio graph & start ────────────────────────────────────────────
  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setPhase("no-audio");
      return;
    }
    const actx = new AC();
    actxRef.current = actx;
    await actx.resume();

    const master = actx.createGain();
    master.gain.value = 0;
    master.connect(actx.destination);
    masterRef.current = master;

    const convolver = actx.createConvolver();
    convolver.buffer = makeImpulse(actx);
    const reverbGain = actx.createGain();
    reverbGain.gain.value = 0.32;
    convolver.connect(reverbGain).connect(master);

    const listener = actx.listener;
    const modernL = listener as AudioListener & { positionX?: AudioParam };
    if (modernL.positionX) {
      modernL.positionX.value = 0;
      (listener as AudioListener & { positionY: AudioParam }).positionY.value = 0;
      (listener as AudioListener & { positionZ: AudioParam }).positionZ.value = 0;
    } else {
      (listener as unknown as LegacyListener).setPosition(0, 0, 0);
    }

    // try Karel's real album first; fall back to the synth choir
    setPhase("loading");
    let stems: { buffer: AudioBuffer; title: string }[] = [];
    try {
      stems = await loadStems(actx);
    } catch {
      stems = [];
    }
    // the context may have been torn down while we awaited
    if (actxRef.current !== actx) return;

    const useStems = stems.length >= 2;
    const count = useStems
      ? Math.min(MAX_VOICES, stems.length)
      : TARGET_HZ.length;

    const buildPanner = () => {
      const panner = actx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.rolloffFactor = 0.6;
      return panner;
    };

    const voices: VoiceNodes[] = [];
    for (let i = 0; i < count; i++) {
      const panner = buildPanner();
      const filter = actx.createBiquadFilter();
      filter.type = "lowpass";
      const baseGain = actx.createGain();

      const lfo = actx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + Math.random() * 0.05;
      const lfoGain = actx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(baseGain.gain);
      lfo.start();

      filter.connect(baseGain);
      baseGain.connect(panner);
      panner.connect(master);
      panner.connect(convolver);

      let oscs: OscillatorNode[] = [];
      let src: AudioBufferSourceNode | null = null;
      let startRate = 1;
      let title = "";

      if (useStems) {
        const stem = stems[i];
        title = stem.title;
        filter.frequency.value = 540;
        filter.Q.value = 0.5;
        baseGain.gain.value = 0.09;
        startRate = semitonesToRatio(
          START_DETUNE_SEMITONES[i % START_DETUNE_SEMITONES.length] * 0.55,
        );
        src = actx.createBufferSource();
        src.buffer = stem.buffer;
        src.loop = true;
        src.playbackRate.value = startRate;
        src.connect(filter);
        // start each track at a different offset so they aren't phase-locked
        const off = (stem.buffer.duration * (i * 0.137)) % stem.buffer.duration;
        src.start(0, off);
      } else {
        filter.frequency.value = 1400;
        filter.Q.value = 0.4;
        baseGain.gain.value = 0.16;
        title = "voice";
        const startHz =
          TARGET_HZ[i] * semitonesToRatio(START_DETUNE_SEMITONES[i]);
        const oscCount = i % 2 === 0 ? 3 : 2;
        oscs = [];
        for (let o = 0; o < oscCount; o++) {
          const osc = actx.createOscillator();
          osc.type = "sine";
          const harmonic = o === 0 ? 1 : o === 1 ? 2 : 3;
          osc.frequency.value = startHz * harmonic;
          osc.detune.value = o === 0 ? 0 : (Math.random() * 2 - 1) * 4;
          const hGain = actx.createGain();
          hGain.gain.value = o === 0 ? 1 : o === 1 ? 0.28 : 0.14;
          osc.connect(hGain).connect(filter);
          osc.start();
          oscs.push(osc);
        }
      }

      voices.push({
        kind: useStems ? "stem" : "synth",
        oscs,
        src,
        startRate,
        baseGain,
        lfo,
        lfoGain,
        filter,
        panner,
        title,
        azimuth: START_AZIMUTH[i % START_AZIMUTH.length],
        radius: 1.0,
        progress: 0,
        swell: 0,
        resolvedFired: false,
      });
    }
    voicesRef.current = voices;

    setSourceLabel(
      useStems
        ? `Karel's Welcome Home · ${count} voices`
        : "synthesised choir (album offline)",
    );

    // resume from however far the room was gathered last session
    const resume = readGather();
    startTimeRef.current = actx.currentTime - resume * ARC_SECONDS;
    lastSaveRef.current = actx.currentTime;

    master.gain.setValueAtTime(0, actx.currentTime);
    master.gain.linearRampToValueAtTime(0.7, actx.currentTime + 6);

    setPhase("running");
    setClock(0);
    rafRef.current = requestAnimationFrame(tick);

    const DOE = (
      window as unknown as { DeviceOrientationEvent?: OrientationPermissionDOE }
    ).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") setSensorActive(true);
      } catch {
        setSensorActive(false);
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      setSensorActive(true);
    }
  }, [tick]);

  // ── teardown ─────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const actx = actxRef.current;
    if (actx) {
      for (const v of voicesRef.current) {
        try {
          v.oscs.forEach((o) => o.stop());
          v.src?.stop();
          v.lfo.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.panner.disconnect();
          v.baseGain.disconnect();
          v.filter.disconnect();
          v.src?.disconnect();
        } catch {
          /* noop */
        }
      }
      voicesRef.current = [];
      try {
        masterRef.current?.disconnect();
      } catch {
        /* noop */
      }
      actx.close().catch(() => undefined);
    }
    actxRef.current = null;
    masterRef.current = null;
  }, []);

  const beginAgain = useCallback(() => {
    stopAll();
    clearGather();
    setSavedGather(0);
    setPhase("idle");
    setClock(0);
    setFacedTitle("");
    yawRef.current = 0;
    autoTourRef.current = true;
  }, [stopAll]);

  // ── device orientation listener ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" && phase !== "resolved") return;
    function onOrient(e: DeviceOrientationEvent) {
      if (e.alpha == null) return;
      autoTourRef.current = false;
      setSensorActive(true);
      yawRef.current = (e.alpha * Math.PI) / 180;
    }
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [phase]);

  // ── pointer + keyboard fallback ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" && phase !== "resolved") return;
    function onDown(e: PointerEvent) {
      draggingRef.current = true;
      autoTourRef.current = false;
      lastPointerRef.current = e.clientX;
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current;
      lastPointerRef.current = e.clientX;
      yawRef.current += dx * 0.006;
    }
    function onUp() {
      draggingRef.current = false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        autoTourRef.current = false;
        yawRef.current -= 0.12;
      } else if (e.key === "ArrowRight") {
        autoTourRef.current = false;
        yawRef.current += 0.12;
      }
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  // ── cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  // ── canvas sizing ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const size = 320;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  const progressPct = Math.min(100, (clock / ARC_SECONDS) * 100);

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#05050a] text-foreground">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80"
        aria-hidden
      />

      {(phase === "running" || phase === "resolved") && (
        <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <p className="text-base text-muted-foreground tabular-nums">
            {formatClock(clock)} — {arcLabel}
          </p>
          <div className="mx-auto mt-2 h-px w-48 bg-muted">
            <div
              className="h-px bg-violet-300/60"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {sourceLabel && (
            <p className="mt-2 text-xs text-muted-foreground">{sourceLabel}</p>
          )}
          {facedTitle && (
            <p className="mt-1 text-base text-violet-300">{facedTitle}</p>
          )}
        </div>
      )}

      {phase === "idle" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <h1 className="font-semibold text-2xl text-foreground">Orbit Choir</h1>
          <p className="mt-4 text-base text-foreground">
            Karel&apos;s <span className="text-violet-300">Welcome Home</span>{" "}
            piano recordings become a circle of voices scattered around your
            head, blurred and out of tune. Over about six minutes they orbit
            inward, sharpen, and settle — you gather his whole album into a room
            around you, a spatial <span className="italic">Forty Part Motet</span>{" "}
            of his own music.
          </p>
          <p className="mt-4 text-base text-foreground">
            Use <span className="text-violet-300">headphones</span> — the spatial
            field is rendered binaurally (HRTF) and won&apos;t work on speakers.
          </p>
          <button
            onClick={start}
            className="mt-8 min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/10 px-6 py-2.5 text-base text-foreground transition hover:bg-violet-500/20"
          >
            {savedGather > 0.02 ? "Return to the room" : "Begin the orbit"}
          </button>
          {savedGather > 0.02 && (
            <p className="mt-4 text-base text-violet-300/95">
              Your room was {Math.round(savedGather * 100)}% gathered — it
              remembers.
            </p>
          )}
          <p className="mt-6 text-base text-muted-foreground">
            Turn to face a voice and it gathers home faster. No phone sensor?
            Drag left/right or use arrow keys. A slow auto-tour plays hands-free.
          </p>
        </div>
      )}

      {phase === "loading" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <p className="text-xl text-foreground">Gathering the room…</p>
          <p className="mt-3 text-base text-muted-foreground">
            Loading Karel&apos;s recordings into the spatial field.
          </p>
        </div>
      )}

      {phase === "running" && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 px-6 text-center">
          {!sensorActive && (
            <p className="text-base text-violet-300">
              Motion sensor not active — drag or use arrow keys to turn; a slow
              auto-tour is guiding the field.
            </p>
          )}
          {sensorActive && (
            <p className="text-base text-muted-foreground">
              Turn to face a voice — it swells, sharpens, and gathers home a
              little faster.
            </p>
          )}
        </div>
      )}

      {phase === "resolved" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <p className="text-xl text-foreground">The room is whole.</p>
          <p className="mt-3 text-base text-foreground">
            Every voice has orbited home, sharpened, and settled around you.
            Rest in it, or begin the scattering again.
          </p>
          <button
            onClick={beginAgain}
            className="mt-6 min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/10 px-6 py-2.5 text-base text-foreground transition hover:bg-violet-500/20"
          >
            Begin again
          </button>
        </div>
      )}

      {phase === "no-audio" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <p className="text-base text-violet-300">
            This browser doesn&apos;t support the Web Audio API, so the spatial
            choir can&apos;t play here. Try a recent Chrome, Safari, or Firefox.
          </p>
        </div>
      )}

      <a
        href="/dream/308-orbit-choir/README.md"
        className="absolute bottom-4 right-4 text-base text-muted-foreground underline-offset-4 hover:underline"
      >
        Read the design notes
      </a>
    </main>
  );
}
