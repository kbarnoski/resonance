#!/usr/bin/env node
/**
 * ABSTRACT MOTIF FORMS — the designs the particles form DURING journeys
 * (Karel 2026-10-08: "i dont want literal forms drawn during the journey thats
 * for the emblems. the rest need to be endless design variety … geometric,
 * mandalas, abstract, and motion stuff for during" → samples: "i like all
 * those images"). Feathery light, soft edges (no hard outlines), non-literal,
 * tinted by the journey palette in play, so prompts stay white.
 *
 *   node --env-file=.env.local scripts/motif-forms-abstract.mjs [--only fire,water] [--force]
 * → public/tramokyo-pack/motif-forms/<fam>-a<N>.jpg, appended to motif-forms.json
 *   (and its *.pre-form-review.json pristine copy, so apply-form-removals keeps them).
 * Laws: never literal (no objects / figures / creatures / plants), Ghost never
 * mandalas or radial geometry (its abstracts are veils, threads, spirals).
 */
import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

fal.config({ credentials: process.env.FAL_KEY });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const argv = process.argv.slice(2);
const only = argv.includes("--only") ? new Set(argv[argv.indexOf("--only") + 1].split(",")) : null;
const force = argv.includes("--force");

const prompt = (subject, mood) => `an abstract ${subject}, ${mood}, made purely of light, non-representational sacred geometry, large and filling most of the frame — traced by countless tiny glowing motes and hair-fine feathery filaments, translucent like luminous dust and mist, soft feathered edges with no hard outlines, intricate and mesmerizing, a softly glowing core, long-exposure photograph of drifting light dust, pure white and silver light, floating alone in deep black night, no objects, no figures, no creatures, no plants, no text`;

const N = [5, 6, 7, 8, 9, 10, 12, 16, 24];
const pick = (arr, i) => arr[i % arr.length];
const STRUCT = {
  mandala: (i) => `${pick(N, i)}-fold mandala of interlacing light filaments`,
  rosette: (i) => `${pick(N, i + 2)}-fold rosette of overlapping translucent lenses of light`,
  starLattice: (i) => `kaleidoscopic ${pick([6, 8, 10, 12], i)}-fold star lattice`,
  girih: (i) => `girih tessellation of ${pick([8, 10, 12, 16], i)}-point stars`,
  starPoly: (i) => `nested star polygons of ${pick([7, 9, 11, 12, 16], i)} points`,
  yantra: () => "sri yantra of interlocking triangles within rings of lenses",
  flowerOfLife: () => "flower of life of overlapping circles",
  apollonian: () => "Apollonian gasket of nested circles",
  moire: (i) => pick(["moiré interference of concentric ripples overlapping", "interference of two sets of ripples crossing", "standing-wave interference rings"], i),
  goldenSpiral: (i) => pick(["spiral of nested golden-ratio arcs", "logarithmic spiral of feathered arcs", "double golden spiral turning inward"], i),
  phyllotaxis: (i) => pick(["Fibonacci phyllotaxis spiral of glowing points", "sunflower-seed spiral of light points, abstract", "phyllotaxis disc of tiny glowing lenses"], i),
  harmonograph: (i) => pick(["harmonograph figure of looping light threads", "decaying harmonograph spiral of light threads", "harmonograph rosette of crossing loops"], i),
  lissajous: (i) => pick(["Lissajous knot of a single endless light thread", "Lissajous figure of woven light threads", "three-dimensional Lissajous curve of light"], i),
  roseCurve: (i) => `rose curve of ${pick([5, 7, 8, 9, 12], i)} petals traced by light`,
  torus: (i) => pick(["toroidal flow field of light lines folding through itself", "torus of looping light threads seen at an angle", "nested tori of light filaments"], i),
  vortex: (i) => pick(["vortex of flowing curved light ribbons in motion", "whirlpool of feathered light streams", "spiral vortex of fine light threads"], i),
  curvedRays: (i) => pick(["radiating burst of fine curved rays spiralling outward", "pinwheel of curved light rays", "fan of curving rays turning around a core"], i),
  chladni: (i) => pick(["chladni resonance pattern of fine light dust", "cymatic standing-wave figure of light dust", "resonance figure of nodal lines in light dust"], i),
  koch: (i) => pick(["Koch-like fractal star of recursive light filaments", "recursive fractal snowflake curve of light", "self-similar fractal rosette of light"], i),
  rings: (i) => pick(["concentric rings of beaded light pulsing outward", "nested rings of light dust at slight tilts", "rings of fine light threads interlocking"], i),
  knotwork: (i) => pick(["interlacing knotwork medallion of light bands", "endless knot of interlacing light ribbons", "woven knot rosette of light threads"], i),
  spirograph: (i) => pick(["spirograph of nested epicycles", "epicycle rosette of looping light", "hypotrochoid star of light threads"], i),
  hexCells: (i) => pick(["radial lattice of hexagonal light cells", "honeycomb mandala of glowing cells", "cellular radial lattice of light"], i),
  doubleSpiral: (i) => pick(["double spiral of counter-rotating light streams", "two interleaved spirals of light dust", "galaxy-like double spiral of light filaments, abstract"], i),
  fractalFiligree: (i) => `branching fractal filigree radiating in ${pick([5, 6, 8, 12], i)}-fold symmetry`,
  // Ghost: abstract ghostly — never radial geometry
  veil: (i) => pick(["folding veil of translucent light", "curtain of light threads drifting upward", "billowing sheet of mist light folding over itself", "long trailing veil of light unfurling"], i),
  threads: (i) => pick(["flowing streams of light threads drifting", "braided streams of mist light", "slow river of light filaments curving away"], i),
  smokeSpiral: (i) => pick(["slow spiral of luminous mist", "curling ribbon of mist light", "spiralling breath of light dust rising"], i),
  // First Light: abstract sunrise
  risingFan: (i) => pick(["fan of rays rising from a low glowing arc", "nested semicircular arcs of rays lifting upward", "radiant half-mandala of rays rising"], i),
};

const MOOD = {
  fire: "radiant and flaring, rising upward with flickering energy",
  water: "rippling and liquid, flowing and calm",
  floral: "soft and petal-like yet entirely abstract, gently opening",
  green: "organic and growing, branching and spiralling",
  air: "drifting and streaming, airy and in slow motion",
  cosmos: "orbiting and vast, slowly turning",
  crystal: "crystalline and precise, cold and shimmering",
  light: "radiant and luminous, emanating outward",
  geo: "precise and intricate, perfectly balanced",
  ghost: "ghostly and ethereal, drifting and dissolving",
  dawn: "rising and warming, lifting like first light",
};
// structures per family (each family's flavour; repeated structures vary by index)
const PLAN = {
  fire: ["curvedRays", "vortex", "rosette", "starPoly", "mandala", "doubleSpiral", "goldenSpiral", "fractalFiligree", "spirograph", "curvedRays", "vortex", "rings", "starLattice", "koch", "harmonograph", "rosette", "mandala", "torus", "chladni", "lissajous", "knotwork", "phyllotaxis", "girih", "doubleSpiral", "starPoly"],
  water: ["moire", "harmonograph", "rosette", "goldenSpiral", "rings", "vortex", "lissajous", "moire", "chladni", "torus", "mandala", "flowerOfLife", "rings", "harmonograph", "doubleSpiral", "roseCurve", "moire", "knotwork", "spirograph", "apollonian", "phyllotaxis", "starLattice", "lissajous", "vortex", "rosette"],
  floral: ["rosette", "roseCurve", "phyllotaxis", "flowerOfLife", "mandala", "roseCurve", "rosette", "fractalFiligree", "spirograph", "goldenSpiral", "apollonian", "rosette", "mandala", "knotwork", "phyllotaxis", "roseCurve", "starPoly", "harmonograph", "rings", "girih", "mandala", "flowerOfLife", "chladni", "rosette", "lissajous"],
  green: ["fractalFiligree", "phyllotaxis", "goldenSpiral", "knotwork", "fractalFiligree", "doubleSpiral", "hexCells", "rosette", "koch", "mandala", "phyllotaxis", "goldenSpiral", "fractalFiligree", "spirograph", "girih", "lissajous", "vortex", "flowerOfLife", "chladni", "roseCurve", "hexCells", "koch", "harmonograph", "rings", "mandala"],
  air: ["vortex", "harmonograph", "lissajous", "curvedRays", "torus", "doubleSpiral", "goldenSpiral", "harmonograph", "lissajous", "vortex", "rings", "moire", "spirograph", "curvedRays", "roseCurve", "torus", "knotwork", "chladni", "phyllotaxis", "mandala", "rosette", "doubleSpiral", "starLattice", "fractalFiligree", "vortex"],
  cosmos: ["torus", "spirograph", "doubleSpiral", "rings", "goldenSpiral", "vortex", "torus", "lissajous", "apollonian", "starPoly", "rings", "spirograph", "harmonograph", "mandala", "doubleSpiral", "phyllotaxis", "curvedRays", "moire", "koch", "rosette", "torus", "knotwork", "starLattice", "chladni", "girih"],
  crystal: ["koch", "starLattice", "hexCells", "fractalFiligree", "mandala", "koch", "girih", "starPoly", "hexCells", "starLattice", "apollonian", "flowerOfLife", "chladni", "rosette", "fractalFiligree", "mandala", "koch", "spirograph", "rings", "knotwork", "starLattice", "hexCells", "yantra", "moire", "starPoly"],
  light: ["curvedRays", "mandala", "starPoly", "rings", "rosette", "starLattice", "curvedRays", "yantra", "mandala", "flowerOfLife", "spirograph", "chladni", "goldenSpiral", "girih", "koch", "rosette", "harmonograph", "starPoly", "torus", "phyllotaxis", "apollonian", "mandala", "knotwork", "moire", "curvedRays"],
  geo: ["girih", "yantra", "knotwork", "starPoly", "flowerOfLife", "apollonian", "girih", "spirograph", "hexCells", "mandala", "starLattice", "knotwork", "chladni", "koch", "roseCurve", "girih", "rosette", "lissajous", "starPoly", "phyllotaxis", "mandala", "moire", "torus", "yantra", "harmonograph"],
  ghost: ["veil", "threads", "smokeSpiral", "veil", "threads", "smokeSpiral", "veil", "threads", "vortex", "harmonograph", "veil", "smokeSpiral", "lissajous", "threads", "veil", "doubleSpiral", "smokeSpiral", "threads", "veil", "torus"],
  dawn: ["risingFan", "curvedRays", "risingFan", "rings", "risingFan", "goldenSpiral", "curvedRays", "risingFan", "harmonograph", "risingFan"],
};

const OUT = path.join(ROOT, "public/tramokyo-pack/motif-forms");
const MAPS = [path.join(ROOT, "public/tramokyo-pack/motif-forms.json"), path.join(ROOT, "public/tramokyo-pack/motif-forms.pre-form-review.json")];
const backupDir = path.join(os.homedir(), "Documents/Resonance", `motif-forms-backup-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(MAPS[0], path.join(backupDir, `motif-forms.before-abstract-${Date.now()}.json`));

const jobs = [];
for (const [fam, list] of Object.entries(PLAN)) {
  if (only && !only.has(fam)) continue;
  const seen = new Map();
  list.forEach((k, i) => { const n = seen.get(k) ?? 0; seen.set(k, n + 1); jobs.push({ fam, n: i + 1, subj: STRUCT[k](n + i), url: `/tramokyo-pack/motif-forms/${fam}-a${i + 1}.jpg` }); });
}
let k = 0, ok = 0, fail = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (k < jobs.length) {
    const j = jobs[k++];
    const file = path.join(ROOT, "public", j.url);
    if (fs.existsSync(file) && !force) { ok++; continue; }
    try {
      const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: prompt(j.subj, MOOD[j.fam]), image_size: "square_hd", num_inference_steps: 30, guidance_scale: 3.5, num_images: 1, seed: 1000 + jobs.indexOf(j) * 7, enable_safety_checker: true } });
      fs.writeFileSync(file, Buffer.from(await (await fetch(r.data.images[0].url)).arrayBuffer()));
      ok++;
      if (ok % 25 === 0) console.log(`  ${ok}/${jobs.length}`);
    } catch (e) { fail++; console.error(`FAIL ${j.fam}-a${j.n}: ${e.message}`); }
  }
}));
for (const MAP of MAPS) {
  const map = JSON.parse(fs.readFileSync(MAP, "utf8"));
  for (const j of jobs) {
    if (!fs.existsSync(path.join(ROOT, "public", j.url))) continue;
    map[j.fam] = map[j.fam] ?? [];
    if (!map[j.fam].includes(j.url)) map[j.fam].push(j.url);
  }
  fs.writeFileSync(MAP, JSON.stringify(map, null, 1));
}
fs.writeFileSync(path.join(ROOT, "scripts/motif-forms-abstract.subjects.json"), JSON.stringify(jobs.map((j) => ({ url: j.url, subject: j.subj })), null, 1));
console.log(`${ok} ok, ${fail} failed (backup ${backupDir})`);
