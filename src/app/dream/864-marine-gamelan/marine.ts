// marine.ts — live sea-state data subsystem.
//
// We call the keyless, CORS-enabled Open-Meteo Marine API DIRECTLY from the
// browser (no Next.js API route, no server code). If that fails for any
// reason — offline, blocked, CORS, parse error — we synthesize a believable,
// per-preset evolving sea so the piece is ALWAYS sounding and animating.
//
// The single output is a `SeaDrive` signal object that BOTH the audio engine
// and the WebGL2 shader read, so sound and image can never disagree.

export interface Preset {
  id: string;
  label: string;
  lat: number;
  lng: number;
  // baseline roughness (0..1) for the synthetic fallback — different per sea.
  synthBase: number;
}

export const PRESETS: Preset[] = [
  { id: "oahu", label: "Oahu North Shore", lat: 21.66, lng: -158.06, synthBase: 0.42 },
  { id: "biscay", label: "Bay of Biscay", lat: 45.5, lng: -5.0, synthBase: 0.58 },
  { id: "drake", label: "Drake Passage", lat: -58.0, lng: -64.0, synthBase: 0.86 },
  { id: "maldives", label: "Maldives", lat: 3.2, lng: 73.0, synthBase: 0.18 },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

// Normalized drive signal — the one object the whole piece reads.
export interface SeaDrive {
  roughness: number; // 0..1, from wave_height (clamp height/6)
  period: number; // seconds (wave period)
  direction: number; // degrees (0..360), wave direction
  swell: number; // 0..1, swell energy (height * period contribution)
}

export interface SeaState {
  drive: SeaDrive;
  waveHeight: number; // raw meters (for the HUD meter)
  source: "live" | "simulated";
  ts: number; // ms epoch when produced
}

// ── Open-Meteo response typing ───────────────────────────────────────────
interface MarineCurrent {
  time?: string;
  wave_height?: number | null;
  wave_period?: number | null;
  wave_direction?: number | null;
  swell_wave_height?: number | null;
  swell_wave_period?: number | null;
}
interface MarineResponse {
  current?: MarineCurrent | null;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function marineUrl(p: Preset): string {
  const params = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lng),
    current:
      "wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period",
    timezone: "auto",
  });
  return `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;
}

// Turn raw marine fields into the normalized drive signal.
export function seaToDrive(c: MarineCurrent): SeaDrive {
  const waveHeight = Number(c.wave_height ?? 0) || 0;
  const period = Number(c.wave_period ?? 0) || 8;
  const direction = Number(c.wave_direction ?? 0) || 0;
  const swellHeight = Number(c.swell_wave_height ?? 0) || 0;
  const swellPeriod = Number(c.swell_wave_period ?? 0) || period;

  // roughness: clamp(height / 6). 6m+ seas read as fully rough.
  const roughness = clamp01(waveHeight / 6);
  // swell energy: long-period swell with real height → big underlying drone.
  const swell = clamp01((swellHeight / 4) * 0.6 + (swellPeriod / 16) * 0.4);

  return {
    roughness,
    period: Math.max(2, period),
    direction: ((direction % 360) + 360) % 360,
    swell,
  };
}

/**
 * Fetch live sea-state for a preset. Resolves to a SeaState on success or
 * null on any failure. Abortable via the supplied signal; times out itself.
 */
export async function fetchSea(
  p: Preset,
  signal: AbortSignal,
  timeoutMs = 8000,
): Promise<SeaState | null> {
  if (typeof fetch !== "function") return null;
  const timer = setTimeout(() => {
    // Only abort our own attempt; the caller's signal still works too.
    inner.abort();
  }, timeoutMs);
  const inner = new AbortController();
  // Chain the external signal into our inner controller.
  const onAbort = () => inner.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(marineUrl(p), {
      signal: inner.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MarineResponse;
    const cur = json.current;
    if (!cur) return null;
    const drive = seaToDrive(cur);
    return {
      drive,
      waveHeight: Number(cur.wave_height ?? 0) || 0,
      source: "live",
      ts: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Synthetic fallback: a believable evolving sea, seeded by the preset's
 * baseline roughness so Drake Passage stays stormy and the Maldives stay
 * calm. `t` is seconds (any monotonic clock) so successive calls drift.
 */
export function makeSyntheticSea(p: Preset, t: number): SeaState {
  const base = p.synthBase;
  // Slow swell envelope + faster chop, both bounded so seas stay in-character.
  const slow = Math.sin(t * 0.05 + p.lat) * 0.5 + 0.5; // 0..1, ~125s period
  const chop = Math.sin(t * 0.23 + p.lng) * 0.5 + 0.5; // 0..1, faster
  const roughness = clamp01(base + (slow - 0.5) * 0.22 + (chop - 0.5) * 0.1);
  // wave height implied by roughness (inverse of clamp height/6).
  const waveHeight = roughness * 6;
  // calmer seas → longer, lazier period; rough seas → shorter, choppier.
  const period = 12 - roughness * 6 + Math.sin(t * 0.07) * 1.2;
  // direction slowly rotates so the visual drift and pan keep moving.
  const direction = (t * 6 + p.lng * 2) % 360;
  const swell = clamp01(base * 0.7 + (slow - 0.5) * 0.3);

  return {
    drive: {
      roughness,
      period: Math.max(2, period),
      direction: (direction + 360) % 360,
      swell,
    },
    waveHeight,
    source: "simulated",
    ts: Date.now(),
  };
}
