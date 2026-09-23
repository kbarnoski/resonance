// Assign real per-phase shaderModes to every album journey (Karel
// 2026-09-23: "you fixate on a discreet set of shaders... we have a mass
// set of them"). Root cause: the album builders left phases[].shaderModes
// empty, so the engine fell back to a single default shader for all 35
// journeys. This runs the registry's own regenerateJourneyShaders —
// full pool, per-phase budgets scaled to track duration, journey-wide
// uniqueness, LRU cross-journey variety — with a deterministic per-
// journey seed so each journey gets its OWN stable diverse program.
import { createClient } from "@supabase/supabase-js";
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const outfile = path.join(ROOT, ".tmp-shader-bundle.mjs");
await build({
  stdin: {
    contents: `export { regenerateJourneyShaders } from "@/lib/journeys/journeys";`,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "@": path.join(ROOT, "src") },
  outfile,
});
const app = await import(pathToFileURL(outfile).href);
await rm(outfile, { force: true });

// Deterministic RNG per journey id so re-runs are stable.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

// The 35 album journeys = all journeys owned by the three album paths +
// simplest robust selector: every journey whose phases carry aiPromptSequence
// (only the album rewrites set that) plus any with empty shaderModes.
const { data: rows, error } = await supabase.from("journeys").select("id, name, phases, theme, realm_id, user_id");
if (error) throw error;

let changed = 0;
for (const row of rows) {
  if (!Array.isArray(row.phases) || row.phases.length === 0) continue;
  const empty = row.phases.every((p) => !Array.isArray(p.shaderModes) || p.shaderModes.length === 0);
  if (!empty) { continue; } // never touch journeys that already have curated shaders
  const duration = Math.max(...row.phases.map((p) => Number(p.end) || 0), 180);
  const journey = {
    id: row.id,
    realmId: row.realm_id ?? "custom",
    theme: row.theme && Object.keys(row.theme).length ? row.theme : undefined,
    userId: row.user_id ?? undefined,
    blockedShaders: [],
    phases: row.phases,
  };
  const regen = app.regenerateJourneyShaders(journey, mulberry32(hash(row.id)), duration);
  const phases = row.phases.map((p, i) => ({ ...p, shaderModes: regen.phases[i].shaderModes }));
  const distinct = new Set(phases.flatMap((p) => p.shaderModes)).size;
  const { error: uerr } = await supabase.from("journeys").update({ phases }).eq("id", row.id);
  console.log(`${uerr ? "✗ " + uerr.message : "✓"} ${row.name} — ${distinct} distinct shaders across ${phases.length} phases`);
  if (!uerr) changed++;
}
console.log(`done — ${changed} journeys assigned shader programs`);
