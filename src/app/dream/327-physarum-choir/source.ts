// ─────────────────────────────────────────────────────────────────────────────
// source.ts — where the "food" (tone seeds) comes from.
//   Primary: Karel's real recording via /api/featured + /api/audio/[id].
//     We decode it, run a coarse onset+pitch tap, and emit seed tones whose
//     pitch maps to a position on the canvas. His music plants the tones the
//     slime then connects.
//   Fallback: an offline-rendered short D-modal arpeggio AND an auto-seeded
//     ring of food nodes, so the piece is ALWAYS demoable.
// This module has NO side effects beyond GET fetches.
// ─────────────────────────────────────────────────────────────────────────────

// Public /api/featured shape (only the fields we read).
interface FeaturedRecording {
  id: string;
  title?: string | null;
}
interface FeaturedTrack {
  recordings?: FeaturedRecording | FeaturedRecording[] | null;
}
interface FeaturedAlbum {
  id: string;
  name?: string;
  artist?: string;
  description?: string;
  featured_album_tracks?: FeaturedTrack[];
}

/** One detected tone-seed: a normalized canvas position + a scale degree. */
export interface Seed {
  /** normalized [0,1] */
  x: number;
  y: number;
  /** index into the just-intonation scale (0..SCALE.length-1) */
  degree: number;
  /** octave offset, integer */
  octave: number;
}

export interface SourceResult {
  /** true = Karel's real recording was decoded; false = synth/auto fallback */
  real: boolean;
  /** human-readable provenance line */
  label: string;
  /** the decoded buffer (real or synth) — used as the always-on bed if present */
  buffer: AudioBuffer | null;
  /** seed tones derived from the audio (or an auto-seeded ring on fallback) */
  seeds: Seed[];
}

// D-rooted just-intonation modal set. Deliberately NOT C-major-pentatonic.
// ratios over the root: 1, 9/8, 6/5, 4/3, 3/2, 5/3, 9/5, 2
export const SCALE: number[] = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 9 / 5, 2];
export const ROOT_HZ = 73.42; // D2

function collectRecordings(album: FeaturedAlbum): FeaturedRecording[] {
  const out: FeaturedRecording[] = [];
  for (const t of album.featured_album_tracks ?? []) {
    const r = t.recordings;
    if (!r) continue;
    if (Array.isArray(r)) {
      for (const one of r) if (one && one.id) out.push(one);
    } else if (r.id) {
      out.push(r);
    }
  }
  return out;
}

/**
 * Map a frequency in Hz to (scale degree, octave). We snap onto the JI modal
 * set so a seed's voice is always in-key with the harmony engine.
 */
function freqToDegree(hz: number): { degree: number; octave: number } {
  // pitch class relative to root, in "octaves above root"
  const oct = Math.log2(hz / ROOT_HZ);
  const within = oct - Math.floor(oct); // [0,1) fractional octave
  // find nearest scale ratio (compare in log space)
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < SCALE.length; i++) {
    const d = Math.abs(Math.log2(SCALE[i]) - within);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const octave = Math.max(0, Math.min(3, Math.floor(oct)));
  return { degree: best, octave };
}

/**
 * Coarse onset + dominant-pitch detection over the decoded buffer. We do NOT
 * need real-time accuracy — just a handful of musically-plausible seed tones
 * scattered in pitch so the food ring is interesting. We window the signal,
 * look for energy onsets, and estimate pitch per onset via autocorrelation.
 */
function tapSeeds(buffer: AudioBuffer, maxSeeds = 10): Seed[] {
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const frame = Math.floor(sr * 0.09); // ~90ms analysis hop
  const hop = frame;
  const seeds: Seed[] = [];
  let prevEnergy = 0;
  const seen = new Set<string>();

  for (let i = 0; i + frame < ch.length && seeds.length < maxSeeds; i += hop) {
    // frame energy (RMS)
    let e = 0;
    for (let k = 0; k < frame; k++) {
      const s = ch[i + k];
      e += s * s;
    }
    e = Math.sqrt(e / frame);
    const rising = e > 0.05 && e > prevEnergy * 1.6;
    prevEnergy = e;
    if (!rising) continue;

    // autocorrelation pitch estimate within a plausible piano range
    const minLag = Math.floor(sr / 1200); // ~1200 Hz
    const maxLag = Math.floor(sr / 70); // ~70 Hz
    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag < maxLag && i + frame + lag < ch.length; lag++) {
      let corr = 0;
      for (let k = 0; k < frame; k += 2) {
        corr += ch[i + k] * ch[i + k + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag === 0) continue;
    const hz = sr / bestLag;
    if (hz < 60 || hz > 1400) continue;
    const { degree, octave } = freqToDegree(hz);
    const key = `${degree}:${octave}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Map pitch -> position. Higher pitch sits higher on the canvas; spread x
    // across the timeline so the seeds form a readable arc, not a column.
    const pitchNorm = Math.min(1, Math.max(0, Math.log2(hz / 70) / Math.log2(1400 / 70)));
    const x = 0.12 + 0.76 * (seeds.length / Math.max(1, maxSeeds - 1));
    const y = 0.85 - 0.7 * pitchNorm;
    seeds.push({ x, y, degree, octave });
  }
  return seeds;
}

/** A ring of food nodes spread over the JI scale — the always-works seeding. */
export function ringSeeds(n = 8): Seed[] {
  const seeds: Seed[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 0.32;
    seeds.push({
      x: 0.5 + Math.cos(a) * r,
      y: 0.5 + Math.sin(a) * r * 0.92,
      degree: i % SCALE.length,
      octave: i < SCALE.length ? 1 : 2,
    });
  }
  return seeds;
}

async function loadReal(ctx: BaseAudioContext): Promise<SourceResult | null> {
  let albums: FeaturedAlbum[];
  try {
    const res = await fetch("/api/featured");
    if (!res.ok) return null;
    albums = (await res.json()) as FeaturedAlbum[];
  } catch {
    return null;
  }
  if (!Array.isArray(albums) || albums.length === 0) return null;

  const album =
    albums.find((a) =>
      `${a.name ?? ""} ${a.artist ?? ""} ${a.description ?? ""}`
        .toLowerCase()
        .match(/welcome|karel/),
    ) ?? albums[0];

  const rec = collectRecordings(album).find((r) => r.id);
  if (!rec) return null;

  try {
    const r = await fetch(`/api/audio/${encodeURIComponent(rec.id)}`);
    if (!r.ok) return null;
    const ctype = r.headers.get("content-type") || "";
    let data: ArrayBuffer;
    if (ctype.includes("application/json")) {
      const j = (await r.json()) as { url?: string };
      if (!j.url) return null;
      const ar = await fetch(j.url);
      if (!ar.ok) return null;
      data = await ar.arrayBuffer();
    } else {
      data = await r.arrayBuffer();
    }
    const buffer = await ctx.decodeAudioData(data.slice(0));
    let seeds = tapSeeds(buffer);
    if (seeds.length < 4) {
      // recording decoded but onset tap was thin — top up with a ring so the
      // network has enough food to compose something.
      seeds = seeds.concat(ringSeeds(8 - seeds.length));
    }
    const title = rec.title || album.name || "Welcome Home";
    return {
      real: true,
      label: `♪ Karel's recording — ${title}`,
      buffer,
      seeds,
    };
  } catch {
    return null;
  }
}

// ── Synth fallback ────────────────────────────────────────────────────────────
// A short D-modal arpeggio rendered offline, plus an auto-seeded ring so the
// network always has food.

function renderSynthFallback(): Promise<SourceResult> {
  const sampleRate = 44100;
  const seconds = 12;
  const Offline: typeof OfflineAudioContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const off = new Offline(1, sampleRate * seconds, sampleRate);

  const master = off.createGain();
  master.gain.value = 0.0;
  master.gain.linearRampToValueAtTime(0.5, 1.5);
  master.gain.setValueAtTime(0.5, seconds - 2);
  master.gain.linearRampToValueAtTime(0.0, seconds);
  master.connect(off.destination);

  // D-modal arpeggio: root * JI ratios, rolling up and down.
  const order = [0, 2, 3, 4, 6, 7, 6, 4, 3, 2];
  let t = 0.4;
  let idx = 0;
  while (t < seconds - 1.5) {
    const ratio = SCALE[order[idx % order.length]];
    const freq = ROOT_HZ * 2 * ratio; // up an octave from D2 for body
    const osc = off.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = off.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0002, t + 1.1);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 1.2);
    t += 0.55;
    idx++;
  }

  return off.startRendering().then((buffer) => ({
    real: false,
    label: "synth fallback — auto-seeded ring (album unreachable)",
    buffer,
    seeds: ringSeeds(8),
  }));
}

/**
 * Resolve the seed source. Always resolves to something demoable: Karel's real
 * recording if reachable, else a synth arpeggio + auto-seeded ring.
 */
export async function resolveSource(ctx: BaseAudioContext): Promise<SourceResult> {
  try {
    const real = await loadReal(ctx);
    if (real && real.seeds.length > 0) return real;
  } catch {
    /* fall through to synth */
  }
  return renderSynthFallback();
}
