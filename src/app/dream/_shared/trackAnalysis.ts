// ─────────────────────────────────────────────────────────────────────────────
// _shared/trackAnalysis.ts — pull the musical analysis for one of Karel's tracks.
//
// `/api/recordings/[id]/analysis` returns rich, anon-readable data for any of his
// public recordings: key + tempo, the full note roll (MIDI pitch / time / dur /
// velocity), the chord progression, "idea" events, and a prose section summary.
// This is what lets a proto explore the COMPOSITION — harmony, melody, form —
// not just the raw waveform. Pair it with `loadRealTrackBuffer` for audio.
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackNote {
  /** MIDI note number (21..108 on a piano). */
  midi: number;
  /** onset time in seconds. */
  time: number;
  duration: number;
  /** 0..127. */
  velocity: number;
}

export interface TrackChord {
  time: number;
  /** chord symbol, e.g. "A#maj9/F". */
  chord: string;
  duration: number;
}

export interface TrackEvent {
  time: number;
  type: string;
  label: string;
  intensity: number;
}

export interface TrackSection {
  label: string;
  description: string;
}

export interface TrackSummary {
  overview?: string;
  sections?: TrackSection[];
  key_center?: string;
  harmonic_highlights?: string;
  chord_vocabulary?: string;
  rhythm_and_feel?: string;
  [k: string]: unknown;
}

export interface TrackAnalysis {
  key_signature: string | null;
  tempo: number | null;
  time_signature: string | null;
  notes: TrackNote[];
  chords: TrackChord[];
  events: TrackEvent[];
  summary: TrackSummary | null;
}

/**
 * Fetch + normalize the analysis for a recording id. Returns null if the track
 * has no public analysis. Notes and chords come back **time-sorted** so callers
 * can walk them against playback position directly.
 */
export async function loadTrackAnalysis(
  id: string,
): Promise<TrackAnalysis | null> {
  let raw: Record<string, unknown>;
  try {
    const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/analysis`);
    if (!res.ok) return null;
    raw = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || raw.error) return null;

  const notes = (Array.isArray(raw.notes) ? raw.notes : []) as TrackNote[];
  const chords = (Array.isArray(raw.chords) ? raw.chords : []) as TrackChord[];
  const events = (Array.isArray(raw.events) ? raw.events : []) as TrackEvent[];

  notes.sort((a, b) => a.time - b.time);
  chords.sort((a, b) => a.time - b.time);
  events.sort((a, b) => a.time - b.time);

  return {
    key_signature: (raw.key_signature as string | null) ?? null,
    tempo: (raw.tempo as number | null) ?? null,
    time_signature: (raw.time_signature as string | null) ?? null,
    notes,
    chords,
    events,
    summary: (raw.summary as TrackSummary | null) ?? null,
  };
}

// ── chord + key helpers ─────────────────────────────────────────────────────

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};

/** Root pitch-class (0..11) of a chord symbol, or null if unparseable. */
export function chordRoot(symbol: string): number | null {
  const m = symbol.match(/^([A-Ga-g])([#b]?)/);
  if (!m) return null;
  const key = (m[1].toUpperCase() + (m[2] === "b" ? "B" : m[2])).toUpperCase();
  const pc = PITCH_CLASS[key];
  return pc === undefined ? null : pc;
}

/** True when the chord reads as minor / diminished (a "darker" color). */
export function chordIsMinor(symbol: string): boolean {
  const body = symbol.replace(/^[A-Ga-g][#b]?/, "");
  return /^m(?!aj)/.test(body) || /dim|°/.test(body);
}

/**
 * Map a pitch-class to a stable hue (0..360) around the circle of fifths, so
 * harmonically-near keys sit near each other in color. Warm-anchored to match
 * the house palette (C ≈ amber).
 */
export function pitchClassHue(pc: number): number {
  const fifth = (pc * 7) % 12; // circle-of-fifths index
  return (30 + fifth * 30) % 360;
}
