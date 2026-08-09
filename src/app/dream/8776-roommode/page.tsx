"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  type Dims,
  type Mode,
  enumerateModes,
  modeFrequency,
  modeTypeLabel,
  sameMode,
  sortByFrequency,
} from "./modes";
import {
  type Rig,
  buildScene,
  disposeRig,
  drawCrossSection2D,
  drawScene,
  makeRig,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  orbitEye,
} from "./gl";
import { type RoomAudio, makeRoomAudio } from "./audio";

const MAX_INDEX = 4;
const RESOLUTION = 9;
const SWEEP_COUNT = 8;
const ORBIT_RADIUS = 3.5;

const INITIAL_DIMS: Dims = { lx: 6.4, ly: 4.1, lz: 2.8 };
const INITIAL_MODE: Mode = { nx: 1, ny: 0, nz: 0 };
const PRESETS: Mode[] = [
  { nx: 1, ny: 0, nz: 0 },
  { nx: 0, ny: 1, nz: 0 },
  { nx: 1, ny: 1, nz: 0 },
  { nx: 2, ny: 1, nz: 1 },
  { nx: 2, ny: 2, nz: 2 },
];

const AXIS_LABEL = ["X", "Y", "Z"];

export default function RoomModePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<Rig | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number>(0);
  const audioRef = useRef<RoomAudio | null>(null);

  // live state kept in refs so the render loop never needs restarting
  const dimsRef = useRef<Dims>(INITIAL_DIMS);
  const modeRef = useRef<Mode>(INITIAL_MODE);
  const emphasisRef = useRef<number>(0);
  const sceneDirtyRef = useRef<boolean>(true);
  const allModes = useMemo(() => enumerateModes(MAX_INDEX), []);
  const sortedRef = useRef<Mode[]>(sortByFrequency(allModes, INITIAL_DIMS));

  const azimuthRef = useRef<number>(0.9);
  const elevationRef = useRef<number>(0.5);
  const autoOrbitRef = useRef<boolean>(true);
  const autoSweepRef = useRef<boolean>(true);
  const sweepPosRef = useRef<number>(0);
  const lastSweepRef = useRef<number>(0);
  const draggingRef = useRef<boolean>(false);
  const lastPtrRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const reduceRef = useRef<boolean>(false);
  const interactedRef = useRef<boolean>(false);

  // display mirror (UI chrome)
  const [displayMode, setDisplayMode] = useState<Mode>(INITIAL_MODE);
  const [displayFreq, setDisplayFreq] = useState<number>(
    modeFrequency(INITIAL_MODE, INITIAL_DIMS),
  );
  const [emphasis, setEmphasis] = useState<number>(0);
  const [dims, setDims] = useState<Dims>(INITIAL_DIMS);
  const [audioOn, setAudioOn] = useState<boolean>(false);
  const [noGL, setNoGL] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);

  // ---- retune audio for the current mode + its frequency neighbours -------
  const retune = useCallback((bloom: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = dimsRef.current;
    const sorted = sortedRef.current;
    const m = modeRef.current;
    const idx = sorted.findIndex((s) => sameMode(s, m));
    const f0 = modeFrequency(m, d);
    const up = idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1] : m;
    const dn = idx > 0 ? sorted[idx - 1] : m;
    audio.setChord(
      [f0, modeFrequency(up, d), modeFrequency(dn, d)],
      bloom,
    );
  }, []);

  // ---- land on a mode: update refs, UI, scene, sound ----------------------
  const landMode = useCallback(
    (m: Mode, bloom: boolean) => {
      modeRef.current = m;
      sceneDirtyRef.current = true;
      setDisplayMode(m);
      setDisplayFreq(modeFrequency(m, dimsRef.current));
      retune(bloom);
    },
    [retune],
  );

  const stepMode = useCallback(
    (dir: number) => {
      const sorted = sortedRef.current;
      const idx = sorted.findIndex((s) => sameMode(s, modeRef.current));
      const next = Math.max(0, Math.min(sorted.length - 1, idx + dir));
      landMode(sorted[next], true);
    },
    [landMode],
  );

  // ---- create AudioContext on first user gesture --------------------------
  const ensureAudio = useCallback(() => {
    interactedRef.current = true;
    autoSweepRef.current = false;
    if (audioRef.current) {
      void audioRef.current.ctx.resume();
      return;
    }
    audioRef.current = makeRoomAudio();
    void audioRef.current.ctx.resume();
    setAudioOn(true);
    retune(true);
  }, [retune]);

  // ---- react to dimension slider changes: relist + retune (glide) ---------
  useEffect(() => {
    dimsRef.current = dims;
    sortedRef.current = sortByFrequency(allModes, dims);
    sceneDirtyRef.current = true;
    setDisplayFreq(modeFrequency(modeRef.current, dims));
    retune(false);
  }, [dims, allModes, retune]);

  // ---- mount: rig, listeners, render loop ---------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceRef.current = mq.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reduceRef.current = e.matches;
    };
    mq.addEventListener("change", onMq);

    const rig = makeRig(canvas);
    if (rig) {
      rigRef.current = rig;
    } else {
      setNoGL(true);
      ctx2dRef.current = canvas.getContext("2d");
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    // ---- pointer orbit ----
    const onPointerDown = (e: PointerEvent) => {
      ensureAudio();
      draggingRef.current = true;
      autoOrbitRef.current = false;
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPtrRef.current.x;
      const dy = e.clientY - lastPtrRef.current.y;
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      azimuthRef.current -= dx * 0.008;
      elevationRef.current = Math.max(
        -1.45,
        Math.min(1.45, elevationRef.current + dy * 0.008),
      );
    };
    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    // ---- keyboard ----
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight") {
        e.preventDefault();
        ensureAudio();
        stepMode(k === "ArrowRight" ? 1 : -1);
      } else if (k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        ensureAudio();
        const d = k === "ArrowUp" ? 1 : 2; // +1 / -1 mod 3
        emphasisRef.current = (emphasisRef.current + d) % 3;
        setEmphasis(emphasisRef.current);
        sceneDirtyRef.current = true;
      } else if (k >= "1" && k <= "5") {
        ensureAudio();
        landMode(PRESETS[Number(k) - 1], true);
      }
    };
    window.addEventListener("keydown", onKey);

    // ---- render loop ----
    const start = performance.now();
    let prev = start;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;
      const reduce = reduceRef.current;

      // auto-orbit until the user grabs the camera
      if (autoOrbitRef.current) {
        azimuthRef.current += dt * (reduce ? 0.05 : 0.2);
      }

      // muted-read auto-sweep through the first modes, before any input
      if (autoSweepRef.current) {
        const interval = reduce ? 1.2 : 0.5;
        if (t - lastSweepRef.current > interval) {
          lastSweepRef.current = t;
          const sorted = sortedRef.current;
          const m = sorted[sweepPosRef.current % SWEEP_COUNT];
          sweepPosRef.current += 1;
          modeRef.current = m;
          sceneDirtyRef.current = true;
          setDisplayMode(m);
          setDisplayFreq(modeFrequency(m, dimsRef.current));
        }
      }

      const rigNow = rigRef.current;
      if (rigNow) {
        if (sceneDirtyRef.current) {
          buildScene(rigNow, {
            mode: modeRef.current,
            dims: dimsRef.current,
            emphasis: emphasisRef.current,
            resolution: RESOLUTION,
          });
          sceneDirtyRef.current = false;
        }
        const aspect =
          rigNow.gl.drawingBufferWidth /
          Math.max(1, rigNow.gl.drawingBufferHeight);
        const proj = mat4Perspective((50 * Math.PI) / 180, aspect, 0.05, 100);
        const eye = orbitEye(
          azimuthRef.current,
          elevationRef.current,
          ORBIT_RADIUS,
        );
        const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
        drawScene(rigNow, mat4Multiply(proj, view));
      } else if (ctx2dRef.current) {
        drawCrossSection2D(
          ctx2dRef.current,
          modeRef.current,
          canvas.width,
          canvas.height,
        );
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      if (rigRef.current) {
        disposeRig(rigRef.current);
        rigRef.current = null;
      }
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    };
  }, [ensureAudio, stepMode, landMode]);

  const setDim = (key: keyof Dims, value: number) => {
    setDims((d) => ({ ...d, [key]: value }));
  };

  const typeLabel = modeTypeLabel(displayMode);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* full-bleed art layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="3D room acoustic eigenmode field"
      />

      {/* hero / heading */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            Room Mode Instrument
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Resize a 3D room and watch — then hear — its acoustic standing-wave
            modes bloom. The room&rsquo;s shape is its sound.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={ensureAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the room
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground">
                sound live
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </div>
      </div>

      {/* mode readout */}
      <div className="pointer-events-none absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
        <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
          <div className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {displayFreq.toFixed(1)}
            <span className="ml-1 text-base text-muted-foreground">Hz</span>
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            mode ({displayMode.nx},{displayMode.ny},{displayMode.nz}) ·{" "}
            {typeLabel}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">
            emphasis {AXIS_LABEL[emphasis]}-planes
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4 sm:bottom-16">
        <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["lx", "Length Lx"],
                ["ly", "Width Ly"],
                ["lz", "Height Lz"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="flex items-baseline justify-between font-mono text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span className="tabular-nums text-foreground">
                    {dims[key].toFixed(1)} m
                  </span>
                </span>
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={0.1}
                  value={dims[key]}
                  onChange={(e) => setDim(key, Number(e.target.value))}
                  className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  aria-label={label}
                />
              </label>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
            drag the room to orbit · ←/→ sweep modes · ↑/↓ shift plane emphasis ·
            1–5 presets · sliders retune the room
          </p>
        </div>
      </div>

      {noGL && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-10 flex justify-center px-4">
          <p className="rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur-sm">
            WebGL2 unavailable — showing a 2D nodal cross-section fallback.
          </p>
        </div>
      )}

      {/* design notes dialog */}
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
                A rigid rectangular room supports acoustic standing waves whose
                frequencies follow{" "}
                <span className="font-mono text-sm text-foreground">
                  f = (c/2)·√((nx/Lx)² + (ny/Ly)² + (nz/Lz)²)
                </span>
                , c = 343 m/s. Each mode&rsquo;s pressure field is a product of
                cosines, so its nodal surfaces are flat planes — drawn here as
                the translucent cyan sheets.
              </p>
              <p>
                The glowing blocks are a voxel sampling of |pressure|: the
                antinodes, where the standing wave is loudest, bloom into solid
                cubes. Resizing the room re-derives every modal frequency live,
                so the sine chord glides — you hear the room retune.
              </p>
              <p>
                Rendering is raw WebGL2 (hand-rolled perspective + shaders, no
                three.js); sound is the Web Audio API. References: Lord
                Rayleigh, <em className="not-italic text-foreground">Theory of Sound</em>;
                Helmholtz resonance; and <em className="not-italic text-foreground">Scene2Sound</em>{" "}
                (arXiv:2608.01093, 2026), which this piece realizes physically
                in the browser — scene geometry becoming sound.
              </p>
              <p className="text-sm text-muted-foreground/80">
                On load, with no input and before any audio, the camera
                auto-orbits and the mode auto-sweeps so a muted phone shows the
                nodal surfaces morph within a second.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8776-roommode"]} />
    </main>
  );
}
