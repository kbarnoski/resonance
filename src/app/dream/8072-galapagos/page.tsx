"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 8072-galapagos
//   "Breed a melody the way Dawkins bred biomorphs — pick the offspring you like,
//    let them mate, generation after generation."
//
//   state: artificial-life / interactive-evolution · pole: organic
//
// THE VERB (author, don't watch): select 1–2 organisms as PARENTS (keyboard 1–9,
// or tap), press EVOLVE (Space/Enter) and a new generation of 9 offspring is bred
// by sexual CROSSOVER + mutation. Over generations you breed the population — and
// its SOUND — toward your taste. The single genome drives BOTH the SVG creature
// (biomorph.ts) AND its 2-op FM voice (audio.ts): the grid you keep is the chord
// you keep.
//
// Self-demo: after a few idle seconds a seeded mulberry32(0x8072) "auto-curator"
// picks parents and breeds on a loop, so a muted phone at 06:30 sees + hears it
// alive with zero input. Any keypress/tap hands control back.
//
// Determinism: no Math.random / Date.now / new Date. Every generation is bred by a
// generation-seeded PRNG; timing from performance.now / AudioContext.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import {
  mulberry32,
  makeFounders,
  breed,
  readVoice,
  genomeSig,
  GENE,
  type Genome,
} from "./genome";
import { buildBiomorph, shadeColor, VIEW } from "./biomorph";
import { GalapagosAudio, voiceEnvelope } from "./audio";

const POP = 9;
const IDLE_MS = 4500; // idle this long → the auto-curator takes over
const AUTO_PERIOD = 5200; // ms between autonomous breedings
const HIGHLIGHT_MS = 1300; // parents glow this long before the auto-breed

// A generation-seeded PRNG so every breed is deterministic (no Math.random).
function breedRng(gen: number): () => number {
  return mulberry32((0x8072 ^ Math.imul(gen + 1, 0x9e3779b1)) >>> 0);
}
function pickRng(gen: number): () => number {
  return mulberry32((0x8072 ^ Math.imul(gen + 101, 0x85ebca6b)) >>> 0);
}
function foundingPop(): Genome[] {
  return makeFounders(mulberry32(0x8072));
}

interface AutoState {
  stage: "wait" | "highlight";
  nextAt: number;
  until: number;
  parents: number[];
}

export default function Page() {
  const [pop, setPop] = useState<Genome[]>(foundingPop);
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [kept, setKept] = useState<{ genome: Genome; sig: string } | null>(null);
  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  // ── refs the animation loop reads (state is async) ──
  const popRef = useRef(pop);
  const selRef = useRef(selected);
  const genRef = useRef(generation);
  const startedRef = useRef(started);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<GalapagosAudio | null>(null);
  const rafRef = useRef<number>(0);
  const lastInteractRef = useRef<number>(0);
  const autoRef = useRef<AutoState>({ stage: "wait", nextAt: 0, until: 0, parents: [] });
  const autoWasRef = useRef(true);
  const reducedRef = useRef(false);
  const groupsRef = useRef<Array<SVGGElement | null>>([]);

  useEffect(() => {
    popRef.current = pop;
  }, [pop]);
  useEffect(() => {
    selRef.current = selected;
  }, [selected]);
  useEffect(() => {
    genRef.current = generation;
  }, [generation]);
  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  // Per-organism derived data (segments for drawing, rhythm/duty for breathing).
  const derived = useMemo(
    () =>
      pop.map((g) => {
        const v = readVoice(g, 1); // root irrelevant to rhythm/duty
        return {
          segs: buildBiomorph(g),
          sig: genomeSig(g),
          shade: g[GENE.SHADE],
          rhythmHz: v.rhythmHz,
          duty: v.duty,
        };
      }),
    [pop],
  );
  const derivedRef = useRef(derived);
  useEffect(() => {
    derivedRef.current = derived;
  }, [derived]);

  const markInteract = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  const applyPopulation = useCallback((next: Genome[]) => {
    setPop(next);
    if (startedRef.current) audioRef.current?.setPopulation(next);
  }, []);

  const evolveFrom = useCallback(
    (parentIdx: number[]) => {
      const parents = parentIdx.map((i) => popRef.current[i]).filter(Boolean) as Genome[];
      if (parents.length === 0) return;
      const gen = genRef.current;
      const next = breed(parents, breedRng(gen));
      applyPopulation(next);
      setGeneration(gen + 1);
      setSelected([]);
    },
    [applyPopulation],
  );

  const toggleSelect = useCallback(
    (i: number) => {
      markInteract();
      setSelected((prev) => {
        if (prev.includes(i)) return prev.filter((x) => x !== i);
        if (prev.length >= 2) return [prev[1], i]; // keep the two most recent
        return [...prev, i];
      });
    },
    [markInteract],
  );

  const evolve = useCallback(() => {
    markInteract();
    if (selRef.current.length === 0) return;
    evolveFrom(selRef.current);
  }, [markInteract, evolveFrom]);

  const keepSelected = useCallback(() => {
    markInteract();
    const i = selRef.current[0];
    if (i == null) return;
    const g = popRef.current[i];
    setKept({ genome: g, sig: genomeSig(g) });
  }, [markInteract]);

  const breedFromKept = useCallback(() => {
    markInteract();
    if (!kept) return;
    const gen = genRef.current;
    const next = breed([kept.genome], breedRng(gen));
    applyPopulation(next);
    setGeneration(gen + 1);
    setSelected([]);
  }, [markInteract, kept, applyPopulation]);

  const reseed = useCallback(() => {
    markInteract();
    applyPopulation(foundingPop());
    setGeneration(0);
    setSelected([]);
  }, [markInteract, applyPopulation]);

  // ── audio start (needs a user gesture) ──
  const start = useCallback(async () => {
    markInteract();
    if (startedRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const audio = new GalapagosAudio(ctx);
      audio.setPopulation(popRef.current);
      ctxRef.current = ctx;
      audioRef.current = audio;
      setStarted(true);
      setAudioError(null);
    } catch {
      setAudioError("Audio could not start on this device — the grid still breeds and breathes silently.");
    }
  }, [markInteract]);

  // ── mount: reduced-motion, keyboard, animation loop, teardown ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    autoRef.current.nextAt = performance.now() + 1600; // first auto-breed comes quickly

    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        toggleSelect(Number(e.key) - 1);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        evolve();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        markInteract();
        setSelected([]);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        keepSelected();
      }
    };
    window.addEventListener("keydown", onKey);

    const loop = () => {
      const now = performance.now();
      const tSec = ctxRef.current ? ctxRef.current.currentTime : now / 1000;

      // audio: pulse each voice, selected sing louder
      audioRef.current?.tick(new Set(selRef.current));

      // visual breathing — the same envelope the audio hears
      if (!reducedRef.current) {
        const d = derivedRef.current;
        const groups = groupsRef.current;
        for (let i = 0; i < d.length; i++) {
          const g = groups[i];
          if (!g) continue;
          const env = voiceEnvelope(d[i].rhythmHz, d[i].duty, tSec);
          const s = 0.94 + 0.12 * env;
          g.style.transform = `translate(${VIEW / 2}px,${VIEW / 2}px) scale(${s.toFixed(
            3,
          )}) translate(${-VIEW / 2}px,${-VIEW / 2}px)`;
        }
      }

      // auto-curator
      const idle = now - lastInteractRef.current > IDLE_MS;
      if (idle !== autoWasRef.current) {
        autoWasRef.current = idle;
        setAuto(idle);
      }
      const a = autoRef.current;
      if (idle) {
        if (a.stage === "wait" && now >= a.nextAt) {
          const rng = pickRng(genRef.current);
          const twoParents = rng() < 0.72;
          const i0 = Math.floor(rng() * POP);
          let i1 = Math.floor(rng() * POP);
          if (i1 === i0) i1 = (i1 + 1) % POP;
          const parents = twoParents ? [i0, i1] : [i0];
          a.parents = parents;
          a.stage = "highlight";
          a.until = now + HIGHLIGHT_MS;
          setSelected(parents);
        } else if (a.stage === "highlight" && now >= a.until) {
          evolveFrom(a.parents);
          a.stage = "wait";
          a.nextAt = now + AUTO_PERIOD;
        }
      } else {
        a.stage = "wait";
        a.nextAt = now + AUTO_PERIOD;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, [toggleSelect, evolve, evolveFrom, keepSelected, markInteract]);

  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <PrototypeNav slugs={["8072-galapagos"]} />

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
        <header className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              8072 · galápagos
            </span>
            {auto && (
              <span className="animate-pulse rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.14em] text-primary">
                auto-breeding
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Breed a living sound-organism
          </h1>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground">
            Every creature&apos;s genome draws its shape <em>and</em> plays its voice. Pick one or two you
            like as parents, then evolve — their children cross and mutate. Generation after generation,
            you breed the grid, and its chord, toward your taste.
          </p>
        </header>

        {audioError && <p className="mb-4 text-sm text-destructive">{audioError}</p>}

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {pop.map((g, i) => {
            const d = derived[i];
            const isSel = selected.includes(i);
            const parentRole = isSel ? (selected[0] === i ? "A" : "B") : null;
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleSelect(i)}
                aria-pressed={isSel}
                className={`group relative flex aspect-square min-h-[44px] items-center justify-center overflow-hidden rounded-lg border bg-background/60 transition-colors ${
                  isSel
                    ? "border-primary ring-1 ring-primary"
                    : "border-border hover:border-primary/50 hover:bg-accent"
                }`}
              >
                <svg
                  viewBox={`0 0 ${VIEW} ${VIEW}`}
                  className="h-full w-full"
                  style={isSel ? { filter: "drop-shadow(0 0 6px hsl(270 80% 66% / 0.55))" } : undefined}
                >
                  <g
                    ref={(el) => {
                      groupsRef.current[i] = el;
                    }}
                  >
                    {d.segs.map((s, j) => (
                      <line
                        key={j}
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        stroke={shadeColor(d.shade, s.s)}
                        strokeWidth={s.w}
                        strokeLinecap="round"
                      />
                    ))}
                  </g>
                </svg>
                <span className="absolute left-1.5 top-1.5 font-mono text-xs text-muted-foreground">
                  {i + 1}
                </span>
                {parentRole && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-primary/25 px-1 font-mono text-xs text-primary">
                    {parentRole}
                  </span>
                )}
                <span className="absolute bottom-1 right-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70">
                  {d.sig}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!started && (
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start sound
            </button>
          )}
          <button
            type="button"
            onClick={evolve}
            disabled={selected.length === 0}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Evolve ↵
          </button>
          <button
            type="button"
            onClick={keepSelected}
            disabled={selected.length === 0}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Keep ★
          </button>
          <button
            type="button"
            onClick={reseed}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            New pool
          </button>

          <span className="ml-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            gen {generation}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground/80">
            keys: 1–9 pick parents · space/↵ evolve · ⌫ clear · k keep
          </p>
          {kept && (
            <button
              type="button"
              onClick={breedFromKept}
              className="min-h-[36px] rounded-md border border-primary/40 bg-primary/10 px-3 font-mono text-xs uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20"
              title="Start a new generation from your kept creature"
            >
              ★ {kept.sig} → breed
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Galápagos — design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is <em>aesthetic selection</em>, the verb from Richard Dawkins&apos; Biomorphs (<em>The
                Blind Watchmaker</em>, 1986) and Karl Sims&apos; <em>Galápagos</em> installation (SIGGRAPH
                1991 / 1997): you don&apos;t tune parameters, you choose which creatures live and mate, and
                selection over generations does the rest.
              </p>
              <p>
                A genome is ten genes in [0,1]. The same genome draws a recursive branching biomorph
                <em> and</em> voices a two-operator FM tone — pitch on a just scale, brightness from branch
                depth, an ostinato from its rhythm gene. So the population you keep is literally the chord you
                keep; each breed re-composes the grid you hear.
              </p>
              <p>
                Selecting two parents crosses their genomes gene-by-gene (sexual recombination); one parent
                clones. Every child then mutates a little. Leave it idle and a seeded curator breeds it on its
                own — the whole thing is deterministic, so the demo plays the same lineage every time.
              </p>
              <p className="text-muted-foreground/70">
                Grown from the 2026 SIGGRAPH work on self-organizing artificial life (Neural Particle
                Automata) — reclaiming the one verb that line under-uses: not watching a lifeform, but
                breeding one by taste.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
