// ─────────────────────────────────────────────────────────────────────────────
// 13696 · Callback — grain extraction for the concatenative duet instrument.
//
// The instrument's timbre is literally made of Karel's own recording: we scan
// the decoded buffer for a handful of clean attack moments (spectral-flux-ish
// energy jumps), grab a short window at each, and hand those back as the
// "corpus" the keys re-voice by pitch-shifting. Also exposes a peak reducer for
// drawing the current call phrase as an SVG waveform.
// ─────────────────────────────────────────────────────────────────────────────

/** One source segment of Karel's recording — an offset + length into the buffer. */
export interface Grain {
  startSec: number;
  durSec: number;
}

/**
 * Pick `count` short grains from moments of clear attack in the recording.
 * Uses a windowed RMS + positive-flux onset heuristic, then spreads the picks
 * so they don't cluster; falls back to even spacing if the track is too quiet
 * or too short to yield enough onsets.
 */
export function extractGrains(
  buffer: AudioBuffer,
  count = 7,
  grainMs = 240,
): Grain[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const grainLen = Math.floor((sr * grainMs) / 1000);
  const win = 1024;
  const hop = 512;
  const nWin = Math.max(0, Math.floor((data.length - win) / hop));

  const rms = new Float32Array(nWin);
  for (let i = 0; i < nWin; i++) {
    let s = 0;
    const off = i * hop;
    for (let j = 0; j < win; j++) {
      const v = data[off + j];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / win);
  }

  const cand: { pos: number; flux: number }[] = [];
  for (let i = 1; i < nWin; i++) {
    const f = rms[i] - rms[i - 1];
    if (f > 0) cand.push({ pos: i * hop, flux: f });
  }
  cand.sort((a, b) => b.flux - a.flux);

  const guard = Math.floor(sr * 0.3);
  const minGap = sr * 1.2;
  const chosen: number[] = [];
  for (const c of cand) {
    if (chosen.length >= count) break;
    if (c.pos < guard || c.pos > data.length - grainLen - guard) continue;
    if (chosen.some((p) => Math.abs(p - c.pos) < minGap)) continue;
    chosen.push(c.pos);
  }

  // Fallback / top-up: evenly spaced windows across the usable span.
  if (chosen.length < count) {
    const usable = data.length - 2 * grainLen - guard * 2;
    for (let i = 0; i < count && chosen.length < count; i++) {
      const pos = Math.floor(guard + (usable * i) / Math.max(1, count - 1));
      if (!chosen.some((p) => Math.abs(p - pos) < minGap * 0.6)) chosen.push(pos);
    }
  }

  chosen.sort((a, b) => a - b);
  return chosen.slice(0, count).map((pos) => {
    // Nudge the window a hair before the detected onset so the attack is intact.
    const start = Math.max(0, pos - grainLen * 0.1);
    return { startSec: start / sr, durSec: grainMs / 1000 };
  });
}

/**
 * Reduce a segment of the buffer to `bins` normalized abs-peak values (0..1),
 * for drawing the current call phrase as a compact SVG waveform.
 */
export function segmentPeaks(
  buffer: AudioBuffer,
  startSec: number,
  durSec: number,
  bins = 72,
): number[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const total = Math.min(data.length - start, Math.floor(durSec * sr));
  const per = Math.max(1, Math.floor(total / bins));
  const out: number[] = [];
  let max = 1e-4;
  for (let b = 0; b < bins; b++) {
    let peak = 0;
    const o = start + b * per;
    for (let j = 0; j < per; j++) {
      const v = Math.abs(data[o + j] || 0);
      if (v > peak) peak = v;
    }
    out.push(peak);
    if (peak > max) max = peak;
  }
  return out.map((v) => v / max);
}
