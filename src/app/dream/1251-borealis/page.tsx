"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  makeGLRig,
  drawFrame,
  disposeGLRig,
  drawCpuTunnel,
  type GLRig,
  type MarchState,
} from "./render";
import {
  TunnelAudio,
  fetchPianoBuffer,
  renderFallbackBuffer,
} from "./audio";

type Phase = "idle" | "running" | "paused";

export default function BorealisPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [noGL, setNoGL] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const audioRef = useRef<TunnelAudio | null>(null);
  const rafRef = useRef<number>(0);

  // journey bookkeeping (never resets → minute 5 ≠ minute 1)
  const elapsedRef = useRef<number>(0); // seconds of forward travel while running
  const lastTickRef = useRef<number>(0);
  const zRef = useRef<number>(0); // integrated forward distance
  const phaseDriftRef = useRef<number>(0); // ring phase drift
  const energyRef = useRef<number>(0);
  const driftRef = useRef<[number, number]>([0, 0]);
  const driftTargetRef = useRef<[number, number]>([0, 0]);
  const phaseStateRef = useRef<Phase>("idle");
  const reducedRef = useRef<boolean>(false);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.6 }));

  useEffect(() => {
    phaseStateRef.current = phase;
  }, [phase]);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    driftTargetRef.current = [x, -y];
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    const rig = rigRef.current;
    if (rig) rig.gl.viewport(0, 0, w, h);
  }, []);

  // one clock feeds shader uniforms + audio each frame
  const runFrame = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    const running = phaseStateRef.current === "running";
    const reduced = reducedRef.current;

    // sample piano energy (0 before Begin / while loading)
    const energy = audioRef.current ? audioRef.current.sample() : 0;
    energyRef.current += (energy - energyRef.current) * 0.15;
    const e = energyRef.current;

    // forward transport: speed surges with piano energy; slow when idle/reduced
    const idleSpeed = 0.18;
    const baseSpeed = running ? 0.55 : idleSpeed;
    const speed = baseSpeed * (0.6 + 0.9 * e) * (reduced ? 0.45 : 1);
    zRef.current += speed * dt;

    if (running) elapsedRef.current += dt;
    const el = elapsedRef.current;

    // slow, non-repeating phase drift (faster on loud passages)
    phaseDriftRef.current += dt * (0.12 + 0.5 * e);

    // long ramps so the journey deepens: minute 5 ≠ minute 1
    const approachBase = Math.min(1, el / 330) * 0.85;
    const approach = Math.min(
      1,
      approachBase + 0.15 * e + 0.05 * Math.sin(el * 0.02),
    );
    const thin = Math.min(1, el / 360);
    const ringFreq =
      5.0 + 1.6 * Math.sin(el * 0.013) + 0.8 * Math.sin(el * 0.005 + 1.3);

    // ease weightless drift toward pointer target
    const d = driftRef.current;
    const dtg = driftTargetRef.current;
    d[0] += (dtg[0] - d[0]) * 0.03;
    d[1] += (dtg[1] - d[1]) * 0.03;

    const flicker = flickerRef.current.value(now / 1000);

    const rig = rigRef.current;
    if (rig) {
      const s: MarchState = {
        z: zRef.current,
        phase: phaseDriftRef.current,
        energy: e,
        approach,
        thin,
        ringFreq,
        flicker,
        drift: [d[0], d[1]],
      };
      drawFrame(rig, s);
    } else if (ctx2dRef.current) {
      const c = ctx2dRef.current;
      drawCpuTunnel(c, c.canvas.width, c.canvas.height, zRef.current);
    }

    // drive the audio bed from the same journey signal
    if (audioRef.current) {
      audioRef.current.step(dt);
      audioRef.current.setDrive(Math.min(1, 0.25 + 0.55 * e + 0.4 * approach));
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // create the GL rig on mount so the dark resting tunnel mouth draws immediately
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // capture the stable flicker instance for the cleanup closure
    const flicker = flickerRef.current;
    const rig = makeGLRig(canvas);
    if (rig) {
      rigRef.current = rig;
    } else {
      setNoGL(true);
      const c2d = canvas.getContext("2d");
      if (c2d) ctx2dRef.current = c2d;
    }
    resize();

    lastTickRef.current = performance.now();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      const r = rigRef.current;
      if (r) disposeGLRig(r);
      rigRef.current = null;
      ctx2dRef.current = null;
      void audioRef.current?.dispose();
      audioRef.current = null;
      flicker.kill();
    };
  }, [resize, onPointerMove, runFrame]);

  const handleBegin = useCallback(async () => {
    if (phase === "running") return;

    if (phase === "paused") {
      if (audioRef.current) await audioRef.current.togglePause();
      setPhase("running");
      return;
    }

    setLoading(true);
    const audio = new TunnelAudio();
    audioRef.current = audio;
    // real recording first; offline fallback if it fails
    let buffer = await fetchPianoBuffer(audio.ctx);
    if (!buffer) {
      try {
        buffer = await renderFallbackBuffer(audio.ctx.sampleRate);
      } catch {
        buffer = null;
      }
    }
    if (buffer) await audio.start(buffer);
    setLoading(false);
    lastTickRef.current = performance.now();
    setPhase("running");
  }, [phase]);

  const handlePause = useCallback(async () => {
    if (phaseStateRef.current !== "running") return;
    if (audioRef.current) await audioRef.current.togglePause();
    setPhase("paused");
  }, []);

  const togglePulse = useCallback(() => {
    const f = flickerRef.current;
    if (f.enabled) {
      f.kill();
      setPulse(false);
    } else {
      f.enable();
      setPulse(true);
    }
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {noGL && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base leading-relaxed text-rose-300">
            WebGL2 is unavailable, so the volumetric raymarch cannot run here.
            You are seeing a simple Canvas2D tunnel instead — try a recent
            desktop Chrome, Firefox, or Safari for the full passage into the
            light.
          </p>
        </div>
      )}

      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-serif text-2xl tracking-tight text-white/95 sm:text-3xl">
          Borealis
        </h1>
        <p className="mt-2 text-base leading-relaxed text-white/80">
          Karel&rsquo;s piano flies you bodily into a receding tunnel of light —
          a single-take, never-repeating raymarched passage through luminous fog
          toward a growing white-gold core. Loud passages surge you forward;
          quiet ones let the light settle. Over the minutes the fog thins and the
          radiance widens.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {phase !== "running" && (
            <button
              onClick={handleBegin}
              disabled={loading}
              className="min-h-[44px] min-w-[44px] rounded-full bg-white/95 px-6 py-2.5 text-base font-medium text-black transition hover:bg-white disabled:opacity-60"
            >
              {loading ? "Listening…" : phase === "paused" ? "Resume" : "Begin"}
            </button>
          )}
          {phase === "running" && (
            <button
              onClick={handlePause}
              className="min-h-[44px] min-w-[44px] rounded-full border border-white/25 bg-black/50 px-6 py-2.5 text-base font-medium text-white/95 backdrop-blur transition hover:bg-black/70"
            >
              Pause
            </button>
          )}
          <button
            onClick={togglePulse}
            aria-pressed={pulse}
            className="min-h-[44px] min-w-[44px] rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-base font-medium text-white/75 backdrop-blur transition hover:bg-black/60"
          >
            {pulse ? "Pulse on" : "Pulse off"}
          </button>
        </div>

        {phase === "idle" && (
          <p className="mt-3 text-base text-amber-200/80">
            tap Begin — sound and the passage into the light start together
          </p>
        )}
        {phase === "running" && (
          <p className="mt-3 text-base text-amber-200/80">
            flying in · hands-free · move the pointer to nudge the drift
          </p>
        )}
        {phase === "paused" && (
          <p className="mt-3 text-base text-amber-200/80">
            held still · Resume to continue toward the light
          </p>
        )}
      </div>

      <div className="fixed bottom-16 right-4 z-30 max-w-sm sm:bottom-4 sm:right-5">
        <details className="rounded-xl border border-white/10 bg-black/70 p-4 text-base text-white/75 backdrop-blur">
          <summary className="cursor-pointer font-medium text-white/90">
            Design notes
          </summary>
          <div className="mt-3 flex flex-col gap-3 leading-relaxed">
            <p>
              <strong className="text-white/90">The question.</strong> What if
              Karel&rsquo;s real piano flew you bodily INTO a receding volumetric
              tunnel of light — the way near-death survivors describe it?
            </p>
            <p>
              <strong className="text-white/90">How it works.</strong> A
              full-screen WebGL2 fragment shader raymarches ~64 steps through a
              volume of luminous fog. The camera translates forward along +z
              every frame, so the ring-structured walls stream past you — real
              perceived depth, not a pattern on a wall. The log-polar /
              form-constant engine (Klüver&rsquo;s tunnel form constant, phi = 0)
              shapes the tunnel cross-section into concentric rings, warped along
              depth so they flow toward you as you fly in. A bright axial core
              grows and widens as you approach.
            </p>
            <p>
              <strong className="text-white/90">The piano drives it.</strong> An
              AnalyserNode reads the recording&rsquo;s energy; loud passages surge
              your forward speed and brighten the core, quiet passages let the
              light settle. A Shepard endless-rising tone (the auditory analog of
              endless forward motion), a sustaining drone pad, and a cavernous
              convolution reverb place the piano in the tunnel. Over ~5–6 minutes
              the fog thins and the radiance whitens, so minute 5 ≠ minute 1.
            </p>
            <p>
              <strong className="text-white/90">References.</strong> Karolina
              Halatek, <em>Terminal</em> (a walk-through cylindrical LED
              light-tunnel built from near-death survivor testimony); Klüver&rsquo;s
              tunnel/funnel form constant; the Bressloff–Cowan retino-cortical log
              map; Íñigo Quílez&rsquo;s volumetric fog/raymarch technique.
            </p>
            <p>
              <strong className="text-white/90">Safety.</strong> Forward motion is
              smooth continuous translation, never a strobe. Any optional
              luminance pulse routes through the shared safe-flicker engine
              (≤3&nbsp;Hz, soft floor, instant kill, off by default) and reduced
              motion is honored by slowing the passage.
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1251-borealis"]} />
    </main>
  );
}
