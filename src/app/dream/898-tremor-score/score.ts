// score.ts — turn a list of earthquakes into a timed sequence of musical events.
// The DATA decides FORM (who plays, when, in what register). A fixed consonant
// mode keeps every pitch in tune. Data never maps to detune or roughness.

export interface Quake {
  mag: number; // magnitude
  time: number; // ms epoch
  place: string;
  lon: number; // -180..180
  lat: number; // -90..90
  depth: number; // km
}

export interface ScoreEvent {
  /** seconds from start of playback */
  at: number;
  /** seconds the voice sounds for */
  dur: number;
  /** fundamental frequency (Hz), quantised to the mode */
  freq: number;
  /** linear gain 0..1 of this voice */
  gain: number;
  /** -1..1 stereo pan, from longitude */
  pan: number;
  /** lowpass cutoff Hz, from depth (shallow = bright) */
  cutoff: number;
  /** number of partials (1..4), shallow quakes are richer */
  partials: number;
  /** source quake (for the visual score) */
  q: Quake;
  /** normalised x position 0..1 on the time axis */
  x: number;
  /** normalised y position 0..1 (0 = high register top, 1 = low bottom) */
  y: number;
}

export interface BuiltScore {
  events: ScoreEvent[];
  duration: number; // total seconds of the piece
  quakes: Quake[];
}

// A two-octave consonant mode. We use a B-flat pentatonic-ish / Dorian blend
// that always sounds warm. Latitude selects the scale degree, magnitude the
// octave, so the data picks notes that are guaranteed to be in the mode.
// Frequencies (Hz) ascending. Low register first.
const MODE: number[] = [
  // low octave
  87.31, // F2
  98.0, // G2
  116.54, // A#2 / Bb2
  130.81, // C3
  146.83, // D3
  174.61, // F3
  196.0, // G3
  // mid octave
  233.08, // Bb3
  261.63, // C4
  293.66, // D4
  349.23, // F4
  392.0, // G4
  466.16, // Bb4
  523.25, // C5
  // high octave (glints)
  587.33, // D5
  698.46, // F5
  783.99, // G5
  932.33, // Bb5
  1046.5, // C6
];

const PIECE_SECONDS = 90; // compress 24h -> 90s

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Parse a raw USGS GeoJSON feature collection into our Quake shape. */
export function parseFeed(json: unknown): Quake[] {
  const fc = json as {
    features?: Array<{
      properties?: { mag?: number | null; time?: number; place?: string };
      geometry?: { coordinates?: number[] };
    }>;
  };
  const feats = fc.features ?? [];
  const out: Quake[] = [];
  for (const f of feats) {
    const mag = f.properties?.mag;
    const coords = f.geometry?.coordinates;
    if (mag == null || !coords || coords.length < 3) continue;
    out.push({
      mag,
      time: f.properties?.time ?? 0,
      place: f.properties?.place ?? "unknown",
      lon: coords[0],
      lat: coords[1],
      depth: coords[2],
    });
  }
  return out;
}

/**
 * Build a deterministic score from quakes.
 * Temporal clustering of quakes -> density (we keep real spacing, compressed),
 * so a swarm of aftershocks becomes a dense overlapping flurry and a quiet
 * stretch becomes a sparse solo.
 */
export function buildScore(raw: Quake[]): BuiltScore {
  const quakes = raw
    .filter((q) => Number.isFinite(q.mag) && Number.isFinite(q.time))
    .sort((a, b) => a.time - b.time);

  if (quakes.length === 0) {
    return { events: [], duration: PIECE_SECONDS, quakes: [] };
  }

  const t0 = quakes[0].time;
  const t1 = quakes[quakes.length - 1].time;
  const span = Math.max(1, t1 - t0);

  const events: ScoreEvent[] = quakes.map((q) => {
    const frac = (q.time - t0) / span; // 0..1 across the real window
    const at = frac * PIECE_SECONDS;

    // magnitude -> register & loudness & duration.
    // big quake = low octave + long + loud; small = high glint.
    const m = clamp(q.mag, -1, 8);
    const magNorm = clamp((m + 1) / 9, 0, 1); // 0..1
    const lowness = magNorm; // 1 = lowest

    // latitude -> scale degree (within an octave band)
    const latNorm = clamp((q.lat + 90) / 180, 0, 1);
    const degInOctave = Math.floor(latNorm * 6.999); // 0..6

    // choose an octave band from magnitude: big = low band, small = high band
    let band: number;
    if (lowness > 0.66) band = 0;
    else if (lowness > 0.33) band = 7;
    else band = 12;
    let idx = band + degInOctave;
    idx = clamp(idx, 0, MODE.length - 1);
    const freq = MODE[idx];

    // depth -> brightness. shallow (small depth) = bright + more partials.
    const depthNorm = clamp(q.depth / 600, 0, 1); // 0 shallow .. 1 deep
    const cutoff = 600 + (1 - depthNorm) * 5200; // 600..5800 Hz
    const partials = 1 + Math.round((1 - depthNorm) * 3); // 1..4

    // longitude -> pan
    const pan = clamp(q.lon / 180, -1, 1);

    // loudness: bigger = louder, but keep headroom; small glints quiet.
    const gain = 0.05 + magNorm * 0.28;

    // duration: big quakes ring out, small ones are brief.
    const dur = 0.35 + lowness * 5.5;

    return {
      at,
      dur,
      freq,
      gain,
      pan,
      cutoff,
      partials,
      q,
      x: frac,
      y: idx / (MODE.length - 1), // 0 top(low idx) .. but we want low pitch low
    };
  });

  // y for the visual: low pitch should sit low on screen. idx 0 = lowest pitch.
  // Map so high pitch (high idx) -> small y (top), low pitch -> large y (bottom).
  for (const e of events) {
    e.y = 1 - e.y;
  }

  return { events, duration: PIECE_SECONDS, quakes };
}

/** A built-in synthetic fallback so the piece always plays, even offline. */
export function buildFallbackQuakes(): Quake[] {
  // ~30 fake quakes: a couple of big deep ones, a swarm of shallow aftershocks,
  // some scattered small glints. Times span ~24h.
  const now = 1_700_000_000_000; // fixed epoch for determinism
  const day = 24 * 3600 * 1000;
  const out: Quake[] = [];

  const push = (
    hrAgo: number,
    mag: number,
    lon: number,
    lat: number,
    depth: number,
    place: string,
  ) => {
    out.push({ mag, time: now - hrAgo * 3600 * 1000, place, lon, lat, depth });
  };

  // opening: a couple of sparse small ones
  push(23.6, 1.4, -118.4, 34.0, 8, "Southern California");
  push(22.1, 2.0, 142.5, 38.3, 30, "near the east coast of Honshu, Japan");
  push(20.4, 1.1, -155.3, 19.4, 4, "Island of Hawaii");

  // a deep, big one — the low pedal
  push(18.0, 6.2, -71.6, -33.4, 110, "offshore Valparaiso, Chile");

  // a quiet stretch
  push(15.5, 2.4, 25.1, 38.9, 12, "Aegean Sea");
  push(14.2, 1.8, -122.8, 40.3, 6, "Northern California");

  // aftershock swarm — dense flurry over ~40 min
  const swarmStartHr = 11.5;
  for (let i = 0; i < 14; i++) {
    const hr = swarmStartHr - i * 0.05;
    const mag = 1.0 + (i % 4) * 0.45;
    const lon = 142.0 + (i % 5) * 0.6;
    const lat = 38.0 + (i % 3) * 0.4;
    push(hr, mag, lon, lat, 10 + (i % 6) * 5, "aftershock, off Honshu");
  }

  // a second big shallow event — bright + long
  push(7.5, 5.5, 95.9, 3.3, 22, "off the west coast of Sumatra");

  // closing scatter of high glints
  push(5.0, 1.3, -150.1, 61.2, 5, "Southern Alaska");
  push(3.8, 0.9, -116.9, 33.0, 3, "Southern California");
  push(2.5, 1.6, 13.4, 42.6, 9, "Central Italy");
  push(1.2, 2.1, 178.4, -17.8, 540, "Fiji region (deep)");
  push(0.4, 1.0, -67.1, 18.0, 7, "Puerto Rico region");

  void day; // keep span generous if extended later
  return out.sort((a, b) => a.time - b.time);
}
