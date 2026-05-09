/**
 * Resolve an audio API URL to a playable audio URL.
 *
 * The `/api/audio/{id}` endpoint returns JSON with a signed Supabase URL.
 * This function fetches that JSON and returns the actual audio URL.
 * For non-API URLs, returns the URL as-is.
 */

// 5-minute cache, NOT 50-minute. The API endpoint is fast (<200ms) and
// re-resolving frequently is essentially free. Long TTL bit us when:
//   1. A recording was uploaded as ALAC, the auto-transcode persisted
//      an AAC sibling in the background, but the user's browser kept
//      using the cached ALAC URL for up to 50 minutes — Safari macOS
//      then played the ALAC bytes inconsistently and audio didn't
//      come through.
//   2. A signed URL might have <10 min validity left when the cache
//      hits a near-expiry boundary, leading to mid-playback 403s.
// 5 min is plenty to skip refetches during a single page session,
// short enough to recover from any server-side codec change in
// reasonable time.
const URL_CACHE_TTL_MS = 5 * 60 * 1000;

/** Force-clear a cached URL (e.g., after the audio element fires an
 *  error — the cached URL might be pointing at a stale codec or an
 *  expired signature). Next resolveAudioUrl call will re-fetch. */
export function clearCachedUrl(recordingId: string): void {
  try {
    sessionStorage.removeItem(`audio-url-${recordingId}`);
  } catch { /* ok */ }
}

function isChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg|OPR|Brave/i.test(ua) && !/Safari/i.test(ua) === false;
}

export function getCachedUrl(recordingId: string): string | null {
  try {
    const raw = sessionStorage.getItem(`audio-url-${recordingId}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > URL_CACHE_TTL_MS) {
      sessionStorage.removeItem(`audio-url-${recordingId}`);
      return null;
    }
    return entry.url;
  } catch {
    return null;
  }
}

function setCachedUrl(recordingId: string, url: string): void {
  try {
    sessionStorage.setItem(
      `audio-url-${recordingId}`,
      JSON.stringify({ url, timestamp: Date.now() })
    );
  } catch {}
}

export async function resolveAudioUrl(
  audioUrl: string,
  recordingId?: string,
  options?: { asBlob?: boolean }
): Promise<string> {
  if (recordingId) {
    const cached = getCachedUrl(recordingId);
    if (cached && !options?.asBlob) return cached;
  }

  let signedUrl: string | null = null;

  if (audioUrl.startsWith("/api/")) {
    try {
      const res = await fetch(audioUrl);
      const data = await res.json();
      if (data.url) {
        if (data.hasAac || (data.codec && data.codec !== "alac")) {
          signedUrl = data.url;
        } else if (data.codec === "alac" && isChromium()) {
          signedUrl = audioUrl + "?transcode=1";
        } else {
          signedUrl = data.url;
        }
      }
    } catch {
      // fall through
    }
    if (!signedUrl) signedUrl = audioUrl + "?transcode=1";
  } else {
    signedUrl = audioUrl;
  }

  // Blob-based loading: fetch the full audio file once, return a
  // blob: URL. Used in installation mode where reliability of
  // playthrough matters more than memory footprint — eliminates
  // every flavor of streaming flake (range request failure, browser
  // partial-buffer cache poisoning, mid-playback signed-URL
  // expiration). Pays a 3-5s upfront fetch cost on a 17MB WAV;
  // happens behind the intro overlay where it's invisible.
  if (options?.asBlob) {
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`audio fetch ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      // Cache the object URL too so re-loads within the journey
      // don't re-fetch. Object URLs are scoped to the document,
      // last until revoked or unload.
      if (recordingId) setCachedUrl(recordingId, objectUrl);
      return objectUrl;
    } catch {
      // Fall back to streaming the signed URL.
      if (recordingId) setCachedUrl(recordingId, signedUrl);
      return signedUrl;
    }
  }

  if (recordingId) setCachedUrl(recordingId, signedUrl);
  return signedUrl;
}
