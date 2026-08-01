"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createReefAudio, type ReefAudio } from "./audio";
import {
  FIELD_H,
  FIELD_W,
  SPECIES,
  biomass01,
  makeGarden,
  mulberry32,
  plantSeed,
  stepGarden,
  voiceForBirth,
  type Garden,
} from "./growth";

// ── render tuning ─────────────────────────────────────────────────────────────
const STEP_MS = 55; // one growth step every 55ms — slow, contemplative, no strobe
const RENDER_MS = 33; // ~30fps DOM rebuild
const READOUT_MS = 140; // ~7Hz HUD
const RETICLE_STEP = 26; // keyboard nudge, field units
const TIP_LIFE = 5; // growth steps a node counts as a "fresh tip"
const SEED_LIMIT = 6; // auto-gardener demo seed count

// Crowding → colour: luminous violet (sparse) desaturating to gray (choked).
const BUCKET_STROKE = ["#c4b5fd", "#a78bfa", "#8b5cf6", "#7a6ea0", "#57555f"];
const BUCKET_WIDTH = [1.9, 1.7, 1.5, 1.3, 1.1];
const BUCKET_OPACITY = [0.95, 0.9, 0.85, 0.72, 0.6];

// Deterministic, well-spaced demo seed sites (fractions of the field).
const DEMO_SITES: Array<[number, number]> = [
  [0.24, 0.62],
  [0.72, 0.36],
  [0.5, 0.78],
  [0.82, 0.7],
  [0.34, 0.3],
  [0.62, 0.56],
];

type ControlSource = "self-demo" | "you";

interface Readout {
  biomass: number;
  seeds: number;
  choke: number;
  attractors: number;
  species: number;
  full: boolean;
  source: ControlSource;
}

function healthLabel(choke: number): string {
  if (choke < 0.18) return "luminous";
  if (choke < 0.45) return "crowding";
  if (choke < 0.7) return "choking";
  return "bleached";
}

export default function ReefPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [speciesIdx, setSpeciesIdx] = useState(0);
  const [readout, setReadout] = useState<Readout>({
    biomass: 0,
    seeds: 0,
    choke: 0,
    attractors: 0,
    species: 0,
    full: false,
    source: "self-demo",
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<ReefAudio | null>(null);
  const gardenRef = useRef<Garden>(makeGarden());
  const rngRef = useRef<() => number>(mulberry32(0x4472));
  const speciesRef = useRef(0);
  const humanRef = useRef(false);
  const reticleRef = useRef({ x: FIELD_W * 0.5, y: FIELD_H * 0.5 });
  const autoRef = useRef({ planted: 0, nextAt: 900 });

  const rafRef = useRef<number>(0);
  const startClockRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const growAccRef = useRef<number>(0);
  const lastRenderRef = useRef<number>(0);
  const lastReadoutRef = useRef<number>(0);
  const lastPluckRef = useRef<number>(0);

  // SVG element refs (written straight to the DOM in the frame loop).
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bucketRefs = useRef<Array<SVGPathElement | null>>([]);
  const tipRef = useRef<SVGPathElement | null>(null);
  const attrRef = useRef<SVGPathElement | null>(null);
  const seedHaloRef = useRef<SVGPathElement | null>(null);
  const seedDotRef = useRef<SVGPathElement | null>(null);
  const reticleRefEl = useRef<SVGGElement | null>(null);

  const markHuman = useCallback(() => {
    humanRef.current = true;
  }, []);

  const plantAt = useCallback((x: number, y: number) => {
    const g = gardenRef.current;
    plantSeed(
      g,
      Math.max(6, Math.min(FIELD_W - 6, x)),
      Math.max(6, Math.min(FIELD_H - 6, y)),
      SPECIES[speciesRef.current],
      rngRef.current,
    );
  }, []);

  const resetGarden = useCallback(() => {
    gardenRef.current = makeGarden();
    rngRef.current = mulberry32(0x4472);
    autoRef.current = { planted: SEED_LIMIT, nextAt: Infinity }; // no auto-replant
    humanRef.current = true;
  }, []);

  // ── keyboard: PRIMARY input ─────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const r = reticleRef.current;
      let handled = true;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          r.y = Math.max(6, r.y - RETICLE_STEP);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          r.y = Math.min(FIELD_H - 6, r.y + RETICLE_STEP);
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          r.x = Math.max(6, r.x - RETICLE_STEP);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          r.x = Math.min(FIELD_W - 6, r.x + RETICLE_STEP);
          break;
        case " ":
          plantAt(r.x, r.y);
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5": {
          const idx = Number(e.key) - 1;
          speciesRef.current = idx;
          setSpeciesIdx(idx);
          break;
        }
        case "[": {
          const idx = Math.max(0, speciesRef.current - 1);
          speciesRef.current = idx;
          setSpeciesIdx(idx);
          break;
        }
        case "]": {
          const idx = Math.min(SPECIES.length - 1, speciesRef.current + 1);
          speciesRef.current = idx;
          setSpeciesIdx(idx);
          break;
        }
        case "r":
        case "R":
          resetGarden();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        markHuman();
      }
    },
    [markHuman, plantAt, resetGarden],
  );

  // ── pointer: SECONDARY convenience ─────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * FIELD_W;
      const y = ((e.clientY - rect.top) / rect.height) * FIELD_H;
      reticleRef.current.x = x;
      reticleRef.current.y = y;
      plantAt(x, y);
      markHuman();
    },
    [markHuman, plantAt],
  );

  // ── the frame loop (visual from mount; audio joins on Start) ────────────────
  useEffect(() => {
    startClockRef.current = performance.now();

    const drawGarden = () => {
      const g = gardenRef.current;
      const nodes = g.nodes;
      const buckets: string[][] = [[], [], [], [], []];
      const tips: string[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.parent < 0) continue;
        const p = nodes[n.parent];
        const seg = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${n.x.toFixed(1)} ${n.y.toFixed(1)}`;
        const b = Math.min(4, Math.floor(n.crowd * 5));
        buckets[b].push(seg);
        if (g.step - n.bornStep <= TIP_LIFE) tips.push(seg);
      }
      for (let b = 0; b < 5; b++) {
        bucketRefs.current[b]?.setAttribute("d", buckets[b].join(""));
      }
      tipRef.current?.setAttribute("d", tips.join(""));

      // attractors as faint round-cap dots (shows the space still to colonise)
      const dots: string[] = [];
      for (const a of g.attractors) {
        if (a.dead) continue;
        dots.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}l0.01 0`);
      }
      attrRef.current?.setAttribute("d", dots.join(""));

      // seeds — permanent origins, drawn as haloed dots
      const seeds: string[] = [];
      for (const n of nodes) {
        if (n.parent < 0) seeds.push(`M${n.x.toFixed(1)} ${n.y.toFixed(1)}l0.01 0`);
      }
      const seedD = seeds.join("");
      seedHaloRef.current?.setAttribute("d", seedD);
      seedDotRef.current?.setAttribute("d", seedD);
    };

    const frame = (now: number) => {
      const prev = lastFrameRef.current || now;
      const dt = now - prev;
      lastFrameRef.current = now;
      const g = gardenRef.current;
      const rng = rngRef.current;

      // Auto-gardener: deterministic, well-spaced, calm — until a human acts.
      const sinceStart = now - startClockRef.current;
      if (!humanRef.current) {
        const auto = autoRef.current;
        if (auto.planted < SEED_LIMIT && sinceStart > auto.nextAt) {
          const [fx, fy] = DEMO_SITES[auto.planted];
          const jx = (rng() - 0.5) * 40;
          const jy = (rng() - 0.5) * 40;
          speciesRef.current = auto.planted % 2; // sprig / frond: sparse, consonant
          plantAt(FIELD_W * fx + jx, FIELD_H * fy + jy);
          auto.planted++;
          auto.nextAt += 2600;
        }
      }

      // Growth steps on a fixed cadence (independent of frame rate).
      growAccRef.current += dt;
      let steps = 0;
      while (growAccRef.current >= STEP_MS && steps < 4) {
        growAccRef.current -= STEP_MS;
        steps++;
        const births = stepGarden(g, rng);
        const audio = audioRef.current;
        if (audio && births.length) {
          const gap = 45 + g.chokedness * 80;
          for (const birth of births) {
            if (now - lastPluckRef.current < gap) continue;
            lastPluckRef.current = now;
            const v = voiceForBirth(birth);
            audio.pluck(v.freq, v.detuneCents, v.brightness);
          }
        }
      }

      // Slow beds follow biomass + chokedness every frame (cheap ramps).
      audioRef.current?.setGarden(biomass01(g), g.chokedness);

      // Reticle position (updated even without redraw of the tree).
      const rt = reticleRef.current;
      reticleRefEl.current?.setAttribute(
        "transform",
        `translate(${rt.x.toFixed(1)} ${rt.y.toFixed(1)})`,
      );

      if (now - lastRenderRef.current >= RENDER_MS) {
        lastRenderRef.current = now;
        drawGarden();
      }

      if (now - lastReadoutRef.current >= READOUT_MS) {
        lastReadoutRef.current = now;
        let alive = 0;
        for (const a of g.attractors) if (!a.dead) alive++;
        setReadout({
          biomass: g.nodes.length,
          seeds: g.seedCount,
          choke: g.chokedness,
          attractors: alive,
          species: speciesRef.current,
          full: g.full,
          source: humanRef.current ? "you" : "self-demo",
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [plantAt]);

  // ── keyboard listener ───────────────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  // ── start audio (must be inside the user gesture) ──────────────────────────
  const startAudio = useCallback(async () => {
    try {
      if (!ctxRef.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctor();
        ctxRef.current = ctx;
        audioRef.current = createReefAudio(ctx);
      }
      await ctxRef.current.resume();
      setStarted(true);
      setAudioError(null);
    } catch {
      setAudioError("Could not start audio on this device.");
    }
  }, []);

  // ── full teardown ───────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  const health = healthLabel(readout.choke);
  const healthTone =
    readout.choke < 0.18
      ? "text-primary"
      : readout.choke < 0.45
        ? "text-foreground"
        : "text-destructive";

  return (
    <main className="min-h-screen bg-[#070511] px-4 py-6 font-sans text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <Link
            href="/dream"
            className="font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream lab
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Reef
          </h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            An irreversible living garden you can only{" "}
            <span className="text-foreground">add</span> to — never prune. Plant
            seeds and a branching organism grows from each in real time; every
            birth rings a note. Space your seeds{" "}
            <span className="text-foreground">wisely</span> and the garden stays
            luminous and consonant. Crowd them and the branches choke: the notes
            detune and dull, the colour bleaches to gray, the light dims. You
            live with what you made.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {started ? "Sound live ●" : "Start sound"}
            </button>
            <button
              onClick={resetGarden}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Fresh garden (R)
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          {audioError && (
            <p className="mt-3 font-mono text-sm text-destructive">{audioError}</p>
          )}
        </header>

        {/* status row */}
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-sm">
          <span className="text-muted-foreground">
            garden: <span className={healthTone}>{health}</span>
          </span>
          <span className="text-muted-foreground">
            chokedness:{" "}
            <span className="tabular-nums text-foreground">
              {Math.round(readout.choke * 100)}%
            </span>
          </span>
          <span className="text-muted-foreground">
            biomass:{" "}
            <span className="tabular-nums text-foreground">{readout.biomass}</span>
            {readout.full && <span className="text-destructive"> · full</span>}
          </span>
          <span className="text-muted-foreground">
            seeds:{" "}
            <span className="tabular-nums text-foreground">{readout.seeds}</span>
          </span>
          <span className="text-muted-foreground">
            drive: <span className="text-primary">{readout.source}</span>
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* ── the garden ──────────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-lg border border-border bg-[#050409]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
              className="h-auto w-full touch-none select-none"
              onPointerDown={onPointerDown}
            >
              {/* attractors — the unclaimed space, still to colonise */}
              <path
                ref={attrRef}
                d=""
                fill="none"
                stroke="#a78bfa"
                strokeWidth={2.4}
                strokeLinecap="round"
                opacity={0.22}
              />
              {/* branch buckets, dark→bright, crowded→gray */}
              {BUCKET_STROKE.map((stroke, b) => (
                <path
                  key={b}
                  ref={(el) => {
                    bucketRefs.current[b] = el;
                  }}
                  d=""
                  fill="none"
                  stroke={stroke}
                  strokeWidth={BUCKET_WIDTH[b]}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={BUCKET_OPACITY[b]}
                />
              ))}
              {/* fresh growth tips — the living edge */}
              <path
                ref={tipRef}
                d=""
                fill="none"
                stroke="#ede9fe"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* seeds — permanent origins */}
              <path
                ref={seedHaloRef}
                d=""
                fill="none"
                stroke="#8b5cf6"
                strokeWidth={16}
                strokeLinecap="round"
                opacity={0.28}
              />
              <path
                ref={seedDotRef}
                d=""
                fill="none"
                stroke="#ede9fe"
                strokeWidth={6}
                strokeLinecap="round"
              />
              {/* planting reticle */}
              <g ref={reticleRefEl} transform={`translate(${FIELD_W / 2} ${FIELD_H / 2})`}>
                <circle r={16} fill="none" stroke="#c4b5fd" strokeWidth={1.4} opacity={0.85} />
                <line x1={-24} y1={0} x2={-7} y2={0} stroke="#c4b5fd" strokeWidth={1.4} />
                <line x1={7} y1={0} x2={24} y2={0} stroke="#c4b5fd" strokeWidth={1.4} />
                <line x1={0} y1={-24} x2={0} y2={-7} stroke="#c4b5fd" strokeWidth={1.4} />
                <line x1={0} y1={7} x2={0} y2={24} stroke="#c4b5fd" strokeWidth={1.4} />
              </g>
            </svg>
          </div>

          {/* ── controls / legend ───────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-[#050409] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              keyboard
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">← ↑ → ↓ / WASD</span>{" "}
                move reticle
              </li>
              <li>
                <span className="font-mono text-foreground">Space</span> plant a
                seed
              </li>
              <li>
                <span className="font-mono text-foreground">1–5 / [ ]</span>{" "}
                species
              </li>
              <li>
                <span className="font-mono text-foreground">R</span> fresh garden
              </li>
              <li>tap the field to plant (secondary)</li>
            </ul>
            <div className="mt-4 border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                species
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SPECIES.map((sp, i) => (
                  <button
                    key={sp.label}
                    onClick={() => {
                      speciesRef.current = i;
                      setSpeciesIdx(i);
                      markHuman();
                    }}
                    className={`min-h-[44px] flex-1 rounded-md border px-2 text-xs transition-colors ${
                      i === speciesIdx
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {i + 1} · {sp.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Bigger species scatter denser seed-clouds — greedier, likelier to
                choke themselves.
              </p>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                garden health
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ${
                    readout.choke < 0.45 ? "bg-primary" : "bg-destructive"
                  }`}
                  style={{ width: `${Math.round(readout.choke * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Bright violet = consonant &amp; spacious. Gray = crowded &amp;
                bleached. Nothing here can be removed — only added.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
          Each organism grows by <span className="text-foreground">space
          colonization</span> (Runions et al.): branch tips reach toward nearby
          attractor points and split where the pull divides. A birth&apos;s
          branch angle chooses a just-pentatonic degree and its depth the octave
          — so a sparse garden rings a slowly-evolving chord, while overcrowding
          detunes and dulls every new voice at once.
        </p>
      </div>

      {/* ── design-notes modal ──────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Reef · design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A piece about <span className="text-foreground">restraint and
                consequence</span>, not a pretty visualiser. You can only ever{" "}
                <span className="text-foreground">add</span> to this garden — no
                delete, no undo, no reset except starting a wholly new session.
                Every placement has permanent harmonic consequence.
              </p>
              <p>
                Each seed grows a branching organism by the{" "}
                <span className="text-foreground">Space Colonization
                Algorithm</span> (Runions, Lane &amp; Prusinkiewicz, 2007; and
                Runions et al., leaf-venation, 2005): a local cloud of attractor
                points pulls the nearest branch node; the node steps toward the
                averaged pull and forks where attractors tug it apart; attractors
                inside a kill radius are consumed.
              </p>
              <p>
                <span className="text-foreground">The consequence engine.</span>{" "}
                When a node is born its <em>local density</em> is measured. A
                sparse birth lands clean on a just major-pentatonic degree
                (angle → degree, depth → octave) and rings long and bright. A
                crowded birth is detuned by up to ±58¢, dulled and shortened; the
                garden&apos;s smoothed <em>chokedness</em> rises, closing a master
                lowpass, opening a beating detuned drone, and raising an airy
                bleach of noise. Greed is <em>heard</em>.
              </p>
              <p>
                <span className="text-foreground">Long-form with memory.</span>{" "}
                Nodes are never deleted, so the garden accumulates over minutes —
                minute five never resembles minute one. On load a deterministic{" "}
                <span className="font-mono text-foreground">mulberry32(0x4472)</span>{" "}
                auto-gardener plants a few well-spaced, consonant seeds hands-free;
                your first keypress takes control.
              </p>
              <p>
                <span className="text-foreground">Honest novelty.</span> Space
                colonization already appears in the lab (e.g. 3080-mycelium,
                1050-mycelial-grow, 322-kids-voice-garden, 1490-slow-cathedral).
                What is new here is the <em>irreversibility + crowding-penalty</em>{" "}
                coupling — a garden you can only add to, where greed deterministically
                bleaches both image and sound.
              </p>
              <p>
                Lineage: Andy Lomas&apos; developmental morphogenetic art and
                Nervous System (Jessica Rosenkrantz); research anchor —{" "}
                <em>Artificial morphogenesis of curved surface structures inspired
                by differential growth in biology</em> (J. R. Soc. Interface 23(239),
                2026). Full write-up in{" "}
                <span className="font-mono text-foreground">README.md</span>.
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
    </main>
  );
}
