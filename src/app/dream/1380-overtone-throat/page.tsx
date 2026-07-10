"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { OvertoneEngine, type FrameState } from "./audio";
import {
  HARMONICS,
  NUM_HARMONICS,
  RAMP,
  TRACE_COLS,
  clamp,
  freqFromMidi,
  noteName,
  traceString,
} from "./analysis";

// ─────────────────────────────────────────────────────────────────────────────
// 1380 · OVERTONE THROAT
// Sing ONE sustained note; the piece extracts the relative strength of its
// harmonics (overtones 1–12) in real time from an f0-relative FFT, and lets those
// overtones be PLAYED — a 12-partial drone bank sustains and amplifies the
// partials you emphasize, so leaning your vowel/timbre "walks a bright cursor up
// the harmonic ladder" (Tuvan khoomei / throat-singing trance). The visual
// surface is a GLYPH-TERMINAL: the harmonic ladder as rows of monospace glyphs
// whose density animates with each overtone's energy — an oscilloscope-meets-poem.
//
// INPUT: microphone (harmonic analysis, not just level) + note picker to lock f0.
// OUTPUT: self-played overtone drone bank (Web Audio) + a living monospace ladder.
// FALLBACK: mic denied/silent → an auto sweep walks the ladder so it still sings.
// REFERENCE: Tanya Tagaq (living throat singer) · Wolfgang Saus (overtone pedagogy).
// LINEAGE: cycle-2 of 1270-glyph-organ — the glyph-terminal as an instrument surface.
// ─────────────────────────────────────────────────────────────────────────────

const MIDI_MIN = 33; // A1 ≈ 55 Hz
const MIDI_MAX = 57; // A3 ≈ 220 Hz
const DEFAULT_MIDI = 45; // A2 = 110 Hz

/** Build a display FrameState for the pre-Begin idle sweep (visuals only). */
function makeIdleState(phase: number): FrameState {
  const sustain = new Array(NUM_HARMONICS).fill(0);
  const center = 5.5 + 4.5 * Math.sin(phase);
  for (let h = 1; h <= NUM_HARMONICS; h++) {
    const d = h - 1 - center;
    sustain[h - 1] = Math.exp(-(d * d) / (2 * 1.5 * 1.5));
  }
  sustain[0] = Math.max(sustain[0], 0.5);
  let dominant = 1;
  let best = -1;
  for (let h = 1; h < NUM_HARMONICS; h++) {
    if (sustain[h] > best) {
      best = sustain[h];
      dominant = h;
    }
  }
  return { emphasis: sustain, sustain, dominant, f0: 0, rms: 0, micActive: false };
}

export default function OvertoneThroat() {
  const [begun, setBegun] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [midi, setMidi] = useState(DEFAULT_MIDI);

  const engineRef = useRef<OvertoneEngine | null>(null);
  const reducedRef = useRef(false);
  const rafRef = useRef(0);
  const idlePhaseRef = useRef(Math.PI / 2);
  const frameCountRef = useRef(0);

  // History rings (one per harmonic) — the oscilloscope trace for each row.
  const histRef = useRef<number[][]>(
    Array.from({ length: NUM_HARMONICS }, () => new Array(TRACE_COLS).fill(0)),
  );

  // DOM refs updated directly in the loop (avoid 60 fps React re-renders).
  const traceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const markerRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const domRef = useRef<HTMLSpanElement | null>(null);

  const f0 = freqFromMidi(midi);
  const f0Note = noteName(f0);

  // ── The render loop — alive from load (idle sweep) and after Begin (audio) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    let last = performance.now();

    const frame = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const reduced = reducedRef.current;

      const eng = engineRef.current;
      let state: FrameState;
      if (eng) {
        state = eng.update(dt, reduced);
      } else {
        idlePhaseRef.current += dt * (reduced ? 0.06 : 0.14);
        state = makeIdleState(idlePhaseRef.current);
      }

      // Scroll each history ring (slower cadence under reduced motion).
      frameCountRef.current++;
      const advance = reduced ? frameCountRef.current % 3 === 0 : true;
      if (advance) {
        const hist = histRef.current;
        for (let h = 0; h < NUM_HARMONICS; h++) {
          const row = hist[h];
          row.shift();
          row.push(clamp(state.sustain[h], 0, 1));
        }
      }

      // Render the 12 rows. Display order: harmonic 12 at top → 1 at bottom.
      for (let disp = 0; disp < NUM_HARMONICS; disp++) {
        const hIdx = NUM_HARMONICS - 1 - disp;
        const traceEl = traceRefs.current[disp];
        const markerEl = markerRefs.current[disp];
        if (traceEl) {
          traceEl.textContent = traceString(histRef.current[hIdx], RAMP);
          const cur = clamp(state.sustain[hIdx], 0, 1);
          if (hIdx === state.dominant) {
            // Bright emerald cursor-row = the overtone you're shaping toward.
            traceEl.style.color = `hsl(152 80% ${Math.max(64, 58 + cur * 32)}%)`;
          } else {
            const hue = 268 - (hIdx / (NUM_HARMONICS - 1)) * 82; // violet→cyan
            traceEl.style.color = `hsl(${hue} 72% ${44 + cur * 44}%)`;
          }
        }
        if (markerEl) {
          markerEl.textContent = hIdx === state.dominant ? "►" : " ";
        }
      }

      // Live readouts via refs (no re-render).
      if (badgeRef.current) {
        if (!eng) {
          badgeRef.current.textContent = "○ idle";
          badgeRef.current.className = "font-mono text-base text-white/55";
        } else if (state.micActive) {
          badgeRef.current.textContent = "● mic";
          badgeRef.current.className = "font-mono text-base text-emerald-300/95";
        } else {
          badgeRef.current.textContent = "○ auto";
          badgeRef.current.className = "font-mono text-base text-amber-300/95";
        }
      }
      if (domRef.current) {
        const m = HARMONICS[state.dominant];
        domRef.current.textContent = `H${m.h} · ${m.ratio} · ${m.interval}`;
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Begin: build the drone bank (auto sweep sings immediately, mic optional) ─
  const begin = useCallback(() => {
    if (engineRef.current) return;
    engineRef.current = new OvertoneEngine(freqFromMidi(midi));
    setBegun(true);
    setStopped(false);
  }, [midi]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setBegun(false);
    setStopped(true);
    setMicState("off");
  }, []);

  const enableMic = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    const ok = await eng.enableMic();
    setMicState(ok ? "on" : "denied");
  }, []);

  const detectPitch = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const f = eng.detectPitch();
    if (f < 0) return;
    const m = clamp(noteName(f).midi, MIDI_MIN, MIDI_MAX);
    setMidi(m);
    eng.setF0(freqFromMidi(m));
  }, []);

  const shiftMidi = useCallback((delta: number) => {
    setMidi((prev) => {
      const next = clamp(prev + delta, MIDI_MIN, MIDI_MAX);
      engineRef.current?.setF0(freqFromMidi(next));
      return next;
    });
  }, []);

  const btn =
    "min-h-[44px] px-4 py-2.5 rounded-lg font-mono text-base transition-colors";

  return (
    <main className="relative min-h-screen w-full bg-[#070613] text-white/95">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-7 sm:px-7">
        {/* Title + one-sentence description */}
        <header className="flex flex-col gap-2">
          <h1 className="font-mono text-2xl text-white/95 sm:text-3xl">
            Overtone Throat
          </h1>
          <p className="max-w-2xl text-base text-white/75">
            Sing one steady note and{" "}
            <span className="text-violet-300">play its hidden overtone ladder</span>
            : the throat listens to your timbre, then a drone bank blooms and
            sustains the partials you emphasize — a bright cursor walking up the
            harmonics like a Tuvan throat singer.
          </p>
        </header>

        {/* Transport + tuning */}
        <div className="flex flex-wrap items-center gap-3">
          {!begun ? (
            <button
              onClick={begin}
              className={`${btn} bg-violet-400/90 text-[#100a1f] hover:bg-violet-300`}
            >
              ▶ Begin
            </button>
          ) : (
            <button
              onClick={stop}
              className={`${btn} bg-rose-500/85 text-white hover:bg-rose-400`}
            >
              ■ Stop
            </button>
          )}

          <button
            onClick={enableMic}
            disabled={!begun || micState === "on"}
            className={`${btn} border ${
              micState === "on"
                ? "border-emerald-300/70 bg-emerald-400/15 text-emerald-100"
                : "border-white/20 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
            } disabled:opacity-40`}
          >
            {micState === "on" ? "● mic: singing in" : "○ sing / hum (mic)"}
          </button>

          <button
            onClick={detectPitch}
            disabled={micState !== "on"}
            className={`${btn} border border-white/20 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] disabled:opacity-40`}
          >
            ◎ detect pitch
          </button>

          {/* Fundamental note picker */}
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-2 py-1">
            <button
              onClick={() => shiftMidi(-1)}
              aria-label="Lower fundamental"
              className="min-h-[44px] min-w-[44px] rounded-md font-mono text-xl text-white/80 hover:bg-white/[0.08]"
            >
              −
            </button>
            <span className="min-w-[7ch] text-center font-mono text-base text-white/95">
              {f0Note.name}
            </span>
            <button
              onClick={() => shiftMidi(1)}
              aria-label="Raise fundamental"
              className="min-h-[44px] min-w-[44px] rounded-md font-mono text-xl text-white/80 hover:bg-white/[0.08]"
            >
              +
            </button>
          </div>
        </div>

        {/* Readouts */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-base">
          <span ref={badgeRef} className="text-white/55">
            ○ idle
          </span>
          <span className="text-white/75">
            fundamental{" "}
            <span className="text-violet-300">
              {f0.toFixed(1)} Hz · {f0Note.name}
            </span>
          </span>
          <span className="text-white/75">
            dominant overtone{" "}
            <span ref={domRef} className="text-emerald-300/95">
              H2 · 2:1 · octave
            </span>
          </span>
        </div>

        {micState === "denied" ? (
          <p className="font-mono text-base text-rose-300">
            mic unavailable — the throat is running its auto sweep so it still
            sings. Check permissions and reload to sing in.
          </p>
        ) : null}

        {/* ── The glyph-terminal: the harmonic ladder as living monospace rows ── */}
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#050411]/80 p-4">
          <div className="min-w-[640px] font-mono text-base leading-[1.35] tracking-tight">
            {Array.from({ length: NUM_HARMONICS }).map((_, disp) => {
              const hIdx = NUM_HARMONICS - 1 - disp;
              const m = HARMONICS[hIdx];
              return (
                <div key={hIdx} className="flex items-center whitespace-pre">
                  <span
                    ref={(el) => {
                      markerRefs.current[disp] = el;
                    }}
                    className="w-[1.5ch] text-emerald-300"
                  >
                    {" "}
                  </span>
                  <span className="text-white/70">
                    {`H${String(m.h).padStart(2, " ")} `}
                  </span>
                  <span className="text-white/55">
                    {`${m.ratio.padEnd(5, " ")}${m.interval.padEnd(15, " ")}`}
                  </span>
                  <span className="text-white/25">{"│"}</span>
                  <span
                    ref={(el) => {
                      traceRefs.current[disp] = el;
                    }}
                    style={{ color: "hsl(210 70% 50%)" }}
                  >
                    {" ".repeat(TRACE_COLS)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="max-w-2xl font-mono text-base text-white/55">
          Each row is one overtone; density = its live energy, scrolling right to
          left like an oscilloscope. Hold a vowel and slowly brighten it — the{" "}
          <span className="text-emerald-300/95">► emerald cursor</span> marks the
          partial you are shaping toward, and it sustains after your voice
          softens. Ref: Tanya Tagaq · Wolfgang Saus · cycle-2 of 1270-glyph-organ.
        </p>

        {stopped && !begun ? (
          <p className="font-mono text-base text-white/55">
            stopped — press Begin to play again.
          </p>
        ) : null}
      </div>

      <PrototypeNav slugs={["1380-overtone-throat"]} />
    </main>
  );
}
