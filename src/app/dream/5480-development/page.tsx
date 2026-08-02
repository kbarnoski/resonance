"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  Composer,
  type ComposerState,
  type MusicSource,
} from "./audio";
import { SilentDriver } from "./silent";
import { buildSeedMotif, Conductor, DEFAULT_SEED, type Note } from "./engine";
import { createPianoRoll, type PianoRoll } from "./renderer";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** tonal centre (semitones from A) → key name; base tonic is A minor. */
function keyName(center: number): string {
  const idx = ((9 + center) % 12 + 12) % 12;
  return `${NOTE_NAMES[idx]} minor`;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const PHASE_LABEL: Record<string, string> = {
  exposition: "Exposition",
  development: "Development",
  climax: "Climax",
  recapitulation: "Recapitulation",
  coda: "Coda",
};

const NOTES_MD = `# Self-Developing Composer — design notes

## The one question

What if a piece of music composed itself forward over a long arc — stating a
seed motif, then developing it (inversion, retrograde, augmentation,
fragmentation, sequence, modulation) with real memory of everything it has
played, so minute 6 is demonstrably a transformation of minute 1, never a loop?

## Developing variation

The engine is built on Schoenberg's principle of *developing variation*: new
material is never arbitrary — it is a transformation of what came before. A
single germ motif (5 scale-degrees) is grown through the whole piece.

## The operators

Pure functions over an array of {degree, duration}: the twelve-tone row
operators — Prime (P), Inversion (I, intervals mirrored around an axis),
Retrograde (R, reversed), Retrograde-Inversion (RI) — plus augmentation /
diminution (durations scaled), fragmentation (a sub-cell), sequence (a cell
repeated at rising/falling steps), and modulation (the tonal centre shifts).

## The narrative arc

A conductor state machine walks exposition → development → climax →
recapitulation → coda, then rolls into a new movement a fourth higher so it
never stops. Each phase draws from its own palette of operators: the exposition
states and transposes the germ; the development inverts / retrogrades /
fragments / sequences / modulates remembered phrases; the climax stabs terse,
diminished fragments an octave up; the recapitulation brings the germ back
transformed and quotes earlier phrases; the coda augments the germ to rest.

## Memory

Every emitted phrase is stored with its parents and a lineage of op-tags
(seed → I → aug → …). Recapitulation literally quotes-and-transforms earlier
memory, and the on-screen derivation trace shows how the current phrase
descends from the germ.

## The visual

A self-writing Canvas2D piano-roll: pitch = y, time = x, scrolling under a
fixed playhead. Lead notes are bright violet, the pad and bass dimmer. No
three.js, no WebGL — Canvas2D only.

## Tags

self-playing · Canvas2D · symbolic motivic-transformation engine ·
compositional / architectural.

## Reference

Arnold Schoenberg, *developing variation*; the twelve-tone row operators
(Prime / Inversion / Retrograde / Retrograde-Inversion).

## Known rough edges

- Voicing is deliberately spare (one lead line + root bass + triad pad); it is a
  proof of the engine, not a finished orchestration.
- Phase boundaries are driven by elapsed beats, so a very long augmentation can
  overshoot a boundary slightly.
- "New seed" restarts the arc from the exposition with a fresh germ.`;

function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold tracking-tight text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-primary">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-muted-foreground">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-muted-foreground">
        {line}
      </p>
    );
  });
}

export default function DevelopmentPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<MusicSource | null>(null);
  const rollRef = useRef<PianoRoll | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const seedRef = useRef<number>(0x5eed);
  const lastUiRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [audioOK, setAudioOK] = useState(true);
  const [ui, setUi] = useState<ComposerState>({
    phase: "exposition",
    label: "Press Play — the germ will state itself, then develop.",
    tag: "seed",
    lineage: ["seed"],
    center: 0,
    movement: 0,
    phraseId: -1,
  });
  const [elapsed, setElapsed] = useState(0);

  const tick = useCallback(() => {
    const src = sourceRef.current;
    const roll = rollRef.current;
    if (src && roll) {
      const now = src.now();
      roll.frame(now, src.getEvents());
      if (now - lastUiRef.current > 0.12) {
        lastUiRef.current = now;
        setUi(src.getState());
        setElapsed(now - startTimeRef.current);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const begin = useCallback(
    (seed: number) => {
      // tear down any existing source
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void sourceRef.current?.dispose();

      const seedNotes: Note[] =
        seed === 0x5eed ? DEFAULT_SEED : buildSeedMotif(seed);
      const conductor = new Conductor(seedNotes, seed);

      let source: MusicSource;
      let ok = true;
      try {
        source = new Composer(conductor);
      } catch {
        ok = false;
        source = new SilentDriver(conductor);
      }
      setAudioOK(ok);
      sourceRef.current = source;

      const canvas = canvasRef.current;
      if (canvas) {
        const r = rollRef.current ?? createPianoRoll(canvas);
        rollRef.current = r;
        r.resize();
      }

      void Promise.resolve(source.start()).then(() => {
        startTimeRef.current = source.now();
        lastUiRef.current = source.now();
      });
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const togglePlay = useCallback(() => {
    if (!sourceRef.current) {
      begin(seedRef.current);
      return;
    }
    if (playing) {
      sourceRef.current.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    } else {
      void sourceRef.current.start();
      rafRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    }
  }, [playing, begin, tick]);

  const newSeed = useCallback(() => {
    // seeded, reproducible-ish germ
    seedRef.current = (Math.floor(Math.random() * 0xffffff) | 1) >>> 0;
    begin(seedRef.current);
  }, [begin]);

  useEffect(() => {
    const onResize = () => rollRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void sourceRef.current?.dispose();
      sourceRef.current = null;
      rollRef.current?.dispose();
      rollRef.current = null;
    };
  }, []);

  const lineage = ui.lineage.slice(-6);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08060f] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* readouts, top-left */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-6">
        <div className="mx-auto max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            dream · 5480 · developing variation
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            The Composer That Develops Itself
          </h1>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground">
            One germ motif, grown forward across a whole arc — inverted,
            reversed, augmented, fragmented, sequenced and modulated with memory,
            so the end is a transformation of the beginning, never a loop.
          </p>
        </div>
      </div>

      {/* live state panel, bottom */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {playing && (
            <div className="rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                  {PHASE_LABEL[ui.phase] ?? ui.phase}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {keyName(ui.center)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  movement {ui.movement + 1}
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {fmtTime(elapsed)}
                </span>
              </div>
              <p className="mt-2 text-base text-foreground">{ui.label}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  derivation
                </span>
                {lineage.map((tag, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                    )}
                    <span className="rounded-md bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                      {tag}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {!audioOK && (
            <p className="text-base text-muted-foreground">
              Audio is unavailable in this browser — the score still composes
              and scrolls, silently.
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={newSeed}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              New seed
            </button>
          </div>
        </div>
      </div>

      {/* notes toggle */}
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {notesOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-10 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
            <article className="space-y-1">{renderNotes(NOTES_MD)}</article>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["5480-development"]} />
    </main>
  );
}
