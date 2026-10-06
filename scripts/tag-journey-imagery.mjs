#!/usr/bin/env node
// Image intelligence for the particle system (Karel 2026-10-06: "it needs
// intelligence of the images it is layered on as input to the forms it
// shows. not literal but hint and abstraction of including associated
// movements" — e.g. Realized's lava/fire → abstract flames, blue → hot).
//
// For every journey phase in the Tramokyo pack: a 2×2 contact sheet of that
// phase's stills (pack slots are allocated to phases in order) → a vision
// model tags MOTIFS + MOVEMENT from a fixed vocabulary. Output:
//   scripts/journey-imagery-tags.json            (raw, resumable cache)
//   src/lib/particles/journey-motifs.generated.ts
//
// Usage: node scripts/tag-journey-imagery.mjs phasecounts.json [--only id,id] [--force]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const MODEL = "claude-sonnet-5-5";
export const MOTIFS = [
  "fire", "lava", "embers", "sun", "light-rays", "golden-light", "flowers", "blossoms", "petals",
  "leaves", "forest", "mushrooms", "vines", "water", "ocean-waves", "rain", "pool-ripples",
  "underwater", "ice-snow", "crystal", "clouds", "mist", "smoke", "wind", "sand-desert", "stone",
  "cave-tunnel", "stars", "nebula", "galaxy", "planet", "aurora", "figure", "wings-feathers",
  "birds-flock", "butterflies", "fireflies", "city-neon", "silk-fabric", "geometric",
];
export const MOVES = ["rising", "falling", "flowing", "swirling", "flickering", "drifting", "pulsing", "unfurling", "rippling", "spiraling", "streaming", "still"];

const args = process.argv.slice(2);
const phaseCounts = JSON.parse(fs.readFileSync(args[0], "utf8"));
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const force = args.includes("--force");
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "public/tramokyo-pack/local-images.json"), "utf8"));
const cachePath = path.join(ROOT, "scripts/journey-imagery-tags.json");
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
const client = new Anthropic();

async function sheet(paths) {
  const pick = [0, 1, 2, 3].map((i) => paths[Math.min(paths.length - 1, Math.floor(((i + 0.5) * paths.length) / 4))]);
  const tiles = await Promise.all(pick.map((p) => sharp(path.join(ROOT, "public", p.replace(/^\//, ""))).resize(384, 216, { fit: "cover" }).toBuffer()));
  return sharp({ create: { width: 768, height: 432, channels: 3, background: "#000" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * 384, top: Math.floor(i / 2) * 216 })))
    .jpeg({ quality: 80 }).toBuffer();
}

async function tag(buf) {
  const prompt = `These four frames are from one phase of a visionary music journey (projected art, abstract and surreal). A particle system will move over this imagery and should ECHO it abstractly — not literally.
Choose from these MOTIFS only: ${MOTIFS.join(", ")}.
Choose from these MOVEMENTS only: ${MOVES.join(", ")}.
Reply with JSON only: {"motifs":[{"m":"<motif>","w":<0..1>}, ... up to 3, strongest first],"moves":["<movement>", ... up to 2],"colorStory":"<4-8 words on how colour behaves, e.g. 'blue base flaring to hot orange'>"}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await client.messages.create({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } },
          { type: "text", text: prompt },
        ] }],
      });
      const txt = r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      j.motifs = (j.motifs ?? []).filter((x) => MOTIFS.includes(x.m)).slice(0, 3);
      j.moves = (j.moves ?? []).filter((x) => MOVES.includes(x)).slice(0, 2);
      if (j.motifs.length) return j;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

const jobs = [];
for (const [jid, paths] of Object.entries(idx)) {
  if (!paths?.length || !(jid in phaseCounts)) continue;
  if (only && !only.has(jid)) continue;
  const n = Math.max(1, phaseCounts[jid]);
  for (let i = 0; i < n; i++) {
    const key = `${jid}#${i}`;
    if (cache[key] && !force) continue;
    const a = Math.round((i * paths.length) / n), b = Math.max(a + 1, Math.round(((i + 1) * paths.length) / n));
    jobs.push({ key, jid, i, paths: paths.slice(a, b) });
  }
}
console.error(`${jobs.length} phase(s) to tag`);
let done = 0;
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    try {
      const t = await tag(await sheet(j.paths));
      if (t) cache[j.key] = t;
      console.error(`${++done} ${j.key} ${t ? t.motifs.map((x) => x.m).join("/") + " · " + t.moves.join("/") + " · " + t.colorStory : "—"}`);
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    } catch (e) {
      console.error(`FAIL ${j.key}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

// generated module: per journey, per phase
const out = {};
for (const [key, v] of Object.entries(cache)) {
  const [jid, i] = key.split("#");
  (out[jid] ??= [])[Number(i)] = { motifs: v.motifs, moves: v.moves, colorStory: v.colorStory };
}
fs.writeFileSync(path.join(ROOT, "src/lib/particles/journey-motifs.generated.ts"),
  "// GENERATED by scripts/tag-journey-imagery.mjs — do not edit.\n" +
  "// What each journey phase's IMAGERY shows (vision-tagged), so the particles echo it abstractly.\n" +
  "export interface PhaseMotif { motifs: { m: string; w: number }[]; moves: string[]; colorStory: string }\n" +
  "export const JOURNEY_MOTIFS: Readonly<Record<string, PhaseMotif[]>> = " + JSON.stringify(out, null, 1) + ";\n");
console.error(`wrote ${Object.keys(out).length} journeys`);
