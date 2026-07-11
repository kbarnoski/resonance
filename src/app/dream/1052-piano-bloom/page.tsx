"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createField,
  type RDField,
  type Backend,
  rampColor,
} from "./rd";
import { PianoBloomAudio, NUM_READERS, type AudioMode } from "./granular";

/**
 * 1052 · Piano Bloom
 *
 * Play your own piano into a living Gray-Scott reaction-diffusion field. Touch
 * sculpts blooms; "reader" probes on the field granulate and re-voice the
 * recording back at you. WebGPU compute runs the RD body (Canvas2D/CPU
 * fallback); a felt-piano synth covers the no-file case.
 *
 * Interaction model borrowed from Reactive Audio "Growth" (2026): modulation
 * readers placed on an evolving field translate local field values into sound.
 */

interface Reader {
  x: number; // 0..1 (field-normalised)
  y: number; // 0..1
  active: boolean;
}

// Initial reader layout — two active probes, ready to play.
const INITIAL_READERS: Reader[] = [
  { x: 0.32, y: 0.42, active: true },
  { x: 0.68, y: 0.55, active: true },
  { x: 0.5, y: 0.28, active: false },
  { x: 0.5, y: 0.74, active: false },
];

type Phase = "idle" | "running";

export default function PianoBloomPage() {
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<Backend | null>(null);
  const [mode, setMode] = useState<AudioMode>("felt");
  const [fileName, setFileName] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [activeCount, setActiveCount] = useState(2);

  // Imperative engine refs.
  const fieldRef = useRef<RDField | null>(null);
  const audioRef = useRef<PianoBloomAudio | null>(null);
  const readersRef = useRef<Reader[]>(INITIAL_READERS.map((r) => ({ ...r })));
  const rafRef = useRef<number | null>(null);
  const draggingReaderRef = useRef<number | null>(null);
  const paintingRef = useRef(false);
  const startedRef = useRef(false);

  /* ----------------------------- teardown ----------------------------- */
  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const a = audioRef.current;
    audioRef.current = null;
    if (a) void a.dispose();
    const f = fieldRef.current;
    fieldRef.current = null;
    if (f) f.dispose();
    startedRef.current = false;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  /* ----------------------- pointer -> field coords -------------------- */
  const eventToField = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return { nx: Math.min(1, Math.max(0, nx)), ny: Math.min(1, Math.max(0, ny)) };
  }, []);

  // Find a reader near the pointer (for dragging), else null.
  const findReader = useCallback((nx: number, ny: number): number | null => {
    const readers = readersRef.current;
    let best = -1;
    let bestD = 0.06 * 0.06; // hit radius in normalised² space
    for (let i = 0; i < readers.length; i++) {
      if (!readers[i].active) continue;
      const dx = readers[i].x - nx;
      const dy = readers[i].y - ny;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best === -1 ? null : best;
  }, []);

  /* ---------------------------- draw overlay -------------------------- */
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const readers = readersRef.current;
    for (const r of readers) {
      if (!r.active) continue;
      const px = r.x * w;
      const py = r.y * h;
      const s = field.sample(r.x, r.y);
      const intensity = Math.min(1, s.v * 1.6 + s.grad);
      const radius = 14 + intensity * 26;

      // soft glow keyed to the warm ramp at this reader's field value
      const [cr, cg, cb] = rampColor(0.5 + intensity * 0.5);
      const grad = ctx.createRadialGradient(px, py, 2, px, py, radius);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.45 + intensity * 0.4})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      // ring
      ctx.strokeStyle = "rgba(255,236,180,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 11, 0, Math.PI * 2);
      ctx.stroke();
      // center dot pulsing with activity
      ctx.fillStyle = `rgba(255,245,210,${0.5 + intensity * 0.5})`;
      ctx.beginPath();
      ctx.arc(px, py, 3 + intensity * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  /* ------------------------------ main loop --------------------------- */
  const loop = useCallback(() => {
    const field = fieldRef.current;
    const audio = audioRef.current;
    if (!field) return;

    // Step the RD sim a few sub-steps per frame for lively evolution.
    field.step(8);
    field.render();

    // Update reader drives from field samples, feed audio.
    if (audio) {
      const readers = readersRef.current;
      for (let i = 0; i < NUM_READERS; i++) {
        const r = readers[i];
        if (r.active) {
          const s = field.sample(r.x, r.y);
          audio.setDrive(i, {
            v: s.v,
            grad: s.grad,
            u: s.u,
            x: r.x,
            active: true,
          });
        } else {
          audio.setDrive(i, { v: 0, grad: 0, u: 1, x: r.x, active: false });
        }
      }
      audio.tick();
    }

    drawOverlay();
    rafRef.current = requestAnimationFrame(loop);
  }, [drawOverlay]);

  /* ------------------------------- start ------------------------------ */
  const begin = useCallback(async () => {
    if (startedRef.current) return;
    setError(null);
    const fieldCanvas = fieldCanvasRef.current;
    const overlay = overlayRef.current;
    const wrap = wrapRef.current;
    if (!fieldCanvas || !overlay || !wrap) return;

    try {
      const field = await createField(fieldCanvas);
      fieldRef.current = field;
      setBackend(field.backend);

      // Size the overlay to the displayed square.
      const rect = wrap.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height);
      overlay.width = Math.round(side);
      overlay.height = Math.round(side);

      const audio = new PianoBloomAudio();
      audioRef.current = audio;
      await audio.start();
      setMode(audio.mode);

      startedRef.current = true;
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      setError(
        "Could not start the field or audio engine on this device. Try a different browser.",
      );
    }
  }, [loop]);

  /* ------------------------------ file load --------------------------- */
  const loadFile = useCallback(async (file: File) => {
    const audio = audioRef.current;
    if (!audio) {
      setError("Press Begin first, then drop your recording.");
      return;
    }
    setDecoding(true);
    setError(null);
    try {
      const data = await file.arrayBuffer();
      const buffer = await audio.decode(data);
      audio.setBuffer(buffer);
      setMode("grain");
      setFileName(file.name);
    } catch {
      setError(
        "Could not decode that file. Try a .wav/.mp3/.m4a/.ogg audio file.",
      );
    } finally {
      setDecoding(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  /* ----------------------------- pointer handlers -------------------- */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "running") return;
      const p = eventToField(e.clientX, e.clientY);
      if (!p) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      const hit = findReader(p.nx, p.ny);
      if (hit != null) {
        draggingReaderRef.current = hit;
      } else {
        // paint reagent — grow a bloom where you touch
        paintingRef.current = true;
        fieldRef.current?.paint(p.nx, p.ny, 0.035, 0.85);
      }
    },
    [phase, eventToField, findReader],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "running") return;
      const p = eventToField(e.clientX, e.clientY);
      if (!p) return;
      const di = draggingReaderRef.current;
      if (di != null) {
        readersRef.current[di] = {
          ...readersRef.current[di],
          x: p.nx,
          y: p.ny,
        };
      } else if (paintingRef.current) {
        fieldRef.current?.paint(p.nx, p.ny, 0.03, 0.6);
      }
    },
    [phase, eventToField],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingReaderRef.current = null;
    paintingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  /* ---------------------------- reader count ------------------------- */
  const toggleReaders = useCallback((n: number) => {
    const readers = readersRef.current;
    for (let i = 0; i < readers.length; i++) {
      readers[i] = { ...readers[i], active: i < n };
    }
    setActiveCount(n);
  }, []);

  const useFeltFallback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setMode("felt");
    setMode("felt");
    setFileName(null);
  }, []);

  /* -------------------------------- view ----------------------------- */
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0604] text-foreground">
      {/* Field + overlay, centred square */}
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-6">
        <div
          ref={wrapRef}
          className="relative aspect-square w-full max-w-[min(92vw,82vh)] overflow-hidden rounded-2xl ring-1 ring-violet-900/40 shadow-[0_0_80px_-10px_rgba(180,90,30,0.35)]"
        >
          <canvas
            ref={fieldCanvasRef}
            className="absolute inset-0 h-full w-full"
            style={{ imageRendering: "auto" }}
            aria-label="Reaction-diffusion field"
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Touch to grow blooms; drag the reader probes"
          />
        </div>
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-4 sm:p-6">
        <h1 className="font-semibold text-2xl font-semibold tracking-tight text-violet-100 sm:text-3xl">
          Piano Bloom
        </h1>
        <p className="mt-1 max-w-md text-base text-foreground">
          Play your piano into a living reaction-diffusion field. Touch grows
          blooms; the reader probes granulate and re-voice the recording back at
          you.
        </p>
        {phase === "running" && (
          <p className="mt-2 font-mono text-base text-muted-foreground">
            field:{" "}
            <span
              className={
                backend === "webgpu"
                  ? "text-violet-300/95"
                  : "text-violet-300/95"
              }
            >
              {backend === "webgpu" ? "WebGPU compute" : "Canvas2D / CPU"}
            </span>{" "}
            · voice:{" "}
            <span
              className={
                mode === "grain" ? "text-violet-300/95" : "text-violet-300/95"
              }
            >
              {mode === "grain" ? "your recording (grains)" : "felt-piano bed"}
            </span>
          </p>
        )}
      </div>

      {/* Idle gate */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex max-w-lg flex-col items-center px-6 text-center">
            <h2 className="font-semibold text-2xl font-semibold text-violet-100 sm:text-3xl">
              An instrument you play
            </h2>
            <p className="mt-3 text-base text-foreground">
              A Gray-Scott reaction-diffusion field is the resonating body. Press
              Begin and it blooms with sound immediately — a warm felt-piano
              bed. Then touch to sculpt the field, drag the glowing reader probes
              over it, and (optionally) drop your own piano recording to be
              granulated and re-voiced.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-7 min-h-[44px] rounded-full bg-violet-500/90 px-7 py-2.5 text-base font-semibold text-[#1a0f06] transition-colors hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              Begin
            </button>
            <p className="mt-3 text-base text-muted-foreground">
              Audio starts on tap. Output only — no microphone is used.
            </p>
          </div>
        </div>
      )}

      {/* Running controls (bottom-left panel) */}
      {phase === "running" && (
        <div className="absolute bottom-16 left-3 z-20 flex max-w-[min(92vw,22rem)] flex-col gap-3 sm:left-6">
          {/* File drop target */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed px-4 py-3 backdrop-blur transition-colors ${
              dragOver
                ? "border-violet-300 bg-violet-500/15"
                : "border-violet-700/50 bg-black/55"
            }`}
          >
            <p className="text-base font-medium text-violet-100">
              {fileName
                ? `Loaded: ${fileName}`
                : "Drop a piano recording (or any audio)"}
            </p>
            <p className="mt-0.5 text-base text-muted-foreground">
              {decoding
                ? "Decoding…"
                : fileName
                  ? "Sculpt the field — it re-voices your recording."
                  : "Or play the felt-piano fallback as-is."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] rounded-full border border-violet-600/50 bg-violet-500/15 px-4 py-2.5 text-base text-violet-100 transition-colors hover:bg-violet-500/25"
              >
                Choose a file
              </button>
              {fileName && (
                <button
                  type="button"
                  onClick={useFeltFallback}
                  className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
                >
                  Back to felt bed
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Reader count */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-black/55 px-4 py-2.5 backdrop-blur">
            <span className="text-base text-muted-foreground">Readers</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => toggleReaders(n)}
                className={`min-h-[44px] min-w-[44px] rounded-full px-3 py-2 text-base transition-colors ${
                  activeCount === n
                    ? "bg-violet-500/90 font-semibold text-[#1a0f06]"
                    : "bg-muted text-foreground hover:bg-accent"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error notice */}
      {error && (
        <p className="absolute bottom-16 right-3 z-30 max-w-xs rounded-lg bg-black/70 px-4 py-2.5 text-base text-violet-300 sm:right-6">
          {error}
        </p>
      )}

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-3 top-3 z-30 min-h-[44px] rounded-full border border-border bg-black/55 px-4 py-2.5 text-base text-foreground backdrop-blur transition-colors hover:bg-black/70 hover:text-foreground sm:right-6 sm:top-6"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/85 p-6 backdrop-blur-md">
          <div className="mt-14 max-w-2xl text-foreground">
            <h2 className="font-semibold text-2xl font-semibold text-violet-100">
              Design notes
            </h2>
            <p className="mt-3 text-base text-foreground">
              The resonating body is a real{" "}
              <span className="text-foreground">Gray-Scott reaction-diffusion</span>{" "}
              simulation (Pearson 1993): two chemicals U and V diffuse and react
              on a double-buffered grid with a Laplacian stencil. When{" "}
              <span className="text-foreground">WebGPU</span> is available the
              simulation step runs as a compute shader on ping-pong storage
              buffers — the lab&rsquo;s psych lane had zero WebGPU compute, so
              this brings it back as the living body. With no WebGPU it falls
              back to a Canvas2D / typed-array CPU step at a smaller grid, so it
              never shows a blank screen.
            </p>
            <p className="mt-3 text-base text-foreground">
              <span className="text-foreground">You play it.</span> Touching the
              field injects reagent (paints V), so blooms grow where you touch.
              You then place up to four{" "}
              <span className="text-foreground">reader probes</span> on the field —
              an interaction model borrowed from Reactive Audio{" "}
              <span className="italic">Growth</span> (2026), where modulation
              readers placed on an evolving field translate local field values
              into modulation signals. Each reader samples local V, U and the V
              gradient and drives a granular playback head over your loaded
              recording: V scrubs grain position through the recording, gradient
              bends grain pitch and density, bloom intensity sets grain gain.
              Dense blooms become thick grain clouds; a calm field gives sparse
              sparse grains. So touch → field → audio is bidirectional and felt.
            </p>
            <p className="mt-3 text-base text-foreground">
              With no file, the readers instead modulate a warm{" "}
              <span className="text-foreground">felt-piano</span> bed (detuned
              triangle/sine partials, soft attack, long release, a slow low pad)
              — opening filter cutoff with gradient, detuning with bloom
              intensity, panning by position. The play-relationship survives even
              with zero input, so it makes sound on a phone glance.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              References: Pearson, &ldquo;Complex Patterns in a Simple
              System&rdquo; (Science, 1993) / Gray-Scott model · Reactive Audio,{" "}
              <span className="italic">Growth</span> (2026, reader-on-a-living-
              field modulation) · Iñigo Quílez and standard RD double-buffer
              Laplacian-stencil implementations · Web Audio API granular
              synthesis (windowed BufferSource grains).
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Honest note: the WebGPU path reads the field back to the CPU each
              frame for sampling and rendering, which is the simple-but-not-
              fastest approach; a full GPU render pass would scale to larger
              grids. The grain re-voicing is musical rather than scientifically
              faithful pitch-tracking.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-full border border-border bg-muted px-5 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
