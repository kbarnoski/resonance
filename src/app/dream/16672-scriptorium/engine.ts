// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the scriptorium loop-station. Owns the AudioContext, the safe
// master bus, ONE decoded recording (the manuscript's piece), and a single
// lookahead scheduler that keeps every committed line looping as its own voice.
//
// This deepens 16656-tonguescript along three axes:
//
//   1. FORM-VOYAGE. There is exactly one buffer — Karel's chosen piece. Line at
//      slot N of L committed lines reads only from region [N/L, (N+1)/L] of that
//      buffer's duration. So the first line reads the opening, later lines read
//      deeper, and when a line is added every voice is re-slotted so the whole
//      manuscript always spans the arc opening→end. Minute-5 ≠ minute-1 because
//      the ensemble literally sweeps the form of his recording as you write.
//
//   2. NON-REPETITION. A repeated word does NOT cut the same grain each cycle:
//      the read offset advances a golden-ratio step every loop, wrapping inside
//      the line's region. Pitch/brightness stay keyed to the word (identity is
//      kept) but the grain drifts — the loop breathes instead of ticking.
//
//   3. STEREO. Each line's slices sum through a per-line gain → StereoPannerNode
//      → master.input, placed deterministically across the field, so the
//      manuscript reads as a spread choir rather than a mono stack.
//
// Every sound is a slice of HIS decoded buffer through createSafeMaster().input —
// never ctx.destination, never an oscillator or noise.
// ─────────────────────────────────────────────────────────────────────────────

import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { parseLine, computePan, GOLDEN, type WordProsody } from "./prosody";

// Candidate pieces, in preference order — the FIRST that decodes becomes THE
// manuscript's piece. "Welcome Home" (the title track) is the intended arc; the
// others are only fallbacks so the proto still runs if one fails to load.
const PIECE_CANDIDATES = [
  "8dafed88-4761-4dd3-a0f4-93f310441093", // Welcome Home
  "d57cfae6-f234-4d24-85fe-72a8ad93a44a", // Interplay
  "eba95845-cdbf-41d8-9c5d-8679686811ad", // Bath
].filter((id) => REAL_TRACKS.some((t) => t.id === id));

const MAX_LINES = 8;
const MAX_SLICES = 12; // concurrent one-shot slices; steal oldest beyond this
const LOOKAHEAD = 0.12; // seconds scheduled ahead each tick
const TICK_MS = 25;
const LINE_GAIN = 0.5;
const SLICE_GAIN = 0.42;
const CYCLE_DRIFT = 0.5; // golden steps per loop cycle for grain non-repetition

interface Voice {
  id: string;
  words: WordProsody[];
  loopDur: number;
  vowelDensity: number;
  slot: number; // position in the manuscript → region of the buffer
  startTime: number; // ctx time this line began looping
  cursor: number; // next word index to schedule
  cycle: number; // loop count since startTime
  gain: GainNode; // per-line gain for mute/solo/level
  panner: StereoPannerNode; // per-line stereo placement
  muted: boolean;
  solo: boolean;
  lastReadFrac: number; // 0..1 buffer fraction most recently cut (for ribbon)
}

interface LiveSlice {
  src: AudioBufferSourceNode;
  env: GainNode;
  filt: BiquadFilterNode;
}

/** Per-line snapshot for the visual layer. */
export interface LineView {
  id: string;
  /** Index of the currently-sounding word, or -1 for silence/rest. */
  active: number;
  /** Region of the recording this line reads from, as [start,end] fractions. */
  region: [number, number];
  /** Buffer fraction 0..1 most recently cut — the ribbon playhead. */
  readFrac: number;
  /** Stereo pan -1..1, for the visual choir spread. */
  pan: number;
}

export interface EngineView {
  time: number;
  /** Master RMS 0..1 (drives glyph bloom). */
  rms: number;
  lines: LineView[];
}

export interface Engine {
  readonly loaded: boolean;
  /** Title of the piece being voyaged (for display). */
  readonly pieceTitle: string;
  /** Duration of the piece in seconds (for the ribbon scale). */
  readonly pieceDuration: number;
  /** Add a committed line as a looping voice. False if capped / no buffer. */
  addLine(id: string, text: string, muted: boolean): boolean;
  removeLine(id: string): void;
  setMuted(id: string, muted: boolean): void;
  setSolo(id: string, solo: boolean): void;
  clearAll(): void;
  getView(): EngineView;
  teardown(): void;
}

/**
 * Boot the engine on a user gesture: create ctx + master, decode ONE of Karel's
 * pieces, then start the scheduler. `loaded` is false if no candidate decoded —
 * the caller surfaces a fallback notice. The caller populates lines from the
 * restored / shared manuscript.
 */
export async function createEngine(): Promise<{
  engine: Engine;
  ctx: AudioContext;
}> {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* resumes on first scheduled sound */
    }
  }

  const master: SafeMaster = createSafeMaster(ctx);

  // Decode the piece: take the first candidate that succeeds.
  let buffer: AudioBuffer | null = null;
  let pieceTitle = "";
  for (const id of PIECE_CANDIDATES) {
    try {
      const loaded = await loadRealTrackBuffer(ctx, id);
      buffer = loaded.buffer;
      pieceTitle = loaded.title;
      break;
    } catch {
      /* try the next candidate */
    }
  }

  const bufDur = buffer ? buffer.duration : 0;
  const voices: Voice[] = [];
  const live: LiveSlice[] = [];
  const analyserBuf = new Uint8Array(master.analyser.fftSize);

  /** Region [start,end] of the buffer for a voice at `slot`, out of `total`. */
  function computeRegion(slot: number, total: number): [number, number] {
    const L = Math.max(1, total);
    return [slot / L, (slot + 1) / L];
  }

  /** Re-slot every voice to its manuscript order and re-place its pan. */
  function reslot(): void {
    const now = ctx.currentTime;
    const total = voices.length;
    for (let i = 0; i < voices.length; i += 1) {
      const v = voices[i];
      v.slot = i;
      const pan = computePan(i, total, v.vowelDensity);
      try {
        v.panner.pan.setTargetAtTime(pan, now, 0.12);
      } catch {
        /* closing */
      }
    }
  }

  function effectiveGain(v: Voice): number {
    const anySolo = voices.some((x) => x.solo);
    if (v.muted) return 0;
    if (anySolo && !v.solo) return 0;
    return LINE_GAIN;
  }

  function refreshGains(): void {
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        v.gain.gain.setTargetAtTime(effectiveGain(v), now, 0.08);
      } catch {
        /* closing */
      }
    }
  }

  function scheduleSlice(v: Voice, w: WordProsody, whenRaw: number): void {
    if (!buffer) return;
    const when = Math.max(whenRaw, ctx.currentTime + 0.005);

    // FORM-VOYAGE + NON-REPETITION: resolve the within-region fraction against
    // this voice's live region, then drift it a golden step per loop cycle.
    const [rStart, rEnd] = computeRegion(v.slot, voices.length);
    const regionSpanSec = Math.max(0.05, (rEnd - rStart) * bufDur);
    const usable = Math.max(0, regionSpanSec - w.dur - 0.05);
    const frac = (w.offsetFrac + v.cycle * GOLDEN * CYCLE_DRIFT) % 1;
    const offsetSec = rStart * bufDur + frac * usable;
    v.lastReadFrac = bufDur > 0 ? offsetSec / bufDur : 0;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = w.rate;

    const env = ctx.createGain();
    env.gain.value = 0;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = w.cutoff;
    filt.Q.value = 0.7;

    src.connect(env);
    env.connect(filt);
    filt.connect(v.gain);

    // Click-free trapezoid envelope.
    const dur = w.dur;
    const att = Math.min(0.02, dur * 0.3);
    const rel = Math.min(0.12, dur * 0.5);
    const peak = SLICE_GAIN * w.gainMul;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + att);
    env.gain.setValueAtTime(peak, when + Math.max(att, dur - rel));
    env.gain.linearRampToValueAtTime(0, when + dur);

    try {
      src.start(when, offsetSec, dur + 0.06);
      src.stop(when + dur + 0.08);
    } catch {
      return;
    }

    const slice: LiveSlice = { src, env, filt };
    live.push(slice);
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
        filt.disconnect();
      } catch {
        /* already gone */
      }
      const i = live.indexOf(slice);
      if (i >= 0) live.splice(i, 1);
    };

    // Concurrency cap: steal the oldest still-sounding slice.
    if (live.length > MAX_SLICES) {
      const oldest = live.shift();
      if (oldest) {
        try {
          oldest.src.stop();
        } catch {
          /* already stopped */
        }
      }
    }
  }

  let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
    if (ctx.state === "closed") return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const v of voices) {
      if (v.words.length === 0) continue;
      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 512) break; // safety against a degenerate zero-length loop
        const w = v.words[v.cursor];
        const when = v.startTime + v.cycle * v.loopDur + w.onset;
        if (when >= horizon) break;
        if (when >= now - 0.1 && !w.isRest) scheduleSlice(v, w, when);
        v.cursor += 1;
        if (v.cursor >= v.words.length) {
          v.cursor = 0;
          v.cycle += 1;
        }
      }
    }
  }, TICK_MS);

  const engine: Engine = {
    get loaded() {
      return buffer !== null;
    },
    get pieceTitle() {
      return pieceTitle;
    },
    get pieceDuration() {
      return bufDur;
    },

    addLine(id, text, muted) {
      if (!buffer) return false;
      if (voices.length >= MAX_LINES) return false;
      if (voices.some((v) => v.id === id)) return true;
      const { words, loopDur, vowelDensity } = parseLine(text);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;
      gain.connect(panner);
      panner.connect(master.input);
      const v: Voice = {
        id,
        words,
        loopDur,
        vowelDensity,
        slot: voices.length,
        startTime: ctx.currentTime + 0.08,
        cursor: 0,
        cycle: 0,
        gain,
        panner,
        muted,
        solo: false,
        lastReadFrac: voices.length / Math.max(1, voices.length + 1),
      };
      voices.push(v);
      reslot();
      refreshGains();
      return true;
    },

    removeLine(id) {
      const i = voices.findIndex((v) => v.id === id);
      if (i < 0) return;
      const [v] = voices.splice(i, 1);
      try {
        v.gain.disconnect();
        v.panner.disconnect();
      } catch {
        /* closing */
      }
      reslot();
      refreshGains();
    },

    setMuted(id, muted) {
      const v = voices.find((x) => x.id === id);
      if (!v) return;
      v.muted = muted;
      refreshGains();
    },

    setSolo(id, solo) {
      const v = voices.find((x) => x.id === id);
      if (!v) return;
      v.solo = solo;
      refreshGains();
    },

    clearAll() {
      for (const v of voices.splice(0)) {
        try {
          v.gain.disconnect();
          v.panner.disconnect();
        } catch {
          /* closing */
        }
      }
      for (const s of live.splice(0)) {
        try {
          s.src.stop();
        } catch {
          /* already stopped */
        }
      }
    },

    getView() {
      const t = ctx.currentTime;
      let rms = 0;
      try {
        master.analyser.getByteTimeDomainData(analyserBuf);
        let sum = 0;
        for (let i = 0; i < analyserBuf.length; i += 1) {
          const x = (analyserBuf[i] - 128) / 128;
          sum += x * x;
        }
        rms = Math.sqrt(sum / analyserBuf.length);
      } catch {
        rms = 0;
      }
      const total = voices.length;
      const lines = voices.map<LineView>((v) => {
        const region = computeRegion(v.slot, total);
        const pan = computePan(v.slot, total, v.vowelDensity);
        if (t < v.startTime || v.loopDur <= 0) {
          return { id: v.id, active: -1, region, readFrac: v.lastReadFrac, pan };
        }
        const local = (t - v.startTime) % v.loopDur;
        let active = -1;
        for (let i = 0; i < v.words.length; i += 1) {
          const w = v.words[i];
          if (!w.isRest && local >= w.onset && local < w.onset + w.dur) {
            active = i;
            break;
          }
        }
        return { id: v.id, active, region, readFrac: v.lastReadFrac, pan };
      });
      return { time: t, rms, lines };
    },

    teardown() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      for (const s of live.splice(0)) {
        try {
          s.src.stop();
          s.src.disconnect();
          s.env.disconnect();
          s.filt.disconnect();
        } catch {
          /* already gone */
        }
      }
      for (const v of voices.splice(0)) {
        try {
          v.gain.disconnect();
          v.panner.disconnect();
        } catch {
          /* closing */
        }
      }
      try {
        master.disconnect();
      } catch {
        /* closing */
      }
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    },
  };

  return { engine, ctx };
}
