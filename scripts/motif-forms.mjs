#!/usr/bin/env node
// Motif-form library (Karel 2026-10-06: "realized … i'd expect a intricate flame
// … not flowers but diverse forms related to the imagery … super delicate and
// elegant and rich and detailed and [visionary] islamic"). Per imagery family,
// five intricate Islamic-geometric filigree designs, rendered in luminous
// white-gold on black so the particle field can form them and TINT them with
// each journey's palette. Pattern only — never calligraphy or text.
// Out: public/tramokyo-pack/motif-forms/<family>-<n>.jpg + motif-forms.json
import fs from "node:fs";
import path from "node:path";
import { fal } from "@fal-ai/client";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
fal.config({ credentials: process.env.FAL_KEY });
export const FAMILIES = {
  fire: [
    "a tall flickering flame whose tongues are filled with intricate arabesque filigree, unmistakably a flame",
    "three rising flames intertwined, each tongue of fire made of fine Islamic lattice and interlace",
    "a paisley boteh flame built of fine glowing lattice and interlace",
    "a ring of upward-licking flames around a radiant star, a flame medallion of fine filigree",
    "a great flame rising from a lotus of embers, its fire drawn as delicate strapwork and star motifs",
  ],

  water: [
    "a wave arabesque of interlacing filigree like a Moorish tile",
    "concentric ripples drawn as a girih star medallion",
    "a fountain of luminous water drawn as symmetrical strapwork",
    "a pool of caustic light as an eight-point star lattice",
    "a crescent of flowing water lines tied with rosette knots",
  ],
  floral: [
    "a blossoming flower medallion of arabesque petals",
    "a vine scroll of lotus and tulip motifs in the Islamic illumination style",
    "a pomegranate and palmette rosette of fine lace",
    "a cascade of tiny filigree blossoms around a twelve-point star",
    "a twelve-petal rosette of luminous lace",
  ],
  green: [
    "an islimi arabesque of interlacing leaves and vines",
    "a canopy of palmettes as a symmetrical filigree medallion",
    "fern fronds drawn as mirrored strapwork",
    "a mushroom cap rosette of radiating lamellae lattice",
    "a seed-pod mandala of fine lattice and spirals",
  ],
  air: [
    "a swirl of wind as interlacing arabesque bands",
    "a cloud-collar motif of luminous lace",
    "a rising smoke spiral of fine filigree",
    "a field of eight-point stars like a desert lattice",
    "a muqarnas vault seen from below, stalactite geometry of light",
  ],
  cosmos: [
    "a celestial medallion of sixteen-point stars",
    "an astrolabe of luminous filigree rings and star pointers",
    "a spiral galaxy drawn as arabesque interlace",
    "a planetary rosette of nested star polygons",
    "a constellation lattice of girih stars",
  ],
  crystal: [
    "an intricate fractal snowflake mandala of nested hexagonal frames",
    "a frost crystal lattice of twelve-point stars",
    "an ice rosette of nested hexagonal filigree",
    "a crystalline girih tessellation of ten-point stars",
    "a prism star of interlocking eight-point rosettes",
  ],
  light: [
    "a sunburst of luminous rays as a sixteen-point girih star",
    "a halo rosette of fine lace",
    "a radiant medallion of light beams and nested stars",
    "a golden star lattice glowing from within",
    "rays of light woven into an arabesque crown",
  ],
  // Ghost (Karel 2026-10-06: "ghostly angels ghosts wings and those pink flowers
  // not mandalas") — no face, ever (Ghost's law)
  ghost: [
    "a ghostly angel seen from behind, wings spread wide, woven from white lace filigree, no face visible",
    "a pair of ethereal angel wings woven from luminous filigree feathers",
    "a flowing spirit veil of lace drifting upward like a ghost, no face",
    "a spray of pink cherry blossoms drawn as delicate arabesque filigree, no trunk",
    "a faceless angel silhouette of pure light and lace, seen from behind, dissolving into drifting pink blossom petals",
  ],
  // First Light (Karel 2026-10-06: "your journey particle form should be a rising
  // sun … play on light and the sun rise … color and form")
  dawn: [
    "a rising sun of intricate filigree rays lifting over a horizon of layered arabesque lines",
    "sunrise rays fanning upward from a half-risen sun, each ray a strand of fine lattice",
    "a sun disc emerging through horizontal bands of delicate strapwork, dawn light",
    "beams of dawn light breaking through cloud bands drawn as luminous lace",
    "a radiant sun rosette of nested star polygons lifting into the sky",
  ],
  geo: [
    "a dense girih tessellation of ten-point stars",
    "an interlacing knot medallion",
    "a silk ribbon arabesque of endless interlace",
    "a twelve-point star tiling",
    "a mashrabiya lattice screen of light",
  ],
};
const outDir = path.join(ROOT, "public/tramokyo-pack/motif-forms");
fs.mkdirSync(outDir, { recursive: true });
const mapPath = path.join(ROOT, "public/tramokyo-pack/motif-forms.json");
const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const jobs = [];
for (const [fam, list] of Object.entries(FAMILIES)) {
  if (only && !only.includes(fam)) continue;
  list.forEach((d, i) => jobs.push({ fam, i, d }));
}
async function run(j) {
  const file = `/tramokyo-pack/motif-forms/${j.fam}-${j.i + 1}.jpg`;
  if (fs.existsSync(path.join(ROOT, "public", file)) && !process.argv.includes("--force")) return file;
  const prompt = `${j.d}, super delicate, elegant, rich and intricately detailed visionary Islamic geometric ornament, crisp fine luminous linework in glowing white and pale gold light, perfectly balanced, mesmerizing, flat 2D, centered, isolated on a pure black background, generous black margin, no calligraphy, no text, no frame, high contrast`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt, image_size: "square_hd", num_inference_steps: 30, guidance_scale: 4, num_images: 1 } });
      fs.writeFileSync(path.join(ROOT, "public", file), Buffer.from(await (await fetch(r.data.images[0].url)).arrayBuffer()));
      return file;
    } catch (e) { if (a === 2) { console.error("FAIL", j.fam, j.i + 1, e.message); return null; } }
  }
}
for (let k = 0; k < jobs.length; k += 3) {
  const res = await Promise.all(jobs.slice(k, k + 3).map(run));
  jobs.slice(k, k + 3).forEach((j, n) => { if (res[n]) { (map[j.fam] ??= []); map[j.fam][j.i] = res[n]; console.error("ok", j.fam, j.i + 1); } });
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 1));
}
console.error("done", Object.values(map).flat().length);
