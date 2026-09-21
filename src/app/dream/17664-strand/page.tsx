"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17664-strand — a take that REMEMBERS itself and slowly re-composes over 5+ min.
//
//   ONE decoded real take (default "Bath") is cut into short MOTIFS — segments
//   ~1.5–5s carved around the chord changes in its analysis (falling back to
//   note-cluster boundaries, then fixed windows, if no analysis exists). The
//   piece keeps a MOTIF MEMORY of ~5. A self-rescheduling recall loop plays the
//   least-recently-heard motif — always a slice of the SAME decoded buffer, never
//   a synth tone — through 6 axes of variation:
//     1. register-LFO-biased transpose (±5 semitones) via playbackRate
//     2. a cached reverse of the whole take
//     3. light granular scatter (2–4 overlapping grains)
//     4. StereoPanner placement (biased by the motif's position in the take)
//     5. a gain attack/release swell
//     6. a convolver-reverb send (IR = a runtime decaying-noise AudioBuffer)
//   Every ~8–22s a TURNOVER retires the oldest motif and admits the next one
//   further down the take — an "admission frontier" that crawls toward the end
//   (wrapping into a long return) so late material has arrived by minute 5. Slow
//   FORM LFOs breathe density/register/reverb sparse→dense→sparse. The result is
//   audibly different at minute 5 than at minute 1, with zero interaction.
//
//   The memory ribbon (SVG) shows the take's waveform along the hem, the in-memory
//   motifs as strands converging at a loom, a bloom of the SAME cool hue when a
//   motif recurs, and the crawling admission frontier. Cool palette, slow
//   luminance only — no strobe, no grain.
//
//   Every audio path terminates at createSafeMaster(ctx).input. Nothing synthesized.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackAnalysis } from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// Default track per the brief: "Bath".
const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad";

const MEM_SIZE = 5; // motifs held in memory at once
const VOICE_CAP = 6; // simultaneous sounding motifs before the oldest is stolen
const TAU = Math.PI * 2;

// SVG geometry (viewBox 0 0 1000 560)
const HEM_Y = 480;
const WAVE_AMP = 62;
const LOOM_X = 500;
const LOOM_Y = 150;
const X0 = 40;
const XW = 920;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const xForT = (t: number) => X0 + clamp(t, 0, 1) * XW;

// cool-only hue: cyan (near) → blue → violet (far) as we travel down the take.
const hueForT = (t: number) => 188 + clamp(t, 0, 1) * 88;

// ── how far into the piece we are shapes its density / register / reverb ─────
// A single slow arc (sparse → dense → sparse) that repeats, so the texture
// keeps breathing across the whole long form.
const DENSITY_PERIOD = 210; // seconds per breath
function densityAt(elapsed: number): number {
  return (1 - Math.cos((elapsed / DENSITY_PERIOD) * TAU)) / 2; // 0..1
}
function phaseLabel(elapsed: number, wrapped: boolean): string {
  const d = densityAt(elapsed);
  const base =
    d < 0.3 ? "sparse recall" : d < 0.7 ? "recomposing" : "dense bloom";
  return wrapped ? `${base} · returning` : base;
}

interface Motif {
  id: number;
  start: number; // seconds into the buffer
  dur: number; // seconds
  sourceT: number; // 0..1 position in the take
  hue: number;
}
interface MemSlot {
  motif: Motif;
  lastHeard: number; // ctx time of last recall (0 = never)
  admitSeq: number; // admission order, for retiring the oldest
  playCount: number;
}
interface Voice {
  srcs: AudioBufferSourceNode[];
}
interface ViewMotif {
  id: number;
  sourceT: number;
  hue: number;
  ago: number; // seconds since last heard
  plays: number;
}
interface Bloom {
  key: string;
  x: number;
  y: number;
  hue: number;
}
type CutMode = "harmonic" | "clusters" | "windows";

// ── cut the decoded take into short motifs ────────────────────────────────────
function makeMotifs(
  buffer: AudioBuffer,
  analysis: TrackAnalysis | null,
): { motifs: Motif[]; mode: CutMode } {
  const dur = buffer.duration;
  const raw: { start: number; dur: number }[] = [];
  const push = (start: number, len: number) => {
    const s = clamp(start, 0, Math.max(0.01, dur - 0.9));
    let l = clamp(len, 1.5, 5);
    if (s + l > dur) l = dur - s;
    if (l < 0.8) return;
    raw.push({ start: s, dur: l });
  };

  let mode: CutMode;
  if (analysis && analysis.chords.length >= 4) {
    mode = "harmonic";
    const chords = analysis.chords;
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const next = chords[i + 1];
      const span = next ? next.time - c.time : c.duration;
      push(c.time, span > 0 ? span : c.duration || 2.5);
    }
  } else if (analysis && analysis.notes.length >= 8) {
    mode = "clusters";
    const notes = analysis.notes;
    let clusterStart = notes[0].time;
    let prev = notes[0].time;
    for (let i = 1; i < notes.length; i++) {
      const t = notes[i].time;
      if (t - prev > 0.65 || t - clusterStart > 4.5) {
        push(clusterStart, Math.max(1.5, prev - clusterStart + 0.6));
        clusterStart = t;
      }
      prev = t;
    }
    push(clusterStart, Math.max(1.5, prev - clusterStart + 0.6));
  } else {
    mode = "windows";
    const win = 2.6;
    for (let t = 0; t + 1.2 < dur; t += win * 0.85) push(t, win);
  }

  // stride down to a workable count so the frontier can traverse the whole take
  // by ~minute 5, and keep at least a handful.
  let picked = raw;
  const MAX = 42;
  if (raw.length > MAX) {
    const stride = raw.length / MAX;
    picked = [];
    for (let i = 0; i < MAX; i++) picked.push(raw[Math.floor(i * stride)]);
  }
  if (picked.length < 4) {
    // pathological short take — carve fixed windows regardless
    picked = [];
    const win = Math.max(1.2, dur / 6);
    for (let t = 0; t + 0.8 < dur; t += win) {
      picked.push({ start: t, dur: Math.min(win, dur - t) });
    }
    mode = "windows";
  }

  const motifs: Motif[] = picked.map((p, i) => {
    const sourceT = clamp(p.start / dur, 0, 1);
    return { id: i, start: p.start, dur: p.dur, sourceT, hue: hueForT(sourceT) };
  });
  return { motifs, mode };
}

function makeReversed(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const rev = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = rev.getChannelData(ch);
    const n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return rev;
}

function buildWavePath(buffer: AudioBuffer): string {
  const N = 280;
  const ch = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(ch.length / N));
  const peaks: number[] = [];
  let maxPeak = 1e-4;
  for (let i = 0; i < N; i++) {
    let m = 0;
    const base = i * block;
    for (let j = 0; j < block; j++) {
      const v = Math.abs(ch[base + j] ?? 0);
      if (v > m) m = v;
    }
    peaks.push(m);
    if (m > maxPeak) maxPeak = m;
  }
  for (let i = 0; i < N; i++) peaks[i] = peaks[i] / maxPeak;

  let d = `M ${X0.toFixed(1)} ${HEM_Y}`;
  for (let i = 0; i < N; i++) {
    const x = X0 + (i / (N - 1)) * XW;
    d += ` L ${x.toFixed(1)} ${(HEM_Y - peaks[i] * WAVE_AMP).toFixed(1)}`;
  }
  for (let i = N - 1; i >= 0; i--) {
    const x = X0 + (i / (N - 1)) * XW;
    d += ` L ${x.toFixed(1)} ${(HEM_Y + peaks[i] * WAVE_AMP).toFixed(1)}`;
  }
  return d + " Z";
}

export default function StrandPage() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trackId, setTrackId] = useState(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState(
    REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)?.title ?? "Bath",
  );
  const [cutMode, setCutMode] = useState<CutMode>("windows");
  const [wavePath, setWavePath] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // view snapshot (rendered ribbon) — refreshed a few times a second, not per-frame
  const [view, setView] = useState<{
    elapsed: number;
    phase: string;
    voices: number;
    memCount: number;
    frontierT: number;
    motifs: ViewMotif[];
  }>({
    elapsed: 0,
    phase: "—",
    voices: 0,
    memCount: 0,
    frontierT: 0,
    motifs: [],
  });
  const [blooms, setBlooms] = useState<Bloom[]>([]);

  const { immersive, toggle } = useImmersive();

  // ── audio graph ─────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const reversedRef = useRef<AudioBuffer | null>(null);
  const voicesRef = useRef<Voice[]>([]);

  // ── memory + turnover state ───────────────────────────────────────────────
  const allMotifsRef = useRef<Motif[]>([]);
  const memoryRef = useRef<MemSlot[]>([]);
  const frontierRef = useRef(0); // index of the next motif to admit
  const frontierTRef = useRef(0); // sourceT of the last admitted motif (the marker)
  const wrappedRef = useRef(false); // has the frontier looped past the end yet
  const stepRef = useRef(1);
  const seqRef = useRef(0);
  const startTimeRef = useRef(0);
  const startedRef = useRef(false);

  // ── timers ──────────────────────────────────────────────────────────────────
  const schedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── analyser-driven luminance ─────────────────────────────────────────────
  const rafRef = useRef(0);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reducedRef = useRef(false);

  // ── play ONE motif with the 6 variation axes ─────────────────────────────────
  const playMotif = useCallback((slot: MemSlot) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    const reversed = reversedRef.current;
    const convolver = convolverRef.current;
    if (!ctx || !master || !buffer) return;

    const motif = slot.motif;
    const elapsed = ctx.currentTime - startTimeRef.current;
    const density = densityAt(elapsed);

    // (form LFOs) register bias + reverb depth breathe on their own slow clocks
    const registerBias = Math.sin((elapsed / 97) * TAU) * 3; // ±3 semis
    const reverbLFO = 0.1 + ((Math.sin((elapsed / 131) * TAU) + 1) / 2) * 0.45;

    // steal the oldest voice at the ceiling
    if (voicesRef.current.length >= VOICE_CAP) {
      const victim = voicesRef.current.shift();
      victim?.srcs.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      });
    }

    // axis 1 — register-LFO-biased transpose (±5 semitones)
    const semis = clamp(registerBias + (Math.random() - 0.5) * 4, -5, 5);
    const rate = Math.pow(2, semis / 12);
    // axis 2 — cached reverse
    const useReverse = Math.random() < 0.28;
    const srcBuffer = useReverse && reversed ? reversed : buffer;
    const bufDur = buffer.duration;
    // axis 3 — light granular scatter (denser textures scatter more)
    const grains =
      Math.random() < 0.25 + density * 0.25 ? 2 + Math.floor(Math.random() * 3) : 1;
    // axis 4 — stereo placement biased by position in the take
    const pan = clamp(
      (motif.sourceT - 0.5) * 1.4 + (Math.random() - 0.5) * 0.4,
      -1,
      1,
    );

    const len = clamp(motif.dur, 1.2, 5);
    // gentler as the texture thickens so the mix never crowds
    const peak = clamp(0.26 - voicesRef.current.length * 0.02, 0.08, 0.26);

    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = clamp(1400 + (1 - density) * 4200, 700, 9000);
    filter.Q.value = 0.6;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    // axis 5 — gain attack/release swell
    const t0 = ctx.currentTime + 0.03;
    const attack = clamp(len * 0.35, 0.12, 1.1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);

    // dry path
    gain.connect(filter);
    filter.connect(panner);
    panner.connect(master.input);
    // axis 6 — convolver reverb send (IR = runtime decaying-noise buffer)
    if (convolver) {
      const send = ctx.createGain();
      send.gain.value = reverbLFO;
      panner.connect(send);
      send.connect(convolver);
    }

    const srcs: AudioBufferSourceNode[] = [];
    const startGrain = (offInMotif: number, grainDur: number, rateMul: number, when: number) => {
      const src = ctx.createBufferSource();
      src.buffer = srcBuffer;
      src.playbackRate.value = rate * rateMul;
      const rawOff = useReverse
        ? bufDur - (motif.start + motif.dur) + offInMotif
        : motif.start + offInMotif;
      const off = clamp(rawOff, 0, Math.max(0, bufDur - 0.05));
      const dur = clamp(grainDur, 0.15, Math.max(0.15, bufDur - off));
      src.connect(gain);
      src.start(when, off, dur);
      srcs.push(src);
    };

    if (grains > 1) {
      const seg = len / grains;
      for (let g = 0; g < grains; g++) {
        startGrain(
          g * seg * 0.8 + (Math.random() - 0.5) * 0.12,
          seg * 1.5,
          1 + (Math.random() - 0.5) * 0.06,
          t0 + g * seg * 0.6,
        );
      }
    } else {
      startGrain(0, len, 1, t0);
    }

    const voice: Voice = { srcs };
    voicesRef.current.push(voice);
    // cleanup once the swell has fully released
    const cleanupAt = (len + 0.4) * 1000;
    window.setTimeout(() => {
      voicesRef.current = voicesRef.current.filter((v) => v !== voice);
      try {
        gain.disconnect();
        filter.disconnect();
        panner.disconnect();
      } catch {
        /* noop */
      }
    }, cleanupAt);

    slot.lastHeard = ctx.currentTime;
    slot.playCount += 1;

    // a bloom of the SAME cool hue at the motif's source point
    const x = xForT(motif.sourceT);
    const key = `${motif.id}-${t0.toFixed(3)}`;
    setBlooms((prev) =>
      [{ key, x, y: HEM_Y, hue: motif.hue }, ...prev].slice(0, 10),
    );
    window.setTimeout(() => {
      setBlooms((prev) => prev.filter((b) => b.key !== key));
    }, 2600);
  }, []);

  // ── recall loop: play the LEAST-RECENTLY-HEARD motif, then reschedule ─────────
  const scheduleRecall = useCallback(() => {
    const tick = () => {
      if (!startedRef.current) return;
      const ctx = ctxRef.current;
      const mem = memoryRef.current;
      if (ctx && mem.length > 0) {
        let lru = mem[0];
        for (const s of mem) if (s.lastHeard < lru.lastHeard) lru = s;
        playMotif(lru);
      }
      const elapsed = ctx ? ctx.currentTime - startTimeRef.current : 0;
      const density = densityAt(elapsed);
      // dense → shorter gaps, sparse → longer gaps
      const gap = (3.4 - density * 2.5 + Math.random() * 0.5) * 1000;
      schedTimerRef.current = setTimeout(tick, gap);
    };
    schedTimerRef.current = setTimeout(tick, 400);
  }, [playMotif]);

  // ── turnover loop: retire the oldest motif, admit the next down the take ──────
  const scheduleTurnover = useCallback(() => {
    const turn = () => {
      if (!startedRef.current) return;
      const all = allMotifsRef.current;
      const mem = memoryRef.current;
      if (all.length > 0 && mem.length > 0) {
        // retire the oldest-admitted slot
        let oldest = mem[0];
        for (const s of mem) if (s.admitSeq < oldest.admitSeq) oldest = s;
        memoryRef.current = mem.filter((s) => s !== oldest);
        // admit the next motif further down the take (wrapping into a return)
        const idx = frontierRef.current;
        if (idx >= all.length) wrappedRef.current = true;
        const motif = all[idx % all.length];
        memoryRef.current.push({
          motif,
          lastHeard: 0,
          admitSeq: seqRef.current++,
          playCount: 0,
        });
        frontierTRef.current = motif.sourceT;
        frontierRef.current = idx + stepRef.current;
      }
      const wait = (8 + Math.random() * 14) * 1000;
      turnoverTimerRef.current = setTimeout(turn, wait);
    };
    turnoverTimerRef.current = setTimeout(turn, (8 + Math.random() * 8) * 1000);
  }, []);

  // ── load a take into the running engine (used by start + track change) ────────
  const loadIntoEngine = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { buffer, title } = await loadRealTrackBuffer(ctx, id);
    const reversed = makeReversed(ctx, buffer);
    let analysis: TrackAnalysis | null = null;
    try {
      analysis = await loadTrackAnalysis(id);
    } catch {
      analysis = null;
    }
    const { motifs, mode } = makeMotifs(buffer, analysis);

    // stop anything currently sounding
    voicesRef.current.forEach((v) =>
      v.srcs.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* noop */
        }
      }),
    );
    voicesRef.current = [];

    bufferRef.current = buffer;
    reversedRef.current = reversed;
    allMotifsRef.current = motifs;
    stepRef.current = Math.max(1, Math.round(motifs.length / 18));
    wrappedRef.current = false;
    seqRef.current = 0;

    const initN = Math.min(MEM_SIZE, motifs.length);
    memoryRef.current = motifs.slice(0, initN).map((m) => ({
      motif: m,
      lastHeard: 0,
      admitSeq: seqRef.current++,
      playCount: 0,
    }));
    frontierRef.current = initN;
    frontierTRef.current = motifs[Math.max(0, initN - 1)]?.sourceT ?? 0;
    startTimeRef.current = ctx.currentTime;

    setTrackTitle(title);
    setCutMode(mode);
    setWavePath(buildWavePath(buffer));
  }, []);

  // ── analyser-driven luminance loop (slow only; reduced-motion safe) ───────────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loop = () => {
      const analyser = masterRef.current?.analyser;
      const glow = glowRef.current;
      if (analyser && glow) {
        if (
          !analyserDataRef.current ||
          analyserDataRef.current.length !== analyser.fftSize
        ) {
          analyserDataRef.current = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteTimeDomainData(analyserDataRef.current);
        const d = analyserDataRef.current;
        let sum = 0;
        for (let i = 0; i < d.length; i++) {
          const v = (d[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / d.length);
        const target = reducedRef.current ? 0.2 : 0.12 + rms * 2.6;
        glow.setAttribute("opacity", clamp(target, 0.08, 0.55).toFixed(3));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      startedRef.current = false;
      if (schedTimerRef.current) clearTimeout(schedTimerRef.current);
      if (turnoverTimerRef.current) clearTimeout(turnoverTimerRef.current);
      if (snapTimerRef.current) clearInterval(snapTimerRef.current);
      voicesRef.current.forEach((v) =>
        v.srcs.forEach((s) => {
          try {
            s.stop();
          } catch {
            /* noop */
          }
        }),
      );
      voicesRef.current = [];
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
    };
  }, []);

  // ── the single "Begin" gesture ────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (startedRef.current || loading) return;
    setLoading(true);
    setAudioError(null);
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      const master = createSafeMaster(ctx);

      // shared plate-ish reverb — an effect IR (decaying noise), not a source
      const convolver = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 3.0);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const chData = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          chData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
        }
      }
      convolver.buffer = ir;
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.55;
      convolver.connect(reverbReturn);
      reverbReturn.connect(master.input);

      ctxRef.current = ctx;
      masterRef.current = master;
      convolverRef.current = convolver;

      await loadIntoEngine(trackId);

      startedRef.current = true;
      setStarted(true);
      setLoading(false);

      scheduleRecall();
      scheduleTurnover();

      // snapshot the ribbon a few times a second
      snapTimerRef.current = setInterval(() => {
        const c = ctxRef.current;
        if (!c) return;
        const elapsed = c.currentTime - startTimeRef.current;
        const motifs: ViewMotif[] = memoryRef.current.map((s) => ({
          id: s.motif.id,
          sourceT: s.motif.sourceT,
          hue: s.motif.hue,
          ago: s.lastHeard > 0 ? c.currentTime - s.lastHeard : 999,
          plays: s.playCount,
        }));
        setView({
          elapsed,
          phase: phaseLabel(elapsed, wrappedRef.current),
          voices: voicesRef.current.length,
          memCount: memoryRef.current.length,
          frontierT: frontierTRef.current,
          motifs,
        });
      }, 250);
    } catch (err) {
      setLoading(false);
      startedRef.current = false;
      setStarted(false);
      setAudioError(
        `Could not open the audio engine or decode the take (${
          (err as Error)?.message ?? "unknown error"
        }).`,
      );
    }
  }, [loading, trackId, loadIntoEngine, scheduleRecall, scheduleTurnover]);

  const handleTrackChange = useCallback(
    async (id: string) => {
      setTrackId(id);
      const fallback = REAL_TRACKS.find((r) => r.id === id);
      if (!ctxRef.current || !startedRef.current) {
        if (fallback) setTrackTitle(fallback.title);
        return;
      }
      try {
        await loadIntoEngine(id);
      } catch {
        /* keep the current take if the new one fails to load */
      }
    },
    [loadIntoEngine],
  );

  const mm = Math.floor(view.elapsed / 60);
  const ss = Math.floor(view.elapsed % 60);
  const elapsedStr = `${mm}:${ss.toString().padStart(2, "0")}`;
  const frontierX = xForT(view.frontierT);
  const modeLabel =
    cutMode === "harmonic"
      ? "cut around chord changes"
      : cutMode === "clusters"
        ? "cut at note-cluster boundaries"
        : "cut into fixed windows";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── the memory ribbon fills the viewport ── */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
        <svg
          viewBox="0 0 1000 560"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full max-h-[84vh]"
          aria-label="A memory ribbon: the take's waveform along the hem, in-memory motifs as strands converging at a loom, and a crawling admission frontier"
        >
          <defs>
            <radialGradient id="strand-bg" cx="50%" cy="30%" r="85%">
              <stop offset="0%" stopColor="#141733" />
              <stop offset="55%" stopColor="#0d0f22" />
              <stop offset="100%" stopColor="#07070f" />
            </radialGradient>
            <radialGradient id="strand-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="strand-wave" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="1000" height="560" fill="url(#strand-bg)" />

          {/* analyser-driven breathing glow at the loom (opacity set per frame) */}
          <circle
            ref={glowRef}
            cx={LOOM_X}
            cy={LOOM_Y}
            r="230"
            fill="url(#strand-glow)"
            opacity="0.14"
          />

          {/* strands: each in-memory motif → the loom; recently heard = brighter */}
          {view.motifs.map((m) => {
            const sx = xForT(m.sourceT);
            const mx = (sx + LOOM_X) / 2;
            const my = Math.min(HEM_Y, LOOM_Y) - 60;
            const bright = clamp(1 - m.ago / 6, 0.18, 1);
            return (
              <path
                key={`strand-${m.id}`}
                d={`M ${sx.toFixed(1)} ${HEM_Y} Q ${mx.toFixed(1)} ${my} ${LOOM_X} ${LOOM_Y}`}
                fill="none"
                stroke={`hsl(${m.hue}, 72%, ${52 + bright * 16}%)`}
                strokeWidth={(0.8 + bright * 2.2).toFixed(2)}
                strokeLinecap="round"
                opacity={(0.2 + bright * 0.6).toFixed(2)}
              />
            );
          })}

          {/* strand source anchors on the hem */}
          {view.motifs.map((m) => {
            const sx = xForT(m.sourceT);
            const bright = clamp(1 - m.ago / 6, 0.18, 1);
            return (
              <circle
                key={`anchor-${m.id}`}
                cx={sx}
                cy={HEM_Y}
                r={(1.6 + bright * 2.4).toFixed(2)}
                fill={`hsl(${m.hue}, 78%, ${58 + bright * 14}%)`}
                opacity={(0.4 + bright * 0.5).toFixed(2)}
              />
            );
          })}

          {/* the loom — where memory re-weaves */}
          <g>
            <circle cx={LOOM_X} cy={LOOM_Y} r="26" fill="none" stroke="#a5b4fc" strokeWidth="0.6" opacity="0.35" />
            <circle cx={LOOM_X} cy={LOOM_Y} r="15" fill="none" stroke="#67e8f9" strokeWidth="0.8" opacity="0.5" />
            <circle cx={LOOM_X} cy={LOOM_Y} r="4.5" fill="#c7d2fe" opacity="0.9" />
          </g>

          {/* blooms: a motif recurs → its source point blooms in the same hue */}
          {blooms.map((b) => (
            <circle
              key={b.key}
              className="strand-bloom"
              cx={b.x}
              cy={b.y}
              r="3"
              fill="none"
              stroke={`hsl(${b.hue}, 85%, 68%)`}
              strokeWidth="1.4"
              style={{ transformOrigin: `${b.x}px ${b.y}px` }}
            />
          ))}

          {/* the take's waveform along the hem */}
          {wavePath && <path d={wavePath} fill="url(#strand-wave)" stroke="none" />}
          <line
            x1={X0}
            y1={HEM_Y}
            x2={X0 + XW}
            y2={HEM_Y}
            stroke="#818cf8"
            strokeWidth="0.5"
            opacity="0.3"
          />

          {/* the slowly-crawling admission frontier */}
          {started && (
            <g>
              <line
                x1={frontierX}
                y1={HEM_Y - WAVE_AMP - 14}
                x2={frontierX}
                y2={HEM_Y + WAVE_AMP + 14}
                stroke="#f0abfc"
                strokeWidth="1"
                opacity="0.65"
              />
              <path
                d={`M ${frontierX - 5} ${HEM_Y - WAVE_AMP - 20} L ${frontierX + 5} ${HEM_Y - WAVE_AMP - 20} L ${frontierX} ${HEM_Y - WAVE_AMP - 12} Z`}
                fill="#f0abfc"
                opacity="0.8"
              />
            </g>
          )}
        </svg>
      </div>

      <style>{`
        @keyframes strandBloom {
          0%   { r: 3px; opacity: 0.85; stroke-width: 1.6px; }
          100% { r: 42px; opacity: 0; stroke-width: 0.1px; }
        }
        .strand-bloom { animation: strandBloom 2.4s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .strand-bloom { animation: none; opacity: 0.4; r: 8px; }
        }
      `}</style>

      {/* ── write-up chrome (hidden while immersive) ── */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-7">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              17664 · strand
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              A take that remembers itself
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              His take is cut into short motifs held in a memory of five. It
              recalls the least-recently-heard one, varies it, and slowly admits
              material further down the take — so minute five sounds nowhere near
              minute one. Watch the memory work; it plays on its own.
            </p>
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
            <ImmersiveToggle immersive={immersive} onToggle={toggle} />
          </div>
        </div>
      )}

      {/* ── live status line (always visible once started) ── */}
      {started && (
        <div
          className={`pointer-events-none absolute left-5 z-10 sm:left-7 ${
            immersive ? "top-6" : "top-44 sm:top-52"
          }`}
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            memory ribbon
          </p>
          <p className="mt-1 font-mono text-3xl tabular-nums text-foreground">
            {elapsedStr}
          </p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {view.phase} · {view.voices} voice{view.voices === 1 ? "" : "s"} ·{" "}
            {view.memCount} in memory
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            source: {trackTitle} · {modeLabel}
          </p>
        </div>
      )}

      {/* ── controls ── */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 pb-16 sm:p-7 sm:pb-16">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md sm:p-5">
            {audioError && <p className="text-sm text-destructive">{audioError}</p>}
            {!started ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-base text-muted-foreground">
                  Press begin, then leave it be. Over the next several minutes the
                  take recalls and re-composes itself with zero interaction.
                </p>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={loading}
                  className="min-h-[44px] shrink-0 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "Decoding his take…" : "Begin"}
                </button>
              </div>
            ) : (
              <label className="flex flex-col gap-1.5 sm:max-w-xs">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  remembering take
                </span>
                <select
                  value={trackId}
                  onChange={(e) => handleTrackChange(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  {REAL_TRACKS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── design-notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              strand — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if one
                of Karel&apos;s takes could remember itself and slowly re-compose
                over 5+ minutes — motifs recurring with controllable variation, so
                the piece is audibly different at minute five than at minute one —
                and you could watch the memory work?
              </p>
              <p>
                <span className="text-foreground">How it works:</span> one decoded
                take is cut into short motifs (~1.5–5s), carved around the chord
                changes in its analysis, or at note-cluster boundaries, or into
                fixed windows if no analysis exists. A memory of five holds the
                current motifs; a self-rescheduling loop recalls the
                least-recently-heard one and plays it as a slice of the same buffer
                through six axes of variation — register-LFO transpose, cached
                reverse, granular scatter, stereo placement, a swell envelope, and
                a convolver-reverb send. Every 8–22s a turnover retires the oldest
                motif and admits the next one further down the take; that admission
                frontier crawls toward the end (then wraps into a long return), so
                late material has arrived by minute five. Slow form LFOs breathe
                density, register and reverb sparse→dense→sparse.
              </p>
              <p>
                <span className="text-foreground">Nothing synthesized:</span> every
                sounding note is a slice of his real recording. The only generated
                signal is the reverb impulse — an effect, not a source. All audio
                passes through the ear-safety master bus.
              </p>
              <p>
                <span className="text-foreground">References:</span> motif
                memory-retrieval and recombination in generative music — David
                Cope&apos;s <em>Experiments in Musical Intelligence</em> (EMI),
                which recomposes a corpus by recombining recalled musical
                signatures, and Brian Eno&apos;s long-form generative works
                (<em>Music for Airports</em>, <em>Reflection</em>), where looping
                fragments of differing lengths drift out of phase so the piece is
                never quite the same twice.
              </p>
              <p>
                <span className="text-foreground">Palette:</span> cool only — cyan
                for near/early material warming toward violet for material deep in
                the take; slow luminance breathing at the loom, no strobe, no grain.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {!immersive && <PrototypeNav slugs={["17664-strand"]} />}
    </main>
  );
}
