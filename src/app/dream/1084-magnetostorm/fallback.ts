// ─────────────────────────────────────────────────────────────────────────────
// fallback.ts — a bundled, modeled space-weather arc used when the LIVE NOAA
// SWPC fetch fails (network down / CORS / offline review). The piece MUST run
// and sound/look great regardless of connectivity, so this stands in.
//
// This is a plausible ~60-sample substorm arc (not real data): a quiet solar
// wind that erupts as Bz turns strongly southward — speed climbs 400→650 km/s,
// density spikes, |B| rises, and Kp climbs from ~2 to ~6 (a G2-class storm).
// The instrument reads the NEWEST sample, so we advance an index once per poll
// to let the offline mode audibly + visibly *build* like a live storm would.
// ─────────────────────────────────────────────────────────────────────────────

import type { Drivers } from "./data";

/** One modeled sample = the same shape the live reducer produces. */
export const FALLBACK_ARC: Drivers[] = buildArc();

function buildArc(): Drivers[] {
  const arc: Drivers[] = [];
  const N = 60;
  const start = Date.parse("2026-06-30T09:00:00Z");
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0..1 across the arc
    // A storm that ramps in over the middle third then eases.
    const storm = Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.15)));
    const wobble = 0.5 + 0.5 * Math.sin(t * 22);

    const speed = 400 + 250 * storm + 18 * (wobble - 0.5);
    const density = 4 + 16 * storm * (0.6 + 0.4 * wobble);
    const temperature = 90000 + 380000 * storm;
    // Bz swings strongly southward at the peak of the storm.
    const bz = 2 - 18 * storm - 4 * (wobble - 0.5);
    const bt = 4 + 14 * storm + 3 * (wobble - 0.5);
    const kp = 2 + 4 * storm;

    const ts = new Date(start + i * 60_000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    arc.push({
      speed: Math.round(speed * 10) / 10,
      density: Math.round(density * 100) / 100,
      temperature: Math.round(temperature),
      bz: Math.round(bz * 100) / 100,
      bt: Math.round(bt * 100) / 100,
      kp: Math.round(kp * 100) / 100,
      timestamp: ts,
    });
  }
  return arc;
}
