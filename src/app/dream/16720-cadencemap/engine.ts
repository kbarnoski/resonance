// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the cadencemap loop-station. Owns the AudioContext, the safe master
// bus, the DECODED ALBUM (Karel's "Welcome Home", loaded track by track on
// demand), the album's real HARMONIC ANALYSIS (fetched for the WHOLE record up
// front, independent of audio), and a single lookahead scheduler that keeps every
// committed line looping as its own voice reading its assigned region of its
// assigned track.
//
// This DEEPENS 16688-albumvoyage. albumvoyage already: rolls the manuscript across
// the whole album (LINES_PER_TRACK lines per track, cap MAX_LINES), reads a region
// of each assigned track, migrates each voice's read position over minutes with an
// always-on READ-DRIFT, and tints each glyph's HUE to the chord at its read
// position. ALL of that is kept unchanged.
//
// cadencemap's two deepening moves surface Karel's HARMONIC FORM as the primary,
// legible object instead of burying it in a per-glyph hue:
//
//   1. THE HARMONIC MAP (view side). The engine exposes the album's real chord
//      progression as data — for every track, its TrackChord[] and a trackLen so
//      the page can lay the chords out left→right by time as a walkable map, and
//      each committed voice reports the INDEX of the chord it is currently reading
//      so its marker sits ON that chord and highlights it. Analysis for the whole
//      album is fetched at boot (a light JSON fetch, no audio decode needed) so the
//      map shows the entire record's harmonic form at a glance.
//
//   2. HARMONIC TUNING (audio side). Each slice's playbackRate is gently pulled
//      toward consonance with the chord sounding at its read position: take the
//      prosodic rate's implied semitone offset (12·log2(rate)), snap it toward the
//      nearest pitch-class of the chord's triad {root, third, fifth}, convert back
//      to a rate, clamp ~0.6..1.7. A tuning-amount slider sets how hard the pull
//      is (0 = the pure untuned prosody, 1 = full snap). If a track has no chord
//      analysis the voice falls back to the untuned prosody rate — never silent.
//
// Every sound is a slice of HIS decoded buffers through createSafeMaster().input —
// never ctx.destination, never an oscillator or noise.
// ─────────────────────────────────────────────────────────────────────────────

import { WELCOME_HOME_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
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

// HARMONIC TUNING clamp — a tuned slice never transposes beyond this window.
const TUNE_MIN_RATE = 0.6;
const TUNE_MAX_RATE = 1.7;

interface AlbumTrack {
  index: number;
  id: string;
  title: string;
  buffer: AudioBuffer | null;
  loading: boolean;
  failed: boolean;
  chords: TrackChord[] | null; // the real chord progression, when analysis resolves
  analysisTried: boolean; // true once the analysis fetch settled (ok or empty)
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
  /** Which album track this voice reads. */
  trackIndex: number;
  /** Region of THAT track this line reads, as [start,end] within-track fractions. */
  region: [number, number];
  /** Within-track fraction 0..1 of the migrating read position — the map marker. */
  readFrac: number;
  /** Index into the track's chord progression the voice currently sits on, or -1. */
  chordIndex: number;
  /** Stereo pan -1..1, for the visual choir spread. */
  pan: number;
  /** True when this line's track buffer has decoded and it can sound. */
  ready: boolean;
  /** Harmonic hue 0..360 of the chord at the read position, or null (no analysis). */
  hue: number | null;
}

/** Per-track snapshot for the harmonic MAP — every album track, in running order. */
export interface AlbumMapTrack {
  index: number;
  title: string;
  /** The real chord progression, time-sorted; null while loading or if absent. */
  chords: TrackChord[] | null;
  /** Timeline length in seconds for laying chords + markers out (buf or last chord). */
  trackLen: number;
  /** True when this track's audio buffer has decoded (voices here can sound). */
  decoded: boolean;
  loading: boolean;
  failed: boolean;
  /** True while the analysis fetch is still in flight (distinct from "absent"). */
  analysisPending: boolean;
}

export interface EngineView {
  time: number;
  /** Master RMS 0..1 (drives glyph bloom). */
  rms: number;
  lines: LineView[];
  /** Every album track's harmonic form — the walkable map. */
  album: AlbumMapTrack[];
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
  /** Set the harmonic tuning amount, 0 (untuned prosody) … 1 (full snap). */
  setTune(amount: number): void;
  clearAll(): void;
  getView(): EngineView;
  teardown(): void;
}

/** Triad pitch-classes {root, third, fifth} of a chord symbol, or null. */
function chordPitchClasses(symbol: string): number[] | null {
  const root = chordRoot(symbol);
  if (root === null) return null;
  const third = chordIsMinor(symbol) ? 3 : 4;
  return [root % 12, (root + third) % 12, (root + 7) % 12];
}

/**
 * Gently pull a prosodic playback rate toward consonance with a chord. The rate's
 * implied semitone offset (12·log2(rate)) is snapped toward the nearest member of
 * the chord's triad (octave-equivalent), then blended back by `amount`. Returns
 * the untuned rate when there is no chord or amount is 0. Result clamped to a safe
 * transpose window so a voice never leaps octaves.
 */
function applyHarmonicTuning(
  baseRate: number,
  pcs: number[] | null,
  amount: number,
): number {
  if (!pcs || pcs.length === 0 || amount <= 0) return baseRate;
  const semi = 12 * Math.log2(baseRate);
  let best = semi;
  let bestDist = Infinity;
  for (const pc of pcs) {
    // nearest value congruent to pc (mod 12) to the current semitone offset
    const cand = pc + 12 * Math.round((semi - pc) / 12);
    const d = Math.abs(cand - semi);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  const tuned = semi + amount * (best - semi);
  const rate = Math.pow(2, tuned / 12);
  return Math.min(TUNE_MAX_RATE, Math.max(TUNE_MIN_RATE, rate));
}

/**
 * Boot the engine on a user gesture: create ctx + master, decode the opening
 * album track (falling back to the next few if it fails), kick off the analysis
 * fetch for the WHOLE album so the harmonic map fills in, then start the
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
    analysisTried: false,
  }));

  const voices: Voice[] = [];
  const live: LiveSlice[] = [];
  const analyserBuf = new Uint8Array(master.analyser.fftSize);
  let driftRate = 0.4; // default: an audible-over-minutes migration
  let tuneAmount = 0.6; // default: a clear pull into consonance, still musical

  /** Fetch a track's analysis for the harmonic map + tuning (never throws). */
  function loadAnalysisFor(t: AlbumTrack): void {
    if (t.analysisTried) return;
    loadTrackAnalysis(t.id)
      .then((a) => {
        if (a && Array.isArray(a.chords) && a.chords.length > 0) {
          t.chords = a.chords;
        }
      })
      .catch(() => {
        /* no analysis — the map cell reads "no analysis", tuning falls back */
      })
      .finally(() => {
        t.analysisTried = true;
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

  /** Timeline length (s) for laying out a track: buffer if decoded, else chords. */
  function trackLenOf(t: AlbumTrack): number {
    if (t.buffer) return t.buffer.duration;
    const c = t.chords;
    if (c && c.length > 0) {
      const last = c[c.length - 1];
      return last.time + last.duration;
    }
    return 0;
  }

  /** Index of the chord sounding at `timeSec` in a track, or -1 (no analysis). */
  function chordIndexForTrackAt(t: AlbumTrack, timeSec: number): number {
    const chords = t.chords;
    if (!chords || chords.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < chords.length; i += 1) {
      if (chords[i].time <= timeSec) idx = i;
      else break;
    }
    return idx;
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

    // HARMONIC TUNING: pull the prosodic rate toward the chord at THIS read
    // position. Falls back to the untuned prosody rate when a track has no chords.
    let rate = w.rate;
    const chords = track.chords;
    if (chords && chords.length > 0 && tuneAmount > 0) {
      const ci = chordIndexForTrackAt(track, offsetSec);
      if (ci >= 0) {
        rate = applyHarmonicTuning(
          w.rate,
          chordPitchClasses(chords[ci].chord),
          tuneAmount,
        );
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

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

    setTune(amount) {
      tuneAmount = Math.min(1, Math.max(0, amount));
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
        // Marker follows the migrating read-drift base through the region.
        const base = driftFracOf(v);
        const readFrac = rStart + base * (rEnd - rStart);
        const bufDur = track?.buffer ? track.buffer.duration : trackLenOf(track);
        const chordIndex = track
          ? chordIndexForTrackAt(track, readFrac * bufDur)
          : -1;
        const hue =
          track && chordIndex >= 0 && track.chords
            ? (() => {
                const root = chordRoot(track.chords[chordIndex].chord);
                return root === null ? null : pitchClassHue(root);
              })()
            : null;

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
          chordIndex,
          pan: computePan(v.globalSlot, voices.length, v.vowelDensity),
          ready,
          hue,
        };
      });

      // The harmonic map: EVERY album track, in running order, with its real
      // chord progression + timeline length so the page can lay it out and walk it.
      const album: AlbumMapTrack[] = albumTracks.map((at) => ({
        index: at.index,
        title: at.title,
        chords: at.chords,
        trackLen: trackLenOf(at),
        decoded: !!at.buffer,
        loading: at.loading,
        failed: at.failed,
        analysisPending: !at.analysisTried && at.chords === null,
      }));

      return { time: t, rms, lines, album };
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

  // Fetch the analysis for the WHOLE album immediately (light JSON, no decode) so
  // the harmonic map draws the entire record's form even before a voice reaches
  // a track. Audio itself still decodes on demand.
  for (const at of albumTracks) loadAnalysisFor(at);

  // Boot the album audio: decode the opening track, falling back to the next few
  // if it fails, so `loaded` is true whenever ANY track decodes. Then preload
  // track 1 in the background so the first roll is seamless.
  for (let i = 0; i < Math.min(4, albumTracks.length); i += 1) {
    try {
      const res = await loadRealTrackBuffer(ctx, albumTracks[i].id);
      albumTracks[i].buffer = res.buffer;
      break;
    } catch {
      albumTracks[i].failed = true;
    }
  }
  ensureTrackLoaded(1);

  return { engine, ctx };
}
