// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — "Drift Choir" incommensurate-loop ensemble (audio-only / haptic).
//
// ONE of Karel's real piano takes, grown into an endless ghost choir you LISTEN
// to with your eyes closed. A ~7.5s window of the recording is copied across N
// voices, each on its OWN looping AudioBufferSourceNode at a slightly different,
// incommensurate loop LENGTH (ratios ≈ 1.000, 1.037, 1.081, 1.129, 1.181, 1.237)
// so no two voices ever re-sync — they drift through phase forever. This is the
// Brian-Eno *Music for Airports* seven-tape-loop mechanism (whole-buffer
// decoupled loops — NO granular grain-triggering). The drift IS the composition.
//
// Each voice ages like a Basinski *Disintegration Loop*: its own lowpass slowly
// closes and its gain dims over minutes, so the choir at minute 5 is genuinely
// not the choir at minute 1. Live voices are capped; the most-aged retires.
//
// NEW here vs the parent piece: a continuous PHASE-COINCIDENCE detector. When two
// or more voices pass through phase-alignment, the engine (a) blooms the gain and
// opens the lowpass of the coinciding voices — a soft SWELL of Karel's OWN sound,
// so the alignment is HEARD on any device with no phone needed — and (b) emits a
// coincidence event the UI drains to fire a haptic pulse and pulse the witness.
//
// Every audible node terminates in the shared safeMaster bus — never
// ctx.destination directly. No oscillator / synth / noise anywhere: Karel's one
// decoded recording is the only sound source; filters + gain are processing only.
// ─────────────────────────────────────────────────────────────────────────────

import type { SafeMaster } from "../_shared/visionary/safeMaster";

// Coprime-ish ratios so no two loop lengths ever land back in sync. The drift
// between them IS the composition.
const RATIOS = [1.0, 1.037, 1.081, 1.129, 1.181, 1.237];

const MAX_LIVE = 6; // hard cap on simultaneously sounding voices
const AUTO_TARGET = 5; // no-input self-build fills the choir to this many
const AGE_FULL = 240; // seconds for a voice to fully disintegrate
const CUTOFF_NEW = 6200; // Hz — a fresh voice is bright
const CUTOFF_OLD = 440; // Hz — an aged voice is a dark wash
const GAIN_NEW = 1.0;
const GAIN_OLD = 0.28;
const PER_VOICE_GAIN = 0.16; // base level before aging; limiter tames the sum
const FADE_IN = 1.4; // seconds
const RETIRE_FADE = 1.7; // seconds
const ENTER_OFFSET = 0.12; // where in the buffer the loop window opens (fraction)

// ── phase-coincidence tuning ────────────────────────────────────────────────
const COINCIDE_EPS = 0.02; // phase distance (0..1) counted as an alignment
const PAIR_COOLDOWN = 2.6; // s — a given voice-pair can't re-fire this fast
const GLOBAL_COOLDOWN = 0.85; // s — min gap between any two emitted events
const SWELL_DUR = 1.6; // s — how long the sound-cue swell lasts
const SWELL_GAIN = 1.35; // multiplies the coinciding voice's target gain at peak
const SWELL_OPEN = 3200; // Hz — how far the coinciding voice's lowpass re-opens

export interface VoiceView {
  id: number;
  ratio: number;
  loopLen: number; // seconds (this voice's incommensurate loop length)
  phase01: number; // current loop phase, 0..1
  age: number; // seconds alive
  ageNorm: number; // 0 = new … 1 = fully disintegrated
  level: number; // audible level 0..1
  swell: number; // 0..1 — current coincidence-swell envelope
  retiring: boolean;
  pan: number; // -1..1
}

/** One phase-alignment event, drained by the UI for haptic + witness pulse. */
export interface CoincidenceEvent {
  at: number; // ctx time it fired
  strength: number; // 0..1
  count: number; // how many voices were in the cluster
}

interface Voice {
  id: number;
  ratio: number;
  loopLen: number;
  startedAt: number;
  bornAt: number;
  rate: number;
  pan: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  retiring: boolean;
  retireAt: number;
  swellUntil: number; // ctx time the coincidence swell decays to zero
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
// deterministic tiny hash → small detune spread per voice index
function detuneCents(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 40; // ±20 cents
}

export class Ensemble {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private master: SafeMaster;
  private voices: Voice[] = [];
  private nextId = 1;
  private spawnCount = 0;
  private nextAutoAt = 0;
  private freq: Uint8Array<ArrayBuffer>;

  // coincidence bookkeeping
  private pairLast = new Map<string, number>(); // "a:b" → last-fire ctx time
  private lastEventAt = 0;
  private pending: CoincidenceEvent[] = [];

  /** Base loop-window length (s). */
  baseLoopLen = 7.5;

  constructor(ctx: AudioContext, buffer: AudioBuffer, master: SafeMaster) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.master = master;
    this.freq = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
  }

  /** Start the self-building choir: one voice now, more auto-committed later. */
  start(): void {
    this.addVoice();
    this.nextAutoAt = this.ctx.currentTime + 4.5;
  }

  get liveCount(): number {
    return this.voices.filter((v) => !v.retiring).length;
  }

  /** Press-to-bloom: commit one new voice at the next incommensurate length. */
  addVoice(): void {
    const live = this.voices.filter((v) => !v.retiring);
    if (live.length >= MAX_LIVE) this.retireOldest();

    const i = this.spawnCount++;
    const baseRatio = RATIOS[i % RATIOS.length];
    const wrap = Math.floor(i / RATIOS.length);
    const ratio = baseRatio * (1 + 0.017 * wrap);

    const maxWindow = this.baseLoopLen * 1.3 + 0.5;
    const offset = Math.max(
      0,
      Math.min(this.buffer.duration * ENTER_OFFSET, this.buffer.duration - maxWindow - 0.2),
    );
    const window = Math.min(this.baseLoopLen * ratio, this.buffer.duration - offset - 0.05);

    const now = this.ctx.currentTime;
    const rate = Math.pow(2, detuneCents(i) / 1200);
    const pan = (((i % MAX_LIVE) / (MAX_LIVE - 1)) * 2 - 1) * 0.7;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.loopStart = offset;
    src.loopEnd = offset + window;
    src.playbackRate.value = rate;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = CUTOFF_NEW;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.master.input);

    src.start(now, offset);

    this.voices.push({
      id: this.nextId++,
      ratio,
      loopLen: window,
      startedAt: now,
      bornAt: now,
      rate,
      pan,
      src,
      gain,
      filter,
      panner,
      retiring: false,
      retireAt: 0,
      swellUntil: 0,
    });
  }

  /** Release: let the most-aged live voice fade out (the hand lifts). */
  releaseOldest(): void {
    this.retireOldest();
  }

  private retireOldest(): void {
    const live = this.voices.filter((v) => !v.retiring);
    if (live.length === 0) return;
    let oldest = live[0];
    for (const v of live) if (v.bornAt < oldest.bornAt) oldest = v;
    this.retire(oldest);
  }

  private retire(v: Voice): void {
    if (v.retiring) return;
    v.retiring = true;
    v.retireAt = this.ctx.currentTime + RETIRE_FADE;
    v.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, RETIRE_FADE / 4);
  }

  /** Per-frame: age voices, run the coincidence detector, self-build, reap. */
  step(): void {
    const now = this.ctx.currentTime;

    // reap fully-faded retirees
    for (const v of this.voices) {
      if (v.retiring && now >= v.retireAt) {
        try {
          v.src.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.src.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
          v.panner.disconnect();
        } catch {
          /* closing */
        }
      }
    }
    this.voices = this.voices.filter((v) => !(v.retiring && now >= v.retireAt));

    // ── phase-coincidence detection (before aging so swells apply this frame) ──
    this.detectCoincidences(now);

    // aging: close the filter + dim the gain over minutes (Basinski decay),
    // with any active coincidence swell layered on top of Karel's own sound.
    for (const v of this.voices) {
      if (v.retiring) continue;
      const age = now - v.bornAt;
      const an = clamp01(age / AGE_FULL);
      const enter = clamp01((now - v.startedAt) / FADE_IN);
      const swell = v.swellUntil > now ? clamp01((v.swellUntil - now) / SWELL_DUR) : 0;

      const baseCutoff = lerp(CUTOFF_NEW, CUTOFF_OLD, an * an);
      const cutoff = baseCutoff + swell * SWELL_OPEN;
      const gm = lerp(GAIN_NEW, GAIN_OLD, an) * (1 + swell * (SWELL_GAIN - 1));
      const target = PER_VOICE_GAIN * gm * enter + 0.0001;

      v.gain.gain.setTargetAtTime(target, now, swell > 0 ? 0.12 : 0.3);
      v.filter.frequency.setTargetAtTime(cutoff, now, swell > 0 ? 0.1 : 0.4);
    }

    // no-input self-build toward AUTO_TARGET
    if (this.liveCount < AUTO_TARGET && now >= this.nextAutoAt) {
      this.addVoice();
      this.nextAutoAt = now + 4 + Math.random() * 2; // 4–6s
    }
  }

  /** Find voice pairs whose loop phase nearly coincides; swell + emit events. */
  private detectCoincidences(now: number): void {
    const live = this.voices.filter((v) => !v.retiring);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const pa = this.phaseOf(a, now);
        const pb = this.phaseOf(b, now);
        let d = Math.abs(pa - pb);
        d = Math.min(d, 1 - d); // wrap-around phase distance
        if (d >= COINCIDE_EPS) continue;

        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        const last = this.pairLast.get(key) ?? -1e9;
        if (now - last < PAIR_COOLDOWN) continue;
        this.pairLast.set(key, now);

        // proximity 0..1: dead-centre alignment reads strongest
        const strength = 1 - d / COINCIDE_EPS;

        // sound-cue: bloom BOTH coinciding voices (a swell of Karel's own audio)
        a.swellUntil = now + SWELL_DUR;
        b.swellUntil = now + SWELL_DUR;

        // emit one witness/haptic event, globally throttled
        if (now - this.lastEventAt >= GLOBAL_COOLDOWN) {
          this.lastEventAt = now;
          this.pending.push({ at: now, strength, count: 2 });
        }
      }
    }
  }

  private phaseOf(v: Voice, now: number): number {
    const elapsed = (now - v.startedAt) * v.rate;
    return mod(elapsed, v.loopLen) / v.loopLen;
  }

  /** Drain coincidence events emitted since the last call (UI reads these). */
  drainCoincidences(): CoincidenceEvent[] {
    if (this.pending.length === 0) return [];
    const out = this.pending;
    this.pending = [];
    return out;
  }

  getViews(): VoiceView[] {
    const now = this.ctx.currentTime;
    return this.voices.map((v) => {
      const phase01 = this.phaseOf(v, now);
      const age = now - v.bornAt;
      const an = clamp01(age / AGE_FULL);
      const enter = clamp01((now - v.startedAt) / FADE_IN);
      const retFade = v.retiring ? clamp01((v.retireAt - now) / RETIRE_FADE) : 1;
      const swell = v.swellUntil > now ? clamp01((v.swellUntil - now) / SWELL_DUR) : 0;
      const level = lerp(GAIN_NEW, GAIN_OLD, an) * enter * retFade;
      return {
        id: v.id,
        ratio: v.ratio,
        loopLen: v.loopLen,
        phase01,
        age,
        ageNorm: an,
        level,
        swell,
        retiring: v.retiring,
        pan: v.pan,
      };
    });
  }

  /** Overall tamed level 0..1 from the safeMaster analyser tap. */
  level(): number {
    this.master.analyser.getByteFrequencyData(this.freq);
    let s = 0;
    for (let i = 0; i < this.freq.length; i++) s += this.freq[i];
    return s / (this.freq.length * 255);
  }

  dispose(): void {
    for (const v of this.voices) {
      try {
        v.src.stop();
      } catch {
        /* noop */
      }
      try {
        v.src.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
        v.panner.disconnect();
      } catch {
        /* noop */
      }
    }
    this.voices = [];
    this.pairLast.clear();
    this.pending = [];
  }
}
