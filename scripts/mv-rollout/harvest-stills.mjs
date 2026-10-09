#!/usr/bin/env node
// harvest-stills.mjs — Snowflake-Standard stills for one rollout set,
// staged OUTSIDE the pack (never touches public/tramokyo-pack).
//
// Slots: allocateByPhase(phases, N, TRAMOKYO_PHASE_WEIGHT) — the exact
// split the kiosk player uses — with N (default 36) raised until every
// phase holds >= 3 slots, so all three POV shots of every phase appear.
// Slot i in a phase renders shot floor(i/count*3) (the harvest/player
// convention). Each slot gets 2 options (a/b); pick-stills.mjs scores
// them and the human-eye QA swaps/re-rolls before install.
// Pipeline = the house harvest: fal-ai/flux/dev 28 steps / 3.5 / 1024²,
// strict camera (no POV rotation), Tramokyo grade by the phase's gradeAs,
// TRAMOKYO_STYLE_SUFFIX, GLOBAL + TRAMOKYO extra + material negatives.
//
// --n=current (2026-10-09 Expansion sample): keep the journey's CURRENT
// pack slot count (local-images.json length) instead of raising N until
// every phase has 3 slots — short phases then render only their first
// shot(s); the player derives N from the list length either way.
// --concurrency=N fal workers (default 6; use <=4 while the kiosk plays).
//
// Usage: node --env-file=.env.local scripts/mv-rollout/harvest-stills.mjs <set> --out=<dir> [--only=id,..] [--options=2] [--n=current|<N>] [--concurrency=6] [--reroll=<journeyId>:<slot>,...]
import { fal } from "@fal-ai/client";
import { createJiti } from "jiti";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TAIL } from "./tail.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const D = await jiti.import("../../src/lib/journeys/prompt-decoration.ts");
const A = await jiti.import("../../src/lib/journeys/pack-image-allocation.ts");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const setKey = process.argv[2];
const OUT = arg("out");
if (!OUT) throw new Error("--out=<dir> required");
const ONLY = arg("only")?.split(",");
const OPTIONS = Number(arg("options") ?? 2);
const REROLL = arg("reroll")?.split(",").map((x) => x.split(":"));
const N_ARG = arg("n");
const CONCURRENCY = Number(arg("concurrency") ?? 6);
const currentSlots = N_ARG === "current" ? JSON.parse((await import("node:fs")).readFileSync(ROOT + "public/tramokyo-pack/local-images.json", "utf8")) : null;
const { JOURNEYS } = await import(`./shotlists/${setKey}.mjs`);
fal.config({ credentials: process.env.FAL_KEY });

// Composition anchors for repeated shots — placement/scale only, positive
// wording (never names what must not appear).
const COMPOSE = [
  "the brightest mass weighted to the lower left, open darkness to the upper right",
  "the brightest mass weighted to the upper right, open darkness below",
  "one long diagonal sweep from the lower right toward the upper left",
  "the form small in the right third, wide darkness to the left",
  "the form filling the lower half of the frame, deep darkness above",
  "seen closer, the form large and partly cut by the left edge of the frame",
];

export function planSlots(j, base = 36, fixed = null) {
  let n = fixed ?? base, counts;
  if (fixed) counts = A.allocateByPhase(j.phases, n, D.TRAMOKYO_PHASE_WEIGHT);
  else for (;; n++) { counts = A.allocateByPhase(j.phases, n, D.TRAMOKYO_PHASE_WEIGHT); if (Math.min(...counts) >= 3 || n > 60) break; }
  const slots = [];
  j.phases.forEach((p, pi) => {
    // Long phases (> 6 slots, e.g. a 110 s phase holding 16) would show one
    // shot for ~5 pushes in a row — the slideshow. They cycle their three
    // shots slot by slot instead (micro <-> macro on every push), and each
    // repeat of a shot gets its own composition anchor so repeats don't
    // render as near-duplicates (P1). Short phases keep the floor(i/count*3)
    // story order. (2026-10-09, Expansion sample.)
    const cycle = counts[pi] > 6;
    const reps = [0, 0, 0];
    for (let i = 0; i < counts[pi]; i++) {
      const si = cycle ? i % 3 : Math.min(2, Math.floor((i / counts[pi]) * 3));
      const rep = reps[si]++;
      const anchor = rep > 0 || cycle ? COMPOSE[(rep + si * 2 + pi) % COMPOSE.length] : null;
      slots.push({ slot: slots.length, phase: p.id, phaseIdx: pi, shotIdx: si, rep, reg: p.shots[si].reg, gradeAs: p.gradeAs, text: anchor ? `${p.shots[si].text}, ${anchor}` : p.shots[si].text });
    }
  });
  return { n, counts, slots };
}

const jobs = [];
const manifest = {};
for (const j of JOURNEYS) {
  if (ONLY && !ONLY.includes(j.id)) continue;
  const fixed = currentSlots ? currentSlots[j.id]?.length : N_ARG ? Number(N_ARG) : null;
  if (currentSlots && !fixed) throw new Error(`${j.name}: no current slot list in local-images.json`);
  const plan = planSlots(j, 36, fixed);
  const dir = `${OUT}/${j.name.replace(/\s+/g, "-")}/opt`;
  mkdirSync(dir, { recursive: true });
  manifest[j.id] = { name: j.name, n: plan.n, counts: plan.counts, slots: plan.slots.map(({ text, ...s }) => s) };
  for (const s of plan.slots) {
    const prompt = `${s.text}, ${TAIL}, ${D.tramokyoGradeForPhase(s.gradeAs)}, ${D.TRAMOKYO_STYLE_SUFFIX}`;
    const stem = `gen-${String(s.slot).padStart(3, "0")}`;
    const letters = REROLL ? REROLL.filter(([id, sl]) => id === j.id && Number(sl) === s.slot).map(() => null) : null;
    if (REROLL && letters.length === 0) continue;
    const taken = (l) => existsSync(`${dir}/${stem}-${l}.jpg`);
    const opts = REROLL ? "cdefghijklmn".split("").filter((l) => !taken(l)).slice(0, 2) : "abcdefgh".slice(0, OPTIONS).split("");
    for (const o of opts) { const f = `${dir}/${stem}-${o}.jpg`; if (!existsSync(f)) jobs.push({ f, prompt }); }
  }
}
writeFileSync(`${OUT}/slots.json`, JSON.stringify(manifest, null, 1));
// Celestial + ice-family negatives only when the shot doesn't ask for them (Karel lifted the exclusivity 2026-10-09).
const negativeFor = (prompt) => [D.GLOBAL_NEGATIVE, D.extraNegativeFor(prompt), D.materialNegativeFor(prompt)].filter(Boolean).join(", ");
console.log(`${jobs.length} stills to render (~$${(jobs.length * 0.025).toFixed(2)})`);
let next = 0, ok = 0, bad = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fal.subscribe("fal-ai/flux/dev", { input: { prompt: j.prompt, negative_prompt: negativeFor(j.prompt), image_size: { width: 1024, height: 1024 }, num_inference_steps: 28, guidance_scale: 3.5, seed: Math.floor(Math.random() * 4294967295), enable_safety_checker: true } });
        const url = r.data?.images?.[0]?.url; if (!url) throw new Error("no image");
        writeFileSync(j.f, Buffer.from(await (await fetch(url)).arrayBuffer())); ok++; break;
      } catch (e) {
        // Out of fal credit: stop the whole run instead of burning retries.
        const msg = `${e.message ?? e} ${JSON.stringify(e.body ?? "")}`;
        if (/balance|insufficient|exhausted|locked|payment/i.test(msg)) { console.log("✗ fal balance:", msg.slice(0, 200)); next = jobs.length; bad++; break; }
        if (attempt === 2) { bad++; console.log("✗", j.f.split("/").slice(-3).join("/"), e.message ?? e); }
      }
    }
    if ((ok + bad) % 25 === 0) console.log(`  ${ok + bad}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${ok} ok, ${bad} failed · spent ~$${(ok * 0.025).toFixed(2)}`);
