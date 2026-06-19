"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  analyzeRecording,
  buildFollowerEngine,
  type AudioSourceKind,
  type FollowerEngine,
  type RecordingMap,
} from "./audio";

// ─── Constants ──────────────────────────────────────────────────────────────
// The ribbon shows a moving WINDOW of the recording centered on the playhead.
const WINDOW_SEC = 8; // seconds of recording visible across the ribbon
const VB_W = 1000; // SVG viewBox width
const VB_H = 320; // SVG viewBox height

type Phase = "intro" | "loading" | "playing";

function bpm(beatPeriod: number): string {
  if (beatPeriod <= 0) return "—";
  return String(Math.round(60 / beatPeriod));
}

export default function DuetFollowerPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind>("piano");
  const [showNotes, setShowNotes] = useState(false);

  // Live UI state (updated from rAF)
  const [ui, setUi] = useState({
    position: 0,
    rate: 1,
    beatPeriod: 0,
    pulse: 0,
    taps: 0,
    duration: 1,
    nextLandmark: -1,
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<FollowerEngine | null>(null);
  const mapRef = useRef<RecordingMap | null>(null);
  const rafRef = useRef<number>(0);
  const tapCountRef = useRef(0);

  // ── Teardown ────────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.dispose();
    engineRef.current = null;
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── Start (first user gesture — unlock AudioContext) ──────────────────────────
  const start = useCallback(async () => {
    setPhase("loading");
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    try {
      await ctx.resume();
    } catch {
      /* resume best-effort */
    }

    let buffer = await fetchPianoBuffer(ctx);
    let kind: AudioSourceKind = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx);
      kind = "fallback";
    }
    setSourceKind(kind);

    const map = analyzeRecording(buffer);
    mapRef.current = map;
    const engine = buildFollowerEngine(ctx, buffer, map);
    engineRef.current = engine;

    setUi((u) => ({ ...u, duration: map.duration }));
    setPhase("playing");

    const loop = () => {
      const s = engine.read();
      setUi({
        position: s.position,
        rate: s.rate,
        beatPeriod: s.beatPeriod,
        pulse: s.pulse,
        taps: tapCountRef.current,
        duration: map.duration,
        nextLandmark: s.nextLandmark,
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Tap (the human pulse) ─────────────────────────────────────────────────────
  const doTap = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.tap();
    tapCountRef.current += 1;
  }, []);

  // Keyboard: space + QWERTY row act as the pulse keys.
  useEffect(() => {
    if (phase !== "playing") return;
    const PULSE_KEYS = new Set([
      "Space",
      "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
      "KeyH", "KeyJ", "KeyK", "KeyL",
      "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT",
    ]);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (PULSE_KEYS.has(ev.code)) {
        ev.preventDefault();
        doTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, doTap]);

  // ── Build the visible ribbon path from the envelope window ────────────────────
  const map = mapRef.current;
  let ribbonTop = "";
  const ribbonBot: string[] = [];
  const landmarkXs: { x: number; active: boolean }[] = [];
  if (map) {
    const half = WINDOW_SEC / 2;
    const winStart = ui.position - half;
    const winEnd = ui.position + half;
    const env = map.envelope;
    const binSec = map.binSec;
    const cy = VB_H / 2;
    const SAMPLES = 120;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = winStart + (i / SAMPLES) * WINDOW_SEC;
      const x = (i / SAMPLES) * VB_W;
      // wrap time into buffer range
      let tt = t % map.duration;
      if (tt < 0) tt += map.duration;
      const bin = Math.min(env.length - 1, Math.max(0, Math.floor(tt / binSec)));
      const amp = env[bin]; // 0..1
      const h = amp * (VB_H * 0.42);
      ribbonTop += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${(cy - h).toFixed(1)} `;
      // bottom edge traced in reverse to close the filled ribbon
      ribbonBot.unshift(`L${x.toFixed(1)},${(cy + h).toFixed(1)}`);
    }
    // landmark markers within the visible window
    for (let li = 0; li < map.landmarks.length; li++) {
      const lt = map.landmarks[li];
      for (const cand of [lt, lt + map.duration, lt - map.duration]) {
        if (cand >= winStart && cand <= winEnd) {
          const x = ((cand - winStart) / WINDOW_SEC) * VB_W;
          landmarkXs.push({ x, active: li === ui.nextLandmark });
        }
      }
    }
  }
  const ribbonBotStr = ribbonBot.join(" ");

  return (
    <main className="min-h-dvh w-full bg-[#140d0a] text-white overflow-hidden relative font-sans">
      {/* warm chamber-concert wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 18%, rgba(120,72,40,0.35), rgba(20,13,10,0) 60%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-6 pt-7 pb-2 max-w-5xl mx-auto">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Duet Follower
          </h1>
          <span className="text-base text-white/75 font-mono">748 · welcome home</span>
        </div>
        <p className="mt-2 text-base text-white/80 max-w-2xl">
          You keep the pulse. Karel&rsquo;s real recording listens and follows your tempo &mdash;
          a duet where his performance is the accompanist that adapts to you.
        </p>
      </header>

      {/* Ribbon */}
      <section className="relative z-10 px-6 mt-3 max-w-5xl mx-auto">
        <RibbonView
          phase={phase}
          ribbonTop={ribbonTop}
          ribbonBot={ribbonBotStr}
          landmarkXs={landmarkXs}
          pulse={ui.pulse}
        />
      </section>

      {/* Transport / status */}
      <section className="relative z-10 px-6 mt-5 max-w-5xl mx-auto">
        {phase === "intro" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-base text-white/80 text-center max-w-md">
              Tap a steady pulse with the <span className="font-mono text-white">spacebar</span>,
              the <span className="font-mono text-white">A&ndash;L</span> row, or by clicking the stage.
              The recording re-times itself to land on its next musical moment with each tap.
            </p>
            <button
              onClick={start}
              className="min-h-[44px] px-6 py-2.5 rounded-full bg-amber-400 text-[#140d0a] text-base font-semibold hover:bg-amber-300 transition-colors"
            >
              Start the duet
            </button>
          </div>
        )}

        {phase === "loading" && (
          <p className="text-base text-white/80 text-center py-8">Tuning to his recording&hellip;</p>
        )}

        {phase === "playing" && (
          <div className="flex flex-col items-center gap-5 py-2">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                doTap();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                doTap();
              }}
              className="min-h-[44px] min-w-[44px] px-8 py-4 rounded-2xl bg-amber-400/90 text-[#140d0a] text-xl font-semibold hover:bg-amber-300 active:scale-95 transition-all select-none"
              style={{
                boxShadow: `0 0 ${12 + ui.pulse * 40}px rgba(251,191,36,${0.25 + ui.pulse * 0.5})`,
              }}
            >
              TAP THE PULSE
            </button>

            <div className="grid grid-cols-3 gap-x-8 gap-y-1 text-center">
              <Stat label="your tempo" value={`${bpm(ui.beatPeriod)} bpm`} />
              <Stat label="follow rate" value={`${ui.rate.toFixed(2)}×`} />
              <Stat label="taps" value={String(ui.taps)} />
            </div>

            <p className="text-base text-white/75 text-center">
              Keep tapping. Speed up &rarr; his performance hurries to keep pace.
              Slow down &rarr; it breathes and waits with you.
            </p>
          </div>
        )}

        {phase === "playing" && sourceKind === "fallback" && (
          <p className="mt-4 text-base text-amber-300/95 text-center">
            Couldn&rsquo;t reach Karel&rsquo;s recording &mdash; following an offline piano phrase instead.
          </p>
        )}
      </section>

      {/* Design notes toggle */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="fixed bottom-4 right-4 z-20 min-h-[44px] px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-base text-white/90 transition-colors"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      <Link
        href="/dream"
        className="fixed bottom-4 left-4 z-20 min-h-[44px] px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-base text-white/90 transition-colors"
      >
        &larr; gallery
      </Link>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold text-white font-mono tabular-nums">{value}</span>
      <span className="text-base text-white/75">{label}</span>
    </div>
  );
}

// ─── Ribbon SVG (piano-roll / score-position) ────────────────────────────────
function RibbonView({
  phase,
  ribbonTop,
  ribbonBot,
  landmarkXs,
  pulse,
}: {
  phase: Phase;
  ribbonTop: string;
  ribbonBot: string;
  landmarkXs: { x: number; active: boolean }[];
  pulse: number;
}) {
  const playheadX = VB_W / 2; // playhead fixed at center; recording scrolls past it
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-[220px] sm:h-[300px]"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* center baseline */}
        <line x1={0} y1={VB_H / 2} x2={VB_W} y2={VB_H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {/* landmark markers (musical moments the recording aims for) */}
        {landmarkXs.map((m, i) => (
          <line
            key={i}
            x1={m.x}
            y1={VB_H * 0.12}
            x2={m.x}
            y2={VB_H * 0.88}
            stroke={m.active ? "rgba(251,191,36,0.85)" : "rgba(214,160,110,0.35)"}
            strokeWidth={m.active ? 2.5 : 1.5}
            strokeDasharray={m.active ? undefined : "3 5"}
          />
        ))}

        {/* the recording's envelope ribbon */}
        {phase === "playing" && ribbonTop && (
          <path
            d={`${ribbonTop} ${ribbonBot} Z`}
            fill="rgba(245,180,110,0.55)"
            stroke="rgba(255,214,160,0.85)"
            strokeWidth={1.2}
          />
        )}

        {phase !== "playing" && (
          <text
            x={VB_W / 2}
            y={VB_H / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.55)"
            fontSize={26}
            fontFamily="monospace"
          >
            {phase === "loading" ? "tuning…" : "press Start"}
          </text>
        )}

        {/* playhead (NOW) */}
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={VB_H}
          stroke="rgba(255,255,255,0.95)"
          strokeWidth={2}
        />
        <circle
          cx={playheadX}
          cy={VB_H / 2}
          r={8 + pulse * 22}
          fill="rgba(251,191,36,0.85)"
          opacity={0.4 + pulse * 0.6}
        />
        <circle cx={playheadX} cy={VB_H / 2} r={5} fill="rgba(255,255,255,0.95)" />
      </svg>
      <div className="flex justify-between px-3 py-1.5 text-base text-white/55 font-mono">
        <span>his recording &rarr; scrolls past</span>
        <span>now</span>
        <span>&larr; next moment</span>
      </div>
    </div>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div
        className="max-w-2xl mx-auto my-12 px-6 py-7 rounded-2xl bg-[#1b1310] border border-white/12"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold text-white">Design notes &mdash; Duet Follower</h2>
        <p className="mt-4 text-base text-white/80 leading-relaxed">
          What if Karel&rsquo;s real <em>Welcome Home</em> recording were an accompanist that
          <strong> listens to you</strong>? You provide the beat by tapping; the system estimates
          your tempo from the gaps between taps and drives the playback rate of his actual
          recording to follow your groove. You conduct his performance&rsquo;s pace.
        </p>
        <h3 className="mt-6 text-xl font-semibold text-white">The technique</h3>
        <p className="mt-2 text-base text-white/80 leading-relaxed">
          Onset &rarr; tempo estimate &rarr; interactive pacing. Each tap is an onset; recent
          inter-onset intervals give a median beat period. The recording is analyzed once into a
          coarse RMS envelope, and rising-edge peaks become musical &ldquo;landmarks.&rdquo; On each
          tap, the engine computes the recording-time gap to the next landmark and sets
          <span className="font-mono"> playbackRate = gap / beatPeriod</span>, smoothed, so his
          performance arrives at that moment one of <em>your</em> beats from now. It plays as one
          continuous, time-stretched source &mdash; <strong>not</strong> a granular grain cloud.
        </p>
        <h3 className="mt-6 text-xl font-semibold text-white">Honest notes</h3>
        <ul className="mt-2 text-base text-white/80 leading-relaxed list-disc pl-5 space-y-1">
          <li>
            This is onset-driven tempo <em>following</em>, not full audio-to-score DTW alignment.
            Landmarks are envelope peaks, not transcribed notes &mdash; an honest, tractable proxy.
          </li>
          <li>
            <span className="font-mono">playbackRate</span> time-stretch also shifts pitch slightly.
            Rate is clamped to 0.4&ndash;2.2&times; to keep his piano recognizable.
          </li>
          <li>
            Tempo estimate uses a short median of recent taps; it favors stability over instant
            response, so very erratic tapping settles rather than chasing every jitter.
          </li>
        </ul>
        <h3 className="mt-6 text-xl font-semibold text-white">Named references</h3>
        <ul className="mt-2 text-base text-white/80 leading-relaxed list-disc pl-5 space-y-1">
          <li>
            <strong>Matchmaker</strong> &mdash; open-source real-time piano score following
            (arXiv 2510.10087, Oct 2025).
          </li>
          <li>
            <strong>Christopher Raphael, Music Plus One</strong> &mdash; statistical automatic
            accompaniment.
          </li>
          <li>
            <strong>Roger Dannenberg / Barry Vercoe</strong> &mdash; foundational automatic-accompaniment
            systems.
          </li>
          <li>
            <strong>Arshia Cont, Antescofo</strong> &mdash; anticipatory score follower.
          </li>
        </ul>
        <p className="mt-6 text-base text-white/55">
          INPUT: keyboard / tap pulse &middot; OUTPUT: SVG/DOM &middot; TECHNIQUE: onset &rarr; tempo
          &rarr; interactive pacing of his real recording.
        </p>
        <button
          onClick={onClose}
          className="mt-6 min-h-[44px] px-5 py-2.5 rounded-full bg-amber-400 text-[#140d0a] text-base font-semibold hover:bg-amber-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
