#!/usr/bin/env node
/**
 * generate-journey-registry.mjs — the enforced content index, stage 2
 * (2026-09-27, born from the Johnny/Joseph review).
 *
 * Dumps every journey's identity + design data into a single committed
 * JSON (docs/journey-registry.json) so that:
 *   1. humans can audit the catalog at a glance (feeds the visual index),
 *   2. CI can validate invariants WITHOUT database or pack access
 *      (src/lib/journeys/registry-gate.test.ts checks this file against
 *      the shader registry and the material audit),
 *   3. drift between sessions has a canonical ground truth.
 *
 * Needs .env.local (Supabase service key) + the local pack on disk.
 * Re-run and commit whenever journeys or clips change:
 *   node scripts/generate-journey-registry.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const CLIPS_ROOT = "public/tramokyo-pack/clips/journeys";
const AUDIT_PATH = "docs/journey-material-audit-2026-09-27.json";
const OUT = "docs/journey-registry.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const audit = existsSync(AUDIT_PATH)
  ? JSON.parse(readFileSync(AUDIT_PATH, "utf8"))
  : { journeys: {} };

const clipDirs = existsSync(CLIPS_ROOT)
  ? readdirSync(CLIPS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

const clipInventory = {};
for (const dir of clipDirs) {
  const files = readdirSync(join(CLIPS_ROOT, dir)).filter((f) => f.endsWith(".mp4") && !f.includes("hevc"));
  clipInventory[dir] = {
    heroes: files.filter((f) => f.startsWith("phase-")).length,
    travels: files.filter((f) => f.startsWith("travel-")).length,
  };
}

const { data: rows, error } = await supabase
  .from("journeys")
  .select("id,name,created_at,recording_id,theme,phases,is_public")
  .order("created_at");
if (error) { console.error(error); process.exit(1); }

const journeys = {};
for (const j of rows ?? []) {
  const theme = j.theme ?? {};
  const phases = Array.isArray(j.phases) ? j.phases : [];
  const shaderLists = phases.map((p) => p.shaderModes ?? []);
  journeys[j.id] = {
    name: j.name,
    source: theme.builtinJourneyId ? `builtin-wrapper:${theme.builtinJourneyId}` : "db",
    created: j.created_at?.slice(0, 10) ?? null,
    recordingId: j.recording_id ?? null,
    mood: theme.poetryMood ?? theme.mood ?? null,
    ambient: theme.ambientTheme ?? theme.ambient ?? null,
    palette: theme.palette ?? null,
    hasTheme: !!(theme.palette || theme.ambientTheme || theme.mood),
    phaseCount: phases.length,
    phaseBounds: phases.map((p) => [p.start, p.end]),
    intensityArc: phases.map((p) => p.intensityMultiplier ?? null),
    shaders: shaderLists,
    duplicateShadersWithinJourney: (() => {
      const seen = new Set(); const dupes = new Set();
      for (const s of shaderLists.flat()) { if (seen.has(s)) dupes.add(s); seen.add(s); }
      return [...dupes];
    })(),
    clips: clipInventory[j.id] ?? null,
    audit: audit.journeys?.[j.id] ?? { verdict: "unaudited" },
  };
}

// Built-in code journeys with pack clips (data lives in journeys.ts —
// the CI gate validates them by direct import; here we track identity,
// clips, and audit coverage only).
for (const dir of clipDirs) {
  if (journeys[dir]) continue;
  journeys[dir] = {
    name: `(builtin) ${dir}`,
    source: "builtin",
    clips: clipInventory[dir],
    audit: audit.journeys?.[dir] ?? { verdict: "unaudited" },
  };
}

const registry = {
  generatedAt: new Date().toISOString().slice(0, 10),
  auditFile: AUDIT_PATH,
  counts: {
    total: Object.keys(journeys).length,
    withClips: Object.values(journeys).filter((j) => j.clips).length,
    verdicts: Object.values(journeys).reduce((acc, j) => {
      const v = j.audit?.verdict ?? "unaudited";
      acc[v] = (acc[v] ?? 0) + 1; return acc;
    }, {}),
  },
  journeys,
};

writeFileSync(OUT, JSON.stringify(registry, null, 1) + "\n");
console.log(`wrote ${OUT}: ${registry.counts.total} journeys, verdicts:`, registry.counts.verdicts);
