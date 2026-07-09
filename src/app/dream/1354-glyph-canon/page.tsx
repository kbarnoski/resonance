"use client";

// ════════════════════════════════════════════════════════════════════════════
// GLYPH CANON (1354)
//
// THE ONE QUESTION: "What if a psychedelic instrument were played entirely
// inside a living monospace TEXT field — and its sense of TIME came from a
// Steve-Reich phase canon, not a drum beat?"
//
// A glyph-terminal surface: a full-screen grid of monospace Unicode characters
// rendered to <canvas> via fillText on a fixed character cell grid (the
// CHARACTERS are the art, not pixel blobs). A slow log-polar spiral of glyphs
// scrolls inward — a hypnagogic synaesthetic-text field. You PLAY it with the
// keyboard (three QWERTY rows = three octaves of a just-intonation scale) or the
// on-screen key rows; each note fires a soft FM voice AND injects a bright
// expanding glyph-ring that ages down a luminance ramp.
//
// THE TIME MECHANIC: every note is captured into a short looping PHRASE, and a
// TWIN loop replays it a hair slower (ratio 1 : 1.012) — a Reich *Piano Phase*
// canon. The two phase-voices are two differently-tinted glyph-streams (violet
// = live, teal = twin); you SEE the phasing as the two ring-families drift
// apart and slowly re-align. Genuine evolving rhythmic TIME with no BPM grid.
//
// Refs: Steve Reich — Piano Phase; Ryoji Ikeda — datamatics; the teletype /
// ASCII-art lineage.
//
// SAFETY: no strobe. Glyph pulses are LOCAL per-cell brightenings that fade
// smoothly; global luminance is near-constant (spatial pattern drifts well
// under 3 Hz). Honors prefers-reduced-motion. Instant Stop ramps master to 0 in
// ≤80 ms and freezes the energetic motion. Full teardown on unmount.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { GlyphCanon, degreeToFreq, type Stream } from "./glyph-engine";

// dim → white-hot luminance ramp; index 0 is a blank cell.
const RAMP = " ·.:-=+*#%@";

// keyboard → global scale degree (three octaves of the JI lattice)
const KEYMAP: Record<string, number> = {};
"zxcvbnm".split("").forEach((k, i) => (KEYMAP[k] = i)); // 0..6
"asdfghjkl".split("").forEach((k, i) => (KEYMAP[k] = 7 + i)); // 7..15
"qwertyui".split("").forEach((k, i) => (KEYMAP[k] = 14 + i)); // 14..21

// on-screen key rows (label → degree), phone-playable
const ROWS: { key: string; degree: number }[][] = [
  "qwertyui".split("").map((k, i) => ({ key: k, degree: 14 + i })),
  "asdfghjkl".split("").map((k, i) => ({ key: k, degree: 7 + i })),
  "zxcvbnm".split("").map((k, i) => ({ key: k, degree: i })),
];

interface Pulse {
  t0: number; // birth (seconds, canvas clock)
  stream: Stream;
  degree: number;
  intensity: number;
}

const STREAM_COLOR: [number, number, number][] = [
  [0.7, 0.55, 1.0], // violet — live
  [0.37, 0.9, 0.82], // teal — twin
];

const PULSE_LIFE = 3.2; // seconds
const MAX_PULSES = 64;

type Phase = "idle" | "running";

export default function GlyphCanonPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<GlyphCanon | null>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  const pulsesRef = useRef<Pulse[]>([]);
  const clockRef = useRef(0); // seconds since mount (visual clock)
  const lastTimeRef = useRef(0);
  const lastInputRef = useRef(0);

  // spawn a visual glyph-ring for a note
  const spawnPulse = useCallback((stream: Stream, degree: number, intensity: number) => {
    const arr = pulsesRef.current;
    arr.push({ t0: clockRef.current, stream, degree, intensity });
    if (arr.length > MAX_PULSES) arr.splice(0, arr.length - MAX_PULSES);
  }, []);

  // play a note (audio if available; always visual)
  const trigger = useCallback(
    (degree: number) => {
      lastInputRef.current = clockRef.current;
      const eng = engineRef.current;
      if (eng) eng.playLive(degree); // engine emits the pulse via listener
      else spawnPulse(0, degree, 1); // silent-visual fallback
    },
    [spawnPulse],
  );

  // ── draw one frame of the glyph terminal ──────────────────────────────────
  const drawField = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const pw = Math.floor(cssW * dpr);
    const ph = Math.floor(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const W = canvas.width;
    const H = canvas.height;

    const fontPx = Math.round(16 * dpr);
    const cellW = fontPx * 0.62;
    const cellH = fontPx * 1.12;
    const cols = Math.max(1, Math.floor(W / cellW));
    const rows = Math.max(1, Math.floor(H / cellH));
    const cx = W / 2;
    const cy = H / 2;

    // ground
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, W, H);

    ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const time = clockRef.current;
    const pulses = pulsesRef.current;
    const rampMax = RAMP.length - 1;

    for (let row = 0; row < rows; row++) {
      const py = row * cellH + cellH / 2;
      const dy = py - cy;
      for (let col = 0; col < cols; col++) {
        const px = col * cellW + cellW / 2;
        const dx = px - cx;
        const r = Math.hypot(dx, dy) + 8;
        const theta = Math.atan2(dy, dx);
        const logr = Math.log(r);

        // ambient log-polar tunnel: crests scroll INWARD (+time)
        const field =
          0.5 +
          0.5 *
            Math.sin(2.6 * logr + time * 1.05 + 3 * theta + 0.7 * Math.sin(time * 0.19 + logr));
        const ambient = Math.pow(field, 3) * 0.3;

        // accumulate pulse light (two tinted, drifting ring-families)
        let pb = 0;
        let cr = 0;
        let cg = 0;
        let cbl = 0;
        for (let i = 0; i < pulses.length; i++) {
          const p = pulses[i];
          const age = time - p.t0;
          if (age < 0 || age > PULSE_LIFE) continue;
          const life = 1 - age / PULSE_LIFE;
          const ringR = 22 + age * 235; // expanding ring (px)
          const d = Math.abs(r - ringR);
          const thick = 40;
          if (d > thick) continue;
          const spin = p.stream === 0 ? age * 0.6 : -age * 0.6;
          const angMod = 0.72 + 0.42 * Math.sin(theta * (p.degree % 5 + 2) + spin);
          const c = life * life * p.intensity * (1 - d / thick) * angMod;
          if (c <= 0) continue;
          const base = STREAM_COLOR[p.stream];
          const wf = Math.max(0, 1 - age / 0.18); // fresh = white-hot
          const rr = base[0] + (1 - base[0]) * wf;
          const gg = base[1] + (1 - base[1]) * wf;
          const bb = base[2] + (1 - base[2]) * wf;
          cr += c * rr;
          cg += c * gg;
          cbl += c * bb;
          pb += c;
        }

        const b = ambient + pb;
        if (b < 0.05) continue;
        const ch = RAMP[Math.min(rampMax, Math.floor(b * (rampMax + 0.999)))];
        if (ch === " ") continue;

        // colour: cool phosphor ground + pulse tint
        let R = ambient * 0.42 + cr;
        let G = ambient * 0.5 + cg;
        let B = ambient * 0.74 + cbl;
        const norm = 235;
        R = Math.min(255, R * norm + 12);
        G = Math.min(255, G * norm + 14);
        B = Math.min(255, B * norm + 22);
        ctx.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
        ctx.fillText(ch, px, py);
      }
    }
  }, []);

  // ── main loop: field always animates; audio + canon only while running ────
  const frame = useCallback(
    (now: number) => {
      const dtRaw = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const dt = Math.min(0.05, dtRaw);
      const reduced = reducedRef.current;
      // when stopped, ambient drifts very slowly (calm, effectively frozen)
      const speed = runningRef.current ? (reduced ? 0.35 : 1) : 0.12;
      clockRef.current += dt * speed;

      if (runningRef.current) {
        const eng = engineRef.current;
        eng?.schedule();
        // idle auto-demo: re-seed a consonant phrase after ~4 s of silence
        if (eng && clockRef.current - lastInputRef.current > 4) {
          eng.ensureIdle();
        }
      }

      drawField();
      rafRef.current = requestAnimationFrame(frame);
    },
    [drawField],
  );

  // always-on render loop + reduced-motion probe
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [frame]);

  // keyboard input
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!(k in KEYMAP)) return;
      e.preventDefault();
      trigger(KEYMAP[k]);
      setActive((a) => (a[k] ? a : { ...a, [k]: true }));
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEYMAP)) return;
      setActive((a) => {
        if (!a[k]) return a;
        const next = { ...a };
        delete next[k];
        return next;
      });
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [trigger]);

  const teardownAudio = useCallback(() => {
    runningRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
    ctxRef.current = null;
  }, []);

  // full teardown on unmount
  useEffect(() => () => teardownAudio(), [teardownAudio]);

  const handleBegin = useCallback(async () => {
    if (runningRef.current) return;
    setAudioError(null);

    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;

    if (!AC) {
      // degrade gracefully — keep the glyph field alive, silent
      setAudioError("Web Audio is unavailable here — the glyph field still plays, silently.");
      runningRef.current = true;
      lastInputRef.current = clockRef.current - 10; // let idle-demo seed visuals
      setPhase("running");
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Tap Begin again.");
      return;
    }
    ctxRef.current = ctx;
    const engine = new GlyphCanon(ctx);
    engine.setNoteListener((ev) => spawnPulse(ev.stream, ev.degree, ev.velocity));
    engine.seedIdle(); // canon plays itself immediately — never a blank screen
    engine.start();
    engineRef.current = engine;

    lastInputRef.current = clockRef.current - 10;
    runningRef.current = true;
    setPhase("running");
  }, [spawnPulse]);

  const handleStop = useCallback(() => {
    engineRef.current?.panic();
    pulsesRef.current = []; // freeze the energetic motion
    teardownAudio();
    setPhase("idle");
  }, [teardownAudio]);

  return (
    <main className="relative min-h-screen w-full touch-none overflow-hidden bg-[#05060a] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-mono text-2xl font-semibold uppercase tracking-[0.25em] text-white/95">
          glyph canon
        </h1>
        <p className="mt-2 max-w-xl text-base text-white/75">
          A psychedelic instrument played inside a living monospace text field — its sense of{" "}
          <span className="text-white/95">time</span> comes from a Steve-Reich phase canon, not a
          drum beat.
        </p>
      </header>

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-5 border border-white/15 bg-black/70 px-8 py-7 text-center backdrop-blur-sm">
            <p className="text-base text-white/80">
              Play the three keyboard rows (or the on-screen keys) — three octaves of a
              just-intonation scale. Every phrase you play is captured and replayed by a{" "}
              <span className="text-violet-300">twin loop</span> a hair slower, so the two
              glyph-streams slowly drift out of phase. Watch the violet and teal rings de-phase.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] min-w-[44px] bg-white px-4 py-2.5 font-mono text-base font-medium uppercase tracking-widest text-black transition-colors hover:bg-white/85"
            >
              Begin
            </button>
            <p className="text-base text-white/55">
              Sound and the canon start on this tap. If you stay quiet, it plays a gentle motif to
              itself.
            </p>
            {audioError && <p className="text-base text-rose-300">{audioError}</p>}
          </div>
        </div>
      )}

      {/* on-screen playable keys + controls */}
      {phase === "running" && (
        <div className="absolute bottom-4 left-1/2 z-10 w-[min(96vw,760px)] -translate-x-1/2">
          {audioError && (
            <p className="mb-2 text-center text-base text-rose-300">{audioError}</p>
          )}
          <div className="flex flex-col items-center gap-1.5 border border-white/12 bg-black/60 px-3 py-3 backdrop-blur-sm">
            {ROWS.map((rowKeys, ri) => (
              <div key={ri} className="flex justify-center gap-1">
                {rowKeys.map(({ key, degree }) => (
                  <button
                    key={key}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      trigger(degree);
                      setActive((a) => ({ ...a, [key]: true }));
                    }}
                    onPointerUp={() =>
                      setActive((a) => {
                        const n = { ...a };
                        delete n[key];
                        return n;
                      })
                    }
                    onPointerLeave={() =>
                      setActive((a) => {
                        if (!a[key]) return a;
                        const n = { ...a };
                        delete n[key];
                        return n;
                      })
                    }
                    title={`${Math.round(degreeToFreq(degree))} Hz`}
                    className={`min-h-[44px] w-9 border font-mono text-base uppercase transition-colors sm:w-10 ${
                      active[key]
                        ? "border-violet-300 bg-violet-300/25 text-white"
                        : "border-white/20 text-white/75 hover:bg-white/10"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => engineRef.current?.clearPhrase()}
              className="min-h-[44px] border border-white/25 px-4 py-2.5 font-mono text-base text-white/85 transition-colors hover:bg-white/10"
            >
              clear loop
            </button>
            <button
              onClick={handleStop}
              className="min-h-[44px] border border-rose-300/50 px-4 py-2.5 font-mono text-base text-rose-300 transition-colors hover:bg-rose-300/10"
            >
              stop
            </button>
          </div>
          <p className="mt-2 text-center font-mono text-base text-white/55">
            keys z…m / a…l / q…i · violet = you, teal = the twin loop drifting behind
          </p>
        </div>
      )}

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] border border-white/20 bg-black/50 px-4 py-2.5 font-mono text-base text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        {showNotes ? "close" : "read the design notes"}
      </button>
      {showNotes && (
        <div className="absolute right-4 top-20 z-30 w-[min(92vw,460px)] border border-white/15 bg-black/85 p-5 text-base text-white/85 backdrop-blur-sm">
          <p className="mb-2 font-mono text-xl uppercase tracking-widest text-white/95">
            time without a beat
          </p>
          <p className="mb-2">
            The whole instrument lives inside a monospace character grid — the glyphs themselves are
            the art. A log-polar spiral of characters scrolls inward as an ambient hypnagogic field;
            each note you play injects a bright ring of glyphs that ages down a luminance ramp{" "}
            <span className="font-mono text-white/95">{RAMP.trim()}</span>.
          </p>
          <p className="mb-2 text-white/75">
            Time comes from a <span className="text-violet-300">Steve Reich phase canon</span>: your
            phrase loops, and a twin loop replays it at 1 : 1.012 tempo, so the two streams start in
            unison and slowly de-phase. Violet is the live voice, teal the drifting twin — you both
            hear (stereo-split) and see (two ring-families) the phasing. No BPM grid anywhere.
          </p>
          <p className="text-white/75">
            Refs: <em>Steve Reich — Piano Phase</em> (the phasing canon); <em>Ryoji Ikeda —
            datamatics</em> (data/glyph field aesthetic); the teletype / ASCII-art lineage. Safety:
            no strobe — pulses are local per-cell fades, global luminance near-constant, honors
            prefers-reduced-motion.
          </p>
          <div className="mt-3">
            <Link href="/dream" className="font-mono text-white/90 underline hover:text-white">
              &larr; back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
