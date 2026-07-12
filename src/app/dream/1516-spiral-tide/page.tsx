"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1516-spiral-tide — "The Spiral States" (cycle 2 of 1506-theta-tide).
//
// A closed-form complex traveling wave ψ(u,v,t) in cortical coordinates MORPHS
// through three genuine propagation geometries — PLANAR → CONCENTRIC → SPIRAL —
// the patterns Das/Zabeh/Ermentrout/Jacobs (Nature Comms 2026) show distinguish
// human cognitive states. Under the inverse log-polar warp r = exp(u) each reads
// out as a Klüver form constant; the SPIRAL carries a real integer winding
// number that winds the phase around the origin (not a rotated texture). The
// whole field is rendered through an audio-reactive Bayer 8×8 ordered dither
// (after Robert Borghesi's ASTRODITHER, webgpu.com, 1 Jul 2026): the grain
// thickens as the sound swells. The SAME ψ that lights each pixel is evaluated
// at fixed listening rings to ring the struck bells — exact / structural
// see==hear. Pure Canvas2D, GPU-independent. Space / click advances the state;
// ← / → flip the spiral chirality and the Shepard glissando direction.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  SpiralField,
  SEED,
  RINGS,
  SPOKES,
  U_MIN,
  U_MAX,
  BAYER8,
} from "./field";
import { makeSpiralAudio } from "./audio";

const N = RINGS * SPOKES;
const EXP_MAX = Math.exp(U_MAX);

export default function SpiralTidePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Planar");

  const beginRef = useRef<() => void>(() => {});
  const advanceRef = useRef<() => void>(() => {});
  const flipRef = useRef<(s: number) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = prefersReducedMotion();

    // Precompute the cortical sampling grid (canvas-independent).
    const uArr = new Float32Array(N);
    const vArr = new Float32Array(N);
    const expU = new Float32Array(N);
    const rawX = new Float32Array(N); // exp(u)·cos v  (cortexToScreen unit)
    const rawY = new Float32Array(N); // exp(u)·sin v
    let idx = 0;
    for (let ri = 0; ri < RINGS; ri++) {
      const u = U_MIN + ((U_MAX - U_MIN) * ri) / (RINGS - 1);
      const e = Math.exp(u);
      for (let si = 0; si < SPOKES; si++) {
        const v = (2 * Math.PI * si) / SPOKES;
        uArr[idx] = u;
        vArr[idx] = v;
        expU[idx] = e;
        rawX[idx] = e * Math.cos(v);
        rawY[idx] = e * Math.sin(v);
        idx++;
      }
    }

    let field = new SpiralField(SEED, reduced);
    const audio = makeSpiralAudio();

    let disposed = false;
    let raf = 0;
    let last = performance.now();

    const previewSpeed = reduced ? 3 : 6;
    const speedRef = { v: previewSpeed };
    const runningRef = { v: false };

    beginRef.current = () => {
      field = new SpiralField(SEED, reduced);
      speedRef.v = 1;
      runningRef.v = true;
      setRunning(true);
      audio.resume().catch(() => {});
    };
    advanceRef.current = () => field.advanceState();
    flipRef.current = (s: number) => field.flip(s);

    // DPR-aware sizing.
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    // Reusable per-frame lightness/alpha palette (rebuilt once per frame).
    const BUCKETS = 24;
    const palette: string[] = new Array(BUCKETS).fill("#000");

    const frame = (nowMs: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const effDt = dt * speedRef.v;

      field.step(effDt);
      const p = field.params();

      // Audio: shared clock — same ψ crossings drive the bells.
      if (runningRef.v && audio.running()) {
        const strikes = field.collectStrikes();
        for (const ev of strikes) audio.strike(ev);
        audio.setDrive(p.drive, p.dir);
        audio.step(effDt);
      } else {
        field.collectStrikes(); // drain so the queue never grows in preview
      }

      // ── Render ────────────────────────────────────────────────────────────
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = 0.92 * Math.min(canvas.width, canvas.height) * 0.5;
      const PIX = maxR / EXP_MAX;

      // Low-alpha clear → additive colour trails / tracers for free. A touch of
      // retained glow keeps mean luminance ~constant (photosensitive-safe).
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = reduced ? "rgba(6,4,12,0.28)" : "rgba(6,4,12,0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const { w: wt, k, mEff, phi, tempPhase } = p;
      const cphi = Math.cos(phi);
      const sphi = Math.sin(phi);
      const globalBright = reduced ? 0.7 : 1;

      // Rebuild the hue/lightness palette (16–24 strings/frame, not 6600).
      const hueDeg = p.hue * 360;
      const sat = reduced ? 46 : 84;
      for (let b = 0; b < BUCKETS; b++) {
        const br = (b + 0.5) / BUCKETS;
        const L = 26 + 56 * br;
        const a = (0.16 + 0.5 * br) * globalBright;
        palette[b] = `hsla(${hueDeg.toFixed(0)},${sat}%,${L.toFixed(0)}%,${a.toFixed(3)})`;
      }

      // Audio-reactive ordered dither: the threshold scale/bias breathe with the
      // smoothed gain-envelope amplitude, plus a very slow (<0.2 Hz) drift so the
      // grain never high-frequency flickers.
      const amp = p.ditherAmp;
      const slow = 0.5 + 0.5 * Math.sin(field.t * 0.9); // ~0.14 Hz
      const ditScale = 0.5 + 0.22 * slow;
      const ditBias = 0.46 - 0.34 * amp; // swell ⇒ lower threshold ⇒ thicker grain

      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < N; i++) {
        const u = uArr[i];
        const v = vArr[i];
        // Combined complex traveling wave — real part is the luminance.
        const phPl = k * (cphi * u + sphi * v) + tempPhase;
        const phCo = k * u + tempPhase;
        const phSp = k * u + mEff * v + tempPhase;
        const re = wt[0] * Math.cos(phPl) + wt[1] * Math.cos(phCo) + wt[2] * Math.cos(phSp);
        let bright = 0.5 + 0.5 * re; // 0..1

        const px = cx + PIX * rawX[i];
        const py = cy + PIX * rawY[i];
        if (px < -30 || py < -30 || px > canvas.width + 30 || py > canvas.height + 30) {
          continue;
        }

        // Bayer 8×8 threshold indexed by the sample's screen pixel.
        const bx = ((px | 0) & 7);
        const by = ((py | 0) & 7);
        const thr = BAYER8[by * 8 + bx] * ditScale + ditBias;
        if (bright <= thr) continue; // dithered out this frame

        // Gentle radial falloff so the deep periphery stays calm.
        bright *= 0.55 + 0.45 * Math.min(1, expU[i] * 0.9);

        let b = (bright * BUCKETS) | 0;
        if (b < 0) b = 0;
        else if (b >= BUCKETS) b = BUCKETS - 1;

        let s = PIX * expU[i] * 0.055;
        if (s < 1.2) s = 1.2;
        else if (s > 26) s = 26;

        ctx.fillStyle = palette[b];
        ctx.fillRect(px - s * 0.5, py - s * 0.5, s, s);
      }

      setProgress(p.progress);
      setLabel(p.label);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        advanceRef.current();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        flipRef.current(-1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        flipRef.current(1);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      audio.dispose();
    };
  }, []);

  const pct = Math.round(progress * 100);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        onClick={() => advanceRef.current()}
        className="absolute inset-0 h-full w-full cursor-pointer touch-none"
      />

      {/* title + description */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-md">
        <a
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Spiral Tide
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          A cortical traveling wave morphs through planar, concentric and a real
          rotating spiral — and you hear the spiral turn.
        </p>
      </div>

      {/* design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Design notes"}
      </button>

      {/* controls */}
      <div className="absolute bottom-6 left-1/2 z-20 w-[min(92vw,540px)] -translate-x-1/2 rounded-lg border border-border bg-background/60 px-5 py-4 backdrop-blur">
        {!running ? (
          <button
            type="button"
            onClick={() => beginRef.current()}
            className="min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="w-24 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>
        )}
        <p className="mt-3 text-base text-muted-foreground">
          {running
            ? "Space or click advances the wave state · ← / → flip the spiral's chirality and the glissando direction. It also self-plays over ~6 minutes."
            : "A fast silent preview is drifting already. Press Begin for the slow, audible ~6-minute arc — planar drift, breathing rings, then the spiral melt."}
        </p>
      </div>

      {/* notes modal */}
      {showNotes && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-background/90 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-2xl text-foreground">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-4 text-base">
              A single closed-form complex wave{" "}
              <span className="text-primary">ψ(u,&nbsp;v,&nbsp;t)</span> lives in
              cortical (u,&nbsp;v) coordinates and genuinely morphs through the
              three propagation geometries Das, Zabeh, Ermentrout &amp; Jacobs
              (<em>Nature Communications</em>, 2026) show distinguish behavioural
              states in human memory: a <span className="text-primary">planar</span>{" "}
              plane wave, a <span className="text-primary">concentric</span> wave
              in u&nbsp;=&nbsp;log&nbsp;r, and a{" "}
              <span className="text-primary">spiral</span> carrying an integer
              winding number <em>m</em> that winds the phase around the origin.
              Under the inverse log-polar retino-cortical map (Bressloff &amp;
              Cowan, 2001) each reads out as a Klüver form constant: drifting
              tunnels, breathing rings, and a real rotating vortex.
            </p>
            <p className="mt-4 text-base">
              <span className="text-primary">See&nbsp;==&nbsp;hear (exact):</span>{" "}
              the very same ψ that sets a pixel&apos;s brightness is evaluated at
              a handful of fixed listening rings. When a wavefront crosses a ring
              — the same instant the bright front visibly reaches that radius — an
              inharmonic struck-bell cluster rings, panned to the front&apos;s
              on-screen angle. In the spiral state that angle winds and rotates as
              the phase turns, so the pan sweeps continuously: you hear the spiral
              spinning. One ψ, one clock, one location.
            </p>
            <p className="mt-4 text-base">
              <span className="text-primary">Render aesthetic:</span> the field is
              quantised through a Bayer 8×8 ordered dither after Robert
              Borghesi&apos;s <em>ASTRODITHER</em> (webgpu.com, 1&nbsp;July&nbsp;2026).
              The dither threshold breathes with the smoothed gain-envelope
              amplitude that also drives the audio master, so the grain thickens
              as the sound swells — an audio-reactive dither. Additive dots over a
              low-alpha clear give LSD colour trails for free. It is pure Canvas2D,
              so the exact structural see==hear holds on any machine, GPU or not.
            </p>
            <p className="mt-4 text-base">
              <span className="text-primary">Attention (cycle-2 feature):</span>{" "}
              Space or a click advances the wave state; ← / → flip the spiral&apos;s
              chirality and the wave direction, with a matching Shepard glissando
              direction reversal. The arc also auto-advances on a
              mulberry32-seeded timeline, so it self-plays: planar calm →
              concentric build → the spiral peak (the melt) → a gentle settle,
              ~6&nbsp;minutes, non-looping (minute&nbsp;6 ≠ minute&nbsp;1).
            </p>
            <p className="mt-4 text-base">
              <span className="text-primary">Safety:</span> the effective temporal
              rate is held near 0.7&nbsp;Hz — well under the 3-Hz photosensitive
              ceiling — as a <em>spatial</em> moving ring/spiral with slow hue
              drift, not a full-field luminance flash; the dither animates slowly
              (&lt;&nbsp;0.2&nbsp;Hz) with no strobe. Audio is gesture-gated, ramps
              from silence to ≤&nbsp;0.2 through a compressor limiter, caps at 14
              voices and tears fully down on unmount. Reduced-motion slows
              everything ~0.4× and desaturates.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              This is cycle 2 of{" "}
              <span className="text-foreground">1506-theta-tide</span>: it adds
              genuine winding-number spiral waves and the attentional state /
              chirality flip. References: Das, Zabeh, Ermentrout &amp; Jacobs,{" "}
              <em>
                Planar, spiral, and concentric traveling waves distinguish
                behavioral states in human memory
              </em>{" "}
              (Nature Comms 2026); Bressloff &amp; Cowan (2001); Klüver form
              constants; ASTRODITHER (Borghesi, webgpu.com, 1&nbsp;Jul&nbsp;2026).
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-muted px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1516-spiral-tide", "1506-theta-tide"]} />
    </div>
  );
}
