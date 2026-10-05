#!/usr/bin/env node
// recast-expansion.mjs — Karel 2026-10-04 (after watching the Expansion
// on the kiosk): "all expansion imaging needs the journey design and arc
// responding to music analysis too like the other featured journeys ...
// your responsive shaders need to have variety as we have 100s of
// shaders ... i see the same over and over".
//
// For all 49 Expansion journeys (set 1's six + set 2's 43), in setlist
// order:
//  1. ARC FROM ANALYSIS — per-phase intensityMultiplier = mean normalized
//     note-energy of the phase, mapped 0.3–1.0 (the loudest phase = 1.0);
//     a track that crests at its end keeps its final phase ≥ 0.6 (the
//     engine's wind-down exemption); interior valleys fall below 0.56 so
//     the engine's sparse passage lands where the music actually thins.
//     Post follows Ghost's toned values (bloom ≤ 0.4, colorTemperature
//     0–0.1, vignette 0.2–0.35, halation ≤ 0.1) scaled by the phase's
//     energy — the cosmos defaults (bloom 0.7 / warm 0.3) washed blacks.
//  2. RECAST — every journey gets its OWN lead from the vetted pool
//     (scripts/shader-vetting.json), palette-fit to its world; the lead
//     sits in the loudest phases covering ~60% of the track. Supporting
//     cast: vetted shaders that are nobody's lead, never repeated within
//     a journey, usage balanced across the set, palette-aware, and no
//     support shared with the previous journey in the setlist.
// 2026-10-05 DIVERSITY RECAST (Karel: "i swear that the pool of shaders
// used in expansion journeys seems super limited. I would expect to not
// regularly see the same one used but i often do"). Measured: 29
// support shaders x ~25 uses each. Now:
//  - the pool is every vetted shader that passes WITH its brightness
//    gain (scripts/vet-shaders.mjs `pool`; gain applied on screen via
//    src/lib/shaders/shader-gain.generated.ts, written here);
//  - leads stay exclusive AS LEAD; a lead may support another journey
//    only >= LEAD_SUPPORT_DIST positions away in the setlist;
//  - each journey gets SUPPORTS_PER_JOURNEY distinct supports laid out
//    as contiguous runs across adjacent phases (continuity), never
//    re-appearing after a gap; a support is used at most CAP times and
//    never again within the next MIN_DIST-1 journeys (cyclic — the
//    kiosk loop wraps). Solved as a constrained assignment (randomized
//    greedy restarts, least-used-first, palette-aware); a failed config
//    relaxes in the documented order and is reported.
// Mastered Kinetic Lab journeys and Ghost are never touched (not in the
// Expansion path). Writes scripts/expansion-recast.json.
// Usage: node --env-file=.env.local scripts/recast-expansion.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

// 2026-10-05: per-phase intensities on the Expansion now come from the v2
// deep analysis (scripts/retheme-report.json). This script's older
// note-energy intensities would overwrite them — refuse unless explicit.
if (!process.argv.includes("--overwrite-measured-arcs")) {
  console.error("recast-expansion: refusing — it would overwrite the v2 measured arcs. Re-run the re-theme after, or pass --overwrite-measured-arcs.");
  process.exit(1);
}

const DRY = process.argv.includes("--dry-run");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const vet = JSON.parse(readFileSync("scripts/shader-vetting.json", "utf8"));
const set1 = JSON.parse(readFileSync("scripts/expansion-output.json", "utf8"));
const set2 = JSON.parse(readFileSync("scripts/expansion2-output.json", "utf8"));
const order = [...set1.journeys.map((j) => ({ id: j.journeyId, rec: j.recordingId, title: j.title })), ...set2.journeys.map((j) => ({ id: j.journeyId, rec: j.recordingId, title: j.title }))];
const MASTERED_LEADS = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const POOL = vet.pool.filter((m) => !MASTERED_LEADS.has(m));
const PRIOR = (() => { try { return JSON.parse(readFileSync("scripts/expansion-recast.json", "utf8")); } catch { return null; } })();
// LAYER BUDGET (on-screen luma check 2026-10-04: three screen-blended
// kinetic layers + the image stack add). Since 2026-10-05 the budget is
// met by each shader's opacity GAIN (vet.verdicts[m].gain for supports,
// .leadGain for a journey's own lead) rather than by excluding bright
// shaders. Effective (on-screen) mean = mean x gain.
const V = vet.verdicts;
const effMean = (m, lead = false) => V[m].mean * (lead ? V[m].leadGain : V[m].gain);
// ── palette helpers (mirror of journeys.ts paletteHueFamilies) ──
const RING = ["ember", "gold", "green", "teal", "blue", "violet", "magenta"];
function hsv(hex) { const n = parseInt(hex.replace("#", ""), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, v: mx }; }
function fam(h) { return h >= 345 || h < 25 ? "ember" : h < 70 ? "gold" : h < 160 ? "green" : h < 200 ? "teal" : h < 250 ? "blue" : h < 305 ? "violet" : "magenta"; }
function paletteFamilies(p) { const core = new Set(), near = new Set(); for (const k of ["primary", "accent", "glow"]) { if (!p?.[k]) continue; const c = hsv(p[k]); if (c.s < 0.2 || c.v < 0.15) continue; const i = RING.indexOf(fam(c.h)); if (k === "primary") core.add(RING[i]); near.add(RING[i]); near.add(RING[(i + 1) % 7]); near.add(RING[(i + 6) % 7]); } return { core, near }; }
function fit(mode, pf) { const h = vet.verdicts[mode]?.hue ?? "neutral"; if (pf.core.has(h)) return 3; if (pf.near.has(h)) return 2; if (h === "prismatic" || h === "neutral") return 1; return 0; }
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

// ── energy curve (same envelope as computeBounds) ──
function energyCurve(notes, duration) {
  const BIN = 0.5, n = Math.ceil(duration / BIN), e = new Array(n).fill(0);
  for (const nt of notes ?? []) { const i = Math.floor(nt.time / BIN); if (i >= 0 && i < n) e[i] += (nt.velocity ?? 64) / 127; }
  const W = 12; const sm = e.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += e[k]; c++; } return s / c; });
  const mx = Math.max(...sm) || 1; return sm.map((v) => v / mx);
}
const phaseEnergy = (curve, a, b) => { const n = curve.length, i0 = Math.floor(a * n), i1 = Math.max(i0 + 1, Math.ceil(b * n)); let s = 0; for (let i = i0; i < i1 && i < n; i++) s += curve[i]; return s / Math.max(1, Math.min(i1, n) - i0); };
const r2 = (x) => Math.round(x * 100) / 100;

// ── load journeys + analysis ──
const rows = [];
for (const j of order) {
  const { data: jr, error } = await sb.from("journeys").select("id,name,phases,theme").eq("id", j.id).single();
  if (error) throw error;
  const { data: an } = await sb.from("analyses").select("notes").eq("recording_id", j.rec).single();
  const { data: rec } = await sb.from("recordings").select("duration").eq("id", j.rec).single();
  rows.push({ ...j, phases: jr.phases, palette: jr.theme?.palette ?? jr.phases[0]?.palette, curve: energyCurve(an?.notes, rec.duration) });
}

// ── 1. arc ──
for (const r of rows) {
  const e = r.phases.map((p) => phaseEnergy(r.curve, p.start, p.end));
  const emax = Math.max(...e) || 1;
  // A phase at half the peak energy (or less) is a real valley -> 0.3;
  // the loudest phase = 1.0; flat tracks stay high (no invented valleys).
  let I = e.map((x) => 1 - 0.7 * Math.min(1, (emax - x) / (0.5 * emax)));
  const tail = phaseEnergy(r.curve, 0.85, 1);
  const crests = tail >= 0.8; // the music is still near full energy in its last 15%
  const last = I.length - 1;
  if (crests) I[last] = Math.max(I[last], 0.6);
  else I[last] = Math.min(I[last], 0.55); // let the engine's wind-down carry the ending
  I = I.map(r2);
  r.energy = e.map(r2); r.intensity = I; r.crests = crests;
  r.peakPhase = r.phases[e.indexOf(emax)].id;
}

// ── 2a. leads: KEEP the prior recast's leads (Karel has watched them;
//    exclusive, palette-fit) when they are all still in the pool;
//    otherwise pick: most-constrained journey first, best palette fit. ──
const priorLead = new Map((PRIOR?.journeys ?? []).map((j) => [j.id, j.lead]));
const keepPrior = rows.every((r) => POOL.includes(priorLead.get(r.id))) && new Set(rows.map((r) => priorLead.get(r.id))).size === rows.length;
if (keepPrior) for (const r of rows) { r.lead = priorLead.get(r.id); r.leadFit = fit(r.lead, paletteFamilies(r.palette)); }
else {
  const used = new Set();
  const candidatesFor = (r) => POOL.map((m) => ({ m, s: fit(m, paletteFamilies(r.palette)) * 2 + (effMean(m, true) > 25 ? 2.5 : 0) + hash(r.title + m) * 0.5 }));
  const byConstraint = [...rows].sort((a, b) => candidatesFor(a).filter((c) => c.s >= 8.5).length - candidatesFor(b).filter((c) => c.s >= 8.5).length);
  for (const r of byConstraint) {
    const best = candidatesFor(r).filter((c) => !used.has(c.m)).sort((a, b) => b.s - a.s)[0];
    used.add(best.m); r.lead = best.m; r.leadFit = fit(best.m, paletteFamilies(r.palette));
  }
}
const LEADS = new Set(rows.map((r) => r.lead));
const leadPos = new Map(rows.map((r, i) => [r.lead, i]));

// ── 2b. lead presence ~60%: the phase subset (always holding the energy
//    peak) whose duration is closest to 60%, louder subsets on ties ──
for (const r of rows) {
  const n = r.phases.length, peak = r.energy.indexOf(Math.max(...r.energy));
  let best = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    if (!(mask & (1 << peak))) continue;
    let cover = 0, en = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { cover += r.phases[i].end - r.phases[i].start; en += r.energy[i]; cnt++; }
    if (cnt < 2) continue;
    const score = Math.abs(cover - 0.6) - en * 0.01;
    if (!best || score < best.score) best = { score, mask, cover };
  }
  r.leadPhases = new Set(r.phases.map((_, i) => i).filter((i) => best.mask & (1 << i)));
  r.leadCoverage = r2(best.cover);
}

// ── 2c. slot layout: 3 layers ("lanes") per phase. Lane 0 holds the lead
//    in lead phases, a support elsewhere; lanes 1-2 always supports. Each
//    lane's free stretch is split into contiguous RUNS (one support per
//    run = it persists across adjacent phases); runs are split longest-
//    first until the journey has exactly `n` runs. Lanes split at
//    staggered points so supports don't all change at one boundary. ──
function layoutRuns(r, n) {
  const P = r.phases.length, runs = [];
  for (let lane = 0; lane < 3; lane++) {
    let cur = null;
    for (let i = 0; i < P; i++) {
      const free = lane > 0 || !r.leadPhases.has(i);
      if (free) { if (!cur) { cur = { lane, phases: [] }; runs.push(cur); } cur.phases.push(i); } else cur = null;
    }
  }
  while (runs.length < n) {
    const k = runs.reduce((bi, x, i) => (x.phases.length > runs[bi].phases.length ? i : bi), 0);
    const x = runs[k]; if (x.phases.length < 2) break;
    const cut = Math.floor(x.phases.length / 2) + (x.lane % 2 && x.phases.length >= 4 ? 1 : 0);
    runs.splice(k, 1, { lane: x.lane, phases: x.phases.slice(0, cut) }, { lane: x.lane, phases: x.phases.slice(cut) });
  }
  return runs;
}

// ── 2d. constrained support assignment ──
const N = rows.length;
const cdist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, N - d); };
const CAP = 5, LEAD_SUPPORT_DIST = 12;
// Relaxation order (first feasible wins). The brief: 6-8 supports per
// journey, no support reused within the next 10 journeys (distance
// >= 11), cap 5. Window bound: any minDist consecutive journeys need
// pairwise-disjoint supports, so their support counts must fit in
// nonLeadPool + leads usable there (N - minDist - 2x(LEAD_SUPPORT_DIST-1)).
// With the 95-shader pool that is 62 per 11 journeys -> an average of
// 5.6 supports per journey at distance 11. Configs keep the spacing law
// first and give as many journeys 6 supports as the bound allows.
const CONFIGS = [
  { label: "6/journey, dist 11", minDist: 11, sixes: 11 / 11 },
  { label: "6 or 5/journey (7 of every 11 get 6), dist 11", minDist: 11, sixes: 7 / 11 },
  { label: "6 or 5/journey (6 of every 11 get 6), dist 11", minDist: 11, sixes: 6 / 11 },
  { label: "6/journey, dist 10", minDist: 10, sixes: 1 },
  { label: "5/journey, dist 11", minDist: 11, sixes: 0 },
];
const SUPPORT_POOL = POOL; // every pool shader; leads only far from their own journey
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
// n_j: a Beatty pattern spreads the 6-support journeys evenly round the loop.
const countsFor = (c) => rows.map((_, j) => 5 + (Math.floor((j + 1) * c.sixes) > Math.floor(j * c.sixes) ? 1 : 0));
// MIN-CONFLICTS local search (hard: distinct within journey, domain =
// pool minus own lead minus leads closer than LEAD_SUPPORT_DIST; soft ->
// zero: cyclic distance < minDist between uses, uses > CAP). Replacement
// cost breaks ties by least-used, then palette fit.
function solve(c, iters = 400000) {
  const ns = countsFor(c);
  const pfs = rows.map((r) => paletteFamilies(r.palette));
  const domain = rows.map((r, j) => SUPPORT_POOL.filter((m) => m !== r.lead && !(LEADS.has(m) && cdist(leadPos.get(m), j) < LEAD_SUPPORT_DIST)));
  const at = new Map(SUPPORT_POOL.map((m) => [m, new Set()]));
  const sets = rows.map(() => new Set());
  const rand = rng(0x5eed1234);
  const conf = (m, j) => { let k = 0; for (const q of at.get(m)) if (q !== j && cdist(q, j) < c.minDist) k++; const u = at.get(m).size - (at.get(m).has(j) ? 1 : 0); return k + (u >= CAP ? 1 : 0); };
  const cost = (m, j) => conf(m, j) * 100 + at.get(m).size * 2 - fit(m, pfs[j]) * 0.8 + rand() * 1.5;
  const add = (m, j) => { sets[j].add(m); at.get(m).add(j); };
  const del = (m, j) => { sets[j].delete(m); at.get(m).delete(j); };
  for (let j = 0; j < N; j++) while (sets[j].size < ns[j]) { const best = domain[j].filter((m) => !sets[j].has(m)).map((m) => [m, cost(m, j)]).sort((x, y) => x[1] - y[1])[0][0]; add(best, j); }
  for (let it = 0; it < iters; it++) {
    const bad = [];
    for (let j = 0; j < N; j++) for (const m of sets[j]) if (conf(m, j) > 0) bad.push([m, j]);
    if (bad.length === 0) return { sets: sets.map((x) => [...x]), usesAt: new Map([...at].map(([m, v]) => [m, [...v].sort((x, y) => x - y)])), tries: it, ns };
    const [m, j] = bad[Math.floor(rand() * bad.length)];
    del(m, j);
    const opts = domain[j].filter((x) => !sets[j].has(x));
    const pick = rand() < 0.08 ? opts[Math.floor(rand() * opts.length)] : opts.map((x) => [x, cost(x, j)]).sort((x, y) => x[1] - y[1])[0][0];
    add(pick, j);
  }
  return null;
}
let solved = null, config = null;
const relaxed = [];
for (const c of CONFIGS) {
  const ns = countsFor(c);
  const usable = (SUPPORT_POOL.length - LEADS.size) + Math.max(0, N - c.minDist - 2 * (LEAD_SUPPORT_DIST - 1));
  let worst = 0; for (let j = 0; j < N; j++) { let sum = 0; for (let k = 0; k < c.minDist; k++) sum += ns[(j + k) % N]; worst = Math.max(worst, sum); }
  if (worst > usable) { relaxed.push(`${c.label}: infeasible by window bound (${worst} supports in ${c.minDist} journeys > ${usable} usable)`); continue; }
  solved = solve(c);
  if (solved) { config = c; break; }
  relaxed.push(`${c.label}: no solution found by local search`);
}
if (!solved) throw new Error("no feasible support assignment:\n" + relaxed.join("\n"));
for (const x of relaxed) console.log("relaxed:", x);
console.log(`solved: ${config.label} (local search ${solved.tries} moves)`);

// ── 2e. place each journey's supports on its runs: calmer shaders (lower
//    on-screen mean) into quieter runs ──
for (const [j, r] of rows.entries()) {
  const runs = layoutRuns(r, solved.ns[j]);
  if (runs.length !== solved.ns[j]) throw new Error(`${r.title}: layout gave ${runs.length} runs, need ${solved.ns[j]}`);
  const runI = (x) => x.phases.reduce((a, i) => a + r.intensity[i], 0) / x.phases.length;
  const runsByCalm = [...runs].sort((a, b) => runI(a) - runI(b) || a.lane - b.lane || a.phases[0] - b.phases[0]);
  const supByCalm = [...solved.sets[j]].sort((a, b) => effMean(a) - effMean(b));
  const lanes = r.phases.map((_, i) => [r.leadPhases.has(i) ? r.lead : null, null, null]);
  runsByCalm.forEach((x, k) => { for (const i of x.phases) lanes[i][x.lane] = supByCalm[k]; });
  r.cast = Object.fromEntries(r.phases.map((p, i) => [p.id, lanes[i]]));
  r.supports = solved.sets[j];
}
const uses = new Map(SUPPORT_POOL.map((m) => [m, solved.usesAt.get(m).length]));
// ── write phases ──
const post = (I) => ({ bloomIntensity: r2(0.1 + 0.3 * (I - 0.3) / 0.7), colorTemperature: r2(0.1 * (I - 0.3) / 0.7), vignette: r2(0.35 - 0.15 * (I - 0.3) / 0.7), halation: r2(0.02 + 0.08 * (I - 0.3) / 0.7), chromaticAberration: r2(0.03 * (I - 0.3) / 0.7), particleDensity: r2(0.01 + 0.06 * (I - 0.3) / 0.7) });
for (const r of rows) {
  const phases = r.phases.map((p, i) => ({ ...p, intensityMultiplier: r.intensity[i], ...post(r.intensity[i]), filmGrain: 0, shaderModes: r.cast[p.id] }));
  if (!DRY) { const { error } = await sb.from("journeys").update({ phases, audio_reactive: true }).eq("id", r.id); if (error) throw error; }
  console.log(`${r.title.padEnd(23)} lead ${r.lead.padEnd(18)} fit${r.leadFit} cover ${r.leadCoverage}  I ${r.intensity.join(" ")}  peak ${r.peakPhase}${r.crests ? " (crests)" : ""}`);
}
const hist = [...uses.entries()].filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1]);
// spacing actually achieved (cyclic, setlist order)
let minSpacing = Infinity;
for (const [, at] of solved.usesAt) for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) minSpacing = Math.min(minSpacing, cdist(at[a], at[b]));
let minLeadDist = Infinity;
for (const [m, at] of solved.usesAt) if (LEADS.has(m)) for (const k of at) minLeadDist = Math.min(minLeadDist, cdist(leadPos.get(m), k));
writeFileSync("scripts/expansion-recast.json", JSON.stringify({
  generated: new Date().toISOString(),
  pool: { vettedPass: vet.pass.length, vettedPoolWithGain: vet.pool.length, leads: rows.length, supportPool: SUPPORT_POOL.length, distinctSupportsUsed: hist.length },
  constraints: { config: config.label, supportsPerJourney: solved.ns, minDist: config.minDist, cap: CAP, leadSupportDist: LEAD_SUPPORT_DIST, relaxed },
  achieved: { minSpacing, minLeadDist, maxUses: hist[0][1], minUses: hist.at(-1)[1] },
  supportUses: Object.fromEntries(hist),
  journeys: rows.map((r) => ({ id: r.id, title: r.title, lead: r.lead, leadHue: V[r.lead].hue, leadFit: r.leadFit, leadCoverage: r.leadCoverage, energy: r.energy, intensity: r.intensity, crests: r.crests, peakPhase: r.peakPhase, supports: r.supports, cast: r.cast })),
}, null, 1));
// On-screen gains for the Expansion layers (consumed by
// expansionLayerGain in src/lib/journeys/kinetic.ts).
const gainEntries = (k) => POOL.filter((m) => V[m][k] < 1).sort().map((m) => `  ${JSON.stringify(m)}: ${V[m][k]},`).join("\n");
writeFileSync("src/lib/shaders/shader-gain.generated.ts", `// GENERATED by scripts/recast-expansion.mjs from scripts/shader-vetting.json
// (scripts/vet-shaders.mjs) — do not edit by hand.
// Per-shader opacity gain for Expansion kinetic layers: brings each
// shader to the layer budget (support mean <= ${vet.gain.supportTarget.mean} / black floor <= ${vet.gain.supportTarget.p5};
// a journey's own lead mean <= ${vet.gain.leadTarget.mean} / floor <= ${vet.gain.leadTarget.p5}). Shaders not listed run at 1.
export const SHADER_SUPPORT_GAIN: Readonly<Record<string, number>> = {
${gainEntries("gain")}
};
export const SHADER_LEAD_GAIN: Readonly<Record<string, number>> = {
${gainEntries("leadGain")}
};
/** Expansion journey name (lowercase) -> its exclusive lead. */
export const EXPANSION_LEADS: Readonly<Record<string, string>> = {
${rows.map((r) => `  ${JSON.stringify(r.title.toLowerCase())}: ${JSON.stringify(r.lead)},`).join("\n")}
};
`);
const distinctPer = rows.map((r) => new Set(Object.values(r.cast).flat()).size);
console.log(`\nsupport pool ${SUPPORT_POOL.length} (vetted pool ${vet.pool.length}) · distinct supports used ${hist.length} · uses min ${hist.at(-1)[1]} max ${hist[0][1]} · min spacing ${minSpacing} · min lead->support dist ${minLeadDist} · distinct shaders/journey ${Math.min(...distinctPer)}-${Math.max(...distinctPer)} · ${DRY ? "DRY RUN" : "DB updated"} → scripts/expansion-recast.json`);
