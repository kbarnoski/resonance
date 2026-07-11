"use client";

/* ------------------------------------------------------------------ *
 * 1085 — Lightning Organ
 * Your two hands are electrodes; every branch of a real dielectric-
 * breakdown discharge that cracks between them rings a note.
 *
 * INPUT   MediaPipe HandLandmarker (webcam) with a full autonomous
 *         fallback — two charged terminals orbit on their own and the
 *         storm plays itself with zero permissions.
 * OUTPUT  raw WebGL2 (hand-written shaders, accumulation FBO afterglow,
 *         additive hot cores, bloom + tonemap + vignette present pass);
 *         Canvas2D fallback of the same sim; text notice as last resort.
 * TECH    Dielectric Breakdown Model / Laplacian growth (dbm.ts).
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker } from "../_shared/psych/safeFlicker";
import { DBM, type Branch } from "./dbm";
import { LightningRenderer, type Seg } from "./gl";
import { LightningAudio } from "./audio";
import { HandTracker, type HandsFrame } from "./hands";

type RenderMode = "webgl2" | "canvas2d" | "none";
type InputMode = "autonomous" | "hands";

// A live arc segment retained for a few frames so the renderer can re-draw a
// short fading trail (the accumulation FBO handles the long afterglow; this
// keeps freshly-added arcs re-lit for their first moments).
interface LiveSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  heightNorm: number;
  root: number;
  life: number; // 1 -> 0
}

const GRID_W = 128;
const GRID_H = 72;

export default function LightningOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>("webgl2");
  const [inputMode, setInputMode] = useState<InputMode>("autonomous");
  const [soundOn, setSoundOn] = useState(false);
  const [eta, setEta] = useState(3.5);
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const [flickerOn, setFlickerOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // refs mutable inside the RAF loop without re-subscribing
  const etaRef = useRef(eta);
  const inputModeRef = useRef<InputMode>("autonomous");
  const flickerOnRef = useRef(false);
  const soundRef = useRef<LightningAudio | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const handsFrameRef = useRef<HandsFrame>({
    present: false,
    hands: [],
    separation: 0,
  });

  useEffect(() => {
    etaRef.current = eta;
  }, [eta]);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);
  useEffect(() => {
    flickerOnRef.current = flickerOn;
  }, [flickerOn]);

  // ── main simulation + render loop ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dbm = new DBM(GRID_W, GRID_H);
    const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 1.4, floor: 0.6 });

    let renderer: LightningRenderer | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let mode: RenderMode = "webgl2";

    // try WebGL2
    try {
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        premultipliedAlpha: false,
      });
      if (!gl) throw new Error("no webgl2");
      renderer = new LightningRenderer(gl);
    } catch {
      renderer = null;
      try {
        ctx2d = canvas.getContext("2d");
        if (!ctx2d) throw new Error("no 2d");
        mode = "canvas2d";
      } catch {
        mode = "none";
      }
    }
    setRenderMode(mode);
    if (mode === "none") return;

    // sizing
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      if (renderer) renderer.resize(canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── autonomous drifters ──────────────────────────────────────────────────
    // two charged terminals orbit a shared center with independent phases.
    let phaseA = 0.3;
    let phaseB = Math.PI + 0.8;

    // live-seg trail buffer
    const live: LiveSeg[] = [];
    const MAX_LIVE = 3000;

    let strikeFlash = 0; // 0..1 extra brightness after a bridging strike
    let raf = 0;
    let last = performance.now();
    let strikeHoldUntil = 0;

    const canvas2dDraw = (
      segs: Seg[],
      terms: { x: number; y: number }[],
      lum: number,
    ) => {
      if (!ctx2d) return;
      const w = canvas.width;
      const h = canvas.height;
      // fade previous frame (afterglow) instead of clearing
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.fillStyle = "rgba(3,2,8,0.28)";
      ctx2d.fillRect(0, 0, w, h);
      ctx2d.globalCompositeOperation = "lighter";
      for (const s of segs) {
        const g = Math.min(1, s.heat) * lum;
        const tone = s.tone;
        const r = Math.round((0.62 + 0.38 * tone) * 255 * g);
        const gg = Math.round((0.3 + 0.66 * tone) * 255 * g);
        const b = Math.round(255 * g);
        ctx2d.strokeStyle = `rgb(${r},${gg},${b})`;
        ctx2d.lineWidth = (0.8 + s.heat * 1.6) * dpr;
        ctx2d.beginPath();
        ctx2d.moveTo(s.x0 * w, s.y0 * h);
        ctx2d.lineTo(s.x1 * w, s.y1 * h);
        ctx2d.stroke();
      }
      // terminals
      for (const t of terms) {
        const rad = 7 * dpr;
        const grad = ctx2d.createRadialGradient(
          t.x * w,
          t.y * h,
          0,
          t.x * w,
          t.y * h,
          rad,
        );
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * lum})`);
        grad.addColorStop(1, "rgba(160,120,255,0)");
        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        ctx2d.arc(t.x * w, t.y * h, rad, 0, Math.PI * 2);
        ctx2d.fill();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const tSec = now / 1000;

      dbm.eta = etaRef.current;

      // ── terminal positions + voltage ───────────────────────────────────────
      let ax: number, ay: number, bx: number, by: number;
      let voltage = 0.7;
      const hf = handsFrameRef.current;
      const usingHands = inputModeRef.current === "hands" && hf.present;

      if (usingHands && hf.hands.length >= 2) {
        ax = hf.hands[0].x;
        ay = hf.hands[0].y;
        bx = hf.hands[1].x;
        by = hf.hands[1].y;
        // separation + openness -> voltage; closer hands = fiercer arcing
        const sep = hf.separation;
        const open = (hf.hands[0].openness + hf.hands[1].openness) * 0.5;
        voltage = Math.min(1, 0.4 + (1 - Math.min(1, sep / 0.9)) * 0.5 + open * 0.3);
      } else if (usingHands && hf.hands.length === 1) {
        // one hand: it is one terminal, the other drifts to meet it
        ax = hf.hands[0].x;
        ay = hf.hands[0].y;
        phaseB += dt * 0.5;
        bx = 0.5 + Math.cos(phaseB) * 0.28;
        by = 0.5 + Math.sin(phaseB * 1.3) * 0.24;
        voltage = Math.min(1, 0.5 + hf.hands[0].openness * 0.4);
      } else {
        // autonomous — two orbiting drifters, gentle Lissajous drift
        phaseA += dt * 0.42;
        phaseB += dt * 0.37;
        ax = 0.30 + Math.cos(phaseA) * 0.16 + Math.sin(phaseA * 0.6) * 0.05;
        ay = 0.5 + Math.sin(phaseA * 1.1) * 0.22;
        bx = 0.70 + Math.cos(phaseB + 1.7) * 0.16 + Math.sin(phaseB * 0.5) * 0.05;
        by = 0.5 + Math.sin(phaseB * 0.9 + 2.0) * 0.22;
        // slow voltage breathing so the storm surges and eases
        voltage = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(tSec * 0.5));
      }

      dbm.setTerminals(
        { x: ax * GRID_W, y: ay * GRID_H },
        { x: bx * GRID_W, y: by * GRID_H },
      );
      dbm.voltage = voltage;

      // ── advance the discharge ──────────────────────────────────────────────
      const branches: Branch[] = dbm.step(dt);
      for (const br of branches) {
        live.push({
          x0: br.x0 / GRID_W,
          y0: br.y0 / GRID_H,
          x1: br.x1 / GRID_W,
          y1: br.y1 / GRID_H,
          heightNorm: br.heightNorm,
          root: br.root,
          life: 1,
        });
        if (soundRef.current) {
          soundRef.current.pluck(br.heightNorm, 0.4 + voltage * 0.5);
        }
      }
      if (live.length > MAX_LIVE) live.splice(0, live.length - MAX_LIVE);

      if (soundRef.current) {
        soundRef.current.setDensity(branches.length, voltage);
      }

      // ── handle a bridging connection → flash + reseed ──────────────────────
      if (dbm.connected && now > strikeHoldUntil) {
        strikeFlash = 1;
        strikeHoldUntil = now + 120; // brief hold before reseed
        if (soundRef.current) soundRef.current.strike();
        // decay all live segs faster after a strike so the frame clears
        dbm.reseed();
      }
      strikeFlash *= 0.88;

      // ── age the live trail ─────────────────────────────────────────────────
      for (const s of live) s.life -= dt * 2.2;
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].life <= 0) live.splice(i, 1);
      }

      // ── build render segments ──────────────────────────────────────────────
      const segs: Seg[] = [];
      const flash = strikeFlash;
      for (const s of live) {
        const heat = Math.min(1, s.life * (0.8 + voltage * 0.5) + flash * 0.6);
        // newer/near-tip arcs whiter; older cooler toward violet-root
        const tone = Math.min(1, 0.35 + s.life * 0.6 + flash * 0.5);
        segs.push({
          x0: s.x0,
          y0: s.y0,
          x1: s.x1,
          y1: s.y1,
          heat,
          tone,
        });
      }

      // ── luminance safety multiplier ────────────────────────────────────────
      if (flickerOnRef.current && !flicker.enabled) flicker.enable();
      if (!flickerOnRef.current && flicker.enabled) flicker.disable();
      const lum = flicker.value(tSec) * (1 + flash * 0.35);

      // ── present ────────────────────────────────────────────────────────────
      if (renderer) {
        renderer.render(segs, {
          decay: 0.9,
          lum,
          bloom: 0.85,
          thickness: 0.006,
        });
      } else if (ctx2d) {
        canvas2dDraw(
          segs,
          [
            { x: ax, y: ay },
            { x: bx, y: by },
          ],
          lum,
        );
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (renderer) renderer.dispose();
    };
  }, []);

  // ── hand-tracking poll loop (separate; only active once tracker exists) ─────
  useEffect(() => {
    if (inputMode !== "hands") return;
    let raf = 0;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const tr = trackerRef.current;
      if (tr) {
        handsFrameRef.current = tr.poll(performance.now());
      }
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [inputMode]);

  // ── audio: start on first user gesture ──────────────────────────────────────
  const ensureAudio = useCallback(() => {
    if (soundRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === "suspended") void ctx.resume();
      soundRef.current = new LightningAudio(ctx);
      setSoundOn(true);
    } catch {
      setSoundOn(false);
    }
  }, []);

  const enableCamera = useCallback(async () => {
    ensureAudio();
    setCamMsg("Requesting camera…");
    const tracker = new HandTracker();
    trackerRef.current = tracker;
    const ok = await tracker.start();
    if (ok) {
      setInputMode("hands");
      setCamMsg(null);
    } else {
      tracker.dispose();
      trackerRef.current = null;
      setInputMode("autonomous");
      setCamMsg(
        "Camera or hand model unavailable — staying in the autonomous storm.",
      );
    }
  }, [ensureAudio]);

  // cleanup audio + tracker on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.dispose();
      soundRef.current = null;
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, []);

  const tracking = inputMode === "hands" && handsFrameRef.current.present;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#050308] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onClick={ensureAudio}
      />

      {renderMode === "none" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            Your browser could not provide WebGL2 or a 2D canvas, so the
            lightning organ cannot render here. Try a recent Chrome, Edge, or
            Firefox on a machine with GPU access.
          </p>
        </div>
      )}

      {/* header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 p-5 sm:p-7">
        <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
          Lightning Organ
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          Your two hands are electrodes. Every branch of a real
          dielectric-breakdown discharge that cracks between them rings a note.
        </p>
      </div>

      {/* status badge */}
      <div className="pointer-events-none absolute right-5 top-5 sm:right-7 sm:top-7">
        <span
          className={
            "rounded-full border px-3 py-1.5 font-mono text-sm " +
            (tracking
              ? "border-violet-400/40 bg-violet-400/10 text-violet-200"
              : "border-violet-400/40 bg-violet-400/10 text-violet-200")
          }
        >
          {tracking
            ? "● hands tracked"
            : "● autonomous — enable camera to conduct"}
        </span>
      </div>

      {/* controls */}
      <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-3 px-5">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!soundOn && (
            <button
              onClick={ensureAudio}
              className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              ▶ Click for sound
            </button>
          )}
          {inputMode !== "hands" && (
            <button
              onClick={enableCamera}
              className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-400/[0.12] px-4 py-2.5 text-base text-violet-100 transition-colors hover:bg-violet-400/20"
            >
              Enable camera → conduct with your hands
            </button>
          )}
          <button
            onClick={() => setFlickerOn((f) => !f)}
            className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            {flickerOn ? "Steady glow" : "Slow pulse (≤3 Hz)"}
          </button>
        </div>

        {/* η slider — the signature control */}
        <label className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-black/50 px-4 py-3 backdrop-blur-sm">
          <span className="whitespace-nowrap font-mono text-base text-foreground">
            η {eta.toFixed(1)}
          </span>
          <input
            type="range"
            min={1}
            max={6}
            step={0.1}
            value={eta}
            onChange={(e) => setEta(parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-violet-400"
          />
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            bushy → forked
          </span>
        </label>

        {camMsg && (
          <p className="max-w-md text-center text-sm text-violet-300">{camMsg}</p>
        )}
      </div>

      {/* design-notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-5 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground sm:right-7"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="max-h-[80vh] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-[#0a0712] p-6 text-foreground">
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="font-serif text-xl text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full border border-border px-4 py-2 text-base text-foreground hover:bg-accent"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-base leading-relaxed text-foreground">
              <p>
                The discharge is grown with the{" "}
                <strong>Dielectric Breakdown Model</strong> (Niemeyer,
                Pietronero &amp; Wiesmann, <em>Phys. Rev. Lett.</em> 52, 1033,
                1984). On a coarse 128×72 grid we relax ∇²φ = 0 with the two
                terminals held at φ = 1 and the growing discharge at φ = 0, then
                add frontier cells with probability ∝ |φ|
                <sup>η</sup>.
              </p>
              <p>
                The <strong>η slider</strong> is the signature control: η ≈ 1
                gives bushy DLA-like growth; η ≈ 3–6 gives sharp forked
                lightning. When a discharge bridges the terminals it flashes,
                fires a sub-boom, and re-seeds — so the storm never stops.
              </p>
              <p>
                Each new branch rings an FM pluck whose pitch rises toward the
                top of the frame, so a descending strike sweeps a downward
                pentatonic arpeggio, with band-passed noise crackle riding each
                note. Grant the camera and your two hands{" "}
                <em>become</em> the electrodes (MediaPipe HandLandmarker, 21 3D
                keypoints/hand): palm centroids set the terminals, and hand
                separation + openness set the field voltage.
              </p>
              <p className="text-sm text-muted-foreground">
                Rendered in hand-written WebGL2 with an accumulation-FBO
                afterglow (never a full-frame strobe); any luminance pulse is
                gated ≤ 3 Hz through the shared safe-flicker engine.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1085-lightning-organ"]} />
    </main>
  );
}
