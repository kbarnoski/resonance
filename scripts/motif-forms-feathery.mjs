#!/usr/bin/env node
/**
 * FEATHERY MOTIF FORMS (Karel 2026-10-08: "you have many emblems and limited
 * forms … greatly expand form possibilities within the defined preferences" →
 * samples approved: "your read is good"). The original 54 motifs are all one
 * style (flat white-gold Islamic linework); these add ~9 designs per imagery
 * family in the emblem style he loves — made purely of light, wispy, organic,
 * no solid surfaces — mixing organic subjects with intricate sacred geometry.
 * Tinted by the journey palette in play (setImageTint 1), so prompts stay white.
 *
 *   node --env-file=.env.local scripts/motif-forms-feathery.mjs [--only fire,water] [--force]
 * Writes public/tramokyo-pack/motif-forms/<fam>-f<N>.jpg and appends them to
 * motif-forms.json (backup first). Laws: no faces (Ghost), never the word
 * "heart", no tiny forms (subjects fill the frame), no cubes / grids.
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

const prompt = (subject) => `an ethereal ${subject} made purely of light, large and filling most of the frame — its whole form traced by countless tiny glowing motes and hair-fine feathery wisps, translucent like luminous dust and mist with no solid surfaces, delicate fern-like filaments fraying outward, a gentle swirl of light around a softly glowing core, layered veils of light, long-exposure photograph of drifting light dust, pure white and silver light, floating alone in deep black night`;

export const FEATHERY = {
  fire: ["phoenix rising with wings spread wide", "plume of flame feathers swirling upward", "firebird's long trailing tail plume", "spiral of rising embers curling like a comet", "lotus whose petals are tongues of flame", "curling ribbon of fire smoke", "burst of flame petals opening outward", "solar flare corona arching in loops", "pair of flame wings beating upward"],
  water: ["jellyfish with long trailing tendrils", "nautilus shell spiral", "breaking wave curling into mist", "sea anemone with swaying fronds", "manta ray gliding with wide wings", "two koi circling each other in a spiral", "crown splash of a falling droplet", "seahorse curled in a spiral", "fan of coral branching outward"],
  floral: ["peony unfolding layer by layer", "orchid with sweeping petals", "spiral of petals carried by the wind", "dahlia mandala of countless petals", "rose seen from above, a spiral of petals", "cascade of wisteria blossoms", "passionflower with radiating filaments", "magnolia opening wide", "ring of blossoms turning slowly"],
  green: ["fern frond slowly unfurling", "ginkgo leaf fan", "spiral of leaves rising on a breeze", "mushroom cap seen from below, its radiating gills glowing", "willow branches cascading downward", "pinecone fibonacci spiral seen from above", "curling vine tendril spiral", "skeleton of a leaf with branching veins", "burst of seeds and spores drifting outward"],
  air: ["dandelion seed head releasing seeds, no stem", "single feather drifting", "great wings of a heron spread in a wide arc, abstract", "swirling ribbons of wind", "murmuration of birds folding into a spiral", "smoke ring drifting and unfurling", "hummingbird hovering, wings a blur of light", "spiral cloud vortex", "flock of seeds blown in a long arc"],
  cosmos: ["spiral galaxy filling the frame", "towering nebula pillar", "planet wrapped in rings of dust", "comet with a long sweeping tail", "two stars circling in a binary dance", "expanding supernova shell", "eye-shaped nebula with a glowing pupil", "accretion ring around a dark centre", "web of constellations linked by threads of light"],
  crystal: ["visionary fractal snowflake with six feathery arms", "frost fern patterns spreading across glass", "radiant ice crystal star", "geode blooming open with crystal spikes", "frozen bubble covered in frost flowers", "hexagonal frost mandala", "plume of ice feathers", "frost spiral unwinding", "cluster of ice needles radiating from a centre"],
  light: ["peacock feather", "radiant halo of fine rays", "prism burst splitting into rays", "rays fanning through mist", "lantern orb trailing glowing filaments", "starburst of fine needle rays", "spiral of light ribbons", "flower made of rays of light", "aurora-like veil of light folding, abstract"],
  geo: ["flower of life sacred geometry of overlapping circles", "intricate eight-point star rosette of interlacing bands", "sri yantra of interlocking triangles", "torus traced by flowing lines of light", "seed of life of seven circles", "twelve-fold mandala of feathers", "nested hexagram rosette", "golden-ratio spiral of nested arcs", "rosette of interlaced circles like a lace doily"],
  // Ghost law: angels / wings / pink flowers, never a face; never mandalas
  ghost: ["angel seen from behind with wings spread wide, no face", "pair of feathered angel wings", "spirit veil drifting upward, no face", "spray of cherry blossoms", "faceless angel dissolving into drifting petals, seen from behind", "lone feather drifting down", "dove in flight seen from below", "wings folding around a glow of light"],
  // First Light: the rising sun
  dawn: ["sun rising with fine rays fanning upward", "sun disc breaking through bands of cloud", "sunrise glow lifting over a horizon of mist", "rays of dawn light streaming through clouds"],
};

const OUT = path.join(ROOT, "public/tramokyo-pack/motif-forms");
const MAP = path.join(ROOT, "public/tramokyo-pack/motif-forms.json");
const map = JSON.parse(fs.readFileSync(MAP, "utf8"));
const backupDir = path.join(os.homedir(), "Documents/Resonance", `motif-forms-backup-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(path.join(backupDir, "motif-forms.json"))) fs.copyFileSync(MAP, path.join(backupDir, "motif-forms.json"));

const jobs = [];
for (const [fam, list] of Object.entries(FEATHERY)) {
  if (only && !only.has(fam)) continue;
  list.forEach((subj, i) => jobs.push({ fam, n: i + 1, subj, url: `/tramokyo-pack/motif-forms/${fam}-f${i + 1}.jpg` }));
}
let k = 0, ok = 0, fail = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (k < jobs.length) {
    const j = jobs[k++];
    const file = path.join(ROOT, "public", j.url);
    if (fs.existsSync(file) && !force) { ok++; continue; }
    try {
      const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: prompt(j.subj), image_size: "square_hd", num_inference_steps: 30, guidance_scale: 3.5, num_images: 1, enable_safety_checker: true } });
      fs.writeFileSync(file, Buffer.from(await (await fetch(r.data.images[0].url)).arrayBuffer()));
      ok++;
    } catch (e) { fail++; console.error(`FAIL ${j.fam}-f${j.n}: ${e.message}`); }
  }
}));
for (const j of jobs) {
  if (!fs.existsSync(path.join(ROOT, "public", j.url))) continue;
  map[j.fam] = map[j.fam] ?? [];
  if (!map[j.fam].includes(j.url)) map[j.fam].push(j.url);
}
fs.writeFileSync(MAP, JSON.stringify(map, null, 1));
console.log(`${ok} ok, ${fail} failed → ${MAP} (backup ${backupDir})`);
