"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ChoirAudio } from "./audio";
import { breathPhase, ChoirSync, type RosterSnapshot } from "./sync";

// ---- the just-intonation chord as a 5-limit harmonic lattice ---------------
// Each voice is one scale degree; claim priority = array order, so the first
// lonely tab is the ROOT and the chord fills outward from it.
type Voice = {
  num: number;
  den: number;
  label: string;
  role: string;
  x: number;
  y: number;
};

const VOICES: Voice[] = [
  { num: 1, den: 1, label: "1/1", role: "root", x: 400, y: 440 },
  { num: 3, den: 2, label: "3/2", role: "fifth", x: 600, y: 440 },
  { num: 5, den: 4, label: "5/4", role: "major third", x: 400, y: 180 },
  { num: 15, den: 8, label: "15/8", role: "major seventh", x: 600, y: 180 },
  { num: 5, den: 3, label: "5/3", role: "major sixth", x: 200, y: 180 },
  { num: 9, den: 8, label: "9/8", role: "ninth", x: 800, y: 440 },
];

const RATIOS = VOICES.map((v) => v.num / v.den);

// Lattice edges = pure intervals between adjacent degrees. Horizontal steps are
// perfect fifths (3/2); vertical steps are major thirds (5/4).
type Edge = { a: number; b: number; ratio: string };
const EDGES: Edge[] = [
  { a: 0, b: 1, ratio: "3/2" }, // 1/1 - 3/2
  { a: 1, b: 5, ratio: "3/2" }, // 3/2 - 9/8
  { a: 2, b: 3, ratio: "3/2" }, // 5/4 - 15/8
  { a: 4, b: 2, ratio: "3/2" }, // 5/3 - 5/4
  { a: 0, b: 2, ratio: "5/4" }, // 1/1 - 5/4
  { a: 1, b: 3, ratio: "5/4" }, // 3/2 - 15/8
];

const TONIC = 146.83; // D3 — a calm, low drone tonic (Hz)
const BREATH_HZ = 0.075; // shared breathing period ~13s
const VBW = 1000;
const VBH = 620;

// Deterministic PRNG for phantom-companion timing — fixed seed, never
// Math.random / Date.now at module load.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type VoiceStatus = "you" | "live" | "phantom" | "missing";

export default function ChoirOfStrangersPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myVoice, setMyVoice] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [statuses, setStatuses] = useState<VoiceStatus[]>(() =>
    VOICES.map((_, i) => (i === 0 ? "you" : "missing")),
  );

  // ---- refs: the audio/animation path never touches React state ------------
  const audioRef = useRef<ChoirAudio | null>(null);
  const syncRef = useRef<ChoirSync | null>(null);
  const myVoiceRef = useRef(0);
  const liveVoicesRef = useRef<Set<number>>(new Set());
  const startedRef = useRef(false);
  const audioStartMs = useRef(0);
  const levelRef = useRef<number[]>(VOICES.map(() => 0)); // smoothed [0,1]
  const reducedRef = useRef(false);

  // Deterministic phantom fade-in schedule (delay + fade per voice, seconds).
  const phantomPlan = useRef<Array<{ delay: number; fade: number }>>(
    (() => {
      const rand = mulberry32(0x1832abcd);
      return VOICES.map(() => ({
        delay: 1.5 + rand() * 10.5,
        fade: 2.4 + rand() * 2.2,
      }));
    })(),
  );

  // SVG element refs for imperative animation.
  const glowEls = useRef<Array<SVGCircleElement | null>>([]);
  const coreEls = useRef<Array<SVGCircleElement | null>>([]);
  const ringEls = useRef<Array<SVGCircleElement | null>>([]);
  const labelEls = useRef<Array<SVGTextElement | null>>([]);
  const roleEls = useRef<Array<SVGTextElement | null>>([]);
  const edgeLineEls = useRef<Array<SVGLineElement | null>>([]);
  const edgeLabelEls = useRef<Array<SVGTextElement | null>>([]);

  // The activation TARGET for a voice this frame (visual + audio share it).
  const targetFor = (i: number, elapsed: number): number => {
    if (i === myVoiceRef.current) return 1;
    if (liveVoicesRef.current.has(i)) return 1;
    if (!startedRef.current) return 0;
    // absent -> a deterministic phantom companion fades in
    const plan = phantomPlan.current[i];
    const p = (elapsed - plan.delay) / plan.fade;
    return Math.max(0, Math.min(0.72, p * 0.72));
  };

  // ---- mount: start presence sync + the animation loop ---------------------
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const sync = new ChoirSync(TONIC, (snap: RosterSnapshot) => {
      myVoiceRef.current = snap.myVoice;
      const held = new Set<number>();
      for (const p of snap.peers) held.add(p.voiceIndex);
      held.delete(snap.myVoice);
      liveVoicesRef.current = held;
      setMyVoice(snap.myVoice);
      setLiveCount(held.size);
    });
    syncRef.current = sync;
    sync.start();

    // Slow interval refreshes the legend statuses (cheap, ~3/sec).
    const statusTimer = window.setInterval(() => {
      const elapsed = startedRef.current
        ? (Date.now() - audioStartMs.current) / 1000
        : 0;
      const next: VoiceStatus[] = VOICES.map((_, i) => {
        if (i === myVoiceRef.current) return "you";
        if (liveVoicesRef.current.has(i)) return "live";
        if (startedRef.current && targetFor(i, elapsed) > 0.06) return "phantom";
        return "missing";
      });
      setStatuses(next);
    }, 320);

    let raf = 0;
    const depth = reducedRef.current ? 0.16 : 0.34;
    const loop = () => {
      const elapsed = startedRef.current
        ? (Date.now() - audioStartMs.current) / 1000
        : 0;
      // Shared breath — identical in every tab because it reads the wall clock.
      const ph = breathPhase(BREATH_HZ);
      const breath = 1 - depth + depth * (0.5 + 0.5 * Math.sin(ph * 2 * Math.PI));

      const levels = levelRef.current;
      const audioLevels: number[] = [];
      for (let i = 0; i < VOICES.length; i++) {
        const target = targetFor(i, elapsed);
        levels[i] += (target - levels[i]) * 0.07;
        const lvl = levels[i];
        const isMine = i === myVoiceRef.current;
        const isLive = liveVoicesRef.current.has(i) && !isMine;

        // Audio: this tab voices only its own + phantom companions. Live peers
        // are produced by THEIR tabs, so they stay silent here.
        const audio = isLive ? 0 : lvl * breath * (isMine ? 1 : 0.85);
        audioLevels.push(audio);

        // Visual: everyone present glows and breathes.
        const glowEl = glowEls.current[i];
        const coreEl = coreEls.current[i];
        const ringEl = ringEls.current[i];
        const labelEl = labelEls.current[i];
        const roleEl = roleEls.current[i];
        const vis = lvl * breath;
        if (glowEl) {
          glowEl.setAttribute("r", (34 + vis * 42).toFixed(1));
          glowEl.setAttribute("fill-opacity", (0.05 + vis * 0.42).toFixed(3));
        }
        if (coreEl) {
          coreEl.setAttribute("r", (11 + vis * 8).toFixed(1));
          coreEl.setAttribute("fill-opacity", (0.12 + vis * 0.85).toFixed(3));
        }
        if (ringEl) {
          // the "you" ring is only visible on this tab's own voice
          ringEl.setAttribute(
            "stroke-opacity",
            isMine ? (0.35 + vis * 0.5).toFixed(3) : "0",
          );
        }
        if (labelEl)
          labelEl.setAttribute("fill-opacity", (0.32 + vis * 0.66).toFixed(3));
        if (roleEl)
          roleEl.setAttribute("fill-opacity", (0.14 + vis * 0.5).toFixed(3));
      }

      // Edges: bright only when BOTH endpoints are present.
      for (let e = 0; e < EDGES.length; e++) {
        const { a, b } = EDGES[e];
        const strength = Math.min(levels[a], levels[b]) * breath;
        const lineEl = edgeLineEls.current[e];
        const labEl = edgeLabelEls.current[e];
        if (lineEl) {
          lineEl.setAttribute("stroke-opacity", (0.06 + strength * 0.6).toFixed(3));
          lineEl.setAttribute("stroke-width", (1 + strength * 2.4).toFixed(2));
        }
        if (labEl)
          labEl.setAttribute("fill-opacity", (0.05 + strength * 0.7).toFixed(3));
      }

      if (audioRef.current) audioRef.current.setLevels(audioLevels);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      window.clearInterval(statusTimer);
      window.cancelAnimationFrame(raf);
      syncRef.current?.stop();
      syncRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const begin = async () => {
    if (audioRef.current) return;
    try {
      const audio = new ChoirAudio(reducedRef.current);
      audioRef.current = audio;
      await audio.start(TONIC, RATIOS);
      audioStartMs.current = Date.now();
      startedRef.current = true;
      setStarted(true);
      setError(null);
    } catch {
      audioRef.current = null;
      setError("Audio could not start in this browser.");
    }
  };

  const openVoice = () => {
    window.open(window.location.href, "_blank", "noopener");
  };

  const alone = liveCount === 0;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ---- the harmonic lattice (built once; the rAF loop mutates it) ---- */}
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <filter id="choir-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <rect x="0" y="0" width={VBW} height={VBH} fill="hsl(268 34% 6%)" />

        {/* interval edges */}
        <g>
          {EDGES.map((e, i) => {
            const va = VOICES[e.a];
            const vb = VOICES[e.b];
            const mx = (va.x + vb.x) / 2;
            const my = (va.y + vb.y) / 2;
            return (
              <g key={`e${i}`}>
                <line
                  ref={(el) => {
                    edgeLineEls.current[i] = el;
                  }}
                  x1={va.x}
                  y1={va.y}
                  x2={vb.x}
                  y2={vb.y}
                  stroke="hsl(268 80% 72%)"
                  strokeOpacity={0.06}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
                <text
                  ref={(el) => {
                    edgeLabelEls.current[i] = el;
                  }}
                  x={mx}
                  y={my - 6}
                  textAnchor="middle"
                  fontSize="15"
                  fontFamily="ui-monospace, monospace"
                  fill="hsl(270 40% 88%)"
                  fillOpacity={0.05}
                >
                  {e.ratio}
                </text>
              </g>
            );
          })}
        </g>

        {/* voice nodes */}
        <g>
          {VOICES.map((v, i) => (
            <g key={`n${i}`}>
              <circle
                ref={(el) => {
                  glowEls.current[i] = el;
                }}
                cx={v.x}
                cy={v.y}
                r={34}
                fill="hsl(272 92% 66%)"
                fillOpacity={0.05}
                filter="url(#choir-soft)"
              />
              {/* faint ghost outline — the voice that COULD be here */}
              <circle
                cx={v.x}
                cy={v.y}
                r={19}
                fill="none"
                stroke="hsl(268 24% 46%)"
                strokeOpacity={0.5}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              {/* "you" ring */}
              <circle
                ref={(el) => {
                  ringEls.current[i] = el;
                }}
                cx={v.x}
                cy={v.y}
                r={26}
                fill="none"
                stroke="hsl(288 100% 82%)"
                strokeOpacity={0}
                strokeWidth={1.6}
              />
              <circle
                ref={(el) => {
                  coreEls.current[i] = el;
                }}
                cx={v.x}
                cy={v.y}
                r={11}
                fill="hsl(278 96% 80%)"
                fillOpacity={0.12}
              />
              <text
                ref={(el) => {
                  labelEls.current[i] = el;
                }}
                x={v.x}
                y={v.y + 5}
                textAnchor="middle"
                fontSize="16"
                fontFamily="ui-monospace, monospace"
                fill="hsl(270 40% 94%)"
                fillOpacity={0.32}
              >
                {v.label}
              </text>
              <text
                ref={(el) => {
                  roleEls.current[i] = el;
                }}
                x={v.x}
                y={v.y + 40}
                textAnchor="middle"
                fontSize="12"
                fontFamily="ui-monospace, monospace"
                fill="hsl(270 24% 80%)"
                fillOpacity={0.14}
              >
                {v.role}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* legibility wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/85 via-background/10 to-background/85" />

      {/* ---- header / controls ---- */}
      <div className="relative z-10 flex flex-col gap-3 p-6 sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Just intonation · shared presence
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Choir of Strangers
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          A pure chord that no one can build alone &mdash; each open browser tab
          holds one voice, and the harmony physically cannot exist until several
          people join.
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Take a voice
            </button>
          ) : (
            <button
              type="button"
              onClick={openVoice}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open another voice
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

        {/* presence status line */}
        <div className="mt-1 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em]">
          <span
            className={
              liveCount > 0
                ? "inline-block h-2 w-2 rounded-full bg-primary"
                : "inline-block h-2 w-2 rounded-full bg-muted-foreground"
            }
          />
          <span className={liveCount > 0 ? "text-primary" : "text-muted-foreground"}>
            {liveCount > 0
              ? `You + ${liveCount} live ${liveCount === 1 ? "voice" : "voices"}`
              : "You alone"}
          </span>
          <span className="text-muted-foreground/70">
            holding {VOICES[myVoice]?.label} · {VOICES[myVoice]?.role}
          </span>
        </div>

        {started && alone && (
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            You are the only real voice. Phantom companions (a seeded, synthetic
            choir) are fading in so you can hear the chord assemble &mdash; open
            a real tab and a phantom is replaced by a live person.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* ---- voice roster legend ---- */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-1.5 font-mono text-xs sm:left-10">
        {VOICES.map((v, i) => {
          const s = statuses[i];
          const tone =
            s === "you"
              ? "text-primary"
              : s === "live"
                ? "text-foreground"
                : s === "phantom"
                  ? "text-muted-foreground"
                  : "text-muted-foreground/45";
          const tag =
            s === "you"
              ? "you"
              : s === "live"
                ? "live"
                : s === "phantom"
                  ? "phantom"
                  : "missing";
          return (
            <div key={`r${i}`} className={`flex items-center gap-2 ${tone}`}>
              <span className="w-9 tabular-nums">{v.label}</span>
              <span className="uppercase tracking-[0.14em]">{tag}</span>
            </div>
          );
        })}
      </div>

      {/* ---- design notes overlay ---- */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              A chord you cannot finish alone
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Six voices form a five-limit just-intonation lattice around the
                tonic D: 1/1, 3/2, 5/4, 15/8, 5/3 and 9/8. Every browser tab
                claims one degree; horizontal edges are pure fifths (3/2),
                vertical edges are pure major thirds (5/4). With one tab you hear
                a lonely tone. As tabs open, the chord fills and the beatless
                fifths and thirds lock into place.
              </p>
              <p>
                Tabs talk over a BroadcastChannel, but &mdash; following the 2026
                web-collaborative-music insight &mdash; they transmit only
                CONTROL events: which voice each tab holds, the shared tonic, and
                a slow LFO phase. No audio ever crosses the channel. Every tab
                synthesizes its own voice locally, and the whole choir breathes
                together because the amplitude LFO reads the shared wall clock.
              </p>
              <p>
                Alone, a deterministic phantom choir (seeded PRNG, fixed seed)
                fades in over ~15 seconds so a single listener still hears the
                harmony assemble and watches the lattice brighten. Open a real
                tab and its live voice replaces the phantom in that slot.
              </p>
              <p className="text-muted-foreground/70">
                After La Monte Young &amp; Marian Zazeela&apos;s <em>Dream
                House</em> &mdash; a permanent sustained just-intonation
                environment. Control-not-audio model per &ldquo;Real-Time
                Collaborative Music Creation on the Web: exploiting Web Audio
                Modules&rdquo; (IEEE, 2026) and Sequencer.party&apos;s CRDT
                control-event architecture.
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

      <PrototypeNav slugs={["1832-choir-of-strangers"]} />
    </main>
  );
}
