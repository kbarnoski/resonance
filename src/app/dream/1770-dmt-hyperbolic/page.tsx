"use client";

// 1770-dmt-hyperbolic — "DMT Hyperbolic Bloom".
//   state: DMT-breakthrough · pole: intense
//
// What if the DMT breakthrough's hyperbolic, negatively-curved geometry could
// bloom in real time — Escher's Circle Limit alive and breathing, driven by
// sound? A full-viewport WebGL2 fragment shader folds the Poincaré disk into
// the fundamental triangle of a {7,q} hyperbolic tiling; a Möbius automorphism
// drifts it toward the boundary (exponential area growth = the felt "more axes
// than physical reality allows"), saddle folds ripple it like a bedsheet, and
// an iridescent thin-film palette paints it. FFT bands map to the neural-gain
// phenomenology (bass→drift/fold, mids→curvature/density, highs→aberration,
// loudness→saturation/gain).
//
// Determinism: an integer frame counter + a fixed-seed mulberry32 PRNG drive
// everything in the audio/visual/state path. No Math.random / Date.now /
// new Date / performance.now there — ctx.currentTime is used ONLY for Web Audio
// scheduling. So the self-playing ghost carrier runs identically headless.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VERT, FRAG } from "./shader";
import { HyperbolicAudio } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

type Phase = "intro" | "running" | "nogpu";

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [carrier, setCarrier] = useState<"ghost" | "file">("ghost");
  const [status, setStatus] = useState<string | null>(null);

  const audioRef = useRef<HyperbolicAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);

  // deterministic clock + smoothed journey state
  const frameRef = useRef(0);
  const arcEnvRef = useRef(0); // running loudness envelope for the arc
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setPhase("intro");
  }, []);

  useEffect(() => () => stop(), [stop]);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file || !audioRef.current) return;
    setStatus("decoding your track…");
    try {
      await audioRef.current.loadFile(file);
      setCarrier("file");
      setStatus(null);
    } catch {
      setStatus("could not decode that file — staying on the ghost carrier");
    }
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    const mount = mountRef.current;
    if (!mount) return;

    // ── AudioContext (created inside the gesture; autoplay policy) ────────────
    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      setStatus("audio unavailable in this browser");
      return;
    }
    ctxRef.current = ctx;
    const audio = new HyperbolicAudio(ctx);
    audioRef.current = audio;
    audio.setMuted(mutedRef.current);
    audio.start();

    // ── WebGL2 renderer + fullscreen ShaderMaterial ──────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      const canvas = document.createElement("canvas");
      // require a real WebGL2 context (this piece is WebGL2-only)
      if (!canvas.getContext("webgl2")) throw new Error("no webgl2");
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
      });
    } catch {
      renderer = null;
    }

    if (!renderer) {
      // graceful degrade — audio + CSS glow stay alive
      setPhase("nogpu");
      const glow = glowRef.current;
      let f = 0;
      const tick = () => {
        f++;
        frameRef.current = f;
        const b = audioRef.current?.getBands();
        if (glow && b) {
          const s = 0.3 + b.loud * 0.7;
          glow.style.opacity = String(0.25 + b.loud * 0.5);
          glow.style.transform = `scale(${1 + b.bass * 0.4})`;
          glow.style.filter = `hue-rotate(${(f * 0.4) % 360}deg) saturate(${1 + s})`;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr * 0.75);
    renderer.setClearColor(new THREE.Color(0x04030a), 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms: Record<string, THREE.IUniform> = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uLoud: { value: 0 },
      uArc: { value: 0 },
      uReduced: { value: reducedRef.current ? 1 : 0 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
    });
    const geo = new THREE.BufferGeometry();
    // a single fullscreen triangle
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
        3,
      ),
    );
    const tri = new THREE.Mesh(geo, mat);
    tri.frustumCulled = false;
    scene.add(tri);

    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer!.setSize(w, h, false);
      (uniforms.uRes.value as THREE.Vector2).set(
        w * renderer!.getPixelRatio(),
        h * renderer!.getPixelRatio(),
      );
    };
    resize();
    window.addEventListener("resize", resize);

    setPhase("running");

    const render = () => {
      const f = frameRef.current + 1;
      frameRef.current = f;
      const time = f / 60; // deterministic seconds

      const b = audioRef.current?.getBands() ?? {
        bass: 0,
        mid: 0,
        high: 0,
        loud: 0,
      };

      // ── journey arc from the audio energy envelope + slow clock ─────────────
      // envelope tracks loudness slowly; arc is a smooth onset→peak→return over
      // a long deterministic cycle, lifted by sustained energy. All frame-based.
      arcEnvRef.current += (b.loud - arcEnvRef.current) * 0.01;
      const cyclePos = (f % (60 * 150)) / (60 * 150); // ~150 s journey
      // shape: rise, plateau at breakthrough, soft return
      const shaped =
        cyclePos < 0.5
          ? Math.pow(cyclePos / 0.5, 1.4)
          : 1 - Math.pow((cyclePos - 0.5) / 0.5, 2.2);
      const arc = Math.min(
        1,
        Math.max(0, shaped * 0.7 + arcEnvRef.current * 0.9),
      );

      uniforms.uTime.value = time;
      uniforms.uBass.value = b.bass;
      uniforms.uMid.value = b.mid;
      uniforms.uHigh.value = b.high;
      uniforms.uLoud.value = b.loud;
      uniforms.uArc.value = arc;

      renderer!.render(scene, cam);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    teardownRef.current = () => {
      window.removeEventListener("resize", resize);
      geo.dispose();
      mat.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      }
    };
  }, [phase]);

  const running = phase === "running" || phase === "nogpu";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground font-sans">
      {/* WebGL mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* CSS-fallback glow (only meaningful when WebGL2 is missing) */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 blur-3xl transition-transform"
        style={{
          background:
            "conic-gradient(from 0deg, #ff2fb0, #7a2fff, #2fd8ff, #2fff9e, #ffd12f, #ff2fb0)",
          display: phase === "nogpu" ? "block" : "none",
        }}
      />

      {/* ── Intro / Begin ─────────────────────────────────────────────────── */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="max-w-xl space-y-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              DMT Hyperbolic Bloom
            </h1>
            <p className="text-base text-muted-foreground">
              A Poincaré-disk hyperbolic tiling — Escher&rsquo;s{" "}
              <span className="text-foreground">Circle Limit</span> alive and
              breathing, drifting toward its infinite boundary and driven by
              sound. State: DMT-breakthrough · pole: intense.
            </p>
            <p className="text-base text-muted-foreground">
              A self-playing generative carrier starts automatically. You can
              drop in your own track once inside.
            </p>
          </div>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Enter the bloom
          </button>
          {status && <p className="text-base text-destructive">{status}</p>}
          <button
            onClick={() => setShowNotes(true)}
            className="text-base text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* ── nogpu notice ──────────────────────────────────────────────────── */}
      {phase === "nogpu" && (
        <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 backdrop-blur-sm">
          <p className="text-base text-destructive">
            WebGL2 unavailable — showing an audio-reactive glow instead. The
            sound is still live.
          </p>
        </div>
      )}

      {/* ── Running chrome ────────────────────────────────────────────────── */}
      {running && (
        <>
          <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-2">
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-base text-foreground backdrop-blur-sm transition-colors hover:text-primary"
            >
              Stop
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-base text-foreground backdrop-blur-sm transition-colors hover:text-primary"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-base text-foreground backdrop-blur-sm transition-colors hover:text-primary"
            >
              Drop a track
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <span className="px-1 text-base text-muted-foreground">
              carrier: {carrier === "file" ? "your track" : "ghost"}
            </span>
          </div>

          <button
            onClick={() => setShowNotes(true)}
            className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-base text-muted-foreground backdrop-blur-sm transition-colors hover:text-primary"
          >
            Design notes
          </button>

          {status && (
            <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 backdrop-blur-sm">
              <p className="text-base text-muted-foreground">{status}</p>
            </div>
          )}
        </>
      )}

      {/* ── Design-notes modal ────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                Every screen pixel is a point in the Poincaré disk. A Möbius
                automorphism of the disk drifts the whole tiling toward the
                boundary circle &ldquo;at infinity&rdquo; — because hyperbolic
                area grows exponentially outward, the tiles bloom endlessly, the
                felt sense of <span className="text-foreground">more axes
                than physical reality allows</span>.
              </p>
              <p>
                Each pixel is folded into the fundamental triangle of a{" "}
                <span className="text-foreground">{"{7,q}"}</span> reflection
                group (two mirror lines + one geodesic mirror circle). The
                circle-inversion count becomes the tile-ring index that colors
                the iridescent thin-film palette.
              </p>
              <p>
                Sound drives the neural-gain phenomenology: bass → drift speed +
                saddle-fold depth, mids → curvature and apparent {"{7,q}"}{" "}
                density, highs → chromatic aberration + fine iridescence,
                loudness → saturation and gain.
              </p>
              <p>
                <span className="text-foreground">Named references:</span> QRI /
                Qualia Computing, &ldquo;The Hyperbolic Geometry of DMT
                Experiences&rdquo; (Andrés Gómez Emilsson, 2016); M.C. Escher,{" "}
                <span className="italic">Circle Limit</span> series (with
                H.S.M. Coxeter, 1956); Bressloff–Cowan cortical form-constant /
                log-polar map.
              </p>
              <p className="text-sm">
                Safety: no alpha-band flicker; all luminance change is slow
                (≤3 Hz). Honors reduced-motion. Full notes in README.md.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-4 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
