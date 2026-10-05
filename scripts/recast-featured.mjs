#!/usr/bin/env node
// recast-featured.mjs — the Expansion's shader-quality + diversity system
// applied to EVERY other journey (Karel 2026-10-05: "your shader work is
// for featured journeys too not just expansion and the other albums?" ->
// "everything besides snowflake, realized, ghost is getting the
// treatment").
//
// Targets: every journey that is NOT mastered (Snowflake / Realized /
// Ghost), NOT the Kinetic Lab (Chemiluminescence 1, Rolling 2, Stand 10,
// Cabin Soul 8, Cabin Soul 5 — approved casts) and NOT the Expansion
// (already recast by scripts/recast-expansion.mjs):
//  - LOOP: the kiosk setlist's featured built-ins + the Welcome Home,
//    Surrounded by Light and March Light albums (TRAMOKYO_SETLIST order);
//  - Cosmic Homecoming (closes the Welcome Home album program);
//  - OFF-LOOP: the other built-in JOURNEYS (in-app only).
//
// Each gets a DETERMINISTIC per-phase cast (the engine plays it instead
// of regenerating random pools — src/lib/journeys/journey-cast.ts):
//  - pool = scripts/shader-vetting.json `pool` (brightness-gain vetted)
//    minus Karel-rejected, GLOBAL/PICKTIME blocklists, geometry, 3D, the
//    Kinetic Lab's exclusive leads; per journey also minus its realm
//    blocklists and blockedShaders;
//  - K distinct shaders per journey (by track length), each on a
//    contiguous run of adjacent phases (continuity, never returns after a
//    gap), >= 3 per phase (primary + dual + tertiary);
//  - DIVERSITY across the WHOLE loop: no shader within the next
//    MIN_DIST-1 journeys in setlist order (cyclic), counting the fixed
//    casts already there — mastered scripted takes, Kinetic Lab casts,
//    every Expansion cast (an Expansion lead only >= 12 from its own
//    journey); each album also loops alone as its own program, so within
//    an album path uses are >= floor(len/2) apart cyclically; usage cap;
//  - palette-aware (SHADER_HUES families via the vetting `hue`) +
//    theme/realm category affinity; calmer shaders on quieter phases.
// Writes src/lib/journeys/journey-casts.generated.ts (runtime source of
// truth, ships in the bundle -> works offline), scripts/featured-recast.json
// (report), and mirrors the casts into the DB rows' phases[].shaderModes
// + the Tramokyo pack data (when present).
//
// SNOWFLAKE STANDARD ROLLOUT (Karel approved 2026-10-05, set by set):
//   --rollout=<set>  (scripts/mv-rollout/shotlists/<set>.mjs) recasts ONLY
//   that set's journeys, plus every journey already rolled out (report
//   `owned: true`), as PHASE-OWNED casts: 10-12 shaders by length, each
//   support living in ONE phase (sparse phase = one dark voice, quiet
//   phases two, the build/peak more), one lead on the peak phase(s) (<= 2
//   adjacent), DB phases keep shaderOwned. Every other journey is FROZEN to
//   its previous cast (scripts/featured-recast.json) byte-for-byte and
//   counts as fixed use. Loosened loop cap (Karel: ~8-10 journeys per
//   shader); spacing as close to 10 journeys as the pool allows — with 95
//   vetted shaders a 10-wide window cannot hold 10 x 10, so the solver
//   relaxes the distance in order and reports what it achieved.
//   Without --rollout the legacy full recast runs (refuses once any journey
//   is owned, so a rollout is never silently undone; --force-legacy).
// Usage: node --env-file=.env.local scripts/recast-featured.mjs [--rollout=<set>] [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readPackJson } from "./lib/pack-json.mjs";

const DRY = process.argv.includes("--dry-run");
const ROLLOUT = process.argv.find((a) => a.startsWith("--rollout="))?.slice(10) ?? null;
const PRIOR = existsSync("scripts/featured-recast.json") ? JSON.parse(readFileSync("scripts/featured-recast.json", "utf8")) : null;
const priorById = new Map((PRIOR?.journeys ?? []).map((j) => [j.id, j]));
const rolloutIds = ROLLOUT ? (await import(`./mv-rollout/shotlists/${ROLLOUT}.mjs`)).JOURNEYS.map((j) => j.id) : [];
const OWNED = new Set([...(PRIOR?.journeys ?? []).filter((j) => j.owned).map((j) => j.id), ...rolloutIds]);
if (!ROLLOUT && OWNED.size && !process.argv.includes("--force-legacy")) {
  console.error(`recast-featured: ${OWNED.size} journeys are rolled out to the Snowflake Standard — a legacy full recast would undo them. Use --rollout=<set> (or --force-legacy).`);
  process.exit(1);
}
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const J = await jiti.import("../src/lib/journeys/journeys.ts");
const REG = await jiti.import("../src/lib/shaders/index.ts");
const SEQ = await jiti.import("../src/lib/journeys/installation-sequence.ts");
const TAKES = await jiti.import("../src/lib/journeys/pinned-takes.ts");
const KIN = await jiti.import("../src/lib/journeys/kinetic.ts");
const { MASTERED_JOURNEYS } = await jiti.import("../src/lib/journeys/mastered.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const vet = JSON.parse(readFileSync("scripts/shader-vetting.json", "utf8"));
const exp = JSON.parse(readFileSync("scripts/expansion-recast.json", "utf8"));
const V = vet.verdicts;
const r2 = (x) => Math.round(x * 100) / 100;

// ── pool ──
export const KAREL_REJECTED = ["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"];
const KINETIC_LAB_LEADS = ["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"];
const GEOMETRY = new Set(REG.MODE_META.filter((m) => m.category === "Geometry").map((m) => m.mode));
const REJ = new Set([...KAREL_REJECTED, ...KINETIC_LAB_LEADS, ...J.GLOBAL_SHADER_BLOCKLIST, ...J.PICKTIME_SHADER_BLOCKLIST, "r-petals"]);
const POOL = vet.pool.filter((m) => !REJ.has(m) && !GEOMETRY.has(m) && !REG.MODES_3D.has(m) && REG.SHADERS[m] && !(V[m].reasons ?? []).some((x) => /karelRejected/.test(x)));
const effMean = (m) => V[m].mean * V[m].gain;

// ── palette helpers (mirror of journeys.ts paletteHueFamilies / recast-expansion) ──
const RING = ["ember", "gold", "green", "teal", "blue", "violet", "magenta"];
function hsv(hex) { const n = parseInt(hex.replace("#", ""), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, v: mx }; }
function fam(h) { return h >= 345 || h < 25 ? "ember" : h < 70 ? "gold" : h < 160 ? "green" : h < 200 ? "teal" : h < 250 ? "blue" : h < 305 ? "violet" : "magenta"; }
function paletteFamilies(p) { const core = new Set(), near = new Set(); for (const k of ["primary", "accent", "glow"]) { if (!p?.[k]) continue; const c = hsv(p[k]); if (c.s < 0.2 || c.v < 0.15) continue; const i = RING.indexOf(fam(c.h)); if (k === "primary") core.add(RING[i]); near.add(RING[i]); near.add(RING[(i + 1) % 7]); near.add(RING[(i + 6) % 7]); } return { core, near }; }
function fit(mode, pf) { const h = V[mode]?.hue ?? "neutral"; if (pf.core.has(h)) return 3; if (pf.near.has(h)) return 2; if (h === "prismatic" || h === "neutral") return 1; return 0; }

// ── journeys ──
const masteredLike = (id, name) => MASTERED_JOURNEYS.has(id) || ["snowflake", "realized", "ghost"].includes((name ?? "").trim().toLowerCase());
const { data: rows, error } = await sb.from("journeys").select("id,name,realm_id,phases,theme,recording_id");
if (error) throw error;
const dbById = new Map(rows.map((r) => [r.id, r]));
const { data: paths } = await sb.from("journey_paths").select("name,share_token,journey_ids,culmination_journey_id");
const recIds = rows.map((r) => r.recording_id).filter(Boolean);
const { data: recs } = await sb.from("recordings").select("id,duration").in("id", recIds);
const durOf = new Map(recs.map((r) => [r.id, r.duration]));
const BUILTIN_DUR = { "the-ascent": 202, "the-ascension": 200, "the-bloom": 215, "cosmic-drift": 282, "mycelium-dream": 385 };

function describe(id) {
  const b = J.JOURNEYS.find((j) => j.id === id);
  if (b) return { id, name: b.name, builtin: true, realm: b.realmId, phases: b.phases, palette: b.theme?.palette ?? b.phases[0]?.palette, cats: b.theme?.shaderCategories ?? J.REALM_SHADER_AFFINITY[b.realmId] ?? [], blocked: b.blockedShaders ?? [], dur: BUILTIN_DUR[id] ?? 300 };
  const r = dbById.get(id);
  if (!r) return null;
  if (r.theme?.builtinJourneyId) return null; // wraps a built-in (the mastered EP copies) — not a cast target
  return { id, name: r.name, builtin: false, realm: r.realm_id, phases: r.phases, palette: r.theme?.palette ?? r.phases[0]?.palette, cats: r.theme?.shaderCategories ?? [], blocked: r.theme?.blockedShaders ?? [], dur: durOf.get(r.recording_id) ?? 300 };
}
const protectedId = (id) => { const d = dbById.get(id); const b = J.JOURNEYS.find((j) => j.id === id); const name = d?.name ?? b?.name; return masteredLike(id, name) || KIN.isKineticJourneyName(name) || !!d?.theme?.builtinJourneyId; };

// LOOP = the kiosk setlist in order
const SET = [...SEQ.TRAMOKYO_SETLIST];
const L = SET.length;
const loopTargets = SET.map((id, pos) => ({ id, pos })).filter(({ id }) => !protectedId(id)).map(({ id, pos }) => ({ ...describe(id), pos }));
if (loopTargets.some((t) => !t.name)) throw new Error("unresolved setlist journey");
// fixed uses already in the loop (pos -> modes)
const fixed = new Map(); // mode -> [{pos, lead}]
const addFixed = (m, pos, lead = false) => { if (!m) return; const a = fixed.get(m) ?? []; a.push({ pos, lead }); fixed.set(m, a); };
const expById = new Map(exp.journeys.map((j) => [j.id, j]));
const fixedSummary = { mastered: 0, kineticLab: 0, expansion: 0 };
const kineticLabCasts = {}; // recorded so the vitest guard can check spacing against them (they live in the DB)
SET.forEach((id, pos) => {
  if (!protectedId(id)) return;
  const name = dbById.get(id)?.name ?? J.JOURNEYS.find((j) => j.id === id)?.name;
  if (masteredLike(id, name)) { for (const e of TAKES.SCRIPTED_TAKES[id] ?? []) addFixed(e.mode, pos); fixedSummary.mastered++; return; }
  const e = expById.get(id);
  if (e) { for (const m of new Set(Object.values(e.cast).flat())) addFixed(m, pos, m === e.lead); fixedSummary.expansion++; return; }
  for (const p of dbById.get(id)?.phases ?? []) for (const m of p.shaderModes ?? []) addFixed(m, pos);
  kineticLabCasts[id] = [...new Set((dbById.get(id)?.phases ?? []).flatMap((p) => p.shaderModes ?? []))];
  fixedSummary.kineticLab++;
});
// album paths (each also loops alone as an installation program)
const pathOf = new Map(); // id -> {name, idx, len}
for (const p of paths) {
  if (!["Welcome Home", "Surrounded by Light", "March Light"].includes(p.name)) continue;
  const ids = [...p.journey_ids, ...(p.culmination_journey_id ? [p.culmination_journey_id] : [])];
  ids.forEach((id, idx) => pathOf.set(id, { name: p.name, idx, len: ids.length }));
}
const culms = [...pathOf.keys()].filter((id) => !SET.includes(id) && !protectedId(id)).map((id) => ({ ...describe(id), pos: null }));
const offLoop = J.JOURNEYS.filter((j) => !SET.includes(j.id) && !protectedId(j.id)).map((j, k) => ({ ...describe(j.id), pos: null, off: k }));
const T = [...loopTargets, ...culms, ...offLoop];
const OFF_N = offLoop.length;

// ── constraints ──
const cdist = (a, b, n) => { const d = Math.abs(a - b); return Math.min(d, n - d); };
const LEAD_SUPPORT_DIST = 12;
const PATH_MIN = (len) => Math.floor(len / 2);
const kFor = (dur, c) => (c.owned ? 10 + (dur > 150 ? 1 : 0) + (dur > 240 ? 1 : 0) : c.base + (c.mid && dur > c.mid ? 1 : 0) + (dur > 330 ? 1 : 0) + (dur > 420 ? 1 : 0));
const CONFIGS = [
  { label: "8-10/journey (by length), dist 11", minDist: 11, base: 8, cap: 4, offDist: 6 },
  { label: "7-10/journey (by length: +1 over 4:00, 5:30, 7:00), dist 11", minDist: 11, base: 7, mid: 240, cap: 4, offDist: 6 },
  { label: "7-9/journey (by length: +1 over 5:30, 7:00), dist 11", minDist: 11, base: 7, cap: 4, offDist: 6 },
  { label: "8-10/journey, dist 10", minDist: 10, base: 8, cap: 5, offDist: 5 },
  { label: "7-9/journey, dist 10", minDist: 10, base: 7, cap: 5, offDist: 5 },
];
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

function solve(c, iters = 300000) {
  const N = T.length;
  const frozen = T.map((t) => (ROLLOUT ? !OWNED.has(t.id) : false));
  const ns = T.map((t, j) => (frozen[j] ? priorById.get(t.id).shaders.length : kFor(t.dur, c)));
  const pfs = T.map((t) => paletteFamilies(t.palette));
  const domain = T.map((t) => {
    const ban = new Set([...(t.blocked ?? []), ...(J.REALM_SHADER_BLOCKLIST[t.realm] ?? []), ...(J.PICKTIME_REALM_BLOCKLIST[t.realm] ?? [])]);
    return POOL.filter((m) => !ban.has(m) && !(t.pos != null && (fixed.get(m) ?? []).some((f) => cdist(f.pos, t.pos, L) < (f.lead ? Math.max(LEAD_SUPPORT_DIST, c.minDist) : c.minDist))));
  });
  const at = new Map(POOL.map((m) => [m, new Set()]));
  const sets = T.map(() => new Set());
  const rand = rng(0xfea7);
  const clash = (j, q) => {
    const a = T[j], b = T[q];
    if (a.pos != null && b.pos != null && cdist(a.pos, b.pos, L) < c.minDist) return true;
    const pa = pathOf.get(a.id), pb = pathOf.get(b.id);
    if (pa && pb && pa.name === pb.name && cdist(pa.idx, pb.idx, pa.len) < PATH_MIN(pa.len)) return true;
    if (a.off != null && b.off != null && cdist(a.off, b.off, OFF_N) < c.offDist) return true;
    return false;
  };
  const conf = (m, j) => {
    let k = 0, loopUses = 0, offUses = 0;
    for (const q of at.get(m)) { if (q === j) continue; if (clash(j, q)) k++; if (T[q].pos != null) loopUses++; else offUses++; }
    if (T[j].pos != null && loopUses >= c.cap) k++;
    if (T[j].pos == null && offUses >= 2) k++;
    return k;
  };
  const affinity = (m, j) => (T[j].cats.includes(V[m].category) ? 1 : 0);
  const cost = (m, j) => conf(m, j) * 100 + at.get(m).size * 2 - fit(m, pfs[j]) * 0.8 - affinity(m, j) * 0.6 + rand() * 1.5;
  const add = (m, j) => { sets[j].add(m); at.get(m).add(j); };
  const del = (m, j) => { sets[j].delete(m); at.get(m).delete(j); };
  for (let j = 0; j < N; j++) if (frozen[j]) for (const m of priorById.get(T[j].id).shaders) add(m, j);
  for (let j = 0; j < N; j++) {
    if (frozen[j]) continue;
    if (domain[j].length < ns[j]) return { fail: `${T[j].name}: domain ${domain[j].length} < ${ns[j]}` };
    while (sets[j].size < ns[j]) { const best = domain[j].filter((m) => !sets[j].has(m)).map((m) => [m, cost(m, j)]).sort((x, y) => x[1] - y[1])[0][0]; add(best, j); }
  }
  for (let it = 0; it < iters; it++) {
    const bad = [];
    for (let j = 0; j < N; j++) if (!frozen[j]) for (const m of sets[j]) if (conf(m, j) > 0) bad.push([m, j]);
    if (bad.length === 0) return { sets: sets.map((x) => [...x]), ns, tries: it };
    const [m, j] = bad[Math.floor(rand() * bad.length)];
    del(m, j);
    const opts = domain[j].filter((x) => !sets[j].has(x));
    const pick = rand() < 0.08 ? opts[Math.floor(rand() * opts.length)] : opts.map((x) => [x, cost(x, j)]).sort((x, y) => x[1] - y[1])[0][0];
    add(pick, j);
  }
  return { fail: "local search exhausted" };
}
// Rollout configs: 10-12 shaders by length (Snowflake: 14), cap 10 loop
// uses, distance relaxed from 10 only as far as needed. The frozen
// legacy journeys keep their own (wider) spacing among themselves.
const kOwned = (dur) => 10 + (dur > 150 ? 1 : 0) + (dur > 240 ? 1 : 0);
const ROLLOUT_CONFIGS = [10, 9, 8, 7, 6, 5].map((d) => ({ label: `owned 10-12/journey (by length), cap 10, dist ${d}`, minDist: d, base: 10, cap: 10, offDist: 5, owned: true }));
let solved = null, config = null; const relaxed = [];
for (const c of ROLLOUT ? ROLLOUT_CONFIGS : CONFIGS) {
  const s = solve(c);
  if (!s.fail) { solved = s; config = c; break; }
  relaxed.push(`${c.label}: ${s.fail}`);
}
if (!solved) throw new Error("no feasible cast:\n" + relaxed.join("\n"));
for (const x of relaxed) console.log("relaxed:", x);
console.log(`solved: ${config.label} (${solved.tries} moves)`);

// ── layout: each shader a contiguous run of adjacent phases; >= 3 per phase ──
const DEFAULT_I = { threshold: 0.4, expansion: 0.7, transcendence: 1, illumination: 0.85, return: 0.55, integration: 0.4 };
function layout(t, shaders) {
  const P = t.phases.length, K = shaders.length;
  const I = t.phases.map((p) => p.intensityMultiplier ?? DEFAULT_I[p.id] ?? 0.6);
  for (let h = 1.5 * Math.max(1, 8 / K); h < P; h += 0.1) {
    const runs = shaders.map((_, k) => { const c = ((k + 0.5) * P) / K; return t.phases.map((_, p) => p).filter((p) => Math.abs(p + 0.5 - c) < h); });
    if (runs.some((r) => r.length === 0)) continue;
    const per = t.phases.map((_, p) => runs.filter((r) => r.includes(p)).length);
    if (Math.min(...per) < 3) continue;
    // calmer shaders (lower on-screen mean) on quieter runs
    const runI = (r) => r.reduce((a, p) => a + I[p], 0) / r.length;
    const order = runs.map((r, k) => k).sort((a, b) => runI(runs[a]) - runI(runs[b]) || a - b);
    const byCalm = [...shaders].sort((a, b) => effMean(a) - effMean(b) || a.localeCompare(b));
    const slot = new Array(K); order.forEach((k, i) => { slot[k] = byCalm[i]; });
    return Object.fromEntries(t.phases.map((p, pi) => [p.id, runs.map((r, k) => (r.includes(pi) ? slot[k] : null)).filter(Boolean)]));
  }
  throw new Error(`${t.name}: no layout`);
}
// ── owned layout (Snowflake Standard): each support ONE phase, one lead on
// the peak (<= 2 adjacent phases), sparse phase = one dark voice, quiet
// phases two, louder/longer phases more; calm shaders on quiet phases.
function ownedLayout(t, shaders) {
  const P = t.phases.length;
  const I = t.phases.map((p) => p.intensityMultiplier ?? DEFAULT_I[p.id] ?? 0.6);
  const Ls = t.phases.map((p) => Math.max(0.01, (p.end ?? 1) - (p.start ?? 0)));
  const byCalm = [...shaders].sort((a, b) => effMean(a) - effMean(b) || a.localeCompare(b));
  const peak = I.indexOf(Math.max(...I));
  const leadPhases = [peak];
  const nb = [peak - 1, peak + 1].filter((q) => q >= 0 && q < P && I[q] >= 0.85).sort((a, b) => I[b] - I[a])[0];
  if (nb != null) leadPhases.push(nb);
  // lead: the brightest-reading shader that fits the palette (it carries the peak)
  const pf = paletteFamilies(t.palette);
  const lead = [...shaders].sort((a, b) => fit(b, pf) - fit(a, pf) || effMean(b) - effMean(a) || a.localeCompare(b))[0];
  const supports = byCalm.filter((m) => m !== lead);
  // seat counts per phase
  const want = t.phases.map((p, q) => (p.sparse ? 1 : I[q] < 0.5 ? 2 : 2));
  let left = supports.length - want.reduce((a, b) => a + b, 0);
  while (left < 0) { const q = want.map((w, i) => [w, i]).filter(([w, i]) => w > 1 && !t.phases[i].sparse).sort((a, b) => I[a[1]] - I[b[1]])[0][1]; want[q]--; left++; }
  while (left > 0) { // extra seats to the loud, long phases
    const q = t.phases.map((p, i) => [p.sparse ? -1 : Ls[i] * (0.4 + I[i]) / want[i], i]).sort((a, b) => b[0] - a[0])[0][1];
    want[q]++; left--;
  }
  // calm supports to quiet phases: order phases by intensity, fill seats
  const order = t.phases.map((_, i) => i).sort((a, b) => (t.phases[b].sparse ? 1 : 0) - (t.phases[a].sparse ? 1 : 0) || I[a] - I[b] || a - b);
  const cast = Object.fromEntries(t.phases.map((p) => [p.id, []]));
  let k = 0;
  for (const q of order) for (let s = 0; s < want[q]; s++) cast[t.phases[q].id].push(supports[k++]);
  for (const q of leadPhases) cast[t.phases[q].id].unshift(lead);
  return { cast, lead };
}
T.forEach((t, j) => {
  t.shaders = solved.sets[j];
  t.owned = OWNED.has(t.id);
  if (ROLLOUT && !t.owned) { const pr = priorById.get(t.id); t.cast = pr.cast; t.shaders = pr.shaders; return; }
  if (t.owned) { const o = ownedLayout(t, t.shaders); t.cast = o.cast; t.lead = o.lead; }
  else t.cast = layout(t, t.shaders);
});

// ── report ──
const loopIdx = T.map((t, j) => (t.pos != null ? j : -1)).filter((j) => j >= 0);
const uses = new Map();
for (const j of loopIdx) for (const m of T[j].shaders) uses.set(m, (uses.get(m) ?? 0) + 1);
let minSpacing = Infinity, minSpacingAll = Infinity;
for (const a of loopIdx) for (const b of loopIdx) if (a < b) for (const m of T[a].shaders) if (T[b].shaders.includes(m)) minSpacing = Math.min(minSpacing, cdist(T[a].pos, T[b].pos, L));
for (const j of loopIdx) for (const m of T[j].shaders) for (const f of fixed.get(m) ?? []) minSpacingAll = Math.min(minSpacingAll, cdist(f.pos, T[j].pos, L));
const hist = [...uses.entries()].sort((a, b) => b[1] - a[1]);
const histCounts = {}; for (const [, u] of hist) histCounts[u] = (histCounts[u] ?? 0) + 1;
console.log(`pool ${POOL.length} · loop targets ${loopTargets.length} · culminations ${culms.length} · off-loop ${offLoop.length} · distinct used in loop ${uses.size} · uses histogram ${JSON.stringify(histCounts)} · min spacing recast/recast ${minSpacing} · recast/fixed ${minSpacingAll}`);
for (const t of T) console.log(`${String(t.pos ?? "-").padStart(3)} ${t.name.padEnd(22)} ${t.shaders.length}  ${t.shaders.join(" ")}`);

const OUT_REPORT = DRY ? `${process.env.TMPDIR ?? "/tmp"}/featured-recast.dry.json` : "scripts/featured-recast.json";
const OUT_TS = DRY ? `${process.env.TMPDIR ?? "/tmp"}/journey-casts.dry.ts` : "src/lib/journeys/journey-casts.generated.ts";
writeFileSync(OUT_REPORT, JSON.stringify({
  generated: new Date().toISOString(),
  pool: POOL,
  constraints: ROLLOUT
    ? { legacy: PRIOR?.constraints?.legacy ?? PRIOR?.constraints, owned: { config: config.label, minDist: config.minDist, cap: config.cap, leadSupportDist: LEAD_SUPPORT_DIST, relaxed, rollouts: [...new Set([...(PRIOR?.constraints?.owned?.rollouts ?? []), ROLLOUT])] } }
    : { config: config.label, minDist: config.minDist, cap: config.cap, offDist: config.offDist, leadSupportDist: LEAD_SUPPORT_DIST, pathMin: "floor(len/2) cyclic within each album path", relaxed },
  fixedInLoop: fixedSummary,
  kineticLabCasts,
  achieved: { minSpacingRecast: minSpacing, minSpacingVsFixed: minSpacingAll, distinctInLoop: uses.size, usesHistogram: histCounts },
  uses: Object.fromEntries(hist),
  journeys: T.map((t) => ({ id: t.id, name: t.name, builtin: t.builtin, setlistPos: t.pos, path: pathOf.get(t.id)?.name ?? (t.off != null ? "off-loop built-in" : "featured"), pathIdx: pathOf.get(t.id)?.idx ?? null, pathLen: pathOf.get(t.id)?.len ?? null, dur: Math.round(t.dur), shaders: t.shaders, cast: t.cast, ...(t.owned ? { owned: true, lead: t.lead } : {}) })),
}, null, 1));

writeFileSync(OUT_TS, `// GENERATED by scripts/recast-featured.mjs — do not edit by hand.
// Deterministic per-phase shader casts for every journey that is not
// mastered (Snowflake / Realized / Ghost), not the Kinetic Lab and not
// the Expansion (Karel 2026-10-05: "everything besides snowflake,
// realized, ghost is getting the treatment"). Played by the engine in
// place of regenerated random pools (src/lib/journeys/journey-cast.ts).
// Config: ${config.label}; min spacing across the whole kiosk loop ${Math.min(minSpacing, minSpacingAll)}.
export const JOURNEY_CASTS: Readonly<Record<string, { name: string; cast: Readonly<Record<string, readonly string[]>> }>> = {
${T.map((t) => `  ${JSON.stringify(t.id)}: { name: ${JSON.stringify(t.name)}, cast: ${JSON.stringify(t.cast)} },`).join("\n")}
};
/** The vetted, brightness-normalized shader pool (scripts/shader-vetting.json
 *  minus Karel-rejected, blocklists, geometry, 3D, Kinetic Lab leads). */
export const VETTED_SHADER_POOL: ReadonlySet<string> = new Set(${JSON.stringify(POOL)});
`);

// ── mirror into DB + pack (runtime reads the generated TS by id) ──
const dbTargets = T.filter((t) => !t.builtin && (!ROLLOUT || t.owned));
const PACK = "public/tramokyo-pack/data/journeys.json";
const packFile = existsSync(PACK) ? readPackJson(PACK) : null;
const pack = packFile?.data ?? null;
for (const t of dbTargets) {
  if (DRY) continue;
  const { data: fresh, error: e1 } = await sb.from("journeys").select("phases").eq("id", t.id).single(); // re-read right before writing
  if (e1) throw e1;
  const phases = fresh.phases.map((p) => ({ ...p, shaderModes: t.cast[p.id] ?? p.shaderModes }));
  const { error: e2 } = await sb.from("journeys").update({ phases }).eq("id", t.id);
  if (e2) throw e2;
  const pr = pack?.find((x) => x.id === t.id);
  if (pr) pr.phases = pr.phases.map((p) => ({ ...p, shaderModes: t.cast[p.id] ?? p.shaderModes }));
}
if (pack && !DRY) packFile.write(pack);
console.log(`${DRY ? "DRY RUN" : `DB updated (${dbTargets.length} rows)${pack ? " + pack data" : ""}`} → src/lib/journeys/journey-casts.generated.ts, scripts/featured-recast.json`);
