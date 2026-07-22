// ─────────────────────────────────────────────────────────────────────────────
// 2252-eternal-return — audio.ts   (cycle-2 of 2244-deep-now)
//
// Where 2244 dilated abstract echoes, this piece dilates REAL MUSICAL MATERIAL:
// a seeded generative piano-ish voice plays a gentle modal phrase at an OBJECTIVE
// tempo that never stops — while attention freezes and blooms the light-layers a
// slice at a time (the "dual time-streams"). The phrase flows on underneath the
// hanging chord-cloud.
//
// HARMONY: C LYDIAN (root C3, offsets 0 2 4 6 7 9 11) — a bright, floating mode
//   (the raised 4th is the "cosmic" colour). Deliberately NOT pentatonic, NOT a
//   just-intonation stack, NOT Bohlen-Pierce. Pitch is quantised and STABLE.
//
// TIMBRE: additive soft-attack / long-release "glass piano" — a small partial
//   stack with a mild inharmonic stretch for shimmer.
//
// TIME-DILATION coupling: the page pushes attention A (0..1) and timeScale
//   (1 at rest → ~0.14 deep). We do NOT pitch-shift with dilation. Instead, notes
//   struck while attention is high get a hugely lengthened release and a blooming
//   reverb-wet send (~1/timeScale, bounded), so the attended moment swells
//   SONICALLY toward an over-bright plenum. The objective scheduler keeps running
//   underneath regardless of A — you hear the phrase continue while a slice hangs.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { randRange } from "./rng";

// ── modal material ───────────────────────────────────────────────────────────
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]; // C Lydian scale degrees (semitones)
const ROOT_HZ = 130.81; // C3
const N_OCTAVES = 3;

/** Mild inharmonic partial stretch (glassy shimmer, not integer-clean). */
const STRETCH = 2.04;
const N_PARTIALS = 5;

/** One quantised, stable note in the modal grid. */
export interface NoteEvent {
  /** Index into the built scale table. */
  idx: number;
  /** Frequency in Hz (stable — never dilated). */
  freq: number;
  /** Pitch-class position 0..1 (chroma) — drives light-layer X. */
  x01: number;
  /** Register position 0..1 (low→high) — drives light-layer Y (inverted in page). */
  y01: number;
  /** 0..1 loudness/brightness of this strike. */
  velocity: number;
}

interface ScaleNote {
  freq: number;
  x01: number;
  y01: number;
}

/** Build the Lydian scale table across N_OCTAVES. */
function buildScale(): ScaleNote[] {
  const notes: ScaleNote[] = [];
  for (let oct = 0; oct < N_OCTAVES; oct++) {
    for (let d = 0; d < LYDIAN.length; d++) {
      const semi = LYDIAN[d] + 12 * oct;
      const freq = ROOT_HZ * Math.pow(2, semi / 12);
      const chroma = ((semi % 12) + 12) % 12;
      notes.push({
        freq,
        x01: chroma / 12,
        y01: oct / (N_OCTAVES - 1 || 1),
      });
    }
  }
  return notes;
}

// ─────────────────────────────────────────────────────────────────────────────
// PhraseScheduler — the OBJECTIVE-time note generator.
//
// Lives here (in audio.ts) per brief: it "emits note events at an objective
// tempo" and calls a callback into the page that spawns the matching light-layer.
// It is intentionally free of any AudioContext dependency so the visual phrase
// keeps flowing even before audio starts (silent headless review) and if Web
// Audio is unavailable. The page drives it with rAF-elapsed seconds; the tempo
// it advances at is NEVER scaled by attention (that is the whole point of the
// dual time-streams).
// ─────────────────────────────────────────────────────────────────────────────
export class PhraseScheduler {
  private rng: () => number;
  private scale: ScaleNote[];
  private nextAt = 0;
  private started = false;
  private idx: number;
  private phraseLeft = 0;

  constructor(rng: () => number) {
    this.rng = rng;
    this.scale = buildScale();
    this.idx = Math.floor(this.scale.length * 0.4);
  }

  get noteCount(): number {
    return this.scale.length;
  }

  /** Advance objective time to nowSec, emitting every note that has come due. */
  advance(nowSec: number, emit: (n: NoteEvent) => void): void {
    if (!this.started) {
      this.started = true;
      this.nextAt = nowSec + 0.35;
    }
    // Guard against huge catch-ups (tab was backgrounded).
    let budget = 8;
    while (nowSec >= this.nextAt && budget-- > 0) {
      emit(this.pick());
      this.nextAt += this.nextInterval();
    }
    if (nowSec >= this.nextAt) this.nextAt = nowSec + this.nextInterval();
  }

  /** Choose the next note by a gentle seeded walk over the modal grid. */
  private pick(): NoteEvent {
    // Phrase arcs: every few notes, gently re-centre so it breathes.
    if (this.phraseLeft <= 0) {
      this.phraseLeft = 4 + Math.floor(randRange(this.rng, 0, 5));
      // occasionally jump register for a fresh phrase
      if (this.rng() < 0.4) {
        this.idx = Math.floor(randRange(this.rng, 0, this.scale.length));
      }
    }
    this.phraseLeft--;

    // Stepwise-biased walk (small steps common, occasional leap).
    const r = this.rng();
    let step: number;
    if (r < 0.42) step = 1;
    else if (r < 0.7) step = -1;
    else if (r < 0.82) step = 2;
    else if (r < 0.92) step = -2;
    else step = this.rng() < 0.5 ? 4 : -3;
    this.idx = Math.max(0, Math.min(this.scale.length - 1, this.idx + step));

    const s = this.scale[this.idx];
    return {
      idx: this.idx,
      freq: s.freq,
      x01: s.x01,
      y01: s.y01,
      velocity: 0.55 + randRange(this.rng, 0, 0.4),
    };
  }

  /** Objective inter-onset interval (seconds). Gentle, with occasional breath. */
  private nextInterval(): number {
    const r = this.rng();
    if (r < 0.14) return randRange(this.rng, 0.95, 1.5); // a held breath
    if (r < 0.34) return randRange(this.rng, 0.6, 0.9);
    return randRange(this.rng, 0.34, 0.56); // flowing eighths-ish
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EternalReturnAudio — the sounding engine (Web Audio only, fully offline).
// ─────────────────────────────────────────────────────────────────────────────
export class EternalReturnAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private bus: GainNode;
  private reverb: VoidReverb;
  private voices = new Set<OneShot>();

  // File-drop playback (optional).
  private fileSource: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array | null = null;
  private lastEnergy = 0;
  private onsetCooldown = 0;

  // Live-updated by the page each frame.
  private attention = 0;
  private timeScale = 1;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.45;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.reverb = createVoidReverb(ctx, { seconds: 8, decay: 2.2, wet: 0.4 });

    // notes → bus → [dry → comp] and [→ reverb → comp] → master(0.16) → out
    this.bus.connect(this.comp);
    this.bus.connect(this.reverb.input);
    this.reverb.output.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    const t = ctx.currentTime;
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.16, t + 1.4);
  }

  /** Push played attention state. timeScale ∈ (0,1]; smaller = deeper now. */
  setDilation(attention: number, timeScale: number): void {
    this.attention = Math.max(0, Math.min(1, attention));
    this.timeScale = Math.max(0.05, Math.min(1, timeScale));
    // Reverb wet blooms with attention — the tail approaches an eternal now.
    this.reverb.setWet(0.3 + 0.62 * this.attention);
  }

  /** Sound one modal note. Release + reverb bloom with current attention;
   *  PITCH IS NEVER SHIFTED by dilation. */
  strike(freq: number, velocity: number): void {
    const A = this.attention;
    const v = new OneShot(this.ctx, this.bus, freq, velocity, A);
    this.voices.add(v);
  }

  /** Reap finished one-shots; called occasionally from the render loop. */
  reap(): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      if (v.done(now)) {
        v.dispose();
        this.voices.delete(v);
      }
    }
  }

  // ── optional file-drop → play through the same graph + onset triggers ────────

  /** Decode + play a dropped audio file. Returns false on failure (degrade). */
  async playFile(data: ArrayBuffer): Promise<boolean> {
    try {
      const buf = await this.ctx.decodeAudioData(data.slice(0));
      this.stopFile();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyser.connect(this.bus);
      src.start();
      this.fileSource = src;
      this.analyser = analyser;
      this.analyserBuf = new Float32Array(analyser.fftSize);
      this.lastEnergy = 0;
      return true;
    } catch {
      return false;
    }
  }

  stopFile(): void {
    if (this.fileSource) {
      try {
        this.fileSource.stop();
        this.fileSource.disconnect();
      } catch {
        /* already stopped */
      }
      this.fileSource = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        /* gone */
      }
      this.analyser = null;
    }
    this.analyserBuf = null;
  }

  get playingFile(): boolean {
    return this.fileSource !== null;
  }

  /** Poll the dropped-file signal for a transient. Returns 0..1 onset strength
   *  (0 = none this frame) so the page can spawn a light-layer on hits. */
  pollOnset(dt: number): number {
    const an = this.analyser;
    const buf = this.analyserBuf;
    if (!an || !buf) return 0;
    an.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const energy = Math.sqrt(sum / buf.length);
    this.onsetCooldown = Math.max(0, this.onsetCooldown - dt);
    const rise = energy - this.lastEnergy;
    this.lastEnergy = this.lastEnergy * 0.6 + energy * 0.4;
    if (this.onsetCooldown <= 0 && rise > 0.04 && energy > 0.05) {
      this.onsetCooldown = 0.09;
      return Math.min(1, rise * 6);
    }
    return 0;
  }

  dispose(): void {
    this.stopFile();
    for (const v of this.voices) v.dispose();
    this.voices.clear();
    try {
      this.bus.disconnect();
      this.comp.disconnect();
      this.master.disconnect();
      this.reverb.output.disconnect();
    } catch {
      /* already gone */
    }
  }
}

// ── the glass-piano one-shot voice ───────────────────────────────────────────
class OneShot {
  private ctx: AudioContext;
  private env: GainNode;
  private oscs: OscillatorNode[] = [];
  private endsAt: number;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    velocity: number,
    attention: number,
  ) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.env = ctx.createGain();
    this.env.gain.value = 0.0001;
    this.env.connect(dest);

    // Soft attack (a touch longer when attending), long release that STRETCHES
    // toward the eternal with attention. Pitch stays exactly `freq`.
    const attack = 0.02 + 0.06 * attention;
    const release = 1.3 * (1 + attention * 7); // ~1.3 s → ~11 s deep
    const peak = 0.16 * (0.45 + 0.55 * velocity);

    for (let k = 1; k <= N_PARTIALS; k++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      // mild inharmonic stretch → glassy shimmer (stable, not dilated).
      osc.frequency.value = freq * Math.pow(STRETCH, Math.log2(k));
      const g = ctx.createGain();
      // upper partials softer + a bit of velocity-driven brightness.
      g.gain.value = (1 / Math.pow(k, 1.7 - velocity * 0.5)) * 0.9;
      osc.connect(g);
      g.connect(this.env);
      osc.start(now);
      this.oscs.push(osc);
    }

    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(0.0001, now);
    this.env.gain.linearRampToValueAtTime(peak, now + attack);
    this.env.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
    this.endsAt = now + attack + release + 0.15;

    for (const osc of this.oscs) osc.stop(this.endsAt + 0.05);
  }

  done(nowSec: number): boolean {
    return nowSec >= this.endsAt;
  }

  dispose(): void {
    for (const osc of this.oscs) {
      try {
        osc.disconnect();
      } catch {
        /* gone */
      }
    }
    try {
      this.env.disconnect();
    } catch {
      /* gone */
    }
  }
}
