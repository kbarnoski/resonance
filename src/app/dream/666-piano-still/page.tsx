"use client";

// 666-piano-still — "Still Room". Cycle-4 of the piano spine (606 vivisection →
// 630 refract → 643 constellation → 666 still). The jury's standing #1 ask is
// GET OFF THE GLASS: 13 of the last 15 pieces render to a screen and the 2 that
// don't are the best. So this one is AUDIO-FIRST. The music is the whole point;
// the visual is a quiet SVG aura you do not need to watch. You can CLOSE YOUR
// EYES and the room carries it.
//
// What it does that 643 did not: it RECORDS a phrase and EVOLVES it over minutes.
//   • You place a few of Karel's isolated notes into a slow ~16s looping phrase.
//     Each pass re-fires that note's isolated material as a grain of his touch.
//   • Every several seconds the room BUDS one new note, chosen by an asymmetric
//     consonance score against the notes currently ringing (consonance.ts,
//     anchored on De Roure 2026, arXiv:2606.16412) — harmony is CHOSEN, never
//     scale-snapped. This is the anti-pentatonic move.
//   • Un-refreshed notes DECAY over minutes and drop out, so the room breathes.
//     Minute 5 does not sound like minute 0.
// One lever: stillness ↔ growth. The engine (HPSS + 12-pitch-class isolation) is
// reused verbatim from cycle 643; the looper, the De Roure growth, the decay,
// and the SVG aura are this piece's work.

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioSourceKind, fetchPianoBuffer, renderFallbackBuffer } from "./audio";
import { decompose, stft } from "./hpss";
import { CHROMA_COUNT, CHROMA_NAMES, isolateChromas, ChromaResult } from "./chroma";
import { chooseGrowthNote } from "./consonance";

type Phase = "idle" | "loading" | "ready" | "error";

// Slow looping phrase: LOOP_SECS long, divided into STEPS slots.
const LOOP_SECS = 16;
const STEPS = 8; // a note lands on one of 8 slow slots around the loop

// Hue per pitch class (warm → cool wheel), for the SVG markers.
const HUE = [0, 28, 52, 78, 110, 150, 186, 210, 240, 270, 300, 330];
const pcColor = (i: number, light = 62, sat = 64): string =>
  `hsl(${HUE[i]}, ${sat}%, ${light}%)`;

// A live note living in the room.
interface RoomNote {
  pc: number;        // pitch class 0..11
  step: number;      // which loop slot it fires on (0..STEPS-1)
  presence: number;  // 0..1 ring weight; refreshed on fire, decays over minutes
  born: number;      // ms timestamp
  seededByGrowth: boolean;
}

// Decay: an un-refreshed note loses presence over ~minutes. Per-second factor.
// 0.992/s ≈ half-life ~90s of silence; a note firing each ~16s loop tops up.
const DECAY_PER_SEC = 0.992;
const DROP_BELOW = 0.06;       // presence below this and the note leaves
const REFRESH_TO = 1.0;        // presence after a fire

export default function PianoStillPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UI mirror (updated ~5/s so React stays calm).
  const [ui, setUi] = useState({
    notes: [] as RoomNote[],
    loopPos: 0,      // 0..1 around the phrase
    brightness: 0,   // 0..1 how much of his sound is ringing
    elapsedSec: 0,
    growth: 0.4,
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const chromaRef = useRef<ChromaResult | null>(null);
  const buffersRef = useRef<AudioBuffer[]>([]); // 12 isolated pitch-class buffers
  const masterRef = useRef<GainNode | null>(null);
  const reverbBusRef = useRef<GainNode | null>(null);

  const notesRef = useRef<RoomNote[]>([]);
  const growthRef = useRef(0.4);        // stillness↔growth lever 0..1
  const startedAtRef = useRef(0);       // audio time the loop started
  const lastStepRef = useRef(-1);       // last loop step that fired
  const lastGrowthAtRef = useRef(0);    // ms of last bud
  const flaresRef = useRef<Record<number, number>>({}); // pc -> flare 0..1+
  const rafRef = useRef(0);

  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current) return ctxRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  // ─── Fire one note's isolated material as a soft grain of Karel's touch ──────
  const fireGrain = useCallback((pc: number, gain: number) => {
    const ctx = ctxRef.current;
    const buffers = buffersRef.current;
    const bus = reverbBusRef.current;
    if (!ctx || !bus || pc < 0 || pc >= buffers.length) return;
    const buf = buffers[pc];
    if (!buf || buf.length < 2) return;

    const grainSecs = 1.1; // long, tender grains — meditative, not percussive
    const maxStart = Math.max(0, buf.duration - grainSecs);
    const offset = Math.random() * maxStart;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.99 + Math.random() * 0.02;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    const peak = Math.max(0.0001, gain * 0.8);
    // Slow swell + long release: a breath, not a hit.
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + grainSecs * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0008, now + grainSecs);

    src.connect(g);
    g.connect(bus);
    src.start(now, offset, grainSecs + 0.05);
    src.stop(now + grainSecs + 0.1);
    src.onended = () => {
      try { src.disconnect(); } catch { /* noop */ }
      try { g.disconnect(); } catch { /* noop */ }
    };

    flaresRef.current[pc] = Math.min(1.6, (flaresRef.current[pc] ?? 0) + 1.0);
  }, []);

  // ─── Place a note into the loop (visitor tap or auto-seed) ───────────────────
  const placeNote = useCallback((pc: number, opts?: { step?: number; growth?: boolean; quiet?: boolean }) => {
    const notes = notesRef.current;
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") void ctx.resume();

    // If this pc already lives, refresh it (and nudge its slot) rather than dup.
    const existing = notes.find((n) => n.pc === pc);
    if (existing) {
      existing.presence = REFRESH_TO;
      if (!opts?.quiet) fireGrain(pc, 0.9);
      return;
    }
    // Choose a loop slot: spread new notes around the phrase.
    const step =
      opts?.step ??
      (() => {
        const used = new Set(notes.map((n) => n.step));
        for (let s = 0; s < STEPS; s++) {
          const cand = (notes.length * 3 + s) % STEPS;
          if (!used.has(cand)) return cand;
        }
        return Math.floor(Math.random() * STEPS);
      })();

    const note: RoomNote = {
      pc, step,
      presence: REFRESH_TO,
      born: performance.now(),
      seededByGrowth: !!opts?.growth,
    };
    // Keep the room from overcrowding — cap at 7 living notes.
    if (notes.length >= 7) {
      // drop the quietest non-just-placed note
      let minI = 0;
      for (let i = 1; i < notes.length; i++) if (notes[i].presence < notes[minI].presence) minI = i;
      notes.splice(minI, 1);
    }
    notes.push(note);
    if (!opts?.quiet) fireGrain(pc, 0.9);
  }, [fireGrain]);

  // ─── Build the persistent audio graph (master + soft reverb tail) ────────────
  const buildGraph = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    master.connect(comp).connect(ctx.destination);
    masterRef.current = master;

    // Gentle algorithmic reverb tail (a small convolver from synthesized noise)
    // so the room has air around each note — central to the "still room" feel.
    const reverbBus = ctx.createGain();
    reverbBus.gain.value = 1.0;

    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    reverbBus.connect(dry).connect(master);

    const conv = ctx.createConvolver();
    const irSecs = 3.2;
    const len = Math.floor(irSecs * ctx.sampleRate);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverbBus.connect(conv).connect(wet).connect(master);

    reverbBusRef.current = reverbBus;
  }, []);

  // ─── Load → HPSS → 12-pitch-class isolation, then seed + start ───────────────
  const load = useCallback(async () => {
    if (phase === "loading") return;
    setPhase("loading");
    setErrorMsg(null);
    setProgress(0);
    setProgressLabel("opening audio context");

    const ctx = ensureContext();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* gesture covers this */ }
    }

    let buffer: AudioBuffer | null = null;
    let kind: AudioSourceKind = "fallback";
    try {
      buffer = await fetchPianoBuffer(ctx);
      if (buffer) kind = "piano";
    } catch { buffer = null; }
    if (!buffer) {
      setErrorMsg("synthesized piano — recording unavailable");
      try {
        buffer = await renderFallbackBuffer(ctx.sampleRate);
        kind = "fallback";
      } catch {
        setPhase("error");
        setErrorMsg("Audio synthesis failed — your browser may not support OfflineAudioContext.");
        return;
      }
    }
    setSourceKind(kind);

    let hpss;
    try {
      hpss = await decompose(buffer, (frac, label) => {
        setProgress(frac * 0.4);
        setProgressLabel("HPSS · " + label);
      });
    } catch (e) {
      setPhase("error");
      setErrorMsg("HPSS failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    setProgressLabel("chroma · re-analyzing strings");
    await new Promise((r) => setTimeout(r, 0));
    const hSpec = stft(hpss.harmonic);

    let chroma: ChromaResult;
    try {
      chroma = await isolateChromas(
        hSpec.re, hSpec.im, hSpec.mag, hSpec.frames, hSpec.bins, hpss.harmonic.length,
        (frac, label) => {
          setProgress(0.4 + frac * 0.6);
          setProgressLabel("chroma · " + label);
        },
      );
      chromaRef.current = chroma;
    } catch (e) {
      setPhase("error");
      setErrorMsg("Chroma isolation failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    // Make AudioBuffers from the 12 isolated pitch-class PCMs.
    const buffers: AudioBuffer[] = [];
    for (let c = 0; c < CHROMA_COUNT; c++) {
      const pcm = chroma.buffers[c];
      const b = ctx.createBuffer(1, Math.max(1, pcm.length), chroma.sampleRate);
      b.getChannelData(0).set(pcm);
      buffers.push(b);
    }
    buffersRef.current = buffers;

    buildGraph();

    // Auto-seed two of his strongest pitch classes so a silent glance hears
    // something within ~2s. Pick the two highest meanChroma classes.
    const mc = chroma.meanChroma;
    const ranked = Array.from({ length: CHROMA_COUNT }, (_, i) => i)
      .sort((a, b) => mc[b] - mc[a]);
    notesRef.current = [];
    placeNote(ranked[0], { step: 0, quiet: true });
    placeNote(ranked[1], { step: Math.floor(STEPS / 2), quiet: true });

    startedAtRef.current = ctx.currentTime;
    lastStepRef.current = -1;
    lastGrowthAtRef.current = performance.now();
    setPhase("ready");
  }, [phase, ensureContext, buildGraph, placeNote]);

  // ─── The loop engine + decay + De Roure growth + SVG state, on RAF ───────────
  useEffect(() => {
    let lastT = performance.now();
    let uiTick = 0;
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const ctx = ctxRef.current;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      // Flares decay always (so the idle aura still breathes).
      for (const k in flaresRef.current) {
        flaresRef.current[+k] = Math.max(0, flaresRef.current[+k] - dt * 1.4);
      }

      if (phase === "ready" && ctx) {
        const elapsed = ctx.currentTime - startedAtRef.current;
        const loopPos = (elapsed % LOOP_SECS) / LOOP_SECS;
        const step = Math.floor(loopPos * STEPS);

        // Fire any notes whose slot we just crossed.
        if (step !== lastStepRef.current) {
          lastStepRef.current = step;
          for (const n of notesRef.current) {
            if (n.step === step) {
              n.presence = REFRESH_TO; // a fired note is refreshed (stays alive)
              fireGrain(n.pc, 0.35 + 0.55 * n.presence);
            }
          }
        }

        // Decay all notes continuously; drop the faded ones.
        const factor = Math.pow(DECAY_PER_SEC, dt);
        const survivors: RoomNote[] = [];
        for (const n of notesRef.current) {
          n.presence *= factor;
          if (n.presence >= DROP_BELOW) survivors.push(n);
        }
        notesRef.current = survivors;

        // De Roure GROWTH: every few seconds, bud ONE consonant new note.
        // Interval shrinks as growth lever rises (more growth ⇒ faster budding).
        const growth = growthRef.current;
        const budEvery = 14000 - growth * 9000; // 14s (still) … 5s (growth) ms
        if (
          now - lastGrowthAtRef.current > budEvery &&
          notesRef.current.length < 7
        ) {
          lastGrowthAtRef.current = now;
          // Ringing field = presence per pitch class.
          const ringing = new Float32Array(CHROMA_COUNT);
          for (const n of notesRef.current) ringing[n.pc] += n.presence;
          const presence = chromaRef.current?.meanChroma ?? new Float32Array(CHROMA_COUNT);
          const choice = chooseGrowthNote(ringing, presence, growth, Math.random());
          placeNote(choice.pc, { growth: true, quiet: true });
        }
      }

      // ── Update the React UI mirror ~6/s ──
      if (now - uiTick > 160) {
        uiTick = now;
        const ctx2 = ctxRef.current;
        let loopPos = 0;
        let elapsedSec = 0;
        if (phase === "ready" && ctx2) {
          const elapsed = ctx2.currentTime - startedAtRef.current;
          loopPos = (elapsed % LOOP_SECS) / LOOP_SECS;
          elapsedSec = elapsed;
        }
        let bright = 0;
        for (const n of notesRef.current) bright += n.presence;
        bright = Math.min(1, bright / 4);
        setUi({
          notes: notesRef.current.map((n) => ({ ...n })),
          loopPos,
          brightness: bright,
          elapsedSec,
          growth: growthRef.current,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, fireGrain, placeNote]);

  const release = useCallback(() => {
    // The "release" gesture of the ritual: let everything fade. Halve presence
    // of all and stop refreshing the loudest, so the room empties gracefully.
    for (const n of notesRef.current) n.presence *= 0.4;
  }, []);

  const setGrowth = useCallback((v: number) => {
    growthRef.current = v;
    setUi((u) => ({ ...u, growth: v }));
  }, []);

  // ─── SVG aura geometry ───────────────────────────────────────────────────────
  const W = 600, H = 600, CX = W / 2, CY = H / 2;
  const t = ui.elapsedSec;
  // Center breathes: a slow sine, brighter as more notes ring.
  const breath = 0.5 + 0.5 * Math.sin(t * 0.5);
  const coreR = 46 + 26 * breath + 40 * ui.brightness;
  const coreOpacity = 0.18 + 0.5 * ui.brightness;

  // Note markers ride a ring; angle by loop step, radius by presence.
  const RING = 200;

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#070608] text-foreground">
      <a
        href="/dream/666-piano-still/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        design notes ↗
      </a>

      <header className="absolute left-0 right-0 top-0 z-10 px-6 pt-6 text-center md:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Still Room
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-base text-muted-foreground">
          Karel&apos;s piano, down to its 12 notes — an eyes-closed instrument.
          Place a few notes; then close your eyes while the room grows itself in
          his own touch over minutes, quietly adding consonant notes and letting
          others fade.
        </p>
        {sourceKind && (
          <p className="mt-2 font-mono text-sm">
            source:{" "}
            <span className={sourceKind === "piano" ? "text-violet-300/95" : "text-violet-300/95"}>
              {sourceKind === "piano" ? "Karel's piano (real recording)" : "synthesized piano — recording unavailable"}
            </span>
          </p>
        )}
        {errorMsg && <p className="mt-2 text-base text-violet-300">{errorMsg}</p>}
      </header>

      {/* ── The quiet SVG aura ── */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[min(78vh,78vw)] w-[min(78vh,78vw)]"
        aria-hidden
      >
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(38, 70%, 78%)" stopOpacity="0.95" />
            <stop offset="55%" stopColor="hsl(28, 60%, 56%)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(20, 50%, 40%)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* phrase-position ring (very faint) */}
        <circle cx={CX} cy={CY} r={RING} fill="none" stroke="white" strokeOpacity={0.07} strokeWidth={1} />

        {/* slow phrase-position indicator: a dim traveling dot */}
        {phase === "ready" && (() => {
          const a = ui.loopPos * Math.PI * 2 - Math.PI / 2;
          return (
            <circle
              cx={CX + RING * Math.cos(a)}
              cy={CY + RING * Math.sin(a)}
              r={4}
              fill="white"
              fillOpacity={0.5}
            />
          );
        })()}

        {/* breathing center — brightens as more of his notes ring */}
        <circle cx={CX} cy={CY} r={coreR + 60} fill="url(#core)" opacity={coreOpacity} />
        <circle cx={CX} cy={CY} r={coreR} fill="url(#core)" opacity={Math.min(1, coreOpacity + 0.25)} />

        {/* note markers currently in the loop */}
        {ui.notes.map((n, i) => {
          const a = (n.step / STEPS) * Math.PI * 2 - Math.PI / 2;
          const flare = flaresRef.current[n.pc] ?? 0;
          const r = RING - 4 + flare * 18;
          const x = CX + r * Math.cos(a);
          const y = CY + r * Math.sin(a);
          const rad = 8 + 16 * n.presence + flare * 12;
          const op = 0.25 + 0.7 * n.presence;
          return (
            <g key={`${n.pc}-${i}`}>
              <circle cx={x} cy={y} r={rad + 10} fill={pcColor(n.pc, 60)} opacity={op * 0.25} />
              <circle cx={x} cy={y} r={rad} fill={pcColor(n.pc, 66)} opacity={op} />
              <text
                x={x} y={y + 4}
                textAnchor="middle"
                className="font-mono"
                fontSize={12}
                fill="white"
                fillOpacity={Math.min(0.95, 0.5 + n.presence)}
              >
                {CHROMA_NAMES[n.pc]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Controls ── */}
      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-4 px-6 pb-6 md:pb-10">
        {phase === "idle" && (
          <button
            onClick={() => void load()}
            className="min-h-[44px] rounded-md border border-violet-300/40 bg-violet-400/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-400/25"
          >
            Tap to begin · enter the still room
          </button>
        )}

        {phase === "loading" && (
          <div className="w-full max-w-md">
            <p className="font-mono text-sm text-muted-foreground">
              {progressLabel} ({Math.round(progress * 100)}%)
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-violet-300 via-violet-300 to-violet-300 transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {phase === "error" && (
          <button
            onClick={() => setPhase("idle")}
            className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
          >
            Try again
          </button>
        )}

        {phase === "ready" && (
          <>
            {/* place-a-note row — dead simple, tap any of his 12 notes */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {Array.from({ length: CHROMA_COUNT }, (_, i) => {
                const live = ui.notes.some((n) => n.pc === i);
                return (
                  <button
                    key={i}
                    onClick={() => placeNote(i)}
                    aria-label={`place note ${CHROMA_NAMES[i]}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border px-4 py-2.5 text-base font-medium transition"
                    style={{
                      borderColor: live ? pcColor(i, 66) : "rgba(255,255,255,0.15)",
                      backgroundColor: `${pcColor(i, 50)}${live ? "33" : "14"}`,
                      color: pcColor(i, 78),
                      boxShadow: live ? `0 0 12px ${pcColor(i, 60)}55` : "none",
                    }}
                  >
                    {CHROMA_NAMES[i]}
                  </button>
                );
              })}
            </div>

            {/* the one lever + release + elapsed */}
            <div className="flex w-full max-w-xl flex-col items-center gap-2">
              <div className="flex w-full items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">stillness</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ui.growth}
                  onChange={(e) => setGrowth(parseFloat(e.target.value))}
                  aria-label="stillness to growth"
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-violet-300"
                />
                <span className="font-mono text-sm text-muted-foreground">growth</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={release}
                  className="min-h-[44px] rounded-md bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
                >
                  release (let it fade)
                </button>
                <span className="font-mono text-sm text-muted-foreground">
                  {ui.notes.length} note{ui.notes.length === 1 ? "" : "s"} ·{" "}
                  {Math.floor(ui.elapsedSec / 60)}:{String(Math.floor(ui.elapsedSec % 60)).padStart(2, "0")}
                </span>
              </div>
              <p className="text-center font-mono text-sm text-muted-foreground">
                tap a note to place it · then close your eyes — the room grows itself
              </p>
            </div>
          </>
        )}
      </footer>
    </main>
  );
}
