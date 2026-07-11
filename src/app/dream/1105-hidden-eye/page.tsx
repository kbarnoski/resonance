"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { computeDepth, encodeSirds, packDepth } from "./sirds";
import { makeGLRig, type GLRig } from "./gl";
import { makeHiddenAudio, type HiddenAudio } from "./audio";

// SIRDS working resolution — the depth field, the dot buffer, and the depth
// texture all live at this size; the shader upscales to the display.
const SW = 512;
const SH = 320;
const SEED = 1337;
const ENCODE_MS = 55; // re-encode the dot field ~18 fps (slow, low-flicker)
const FORM_SPEED = 4 / 48; // one full 4-form loop in ~48 s

type Mode = "wiggle" | "stereo";

export default function HiddenEyePage() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("wiggle");
  const [noGL, setNoGL] = useState(false);
  const [audioErr, setAudioErr] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hud, setHud] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HiddenAudio | null>(null);
  const rafRef = useRef<number>(0);

  const depthFRef = useRef<Float32Array>(new Float32Array(SW * SH));
  const stereoRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray(SW * SH * 4));
  const depthBRef = useRef<Uint8Array>(new Uint8Array(SW * SH));

  const modeRef = useRef<Mode>("wiggle");
  const reducedRef = useRef(false);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(0);
  const lastEncodeRef = useRef(0);
  const reliefRef = useRef(0);

  const formPosRef = useRef(0);
  const manualRef = useRef(false);
  const manualTargetRef = useRef(0);
  const lastFormRef = useRef(-1);

  // steering: keyboard offset + eased device tilt
  const keyCxRef = useRef(0);
  const keyCyRef = useRef(0);
  const tiltXRef = useRef(0);
  const tiltYRef = useRef(0);
  const muRef = useRef(0.30);
  const ERef = useRef(Math.round(SW * 0.16));

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // ── CPU fallback: shade the heightfield straight to a 2D canvas ──────────
  const draw2DReveal = useCallback(() => {
    const ctx = ctx2dRef.current;
    const scratch = scratchRef.current;
    if (!ctx || !scratch) return;
    const depth = depthFRef.current;
    const img = ctx.createImageData(SW, SH);
    const px = img.data;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = y * SW + x;
        const d = depth[i];
        const dl = depth[i - (x > 0 ? 1 : 0)];
        const dr = depth[i + (x < SW - 1 ? 1 : 0)];
        const du = depth[i - (y > 0 ? SW : 0)];
        const dd = depth[i + (y < SH - 1 ? SW : 0)];
        // crude Lambert from gradient
        const nx = (dl - dr) * 4;
        const ny = (du - dd) * 4;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const lam = Math.max(0, (nx * 0.4 + ny * 0.6 + 0.8) * inv);
        const shade = 0.35 + 0.75 * lam;
        const o = i * 4;
        px[o] = Math.min(255, (30 + 210 * d) * shade);
        px[o + 1] = Math.min(255, (20 + 150 * d) * shade);
        px[o + 2] = Math.min(255, (56 + 110 * d) * shade + 40 * d * d);
        px[o + 3] = 255;
      }
    }
    const sctx = scratch.getContext("2d");
    if (!sctx) return;
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(scratch, 0, 0, SW, SH, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    rigRef.current?.resize(w, h);
  }, []);

  const encodeFrame = useCallback((t: number) => {
    const cx = Math.max(-1, Math.min(1, keyCxRef.current + tiltXRef.current * 0.35));
    const cy = Math.max(-1, Math.min(1, keyCyRef.current + tiltYRef.current * 0.35));
    const { relief, meanDepth } = computeDepth(
      depthFRef.current,
      SW,
      SH,
      t,
      cx,
      cy,
      formPosRef.current,
    );
    encodeSirds(stereoRef.current, depthFRef.current, SW, SH, ERef.current, muRef.current, SEED);
    packDepth(depthBRef.current, depthFRef.current, SW, SH);
    rigRef.current?.upload(stereoRef.current, depthBRef.current);
    reliefRef.current = Math.min(1, relief * 9);
    audioRef.current?.update(reliefRef.current, meanDepth);
  }, []);

  const renderLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickRef.current) / 1000);
    lastTickRef.current = now;
    const reduced = reducedRef.current;

    elapsedRef.current += dt * (reduced ? 0.6 : 1);
    const t = elapsedRef.current;

    // evolve or ease the form position
    if (manualRef.current) {
      formPosRef.current += (manualTargetRef.current - formPosRef.current) * 0.04;
    } else {
      formPosRef.current += dt * FORM_SPEED * (reduced ? 0.5 : 1);
      if (formPosRef.current >= 4) formPosRef.current -= 4;
    }

    // form-lock detection → retune + chime
    const nf = ((Math.round(formPosRef.current) % 4) + 4) % 4;
    if (nf !== lastFormRef.current) {
      if (lastFormRef.current !== -1) audioRef.current?.chime();
      audioRef.current?.setForm(nf);
      lastFormRef.current = nf;
    }

    if (now - lastEncodeRef.current > ENCODE_MS) {
      lastEncodeRef.current = now;
      encodeFrame(t);
      if (noGL) draw2DReveal();
    }

    const swayAmp = reduced ? 0.006 : 0.014;
    const sway = Math.sin(t * 0.9) * swayAmp;
    const grain = reduced ? 0.03 : 0.05;
    rigRef.current?.draw(modeRef.current === "stereo" ? 0 : 1, t, sway, grain);

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [encodeFrame, draw2DReveal, noGL]);

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    tiltXRef.current = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
    tiltYRef.current = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 45) / 45));
  }, []);

  const onKey = useCallback((e: KeyboardEvent) => {
    const k = e.key;
    if (k >= "1" && k <= "4") {
      manualRef.current = true;
      manualTargetRef.current = parseInt(k, 10) - 1;
      setHud(`form ${k} · manual — press A to resume`);
    } else if (k === "a" || k === "A") {
      manualRef.current = false;
      setHud("auto-evolving");
    } else if (k === "ArrowLeft") {
      keyCxRef.current = Math.max(-1, keyCxRef.current - 0.06);
      e.preventDefault();
    } else if (k === "ArrowRight") {
      keyCxRef.current = Math.min(1, keyCxRef.current + 0.06);
      e.preventDefault();
    } else if (k === "ArrowUp") {
      keyCyRef.current = Math.max(-1, keyCyRef.current - 0.06);
      e.preventDefault();
    } else if (k === "ArrowDown") {
      keyCyRef.current = Math.min(1, keyCyRef.current + 0.06);
      e.preventDefault();
    } else if (k === "[") {
      muRef.current = Math.max(0.08, muRef.current - 0.03);
      setHud(`depth ${muRef.current.toFixed(2)}`);
    } else if (k === "]") {
      muRef.current = Math.min(0.5, muRef.current + 0.03);
      setHud(`depth ${muRef.current.toFixed(2)}`);
    } else if (k === ",") {
      ERef.current = Math.max(48, ERef.current - 4);
      setHud(`eye-sep ${ERef.current}px`);
    } else if (k === ".") {
      ERef.current = Math.min(140, ERef.current + 4);
      setHud(`eye-sep ${ERef.current}px`);
    } else if (k === "r" || k === "R") {
      setMode((m) => (m === "stereo" ? "wiggle" : "stereo"));
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rig = makeGLRig(canvas, SW, SH);
    if (rig) {
      rigRef.current = rig;
    } else {
      setNoGL(true);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx2dRef.current = ctx;
      const scratch = document.createElement("canvas");
      scratch.width = SW;
      scratch.height = SH;
      scratchRef.current = scratch;
    }
    resize();

    // audio inside the user gesture
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeHiddenAudio(ac, 0.18);
    } catch {
      setAudioErr(true);
    }

    // optional device tilt (best effort, never required)
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") window.addEventListener("deviceorientation", onOrient);
      } catch {
        /* tilt unavailable — keyboard + auto still work */
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrient);
    }

    elapsedRef.current = 0;
    lastTickRef.current = performance.now();
    lastEncodeRef.current = 0;
    lastFormRef.current = -1;
    setHud("auto-evolving");
    setRunning(true);
  }, [running, resize, onOrient]);

  // drive the loop + listeners once running
  useEffect(() => {
    if (!running) return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
    };
  }, [running, renderLoop, resize, onKey]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1600);
      }
      acRef.current = null;
      rigRef.current?.destroy();
      rigRef.current = null;
    };
  }, [onOrient]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {/* convergence guide dots (stereogram mode) — "make two dots become three" */}
      {running && mode === "stereo" && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-20 flex -translate-x-1/2 gap-[86px]">
          <span className="h-3 w-3 rounded-full bg-muted" />
          <span className="h-3 w-3 rounded-full bg-muted" />
        </div>
      )}

      {/* header / controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-semibold text-2xl tracking-tight text-foreground sm:text-3xl">
          Hidden Eye
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          A field of pure random-dot noise that hides a living, breathing 3-D
          surface — visible only inside your own visual cortex when your eyes
          fuse the pattern. Can&apos;t free-fuse? The reveal mode shades the
          hidden surface for you, hands-free.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!running && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-muted px-6 py-2.5 text-base font-medium text-black transition hover:bg-card"
            >
              Start
            </button>
          )}
          {running && (
            <button
              onClick={() => setMode((m) => (m === "stereo" ? "wiggle" : "stereo"))}
              className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-100 transition hover:bg-violet-500/30"
            >
              {mode === "stereo" ? "Show reveal" : "Show stereogram"}
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 text-base font-medium text-foreground backdrop-blur transition hover:bg-black/70"
          >
            Design notes
          </button>
        </div>

        {!running && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            tap Start — sound + visuals begin together
          </p>
        )}
        {running && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            {mode === "stereo"
              ? "diverge your eyes until the two dots become three · " + hud
              : "reveal · the hidden surface, shaded + swaying · " + hud}
          </p>
        )}
        {running && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            keys: 1-4 sculpt form · A auto · arrows steer · [ ] depth · , . eye-sep · R toggle
          </p>
        )}

        {audioErr && (
          <p className="mt-2 text-sm text-violet-300">
            Audio could not start — visuals continue without sound.
          </p>
        )}
        {noGL && (
          <p className="mt-2 text-sm text-violet-300">
            WebGL2 is unavailable — falling back to a shaded 2-D heightfield
            reveal so the hidden surface stays visible.
          </p>
        )}
      </div>

      {/* design notes panel */}
      {notesOpen && (
        <div className="fixed right-0 top-0 z-40 h-full w-full max-w-md overflow-y-auto border-l border-border bg-black/90 p-6 backdrop-blur-md sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-semibold text-xl text-foreground">Design notes</h2>
            <button
              onClick={() => setNotesOpen(false)}
              className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-sm text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="text-foreground">
              What if a field of pure random-dot noise could reveal a breathing
              3-D psychedelic surface that exists nowhere in the image — only in
              your visual cortex?
            </p>
            <p>
              This is a real-time animated autostereogram (SIRDS). A procedural
              heightfield morphs through four form-states — a breathing dome, a
              receding tunnel, radial ripples, and a mandala of bumps. A
              per-scanline SIRDS encoder turns that depth into dots: the
              horizontal separation between two dots that must share a colour is{" "}
              <span className="font-mono text-foreground">
                round(E·(1 − μ·depth))
              </span>
              , so a nearer surface shrinks the period and pops toward you. There
              is no monocular depth cue — the 3-D structure is manufactured
              entirely by binocular fusion.
            </p>
            <p>
              Dot colours come from a positional hash of each equality chain&apos;s
              root, so the field is stable frame-to-frame; only the links move as
              depth changes. That, plus slow morphing, constant mean luminance,
              and <span className="font-mono">prefers-reduced-motion</span>
              damping, keeps it flicker-safe.
            </p>
            <p>
              The main visual is raw WebGL2: the CPU builds the dot buffer and a
              depth texture; the fragment shader blits them with vignette + faint
              grain. In reveal mode the shader shades the heightfield directly
              with a small horizontal parallax sway so the surface is legible
              without free-fusing. The surface&apos;s relief drives a
              just-intonation drone (brightness ∝ relief); the chord shifts with
              each form and a soft FM bell rings when a new form locks in.
            </p>
            <p className="text-foreground">To view</p>
            <p>
              Reveal / wiggle: nothing to do — the shaded surface sways on its
              own. Stereogram: relax and diverge your eyes (look &quot;through&quot;
              the screen) until the two guide dots at the top become three; the
              surface will float up out of the noise. Keys: 1-4 sculpt the form,
              A resumes auto, arrows steer, [ ] change depth intensity, , . change
              eye-separation, R toggles mode.
            </p>
            <p className="text-muted-foreground">
              Limitations: free-fusing is genuinely hard and not everyone can do
              it (hence the default reveal mode). The morph/encode timing
              constants are hand-tuned, not perceptually validated headless.
            </p>
            <p className="text-muted-foreground">
              References: Julesz, <em>Foundations of Cyclopean Perception</em>
              (1971); Tyler &amp; Clarke, &quot;The autostereogram&quot;, SPIE Proc.
              1256 (1990).
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1105-hidden-eye"]} />
    </main>
  );
}
