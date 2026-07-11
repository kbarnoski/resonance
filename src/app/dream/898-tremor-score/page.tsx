"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildScore,
  buildFallbackQuakes,
  parseFeed,
  type BuiltScore,
  type ScoreEvent,
} from "./score";
import {
  buildRig,
  scheduleVoice,
  closeRig,
  type AudioRig,
} from "./audio";

const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

const W = 1000;
const H = 460;
const PAD_X = 56;
const PAD_TOP = 36;
const PAD_BOT = 64;
const ACCENT = "#c4b5fd"; // violet-300

type Status = "idle" | "loading" | "playing" | "error";

export default function TremorScorePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [score, setScore] = useState<BuiltScore | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [playhead, setPlayhead] = useState(0); // 0..1 across the piece
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [showNotes, setShowNotes] = useState(false);

  const rigRef = useRef<AudioRig | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const firedRef = useRef<Set<number>>(new Set());

  const stopPlayback = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    closeRig(rigRef.current);
    rigRef.current = null;
    firedRef.current = new Set();
    setLit(new Set());
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const runPlayback = useCallback(
    (built: BuiltScore) => {
      stopPlayback();
      const rig = buildRig();
      rigRef.current = rig;
      if (rig.ctx.state === "suspended") void rig.ctx.resume();

      const audioStart = rig.ctx.currentTime + 0.15;
      startRef.current = audioStart;
      setStatus("playing");

      const tick = () => {
        const rigNow = rigRef.current;
        if (!rigNow) return;
        const elapsed = rigNow.ctx.currentTime - audioStart;
        const frac = Math.min(1, Math.max(0, elapsed / built.duration));
        setPlayhead(frac);

        // schedule any events whose moment has just passed (with lookahead)
        const lookahead = 0.2;
        const litNow = new Set<number>();
        built.events.forEach((ev, i) => {
          if (
            !firedRef.current.has(i) &&
            ev.at <= elapsed + lookahead &&
            ev.at >= elapsed - 0.05
          ) {
            scheduleVoice(rigNow, ev, audioStart + ev.at);
            firedRef.current.add(i);
          }
          // a voice is "lit" while it is sounding
          if (elapsed >= ev.at && elapsed <= ev.at + ev.dur) litNow.add(i);
        });
        setLit(litNow);

        if (elapsed >= built.duration + 6) {
          setStatus("idle");
          stopPlayback();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopPlayback],
  );

  const onListen = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    setPlayhead(0);
    try {
      const res = await fetch(FEED_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const json = await res.json();
      const quakes = parseFeed(json);
      if (quakes.length === 0) throw new Error("no quakes in feed");
      const built = buildScore(quakes);
      setScore(built);
      setSourceLabel(
        `USGS live feed — ${quakes.length} quakes, last 24h`,
      );
      runPlayback(built);
    } catch (err) {
      const fallback = buildScore(buildFallbackQuakes());
      setScore(fallback);
      setSourceLabel(
        `synthetic fallback — ${fallback.quakes.length} simulated quakes`,
      );
      setErrorMsg(
        `Could not reach the USGS live feed (${
          err instanceof Error ? err.message : "network error"
        }). Playing a built-in synthetic dataset instead.`,
      );
      runPlayback(fallback);
    }
  }, [runPlayback]);

  // ---- SVG geometry helpers ----
  const plotX = (x: number) => PAD_X + x * (W - PAD_X * 2);
  const plotY = (y: number) => PAD_TOP + y * (H - PAD_TOP - PAD_BOT);

  const playheadX = plotX(playhead);

  const events: ScoreEvent[] = score?.events ?? [];

  return (
    <main className="min-h-screen bg-[#08080b] px-6 py-10 text-foreground selection:bg-violet-300/30">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            898 · tremor-score
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Tremor Score
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A live planetary earthquake feed composes a piece &mdash; deciding
            who plays, when, and in what register, while a fixed consonant mode
            keeps every note in tune.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={status === "playing" ? stopPlayback : onListen}
            disabled={status === "loading"}
            className="min-h-[44px] rounded-full bg-violet-300 px-5 py-2.5 text-base font-medium text-[#08080b] transition-colors hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading"
              ? "Fetching the Earth…"
              : status === "playing"
                ? "Stop"
                : "Listen to the last 24 hours of Earth"}
          </button>
          {sourceLabel && (
            <span className="font-mono text-sm text-muted-foreground">
              {sourceLabel}
            </span>
          )}
        </div>

        {errorMsg && (
          <p className="mb-4 max-w-2xl text-base text-violet-300" role="alert">
            {errorMsg}
          </p>
        )}

        <figure className="overflow-hidden rounded-xl border border-border bg-[#0c0c11]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full"
            role="img"
            aria-label="Earthquake data score"
          >
            {/* faint world grid (longitude verticals, latitude horizontals) */}
            <g stroke="#ffffff" strokeOpacity={0.05}>
              {Array.from({ length: 9 }).map((_, i) => {
                const x = PAD_X + (i / 8) * (W - PAD_X * 2);
                return (
                  <line key={`v${i}`} x1={x} y1={PAD_TOP} x2={x} y2={H - PAD_BOT} />
                );
              })}
              {Array.from({ length: 5 }).map((_, i) => {
                const y = PAD_TOP + (i / 4) * (H - PAD_TOP - PAD_BOT);
                return (
                  <line key={`h${i}`} x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} />
                );
              })}
            </g>

            {/* register labels */}
            <g
              fontFamily="ui-monospace, monospace"
              fontSize={11}
              fill="#ffffff"
              fillOpacity={0.4}
            >
              <text x={10} y={PAD_TOP + 6}>
                high
              </text>
              <text x={10} y={H - PAD_BOT}>
                low
              </text>
              <text x={PAD_X} y={H - PAD_BOT + 24}>
                t = 0h
              </text>
              <text x={W - PAD_X} y={H - PAD_BOT + 24} textAnchor="end">
                24h
              </text>
            </g>

            {/* time axis */}
            <line
              x1={PAD_X}
              y1={H - PAD_BOT}
              x2={W - PAD_X}
              y2={H - PAD_BOT}
              stroke="#ffffff"
              strokeOpacity={0.2}
            />

            {/* quake marks */}
            {events.map((ev, i) => {
              const cx = plotX(ev.x);
              const cy = plotY(ev.y);
              const r = 2 + Math.max(0, ev.q.mag) * 2.2;
              const isLit = lit.has(i);
              const past = ev.x <= playhead;
              // recency: more recent quakes (larger x) brighter
              const baseOpacity = 0.18 + ev.x * 0.32;
              return (
                <g key={i}>
                  {/* vertical register mark */}
                  <line
                    x1={cx}
                    y1={cy}
                    x2={cx}
                    y2={H - PAD_BOT}
                    stroke={isLit ? ACCENT : "#ffffff"}
                    strokeOpacity={isLit ? 0.5 : baseOpacity * 0.5}
                    strokeWidth={isLit ? 1.4 : 0.6}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isLit ? r + 3 : r}
                    fill={isLit ? ACCENT : "#ffffff"}
                    fillOpacity={isLit ? 0.95 : past ? baseOpacity * 1.4 : baseOpacity}
                    stroke={isLit ? ACCENT : "none"}
                    strokeOpacity={isLit ? 0.6 : 0}
                    strokeWidth={isLit ? 6 : 0}
                  />
                </g>
              );
            })}

            {/* playhead */}
            {status === "playing" && (
              <line
                x1={playheadX}
                y1={PAD_TOP - 8}
                x2={playheadX}
                y2={H - PAD_BOT + 8}
                stroke={ACCENT}
                strokeWidth={1.6}
                strokeOpacity={0.85}
              />
            )}
          </svg>
        </figure>

        {/* small lon/lat dot field — secondary map */}
        <div className="mt-4 flex items-start gap-6">
          <svg
            viewBox="0 0 360 180"
            className="w-64 rounded-lg border border-border bg-[#0c0c11]"
            role="img"
            aria-label="Epicentre map"
          >
            <rect x={0} y={0} width={360} height={180} fill="none" />
            <line x1={180} y1={0} x2={180} y2={180} stroke="#fff" strokeOpacity={0.06} />
            <line x1={0} y1={90} x2={360} y2={90} stroke="#fff" strokeOpacity={0.06} />
            {events.map((ev, i) => {
              const mx = ((ev.q.lon + 180) / 360) * 360;
              const my = ((90 - ev.q.lat) / 180) * 180;
              const isLit = lit.has(i);
              return (
                <circle
                  key={i}
                  cx={mx}
                  cy={my}
                  r={isLit ? 3.4 : 1.6}
                  fill={isLit ? ACCENT : "#ffffff"}
                  fillOpacity={isLit ? 0.95 : 0.3}
                />
              );
            })}
          </svg>
          <div className="flex-1 font-mono text-sm leading-relaxed text-muted-foreground">
            <p>x &rarr; time (24h compressed to 90s)</p>
            <p>y &rarr; register (magnitude picks the octave)</p>
            <p>radius &rarr; magnitude · pan &rarr; longitude</p>
            <p>latitude &rarr; scale degree · depth &rarr; timbre</p>
          </div>
        </div>

        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="font-mono text-sm text-violet-300 underline-offset-4 hover:underline"
          >
            {showNotes ? "− Design notes" : "+ Design notes"}
          </button>
          {showNotes && (
            <div className="mt-3 max-w-2xl space-y-3 text-base leading-relaxed text-muted-foreground">
              <p>
                The data decides <em>structure</em> &mdash; who plays, when, and
                in what register &mdash; never detune. Every pitch is quantised
                to a fixed consonant mode (a warm B-flat pentatonic/Dorian
                blend), so a chaotic day of tremors still resolves into a
                listenable piece.
              </p>
              <p>
                Magnitude sets octave, length and loudness; depth sets timbre
                brightness via a lowpass and partial count; longitude pans;
                latitude chooses the scale degree. Clusters of aftershocks
                become dense overlapping flurries; quiet stretches become sparse
                solos.
              </p>
              <p className="text-muted-foreground">
                Lineage: Ryoji Ikeda&rsquo;s <em>data.path</em> /{" "}
                <em>datamatics</em> and Florian Dombois&rsquo; &ldquo;Auditory
                Seismology.&rdquo; Research anchor: OpenSeisML (arXiv 2605.20539,
                May 2026). Full notes in the folder README.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
