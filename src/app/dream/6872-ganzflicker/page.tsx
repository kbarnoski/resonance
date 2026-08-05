"use client";

// ════════════════════════════════════════════════════════════════════════════
// 6872 · GANZFLICKER — from dots to faces
//
// THE ONE QUESTION: can a screen give you a drug-free hypnagogic hallucination —
// a Ganzflicker field where, as you settle in, simple form-constants (dots,
// gratings, lattices) organize into ever more complex imagery — and does the
// escalation track a "visual-imagery vividness" dial the way the 2026 science
// says it does?
//
// The field renders the instant the page loads (seeded auto-drift), before any
// camera/mic permission and before audio unlock. "Begin" adds the drone;
// "Couple to the room" lets the real room's light + colour drive the field
// (privacy: only its averaged brightness/hue — never the camera image).
//
// The "Imagery vividness" slider is the research hook: it operationalizes the
// 2026 niag016 finding (vivid imagers see complex forms/faces under Ganzflicker;
// aphantasics see mostly dots/geometry). Low = the field stays simple no matter
// how long you watch; high = it climbs quickly to organized forms. A slow
// auto-"settling-in" ramp climbs complexity the longer you stay, unless pinned.
//
// SAFETY: default is SMOOTH slow luminance drift — NO strobe, ever. Any faster
// flicker is opt-in behind a photosensitive-epilepsy warning, hard-clamped
// ≤3 Hz, with an always-visible instant Stop. prefers-reduced-motion disables
// flicker entirely and slows the drift.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { createFieldRenderer, type FieldRenderer } from "./shader";
import { DroneEngine } from "./audio";
import { RoomSensor, type RoomMode } from "./camera";

// ── seeded PRNG (house rule: no Math.random / Date.now / new Date) ────────────
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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const fract = (x: number) => x - Math.floor(x);

function stageWord(c: number): string {
  if (c < 0.18) return "dots";
  if (c < 0.38) return "gratings";
  if (c < 0.58) return "lattice";
  if (c < 0.8) return "cobwebs & spirals";
  return "organized forms";
}

const MAX_FLICKER_HZ = 3; // hard ceiling — can never exceed this

interface Engine {
  renderer: FieldRenderer | null;
  sensor: RoomSensor;
  audio: DroneEngine | null;
  ctx: AudioContext | null;
  raf: number;
  t0: number; // performance.now() at start
  prevMs: number; // performance.now() of previous frame
  complexity: number;
  settle: number;
  smoothBright: number;
  smoothHue: number;
  reduced: boolean;
  phaseA: number;
  phaseB: number;
  frame: number;
  lastStage: string;
  onResize: () => void;
}

export default function Ganzflicker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  // refs the render loop reads (avoid re-render churn)
  const vividRef = useRef(0.55);
  const pinnedRef = useRef(false);
  const flickerRef = useRef({ enabled: false, hz: 2 });

  // DOM refs for per-frame readouts
  const stageRef = useRef<HTMLSpanElement | null>(null);
  const pctRef = useRef<HTMLSpanElement | null>(null);

  const [vividness, setVividness] = useState(0.55);
  const [pinned, setPinned] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [roomMode, setRoomMode] = useState<RoomMode>("idle");
  const [webglFailed, setWebglFailed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [flickerPanel, setFlickerPanel] = useState(false);
  const [flickerEnabled, setFlickerEnabled] = useState(false);
  const [flickerHz, setFlickerHz] = useState(2);

  // ── the render loop ──────────────────────────────────────────────────────
  const loop = useCallback((tMs: number) => {
    const e = engineRef.current;
    if (!e) return;
    const t = (tMs - e.t0) / 1000;
    const dt = Math.min(0.05, e.frame === 0 ? 0.016 : Math.max(0, (tMs - e.prevMs) / 1000));
    e.prevMs = tMs;
    e.frame++;

    // ── complexity: slider ceiling × settling-in ramp (unless pinned) ────────
    const v = vividRef.current;
    let target: number;
    if (pinnedRef.current) {
      e.settle = 1;
      target = v;
    } else {
      const rate = 0.004 + 0.013 * v; // higher vividness → settles faster
      e.settle = Math.min(1, e.settle + dt * rate);
      target = v * e.settle;
    }
    e.complexity += (target - e.complexity) * (1 - Math.exp(-dt / 1.6));
    const c = e.complexity;

    // ── brightness / hue source: camera → mic → seeded auto-drift ────────────
    e.sensor.sample();
    let srcBright: number;
    let srcHue: number;
    if (e.sensor.mode === "camera") {
      srcBright = e.sensor.brightness;
      srcHue = e.sensor.hue;
    } else if (e.sensor.mode === "mic") {
      srcBright = 0.3 + 0.5 * e.sensor.level;
      srcHue = fract(0.72 + 0.1 * Math.sin(t * 0.03 + e.phaseB));
    } else {
      srcBright = 0.42 + 0.14 * Math.sin(t * 0.05 + e.phaseA);
      srcHue = fract(0.72 + 0.1 * Math.sin(t * 0.03 + e.phaseB));
    }
    e.smoothBright += (srcBright - e.smoothBright) * 0.05;
    // shortest-path hue smoothing
    let hd = srcHue - e.smoothHue;
    if (hd > 0.5) hd -= 1;
    if (hd < -0.5) hd += 1;
    e.smoothHue = fract(e.smoothHue + hd * 0.05);

    // ── breath: SAFE slow drift by default; opt-in flicker clamped ≤3 Hz ─────
    const fl = flickerRef.current;
    const useFlicker = fl.enabled && !e.reduced;
    const floor = useFlicker ? 0.6 : 0.72;
    const f = useFlicker
      ? Math.min(MAX_FLICKER_HZ, fl.hz)
      : e.reduced
        ? 0.12
        : 0.22;
    const breath = floor + (1 - floor) * (0.5 + 0.5 * Math.sin(2 * Math.PI * f * t));

    // ── draw ─────────────────────────────────────────────────────────────────
    if (e.renderer) {
      e.renderer.draw({
        time: t,
        complexity: c,
        brightness: clamp01(e.smoothBright),
        hue: e.smoothHue,
        breath,
        reduced: e.reduced,
        grain: e.reduced ? 0.03 : 0.06,
      });
    }

    // ── audio couples to complexity (throttled) ──────────────────────────────
    if (e.audio && e.frame % 6 === 0) e.audio.setComplexity(c);

    // ── readouts ──────────────────────────────────────────────────────────────
    const word = stageWord(c);
    if (word !== e.lastStage && stageRef.current) {
      stageRef.current.textContent = word;
      e.lastStage = word;
    }
    if (pctRef.current && e.frame % 8 === 0)
      pctRef.current.textContent = String(Math.round(c * 100));

    e.raf = requestAnimationFrame(loop);
  }, []);

  // ── mount: build renderer + start loop (alive on load) ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);
    const rng = mulberry32(0x6872);

    const renderer = createFieldRenderer(canvas);
    if (!renderer) setWebglFailed(true);

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      renderer?.resize(w, h);
    };
    if (renderer) sizeCanvas();

    const e: Engine = {
      renderer,
      sensor: new RoomSensor(),
      audio: null,
      ctx: null,
      raf: 0,
      t0: performance.now(),
      prevMs: performance.now(),
      complexity: 0.05,
      settle: 0.12,
      smoothBright: 0.42,
      smoothHue: 0.72,
      reduced: isReduced,
      phaseA: rng() * 6.2831853,
      phaseB: rng() * 6.2831853,
      frame: 0,
      lastStage: "",
      onResize: sizeCanvas,
    };
    window.addEventListener("resize", sizeCanvas);
    engineRef.current = e;
    e.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(e.raf);
      window.removeEventListener("resize", sizeCanvas);
      try {
        e.audio?.stop();
      } catch {
        /* closing */
      }
      try {
        e.sensor.stop();
      } catch {
        /* closing */
      }
      const ctx = e.ctx;
      if (ctx)
        setTimeout(() => {
          if (ctx.state !== "closed") ctx.close().catch(() => {});
        }, 1400);
      try {
        e.renderer?.dispose();
      } catch {
        /* best effort */
      }
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mirror slider/pin/flicker into the loop's refs
  useEffect(() => {
    vividRef.current = vividness;
  }, [vividness]);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);
  useEffect(() => {
    flickerRef.current = { enabled: flickerEnabled, hz: flickerHz };
  }, [flickerEnabled, flickerHz]);

  // ── Begin: unlock audio + drone ───────────────────────────────────────────
  const begin = useCallback(async () => {
    const e = engineRef.current;
    if (!e || e.audio) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume().catch(() => {});
      const drone = new DroneEngine(ctx);
      drone.start();
      e.ctx = ctx;
      e.audio = drone;
      setAudioOn(true);
    } catch {
      /* audio optional — field keeps breathing */
    }
  }, []);

  // ── Couple to the room: camera → mic → idle ───────────────────────────────
  const coupleRoom = useCallback(async () => {
    const e = engineRef.current;
    if (!e) return;
    const mode = await e.sensor.couple();
    setRoomMode(mode);
  }, []);

  // ── flicker controls ──────────────────────────────────────────────────────
  const stopFlicker = useCallback(() => setFlickerEnabled(false), []);

  const roomLabel =
    roomMode === "camera"
      ? "coupled · room light"
      : roomMode === "mic"
        ? "coupled · mic"
        : "auto-drift";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* ART LAYER */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* WebGL-failed notice */}
      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-sm text-center text-base text-destructive">
            WebGL2 is unavailable in this browser, so the Ganzfeld field can’t
            render. Try a recent Chrome, Firefox, or Safari.
          </p>
        </div>
      )}

      {/* TOP-LEFT: title + description + live stage */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-sm sm:left-6 sm:top-6">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · dream 6872
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Ganzflicker
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Soften your gaze and let the luminous field fill your vision. As you
          settle in, dots organize into gratings, lattices, cobwebs — and, if
          your mind’s eye is vivid, into faces.
        </p>
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          stage · <span ref={stageRef} className="text-primary">dots</span>
          <span className="mx-2 opacity-40">|</span>
          <span ref={pctRef}>5</span> complexity
          <span className="mx-2 opacity-40">|</span>
          {roomLabel}
        </div>
      </div>

      {/* BOTTOM PANEL: the imagery-vividness dial + actions */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm sm:p-5">
          {/* dial */}
          <div className="mb-1 flex items-baseline justify-between">
            <label
              htmlFor="vivid"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Imagery vividness
            </label>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {vividness < 0.25
                ? "aphantasia"
                : vividness > 0.75
                  ? "hyperphantasia"
                  : "typical"}
            </span>
          </div>
          <input
            id="vivid"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={vividness}
            onChange={(ev) => setVividness(parseFloat(ev.target.value))}
            className="h-2 w-full cursor-pointer accent-primary"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Low keeps the field to simple dots &amp; geometry however long you
            watch; high climbs quickly to organized forms. The field also settles
            upward on its own the longer you stay.
          </p>

          {/* actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={begin}
              disabled={audioOn}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {audioOn ? "Drone on" : "Begin"}
            </button>
            <button
              onClick={coupleRoom}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {roomMode === "idle" ? "Couple to the room" : "Recouple"}
            </button>
            <button
              onClick={() => setPinned((p) => !p)}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                pinned
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {pinned ? "Pinned" : "Pin (skip settle)"}
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Notes
            </button>
          </div>

          {/* opt-in faster flicker (behind a warning, ≤3 Hz, instant stop) */}
          <div className="mt-3 border-t border-border pt-3">
            {reduced ? (
              <p className="text-xs text-muted-foreground">
                Reduced-motion is on: flicker is disabled and the field drifts
                extra-slowly.
              </p>
            ) : !flickerPanel ? (
              <button
                onClick={() => setFlickerPanel(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                Advanced · faster flicker ›
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-destructive">
                  Photosensitive-epilepsy warning: the optional flicker below
                  pulses the whole field. A small number of people can have
                  seizures from flickering light. It is capped at {MAX_FLICKER_HZ} Hz
                  (well below the danger band), but if you are photosensitive,
                  leave it off.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setFlickerEnabled((x) => !x)}
                    className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                      flickerEnabled
                        ? "border-primary bg-primary/20 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {flickerEnabled ? "Flicker on" : "Enable flicker"}
                  </button>
                  {flickerEnabled && (
                    <button
                      onClick={stopFlicker}
                      className="min-h-[44px] rounded-md border border-destructive bg-background/60 px-4 text-sm text-destructive transition-colors hover:bg-destructive hover:text-primary-foreground"
                    >
                      Stop
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {flickerHz.toFixed(1)} Hz
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={MAX_FLICKER_HZ}
                      step={0.1}
                      value={flickerHz}
                      onChange={(ev) =>
                        setFlickerHz(
                          Math.min(
                            MAX_FLICKER_HZ,
                            parseFloat(ev.target.value),
                          ),
                        )
                      }
                      className="h-2 w-28 cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* always-visible kill switch whenever flicker is live */}
      {flickerEnabled && !reduced && (
        <button
          onClick={stopFlicker}
          className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-destructive bg-background/80 px-4 text-sm text-destructive backdrop-blur-sm transition-colors hover:bg-destructive hover:text-primary-foreground sm:right-6 sm:top-6"
        >
          Stop flicker
        </button>
      )}

      {/* DESIGN NOTES */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A <span className="text-foreground">Ganzfeld</span> is a uniform,
              featureless field of light. Stare into one and the visual system,
              starved of structure, begins to amplify its own noise into imagery —
              the same simple <span className="text-foreground">form constants</span>{" "}
              Heinrich Klüver catalogued in 1926 (dots, gratings, lattices, spirals,
              cobwebs). Add a slow luminous pulse — Grey Walter’s flicker EEG,
              Gysin’s <span className="italic">Dreamachine</span> (1959) — and the
              imagery deepens. This piece renders that field: a dim breathing dome,
              animated “visual snow” grain, and a form-constant layer built from
              stripes and hexagons under a log-polar (exp) warp — the standard
              cortical-to-retinal map.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The <span className="text-foreground">Imagery vividness</span> dial
              makes a fresh 2026 finding playable: “From dots to faces” (
              <span className="italic">Neuroscience of Consciousness</span>, 2026,
              niag016) reports that people with vivid visual imagery
              (hyperphantasia) see complex forms and faces under Ganzflicker, while
              aphantasics see mostly simple dots and geometry. Here the dial sets
              the complexity ceiling; a slow settling-in ramp climbs toward it over
              minutes, faster when vividness is high — so aphantasia stays at dots
              and hyperphantasia reaches organized forms.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The field couples to your actual room: the camera’s{" "}
              <span className="text-foreground">averaged</span> brightness and hue
              set the field’s luminance and tint — never the image itself, which is
              read from a 16×12 downsample and never shown. No camera falls back to
              mic level; no mic to a seeded auto-drift, which is why it is alive the
              instant the page loads.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">Safety.</span> The default is a
              smooth luminance drift near 0.2 Hz — no strobe. Any faster flicker is
              opt-in behind a photosensitive-epilepsy warning, hard-clamped at
              {" "}{MAX_FLICKER_HZ} Hz, with an always-visible Stop. Reduced-motion
              disables flicker and slows everything.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
