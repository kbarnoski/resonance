#!/usr/bin/env node
// harvest-journey-clips.mjs — Wave 2 pilot (2026-09-25): living hero
// shots. For each phase of the given built-in journeys, take the phase's
// first pack still and animate it with Wan 2.6 image-to-video (5s, 720p)
// using the phase's own motion language. Clips land in the offline pack
// and local-clips.json maps journeyId → { phaseIdx: url } for playback.
//
// Usage: node --env-file=.env.local scripts/harvest-journey-clips.mjs inferno first-snow
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");
const ROOT = process.cwd();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function encodeDual(rawPath, outBase) {
  const opts = { stdio: "pipe", maxBuffer: 32 * 1024 * 1024 };
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", rawPath, "-vf", "gradfun=strength=4:radius=16",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", `${outBase}.mp4`], opts);
  execFileSync(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", "error", "-y", "-i", rawPath, "-vf", "gradfun=strength=4:radius=16",
    "-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p10le",
    "-tag:v", "hvc1", "-movflags", "+faststart", "-an", `${outBase}.hevc.mp4`], opts);
}

async function resolveJourney(jid, JOURNEYS) {
  const builtin = JOURNEYS.find((j) => j.id === jid);
  if (builtin) return builtin;
  const { data } = await supabase.from("journeys").select("id, name, phases").eq("id", jid).single();
  return data ?? null;
}
fal.config({ credentials: process.env.FAL_KEY });

const journeyIds = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const FRESH_HEROES = process.argv.includes("--fresh-heroes");
if (journeyIds.length === 0) {
  console.error("usage: harvest-journey-clips.mjs <journey-id> [...]");
  process.exit(1);
}

// Bundle journeys.ts for phases + allocation weights (same trick as image harvest)
const outfile = path.join(ROOT, ".tmp-clips-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { JOURNEYS } from "@/lib/journeys/journeys";
      export { allocateByPhase } from "@/lib/journeys/pack-image-allocation";
      export { TRAMOKYO_PHASE_WEIGHT } from "@/lib/journeys/prompt-decoration";
    `,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "@": path.join(ROOT, "src") },
  outfile,
});
let app;
try {
  app = await import(pathToFileURL(outfile).href);
} finally {
  await rm(outfile, { force: true });
}

const PACK = path.join(ROOT, "public", "tramokyo-pack");

// ── Motion identity system (Karel 2026-09-26: "these should all be
// considered music videos with their own themes — not all bursts").
// Motion language = phase ROLE (the arc position) × the track's PACE
// class (note density from its analysis). Hard anti-burst guardrails on
// every prompt; Wan's default is to compress 10s into a flourish.
const MOTION = {
  threshold: {
    glacial: "almost imperceptible motion, one element stirring in stillness, the camera barely breathing forward",
    flowing: "very slow drift forward, soft elements waking one at a time",
    lively: "gentle continuous drift, a few elements beginning to move in different depths",
  },
  expansion: {
    glacial: "slow patient swelling, elements unfurling at a dream's pace",
    flowing: "gradual building motion, elements multiplying and traveling softly across the frame",
    lively: "steady flowing motion, currents of movement weaving through the scene",
  },
  transcendence: {
    glacial: "vast slow-motion billowing, enormous forms turning with weight",
    flowing: "full flowing motion, waves of movement traveling through the whole scene",
    lively: "rich continuous motion at many depths, everything alive but unhurried",
  },
  illumination: {
    glacial: "suspended stillness with faint shimmer, dust hanging in light",
    flowing: "hovering micro-drift, light breathing across surfaces",
    lively: "delicate motion everywhere, small elements glinting and turning slowly",
  },
  return: {
    glacial: "motion releasing into rest, elements descending like sediment",
    flowing: "settling motion, things drifting down and coming to rest softly",
    lively: "gentle unwinding motion, currents slowing and separating",
  },
  integration: {
    glacial: "near-total stillness, one small motion remaining, breath-slow",
    flowing: "quiet residual drift, the scene exhaling",
    lively: "soft afterglow motion, the last few elements settling",
  },
};
const PHASE_ROLES = ["threshold", "expansion", "transcendence", "illumination", "return", "integration"];

// Per-journey MOTION SOUL (Karel 2026-09-26: "each journey treated
// thematic, based on the vibe and soul of the piece — this is art").
// The soul leads the prompt; role/pace shape its intensity.
const MOTION_SOUL = {
  "Realized": "the motion of fire — heat shimmer, embers rising, flame tongues licking upward, consuming and breathing",
  "Snowflake": "the motion of snowfall — weightless crystalline drift, hushed slow descent, settling in silence",
  "The Summit": "upward striving — things climbing, lifting, straining gently toward height",
  "The Ascension": "weightless vertical rising — light ascending, everything released upward",
  "The Bloom": "organic unfurling — petals opening, fronds uncoiling, growth in slow bloom",
  "Cosmic Drift": "weightless orbital drift — slow tumbling through vacuum, silent rotation",
  "Mycelium Dream": "creeping organic spread — pulses traveling filaments, spores lofting, the network breathing",
  "Interplay": "two currents courting — approaching, entwining, parting and returning",
  "Bath": "liquid motion — ripples widening, steam curling, caustic light swaying on stone",
  "Welcome Home": "hearth warmth — candle-flicker, smoke rising in a thread, a slow homeward approach",
  "The Knife": "held tension and clean release — long stillness, then one precise gliding slide",
  "2019": "golden nostalgia — pollen drifting, long light crawling across the field, fireflies wandering",
  "The Knife (Jam)": "improvised angular motion — riffs of movement trading, breaking pattern, rejoining",
  "Playa": "heat shimmer and dust drift — mirage wobble, slow dust columns wandering",
  "Isolation": "fog breathing — slow swells crossing, patient near-stillness, one faithful glow",
  "Rebound": "ripples radiating and returning — elastic echoes, waves answering waves",
  "Stir Crazy": "restless circling — spirals tightening, venting upward, releasing",
  "Rolling": "undulating land — waves of light and shadow sweeping crest to crest",
  "Quarantine": "rain on glass — runnels sliding, droplets beading and merging, the outside trembling through water",
  "All Together": "convergence — tributaries bending together, currents merging into one flow",
  "Rise": "dawn surge — light flooding upward, breaking through, cresting",
  "Surrender": "release into current — loosening, dissolving, being carried without resistance",
  "Openings": "seams parting — light leaking through cracks, thresholds slowly breathing open",
  "Surrounded By Light": "prismatic sweep — beams gliding, spectra migrating across surfaces",
  "Drift": "lateral migration — sheets and veils sliding sideways at sleep's pace",
  "Self": "mirrored unison — reflections moving together, recursion breathing in and out",
  "Message": "pulse propagation — rings expanding, signals traveling outward and answered",
  "Grace": "gentle descent — lights falling soft as leaves, settling as gifts",
  "Complete": "circular closure — orbits completing, rings closing without a seam",
  "Held": "enclosing warmth — a slow embrace of glow, convection like a heartbeat",
  "Sway": "pendulum rhythm — kelp-sway, metronomic rocking, one shared tempo",
  "Mystic": "sacred unfolding — geometry etching itself, nested layers opening inward",
  "The First": "first awakening — light waking through veins, sap rising, one seam opening",
  "The First (Expanded)": "a forest waking — waves of dawn rolling trunk to trunk, warmth climbing",
  "Dad's Song II": "dust in window light — motes turning slow, grain flowing like remembered music",
  "Yellow Bird": "flocking flight — banking, wheeling, long gliding descents",
  "Spectre": "spectral hover — wisps gliding, pale curtains slowly turning",
  "Mexican Boy": "festive whirl — petal spirals, ember dance, joy in slow orbit",
  "Afterglow": "banked fading — colors cooling band by band, light lying down",
  "Grasshopper": "coiled spring — held tension, sudden gentle leap arcs, dew launching and falling",
  "Love Again": "tender regrowth — unfurling through char, blossoms opening one by one",
};
const GUARDRAILS = "smooth constant camera speed, single continuous take, meditative pace throughout, no speed ramps, no time-lapse, no sudden bursts";
const MOTION_NEGATIVE = "time-lapse, hyperlapse, speed ramp, fast motion, sudden movement, jump cut, flicker, camera shake, text, watermark, people, faces";

// Pace class from the paired recording's note density (analyses in pack data).
function paceClassFor(journey) {
  try {
    const analyses = JSON.parse(require("node:fs").readFileSync(path.join(PACK, "data", "analyses.json"), "utf8"));
    const rows = Array.isArray(analyses) ? analyses : Object.values(analyses);
    const rec = journey.recording_id ?? journey.recordingId;
    const a = rows.find((r) => r.recording_id === rec);
    if (a?.notes?.length) {
      const dur = Math.max(...a.notes.map((n) => n.time + n.duration));
      const d = a.notes.length / Math.max(1, dur);
      return d < 18 ? "glacial" : d < 27 ? "flowing" : "lively";
    }
  } catch { /* no analysis — default */ }
  return "flowing";
}
const manifestPath = path.join(PACK, "local-clips.json");
const manifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : {};

let spent = 0;
const COST_PER_CLIP = 0.5; // Wan 2.6 1080p ≈ $0.05/s × 10s

for (const jid of journeyIds) {
  const journey = await resolveJourney(jid, app.JOURNEYS);
  if (!journey) { console.warn(`skip: no built-in journey ${jid}`); continue; }
  const imgDir = path.join(PACK, "images", "journeys", jid);
  if (!existsSync(imgDir)) { console.warn(`skip: no pack images for ${jid}`); continue; }
  const clipDir = path.join(PACK, "clips", "journeys", jid);
  await mkdir(clipDir, { recursive: true });
  manifest[jid] = manifest[jid] ?? {};

  // Phase → first image index, via the same largest-remainder allocation
  // the image harvest used (90 images, tramokyo weights).
  const counts = app.allocateByPhase(journey.phases, 90, app.TRAMOKYO_PHASE_WEIGHT);
  let cursor = 0;
  for (let pi = 0; pi < journey.phases.length; pi++) {
    const firstIdx = cursor;
    cursor += counts[pi];
    const outBase = path.join(clipDir, `phase-${pi}`);
    const clipPath = `${outBase}.mp4`;
    const publicUrl = `/tramokyo-pack/clips/journeys/${jid}/phase-${pi}.mp4`;
    if (existsSync(clipPath) && !FRESH_HEROES) {
      const hevcPath = clipPath.replace(/\.mp4$/, ".hevc.mp4");
      manifest[jid][String(pi)] = existsSync(hevcPath)
        ? { h264: publicUrl, hevc: publicUrl.replace(/\.mp4$/, ".hevc.mp4") }
        : publicUrl;
      console.log(`  keep ${jid} phase ${pi}`);
      continue;
    }
    const stillPath = path.join(imgDir, `gen-${String(firstIdx).padStart(3, "0")}.jpg`);
    if (!existsSync(stillPath)) { console.warn(`  no still for ${jid} phase ${pi}`); continue; }

    const b64 = (await readFile(stillPath)).toString("base64");
    const phase = journey.phases[pi];
    const motifs = (phase.aiPrompt ?? "").split(",").slice(0, 3).join(",");
    const role = PHASE_ROLES[Math.min(pi, PHASE_ROLES.length - 1)];
    const pace = paceClassFor(journey);
    const soul = MOTION_SOUL[journey.name] ?? MOTION_SOUL[journey.title] ?? "";
    const prompt = `${soul ? soul + ", " : ""}${MOTION[role][pace]}, ${motifs}, ${GUARDRAILS}`;

    console.log(`  → ${jid} phase ${pi} (from gen-${String(firstIdx).padStart(3, "0")})`);
    try {
      const result = await fal.subscribe("wan/v2.6/image-to-video", {
        input: {
          prompt,
          image_url: `data:image/jpeg;base64,${b64}`,
          duration: "10",
          resolution: "1080p",
          negative_prompt: MOTION_NEGATIVE,
          enable_prompt_expansion: false,
        },
        logs: false,
      });
      const url = result?.data?.video?.url ?? result?.video?.url;
      if (!url) throw new Error("no video url in result");
      const res = await fetch(url);
      const raw = `${outBase}.raw.mp4`;
      await writeFile(raw, Buffer.from(await res.arrayBuffer()));
      try {
        encodeDual(raw, outBase);
      } finally {
        await rm(raw, { force: true });
      }
      spent += COST_PER_CLIP;
      manifest[jid][String(pi)] = { h264: publicUrl, hevc: publicUrl.replace(/\.mp4$/, ".hevc.mp4") };
      console.log(`  ✓ ${jid} phase ${pi} ($${spent.toFixed(2)})`);
    } catch (err) {
      console.error(`  ✗ ${jid} phase ${pi}: ${err.message ?? err}`);
      if (err.stderr) console.error(String(err.stderr).slice(-1500));
    }
  }
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nmanifest → ${manifestPath}`);
console.log(`est spend ≈ $${spent.toFixed(2)}`);
