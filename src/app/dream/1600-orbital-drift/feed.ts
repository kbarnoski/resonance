// feed.ts — the live ISS position feed with a hard fallback.
//
// Tries wheretheiss.at (public, CORS-friendly, no auth); falls back to
// open-notify. On any failure — offline, CORS, headless, timeout — it simply
// reports null and the caller keeps running the deterministic propagator. The
// piece is therefore never blank and never silent regardless of network.
//
// We deliberately read only NUMBERS off the JSON (latitude, longitude,
// velocity, altitude). The feed's own `timestamp` is ignored — the lab forbids
// constructing wall-clock objects, and we key everything off performance.now anyway.

export interface IssSample {
  lat: number;
  lon: number;
  velocityKmh: number;
  altitudeKm: number;
}

interface WtiaShape {
  latitude?: number;
  longitude?: number;
  velocity?: number;
  altitude?: number;
}
interface OpenNotifyShape {
  iss_position?: { latitude?: string; longitude?: string };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(id);
  }
}

/** One poll. Returns a sample on success, null on any failure. */
export async function pollIss(): Promise<IssSample | null> {
  // Primary: wheretheiss.at — richest payload (velocity + altitude).
  try {
    const r = await fetchWithTimeout(
      "https://api.wheretheiss.at/v1/satellites/25544",
      3500,
    );
    if (r.ok) {
      const j = (await r.json()) as WtiaShape;
      const lat = num(j.latitude);
      const lon = num(j.longitude);
      if (lat !== null && lon !== null) {
        return {
          lat,
          lon,
          velocityKmh: num(j.velocity) ?? 27600,
          altitudeKm: num(j.altitude) ?? 420,
        };
      }
    }
  } catch {
    // fall through to the backup source
  }

  // Backup: open-notify (position only).
  try {
    const r = await fetchWithTimeout(
      "https://api.open-notify.org/iss-now.json",
      3500,
    );
    if (r.ok) {
      const j = (await r.json()) as OpenNotifyShape;
      const lat = num(j.iss_position?.latitude);
      const lon = num(j.iss_position?.longitude);
      if (lat !== null && lon !== null) {
        return { lat, lon, velocityKmh: 27600, altitudeKm: 420 };
      }
    }
  } catch {
    // give up — caller stays on the propagator
  }

  return null;
}
