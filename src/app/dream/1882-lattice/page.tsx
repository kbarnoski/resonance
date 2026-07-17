"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  buildLattice,
  keyIndex,
  midiToNodeIndex,
  type LatticeNode,
} from "./lattice";
import { BASE_FREQ, LatticeSynth } from "./audio";

// ── paper-and-ink palette (art only; chrome uses semantic tokens) ────────────
const PAPER = "#f2e8d5"; // aged manuscript page
const PAPER_NODE = "#faf3e2"; // node face, a touch lighter
const INK = "#2b2620"; // stroke + key labels
const INK_SOFT = "#8a7d68"; // faint edges / ratios at rest
const ACCENT = "#c65b2b"; // the one warm accent: sounding nodes

// The app root is forced `.dark` (near-white --foreground). This is a light
// cream page, so re-assert the light-theme token values on our container: that
// keeps semantic chrome (text-foreground / text-muted-foreground / borders /
// the primary button) dark-and-readable on paper instead of white-on-cream.
const PAGE_STYLE = {
  backgroundColor: PAPER,
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.16 0.01 60)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.44 0.02 60)",
  "--border": "oklch(0.84 0.01 60)",
  "--accent": "oklch(0.95 0.01 60)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.16 0.01 60)",
  "--secondary": "oklch(0.97 0 0)",
  "--secondary-foreground": "oklch(0.205 0 0)",
  "--primary": "oklch(0.55 0.22 285)",
  "--primary-foreground": "oklch(0.985 0 0)",
  "--destructive": "oklch(0.55 0.24 27)",
  "--input": "oklch(0.922 0 0)",
  "--ring": "oklch(0.55 0.22 285)",
} as CSSProperties;

// ── pixel layout ─────────────────────────────────────────────────────────────
const UNIT_X = 82;
const UNIT_Y = 96;
const MARGIN = 46;
const R_BASE = 17;

interface Placed extends LatticeNode {
  px: number;
  py: number;
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "fifth" | "third";
}

function buildLayout() {
  const nodes = buildLattice();
  let minGx = Infinity;
  let maxGx = -Infinity;
  let minGy = Infinity;
  let maxGy = -Infinity;
  for (const n of nodes) {
    minGx = Math.min(minGx, n.gx);
    maxGx = Math.max(maxGx, n.gx);
    minGy = Math.min(minGy, n.gy);
    maxGy = Math.max(maxGy, n.gy);
  }
  const placed: Placed[] = nodes.map((n) => ({
    ...n,
    px: (n.gx - minGx) * UNIT_X + MARGIN,
    py: (n.gy - minGy) * UNIT_Y + MARGIN,
  }));
  const width = (maxGx - minGx) * UNIT_X + 2 * MARGIN;
  const height = (maxGy - minGy) * UNIT_Y + 2 * MARGIN;

  // edges: pure fifths (Δa=1,Δb=0) horizontal, pure thirds (Δa=0,Δb=1) vertical
  const byKey = new Map<string, Placed>();
  for (const p of placed) byKey.set(`${p.a},${p.b}`, p);
  const edges: Edge[] = [];
  for (const p of placed) {
    const fifth = byKey.get(`${p.a + 1},${p.b}`);
    if (fifth) {
      edges.push({
        x1: p.px,
        y1: p.py,
        x2: fifth.px,
        y2: fifth.py,
        kind: "fifth",
      });
    }
    const third = byKey.get(`${p.a},${p.b + 1}`);
    if (third) {
      edges.push({
        x1: p.px,
        y1: p.py,
        x2: third.px,
        y2: third.py,
        kind: "third",
      });
    }
  }
  return { placed, edges, width, height };
}

export default function LatticePage() {
  const { placed, edges, width, height } = useMemo(buildLayout, []);
  const keyMap = useMemo(() => keyIndex(placed), [placed]);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [midiStatus, setMidiStatus] = useState<"none" | "on">("none");
  const [showNotes, setShowNotes] = useState(false);
  const [attractOn, setAttractOn] = useState(false);
  const [muted, setMuted] = useState(false);

  // ── refs that live across frames (never trigger re-render) ─────────────────
  const synthRef = useRef<LatticeSynth | null>(null);
  const reducedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const interactedRef = useRef(false);

  // per-node visual level, eased toward the target each frame
  const levelRef = useRef<Float32Array>(new Float32Array(placed.length));
  // ref-count of holds per node (keyboard + pointer + midi can overlap)
  const holdRef = useRef<Map<number, number>>(new Map());
  // attract walk state
  const attractRef = useRef({ idx: 0, t: 0, on: false });

  // DOM refs for mutation
  const glowRefs = useRef<(SVGCircleElement | null)[]>([]);
  const accentRefs = useRef<(SVGCircleElement | null)[]>([]);
  const ratioRefs = useRef<(SVGTextElement | null)[]>([]);

  const heldKeysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<Map<number, number>>(new Map());
  const midiAccessRef = useRef<{
    inputs: { forEach: (cb: (i: unknown) => void) => void };
  } | null>(null);

  // ── press / release a node (ref-counted) ──────────────────────────────────
  const pressNode = useCallback(
    (i: number) => {
      if (i < 0 || i >= placed.length) return;
      interactedRef.current = true;
      if (attractRef.current.on) {
        attractRef.current.on = false;
        setAttractOn(false);
      }
      const counts = holdRef.current;
      const c = (counts.get(i) ?? 0) + 1;
      counts.set(i, c);
      if (c === 1) {
        const n = placed[i];
        synthRef.current?.noteOn(i, BASE_FREQ * n.ratio);
      }
    },
    [placed],
  );

  const releaseNode = useCallback((i: number) => {
    const counts = holdRef.current;
    const c = (counts.get(i) ?? 0) - 1;
    if (c <= 0) {
      counts.delete(i);
      synthRef.current?.noteOff(i);
    } else {
      counts.set(i, c);
    }
  }, []);

  // ── animation frame: ease levels, mutate SVG attributes ────────────────────
  const runFrame = useCallback(
    (now: number) => {
      const levels = levelRef.current;
      const counts = holdRef.current;
      const att = attractRef.current;

      // advance the attract walk (visual only, slow, never autonomous music)
      let attIdx = -1;
      let attAmt = 0;
      if (att.on && !reducedRef.current) {
        if (att.t === 0) att.t = now;
        const STEP = 3600; // ms per node — a slow drift, well under 0.1 Hz
        const phase = (now - att.t) / STEP;
        att.idx = Math.floor(phase) % placed.length;
        const frac = phase - Math.floor(phase);
        // slow triangular fade in/out, no strobe
        attAmt = 0.42 * Math.sin(Math.PI * frac) ** 2;
        attIdx = att.idx;
      }

      for (let i = 0; i < placed.length; i++) {
        const target = (counts.get(i) ?? 0) > 0 ? 1 : 0;
        const cur = levels[i];
        // asymmetric easing: quick to light, slow to fade (mirrors the sound)
        const k = target > cur ? 0.35 : 0.06;
        let v = cur + (target - cur) * k;
        if (i === attIdx) v = Math.max(v, attAmt);
        levels[i] = v;

        const glow = glowRefs.current[i];
        const accent = accentRefs.current[i];
        const ratio = ratioRefs.current[i];
        if (accent) {
          accent.setAttribute("opacity", (v * 0.92).toFixed(3));
          accent.setAttribute("r", (R_BASE + v * 7).toFixed(2));
        }
        if (glow) {
          glow.setAttribute("opacity", (v * 0.22).toFixed(3));
          glow.setAttribute("r", (R_BASE + v * 26).toFixed(2));
        }
        if (ratio) {
          ratio.setAttribute("opacity", (0.32 + v * 0.68).toFixed(3));
        }
      }
      rafRef.current = requestAnimationFrame(runFrame);
    },
    [placed],
  );

  // ── keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;

    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!keyMap.has(k)) return;
      e.preventDefault();
      if (heldKeysRef.current.has(k)) return; // ignore auto-repeat
      heldKeysRef.current.add(k);
      pressNode(keyMap.get(k)!);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!keyMap.has(k)) return;
      if (!heldKeysRef.current.has(k)) return;
      heldKeysRef.current.delete(k);
      releaseNode(keyMap.get(k)!);
    };
    // release everything if the tab loses focus (avoid stuck notes)
    const onBlur = () => {
      for (const k of heldKeysRef.current) {
        const i = keyMap.get(k);
        if (i !== undefined) releaseNode(i);
      }
      heldKeysRef.current.clear();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [started, keyMap, pressNode, releaseNode]);

  // ── pointer / touch input (global up so notes never stick) ────────────────
  useEffect(() => {
    if (!started) return;
    const onUp = (e: PointerEvent) => {
      const map = pointerRef.current;
      const i = map.get(e.pointerId);
      if (i !== undefined) {
        releaseNode(i);
        map.delete(e.pointerId);
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [started, releaseNode]);

  // ── Web MIDI (feature-detected, silently skipped if unavailable) ──────────
  useEffect(() => {
    if (!started) return;
    const nav = navigator as unknown as {
      requestMIDIAccess?: () => Promise<{
        inputs: { forEach: (cb: (i: unknown) => void) => void };
      }>;
    };
    if (typeof nav.requestMIDIAccess !== "function") return;

    let cancelled = false;
    const onMessage = (ev: unknown) => {
      const data = (ev as { data?: Uint8Array }).data;
      if (!data || data.length < 3) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const vel = data[2];
      const idx = midiToNodeIndex(note, placed);
      if (idx < 0) return;
      if (status === 0x90 && vel > 0) pressNode(idx);
      else if (status === 0x80 || (status === 0x90 && vel === 0))
        releaseNode(idx);
    };

    nav
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return;
        midiAccessRef.current = access;
        access.inputs.forEach((input) => {
          (input as { onmidimessage: (e: unknown) => void }).onmidimessage =
            onMessage;
        });
        setMidiStatus("on");
      })
      .catch(() => {
        /* no MIDI permission — keyboard still works */
      });

    return () => {
      cancelled = true;
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((input) => {
          (input as { onmidimessage: null }).onmidimessage = null;
        });
      }
      midiAccessRef.current = null;
    };
  }, [started, placed, pressNode, releaseNode]);

  // ── reduced motion ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── the render/animation loop lives for the whole page, after start ───────
  useEffect(() => {
    if (!started) return;
    rafRef.current = requestAnimationFrame(runFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [started, runFrame]);

  // ── teardown of the audio graph on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // ── Begin: create the AudioContext on the user gesture ────────────────────
  const handleBegin = useCallback(() => {
    if (started) return;
    try {
      const synth = new LatticeSynth();
      synth.resume();
      synth.startDrone();
      synthRef.current = synth;
      setStarted(true);
      // start the attract pulse only if the visitor hasn't already played
      if (!reducedRef.current && !interactedRef.current) {
        attractRef.current = { idx: 0, t: 0, on: true };
        setAttractOn(true);
      }
    } catch {
      setAudioError(true);
    }
  }, [started]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      synthRef.current?.setMaster(next ? 0 : 0.18);
      return next;
    });
  }, []);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <main
      className="relative min-h-screen w-full overflow-x-hidden"
      style={PAGE_STYLE}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8 sm:px-8">
        {/* header / chrome */}
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            1882 · just-intonation lattice
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                The Lattice
              </h1>
              <p className="mt-2 text-base text-muted-foreground">
                Play Resonance&rsquo;s harmony as a living just-intonation
                lattice: every node is an exact small-integer frequency ratio,
                and consonance you can hear is closeness you can see.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="shrink-0 text-sm font-medium text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>

          {/* controls row */}
          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={handleBegin}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Begin / play
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            )}

            {started && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                sound on
                {midiStatus === "on" ? " · midi connected" : ""}
                {attractOn ? " · attract pulse (idle)" : ""}
              </span>
            )}
          </div>

          {audioError && (
            <p className="text-base text-destructive">
              Web Audio isn&rsquo;t available in this browser, so the lattice
              can&rsquo;t sound. The map below still shows the just ratios.
            </p>
          )}

          {/* legend */}
          <p className="text-base text-muted-foreground">
            <span className="text-foreground">Keyboard:</span> the home row is
            near the tonic <span className="font-mono">1/1</span>. Step{" "}
            <span className="text-foreground">right</span> for a pure fifth{" "}
            <span className="font-mono">3/2</span>, step{" "}
            <span className="text-foreground">up a row</span> for a pure major
            third <span className="font-mono">5/4</span>. Hold several keys to
            ring a beatless just chord. A MIDI keyboard, or tapping the nodes,
            works too.
          </p>
        </header>

        {/* the lattice — SVG built once, mutated per frame via refs */}
        <div
          className="w-full overflow-x-auto rounded-lg"
          style={{ border: `1px solid ${INK_SOFT}55` }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            role="img"
            aria-label="Just-intonation harmonic lattice. Horizontal steps are pure perfect fifths; vertical steps are pure major thirds."
            style={{ display: "block", background: PAPER, touchAction: "none" }}
          >
            {/* edges: fifth (solid) + third (dashed) */}
            <g>
              {edges.map((e, i) => (
                <line
                  key={i}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={INK_SOFT}
                  strokeOpacity={e.kind === "fifth" ? 0.5 : 0.38}
                  strokeWidth={e.kind === "fifth" ? 1.4 : 1.1}
                  strokeDasharray={e.kind === "third" ? "3 4" : undefined}
                />
              ))}
            </g>

            {/* nodes */}
            <g>
              {placed.map((n, i) => {
                const isTonic = n.a === 0 && n.b === 0;
                return (
                  <g
                    key={i}
                    onPointerDown={(ev) => {
                      ev.preventDefault();
                      pointerRef.current.set(ev.pointerId, i);
                      pressNode(i);
                    }}
                    style={{ cursor: started ? "pointer" : "default" }}
                  >
                    {/* soft glow (behind) */}
                    <circle
                      ref={(el) => {
                        glowRefs.current[i] = el;
                      }}
                      cx={n.px}
                      cy={n.py}
                      r={R_BASE}
                      fill={ACCENT}
                      opacity={0}
                    />
                    {/* base face */}
                    <circle
                      cx={n.px}
                      cy={n.py}
                      r={R_BASE}
                      fill={PAPER_NODE}
                      stroke={INK}
                      strokeWidth={isTonic ? 2.4 : 1.3}
                    />
                    {/* accent (front, opacity driven by level) */}
                    <circle
                      ref={(el) => {
                        accentRefs.current[i] = el;
                      }}
                      cx={n.px}
                      cy={n.py}
                      r={R_BASE}
                      fill={ACCENT}
                      opacity={0}
                      pointerEvents="none"
                    />
                    {/* ratio label */}
                    <text
                      ref={(el) => {
                        ratioRefs.current[i] = el;
                      }}
                      x={n.px}
                      y={n.py + 3.5}
                      textAnchor="middle"
                      fontSize={n.den > 9 || n.num > 9 ? 9.5 : 11}
                      fontFamily="var(--font-geist-mono), monospace"
                      fill={INK}
                      opacity={0.32}
                      pointerEvents="none"
                    >
                      {n.label}
                    </text>
                    {/* key cap label, above the node */}
                    <text
                      x={n.px}
                      y={n.py - R_BASE - 6}
                      textAnchor="middle"
                      fontSize={9}
                      fontFamily="var(--font-geist-mono), monospace"
                      fill={INK_SOFT}
                      pointerEvents="none"
                    >
                      {n.key === " " ? "" : n.key.toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <p className="text-sm text-muted-foreground">
          Solid links are pure perfect fifths (&times;3/2); dashed links are
          pure major thirds (&times;5/4). The heavy-ringed node is the tonic{" "}
          <span className="font-mono">1/1</span>. Adjacency is consonance.
        </p>
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-lg border border-border p-6 shadow-xl sm:p-8"
            style={{ backgroundColor: PAPER }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-4 text-base text-foreground">
              <p>
                <span className="font-semibold">The question.</span> What if you
                could <em>play</em> Resonance&rsquo;s harmony as a living
                just-intonation lattice &mdash; every note an exact small-integer
                frequency ratio, and consonance is visible as geometric
                closeness?
              </p>
              <p>
                <span className="font-semibold">The math.</span> Each node is a
                frequency <span className="font-mono">base &times; 3^a &times; 5^b</span>{" "}
                folded into one octave, kept as an exact integer fraction so a
                fifth is truly <span className="font-mono">3/2</span> and a major
                third truly <span className="font-mono">5/4</span> &mdash; no
                12-tone-equal-temperament rounding, no pentatonic
                &ldquo;no-wrong-notes&rdquo; scale. The coordinates{" "}
                <em>are</em> the prime exponents, so neighbours are the most
                consonant intervals and distant nodes are complex and tense. Held
                voices are tuned to those exact frequencies, so pure fifths and
                thirds beat-free while wider jumps thicken.
              </p>
              <p>
                <span className="font-semibold">Lineage.</span> This is an
                Euler&ndash;Fokker / Tonnetz lattice in the tradition of Leonhard
                Euler&rsquo;s <em>Tonnetz</em>, Harry Partch&rsquo;s{" "}
                <em>Tonality Diamond</em>, and Erv Wilson&rsquo;s pitch lattices.
                It is a played instrument rather than a reference chart: distinct
                from the 2026 web 15-limit tonality diamond (Zenodo 6772144) and
                from the <span className="font-mono">tune.js</span> JI library,
                which are catalogues and toolkits, not a keyboard-mapped Tonnetz
                you perform.
              </p>
              <p>
                <span className="font-semibold">Play it.</span> The computer
                keyboard is a 2-D patch of the lattice: each physical row runs
                along the fifths axis, each row up adds a major third. Hold keys
                for chords. A real MIDI keyboard is picked up automatically when
                the browser allows it, and the nodes are tappable.
              </p>
              <p>
                <span className="font-semibold">Safety &amp; honesty.</span> No
                strobe or flicker; the idle &ldquo;attract&rdquo; pulse drifts
                one node at a time far below 0.1 Hz and stops the instant you
                play, and it is damped entirely under{" "}
                <span className="font-mono">prefers-reduced-motion</span>. Peak
                brightness stays on warm paper, never pure white. Limitations:
                the MIDI mapping approximates a few chromatic pitch classes to
                the nearest node in this finite patch; the patch is a window on an
                infinite lattice (no comma-pump wrap-around); and the timbre is a
                simple three-partial voice, not a physical model.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1882-lattice"]} />
    </main>
  );
}
