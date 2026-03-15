/**
 * Resolve an audio API URL to a playable audio URL.
 *
 * The `/api/audio/{id}` endpoint returns JSON with a signed Supabase URL.
 * This function fetches that JSON and returns the actual audio URL.
 * For non-API URLs, returns the URL as-is.
 */

const URL_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

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
  recordingId?: string
): Promise<string> {
  if (recordingId) {
    const cached = getCachedUrl(recordingId);
    if (cached) return cached;
  }

  if (!audioUrl.startsWith("/api/")) return audioUrl;

  try {
    const res = await fetch(audioUrl);
    const data = await res.json();

    if (data.url) {
      if (data.hasAac || (data.codec && data.codec !== "alac")) {
        if (recordingId) setCachedUrl(recordingId, data.url);
        return data.url;
      }
      if (data.codec === "alac" && isChromium()) {
        return audioUrl + "?transcode=1";
      }
      // Default: use the signed URL directly
      if (recordingId) setCachedUrl(recordingId, data.url);
      return data.url;
    }
  } catch {
    // fall through
  }

  return audioUrl + "?transcode=1";
}
