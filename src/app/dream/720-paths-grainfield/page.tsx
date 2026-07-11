"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  buildGrainCorpus,
  selectNearest,
  type AudioSourceKind,
  type Corpus,
} from "./audio";
import {
  makeRenderer,
  type Renderer,
  type CursorState,
  type GrainPoint,
} from "./render";

type Phase = "intro" | "loading" | "playing";

// How often (s) the cursor may trigger a fresh burst of grains while dragging.
const TRIGGER_INTERVAL = 0.07;
// Concurrent grain-voice cap so it stays gentle.
const MAX_VOICES = 14;
// Selection radius in descriptor space (0..1) and grains per trigger.
const SELECT_RADIUS = 0.07;
const GRAINS_PER_TRIGGER = 3;
// Idle before the ghost takes over (ms).
const IDLE_MS = 2500;

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export default function PathsGrainfieldPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [grainCount, setGrainCount] = useState(0);
  const [rendererKind, setRendererKind] = useState<"webgpu" | "canvas2d" | null>(
    null,
  );
  const [showNotes, setShowNotes] = useState(false);
  const [ghosting, setGhosting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const corpusRef = useRef<Corpus | null>(null);

  // renderer
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  // cursor / navigation state (field space 0..1)
  const cursorRef = useRef<CursorState>({ x: 0.5, y: 0.5, excite: 0, active: false });
  const lastTriggerRef = useRef<number>(0);
  const lastPointerMsRef = useRef<number>(0);
  const ghostRef = useRef<boolean>(false);
  const ghostPhaseRef = useRef<number>(0);

  // voices
  const voicesRef = useRef<ActiveVoice[]>([]);

  // ─── Spatial concatenative trigger ──────────────────────────────────────────
  // Re-sound the grains nearest the cursor in descriptor space, each with a
  // Hann window and a stereo pan from horizontal screen position.
  const triggerGrains = useCallback((fx: number, fy: number, excite: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const corpus = corpusRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !master || !corpus || !buffer) return;

    const idx = selectNearest(
      corpus.grains,
      fx,
      fy,
      SELECT_RADIUS,
      GRAINS_PER_TRIGGER,
    );
    if (idx.length === 0) return;

    const now = ctx.currentTime;
    const pan = (fx * 2 - 1) * 0.85; // left↔right from horizontal position

    for (const gi of idx) {
      const grain = corpus.grains[gi];

      // Voice cap: retire oldest.
      if (voicesRef.current.length >= MAX_VOICES) {
        const oldest = voicesRef.current.shift();
        try {
          oldest?.gain.gain.cancelScheduledValues(now);
          oldest?.gain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
          oldest?.src.stop(now + 0.06);
        } catch {
          /* already stopped */
        }
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // tiny pitch drift by brightness so identical grains don't phase-lock
      src.playbackRate.value = 0.97 + grain.brightness * 0.06;

      const g = ctx.createGain();
      const dur = grain.duration;
      // Hann-ish window: ramp up over first 45%, hold, ramp down → no clicks.
      const peak = (0.05 + grain.rms * 0.12) * (0.5 + excite * 0.5);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + dur * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, now + dur);

      const panner = ctx.createStereoPanner();
      // pan jittered slightly per-grain around the cursor pan
      panner.pan.value = Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.2));

      src.connect(g);
      g.connect(panner);
      panner.connect(master);
      src.start(now, grain.offset, dur + 0.02);
      src.stop(now + dur + 0.05);

      const voice: ActiveVoice = { src, gain: g };
      voicesRef.current.push(voice);
      src.onended = () => {
        voicesRef.current = voicesRef.current.filter((v) => v !== voice);
      };
    }
  }, []);

  // ─── Pointer navigation ─────────────────────────────────────────────────────
  const updateCursorFromEvent = useCallback((clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const fxScreen = (clientX - rect.left) / rect.width;
    const fyScreen = (clientY - rect.top) / rect.height;
    // invert the MARGIN-based mapping used in render: y is flipped (bright=top)
    const fx = Math.max(0, Math.min(1, (fxScreen - 0.08) / 0.84));
    const fy = Math.max(0, Math.min(1, 1 - (fyScreen - 0.08) / 0.84));
    cursorRef.current.x = fx;
    cursorRef.current.y = fy;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      lastPointerMsRef.current = performance.now();
      if (ghostRef.current) {
        ghostRef.current = false;
        setGhosting(false);
      }
      updateCursorFromEvent(e.clientX, e.clientY);
      cursorRef.current.active = true;
      cursorRef.current.excite = Math.min(1, cursorRef.current.excite + 0.25);
    },
    [updateCursorFromEvent],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lastPointerMsRef.current = performance.now();
      if (ghostRef.current) {
        ghostRef.current = false;
        setGhosting(false);
      }
      updateCursorFromEvent(e.clientX, e.clientY);
      cursorRef.current.active = true;
      cursorRef.current.excite = 1;
    },
    [updateCursorFromEvent],
  );

  const onPointerUp = useCallback(() => {
    lastPointerMsRef.current = performance.now();
  }, []);

  // ─── Begin: create + resume AudioContext inside the gesture ─────────────────
  const begin = useCallback(async () => {
    setPhase("loading");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    ctxRef.current = ctx;

    // Master chain: masterGain(≤0.3) → lowpass(≤7000) → compressor → dest.
    const master = ctx.createGain();
    master.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6800;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 20;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);
    masterRef.current = master;

    // Load corpus: try Karel's recording, else offline fallback.
    let buffer = await fetchPianoBuffer(ctx);
    let kind: AudioSourceKind = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      kind = "fallback";
    }
    bufferRef.current = buffer;
    const corpus = buildGrainCorpus(buffer, kind);
    corpusRef.current = corpus;
    setGrainCount(corpus.grains.length);
    setSource(kind);

    // Build the GPU/Canvas2D particle field from the grain descriptors.
    const grainPoints: GrainPoint[] = corpus.grains.map((g) => ({
      hx: g.nx,
      hy: g.ny,
      rms: g.rms,
      bright: g.brightness,
    }));
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (wrap && canvas) {
      const rect = wrap.getBoundingClientRect();
      const renderer = await makeRenderer(
        canvas,
        grainPoints,
        rect.width,
        rect.height,
      );
      rendererRef.current = renderer;
      setRendererKind(renderer.kind);
    }

    setPhase("playing");
    lastPointerMsRef.current = performance.now();
    lastFrameRef.current = performance.now();

    // ─ Render + audio-trigger loop ─
    const loop = () => {
      const r = rendererRef.current;
      const c = ctxRef.current;
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - lastFrameRef.current) / 1000);
      lastFrameRef.current = nowMs;
      const t = c ? c.currentTime : nowMs / 1000;

      // Ghost auto-demo: after idle, drift the cursor on a slow Lissajous path.
      if (nowMs - lastPointerMsRef.current > IDLE_MS) {
        if (!ghostRef.current) {
          ghostRef.current = true;
          setGhosting(true);
        }
        ghostPhaseRef.current += dt;
        const p = ghostPhaseRef.current;
        cursorRef.current.x = 0.5 + 0.42 * Math.sin(p * 0.23);
        cursorRef.current.y = 0.5 + 0.34 * Math.sin(p * 0.31 + 1.1);
        cursorRef.current.active = true;
        cursorRef.current.excite = 0.55 + 0.35 * Math.sin(p * 0.7);
      } else {
        // decay excitation when the user pauses mid-field
        cursorRef.current.excite *= 0.96;
      }

      // Spatial concatenative trigger at a throttled rate while active.
      if (
        cursorRef.current.active &&
        t - lastTriggerRef.current > TRIGGER_INTERVAL
      ) {
        lastTriggerRef.current = t;
        triggerGrains(
          cursorRef.current.x,
          cursorRef.current.y,
          cursorRef.current.excite,
        );
      }

      if (r) r.frame(cursorRef.current, t, dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [triggerGrains]);

  // ─── Canvas sizing ───────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const wrap = wrapRef.current;
      const r = rendererRef.current;
      const c = canvasRef.current;
      if (!wrap || !c) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      if (r) r.resize(rect.width, rect.height);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  // ─── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      voicesRef.current.forEach((v) => {
        try {
          v.src.stop();
        } catch {
          /* ok */
        }
      });
      voicesRef.current = [];
      const r = rendererRef.current;
      if (r) r.destroy();
      rendererRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060c] text-foreground">
      <div
        ref={wrapRef}
        className="absolute inset-0"
        onPointerDown={phase === "playing" ? onPointerDown : undefined}
        onPointerMove={phase === "playing" ? onPointerMove : undefined}
        onPointerUp={phase === "playing" ? onPointerUp : undefined}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
          Paths · Grainfield
        </h1>
        <p className="mt-2 max-w-xl text-base text-foreground">
          Fly through Karel&apos;s recorded piano, shattered into a cloud of
          tens of thousands of grains. Drag to re-sound the region you touch.
        </p>
      </div>

      {/* Design notes link */}
      <Link
        href="#notes"
        onClick={(e) => {
          e.preventDefault();
          setShowNotes((s) => !s);
        }}
        className="pointer-events-auto absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 text-base text-violet-300 backdrop-blur hover:bg-accent"
      >
        Read the design notes
      </Link>

      {/* Intro / Begin */}
      {phase !== "playing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl border border-border bg-[#0a0b16]/90 p-7 text-center">
            <p className="text-base text-foreground">
              His whole performance becomes a galaxy of sound-grains, placed by
              their character — left&nbsp;to&nbsp;right is time through the
              piece, low&nbsp;to&nbsp;high is brightness. Drag a cursor through
              the cloud and the nearest grains re-sound around you.
            </p>
            <button
              onClick={begin}
              disabled={phase === "loading"}
              className="mt-6 min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400 disabled:opacity-60"
            >
              {phase === "loading" ? "Shattering his piano…" : "Enter the field"}
            </button>
            <p className="mt-4 text-base text-muted-foreground">
              Leave it alone and it flies itself. Best with headphones.
            </p>
          </div>
        </div>
      )}

      {/* Status badges */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute left-5 top-28 z-10 flex flex-col gap-2 sm:left-8">
          {source === "piano" && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300/95">
              Karel&apos;s piano · {grainCount.toLocaleString()} grains
            </span>
          )}
          {source === "fallback" && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300">
              live recording unavailable — fallback tone · {grainCount.toLocaleString()} grains
            </span>
          )}
          {rendererKind && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300">
              {rendererKind === "webgpu"
                ? "WebGPU compute field"
                : "Canvas2D field (WebGPU absent)"}
            </span>
          )}
          {ghosting && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300/95">
              flying itself — move to take the controls
            </span>
          )}
        </div>
      )}

      {/* Footer hint */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <p className="rounded-full bg-black/45 px-4 py-2 text-base text-muted-foreground backdrop-blur">
            Drag through the cloud · horizontal = stereo position · pause and it drifts on its own
          </p>
        </div>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0a0b16] p-6 text-base leading-relaxed text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-foreground">Design notes</h2>
            <p className="mt-3">
              The question: what if Karel could fly{" "}
              <em>inside</em> his own recorded piano — the whole performance
              shattered into a cloud of GPU particles, each one a grain of the
              audio, placed by its sonic character?
            </p>
            <p className="mt-3">
              On load it fetches his recording and slices it into ~90ms grains.
              Each grain is analyzed for{" "}
              <span className="text-violet-300">RMS energy</span> and a{" "}
              <span className="text-violet-300">brightness</span> (spectral-centroid
              proxy via zero-crossing rate), then placed in a 2D descriptor
              space: <em>x</em> = time through the piece, <em>y</em> = brightness.
              Every grain becomes one particle in the field.
            </p>
            <p className="mt-3">
              Dragging the cursor selects the grains nearest in that space and{" "}
              <span className="text-violet-300/95">re-sounds them concatenatively</span>
              — each with a Hann window (no clicks) and a stereo pan from its
              horizontal position. This is navigation of a <em>map of sound</em>,
              not tapping pads on glass.
            </p>
            <p className="mt-3 text-muted-foreground">
              References: Diemo Schwarz&apos;s <strong>CataRT</strong> (real-time
              corpus-based concatenative synthesis, 2D descriptor-space
              navigation of a sound corpus) and the idea of{" "}
              <em>Audio Latent Space Cartography</em> — navigating a spatial map
              of sound. It extends the lab&apos;s{" "}
              <code>710-presence-bloom</code> (WebGPU-compute particle field) and{" "}
              <code>718-duet-paths</code> (concatenative grains of Karel&apos;s
              real piano).
            </p>
            <p className="mt-3 text-muted-foreground">
              Degrade story: no WebGPU → a first-class Canvas2D field with the
              same particle behavior. No live recording → an offline-rendered
              soft arpeggio so the cloud is never empty (a rose notice appears).
            </p>
            <p className="mt-3 text-violet-300/95">
              Next-cycle deepening: add a third descriptor (pitch / spectral
              flatness) and a true 3D fly-through with depth-of-field; let two
              cursors weave counterpoint through the same corpus; and persist a
              drawn path as a re-playable concatenative phrase.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
