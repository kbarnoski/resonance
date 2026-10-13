#!/usr/bin/env node
// measure-particle-shader-share.mjs — how much of the kiosk loop's shader
// screen-time the PARTICLE shaders hold (src/lib/journeys/particle-shaders.ts;
// Karel 2026-10-13: "use them in good portion across journeys").
//
// Two lenses, both deterministic:
//  - MODEL: castScreenTime() over every loop cast (phase bounds from
//    PARTICLE_PROFILES) — the same arithmetic particle-shaders.test.ts guards;
//  - ENGINE: the real JourneyEngine replayed per journey (like the
//    rebalancer's H lens), summing on-screen seconds over primary + dual +
//    tertiary. Scripted takes play their scripts, pinned takes their seed,
//    the rest three fixed seeds. Phases come from the Tramokyo pack (read-only).
// Usage: node scripts/measure-particle-shader-share.mjs [--per-journey] [--pack=<dir>] [--json=<out>]
import { createJiti } from "jiti";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const PACK = arg("pack", existsSync(ROOT + "public/tramokyo-pack/data/journeys.json") ? ROOT + "public/tramokyo-pack" : "/Users/karelbarnoski/my-app/public/tramokyo-pack");

let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const J = await jiti.import(ROOT + "src/lib/journeys/journeys.ts");
const ENG = await jiti.import(ROOT + "src/lib/journeys/journey-engine.ts");
const SEQ = await jiti.import(ROOT + "src/lib/journeys/installation-sequence.ts");
const PT = await jiti.import(ROOT + "src/lib/journeys/pinned-takes.ts");
const PS = await jiti.import(ROOT + "src/lib/journeys/particle-shaders.ts");
const MAST = await jiti.import(ROOT + "src/lib/journeys/mastered.ts");
const { PARTICLE_PROFILES } = await jiti.import(ROOT + "src/lib/journeys/particle-profiles.generated.ts");
const { JOURNEY_CASTS } = await jiti.import(ROOT + "src/lib/journeys/journey-casts.generated.ts");

const expansion = JSON.parse(readFileSync(ROOT + "scripts/expansion-recast.json", "utf8"));
const featured = JSON.parse(readFileSync(ROOT + "scripts/featured-recast.json", "utf8"));
const pack = JSON.parse(readFileSync(`${PACK}/data/journeys.json`, "utf8"));
const recDur = new Map(JSON.parse(readFileSync(`${PACK}/data/recordings.json`, "utf8")).map((r) => [r.id, Number(r.duration) || 0]));
const packById = new Map(pack.map((r) => [r.id, r]));
const expById = new Map(expansion.journeys.map((j) => [j.id, j]));
const featById = new Map(featured.journeys.map((j) => [j.id, j]));

const L = SEQ.TRAMOKYO_SETLIST;
const RA = new Set(SEQ.TRAMOKYO_RISE_ABOVE);

function journeyOf(id) {
  const builtin = J.getJourney(id);
  const row = packById.get(id);
  const e = expById.get(id), f = featById.get(id);
  const script = PT.SCRIPTED_TAKES[id] ?? null;
  const cast = script ? null : e ? e.cast : JOURNEY_CASTS[id]?.cast ?? f?.cast;
  const owned = !!e || !!f?.owned;
  const phases0 = row ? row.phases : builtin?.phases;
  const phases = phases0.map((p) => ({ ...p, shaderModes: cast?.[p.id] ? [...cast[p.id]].filter(Boolean) : p.shaderModes, shaderOwned: cast ? (owned ? true : p.shaderOwned) : p.shaderOwned }));
  const base = builtin && !row ? builtin : { ...(row.theme ?? {}), realmId: row.realm_id, strictCamera: true };
  const name = e?.title ?? f?.name ?? row?.name ?? builtin?.name ?? id;
  const dur = (row?.recording_id && recDur.get(row.recording_id)) || PARTICLE_PROFILES[id]?.duration || f?.dur || 200;
  return { id, name, journey: { ...base, id, name, phases }, dur, script, cast, owned, mastered: MAST.isMasteredJourneyLike({ id, name }) };
}

function replay(j) {
  const pin = PT.PINNED_TAKES[j.id];
  const seeds = j.script ? [PT.PINNED_TAKES[j.id] ?? 1] : pin != null ? [Array.isArray(pin) ? pin[0] : pin] : [20261005, 1, 2];
  const on = new Map();
  let total = 0;
  for (const seed of seeds) {
    const eng = ENG.getJourneyEngine(); CLOCK = 1000;
    eng.start(j.journey, { seed, trackDuration: j.dur, script: j.script ?? undefined });
    const step = 0.5;
    for (let t = 0; t <= j.dur; t += step) {
      CLOCK = 1000 + t * 1000;
      const f = eng.getFrame(t / j.dur); if (!f) continue;
      for (const m of new Set([f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode].filter(Boolean))) { on.set(m, (on.get(m) ?? 0) + step / seeds.length); total += step / seeds.length; }
    }
    eng.stop();
  }
  return on;
}

const rows = [];
for (const id of L) {
  const j = journeyOf(id);
  const eng = replay(j);
  const model = j.cast ? PS.castScreenTime(j.cast, PARTICLE_PROFILES[id]?.phaseBounds ?? [], PARTICLE_PROFILES[id]?.duration ?? j.dur, { owned: j.owned }) : eng;
  const roster = j.cast ? [...new Set(Object.values(j.cast).flat().filter(Boolean))] : [...new Set(j.script.map((e) => e.mode))];
  rows.push({ id, name: j.name, ra: RA.has(id), mastered: j.mastered, pinned: PT.PINNED_TAKES[id] != null, roster, particles: MAST.isMasteredJourneyLike(j.journey) ? roster.filter(PS.isParticleShader) : PS.particleVoicesFor(j.journey), eng, model });
}

const pct = (x) => `${(x * 100).toFixed(1)} %`;
function summary(sel, label) {
  const e = PS.particleShare(sel.map((r) => r.eng)), m = PS.particleShare(sel.map((r) => r.model));
  const nm = sel.filter((r) => !r.mastered);
  const cov = nm.filter((r) => r.particles.length).length;
  console.log(`${label.padEnd(12)} engine ${pct(e.share)} · cast-only model ${pct(m.share)} · coverage ${cov}/${nm.length} (${pct(cov / nm.length)})`);
  return { engine: e.share, model: m.share, coverage: cov / nm.length, byShader: Object.fromEntries([...e.byShader].map(([k, v]) => [k, +(v / e.particleSec).toFixed(3)])) };
}
const out = { loop: summary(rows, "main loop"), riseAbove: summary(rows.filter((r) => r.ra), "Rise Above") };
const by = Object.entries(out.loop.byShader).sort((a, b) => b[1] - a[1]);
console.log(`family spread (engine, share of particle time): ${by.map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`);
if (process.argv.includes("--per-journey")) for (const r of rows) {
  const e = PS.particleShare([r.eng]);
  console.log(`  ${r.name.slice(0, 28).padEnd(28)}${r.ra ? " RA" : "   "}${r.mastered ? " M" : r.pinned ? " P" : "  "} ${pct(e.share).padStart(7)}  ${r.particles.join(", ")}`);
}
const json = arg("json", null);
if (json) writeFileSync(json, JSON.stringify({ ...out, journeys: rows.map((r) => ({ name: r.name, ra: r.ra, mastered: r.mastered, pinned: r.pinned, particles: r.particles, engine: +PS.particleShare([r.eng]).share.toFixed(3) })) }, null, 1));
if (process.argv.includes("--debug")) for (const r of rows.slice(0, 4)) { const t = [...r.eng.values()].reduce((a, b) => a + b, 0); console.log(r.name, PARTICLE_PROFILES[r.id]?.duration, t.toFixed(0), [...r.eng].map(([k, v]) => `${k}:${v.toFixed(0)}`).join(" ")); console.log("   model", [...r.model].map(([k, v]) => `${k}:${v.toFixed(0)}`).join(" ")); }
// --take-drift: pinned / scripted takes — does the particle voice change the
// take's PRIMARY timeline? (replays each with the voice switched off)
if (process.argv.includes("--take-drift")) for (const id of L.filter((x) => PT.PINNED_TAKES[x] != null || PT.SCRIPTED_TAKES[x])) {
  const j = journeyOf(id);
  if (j.mastered) continue;
  const seed = [PT.PINNED_TAKES[id] ?? 1].flat()[0];
  const prim = (off) => {
    const eng = ENG.getJourneyEngine(); CLOCK = 1000; eng.start(j.journey, { seed, trackDuration: j.dur, script: j.script ?? undefined });
    if (off) eng.particleOn = false;
    const seq = []; let last = null, same = 0, n = 0;
    for (let t = 0; t <= j.dur; t += 0.5) { CLOCK = 1000 + t * 1000; const f = eng.getFrame(t / j.dur); if (!f) continue; seq.push(f.shaderMode); if (f.shaderMode !== last) last = f.shaderMode; }
    eng.stop(); return seq;
  };
  const a = prim(true), b = prim(false);
  const same = a.filter((m, i) => b[i] === m).length;
  console.log(`  take drift ${j.name.padEnd(24)} primary identical ${(100 * same / a.length).toFixed(1)} % of frames`);
}
if (arg("drift-debug", null)) {
  const j = journeyOf(arg("drift-debug", null));
  const seed = [PT.PINNED_TAKES[j.id] ?? 1].flat()[0];
  const run = (off) => { const eng = ENG.getJourneyEngine(); CLOCK = 1000; eng.start(j.journey, { seed, trackDuration: j.dur }); if (off) eng.particleOn = false; const o = []; for (let t = 0; t <= j.dur; t += 0.5) { CLOCK = 1000 + t * 1000; const f = eng.getFrame(t / j.dur); o.push(f ? `${t} ${f.shaderMode}|${f.dualShaderMode ?? "-"}|${f.tertiaryShaderMode ?? "-"}` : `${t} -`); } eng.stop(); return o; };
  const a = run(true), b = run(false);
  const i = a.findIndex((x, k) => x.split("|")[0] !== b[k].split("|")[0]);
  for (let k = 0; k < i + 3; k++) if (a[k] !== b[k]) console.log(a[k].padEnd(60), b[k]);
}
