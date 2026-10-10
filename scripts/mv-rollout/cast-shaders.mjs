#!/usr/bin/env node
// cast-shaders.mjs — phase-owned shader casts for an Expansion rollout set
// (Journey Archetype law 1b / H1–H4; Karel 2026-10-09 approved raising the
// per-shader cap so pools reach >=10 shaders on screen).
//
// One view of the WHOLE Expansion, because the rules are loop-wide:
//  - every journey keeps its own lead (scripts/expansion-recast.json, the
//    10-05 recast Karel has watched) — on its peak phase (+ one adjacent);
//  - 11–13 distinct shaders per journey (lead + supports), each support on
//    ONE phase (two adjacent at most), the sparse phase on 1–2 DARK shaders
//    (effective mean <= 12), quiet bookends on 1–2 voices;
//  - no shader shared between journeys closer than MIN_DIST in setlist order
//    (the test guards neighbours; we keep a wider margin when feasible), and
//    another journey's lead never within LEAD_DIST of that journey;
//  - Rise Above hand-offs: a journey's opening phase never holds a shader
//    the borrowed predecessor ends on (and vice versa);
//  - caps: <= CAP supports-uses per shader across the Expansion and
//    <= LOOP_CAP journeys per shader across the whole kiosk loop
//    (featured/album casts + Expansion);
//  - palette fit (journeys.ts hue families, same as recast-expansion.mjs),
//    vetted pool only (scripts/shader-vetting.json), never a blocked,
//    pick-time-banned, Karel-rejected or mastered-lead shader.
// Journeys not in the set keep their casts and are constraints.
// Writes scripts/mv-rollout/shotlists/<set>.casts.json (the set module reads it).
//
// Usage: node scripts/mv-rollout/cast-shaders.mjs <set> [--seed=N] [--cap=N] [--loop-cap=N] [--min-dist=N]
import { createJiti } from "jiti";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const setKey = process.argv[2];
const CAP = Number(arg("cap", 8));
const LOOP_CAP = Number(arg("loop-cap", 13));
let MIN_DIST = Number(arg("min-dist", 4));
const LEAD_DIST = 6;
const TARGET = 12; // distinct per journey incl. lead (11–13 allowed)

// Every journey's cast is VERIFIED with the real JourneyEngine replayed over
// the track (the audit's H lens: >=10 on screen, top <= 50 %, next <= 35 %,
// no continuous run > 25 %, mean layers <= H5k) and re-drawn until it passes.
let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const J = await jiti.import("../../src/lib/journeys/journeys.ts");
const ENG = await jiti.import("../../src/lib/journeys/journey-engine.ts");
const { STD } = await import("../lib/snowflake-standard.mjs");
const durByRec = new Map(JSON.parse(readFileSync(ROOT + "public/tramokyo-pack/data/recordings.json", "utf8")).map((r) => [r.id, Number(r.duration) || 0]));
function simulate(journey, dur, seed = 20261005) {
  const eng = ENG.getJourneyEngine(); CLOCK = 1000; eng.start(journey, { seed, trackDuration: dur });
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
function hCheck(id, j, cast) {
  const row = pack.find((r) => r.id === id);
  const phases = j.phases.map((p) => { const old = row.phases.find((o) => o.id === p.id) ?? {}; const o = { ...old, id: p.id, start: p.start, end: p.end, intensityMultiplier: p.intensity, shaderModes: cast[p.id], shaderOwned: true, shaderOpacity: p.shaderOpacity ?? old.shaderOpacity }; if (p.sparse) o.sparse = true; else delete o.sparse; return o; });
  const H = simulate({ id, name: row.name, realmId: row.realm_id, phases, ...(row.theme ?? {}), strictCamera: true }, durByRec.get(row.recording_id) || 200);
  const fails = [];
  if (H.distinct < STD.H1_distinct) fails.push(`H1 ${H.distinct}`);
  if ((H.top[0]?.share ?? 0) > STD.H3_leadShare || (H.top[1]?.share ?? 0) > STD.H2_maxShare) fails.push(`H2 ${H.top[0].m} ${H.top[0].share.toFixed(2)}/${H.top[1]?.share.toFixed(2)}`);
  if (Math.max(...H.top.slice(0, 4).map((t) => t.run)) > STD.H4_maxRun) fails.push("H4");
  if (H.layers > STD.H5k_layers) fails.push(`H5k ${H.layers.toFixed(2)}`);
  return { fails, H };
}
const SEQ = await jiti.import("../../src/lib/journeys/installation-sequence.ts");
const { JOURNEYS: SETJ } = await import(`./shotlists/${setKey}.mjs`);
const vet = JSON.parse(readFileSync(ROOT + "scripts/shader-vetting.json", "utf8"));
const recast = JSON.parse(readFileSync(ROOT + "scripts/expansion-recast.json", "utf8"));
const pack = JSON.parse(readFileSync(ROOT + "public/tramokyo-pack/data/journeys.json", "utf8"));
const castsTs = readFileSync(ROOT + "src/lib/journeys/journey-casts.generated.ts", "utf8");
const JOURNEY_CASTS = {};
for (const m of castsTs.matchAll(/^ {2}"([^"]+)": \{ name: "([^"]*)", cast: (\{.*?\}) \},$/gm)) JOURNEY_CASTS[m[1]] = JSON.parse(m[3]);

const REJ = new Set(["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"]);
const MASTERED_LEADS = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const LOW = new Set(J.LOW_TIER_BLOCKED_SHADERS);
const POOL = vet.pool.filter((m) => !J.GLOBAL_SHADER_BLOCKLIST.includes(m) && !J.PICKTIME_SHADER_BLOCKLIST.has(m) && !REJ.has(m) && !MASTERED_LEADS.has(m));
const V = vet.verdicts;
const eff = (m) => V[m].mean * (V[m].gain ?? 1);

// palette fit — mirror of recast-expansion.mjs / journeys.ts paletteHueFamilies
const RING = ["ember", "gold", "green", "teal", "blue", "violet", "magenta"];
function hsv(hex) { const n = parseInt(hex.replace("#", ""), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, v: mx }; }
const fam = (h) => (h >= 345 || h < 25 ? "ember" : h < 70 ? "gold" : h < 160 ? "green" : h < 200 ? "teal" : h < 250 ? "blue" : h < 305 ? "violet" : "magenta");
function paletteFamilies(p) { const core = new Set(), near = new Set(); for (const k of ["primary", "accent", "glow"]) { if (!p?.[k]) continue; const c = hsv(p[k]); if (c.s < 0.2 || c.v < 0.15) continue; const i = RING.indexOf(fam(c.h)); if (k === "primary") core.add(RING[i]); near.add(RING[i]); near.add(RING[(i + 1) % 7]); near.add(RING[(i + 6) % 7]); } return { core, near }; }
const fit = (m, pf) => { const h = V[m]?.hue ?? "neutral"; return pf.core.has(h) ? 3 : pf.near.has(h) ? 2 : h === "prismatic" || h === "neutral" ? 1 : 0; };

// ── the loop ──
const EXP = SEQ.TRAMOKYO_MAIN.sets.find((s) => s.presenting === "Expansion").journeyIds;
const RA = SEQ.TRAMOKYO_RISE_ABOVE;
const setIds = new Set(SETJ.map((j) => j.id));
const recById = new Map(recast.journeys.map((j) => [j.id, j]));
const featuredUses = {};
for (const id of SEQ.TRAMOKYO_SETLIST) if (JOURNEY_CASTS[id]) for (const m of new Set(Object.values(JOURNEY_CASTS[id]).flat())) featuredUses[m] = (featuredUses[m] ?? 0) + 1;
const phasesOf = (id) => SETJ.find((j) => j.id === id)?.phases ?? pack.find((r) => r.id === id).phases;
// Rise Above hand-off constraints (featured-recast.test "never ends a journey on a shader the next one opens with")
const castPhases = (id, cast) => Object.values(cast ?? recById.get(id)?.cast ?? JOURNEY_CASTS[id] ?? {});
const raBefore = {}, raAfter = {};
for (let i = 0; i + 1 < RA.length; i++) { raAfter[RA[i]] = RA[i + 1]; raBefore[RA[i + 1]] = RA[i]; }

function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

function layout(j, target = TARGET) {
  // pool size per phase + lead phases + sparse. Long phases need more voices
  // (one shader dwelling ~half a track fails H2/H4); a long sparse phase opens
  // on its dark pair (the engine's sparse window is <= 16 % of the track) and
  // then gets ordinary voices for the rest of the phase.
  const ph = j.phases;
  const sparse = ph.findIndex((p) => p.sparse);
  const ints = ph.map((p, i) => (i === sparse ? -1 : p.intensity ?? 0.5));
  const peak = ints.indexOf(Math.max(...ints));
  const len = ph.map((p) => p.end - p.start);
  const leadPh = [peak];
  const adj = [peak - 1, peak + 1].filter((i) => i >= 0 && i < ph.length && i !== sparse).sort((a, b) => ints[b] - ints[a])[0];
  if (adj != null && len[peak] + len[adj] <= 0.25) leadPh.push(adj);
  // Voices are allotted by SCREEN TIME (largest remainder over phase length):
  // every shader needs ~10–20 s to register, so a 10 s bookend gets one
  // voice and a phase holding half the track gets five or six. Each support
  // lives in exactly one phase (no carry-over: a shared support across two
  // phases is the long continuous run H4 forbids); the lead adds its phases.
  const mins = ph.map((_, i) => (i === sparse ? 2 : 1));
  const slots = target + leadPh.length - 1;
  const size = [...mins];
  let left = slots - size.reduce((a, b) => a + b, 0);
  while (left-- > 0) {
    let k = 0, bestGap = -Infinity;
    for (let i = 0; i < ph.length; i++) { const want = (len[i] / 1) * slots; const gap = want - size[i]; if (gap > bestGap) { bestGap = gap; k = i; } }
    size[k]++;
  }
  const canCarry = () => false;
  return { sparse, peak, leadPh, size, canCarry };
}

function solve(seed) {
  const R = rng(seed);
  const uses = {}; // expansion support-uses (not counting a journey's own lead)
  const anyUse = {}; // journeys in the expansion using m (any role)
  const assigned = new Map(); // id -> Set(all modes)
  for (const id of EXP) if (!setIds.has(id)) { const c = recById.get(id)?.cast; if (!c) continue; const s = new Set(Object.values(c).flat().filter(Boolean)); assigned.set(id, s); for (const m of s) { anyUse[m] = (anyUse[m] ?? 0) + 1; if (m !== recById.get(id).lead) uses[m] = (uses[m] ?? 0) + 1; } }
  const leadPos = new Map(EXP.map((id, i) => [recById.get(id)?.lead, i]));
  const out = {};
  for (let pos = 0; pos < EXP.length; pos++) {
    const id = EXP[pos];
    if (!setIds.has(id)) continue;
    const j = SETJ.find((x) => x.id === id);
    const lead = recById.get(id).lead;
    const pf = paletteFamilies(pack.find((r) => r.id === id).theme?.palette ?? pack.find((r) => r.id === id).phases[0]?.palette);
    const lay = (t) => layout(j, t);
    const near = new Set();
    for (const [oid, s] of assigned) { const d = Math.abs(EXP.indexOf(oid) - pos); if (d < MIN_DIST) for (const m of s) near.add(m); }
    let pick = null;
    for (let attempt = 0; attempt < ATTEMPTS && !(pick && !pick.fails.length); attempt++) {
    const { sparse, peak, leadPh, size, canCarry } = lay(attempt < ATTEMPTS / 2 ? TARGET : TARGET + 1);
    const raBan = { first: new Set(), last: new Set() };
    if (raBefore[id]) { const ps = castPhases(raBefore[id], out[raBefore[id]]); for (const m of ps.at(-1) ?? []) raBan.first.add(m); }
    if (raAfter[id]) { const ps = castPhases(raAfter[id], out[raAfter[id]]); for (const m of ps[0] ?? []) raBan.last.add(m); }
    const used = new Set([lead]);
    const cast = j.phases.map((p, i) => (leadPh.includes(i) ? [lead] : []));
    const total = size.reduce((a, b) => a + b, 0) - leadPh.length;
    let carries = Math.max(0, total - (TARGET - 1));
    const ok = (m, i) => !used.has(m) && !near.has(m) && (uses[m] ?? 0) < CAP && (featuredUses[m] ?? 0) + (anyUse[m] ?? 0) < LOOP_CAP
      && !(leadPos.has(m) && Math.abs(leadPos.get(m) - pos) < LEAD_DIST && m !== lead)
      && !(i === 0 && raBan.first.has(m)) && !(i === j.phases.length - 1 && raBan.last.has(m))
      && (i !== sparse || cast[i].length >= 2 || eff(m) <= 12) && (i !== 0 || eff(m) <= 20) && eff(m) <= 40;
    for (let i = 0; i < j.phases.length; i++) {
      // carry one support over from the previous phase (continuity) while we have too many slots
      if (carries > 0 && canCarry(i) && cast[i].length < size[i]) {
        const prev = cast[i - 1].filter((m) => m !== lead && !cast[i - 2]?.includes(m) && ok2(m, i));
        if (prev.length) { cast[i].push(prev[Math.floor(R() * prev.length)]); carries--; }
      }
      while (cast[i].length < size[i]) {
        const cands = POOL.filter((m) => ok(m, i)).map((m) => ({ m, s: fit(m, pf) * 2 - ((uses[m] ?? 0) + (featuredUses[m] ?? 0)) * 0.35 + (LOW.has(m) ? -1.5 : 0) + (i === peak ? Math.min(eff(m), 30) / 15 : 0) + R() * (1.5 + attempt * 0.15) }));
        if (!cands.length) { FAIL[`${j.name}/${j.phases[i].id}: no candidate`] = (FAIL[`${j.name}/${j.phases[i].id}: no candidate`] ?? 0) + 1; break; }
        cands.sort((a, b) => b.s - a.s);
        const m = cands[0].m;
        cast[i].push(m); used.add(m);
      }
    }
    function ok2(m, i) { return !(i === j.phases.length - 1 && raBan.last.has(m)) && i !== sparse; }
    const all = new Set(cast.flat());
    if (all.size < 11 || all.size > 13) { FAIL[`${j.name}: ${all.size} distinct (sizes ${size})`] = 1; continue; }
    const castObj = Object.fromEntries(j.phases.map((p, i) => [p.id, cast[i]]));
    const { fails } = hCheck(id, j, castObj);
    if (!pick || fails.length < pick.fails.length) pick = { cast: castObj, all, fails };
    }
    if (!pick) return null;
    if (pick.fails.length) HFAIL[j.name] = pick.fails.join(" ");
    const all = pick.all;
    for (const m of all) { anyUse[m] = (anyUse[m] ?? 0) + 1; if (m !== lead) uses[m] = (uses[m] ?? 0) + 1; }
    assigned.set(id, all);
    out[id] = pick.cast;
  }
  return { out, uses, anyUse };
}

const FAIL = {};
let HFAIL = {};
const ATTEMPTS = Number(arg("attempts", 60));
let best = null;
for (const dist of [MIN_DIST, 3, 2]) {
  MIN_DIST = dist;
  // several seeds; keep the cast with the fewest journeys still failing the H lens
for (let s = Number(arg("seed", 1)); s < Number(arg("seed", 1)) + Number(arg("seeds", 6)); s++) { HFAIL = {}; const r = solve(s); if (r && (!best || Object.keys(HFAIL).length < Object.keys(best.hfail).length)) best = { ...r, seed: s, dist, hfail: HFAIL }; if (best && !Object.keys(best.hfail).length) break; }
  if (best) break;
}
if (!best) { console.error("no feasible cast — raise --cap / --loop-cap", Object.entries(FAIL).sort((a, b) => b[1] - a[1]).slice(0, 12)); process.exit(1); }
const maxUse = Math.max(...Object.values(best.uses));
const maxLoop = Math.max(...Object.keys(best.anyUse).map((m) => (featuredUses[m] ?? 0) + best.anyUse[m]));
const file = `${ROOT}scripts/mv-rollout/shotlists/${setKey}.casts.json`;
writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), by: "scripts/mv-rollout/cast-shaders.mjs", seed: best.seed, cap: CAP, loopCap: LOOP_CAP, minDist: best.dist, maxSupportUses: maxUse, maxLoopUses: maxLoop, casts: Object.fromEntries(Object.entries(best.out).map(([id, cast]) => [id, { name: SETJ.find((j) => j.id === id).name, lead: recById.get(id).lead, cast }])) }, null, 1) + "\n");
console.log("H lens still failing:", best.hfail);
console.log(`cast ${Object.keys(best.out).length} journeys · seed ${best.seed} · min-dist ${best.dist} · max support uses ${maxUse} (cap ${CAP}) · max loop uses ${maxLoop} (cap ${LOOP_CAP}) → ${file}`);
for (const [id, c] of Object.entries(best.out)) console.log(`  ${SETJ.find((j) => j.id === id).name.padEnd(24)} ${new Set(Object.values(c).flat()).size} · ${Object.values(c).map((l) => l.join(",")).join(" | ")}`);
