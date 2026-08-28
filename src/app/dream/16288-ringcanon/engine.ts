"use client";

/* ── 16288 · Ring Canon — audio engine ──────────────────────────────────────
 *
 *  His one real piano take, read by TWO decoupled loop heads (a canon of his
 *  own recording — extending 15824-canon). The FIRST head is the LIVE voice,
 *  near-dry. The SECOND head is the ANSWERING voice: instead of a plain replay,
 *  his signal is fed as the EXCITATION into a bank of parallel high-Q bandpass
 *  MODAL RESONATORS tuned to the take's key center. The resonated sum is the
 *  "modal body" his playing rings out of — a ghost instrument that drifts in
 *  time against him.
 *
 *  RULE 10: every sample that reaches the speakers originates as his decoded
 *  AudioBuffer. The resonators are FILTERS on his audio (like a convolver is a
 *  filter on his audio). No oscillators, no noise, no synthesized excitation.
 * ─────────────────────────────────────────────────────────────────────────── */

import type { SafeMaster } from "../_shared/visionary/safeMaster";

// ── music theory: build the modal frequency set from a key center ────────────

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const MODE_COUNT = 12;

interface ParsedKey {
  pc: number;
  isMinor: boolean;
  label: string;
}

/** Parse a key-center string like "A# minor", "F# major", "C", or null. */
function parseKey(keyCenter: string | null | undefined): ParsedKey {
  if (!keyCenter) return { pc: 2, isMinor: true, label: "D minor (default)" };
  const m = keyCenter.trim().match(/^([A-Ga-g])([#b]?)\s*(.*)$/);
  if (!m) return { pc: 2, isMinor: true, label: "D minor (default)" };
  const key = (m[1].toUpperCase() + (m[2] === "b" ? "B" : m[2])).toUpperCase();
  const pc = PITCH_CLASS[key];
  if (pc === undefined) return { pc: 2, isMinor: true, label: "D minor (default)" };
  const rest = m[3].toLowerCase();
  const isMinor = /(^|\s)(m|min|minor)\b/.test(rest) && !/maj/.test(rest);
  const label = `${NOTE_NAMES[pc]} ${isMinor ? "minor" : "major"}`;
  return { pc, isMinor, label };
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * The modal frequency set (Hz), MODE_COUNT tuned partials spread up from the
 * root across octaves on a pentatonic degree set — fewer, cleaner ringing modes
 * than a full diatonic scale, so the body sings rather than muds.
 */
export function buildModalFreqs(keyCenter: string | null | undefined): {
  freqs: number[];
  label: string;
} {
  const { pc, isMinor, label } = parseKey(keyCenter);
  const degrees = isMinor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const rootMidi = 36 + pc; // ~C2 register base
  const freqs: number[] = [];
  for (let oct = 0; oct < 5 && freqs.length < MODE_COUNT; oct++) {
    for (const deg of degrees) {
      if (freqs.length >= MODE_COUNT) break;
      const f = midiToFreq(rootMidi + oct * 12 + deg);
      if (f > 95 && f < 4200) freqs.push(f);
    }
  }
  return { freqs, label };
}

// ── the resonant answering voice: a parallel bank of high-Q biquads ──────────

interface ModalBank {
  input: GainNode; // his excitation enters here
  modes: BiquadFilterNode[];
  sum: GainNode;
  fbDelay: DelayNode;
  fbLP: BiquadFilterNode;
  fb: GainNode;
  makeup: GainNode;
  baseFreqs: number[];
}

interface LiveVoice {
  source: AudioBufferSourceNode;
  hp: BiquadFilterNode;
  gain: GainNode;
}
interface RevenantVoice {
  source: AudioBufferSourceNode;
  excite: GainNode;
}

export interface ResonantCanon {
  ctx: AudioContext;
  master: SafeMaster;
  live: LiveVoice;
  revenant: RevenantVoice;
  bank: ModalBank;
  duration: number;
  title: string;
  keyLabel: string;
  /** current time-base rates, read by the visual for the read-head speeds. */
  liveRate: number;
  revRate: number;
  /** baked default start lag of the answering head (seconds). */
  lag: number;
}

// baked auto-demo defaults — sounding in modal-canon within ~1s, no input.
const DEFAULT_CANON = 0.36; // → revRate ≈ 0.97 (a gentle drift, not unison)
const DEFAULT_TUNING = 0.0; // no transpose
const DEFAULT_RING = 0.58; // a long-but-bounded ring
const LIVE_RATE = 1.0;
const BASE_Q = 46;

function revRateOf(canon: number): number {
  // canon 0..1 → 0.90×..1.10×, with the baked default landing near 0.97×.
  return 0.9 + canon * 0.2;
}
function feedbackOf(ring: number): number {
  return 0.12 + ring * 0.7; // 0.12..0.82 — always < 0.85 (bounded, never runs away)
}
function fbCutoffOf(ring: number): number {
  return 900 + ring * 2600; // 900..3500 Hz lowpass in the feedback path
}
function qOf(ring: number): number {
  return BASE_Q + ring * 44; // 46..90
}

function buildBank(
  ctx: AudioContext,
  master: SafeMaster,
  baseFreqs: number[],
): ModalBank {
  const input = ctx.createGain();
  input.gain.value = 1;

  const sum = ctx.createGain();
  sum.gain.value = 1;

  const modes: BiquadFilterNode[] = [];
  for (let i = 0; i < baseFreqs.length; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = baseFreqs[i];
    bp.Q.value = qOf(DEFAULT_RING);
    // a small per-mode trim so low modes don't dominate the sum.
    const g = ctx.createGain();
    g.gain.value = 0.9 - i * 0.03;
    input.connect(bp);
    bp.connect(g);
    g.connect(sum);
    modes.push(bp);
  }

  // bounded regeneration: the resonated sum re-excites the bank through a
  // lowpass, so modes ring longer — feedback gain < 0.85, always through the LP,
  // and the safeMaster limiter is the final safety net.
  const fbDelay = ctx.createDelay(0.5);
  fbDelay.delayTime.value = 0.11;
  const fbLP = ctx.createBiquadFilter();
  fbLP.type = "lowpass";
  fbLP.frequency.value = fbCutoffOf(DEFAULT_RING);
  fbLP.Q.value = 0.4;
  const fb = ctx.createGain();
  fb.gain.value = feedbackOf(DEFAULT_RING);

  sum.connect(fbDelay);
  fbDelay.connect(fbLP);
  fbLP.connect(fb);
  fb.connect(input); // regeneration loop of HIS resonated signal

  const makeup = ctx.createGain();
  makeup.gain.value = 0.85;
  sum.connect(makeup);
  makeup.connect(master.input);

  return { input, modes, sum, fbDelay, fbLP, fb, makeup, baseFreqs };
}

export function createResonantCanon(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  keyCenter: string | null | undefined,
  title: string,
): ResonantCanon {
  const { freqs, label } = buildModalFreqs(keyCenter);
  const duration = buffer.duration;
  const lag = Math.min(duration * 0.5, 2.6);

  // ── Voice 1 — LIVE: his take, near-dry (light shaping only). ──
  const lSource = ctx.createBufferSource();
  lSource.buffer = buffer;
  lSource.loop = true;
  lSource.playbackRate.value = LIVE_RATE;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 38;
  hp.Q.value = 0.4;
  const lGain = ctx.createGain();
  lGain.gain.value = 0.8;
  lSource.connect(hp);
  hp.connect(lGain);
  lGain.connect(master.input);

  // ── Voice 2 — REVENANT: same buffer, decoupled time-base, through the bank. ──
  const bank = buildBank(ctx, master, freqs);
  const rSource = ctx.createBufferSource();
  rSource.buffer = buffer;
  rSource.loop = true;
  rSource.playbackRate.value = revRateOf(DEFAULT_CANON);
  const excite = ctx.createGain();
  excite.gain.value = 0.9;
  rSource.connect(excite);
  excite.connect(bank.input);

  const t0 = ctx.currentTime + 0.02;
  lSource.start(t0, 0);
  rSource.start(t0, lag % duration); // baked canon lag → drift from the first note

  return {
    ctx,
    master,
    live: { source: lSource, hp, gain: lGain },
    revenant: { source: rSource, excite },
    bank,
    duration,
    title,
    keyLabel: label,
    liveRate: LIVE_RATE,
    revRate: revRateOf(DEFAULT_CANON),
    lag,
  };
}

export interface Controls {
  canon: number; // 0..1 — time-base drift between the two heads
  tuning: number; // -1..1 — transpose the modal set (± an octave)
  ring: number; // 0..1 — ring length (bounded feedback + Q)
}

export const DEFAULT_CONTROLS: Controls = {
  canon: DEFAULT_CANON,
  tuning: DEFAULT_TUNING,
  ring: DEFAULT_RING,
};

/** Apply the three scalars to the graph, everything smoothed. */
export function applyControls(canon: ResonantCanon, c: Controls): void {
  const now = canon.ctx.currentTime;
  const TC = 0.12;

  const rate = revRateOf(c.canon);
  canon.revRate = rate;
  canon.revenant.source.playbackRate.setTargetAtTime(rate, now, 0.16);

  // transpose the whole modal set by up to ±12 semitones.
  const mult = Math.pow(2, (c.tuning * 12) / 12);
  const q = qOf(c.ring);
  for (let i = 0; i < canon.bank.modes.length; i++) {
    const f = canon.bank.baseFreqs[i] * mult;
    const clamped = Math.max(70, Math.min(5000, f));
    canon.bank.modes[i].frequency.setTargetAtTime(clamped, now, TC);
    canon.bank.modes[i].Q.setTargetAtTime(q, now, TC);
  }

  canon.bank.fb.gain.setTargetAtTime(feedbackOf(c.ring), now, TC);
  canon.bank.fbLP.frequency.setTargetAtTime(fbCutoffOf(c.ring), now, TC);
}

/** Current modal frequencies (Hz) after a tuning shift — for the visual. */
export function modalFreqsNow(canon: ResonantCanon, tuning: number): number[] {
  const mult = Math.pow(2, tuning);
  return canon.bank.baseFreqs.map((f) =>
    Math.max(70, Math.min(5000, f * mult)),
  );
}

export function teardownCanon(canon: ResonantCanon): void {
  for (const s of [canon.live.source, canon.revenant.source]) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  const nodes: AudioNode[] = [
    canon.live.source,
    canon.live.hp,
    canon.live.gain,
    canon.revenant.source,
    canon.revenant.excite,
    canon.bank.input,
    canon.bank.sum,
    canon.bank.fbDelay,
    canon.bank.fbLP,
    canon.bank.fb,
    canon.bank.makeup,
    ...canon.bank.modes,
  ];
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  canon.master.disconnect();
}

// ── small input helper shared by page.tsx ────────────────────────────────────

export function deadzone(v: number, dz = 0.12): number {
  return Math.abs(v) < dz ? 0 : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clampSym(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
