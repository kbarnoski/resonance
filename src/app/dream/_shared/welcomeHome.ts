// ─────────────────────────────────────────────────────────────────────────────
// _shared/welcomeHome.ts — the canonical way to play Karel's REAL music inside a
// dream prototype.
//
// Karel's "Welcome Home" album (13 solo-piano pieces, written through Covid) is
// already public with NO login: every track is attached to the shared journey
// path `d2c79111528a46cf`, so `/api/audio/[recording_id]` will hand an anonymous
// visitor a short-lived signed URL to the real audio. That is the ONLY sanctioned
// audio you should reach for when a proto wants genuine music instead of a synth.
//
// Prefer this helper over hitting `/api/featured` — that endpoint reads a
// separate `featured_albums` table which is currently empty, so it silently
// falls back to synth. The recording IDs below are the ones that actually play.
//
// Always route the resulting buffer through `_shared/visionary/safeMaster` before
// the speakers, same as every other audible piece.
// ─────────────────────────────────────────────────────────────────────────────

/** Public shared-path token the album's tracks hang off of (anon-playable). */
export const WELCOME_HOME_SHARE_TOKEN = "d2c79111528a46cf";

export interface WelcomeHomeTrack {
  /** recordings.id — feed straight to /api/audio/[id]. */
  id: string;
  title: string;
}

/** The album in running order. IDs verified live-servable to anon clients. */
export const WELCOME_HOME_TRACKS: readonly WelcomeHomeTrack[] = [
  { id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", title: "Interplay" },
  { id: "eba95845-cdbf-41d8-9c5d-8679686811ad", title: "Bath" },
  { id: "8dafed88-4761-4dd3-a0f4-93f310441093", title: "Welcome Home" },
  { id: "aaaa7e9a-a3ac-4cad-9390-6720555f00a7", title: "The Knife" },
  { id: "1f0a541e-df60-44a9-b839-5dc69a007d9f", title: "2019" },
  { id: "72151c23-f1a0-460f-b2ba-8909b8278e43", title: "The Knife (Jam)" },
  { id: "7816dc66-794b-4fb1-8796-c2ef00c3f943", title: "Playa" },
  { id: "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", title: "Isolation" },
  { id: "788fc202-db77-4f36-a7ff-dd0b6702ca20", title: "Rebound" },
  { id: "c3ae569c-bda3-47b2-8f8d-63cd708e2c2f", title: "Stir Crazy" },
  { id: "d2eeee58-832b-4872-a4be-8fbf030b981d", title: "Rolling" },
  { id: "8a67fc03-181f-46a8-beaa-65468506c920", title: "Quarantine" },
  { id: "eda30871-c82c-45c4-b352-b158c00528fa", title: "All Together" },
] as const;

/**
 * Karel's **Snowflake** EP — three improvised piano recordings tracing an arc
 * from stillness, through fire, into light. Same deal: attached to a shared
 * journey path, so `/api/audio/[id]` serves them to anon clients (verified).
 */
export const SNOWFLAKE_TRACKS: readonly WelcomeHomeTrack[] = [
  { id: "734a09ce-84df-4f1f-93c1-11b08d303681", title: "Snowflake" },
  { id: "6f58d401-1cd0-479e-a252-5d34dc636e3d", title: "Realized" },
  { id: "549fc519-f7fc-4c38-a771-adaad2edbc81", title: "Ghost" },
] as const;

/** Every anon-servable real track, across all of Karel's shared albums. */
export const REAL_TRACKS: readonly WelcomeHomeTrack[] = [
  ...WELCOME_HOME_TRACKS,
  ...SNOWFLAKE_TRACKS,
];

export interface WelcomeHomeBuffer {
  buffer: AudioBuffer;
  title: string;
  id: string;
}

/**
 * Fetch + decode one real track (Welcome Home or Snowflake) into an AudioBuffer.
 *
 * `/api/audio/[id]` normally answers with JSON `{ url }` (a signed storage URL),
 * but can also stream raw bytes on the transcode path — both are handled.
 *
 * Pass a specific `id` (from REAL_TRACKS), or omit it to take the first Welcome
 * Home track. Throws on any failure so the caller can decide whether to surface
 * an error or fall back to a synth bed.
 */
export async function loadRealTrackBuffer(
  ctx: BaseAudioContext,
  id: string = WELCOME_HOME_TRACKS[0].id,
): Promise<WelcomeHomeBuffer> {
  const title = REAL_TRACKS.find((t) => t.id === id)?.title ?? "Welcome Home";

  const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`audio ${id}: HTTP ${res.status}`);

  let bytes: ArrayBuffer;
  const ctype = res.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const j = (await res.json()) as { url?: string };
    if (!j.url) throw new Error(`audio ${id}: no signed url`);
    const ar = await fetch(j.url);
    if (!ar.ok) throw new Error(`audio ${id}: signed url HTTP ${ar.status}`);
    bytes = await ar.arrayBuffer();
  } else {
    bytes = await res.arrayBuffer();
  }

  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  return { buffer, title, id };
}
