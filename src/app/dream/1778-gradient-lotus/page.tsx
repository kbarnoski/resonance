"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LotusAudio } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 1778 — Gradient Lotus
//
// THE ONE QUESTION: can a genuinely psychedelic, audio-reactive mandala be
// rendered with NO canvas and NO WebGL at all — using only the browser's CSS
// compositor (stacked animated conic/radial gradients, blend modes and masks)
// driven by CSS custom properties written from a Web-Audio FFT each frame?
//
// Every layer below is an absolutely-positioned <div> whose background is a
// repeating-conic-gradient (petals) or radial-gradient (bloom), fused with
// mix-blend-mode, feathered with mask-image, and turned by mutating a handful
// of custom properties (--rot, --bloom, --hue, --open, --band0..5) from a single
// requestAnimationFrame loop. No <canvas>, no WebGL, no three.js — the CSS
// compositor itself is the render substrate. See README.md.
// ════════════════════════════════════════════════════════════════════════════

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ── the gradient art (constant strings; only the custom props they read change)
const RADIAL_MASK =
  "radial-gradient(circle at 50% 50%, #000 0%, #000 52%, rgba(0,0,0,0.35) 72%, transparent 84%)";

const LAYER_BASE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

// Petal layer A — warm amber→rose, turning with --rot; alpha tracks a bass band.
const PETALS_A =
  "repeating-conic-gradient(from calc(var(--rot) * 1deg) at 50% 50%," +
  " hsla(36, 95%, 62%, 0) 0deg," +
  " hsla(24, 97%, 56%, calc(0.55 * var(--band1))) calc(var(--petalA) * 0.5deg)," +
  " hsla(344, 88%, 58%, 0) calc(var(--petalA) * 1deg))";

// Petal layer B — magenta→violet, counter-rotating with --rot2 (moiré vs A).
const PETALS_B =
  "repeating-conic-gradient(from calc(var(--rot2) * -1deg) at 50% 50%," +
  " hsla(300, 90%, 60%, 0) 0deg," +
  " hsla(330, 92%, 58%, calc(0.45 * var(--band2))) calc(var(--petalB) * 0.5deg)," +
  " hsla(275, 82%, 56%, 0) calc(var(--petalB) * 1deg))";

// Petal layer C — fine golden shimmer on --rot3; alpha tracks an upper band.
const PETALS_C =
  "repeating-conic-gradient(from calc(var(--rot3) * 1deg) at 50% 50%," +
  " hsla(45, 100%, 70%, 0) 0deg," +
  " hsla(38, 100%, 66%, calc(0.32 * var(--band4))) calc(var(--petalC) * 0.5deg)," +
  " hsla(14, 96%, 60%, 0) calc(var(--petalC) * 1deg))";

// Central bloom — a warm core whose radius and intensity ride --bloom. Peak
// lightness is held at 80% (never pure white) as a strobe/flash safety clamp.
const BLOOM =
  "radial-gradient(circle at calc(50% + var(--px) * 12%) calc(50% + var(--py) * 12%)," +
  " hsla(42, 100%, 80%, calc(0.5 * var(--bloom))) 0%," +
  " hsla(30, 96%, 62%, calc(0.4 * var(--bloom))) calc(6% + var(--bloom) * 18%)," +
  " hsla(330, 80%, 46%, 0.16) calc(20% + var(--bloom) * 30%)," +
  " hsla(270, 70%, 20%, 0) 70%)";

// Iridescence — a slow full-ramp conic under mix-blend-mode:soft-light, nudged
// by --hue for interference-band colour drift (kept in the warm→violet arc).
const IRIDESCENCE =
  "conic-gradient(from calc(var(--rot3) * -0.6deg) at 50% 50%," +
  " hsl(30 95% 55%), hsl(350 90% 55%), hsl(300 85% 55%)," +
  " hsl(278 80% 55%), hsl(18 95% 55%), hsl(30 95% 55%))";

// Vignette / aperture — darkens the rim, holds the lotus in a soft circle, and
// caps overall brightness at the edges.
const VIGNETTE =
  "radial-gradient(circle at 50% 50%, transparent 28%, rgba(6,3,14,0.5) 68%, rgba(4,2,10,0.92) 100%)";

// The warm backdrop that shows even if conic-gradient is unsupported.
const BASE_WASH =
  "radial-gradient(circle at 50% 46%, hsl(32 65% 16%) 0%, hsl(300 55% 10%) 42%, #0b0713 100%)";

const INITIAL_VARS: Record<string, string> = {
  "--rot": "0",
  "--rot2": "0",
  "--rot3": "0",
  "--bloom": "0.3",
  "--hue": "0",
  "--warp": "0",
  "--open": "0.4",
  "--sat": "0.3",
  "--px": "0",
  "--py": "0",
  "--petalA": "14",
  "--petalB": "20",
  "--petalC": "6",
  "--band0": "0.2",
  "--band1": "0.2",
  "--band2": "0.2",
  "--band3": "0.2",
  "--band4": "0.2",
  "--band5": "0.2",
};

export default function Page() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<LotusAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const stateRef = useRef({
    rot: 0,
    rot2: 0,
    rot3: 0,
    hue: 0,
    px: 0,
    py: 0,
    targetPx: 0,
    targetPy: 0,
    clickBloom: 0,
    reduced: false,
    last: 0,
  });

  const setVar = useCallback((name: string, value: number, unit = "") => {
    rootRef.current?.style.setProperty(name, `${value}${unit}`);
  }, []);

  const handleBegin = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const engine = new LotusAudio();
      await engine.resume();
      audioRef.current = engine;
    } catch (e) {
      // Audio may be blocked; the visual still runs (synthetic idle energy).
      console.error("Lotus audio init failed:", e);
    }
    setStarted(true);
  }, []);

  // Pointer parallax — gently nudges the bloom centre and warp.
  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    stateRef.current.targetPx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
    stateRef.current.targetPy = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
  }, []);

  // Click / tap adds a warm bloom pulse.
  const onPointerDown = useCallback(() => {
    stateRef.current.clickBloom = Math.min(0.5, stateRef.current.clickBloom + 0.35);
  }, []);

  // Optional: drop an audio file to drive the mandala instead of the bed.
  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!startedRef.current) await handleBegin();
      try {
        const buf = await file.arrayBuffer();
        await audioRef.current?.playFile(buf);
      } catch (err) {
        console.error("could not play dropped file:", err);
      }
    },
    [handleBegin],
  );

  const onDragOver = useCallback((e: DragEvent) => e.preventDefault(), []);

  // Single animation loop: mutate custom props from time + audio FFT bands.
  useEffect(() => {
    stateRef.current.reduced = prefersReducedMotion();
    const st = stateRef.current;
    st.last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      const t = now / 1000;
      const rf = st.reduced ? 0.16 : 1; // reduced-motion slows every rotation

      // ── continuous rotation of the three petal fields ──
      st.rot = (st.rot + dt * 6 * rf) % 360;
      st.rot2 = (st.rot2 + dt * 4.2 * rf) % 360;
      st.rot3 = (st.rot3 + dt * 9 * rf) % 360;

      // ── audio energy → six bands (or a gentle synthetic idle bed) ──
      let energy = 0;
      const audio = audioRef.current;
      if (audio) {
        audio.tick(dt);
        const bands = audio.readBands();
        for (let i = 0; i < 6; i++) {
          setVar(`--band${i}`, bands[i]);
          energy += bands[i];
        }
        energy /= 6;
      } else {
        for (let i = 0; i < 6; i++) {
          const b = 0.14 + 0.08 * (0.5 + 0.5 * Math.sin(t * (0.3 + i * 0.13) + i));
          setVar(`--band${i}`, b);
          energy += b;
        }
        energy /= 6;
      }

      // ── ~0.13 Hz breathing, damped under reduced motion ──
      const breatheDepth = st.reduced ? 0.18 : 0.42;
      const breathe = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.13 * t);
      const open = clamp01(
        0.34 + breatheDepth * breathe * (0.55 + 0.45 * energy) + energy * 0.28,
      );

      st.clickBloom *= Math.exp(-dt * 1.4);
      const bloom = clamp01(0.24 + 0.5 * energy + 0.24 * breathe + st.clickBloom);

      // hue drift kept inside a warm ±35° arc so it never leaves the palette
      const hue = Math.sin(t * 0.05) * 20 + energy * 15;
      const sat = clamp01(0.2 + energy);
      const warp = (st.reduced ? 0.006 : 0.02) * Math.sin(t * 0.09) + energy * 0.03;

      // pointer parallax easing
      st.px += (st.targetPx - st.px) * 0.05;
      st.py += (st.targetPy - st.py) * 0.05;

      // petal angular periods — the mandala gets finer/more intricate as it opens
      const petalA = 16 - open * 7;
      const petalB = 22 - open * 9;
      const petalC = 7 - open * 3;

      setVar("--rot", st.rot);
      setVar("--rot2", st.rot2);
      setVar("--rot3", st.rot3);
      setVar("--open", open);
      setVar("--bloom", bloom);
      setVar("--hue", hue);
      setVar("--sat", sat);
      setVar("--warp", warp);
      setVar("--px", st.px);
      setVar("--py", st.py);
      setVar("--petalA", petalA);
      setVar("--petalB", petalB);
      setVar("--petalC", petalC);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [setVar]);

  // Tear down audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  return (
    <main
      ref={rootRef}
      className="relative h-[100dvh] w-full touch-none overflow-hidden bg-black text-foreground"
      style={INITIAL_VARS as CSSProperties}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* ── The stack. A breathing/parallax "stage" holds every gradient layer. */}
      <div
        className="absolute inset-0"
        style={{
          transform:
            "translate3d(calc(var(--px) * 1.5%), calc(var(--py) * 1.5%), 0) scale(calc(1 + var(--open) * 0.05 + var(--warp)))",
          filter:
            "saturate(calc(1 + var(--sat) * 0.55)) brightness(calc(0.95 + var(--open) * 0.12))",
          willChange: "transform, filter",
        }}
      >
        {/* base warm wash — shows even without conic-gradient support */}
        <div style={{ ...LAYER_BASE, background: BASE_WASH }} />

        {/* petal field A */}
        <div
          style={{
            ...LAYER_BASE,
            background: PETALS_A,
            mixBlendMode: "screen",
            maskImage: RADIAL_MASK,
            WebkitMaskImage: RADIAL_MASK,
          }}
        />

        {/* kaleidoscope mirror of A for bilateral symmetry */}
        <div
          style={{
            ...LAYER_BASE,
            background: PETALS_A,
            mixBlendMode: "screen",
            opacity: 0.7,
            transform: "scaleX(-1)",
            maskImage: RADIAL_MASK,
            WebkitMaskImage: RADIAL_MASK,
          }}
        />

        {/* petal field B — counter-rotating, magenta/violet, moiré against A */}
        <div
          style={{
            ...LAYER_BASE,
            background: PETALS_B,
            mixBlendMode: "overlay",
            maskImage: RADIAL_MASK,
            WebkitMaskImage: RADIAL_MASK,
          }}
        />

        {/* petal field C — fine golden shimmer */}
        <div
          style={{
            ...LAYER_BASE,
            background: PETALS_C,
            mixBlendMode: "screen",
            maskImage: RADIAL_MASK,
            WebkitMaskImage: RADIAL_MASK,
          }}
        />

        {/* iridescent interference bands */}
        <div
          style={{
            ...LAYER_BASE,
            background: IRIDESCENCE,
            mixBlendMode: "soft-light",
            opacity: 0.35,
            filter: "hue-rotate(calc(var(--hue) * 1deg))",
            maskImage: RADIAL_MASK,
            WebkitMaskImage: RADIAL_MASK,
          }}
        />

        {/* central warm bloom */}
        <div
          style={{ ...LAYER_BASE, background: BLOOM, mixBlendMode: "screen" }}
        />

        {/* aperture vignette + brightness clamp */}
        <div style={{ ...LAYER_BASE, background: VIGNETTE }} />
      </div>

      {/* ── Title + Begin overlay ── */}
      {!started && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Gradient Lotus
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            A warm, breathing mandala rendered with no canvas and no WebGL —
            only stacked animated CSS gradients, blend modes and masks, turned
            by a live audio FFT.
          </p>
          <button
            type="button"
            onClick={handleBegin}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
          <p className="max-w-md text-sm text-muted-foreground">
            It plays and turns on its own. Move the pointer to drift the centre,
            click for a bloom pulse, or drop an audio file to drive it.
          </p>
        </div>
      )}

      {/* ── Design-notes toggle ── */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute bottom-4 right-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg space-y-4 rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              A mandala made of CSS
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Almost every psychedelic piece in this lab is a GPU fragment
                shader or a Canvas2D draw loop. This one proves a third render
                substrate — the browser&apos;s CSS compositor itself. There is
                no <span className="text-foreground">&lt;canvas&gt;</span> and no
                WebGL anywhere on the page.
              </p>
              <p>
                The whole visual is a stack of eight absolutely-positioned{" "}
                <span className="text-foreground">&lt;div&gt;</span>s. Each is a{" "}
                <span className="text-foreground">repeating-conic-gradient</span>{" "}
                (the petals) or <span className="text-foreground">radial-gradient</span>{" "}
                (the bloom), fused with <span className="text-foreground">mix-blend-mode</span>{" "}
                (screen / overlay / soft-light), feathered by a{" "}
                <span className="text-foreground">mask-image</span> aperture, and
                mirrored via <span className="text-foreground">scaleX(-1)</span>{" "}
                for kaleidoscope symmetry.
              </p>
              <p>
                A single requestAnimationFrame loop writes a handful of CSS
                custom properties each frame — <span className="text-foreground">--rot</span>,{" "}
                <span className="text-foreground">--bloom</span>,{" "}
                <span className="text-foreground">--hue</span>,{" "}
                <span className="text-foreground">--open</span> and six FFT
                energy bands <span className="text-foreground">--band0..5</span>.
                Louder, brighter audio opens the petals, deepens the bloom and
                saturates the colour; quiet lets it close.
              </p>
              <p>
                No strobe: rotation is slow, breathing is ~0.13 Hz, peak
                brightness is clamped below white, and{" "}
                <span className="text-foreground">prefers-reduced-motion</span>{" "}
                slows every rotation and damps the swings.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
