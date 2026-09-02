// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the albumvoyage loop-station. Owns the AudioContext, the safe
// master bus, the DECODED ALBUM (Karel's "Welcome Home", loaded track by track
// on demand), and a single lookahead scheduler that keeps every committed line
// looping as its own voice reading its assigned region of its assigned track.
//
// This DEEPENS 16672-scriptorium along three axes:
//
//   1. ALBUM-ROLL. Instead of ONE buffer there is the whole album in running
//      order. Each track holds a budget of LINES_PER_TRACK lines. Line i of the
//      manuscript belongs to track floor(i / LINES_PER_TRACK); within that track
//      it takes slot k of the m lines assigned there and reads only from region
//      [k/m, (k+1)/m] of THAT track's duration. So a short manuscript reads
//      inside the opening track, and a long one rolls onto the next recordings —
//      literally traversing the album's form. Adding/removing a line re-slots the
//      whole ensemble so it always spans a coherent opening→deeper voyage, and
//      the track after the deepest used one is preloaded so a roll is seamless.
//
//   2. READ-DRIFT. A slow, always-on migration: over minutes each voice's read
//      position ramps forward through its region (wrapping at the region edge) at
//      a user-adjustable rate. This is ON TOP of scriptorium's per-loop golden
//      grain step. Leave the page running and minute-5 ≠ minute-1 BY TIME — the
//      choir has walked deeper into the album even if you stopped typing.
//
//   3. Stereo choir + a LEGIBLE filmstrip. Each line sums through a per-line gain
//      → StereoPannerNode → master.input. The view exposes, per track, which
//      voices read it and where their playheads are — the DOM filmstrip.
//
// Optional harmonic tint: when a track's analysis is available, each line's hue
// is keyed to the chord sounding at its migrating read position; absent, no tint.
//
// Every sound is a slice of HIS decoded buffers through createSafeMaster().input —
// never ctx.destination, never an oscillator or noise.
// ─────────────────────────────────────────────────────────────────────────────

import { WELCOME_HOME_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  pitchClassHue,
  type TrackChord,
} from "../_shared/trackAnalysis";
import { parseLine, computePan, GOLDEN, type WordProsody } from "./prosody";

export const LINES_PER_TRACK = 4; // budget of lines per album track before a roll
export const MAX_LINES = 16; // caps the ensemble at ~4 tracks — stays legible
const MAX_SLICES = 18; // concurrent one-shot slices; steal oldest beyond this
const LOOKAHEAD = 0.12; // seconds scheduled ahead each tick
const TICK_MS = 25;
const LINE_GAIN = 0.42;
const SLICE_GAIN = 0.4;
const CYCLE_DRIFT = 0.5; // golden steps per loop cycle for grain non-repetition

// READ-DRIFT rate mapping: driftRate 0 → still; 1 → a full region sweep in ~120s
// (2 min); low rates → ~360s (6 min). Cycles-per-second of the migration ramp.
const DRIFT_HZ_SLOW = 1 / 360;
const DRIFT_HZ_FAST = 1 / 120;

interface AlbumTrack {
  index: number;
  id: string;
  title: string;
  buffer: AudioBuffer | null;
  loading: boolean;
  failed: boolean;
  chords: TrackChord[] | null; // harmonic tint, when analysis resolves
}

interface Voice {
  id: string;
  words: WordProsody[];
  loopDur: number;
  vowelDensity: number;
  globalSlot: number; // position in the whole manuscript → pan + drift seed
  trackIndex: number; // which album track this line reads
  slotInTrack: number; // position among lines sharing that track
  countInTrack: number; // how many lines share that track (region divisor)
  driftSeed: number; // per-voice 0..1 phase offset so voices stagger
  startTime: number; // ctx time this line began looping
  cursor: number; // next word index to schedule
  cycle: number; // loop count since startTime
  gain: GainNode; // per-line gain for mute/solo/level
  panner: StereoPannerNode; // per-line stereo placement
  muted: boolean;
  solo: boolean;
  lastReadFrac: number; // within-track fraction most recently cut (ribbon)
}

interface LiveSlice {
  src: AudioBufferSourceNode;
  env: GainNode;
  filt: BiquadFilterNode;
}

/** Per-line snapshot for the visual layer. */
export interface LineView {
  id: string;
  /** Index of the currently-sounding word, or -1 for silence/rest/not-ready. */
  active: number;
  /** Which album track (filmstrip cell) this line reads. */
  trackIndex: number;
  /** Region of THAT track this line reads, as [start,end] within-track fractions. */
  region: [number, number];
  /** Within-track fraction 0..1 of the migrating read position — the playhead. */
  readFrac: number;
  /** Stereo pan -1..1, for the visual choir spread. */
  pan: number;
  /** True when this line's track buffer has decoded and it can sound. */
  ready: boolean;
  /** Harmonic hue 0..360 of the chord at the read position, or null (no tint). */
  hue: number | null;
}

/** Per-track snapshot for the album filmstrip (only tracks with lines). */
export interface TrackView {
  index: number;
  title: string;
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  /** Voice ids reading this track, in manuscript order. */
  lineIds: string[];
}

export interface EngineView {
  time: number;
  /** Master RMS 0..1 (drives glyph bloom). */
  rms: number;
  lines: LineView[];
  tracks: TrackView[];
}

export interface Engine {
  readonly loaded: boolean;
  /** Add a committed line as a looping voice. False if capped. */
  addLine(id: string, text: string, muted: boolean): boolean;
  removeLine(id: string): void;
  setMuted(id: string, muted: boolean): void;
  setSolo(id: string, solo: boolean): void;
  /** Set the always-on read-drift rate, 0 (still) … 1 (fastest migration). */
  setDrift(rate: number): void;
  clearAll(): void;
  getView(): EngineView;
  teardown(): void;
}

/**
 * Boot the engine on a user gesture: create ctx + master, decode the opening
 * album track (falling back to the next few if it fails), then start the
 * scheduler. `loaded` is false only if NO track decoded — the caller surfaces a
 * fallback notice. The caller then populates lines from the restored manuscript.
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
  const originTime = ctx.currentTime; // drift clock origin (shared by all voices)

  const albumTracks: AlbumTrack[] = WELCOME_HOME_TRACKS.map((t, i) => ({
    index: i,
    id: t.id,
    title: t.title,
    buffer: null,
    loading: false,
    failed: false,
    chords: null,
  }));

  const voices: Voice[] = [];
  const live: LiveSlice[] = [];
  const analyserBuf = new Uint8Array(master.analyser.fftSize);
  let driftRate = 0.4; // default: an audible-over-minutes migration

  /** Fetch a track's analysis in the background for the harmonic tint. */
  function loadAnalysisFor(t: AlbumTrack): void {
    loadTrackAnalysis(t.id)
      .then((a) => {
        if (a && Array.isArray(a.chords) && a.chords.length > 0) {
          t.chords = a.chords;
        }
      })
      .catch(() => {
        /* no tint — degrade silently */
      });
  }

  /** Decode one album track's buffer on demand (idempotent, never throws). */
  function ensureTrackLoaded(idx: number): void {
    if (idx < 0 || idx >= albumTracks.length) return;
    const t = albumTracks[idx];
    if (t.buffer || t.loading || t.failed) return;
    t.loading = true;
    loadRealTrackBuffer(ctx, t.id)
      .then((res) => {
        t.buffer = res.buffer;
        t.loading = false;
        loadAnalysisFor(t);
      })
      .catch(() => {
        t.loading = false;
        t.failed = true;
      });
  }

  /** Ensure every used track — plus the next one, preloaded — is decoding. */
  function ensureTracksLoaded(): void {
    const deepest =
      voices.length > 0
        ? Math.floor((voices.length - 1) / LINES_PER_TRACK)
        : 0;
    for (let i = 0; i <= deepest + 1; i += 1) ensureTrackLoaded(i);
  }

  /** Re-slot every voice into album order: track, within-track slot, pan, seed. */
  function reslot(): void {
    const now = ctx.currentTime;
    const total = voices.length;
    for (let i = 0; i < voices.length; i += 1) {
      const v = voices[i];
      v.globalSlot = i;
      v.trackIndex = Math.floor(i / LINES_PER_TRACK);
      v.slotInTrack = i % LINES_PER_TRACK;
      const base = v.trackIndex * LINES_PER_TRACK;
      v.countInTrack = Math.min(LINES_PER_TRACK, total - base);
      v.driftSeed = (i * GOLDEN) % 1;
      const pan = computePan(i, total, v.vowelDensity);
      try {
        v.panner.pan.setTargetAtTime(pan, now, 0.12);
      } catch {
        /* closing */
      }
    }
  }

  /** Region [start,end] of the track for a voice, within-track fractions. */
  function regionOf(v: Voice): [number, number] {
    const m = Math.max(1, v.countInTrack);
    return [v.slotInTrack / m, (v.slotInTrack + 1) / m];
  }

  /** The migrating within-region base fraction 0..1 for a voice at time now. */
  function driftFracOf(v: Voice): number {
    if (driftRate <= 0) return v.driftSeed;
    const hz = DRIFT_HZ_SLOW + driftRate * (DRIFT_HZ_FAST - DRIFT_HZ_SLOW);
    const phase = (ctx.currentTime - originTime) * hz;
    return (v.driftSeed + phase) % 1;
  }

  /** Hue of the chord sounding at `timeSec` in a track, or null (no analysis). */
  function hueForTrackAt(t: AlbumTrack, timeSec: number): number | null {
    const chords = t.chords;
    if (!chords || chords.length === 0) return null;
    let cur = chords[0];
    for (const c of chords) {
      if (c.time <= timeSec) cur = c;
      else break;
    }
    const root = chordRoot(cur.chord);
    if (root === null) return null;
    return pitchClassHue(root);
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
    const track = albumTracks[v.trackIndex];
    const buffer = track?.buffer;
    if (!buffer) return; // track not decoded yet — this voice waits, silent
    const bufDur = buffer.duration;
    const when = Math.max(whenRaw, ctx.currentTime + 0.005);

    // ALBUM-ROLL + READ-DRIFT + NON-REPETITION: resolve the within-region
    // fraction against this voice's live region of its track, migrate it slowly
    // by the read-drift, and jitter it a golden step per loop cycle.
    const [rStart, rEnd] = regionOf(v);
    const regionSpanSec = Math.max(0.05, (rEnd - rStart) * bufDur);
    const usable = Math.max(0, regionSpanSec - w.dur - 0.05);
    const frac =
      (w.offsetFrac + driftFracOf(v) + v.cycle * GOLDEN * CYCLE_DRIFT) % 1;
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
      return albumTracks.some((t) => t.buffer !== null);
    },

    addLine(id, text, muted) {
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
        globalSlot: voices.length,
        trackIndex: 0,
        slotInTrack: 0,
        countInTrack: 1,
        driftSeed: 0,
        startTime: ctx.currentTime + 0.08,
        cursor: 0,
        cycle: 0,
        gain,
        panner,
        muted,
        solo: false,
        lastReadFrac: 0,
      };
      voices.push(v);
      reslot();
      ensureTracksLoaded();
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
      ensureTracksLoaded();
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

    setDrift(rate) {
      driftRate = Math.min(1, Math.max(0, rate));
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

      const lines = voices.map<LineView>((v) => {
        const track = albumTracks[v.trackIndex];
        const ready = !!track?.buffer;
        const [rStart, rEnd] = regionOf(v);
        // Playhead follows the migrating read-drift base through the region.
        const base = driftFracOf(v);
        const readFrac = rStart + base * (rEnd - rStart);
        const bufDur = track?.buffer ? track.buffer.duration : 0;
        const hue =
          ready && track ? hueForTrackAt(track, readFrac * bufDur) : null;

        let active = -1;
        if (ready && t >= v.startTime && v.loopDur > 0) {
          const local = (t - v.startTime) % v.loopDur;
          for (let i = 0; i < v.words.length; i += 1) {
            const w = v.words[i];
            if (!w.isRest && local >= w.onset && local < w.onset + w.dur) {
              active = i;
              break;
            }
          }
        }
        return {
          id: v.id,
          active,
          trackIndex: v.trackIndex,
          region: [rStart, rEnd],
          readFrac,
          pan: computePan(v.globalSlot, voices.length, v.vowelDensity),
          ready,
          hue,
        };
      });

      // Filmstrip: one entry per track that has lines, in album order.
      const byTrack = new Map<number, string[]>();
      for (const v of voices) {
        const arr = byTrack.get(v.trackIndex);
        if (arr) arr.push(v.id);
        else byTrack.set(v.trackIndex, [v.id]);
      }
      const tracks: TrackView[] = [...byTrack.keys()]
        .sort((a, b) => a - b)
        .map((idx) => {
          const at = albumTracks[idx];
          return {
            index: idx,
            title: at.title,
            loaded: !!at.buffer,
            loading: at.loading,
            failed: at.failed,
            lineIds: byTrack.get(idx) ?? [],
          };
        });

      return { time: t, rms, lines, tracks };
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

  // Boot the album: decode the opening track, falling back to the next few if
  // it fails, so `loaded` is true whenever ANY track decodes. Then preload
  // track 1 in the background so the first roll is seamless.
  for (let i = 0; i < Math.min(4, albumTracks.length); i += 1) {
    try {
      const res = await loadRealTrackBuffer(ctx, albumTracks[i].id);
      albumTracks[i].buffer = res.buffer;
      loadAnalysisFor(albumTracks[i]);
      break;
    } catch {
      albumTracks[i].failed = true;
    }
  }
  ensureTrackLoaded(1);

  return { engine, ctx };
}
