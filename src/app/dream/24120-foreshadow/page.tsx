"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 24120-foreshadow — Foreshadow
//
// ONE question: what if Karel's piano's next harmony arrived as felt WEATHER,
// not a readout? The lab's PREDICTION/anticipation verb, but on the warm,
// cosmic-ambient, NON-analytical pole — no circle-of-fifths grid, no surprisal
// meter, no datamatics. The likely-next chords PRE-BLOOM ahead of the playhead
// as soft warm fronts rolling in from the horizon; the one that actually arrives
// is where the fronts CONVERGE and settle into warmth; when his real harmony
// DEFIES the forecast, the gathered bloom softly RUPTURES into shards of light.
//
// You stand inside it. Raise a hand to gather the forecast further ahead; reach
// wide to lean the gathering toward a less-likely branch; be still and let the
// harmony arrive as warmth. Pointer + arrow keys drive the identical controls.
//
// Audio is Karel's own take, looping as ground truth, plus a quiet self-
// foreshadow ghost of the predicted chord just before it arrives (see audio.ts).
// Visual is a warm volumetric fbm weather field in WebGL2 (see gl.ts). The
// prediction model is a functional-harmony Markov blended with his own bigrams
// (see model.ts). Nothing here is a number on screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type Landmark,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { createEngine, type Engine } from "./audio";
import { createField, type Field, MAX_FRONTS } from "./gl";
import { createForecaster, type Forecaster } from "./model";

const DEFAULT_ID = "8dafed88-4761-4dd3-a0f4-93f310441093"; // Welcome Home

const DESCRIPTION =
  "Karel's next harmony as felt weather, not a readout. The chords his piano is most likely to reach pre-bloom ahead of the playhead as soft warm fronts rolling in from the horizon; the one that actually arrives is where they converge and settle into warmth. When his real harmony defies the forecast, the gathered bloom ruptures into shards of light. Stand inside it for ten minutes.";
const HOW_TO = [
  "Press Play — Karel's take loops, and a quiet ghost of the predicted chord blooms just before each one arrives",
  "Raise a hand to gather the forecast further ahead (the weather front rolls in from deeper)",
  "Reach wide to lean the gathering toward a less-likely chord — which the music then often defies, rupturing the bloom",
  "Be still and let the harmony arrive as warmth",
  "No camera? Drag the pointer (up = further ahead, across = lean the branch), or use the arrow keys — identical controls",
];

const PRE_ECHO = 0.46; // seconds before a boundary the ghost pre-echo fires

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Lane offsets for k fronts: most-likely centered, the rest fanning outward.
function laneOffsets(k: number): number[] {
  if (k <= 1) return [0];
  const o: number[] = [];
  for (let i = 0; i < k; i++) {
    if (i === 0) o.push(0);
    else o.push((i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2));
  }
  const max = Math.max(1, ...o.map((v) => Math.abs(v)));
  return o.map((v) => (v / max) * 0.85);
}

interface Control {
  horizon: number; // 1..4
  lean: number; // 0..1
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const fieldRef = useRef<Field | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const forecasterRef = useRef<Forecaster | null>(null);
  const chordsRef = useRef<TrackChord[]>([]);

  const targetRef = useRef<Control>({ horizon: 2.4, lean: 0.5 });
  const scRef = useRef<Control>({ horizon: 2.4, lean: 0.5 });
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });

  // visual anticipation state
  const convergeRef = useRef(0);
  const bloomRef = useRef(0);
  const bloomHueRef = useRef(0.4);
  const bloomMinorRef = useRef(0);
  const ruptureRef = useRef(0);
  const frontsRef = useRef(new Float32Array(MAX_FRONTS * 4));
  const frontCountRef = useRef(0);
  const lastCiRef = useRef(-1);
  const ghostForRef = useRef(-1);

  const camWantRef = useRef(false);
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const clockRef = useRef({ t: 0, last: 0 });

  const camStateRef = useRef<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const bodySeenRef = useRef(false);
  const driverRef = useRef<"pointer" | "tracking" | "idle">("idle");
  const phaseRef = useRef<"idle" | "loading" | "running" | "error">("idle");

  const [webglOk, setWebglOk] = useState(true);
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_ID);
  const [trackTitle, setTrackTitle] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [camState, setCamState] = useState<"off" | "requesting" | "live" | "denied" | "failed">("off");
  const [bodySeen, setBodySeen] = useState(false);
  const [driver, setDriver] = useState<"pointer" | "tracking" | "idle">("idle");
  const [showNotes, setShowNotes] = useState(false);

  const { immersive, toggle } = useImmersive();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    camStateRef.current = camState;
  }, [camState]);

  // ── read the body: gate ONLY on shoulders + at least one wrist, mirror x ─────
  const readBody = useCallback((lm: Landmark[]): boolean => {
    const ls = lm[POSE_LM.leftShoulder];
    const rs = lm[POSE_LM.rightShoulder];
    if (!ls || !rs) return false;
    if ((ls.visibility ?? 1) < 0.3 || (rs.visibility ?? 1) < 0.3) return false;

    const lw = lm[POSE_LM.leftWrist];
    const rw = lm[POSE_LM.rightWrist];
    const lwv = lw?.visibility ?? 0;
    const rwv = rw?.visibility ?? 0;
    const lOn = !!lw && lwv > 0.3;
    const rOn = !!rw && rwv > 0.3;
    if (!lOn && !rOn) return false;

    const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y) + 1e-4;
    const scy = (ls.y + rs.y) / 2;
    const tgt = targetRef.current;

    // reach-height (arms raised) → prediction horizon 1..4
    let elev = 0;
    let n = 0;
    if (lOn && lw) {
      elev += (scy - lw.y) / shoulderW;
      n++;
    }
    if (rOn && rw) {
      elev += (scy - rw.y) / shoulderW;
      n++;
    }
    const e = n ? elev / n : 0;
    tgt.horizon = 1 + clamp01((e + 0.25) / 1.5) * 3;

    // arm spread → lean toward a less-likely counterfactual branch
    if (lOn && rOn && lw && rw) {
      const span = Math.hypot(lw.x - rw.x, lw.y - rw.y);
      tgt.lean = clamp01((span / shoulderW - 0.75) / (2.6 - 0.75));
    }
    return true;
  }, []);

  // ── main loop ────────────────────────────────────────────────────────────────
  const loop = useCallback(
    (nowMs: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const field = fieldRef.current;
      if (!field) return;

      const clk = clockRef.current;
      const dt = clk.last ? Math.min(0.05, (nowMs - clk.last) / 1000) : 1 / 60;
      clk.last = nowMs;
      clk.t += dt;
      const t = clk.t;
      const tgt = targetRef.current;

      // ── resolve the ONE control: camera → pointer → idle drift ──
      let drv: "pointer" | "tracking" | "idle" = "idle";
      let bodyThis = false;
      const video = videoRef.current;
      if (camWantRef.current && trackerRef.current && video && video.readyState >= 2) {
        let res: { landmarks: Landmark[][] } | null = null;
        try {
          res = trackerRef.current.detectForVideo(video, nowMs);
        } catch {
          res = null;
        }
        if (res && res.landmarks && res.landmarks[0]) bodyThis = readBody(res.landmarks[0]);
        if (bodyThis) drv = "tracking";
      }
      if (!bodyThis) {
        if (camStateRef.current === "live") {
          drv = "tracking"; // camera on, body lost → hold, ease toward calm centre
          tgt.horizon = lerp(tgt.horizon, 2.4, 0.02);
          tgt.lean = lerp(tgt.lean, 0.5, 0.02);
        } else {
          const p = pointerRef.current;
          if (p.active) {
            drv = "pointer";
            tgt.horizon = 1 + (1 - p.y) * 3; // up = further ahead
            tgt.lean = p.x; // across = lean the branch
          } else {
            drv = "idle"; // alive, breathing — the forecast gathers on its own
            tgt.horizon = 2.3 + 0.9 * Math.sin(t * 0.045);
            tgt.lean = 0.5 + 0.32 * Math.sin(t * 0.03 + 1.0);
          }
        }
      }
      if (bodyThis !== bodySeenRef.current) {
        bodySeenRef.current = bodyThis;
        setBodySeen(bodyThis);
      }
      if (drv !== driverRef.current) {
        driverRef.current = drv;
        setDriver(drv);
      }

      // smooth the control (~0.12s)
      const sc = scRef.current;
      const k = 1 - Math.exp(-dt / 0.12);
      sc.horizon = lerp(sc.horizon, tgt.horizon, k);
      sc.lean = lerp(sc.lean, tgt.lean, k);

      // ── audio features for turbulence / brightness ──
      let bass = 0;
      let bright = 0.1;
      let energyAll = 0;
      const eng = engineRef.current;
      if (eng) {
        eng.master.analyser.getByteFrequencyData(eng.freq);
        const f = eng.freq;
        const nb = f.length;
        let sum = 0;
        for (let i = 0; i < nb; i++) sum += f[i];
        energyAll = sum / nb / 255;
        let bsum = 0;
        const bb = Math.max(4, Math.floor(nb * 0.08));
        for (let i = 0; i < bb; i++) bsum += f[i];
        bass = bsum / bb / 255;
        bright = clamp01(energyAll * 1.5);
      }

      // ── the forecast timeline ──
      const fc = forecasterRef.current;
      const chords = chordsRef.current;
      let convergeTarget = convergeRef.current;
      if (eng && fc && chords.length >= 2) {
        const dur = eng.duration;
        const ph = eng.playhead();
        // current chord index (last boundary at/behind the playhead)
        let ci = 0;
        for (let i = 0; i < chords.length; i++) {
          if (chords[i].time <= ph) ci = i;
          else break;
        }
        const cur = chords[ci];
        const nextIdx = ci + 1 < chords.length ? ci + 1 : 0;
        const nextTime = ci + 1 < chords.length ? chords[ci + 1].time : dur;
        const timeToNext = Math.max(0, nextTime - ph);

        // forecast fronts from the current chord, at the chosen horizon
        const items = fc.forecast(cur.chord, sc.horizon).filter((x) => x.prob > 0.02);
        const shown = items.slice(0, 5);
        const lanes = laneOffsets(shown.length);
        let ptot = 0;
        for (const s of shown) ptot += s.prob;
        const fronts = frontsRef.current;
        for (let i = 0; i < shown.length; i++) {
          const s = shown[i];
          fronts[i * 4] = lanes[i];
          fronts[i * 4 + 1] = clamp01(s.prob / Math.max(1e-6, ptot));
          fronts[i * 4 + 2] = s.root / 12;
          fronts[i * 4 + 3] = s.minor ? 1 : 0;
        }
        frontCountRef.current = shown.length;

        // convergence ramps as the real boundary approaches
        const win = Math.min(2.6, Math.max(0.8, cur.duration || 1.6));
        convergeTarget = clamp01(1 - timeToNext / win);

        // ghost pre-echo: just before the boundary, foreshadow the predicted chord
        if (timeToNext < PRE_ECHO && ghostForRef.current !== nextIdx && items.length) {
          const leanIdx = Math.min(items.length - 1, Math.round(sc.lean * 2));
          const predicted = items[leanIdx] ?? items[0];
          eng.foreshadow(predicted.symbol, predicted.root, cur, 0.55);
          ghostForRef.current = nextIdx;
        }

        // arrival: the harmony that actually came
        const prevCi = lastCiRef.current;
        if (prevCi >= 0 && ci !== prevCi) {
          const from = chords[prevCi].chord;
          const to = cur.chord;
          const wrap = ci < prevCi; // loop seam — don't flash a false rupture
          const sur = fc.surprisal(from, to);
          const rup = wrap ? 0 : clamp01((sur - 1.5) / 3);
          ruptureRef.current = Math.max(ruptureRef.current, rup);
          bloomRef.current = 0.8;
          bloomHueRef.current = (chordRoot(to) ?? 0) / 12;
          bloomMinorRef.current = chordIsMinor(to) ? 1 : 0;
          eng.settle(cur, 0.3 + rup * 0.6);
        }
        lastCiRef.current = ci;
      } else if (eng) {
        // degrade: no usable harmony — an energy-driven ambient gather
        frontCountRef.current = 0;
        convergeTarget = 0.35 + 0.35 * Math.sin(t * 0.12) + bright * 0.3;
      }

      convergeRef.current = lerp(convergeRef.current, clamp01(convergeTarget), k);
      bloomRef.current *= Math.exp(-dt / 0.9);
      ruptureRef.current *= Math.exp(-dt / 0.6);

      const warmth = clamp01(0.4 + 0.18 * Math.sin(t * 0.03) + bright * 0.15);

      field.render({
        time: t,
        bass,
        bright,
        energy: energyAll,
        horizon: clamp01((sc.horizon - 1) / 3),
        lean: sc.lean,
        converge: convergeRef.current,
        warmth,
        rupture: ruptureRef.current,
        bloomHue: bloomHueRef.current,
        bloomInt: bloomRef.current,
        bloomMinor: bloomMinorRef.current,
        degrade: forecasterRef.current ? 0 : 1,
        fronts: frontsRef.current,
        frontCount: frontCountRef.current,
      });
    },
    [readBody],
  );

  // ── build the field on mount (weather breathes before audio) ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const field = createField(canvas);
    if (!field) {
      setWebglOk(false);
      return;
    }
    fieldRef.current = field;
    const dpr = Math.min(1.25, window.devicePixelRatio || 1);
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      field.resize(w, h, dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      field.dispose();
      fieldRef.current = null;
    };
  }, [loop]);

  // ── Play ───────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    if (!webglOk) return;
    setErrMsg("");
    setDegraded(false);
    setPhase("loading");

    let ctx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      await ctx.resume();
    } catch {
      setErrMsg("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setPhase("error");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(ctx, trackId);
    } catch {
      setErrMsg("Karel's recording could not load — check the connection and press Play again.");
      void ctx.close();
      setPhase("error");
      return;
    }
    setTrackTitle(loaded.title);

    // harmony model (graceful: null / <6 chords → ambient gather)
    let chords: TrackChord[] = [];
    let forecaster: Forecaster | null = null;
    try {
      const analysis = await loadTrackAnalysis(trackId);
      if (analysis && analysis.chords.length >= 6) {
        chords = analysis.chords;
        forecaster = createForecaster(
          analysis.chords,
          analysis.summary?.key_center ?? analysis.key_signature,
        );
      }
    } catch {
      forecaster = null;
    }
    chordsRef.current = chords;
    forecasterRef.current = forecaster;
    lastCiRef.current = -1;
    ghostForRef.current = -1;
    setDegraded(!forecaster);

    try {
      const engine = createEngine(ctx, loaded.buffer, chords);
      engineRef.current = engine;
    } catch {
      setErrMsg("Audio could not start on this device.");
      void ctx.close();
      setPhase("error");
      return;
    }
    setPhase("running");
  }, [trackId, webglOk]);

  // ── camera opt-in (pointer stays fully playable without it) ───────────────────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createPoseTracker(1);
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
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  // ── pointer — the primary, always-playable path ──────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = pointerRef.current;
    p.x = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    p.y = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    p.active = true;
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // keyboard (a11y) — same horizon/lean controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      const p = pointerRef.current;
      let handled = false;
      if (e.key === "ArrowUp") {
        p.y = clamp01(p.y - 0.06);
        handled = true;
      } else if (e.key === "ArrowDown") {
        p.y = clamp01(p.y + 0.06);
        handled = true;
      } else if (e.key === "ArrowLeft") {
        p.x = clamp01(p.x - 0.06);
        handled = true;
      } else if (e.key === "ArrowRight") {
        p.x = clamp01(p.x + 0.06);
        handled = true;
      }
      if (handled && camStateRef.current !== "live") {
        p.active = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── teardown ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.teardown();
      engineRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
    };
  }, []);

  // ── derived UI ──────────────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && bodySeen;
  const camLost = camState === "live" && !bodySeen;
  const camBad = camState === "denied" || camState === "failed";

  const statusText = camLive
    ? "tracking · live"
    : camLost
      ? "stand back, shoulders in frame — pointer still gathers"
      : driver === "pointer"
        ? "pointer · drag to gather the forecast"
        : running
          ? "still · the harmony arrives as warmth"
          : "pointer · drag to gather the forecast";

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em]";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="fixed inset-0 h-dvh overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: camState === "live" ? "default" : "crosshair" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
      />

      {/* mirrored camera preview — small corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {!webglOk && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL2 is unavailable on this device, so the weather field cannot render. Nothing
            was started.
          </p>
        </div>
      )}

      {/* tracking / fallback status — visible in immersive too, distinct per mode */}
      {webglOk && (
        <div
          className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}

      {phase === "error" && (
        <div className="absolute left-4 top-12 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-12 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — gather the forecast
          with the pointer (up = further ahead, across = lean the branch) or the arrow keys.
        </div>
      )}
      {running && degraded && (
        <div className="absolute left-4 bottom-28 z-30 max-w-xs text-sm text-muted-foreground">
          This take has no usable chord analysis — the field falls back to an energy-driven
          ambient gather. The audio still plays.
        </div>
      )}

      {/* write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="max-w-xl">
            <p className={`${labelCls} text-muted-foreground`}>
              Harmonic weather front · prediction as warmth · cosmic-ambient
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Foreshadow
            </h1>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              Karel&apos;s next harmony as felt weather. The likely-next chords pre-bloom ahead
              of the playhead and roll in like a warm front; the one that actually arrives is
              where they converge and settle. When his harmony defies the forecast, the bloom
              ruptures into shards of light.
              {running && trackTitle && (
                <span className="text-muted-foreground/70"> Now playing: {trackTitle}.</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={start}
                className={btnPrimary}
                disabled={phase === "loading" || !webglOk}
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
                disabled={camState === "requesting" || !webglOk}
              >
                {camState === "requesting" ? "Starting camera…" : "Use camera (whole body)"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            <label className={`${labelCls} flex items-center gap-2 text-muted-foreground`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {tk.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className={`${labelCls} text-muted-foreground underline-offset-4 hover:text-foreground hover:underline`}
            >
              Read the design notes
            </button>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Foreshadow"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* while immersive: only art + status + HUD, plus a minimal Play */}
      {immersive && !running && phase !== "loading" && webglOk && (
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
          title="Foreshadow"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Foreshadow — design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: what if Karel&apos;s piano&apos;s next harmony arrived as felt
                weather, not a readout? The lab&apos;s prediction verb, rendered on the warm,
                cosmic-ambient, non-analytical pole — no circle-of-fifths grid, no surprisal
                meter, no datamatics.
              </p>
              <p>
                The model reads his chord progression as a Markov process over functional scale
                degrees, blending standard functional-harmony transition tables with the
                take&apos;s own chord bigrams, then propagates the next likely chords one to four
                steps ahead. Each likely branch becomes a faint warm density front gathering
                ahead of the playhead; higher-probability branches sit closer and denser. On
                arrival the fronts converge into a warm core; when his real harmony defies the
                forecast, surprisal (−log₂ p of what actually came) drives a felt rupture of
                light — never a number.
              </p>
              <p>
                You hear the forecast too: just before each chord boundary, a quiet warm ghost of
                the predicted chord plays — another instance of that same chord symbol sliced from
                elsewhere in his own recording. Most predicted chords recur, so this self-
                foreshadow plays almost always; when a predicted symbol never recurs, a two-delay
                raised-cosine pitch-nudge of the current slice stands in (still his audio, no
                synth, approximate tuning).
              </p>
              <p>
                Raise a hand to gather the forecast further ahead; reach wide to lean toward a
                less-likely branch; be still and let the harmony arrive as warmth. Pointer and
                arrow keys drive the identical controls.
              </p>
              <p className="text-muted-foreground/70">
                References: HookTheory next-chord transition statistics; David Huron, Sweet
                Anticipation; Refik Anadol&apos;s warm volumetric register as the aesthetic
                reference; information-theoretic surprisal used as felt rupture, not readout.
              </p>
            </div>
            <button type="button" onClick={() => setShowNotes(false)} className={`mt-4 ${btnGhost}`}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
