"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { composeFugue, midiToName, type Fugue, type FugueNote } from "./fugue";
import { FuguePlayer } from "./audio";

// Warm ink / sepia hue per voice (art layer — not chrome tokens).
const VOICE_COLOR = ["#E9B65C", "#DE8B4A", "#C55A38"]; // top · middle · bass
const VOICE_GLOW = ["#FBE6BC", "#F6C79A", "#E9A588"];
const VOICE_LABEL = ["Voice I", "Voice II", "Voice III"];

const START_SEED = 0x5eed17;
// Deterministic seed advance (a plain LCG step — no Math.random / Date).
const nextSeed = (s: number) => (Math.imul(s, 1664525) + 1013904223) >>> 0;

// SVG score geometry.
const W = 1000;
const H = 460;
const PAD_T = 26;
const PAD_B = 30;
const PLAY_X = W * 0.28;
const PX_PER_BEAT = 46;

export default function FugueLoomPage() {
  const [seed, setSeed] = useState(START_SEED);
  const fugue = useMemo<Fugue>(() => composeFugue(seed), [seed]);

  const playerRef = useRef<FuguePlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const [nowBeat, setNowBeat] = useState(0);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  const reducedMotion = useRef(false);

  // ── set up the player once; teardown on unmount ──────────────────────────
  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const player = new FuguePlayer();
    playerRef.current = player;

    // Autonomous self-play on load. Browsers may hold the context suspended
    // until a gesture — resume on the first interaction as a fallback.
    const unlock = () => void player.resume();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    void player.resume();

    const loop = () => {
      const p = playerRef.current;
      if (p) {
        const b = p.currentBeat();
        setNowBeat(b);
        setFinished(p.done);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  // ── (re)load & play whenever the fugue changes ───────────────────────────
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    p.setFugue(fugue);
    p.play();
    setFinished(false);
  }, [fugue]);

  // ── track the current section from the play position ─────────────────────
  useEffect(() => {
    const idx = fugue.sections.findIndex(
      (s) => nowBeat >= s.startBeat && nowBeat < s.endBeat
    );
    if (idx !== -1 && idx !== sectionIdx) setSectionIdx(idx);
  }, [nowBeat, fugue, sectionIdx]);

  const newSubject = useCallback(() => {
    setSeed((s) => nextSeed(s));
    setSectionIdx(0);
  }, []);

  const replay = useCallback(() => {
    playerRef.current?.play();
    setSectionIdx(0);
    setFinished(false);
  }, []);

  const section = fugue.sections[sectionIdx] ?? fugue.sections[0];
  const progress = Math.min(1, nowBeat / fugue.totalBeats);

  // ── pitch → y mapping ────────────────────────────────────────────────────
  const y = useCallback(
    (midi: number) => {
      const span = fugue.maxMidi - fugue.minMidi || 1;
      const t = (midi - fugue.minMidi) / span;
      return PAD_T + (1 - t) * (H - PAD_T - PAD_B);
    },
    [fugue.maxMidi, fugue.minMidi]
  );

  const rowH = Math.max(
    4,
    ((H - PAD_T - PAD_B) / (fugue.maxMidi - fugue.minMidi || 1)) * 0.82
  );

  // Visible notes only (window around the playhead).
  const visible = useMemo(() => {
    const leftBeat = nowBeat - PLAY_X / PX_PER_BEAT;
    const rightBeat = nowBeat + (W - PLAY_X) / PX_PER_BEAT + 1;
    return fugue.events.filter(
      (e) =>
        e.startBeat + e.durBeats > leftBeat && e.startBeat < rightBeat
    );
  }, [fugue.events, nowBeat]);

  // Group subject-statement notes by entry for the highlight brackets.
  const subjectGroups = useMemo(() => {
    const map = new Map<number, FugueNote[]>();
    for (const e of visible) {
      if (!e.isSubject) continue;
      const arr = map.get(e.entryId);
      if (arr) arr.push(e);
      else map.set(e.entryId, [e]);
    }
    return [...map.values()];
  }, [visible]);

  const xOf = (beat: number) => (beat - nowBeat) * PX_PER_BEAT + PLAY_X;

  // Octave (tonic-D) gridlines for pitch orientation.
  const gridMidis = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(fugue.minMidi / 12) * 12 + 2; m <= fugue.maxMidi; m += 12) {
      if (((m % 12) + 12) % 12 === 2) out.push(m); // D = 2 mod 12
    }
    return out;
  }, [fugue.minMidi, fugue.maxMidi]);

  // Slow, safe glow pulse (~0.13 Hz) — disabled under reduced motion.
  const pulse = reducedMotion.current ? 0.85 : 0.7 + 0.3 * Math.sin(nowBeat * 0.8);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PrototypeNav slugs={["1660-fugue-loom"]} />

      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <a
        href="https://github.com/"
        onClick={(e) => e.preventDefault()}
        title="See README.md in this prototype's folder for the fugal architecture & references"
        className="absolute right-4 top-4 z-20 cursor-help text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </a>

      <header className="mx-auto w-full max-w-5xl px-6 pt-16 sm:pt-14">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Fugue Loom
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Watch a three-voice fugue compose itself — the subject enters voice by
          voice, is answered at the fifth, inverted, driven to an overlapping
          stretto, and closed over a pedal point. Nothing is a recording; every
          note is woven live from one seed.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={newSubject}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New subject
          </button>
          <button
            onClick={replay}
            className="min-h-[44px] rounded-md border border-border px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {finished ? "Play again" : "Restart"}
          </button>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {String(sectionIdx + 1).padStart(2, "0")} / {fugue.sections.length}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {section?.name ?? ""}
            </span>
          </div>
        </div>
      </header>

      {/* ── the self-writing score ─────────────────────────────────────── */}
      <main className="mx-auto mt-5 w-full max-w-5xl flex-1 px-4 sm:px-6">
        <div className="overflow-hidden rounded-lg border border-border bg-[#120d09]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Scrolling piano-roll score of a self-composing fugue, currently in the ${section?.name} section`}
          >
            <defs>
              <linearGradient id="fade-l" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#120d09" stopOpacity="1" />
                <stop offset="1" stopColor="#120d09" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="fade-r" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#120d09" stopOpacity="0" />
                <stop offset="1" stopColor="#120d09" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* octave gridlines */}
            {gridMidis.map((m) => (
              <g key={`g${m}`}>
                <line
                  x1="0"
                  x2={W}
                  y1={y(m)}
                  y2={y(m)}
                  stroke="#3a2c1e"
                  strokeWidth="1"
                  strokeDasharray="2 6"
                />
                <text
                  x="8"
                  y={y(m) - 3}
                  fill="#6b5638"
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                >
                  {midiToName(m)}
                </text>
              </g>
            ))}

            {/* subject-entry highlight brackets (drawn behind the notes) */}
            {subjectGroups.map((grp) => {
              const x0 = Math.min(...grp.map((e) => xOf(e.startBeat)));
              const x1 = Math.max(
                ...grp.map((e) => xOf(e.startBeat + e.durBeats))
              );
              const yTop = Math.min(...grp.map((e) => y(e.midi))) - 4;
              const yBot = Math.max(...grp.map((e) => y(e.midi))) + rowH + 4;
              const v = grp[0].voice;
              return (
                <g key={`sg${grp[0].entryId}`}>
                  <rect
                    x={x0 - 4}
                    y={yTop}
                    width={x1 - x0 + 8}
                    height={yBot - yTop}
                    fill={VOICE_GLOW[v]}
                    fillOpacity={0.06 * pulse + 0.03}
                    stroke={VOICE_GLOW[v]}
                    strokeOpacity={0.5 * pulse + 0.2}
                    strokeWidth="1"
                    rx="4"
                  />
                  <text
                    x={x0 - 2}
                    y={yTop - 4}
                    fill={VOICE_GLOW[v]}
                    fontSize="9"
                    letterSpacing="1.5"
                    fontFamily="ui-monospace, monospace"
                  >
                    SUBJECT
                  </text>
                </g>
              );
            })}

            {/* note blocks */}
            {visible.map((e) => {
              const x = xOf(e.startBeat);
              const w = Math.max(3, e.durBeats * PX_PER_BEAT - 2);
              const past = e.startBeat + e.durBeats < nowBeat;
              const sounding =
                e.startBeat <= nowBeat && e.startBeat + e.durBeats > nowBeat;
              return (
                <rect
                  key={e.id}
                  x={x}
                  y={y(e.midi)}
                  width={w}
                  height={rowH}
                  rx={Math.min(3, rowH / 2)}
                  fill={e.isSubject ? VOICE_GLOW[e.voice] : VOICE_COLOR[e.voice]}
                  fillOpacity={past ? 0.32 : sounding ? 1 : 0.82}
                  stroke={sounding ? "#fff8ec" : "none"}
                  strokeOpacity={sounding ? 0.8 : 0}
                  strokeWidth={sounding ? 1.2 : 0}
                />
              );
            })}

            {/* edge fades */}
            <rect x="0" y="0" width="70" height={H} fill="url(#fade-l)" />
            <rect x={W - 90} y="0" width="90" height={H} fill="url(#fade-r)" />

            {/* playhead ("now") */}
            <line
              x1={PLAY_X}
              x2={PLAY_X}
              y1={PAD_T - 10}
              y2={H - PAD_B + 8}
              stroke="var(--color-primary, #8b5cf6)"
              strokeOpacity="0.85"
              strokeWidth="1.5"
            />
            <circle cx={PLAY_X} cy={PAD_T - 12} r="3" fill="var(--color-primary, #8b5cf6)" />
            <text
              x={PLAY_X + 6}
              y={PAD_T - 10}
              fill="#8b5cf6"
              fontSize="9"
              letterSpacing="2"
              fontFamily="ui-monospace, monospace"
            >
              NOW
            </text>
          </svg>
        </div>

        {/* section timeline */}
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full border border-border">
          {fugue.sections.map((s, i) => {
            const frac = (s.endBeat - s.startBeat) / fugue.totalBeats;
            const isNow = i === sectionIdx;
            return (
              <div
                key={s.name + i}
                title={s.name}
                style={{ flexGrow: frac }}
                className={`h-full border-r border-background/60 transition-colors ${
                  isNow ? "bg-primary" : i < sectionIdx ? "bg-primary/35" : "bg-muted"
                }`}
              />
            );
          })}
        </div>

        {/* voice legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          {VOICE_LABEL.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-5 rounded-sm"
                style={{ backgroundColor: VOICE_COLOR[i] }}
              />
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-5 rounded-sm border"
              style={{ backgroundColor: "#FBE6BC", borderColor: "#FBE6BC" }}
            />
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Subject entry
            </span>
          </div>
          <span className="ml-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            seed {seed.toString(16)} · {Math.round(progress * 100)}%
          </span>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-sm text-muted-foreground">
        D minor · a subject, its tonal answer, a recurring countersubject,
        episodes, middle entries, inversion, stretto and a pedal-point close —
        all seeded, all deterministic.
      </footer>
    </div>
  );
}
