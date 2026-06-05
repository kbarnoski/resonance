// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — source pipeline for the spectral flight.
//   1. Try Karel's real "Welcome Home" recording via /api/featured + /api/audio.
//   2. If anything is unreachable / empty / errors, synthesize a ~50s evolving
//      natural-minor piano-ish arpeggio bed into an AudioBuffer instead.
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
  label: string;
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
    return {
      buffer,
      real: true,
      title,
      label: `source: Karel's recording — ${title}`,
    };
  } catch {
    return null;
  }
}

// ── Synth fallback ────────────────────────────────────────────────────────────
// A warm A-natural-minor / Dorian-tinted arpeggio bed rendered offline into an
// AudioBuffer. Slow chord changes, a few detuned voices, gentle envelopes.

// A natural minor chords (Hz), each a slowly-arpeggiated triad+color tone.
// i: A C E  |  VI: F A C  |  III: C E G  |  v(Dorian color D): D F A
const CHORDS: number[][] = [
  [220.0, 261.63, 329.63, 440.0], // A minor
  [174.61, 220.0, 261.63, 349.23], // F major (VI)
  [261.63, 329.63, 392.0, 523.25], // C major (III)
  [293.66, 349.23, 440.0, 587.33], // D minor (Dorian-ish iv)
];

function renderSynthFallback(): Promise<SourceResult> {
  const sampleRate = 44100;
  const seconds = 52;
  const Offline: typeof OfflineAudioContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const off = new Offline(2, sampleRate * seconds, sampleRate);

  const master = off.createGain();
  master.gain.value = 0.0;
  master.gain.setValueAtTime(0.0, 0);
  master.gain.linearRampToValueAtTime(0.7, 2.0);
  master.gain.setValueAtTime(0.7, seconds - 3);
  master.gain.linearRampToValueAtTime(0.0, seconds);

  // gentle lowpass for warmth
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  lp.Q.value = 0.4;
  lp.connect(master);
  master.connect(off.destination);

  const chordDur = 6.5; // seconds per chord
  let t = 0.5;
  let chordIdx = 0;
  while (t < seconds - 2) {
    const chord = CHORDS[chordIdx % CHORDS.length];
    // arpeggiate the chord over the chord duration, then let it ring
    const notes = chord.length;
    const step = (chordDur * 0.7) / notes;
    for (let n = 0; n < notes; n++) {
      const start = t + n * step;
      const freq = chord[n];
      // two slightly detuned voices per note for warmth
      for (let v = 0; v < 2; v++) {
        const osc = off.createOscillator();
        osc.type = v === 0 ? "triangle" : "sine";
        osc.frequency.value = freq;
        osc.detune.value = (v === 0 ? -4 : 5) + (Math.random() - 0.5) * 3;
        const g = off.createGain();
        const peak = (v === 0 ? 0.16 : 0.1) * (1 - n * 0.06);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0002, start + 3.2);
        osc.connect(g);
        g.connect(lp);
        osc.start(start);
        osc.stop(start + 3.4);
      }
    }
    t += chordDur;
    chordIdx++;
  }

  return off.startRendering().then((buffer) => ({
    buffer,
    real: false,
    title: "demo arpeggio (A natural minor)",
    label: "source: demo (his album unreachable)",
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
