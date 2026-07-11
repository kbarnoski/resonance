"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { startAudio, type AudioEngine } from "./audio";
import {
  TubeModel,
  computeState,
  noteLengthNorm,
  SCALE_LEN,
  type TubeState,
} from "./model";
import { computeGeometry, drawScene, heatToY, yToHeat } from "./render";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1291 · RIJKE FLAME
 *
 * Play a SINGING FLAME. A Rijke tube is a real thermoacoustic instrument: a
 * vertical open-ended pipe with a heat source inside. Place the heat in the
 * lower half — where Rayleigh's criterion is met (heat added where acoustic
 * pressure is rising drives the standing wave) — and the pipe spontaneously
 * breaks into a loud fundamental tone. Move the heat to the upper half and it
 * goes silent. Drag the glowing gauze up and down to find the sweet spot by ear
 * and hand; drag the tube's top handle to set its length (longer = lower pitch,
 * quantised to just intonation). The growth toward song is a genuine limit-cycle
 * swell. Leave it idle and the flame drifts to the sweet spot and plays itself.
 *
 * Refs: P.L. Rijke, "singing tube" (1859); Lord Rayleigh's criterion (1878).
 */

function nearestNote(targetLen: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < SCALE_LEN; i++) {
    const d = Math.abs(noteLengthNorm(i) - targetLen);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export default function RijkeFlamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const modelRef = useRef<TubeModel>(new TubeModel());
  const rafRef = useRef<number>(0);

  const heatRef = useRef<number>(0.7); // start in the SILENT (damping) zone
  const noteRef = useRef<number>(4); // scale index (can be fractional for auto)
  const dragRef = useRef<"cap" | "flame" | null>(null);
  const hoverRef = useRef<{ cap: boolean; flame: boolean }>({ cap: false, flame: false });
  const lastInteractRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);
  const sweepDirRef = useRef<number>(-1);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<{ freq: number; drive: number; zone: string; auto: boolean }>(
    { freq: 0, drive: 0, zone: "resting", auto: false },
  );

  // ── Canvas render loop (audio joins on "Enter") ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 1.4, floor: 0.8 });
    flicker.enable(); // gentle ≤3Hz ember drift, never a strobe

    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let readoutTick = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const tSec = now / 1000;

      const active = startedRef.current;
      const idle = active && now - lastInteractRef.current > 3000;

      // Auto-demo: drift the flame to the sweet spot and slowly sweep length.
      if (idle) {
        const target = 0.25 + 0.06 * Math.sin(tSec * 0.5);
        heatRef.current += (target - heatRef.current) * Math.min(1, dt * 1.4);
        noteRef.current += dt * 0.5 * sweepDirRef.current;
        if (noteRef.current <= 0) {
          noteRef.current = 0;
          sweepDirRef.current = 1;
        } else if (noteRef.current >= SCALE_LEN - 1) {
          noteRef.current = SCALE_LEN - 1;
          sweepDirRef.current = -1;
        }
      }

      modelRef.current.runStep(dt, heatRef.current, active);
      const state: TubeState = computeState(modelRef.current, heatRef.current, noteRef.current);

      audioRef.current?.setState({
        freq: state.freq,
        a1: state.a1,
        a2: state.a2,
        breath: state.breath,
        drive: state.drive,
      });

      drawScene(ctx, cssW, cssH, state, tSec, {
        hoverCap: hoverRef.current.cap,
        hoverFlame: hoverRef.current.flame,
        auto: idle,
        flamePulse: flicker.value(tSec),
        reduced,
      });

      readoutTick += dt;
      if (readoutTick > 0.15) {
        readoutTick = 0;
        const r = state.rayleigh1;
        const inside = state.heat > 0.02 && state.heat < 0.98;
        const zone = !active
          ? "resting"
          : !inside
            ? "heat at the open end"
            : r > 0.08
              ? "driving zone — it sings"
              : r < -0.08
                ? "damping zone — silent"
                : "neutral point";
        setReadout({ freq: state.freq, drive: state.drive, zone, auto: idle });
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Audio teardown on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const geoNow = useCallback((rectW: number, rectH: number) => {
    const lengthNorm = noteLengthNorm(Math.round(noteRef.current));
    return computeGeometry(rectW, rectH, lengthNorm);
  }, []);

  const applyPointer = useCallback(
    (clientX: number, clientY: number, dragging: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const g = geoNow(rect.width, rect.height);
      const capDist = Math.hypot(x - g.cx, y - g.topY);
      const flameY = heatToY(g, heatRef.current);
      const nearFlame =
        x > g.left - 16 && x < g.right + 16 && Math.abs(y - flameY) < 26;

      if (!dragging) {
        hoverRef.current = { cap: capDist < 34, flame: nearFlame && capDist >= 34 };
        return;
      }

      // Decide which handle this drag controls (locked in on pointerdown).
      if (dragRef.current === null) {
        dragRef.current = capDist < 40 ? "cap" : "flame";
      }
      lastInteractRef.current = performance.now();

      if (dragRef.current === "cap") {
        const maxLen = rect.height * 0.74;
        const bottomY = rect.height * 0.9;
        const targetLen = Math.max(0.4, Math.min(1, (bottomY - y) / maxLen));
        noteRef.current = nearestNote(targetLen);
      } else {
        heatRef.current = yToHeat(g, y);
      }
    },
    [geoNow],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!startedRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = null;
      applyPointer(e.clientX, e.clientY, true);
    },
    [applyPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      applyPointer(e.clientX, e.clientY, dragRef.current !== null);
    },
    [applyPointer],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  }, []);

  const enter = useCallback(async () => {
    setStarted(true);
    startedRef.current = true;
    lastInteractRef.current = performance.now();
    if (!audioRef.current) {
      try {
        audioRef.current = await startAudio();
      } catch {
        // Visuals still run without audio.
      }
    }
  }, []);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#0d0b09]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-foreground">Rijke Flame</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:text-foreground"
            >
              {showNotes ? "close notes" : "read the design notes"}
            </button>
            <Link
              href="/dream"
              className="flex min-h-[44px] items-center px-2 font-mono text-base text-muted-foreground transition hover:text-foreground"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          A singing flame you play with your hand. Drag the glowing gauze down
          into the tube&apos;s lower half and it spontaneously breaks into a loud
          standing-wave tone — Rayleigh&apos;s thermoacoustic criterion made
          audible. Slide it up and the song dies. Drag the top handle to set the
          pipe&apos;s length and pitch.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-muted-foreground ring-1 ring-border backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-foreground">The question:</strong> what if you
            could <em>play</em> a singing flame — a thermoacoustic Rijke tube that
            sings when you place heat inside it?
          </p>
          <p className="mb-2">
            <strong className="text-foreground">The physics:</strong> an open–open
            pipe&apos;s fundamental has a{" "}
            <span className="text-violet-200/90">pressure antinode</span> at its
            centre and velocity antinodes at the open ends. Rayleigh&apos;s
            criterion (1878): heat added where acoustic pressure is rising feeds
            the oscillation. The mode&apos;s growth rate goes as{" "}
            <span className="text-violet-200/90">sin(2πh)</span> — positive
            (driving) in the lower half, peaking at h = ¼, negative (damping) in
            the upper half. The second mode grows as sin(4πh), leaving a pure
            octave pocket near h ≈ 0.62 where the fundamental is being damped.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Hand → sound:</strong> the flame
            position sets each mode&apos;s target amplitude via that Rayleigh
            curve; a limit-cycle integrator relaxes toward it — slow on the way up
            (the onset swell) and quicker down. The tube tone is a fundamental +
            harmonic stack with a breath-noise band tuned to the pipe: breathy at
            onset, bright and pure at full song. Tube length → pitch, quantised to
            just intonation so dragging is always playable.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Idle:</strong> ~3s untouched and the
            flame drifts to the sweet spot and slowly sweeps the length — it plays
            itself until you grab it again.
          </p>
          <p className="text-muted-foreground">
            Refs: P.L. Rijke, &ldquo;singing tube&rdquo; (1859); Lord Rayleigh, on
            the maintenance of vibrations by heat (1878). Palette: brushed copper
            / brass + ember heat-shimmer on deep charcoal. Not verified on real
            speakers/ears — see README for limitations.
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {/* Live readout */}
        {started && (
          <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-foreground ring-1 ring-border backdrop-blur-sm">
            <div className="text-violet-200/90">
              {readout.freq.toFixed(1)} Hz{" "}
              <span className="text-muted-foreground">· drive {Math.round(readout.drive * 100)}%</span>
            </div>
            <div className={readout.zone.includes("sings") ? "text-violet-300/95" : "text-muted-foreground"}>
              {readout.zone}
            </div>
            {readout.auto && <div className="text-violet-300/90">playing itself…</div>}
          </div>
        )}

        {/* Enter (audio gate) */}
        {!started && (
          <div className="absolute inset-x-0 bottom-8 z-20 flex flex-col items-center gap-2 px-4">
            <button
              type="button"
              onClick={enter}
              className="min-h-[44px] rounded-full bg-violet-400/90 px-4 py-2.5 font-mono text-base font-semibold text-black ring-1 ring-violet-200/40 transition hover:bg-violet-300"
            >
              ▶ Light the flame
            </button>
            <p className="max-w-md text-center text-base text-muted-foreground">
              Starts the sound. Drag the glowing gauze into the lower half to make
              it sing; drag the top handle to change pitch. Leave it idle and it
              plays itself.
            </p>
          </div>
        )}

        {started && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <p className="text-base text-muted-foreground">
              Drag the gauze low to sing · drag the top handle for pitch
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
