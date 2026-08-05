"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  defaultModes,
  FREQ_MAX,
  FREQ_MIN,
  modesToPartials,
  packModes,
  pickModes,
  type Mode,
} from "./chladni";
import { makeChladniAudio, type ChladniAudio, type SourceKind } from "./audio";
import { makeRenderer, type Renderer } from "./renderer";

const GRAIN_COUNT = 24000;
const SEED = 0x7032;
// Recompute the active mode set at ~15 Hz so the field is stable between the
// grains' 60 fps advection, and the figure blooms/dissolves without flicker.
const MODE_EVERY = 4;

interface Readout {
  dominant: number;
  m: number;
  n: number;
  active: number;
}

type Status =
  | { kind: "ok" }
  | { kind: "no-webgl" }
  | { kind: "decode-error"; msg: string };

export default function ChladniPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<ChladniAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);

  const sweepRef = useRef<number>(220);
  const sourceRef = useRef<SourceKind>("sweep");
  const droneGainRef = useRef<number>(0.5);
  const packedRef = useRef(packModes(defaultModes()));

  const [status, setStatus] = useState<Status>({ kind: "ok" });
  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<SourceKind>("sweep");
  const [sweepHz, setSweepHz] = useState(220);
  const [droneGain, setDroneGain] = useState(0.5);
  const [sourceLabel, setSourceLabel] = useState("oscillator sweep");
  const [readout, setReadout] = useState<Readout>({
    dominant: 220,
    m: 2,
    n: 3,
    active: 2,
  });
  const [dragging, setDragging] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── render loop ──────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const audio = audioRef.current;
    const frame = frameRef.current++;

    let shake = 0.5;

    // Refresh the mode field at MODE_EVERY cadence.
    if (frame % MODE_EVERY === 0) {
      let modes: Mode[];
      let dominant = sweepRef.current;
      if (audio && audio.started) {
        const a = audio.analyse();
        shake = a.amp;
        if (a.peaks.length > 0) {
          modes = pickModes(a.peaks);
          dominant = a.dominant || sweepRef.current;
        } else if (sourceRef.current === "sweep") {
          modes = pickModes([{ freq: sweepRef.current, mag: 1 }]);
        } else {
          modes = defaultModes();
        }
        // Re-sonify the emergent geometry back into the drone.
        audio.setPartials(modesToPartials(modes));
      } else {
        // Pre-Start: the slider still sculpts the plate (visual only).
        modes = pickModes([{ freq: sweepRef.current, mag: 1 }]);
      }
      packedRef.current = packModes(modes);

      // Throttle the React readout to ~4 Hz.
      if (frame % 16 === 0) {
        const top = modes[0] ?? { m: 0, n: 0, w: 0 };
        setReadout({ dominant, m: top.m, n: top.n, active: modes.length });
      }
    } else if (audio && audio.started) {
      shake = audio.analyse().amp;
    }

    const p = packedRef.current;
    renderer.step({
      modesData: p.data,
      modeCount: p.count,
      norm: p.norm,
      shake,
      frame,
    });

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── mount: build the renderer, start the sim immediately ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeRenderer(canvas, GRAIN_COUNT, SEED);
    if (!renderer) {
      setStatus({ kind: "no-webgl" });
      return;
    }
    rendererRef.current = renderer;

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [renderFrame]);

  // ── audio start (needs a user gesture) ────────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) audioRef.current = makeChladniAudio();
    const audio = audioRef.current;
    await audio.start();
    audio.setSweepFreq(sweepRef.current);
    audio.setDroneGain(droneGainRef.current);
    setStarted(true);
    setSource(audio.source);
    sourceRef.current = audio.source;
  }, []);

  const decodeFile = useCallback(
    async (file: File) => {
      try {
        if (!audioRef.current) audioRef.current = makeChladniAudio();
        const audio = audioRef.current;
        const buf = await file.arrayBuffer();
        await audio.decode(buf);
        await audio.start();
        audio.setDroneGain(droneGainRef.current);
        setStarted(true);
        setSource("file");
        sourceRef.current = "file";
        setSourceLabel(file.name);
        setStatus({ kind: "ok" });
      } catch (e) {
        setStatus({
          kind: "decode-error",
          msg: e instanceof Error ? e.message : "could not decode that file",
        });
      }
    },
    [],
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void decodeFile(f);
    },
    [decodeFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void decodeFile(f);
    },
    [decodeFile],
  );

  const onSweep = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    sweepRef.current = v;
    setSweepHz(v);
    audioRef.current?.setSweepFreq(v);
  }, []);

  const pickSource = useCallback((kind: SourceKind) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (kind === "file" && !audio.hasFile) return;
    audio.setSource(kind);
    sourceRef.current = kind;
    setSource(kind);
    setSourceLabel(kind === "sweep" ? "oscillator sweep" : "your recording");
  }, []);

  const onDrone = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    droneGainRef.current = v;
    setDroneGain(v);
    audioRef.current?.setDroneGain(v);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onClick={() => void ensureAudio()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
        aria-label="Vibrating Chladni sand plate visual"
      />

      {status.kind === "no-webgl" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGL2, which is unavailable in this browser. The
            vibrating sand plate cannot render here.
          </p>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-black/30">
          <p className="text-base text-foreground">
            Drop a recording onto the plate
          </p>
        </div>
      )}

      {/* header + controls overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 7032-chladni
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Chladni
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground">
            Drop a recording onto a vibrating sand plate and watch its
            frequencies push glowing grains into the plate&apos;s nodal-line
            figures — then the pattern sings itself back as a drone.
          </p>

          {status.kind === "decode-error" && (
            <p className="mt-3 text-sm text-destructive">
              Could not decode that file: {status.msg}. Sweep mode is still
              running.
            </p>
          )}
        </div>

        <div className="pointer-events-auto w-full max-w-xl space-y-4">
          {/* readout */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span>
              freq ·{" "}
              <span className="tabular-nums text-foreground">
                {Math.round(readout.dominant)} Hz
              </span>
            </span>
            <span>
              mode ·{" "}
              <span className="tabular-nums text-primary">
                ({readout.m},{readout.n})
              </span>
            </span>
            <span>
              active ·{" "}
              <span className="tabular-nums text-foreground">
                {readout.active}
              </span>
            </span>
          </div>

          {/* buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                onClick={() => void ensureAudio()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start the plate
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                source · {sourceLabel}
              </span>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Drop a recording
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={onFilePick}
              className="hidden"
            />
            {started && (
              <div className="flex overflow-hidden rounded-md border border-border">
                <button
                  onClick={() => pickSource("sweep")}
                  className={`min-h-[44px] px-4 text-sm transition-colors ${
                    source === "sweep"
                      ? "bg-primary/20 text-primary"
                      : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  Sweep
                </button>
                <button
                  onClick={() => pickSource("file")}
                  disabled={!audioRef.current?.hasFile}
                  className={`min-h-[44px] px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    source === "file"
                      ? "bg-primary/20 text-primary"
                      : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  File
                </button>
              </div>
            )}
          </div>

          {/* sweep slider */}
          <div className="rounded-md border border-border bg-background/60 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <label
                htmlFor="sweep"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                sweep the frequency
              </label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {Math.round(sweepHz)} Hz
              </span>
            </div>
            <input
              id="sweep"
              type="range"
              min={FREQ_MIN}
              max={FREQ_MAX}
              step={1}
              value={sweepHz}
              onChange={onSweep}
              className="mt-3 w-full accent-primary"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              With no file, sweeping walks the plate up its mode sequence —
              (1,1) to intricate high-order figures. Louder input shakes the
              sand harder.
            </p>
          </div>

          {/* drone gain */}
          <div className="rounded-md border border-border bg-background/60 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <label
                htmlFor="drone"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                re-sonified drone
              </label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {Math.round(droneGain * 100)}%
              </span>
            </div>
            <input
              id="drone"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={droneGain}
              onChange={onDrone}
              className="mt-3 w-full accent-primary"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              The emergent nodal geometry re-tunes an additive sine drone —
              the plate ringing its own figure.
            </p>
          </div>
        </div>
      </div>

      {/* Design notes corner button */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: <em>what if you dropped your own piano recording
                onto a vibrating Chladni plate and watched its frequencies push
                a field of sand into the plate&apos;s nodal-line figures — then
                the pattern sang back?</em>
              </p>
              <p>
                A square plate&apos;s standing waves are{" "}
                <span className="font-mono">
                  Z(x,y) = Σ w·sin(mπx)·sin(nπy)
                </span>
                . Sand flees the antinodes and settles on the{" "}
                <strong className="text-foreground">nodal lines</strong> where
                Z ≈ 0. An FFT of the playing audio picks the loudest peaks;
                higher frequencies excite higher{" "}
                <span className="font-mono">(m,n)</span> modes, so the figure
                grows more intricate as the music climbs. 24,000 grains advect
                down the gradient of <span className="font-mono">|Z|</span> on
                the GPU (WebGL2 transform feedback), dancing at antinodes and
                settling where the plate is still.
              </p>
              <p>
                <strong className="text-foreground">The twist —
                bidirectional:</strong> once the sand has drawn the figure, its
                active modes&apos; spatial-frequency ratios re-tune an additive
                just-intonation drone, so the geometry re-sonifies. Image and
                sound co-generate. After Ernst Chladni, and{" "}
                <em>ChladniSonify</em> (arXiv 2605.09846, 2026).
              </p>
              <p>
                Drop one of Karel&apos;s piano recordings, or use the built-in
                sweep (50–2000 Hz) to walk the plate through its whole mode
                sequence with zero file. No WebGL2 → a graceful notice; a bad
                file → sweep keeps running.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7032-chladni"]} />
    </main>
  );
}
