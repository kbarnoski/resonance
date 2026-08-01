"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4680 · concord — a duet where the partner can REFUSE you.
//
// THE ONE QUESTION: What if your duet partner WANTED something different than
// you — and the music were the negotiation between two wills, where you might
// never agree?
//
// INPUT:  keyboard degrees (a s d f g h j k) or a tap on your voice-lane set
//         where YOUR line sits; on load a deterministic scripted "human" plays
//         both parts so the whole arc reads headless, on a phone, in silence.
// OUTPUT: real Web Audio (bright plucked YOU vs. cool reed PARTNER) + a live,
//         READABLE two-voice score rendered in pure DOM/CSS (SVG only for the
//         two contour lines). An agreement meter and a "who conceded" ledger
//         make the negotiation legible turn by turn.
// TECHNIQUE: hand-rolled SYMBOLIC agent (NO ML) that holds its own musical
//         intention and decides each turn to CONCEDE or HOLD (agent.ts);
//         deterministic mulberry32 (seed 0x4680); rAF + performance.now only.
//
// REFERENCES:
//  · "Co-policy: Responsive Human-Robot Co-Creation for Musical Performances"
//    (arXiv:2606.19914, 2026) — human–AI control as iterative negotiation.
//    GAP: their agent serves the human; ours holds a competing will & refuses.
//  · Jazz "trading fours" / call-and-response — twist: the partner may NOT
//    answer in kind; it can hold its own line.
//  · George Lewis, *Voyager* — a non-hierarchical improvising partner.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  ConcordDuet,
  KEY_DEGREES,
  type Glyph,
  type Snapshot,
  type TurnRecord,
} from "./agent";
import { createAudio, type ConcordAudio } from "./audio";

const PITCH_LO = 50;
const PITCH_HI = 80;

function pitchToY(m: number): number {
  const f = (PITCH_HI - m) / (PITCH_HI - PITCH_LO);
  return Math.max(4, Math.min(96, f * 100));
}

interface Pt {
  x: number;
  y: number;
  cur: boolean;
}

/** Flatten a window of turns into evenly-spaced note points for one voice. */
function voicePoints(
  history: TurnRecord[],
  sel: (t: TurnRecord) => number[],
): { pts: Pt[]; line: string } {
  const perTurn = 4;
  const total = Math.max(1, history.length * perTurn - 1);
  const pts: Pt[] = [];
  let i = 0;
  const lastTurn = history.length - 1;
  history.forEach((t, ti) => {
    sel(t).forEach((m) => {
      pts.push({
        x: (i / total) * 100,
        y: pitchToY(m),
        cur: ti === lastTurn,
      });
      i += 1;
    });
  });
  const line = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  return { pts, line };
}

const GLYPH_CLASS: Record<Glyph, string> = {
  "↓": "text-primary", // partner conceded — the interesting move
  "↕": "text-violet-300", // both gave ground
  "↑": "text-muted-foreground", // you conceded, partner held
  "—": "text-muted-foreground/40", // standoff
};

const GLYPH_LABEL: Record<Glyph, string> = {
  "↓": "partner conceded",
  "↕": "both gave ground",
  "↑": "you conceded",
  "—": "standoff",
};

const NOTES: { h: string; body: string[] }[] = [
  {
    h: "The one question",
    body: [
      "What if your duet partner wanted something different than you — and the music were the negotiation between two wills, where you might never agree?",
      "Every prior duet in this lab cooperates. Here the partner can refuse.",
    ],
  },
  {
    h: "The agent (no machine learning)",
    body: [
      "The partner is a hand-rolled symbolic agent. It holds its own intention: a home pitch-center a fifth above yours, and its own melodic contour.",
      "Each turn it scores one decision — CONCEDE (step its center toward yours, bend its line toward yours) or HOLD (restate its own line, dig in). The score = baseline willingness + tit-for-tat (it softens when you just moved toward it) + rising pressure to resolve − a stubbornness constant + seeded temperament.",
      "So it may just give in — or keep digging in. Agreement is never guaranteed, and a sustained standoff is a valid, even beautiful, ending.",
    ],
  },
  {
    h: "Reading the score",
    body: [
      "Top lane is you, bottom lane is the partner; height is pitch, left-to-right is time. The partner lane also carries a faint ghost of YOUR line — when the partner concedes, its contour rises to meet the ghost and the two lines overlap.",
      "The meter is agreement (0–1); the ledger is who gave ground each turn: ↓ partner conceded, ↑ you conceded, ↕ both, — standoff.",
    ],
  },
  {
    h: "Play it",
    body: [
      "Press a s d f g h j k (or tap your lane) to set where your line sits, then watch the partner negotiate against your stance. Enable sound for the two timbres: you are bright and plucked, the partner is a cool reed pad. On agreement a shared cadence rings; on a standoff the two centers sound at once as gentle polytonal beating.",
    ],
  },
  {
    h: "Not verifiable headless",
    body: [
      "Sound needs a user gesture (autoplay policy), so a silent screenshot can't confirm the timbres or the cadence/beating — only that the negotiation animates. Everything visual paints on load and loops.",
    ],
  },
];

export default function ConcordPage() {
  const engineRef = useRef<ConcordDuet | null>(null);
  if (!engineRef.current) engineRef.current = new ConcordDuet(0x4680);

  // Prefill a few turns so the score, meter and ledger paint immediately.
  const [snap, setSnap] = useState<Snapshot>(() => {
    const e = engineRef.current!;
    let s = e.step(null);
    for (let i = 0; i < 4; i += 1) s = e.step(null);
    return s;
  });

  const [notesOpen, setNotesOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [liveCenter, setLiveCenter] = useState<number | null>(null);

  const audioRef = useRef<ConcordAudio | null>(null);
  const audioTriedRef = useRef(false);
  const soundOnRef = useRef(false);
  const liveCenterRef = useRef<number | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  // ── The negotiation loop + all input wiring, mounted once ─────────────────
  useEffect(() => {
    const engine = engineRef.current!;
    let raf = 0;
    let lastTurn = performance.now();
    let wait = snap.holdMs;

    const ensureAudio = () => {
      if (audioRef.current || audioTriedRef.current) return;
      audioTriedRef.current = true;
      try {
        const a = createAudio();
        audioRef.current = a;
        soundOnRef.current = true;
        setSoundOn(true);
      } catch {
        setAudioError(
          "Web Audio is unavailable here — the negotiation still plays visually.",
        );
      }
    };

    const sound = (s: Snapshot) => {
      const a = audioRef.current;
      if (!a || !soundOnRef.current) return;
      a.playYou(s.latest.youNotes);
      a.playPartner(s.latest.partnerNotes, 0.14);
      if (s.event === "cadence") a.cadence(s.cadenceMidi);
      else if (s.event === "standoff")
        a.standoff(s.youCenterMidi, s.partnerCenterMidi);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastTurn < wait) return;
      lastTurn = now;
      const s = engine.step(liveCenterRef.current);
      wait = s.holdMs;
      sound(s);
      setSnap(s);
    };
    raf = requestAnimationFrame(tick);

    const onKey = (e: KeyboardEvent) => {
      const hit = KEY_DEGREES.find((k) => k.key === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      ensureAudio();
      liveCenterRef.current = hit.degree;
      setLiveCenter(hit.degree);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // Mount-once loop; live state is read through refs. snap.holdMs seed only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureAudioClick = () => {
    if (audioRef.current || audioTriedRef.current) return;
    audioTriedRef.current = true;
    try {
      const a = createAudio();
      audioRef.current = a;
      soundOnRef.current = true;
      setSoundOn(true);
    } catch {
      setAudioError(
        "Web Audio is unavailable here — the negotiation still plays visually.",
      );
    }
  };

  const takeLaneStance = (e: React.PointerEvent<HTMLDivElement>) => {
    ensureAudioClick();
    const el = laneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = 1 - (e.clientY - r.top) / r.height;
    const degree = Math.max(-1, Math.min(6, Math.round(-1 + frac * 7)));
    liveCenterRef.current = degree;
    setLiveCenter(degree);
  };

  const resetToDemo = () => {
    liveCenterRef.current = null;
    setLiveCenter(null);
  };

  const you = useMemo(() => voicePoints(snap.history, (t) => t.youNotes), [snap]);
  const partner = useMemo(
    () => voicePoints(snap.history, (t) => t.partnerNotes),
    [snap],
  );
  // Ghost of YOUR line drawn inside the partner lane (same pitch mapping).
  const ghost = you;

  const agreePct = Math.round(snap.agreement * 100);
  const outcomeLabel =
    snap.outcome === "agreed"
      ? "AGREED"
      : snap.outcome === "standoff"
        ? "STANDOFF"
        : "NEGOTIATING";
  const outcomeClass =
    snap.outcome === "agreed"
      ? "text-primary"
      : snap.outcome === "standoff"
        ? "text-muted-foreground"
        : "text-foreground";

  const sectionLabel =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <p className={sectionLabel}>4680 · concord</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          The duet that can refuse you
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          Your partner wants something different than you. Each turn it decides,
          out loud, to <span className="text-primary">concede</span> toward your
          line or <span className="text-foreground">hold</span> its own. You
          might meet in a cadence — or never agree.
        </p>
      </header>

      {audioError && (
        <p className="text-sm text-destructive" role="status">
          {audioError}
        </p>
      )}

      {/* ── The two-voice score ──────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>You · plucked</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {liveCenter === null ? "auto-demo" : "you are steering"}
          </span>
        </div>
        <div
          ref={laneRef}
          onPointerDown={takeLaneStance}
          className="relative h-24 cursor-pointer touch-none rounded-md border border-border bg-background/60"
          aria-label="Your voice lane — tap to set where your line sits"
        >
          <svg
            className="absolute inset-0 h-full w-full text-primary"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={you.line}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {you.pts.map((p, i) => (
            <span
              key={i}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top] duration-500 ease-out motion-reduce:transition-none ${
                p.cur
                  ? "h-2.5 w-2.5 bg-violet-300 ring-2 ring-primary/40"
                  : "h-1.5 w-1.5 bg-primary/70"
              }`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <span className={sectionLabel}>Partner · reed</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {snap.latest.decision === "concede" ? "conceding" : "holding"}
          </span>
        </div>
        <div className="relative h-24 rounded-md border border-border bg-background/60">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {/* Ghost of YOUR line — the partner rises to meet it as it concedes */}
            <polyline
              points={ghost.line}
              fill="none"
              className="text-primary/25"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={partner.line}
              fill="none"
              className="text-violet-400"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {partner.pts.map((p, i) => (
            <span
              key={i}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top] duration-500 ease-out motion-reduce:transition-none ${
                p.cur
                  ? "h-2.5 w-2.5 bg-violet-300 ring-2 ring-primary/40"
                  : "h-1.5 w-1.5 bg-violet-400/70"
              }`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
        </div>
      </section>

      {/* ── Agreement meter ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className={sectionLabel}>Agreement</span>
          <span className={`font-mono text-sm ${outcomeClass}`}>
            {outcomeLabel} · {(snap.agreement).toFixed(2)}
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full border border-border bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${agreePct}%` }}
          />
          {/* agreement threshold tick */}
          <div
            className="absolute top-0 h-full w-px bg-foreground/40"
            style={{ left: "86%" }}
            aria-hidden
          />
        </div>
      </section>

      {/* ── Who conceded — the ledger ────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <span className={sectionLabel}>Ledger · who gave ground</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {snap.history.map((t) => (
            <span
              key={t.turn}
              title={GLYPH_LABEL[t.glyph]}
              className={`flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/60 font-mono text-sm ${GLYPH_CLASS[t.glyph]}`}
            >
              {t.glyph}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span className="text-primary">↓ partner conceded</span>
          <span className="text-muted-foreground">↑ you conceded</span>
          <span className="text-violet-300">↕ both</span>
          <span className="text-muted-foreground/50">— standoff</span>
        </div>
      </section>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ensureAudioClick}
            disabled={soundOn}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {soundOn ? "Sound on ♪" : "Enable sound"}
          </button>
          <button
            type="button"
            onClick={resetToDemo}
            disabled={liveCenter === null}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            Auto-demo
          </button>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {/* keyboard map */}
        <div className="flex flex-col gap-1.5">
          <span className={sectionLabel}>Your keys · low → high</span>
          <div className="flex flex-wrap gap-1.5">
            {KEY_DEGREES.map((k) => (
              <span
                key={k.key}
                className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-mono text-xs uppercase transition-colors ${
                  liveCenter === k.degree
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground"
                }`}
              >
                {k.key}
              </span>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Press a key or tap your lane to set where your line sits, then watch
            the partner decide. It may meet you — or refuse.
          </p>
        </div>
      </section>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {NOTES.map((n) => (
                <div key={n.h} className="flex flex-col gap-1.5">
                  <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                    {n.h}
                  </h3>
                  {n.body.map((p, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["4680-concord"]} />
    </main>
  );
}
