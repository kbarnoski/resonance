"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createTelemetry, type Sample, type TelemetrySource } from "./telemetry";
import { createMachineAudio, type MachineAudio } from "./audio";
import { createGL, type GLScene } from "./gl";

// ════════════════════════════════════════════════════════════════════════════
// 1876 — GLASSHOUSE
//
// THE QUESTION: What if your device sang its own inner life? The live telemetry
// of the machine you're on — frame stutter, memory pressure, network weather,
// battery drain, the entropy of your own mouse — becomes a continuous, coherent
// piece of music AND a dithered field of signal-noise that tears as it strains.
//
// A self-portrait of the machine. The ONLY input is the browser's own
// self-telemetry — no mic, no camera, no file. Monitoring-as-music.
// ════════════════════════════════════════════════════════════════════════════

const EMPTY: Sample = {
  fps: 60,
  frameMs: 16.7,
  jank: 0,
  mem: null,
  net: null,
  battery: null,
  restlessness: 0,
  load: 0,
  cores: 0,
  dpr: 1,
  visible: true,
  vw: 0,
  vh: 0,
};

function fmtBytes(n: number): string {
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function GlasshousePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const glRef = useRef<GLScene | null>(null);
  const audioRef = useRef<MachineAudio | null>(null);
  const teleRef = useRef<TelemetrySource | null>(null);
  const rafRef = useRef<number>(0);
  const sampleRef = useRef<Sample>(EMPTY);
  const startedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [glError, setGlError] = useState(false);
  const [hud, setHud] = useState<Sample>(EMPTY);
  const [points, setPoints] = useState(0);

  // ── build telemetry + visuals; run the loop (audio waits for the gesture) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tele = createTelemetry();
    teleRef.current = tele;

    let gl: GLScene | null = null;
    try {
      gl = createGL(container);
      glRef.current = gl;
    } catch {
      setGlError(true);
      gl = null;
    }

    let hudAccum = 0;
    let prevT = performance.now();
    const startT = prevT;

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      tele.tick(now);
      const sample = tele.read();
      sampleRef.current = sample;

      const time = (now - startT) / 1000;
      gl?.render(sample, time);

      // feed the audio engine every frame for smooth continuous params
      if (startedRef.current) audioRef.current?.setSample(sample);

      hudAccum += now - prevT;
      prevT = now;
      if (hudAccum > 120) {
        hudAccum = 0;
        setHud(sample);
        if (gl) setPoints(gl.activeCount());
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      if (!container || !gl) return;
      gl.resize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      audioRef.current?.dispose();
      audioRef.current = null;
      glRef.current?.dispose();
      glRef.current = null;
      teleRef.current?.dispose();
      teleRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    try {
      const audio = createMachineAudio();
      audioRef.current = audio;
      await audio.start();
      audio.setSample(sampleRef.current);
      audio.setMuted(muted);
    } catch {
      // audio blocked — visuals + telemetry still run
    }
    startedRef.current = true;
    setStarted(true);
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {/* three.js canvas mount */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* WebGL failure notice (audio can still run) */}
      {glError && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable, so the dithered field can&apos;t be drawn — but
            the machine still sings its telemetry if you tap below.
          </p>
        </div>
      )}

      {/* Title + description */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Glasshouse
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          A self-portrait of the machine you&apos;re on. Its frame stutter,
          memory, network and battery become a coherent, ever-shifting piece of
          music and a dithered field that tears as the device strains.
        </p>
      </div>

      {/* Begin overlay — visuals already run; this unlocks audio */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-background/80 p-8 text-center shadow-lg">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Monitoring as music
            </span>
            <p className="text-base text-muted-foreground">
              The field is already reading your machine. Tap to let it start
              singing what it sees — move your mouse, open tabs, watch it react.
            </p>
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Let the machine sing
            </button>
          </div>
        </div>
      )}

      {/* Live telemetry HUD */}
      <div className="pointer-events-none absolute bottom-16 left-0 z-10 w-full p-4 sm:p-6">
        <div className="pointer-events-auto grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              FPS · jank
            </div>
            <div className="mt-1 text-base tabular-nums text-foreground">
              {hud.fps.toFixed(0)}{" "}
              <span className="text-sm text-muted-foreground">
                / {hud.frameMs.toFixed(1)}ms
              </span>
            </div>
            <Bar value={hud.jank} />
          </div>

          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Memory
            </div>
            {hud.mem ? (
              <>
                <div className="mt-1 text-base tabular-nums text-foreground">
                  {(hud.mem.ratio * 100).toFixed(0)}%{" "}
                  <span className="text-sm text-muted-foreground">
                    {fmtBytes(hud.mem.used)}
                  </span>
                </div>
                <Bar value={hud.mem.ratio} />
              </>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">
                unavailable
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Network
            </div>
            {hud.net ? (
              <div className="mt-1 text-base tabular-nums text-foreground">
                {hud.net.effectiveType}{" "}
                <span className="text-sm text-muted-foreground">
                  {hud.net.downlink.toFixed(1)}Mb · {hud.net.rtt}ms
                </span>
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">
                unavailable
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Battery
            </div>
            {hud.battery ? (
              <div className="mt-1 text-base tabular-nums text-foreground">
                {(hud.battery.level * 100).toFixed(0)}%{" "}
                <span className="text-sm text-muted-foreground">
                  {hud.battery.charging ? "charging" : "draining"}
                </span>
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">
                unavailable
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Restlessness
            </div>
            <div className="mt-1 text-base tabular-nums text-foreground">
              {(hud.restlessness * 100).toFixed(0)}%
            </div>
            <Bar value={hud.restlessness} />
          </div>

          <div className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Load · points
            </div>
            <div className="mt-1 text-base tabular-nums text-foreground">
              {(hud.load * 100).toFixed(0)}%{" "}
              <span className="text-sm text-muted-foreground">
                {(points / 1000).toFixed(0)}k · {hud.cores || "?"} cores
              </span>
            </div>
            <Bar value={hud.load} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        {started && (
          <button
            type="button"
            onClick={toggleMute}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {muted ? "Sound: off" : "Sound: on"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Design notes"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Glasshouse — the machine&apos;s self-portrait
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  The one question.
                </span>{" "}
                What if your device sang its own inner life? The only input here
                is the browser&apos;s live self-telemetry — no microphone,
                camera or uploaded file.
              </p>
              <p>
                <span className="font-medium text-foreground">The signals.</span>{" "}
                Frame timing (rAF delta → fps + jitter variance), memory pressure
                (<span className="font-mono text-xs">performance.memory</span>),
                network weather (<span className="font-mono text-xs">
                  navigator.connection
                </span>
                ), battery level/charging, and the entropy of your own pointer.
                Any missing source simply reads &ldquo;unavailable&rdquo; and the
                rest keeps playing.
              </p>
              <p>
                <span className="font-medium text-foreground">The music.</span> A
                lookahead scheduler walks a 16th-note grid, reading fresh
                telemetry each step. Jank raises rhythmic density and
                glitch/retrigger probability; memory pressure swells a sub-bass
                drone and a dissonant tension partial; network rtt sets echo
                time and downlink sets brightness; pointer restlessness drives a
                lead arpeggio; a draining battery detunes the whole machine
                slowly flat, as if tiring. It is coherent and loop-free —
                different at minute three than second three.
              </p>
              <p>
                <span className="font-medium text-foreground">The field.</span> A
                dense THREE.Points lattice through an ordered Bayer 4×4 dither
                with per-channel chromatic offset. It settles when calm and tears
                / fringes as load rises. The point count itself scales with load
                (bounded), so a straining machine spends more GPU on its own
                portrait — a gentle feedback loop the frame sensor then hears.
              </p>
              <p>
                <span className="font-medium text-foreground">References.</span>{" "}
                Alunno &amp; Bientinesi, <em>EDM-Inspired Supercomputer
                Sonification</em> (arXiv:2605.21874, 2026) — real-time monitoring
                as coherent music; Robert Borghesi, <em>ASTRODITHER</em> (three.js
                WebGPU/TSL, 2026) — the dithered signal-noise aesthetic. Full
                write-up in the folder&apos;s{" "}
                <span className="font-mono text-xs">README.md</span>.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  input:
                </span>{" "}
                system-telemetry ·{" "}
                <span className="font-medium text-foreground">output:</span>{" "}
                three.js dithered field ·{" "}
                <span className="font-medium text-foreground">technique:</span>{" "}
                telemetry → continuous generative music ·{" "}
                <span className="font-medium text-foreground">vibe:</span>{" "}
                machine self-portrait / monitoring-as-music.
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

      <PrototypeNav slugs={["1876-glasshouse"]} />
    </main>
  );
}
