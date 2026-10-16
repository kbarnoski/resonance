#!/usr/bin/env node
// JOSEPH SONG EMBLEMS (Karel 2026-10-16: "you gotta confirm each song of his
// gets an emblem that appears in beginning and end and sometimes middle just
// like the other journeys. you tend to reinvent stuff we already defined").
// The SAME recipe as scripts/journey-emblems.mjs — one iconic subject named by
// Sonnet from the title (+ the song's own steering words and analysed arc),
// rendered with the identical FEATHERY light-dust prompt. Timing is the
// existing emblemEnvelope (opening under the title, mid-way in > 200 s songs,
// the last 17 s) — nothing new.
//
// Out: public/tramokyo-pack/emblems/joseph/<id>.jpg + public/tramokyo-pack/joseph/joseph-emblems.json
//      ({ "<track id>": "/tramokyo-pack/emblems/joseph/<id>.jpg" }); concepts cached in scripts/joseph-emblems.json
// Usage: npx jiti scripts/joseph-emblems.mjs [--only id,id] [--force] [--reconcept]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fal } from "@fal-ai/client";
import { JOSEPH_TRACKS } from "../src/lib/journeys/joseph-set.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
fal.config({ credentials: process.env.FAL_KEY });
const client = new Anthropic();
const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",").map((s) => s.trim())) : null;
const force = args.includes("--force");
const OUT_DIR = path.join(ROOT, "public/tramokyo-pack/emblems/joseph");
fs.mkdirSync(OUT_DIR, { recursive: true });
const cachePath = path.join(ROOT, "scripts/joseph-emblems.json");
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
const mapPath = path.join(ROOT, "public/tramokyo-pack/joseph/joseph-emblems.json");
const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};
const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, "public/tramokyo-pack/joseph/joseph-set.json"), "utf8"));
const arcOf = Object.fromEntries((analysis.tracks ?? []).map((t) => [t.id, t.arc]));

async function concept(t) {
  // journey-emblems.mjs concept(), with the song's own words + arc in place of imagery motifs
  const prompt = `A visionary music piece is titled "${t.title}". Its imagery and mood words: ${t.words.join(", ")}. Musical arc: ${arcOf[t.id] ?? "unknown"}.
At the start, while the title is on screen, a particle system will ASSEMBLE INTO ONE ICONIC EMBLEM so the viewer instantly connects the title and theme (e.g. "Yellow Bird" → a yellow sparrow; "Snowflake" → a snowflake; "Realized" (lava/fire) → a flame).
Choose ONE emblem: a single iconic subject (creature, plant, natural element, celestial or symbolic object) — never a person or a face, never text, never a scene. Ice, snow or crystal subjects ONLY for the title "Snowflake". No drug imagery. If the title is abstract, choose the subject that best embodies its mood and imagery. Colour it from the title if the title names a colour, else from the mood words.
Reply JSON only: {"subject":"<2-5 words>","color":"<colour words>","why":"<one short sentence>"}`;
  const r = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 500, messages: [{ role: "user", content: prompt }] });
  const txt = r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
}

async function render(c, file) {
  // identical to journey-emblems.mjs render() (FEATHERY LIGHT-DUST, Karel 2026-10-07)
  const color = c.color.replace(/\(?#[0-9a-f]{6}[^)]*?\)?/gi, "").replace(/\s+/g, " ").replace(/\s+([,)])/g, "$1").trim();
  const prompt = `an ethereal ${c.subject} made purely of light, large and filling most of the frame — its whole form traced by countless tiny glowing motes and hair-fine feathery wisps, translucent like luminous dust and mist with no solid surfaces, delicate fern-like filaments fraying outward, a gentle swirl of light around a softly glowing core, layered veils of light, long-exposure photograph of drifting light dust, ${color}, floating alone in deep black night`;
  const res = await fal.subscribe("fal-ai/flux/dev", { input: { prompt, image_size: "square_hd", num_inference_steps: 30, guidance_scale: 3.5, num_images: 1, enable_safety_checker: true } });
  const url = res.data?.images?.[0]?.url;
  if (!url) throw new Error("no image");
  fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return prompt;
}

for (const t of JOSEPH_TRACKS) {
  if (only && !only.has(t.id)) continue;
  const file = `/tramokyo-pack/emblems/joseph/${t.id}.jpg`;
  const abs = path.join(ROOT, "public", file.replace(/^\//, ""));
  if (cache[t.id]?.file && fs.existsSync(abs) && !force) { map[t.id] = file; continue; }
  try {
    const c = cache[t.id]?.subject && !args.includes("--reconcept") ? cache[t.id] : await concept(t);
    c.prompt = await render(c, abs);
    c.file = file;
    cache[t.id] = c;
    map[t.id] = file;
    console.error(`${t.title} → ${c.color} ${c.subject} (${c.why})`);
  } catch (e) {
    console.error(`FAIL ${t.title}: ${e.message}`);
  }
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 1));
}
console.error(`joseph emblems: ${Object.keys(map).length} songs mapped`);
