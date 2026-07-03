// ─────────────────────────────────────────────────────────────────────────────
// Spectral Scrub — audio engine
//
// A granular time-scrub / spectral-freeze instrument built on Karel's REAL
// recorded piano. The core is a granular resynthesis scheduler: many short,
// Hann-windowed grains are fired from a moving read head (`posSec`). Because
// each grain plays at its natural rate, moving the read head slowly (or
// freezing it) time-stretches the recording WITHOUT changing pitch — the
// pitch-preserving trick behind the phase vocoder (Flanagan & Golden, 1966),
// approximated here with the more forgiving granular / overlap-add method.
//
// Three ways to load a source (all self-contained, priority order):
//   1. A Path recording id  → GET /api/audio/:id  → {url} → decode.
//   2. A user's own file    → decodeAudioData.
//   3. A built-in synth demo (never blank on load).
//
// If a fetched (cross-origin) url can't be decoded, we fall back to an
// <audio crossOrigin> + MediaElementSource so playback + scrub still work
// (granular freeze is unavailable in that mode; the UI says so).
// ─────────────────────────────────────────────────────────────────────────────

const GRAIN_DUR = 0.11; // seconds per grain
const GRAIN_INTERVAL = 0.028; // spawn spacing → ~4x overlap
const LOOKAHEAD = 0.14; // schedule this far ahead
const SCHED_MS = 25; // scheduler wakeup
const FREEZE_JITTER = 0.007; // read-head jitter while frozen (kills metallic looping)

export type ScrubMode = "granular" | "element";

/** Rate presets applied when the user is NOT actively dragging. */
export const RATES = {
  freeze: 0,
  slow: 0.28,
  play: 1,
  reverse: -0.8,
} as const;

export interface EngineHandle {
  mode: ScrubMode;
  /** normalized read position 0..1 */
  getPos(): number;
  /** live output level 0..1 (from the analyser) */
  getLevel(): number;
  /** copy the current byte spectrum into `out` (length = frequencyBinCount) */
  readSpectrum(out: Uint8Array): void;
  frequencyBinCount(): number;
  /** min/max peak pairs for the waveform strip */
  peaks: Float32Array;
  duration: number;
  setPos(norm: number): void;
  setDragging(on: boolean): void;
  setRate(rate: number): void;
  /** vertical sculpt 0 (dark) .. 1 (bright) → filter cutoff */
  setSculpt(norm: number): void;
  start(): void;
  stop(): void;
}

function makePeaks(buffer: AudioBuffer, count: number): Float32Array {
  const ch = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(ch.length / count));
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    let min = 1;
    let max = -1;
    const s = i * block;
    const e = Math.min(ch.length, s + block);
    for (let j = s; j < e; j++) {
      const v = ch[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[i * 2] = min;
    out[i * 2 + 1] = max;
  }
  return out;
}

// ─── Shared graph: filter → master → analyser → destination ──────────────────
function buildGraph(ctx: AudioContext) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 6000;
  filter.Q.value = 0.9;

  const master = ctx.createGain();
  master.gain.value = 0.85;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;

  filter.connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);
  return { filter, master, analyser };
}

function cutoffFor(norm: number): number {
  // exponential map: dark ~180Hz → bright ~15kHz
  const t = Math.min(1, Math.max(0, norm));
  return 180 * Math.pow(15000 / 180, t);
}

// ─── Granular engine (tiers 1 decoded, 2, 3) ─────────────────────────────────
export function makeGranularEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
): EngineHandle {
  const { filter, master, analyser } = buildGraph(ctx);
  const binCount = analyser.frequencyBinCount;
  const peaks = makePeaks(buffer, 640);
  const dur = buffer.duration;

  let posSec = 0;
  let rate = RATES.play as number;
  let dragging = false;
  let sculpt = 0.62;
  let running = false;
  let timer: number | null = null;
  let nextGrainTime = 0;
  const active = new Set<AudioBufferSourceNode>();

  filter.frequency.value = cutoffFor(sculpt);

  function spawnGrain(when: number) {
    let offset = posSec;
    if (rate === 0) offset += (Math.random() * 2 - 1) * FREEZE_JITTER;
    offset = Math.min(dur - GRAIN_DUR - 0.001, Math.max(0, offset));

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    // Hann-ish window via two ramps.
    const peak = 0.9;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + GRAIN_DUR * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, when + GRAIN_DUR);
    src.connect(g);
    g.connect(filter);
    src.start(when, offset, GRAIN_DUR + 0.02);
    src.stop(when + GRAIN_DUR + 0.02);
    active.add(src);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
      active.delete(src);
    };
  }

  function tick() {
    if (!running) return;
    const now = ctx.currentTime;
    while (nextGrainTime < now + LOOKAHEAD) {
      spawnGrain(nextGrainTime);
      if (!dragging && rate !== 0) {
        posSec += rate * GRAIN_INTERVAL;
        if (posSec >= dur) posSec -= dur;
        else if (posSec < 0) posSec += dur;
      }
      nextGrainTime += GRAIN_INTERVAL;
    }
    timer = window.setTimeout(tick, SCHED_MS);
  }

  return {
    mode: "granular",
    peaks,
    duration: dur,
    getPos: () => posSec / dur,
    getLevel: () => {
      const buf = new Uint8Array(binCount);
      analyser.getByteFrequencyData(buf);
      let s = 0;
      for (let i = 0; i < binCount; i++) s += buf[i];
      return s / (binCount * 255);
    },
    readSpectrum: (out) => analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>),
    frequencyBinCount: () => binCount,
    setPos: (norm) => {
      posSec = Math.min(dur, Math.max(0, norm * dur));
    },
    setDragging: (on) => {
      dragging = on;
    },
    setRate: (r) => {
      rate = r;
    },
    setSculpt: (norm) => {
      sculpt = norm;
      filter.frequency.setTargetAtTime(cutoffFor(norm), ctx.currentTime, 0.04);
    },
    start: () => {
      if (running) return;
      running = true;
      nextGrainTime = ctx.currentTime + 0.06;
      tick();
    },
    stop: () => {
      running = false;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      for (const s of active) {
        try {
          s.stop();
          s.disconnect();
        } catch {
          /* ignore */
        }
      }
      active.clear();
      try {
        filter.disconnect();
        master.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

// ─── Element engine (tier-1 CORS fallback: no granular freeze) ───────────────
export function makeElementEngine(
  ctx: AudioContext,
  el: HTMLAudioElement,
): EngineHandle {
  const { filter, master, analyser } = buildGraph(ctx);
  const binCount = analyser.frequencyBinCount;
  const src = ctx.createMediaElementSource(el);
  src.connect(filter);

  let rate = RATES.play as number;
  let dragging = false;
  const dur = () => (Number.isFinite(el.duration) ? el.duration : 1);

  return {
    mode: "element",
    peaks: new Float32Array(0),
    duration: dur(),
    getPos: () => (dur() > 0 ? el.currentTime / dur() : 0),
    getLevel: () => {
      const buf = new Uint8Array(binCount);
      analyser.getByteFrequencyData(buf);
      let s = 0;
      for (let i = 0; i < binCount; i++) s += buf[i];
      return s / (binCount * 255);
    },
    readSpectrum: (out) => analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>),
    frequencyBinCount: () => binCount,
    setPos: (norm) => {
      el.currentTime = Math.min(dur(), Math.max(0, norm * dur()));
    },
    setDragging: (on) => {
      dragging = on;
      if (on) {
        el.pause();
      } else if (rate !== 0) {
        el.playbackRate = Math.min(4, Math.max(0.25, Math.abs(rate)));
        el.play().catch(() => {});
      }
    },
    setRate: (r) => {
      rate = r;
      if (r === 0) {
        el.pause();
      } else {
        el.playbackRate = Math.min(4, Math.max(0.25, Math.abs(r)));
        if (!dragging) el.play().catch(() => {});
      }
    },
    setSculpt: (norm) => {
      filter.frequency.setTargetAtTime(cutoffFor(norm), ctx.currentTime, 0.04);
    },
    start: () => {
      if (rate !== 0) el.play().catch(() => {});
    },
    stop: () => {
      try {
        el.pause();
        el.src = "";
        src.disconnect();
        filter.disconnect();
        master.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

/** Tier 1: fetch a Path recording by id, decode to an AudioBuffer.
 *  Returns { buffer } on success, or { url } if only an <audio> fallback is
 *  possible, or throws with a human message. */
export async function loadTrackById(
  ctx: AudioContext,
  id: string,
): Promise<{ buffer: AudioBuffer } | { url: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/audio/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const msg =
        res.status === 404
          ? "No recording found for that id."
          : `Server returned ${res.status}.`;
      throw new Error(msg);
    }
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    let fetchedUrl: string | null = null;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.error) throw new Error(json.error);
      if (!json.url) throw new Error("Recording response had no url.");
      fetchedUrl = json.url;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) throw new Error("Could not fetch the recording audio.");
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    try {
      const buffer = await ctx.decodeAudioData(arrayBuf.slice(0));
      return { buffer };
    } catch {
      // CORS / codec: fall back to <audio> streaming if we have a url.
      if (fetchedUrl) return { url: fetchedUrl };
      throw new Error("Could not decode that recording.");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Tier 2: decode a user-chosen file. */
export async function loadFile(
  ctx: AudioContext,
  file: File,
): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer();
  return ctx.decodeAudioData(buf);
}

/** Tier 3: render a short gentle detuned-piano phrase offline so the grain
 *  corpus is NEVER empty. Clearly a placeholder — load a real track. */
export async function renderDemoBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const seconds = 12;
  const length = Math.floor(seconds * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitOfflineAudioContext;
  const off = new OfflineCtx(1, length, sampleRate);
  const master = off.createGain();
  master.gain.value = 0.9;
  master.connect(off.destination);

  // A slow, wistful phrase (semitone offsets from a low root).
  const root = 174.6; // ~F3
  const phrase = [0, 7, 12, 16, 12, 7, 3, 10, 15, 12, 7, 0, 5, 12, 19, 12];
  const noteSecs = seconds / phrase.length;

  phrase.forEach((semi, i) => {
    const t0 = i * noteSecs;
    const freq = root * Math.pow(2, semi / 12);
    // 3 detuned partials + soft hammer.
    const partials = [
      { mult: 1, gain: 1, detune: 0 },
      { mult: 2, gain: 0.32, detune: 2 },
      { mult: 3, gain: 0.14, detune: -3 },
    ];
    const noteGain = off.createGain();
    noteGain.gain.setValueAtTime(0.0001, t0);
    noteGain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.0004, t0 + noteSecs * 1.9);
    noteGain.connect(master);
    for (const p of partials) {
      const osc = off.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = off.createGain();
      g.gain.value = p.gain * 0.5;
      osc.connect(g);
      g.connect(noteGain);
      osc.start(t0);
      osc.stop(t0 + noteSecs * 2.1);
    }
  });

  return off.startRendering();
}
