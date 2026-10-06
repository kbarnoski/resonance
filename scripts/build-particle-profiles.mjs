#!/usr/bin/env node
// build-particle-profiles.mjs — bakes the compact v2 deep-analysis profile of
// EVERY journey into src/lib/journeys/particle-profiles.generated.ts so the
// particle conductor works OFFLINE on the kiosk and casting is reviewable.
//
// Order = the kiosk loop (TRAMOKYO_SETLIST) first, then every other DB
// journey, then paired built-ins — castSet() keeps loop neighbours distinct.
//
// Frozen analyses (Snowflake / Realized / Ghost / Kinetic Lab) are read from
// scripts/deep-analysis-protected.json — never from or to the DB. This script
// only READS the database.
//
// Usage: node scripts/build-particle-profiles.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";

const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { TRAMOKYO_SETLIST } = await jiti.import(path.join(root, "src/lib/journeys/installation-sequence.ts"));
const { JOURNEYS } = await jiti.import(path.join(root, "src/lib/journeys/journeys.ts"));
const { PAIRED_TRACKS } = await jiti.import(path.join(root, "src/lib/journeys/paired-tracks.ts"));

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PROTECTED = JSON.parse(readFileSync("scripts/deep-analysis-protected.json", "utf8"));

const r2 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : x);

// ── candidate journeys ──────────────────────────────────────────────────────
const { data: dbJourneys, error } = await sb.from("journeys").select("id,name,recording_id,theme,phases").limit(2000);
if (error) throw error;
const byId = new Map(dbJourneys.map((j) => [j.id, j]));

async function builtinRecording(id) {
  const spec = PAIRED_TRACKS[id];
  if (!spec) return null;
  let q = sb.from("recordings").select("id,title");
  q = spec.startsWith("=") ? q.eq("title", spec.slice(1)) : q.ilike("title", spec);
  const { data } = await q.limit(1);
  return data?.[0]?.id ?? null;
}

const order = [];
const seen = new Set();
const add = (id) => { if (!seen.has(id)) { seen.add(id); order.push(id); } };
for (const id of TRAMOKYO_SETLIST) add(id);
for (const j of dbJourneys) add(j.id);
for (const id of Object.keys(PAIRED_TRACKS)) add(id);

// ── analyses (protected sidecar first) ──────────────────────────────────────
const out = {};
const skipped = [];
for (const id of order) {
  let name, recordingId, palette = null, phases = null;
  const db = byId.get(id);
  if (db) {
    name = db.name; recordingId = db.recording_id; palette = db.theme?.palette ?? null; phases = db.phases;
  } else {
    const b = JOURNEYS.find((x) => x.id === id);
    if (!b) { skipped.push(`${id} (unknown)`); continue; }
    name = b.name; phases = b.phases;
    recordingId = await builtinRecording(id);
  }
  if (!recordingId) { skipped.push(`${name} (no recording)`); continue; }
  let summary = PROTECTED[recordingId]?.summary ?? null;
  if (!summary) {
    const { data: an } = await sb.from("analyses").select("summary").eq("recording_id", recordingId).maybeSingle();
    summary = an?.summary ?? null;
  }
  const p = summary?.profile;
  if (!p?.duration) { skipped.push(`${name} (no v2 profile)`); continue; }
  out[id] = {
    name,
    recordingId,
    palette,
    duration: r2(p.duration),
    key: p.key?.detected ?? null,
    climaxTime: r2(p.dynamics?.climaxTime ?? null),
    quietestTime: r2(p.dynamics?.quietestTime ?? null),
    phaseBounds: (phases ?? []).slice(1).map((ph) => r2(ph.start * p.duration)),
    curve: (p.dynamics?.curve ?? []).map((c) => [r2(c.t), r2(c.intensity)]),
    sections: (p.sections ?? []).map((x) => ({
      start: r2(x.start), end: r2(x.end), trend: x.trend, intensity: r2(x.intensity), onsetRate: r2(x.onsetRate),
      localKey: x.localKey ?? null, major: r2(x.chordShare?.major ?? 0), minor: r2(x.chordShare?.minor ?? 0),
      suspended: r2(x.chordShare?.suspended ?? 0), diminished: r2(x.chordShare?.diminished ?? 0),
      centerMidi: x.register?.centerMidi ?? null, brightnessHz: x.brightnessHz ?? null,
    })),
    mood: { words: summary.mood?.words ?? [], arousal: r2(summary.mood?.arousal ?? 0.5), valence: r2(summary.mood?.valence ?? 0) },
    tempo: {
      bpm: r2(summary.tempo?.bpm ?? 80), feel: summary.tempo?.feel ?? "moderate", steadiness: r2(summary.tempo?.steadiness ?? 0.5),
      pulseClarity: r2(summary.tempo?.pulse_clarity ?? 0.3), onsetRate: r2(summary.tempo?.onset_rate ?? 3),
    },
  };
}

// one journey per line — compact for the client bundle, still diffable
const json = "{\n" + Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}";
writeFileSync(
  "src/lib/journeys/particle-profiles.generated.ts",
  `// GENERATED by scripts/build-particle-profiles.mjs — do not edit by hand.
// Compact v2 deep-analysis profiles for EVERY journey (kiosk loop order first).
// Frozen analyses come from scripts/deep-analysis-protected.json.
import type { ParticleProfile } from "./particle-casting";

export const PARTICLE_PROFILES: Readonly<Record<string, ParticleProfile>> = ${json};
`,
);
console.log(`wrote ${Object.keys(out).length} profiles (${TRAMOKYO_SETLIST.filter((id) => out[id]).length}/${TRAMOKYO_SETLIST.length} of the kiosk loop)`);
console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
