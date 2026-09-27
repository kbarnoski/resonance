/* ───────────────────────────────────────────────────────────────────────────
   pitch.test.ts — verification template for the Hum Blossom pitch module.

   Pure TS + console.assert ONLY. No test framework is imported, so this file
   cannot break `next build`. It also does NOT auto-run at module load — call
   runPitchTests() explicitly (e.g. via `tsx pitch.test.ts` after wiring a
   bottom-of-file guard, or from a scratch script) to execute the assertions.

   Strategy: synthesize pure sine buffers at known frequencies and assert that
   detectPitchHz recovers them within ~3%. Also assert silence → -1.
─────────────────────────────────────────────────────────────────────────── */

import { detectPitchHz, hzToMidi, midiToHz } from "./pitch";

const SAMPLE_RATE = 44100;
const FRAME = 2048;

/** Build a Float32Array sine of `hz` at `sampleRate`. */
function makeSine(hz: number, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return out;
}

/** Assert that `actual` is within `tol` (fractional) of `expected`. */
function assertClose(actual: number, expected: number, tol: number, label: string): void {
  const rel = Math.abs(actual - expected) / expected;
  console.assert(
    rel <= tol,
    `${label}: expected ~${expected.toFixed(2)}, got ${actual.toFixed(2)} (rel ${(rel * 100).toFixed(2)}% > ${(tol * 100).toFixed(0)}%)`,
  );
}

/** Run all pitch-detection assertions. Returns true if all passed. */
export function runPitchTests(): boolean {
  let ok = true;
  const origAssert = console.assert;
  // Wrap console.assert so a failure flips `ok` while still logging.
  console.assert = (cond?: boolean, ...rest: unknown[]) => {
    if (!cond) ok = false;
    origAssert(cond as boolean, ...(rest as []));
  };

  try {
    for (const hz of [220, 440, 880]) {
      const buf = makeSine(hz, SAMPLE_RATE, FRAME);
      const detected = detectPitchHz(buf, SAMPLE_RATE);
      assertClose(detected, hz, 0.03, `detectPitchHz(${hz}Hz)`);
    }

    // A low child-hum-ish note.
    const g3 = midiToHz(55); // ~196 Hz
    assertClose(detectPitchHz(makeSine(g3, SAMPLE_RATE, FRAME), SAMPLE_RATE), g3, 0.03, "detectPitchHz(G3)");

    // Silence (all zeros) and near-silence must return -1.
    console.assert(detectPitchHz(new Float32Array(FRAME), SAMPLE_RATE) === -1, "silence → -1");
    const quiet = makeSine(440, SAMPLE_RATE, FRAME);
    for (let i = 0; i < quiet.length; i++) quiet[i] *= 0.001;
    console.assert(detectPitchHz(quiet, SAMPLE_RATE) === -1, "near-silence (below RMS gate) → -1");

    // hz↔midi round-trip sanity.
    assertClose(midiToHz(69), 440, 0.001, "midiToHz(69) === A4");
    assertClose(hzToMidi(440), 69, 0.001, "hzToMidi(440) === 69");
  } finally {
    console.assert = origAssert;
  }

  console.log(ok ? "pitch.test.ts: ALL PASSED" : "pitch.test.ts: FAILURES (see asserts above)");
  return ok;
}
