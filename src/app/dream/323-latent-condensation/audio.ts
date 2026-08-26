// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — source pipeline for "Latent Condensation".
// Loads one of Karel's real "Welcome Home" tracks through the shared
// welcomeHome helper (verified recording id → /api/audio signed URL,
// anon-playable) and decodes it into an AudioBuffer. Throws on any failure so
// the page shows its error state — the cloud is only ever condensed by his
// real piano, never a silent synth stand-in.
// ─────────────────────────────────────────────────────────────────────────────

import {
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";

export interface SourceResult {
  buffer: AudioBuffer;
  /** always true — the piece runs on Karel's real recording */
  real: boolean;
  /** track title */
  title: string;
}

/**
 * Resolve the audio source: Karel's real recording, fetched and decoded.
 * Throws when the track can't be reached/decoded; the caller surfaces its
 * error UI instead of quietly substituting synthesis.
 */
export async function resolveSource(ctx: AudioContext): Promise<SourceResult> {
  const { buffer, title } = await loadRealTrackBuffer(
    ctx,
    WELCOME_HOME_TRACKS[0].id,
  );
  return { buffer, real: true, title };
}
