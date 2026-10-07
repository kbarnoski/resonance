#!/usr/bin/env node
// FEATHERY EMBLEMS (Karel 2026-10-07): "have the emblem snowflake more like this
// design not your cartoony one same for all emblems. its this detail and
// styling i love of form" + "the emblem shouldnt have such a big frame around
// each of them. more focused on the inner design".
// Re-renders every cached emblem subject (scripts/journey-emblems.json) in the
// soft long-exposure light-dust style, subject large, no medallion/halo frame.
// Out: public/tramokyo-pack/emblems/feathery/<slug>.jpg (staging — promote after review)
// Usage: node scripts/emblems-feathery.mjs [--only "Yellow Bird,Realized"] [--force]
import fs from "node:fs";
import path from "node:path";
import { fal } from "@fal-ai/client";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
fal.config({ credentials: process.env.FAL_KEY });
const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",").map((s) => s.trim().toLowerCase())) : null;
const force = args.includes("--force");
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/journey-emblems.json"), "utf8"));
const OUT = path.join(ROOT, "public/tramokyo-pack/emblems/feathery");
fs.mkdirSync(OUT, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clean = (c) => String(c ?? "").replace(/\(?#[0-9a-f]{6}[^)]*?\)?/gi, "").replace(/\s+/g, " ").replace(/\s+([,)])/g, "$1").trim();

// never the word "heart" — flux drew a literal heart for ~20 titles
const prompt = (subject, color) =>
  `an ethereal ${subject} made purely of light, large and filling most of the frame — its whole form traced by countless tiny glowing motes and hair-fine feathery wisps, translucent like luminous dust and mist with no solid surfaces, delicate fern-like filaments fraying outward, a gentle swirl of light around a softly glowing core, layered veils of light, long-exposure photograph of drifting light dust, ${color}, floating alone in deep black night`;

const jobs = Object.entries(cache).filter(([t, c]) => t !== "Ghost" && t !== "Snowflake" && c?.subject && (!only || only.has(t.toLowerCase())));
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const [title, c] = jobs[i++];
    const file = path.join(OUT, `${slug(title)}.jpg`);
    if (fs.existsSync(file) && !force) continue;
    const subject = String(c.subject).replace(/\(.*?\)/g, "").trim();
    try {
      const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: prompt(subject, clean(c.color)), image_size: "square_hd", num_inference_steps: 30, guidance_scale: 3.5, num_images: 1, enable_safety_checker: true } });
      fs.writeFileSync(file, Buffer.from(await (await fetch(r.data.images[0].url)).arrayBuffer()));
      console.error(`ok ${title} → ${subject}`);
    } catch (e) {
      console.error(`FAIL ${title}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
