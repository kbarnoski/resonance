"use client";

/* ── 16288 · Ring Canon ──────────────────────────────────────────────────────
 *
 *  ONE IDEA: a canon whose ANSWERING voice is not a replay of his recording but
 *  the RESONANCE his own playing rings out of a tuned body. Extends the lab's
 *  lone 5/5 (15824-canon: one real take → two decoupled time-bases). Here the
 *  first head is his LIVE voice, near-dry; the second, drifting head is his same
 *  take fed as the EXCITATION into a parallel bank of high-Q bandpass MODAL
 *  RESONATORS tuned to the take's key center. He plays; the room he plays in
 *  answers, in canon. Every sample is his — the resonators are filters on his
 *  audio, like a convolver reverb. See engine.ts and README.md.
 * ─────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createResonantCanon,
  applyControls,
  teardownCanon,
  modalFreqsNow,
  DEFAULT_CONTROLS,
  MODE_COUNT,
  deadzone,
  clamp01,
  clampSym,
  type ResonantCanon,
  type Controls,
} from "./engine";

// art colors (canvas only — chrome uses semantic tokens)
const GRAPHITE_BG = "#17181a"; // warm-neutral graphite, not pure black
const GRAPHITE_LINE = "#33353a"; // ring/track base
const GREY = "#55585e"; // inert modal bars
const CHARTREUSE = "72 90% 55%"; // the single signal hue (h s l parts)

type Mode = "idle" | "loading" | "running";
type InputKind = "gamepad" | "pointer";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Bath")?.id ?? REAL_TRACKS[0].id;

interface Engine {
  ac: AudioContext;
  id: string;
  canon: ResonantCanon;
  freq: Uint8Array<ArrayBuffer>;
  controls: Controls;
  livePos: number; // seconds into the loop
  revPos: number;
  flare: Float32Array; // per-mode smoothed band energy 0..1
  energy: number;
  time: number;
  lastMs: number;
  raf: number;
  prevButton: boolean;
  pointer: { x: number; y: number; down: boolean };
  keys: Set<string>;
  reduce: boolean;
}

export default function RingCanonPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [inputKind, setInputKind] = useState<InputKind>("pointer");
  const [hasGamepad, setHasGamepad] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");
  const cyclingRef = useRef(false);
  const inputKindRef = useRef<InputKind>("pointer");
  const hasGamepadRef = useRef(false);

  const canonRef = useRef<HTMLSpanElement | null>(null);
  const tuningRef = useRef<HTMLSpanElement | null>(null);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const keyRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.floor(box.clientWidth * dpr));
    canvas.height = Math.max(2, Math.floor(box.clientHeight * dpr));
  }, []);

  // ── the canvas render: two orbiting read-heads + a corona of tuned modes ──
  const drawScene = useCallback((eng: Engine, w: number, h: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.3;
    const rInner = R * 0.8;

    ctx.fillStyle = GRAPHITE_BG;
    ctx.fillRect(0, 0, w, h);

    // ── loop tracks (inert graphite) ──
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.strokeStyle = GRAPHITE_LINE;
    for (const rad of [R, rInner]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── modal corona: one spoke per mode, flaring chartreuse with band energy ──
    const spokes = eng.flare.length;
    const gap = R * 0.05;
    const maxLen = R * 0.62;
    for (let i = 0; i < spokes; i++) {
      const a = -Math.PI / 2 + (i / spokes) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r0 = R + gap;
      const f = eng.flare[i];
      // inert base bar
      const baseLen = R * 0.08;
      ctx.strokeStyle = GREY;
      ctx.lineWidth = Math.max(1.5, R * 0.012);
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * (r0 + baseLen), cy + sa * (r0 + baseLen));
      ctx.stroke();
      // chartreuse flare
      if (f > 0.02) {
        const len = baseLen + f * maxLen;
        const light = 40 + f * 32;
        ctx.strokeStyle = `hsl(${CHARTREUSE.split(" ")[0]} 90% ${light}%)`;
        ctx.lineWidth = Math.max(1.5, R * 0.012 * (1 + f * 1.6));
        ctx.globalAlpha = 0.35 + f * 0.65;
        ctx.beginPath();
        ctx.moveTo(cx + ca * r0, cy + sa * r0);
        ctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
        ctx.stroke();
        // a soft tip node
        ctx.globalAlpha = 0.5 + f * 0.5;
        ctx.fillStyle = `hsl(${CHARTREUSE})`;
        ctx.beginPath();
        ctx.arc(cx + ca * (r0 + len), cy + sa * (r0 + len), R * 0.012 * (1 + f), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ── the two read-heads ──
    const dur = eng.canon.duration;
    const aLive = -Math.PI / 2 + (eng.livePos / dur) * Math.PI * 2;
    const aRev = -Math.PI / 2 + (eng.revPos / dur) * Math.PI * 2;
    const pLive = { x: cx + Math.cos(aLive) * R, y: cy + Math.sin(aLive) * R };
    const pRev = { x: cx + Math.cos(aRev) * rInner, y: cy + Math.sin(aRev) * rInner };

    // drift chord — the canon gap made visible
    ctx.strokeStyle = `hsl(${CHARTREUSE})`;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.beginPath();
    ctx.moveTo(pLive.x, pLive.y);
    ctx.lineTo(pRev.x, pRev.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // live head — bright, solid chartreuse
    ctx.fillStyle = `hsl(${CHARTREUSE})`;
    ctx.beginPath();
    ctx.arc(pLive.x, pLive.y, R * 0.045, 0, Math.PI * 2);
    ctx.fill();

    // revenant head — a chartreuse ring (the answering ghost, hollow)
    ctx.strokeStyle = `hsl(${CHARTREUSE})`;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(1.5, R * 0.014);
    ctx.beginPath();
    ctx.arc(pRev.x, pRev.y, R * 0.04, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // pulsing core — the take's live energy
    const coreR = R * 0.06 * (0.6 + eng.energy * 1.8);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, coreR));
    grad.addColorStop(0, `hsla(${CHARTREUSE} / ${0.25 + eng.energy * 0.5})`);
    grad.addColorStop(1, `hsla(${CHARTREUSE} / 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, coreR), 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const readGamepad = useCallback((eng: Engine, dt: number): boolean => {
    const pads =
      typeof navigator !== "undefined" && navigator.getGamepads
        ? navigator.getGamepads()
        : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p) {
        pad = p;
        break;
      }
    }
    if (!pad) return false;
    const c = eng.controls;
    const lx = deadzone(pad.axes[0] ?? 0);
    const ly = deadzone(pad.axes[1] ?? 0);
    const ry = deadzone(pad.axes[3] ?? 0);
    let touched = false;
    if (ly !== 0) {
      c.canon = clamp01(c.canon - ly * dt * 0.4); // stick up → more drift
      touched = true;
    }
    if (lx !== 0) {
      c.tuning = clampSym(c.tuning + lx * dt * 0.5);
      touched = true;
    }
    if (ry !== 0) {
      c.ring = clamp01(c.ring - ry * dt * 0.45);
      touched = true;
    }
    // primary button (A) → cycle track, edge-detected
    const pressed = !!pad.buttons[0]?.pressed;
    if (pressed && !eng.prevButton) void cycleTrack();
    eng.prevButton = pressed;
    return touched || pressed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readKeys = useCallback((eng: Engine, dt: number): boolean => {
    const c = eng.controls;
    let touched = false;
    if (eng.keys.has("ArrowUp")) {
      c.ring = clamp01(c.ring + dt * 0.5);
      touched = true;
    }
    if (eng.keys.has("ArrowDown")) {
      c.ring = clamp01(c.ring - dt * 0.5);
      touched = true;
    }
    if (eng.keys.has("ArrowLeft")) {
      c.canon = clamp01(c.canon - dt * 0.4);
      touched = true;
    }
    if (eng.keys.has("ArrowRight")) {
      c.canon = clamp01(c.canon + dt * 0.4);
      touched = true;
    }
    return touched;
  }, []);

  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
      eng.lastMs = nowMs;
      eng.time += dt;

      // ── input: gamepad primary, pointer drag + arrow keys fallback ──
      const gp = readGamepad(eng, dt);
      const kb = readKeys(eng, dt);
      if (gp) {
        if (!hasGamepadRef.current) {
          hasGamepadRef.current = true;
          setHasGamepad(true);
        }
        if (inputKindRef.current !== "gamepad") {
          inputKindRef.current = "gamepad";
          setInputKind("gamepad");
        }
      } else if (eng.pointer.down) {
        eng.controls.canon = clamp01(1 - eng.pointer.y); // drag up → more drift
        eng.controls.tuning = clampSym(eng.pointer.x * 2 - 1);
        if (inputKindRef.current !== "pointer") {
          inputKindRef.current = "pointer";
          setInputKind("pointer");
        }
      } else if (kb && inputKindRef.current !== "pointer") {
        inputKindRef.current = "pointer";
        setInputKind("pointer");
      }

      applyControls(eng.canon, eng.controls);

      // ── advance the two read-heads at their own time-bases ──
      const dur = eng.canon.duration;
      eng.livePos = (eng.livePos + dt * eng.canon.liveRate) % dur;
      eng.revPos = (eng.revPos + dt * eng.canon.revRate) % dur;

      // ── read the tamed spectrum → light the mode nearest each band ──
      eng.canon.master.analyser.getByteFrequencyData(eng.freq);
      const binHz = eng.ac.sampleRate / (eng.freq.length * 2);
      const freqs = modalFreqsNow(eng.canon, eng.controls.tuning);
      let esum = 0;
      for (let i = 0; i < eng.flare.length; i++) {
        const bin = Math.max(1, Math.min(eng.freq.length - 1, Math.round(freqs[i] / binHz)));
        // small neighborhood max so a high-Q mode still catches its band
        let m = 0;
        for (let b = bin - 1; b <= bin + 1; b++) {
          const v = eng.freq[Math.max(0, Math.min(eng.freq.length - 1, b))] / 255;
          if (v > m) m = v;
        }
        eng.flare[i] += (m - eng.flare[i]) * 0.28;
        esum += eng.flare[i];
      }
      eng.energy += (Math.min(1, (esum / eng.flare.length) * 2.2) - eng.energy) * 0.15;

      const canvas = canvasRef.current;
      drawScene(eng, canvas?.width || 1, canvas?.height || 1);

      // ── readouts ──
      if (canonRef.current) {
        const gapRate = Math.abs(eng.canon.liveRate - eng.canon.revRate);
        canonRef.current.textContent =
          gapRate < 0.015 ? "near unison" : gapRate < 0.06 ? "drifting" : "wide canon";
      }
      if (tuningRef.current) {
        const semis = Math.round(eng.controls.tuning * 12);
        tuningRef.current.textContent =
          semis === 0 ? "at key" : `${semis > 0 ? "+" : ""}${semis} st`;
      }
      if (ringRef.current) {
        ringRef.current.textContent =
          eng.controls.ring < 0.33 ? "short" : eng.controls.ring < 0.66 ? "medium" : "long";
      }

      eng.raf = requestAnimationFrame(renderLoop);
    },
    [drawScene, readGamepad, readKeys],
  );

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    teardownCanon(eng.canon);
    const ac = eng.ac;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 300);
    }
    engineRef.current = null;
  }, []);

  // build the audio+visual engine for a given track id.
  const buildEngine = useCallback(
    async (ac: AudioContext, id: string): Promise<Engine> => {
      const [loaded, analysis] = await Promise.all([
        loadRealTrackBuffer(ac, id),
        loadTrackAnalysis(id).catch(() => null),
      ]);
      const master = createSafeMaster(ac);
      const keyCenter = analysis?.summary?.key_center ?? null;
      const canon = createResonantCanon(ac, master, loaded.buffer, keyCenter, loaded.title);
      if (keyRef.current) keyRef.current.textContent = canon.keyLabel;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const eng: Engine = {
        ac,
        id,
        canon,
        freq: new Uint8Array(master.analyser.frequencyBinCount),
        controls: { ...DEFAULT_CONTROLS },
        livePos: 0,
        revPos: canon.lag % canon.duration,
        flare: new Float32Array(MODE_COUNT),
        energy: 0,
        time: 0,
        lastMs: 0,
        raf: 0,
        prevButton: false,
        pointer: { x: 0.5, y: 0.5, down: false },
        keys: new Set<string>(),
        reduce,
      };
      applyControls(canon, eng.controls);
      return eng;
    },
    [],
  );

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setAudioNotice(null);
    setMode("loading");

    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setAudioNotice("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setMode("idle");
      return;
    }

    let eng: Engine;
    try {
      eng = await buildEngine(ac, trackId);
    } catch {
      setAudioNotice("Karel's recording could not load — check the connection and try again.");
      void ac.close();
      setMode("idle");
      return;
    }

    engineRef.current = eng;
    sizeCanvas();
    setMode("running");
    eng.raf = requestAnimationFrame(renderLoop);
  }, [buildEngine, renderLoop, sizeCanvas, trackId]);

  // swap to the next verified take without leaving the running loop.
  const cycleTrack = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || cyclingRef.current) return;
    cyclingRef.current = true;
    const curIdx = REAL_TRACKS.findIndex((t) => t.id === eng.id);
    const nextId = REAL_TRACKS[(Math.max(0, curIdx) + 1) % REAL_TRACKS.length].id;
    try {
      const next = await buildEngine(eng.ac, nextId);
      // preserve current control feel across the swap
      next.controls = { ...eng.controls };
      applyControls(next.canon, next.controls);
      teardownCanon(eng.canon);
      next.raf = requestAnimationFrame(renderLoop);
      cancelAnimationFrame(eng.raf);
      engineRef.current = next;
      setTrackId(nextId);
    } catch {
      /* keep current on failure */
    } finally {
      cyclingRef.current = false;
    }
  }, [buildEngine, renderLoop]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
  }, [stopEverything]);

  // ── pointer + keyboard listeners ──
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    eng.pointer.x = clamp01((e.clientX - rect.left) / rect.width);
    eng.pointer.y = clamp01((e.clientY - rect.top) / rect.height);
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.pointer.down = true;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerUp = useCallback(() => {
    const eng = engineRef.current;
    if (eng) eng.pointer.down = false;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        eng.keys.add(e.key);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      engineRef.current?.keys.delete(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onConn = () => setHasGamepad(true);
    const onDisc = () => {
      const pads = navigator.getGamepads?.() ?? [];
      if (![...pads].some((p) => p)) setHasGamepad(false);
    };
    window.addEventListener("gamepadconnected", onConn);
    window.addEventListener("gamepaddisconnected", onDisc);
    return () => {
      window.removeEventListener("gamepadconnected", onConn);
      window.removeEventListener("gamepaddisconnected", onDisc);
    };
  }, []);

  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, sizeCanvas]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Link
          href="/dream"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← back to the dream lab
        </Link>

        <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          16288 · ring canon · his room answers
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Ring Canon
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Two heads read Karel&apos;s one real take at decoupled time-bases — a canon of his
          own recording. The first head is his <span className="text-primary">live</span> voice,
          near-dry. The second, drifting head is that same take fed as the{" "}
          <span className="text-primary">excitation</span> into a bank of tuned modal resonators —
          high-Q filters on his own audio. He plays; the room he plays in{" "}
          <span className="text-foreground">answers, in canon</span>.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "Ring the canon"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleStop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => void cycleTrack()}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Next take
              </button>
            </>
          )}

          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            take
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={running || loading}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm normal-case tracking-normal text-foreground disabled:opacity-60"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          {running && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              input:{" "}
              <span className="text-primary">
                {inputKind === "gamepad" ? "gamepad" : "drag / arrow keys"}
              </span>
            </span>
          )}
        </div>

        {!running && !loading && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            press ring — his take rings the modal body at once
            {hasGamepad ? " · gamepad connected" : " · drag the canvas or use arrow keys"}
          </p>
        )}
        {audioNotice && (
          <p className="mt-3 text-base leading-relaxed text-destructive">{audioNotice}</p>
        )}

        <div
          className="relative mt-5 aspect-video w-full touch-none overflow-hidden rounded-lg border border-border"
          style={{ background: GRAPHITE_BG }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {!running && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Press Ring the canon — his playing rings a tuned body that answers in canon.
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Decoding his recording…
            </div>
          )}
        </div>

        {running && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                canon drift
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={canonRef}>drifting</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                modal tuning
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={tuningRef}>at key</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                ring length
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={ringRef}>medium</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                modal key
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={keyRef}>—</span>
              </p>
            </div>
          </div>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          input: Gamepad sticks (left-Y canon drift · left-X modal tuning · right-Y ring length · A
          cycles the take), with pointer drag + arrow keys as the no-gamepad fallback · output:
          Canvas2D — two orbiting read-heads on his loop and a corona of tuned modes that flare when
          his excitation hits their band · audio: his one real decoded take, two decoupled loop
          heads, the answering head resonated through a parallel high-Q bandpass modal bank tuned to
          the take&apos;s key.
        </p>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Ring Canon</span> extends{" "}
                <span className="text-foreground">15824 · canon</span> — one of Karel&apos;s real
                piano takes read by two decoupled time-bases, a canon from a single recording. Here
                the answering voice is not a replay: his same take is fed as the{" "}
                <span className="text-foreground">excitation</span> into a bank of parallel high-Q
                bandpass resonators tuned to the take&apos;s key center. The resonated sum is the
                modal body his playing rings — a ghost instrument that drifts in time against him.
              </p>
              <p>
                <span className="text-foreground">How to play.</span> The full idea sounds on its
                own the moment you press Ring — a baked canon lag and modal tuning, no input needed.
                A gamepad refines it: left stick Y opens the canon drift, left stick X transposes the
                modal set, right stick Y sets ring length, the A button cycles the take. No gamepad?
                Drag the canvas (up = more drift, left/right = tuning) or use the arrow keys
                (up/down = ring length, left/right = drift).
              </p>
              <p>
                <span className="text-foreground">Every sample is his.</span> The resonators are
                filters on his real decoded audio — exactly as a convolver reverb is a filter on his
                audio (see 16160 · roomtone). Nothing is synthesized: no oscillators, no noise, no
                generated tone ever reaches the speakers. A bounded regeneration loop lets the modes
                ring longer; the shared safeMaster limiter is the final ceiling.
              </p>
              <p>
                <span className="text-foreground">Honest novelty.</span> Modal / resonator /
                waveguide synthesis is common in this lab (827-waveguide-mesh, 2086-bell-vault,
                6680-resonate, 13488-striketemple). This piece claims no first. The narrow, fresh
                angle: <span className="text-foreground">his real recording is the excitation</span>{" "}
                driving the modal bank, used as the answering voice of a canon. References:
                &ldquo;Rigid-Body Sound Synthesis with Differentiable Modal Resonators&rdquo;
                (arXiv:2210.15306) — a bank of resonant IIR filters as a modal body learned from
                real recordings; Julius O. Smith III, &ldquo;Physical Audio Signal Processing&rdquo;
                (digital waveguides / modal synthesis, foundational); and the canon / Reich-phase
                lineage it extends (15824-canon).
              </p>
              <p>
                <span className="text-foreground">Honest limits.</span> Built headless — I could not
                verify by ear whether the resonated voice reads as a ringing ghost or as mud, whether
                the drift reads as a canon, or whether chartreuse-on-graphite reads well on a real
                screen. Track: any in his verified catalog, selectable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav
        slugs={["16288-ringcanon", "16256-revenant", "15824-canon", "16160-roomtone"]}
      />
    </main>
  );
}
