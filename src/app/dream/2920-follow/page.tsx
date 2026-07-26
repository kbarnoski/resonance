"use client";

/* ───────────────────────────────────────────────────────────────────────────
   2920-follow — "Follow"

   ONE question: What if Resonance had an accompanist that follows YOU — you
   sing a known melody live, at your own tempo, with rubato and pauses, and it
   plays the accompaniment locked to YOUR position, not a click track?

   You are the instrument. You sing "Little Lantern" (a short original tune,
   shown as a glowing ribbon). Live pitch detection (YIN + parabolic interp,
   pitch.ts) feeds an online forward-path DTW score-follower (follower.ts) that
   infers your beat position moment to moment. Pads / bass / arps fire on the
   DTW head crossing each beat (audio.ts) — so the accompaniment WAITS when you
   pause and CATCHES UP when you rush. No mic? A seeded virtual singer performs
   with rubato through the SAME follower, so the piece is fully alive headless.

   Visuals are SVG (bounded element pools mutated by ref).
─────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectPitch } from "./pitch";
import { ScoreFollower } from "./follower";
import { Accompanist } from "./audio";
import {
  MELODY,
  TOTAL_BEATS,
  MELODY_MIN_MIDI,
  MELODY_MAX_MIDI,
  buildContour,
  chordAtBeat,
  VirtualSinger,
} from "./reference";

// ── SVG geometry (module scope — stable, no deps) ───────────────────────────
const W = 1000;
const H = 440;
const PADX = 56;
const PADY = 52;
const TRAIL = 48;
const BLOOM = 10;

function xForBeat(beat: number): number {
  return PADX + (beat / TOTAL_BEATS) * (W - 2 * PADX);
}
function yForMidi(midi: number): number {
  const t = (midi - MELODY_MIN_MIDI) / (MELODY_MAX_MIDI - MELODY_MIN_MIDI);
  return H - PADY - t * (H - 2 * PADY);
}
/** Warm amber→gold colour by pitch height. Raw colour lives only in the art. */
function warm(midi: number, light = 66): string {
  const t = (midi - MELODY_MIN_MIDI) / (MELODY_MAX_MIDI - MELODY_MIN_MIDI);
  const hue = 30 + t * 22; // amber → gold
  return `hsl(${hue} 78% ${light}%)`;
}

function makeAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

type Source = "mic" | "demo" | null;

interface BloomSlot {
  born: number;
  x: number;
  y: number;
  hue: number;
  active: boolean;
}

export default function FollowPage() {
  const contour = useMemo(() => buildContour(), []);

  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [source, setSource] = useState<Source>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── Engine refs ──
  const ctxRef = useRef<AudioContext | null>(null);
  const accRef = useRef<Accompanist | null>(null);
  const followerRef = useRef<ScoreFollower | null>(null);
  const singerRef = useRef<VirtualSinger | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<Source>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const nextBeatRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // ── Visual pool refs ──
  const playheadRef = useRef<SVGGElement | null>(null);
  const liveDotRef = useRef<SVGCircleElement | null>(null);
  const trailEls = useRef<(SVGCircleElement | null)[]>([]);
  const trailOp = useRef<number[]>(new Array(TRAIL).fill(0));
  const trailIdx = useRef<number>(0);
  const bloomEls = useRef<(SVGCircleElement | null)[]>([]);
  const bloomState = useRef<BloomSlot[]>(
    Array.from({ length: BLOOM }, () => ({ born: 0, x: 0, y: 0, hue: 40, active: false })),
  );
  const bloomIdx = useRef<number>(0);
  const bpmTextRef = useRef<SVGTextElement | null>(null);
  const confBarRef = useRef<SVGRectElement | null>(null);
  const statusTextRef = useRef<SVGTextElement | null>(null);

  // Precompute the reference ribbon rectangles.
  const melodyRects = useMemo(
    () =>
      MELODY.map((n, i) => {
        const x1 = xForBeat(n.beat);
        const x2 = xForBeat(n.beat + n.durBeats);
        const y = yForMidi(n.pitchMidi);
        return {
          key: i,
          x: x1 + 2,
          y: y - 8,
          w: Math.max(6, x2 - x1 - 4),
          h: 16,
          color: warm(n.pitchMidi),
        };
      }),
    [],
  );

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const ensureCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = makeAudioContext();
    return ctxRef.current;
  }, []);

  const restart = useCallback(() => {
    followerRef.current?.reset();
    singerRef.current?.reset();
    nextBeatRef.current = 0;
  }, []);

  const startDemo = useCallback(() => {
    if (phase === "running") return;
    const ctx = ensureCtx();
    void ctx.resume();
    accRef.current = new Accompanist(ctx);
    followerRef.current = new ScoreFollower(contour);
    singerRef.current = new VirtualSinger(0x2920);
    nextBeatRef.current = 0;
    lastTsRef.current = 0;
    sourceRef.current = "demo";
    setSource("demo");
    setMicError(null);
    setPhase("running");
  }, [phase, ensureCtx, contour]);

  const startMic = useCallback(async () => {
    if (phase === "running") return;
    const ctx = ensureCtx();
    await ctx.resume();
    accRef.current = new Accompanist(ctx);
    followerRef.current = new ScoreFollower(contour);
    nextBeatRef.current = 0;
    lastTsRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      src.connect(an); // analyser only — never to destination (no feedback)
      analyserRef.current = an;
      timeBufRef.current = new Float32Array(an.fftSize);
      sourceRef.current = "mic";
      setSource("mic");
      setMicError(null);
    } catch {
      setMicError(
        "Microphone unavailable or denied — the seeded virtual singer will perform instead.",
      );
      singerRef.current = new VirtualSinger(0x2920);
      sourceRef.current = "demo";
      setSource("demo");
    }
    setPhase("running");
  }, [phase, ensureCtx, contour]);

  // ── The performance loop ──
  useEffect(() => {
    if (phase !== "running") return;

    const fireBeats = (headBeat: number, acc: Accompanist, ctx: AudioContext) => {
      while (nextBeatRef.current < TOTAL_BEATS && Math.floor(headBeat) >= nextBeatRef.current) {
        const b = nextBeatRef.current;
        const when = ctx.currentTime + 0.02;
        const chord = chordAtBeat(b);
        if (chord.beat === b) {
          acc.pad(chord, when);
          acc.bass(chord.bassMidi, when);
        }
        const arpMidi = chord.padMidis[b % chord.padMidis.length] + 12;
        acc.arp(arpMidi, when);
        // bloom at this beat
        const slot = bloomState.current[bloomIdx.current % BLOOM];
        slot.born = performance.now();
        slot.x = xForBeat(b + 0.5);
        slot.y = yForMidi(arpMidi - 12);
        slot.hue = 30 + ((arpMidi - MELODY_MIN_MIDI) / 16) * 22;
        slot.active = true;
        bloomIdx.current++;
        nextBeatRef.current++;
      }
    };

    const draw = (
      headBeat: number,
      confidence: number,
      liveMidi: number | null,
      bpm: number,
      waiting: boolean,
      now: number,
    ) => {
      const reduced = reducedRef.current;
      const hb = Math.max(0, Math.min(TOTAL_BEATS, headBeat));
      const px = xForBeat(hb);

      if (playheadRef.current) {
        playheadRef.current.setAttribute("transform", `translate(${px} 0)`);
        playheadRef.current.setAttribute("opacity", `${0.3 + confidence * 0.6}`);
      }

      // Live pitch dot + trail.
      if (liveMidi !== null) {
        const py = yForMidi(Math.max(MELODY_MIN_MIDI, Math.min(MELODY_MAX_MIDI, liveMidi)));
        if (liveDotRef.current) {
          liveDotRef.current.setAttribute("cx", `${px}`);
          liveDotRef.current.setAttribute("cy", `${py}`);
          liveDotRef.current.setAttribute("opacity", "0.95");
        }
        const i = trailIdx.current;
        const el = trailEls.current[i];
        if (el) {
          el.setAttribute("cx", `${px}`);
          el.setAttribute("cy", `${py}`);
        }
        trailOp.current[i] = 0.85;
        trailIdx.current = (i + 1) % TRAIL;
      } else if (liveDotRef.current) {
        liveDotRef.current.setAttribute("opacity", "0.25");
      }

      // Fade the trail.
      const fade = reduced ? 0.9 : 0.94;
      for (let i = 0; i < TRAIL; i++) {
        const op = (trailOp.current[i] *= fade);
        const el = trailEls.current[i];
        if (el) el.setAttribute("opacity", `${op < 0.02 ? 0 : op}`);
      }

      // Chord blooms.
      const life = reduced ? 1.0 : 1.7;
      const maxR = reduced ? 20 : 64;
      for (let i = 0; i < BLOOM; i++) {
        const s = bloomState.current[i];
        const el = bloomEls.current[i];
        if (!el) continue;
        if (!s.active) {
          el.setAttribute("opacity", "0");
          continue;
        }
        const age = (now - s.born) / 1000;
        if (age > life) {
          s.active = false;
          el.setAttribute("opacity", "0");
          continue;
        }
        const p = age / life;
        el.setAttribute("cx", `${s.x}`);
        el.setAttribute("cy", `${s.y}`);
        el.setAttribute("r", `${6 + p * maxR}`);
        el.setAttribute("fill", `hsl(${s.hue} 80% 65%)`);
        el.setAttribute("opacity", `${(1 - p) * 0.4}`);
      }

      // Readouts.
      if (bpmTextRef.current) {
        bpmTextRef.current.textContent = bpm > 0 ? `${Math.round(bpm)} bpm` : "— bpm";
      }
      if (confBarRef.current) {
        confBarRef.current.setAttribute("width", `${Math.max(0, confidence) * 120}`);
      }
      if (statusTextRef.current) {
        statusTextRef.current.textContent = waiting
          ? "listening — waiting for you"
          : "following";
      }
    };

    const frame = (ts: number) => {
      const acc = accRef.current;
      const follower = followerRef.current;
      const ctx = ctxRef.current;
      if (acc && follower && ctx) {
        const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0.016;
        lastTsRef.current = ts;

        let liveMidi: number | null = null;
        if (sourceRef.current === "demo" && singerRef.current) {
          const sf = singerRef.current.step(dt);
          if (sf.wrapped) {
            follower.reset();
            nextBeatRef.current = 0;
          }
          acc.setVoice(sf.midi);
          liveMidi = sf.midi;
        } else if (sourceRef.current === "mic" && analyserRef.current && timeBufRef.current) {
          analyserRef.current.getFloatTimeDomainData(timeBufRef.current);
          const pr = detectPitch(timeBufRef.current, ctx.sampleRate);
          liveMidi = pr.voiced ? pr.midi : null;
        }

        const st = follower.step(liveMidi, ts);
        fireBeats(st.headBeat, acc, ctx);
        draw(st.headBeat, st.confidence, liveMidi, st.bpm, st.waiting, ts);
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // ── Full teardown on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      accRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            2920 · follow
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            An accompanist that follows you
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Sing the melody at your own tempo — pause, breathe, rush — and the
            pads, bass and arpeggios stay locked to <em>your</em> position, tracked
            note-by-note by an online-DTW score follower rather than a click track.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <>
              <button
                onClick={startMic}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start singing
              </button>
              <button
                onClick={startDemo}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Play the demo singer
              </button>
            </>
          ) : (
            <>
              <button
                onClick={restart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Restart from the top
              </button>
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {source === "mic" ? "live voice" : "virtual singer"}
              </span>
            </>
          )}
        </div>

        {micError && (
          <p className="mb-4 max-w-2xl text-sm text-destructive">{micError}</p>
        )}

        <div className="rounded-lg border border-border bg-background/60 p-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Lantern path: the reference melody as a glowing ribbon, a playhead at your tracked position, your live pitch trace, and chord blooms."
          >
            <defs>
              <radialGradient id="bg2920" cx="50%" cy="38%" r="80%">
                <stop offset="0%" stopColor="#1a1330" />
                <stop offset="100%" stopColor="#0a0813" />
              </radialGradient>
              <filter id="glow2920" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width={W} height={H} fill="url(#bg2920)" />

            {/* Beat gridlines — quiet. */}
            {Array.from({ length: TOTAL_BEATS + 1 }).map((_, b) => (
              <line
                key={b}
                x1={xForBeat(b)}
                y1={PADY - 10}
                x2={xForBeat(b)}
                y2={H - PADY + 10}
                stroke="#ffffff"
                strokeOpacity={b % 4 === 0 ? 0.1 : 0.04}
                strokeWidth={1}
              />
            ))}

            {/* Reference melody ribbon. */}
            <g filter="url(#glow2920)">
              {melodyRects.map((r) => (
                <rect
                  key={r.key}
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={7}
                  fill={r.color}
                  fillOpacity={0.28}
                  stroke={r.color}
                  strokeOpacity={0.7}
                  strokeWidth={1}
                />
              ))}
            </g>

            {/* Chord blooms. */}
            <g filter="url(#glow2920)">
              {Array.from({ length: BLOOM }).map((_, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    bloomEls.current[i] = el;
                  }}
                  cx={-100}
                  cy={-100}
                  r={6}
                  fill="hsl(40 80% 65%)"
                  opacity={0}
                />
              ))}
            </g>

            {/* Live pitch trace. */}
            <g filter="url(#glow2920)">
              {Array.from({ length: TRAIL }).map((_, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    trailEls.current[i] = el;
                  }}
                  cx={-100}
                  cy={-100}
                  r={3.5}
                  fill="hsl(265 75% 82%)"
                  opacity={0}
                />
              ))}
              <circle
                ref={liveDotRef}
                cx={-100}
                cy={-100}
                r={7}
                fill="hsl(265 80% 88%)"
                opacity={0}
              />
            </g>

            {/* Tempo-stretching playhead — sits where the DTW head is. */}
            <g ref={playheadRef} opacity={0}>
              <line
                x1={0}
                y1={PADY - 14}
                x2={0}
                y2={H - PADY + 14}
                stroke="hsl(265 80% 78%)"
                strokeOpacity={0.55}
                strokeWidth={2}
              />
              <circle cx={0} cy={PADY - 18} r={5} fill="hsl(265 85% 82%)" />
            </g>

            {/* Readouts — small, unobtrusive. */}
            <text
              ref={statusTextRef}
              x={PADX}
              y={26}
              fill="#ffffff"
              fillOpacity={0.7}
              fontSize={13}
              fontFamily="monospace"
            >
              ready
            </text>
            <text
              ref={bpmTextRef}
              x={W - PADX}
              y={26}
              fill="#ffffff"
              fillOpacity={0.7}
              fontSize={13}
              fontFamily="monospace"
              textAnchor="end"
            >
              — bpm
            </text>
            <rect
              x={W - PADX - 120}
              y={34}
              width={0}
              height={4}
              rx={2}
              fill="hsl(265 80% 78%)"
              ref={confBarRef}
            />
          </svg>
        </div>

        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          The violet playhead marks the position the follower infers for you. When
          you hold or pause, it waits; when you leap ahead, it catches up — because
          position is driven by the alignment head, not a clock.
        </p>
      </div>

      <div className="fixed bottom-5 right-5">
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold text-foreground">
              Follow — design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The question.</strong> What if the
                accompaniment followed <em>you</em> — you sing a known tune at your own
                elastic tempo and the band stays with you, not a metronome?
              </p>
              <p>
                <strong className="text-foreground">How it follows.</strong> Your voice
                is pitch-tracked (YIN + parabolic interpolation) into a continuous
                MIDI stream. An online forward-path DTW aligns that stream to the
                reference contour with a banded monotone recursion,
                <span className="font-mono text-xs">
                  {" "}D&apos;[j] = cost(j) + min(D[j], D[j-1], D[j-2])
                </span>
                . The alignment head is the position; pads, bass and arps fire as it
                crosses each beat, so they wait through pauses and catch up on rushes.
              </p>
              <p>
                <strong className="text-foreground">Headless.</strong> With no mic, a
                seeded virtual singer (mulberry32, 0x2920) performs with rubato and
                wobble through the same follower — you can watch the tracking work.
              </p>
              <p>
                <strong className="text-foreground">Lineage.</strong> Dannenberg&apos;s
                computer accompaniment (1984), Simon Dixon&apos;s MATCH online DTW,
                Matchmaker (arXiv:2510.10087, 2025), The ACCompanion (IJCAI 2023,
                arXiv:2304.12939).
              </p>
              <p>
                <strong className="text-foreground">Limits.</strong> Monophonic voice
                only; browser pitch detection struggles in noisy rooms; the follower
                is monotone (no jump-back), so a full restart uses the button.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
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
