"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createCarrier, type Carrier } from "./carrier";
import { createCrushEngine, type CrushEngine } from "./bitcrush";
import { DatamoshRenderer } from "./visual";
import { readBands } from "./dsp";

const RENDER_SCALE = 0.72; // feedback buffers run below CSS res for speed
const CARRIER_MASTER = 0.12;
const FILE_MASTER = 0.2;

type Source = "carrier" | "file";

export default function FracturePage() {
  const [grit, setGrit] = useState(0.6);
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("carrier");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [armed, setArmed] = useState(false); // context has resumed

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<CrushEngine | null>(null);
  const carrierRef = useRef<Carrier | null>(null);
  const fileSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const rendererRef = useRef<DatamoshRenderer | null>(null);

  const frameRef = useRef(0);
  const rafRef = useRef(0);
  const gritRef = useRef(0.6);
  const reducedRef = useRef(false);
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));

  // ── the deterministic render + audio-step loop ────────────────────────
  const loop = useCallback(() => {
    const frame = frameRef.current++;
    carrierRef.current?.step(frame);

    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (engine && renderer) {
      const bins = engine.analyser.frequencyBinCount;
      if (freqRef.current.length !== bins) freqRef.current = new Uint8Array(bins);
      engine.analyser.getByteFrequencyData(freqRef.current);
      const bands = readBands(freqRef.current);
      renderer.draw(frame, bands, gritRef.current, reducedRef.current);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas) return;
    const w = Math.max(2, Math.floor(window.innerWidth * RENDER_SCALE));
    const h = Math.max(2, Math.floor(window.innerHeight * RENDER_SCALE));
    if (renderer) renderer.resize(w, h);
    else {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  // ── first-gesture: resume the (autoplay-blocked) context ──────────────
  const arm = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().then(() => setArmed(true));
    } else if (ctx) {
      setArmed(true);
    }
  }, []);

  // ── mount: build the graph, auto-start carrier + visuals ──────────────
  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = Math.max(2, Math.floor(window.innerWidth * RENDER_SCALE));
    const h = Math.max(2, Math.floor(window.innerHeight * RENDER_SCALE));
    canvas.width = w;
    canvas.height = h;

    try {
      rendererRef.current = new DatamoshRenderer(canvas);
    } catch {
      setError("This browser could not open a Canvas2D context.");
    }

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    setArmed(ctx.state === "running");

    const engine = createCrushEngine(ctx);
    engine.setGrit(gritRef.current);
    engine.setMaster(CARRIER_MASTER, ctx.currentTime);
    engineRef.current = engine;

    const carrier = createCarrier(ctx);
    carrier.output.connect(engine.input);
    carrierRef.current = carrier;

    // animate immediately — even while suspended the frame counter drives it
    rafRef.current = requestAnimationFrame(loop);

    window.addEventListener("resize", resize);
    const armOnce = () => arm();
    window.addEventListener("pointerdown", armOnce);
    window.addEventListener("keydown", armOnce);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", armOnce);
      window.removeEventListener("keydown", armOnce);
      try {
        fileSrcRef.current?.stop();
      } catch {
        /* not started */
      }
      carrier.stop();
      engine.dispose();
      if (ctx.state !== "closed") {
        window.setTimeout(() => {
          if (ctx.state !== "closed") void ctx.close();
        }, 400);
      }
    };
  }, [loop, resize, arm]);

  const onGrit = useCallback((v: number) => {
    setGrit(v);
    gritRef.current = v;
    engineRef.current?.setGrit(v);
  }, []);

  // ── decode a dropped / chosen file into a looping source ──────────────
  const loadFile = useCallback(async (file: File) => {
    const ctx = ctxRef.current;
    const engine = engineRef.current;
    if (!ctx || !engine) return;
    setError(null);
    if (ctx.state === "suspended") {
      await ctx.resume();
      setArmed(true);
    }
    try {
      const buf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      try {
        fileSrcRef.current?.stop();
      } catch {
        /* none yet */
      }
      const node = ctx.createBufferSource();
      node.buffer = decoded;
      node.loop = true;
      node.connect(engine.input);
      node.start();
      fileSrcRef.current = node;
      carrierRef.current?.setActive(false, ctx.currentTime);
      engine.setMaster(FILE_MASTER, ctx.currentTime);
      setFileName(file.name);
      setSource("file");
    } catch {
      setError(`Could not decode "${file.name}". The carrier keeps playing.`);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const revertToCarrier = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      fileSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    fileSrcRef.current = null;
    carrierRef.current?.setActive(true, ctx.currentTime);
    engineRef.current?.setMaster(CARRIER_MASTER, ctx.currentTime);
    setFileName(null);
    setSource("carrier");
  }, []);

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-black text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />

      {/* drop-target highlight */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-20 border-2 border-dashed border-primary/70 bg-primary/10" />
      )}

      {/* corner UI */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Fracture
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Drop any track to hear it fracture into gritty, dissonant lo-fi ruin
          while the image datamoshes into DMT-like hyper-detail — bit-crush
          quantization as the headline instrument.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            {fileName ? "Choose another file" : "Drop or choose a file"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={onPick}
            />
          </label>
          {source === "file" && (
            <button
              onClick={revertToCarrier}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Back to built-in carrier
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {notesOpen ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {/* grit slider — dials bit-depth + sample hold together */}
        <div className="mt-5 max-w-xs">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="grit"
              className="text-sm font-medium text-foreground"
            >
              Grit
            </label>
            <span className="font-mono text-sm text-muted-foreground">
              {Math.round(grit * 100)}%
            </span>
          </div>
          <input
            id="grit"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={grit}
            onChange={(e) => onGrit(parseFloat(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            fewer bits · longer sample-hold — quantization ruin, dialed.
          </p>
        </div>

        <p className="mt-4 font-mono text-sm text-muted-foreground">
          {source === "file"
            ? `looping · ${fileName}`
            : "built-in dissonant carrier · drop a file to fracture it"}
          {!armed && " · tap anywhere to un-mute"}
        </p>

        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {notesOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[52vh] overflow-y-auto border-t border-border bg-background/92 p-5 backdrop-blur-md sm:inset-x-auto sm:right-0 sm:top-0 sm:max-h-none sm:w-96 sm:border-l sm:border-t-0">
          <h2 className="text-base font-semibold text-foreground">
            Design notes
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The headline grit is amplitude quantization: each sample is rounded
            to as few as 2 bits and held for up to 24 input samples
            (sample-rate decimation), inside a self-contained ScriptProcessorNode.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Bitcrush is the audible-artifact ancestor of the
            Residual-Vector-Quantization (codebook quantization) that every
            2024–26 AI music generator is built on — ArtifactNet, arXiv
            2604.16254 (2026). This piece makes that quantization grit playable.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Visuals are pure Canvas2D feedback-displacement datamosh: bass drives
            slice displacement, mid drives flow direction, high drives the
            chromatic split. A 2×2 mirror kaleidoscope plus a nested half-scale
            mirror give machine-elf density. Lineage: Menkman&apos;s Glitch
            Studies Manifesto, Ikeda&apos;s test pattern, datamosh I-frame
            displacement, DMT hyper-detail phenomenology.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Fully deterministic (fixed-seed PRNG + frame counter), luminance
            clamped, and reduced-motion aware. See README.md for the full write-up.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["1732-fracture"]} />
    </main>
  );
}
