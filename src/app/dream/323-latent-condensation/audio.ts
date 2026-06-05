// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — source pipeline for "Latent Condensation".
//   1. Try Karel's real "Welcome Home" recording via /api/featured + /api/audio.
//   2. If anything is unreachable / empty / errors, synthesize a slow A-natural-
//      minor solo-piano-ish arpeggio bed (detuned voices + Karplus-Strong plucks)
//      into an AudioBuffer instead.
// Returns a decoded AudioBuffer plus a human-readable source label.
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

export interface SourceResult {
  buffer: AudioBuffer;
  /** true when this is Karel's real recording, false for the synth fallback */
  real: boolean;
  /** track title (real) or a fallback description */
  title: string;
}

/** Flatten the `recordings` field, which may be a single object or an array. */
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

/** Fetch + decode Karel's recording. Returns null on any failure. */
async function loadReal(ctx: AudioContext): Promise<SourceResult | null> {
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

  const recordings = collectRecordings(album);
  const rec = recordings.find((r) => r.id);
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
    const title = rec.title || album.name || "Welcome Home";
    return { buffer, real: true, title };
  } catch {
    return null;
  }
}

// ── Synth fallback ────────────────────────────────────────────────────────────
// A slow A-natural-minor arpeggio bed rendered offline into an AudioBuffer.
// Detuned triangle/sine voices for body + a Karplus-Strong pluck for piano-ish
// attack. Long chord changes create clear rising/holding/decaying phrases so the
// condense↔dissolve state machine has something legible to chew on.

// A natural minor progression (Hz). i — VI — III — iv(Dorian color).
const CHORDS: number[][] = [
  [220.0, 261.63, 329.63, 440.0], // A minor
  [174.61, 220.0, 261.63, 349.23], // F major (VI)
  [261.63, 329.63, 392.0, 523.25], // C major (III)
  [293.66, 349.23, 440.0, 587.33], // D minor (iv)
];

/** Render one Karplus-Strong plucked string into a mono Float32Array. */
function makePluck(sampleRate: number, freq: number, dur: number, amp: number): Float32Array<ArrayBuffer> {
  const n = Math.floor(sampleRate * dur);
  const out = new Float32Array(new ArrayBuffer(n * 4));
  const period = Math.max(2, Math.floor(sampleRate / freq));
  const buf = new Float32Array(period);
  for (let i = 0; i < period; i++) buf[i] = (Math.random() * 2 - 1) * amp;
  let idx = 0;
  const decay = 0.996;
  for (let i = 0; i < n; i++) {
    const cur = buf[idx];
    const next = buf[(idx + 1) % period];
    const avg = (cur + next) * 0.5 * decay;
    out[i] = cur;
    buf[idx] = avg;
    idx = (idx + 1) % period;
  }
  // soft fade tail
  const fade = Math.floor(sampleRate * 0.15);
  for (let i = 0; i < fade && i < n; i++) out[n - 1 - i] *= i / fade;
  return out;
}

function renderSynthFallback(): Promise<SourceResult> {
  const sampleRate = 44100;
  const seconds = 56;
  const Offline: typeof OfflineAudioContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const off = new Offline(2, sampleRate * seconds, sampleRate);

  const master = off.createGain();
  master.gain.setValueAtTime(0.0, 0);
  master.gain.linearRampToValueAtTime(0.72, 2.0);
  master.gain.setValueAtTime(0.72, seconds - 3);
  master.gain.linearRampToValueAtTime(0.0, seconds);

  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2800;
  lp.Q.value = 0.4;
  lp.connect(master);
  master.connect(off.destination);

  // Karplus-Strong plucks share one buffer source per note for a piano-ish attack.
  const pluckBus = off.createGain();
  pluckBus.gain.value = 0.9;
  pluckBus.connect(lp);

  const chordDur = 7.0; // seconds per chord — long phrases
  let t = 0.5;
  let chordIdx = 0;
  while (t < seconds - 2) {
    const chord = CHORDS[chordIdx % CHORDS.length];
    const notes = chord.length;
    const step = (chordDur * 0.62) / notes;
    for (let n = 0; n < notes; n++) {
      const start = t + n * step;
      const freq = chord[n];

      // sustained detuned body
      for (let v = 0; v < 2; v++) {
        const osc = off.createOscillator();
        osc.type = v === 0 ? "triangle" : "sine";
        osc.frequency.value = freq;
        osc.detune.value = (v === 0 ? -4 : 5) + (Math.random() - 0.5) * 3;
        const g = off.createGain();
        const peak = (v === 0 ? 0.13 : 0.08) * (1 - n * 0.05);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0002, start + 3.4);
        osc.connect(g);
        g.connect(lp);
        osc.start(start);
        osc.stop(start + 3.6);
      }

      // Karplus-Strong pluck attack
      const pluckData = makePluck(sampleRate, freq, 2.6, 0.5);
      const pbuf = off.createBuffer(1, pluckData.length, sampleRate);
      pbuf.copyToChannel(pluckData, 0);
      const psrc = off.createBufferSource();
      psrc.buffer = pbuf;
      const pg = off.createGain();
      pg.gain.value = 0.34 * (1 - n * 0.07);
      psrc.connect(pg);
      pg.connect(pluckBus);
      psrc.start(start);
    }
    t += chordDur;
    chordIdx++;
  }

  return off.startRendering().then((buffer) => ({
    buffer,
    real: false,
    title: "synth fallback — A natural minor",
  }));
}

/**
 * Resolve an audio source: Karel's real recording if reachable, otherwise the
 * synthesized fallback. Always resolves to a usable AudioBuffer.
 */
export async function resolveSource(ctx: AudioContext): Promise<SourceResult> {
  const real = await loadReal(ctx);
  if (real) return real;
  return renderSynthFallback();
}
