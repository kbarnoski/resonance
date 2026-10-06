#!/usr/bin/env node
// Journey EMBLEMS (Karel 2026-10-06): "the particles would assemble into a
// form that represents each … yellow bird should have the particles assemble
// into a yellow sparrow design in the beginning long enough that the title and
// seeing this form communicates to the viewer the journey name and theme …
// ghost … the angel form … a snowflake for that … realized … a flame."
//
// 1. CONCEPT — per base title (take numbers stripped), Sonnet reads the title,
//    the vision-tagged imagery and the palette and names ONE iconic emblem.
// 2. IMAGE — fal flux renders it as a single luminous emblem on pure black
//    (the particle field forms it: bright pixels become the form).
// Ghost keeps its real angel (the flash image) — no generation.
//
// Out: public/tramokyo-pack/emblems/<slug>.jpg, public/tramokyo-pack/local-emblems.json
//      ({ journeyId: "/tramokyo-pack/emblems/<slug>.jpg" }), scripts/journey-emblems.json
// Usage: node scripts/journey-emblems.mjs journeys.json [--only "Yellow Bird,Snowflake"] [--force]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fal } from "@fal-ai/client";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
fal.config({ credentials: process.env.FAL_KEY });
const client = new Anthropic();
const args = process.argv.slice(2);
const journeys = JSON.parse(fs.readFileSync(args[0], "utf8"));
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",").map((s) => s.trim().toLowerCase())) : null;
const force = args.includes("--force");
const conceptsOnly = args.includes("--concepts-only");
const OUT_DIR = path.join(ROOT, "public/tramokyo-pack/emblems");
fs.mkdirSync(OUT_DIR, { recursive: true });
const cachePath = path.join(ROOT, "scripts/journey-emblems.json");
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
const mapPath = path.join(ROOT, "public/tramokyo-pack/local-emblems.json");
const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};

const base = (name) => name.replace(/\s*\((expanded|jam)\)\s*$/i, "").replace(/\s+\d+[a-z]?$/i, "").trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const groups = new Map();
for (const [id, j] of Object.entries(journeys)) {
  const b = base(j.name);
  if (!groups.has(b)) groups.set(b, []);
  groups.get(b).push({ id, ...j });
}

async function concept(title, members) {
  const j = members[0];
  const prompt = `A visionary music journey is titled "${title}". Its projected imagery shows: ${j.motifs.slice(0, 4).join(" | ")}. Key colour ${j.key}; palette ${(j.colors ?? []).join(", ")}.
At the start, while the title is on screen, a particle system will ASSEMBLE INTO ONE ICONIC EMBLEM so the viewer instantly connects the title and theme (e.g. "Yellow Bird" → a yellow sparrow; "Snowflake" → a snowflake; "Realized" (lava/fire) → a flame).
Choose ONE emblem: a single iconic subject (creature, plant, natural element, celestial or symbolic object) — never a person or a face, never text, never a scene. Ice, snow or crystal subjects ONLY for the title "Snowflake". No drug imagery. If the title is abstract, choose the subject that best embodies its mood and imagery. Colour it from the title if the title names a colour, else from the palette.
Reply JSON only: {"subject":"<2-5 words>","color":"<colour words>","why":"<one short sentence>"}`;
  const r = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 500, messages: [{ role: "user", content: prompt }] });
  const t = r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
}

async function render(c, file) {
  const color = c.color.replace(/\(?#[0-9a-f]{6}[^)]*?\)?/gi, "").replace(/\s+/g, " ").replace(/\s+([,)])/g, "$1").trim();
  const prompt = `a single luminous ${color} ${c.subject} emblem, formed of glowing light and fine luminous detail, one centered iconic silhouette with a clear readable outline, isolated on a pure black background, no ground, no text, no frame, generous empty black margin around it, ethereal, elegant, visionary, high contrast, studio isolated`;
  const res = await fal.subscribe("fal-ai/flux/dev", { input: { prompt, image_size: "square_hd", num_inference_steps: 30, guidance_scale: 4, num_images: 1, enable_safety_checker: true } });
  const url = res.data?.images?.[0]?.url;
  if (!url) throw new Error("no image");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(file, buf);
  return prompt;
}

for (const [title, members] of groups) {
  if (only && !only.has(title.toLowerCase())) continue;
  const s = slug(title);
  if (title.toLowerCase() === "ghost") {
    for (const m of members) map[m.id] = "@angel";
    cache[title] = { subject: "angel (the flash image)", color: "pearl white", why: "Ghost's own angel", file: "@angel" };
    continue;
  }
  const files = [].concat(cache[title]?.file ?? []);
  if (files.length && !force && files.every((f) => fs.existsSync(path.join(ROOT, "public", f.replace(/^\//, ""))))) {
    for (const m of members) map[m.id] = cache[title].file;
    continue;
  }
  try {
    const c = cache[title]?.subject && !force ? cache[title] : await concept(title, members);
    if (conceptsOnly) { cache[title] = c; console.error(`${title} → ${c.color} ${c.subject} (${c.why})`); fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1)); continue; }
    const file = `/tramokyo-pack/emblems/${s}.jpg`;
    c.prompt = await render(c, path.join(ROOT, "public", file.replace(/^\//, "")));
    c.file = file;
    cache[title] = c;
    for (const m of members) map[m.id] = file;
    console.error(`${title} → ${c.color} ${c.subject} (${c.why})`);
  } catch (e) {
    console.error(`FAIL ${title}: ${e.message}`);
  }
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 1));
}
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
fs.writeFileSync(mapPath, JSON.stringify(map, null, 1));
console.error(`emblems: ${Object.keys(map).length} journeys mapped`);
