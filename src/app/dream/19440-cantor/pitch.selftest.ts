// pitch.selftest.ts — headless verification of the YIN/CMNDF detector.
//
// Named *.selftest.ts (NOT *.test.ts) so the production CI vitest run ignores
// it (AGENT.md 2026-09-26 rule). Run manually with a TS runner, e.g.:
//   npx tsx src/app/dream/19440-cantor/pitch.selftest.ts
// Exits non-zero if any synthetic tone is mis-detected — the one part of
// cantor's control path that IS verifiable without a microphone.

import { detectPitch, type PitchState } from "./pitch";

const SR = 44100;
const N = 2048;

function tone(freq: number, harmonics = true): Float32Array {
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let s = Math.sin(2 * Math.PI * freq * t);
    if (harmonics) {
      // A voice-like timbre: add a couple of harmonics so the test isn't a
      // pure sine (plain autocorrelation would octave-error on these).
      s += 0.5 * Math.sin(2 * Math.PI * 2 * freq * t);
      s += 0.33 * Math.sin(2 * Math.PI * 3 * freq * t);
    }
    b[i] = s * 0.3;
  }
  return b;
}

const cases = [
  { name: "G2", hz: 98 },
  { name: "A2", hz: 110 },
  { name: "C3", hz: 131 },
  { name: "A3", hz: 220 },
  { name: "C4 (middle)", hz: 262 },
  { name: "A4", hz: 440 },
  { name: "C5", hz: 523 },
  { name: "A5", hz: 880 },
];

let failures = 0;
const out: PitchState = { hz: 0, clarity: 0, loud: 0 };

for (const c of cases) {
  detectPitch(tone(c.hz), SR, out);
  const cents = out.hz > 0 ? Math.round(1200 * Math.log2(out.hz / c.hz)) : NaN;
  const ok = out.hz > 0 && Math.abs(cents) <= 25 && out.clarity > 0.5;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(12)} want ${c.hz}Hz  got ${out.hz.toFixed(1)}Hz  (${isNaN(cents) ? "none" : (cents >= 0 ? "+" : "") + cents + "¢"})  clarity ${out.clarity.toFixed(2)}`,
  );
}

// Silence must report no pitch.
detectPitch(new Float32Array(N), SR, out);
const silenceOk = out.hz === 0;
console.log(`${silenceOk ? "PASS" : "FAIL"}  silence      → ${out.hz === 0 ? "no pitch" : out.hz.toFixed(1) + "Hz"}`);
if (!silenceOk) failures++;

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log("\nall pitch cases detected within ±25¢.");
