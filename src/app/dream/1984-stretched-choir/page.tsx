"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StretchedChoir } from "./audio";
import { runMidiAccess, type MidiConnection } from "./midi";
import {
  STRETCH_MIN,
  STRETCH_MAX,
  STRETCH_DEFAULT,
  partialAmp,
  noteFreq,
  noteName,
  chordDissonance,
} from "./spectrum";

/**
 * 1984 · Stretched Choir
 *
 * What if every chord were built from a *stretched* octave — partials pulled
 * slightly sharp — so the whole choir shimmers and beats the way a real
 * piano's extreme octaves do, and "in tune" is redefined by the timbre itself?
 *
 * A playable additive/inharmonic spectral instrument. Timbre and scale are
 * both derived from one pseudo-octave stretch (Sethares: matched timbre & scale
 * minimise dissonance). Drag the stretch — or unlock the scale from the timbre
 * — to hear consonance melt and re-form. Every sounding partial is a soft
 * radial-gradient DOM voice; the shimmer is the browser compositor blending
 * overlapping translucent layers with `mix-blend-mode: screen` — no canvas.
 */

// Computer-keyboard map: a w s e d f t g y h u j k -> semitones 0..12.
const KEYS: { key: string; semi: number; black: boolean }[] = [
  { key: "a", semi: 0, black: false },
  { key: "w", semi: 1, black: true },
  { key: "s", semi: 2, black: false },
  { key: "e", semi: 3, black: true },
  { key: "d", semi: 4, black: false },
  { key: "f", semi: 5, black: false },
  { key: "t", semi: 6, black: true },
  { key: "g", semi: 7, black: false },
  { key: "y", semi: 8, black: true },
  { key: "h", semi: 9, black: false },
  { key: "u", semi: 10, black: true },
  { key: "j", semi: 11, black: false },
  { key: "k", semi: 12, black: false },
];
const WHITE_SEMIS = KEYS.filter((k) => !k.black);
// Which white index each black key sits after (for absolute positioning).
const BLACK_AFTER: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

// Frequency window for mapping partials onto the screen (log space).
const LO = Math.log2(55);
const HI = Math.log2(4200);

// Warm-white -> cool-bone centre colour by partial index.
function partialColor(n: number): string {
  const t = Math.min(1, (n - 1) / 5);
  const r = Math.round(255 - t * 26);
  const g = Math.round(246 - t * 8);
  const b = Math.round(226 + t * 26);
  return `rgb(${r} ${g} ${b})`;
}

interface FrozenBlob {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
}
interface FrozenPane {
  id: number;
  blobs: FrozenBlob[];
  label: string;
  dissolving: boolean;
}

export default function StretchedChoirPage() {
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [timbre, setTimbre] = useState(STRETCH_DEFAULT);
  const [scale, setScale] = useState(STRETCH_DEFAULT);
  const [linked, setLinked] = useState(true);
  const [midiStatus, setMidiStatus] = useState<string | null>(null);
  const [octave, setOctave] = useState(0); // shift in octaves from C4
  const [active, setActive] = useState<Set<number>>(new Set());
  const [frozen, setFrozen] = useState<FrozenPane[]>([]);
  const [showNotes, setShowNotes] = useState(false);

  const engineRef = useRef<StretchedChoir | null>(null);
  const midiRef = useRef<MidiConnection | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const poolRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const reducedRef = useRef(false);
  const pressedRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<Set<number>>(new Set());
  const timbreRef = useRef(timbre);
  const scaleRef = useRef(scale);
  const dissTextRef = useRef<HTMLSpanElement | null>(null);
  const dissBarRef = useRef<HTMLDivElement | null>(null);
  const freezeCounter = useRef(0);

  const baseMidi = 60 + octave * 12;

  // Keep refs in sync for the imperative rAF loop.
  useEffect(() => {
    timbreRef.current = timbre;
  }, [timbre]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const setActiveSet = useCallback((next: Set<number>) => {
    activeRef.current = next;
    setActive(new Set(next));
  }, []);

  const noteOn = useCallback(
    (midi: number, velocity = 0.85) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.noteOn(midi, velocity);
      const next = new Set(activeRef.current);
      next.add(midi);
      setActiveSet(next);
    },
    [setActiveSet],
  );

  const noteOff = useCallback(
    (midi: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.noteOff(midi);
      const next = new Set(activeRef.current);
      next.delete(midi);
      setActiveSet(next);
    },
    [setActiveSet],
  );

  // The compositor render loop: reconcile one DOM div per sounding partial and
  // nudge its transform / opacity every frame so beating partials pulse.
  const frame = useCallback((tMs: number) => {
    const eng = engineRef.current;
    const layer = layerRef.current;
    if (eng && layer) {
      const t = tMs / 1000;
      const pool = poolRef.current;
      const voices = eng.snapshot();
      const seen = new Set<string>();

      for (const v of voices) {
        for (const p of v.partials) {
          const key = `${v.midi}:${p.n}`;
          seen.add(key);
          let el = pool.get(key);
          if (!el) {
            el = document.createElement("div");
            el.className = "sc-voice";
            el.style.background = `radial-gradient(circle at 50% 50%, ${partialColor(
              p.n,
            )} 0%, rgb(255 255 255 / 0.35) 22%, transparent 68%)`;
            layer.appendChild(el);
            pool.set(key, el);
          }
          const fx = Math.min(1, Math.max(0, (Math.log2(p.freq) - LO) / (HI - LO)));
          const x = 6 + fx * 88;
          const y = 84 - fx * 68;
          const size = 60 + 260 * partialAmp(p.n);

          let pulse = 1;
          if (!reducedRef.current) {
            const rate = p.beatHz > 0 ? Math.min(p.beatHz, 8) : 0.12;
            pulse = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t));
          }
          const op = Math.min(1, p.amp * 1.5) * pulse;
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.left = `${x}%`;
          el.style.top = `${y}%`;
          el.style.opacity = op.toFixed(3);
        }
      }

      // Remove elements whose partial is no longer sounding.
      for (const [key, el] of pool) {
        if (!seen.has(key)) {
          el.remove();
          pool.delete(key);
        }
      }

      // Live roughness readout (Sethares sensory dissonance of held notes).
      const notes = Array.from(activeRef.current);
      if (dissTextRef.current && dissBarRef.current) {
        let rough = 0;
        if (notes.length >= 2) {
          const funds = notes.map((m) => noteFreq(m, scaleRef.current));
          const d = chordDissonance(funds, timbreRef.current);
          const raw = 1 - Math.exp(-d * 0.9);
          // Expand the demo-relevant band (~0.30–0.60) across the meter so the
          // matched -> mismatched swing is clearly visible.
          rough = Math.min(1, Math.max(0, (raw - 0.3) / 0.3));
        }
        dissBarRef.current.style.width = `${(rough * 100).toFixed(1)}%`;
        dissTextRef.current.textContent =
          notes.length < 2 ? "play 2+ notes" : rough.toFixed(2);
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const eng = new StretchedChoir(timbreRef.current, scaleRef.current);
    await eng.resume();
    engineRef.current = eng;
    setPhase("running");
    rafRef.current = requestAnimationFrame(frame);

    // A gentle opening triad so something sounds & shimmers immediately.
    eng.noteOn(60, 0.8);
    eng.noteOn(64, 0.8);
    eng.noteOn(67, 0.8);
    const opening = new Set([60, 64, 67]);
    setActiveSet(opening);
    window.setTimeout(() => {
      for (const m of opening) eng.noteOff(m);
      setActiveSet(new Set());
    }, 2600);

    runMidiAccess({
      onNoteOn: (m, v) => noteOn(m, v),
      onNoteOff: (m) => noteOff(m),
      onStatus: (name) => setMidiStatus(name),
    }).then((conn) => {
      midiRef.current = conn;
      if (!conn) setMidiStatus(null);
    });
  }, [frame, noteOn, noteOff, setActiveSet]);

  // Computer-keyboard input.
  useEffect(() => {
    if (phase !== "running") return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        setOctave((o) => Math.max(-3, o - 1));
        return;
      }
      if (k === "x") {
        setOctave((o) => Math.min(3, o + 1));
        return;
      }
      const entry = KEYS.find((kk) => kk.key === k);
      if (!entry || pressedRef.current.has(k)) return;
      pressedRef.current.add(k);
      noteOn(baseMidi + entry.semi);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const entry = KEYS.find((kk) => kk.key === k);
      if (!entry) return;
      pressedRef.current.delete(k);
      noteOff(baseMidi + entry.semi);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase, baseMidi, noteOn, noteOff]);

  // Teardown.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      midiRef.current?.dispose();
      void engineRef.current?.close();
      engineRef.current = null;
    };
  }, []);

  const onTimbre = (val: number) => {
    setTimbre(val);
    timbreRef.current = val;
    engineRef.current?.setTimbreStretch(val);
    if (linked) {
      setScale(val);
      scaleRef.current = val;
      engineRef.current?.setScaleStretch(val);
    }
  };
  const onScale = (val: number) => {
    setScale(val);
    scaleRef.current = val;
    engineRef.current?.setScaleStretch(val);
  };
  const toggleLink = () => {
    setLinked((prev) => {
      const next = !prev;
      if (next) {
        setScale(timbre);
        scaleRef.current = timbre;
        engineRef.current?.setScaleStretch(timbre);
      }
      return next;
    });
  };

  const freezeChord = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const voices = eng.snapshot().filter((v) => v.env > 0.02);
    if (voices.length === 0) return;
    const blobs: FrozenBlob[] = [];
    for (const v of voices) {
      for (const p of v.partials) {
        const fx = Math.min(
          1,
          Math.max(0, (Math.log2(p.freq) - LO) / (HI - LO)),
        );
        blobs.push({
          x: 6 + fx * 88,
          y: 84 - fx * 68,
          size: 60 + 260 * partialAmp(p.n),
          color: partialColor(p.n),
          opacity: Math.min(1, p.amp * 1.5) * 0.5,
        });
      }
    }
    const label = voices
      .map((v) => noteName(v.midi))
      .slice(0, 5)
      .join(" ");
    freezeCounter.current += 1;
    setFrozen((prev) => [
      ...prev,
      { id: freezeCounter.current, blobs, label, dissolving: false },
    ]);
  };

  const dissolvePane = (id: number) => {
    setFrozen((prev) =>
      prev.map((p) => (p.id === id ? { ...p, dissolving: true } : p)),
    );
    window.setTimeout(() => {
      setFrozen((prev) => prev.filter((p) => p.id !== id));
    }, 900);
  };

  const matched = Math.abs(timbre - scale) < 0.001;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b0c0f] text-foreground">
      {/* Frozen memory panes (static compositor layers, editable). */}
      <div className="pointer-events-none absolute inset-0">
        {frozen.map((pane) => (
          <div
            key={pane.id}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: pane.dissolving ? 0 : 0.55 }}
          >
            {pane.blobs.map((b, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  opacity: b.opacity,
                  transform: "translate(-50%, -50%)",
                  mixBlendMode: "screen",
                  background: `radial-gradient(circle at 50% 50%, ${b.color} 0%, rgb(255 255 255 / 0.3) 22%, transparent 68%)`,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Live compositor layer — one DOM div per sounding partial. */}
      <div ref={layerRef} className="pointer-events-none absolute inset-0" />

      {/* Vignette for depth (pure CSS, above the glow). */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 30%, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Stretched Choir
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            A choir built from stretched octaves — partials pulled sharp until
            the timbre itself decides what &ldquo;in tune&rdquo; means.
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* Idle: primary action */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start choir
          </button>
        </div>
      )}

      {/* Running: control deck + keyboard */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-4 p-5">
          <div className="pointer-events-auto rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
              {/* Stretch slider */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between">
                  <label className="text-sm text-foreground">
                    Pseudo-octave stretch
                  </label>
                  <span className="font-mono text-xs text-muted-foreground">
                    timbre {timbre.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={STRETCH_MIN}
                  max={STRETCH_MAX}
                  step={0.001}
                  value={timbre}
                  onChange={(e) => onTimbre(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Pseudo-octave stretch"
                />
                {!linked && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-baseline justify-between">
                      <label className="text-sm text-muted-foreground">
                        Scale stretch (unlocked)
                      </label>
                      <span className="font-mono text-xs text-muted-foreground">
                        scale {scale.toFixed(3)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={STRETCH_MIN}
                      max={STRETCH_MAX}
                      step={0.001}
                      value={scale}
                      onChange={(e) => onScale(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                      aria-label="Scale stretch"
                    />
                  </div>
                )}
              </div>

              {/* Roughness meter */}
              <div className="w-full md:w-44">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm text-foreground">Roughness</span>
                  <span
                    ref={dissTextRef}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    play 2+ notes
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    ref={dissBarRef}
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: "0%" }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {matched ? "timbre & scale matched" : "timbre & scale drifting"}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={toggleLink}
                  className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                    linked
                      ? "border-primary/50 bg-primary/20 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {linked ? "Scale locked to timbre" : "Lock scale to timbre"}
                </button>
                <button
                  onClick={freezeChord}
                  disabled={active.size === 0}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  Freeze chord
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">
                MIDI: {midiStatus ?? "none — use the keys below"}
              </span>
              <span className="font-mono">octave {octave >= 0 ? `+${octave}` : octave} (z / x)</span>
              {frozen.length > 0 && (
                <span className="flex flex-wrap items-center gap-2">
                  frozen:
                  {frozen.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => dissolvePane(p.id)}
                      className="rounded border border-border px-2 py-0.5 font-mono hover:border-destructive hover:text-destructive"
                    >
                      {p.label} ✕
                    </button>
                  ))}
                </span>
              )}
            </div>
          </div>

          {/* On-screen keyboard */}
          <div className="pointer-events-auto relative mx-auto h-28 w-full max-w-2xl select-none">
            {/* white keys */}
            <div className="flex h-full w-full gap-1">
              {WHITE_SEMIS.map((k) => {
                const midi = baseMidi + k.semi;
                const on = active.has(midi);
                return (
                  <button
                    key={k.key}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      noteOn(midi);
                    }}
                    onPointerUp={() => noteOff(midi)}
                    onPointerLeave={(e) => {
                      if (e.buttons) noteOff(midi);
                    }}
                    className={`relative flex flex-1 items-end justify-center rounded-b-md border border-border pb-2 transition-colors ${
                      on ? "bg-primary/40" : "bg-background/80 hover:bg-accent"
                    }`}
                  >
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {k.key}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* black keys */}
            {KEYS.filter((k) => k.black).map((k) => {
              const midi = baseMidi + k.semi;
              const on = active.has(midi);
              const whiteIdx = BLACK_AFTER[k.semi];
              const left = ((whiteIdx + 1) / WHITE_SEMIS.length) * 100;
              return (
                <button
                  key={k.key}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    noteOn(midi);
                  }}
                  onPointerUp={() => noteOff(midi)}
                  onPointerLeave={(e) => {
                    if (e.buttons) noteOff(midi);
                  }}
                  style={{ left: `${left}%` }}
                  className={`absolute top-0 z-10 flex h-16 w-[7%] -translate-x-1/2 items-end justify-center rounded-b-md border border-border pb-1 transition-colors ${
                    on ? "bg-primary/60" : "bg-[#1a1b20] hover:bg-[#26272e]"
                  }`}
                >
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    {k.key}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Stretched Choir — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every voice is an additive stack of six partials, but the
                partials are <em>stretched</em>: partial n sits at f₀·n^β with
                β = log₂(stretch). At a stretch of 2.0 that is the ordinary
                harmonic series; past 2.0 the overtones drift progressively
                sharp — the Railsback piano-tuning curve, generalised — so
                stacked notes beat and shimmer.
              </p>
              <p>
                The playing scale is a twelve-step division of the{" "}
                <em>same</em> stretched pseudo-octave. Following Sethares,
                dissonance is minimised when the scale&rsquo;s step ratio
                matches the timbre&rsquo;s partial spacing, so a matched-stretch
                triad locks into an eerie, glassy consonance even though it is
                detuned from equal temperament. Unlock the scale from the timbre
                (or just drag the stretch) and hear consonance melt and re-form —
                the roughness meter is live Sethares sensory dissonance.
              </p>
              <p>
                Input is Web MIDI when a keyboard is present, always with the
                on-screen and computer-keyboard fallback (a w s e d f t g y h u j
                k; z / x shift octave). The shimmer is not canvas: each sounding
                partial is a radial-gradient DOM div blended by the browser
                compositor with mix-blend-mode: screen, pulsing at its real
                acoustic beat rate.
              </p>
              <p className="text-xs">
                References: William Sethares, <em>Tuning, Timbre, Spectrum,
                Scale</em> (1998); the Railsback curve of piano octave stretch;
                Wendy Carlos&rsquo;s non-octave alpha/beta/gamma tunings.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        .sc-voice {
          position: absolute;
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          mix-blend-mode: screen;
          will-change: opacity, width, height;
        }
        @media (prefers-reduced-motion: reduce) {
          .sc-voice { transition: opacity 0.2s linear; }
        }
      `}</style>
    </main>
  );
}
