#!/usr/bin/env node
/**
 * Train a FLUX LoRA on the Ghost angel character.
 *
 * Pipeline:
 *   1. Generate 20 diverse reference frames via fal-ai/flux/dev — varying
 *      pose, framing, lighting, setting, and the white/possessed-black
 *      wardrobe variants — but all keeping the character's identity
 *      markers (white spiral fibonacci hair, translucent mist dress,
 *      eyes closed, face obscured, wispy wings of light/shadow).
 *   2. Save locally to scripts/_ghost-lora-training/ for review.
 *   3. Zip the directory.
 *   4. Upload the zip to FAL storage.
 *   5. Submit fal-ai/flux-lora-fast-training with the zip URL.
 *   6. Poll for completion, print the resulting LoRA `.safetensors` URL.
 *
 * One-time cost: ~$8 (~20 dev generations at $0.025 + ~$8 LoRA training,
 * minus the $0.50 of dev gens). Output URL is pasted into
 * src/lib/journeys/ghost-lora.ts which the runtime reads.
 *
 * Usage:
 *   node --env-file=.env.local scripts/train-ghost-lora.mjs
 *
 * Optional: --skip-generate to reuse images already in
 * scripts/_ghost-lora-training/ (e.g. if Karel curates them by hand).
 */

import { fal } from "@fal-ai/client";
import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK_DIR = path.join(__dirname, "_ghost-lora-training");
const ZIP_PATH = path.join(__dirname, "_ghost-lora-training.zip");
const LORA_TS_PATH = path.join(__dirname, "..", "src", "lib", "journeys", "ghost-lora.ts");
const SKIP_GENERATE = process.argv.includes("--skip-generate");

if (!process.env.FAL_KEY) {
  console.error("Missing FAL_KEY in env. Run with --env-file=.env.local.");
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY });

// ─── Training prompt set ───────────────────────────────────────────
//
// 20 prompts spanning the dimensions a LoRA needs to generalize on:
//   pose (back / 3-quarter / profile / wide; never front)
//   framing (close-up / mid / full-body / extreme wide)
//   lighting (moonlight / dawn / dim / cosmic / golden / underwater)
//   variant (white-wingless / white-winged / black-possessed)
//   setting (chamber / forest / water / snow / cosmic / desert)
//
// Identity markers held constant in EVERY prompt:
//   white spiral fibonacci hair (never braided)
//   translucent mist dress
//   pale luminous skin, eyes closed
//   face obscured / never front-on
//   solo figure (no companions, no crowds)
//
const ID_CORE = "ethereal angel woman with VERY LONG flowing snow white spiral fibonacci hair cascading past her waist (never braided), pale luminous skin, eyes closed serene mysterious expression, face obscured by her hair or turned away from camera (never front-on, never facing camera), solo single figure";
const STYLE_TAIL = "photorealistic cinematic, ethereal serene transcendent, no text no watermarks no signatures";

const PROMPTS = [
  // White wingless — early phases
  `close-up three-quarter back view of an ${ID_CORE}, translucent snow white mist dress modest covering, no wings yet (wingless, bare back), silver moonlight across an ancient stone chamber floor, white particles. ${STYLE_TAIL}`,
  `mid-shot side profile of an ${ID_CORE}, translucent snow white mist dress, no wings yet, ancient forest at twilight with shafts of pale silver light, white particle motion. ${STYLE_TAIL}`,
  `full-body wide shot from behind of an ${ID_CORE}, walking through deep fresh snow under a vast pale sky, translucent white mist dress, no wings yet, white snowfall particles swirling. ${STYLE_TAIL}`,
  `extreme wide establishing shot of an ${ID_CORE} tiny and very distant inside a grand medieval stone chamber with soaring vaulted ceilings and a tall arched window pouring silver light, no wings yet, white spiral hair cascading to the ground. ${STYLE_TAIL}`,
  `three-quarter back view of an ${ID_CORE} kneeling at the edge of a still misty pool with white water lilies floating, no wings yet, translucent snow white mist dress, pale moonlight, white particles. ${STYLE_TAIL}`,
  `wide silhouette of an ${ID_CORE} standing at the base of an enormous ancient gnarled tree on a tiny spherical planet against a vast cosmic sky, no wings, white spiral fibonacci hair flowing upward and outward like ribbons. ${STYLE_TAIL}`,

  // White winged — after she finds the wings
  `mid-shot three-quarter back view of an ${ID_CORE} with translucent flowing wispy white angel wings of light and mist attached at the shoulder blades (NEVER feathered NEVER bird wings NEVER butterfly wings), translucent snow white mist dress, golden dawn through ancient forest trees. ${STYLE_TAIL}`,
  `profile silhouette of an ${ID_CORE} with translucent wispy white wings of mist spreading wide, against a vast cosmic starfield with swirling galaxies, snow white spiral hair streaming. ${STYLE_TAIL}`,
  `full-body wide shot of an ${ID_CORE} from the side walking across a still mirror-water surface, translucent wispy white wings of light trailing, translucent snow white mist dress, dawn pink-gold sky reflecting. ${STYLE_TAIL}`,
  `three-quarter back view of an ${ID_CORE} at the base of a flowering blooming tree with white blossoms, translucent wispy white wings of light, golden dawn, white particles spiraling. ${STYLE_TAIL}`,
  `extreme wide cosmic shot of an ${ID_CORE} small against a swirling spiral galaxy, translucent wispy white wings spread wide, snow white spiral fibonacci hair flowing in zero gravity, particles streaming. ${STYLE_TAIL}`,
  `mid-shot from behind of an ${ID_CORE} in a marble cathedral with beams of silver light, translucent wispy white wings, translucent white mist dress, devotional ethereal. ${STYLE_TAIL}`,
  `wide shot of an ${ID_CORE} floating above a still cosmic mirror surface that reflects the stars, translucent wispy white wings outstretched, translucent white mist dress, ethereal weightless. ${STYLE_TAIL}`,
  `close-up over-the-shoulder back view of an ${ID_CORE} with translucent wispy white wings folded, snow white spiral fibonacci hair tumbling forward filling the frame in fractal swirls, particles tracing every strand. ${STYLE_TAIL}`,

  // Black possessed — wings + dress turn jet black, hair stays white
  `three-quarter back view of an ${ID_CORE} possessed under a mysterious spell — translucent JET BLACK shadow-mist dress (NOT skin-revealing), translucent JET BLACK wispy shadow wings of mist (NEVER feathered), her hair stays SNOW WHITE spiral fibonacci, dim torchlight on dark stone walls, dramatic chiaroscuro, BLACK particles streaming from dress and wings while WHITE particles spiral along her white hair. ${STYLE_TAIL}`,
  `mid-shot side profile of an ${ID_CORE} in possessed black wardrobe — translucent JET BLACK shadow-mist dress and JET BLACK wispy translucent wings of shadow, snow white spiral hair, walking through a dim cathedral with broken stained glass, BLACK and WHITE particles in the air. ${STYLE_TAIL}`,
  `wide silhouette of an ${ID_CORE} in possessed black wardrobe at the threshold of a doorway, translucent JET BLACK wispy shadow wings spread, JET BLACK translucent shadow-mist dress, snow white spiral fibonacci hair backlit by silver moonlight beyond, mysterious devil-angel. ${STYLE_TAIL}`,

  // Multi-exposure echoes (the spec's signature spirit-trail effect)
  `mid-shot back view of an ${ID_CORE} with 2 or 3 translucent ghostly spirit-echoes of HERSELF overlapping at slight offsets like a long-exposure photograph (multi-exposure motion-trails of the same single angel — not different people), translucent wispy white wings, snow white spiral hair, ancient stone hall, ethereal serene. ${STYLE_TAIL}`,
  `three-quarter side view of an ${ID_CORE} with translucent self-echoes blurring along her motion path (multi-exposure film effect, motion-trails of one single figure — not multiple people), translucent white mist dress, no wings yet, dim underground passage with water reflections. ${STYLE_TAIL}`,
  `wide shot of an ${ID_CORE} from behind cresting a snowy ridge at golden dawn, translucent ghostly spirit-echoes of herself trailing behind in long-exposure motion-blur (multi-exposure of one single angel — not different people), translucent wispy white wings of mist, snow white spiral fibonacci hair flowing. ${STYLE_TAIL}`,
];

// ─── Helpers ───────────────────────────────────────────────────────

async function ensureWorkDir() {
  await mkdir(WORK_DIR, { recursive: true });
}

async function generateOne(prompt, idx) {
  const tag = String(idx).padStart(2, "0");
  process.stdout.write(`  [${tag}/${PROMPTS.length}] generating… `);
  const negativePrompt =
    "feathers, feathered wings, bird wings, butterfly wings, segmented wings, plumage, " +
    "braided hair, plaited hair, blonde hair, yellow hair, gold hair, " +
    "front-facing pose, face-forward pose, full face shot, eyes open, " +
    "additional people, companions, crowds, onlookers, multiple women, " +
    "sexy, sensual, revealing, provocative, seductive, " +
    "text, watermark, signature, logo, " +
    "deformed anatomy, extra limbs, missing limb, blurry face, " +
    "low quality, oversaturated";
  try {
    const result = await fal.subscribe("fal-ai/flux/dev", {
      input: {
        prompt,
        negative_prompt: negativePrompt,
        image_size: { width: 1024, height: 1024 },
        num_inference_steps: 28,
        guidance_scale: 3.5,
        seed: 100 + idx, // deterministic — re-runs produce identical training set
        enable_safety_checker: true,
      },
    });
    const url = result?.data?.images?.[0]?.url;
    if (!url) throw new Error("no image url in response");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(WORK_DIR, `${tag}.png`), buf);
    process.stdout.write(`${(buf.length / 1024).toFixed(0)} KB\n`);
    return true;
  } catch (err) {
    process.stdout.write(`FAILED: ${err.message}\n`);
    return false;
  }
}

async function generateAll() {
  await ensureWorkDir();
  console.log(`Generating ${PROMPTS.length} reference frames into ${WORK_DIR}…`);
  // Sequential — fal billing is per-call, no real benefit to parallelism
  // here; sequential gives us cleaner progress + lower risk of rate limits.
  let ok = 0;
  for (let i = 0; i < PROMPTS.length; i++) {
    const success = await generateOne(PROMPTS[i], i + 1);
    if (success) ok += 1;
  }
  console.log(`\nGenerated ${ok}/${PROMPTS.length} frames.\n`);
  if (ok < 12) {
    console.error("Too few successful generations to train a meaningful LoRA. Aborting.");
    process.exit(1);
  }
}

async function zipDir() {
  console.log(`Zipping ${WORK_DIR} → ${ZIP_PATH}…`);
  return new Promise((resolve, reject) => {
    // Use system `zip` (macOS / Linux) — no extra dependency.
    // -j: junk paths (store images at the root of the archive, not nested).
    // -r is omitted because we're zipping individual files at one depth.
    const proc = spawn("zip", ["-j", "-r", ZIP_PATH, WORK_DIR]);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip exited ${code}`));
    });
    proc.on("error", reject);
  });
}

async function uploadZip() {
  console.log("Uploading zip to FAL storage…");
  const buf = await readFile(ZIP_PATH);
  // Browser-style File constructor isn't available in Node; FAL accepts
  // Buffers via storage.upload too, but the cleanest path is a Blob.
  const blob = new Blob([buf], { type: "application/zip" });
  // The fal client's storage.upload accepts a File-like with a name.
  // We polyfill by using a File wrapper.
  const file = new File([blob], "ghost-lora-training.zip", { type: "application/zip" });
  const url = await fal.storage.upload(file);
  console.log(`  uploaded: ${url}\n`);
  return url;
}

async function trainLora(zipUrl) {
  console.log("Submitting flux-lora-fast-training job…");
  const startedAt = Date.now();
  const result = await fal.subscribe("fal-ai/flux-lora-fast-training", {
    input: {
      images_data_url: zipUrl,
      // 1000 steps is a reasonable middle ground — enough for the LoRA to
      // capture the character's identity markers without overfitting on
      // the specific scenes we generated as training data.
      steps: 1000,
      // No trigger word — we want the LoRA to nudge every Ghost generation,
      // not require a specific token.
    },
    logs: true,
    onQueueUpdate: (u) => {
      if (u.status === "IN_PROGRESS") {
        process.stdout.write(".");
      }
    },
  });
  const elapsed = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
  console.log(`\nTraining complete in ${elapsed} min.\n`);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  if (SKIP_GENERATE) {
    console.log(`--skip-generate set; using existing images in ${WORK_DIR}`);
    const files = await readdir(WORK_DIR).catch(() => []);
    const pngs = files.filter((f) => f.endsWith(".png"));
    if (pngs.length < 12) {
      console.error(`Only ${pngs.length} png(s) in ${WORK_DIR}. Aborting.`);
      process.exit(1);
    }
    console.log(`  found ${pngs.length} png(s)\n`);
  } else {
    await generateAll();
  }

  await zipDir();
  const zipUrl = await uploadZip();
  const result = await trainLora(zipUrl);

  const loraUrl = result?.data?.diffusers_lora_file?.url;
  if (!loraUrl) {
    console.error("Training succeeded but no diffusers_lora_file in response:");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("─".repeat(60));
  console.log("LoRA URL:");
  console.log(`  ${loraUrl}`);
  console.log("─".repeat(60));
  console.log();

  // Write the URL into src/lib/journeys/ghost-lora.ts so the runtime
  // picks it up on next build/restart — no manual edit required.
  const tsContent =
    "/**\n" +
    " * Ghost-angel character LoRA URL.\n" +
    " *\n" +
    " * Trained via scripts/train-ghost-lora.mjs (~$8 one-time). The training\n" +
    " * script overwrites this file on success — re-run it (e.g. on a curated\n" +
    " * image set) to retrain and update the URL in place.\n" +
    " *\n" +
    " * When non-null, the AI image generator routes Ghost-journey frames\n" +
    " * through fal-ai/flux-lora with this LoRA attached, giving every frame\n" +
    " * the character's consistent identity (white spiral fibonacci hair,\n" +
    " * translucent mist dress, wispy wings, eyes closed, face obscured)\n" +
    " * without per-call PuLID reference cost. When null, Ghost generation\n" +
    " * falls back to plain flux/dev with the descriptor prompt.\n" +
    " */\n" +
    `export const GHOST_LORA_URL: string | null = ${JSON.stringify(loraUrl)};\n` +
    `export const GHOST_LORA_TRAINED_AT = ${JSON.stringify(new Date().toISOString())};\n`;
  await writeFile(LORA_TS_PATH, tsContent, "utf8");
  console.log(`Wrote LoRA URL to ${LORA_TS_PATH}`);
  console.log("Restart the Next.js dev server (or rebuild) to pick it up.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
