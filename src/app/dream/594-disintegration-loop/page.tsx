"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ── The self-overwriting "tape" model ───────────────────────────────────────
//
// A seed phrase is rendered once into a Float32Array (the "tape"). Each pass
// through playback, the tape's OWN current audio is run through a wear chain
// and written back onto itself, so erosion accumulates irreversibly:
//   - a lowpass whose cutoff creeps DOWN over passes (highs flake first),
//   - random amplitude dropouts (oxide holes) whose count/length grows,
//   - mild wow/flutter (resampling jitter),
//   - gentle tanh tape saturation so it doesn't simply vanish.
// This is genuine state — not an LFO, not a reset loop.

const SR = 44100;
const SEED_SECS = 9; // length of the loop in seconds
const TAPE_LEN = Math.floor(SEED_SECS * SR);

// Just-intonation ratios over a low root — a warm, spacious lullaby fragment.
const ROOT = 130.81; // C3-ish
const RATIOS = [1, 5 / 4, 3 / 2, 15 / 8, 2, 3 / 2, 5 / 4, 1];

// ── Module-level helpers (NOT React hooks — no use* names) ───────────────────

/** Render the warm seed phrase: soft piano-ish struck tones in just intonation. */
function makeSeedTape(): Float32Array {
  const tape = new Float32Array(TAPE_LEN);
  const noteSecs = SEED_SECS / RATIOS.length;
  RATIOS.forEach((ratio, i) => {
    const freq = ROOT * ratio;
    const start = Math.floor(i * noteSecs * SR);
    const dur = Math.floor(noteSecs * 1.7 * SR); // overlap for legato bloom
    for (let j = 0; j < dur; j++) {
      const idx = start + j;
      if (idx >= TAPE_LEN) break;
      const t = j / SR;
      // Percussive-ish envelope: fast attack, slow exponential decay.
      const env = Math.min(1, t * 60) * Math.exp(-t * 2.2);
      // A few harmonics for a soft, bell/piano-like timbre.
      const s =
        Math.sin(2 * Math.PI * freq * t) * 1.0 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.32 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.14;
      tape[idx] += s * env * 0.16;
    }
  });
  // A faint sustained drone on the root to anchor the warmth.
  for (let j = 0; j < TAPE_LEN; j++) {
    const t = j / SR;
    tape[j] += Math.sin(2 * Math.PI * ROOT * 0.5 * t) * 0.04;
  }
  return tape;
}

/** A one-pole lowpass applied in place. cutoff in Hz. */
function applyLowpass(buf: Float32Array, cutoff: number) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  let prev = buf[0];
  for (let i = 0; i < buf.length; i++) {
    prev = prev + alpha * (buf[i] - prev);
    buf[i] = prev;
  }
}

/** Resample buf with slowly-varying playback-rate jitter (wow/flutter). */
function applyWowFlutter(buf: Float32Array, depth: number): Float32Array {
  const out = new Float32Array(buf.length);
  let readPos = 0;
  for (let i = 0; i < buf.length; i++) {
    const wow = Math.sin((i / buf.length) * Math.PI * 2 * 1.3) * depth;
    const flutter = Math.sin((i / buf.length) * Math.PI * 2 * 11) * depth * 0.35;
    const rate = 1 + wow + flutter;
    const i0 = Math.floor(readPos);
    const frac = readPos - i0;
    const a = buf[i0 % buf.length];
    const b = buf[(i0 + 1) % buf.length];
    out[i] = a + (b - a) * frac;
    readPos += rate;
    if (readPos >= buf.length) readPos -= buf.length;
  }
  return out;
}

/**
 * Run one wear pass over the tape, writing the result back onto itself.
 * `erodeRate` (0..1) scales how aggressive this pass is (driven by the lever).
 * `dropoutMap` is mutated to mark permanently-worn segments (oxide holes) for
 * the visual. Returns the lowpass cutoff used, for the visual.
 */
function stepWear(
  tape: Float32Array,
  dropoutMap: Float32Array,
  pass: number,
  erodeRate: number,
): number {
  // Cutoff creeps down each pass; erodeRate accelerates / decelerates it.
  // Starts bright (~9kHz), decays toward a muffled ghost (~400Hz floor).
  const decay = Math.pow(0.97, pass * (0.5 + erodeRate * 1.6));
  const cutoff = 420 + (9000 - 420) * decay;
  applyLowpass(tape, cutoff);

  // Wow/flutter grows slightly with wear.
  const flDepth = 0.0015 + erodeRate * 0.004 * Math.min(1, pass / 30);
  const fl = applyWowFlutter(tape, flDepth);
  tape.set(fl);

  // Oxide dropouts: punch new holes. Count/length grow with passes & erodeRate.
  const cells = dropoutMap.length;
  const newHoles = Math.round((0.4 + erodeRate * 2.2) * (1 + pass * 0.06));
  for (let h = 0; h < newHoles; h++) {
    const c = Math.floor(Math.random() * cells);
    // Deepen existing wear OR open a new hole.
    dropoutMap[c] = Math.min(1, dropoutMap[c] + 0.18 + erodeRate * 0.3);
  }
  // Apply the dropout map destructively onto the tape so holes are permanent.
  const cellLen = Math.floor(tape.length / cells);
  for (let c = 0; c < cells; c++) {
    const wear = dropoutMap[c];
    if (wear <= 0) continue;
    const gain = 1 - wear; // worn cells get quieter; fully worn = silent
    const s = c * cellLen;
    const e = c === cells - 1 ? tape.length : s + cellLen;
    for (let i = s; i < e; i++) tape[i] *= gain;
  }

  // Gentle tape saturation so it colors rather than just fades.
  for (let i = 0; i < tape.length; i++) {
    tape[i] = Math.tanh(tape[i] * 1.4) * 0.86;
  }

  return cutoff;
}

/** Copy a Float32Array into a fresh mono AudioBuffer. */
function tapeToBuffer(ctx: AudioContext, tape: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, tape.length, SR);
  buf.getChannelData(0).set(tape);
  return buf;
}

// Visual constants
const CELLS = 220; // dropout-map resolution & waveform strip resolution

// ── Component ────────────────────────────────────────────────────────────────

export default function DisintegrationLoop() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [lever, setLever] = useState(0.5); // 0 = let go, 1 = hold on; mid default
  const [pass, setPass] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const tapeRef = useRef<Float32Array | null>(null);
  const dropoutRef = useRef<Float32Array>(new Float32Array(CELLS));
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const passRef = useRef(0);
  const cutoffRef = useRef(9000);
  const leverRef = useRef(0.5);
  const startedRef = useRef(false);
  const startTimeRef = useRef(0);
  const passAtRef = useRef(0); // ctx.currentTime when current pass started
  const peaksRef = useRef<Float32Array>(new Float32Array(CELLS));
  const seedRef = useRef<Float32Array | null>(null);

  // Visual refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep leverRef in sync with state (read inside audio/visual loops).
  useEffect(() => {
    leverRef.current = lever;
  }, [lever]);

  /** Compute peak envelope of the current tape for the waveform strip. */
  const refreshPeaks = useCallback(() => {
    const tape = tapeRef.current;
    if (!tape) return;
    const cellLen = Math.floor(tape.length / CELLS);
    const peaks = peaksRef.current;
    for (let c = 0; c < CELLS; c++) {
      let mx = 0;
      const s = c * cellLen;
      const e = c === CELLS - 1 ? tape.length : s + cellLen;
      for (let i = s; i < e; i += 8) {
        const v = Math.abs(tape[i]);
        if (v > mx) mx = v;
      }
      peaks[c] = mx;
    }
  }, []);

  /** Schedule the current tape to play once; on end, wear + reschedule. */
  const scheduleNextPass = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const tape = tapeRef.current;
    if (!ctx || !master || !tape) return;

    // Erosion rate from the lever: bottom (let go) erodes fast, top (hold on) slow.
    // lever 1 -> erodeRate ~0.12 (gentle), lever 0 -> ~0.9 (aggressive).
    const erodeRate = 0.12 + (1 - leverRef.current) * 0.78;

    // "Hold on" (lever high) occasionally lifts the lowpass a touch — a refresh,
    // re-seeding faint detail by mixing a whisper of the pristine seed back in.
    if (leverRef.current > 0.82 && seedRef.current) {
      const seed = seedRef.current;
      const amt = (leverRef.current - 0.82) * 0.16;
      for (let i = 0; i < tape.length; i++) tape[i] += seed[i] * amt;
    }

    cutoffRef.current = stepWear(
      tape,
      dropoutRef.current,
      passRef.current,
      erodeRate,
    );
    refreshPeaks();

    const buf = tapeToBuffer(ctx, tape);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Cross-fade: per-pass gain envelope to avoid clicks at the seam.
    const g = ctx.createGain();
    const now = ctx.currentTime;
    const dur = buf.duration;
    const fade = 0.08;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + fade);
    g.gain.setValueAtTime(1, now + dur - fade);
    g.gain.linearRampToValueAtTime(0, now + dur);

    src.connect(g).connect(master);
    src.start(now);
    passAtRef.current = now;

    src.onended = () => {
      g.disconnect();
      src.disconnect();
      passRef.current += 1;
      setPass(passRef.current);
      // Only continue if still mounted/playing.
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        scheduleNextPass();
      }
    };
    srcRef.current = src;
  }, [refreshPeaks]);

  /** Visual draw loop — driven by ACTUAL degradation state. */
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d");
    if (!canvas || !ctx2d) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const W = canvas.width;
    const H = canvas.height;
    const peaks = peaksRef.current;
    const dropout = dropoutRef.current;

    // Overall wear factor from lowpass cutoff: 0 (fresh) -> 1 (ghost).
    const wear = 1 - Math.min(1, Math.max(0, (cutoffRef.current - 420) / (9000 - 420)));

    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = "#050406";
    ctx2d.fillRect(0, 0, W, H);

    const midY = H / 2;
    const padX = W * 0.04;
    const stripW = W - padX * 2;
    const cellW = stripW / CELLS;

    // Color: warm amber when fresh -> desaturated ash/grey as it wears.
    const r = Math.round(232 - wear * 120);
    const g = Math.round(170 - wear * 90);
    const b = Math.round(96 + wear * 30);
    const bright = 1 - wear * 0.55;

    for (let c = 0; c < CELLS; c++) {
      const x = padX + c * cellW;
      const hole = dropout[c]; // 0 = intact, 1 = punched through
      if (hole > 0.92) continue; // fully worn cell: a hole in the tape
      const amp = peaks[c];
      // Frayed edges: jitter the bar height a little where worn.
      const fray = hole * (Math.random() - 0.5) * 10;
      const barH = Math.max(1, amp * (H * 0.42) * (1 - hole * 0.7)) + fray;
      const alpha = (1 - hole) * bright;
      ctx2d.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx2d.fillRect(x, midY - barH, Math.max(0.8, cellW - 0.4), barH * 2);
    }

    // Faint baseline of the tape strip itself.
    ctx2d.strokeStyle = `rgba(${r},${g},${b},${0.12 * bright})`;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(padX, midY);
    ctx2d.lineTo(padX + stripW, midY);
    ctx2d.stroke();

    // Playhead sweeps left -> right each pass.
    const ctx = ctxRef.current;
    if (ctx && startedRef.current) {
      const prog = Math.min(1, (ctx.currentTime - passAtRef.current) / SEED_SECS);
      const px = padX + prog * stripW;
      ctx2d.strokeStyle = `rgba(196,181,253,${0.5 + 0.3 * bright})`;
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(px, midY - H * 0.46);
      ctx2d.lineTo(px, midY + H * 0.46);
      ctx2d.stroke();
      setElapsed(ctx.currentTime - startTimeRef.current);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  /** Begin: create AudioContext inside the user gesture (iOS-safe). */
  const begin = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (startedRef.current) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      void ctx.resume();

      // Master chain: gain -> soft limiter -> destination. Never clips.
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.18;
      master.connect(comp).connect(ctx.destination);
      masterRef.current = master;

      const seed = makeSeedTape();
      seedRef.current = seed.slice();
      tapeRef.current = seed.slice();
      dropoutRef.current = new Float32Array(CELLS);
      passRef.current = 0;
      cutoffRef.current = 9000;
      startTimeRef.current = ctx.currentTime;
      refreshPeaks();

      startedRef.current = true;
      setStarted(true);
      scheduleNextPass();
    } catch (e) {
      setErrMsg(
        "Audio could not start in this browser. " + (e as Error).message,
      );
    }
  }, [refreshPeaks, scheduleNextPass]);

  // Mount: start the draw loop, arm a soft idle auto-start (~2.5s).
  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    idleTimerRef.current = setTimeout(() => {
      begin();
    }, 2500);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // begin/drawFrame are stable enough; we intentionally run this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current?.disconnect();
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60)
    .toString()
    .padStart(2, "0");

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* Visual canvas strip */}
      <div className="absolute inset-0 flex items-center justify-center">
        <CanvasStrip canvasRef={canvasRef} />
      </div>

      {/* Header */}
      <div className="relative z-10 px-6 pt-10 sm:px-10">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">
          The Disintegration Loop
        </h1>
        <p className="mt-2 max-w-xl text-base text-muted-foreground">
          A recording that crumbles as it plays — re-recorded onto itself each
          pass until the music hollows into a ghost.
        </p>
        {errMsg && (
          <p className="mt-3 max-w-xl text-base text-violet-300">{errMsg}</p>
        )}
      </div>

      {/* Begin overlay */}
      {!started && !errMsg && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            onClick={begin}
            className="rounded-md border border-violet-300/40 bg-violet-300/10 px-4 py-2.5 font-mono text-base text-violet-300 transition hover:bg-violet-300/20"
            style={{ minHeight: 44 }}
          >
            Begin
          </button>
        </div>
      )}

      {/* The one lever: vertical slider. Top = hold on, bottom = let go. */}
      {started && (
        <div className="absolute bottom-10 right-6 z-10 flex flex-col items-center sm:right-10">
          <span className="mb-2 font-mono text-base text-muted-foreground">hold on</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={lever}
            onChange={(e) => setLever(parseFloat(e.target.value))}
            aria-label="hold on / let go"
            className="disint-lever"
            style={{
              writingMode: "vertical-lr",
              direction: "rtl",
              width: 28,
              height: 200,
            }}
          />
          <span className="mt-2 font-mono text-base text-muted-foreground">let go</span>
        </div>
      )}

      {/* Pass / elapsed indicator */}
      {started && (
        <div className="absolute bottom-10 left-6 z-10 font-mono text-base text-muted-foreground sm:left-10">
          <div>
            pass <span className="text-violet-300">{pass}</span>
          </div>
          <div className="text-muted-foreground">
            {mins}:{secs} elapsed
          </div>
        </div>
      )}

      {/* Design notes */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-10 z-30 font-mono text-base text-muted-foreground underline-offset-4 hover:text-muted-foreground hover:underline sm:right-10"
      >
        design notes
      </button>
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6">
          <div className="max-w-lg rounded-lg border border-border bg-zinc-950 p-6 text-base">
            <h2 className="font-semibold text-xl text-foreground">Design notes</h2>
            <p className="mt-3 text-muted-foreground">
              A warm just-intonation lullaby fragment is rendered into a tape
              buffer. Each pass, the tape&apos;s own audio is run through a wear
              chain — a downward-creeping lowpass, accumulating oxide dropouts,
              wow/flutter and tape saturation — and written back onto itself, so
              the erosion is genuine, compounding state, never an LFO or a reset.
            </p>
            <p className="mt-3 text-muted-foreground">
              The single lever is the only choice: <em>hold on</em> slows the
              decay and re-seeds a whisper of the original; <em>let go</em> lets
              it crumble faster. After ~2.5s of stillness it begins on its own
              and disintegrates with zero further input.
            </p>
            <p className="mt-3 text-muted-foreground">
              After Basinski&apos;s <em>The Disintegration Loops</em> (2002) and
              the Music Thing Modular Degenerator (2026-05-28).
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 rounded-md border border-border px-4 py-2.5 font-mono text-base text-muted-foreground hover:bg-accent"
              style={{ minHeight: 44 }}
            >
              close
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .disint-lever {
          accent-color: #c4b5fd;
          cursor: ns-resize;
        }
      `}</style>
    </main>
  );
}

// ── Canvas strip with device-pixel sizing ───────────────────────────────────

function CanvasStrip({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * 0.5 * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "50vh";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [canvasRef]);

  return <canvas ref={canvasRef} className="block w-full" />;
}
