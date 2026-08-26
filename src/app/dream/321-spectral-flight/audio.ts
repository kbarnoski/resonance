// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — source pipeline for the spectral flight.
// Loads Karel's real "Welcome Home" title track through the shared welcomeHome
// helper (verified recording id → /api/audio signed URL, anon-playable) and
// decodes it into an AudioBuffer. Throws on any failure so the page shows its
// error state — the flight only ever flies through his real recording, never a
// silent synth stand-in.
// ─────────────────────────────────────────────────────────────────────────────

import {
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";

export interface SourceResult {
  buffer: AudioBuffer;
  /** always true — this piece only plays Karel's real recording */
  real: boolean;
  /** track title */
  title: string;
  label: string;
}

/** The album's title track — the recording the flight was designed around. */
const FLIGHT_TRACK =
  WELCOME_HOME_TRACKS.find((t) => t.title === "Welcome Home") ??
  WELCOME_HOME_TRACKS[0];

/**
 * Resolve the audio source: Karel's real recording, fetched and decoded.
 * Throws when the track can't be reached/decoded; the caller surfaces its
 * error UI instead of quietly substituting synthesis.
 */
export async function resolveSource(ctx: AudioContext): Promise<SourceResult> {
  const { buffer, title } = await loadRealTrackBuffer(ctx, FLIGHT_TRACK.id);
  return {
    buffer,
    real: true,
    title,
    label: `source: Karel's recording — ${title}`,
  };
}
