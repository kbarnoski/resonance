// ─────────────────────────────────────────────────────────────────────────
// flute.test.ts — headless verification of the waveguide flute.
//
// Synthesizes each of the 7 G-Mixolydian scale notes for a short buffer and
// asserts, per note:
//   1. boundedness     — no NaN/Inf, every |sample| < a ceiling
//   2. oscillation     — non-trivial RMS (it actually rings, not silence)
//   3. tuning          — detected fundamental within ±60 cents of target
//
// `selfTest()` returns a structured result and never throws; call it from the
// page in dev (console) or run it under ts-node / a quick node harness.
// ─────────────────────────────────────────────────────────────────────────

import {
  SCALE_MIDI,
  SCALE_NAMES,
  FluteVoice,
  midiToHz,
  detectFundamental,
  rms,
  centsOff,
} from "./flute";

export interface NoteResult {
  name: string;
  midi: number;
  targetHz: number;
  measuredHz: number;
  cents: number;
  rms: number;
  peak: number;
  bounded: boolean;
  oscillates: boolean;
  inTune: boolean;
  pass: boolean;
}

export interface SelfTestResult {
  pass: boolean;
  sampleRate: number;
  notes: NoteResult[];
  summary: string;
}

const CEILING = 8; // |sample| ceiling — well above normal (~<1) ringing
const MIN_RMS = 0.002; // must actually oscillate (flute tones are modest-RMS)
const MAX_CENTS = 60; // ±60 cents tuning tolerance

export function selfTest(sampleRate = 48000): SelfTestResult {
  // Render long enough to settle the loop and resolve pitch (~0.5s).
  const settle = Math.floor(sampleRate * 0.25);
  const analyse = Math.floor(sampleRate * 0.35);
  const total = settle + analyse;

  const notes: NoteResult[] = [];
  let allPass = true;

  for (let i = 0; i < SCALE_MIDI.length; i++) {
    const midi = SCALE_MIDI[i];
    const voice = new FluteVoice(sampleRate, midi);
    voice.setMidi(midi);

    const buf = new Float32Array(analyse);
    let bounded = true;
    let peak = 0;

    // Settle with steady breath.
    for (let n = 0; n < settle; n++) voice.process(0.6);
    // Capture.
    for (let n = 0; n < analyse; n++) {
      const s = voice.process(0.6);
      if (!Number.isFinite(s) || Math.abs(s) > CEILING) bounded = false;
      if (Math.abs(s) > peak) peak = Math.abs(s);
      buf[n] = s;
    }

    const targetHz = midiToHz(midi);
    const r = rms(buf);
    const oscillates = r > MIN_RMS && bounded;
    const measuredHz = oscillates ? detectFundamental(buf, sampleRate, targetHz) : 0;
    const cents = oscillates ? centsOff(measuredHz, targetHz) : Infinity;
    const inTune = oscillates && Math.abs(cents) <= MAX_CENTS;
    const pass = bounded && oscillates && inTune;
    if (!pass) allPass = false;

    notes.push({
      name: SCALE_NAMES[i],
      midi,
      targetHz: round(targetHz, 2),
      measuredHz: round(measuredHz, 2),
      cents: round(cents, 1),
      rms: round(r, 4),
      peak: round(peak, 3),
      bounded,
      oscillates,
      inTune,
      pass,
    });
  }

  void total;
  const lines = notes.map(
    (n) =>
      `${n.pass ? "PASS" : "FAIL"} ${n.name.padEnd(2)} ${String(n.midi).padEnd(
        3
      )} target ${n.targetHz}Hz  meas ${n.measuredHz}Hz  ${
        n.cents >= 0 ? "+" : ""
      }${n.cents}c  rms ${n.rms}  peak ${n.peak}`
  );
  const summary =
    `selfTest @ ${sampleRate}Hz — ${allPass ? "ALL PASS" : "FAILURES"}\n` +
    lines.join("\n");

  return { pass: allPass, sampleRate, notes, summary };
}

function round(x: number, d: number): number {
  if (!Number.isFinite(x)) return x;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}
