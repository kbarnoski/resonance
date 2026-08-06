"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { TensionEngine, type Phase } from "./engine";
import { runMidiAccess, type MidiStatus } from "./midi";
import { PulsegateAudio } from "./audio";
import { runWebGPU, runCanvas2D, type FieldRuntime } from "./gpu";

/*
 * PULSEGATE — what if you could PLAY the drop?
 *
 * A live Web-MIDI instrument: note-on velocity accumulates "tension", CC1
 * (mod wheel) is the riser / filter-sweep amount. A hand-rolled tension-arc
 * state engine (intro -> build -> riser -> drop -> breakdown -> back) reacts
 * to those signals in real time and drives a hard EDM voice engine plus a
 * WebGPU energy-chamber field that physically tightens through the build
 * and erupts on the drop. See engine.ts / audio.ts / gpu.ts / README.md.
 */

const KEY_MAP: Partial<Record<string, number>> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};
const KEY_ORDER = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"];
const BLACK = new Set(["w", "e", "t", "y", "u"]);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

const PHASE_LABEL: Record<Phase, string> = {
  intro: "intro",
  build: "build",
  riser: "riser — pushing up",
  drop: "DROP",
  breakdown: "breakdown",
  back: "back — rebuilding",
};

function meter(label: string, value: number) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-md bg-muted">
        <div
          className="h-full rounded-md bg-primary transition-[width] duration-100"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function PulsegatePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<TensionEngine | null>(null);
  const audioRef = useRef<PulsegateAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const fieldRef = useRef<FieldRuntime | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const reducedRef = useRef(false);
  const audioStartedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [gpuNotice, setGpuNotice] = useState<string | null>(null);
  const [backend, setBackend] = useState<"webgpu" | "canvas2d" | null>(null);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("waiting");
  const [showNotes, setShowNotes] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [hud, setHud] = useState({
    phase: "intro" as Phase,
    bar: 1,
    tension: 0,
    mod: 0,
    autoActive: true,
  });

  // --- shared note/mod entry points, used by MIDI, keyboard, and clicks ---
  const handleNoteOn = useCallback((midi: number, vel: number, human: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.noteOn(vel, human);
    audioRef.current?.noteOn(midi, vel, engine.tension, engine.mod);
  }, []);

  const handleModChange = useCallback((value: number, human: boolean) => {
    engineRef.current?.setMod(value, human);
  }, []);

  const beginAudio = useCallback(async () => {
    if (audioStartedRef.current) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = new PulsegateAudio(ctx);
      audioStartedRef.current = true;
      setStarted(true);
    } catch {
      setAudioError("Audio could not start in this browser.");
    }
  }, []);

  // ---- mount: engine + GPU field + MIDI + keyboard + render loop ----
  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new TensionEngine();
    engineRef.current = engine;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    engine.setReducedMotion(mq.matches);
    const onMq = () => {
      reducedRef.current = mq.matches;
      engine.setReducedMotion(mq.matches);
    };
    mq.addEventListener("change", onMq);

    // ---- input: Web MIDI (primary) ----
    const midi = runMidiAccess({
      onNote: (noteMidi, vel) => handleNoteOn(noteMidi, vel, true),
      onCC1: (v) => handleModChange(v, true),
      onPitchBend: (semis) => audioRef.current?.setPitchBend(semis),
      onStatus: (s) => setMidiStatus(s),
    });

    // ---- input: computer-keyboard row (A W S E D ...) ----
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = ev.key.toLowerCase();
      const midiNote = KEY_MAP[key];
      if (midiNote === undefined) return;
      ev.preventDefault();
      handleNoteOn(midiNote, 0.82, true);
      setActiveKeys((prev) => new Set(prev).add(key));
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      if (!(key in KEY_MAP)) return;
      setActiveKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ---- output: WebGPU compute field, falling back to Canvas2D ----
    (async () => {
      try {
        const rt = await runWebGPU(canvas);
        if (disposed) {
          rt.dispose();
          return;
        }
        fieldRef.current = rt;
        setBackend("webgpu");
      } catch {
        if (disposed) return;
        const rt = runCanvas2D(canvas);
        fieldRef.current = rt;
        setBackend("canvas2d");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped navigator.gpu
        const hasGpu = !!(navigator as any).gpu;
        setGpuNotice(
          hasGpu
            ? "WebGPU failed to start — showing a Canvas2D fallback of the same energy field."
            : "WebGPU required for the full energy chamber — try Chrome or Edge. Showing a Canvas2D fallback.",
        );
      }
    })();

    const resize = () => fieldRef.current?.resize();
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    let hudFrame = 0;
    lastTsRef.current = performance.now();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTsRef.current) / 1000);
      lastTsRef.current = now;

      const snap = engine.step(dt);

      if (audioStartedRef.current) {
        const audio = audioRef.current;
        if (audio) {
          if (snap.justKicked) audio.kick();
          if (snap.justDropped) audio.dropImpact();
          for (const n of snap.autoNotes) audio.noteOn(n.midi, n.vel, snap.tension, snap.mod);
          audio.applyContinuous(snap.tension, snap.mod, snap.phase, snap.pump);
        }
      }

      const reduced = reducedRef.current;
      fieldRef.current?.update({
        time: engine.elapsed,
        dt,
        tension: reduced ? snap.tension * 0.85 : snap.tension,
        mod: snap.mod,
        dropImpulse: reduced ? snap.dropImpulse * 0.5 : snap.dropImpulse,
        pump: snap.pump,
      });

      hudFrame++;
      if (hudFrame % 6 === 0) {
        setHud({
          phase: snap.phase,
          bar: snap.bar,
          tension: snap.tension,
          mod: snap.mod,
          autoActive: snap.autoActive,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      ro.disconnect();
      midi.dispose();
      fieldRef.current?.dispose();
      fieldRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        void ctxRef.current.close();
      }
      ctxRef.current = null;
      engineRef.current = null;
    };
  }, [handleNoteOn, handleModChange]);

  const onKeyPress = useCallback(
    (key: string) => {
      const midiNote = KEY_MAP[key];
      if (midiNote === undefined) return;
      handleNoteOn(midiNote, 0.82, true);
      setActiveKeys((prev) => new Set(prev).add(key));
      window.setTimeout(() => {
        setActiveKeys((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 140);
    },
    [handleNoteOn],
  );

  const midiNoticeText =
    midiStatus === "unsupported"
      ? "Web MIDI is not available in this browser — play the on-screen keys or your computer keyboard (A W S E D…) instead."
      : midiStatus === "denied"
        ? "MIDI access was denied — play the on-screen keys or your computer keyboard instead."
        : null;

  return (
    <div
      ref={wrapRef}
      className="relative min-h-screen w-full overflow-hidden bg-background"
    >
      <PrototypeNav slugs={["7384-pulsegate"]} />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            7384 · pulsegate · Web MIDI + WebGPU energy chamber
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Play the drop — a live tension-arc EDM instrument
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Note velocity charges the tension. The mod wheel is the riser. A
            hand-rolled arc engine — intro, build, riser, DROP, breakdown, back
            — steers a hard EDM voice engine and a GPU energy chamber that
            physically tightens through the build and bursts on the drop.
          </p>
          {midiNoticeText && (
            <p className="mt-3 max-w-xl text-sm text-destructive">{midiNoticeText}</p>
          )}
          {gpuNotice && <p className="mt-2 max-w-xl text-sm text-destructive">{gpuNotice}</p>}
          {audioError && <p className="mt-2 max-w-xl text-sm text-destructive">{audioError}</p>}
        </header>

        <div className="flex flex-col gap-4">
          {/* HUD */}
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-background/60 p-3 backdrop-blur-sm">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {PHASE_LABEL[hud.phase]} · bar {hud.bar}/32
            </span>
            {meter("tension", hud.tension)}
            {meter("mod", hud.mod)}
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {hud.autoActive
                ? "seeded auto-DJ performing"
                : "you are performing"}
              {" · "}
              {backend === "webgpu" ? "WebGPU compute" : backend === "canvas2d" ? "Canvas2D fallback" : "loading…"}
              {" · MIDI: "}
              {midiStatus}
            </span>
          </div>

          {/* on-screen keyboard */}
          <div className="flex flex-wrap gap-1">
            {KEY_ORDER.map((key) => {
              const midiNote = KEY_MAP[key];
              if (midiNote === undefined) return null;
              const active = activeKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onPointerDown={() => onKeyPress(key)}
                  className={`min-h-[44px] min-w-[38px] rounded-md border border-border px-2 text-xs transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : BLACK.has(key)
                        ? "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                        : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title={`${key.toUpperCase()} → ${noteName(midiNote)}`}
                >
                  <div className="font-mono uppercase">{key}</div>
                  <div className="font-mono text-[9px] opacity-70">{noteName(midiNote)}</div>
                </button>
              );
            })}
          </div>

          {/* mod wheel / riser slider fallback */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              riser / mod
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(hud.mod * 100)}
              onChange={(e) => handleModChange(Number(e.target.value) / 100, true)}
              className="h-2 w-48 accent-primary"
              aria-label="Riser / mod wheel"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!started && (
              <button
                type="button"
                onClick={() => void beginAudio()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin — arm the sound
              </button>
            )}
            {started && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                sound armed — play a note, nudge the riser, or wait for the drop
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-6 top-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">pulsegate</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: what if you could <em>play</em> the drop? Most
                journey pieces in this lab set a fixed psychedelic arc.
                Pulsegate swaps that for a performable EDM arrangement —
                intro, build, riser, DROP, breakdown, back — driven live by
                Web MIDI note velocity (tension) and the mod wheel (the
                riser / filter-sweep amount).
              </p>
              <p>
                No MIDI device? An on-screen keyboard and a computer-keyboard
                row (A W S E D…) play the same notes. No input at all? A
                seeded (mulberry32(0x7384)) auto-DJ performs a full 32-bar
                arc into the exact same noteOn()/setMod() entry points a
                human uses, so the whole piece reads — silently, visually —
                from first paint.
              </p>
              <p>
                The tension-arc idea nods to Herremans &amp; Chew&apos;s
                tonal-tension modelling and Chew&apos;s spiral-array tension
                curve, and to the 2026 explicit tension-curve conditioning
                thread — &ldquo;Explicit Tonal Tension Conditioning via
                Dual-Level Beam Search&rdquo; (arXiv 2511.19342) and LK_Jam,
                a real-time human-AI jam system (arXiv 2606.21018, 2026) —
                both of which compute a tension trajectory for a model to
                follow. Pulsegate is the deliberate non-ML inverse: nothing
                here claims a &ldquo;first&rdquo;; a person shapes the curve
                live instead of a model tracking one.
              </p>
              <p>
                Output is a WebGPU compute shader: a storage buffer of
                80,000 particles held in a spring-and-swirl containment
                field whose radius shrinks as tension + mod (&ldquo;charge&rdquo;)
                rise, and which bursts outward on the drop. Every kick ducks
                the render brightness via the same sidechain-pump envelope
                driving the audio — a soft, sub-3&nbsp;Hz brightness swell,
                never a hard strobe. Falls back to a Canvas2D field with
                identical physics when <code>navigator.gpu</code> is absent.
              </p>
              <p>
                Determinism throughout: mulberry32(0x7384) seeds the auto-DJ
                schedule, the noise buffer, and the initial particle field —
                no Math.random, no Date.now. Reduced-motion calms the
                sidechain pump and softens the drop burst.
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
    </div>
  );
}
