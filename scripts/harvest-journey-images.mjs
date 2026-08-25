#!/usr/bin/env node
/**
 * Tramokyo Phase 2 — pre-generate the "mirror set" of journey images so
 * every featured (built-in) journey and every path journey runs fully
 * offline with imagery matching what live fal generation would produce.
 *
 * Faithful to the live pipeline:
 *   - prompt assembly mirrors ai-image-layer.tsx (phase aiPrompt /
 *     aiPromptSequence, Ghost marker substitution + age/overlay prepend,
 *     cinematic POV + interpretation + mood decoration, "no snowflakes")
 *   - server-side additions mirror /api/ai-image/generate (STYLE_SUFFIX,
 *     GLOBAL_NEGATIVE, flux dev 28 steps / guidance 3.5 / 1024x1024,
 *     Ghost via flux-lora scale 1.2)
 *   - image count per journey ≈ track duration / 7s (the live GEN_INTERVAL),
 *     distributed across phases by phase length, generated in phase order
 *     (the offline player cycles the URL list sequentially)
 *
 * Usage:
 *   node --env-file=.env.local scripts/harvest-journey-images.mjs [flags]
 *     --dry-run        print plan + cost estimate, no fal calls
 *     --journey=<id>   only this journey id (built-in id or DB uuid)
 *     --path=<token>   only journeys referenced by this path's share token
 *     --per-journey=N  override the duration-derived image count per journey
 *     --fresh          delete existing gen-* for the selected targets first
 *                      (required when raising counts — phase slots are
 *                      allocated by index, so appending to an old set would
 *                      leave images in the wrong phase positions)
 *     --limit=N        stop after N generations this run (validation runs)
 *
 * Resumable: existing gen-*.{jpg,png} files are kept and skipped.
 * Output: public/tramokyo-pack/images/journeys/{id}/gen-NNN.* and
 *         public/tramokyo-pack/local-images.json  (journeyId → URL list)
 */

import { build } from "esbuild";
import { fal } from "@fal-ai/client";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PACK_DIR = path.join(ROOT, "public", "tramokyo-pack");
const DATA_DIR = path.join(PACK_DIR, "data");
const IMAGES_DIR = path.join(PACK_DIR, "images", "journeys");
const LOCAL_IMAGES_JSON = path.join(PACK_DIR, "local-images.json");

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--journey="))?.slice(10) ?? null;
const ONLY_PATH = process.argv.find((a) => a.startsWith("--path="))?.slice(7) ?? null;
const PER_JOURNEY = Number(process.argv.find((a) => a.startsWith("--per-journey="))?.slice(14) ?? 0) || null;
const FRESH = process.argv.includes("--fresh");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? Infinity);

const GEN_INTERVAL_SEC = 7;
const MIN_IMAGES = 12;
const MAX_IMAGES = 90;
const DEFAULT_DURATION_SEC = 300;
const CONCURRENCY = Math.max(1, Number(process.env.HARVEST_CONCURRENCY) || 4);
const COST_DEV = 0.025;
const COST_LORA = 0.02;

// ── Bundle app modules (TS) so the script uses the real journey data ──
async function loadAppModules() {
  const outfile = path.join(ROOT, ".tmp-harvest-bundle.mjs");
  await build({
    stdin: {
      contents: `
        export { JOURNEYS, getGhostAgeForPhase, getGhostOverlayForPhase,
          GHOST_ANGEL_WHITE, GHOST_ANGEL_WINGLESS_WHITE,
          GHOST_ANGEL_MARKER, GHOST_ANGEL_WINGLESS_MARKER,
          GHOST_NEGATIVE_PROMPT } from "@/lib/journeys/journeys";
        export { GHOST_LORA_URL } from "@/lib/journeys/ghost-lora";
        export { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
        export { CINEMATIC_PERSPECTIVES, PROMPT_INTERPRETATIONS, PROMPT_MOODS,
          STYLE_SUFFIX, GLOBAL_NEGATIVE } from "@/lib/journeys/prompt-decoration";
      `,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    alias: { "@": path.join(ROOT, "src") },
    outfile,
  });
  const mod = await import(pathToFileURL(outfile).href);
  await rm(outfile, { force: true });
  return mod;
}

async function readJson(p, fallback = null) {
  try { return JSON.parse(await readFile(p, "utf8")); }
  catch { return fallback; }
}

function matchPairedTrack(spec, recordings) {
  if (spec.startsWith("=")) {
    const title = spec.slice(1);
    return recordings.find((r) => r.title === title) ?? null;
  }
  const needle = spec.replaceAll("%", "").toLowerCase();
  return recordings.find((r) => (r.title ?? "").toLowerCase().includes(needle)) ?? null;
}

/** Largest-remainder allocation of n images across phases by length. */
function allocateByPhase(phases, n) {
  const weights = phases.map((p) => Math.max(0, (p.end ?? 1) - (p.start ?? 0)));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / total) * n);
  const counts = raw.map(Math.floor);
  let rem = n - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && rem > 0; k++, rem--) counts[order[k][1]]++;
  return counts;
}

async function main() {
  if (!DRY_RUN && !process.env.FAL_KEY) {
    console.error("FAL_KEY not set (use node --env-file=.env.local)");
    process.exit(1);
  }
  if (!existsSync(DATA_DIR)) {
    console.error("Pack data missing — run scripts/build-tramokyo-pack.mjs first");
    process.exit(1);
  }
  if (!DRY_RUN) fal.config({ credentials: process.env.FAL_KEY });

  const app = await loadAppModules();
  const recordings = await readJson(path.join(DATA_DIR, "recordings.json"), []);
  const dbJourneys = await readJson(path.join(DATA_DIR, "journeys.json"), []);
  const dbPaths = await readJson(path.join(DATA_DIR, "journey_paths.json"), []);
  const recById = new Map(recordings.map((r) => [r.id, r]));

  // ── Target list: all built-ins + every journey referenced by a path ──
  const pathJourneyIds = new Set();
  for (const p of dbPaths) {
    for (const id of p.journey_ids ?? []) pathJourneyIds.add(id);
    if (p.culmination_journey_id) pathJourneyIds.add(p.culmination_journey_id);
  }

  const targets = [];

  for (const j of app.JOURNEYS) {
    let rec = j.recordingId ? recById.get(j.recordingId) ?? null : null;
    if (!rec && app.PAIRED_TRACKS[j.id]) rec = matchPairedTrack(app.PAIRED_TRACKS[j.id], recordings);
    targets.push({
      id: j.id,
      name: j.name,
      phases: j.phases,
      strictCamera: j.strictCameraPrompt === true,
      isGhost: j.id === "ghost",
      loraUrl: j.characterLoraUrl ?? null,
      duration: rec?.duration ?? DEFAULT_DURATION_SEC,
      source: "built-in",
    });
  }

  for (const row of dbJourneys) {
    if (!pathJourneyIds.has(row.id)) continue;
    if (Array.isArray(row.local_image_urls) && row.local_image_urls.length > 0) continue; // already has curated images
    const phases = Array.isArray(row.phases) ? row.phases : [];
    if (!phases.some((p) => p.aiPrompt || p.aiPromptSequence)) {
      console.warn(`skip (no prompts): ${row.name} ${row.id}`);
      continue;
    }
    // DB duplicates of the Ghost journey carry the angel markers in their
    // prompts — give them the same substitution + LoRA treatment.
    const isGhost = row.name === "Ghost" ||
      phases.some((p) => JSON.stringify(p).includes("<<GHOST_ANGEL"));
    targets.push({
      id: row.id,
      name: row.name,
      phases,
      strictCamera: isGhost,
      isGhost,
      loraUrl: isGhost ? app.GHOST_LORA_URL : null,
      duration: recById.get(row.recording_id)?.duration ?? DEFAULT_DURATION_SEC,
      source: "path",
    });
  }

  let filtered = ONLY ? targets.filter((t) => t.id === ONLY) : targets;
  if (ONLY_PATH) {
    const pathRow = dbPaths.find((p) => p.share_token === ONLY_PATH);
    if (!pathRow) {
      console.error(`no path with share token ${ONLY_PATH}`);
      process.exit(1);
    }
    const ids = new Set([...(pathRow.journey_ids ?? []), pathRow.culmination_journey_id].filter(Boolean));
    filtered = filtered.filter((t) => ids.has(t.id));
  }
  if (filtered.length === 0) {
    console.error(ONLY ? `no target with id ${ONLY}` : "no targets");
    process.exit(1);
  }

  if (FRESH && !DRY_RUN) {
    for (const t of filtered) {
      const dir = path.join(IMAGES_DIR, t.id);
      if (existsSync(dir)) {
        const old = (await readdir(dir)).filter((f) => f.startsWith("gen-"));
        for (const f of old) await rm(path.join(dir, f), { force: true });
        if (old.length > 0) console.log(`  fresh: cleared ${old.length} images for ${t.name}`);
      }
    }
  }

  // ── Build the generation plan ──
  const localImages = (await readJson(LOCAL_IMAGES_JSON, {})) ?? {};
  const plan = [];
  for (const t of filtered) {
    const n = PER_JOURNEY ?? Math.min(MAX_IMAGES, Math.max(MIN_IMAGES, Math.ceil(t.duration / GEN_INTERVAL_SEC)));
    const counts = allocateByPhase(t.phases, n);
    const dir = path.join(IMAGES_DIR, t.id);
    const existing = existsSync(dir)
      ? new Set((await readdir(dir)).filter((f) => f.startsWith("gen-")).map((f) => f.split(".")[0]))
      : new Set();

    let imgIdx = 0;
    t.phases.forEach((phase, pi) => {
      const phaseCount = counts[pi];
      const seq = Array.isArray(phase.aiPromptSequence) && phase.aiPromptSequence.length > 0
        ? phase.aiPromptSequence : null;
      for (let i = 0; i < phaseCount; i++) {
        const idx = imgIdx++;
        const stem = `gen-${String(idx).padStart(3, "0")}`;
        if (existing.has(stem)) continue;

        let base = seq
          ? seq[Math.min(seq.length - 1, Math.floor((i / phaseCount) * seq.length))]
          : phase.aiPrompt;
        if (!base) continue;

        if (t.isGhost) {
          if (base.includes(app.GHOST_ANGEL_WINGLESS_MARKER)) {
            base = base.split(app.GHOST_ANGEL_WINGLESS_MARKER).join(app.GHOST_ANGEL_WINGLESS_WHITE);
          }
          if (base.includes(app.GHOST_ANGEL_MARKER)) {
            base = base.split(app.GHOST_ANGEL_MARKER).join(app.GHOST_ANGEL_WHITE);
          }
          const age = app.getGhostAgeForPhase(phase.id);
          const overlay = app.getGhostOverlayForPhase(phase.id);
          base = `${age}. ${overlay}. ${base}`;
        }

        let varied;
        if (t.strictCamera) {
          varied = `${base}, no snowflakes`;
        } else {
          const povs = app.CINEMATIC_PERSPECTIVES[phase.id ?? "threshold"] ?? app.CINEMATIC_PERSPECTIVES.threshold;
          const pov = povs[Math.floor(Math.random() * povs.length)];
          const interp = app.PROMPT_INTERPRETATIONS[Math.floor(Math.random() * app.PROMPT_INTERPRETATIONS.length)];
          const mood = app.PROMPT_MOODS[Math.floor(Math.random() * app.PROMPT_MOODS.length)];
          varied = `${base}, ${pov}, ${interp}, ${mood}, no snowflakes`;
        }

        plan.push({ target: t, stem, dir, prompt: varied });
      }
    });
  }

  const estCost = filtered.reduce((sum, t) => {
    const perImg = t.loraUrl ? COST_LORA : COST_DEV;
    return sum + plan.filter((p) => p.target === t).length * perImg;
  }, 0);
  console.log(`Targets: ${filtered.length} journeys, ${plan.length} images to generate (est $${estCost.toFixed(2)})`);
  for (const t of filtered) {
    const c = plan.filter((p) => p.target === t).length;
    if (c > 0 || ONLY) console.log(`  ${t.source === "path" ? "PATH " : "BUILT "} ${t.name} (${t.id.slice(0, 12)}…): ${c} images${t.loraUrl ? " [LoRA]" : ""}`);
  }
  if (DRY_RUN) return;

  const work = plan.slice(0, Number.isFinite(LIMIT) ? LIMIT : plan.length);
  let done = 0, failed = 0, spent = 0;

  async function generateOne(item) {
    const { target: t, stem, dir, prompt } = item;
    const fullPrompt = `${prompt}, ${app.STYLE_SUFFIX}`;
    const negative = t.isGhost
      ? `${app.GLOBAL_NEGATIVE}, ${app.GHOST_NEGATIVE_PROMPT}`
      : app.GLOBAL_NEGATIVE;
    const useLora = !!t.loraUrl;
    const input = {
      prompt: fullPrompt,
      negative_prompt: negative,
      image_size: { width: 1024, height: 1024 },
      num_inference_steps: 28,
      guidance_scale: 3.5,
      seed: Math.floor(Math.random() * 4294967295),
      enable_safety_checker: true,
      ...(useLora ? { loras: [{ path: t.loraUrl, scale: 1.2 }] } : {}),
    };
    const model = useLora ? "fal-ai/flux-lora" : "fal-ai/flux/dev";

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await fal.subscribe(model, { input });
        const url = result.data?.images?.[0]?.url;
        if (!url) throw new Error("no image in response");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = /\.png(\?|$)/.test(url) ? "png" : "jpg";
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, `${stem}.${ext}`), buf);
        spent += useLora ? COST_LORA : COST_DEV;
        done++;
        console.log(`  ✓ [${done + failed}/${work.length}] ${t.name} ${stem} ($${spent.toFixed(2)})`);
        return;
      } catch (err) {
        if (attempt === 1) {
          failed++;
          console.warn(`  ✗ ${t.name} ${stem}: ${err.message ?? err}`);
        }
      }
    }
  }

  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < work.length) {
        const item = work[cursor++];
        await generateOne(item);
      }
    }),
  );

  // ── Rebuild local-images.json from what's actually on disk ──
  for (const t of filtered) {
    const dir = path.join(IMAGES_DIR, t.id);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.startsWith("gen-")).sort();
    if (files.length > 0) {
      localImages[t.id] = files.map((f) => `/tramokyo-pack/images/journeys/${t.id}/${f}`);
    }
  }
  await writeFile(LOCAL_IMAGES_JSON, JSON.stringify(localImages, null, 2));

  console.log(`\nDone: ${done} generated, ${failed} failed, $${spent.toFixed(2)} spent`);
  console.log(`local-images.json → ${Object.keys(localImages).length} journeys with offline imagery`);
}

main().catch((err) => { console.error(err); process.exit(1); });
