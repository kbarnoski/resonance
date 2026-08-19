"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15424-negative — THE NEGATIVE SCORE.
//
// You SEE and HEAR the negative of Karel's score. A full-chromatic scrolling
// ribbon flows past a playhead: the luminous, colored field is his SILENCE —
// the breath, the pedal air, the reverb tails, the rests. His actual NOTES are
// DARK holes punched out of that field (an inverted piano roll: he plays → the
// ribbon goes dark; he is silent → it glows in color that tracks the harmony).
//
// The audio agrees with the image. An inverted-gain envelope, built from the
// note roll, DUCKS his notes to a faint ghost and OPENS on the interstices, so
// what you actually hear is the room between the notes. A REVEAL slider lerps
// his notes back up so the withholding is legible and A-B-able.
//
// Conceptual/critical piece: the subject is what he leaves OUT. Zero synthesis —
// the only sound is Karel's decoded real recording, gated through the shared
// ear-safety master. See README.md for the named references.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  pitchClassHue,
  type TrackNote,
  type TrackChord,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

type Phase = "idle" | "loading" | "ready" | "error";

// ── tuning constants ─────────────────────────────────────────────────────────
const WINDOW_SECONDS = 14; // seconds of the ribbon visible across the canvas
const PLAYHEAD_FRAC = 1 / 3; // playhead x, fraction from the left
const MIDI_LO = 21; // A0
const MIDI_HI = 108; // C8
const FLOOR_MIN = 0.03; // note-region gain at REVEAL 0 (pure negative space)
const FLOOR_MAX = 0.9; // note-region gain at REVEAL 1 (his notes fully audible)
const AIR_MIN = 0.55;
const AIR_MAX = 1.0;
const DEFAULT_REVEAL = 0.15;
const DEFAULT_AIR = 0.92;
const LOOKAHEAD = 0.03; // seconds — duck lands just before an onset
const MERGE_GAP = 0.04; // merge note intervals separated by < 40ms

// A merged note-active interval, in track seconds.
type Interval = [number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Union of note [time, time+duration] intervals, merged with a small gap. */
function buildNoteIntervals(notes: TrackNote[]): Interval[] {
  if (!notes.length) return [];
  const raw: Interval[] = notes
    .map((n) => [n.time, n.time + Math.max(0.01, n.duration)] as Interval)
    .sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  let [cs, ce] = raw[0];
  for (let i = 1; i < raw.length; i++) {
    const [s, e] = raw[i];
    if (s <= ce + MERGE_GAP) {
      if (e > ce) ce = e;
    } else {
      out.push([cs, ce]);
      cs = s;
      ce = e;
    }
  }
  out.push([cs, ce]);
  return out;
}

/** True if time t falls inside any note-active interval (binary search). */
function inNoteAt(t: number, iv: Interval[]): boolean {
  let lo = 0;
  let hi = iv.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = iv[mid];
    if (t < s) hi = mid - 1;
    else if (t > e) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Amplitude fallback: when there is no note roll, derive interstices straight
 * from the buffer's own RMS envelope. Windows above a relative threshold read
 * as "note", below as "silence/air".
 */
function intervalsFromRms(buffer: AudioBuffer): Interval[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.05)); // ~50ms windows
  const n = Math.floor(data.length / win);
  const rms = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const base = i * win;
    for (let j = 0; j < win; j++) {
      const v = data[base + j];
      sum += v * v;
    }
    const r = Math.sqrt(sum / win);
    rms[i] = r;
    if (r > peak) peak = r;
  }
  const thresh = peak * 0.16 + 1e-4; // above this → "note"
  const iv: Interval[] = [];
  let open = -1;
  for (let i = 0; i < n; i++) {
    const loud = rms[i] > thresh;
    if (loud && open < 0) open = i;
    else if (!loud && open >= 0) {
      iv.push([(open * win) / sr, (i * win) / sr]);
      open = -1;
    }
  }
  if (open >= 0) iv.push([(open * win) / sr, (n * win) / sr]);
  // merge tiny gaps
  const merged: Interval[] = [];
  for (const cur of iv) {
    const last = merged[merged.length - 1];
    if (last && cur[0] - last[1] < 0.12) last[1] = cur[1];
    else merged.push([cur[0], cur[1]]);
  }
  return merged;
}

export default function NegativeScorePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [started, setStarted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [no2d, setNo2d] = useState(false);

  const firstId = COLLECTIONS[0].tracks[1]?.id ?? COLLECTIONS[0].tracks[0].id; // "Bath"
  const [activeId, setActiveId] = useState<string>(firstId);
  const [title, setTitle] = useState<string>(
    COLLECTIONS[0].tracks[1]?.title ?? COLLECTIONS[0].tracks[0].title,
  );
  const [keyName, setKeyName] = useState<string>("");
  const [fallback, setFallback] = useState(false);

  const [reveal, setReveal] = useState(DEFAULT_REVEAL);
  const [air, setAir] = useState(DEFAULT_AIR);

  // ── audio + timeline refs (read by the rAF loop, kept off the render path) ──
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const envGainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const durRef = useRef(0);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);

  const intervalsRef = useRef<Interval[]>([]);
  const notesRef = useRef<TrackNote[]>([]);
  const chordsRef = useRef<TrackChord[]>([]);
  const midiLoRef = useRef(MIDI_LO);
  const midiHiRef = useRef(MIDI_HI);

  const revealRef = useRef(DEFAULT_REVEAL);
  const airRef = useRef(DEFAULT_AIR);
  const reducedRef = useRef(false);
  const lastTargetRef = useRef(-1);
  const opennessRef = useRef(1); // shared: audio gate value → visual brightness
  const tornDownRef = useRef(false);
  const runningRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);

  // mirror slider state → refs for the loop
  useEffect(() => {
    revealRef.current = reveal;
  }, [reveal]);
  useEffect(() => {
    airRef.current = air;
  }, [air]);
  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── hue at a given track time: harmony → hue around the FULL wheel, plus a ──
  // slow positional drift so the ribbon sweeps the spectrum over the track.
  const hueAt = useCallback((t: number): number => {
    const dur = durRef.current || 1;
    const drift = (t / dur) * 300; // sweep most of the wheel across the piece
    const chords = chordsRef.current;
    if (chords.length) {
      // binary-search the active chord
      let lo = 0;
      let hi = chords.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (chords[mid].time <= t) {
          idx = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (idx >= 0) {
        const root = chordRoot(chords[idx].chord);
        if (root !== null) return (pitchClassHue(root) + drift) % 360;
      }
    }
    // no chords → drift the full wheel by time
    return (drift + 30) % 360;
  }, []);

  // ── the core engine: gate the audio + draw the negative score, one loop ─────
  const frame = useCallback(() => {
    const ctx = ctxRef.current;
    const env = envGainRef.current;
    const master = masterRef.current;
    if (!ctx || !env || !master) return;

    const elapsed = Math.max(0, ctx.currentTime - startTimeRef.current);
    const iv = intervalsRef.current;

    // --- audio: inverted-gain envelope -------------------------------------
    const revealV = revealRef.current;
    const airV = lerp(AIR_MIN, AIR_MAX, airRef.current);
    const floor = lerp(FLOOR_MIN, FLOOR_MAX, revealV);
    const isNote = iv.length ? inNoteAt(elapsed + LOOKAHEAD, iv) : false;
    const target = isNote ? floor : airV;
    if (Math.abs(target - lastTargetRef.current) > 1e-4) {
      // duck fast on note onset, swell slower into the air so tails bloom
      env.gain.setTargetAtTime(
        target,
        ctx.currentTime,
        isNote ? 0.05 : 0.08,
      );
      lastTargetRef.current = target;
    }
    // openness (1 = you hear the room, 0 = his notes duck it out) → visuals
    opennessRef.current = isNote ? floor / FLOOR_MAX : 1;

    // room-tone shimmer from the tamed signal
    const an = master.analyser;
    const buf = shimmerBufRef.current;
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      s += v * v;
    }
    const rms = Math.sqrt(s / buf.length);

    // --- visual -------------------------------------------------------------
    if (no2dRef.current) {
      const m = meterRef.current;
      if (m) m.style.width = `${clamp01(opennessRef.current) * 100}%`;
    } else {
      drawScore(elapsed, rms);
    }

    rafRef.current = requestAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shimmerBufRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const no2dRef = useRef(false);
  useEffect(() => {
    no2dRef.current = no2d;
  }, [no2d]);

  // ── draw the negative score ────────────────────────────────────────────────
  const drawScore = useCallback((elapsed: number, rms: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = ctxCanvasRef.current;
    if (!c2d) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 400;
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    const W = canvas.width;
    const H = canvas.height;

    // under reduced motion, quantize the scroll clock so it steps, not glides
    const scrollT = reducedRef.current
      ? Math.floor(elapsed / 0.5) * 0.5
      : elapsed;

    const pxPerSec = W / WINDOW_SECONDS;
    const playX = W * PLAYHEAD_FRAC;
    const tAtX = (x: number) => scrollT + (x - playX) / pxPerSec;
    const xAtT = (t: number) => playX + (t - scrollT) * pxPerSec;

    // dark ground (the "ink" the field is punched into)
    c2d.fillStyle = "#07080d";
    c2d.fillRect(0, 0, W, H);

    // 1) the luminous full-chromatic FIELD = his silence/air. Column strips,
    //    hue from the harmony at that column's time, vertical glow gradient.
    const step = Math.max(2, Math.round(3 * dpr));
    for (let x = 0; x < W; x += step) {
      const t = tAtX(x + step / 2);
      const hue = hueAt(t);
      // brightness rises toward the playhead where the room is sounding NOW,
      // and follows the shared openness value there.
      const distNorm = 1 - Math.min(1, Math.abs(x - playX) / (W * 0.6));
      const nearPlay = 0.35 + 0.65 * distNorm;
      const openBoost =
        x <= playX + step && x >= playX - pxPerSec * 0.4
          ? 0.25 * opennessRef.current + 0.12 * rms
          : 0;
      const light = clamp01(0.34 * nearPlay + openBoost);
      const grad = c2d.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `hsla(${hue}, 82%, ${18 + light * 22}%, 0.16)`);
      grad.addColorStop(
        0.5,
        `hsla(${hue}, 92%, ${46 + light * 30}%, ${0.5 + light * 0.4})`,
      );
      grad.addColorStop(1, `hsla(${(hue + 26) % 360}, 82%, ${18 + light * 22}%, 0.16)`);
      c2d.fillStyle = grad;
      c2d.fillRect(x, 0, step + 1, H);
    }

    // soft vertical vignette so the ribbon reads as a band of light
    const vg = c2d.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, "rgba(7,8,13,0.85)");
    vg.addColorStop(0.5, "rgba(7,8,13,0)");
    vg.addColorStop(1, "rgba(7,8,13,0.85)");
    c2d.fillStyle = vg;
    c2d.fillRect(0, 0, W, H);

    // 2) his NOTES = DARK holes punched OUT of the field (inverted piano roll)
    const notes = notesRef.current;
    const midiLo = midiLoRef.current;
    const midiHi = midiHiRef.current;
    const span = Math.max(1, midiHi - midiLo);
    const yOf = (midi: number) =>
      H - ((clamp01((midi - midiLo) / span)) * (H * 0.86) + H * 0.07);
    const rowH = Math.max(3 * dpr, (H * 0.86) / span);

    const winStart = tAtX(0) - 0.5;
    const winEnd = tAtX(W) + 0.5;
    // binary-search first note whose end >= winStart
    let lo = 0;
    let hi = notes.length - 1;
    let first = notes.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].time + notes[mid].duration >= winStart) {
        first = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    for (let i = first; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > winEnd) break;
      const x0 = xAtT(n.time);
      const w = Math.max(2 * dpr, n.duration * pxPerSec);
      const y = yOf(n.midi) - rowH / 2;
      const h = rowH * 1.15;
      // punch: fill with the dark ground, then a subtle inner shadow lip
      const r = Math.min(rowH * 0.5, 6 * dpr, w * 0.5);
      roundRect(c2d, x0, y, w, h, r);
      c2d.fillStyle = "rgba(4,4,8,0.94)";
      c2d.fill();
      // faint cool rim so the hole reads as carved, keyed to velocity depth
      c2d.lineWidth = Math.max(1, dpr);
      c2d.strokeStyle = `rgba(150,160,190,${0.06 + (n.velocity / 127) * 0.1})`;
      c2d.stroke();
    }

    // 3) the playhead + room-tone shimmer
    const glowW = 2 * dpr;
    const openA = clamp01(0.22 + opennessRef.current * 0.55 + rms * 0.5);
    const pg = c2d.createLinearGradient(playX - 26 * dpr, 0, playX + 26 * dpr, 0);
    pg.addColorStop(0, "rgba(255,255,255,0)");
    pg.addColorStop(0.5, `rgba(255,255,255,${openA * 0.5})`);
    pg.addColorStop(1, "rgba(255,255,255,0)");
    c2d.fillStyle = pg;
    c2d.fillRect(playX - 26 * dpr, 0, 52 * dpr, H);
    c2d.fillStyle = `rgba(255,255,255,${clamp01(0.35 + opennessRef.current * 0.5)})`;
    c2d.fillRect(playX - glowW / 2, 0, glowW, H);
  }, [hueAt]);

  const ctxCanvasRef = useRef<CanvasRenderingContext2D | null>(null);

  // ── (re)arm a fresh buffer source so playback self-propels (loops) ──────────
  const armSource = useCallback(() => {
    const ctx = ctxRef.current;
    const env = envGainRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !env || !buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(env);
    src.onended = () => {
      if (tornDownRef.current || !runningRef.current) return;
      if (srcRef.current === src) {
        try {
          src.disconnect();
        } catch {
          /* noop */
        }
        armSource(); // loop for review
      }
    };
    srcRef.current = src;
    lastTargetRef.current = -1; // force a fresh ramp on the new pass
    startTimeRef.current = ctx.currentTime + 0.06;
    src.start(startTimeRef.current);
  }, []);

  const stopSource = useCallback(() => {
    const s = srcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
        s.disconnect();
      } catch {
        /* already stopped */
      }
      srcRef.current = null;
    }
  }, []);

  // ── load one real track: buffer + analysis → intervals, then play ──────────
  const load = useCallback(
    async (id: string) => {
      setActiveId(id);
      setPhase("loading");
      stopSource();

      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new Ctx();
        ctxRef.current = ctx;
        masterRef.current = createSafeMaster(ctx, { gain: 0.9 });
        shimmerBufRef.current = new Uint8Array(masterRef.current.analyser.fftSize);
        const env = ctx.createGain();
        env.gain.value = AIR_MAX; // t≈0 is usually air → start open
        env.connect(masterRef.current.input);
        envGainRef.current = env;
      }
      await ctx.resume().catch(() => {});

      try {
        const [audio, analysis] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id),
        ]);
        bufferRef.current = audio.buffer;
        durRef.current = audio.buffer.duration;
        setTitle(audio.title);
        setKeyName(
          analysis?.key_signature ?? analysis?.summary?.key_center ?? "",
        );

        const notes = analysis?.notes ?? [];
        notesRef.current = notes;
        chordsRef.current = analysis?.chords ?? [];

        if (notes.length) {
          intervalsRef.current = buildNoteIntervals(notes);
          // pitch range for the roll (clamped to the piano)
          let loM = Infinity;
          let hiM = -Infinity;
          for (const n of notes) {
            if (n.midi < loM) loM = n.midi;
            if (n.midi > hiM) hiM = n.midi;
          }
          midiLoRef.current = Math.max(MIDI_LO, Math.min(loM - 2, 60));
          midiHiRef.current = Math.min(MIDI_HI, Math.max(hiM + 2, 72));
          setFallback(false);
        } else {
          // amplitude fallback — derive interstices from the buffer's RMS
          intervalsRef.current = intervalsFromRms(audio.buffer);
          midiLoRef.current = MIDI_LO;
          midiHiRef.current = MIDI_HI;
          setFallback(true);
        }

        lastTargetRef.current = -1;
        runningRef.current = true;
        tornDownRef.current = false;
        armSource();
        if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    },
    [stopSource, armSource, frame],
  );

  const handleBegin = useCallback(() => {
    if (typeof window === "undefined") return;
    setStarted(true);
    // probe 2D support up front so we know which surface to drive
    const canvas = canvasRef.current;
    let ok = false;
    if (canvas) {
      try {
        const c = canvas.getContext("2d");
        if (c) {
          ctxCanvasRef.current = c;
          ok = true;
        }
      } catch {
        ok = false;
      }
    }
    setNo2d(!ok);
    no2dRef.current = !ok;
    void load(activeId);
  }, [activeId, load]);

  // Stop: halt playback + loop but keep the context for a quick restart.
  const handleStop = useCallback(() => {
    runningRef.current = false;
    stopSource();
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    opennessRef.current = 1;
    setPhase("idle");
    setStarted(false);
  }, [stopSource]);

  // full teardown on unmount
  useEffect(
    () => () => {
      tornDownRef.current = true;
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      const s = srcRef.current;
      if (s) {
        try {
          s.onended = null;
          s.stop();
          s.disconnect();
        } catch {
          /* already stopped */
        }
      }
      try {
        envGainRef.current?.disconnect();
      } catch {
        /* noop */
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-dvh w-full bg-background text-foreground">
      {/* full-bleed canvas surface (mounted always so getContext works on start) */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`fixed inset-0 h-full w-full ${
          started && !no2d ? "opacity-100" : "opacity-0"
        } transition-opacity duration-700`}
      />

      {/* pre-start gate */}
      {!started && (
        <div className="relative z-10 flex min-h-dvh items-center justify-center px-6">
          <div className="max-w-xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Negative space · interstitial listening
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
              THE NEGATIVE SCORE
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              The negative of Karel&rsquo;s score. His notes are the{" "}
              <span className="text-foreground">dark holes</span> punched out of
              a luminous, full-chromatic ribbon — and the bright color between
              them, his silences, breath, pedal air and reverb tails, is what
              you <span className="text-foreground">hear and see</span>. His
              notes duck to a ghost.
            </p>

            <div className="mt-7 flex flex-col items-center gap-3">
              <label className="sr-only" htmlFor="track-pre">
                Track
              </label>
              <select
                id="track-pre"
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                className="min-h-[44px] w-full max-w-xs rounded-md border border-border bg-background/60 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBegin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Hear the silence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* running overlay */}
      {started && (
        <div className="relative z-10 flex min-h-dvh flex-col justify-between p-4 sm:p-6">
          {/* header */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                The negative score
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {title}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {keyName ? `${keyName} · ` : ""}Karel Barnoski
              </span>
              {fallback && (
                <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  amplitude fallback (no note roll)
                </span>
              )}
              {phase === "loading" && (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  loading…
                </span>
              )}
            </div>
          </header>

          {/* 2D-degrade DOM meter (only when canvas 2D is unavailable) */}
          {no2d && (
            <div className="mx-auto mt-6 w-full max-w-md">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Canvas 2D unavailable — audio-only. The bar is the openness: full
                on his silences, near-empty when his notes duck.
              </p>
              <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                <div
                  ref={meterRef}
                  className="h-full bg-primary transition-[width] duration-100"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}

          {phase === "error" && (
            <p className="mx-auto max-w-md text-center text-base text-destructive">
              Couldn&rsquo;t load that recording. Pick another track below.
            </p>
          )}

          {/* controls: the steer sliders + track picker */}
          <section className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-popover/70 p-4 backdrop-blur-md sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* REVEAL */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="reveal"
                    className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Reveal
                  </label>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(reveal * 100)}%
                  </span>
                </div>
                <input
                  id="reveal"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={reveal}
                  onChange={(e) => setReveal(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs leading-snug text-muted-foreground">
                  0 = pure negative space (his notes vanish). Slide up to lift his
                  notes back — the withholding made A-B-able.
                </p>
              </div>

              {/* AIR */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="air"
                    className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Air
                  </label>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(air * 100)}%
                  </span>
                </div>
                <input
                  id="air"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={air}
                  onChange={(e) => setAir(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs leading-snug text-muted-foreground">
                  How wide the interstices open — the loudness of the room, the
                  tails and breath between his notes.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <label className="sr-only" htmlFor="track-live">
                Track
              </label>
              <select
                id="track-live"
                value={activeId}
                onChange={(e) => void load(e.target.value)}
                className="min-h-[44px] flex-1 rounded-md border border-border bg-background/60 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={handleStop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </div>
            <p className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-muted-foreground">
              Dark holes are where he plays; the color glows where he is silent.
              Playback self-propels and loops for review.
            </p>
          </section>
        </div>
      )}

      <PrototypeNav slugs={["15424-negative"]} />
    </main>
  );
}

// ── small canvas helper ───────────────────────────────────────────────────────
function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}
