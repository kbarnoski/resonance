"use client";

// ════════════════════════════════════════════════════════════════════════════
// Goad (2578) — "What if you traded fours with an AI improviser that PLANS
// several exchanges ahead — an adversary whose goal is to BANK tension against
// you, forcing you to resolve what it leaves unresolved, using dissonance as a
// weapon rather than trying to sound nice?"
//
// You and an AI alternate 4-bar phrases over a ringing C-major drone. Every
// event carries a continuous TENSION scalar (Sethares/Plomp–Levelt roughness +
// voice-leading leaps + tendency-tone expectation). On its turn the AI runs a
// BEAM SEARCH over its own next phrase and picks the one that hands you the
// biggest cliff — scored against a model of your best resolution, so it plans
// past its phrase into your reply. Watch the tension landscape: magenta crests
// are the cliffs it banked, violet valleys are resolution.
//
// Determinism: mulberry32(0x2578), no Math.random / Date.now. The auto-demo
// self-plays a full dialogue with zero input (visual-only until a gesture
// unlocks audio) and every "new dialogue" replays exactly.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mixSeed } from "./rng";
import {
  SLOTS,
  bankedTension,
  noteName,
  phraseTension,
  type Owner,
  type Phrase,
} from "./tension";
import { planPhrase, runSyntheticHuman, seedOpeningPitch } from "./planner";
import { GoadSynth } from "./synth";
import { TensionGL, type LandscapeView } from "./landscape-gl";
import { VIOLET, MAGENTA, NEUTRAL, INDIGO } from "../_shared/palette";

const SEED0 = 0x2578;
const MAX_PHRASES = 6; // 3 human + 3 AI exchanges
const BPM = 140;
const WINDOW_PLAY = 22; // visible samples while the playhead sweeps

// Keyboard → MIDI (one chromatic octave, piano layout), so dissonance is easy.
const KEYMAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74,
};

type Phase = "demo" | "play" | "done";

interface Dialogue {
  seed: number;
  phrases: Phrase[];
  phase: Phase;
}

function nextOwner(count: number): Owner {
  return count % 2 === 0 ? "human" : "ai";
}

function lastPitchOf(phrases: Phrase[], seed: number): number {
  if (phrases.length === 0) return seedOpeningPitch(seed);
  const last = phrases[phrases.length - 1];
  return last.notes[last.notes.length - 1];
}

/** Build the next phrase (synthetic-human OR AI beam search) purely. */
function makeNextPhrase(phrases: Phrase[], seed: number): Phrase {
  const owner = nextOwner(phrases.length);
  const prev = lastPitchOf(phrases, seed);
  const sub = mixSeed(seed, phrases.length + 1);
  if (owner === "ai") {
    const plan = planPhrase(prev, sub);
    return {
      owner: "ai",
      notes: plan.notes,
      tension: plan.tension,
      banked: plan.banked,
      intent: plan.intent,
      nodes: plan.nodes,
      humanResidual: plan.humanResidual,
    };
  }
  const { notes, tension } = runSyntheticHuman(prev, sub);
  return {
    owner: "human",
    notes,
    tension,
    banked: bankedTension(notes, tension),
    intent: "resolving the line back toward the drone",
  };
}

// ── Scoreboard ────────────────────────────────────────────────────────────────
interface Board {
  aiBanked: number;
  humanResolved: number;
  ratio: number;
}

function computeBoard(phrases: Phrase[]): Board {
  let aiBanked = 0;
  let humanResolved = 0;
  for (let i = 0; i < phrases.length; i++) {
    if (phrases[i].owner !== "ai") continue;
    aiBanked += phrases[i].banked;
    const reply = phrases[i + 1];
    if (reply && reply.owner === "human") {
      humanResolved += Math.max(0, phrases[i].banked - reply.banked);
    }
  }
  const ratio = aiBanked > 0 ? humanResolved / aiBanked : 0;
  return { aiBanked, humanResolved, ratio };
}

function makeVerdict(board: Board): string {
  if (board.aiBanked < 0.05) {
    return "Barely any tension in play — nobody drew blood.";
  }
  const pct = Math.round(board.ratio * 100);
  if (board.ratio > 0.66) {
    return `You defused ${pct}% of the tension the AI banked — you held the line.`;
  }
  if (board.ratio > 0.33) {
    return `You drained only ${pct}% of the AI's tension — it kept the upper hand.`;
  }
  return `You resolved just ${pct}% — you're drowning in what the AI left unresolved.`;
}

// ── Overlay geometry (shared with the GL crest mapping) ───────────────────────
function yPix(h: number, H: number): number {
  return (0.96 - 0.86 * Math.max(0, Math.min(1, h))) * H;
}
function xPix(sampleIdx: number, view: LandscapeView, W: number): number {
  return ((sampleIdx - view.viewStart) / view.viewCount) * W;
}

export default function GoadPage() {
  const synthRef = useRef<GoadSynth | null>(null);
  const glRef = useRef<TensionGL | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPlayRef = useRef<(() => void) | null>(null);

  const [dlg, setDlg] = useState<Dialogue>(() => ({
    seed: SEED0,
    phrases: [],
    phase: "demo",
  }));
  const [pending, setPending] = useState<number[]>([]);
  const [playPos, setPlayPos] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [size, setSize] = useState({ w: 900, h: 320 });

  const getSynth = useCallback((): GoadSynth => {
    if (!synthRef.current) synthRef.current = new GoadSynth();
    return synthRef.current;
  }, []);

  // ── Play a list of events with a globally-offset playhead ───────────────────
  const playSegment = useCallback(
    (events: { pitch: number; owner: Owner }[], startSample: number) => {
      const synth = getSynth();
      if (!synth.ensure()) {
        setAudioBlocked(true);
        return;
      }
      if (stopPlayRef.current) stopPlayRef.current();
      setPlayPos(startSample);
      stopPlayRef.current = synth.playSequence(
        events,
        BPM,
        (pos) => setPlayPos(startSample + pos),
        () => {
          setPlayPos(null);
          stopPlayRef.current = null;
        },
      );
    },
    [getSynth],
  );

  // ── Build the display timeline (committed + live pending phrase) ────────────
  const timeline = useMemo(() => {
    const samples: number[] = [];
    const markers: { s: number; h: number; owner: Owner; pending?: boolean }[] =
      [];
    const bounds: { start: number; owner: Owner; phrase: Phrase }[] = [];
    for (const ph of dlg.phrases) {
      bounds.push({ start: samples.length, owner: ph.owner, phrase: ph });
      for (let i = 0; i < ph.tension.length; i++) {
        markers.push({ s: samples.length, h: ph.tension[i], owner: ph.owner });
        samples.push(ph.tension[i]);
      }
    }
    if (pending.length > 0) {
      const prev = lastPitchOf(dlg.phrases, dlg.seed);
      const pt = phraseTension(pending, prev);
      for (let i = 0; i < pt.length; i++) {
        markers.push({ s: samples.length, h: pt[i], owner: "human", pending: true });
        samples.push(pt[i]);
      }
    }
    return { samples, markers, bounds };
  }, [dlg, pending]);

  // Keep the live view in a ref so the GL rAF loop always reads fresh data.
  const viewRef = useRef<LandscapeView>({ samples: [], viewStart: 0, viewCount: 2 });
  useMemo(() => {
    const total = timeline.samples.length;
    let view: LandscapeView;
    if (playPos !== null && total > WINDOW_PLAY) {
      const start = Math.max(
        0,
        Math.min(total - WINDOW_PLAY, playPos - WINDOW_PLAY * 0.55),
      );
      view = { samples: timeline.samples, viewStart: start, viewCount: WINDOW_PLAY };
    } else {
      view = { samples: timeline.samples, viewStart: 0, viewCount: Math.max(total, 2) };
    }
    viewRef.current = view;
    return view;
  }, [timeline, playPos]);
  const view = viewRef.current;

  // ── GL init + continuous render loop ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = new TensionGL();
    const ok = gl.init(canvas);
    if (!ok) {
      setGlFailed(true);
      gl.dispose();
      return;
    }
    glRef.current = gl;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const loop = () => {
      const wrap = wrapRef.current;
      if (wrap && glRef.current) {
        glRef.current.resize(wrap.clientWidth, wrap.clientHeight, dpr);
        glRef.current.render(viewRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      glRef.current?.dispose();
      glRef.current = null;
    };
  }, []);

  // ── Track container size for the SVG overlay ────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    });
    ro.observe(wrap);
    setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
      if (aiTimer.current) clearTimeout(aiTimer.current);
      if (stopPlayRef.current) stopPlayRef.current();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // ── Auto-demo driver: self-play a full dialogue, loop it (visual only) ──────
  useEffect(() => {
    if (dlg.phase !== "demo") return;
    if (demoTimer.current) clearTimeout(demoTimer.current);
    if (dlg.phrases.length >= MAX_PHRASES) {
      demoTimer.current = setTimeout(() => {
        setDlg((d) =>
          d.phase === "demo" ? { ...d, phrases: [] } : d,
        );
      }, 2800);
    } else {
      demoTimer.current = setTimeout(() => {
        setDlg((d) => {
          if (d.phase !== "demo" || d.phrases.length >= MAX_PHRASES) return d;
          return { ...d, phrases: [...d.phrases, makeNextPhrase(d.phrases, d.seed)] };
        });
      }, 900);
    }
    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
    };
  }, [dlg]);

  // ── AI's live turn: after the human commits, the AI plans + answers audibly ─
  useEffect(() => {
    if (dlg.phase !== "play") return;
    if (dlg.phrases.length >= MAX_PHRASES) return;
    if (nextOwner(dlg.phrases.length) !== "ai") return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    // Build the phrase once from the (current) closure state, sound it, then
    // append via a pure updater that re-guards against races.
    const ph = makeNextPhrase(dlg.phrases, dlg.seed);
    const startSample = dlg.phrases.length * SLOTS;
    aiTimer.current = setTimeout(() => {
      playSegment(
        ph.notes.map((p) => ({ pitch: p, owner: "ai" as Owner })),
        startSample,
      );
      setDlg((d) => {
        if (
          d.phase !== "play" ||
          d.phrases.length >= MAX_PHRASES ||
          nextOwner(d.phrases.length) !== "ai"
        ) {
          return d;
        }
        const phrases = [...d.phrases, ph];
        return {
          ...d,
          phrases,
          phase: phrases.length >= MAX_PHRASES ? "done" : "play",
        };
      });
    }, 620);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [dlg, playSegment]);

  // ── Keyboard play (human's live turn) ───────────────────────────────────────
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      const pitch = KEYMAP[ev.key.toLowerCase()];
      if (pitch === undefined) return;
      // Only accept input on the human's turn in play mode.
      if (dlg.phase !== "play") return;
      if (nextOwner(dlg.phrases.length) !== "human") return;
      if (dlg.phrases.length >= MAX_PHRASES) return;
      ev.preventDefault();
      const synth = getSynth();
      if (!synth.ensure()) setAudioBlocked(true);
      else synth.note(pitch, "human");
      setPending((buf) => {
        if (buf.length >= SLOTS) return buf;
        const next = [...buf, pitch];
        if (next.length >= SLOTS) {
          // Commit the human phrase, then hand off to the AI.
          setDlg((d) => {
            const prev = lastPitchOf(d.phrases, d.seed);
            const tension = phraseTension(next, prev);
            const ph: Phrase = {
              owner: "human",
              notes: next,
              tension,
              banked: bankedTension(next, tension),
              intent: "your line",
            };
            const phrases = [...d.phrases, ph];
            return {
              ...d,
              phrases,
              phase: phrases.length >= MAX_PHRASES ? "done" : "play",
            };
          });
          return [];
        }
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dlg, getSynth]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const begin = useCallback(() => {
    if (demoTimer.current) clearTimeout(demoTimer.current);
    const synth = getSynth();
    setAudioBlocked(!synth.ensure());
    setPending([]);
    setPlayPos(null);
    setDlg((d) => ({ seed: d.seed, phrases: [], phase: "play" }));
  }, [getSynth]);

  const newDialogue = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (stopPlayRef.current) stopPlayRef.current();
    setPending([]);
    setPlayPos(null);
    setDlg((d) => ({ seed: (d.seed + 1) >>> 0, phrases: [], phase: "play" }));
  }, []);

  const playExchange = useCallback(() => {
    const events = dlg.phrases.flatMap((ph) =>
      ph.notes.map((p) => ({ pitch: p, owner: ph.owner })),
    );
    if (events.length === 0) return;
    playSegment(events, 0);
  }, [dlg.phrases, playSegment]);

  // ── Derived readouts ────────────────────────────────────────────────────────
  const board = useMemo(() => computeBoard(dlg.phrases), [dlg.phrases]);
  const lastAi = useMemo(
    () => [...dlg.phrases].reverse().find((p) => p.owner === "ai") ?? null,
    [dlg.phrases],
  );
  const verdict = dlg.phase === "done" ? makeVerdict(board) : null;
  const humanTurn =
    dlg.phase === "play" &&
    dlg.phrases.length < MAX_PHRASES &&
    nextOwner(dlg.phrases.length) === "human";
  const aiThinking =
    dlg.phase === "play" &&
    dlg.phrases.length < MAX_PHRASES &&
    nextOwner(dlg.phrases.length) === "ai";

  const turnLabel =
    dlg.phase === "demo"
      ? "self-play demo — press Trade fours to take over"
      : dlg.phase === "done"
        ? "dialogue complete — play it back or start a new one"
        : humanTurn
          ? `your turn · play ${SLOTS - pending.length} more note${SLOTS - pending.length === 1 ? "" : "s"}`
          : "the AI is planning its answer…";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-[calc(100vh-3rem)] w-full bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Prototype 2578 · trading fours with an adversary
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Goad
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Trade 4-bar phrases with an AI that plans several exchanges ahead —
            it banks musical <span className="text-foreground">tension</span>{" "}
            against you and dares you to resolve what it leaves hanging, using
            dissonance as a weapon. Watch the tension landscape: magenta crests
            are the cliffs it built, violet valleys are resolution.
          </p>
        </header>

        {/* ── Scoreboard ── */}
        <div className="mb-4 flex flex-wrap items-stretch gap-3">
          <MeterPill
            label="AI banked"
            value={board.aiBanked}
            accent={MAGENTA}
            active={aiThinking}
          />
          <MeterPill
            label="You resolved"
            value={board.humanResolved}
            accent={VIOLET[400]}
            active={humanTurn}
          />
          <div className="flex min-h-[44px] flex-1 items-center rounded-md border border-border bg-background/60 px-4">
            <span className="font-mono text-xs text-muted-foreground">
              {turnLabel}
            </span>
          </div>
        </div>

        {/* ── Tension landscape (WebGL2 + SVG overlay) ── */}
        <div
          ref={wrapRef}
          className="relative h-[300px] w-full overflow-hidden rounded-lg border border-border bg-[#0b0713] sm:h-[340px]"
        >
          {!glFailed && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
            />
          )}
          {glFailed && (
            <SvgFallback view={view} w={size.w} h={size.h} />
          )}
          <svg
            className="pointer-events-none absolute inset-0"
            width={size.w}
            height={size.h}
          >
            {drawOverlay({
              timeline,
              view,
              w: size.w,
              h: size.h,
              playPos,
              humanTurn,
            })}
          </svg>
        </div>

        {/* ── Controls ── */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {dlg.phase === "demo" ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Trade fours
            </button>
          ) : (
            <button
              onClick={newDialogue}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              New dialogue
            </button>
          )}
          <button
            onClick={playExchange}
            disabled={dlg.phrases.length === 0}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playPos !== null ? "Playing…" : "Play the exchange"}
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          {audioBlocked && (
            <span className="text-sm text-destructive">
              Audio unavailable — the dialogue still plays silently.
            </span>
          )}
        </div>

        {/* ── AI intent + verdict ── */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              The AI&apos;s move
            </p>
            {lastAi ? (
              <div>
                <p className="text-base leading-relaxed text-foreground">
                  “It {lastAi.intent}”
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  banked {lastAi.banked.toFixed(2)} tension ·{" "}
                  {(lastAi.nodes ?? 0).toLocaleString()} candidate phrases
                  searched · beam pruned to 10 · ended on{" "}
                  {noteName(lastAi.notes[lastAi.notes.length - 1])}
                </p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                In the demo above, the two sides trade fours on their own. Press
                Trade fours, then play notes with your keyboard
                (a–k, piano layout) to answer.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Verdict
            </p>
            {verdict ? (
              <p className="text-base leading-relaxed text-foreground">
                {verdict}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Keys map to one chromatic octave so you can reach for genuinely
                rough intervals. Resolve the AI&apos;s cliffs by moving stepwise
                back toward C, E or G — the drone&apos;s chord tones. Complete{" "}
                {MAX_PHRASES} phrases to get your verdict.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Design notes ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Goad — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                you traded fours with an AI improviser that plans several
                exchanges ahead — an adversary whose goal is to bank tension
                against you, using dissonance as a weapon rather than trying to
                sound nice?
              </p>
              <p>
                <span className="text-foreground">Tension</span> is a continuous
                scalar per event: sensory-dissonance roughness (Plomp &amp;
                Levelt 1965; Sethares 1998) of the note&apos;s partials against a
                ringing C-major drone, plus voice-leading leap size, plus
                tendency-tone expectation (a leading tone or tritone held over
                the barline scores high). That is the landscape you see and hear.
              </p>
              <p>
                On its turn the AI runs a{" "}
                <span className="text-foreground">beam search</span> (top-10
                partial phrases kept and extended each of the eight steps) over
                its own next phrase, choosing the one that maximises the tension
                handed to you while minimising the tension it must carry — scored
                against a model of your best resolution, so it plans past its
                phrase into your reply. Judging a move by the opponent&apos;s best
                answer is the sign-flipped lookahead of Shannon 1950.
              </p>
              <p>
                No <span className="text-foreground">AudioContext</span>? The
                landscape keeps running behind a notice. No WebGL2? An SVG
                fallback draws the same curve. Everything is deterministic —{" "}
                <span className="text-foreground">mulberry32(0x2578)</span>, no
                Math.random — so the auto-demo and every new dialogue replay
                exactly, and everything tears down on unmount.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Scoreboard pill ─────────────────────────────────────────────────────────
function MeterPill({
  label,
  value,
  accent,
  active,
}: {
  label: string;
  value: number;
  accent: string;
  active: boolean;
}) {
  return (
    <div
      className="flex min-h-[44px] items-center gap-3 rounded-md border bg-background/60 px-4"
      style={{ borderColor: active ? accent : "var(--border)" }}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: accent, opacity: active ? 1 : 0.5 }}
      />
      <span className="text-sm text-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums text-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── SVG overlay: gridlines, phrase bounds, note markers, playhead ─────────────
interface OverlayArgs {
  timeline: {
    samples: number[];
    markers: { s: number; h: number; owner: Owner; pending?: boolean }[];
    bounds: { start: number; owner: Owner; phrase: Phrase }[];
  };
  view: LandscapeView;
  w: number;
  h: number;
  playPos: number | null;
  humanTurn: boolean;
}

function drawOverlay({ timeline, view, w, h, playPos, humanTurn }: OverlayArgs) {
  const els: React.ReactNode[] = [];

  // Horizontal reference lines (tension 0.25 / 0.5 / 0.75).
  for (const lvl of [0.25, 0.5, 0.75]) {
    const y = yPix(lvl, h);
    els.push(
      <line
        key={`g${lvl}`}
        x1={0}
        y1={y}
        x2={w}
        y2={y}
        stroke={NEUTRAL[200]}
        strokeWidth={1}
        strokeDasharray="2 6"
        opacity={0.5}
      />,
    );
  }
  els.push(
    <text
      key="lo"
      x={6}
      y={yPix(0.02, h) - 6}
      fontSize={9}
      fontFamily="monospace"
      fill={NEUTRAL[600]}
    >
      calm
    </text>,
    <text
      key="hi"
      x={6}
      y={yPix(0.95, h) + 10}
      fontSize={9}
      fontFamily="monospace"
      fill={NEUTRAL[600]}
    >
      tense
    </text>,
  );

  // Phrase boundaries + owner labels + banked flags.
  for (const b of timeline.bounds) {
    const x = xPix(b.start, view, w);
    if (x < -2 || x > w + 2) continue;
    els.push(
      <line
        key={`b${b.start}`}
        x1={x}
        y1={0}
        x2={x}
        y2={h}
        stroke={NEUTRAL[400]}
        strokeWidth={1}
        opacity={0.35}
      />,
    );
    const isAi = b.owner === "ai";
    els.push(
      <text
        key={`bl${b.start}`}
        x={x + 5}
        y={16}
        fontSize={10}
        fontFamily="monospace"
        letterSpacing={1.5}
        fill={isAi ? MAGENTA : VIOLET[300]}
      >
        {isAi ? "AI" : "YOU"}
      </text>,
    );
    if (isAi) {
      const endS = b.start + b.phrase.tension.length - 1;
      const ex = xPix(endS, view, w);
      const ey = yPix(b.phrase.tension[b.phrase.tension.length - 1], h);
      els.push(
        <g key={`bank${b.start}`}>
          <circle cx={ex} cy={ey} r={6} fill="none" stroke={MAGENTA} strokeWidth={1.5} />
          <text
            x={ex + 9}
            y={ey + 3}
            fontSize={9}
            fontFamily="monospace"
            fill={MAGENTA}
          >
            +{b.phrase.banked.toFixed(2)}
          </text>
        </g>,
      );
    }
  }

  // Note markers.
  for (const m of timeline.markers) {
    const x = xPix(m.s, view, w);
    if (x < -4 || x > w + 4) continue;
    const y = yPix(m.h, h);
    const color = m.owner === "ai" ? MAGENTA : VIOLET[300];
    els.push(
      <circle
        key={`m${m.s}`}
        cx={x}
        cy={y}
        r={m.pending ? 3.5 : 2.6}
        fill={m.pending ? "none" : color}
        stroke={m.pending ? INDIGO : "none"}
        strokeWidth={m.pending ? 1.5 : 0}
        opacity={m.pending ? 0.9 : 0.95}
      />,
    );
  }

  // Playhead.
  if (playPos !== null) {
    const x = xPix(playPos, view, w);
    if (x >= -2 && x <= w + 2) {
      els.push(
        <line
          key="playhead"
          x1={x}
          y1={0}
          x2={x}
          y2={h}
          stroke={VIOLET[100]}
          strokeWidth={2}
          opacity={0.85}
        />,
      );
    }
  }

  // "Your turn" cursor: where the next note will land.
  if (humanTurn) {
    const nextS = timeline.samples.length;
    const x = xPix(nextS, view, w);
    els.push(
      <line
        key="cursor"
        x1={x}
        y1={0}
        x2={x}
        y2={h}
        stroke={VIOLET[400]}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.7}
      />,
    );
  }

  return els;
}

// ── SVG fallback landscape (WebGL2 unavailable) ───────────────────────────────
function SvgFallback({ view, w, h }: { view: LandscapeView; w: number; h: number }) {
  if (view.samples.length < 2 || w < 2) return null;
  const pts: string[] = [`0,${h}`];
  const n = Math.max(2, Math.min(600, w));
  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1);
    const sx = view.viewStart + frac * view.viewCount;
    const idx = Math.max(0, Math.min(view.samples.length - 1, sx));
    const lo = Math.floor(idx);
    const hi = Math.min(view.samples.length - 1, lo + 1);
    const f = idx - lo;
    const hv = view.samples[lo] * (1 - f) + view.samples[hi] * f;
    pts.push(`${frac * w},${yPix(hv, h)}`);
  }
  pts.push(`${w},${h}`);
  return (
    <svg className="absolute inset-0" width={w} height={h}>
      <polygon points={pts.join(" ")} fill={VIOLET[700]} opacity={0.55} />
      <polyline
        points={pts.slice(1, -1).join(" ")}
        fill="none"
        stroke={MAGENTA}
        strokeWidth={1.5}
      />
    </svg>
  );
}
