// Import + analyse THE JOSEPH SET into the local Tramokyo pack (offline only).
//
//   npx jiti scripts/import-joseph-set.ts            # import missing + (re)analyse all
//   npx jiti scripts/import-joseph-set.ts --force    # re-copy the audio too
//
// Reads Joseph's masters from ~/Documents/Resonance/joseph-set/originals/
// (copies of ~/Downloads/Joseph — the set no longer depends on Downloads),
// writes public/tramokyo-pack/joseph/<id>.m4a (AAC already: remuxed, not
// re-encoded, +faststart) and public/tramokyo-pack/joseph/joseph-set.json
// (durations + the light analysis Live Theatre reads). The pack is gitignored:
// NOTHING here reaches git, Supabase or Vercel. After running, the kiosk server
// must restart (next start snapshots public/) before the files serve.
//
// Analysis (founding law: visuals from the music, not the title):
//   loudness envelope (RMS dB per 0.5 s), brightness (spectral centroid),
//   rough tempo (spectral-flux autocorrelation), sections (novelty peaks on
//   loudness + brightness), and an arc: calm / building / intense.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JOSEPH_TRACKS } from "../src/lib/journeys/joseph-set";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FFMPEG: string = require("ffmpeg-static");
const SRC = path.join(os.homedir(), "Documents/Resonance/joseph-set/originals");
const OUT = path.join(__dirname, "../public/tramokyo-pack/joseph");
const FORCE = process.argv.includes("--force");
const SR = 11025;
const N = 1024; // FFT frame
const HOP = 512; // ~46 ms

function decode(file: string): Float32Array {
  const buf = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function fftMag(re: Float64Array): Float64Array {
  const n = re.length;
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const xr = ar * wr - ai * wi, xi = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function analyse(pcm: Float32Array) {
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const frames = Math.max(0, Math.floor((pcm.length - N) / HOP));
  const rms: number[] = [], cen: number[] = [], flux: number[] = [];
  let prev: Float64Array | null = null;
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    const re = new Float64Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) { const s = pcm[o + i]; e += s * s; re[i] = s * win[i]; }
    rms.push(Math.sqrt(e / N));
    const mag = fftMag(re);
    let num = 0, den = 0, fl = 0;
    for (let k = 1; k < mag.length; k++) {
      num += k * mag[k]; den += mag[k];
      if (prev) fl += Math.max(0, mag[k] - prev[k]);
    }
    cen.push(den > 1e-9 ? (num / den) * (SR / N) : 0);
    flux.push(fl);
    prev = mag;
  }
  const fps = SR / HOP;
  // 0.5 s envelope
  const per = Math.round(fps / 2);
  const envDb: number[] = [], envCen: number[] = [];
  for (let i = 0; i < rms.length; i += per) {
    const r = rms.slice(i, i + per), c = cen.slice(i, i + per);
    envDb.push(20 * Math.log10(Math.max(1e-5, Math.sqrt(mean(r.map((x) => x * x))))));
    envCen.push(mean(c));
  }
  // tempo: autocorrelation of mean-removed flux, 60–180 BPM
  const fm = mean(flux);
  const fz = flux.map((x) => x - fm);
  let bestLag = 0, best = -Infinity;
  for (let lag = Math.round((fps * 60) / 180); lag <= Math.round((fps * 60) / 60); lag++) {
    let s = 0;
    for (let i = 0; i + lag < fz.length; i++) s += fz[i] * fz[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  const tempo = bestLag ? Math.round((60 * fps) / bestLag) : null;
  // sections: novelty = |mean(next 12 s) − mean(prev 12 s)| on z-scored loudness + ½ brightness
  const z = (a: number[]) => { const m = mean(a); const sd = Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; return a.map((x) => (x - m) / sd); };
  const zl = z(envDb), zc = z(envCen);
  const W = 24; // 12 s in 0.5 s steps
  const nov = zl.map((_, i) => {
    if (i < W || i + W > zl.length) return 0;
    const a = mean(zl.slice(i - W, i)) - mean(zl.slice(i, i + W));
    const b = mean(zc.slice(i - W, i)) - mean(zc.slice(i, i + W));
    return Math.abs(a) + 0.5 * Math.abs(b);
  });
  const dur = envDb.length / 2;
  const bounds: number[] = [];
  const order = nov.map((v, i) => [v, i] as const).filter(([v]) => v > 0.6).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) {
    const t = i / 2;
    if (t < 25 || dur - t < 25) continue;
    if (bounds.some((b) => Math.abs(b - t) < 35)) continue;
    bounds.push(t);
  }
  bounds.sort((a, b) => a - b);
  const edges = [0, ...bounds, dur];
  const maxDb = Math.max(...envDb);
  const sections = edges.slice(0, -1).map((s, k) => {
    const e = edges[k + 1];
    const slice = envDb.slice(Math.round(s * 2), Math.round(e * 2));
    return { start: +s.toFixed(1), end: +e.toFixed(1), db: +mean(slice).toFixed(1), rel: +(mean(slice) - maxDb).toFixed(1) };
  });
  const third = Math.floor(envDb.length / 3);
  const first = mean(envDb.slice(0, third)), last = mean(envDb.slice(-third)), mid = mean(envDb.slice(third, -third));
  return {
    tempo,
    loudnessDb: +mean(envDb).toFixed(1),
    peakDb: +maxDb.toFixed(1),
    brightnessHz: Math.round(mean(envCen)),
    rise: +(Math.max(mid, last) - first).toFixed(1),
    sections,
    // 2 s envelope (dB) for the record — small enough to keep
    envelope: envDb.filter((_, i) => i % 4 === 0).map((x) => +x.toFixed(1)),
  };
}

fs.mkdirSync(OUT, { recursive: true });
const results: Record<string, unknown>[] = [];
for (const t of JOSEPH_TRACKS) {
  const src = path.join(SRC, t.file);
  if (!fs.existsSync(src)) { console.error(`MISSING master: ${src}`); process.exitCode = 1; continue; }
  const dst = path.join(OUT, `${t.id}.m4a`);
  if (FORCE || !fs.existsSync(dst)) {
    const r = spawnSync(FFMPEG, ["-v", "error", "-y", "-i", src, "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", dst]);
    if (r.status !== 0) { console.error(`remux failed ${t.id}: ${r.stderr}`); process.exitCode = 1; continue; }
  }
  const a = analyse(decode(dst));
  const duration = +(a.envelope.length * 2).toFixed(0);
  results.push({ id: t.id, title: t.title, duration: Math.max(duration, t.duration), file: `${t.id}.m4a`, ...a });
  console.log(`${t.id.padEnd(34)} ${String(a.tempo).padStart(4)}bpm  ${a.loudnessDb}dB  ${a.brightnessHz}Hz  rise ${a.rise}  ${a.sections.length} sections`);
}

// arc relative to the set: tertiles of loudness, "building" when the track rises ≥ 4 dB
const louds = results.map((r) => r.loudnessDb as number).sort((a, b) => a - b);
const lo = louds[Math.floor(louds.length / 3)], hi = louds[Math.floor((2 * louds.length) / 3)];
for (const r of results) {
  const l = r.loudnessDb as number;
  r.arc = (r.rise as number) >= 4 ? "building" : l >= hi ? "intense" : l <= lo ? "calm" : "steady";
  // per-section energy band, relative to the set's loudness tertiles
  for (const s of r.sections as { db: number; energy?: string }[]) s.energy = s.db >= hi ? "high" : s.db <= lo ? "low" : "mid";
}
fs.writeFileSync(path.join(OUT, "joseph-set.json"), JSON.stringify({ generatedAt: new Date().toISOString(), tracks: results }, null, 1));
console.log(`wrote ${results.length} tracks → ${path.relative(process.cwd(), OUT)}/joseph-set.json`);
