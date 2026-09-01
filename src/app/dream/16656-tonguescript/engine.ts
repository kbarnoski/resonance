// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the loop-station. Owns the AudioContext, the safe master bus, the
// decoded takes, and a single lookahead scheduler that keeps every committed line
// looping forever as its own persistent voice of Karel's piano.
//
// Every audible sound is a slice of one of HIS decoded AudioBuffers, enveloped
// through a per-slice gain + lowpass and summed through a per-line gain (for
// mute/solo) into createSafeMaster().input — never ctx.destination, never an
// oscillator or noise. Lines of different lengths phase against each other.
// ─────────────────────────────────────────────────────────────────────────────

import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { parseLine, type WordProsody } from "./prosody";

/** Take the first few real takes — enough variety, quick to preload. */
const PRELOAD_IDS = REAL_TRACKS.slice(0, 5).map((t) => t.id);

const MAX_LINES = 8;
const MAX_SLICES = 10; // concurrent one-shot slices; steal oldest beyond this
const LOOKAHEAD = 0.12; // seconds scheduled ahead each tick
const TICK_MS = 25;
const LINE_GAIN = 0.5;
const SLICE_GAIN = 0.42;

/** A resolved word — prosody bound to an actual buffer + offset in seconds. */
interface ResolvedWord extends WordProsody {
  bufferIndex: number;
  offsetSec: number;
}

interface Voice {
  id: string;
  plan: ResolvedWord[];
  loopDur: number;
  startTime: number; // ctx time this line began looping
  cursor: number; // next word index to schedule
  cycle: number; // loop count since startTime
  gain: GainNode; // per-line gain for mute/solo/level
  muted: boolean;
  solo: boolean;
}

interface LiveSlice {
  src: AudioBufferSourceNode;
  env: GainNode;
  filt: BiquadFilterNode;
  stopAt: number;
}

/** Per-line snapshot for the visual layer (which word is sounding right now). */
export interface LineView {
  id: string;
  /** Index of the currently-sounding word, or -1 for silence/rest. */
  active: number;
}

export interface EngineView {
  time: number;
  /** Master RMS 0..1 (drives glyph bloom). */
  rms: number;
  lines: LineView[];
}

export interface Engine {
  readonly loadedCount: number;
  /** Add a committed line as a looping voice. False if capped / no buffers. */
  addLine(id: string, text: string, muted: boolean): boolean;
  removeLine(id: string): void;
  setMuted(id: string, muted: boolean): void;
  setSolo(id: string, solo: boolean): void;
  clearAll(): void;
  getView(): EngineView;
  teardown(): void;
}

/**
 * Boot the engine on a user gesture: create ctx + master, preload takes, then
 * start the scheduler. Resolves once at least one take is decoded (or throws if
 * none load). The caller populates lines from the restored manuscript.
 */
export async function createEngine(): Promise<{
  engine: Engine;
  loadErrors: number;
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

  // Preload a handful of takes; keep whatever decodes.
  const buffers: AudioBuffer[] = [];
  let loadErrors = 0;
  await Promise.all(
    PRELOAD_IDS.map(async (id) => {
      try {
        const { buffer } = await loadRealTrackBuffer(ctx, id);
        buffers.push(buffer);
      } catch {
        loadErrors += 1;
      }
    }),
  );

  const voices: Voice[] = [];
  const live: LiveSlice[] = [];
  const analyserBuf = new Uint8Array(master.analyser.fftSize);

  function resolvePlan(text: string): { plan: ResolvedWord[]; loopDur: number } {
    const { words, loopDur } = parseLine(text);
    const plan = words.map<ResolvedWord>((w) => {
      const bufferIndex = buffers.length > 0 ? w.charSum % buffers.length : 0;
      const buf = buffers[bufferIndex];
      const maxOff = buf ? Math.max(0, buf.duration - w.dur - 0.05) : 0;
      return { ...w, bufferIndex, offsetSec: w.offsetFrac * maxOff };
    });
    return { plan, loopDur };
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

  function scheduleSlice(v: Voice, w: ResolvedWord, whenRaw: number): void {
    const buf = buffers[w.bufferIndex];
    if (!buf) return;
    const when = Math.max(whenRaw, ctx.currentTime + 0.005);

    const src = ctx.createBufferSource();
    src.buffer = buf;
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
      src.start(when, w.offsetSec, dur + 0.06);
      src.stop(when + dur + 0.08);
    } catch {
      return;
    }

    const slice: LiveSlice = { src, env, filt, stopAt: when + dur };
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
      if (v.plan.length === 0) continue;
      // Schedule every onset that falls inside the lookahead window.
      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 512) break; // safety against a degenerate zero-length loop
        const w = v.plan[v.cursor];
        const when = v.startTime + v.cycle * v.loopDur + w.onset;
        if (when >= horizon) break;
        if (when >= now - 0.1 && !w.isRest) scheduleSlice(v, w, when);
        v.cursor += 1;
        if (v.cursor >= v.plan.length) {
          v.cursor = 0;
          v.cycle += 1;
        }
      }
    }
  }, TICK_MS);

  const engine: Engine = {
    get loadedCount() {
      return buffers.length;
    },

    addLine(id, text, muted) {
      if (buffers.length === 0) return false;
      if (voices.length >= MAX_LINES) return false;
      if (voices.some((v) => v.id === id)) return true;
      const { plan, loopDur } = resolvePlan(text);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master.input);
      const v: Voice = {
        id,
        plan,
        loopDur,
        startTime: ctx.currentTime + 0.08,
        cursor: 0,
        cycle: 0,
        gain,
        muted,
        solo: false,
      };
      voices.push(v);
      refreshGains();
      return true;
    },

    removeLine(id) {
      const i = voices.findIndex((v) => v.id === id);
      if (i < 0) return;
      const [v] = voices.splice(i, 1);
      try {
        v.gain.disconnect();
      } catch {
        /* closing */
      }
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
      const lines = voices.map<LineView>((v) => {
        if (t < v.startTime || v.loopDur <= 0) return { id: v.id, active: -1 };
        const local = (t - v.startTime) % v.loopDur;
        let active = -1;
        for (let i = 0; i < v.plan.length; i += 1) {
          const w = v.plan[i];
          if (!w.isRest && local >= w.onset && local < w.onset + w.dur) {
            active = i;
            break;
          }
        }
        return { id: v.id, active };
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

  return { engine, loadErrors, ctx };
}
