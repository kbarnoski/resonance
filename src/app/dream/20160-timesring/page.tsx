"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 20160-timesring — Times Ring
//
// ONE question: what if conducting your own recording sculpted a living
// string-art figure — and the exact number of petals you SEE is the harmonic
// color you HEAR?
//
// The whole piece turns on a SINGLE scalar `k`:
//   · VISUAL  — the modular-multiplication figure. Place N pegs evenly on a
//               circle; draw a chord from peg i to peg round(k·i) mod N for
//               every i. As k morphs the envelope morphs: k≈2 → cardioid
//               (1 cusp), k≈3 → nephroid (2 cusps), k≈4 → 3 cusps … so the
//               cusp count you SEE is round(k) − 1.
//   · AUDIBLE — round(k) is the number of ACTIVE resonant partials in a
//               bandpass bank tuned to the 1st..round(k) harmonics of the
//               current chord's root, applied to Karel's real recording. The
//               count you HEAR == the count you SEE. (Airtight: the bank is the
//               only thing that voices the count — no interval tap to muddy it.)
//
// `k` = a base driven by HIS music (chord root/quality from loadTrackAnalysis,
// or a spectral read when analysis is absent) PLUS the conductor's continuous
// offset. His harmony sculpts the base figure; the conductor bends it live.
//
// Conductor is POINTER-FIRST: pointer + keyboard drive the IDENTICAL control
// chain as the one-hand camera, so the whole thing is self-verifiable with no
// webcam. Idle (no camera, no pointer) lets his music alone drive k so the ring
// breathes and the resonators sing — the screen is never blank.
//
// Visual is Canvas2D ONLY (no WebGL): thin violet-phosphor chords, "lighter"
// compositing + a per-frame trail fade. Audio terminates at safeMaster.input,
// never ctx.destination. No oscillators — every voice is HIS buffer.
//
// Reference: Mathologer / Burkard Polster, modular-multiplication "times tables
// on a circle" (cardioid, nephroid, roses). Fresh anchor: Bluzaborges Modular
// Cardioid v1.0.0 (GitHub, 2026-10-01).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  loadRealTrackBuffer,
  WELCOME_HOME_TRACKS,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── constants ────────────────────────────────────────────────────────────────
const K_MIN = 2;
const K_MAX = 9;
const N_MIN = 90;
const N_MAX = 360;
const MAX_PARTIALS = K_MAX; // one bandpass resonator per possible partial

const DESCRIPTION =
  "Conduct your own recording and it sculpts a living string-art figure on a ring of pegs — and the exact number of petals you see is the number of harmonic partials you hear.";
const HOW_TO = [
  "Press Play to sound your recording",
  "Move your hand left/right (or drag across the ring) to morph the figure",
  "Raise your hand (or drag up) to add pegs",
  "Open your hand (or hold / press Space) to complete the figure and deepen the resonance",
  "Arrow keys conduct too — no camera needed",
];

// ── small math helpers (NOT hooks) ────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

interface Resonator {
  flt: BiquadFilterNode;
  g: GainNode;
}

interface Engine {
  actx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  src: AudioBufferSourceNode;
  dryGain: GainNode;
  sendGain: GainNode;
  resonators: Resonator[];
  resonatorSum: GainNode;
  startTime: number;
  analysis: TrackAnalysis | null;
  freqData: Uint8Array<ArrayBuffer>;
  // smoothed control state (0..1 / continuous)
  musicK: number; // base k from his music
  kOffset: number; // conductor's continuous offset
  nNorm: number; // 0..1 → peg count
  open: number; // 0..1 draw-up + resonance depth
  rootPc: number; // current chord root (0..11)
  breath: number; // idle breathing phase
  lastMs: number;
  lastHandMs: number;
}

interface Readout {
  kInt: number;
  cusps: number;
  partials: number;
  n: number;
  driver: "camera" | "pointer" | "idle";
  analysisLive: boolean;
}

// ── derive the music-driven base k + current root from the analysis/spectrum ──
function runMusicBase(eng: Engine): { k: number; rootPc: number } {
  const a = eng.analysis;
  if (a && a.chords.length > 0) {
    const dur = Math.max(1, eng.buffer.duration);
    const t = (eng.actx.currentTime - eng.startTime) % dur;
    let cur = a.chords[0];
    for (const ch of a.chords) {
      if (ch.time <= t) cur = ch;
      else break;
    }
    const pc = chordRoot(cur.chord);
    const rootPc = pc == null ? eng.rootPc : pc;
    // His harmony sculpts the base: walk the root around the circle of fifths so
    // neighbouring keys give neighbouring figures; minor darkens (fewer petals).
    const fifth = (rootPc * 7) % 12;
    let base = 2.2 + (fifth / 11) * 4.0; // 2.2 .. 6.2
    if (chordIsMinor(cur.chord)) base -= 0.4;
    return { k: clamp(base, K_MIN, K_MAX), rootPc };
  }
  // No analysis → spectral fallback so the piece still sings. Spectral centroid
  // of the tamed master signal drives the base; brighter playing → more petals.
  const data = eng.freqData;
  let num = 0;
  let den = 0;
  for (let i = 0; i < data.length; i++) {
    num += i * data[i];
    den += data[i];
  }
  const centroid = den > 0 ? num / den / data.length : 0.25; // 0..1
  const base = 2.5 + clamp01(centroid * 1.6) * 3.3; // 2.5 .. 5.8
  return { k: clamp(base, K_MIN, K_MAX), rootPc: eng.rootPc };
}

// ── push the single scalar into the resonator bank (the AUDIBLE count) ────────
function applyAudioParams(eng: Engine, k: number) {
  const now = eng.actx.currentTime;
  const partials = Math.round(k); // 2..9 — this IS the count you hear
  const wet = eng.open;
  const rootFreq = midiToFreq(48 + eng.rootPc); // root near C3
  for (let n = 0; n < eng.resonators.length; n++) {
    const r = eng.resonators[n];
    const harmonic = n + 1;
    const f = clamp(rootFreq * harmonic, 60, 3800);
    r.flt.frequency.setTargetAtTime(f, now, 0.12);
    r.flt.Q.setTargetAtTime(6 + wet * 14, now, 0.12);
    const active = harmonic <= partials;
    // gentle roll-off across the active partials so the stack reads as a vowel,
    // not a buzz; inactive partials are driven to silence.
    const g = active ? (0.16 + wet * 0.5) * (1 - (harmonic - 1) / (partials + 3)) : 0.0001;
    r.g.gain.setTargetAtTime(g, now, 0.12);
  }
  // Pull the dry back a touch as resonance deepens so the partials stay audible.
  eng.dryGain.gain.setTargetAtTime(0.78 - wet * 0.22, now, 0.12);
}

// ── draw the modular-multiplication string-art figure (Canvas2D only) ─────────
function drawFigure(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  k: number,
  drawFrac: number,
  energy: number,
) {
  // phosphor persistence: fade the previous frame toward near-black violet.
  c2d.globalCompositeOperation = "source-over";
  c2d.fillStyle = "rgba(5, 3, 12, 0.22)";
  c2d.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.42 * (1 + energy * 0.03);
  const count = Math.max(2, Math.floor(n * drawFrac));

  c2d.globalCompositeOperation = "lighter";
  c2d.lineCap = "round";

  const pt = (i: number): [number, number] => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  };

  // Two passes per chord: a wide faint halo + a thin bright core = phosphor glow.
  for (let i = 0; i < count; i++) {
    const j = Math.round(k * i) % n;
    const [x1, y1] = pt(i);
    const [x2, y2] = pt(j);
    // recency: chords near the draw-front read brightest, like a fresh stroke.
    const recency = 1 - i / count;
    const hue = 262 + (recency * 26); // 262..288 — stays violet, never cyan/green
    const light = 54 + energy * 18 + recency * 16;

    c2d.beginPath();
    c2d.moveTo(x1, y1);
    c2d.lineTo(x2, y2);
    c2d.strokeStyle = `hsla(${hue}, 85%, ${clamp(light, 40, 86)}%, 0.05)`;
    c2d.lineWidth = 2.6;
    c2d.stroke();

    c2d.beginPath();
    c2d.moveTo(x1, y1);
    c2d.lineTo(x2, y2);
    c2d.strokeStyle = `hsla(${hue}, 90%, ${clamp(light + 8, 46, 92)}%, 0.16)`;
    c2d.lineWidth = 0.9;
    c2d.stroke();
  }

  // bone-white pegs on the ring — a sparse accent, brighter at the draw-front.
  c2d.globalCompositeOperation = "lighter";
  const pegStep = Math.max(1, Math.floor(n / 120));
  for (let i = 0; i < n; i += pegStep) {
    const [px, py] = pt(i);
    const atFront = i < count;
    c2d.beginPath();
    c2d.arc(px, py, atFront ? 1.3 : 0.8, 0, Math.PI * 2);
    c2d.fillStyle = atFront
      ? "rgba(245, 243, 234, 0.5)"
      : "rgba(196, 181, 253, 0.18)";
    c2d.fill();
  }
  c2d.globalCompositeOperation = "source-over";
}

export default function TimesRingPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number>(0);

  // control inputs (refs so the render loop never restarts)
  const pointerActiveRef = useRef(false);
  const pointerDownRef = useRef(false);
  const pointerXRef = useRef(0.5);
  const pointerYRef = useRef(0.5);
  const camWantRef = useRef(false);
  const handSeenRef = useRef(false);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<"idle" | "loading" | "running" | "error">("idle");

  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [camState, setCamState] = useState<
    "off" | "requesting" | "live" | "denied" | "failed"
  >("off");
  const camStateRef = useRef<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const [handSeen, setHandSeen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [readout, setReadout] = useState<Readout>({
    kInt: 3,
    cusps: 2,
    partials: 3,
    n: 180,
    driver: "idle",
    analysisLive: false,
  });
  const readoutRef = useRef<Readout>(readout);

  const { immersive, toggle } = useImmersive();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    camStateRef.current = camState;
  }, [camState]);

  // ── the render loop — camera / pointer / idle all converge here ────────────
  const runFrame = useCallback((nowMs: number) => {
    const eng = engineRef.current;
    const canvas = canvasRef.current;
    if (!eng || !canvas) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const c2d = canvas.getContext("2d");
    if (!c2d) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }

    const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
    eng.lastMs = nowMs;
    eng.breath += dt * 0.22;

    // DPR-aware sizing
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── resolve the control target from ONE of the three drivers ──
    let driver: "camera" | "pointer" | "idle" = "idle";
    let kOffsetTarget = 0;
    let nTarget = eng.nNorm;
    let openTarget = 0.85;

    let handThisFrame = false;
    const video = videoRef.current;
    if (camWantRef.current && trackerRef.current && video && video.readyState >= 2) {
      let res: { landmarks: { x: number; y: number; z: number }[][] } | null = null;
      try {
        res = trackerRef.current.detectForVideo(video, nowMs);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks[0]) {
        const f = computeHandFeatures(res.landmarks[0]);
        handThisFrame = true;
        eng.lastHandMs = nowMs;
        driver = "camera";
        kOffsetTarget = f.cx * 2.3; // slide cardioid ↔ nephroid ↔ rose
        nTarget = f.height; // raise hand → more pegs
        openTarget = f.open; // open hand → complete figure + deepen resonance
      }
    }
    if (!handThisFrame) {
      if (camStateRef.current === "live") {
        // camera on but no hand this frame — hold the last reading gently.
        driver = "camera";
        kOffsetTarget = eng.kOffset;
        nTarget = eng.nNorm;
        openTarget = eng.open;
      } else if (pointerActiveRef.current) {
        // IDENTICAL control chain as the camera, driven by pointer/keyboard.
        driver = "pointer";
        kOffsetTarget = (pointerXRef.current - 0.5) * 2 * 2.3;
        nTarget = 1 - pointerYRef.current;
        openTarget = pointerDownRef.current ? 1 : 0.4;
      } else {
        // idle: his music alone drives k; the ring breathes autonomously.
        driver = "idle";
        kOffsetTarget = 0;
        nTarget = 0.5 + 0.34 * Math.sin(eng.breath);
        openTarget = 0.85;
      }
    }
    if (handThisFrame !== handSeenRef.current) {
      handSeenRef.current = handThisFrame;
      setHandSeen(handThisFrame);
    }

    // ── smooth the controls (conducting, not twitching) ──
    eng.kOffset += (kOffsetTarget - eng.kOffset) * 0.08;
    eng.nNorm += (nTarget - eng.nNorm) * 0.06;
    eng.open += (openTarget - eng.open) * 0.1;

    // energy + music base (also refreshes freqData for the spectral fallback)
    eng.master.analyser.getByteFrequencyData(eng.freqData);
    let sum = 0;
    for (let i = 0; i < eng.freqData.length; i++) sum += eng.freqData[i];
    const energy = clamp01(sum / eng.freqData.length / 255);

    const base = runMusicBase(eng);
    eng.rootPc = base.rootPc;
    eng.musicK += (base.k - eng.musicK) * 0.03; // his harmony moves slowly

    // ── THE single scalar ──
    const k = clamp(eng.musicK + eng.kOffset, K_MIN, K_MAX);
    const n = Math.round(N_MIN + eng.nNorm * (N_MAX - N_MIN));
    const drawFrac = clamp01(0.22 + eng.open * 0.78);

    applyAudioParams(eng, k);
    drawFigure(c2d, w, h, n, k, drawFrac, energy);

    // ── readout (round(k) → cusps = k−1, partials = k) — update on change ──
    const kInt = Math.round(k);
    const prev = readoutRef.current;
    const analysisLive = !!(eng.analysis && eng.analysis.chords.length > 0);
    if (
      prev.kInt !== kInt ||
      prev.n !== n ||
      prev.driver !== driver ||
      prev.analysisLive !== analysisLive
    ) {
      const next: Readout = {
        kInt,
        cusps: kInt - 1,
        partials: kInt,
        n,
        driver,
        analysisLive,
      };
      readoutRef.current = next;
      setReadout(next);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── start: audio first (must always work), then the loop ───────────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    setErrMsg("");
    setPhase("loading");

    let actx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      actx = new AC();
      await actx.resume();
    } catch {
      setErrMsg("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setPhase("error");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(actx, trackId);
    } catch {
      setErrMsg("Karel's recording could not load — check the connection and press Play again.");
      void actx.close();
      setPhase("error");
      return;
    }
    setTrackTitle(loaded.title);

    const master = createSafeMaster(actx);

    // main source — HIS buffer, looped, at natural rate.
    const src = actx.createBufferSource();
    src.buffer = loaded.buffer;
    src.loop = true;
    src.playbackRate.value = 1.0;

    // dry path (his audio straight through) → master.
    const dryGain = actx.createGain();
    dryGain.gain.value = 0.78;
    src.connect(dryGain);
    dryGain.connect(master.input);

    // resonant partial bank — parallel bandpass taps of HIS audio. The number
    // of ACTIVE taps == round(k) == the count on screen. No oscillators.
    const sendGain = actx.createGain();
    sendGain.gain.value = 1;
    src.connect(sendGain);
    const resonatorSum = actx.createGain();
    resonatorSum.gain.value = 1;
    const resonators: Resonator[] = [];
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const flt = actx.createBiquadFilter();
      flt.type = "bandpass";
      flt.frequency.value = midiToFreq(48) * (i + 1);
      flt.Q.value = 8;
      const g = actx.createGain();
      g.gain.value = 0.0001;
      sendGain.connect(flt);
      flt.connect(g);
      g.connect(resonatorSum);
      resonators.push({ flt, g });
    }
    resonatorSum.connect(master.input);

    // analysis (may be null → spectral fallback drives k).
    let analysis: TrackAnalysis | null = null;
    try {
      analysis = await loadTrackAnalysis(trackId);
    } catch {
      analysis = null;
    }

    src.start();
    const eng: Engine = {
      actx,
      master,
      buffer: loaded.buffer,
      src,
      dryGain,
      sendGain,
      resonators,
      resonatorSum,
      startTime: actx.currentTime,
      analysis,
      freqData: new Uint8Array(master.analyser.frequencyBinCount),
      musicK: 3,
      kOffset: 0,
      nNorm: 0.5,
      open: 0.85,
      rootPc: 0,
      breath: 0,
      lastMs: 0,
      lastHandMs: 0,
    };
    engineRef.current = eng;
    setPhase("running");

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [trackId, runFrame]);

  // ── camera opt-in (enhancement) — pointer/keyboard remain the real path ────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createHandTracker(1);
      trackerRef.current = tracker;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      const stream = await startCamera(video);
      streamRef.current = stream;
      camWantRef.current = true;
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  // ── pointer fallback (drives the IDENTICAL setParams as the camera) ────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerXRef.current = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    pointerYRef.current = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    pointerActiveRef.current = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camStateRef.current === "live") return;
      pointerDownRef.current = true;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerDownRef.current = false;
    pointerActiveRef.current = false;
  }, []);

  // ── keyboard conducting (a11y) — same control chain as the pointer ─────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"))
        return;
      let handled = false;
      if (e.key === "ArrowLeft") {
        pointerXRef.current = clamp01(pointerXRef.current - 0.04);
        handled = true;
      } else if (e.key === "ArrowRight") {
        pointerXRef.current = clamp01(pointerXRef.current + 0.04);
        handled = true;
      } else if (e.key === "ArrowUp") {
        pointerYRef.current = clamp01(pointerYRef.current - 0.04);
        handled = true;
      } else if (e.key === "ArrowDown") {
        pointerYRef.current = clamp01(pointerYRef.current + 0.04);
        handled = true;
      } else if (e.key === " " || e.key === "Spacebar") {
        pointerDownRef.current = !pointerDownRef.current;
        handled = true;
      }
      if (handled && camStateRef.current !== "live") {
        pointerActiveRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.src.stop();
        } catch {
          /* already stopped */
        }
        const nodes: AudioNode[] = [
          eng.src,
          eng.dryGain,
          eng.sendGain,
          eng.resonatorSum,
          ...eng.resonators.flatMap((r) => [r.flt, r.g]),
        ];
        for (const nd of nodes) {
          try {
            nd.disconnect();
          } catch {
            /* noop */
          }
        }
        eng.master.disconnect();
        if (eng.actx.state !== "closed") void eng.actx.close();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  // ── derived UI state ───────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && handSeen;
  const camLost = camState === "live" && !handSeen;
  const camBad = camState === "denied" || camState === "failed";

  const statusText = camLive
    ? "tracking · live"
    : camLost
      ? "no hand — show one hand, palm to camera"
      : running && readout.driver === "pointer"
        ? "pointer · live — drag or arrow-keys to conduct"
        : running
          ? "idle · your recording is conducting itself"
          : "";

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the ring IS the page */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#05030c", cursor: camState === "live" ? "default" : "crosshair" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />

      {/* mirrored camera preview — small, corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {/* live integer readout — the see==hear coupling, made explicit */}
      {running && (
        <div className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}>
          k {readout.kInt} · {readout.cusps} cusp{readout.cusps === 1 ? "" : "s"} ·{" "}
          {readout.partials} partial{readout.partials === 1 ? "" : "s"} · N {readout.n}
        </div>
      )}

      {/* tracking / fallback status — functional, stays in immersive too */}
      {statusText && (
        <div
          className={`pointer-events-none absolute left-4 top-10 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}
      {phase === "error" && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — conducting with the
          pointer (drag) or arrow keys instead.
        </div>
      )}

      {/* FULL write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xl">
              <p className={labelCls}>Modular multiplication · string-art ring</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Times Ring
              </h1>
              <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                Conduct your own recording and it sculpts a living string-art figure — the exact
                number of petals you see is the number of harmonic partials you hear.
                {running && trackTitle && (
                  <span className="text-muted-foreground/70"> Now playing: {trackTitle}.</span>
                )}
              </p>
            </div>
            <button type="button" onClick={() => setNotesOpen(true)} className={`${btnGhost} shrink-0`}>
              Read the design notes
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={start}
                className={btnPrimary}
                disabled={phase === "loading"}
              >
                {phase === "loading" ? "Loading…" : "Play"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>live · {trackTitle}</span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting"}
              >
                {camState === "requesting" ? "Starting camera…" : "Use camera (one hand)"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            <label className={`${labelCls} flex items-center gap-2`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Times Ring"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* While immersive: only art + status + HUD. A minimal Play if not sounding. */}
      {immersive && !running && phase !== "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={start} className={btnPrimary}>
            Play
          </button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Times Ring"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}

      {/* design-notes modal (mirrors README.md) */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Times Ring — design notes
              </h2>
              <button type="button" onClick={() => setNotesOpen(false)} className={btnGhost} aria-label="Close">
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Place <span className="text-foreground">N pegs</span> evenly on a circle and draw a
                chord from peg <span className="text-foreground">i</span> to peg{" "}
                <span className="text-foreground">round(k·i) mod N</span> for every i. As the
                multiplier <span className="text-foreground">k</span> morphs, the envelope of all
                those chords morphs: k≈2 draws a cardioid (1 cusp), k≈3 a nephroid (2 cusps), k≈4
                three cusps — the cusp count you see is{" "}
                <span className="text-foreground">round(k) − 1</span>.
              </p>
              <p>
                There is <span className="text-foreground">one scalar k</span>, and it voices both
                sides. On screen it is the modular multiplier. In your ears,{" "}
                <span className="text-foreground">round(k)</span> is the number of active resonant
                partials in a bandpass bank tuned to the 1st..round(k) harmonics of the current
                chord&rsquo;s root, applied to Karel&rsquo;s real recording. So the integer you{" "}
                <span className="text-foreground">see</span> equals the integer you{" "}
                <span className="text-foreground">hear</span>. k itself is a base driven by his
                harmony (the chord root walked around the circle of fifths, minor darkening it — or
                a spectral read when the analysis is absent) plus the conductor&rsquo;s continuous
                offset.
              </p>
              <p>
                It is <span className="text-foreground">pointer-first</span>: the pointer and arrow
                keys drive the identical control chain as the one-hand camera (X → k offset, Y →
                peg count, hold / Space → complete the figure and deepen the resonance), so the
                whole piece is self-verifiable with no webcam. With no camera and no pointer it goes{" "}
                <span className="text-foreground">idle</span> — his music alone drives k, the ring
                breathes and the resonators sing. Camera denied or failed, audio failed: each
                degrades to a visible notice and keeps the art alive.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                Reference
              </p>
              <p>
                The lab&rsquo;s first modular-multiplication string-art piece, after Mathologer /
                Burkard Polster&rsquo;s{" "}
                <span className="text-foreground">&ldquo;times tables on a circle&rdquo;</span>{" "}
                (cardioid, nephroid and roses in <em>Times Tables, Mandelbrot and the Heart of
                Mathematics</em>). This cycle&rsquo;s fresh anchor is Bluzaborges&rsquo;{" "}
                <span className="text-foreground">Modular Cardioid v1.0.0</span> (GitHub,
                2026-10-01).
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
