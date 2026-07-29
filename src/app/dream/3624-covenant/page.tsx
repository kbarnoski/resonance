"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeState,
  stepMelodyNote,
  stepDecay,
  mulberry32,
  keyName,
  TIER_NAMES,
  type AccompanistState,
} from "./accompanist";
import {
  makeSynth,
  playVoice,
  voiceSustainedChord,
  type SynthGraph,
  type ChordHandle,
} from "./synth";

// ─── Keyboard -> MIDI. A S D F G H J K = C D E F G A B C ; W E T Y U = blacks ──
const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};
const WHITE_LEGEND = ["A", "S", "D", "F", "G", "H", "J", "K"];
const BLACK_LEGEND = ["W", "E", "T", "Y", "U"];

// ─── SVG geometry ─────────────────────────────────────────────────────────────
const VB_W = 800;
const VB_H = 460;
const LEFT_X = 210; // the visitor (you)
const RIGHT_X = 590; // the accompanist
const MID_Y = 230;
const N_STRANDS = 7;
const N_RIPPLES = 20;
const N_BLOOMS = 20;

function mapMidiToY(midi: number): number {
  const lo = 40;
  const hi = 86;
  const c = Math.max(0, Math.min(1, (midi - lo) / (hi - lo)));
  return 360 - c * 250; // higher pitch -> higher on screen
}

interface Particle {
  active: boolean;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  hue: number;
  strength: number;
}

function makePool(n: number): Particle[] {
  return Array.from({ length: n }, () => ({
    active: false,
    age: 0,
    maxAge: 1,
    x: 0,
    y: 0,
    hue: 275,
    strength: 1,
  }));
}

function spawn(pool: Particle[], x: number, y: number, hue: number, maxAge: number, strength: number) {
  const p = pool.find((q) => !q.active) ?? pool[0];
  p.active = true;
  p.age = 0;
  p.maxAge = maxAge;
  p.x = x;
  p.y = y;
  p.hue = hue;
  p.strength = strength;
}

// ─── Seeded autopilot melody (mulberry32 @ 0x3624). Coherent -> erratic -> back ─
interface AutoEvent {
  midi: number;
  t: number;
}
const C_MAJOR = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];

function makeAutopilot(rng: () => number): AutoEvent[] {
  const ev: AutoEvent[] = [];
  let t = 900;

  // helper: a coherent, mostly-stepwise phrase that resolves to the tonic
  const coherentPhrase = (startIdx: number, len: number, ioi: number) => {
    let idx = startIdx;
    for (let i = 0; i < len; i++) {
      const last = i === len - 1;
      const mid = last ? 60 : C_MAJOR[Math.max(0, Math.min(C_MAJOR.length - 1, idx))];
      ev.push({ midi: mid, t });
      t += ioi + (rng() - 0.5) * 30; // steady with tiny human jitter
      const step = rng() < 0.72 ? (rng() < 0.5 ? 1 : -1) : rng() < 0.5 ? 2 : -2;
      idx = Math.max(0, Math.min(C_MAJOR.length - 1, idx + step));
    }
    t += ioi * 0.8;
  };

  // PHASE A — earn trust: four steady, resolving phrases in C major
  coherentPhrase(0, 6, 360);
  coherentPhrase(4, 7, 350);
  coherentPhrase(2, 6, 360);
  coherentPhrase(6, 8, 340);

  // PHASE B — break faith: erratic leaps, chromatic notes, ragged timing + silence
  for (let i = 0; i < 9; i++) {
    const chrom = 55 + Math.floor(rng() * 22); // ignores the key, wide leaps
    ev.push({ midi: chrom, t });
    t += 120 + rng() * 620; // ragged inter-onset times
  }
  t += 1600; // a pointed silence -> the bond should thin toward a lone drone

  // PHASE C — reconcile: steady resolving phrases again, trust climbs back
  coherentPhrase(4, 7, 355);
  coherentPhrase(0, 6, 345);
  coherentPhrase(2, 8, 350);

  return ev;
}

export default function CovenantPage() {
  const [audioOn, setAudioOn] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [driver, setDriver] = useState<"autopilot" | "you">("autopilot");

  // throttled text readout
  const [readout, setReadout] = useState({ conf: 0, tier: 0, key: "C major", bet: false });

  // ── audio ──
  const synthRef = useRef<SynthGraph | null>(null);
  const audioReadyRef = useRef(false);
  const chordHandleRef = useRef<ChordHandle | null>(null);
  const lastChordKeyRef = useRef<string>("");
  const nextBeatRef = useRef(0);
  const beatParityRef = useRef(0);

  // ── accompanist state ──
  const stateRef = useRef<AccompanistState>(makeState(0));
  const rngRef = useRef<() => number>(mulberry32(0x3624));

  // ── autopilot ──
  const autoRef = useRef<AutoEvent[]>([]);
  const autoIdxRef = useRef(0);
  const autoStartRef = useRef(0);
  const autopilotOnRef = useRef(true);
  const octaveShiftRef = useRef(0);

  // ── viz ──
  const rippleRef = useRef<Particle[]>(makePool(N_RIPPLES));
  const bloomRef = useRef<Particle[]>(makePool(N_BLOOMS));
  const rippleEls = useRef<(SVGCircleElement | null)[]>([]);
  const bloomEls = useRef<(SVGCircleElement | null)[]>([]);
  const strandEls = useRef<(SVGPathElement | null)[]>([]);
  const youGlowRef = useRef<SVGCircleElement | null>(null);
  const accGlowRef = useRef<SVGCircleElement | null>(null);
  const ghostRef = useRef<SVGCircleElement | null>(null);
  const barRef = useRef<SVGRectElement | null>(null);
  const betFlashRef = useRef(0);
  const accPulseRef = useRef(0);
  const youPulseRef = useRef(0);
  const rafRef = useRef(0);
  const lastReadoutRef = useRef(0);

  // ── ensure the accompanist's sustained chord matches the current state ──
  const applyChordAudio = useCallback(() => {
    const s = stateRef.current;
    const synth = synthRef.current;
    if (!synth || !audioReadyRef.current) return;
    const key = `${s.tier}:${s.chord.join(",")}`;
    if (key === lastChordKeyRef.current) return;
    lastChordKeyRef.current = key;
    chordHandleRef.current?.release(0.45);
    const level = 0.06 + s.tier * 0.035;
    chordHandleRef.current = voiceSustainedChord(synth.ctx, synth.padBus, s.chord, level);
  }, []);

  // ── fire one melody note (shared by autopilot + the live player) ──
  const fireNote = useCallback(
    (midi: number, now: number) => {
      const synth = synthRef.current;
      if (synth && audioReadyRef.current) {
        playVoice(synth.ctx, synth.melodyBus, midi, {
          type: "triangle",
          gain: 0.32,
          dur: 0.28,
          release: 0.45,
        });
      }
      // ripple from the visitor
      spawn(rippleRef.current, LEFT_X, mapMidiToY(midi), 268, 1.15, 1);
      youPulseRef.current = 1;

      // advance the relationship
      const prevBet = stateRef.current.betConfirmed;
      stateRef.current = stepMelodyNote(stateRef.current, midi, now, rngRef.current);
      const s = stateRef.current;
      if (s.betConfirmed && !prevBet) betFlashRef.current = now;

      // blooms from the accompanist (its chord tones answer)
      s.chord.forEach((m: number, i: number) => {
        spawn(bloomRef.current, RIGHT_X, mapMidiToY(m), 285 - i * 4, 1.3, 0.6 + s.tier * 0.1);
      });
      accPulseRef.current = 0.6 + s.tier * 0.12;

      applyChordAudio();
    },
    [applyChordAudio],
  );

  // ── main loop ──
  const frame = useCallback(
    (now: number) => {
      // autopilot playback
      if (autopilotOnRef.current) {
        const events = autoRef.current;
        while (
          autoIdxRef.current < events.length &&
          autoStartRef.current + events[autoIdxRef.current].t <= now
        ) {
          fireNote(events[autoIdxRef.current].midi, now);
          autoIdxRef.current++;
        }
        if (autoIdxRef.current >= events.length) {
          // loop the self-demo until the visitor takes over
          autoIdxRef.current = 0;
          autoStartRef.current = now + 1400;
        }
      }

      // decay when nothing is played
      stateRef.current = stepDecay(stateRef.current, now);
      applyChordAudio();
      const s = stateRef.current;

      // top-tier comping: a moving bass + soft stabs on the beat
      const synth = synthRef.current;
      if (synth && audioReadyRef.current && s.tier >= 4) {
        if (nextBeatRef.current === 0) nextBeatRef.current = now + 300;
        if (now >= nextBeatRef.current) {
          const rootPc = s.chordRoot;
          const bassMidi = beatParityRef.current % 2 === 0 ? 36 + rootPc : 43 + ((rootPc + 7) % 12);
          playVoice(synth.ctx, synth.compBus, bassMidi, {
            type: "sine",
            gain: 0.22,
            dur: 0.14,
            release: 0.22,
          });
          if (beatParityRef.current % 2 === 1) {
            s.chord.slice(1, 3).forEach((m: number) =>
              playVoice(synth.ctx, synth.compBus, m + 12, {
                type: "triangle",
                gain: 0.05,
                dur: 0.1,
                release: 0.16,
              }),
            );
          }
          beatParityRef.current++;
          nextBeatRef.current = now + 300;
        }
      } else {
        nextBeatRef.current = 0;
      }

      // fade comp/pad buses in once audio is live
      if (synth && audioReadyRef.current) {
        const targetPad = 0.9;
        const targetComp = s.tier >= 4 ? 0.8 : 0.0;
        synth.padBus.gain.value += (targetPad - synth.padBus.gain.value) * 0.02;
        synth.compBus.gain.value += (targetComp - synth.compBus.gain.value) * 0.06;
      }

      // ── draw: filament braid ──
      const conf = s.confidence;
      const activeStrands = 1 + Math.round(conf * (N_STRANDS - 1));
      const c1x = LEFT_X + (RIGHT_X - LEFT_X) * 0.34;
      const c2x = LEFT_X + (RIGHT_X - LEFT_X) * 0.66;
      for (let i = 0; i < N_STRANDS; i++) {
        const el = strandEls.current[i];
        if (!el) continue;
        if (i >= activeStrands) {
          el.style.opacity = "0";
          continue;
        }
        const spread = i - (activeStrands - 1) / 2;
        const baseOff = spread * (4 + conf * 9);
        const amp = 5 + conf * 20;
        const ph = now * 0.0016 + i * 0.9;
        const y1 = MID_Y + baseOff + Math.sin(ph) * amp;
        const y2 = MID_Y + baseOff + Math.sin(ph + 1.7) * amp;
        el.setAttribute(
          "d",
          `M ${LEFT_X} ${MID_Y} C ${c1x} ${y1} ${c2x} ${y2} ${RIGHT_X} ${MID_Y}`,
        );
        el.setAttribute("stroke", `hsl(${266 + i * 4} 80% ${52 + conf * 20}%)`);
        el.setAttribute("stroke-width", `${(1 + conf * 3).toFixed(2)}`);
        el.style.opacity = `${(0.12 + conf * 0.72).toFixed(3)}`;
      }

      // ── presences (breathing + activity pulse) ──
      youPulseRef.current *= 0.94;
      accPulseRef.current *= 0.95;
      const breathe = 1 + Math.sin(now * 0.0014) * 0.05;
      if (youGlowRef.current) {
        youGlowRef.current.setAttribute("r", `${(34 + youPulseRef.current * 22) * breathe}`);
        youGlowRef.current.style.opacity = `${0.5 + youPulseRef.current * 0.4}`;
      }
      if (accGlowRef.current) {
        const r = (34 + accPulseRef.current * 26 + conf * 10) * breathe;
        accGlowRef.current.setAttribute("r", `${r}`);
        accGlowRef.current.style.opacity = `${0.42 + conf * 0.4 + accPulseRef.current * 0.3}`;
      }

      // ── anticipation ghost note ──
      if (ghostRef.current) {
        const g = ghostRef.current;
        if (s.bet !== null) {
          const gm = 66 + (((s.bet - 6) % 12) + 12) % 12;
          g.setAttribute("cx", `${RIGHT_X + 44}`);
          g.setAttribute("cy", `${mapMidiToY(gm)}`);
          const since = now - betFlashRef.current;
          const flash = betFlashRef.current > 0 && since < 420 ? 1 - since / 420 : 0;
          g.setAttribute("r", `${6 + flash * 12}`);
          g.style.opacity = `${(0.18 + flash * 0.75).toFixed(3)}`;
          g.setAttribute("fill", `hsl(288 90% ${60 + flash * 20}%)`);
        } else {
          g.style.opacity = "0";
        }
      }

      // ── particles ──
      const dt = 0.016;
      const drawPool = (pool: Particle[], els: (SVGCircleElement | null)[], grow: number) => {
        for (let i = 0; i < pool.length; i++) {
          const p = pool[i];
          const el = els[i];
          if (!el) continue;
          if (!p.active) {
            el.style.opacity = "0";
            continue;
          }
          p.age += dt;
          const k = p.age / p.maxAge;
          if (k >= 1) {
            p.active = false;
            el.style.opacity = "0";
            continue;
          }
          el.setAttribute("cx", `${p.x}`);
          el.setAttribute("cy", `${p.y}`);
          el.setAttribute("r", `${8 + k * grow}`);
          el.setAttribute("fill", "none");
          el.setAttribute("stroke", `hsl(${p.hue} 85% 66%)`);
          el.setAttribute("stroke-width", `${(2 * (1 - k) * p.strength).toFixed(2)}`);
          el.style.opacity = `${((1 - k) * 0.7 * p.strength).toFixed(3)}`;
        }
      };
      drawPool(rippleRef.current, rippleEls.current, 92);
      drawPool(bloomRef.current, bloomEls.current, 78);

      // ── confidence bar ──
      if (barRef.current) barRef.current.setAttribute("width", `${(conf * 220).toFixed(1)}`);

      // ── throttled text readout ──
      if (now - lastReadoutRef.current > 90) {
        lastReadoutRef.current = now;
        setReadout({ conf, tier: s.tier, key: keyName(s.key), bet: s.betConfirmed });
      }

      rafRef.current = requestAnimationFrame(frame);
    },
    [applyChordAudio, fireNote],
  );

  // ── mount: build autopilot + start the visual loop (silent until Start) ──
  useEffect(() => {
    const t0 = performance.now();
    stateRef.current = makeState(t0);
    autoRef.current = makeAutopilot(rngRef.current);
    autoStartRef.current = t0;
    autoIdxRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [frame]);

  // ── unlock audio on the Start gesture ──
  const start = useCallback(async () => {
    if (audioReadyRef.current) return;
    try {
      const synth = makeSynth();
      synthRef.current = synth;
      await synth.ctx.resume();
      audioReadyRef.current = true;
      setAudioOn(true);
    } catch {
      setUnsupported(true);
    }
  }, []);

  // ── the visitor takes over on their first keypress ──
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        octaveShiftRef.current = Math.max(-2, octaveShiftRef.current - 1);
        return;
      }
      if (k === "x") {
        octaveShiftRef.current = Math.min(2, octaveShiftRef.current + 1);
        return;
      }
      const semi = KEY_TO_SEMITONE[k];
      if (semi === undefined) return;
      e.preventDefault();
      if (autopilotOnRef.current) {
        autopilotOnRef.current = false;
        setDriver("you");
      }
      if (!audioReadyRef.current) void start();
      const midi = 60 + semi + octaveShiftRef.current * 12;
      fireNote(midi, performance.now());
    },
    [fireNote, start],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const tierName = TIER_NAMES[readout.tier];

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
        {/* header */}
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · dream 3624
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Covenant</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            An accompanist that commits to you only when you play with intention — a partner whose
            trust you earn, not a fail-buzzer you avoid.
          </p>
        </header>

        {/* the covenant field */}
        <div className="relative overflow-hidden rounded-lg border border-border">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="block w-full"
            role="img"
            aria-label="A living field showing the trust bond between you and the accompanist."
          >
            <defs>
              <radialGradient id="cov-you" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="hsl(268 90% 74%)" stopOpacity="0.95" />
                <stop offset="60%" stopColor="hsl(266 80% 55%)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(266 80% 45%)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="cov-acc" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="hsl(286 92% 76%)" stopOpacity="0.95" />
                <stop offset="60%" stopColor="hsl(284 82% 58%)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(284 82% 45%)" stopOpacity="0" />
              </radialGradient>
              <filter id="cov-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            <rect x="0" y="0" width={VB_W} height={VB_H} fill="hsl(272 40% 6%)" />

            {/* filament braid */}
            <g filter="url(#cov-soft)">
              {Array.from({ length: N_STRANDS }).map((_, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    strandEls.current[i] = el;
                  }}
                  fill="none"
                  strokeLinecap="round"
                  style={{ opacity: 0 }}
                />
              ))}
            </g>

            {/* ripples (your notes) */}
            {Array.from({ length: N_RIPPLES }).map((_, i) => (
              <circle
                key={`r${i}`}
                ref={(el) => {
                  rippleEls.current[i] = el;
                }}
                style={{ opacity: 0 }}
              />
            ))}
            {/* blooms (accompanist chord tones) */}
            {Array.from({ length: N_BLOOMS }).map((_, i) => (
              <circle
                key={`b${i}`}
                ref={(el) => {
                  bloomEls.current[i] = el;
                }}
                style={{ opacity: 0 }}
              />
            ))}

            {/* anticipation ghost */}
            <circle ref={ghostRef} style={{ opacity: 0 }} />

            {/* the two presences */}
            <circle ref={youGlowRef} cx={LEFT_X} cy={MID_Y} r={34} fill="url(#cov-you)" />
            <circle ref={accGlowRef} cx={RIGHT_X} cy={MID_Y} r={34} fill="url(#cov-acc)" />
            <circle cx={LEFT_X} cy={MID_Y} r={7} fill="hsl(268 95% 84%)" />
            <circle cx={RIGHT_X} cy={MID_Y} r={7} fill="hsl(286 95% 85%)" />
            <text x={LEFT_X} y={MID_Y + 64} textAnchor="middle" fill="hsl(266 40% 72%)" fontSize="13">
              you
            </text>
            <text x={RIGHT_X} y={MID_Y + 64} textAnchor="middle" fill="hsl(286 40% 74%)" fontSize="13">
              accompanist
            </text>

            {/* confidence bar */}
            <rect x={40} y={30} width={220} height={6} rx={3} fill="hsl(272 30% 18%)" />
            <rect ref={barRef} x={40} y={30} width={0} height={6} rx={3} fill="hsl(282 90% 66%)" />
            <text x={40} y={22} fill="hsl(280 30% 66%)" fontSize="11" letterSpacing="1.5">
              CONFIDENCE
            </text>
          </svg>

          {/* readout overlay */}
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {driver === "autopilot" ? "self-demo" : "you"} · {readout.key}
            </span>
            <span className="text-sm font-medium text-foreground">
              {Math.round(readout.conf * 100)}% · {tierName}
            </span>
            {readout.bet && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                read you right
              </span>
            )}
          </div>
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!audioOn ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start — unlock sound
            </button>
          ) : (
            <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              {driver === "autopilot"
                ? "Self-demo playing — press any key to take over"
                : "You have the keyboard — play a phrase"}
            </span>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {unsupported && (
          <p className="text-sm text-destructive">
            This browser blocked the Web Audio API, so the accompanist stays silent. The trust field
            above still animates.
          </p>
        )}

        {/* keyboard legend */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Your keyboard is the piano
          </p>
          <div className="flex flex-wrap gap-2">
            {WHITE_LEGEND.map((k) => (
              <kbd
                key={k}
                className="flex h-9 min-w-9 items-center justify-center rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {k}
              </kbd>
            ))}
            <span className="mx-1 self-center text-muted-foreground">·</span>
            {BLACK_LEGEND.map((k) => (
              <kbd
                key={k}
                className="flex h-9 min-w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-2 text-sm text-primary"
              >
                {k}
              </kbd>
            ))}
          </div>
          <p className="text-base text-muted-foreground">
            White keys <span className="text-foreground">A S D F G H J K</span> = C D E F G A B C;
            black keys <span className="text-primary">W E T Y U</span>. Press{" "}
            <span className="text-foreground">Z</span> / <span className="text-foreground">X</span>{" "}
            to drop or raise an octave. Play with steady rhythm and phrases that resolve — the braid
            between you thickens as the accompanist decides to commit.
          </p>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The accompanist keeps a small model of your last eight notes and computes a{" "}
                <span className="text-foreground">confidence</span> scalar. It rises when your
                playing is coherent — steady inter-onset timing, notes that fit an inferred diatonic
                key, and a melodic contour that moves by step rather than wandering. Silence and
                random leaps let it decay.
              </p>
              <p>
                Confidence <span className="text-foreground">gates how much it gives back</span>:
                withholding a lone drone, then a fifth, a full triad, a voiced seventh, and finally a
                moving bassline with rhythmic comping. The richer partner is earned, not default.
              </p>
              <p>
                It also <span className="text-foreground">anticipates</span> — betting on your likely
                next chord from the inferred key and a small functional-harmony automaton, pre-voiced
                as a ghost note. Confirm the bet and trust jumps; defy it and it re-keys.
              </p>
              <p>
                All music theory is hand-rolled heuristics — no ML, no server, no external API. It
                nods to arXiv:2511.17879 (retreat-to-safe-output as the characteristic accompanist
                failure) and ReaLchords / arXiv:2506.14723 (online, anticipatory melody→chord
                accompaniment).
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

      <Link
        href="/dream"
        className="fixed bottom-4 left-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
    </div>
  );
}
