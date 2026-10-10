#!/usr/bin/env node
// repair-ra-neighbours.mjs — Rise Above is Karel's self-running loop (since
// 2026-10-09), but the Expansion casts were solved for the Expansion set's own
// order. This finds every pair of Rise Above neighbours that share a shader
// and repairs it with the SMALLEST change: the shared shader is swapped, in
// one Expansion journey of the pair, for an eligible shader in the same phase.
// Eligible = vetted pool, not already in that journey, not used by either of
// its Rise Above neighbours or its Expansion-order neighbours, support cap
// (expansion-recast.test CAP) and loop cap (13 journeys) kept, dark (effective
// mean <= 12) when it fills a sparse phase's dark pair. Each swap is verified
// with the real JourneyEngine replay (H1/H2/H4/H5k); a swap that fails is
// not made. Snowflake ↔ Ghost (both mastered) is never touched; pairs with no
// Expansion member are reported for cast-owned-featured.mjs.
//
// Writes (with --write): scripts/expansion-recast.json and the cast sources
// the Expansion shot-list modules read (shotlists/expansion-batch.casts.json,
// shotlists/expansion-sample.mjs), so re-applying those modules
// (apply-shotlists.mjs <set> --pack-only, then the DB) installs the repair.
// Usage: node scripts/mv-rollout/repair-ra-neighbours.mjs [--write]
import { createJiti } from "jiti";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WRITE = process.argv.includes("--write");
let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const J = await jiti.import("../../src/lib/journeys/journeys.ts");
const ENG = await jiti.import("../../src/lib/journeys/journey-engine.ts");
const SEQ = await jiti.import("../../src/lib/journeys/installation-sequence.ts");
const PT = await jiti.import("../../src/lib/journeys/pinned-takes.ts");
const { JOURNEY_CASTS } = await jiti.import("../../src/lib/journeys/journey-casts.generated.ts");
const { STD } = await import("../lib/snowflake-standard.mjs");

const RECAST = ROOT + "scripts/expansion-recast.json";
const recast = JSON.parse(readFileSync(RECAST, "utf8"));
const vet = JSON.parse(readFileSync(ROOT + "scripts/shader-vetting.json", "utf8"));
const pack = JSON.parse(readFileSync(ROOT + "public/tramokyo-pack/data/journeys.json", "utf8"));
const recs = new Map(JSON.parse(readFileSync(ROOT + "public/tramokyo-pack/data/recordings.json", "utf8")).map((r) => [r.id, Number(r.duration) || 0]));
const V = vet.verdicts;
const eff = (m) => V[m].mean * (V[m].gain ?? 1);
const REJ = new Set(["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"]);
const KLAB = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const POOL = vet.pool.filter((m) => !J.GLOBAL_SHADER_BLOCKLIST.includes(m) && !J.PICKTIME_SHADER_BLOCKLIST.has(m) && !REJ.has(m) && !KLAB.has(m));
const CAP = 8, LOOP_CAP = 13;
// drift = the "falling light bulbs" Karel keeps for Ghost only (2026-10-09): never a replacement
POOL.splice(POOL.indexOf("drift") >>> 0, POOL.includes("drift") ? 1 : 0);

const expById = new Map(recast.journeys.map((j) => [j.id, j]));
const modes = (id) => {
  if (PT.SCRIPTED_TAKES[id]) return new Set(PT.SCRIPTED_TAKES[id].map((e) => e.mode).filter(Boolean));
  const e = expById.get(id); if (e) return new Set(Object.values(e.cast).flat().filter(Boolean));
  if (JOURNEY_CASTS[id]) return new Set(Object.values(JOURNEY_CASTS[id].cast).flat());
  return new Set();
};
const nameOf = (id) => expById.get(id)?.title ?? JOURNEY_CASTS[id]?.name ?? J.getJourney(id)?.name ?? id;
const RA = SEQ.TRAMOKYO_RISE_ABOVE;
const EXP = SEQ.TRAMOKYO_MAIN.sets.find((s) => s.presenting === "Expansion").journeyIds;
const ring = (arr, id) => { const i = arr.indexOf(id); return i < 0 ? [] : [arr[(i - 1 + arr.length) % arr.length], arr[(i + 1) % arr.length]]; };
const MASTERED = new Set(["first-snow", "ghost"]);

function supportUses() { const u = {}; for (const j of recast.journeys) for (const m of new Set(Object.values(j.cast).flat().filter((x) => x && x !== j.lead))) u[m] = (u[m] ?? 0) + 1; return u; }
function loopUses() { const u = {}; for (const id of SEQ.TRAMOKYO_SETLIST) for (const m of modes(id)) u[m] = (u[m] ?? 0) + 1; return u; }

function simulate(journey, dur) {
  const eng = ENG.getJourneyEngine(); CLOCK = 1000; eng.start(journey, { seed: 20261005, trackDuration: dur });
  const step = 0.5, on = new Map(), runs = new Map(), cur = new Map(); let layers = 0, n = 0;
  for (let t = 0; t <= dur; t += step) {
    CLOCK = 1000 + t * 1000; const f = eng.getFrame(t / dur); if (!f) continue;
    const live = new Set([f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode].filter(Boolean)); layers += live.size; n++;
    for (const m of live) { on.set(m, (on.get(m) ?? 0) + step); cur.set(m, (cur.get(m) ?? 0) + step); runs.set(m, Math.max(runs.get(m) ?? 0, cur.get(m))); }
    for (const m of [...cur.keys()]) if (!live.has(m)) cur.delete(m);
  }
  eng.stop();
  const top = [...on].map(([m, sec]) => ({ m, share: sec / dur, run: (runs.get(m) ?? 0) / dur })).sort((a, b) => b.share - a.share);
  return { distinct: top.length, top, layers: layers / Math.max(1, n) };
}
function hFails(id, cast) {
  const row = pack.find((r) => r.id === id);
  const phases = row.phases.map((p) => ({ ...p, shaderModes: cast[p.id] ?? p.shaderModes }));
  const H = simulate({ ...(row.theme ?? {}), id: "ra-check", name: "ra-check", realmId: row.realm_id, phases }, recs.get(row.recording_id) || 200);
  const f = [];
  if (H.distinct < STD.H1_distinct) f.push("H1");
  if ((H.top[0]?.share ?? 0) > STD.H3_leadShare || (H.top[1]?.share ?? 0) > STD.H2_maxShare) f.push("H2");
  if (Math.max(...H.top.slice(0, 4).map((t) => t.run)) > STD.H4_maxRun) f.push("H4");
  if (H.layers > STD.H5k_layers) f.push("H5k");
  return f;
}

const fixes = [], unresolved = [];
for (let k = 0; k < RA.length; k++) {
  const a = RA[k], b = RA[(k + 1) % RA.length];
  if (MASTERED.has(a) && MASTERED.has(b)) continue;
  let shared = [...modes(a)].filter((m) => modes(b).has(m));
  if (!shared.length) continue;
  for (const m of shared) {
    let done = false;
    for (const id of [b, a].filter((x) => expById.has(x))) {
      const j = expById.get(id);
      if (j.lead === m) continue; // never move a journey's lead
      const row = pack.find((r) => r.id === id);
      const phaseId = Object.keys(j.cast).find((p) => j.cast[p].includes(m));
      const phase = row.phases.find((p) => p.id === phaseId);
      const slot = j.cast[phaseId].indexOf(m);
      const needDark = phase?.sparse && slot < 2;
      const banned = new Set([...modes(id)]);
      for (const nb of [...ring(RA, id), ...ring(EXP, id)]) for (const x of modes(nb)) banned.add(x);
      const su = supportUses(), lu = loopUses();
      const cands = POOL.filter((r) => !banned.has(r) && (su[r] ?? 0) < CAP && (lu[r] ?? 0) < LOOP_CAP && (!needDark || eff(r) <= 12) && eff(r) <= 40)
        .sort((x, y) => Math.abs(eff(x) - eff(m)) - Math.abs(eff(y) - eff(m)) || (V[x].hue === V[m].hue ? -1 : 1));
      for (const r of cands.slice(0, 12)) {
        const cast = Object.fromEntries(Object.entries(j.cast).map(([p, l]) => [p, l.map((x) => (x === m ? r : x))]));
        if (hFails(id, cast).length) continue;
        j.cast = cast; j.supports = [...new Set(Object.values(cast).flat())].filter((x) => x !== j.lead);
        fixes.push({ id, name: j.title, phase: phaseId, from: m, to: r, pair: `${k + 1}→${((k + 1) % RA.length) + 1} ${nameOf(a)} / ${nameOf(b)}` });
        done = true; break;
      }
      if (done) break;
    }
    if (!done) unresolved.push(`${k + 1}→${((k + 1) % RA.length) + 1} ${nameOf(a)} / ${nameOf(b)}: ${m}`);
  }
}
for (const f of fixes) console.log(`  ${f.pair}: ${f.name} ${f.phase} ${f.from} → ${f.to}`);
console.log(`${fixes.length} swaps · unresolved ${unresolved.length}${unresolved.length ? ":\n  " + unresolved.join("\n  ") : ""}`);
if (!WRITE) process.exit(0);

// expansion-recast.json (+ supportUses report)
const uses = supportUses();
recast.supportUses = Object.fromEntries(Object.entries(uses).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));
writeFileSync(RECAST, JSON.stringify(recast, null, 1));
// cast sources for the shot-list modules
const castsPath = ROOT + "scripts/mv-rollout/shotlists/expansion-batch.casts.json";
const casts = JSON.parse(readFileSync(castsPath, "utf8"));
let sample = readFileSync(ROOT + "scripts/mv-rollout/shotlists/expansion-sample.mjs", "utf8");
for (const f of fixes) {
  // a support may span two adjacent phases: replace it in every phase of that journey
  if (casts.casts[f.id]) { for (const p of Object.keys(casts.casts[f.id].cast)) casts.casts[f.id].cast[p] = casts.casts[f.id].cast[p].map((x) => (x === f.from ? f.to : x)); continue; }
  // expansion-sample.mjs: replace inside that journey's phase P("<phase>", … ["…"] …)
  const start = sample.indexOf(`id: "${f.id}"`);
  let patched = 0;
  for (const ph of ["threshold", "expansion", "transcendence", "illumination", "return", "integration"]) {
    const pStart = sample.indexOf(`P("${ph}"`, start);
    const arrEnd = sample.indexOf("]", pStart);
    const seg = sample.slice(pStart, arrEnd);
    if (seg.includes(`"${f.from}"`)) { sample = sample.slice(0, pStart) + seg.replace(`"${f.from}"`, `"${f.to}"`) + sample.slice(arrEnd); patched++; }
  }
  if (!patched) throw new Error(`could not patch expansion-sample.mjs for ${f.name}`);
}
casts.raRepaired = new Date().toISOString();
writeFileSync(castsPath, JSON.stringify(casts, null, 1) + "\n");
writeFileSync(ROOT + "scripts/mv-rollout/shotlists/expansion-sample.mjs", sample);
console.log("wrote expansion-recast.json, expansion-batch.casts.json, expansion-sample.mjs");
