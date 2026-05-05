/**
 * Pre-baked fallback image library — keeps the visualizer alive when
 * fal.ai is unreachable (network outage, fal incident, cost cap hit).
 *
 * Operator workflow:
 *   1. Drop pre-rendered images into /public/installation-fallback/<journey-id>/
 *   2. Generate a manifest at /public/installation-fallback/manifest.json
 *      with shape: { "<journey-id>": ["/installation-fallback/<journey-id>/01.jpg", ...] }
 *   3. Kiosk fetches manifest once at boot. When the realtime service
 *      starts stalling (3+ REST failures in a row), this picks a
 *      random image from the journey's bucket so the display stays
 *      alive with on-character imagery instead of freezing.
 *
 * If the manifest is missing or empty, fallback no-ops — kiosk
 * continues to freeze on the last successful frame as before.
 */

interface FallbackManifest {
  [journeyId: string]: string[];
}

let _manifestPromise: Promise<FallbackManifest> | null = null;
const _recentlyServed = new Map<string, Set<number>>();

async function loadManifest(): Promise<FallbackManifest> {
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    try {
      const res = await fetch("/installation-fallback/manifest.json", { cache: "force-cache" });
      if (!res.ok) return {};
      const json = await res.json();
      return (json && typeof json === "object" ? json : {}) as FallbackManifest;
    } catch {
      return {};
    }
  })();
  return _manifestPromise;
}

/** Pick a random fallback image URL for the given journey, avoiding
 *  the last few we served so the same frame doesn't appear twice in
 *  a row. Returns null if no fallback library exists for the journey. */
export async function pickFallbackImage(journeyId: string | null): Promise<string | null> {
  if (!journeyId) return null;
  const manifest = await loadManifest();
  const bucket = manifest[journeyId];
  if (!bucket || bucket.length === 0) return null;

  let recent = _recentlyServed.get(journeyId);
  if (!recent) {
    recent = new Set();
    _recentlyServed.set(journeyId, recent);
  }
  // If we've served everything in the bucket recently, reset the
  // memory so we cycle again.
  const cooldown = Math.max(1, Math.min(bucket.length - 1, Math.floor(bucket.length / 2)));
  if (recent.size >= cooldown) {
    recent.clear();
  }
  // Pick a random index that hasn't been served recently.
  const candidates = bucket.map((_, i) => i).filter((i) => !recent!.has(i));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  recent.add(pick);
  return bucket[pick] ?? null;
}

/** Reset the per-journey recently-served memory — call on journey
 *  change so a fresh journey starts with full bucket choice. */
export function resetFallbackMemory(): void {
  _recentlyServed.clear();
}
