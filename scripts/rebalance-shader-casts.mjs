#!/usr/bin/env node
// rebalance-shader-casts.mjs — loop-wide SHADER RECAST for diversity
// (Karel 2026-10-12; laws in src/lib/journeys/shader-balance.ts):
// amber share <= AMBER_SHARE_MAX, every shader <= its loop cap (magma /
// parsec / ember 5, dharma 2, everything else SHADER_LOOP_CAP), no dharma in
// First Light (Aureole there), a light-ray shader (zenith / seraph) in every
// light-themed journey, Grasshopper's 66 s illumination phase given a bigger
// cast (one voice per SECONDS_PER_VOICE) without parsec.
//
// It works on the casts that are already approved and on screen (featured /
// album casts: scripts/featured-recast.json + journey-casts.generated.ts;
// Expansion casts: scripts/expansion-recast.json, mirrored in the pack + DB)
// by SLOT SUBSTITUTION: a replaced shader's slot (same phase, same position)
// takes the new shader, so every phase-owned layout, lead placement, sparse
// dark pair and voice count stays exactly as cast. Expansion leads (exclusive,
// gain-tuned) never move. Mastered takes (Snowflake / Realized / Ghost) are
// fixed and only count toward the caps.
//
// Every substitution honours the rules the cast scripts and tests enforce:
// vetted pool, Karel-rejected / blocklists / geometry / 3D / realm + journey
// bans; set spacing (featured: featured-recast.test MIN_DIST / owned dist;
// Expansion: >= EXP_DIST in Expansion order, another journey's lead >= 6
// away); album-path spacing; Rise Above neighbours share no shader; caps
// (loop cap, recast cap 12, Expansion support cap 8); slot brightness
// budget (sparse dark pair eff <= 12, opening phase <= 20, all <= 40).
// Replacements lean cosmic (Cosmic category, cool hues), least-used first,
// palette-aware, close to the replaced shader's on-screen level. Every
// changed journey is then replayed in the real JourneyEngine (H lens) and
// compared with its previous cast.
//
// Deterministic (no randomness) and idempotent (a second run changes nothing).
// Writes: scripts/featured-recast.json, src/lib/journeys/journey-casts.generated.ts,
// scripts/expansion-recast.json, scripts/shader-recast-2026-10-13.expansion-casts.json
// (the pack/DB apply input for scripts/apply-shader-recast-2026-10-13.mjs) and,
// with --report, docs/shader-recast-2026-10-13.md.
// Reads the Tramokyo pack READ-ONLY (phase bounds, sparse flags, durations).
// Usage: node scripts/rebalance-shader-casts.mjs [--dry-run] [--changes] [--no-ra-repair] [--report] [--pack=<dir>] [--apply-out=scripts/<name>.json]
// 2026-10-13b (sun promotion): --no-ra-repair --apply-out=scripts/shader-recast-2026-10-13b.expansion-casts.json
// 2026-10-13c (particle shaders ~33 % of every journey — 7. PARTICLE PASS, also writes
// src/lib/journeys/particle-voices.generated.ts + loop-phase-skeletons.generated.ts):
// --no-ra-repair --apply-out=scripts/shader-recast-2026-10-13c-particles.expansion-casts.json
// (re-run until "changed journeys 0"; measure with scripts/measure-particle-shader-share.mjs)
import { createJiti } from "jiti";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const DRY = process.argv.includes("--dry-run");
const REPORT = process.argv.includes("--report");
// The pack is gitignored: in a worktree read the main checkout's copy (read-only).
const PACK = arg("pack", existsSync(ROOT + "public/tramokyo-pack/data/journeys.json") ? ROOT + "public/tramokyo-pack" : "/Users/karelbarnoski/my-app/public/tramokyo-pack");

let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const J = await jiti.import(ROOT + "src/lib/journeys/journeys.ts");
const ENG = await jiti.import(ROOT + "src/lib/journeys/journey-engine.ts");
const SEQ = await jiti.import(ROOT + "src/lib/journeys/installation-sequence.ts");
const SH = await jiti.import(ROOT + "src/lib/shaders/index.ts");
const PT = await jiti.import(ROOT + "src/lib/journeys/pinned-takes.ts");
const BAL = await jiti.import(ROOT + "src/lib/journeys/shader-balance.ts");
const MAST = await jiti.import(ROOT + "src/lib/journeys/mastered.ts");
const { VETTED_SHADER_POOL } = await jiti.import(ROOT + "src/lib/journeys/journey-casts.generated.ts");
const { STD } = await import("./lib/snowflake-standard.mjs");
const PSH = await jiti.import(ROOT + "src/lib/journeys/particle-shaders.ts");
const PARTICLE_SET = PSH.PARTICLE_SHADER_SET;
const { PARTICLE_PROFILES } = await jiti.import(ROOT + "src/lib/journeys/particle-profiles.generated.ts");
// the engine reads the voice lists from this module instance: the H lens
// replays (journeyFor) see each journey's voices as the pass casts them
const PVG = await jiti.import(ROOT + "src/lib/journeys/particle-voices.generated.ts");
const CUR_VOICES = Object.fromEntries(Object.entries(PVG.PARTICLE_VOICES).map(([k, v]) => [k, [...v]]));
const castParticles = (w) => [...modesOf(w)].filter((m) => PARTICLE_SET.has(m));

const FEAT_PATH = ROOT + "scripts/featured-recast.json";
const EXP_PATH = ROOT + "scripts/expansion-recast.json";
const TS_PATH = ROOT + "src/lib/journeys/journey-casts.generated.ts";
const GAIN_PATH = ROOT + "src/lib/shaders/shader-gain.generated.ts";
const featured = JSON.parse(readFileSync(FEAT_PATH, "utf8"));
const expansion = JSON.parse(readFileSync(EXP_PATH, "utf8"));
const vet = JSON.parse(readFileSync(ROOT + "scripts/shader-vetting.json", "utf8"));
const pack = JSON.parse(readFileSync(`${PACK}/data/journeys.json`, "utf8"));
const recDur = new Map(JSON.parse(readFileSync(`${PACK}/data/recordings.json`, "utf8")).map((r) => [r.id, Number(r.duration) || 0]));
const packById = new Map(pack.map((r) => [r.id, r]));
const V = vet.verdicts;
const eff = (m) => V[m].mean * (V[m].gain ?? 1);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── pools (mirror of cast-owned-featured.mjs / cast-shaders.mjs) ──
const REJ = new Set(["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"]);
const KLAB = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const GEOMETRY = new Set(SH.MODE_META.filter((m) => m.category === "Geometry").map((m) => m.mode));
const LOW = new Set(J.LOW_TIER_BLOCKED_SHADERS);
const BASE_POOL = vet.pool.filter((m) => !REJ.has(m) && !KLAB.has(m) && !J.GLOBAL_SHADER_BLOCKLIST.includes(m) && !J.PICKTIME_SHADER_BLOCKLIST.has(m) && !GEOMETRY.has(m) && !SH.MODES_3D.has(m) && !(V[m].reasons ?? []).some((x) => /karelRejected/.test(x)));
const FEAT_POOL = BASE_POOL.filter((m) => VETTED_SHADER_POOL.has(m));

// palette fit (mirror of the cast scripts)
const RING = ["ember", "gold", "green", "teal", "blue", "violet", "magenta"];
function hsv(hex) { const n = parseInt(hex.replace("#", ""), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, v: mx }; }
const fam = (h) => (h >= 345 || h < 25 ? "ember" : h < 70 ? "gold" : h < 160 ? "green" : h < 200 ? "teal" : h < 250 ? "blue" : h < 305 ? "violet" : "magenta");
function paletteFamilies(p) { const core = new Set(), near = new Set(); for (const k of ["primary", "accent", "glow"]) { if (!p?.[k]) continue; const c = hsv(p[k]); if (c.s < 0.2 || c.v < 0.15) continue; const i = RING.indexOf(fam(c.h)); if (k === "primary") core.add(RING[i]); near.add(RING[i]); near.add(RING[(i + 1) % 7]); near.add(RING[(i + 6) % 7]); } return { core, near }; }
const fit = (m, pf) => { const h = V[m]?.hue ?? "neutral"; return pf.core.has(h) ? 3 : pf.near.has(h) ? 2 : h === "prismatic" || h === "neutral" ? 1 : 0; };
const COOL = new Set(["blue", "violet", "teal", "prismatic"]);

// ── the loop ──
const L = SEQ.TRAMOKYO_SETLIST;
const NL = L.length;
const SET_OF = SEQ.TRAMOKYO_MAIN.sets.filter((s) => !s.borrows).flatMap((s, si) => s.journeyIds.map(() => si));
const EXP = SEQ.TRAMOKYO_MAIN.sets.find((s) => s.presenting === "Expansion").journeyIds;
const RA = SEQ.TRAMOKYO_RISE_ABOVE;
const cdist = (a, b, n) => { const d = Math.abs(a - b); return Math.min(d, n - d); };
const FEAT_MIN_DIST = 10, OWNED_DIST = featured.constraints.owned?.minDist ?? 5, LEAD_DIST_FEAT = 12;
const OWNED_CAP = featured.constraints.owned?.cap ?? 12, OWNED_PATH_DIST = featured.constraints.owned?.pathMinDist ?? null;
const EXP_SUPPORT_CAP = 8, EXP_LEAD_DIST = 6;
const EXP_DISTS = [4, 3, 2]; // preferred spacing first; the test floor is 2 (neighbours never share)

const expById = new Map(expansion.journeys.map((j) => [j.id, j]));
const featById = new Map(featured.journeys.map((j) => [j.id, j]));
const W = []; // working journeys, setlist order
const fixedRoster = new Map(); // mastered pos -> Set
L.forEach((id, pos) => {
  if (PT.SCRIPTED_TAKES[id]) { fixedRoster.set(pos, new Set(PT.SCRIPTED_TAKES[id].map((e) => e.mode).filter(Boolean))); return; }
  const e = expById.get(id), f = featById.get(id);
  const builtin = J.getJourney(id);
  const row = packById.get(id);
  const phases = row ? row.phases : builtin?.phases;
  if (!phases) throw new Error(`no phases for ${id}`);
  const palette = row ? row.theme?.palette ?? row.phases[0]?.palette : builtin.theme?.palette ?? builtin.phases[0]?.palette;
  const realm = row ? row.realm_id : builtin.realmId;
  const bans = new Set([...(builtin?.blockedShaders ?? []), ...(row?.theme?.blockedShaders ?? []), ...(realm ? J.REALM_SHADER_BLOCKLIST[realm] ?? [] : []), ...(realm ? [...(J.PICKTIME_REALM_BLOCKLIST[realm] ?? [])] : []), ...(BAL.SHADER_JOURNEY_BANS[id] ?? [])]);
  const dur = (row?.recording_id && recDur.get(row.recording_id)) || f?.dur || 200;
  if (e) W.push({ id, pos, kind: "exp", name: e.title, rec: e, cast: clone(e.cast), lead: e.lead, phases, palette, bans, dur, row, builtin, expIdx: EXP.indexOf(id) });
  else if (f) W.push({ id, pos, kind: "feat", name: f.name, rec: f, cast: clone(f.cast), lead: f.lead ?? null, owned: !!f.owned, phases, palette, bans, dur, row, builtin });
  else throw new Error(`uncast loop journey ${id}`);
});
const byId = new Map(W.map((w) => [w.id, w]));
for (const w of W) {
  w.pf = paletteFamilies(w.palette);
  w.phaseIds = Object.keys(w.cast);
  w.sparseIdx = w.phaseIds.findIndex((pid) => w.phases.find((p) => p.id === pid)?.sparse);
  w.raIdx = RA.indexOf(w.id);
  w.before = clone(w.cast);
  w.beforeLead = w.lead;
}
const modesOf = (w) => new Set(Object.values(w.cast).flat().filter(Boolean));
const rosterAt = (id) => { const pos = L.indexOf(id); if (fixedRoster.has(pos)) return fixedRoster.get(pos); const w = byId.get(id); return w ? modesOf(w) : new Set(); };

// ── accounting ──
function counts() {
  const all = new Map(), recast = new Map(), expSup = new Map();
  for (const [, s] of fixedRoster) for (const m of s) all.set(m, (all.get(m) ?? 0) + 1);
  for (const w of W) for (const m of modesOf(w)) {
    all.set(m, (all.get(m) ?? 0) + 1);
    if (w.kind === "feat") recast.set(m, (recast.get(m) ?? 0) + 1);
    if (w.kind === "exp" && m !== w.lead) expSup.set(m, (expSup.get(m) ?? 0) + 1);
  }
  return { all, recast, expSup };
}
function amberStats() { let tot = 0, amb = 0; for (const w of W) for (const m of modesOf(w)) { tot++; if (BAL.isAmberShader(m)) amb++; } return { tot, amb, share: amb / tot }; }
let C = counts();
const recount = () => { C = counts(); };

// ── placement rules ──
function poolOf(w) { return (w.kind === "feat" ? FEAT_POOL : BASE_POOL).filter((m) => !w.bans.has(m)); }
function slotBudget(w, pi, si) {
  if (pi === w.sparseIdx && si < 2) return 12;
  if (pi === 0) return 20;
  return 40;
}
/** Journeys (ids) a placement of r in w would sit too close to. */
function spacingViolators(w, r, expDist) {
  const bad = [];
  if (w.kind === "feat") {
    for (let k = 0; k < NL; k++) {
      if (k === w.pos || SET_OF[k] !== SET_OF[w.pos]) continue;
      const v = byId.get(L[k]);
      const vm = fixedRoster.get(k) ?? (v ? modesOf(v) : new Set());
      if (!vm.has(r)) continue;
      const min = v?.kind === "exp" && v.lead === r ? LEAD_DIST_FEAT : (w.owned || v?.owned ? Math.min(FEAT_MIN_DIST, OWNED_DIST) : FEAT_MIN_DIST);
      if (cdist(w.pos, k, NL) < min) bad.push(L[k]);
    }
    const f = w.rec;
    if (f.pathLen) for (const o of featured.journeys) {
      if (o.path !== f.path || o.id === w.id || o.pathIdx == null) continue;
      const om = byId.get(o.id) ? modesOf(byId.get(o.id)) : new Set(o.shaders);
      if (!om.has(r)) continue;
      const need = (f.owned || o.owned) && OWNED_PATH_DIST != null ? Math.min(OWNED_PATH_DIST, Math.floor(f.pathLen / 2)) : Math.floor(f.pathLen / 2);
      if (cdist(f.pathIdx, o.pathIdx, f.pathLen) < need) bad.push(o.id);
    }
  } else {
    for (const v of W) {
      if (v.kind !== "exp" || v === w) continue;
      const d = Math.abs(v.expIdx - w.expIdx);
      if ((v.lead === r && d < EXP_LEAD_DIST) || (d < expDist && modesOf(v).has(r))) bad.push(v.id);
    }
  }
  if (w.raIdx >= 0) for (const n of [RA[(w.raIdx - 1 + RA.length) % RA.length], RA[(w.raIdx + 1) % RA.length]]) if (rosterAt(n).has(r)) bad.push(n);
  return [...new Set(bad)];
}
const spacingOk = (w, r, expDist) => spacingViolators(w, r, expDist).length === 0;
function capOk(w, r) {
  if ((C.all.get(r) ?? 0) + 1 > BAL.shaderLoopCap(r)) return false;
  if (w.kind === "feat" && (C.recast.get(r) ?? 0) + 1 > OWNED_CAP) return false;
  if (w.kind === "exp" && (C.expSup.get(r) ?? 0) + 1 > EXP_SUPPORT_CAP) return false;
  return true;
}
/** Candidates for replacing slot (pi, si) of w (currently `m`, or a new slot when m is null). */
function candidates(w, pi, si, m, { allowAmber = false, expDist = EXP_DISTS[0], want = null, noParticle = false } = {}) {
  const have = modesOf(w);
  const budget = slotBudget(w, pi, si);
  const isLeadSlot = m && m === w.lead;
  const out = [];
  for (const r of want ?? poolOf(w)) {
    if (r === m || have.has(r) || w.bans.has(r)) continue;
    if (!poolOf(w).includes(r)) continue;
    if (!allowAmber && BAL.isAmberShader(r)) continue;
    if (BAL.KIN_BORROW_AVOID.has(r) && !want) continue; // never ADD an over-seen shader
    if (BAL.SUN_SHADER_SET.has(r) && !want) continue; // sun shaders: light journeys only, placed as pins (SUN_SHADER_PINS)
    if (noParticle && PARTICLE_SET.has(r)) continue; // particle trim: never trade one particle shader for another
    if (eff(r) > budget) continue;
    if (!capOk(w, r) || !spacingOk(w, r, expDist)) continue;
    const v = V[r];
    const s = (v.category === "Cosmic" ? 2 : 0) + (COOL.has(v.hue) ? 1 : 0) + fit(r, w.pf) * 0.5
      - (C.all.get(r) ?? 0) * 0.3 - Math.abs(eff(r) - (m ? eff(m) : 15)) * 0.03 - (LOW.has(r) ? 1.5 : 0)
      + (isLeadSlot ? Math.min(eff(r), 30) / 15 : 0);
    out.push({ r, s });
  }
  return out.sort((a, b) => b.s - a.s || a.r.localeCompare(b.r));
}
const changes = []; // {journey, phase, from, to, why}
function setSlot(w, pi, si, r, why) {
  const pid = w.phaseIds[pi];
  const from = w.cast[pid][si] ?? null;
  if (si >= w.cast[pid].length) w.cast[pid].push(r); else w.cast[pid][si] = r;
  if (from && from === w.lead) w.lead = r;
  changes.push({ journey: w.name, id: w.id, phase: pid, from, to: r, why, sparse: pi === w.sparseIdx });
  recount();
}
function slotsOf(w, m) { const out = []; w.phaseIds.forEach((pid, pi) => w.cast[pid].forEach((x, si) => { if (x === m) out.push([pi, si]); })); return out; }
/** Replace every slot of `m` in `w`; returns true on success (all-or-nothing). */
function replaceShader(w, m, why, opts = {}) {
  if (w.kind === "exp" && m === w.lead) return false; // Expansion leads never move
  const slots = slotsOf(w, m);
  if (!slots.length) return false;
  for (const dist of w.kind === "exp" ? EXP_DISTS : [0]) {
    // a shader on two adjacent phases (lead) keeps one replacement on both
    const per = slots.map(([pi, si]) => new Set(candidates(w, pi, si, m, { ...opts, expDist: dist }).map((c) => c.r)));
    const ranked = candidates(w, slots[0][0], slots[0][1], m, { ...opts, expDist: dist }).filter((c) => per.every((s) => s.has(c.r)));
    if (!ranked.length) continue;
    for (const [pi, si] of slots) setSlot(w, pi, si, ranked[0].r, why);
    return true;
  }
  // cool first; an amber stand-in only when nothing cool fits (never while
  // retiring amber itself) — the amber-share step then gets its turn
  if (!opts.allowAmber && !opts.strictCool && !BAL.isAmberShader(m)) return false;
  if (!opts.allowAmber && !opts.strictCool) return replaceShader(w, m, why, { ...opts, allowAmber: true });
  return false;
}

const before = { counts: new Map(C.all), amber: amberStats(), dharmaIn: W.filter((w) => modesOf(w).has("dharma")).map((w) => w.name) };
const log = [];

// PINNED shaders (SHADER_JOURNEY_MUSTS — Karel's explicit picks) and the
// light-ray favourites are never removed by any later step.
const protectedSlots = new Set(); // `${id}:${mode}`
for (const [id, musts] of Object.entries(BAL.SHADER_JOURNEY_MUSTS)) for (const m of musts) protectedSlots.add(`${id}:${m}`);
/** Put `want` into w in place of its most expendable single-phase shader
 *  (banned first, then amber, then most-used; never the lead or a pinned
 *  one; slot brightness budget honoured). Journeys it would now sit too
 *  close to give theirs up; a clash with a FIXED roster (mastered take,
 *  another Expansion lead) blocks it unless `force` (Karel's pins). */
function placePinned(w, want, why, { force = false } = {}) {
  const viol = spacingViolators(w, want, EXP_DISTS.at(-1));
  const resolvable = (vid) => { const v = byId.get(vid); return v && !protectedSlots.has(`${vid}:${want}`) && !(v.kind === "exp" && v.lead === want); };
  if (!force && !viol.every(resolvable)) return false;
  const banned = (m) => w.bans.has(m) || !poolOf(w).includes(m);
  const sunSparse = (m) => +(BAL.SUN_SHADER_SET.has(want) && slotsOf(w, m)[0][0] === w.sparseIdx);
  const opts = [...modesOf(w)].filter((m) => m !== w.lead && !protectedSlots.has(`${w.id}:${m}`) && slotsOf(w, m).length === 1)
    // a sun shader lights a light-bearing phase rather than the dark sparse interlude
    .sort((a, b) => (banned(b) - banned(a)) || (BAL.isAmberShader(b) - BAL.isAmberShader(a)) || (sunSparse(a) - sunSparse(b)) || ((C.all.get(b) ?? 0) - (C.all.get(a) ?? 0)) || a.localeCompare(b));
  const m = opts.find((x) => { const [pi, si] = slotsOf(w, x)[0]; return eff(want) <= slotBudget(w, pi, si); });
  if (!m) { log.push(`${force ? "FAIL" : "WARN"} ${w.name}: no slot can hold ${want}`); return false; }
  const [pi, si] = slotsOf(w, m)[0];
  setSlot(w, pi, si, want, why);
  protectedSlots.add(`${w.id}:${want}`);
  for (const vid of viol) {
    if (!resolvable(vid)) { log.push(`WARN pinned ${want} in ${w.name} sits close to ${byId.get(vid)?.name ?? vid} (fixed roster / lead)`); continue; }
    if (!replaceShader(byId.get(vid), want, `make room: ${want} in ${w.name}`)) log.push(`FAIL ${want} in ${w.name} clashes with ${byId.get(vid).name}`);
  }
  return true;
}

// 0. Expansion leads that are now banned everywhere (dharma: Northern Plane 3)
//    get a NEW exclusive lead: in the pool, nobody's lead, palette-fit, bright
//    enough to carry the peak, cosmic/cool preferred, all placement rules.
const expLeads = () => new Set(W.filter((w) => w.kind === "exp").map((w) => w.lead));
const leadSwaps = [];
for (const w of W) {
  if (w.kind !== "exp" || !(J.GLOBAL_SHADER_BLOCKLIST.includes(w.lead) || BAL.SHADER_BANNED_EVERYWHERE.has(w.lead))) continue;
  const old = w.lead, slots = slotsOf(w, old), taken = expLeads();
  const per = slots.map(([pi, si]) => new Set(candidates(w, pi, si, null, { allowAmber: true }).map((c) => c.r)));
  const ranked = candidates(w, slots[0][0], slots[0][1], null, { allowAmber: true })
    .filter((c) => !LOW.has(c.r) && !taken.has(c.r) && per.every((s) => s.has(c.r)) && expansion.journeys.every((x) => x.lead !== c.r)
      && W.every((v) => v.kind !== "exp" || v === w || Math.abs(v.expIdx - w.expIdx) >= EXP_LEAD_DIST || !modesOf(v).has(c.r)))
    .map((c) => ({ ...c, s: c.s + fit(c.r, w.pf) + Math.min(eff(c.r), 30) / 10 - (BAL.isAmberShader(c.r) ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || a.r.localeCompare(b.r));
  if (!ranked.length) { log.push(`FAIL ${w.name}: no new lead for banned ${old}`); continue; }
  w.lead = ranked[0].r; // lead first so spacing/caps count it as the lead
  for (const [pi, si] of slots) setSlot(w, pi, si, ranked[0].r, `${old} is banned everywhere — new lead`);
  leadSwaps.push({ name: w.name, from: old, to: w.lead });
}

// 1. Karel's pins (seraph in First Light + every Surrounded by Light, Aureole
//    in First Light, the SUN shaders per SUN_SHADER_PINS), then the journey
//    bans (Grasshopper / Bath).
for (const [id, musts] of Object.entries(BAL.SHADER_JOURNEY_MUSTS)) {
  const w = byId.get(id);
  if (!w) continue; // parked takes: pack-only (the apply step ensures it)
  for (const want of musts) if (!modesOf(w).has(want)) placePinned(w, want, `Karel: ${want} pinned in ${w.name}`, { force: true });
}
for (const [id, bans] of Object.entries(BAL.SHADER_JOURNEY_BANS)) {
  const w = byId.get(id);
  for (const b of bans) if (modesOf(w).has(b) && !replaceShader(w, b, `Karel: no ${b} in ${w.name}`, { allowAmber: false })) log.push(`FAIL could not remove ${b} from ${w.name}`);
}

// 2. Grasshopper: one voice per SECONDS_PER_VOICE in its long phases (Karel: "too long").
{
  const w = byId.get(BAL.GRASSHOPPER_ID);
  w.phaseIds.forEach((pid, pi) => {
    const p = w.phases.find((x) => x.id === pid);
    const secs = (p.end - p.start) * w.dur;
    if (secs < 45 || pi === w.sparseIdx) return;
    const need = Math.ceil(secs / BAL.SECONDS_PER_VOICE);
    while (w.cast[pid].length < need) {
      const c = candidates(w, pi, w.cast[pid].length, null)[0] ?? candidates(w, pi, w.cast[pid].length, null, { allowAmber: true })[0];
      if (!c) { log.push(`FAIL Grasshopper/${pid}: no candidate for voice ${w.cast[pid].length + 1}`); break; }
      setSlot(w, pi, w.cast[pid].length, c.r, `Grasshopper: ${Math.round(secs)} s phase -> ${need} voices`);
    }
  });
  w.longPhaseVoices = true;
}

// 3. Light journeys: a light-ray shader (zenith first, then seraph).
// most-constrained first: a journey whose options are blocked by FIXED
// rosters (mastered takes) picks before its light-themed neighbours.
const lightOptions = (id) => { const w = byId.get(id); return BAL.LIGHT_FAVOURED.filter((f) => !w.bans.has(f) && poolOf(w).includes(f) && spacingViolators(w, f, EXP_DISTS.at(-1)).every((v) => byId.has(v))).length; };
for (const id of [...BAL.LIGHT_JOURNEY_IDS].sort((a, b) => lightOptions(a) - lightOptions(b) || byId.get(a).pos - byId.get(b).pos)) {
  const w = byId.get(id);
  const has = BAL.LIGHT_FAVOURED.filter((f) => modesOf(w).has(f));
  for (const f of has) protectedSlots.add(`${id}:${f}`);
  if (has.length) continue;
  // trade the journey's most expendable shader for zenith (else seraph);
  // nearby journeys that would now sit too close give theirs up (Karel
  // favours them HERE most). Step 4 restores the loop cap elsewhere.
  const done = BAL.LIGHT_FAVOURED.some((fav) => !w.bans.has(fav) && poolOf(w).includes(fav) && placePinned(w, fav, `light journey: ${fav}`));
  if (!done) log.push(`FAIL light journey ${w.name}: no zenith/seraph placement`);
}

// 4. caps (named first, then the general loop cap): trim from the journeys
//    where the shader matters least (not protected, not a lead, worst palette fit).
const isLight = (w) => BAL.LIGHT_JOURNEY_IDS.includes(w.id);
function trimToCap(m) {
  const cap = BAL.shaderLoopCap(m);
  const named = m in BAL.SHADER_NAMED_CAPS;
  const holders = W.filter((w) => modesOf(w).has(m) && !protectedSlots.has(`${w.id}:${m}`) && !(w.kind === "exp" && w.lead === m))
    // light-themed journeys shed an over-seen shader first (light rays there, not the wheel)
    .sort((a, b) => (named && isLight(b)) - (named && isLight(a)) || (a.lead === m) - (b.lead === m) || fit(m, a.pf) - fit(m, b.pf) || a.pos - b.pos);
  for (const w of holders) {
    if ((C.all.get(m) ?? 0) <= cap) return;
    if (!replaceShader(w, m, `cap ${m} <= ${cap}`)) log.push(`skip ${m} in ${w.name}: no replacement`);
  }
  if ((C.all.get(m) ?? 0) > cap) log.push(`FAIL ${m} still ${C.all.get(m)} > ${cap}`);
}
for (const m of Object.keys(BAL.SHADER_NAMED_CAPS)) trimToCap(m);
// banned-everywhere leftovers (e.g. biofilm, globally blocked 2026-10-06) get replaced too
// A globally blocked shader MUST go (the engine refuses it, so its slot is
// dead air the engine fills by borrowing): cool first, then any hue — a
// cool-hued blocked shader alone in its phase (The Knife (Jam) integration,
// r3-monsoonveil 2026-10-13) otherwise had no candidate at all.
for (const w of W) for (const m of [...modesOf(w)]) if (J.GLOBAL_SHADER_BLOCKLIST.includes(m) && !(w.kind === "exp" && w.lead === m)) if (!replaceShader(w, m, `${m} is globally blocked`) && !replaceShader(w, m, `${m} is globally blocked`, { allowAmber: true })) log.push(`FAIL blocked ${m} in ${w.name}`);
for (let guard = 0; guard < 200; guard++) {
  const over = [...C.all].filter(([m, n]) => n > BAL.shaderLoopCap(m)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!over.length) break;
  const before = changes.length;
  for (const [m] of over) trimToCap(m);
  if (changes.length === before) break;
}

// 4b. Rise Above neighbours (Karel's self-running loop, reordered often):
//     two adjacent pieces never share a shader. Repair from the side that
//     can give it up (not pinned, not an Expansion lead, not a mastered take).
// --no-ra-repair: report the shared pairs, change nothing (a targeted pass
// — e.g. the 2026-10-13 sun promotion — must not churn unrelated journeys).
const RA_REPAIR = !process.argv.includes("--no-ra-repair");
for (let i = 0; i < RA.length; i++) {
  const a = byId.get(RA[i]), b = byId.get(RA[(i + 1) % RA.length]);
  const ra = rosterAt(RA[i]), rb = rosterAt(RA[(i + 1) % RA.length]);
  for (const m of [...ra].filter((x) => rb.has(x))) {
    const free = (w) => w && !protectedSlots.has(`${w.id}:${m}`) && !(w.kind === "exp" && w.lead === m);
    const sides = [b, a].filter(free).sort((x, y) => (x.lead === m) - (y.lead === m));
    if (!RA_REPAIR) { log.push(`WARN Rise Above ${a?.name ?? RA[i]} / ${b?.name ?? RA[(i + 1) % RA.length]} share ${m} (--no-ra-repair)`); continue; }
    if (!sides.some((w) => replaceShader(w, m, "Rise Above neighbours"))) log.push(`WARN Rise Above ${a?.name ?? RA[i]} / ${b?.name ?? RA[(i + 1) % RA.length]} still share ${m}`);
  }
}

// 5. amber share: retire amber appearances, most-used amber shader first,
//    from the journeys where it fits the palette least, until under the max.
for (let guard = 0; guard < 600 && amberStats().share > BAL.AMBER_SHARE_MAX; guard++) {
  const occ = [];
  for (const w of W) for (const m of modesOf(w)) {
    if (!BAL.isAmberShader(m) || protectedSlots.has(`${w.id}:${m}`) || (w.kind === "exp" && w.lead === m)) continue;
    occ.push({ w, m, key: (C.all.get(m) ?? 0) * 10 - fit(m, w.pf) * 3 - (w.lead === m ? 20 : 0) + [...modesOf(w)].filter(BAL.isAmberShader).length });
  }
  occ.sort((a, b) => b.key - a.key || a.w.pos - b.w.pos || a.m.localeCompare(b.m));
  let did = false;
  for (const o of occ) if (replaceShader(o.w, o.m, "amber share", { strictCool: true })) { did = true; break; }
  if (!did) { log.push(`FAIL amber share stuck at ${amberStats().share.toFixed(3)}`); break; }
}

// 5b. Globally blocked shaders OUTSIDE the loop: off-loop featured / album
//     casts (The Crossing: r3-monsoonveil, 2026-10-13) take one replacement
//     on every phase the blocked shader held (legacy casts keep each shader
//     on one contiguous run); parked Expansion casts (pack only) drop it.
const BLOCKED = new Set(J.GLOBAL_SHADER_BLOCKLIST);
const offLoop = []; // {f, from, to}
for (const f of featured.journeys) {
  if (byId.has(f.id)) continue;
  const used = new Set(Object.values(f.cast).flat());
  for (const m of [...used].filter((x) => BLOCKED.has(x))) {
    const b = J.getJourney(f.id);
    const realm = b?.realmId;
    const bans = new Set([...(b?.blockedShaders ?? []), ...(realm ? J.REALM_SHADER_BLOCKLIST[realm] ?? [] : []), ...(realm ? [...(J.PICKTIME_REALM_BLOCKLIST[realm] ?? [])] : []), ...(BAL.SHADER_JOURNEY_BANS[f.id] ?? [])]);
    const pf = paletteFamilies(b?.theme?.palette ?? b?.phases?.[0]?.palette);
    const firstPhase = Object.keys(f.cast)[0];
    const budget = Object.entries(f.cast).some(([pid, l]) => pid === firstPhase && l.includes(m)) ? 20 : 40;
    const rank = (allowAmber) => FEAT_POOL.filter((r) => !used.has(r) && !bans.has(r) && !BLOCKED.has(r) && !BAL.SUN_SHADER_SET.has(r) && !BAL.KIN_BORROW_AVOID.has(r) && (allowAmber || !BAL.isAmberShader(r)) && eff(r) <= budget)
      .map((r) => ({ r, s: (V[r].category === "Cosmic" ? 2 : 0) + (COOL.has(V[r].hue) ? 1 : 0) + fit(r, pf) * 0.5 - (C.all.get(r) ?? 0) * 0.3 - Math.abs(eff(r) - eff(m)) * 0.03 - (LOW.has(r) ? 1.5 : 0) }))
      .sort((a, c) => c.s - a.s || a.r.localeCompare(c.r));
    const r = (rank(false)[0] ?? rank(true)[0])?.r;
    if (!r) { log.push(`FAIL blocked ${m} in off-loop ${f.name}: no replacement`); continue; }
    for (const pid of Object.keys(f.cast)) f.cast[pid] = f.cast[pid].map((x) => (x === m ? r : x));
    used.delete(m); used.add(r);
    offLoop.push({ f, from: m, to: r });
    changes.push({ journey: f.name, id: f.id, phase: "(off-loop, every phase)", from: m, to: r, why: `${m} is globally blocked` });
  }
}
const parkedDrops = []; // {e, from}
for (const e of expansion.parked ?? []) {
  if (!e.cast) continue;
  for (const m of [...new Set(Object.values(e.cast).flat())].filter((x) => BLOCKED.has(x))) {
    if (e.lead === m) { log.push(`FAIL parked ${e.title}: lead ${m} is globally blocked`); continue; }
    for (const pid of Object.keys(e.cast)) e.cast[pid] = e.cast[pid].filter((x) => x !== m);
    if (e.supports) e.supports = e.supports.filter((x) => x !== m);
    parkedDrops.push({ e, from: m });
    changes.push({ journey: e.title, id: e.id, phase: "(parked)", from: m, to: "(dropped)", why: `${m} is globally blocked` });
  }
}

// 6. H-lens repair: a substitution must not make the engine hold one shader
//    for too long (H4) or otherwise regress the replay. For every journey
//    this run changed that now regresses, try the other ranked candidates
//    for each newly placed shader (cool first, then amber) and keep the
//    first that replays clean — else the least-bad one.
const hRegress = (w, fa) => hFails(w, simulate(journeyFor(w, w.cast), w.dur), w.lead).filter((x) => !fa.some((y) => y.split(" ")[0] === x.split(" ")[0]));
const hScore = (w) => { const H = simulate(journeyFor(w, w.cast), w.dur); return H.maxRun + Math.max(0, H.top[0]?.share ?? 0) * 0.1; };
function altsFor(w, x) {
  const slots = slotsOf(w, x), seen = new Set(), out = [];
  for (const allowAmber of [false, true]) for (const dist of w.kind === "exp" ? EXP_DISTS : [0]) {
    const per = slots.map(([pi, si]) => new Set(candidates(w, pi, si, x, { allowAmber, expDist: dist }).map((c) => c.r)));
    for (const c of candidates(w, slots[0][0], slots[0][1], x, { allowAmber, expDist: dist })) if (per.every((s) => s.has(c.r)) && !seen.has(c.r)) { seen.add(c.r); out.push(c.r); }
  }
  return out;
}
function swapAll(w, x, r) { for (const [pi, si] of slotsOf(w, x)) w.cast[w.phaseIds[pi]][si] = r; if (w.lead === x) w.lead = r; recount(); }
const H_TRIES = 16;
for (const w of W) {
  if (JSON.stringify(w.cast) === JSON.stringify(w.before)) continue;
  const fa = hFails(w, simulate(journeyFor(w, w.before), w.dur), w.beforeLead);
  if (!hRegress(w, fa).length) continue;
  const beforeModes = new Set(Object.values(w.before).flat().filter(Boolean));
  const placed = [...modesOf(w)].filter((m) => !beforeModes.has(m) && !protectedSlots.has(`${w.id}:${m}`) && !(w.kind === "exp" && w.lead === m));
  let fixed = false;
  for (const x of placed) {
    let best = { r: x, score: hScore(w) }, cur = x;
    for (const r of altsFor(w, x).slice(0, H_TRIES)) {
      swapAll(w, cur, r); cur = r;
      if (!hRegress(w, fa).length) { best = { r, score: -1 }; break; }
      const sc = hScore(w); if (sc < best.score) best = { r, score: sc };
    }
    if (cur !== best.r) swapAll(w, cur, best.r);
    if (best.r !== x) for (const c of changes) if (c.id === w.id && c.to === x) { c.to = best.r; c.why += ` (H-lens: ${x} held too long)`; }
    if (best.score === -1) { fixed = true; break; }
  }
  // still long: the held shader's phase lacks a partner — MOVE the new voice
  // there (a single-phase support; its old phase keeps >= 1 shader), trying
  // each candidate in the new slot.
  if (!fixed) for (const x of [...modesOf(w)].filter((m) => !beforeModes.has(m) && !protectedSlots.has(`${w.id}:${m}`) && !(w.kind === "exp" && w.lead === m))) {
    const sl = slotsOf(w, x);
    if (sl.length !== 1 || w.cast[w.phaseIds[sl[0][0]]].length < 2) continue;
    const H = simulate(journeyFor(w, w.cast), w.dur);
    const held = H.top.slice(0, 4).sort((a, b) => b.run - a.run)[0]?.m;
    const targets = w.phaseIds.map((pid, pi) => pi).filter((pi) => pi !== sl[0][0] && pi !== w.sparseIdx && w.cast[w.phaseIds[pi]].includes(held));
    const snapshot = clone(w.cast), from = w.phaseIds[sl[0][0]];
    let best = { cast: snapshot, score: hScore(w) };
    for (const pi of targets) {
      for (const r of [x, ...altsFor(w, x)].slice(0, H_TRIES)) {
        w.cast = clone(snapshot);
        w.cast[from] = w.cast[from].filter((m) => m !== x);
        if (r !== x && modesOf(w).has(r)) continue;
        if (eff(r) > slotBudget(w, pi, w.cast[w.phaseIds[pi]].length)) continue;
        w.cast[w.phaseIds[pi]].push(r); recount();
        if (!hRegress(w, fa).length) { best = { cast: clone(w.cast), score: -1, r, to: w.phaseIds[pi] }; break; }
        const sc = hScore(w); if (sc < best.score) best = { cast: clone(w.cast), score: sc, r, to: w.phaseIds[pi] };
      }
      if (best.score === -1) break;
    }
    w.cast = best.cast; recount();
    if (best.to) for (const c of changes) if (c.id === w.id && c.to === x) { c.to = best.r; c.phase = `${c.phase}->${best.to}`; c.why += ` (H-lens: moved beside ${held})`; }
    if (best.score === -1) { fixed = true; break; }
  }
  if (!fixed) log.push(`WARN H-lens repair: ${w.name} still ${hRegress(w, fa).join(", ")}`);
}

// 7. PARTICLE PASS (Karel 2026-10-13: "ensure particle shaders appear in them
//    all and ensure they are present 33% of the time for a journey"; laws in
//    src/lib/journeys/particle-shaders.ts). The engine's particle voice keeps
//    each journey near PARTICLE_TARGET of its live shader-layer time. This pass
//    (a) casts each non-mastered journey's PARTICLE VOICES from its analysis:
//    gentle motes for quiet journeys, lively sparkle for energetic ones,
//    palette-fit, least-used first, amber only for warm palettes, the family
//    union cap per shader, no family shader shared by setlist / Rise Above
//    neighbours where avoidable; (b) trims casts so particle-heavy that the
//    share overshoots even with the voice idle (a particle slot becomes a cool
//    non-particle shader under every placement rule, else is dropped from a
//    phase that keeps another voice; pinned takes never; H lens must not
//    regress); (c) tops up a journey still under the band. Written to
//    src/lib/journeys/particle-voices.generated.ts.
const FAMILY = PSH.PARTICLE_SHADERS;
const isP = (m) => PARTICLE_SET.has(m);
const PINNED = new Set(Object.keys(PT.PINNED_TAKES));
const particleLog = [];
/** Real-engine particle share of one journey (all layers), per seed. */
function particleSim(w, cast, seeds = [20261005, 1, 2, ...(PT.PINNED_TAKES[w.id] != null ? [[PT.PINNED_TAKES[w.id]].flat()[0]] : [])]) {
  const journey = journeyFor(w, cast);
  const shares = seeds.map((seed) => {
    const eng = ENG.getJourneyEngine(); CLOCK = 1000; eng.start(journey, { seed, trackDuration: w.dur });
    let p = 0, t = 0;
    for (let s = 0; s <= w.dur; s += 0.5) {
      CLOCK = 1000 + s * 1000; const f = eng.getFrame(s / w.dur); if (!f) continue;
      for (const m of new Set([f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode].filter(Boolean))) { t++; if (isP(m)) p++; }
    }
    eng.stop();
    return t ? p / t : 0;
  });
  return { mean: shares.reduce((a, b) => a + b, 0) / shares.length, min: Math.min(...shares), max: Math.max(...shares) };
}

const energyOf = (id) => { const c = PARTICLE_PROFILES[id]?.curve ?? []; return c.length ? c.reduce((a, [, v]) => a + v, 0) / c.length : 0.5; };
const voiceIds = L.filter((id) => !MAST.isMasteredJourneyLike(J.getJourney(id) ?? { id }));
const energies = voiceIds.map(energyOf).sort((a, b) => a - b);
const Q1 = energies[Math.floor(energies.length / 3)], Q2 = energies[Math.floor((2 * energies.length) / 3)];
const characterOf = (id) => { const e = energyOf(id); return e < Q1 ? "quiet" : e < Q2 ? "middle" : "energetic"; };
const VOICES = CUR_VOICES; // id -> generated voices (journeyFor exposes them to the engine)
const unionOf = (id) => new Set([...rosterAt(id)].filter(isP).concat(VOICES[id] ?? []));
const famUses = () => { const n = new Map(); for (const id of L) for (const m of unionOf(id)) n.set(m, (n.get(m) ?? 0) + 1); return n; };
const neighboursOf = (id) => { const out = new Set(); const i = L.indexOf(id); out.add(L[(i + 1) % NL]); out.add(L[(i - 1 + NL) % NL]); const r = RA.indexOf(id); if (r >= 0) { out.add(RA[(r + 1) % RA.length]); out.add(RA[(r - 1 + RA.length) % RA.length]); } out.delete(id); return [...out]; };
const WARM = new Set(["gold", "ember"]);
function voiceInfo(id) {
  const w = byId.get(id);
  if (w) return { w, bans: w.bans, pf: w.pf, dur: w.dur, name: w.name };
  const b = J.getJourney(id); // scripted take (Realized)
  const realm = b?.realmId;
  const bans = new Set([...(b?.blockedShaders ?? []), ...(realm ? J.REALM_SHADER_BLOCKLIST[realm] ?? [] : []), ...(realm ? [...(J.PICKTIME_REALM_BLOCKLIST[realm] ?? [])] : []), ...(BAL.SHADER_JOURNEY_BANS[id] ?? [])]);
  return { w: null, bans, pf: paletteFamilies(b?.theme?.palette ?? b?.phases?.[0]?.palette), dur: PARTICLE_PROFILES[id]?.duration ?? 200, name: b?.name ?? id };
}
function rankVoices(id, n, relax = 0) {
  const { bans, pf } = voiceInfo(id);
  const ch = characterOf(id);
  const have = unionOf(id);
  const uses = famUses();
  const near = neighboursOf(id).map(unionOf);
  const warm = [...pf.core].some((h) => WARM.has(h));
  const amberHave = [...have].filter(BAL.isAmberShader).length;
  const out = [];
  for (const m of FAMILY) {
    if (have.has(m) || bans.has(m) || J.GLOBAL_SHADER_BLOCKLIST.includes(m) || J.KAREL_BANNED_SHADERS.has(m) || !BASE_POOL.includes(m)) continue;
    if ((uses.get(m) ?? 0) + 1 > PSH.PARTICLE_LOOP_CAP) continue;
    if (BAL.isAmberShader(m) && (!warm || amberHave >= 1) && relax < 2) continue;
    const clash = near.filter((s) => s.has(m)).length;
    if (clash && relax < 1) continue;
    const gentle = PSH.GENTLE_PARTICLE_SET.has(m);
    const charFit = ch === "quiet" ? (gentle ? 2 : -1) : ch === "energetic" ? (gentle ? 0 : 2) : 1;
    out.push({ m, s: charFit * 1.5 + fit(m, pf) * 0.6 - (uses.get(m) ?? 0) * 0.25 - clash * 3 });
  }
  return out.sort((a, b) => b.s - a.s || a.m.localeCompare(b.m)).slice(0, n).map((x) => x.m);
}
/** Voices a journey wants: at least 3 particle shaders in all (4 on long
 *  tracks) so no one of them carries the third alone (H2). */
const voicesWanted = (id) => (voiceInfo(id).dur >= 260 ? 4 : 3);
/** A pinned / scripted take's voices ride its free tertiary and never repeat
 *  its own roster, so it needs a full set of its own. */
const isTake = (id) => PINNED.has(id) || !!PT.SCRIPTED_TAKES[id];
// …and so does a phase-owned cast: its own particle shaders may not leave their phases
const ownVoicesOnly = (id) => isTake(id) || byId.get(id)?.kind === "exp" || !!byId.get(id)?.owned;
const voiceCount = (id) => (ownVoicesOnly(id) ? (VOICES[id] ?? []).length : unionOf(id).size);
function fillVoices(id) {
  VOICES[id] ??= [];
  for (let relax = 0; relax < 3 && voiceCount(id) < voicesWanted(id); relax++) VOICES[id].push(...rankVoices(id, voicesWanted(id) - voiceCount(id), relax));
}
for (const k of Object.keys(VOICES)) delete VOICES[k];
// (a) most-constrained first: fewest particle members already, then setlist order
for (const id of [...voiceIds].sort((a, b) => unionOf(a).size - unionOf(b).size || L.indexOf(a) - L.indexOf(b))) fillVoices(id);

// (b) trim particle-heavy casts
const P_HI = PSH.PARTICLE_JOURNEY_MAX - 0.03; // the mean over seeds, with margin under the test band's top
function dropSlot(w, m, why) {
  // the particle leaves a phase that keeps another voice (single-phase member only)
  const sl = slotsOf(w, m);
  if (sl.length !== 1 || w.cast[w.phaseIds[sl[0][0]]].length < 2) return false;
  // the cast-size floors the cast tests hold (featured-recast / expansion-recast)
  const floor = w.kind === "exp" ? (w.rec.mvStandard ? 10 : 6) : w.owned ? 10 : 7;
  if (modesOf(w).size - 1 < floor) return false;
  const pid = w.phaseIds[sl[0][0]];
  w.cast[pid] = w.cast[pid].filter((x) => x !== m);
  changes.push({ journey: w.name, id: w.id, phase: pid, from: m, to: "(dropped)", why, sparse: sl[0][0] === w.sparseIdx });
  recount();
  return true;
}
for (const w of W) {
  if (PINNED.has(w.id)) continue;
  let sim = particleSim(w, w.cast);
  if (sim.mean <= P_HI) continue;
  const fa = hFails(w, simulate(journeyFor(w, w.before), w.dur), w.beforeLead);
  for (let guard = 0; guard < 6 && sim.mean > P_HI; guard++) {
    const opts = castParticles(w).filter((m) => !protectedSlots.has(`${w.id}:${m}`) && !(w.kind === "exp" && w.lead === m))
      .sort((a, b) => (C.all.get(b) ?? 0) - (C.all.get(a) ?? 0) || a.localeCompare(b));
    let done = false;
    const why = [];
    for (const how of ["swap", "drop"]) {
      for (const m of opts) {
        const snap = clone(w.cast), lead = w.lead, nChanges = changes.length;
        const label = `particle share ${(sim.max * 100).toFixed(0)} % > ${(P_HI * 100).toFixed(0)} %`;
        const ok = how === "swap" ? replaceShader(w, m, label, { strictCool: true, noParticle: true }) : dropSlot(w, m, label);
        if (!ok) { why.push(`${m}:no ${how}`); continue; }
        const reg = hRegress(w, fa);
        const after = particleSim(w, w.cast);
        const amberOver = amberStats().share > BAL.AMBER_SHARE_MAX;
        if (reg.length || amberOver || after.max >= sim.max) { why.push(`${m}:${how} ${reg.join("/") || (amberOver ? "amber share" : "no gain")}`); w.cast = snap; w.lead = lead; changes.length = nChanges; recount(); continue; }
        done = true; break;
      }
      if (done) break;
    }
    if (!done) { particleLog.push(`WARN particle trim: ${w.name} stuck at ${(sim.max * 100).toFixed(0)} % (${why.join(", ")})`); break; }
    sim = particleSim(w, w.cast);
  }
}

// (c) top-ups: union back to the wanted size (a trim may have freed one), then
//     one more voice while any seed sits under the band
for (const id of voiceIds) fillVoices(id);
for (const id of voiceIds) {
  const w = byId.get(id);
  if (!w) continue; // scripted take: measured by scripts/measure-particle-shader-share.mjs
  for (let guard = 0; guard < 2; guard++) {
    const sim = particleSim(w, w.cast);
    if (sim.mean >= PSH.PARTICLE_JOURNEY_MIN + 0.015) break;
    const more = rankVoices(id, 1, 1);
    if (!more.length) { particleLog.push(`WARN particle voice: ${w.name} at ${(sim.min * 100).toFixed(0)} % and no voice left`); break; }
    VOICES[id].push(...more);
  }
}
// (d) a trim that regresses the H lens once the final voices play is undone
for (const w of W) {
  if (!changes.some((c) => c.id === w.id && c.why.startsWith("particle share"))) continue;
  const fa = hFails(w, simulate(journeyFor(w, w.before), w.dur), w.beforeLead);
  const reg = hRegress(w, fa);
  if (!reg.length) continue;
  const mine = changes.filter((c) => c.id === w.id && c.why.startsWith("particle share"));
  if (changes.some((c) => c.id === w.id && !c.why.startsWith("particle share"))) { particleLog.push(`WARN particle trim in ${w.name} regresses ${reg.join("/")} (mixed with other changes — kept)`); continue; }
  w.cast = clone(w.before); w.lead = w.beforeLead; recount();
  for (const c of mine) changes.splice(changes.indexOf(c), 1);
  particleLog.push(`particle trim in ${w.name} undone (${reg.join("/")} with its voices)`);
}
// a voice never doubles a shader the (final) cast plays
for (const id of voiceIds) { const r = rosterAt(id); if ((VOICES[id] ?? []).some((m) => r.has(m))) { VOICES[id] = VOICES[id].filter((m) => !r.has(m)); fillVoices(id); } }
for (const w of W) {
  const sim = particleSim(w, w.cast);
  if (sim.min < PSH.PARTICLE_JOURNEY_MIN || sim.max > PSH.PARTICLE_JOURNEY_MAX) particleLog.push(`WARN particle share ${w.name}: ${(sim.min * 100).toFixed(1)}-${(sim.max * 100).toFixed(1)} %`);
}
{
  const uses = famUses();
  const nm = voiceIds.map((id) => unionOf(id).size);
  particleLog.push(`particle pass: ${changes.filter((c) => c.why.startsWith("particle share")).length} trims · voices for ${Object.values(VOICES).filter((v) => v.length).length}/${voiceIds.length} journeys · family per-journey ${Math.min(...nm)}-${Math.max(...nm)} · per-shader loop uses ${[...uses].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(", ")}`);
}

// ── verify with the real engine (H lens), before vs after ──
function journeyFor(w, cast) {
  const phases = w.phases.map((p) => ({ ...p, shaderModes: cast[p.id] ?? p.shaderModes, shaderOwned: w.kind === "exp" || w.owned ? true : p.shaderOwned }));
  const base = w.builtin && !w.row ? w.builtin : { ...(w.row.theme ?? {}), realmId: w.row.realm_id, strictCamera: true };
  PVG.PARTICLE_VOICES["cast-check"] = CUR_VOICES[w.id] ?? [];
  return { ...base, id: "cast-check", name: "cast-check", phases };
}
// One replay is chaotic (the seeded pick stream shifts with any roster
// change: the same cast scored H4 0.23 on one seed and 0.34 on another), so
// the H lens judges the MEAN over five seeded replays.
function simulate(journey, dur) {
  const runs = [20261005, 1, 2, 3, 4].map((seed) => simulateOnce(journey, dur, seed));
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const shares = new Map(), longest = new Map();
  for (const r of runs) for (const t of r.top) { shares.set(t.m, (shares.get(t.m) ?? 0) + t.share / runs.length); longest.set(t.m, (longest.get(t.m) ?? 0) + t.run / runs.length); }
  const top = [...shares].map(([m, share]) => ({ m, share, run: longest.get(m) })).sort((a, b) => b.share - a.share);
  return { distinct: Math.round(mean((r) => r.distinct)), top, layers: mean((r) => r.layers), maxRun: mean((r) => r.maxRun), nonLeadMax: (lead) => mean((r) => r.top.filter((t) => t.m !== lead)[0]?.share ?? 0) };
}
function simulateOnce(journey, dur, seed) {
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
  return { distinct: top.length, top, layers: layers / Math.max(1, n), maxRun: Math.max(...top.slice(0, 4).map((t) => t.run)) };
}
function hFails(w, H, lead) {
  const f = [];
  if (H.distinct < STD.H1_distinct) f.push(`H1 ${H.distinct}`);
  const nonLead = H.top.filter((t) => w.kind !== "exp" || t.m !== lead);
  const nl = H.nonLeadMax ? H.nonLeadMax(w.kind === "exp" ? lead : null) : nonLead[0]?.share ?? 0;
  if (nl > STD.H2_maxShare) f.push(`H2 ${nonLead[0].m} ${nl.toFixed(2)}`);
  if (w.kind === "exp" && (H.top.find((t) => t.m === lead)?.share ?? 0) > STD.H3_leadShare) f.push("H3");
  if (H.maxRun > STD.H4_maxRun) f.push(`H4 ${H.maxRun.toFixed(2)}`);
  if (H.layers > STD.H5k_layers) f.push(`H5k ${H.layers.toFixed(2)}`);
  return f;
}
const changed = W.filter((w) => JSON.stringify(w.cast) !== JSON.stringify(w.before));
const hReport = [];
for (const w of changed) {
  const a = simulate(journeyFor(w, w.before), w.dur), b = simulate(journeyFor(w, w.cast), w.dur);
  const fa = hFails(w, a, w.beforeLead), fb = hFails(w, b, w.lead);
  const amberSec = (H) => H.top.filter((t) => BAL.isAmberShader(t.m)).reduce((s, t) => s + t.share, 0);
  if (process.argv.includes("--changes") && fb.length) console.log(`  H ${w.name}: before ${fa.join(",") || "ok"} [${a.top.map((t) => `${t.m} ${t.share.toFixed(2)}/${t.run.toFixed(2)}`).join(" ")}] after ${fb.join(",")} [${b.top.map((t) => `${t.m} ${t.share.toFixed(2)}/${t.run.toFixed(2)}`).join(" ")}]`);
  hReport.push({ name: w.name, kind: w.kind, before: { distinct: a.distinct, fails: fa, amberScreen: amberSec(a) }, after: { distinct: b.distinct, fails: fb, amberScreen: amberSec(b) }, regress: fb.filter((x) => !fa.some((y) => y.split(" ")[0] === x.split(" ")[0])) });
}
const regress = hReport.filter((r) => r.regress.length);

// ── summary ──
const after = { counts: C.all, amber: amberStats(), dharmaIn: W.filter((w) => modesOf(w).has("dharma")).map((w) => w.name) };
const top = (cnt) => [...cnt].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(log.join("\n"));
console.log(particleLog.join("\n"));
if (process.argv.includes("--changes")) for (const c of changes) console.log(`  ${c.journey.padEnd(26)} ${(c.phase + (c.sparse ? "*" : "")).padEnd(14)} ${String(c.from ?? "+").padEnd(16)} -> ${c.to.padEnd(16)} ${c.why}`);
console.log(`changed journeys ${changed.length} (featured ${changed.filter((w) => w.kind === "feat").length}, Expansion ${changed.filter((w) => w.kind === "exp").length}) · slot changes ${changes.length}`);
console.log(`amber share ${before.amber.share.toFixed(3)} -> ${after.amber.share.toFixed(3)} · max uses ${top(before.counts)[0].join(":")} -> ${top(after.counts)[0].join(":")}`);
for (const m of ["dharma", "magma", "parsec", "ember", "zenith", "seraph", "aureole"]) console.log(`  ${m.padEnd(8)} ${before.counts.get(m) ?? 0} -> ${after.counts.get(m) ?? 0}`);
console.log(`dharma in: ${after.dharmaIn.join(", ")}`);
console.log(`H lens: ${hReport.length} replayed · regressions ${regress.length}${regress.length ? ": " + regress.map((r) => `${r.name} ${r.regress.join("/")}`).join("; ") : ""}`);
if (regress.length && !process.argv.includes("--allow-h-regress")) { console.error("refusing to write: H-lens regressions"); process.exit(1); }
if (log.some((x) => x.startsWith("FAIL"))) { console.error("refusing to write: FAIL above"); process.exit(1); }

if (!DRY && (changed.length || offLoop.length || parkedDrops.length)) {
  // featured / album casts -> featured-recast.json + the generated TS
  let ts = readFileSync(TS_PATH, "utf8");
  for (const { f } of offLoop) {
    f.shaders = [...new Set(Object.values(f.cast).flat())];
    const re = new RegExp(`^  "${f.id}": \\{ name: "([^"]*)", cast: \\{.*?\\} \\},$`, "m");
    if (!re.test(ts)) throw new Error(`cast line not found for off-loop ${f.name}`);
    ts = ts.replace(re, (_, name) => `  "${f.id}": { name: "${name}", cast: ${JSON.stringify(f.cast)} },`);
  }
  for (const w of changed.filter((x) => x.kind === "feat")) {
    const f = w.rec;
    f.cast = w.cast; f.shaders = [...modesOf(w)];
    if (f.owned) f.lead = w.lead;
    if (w.longPhaseVoices) f.longPhaseVoices = true;
    const re = new RegExp(`^  "${w.id}": \\{ name: "([^"]*)", cast: \\{.*?\\} \\},$`, "m");
    if (!re.test(ts)) throw new Error(`cast line not found for ${w.name}`);
    ts = ts.replace(re, (_, name) => `  "${w.id}": { name: "${name}", cast: ${JSON.stringify(w.cast)} },`);
  }
  // report field: recast loop uses
  const uses = {};
  for (const j of featured.journeys) if (j.setlistPos != null) for (const m of j.shaders) uses[m] = (uses[m] ?? 0) + 1;
  featured.uses = Object.fromEntries(Object.entries(uses).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  featured.constraints.balance = { by: "scripts/rebalance-shader-casts.mjs", laws: "src/lib/journeys/shader-balance.ts", loopCap: BAL.SHADER_LOOP_CAP, namedCaps: BAL.SHADER_NAMED_CAPS, amberShareMax: BAL.AMBER_SHARE_MAX, applied: "2026-10-13" };
  writeFileSync(FEAT_PATH, JSON.stringify(featured, null, 1));
  writeFileSync(TS_PATH, ts);
  // Expansion casts -> expansion-recast.json
  for (const w of changed.filter((x) => x.kind === "exp")) {
    const e = w.rec;
    e.cast = w.cast;
    e.supports = [...modesOf(w)].filter((m) => m !== w.lead);
    if (e.lead !== w.lead) { e.lead = w.lead; e.leadHue = V[w.lead].hue; e.leadFit = fit(w.lead, w.pf); }
    e.shaderBalance = "2026-10-13";
  }
  const sup = {};
  for (const x of expansion.journeys) for (const m of new Set(Object.values(x.cast).flat().filter((m) => m && m !== x.lead))) sup[m] = (sup[m] ?? 0) + 1;
  expansion.supportUses = Object.fromEntries(Object.entries(sup).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  writeFileSync(EXP_PATH, JSON.stringify(expansion, null, 1));
  // a new Expansion lead (dharma banned) -> EXPANSION_LEADS (lead gain lookup)
  if (leadSwaps.length) {
    let g = readFileSync(GAIN_PATH, "utf8");
    for (const s of leadSwaps) {
      const re = new RegExp(`^  ${JSON.stringify(s.name.toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: "[^"]*",( //.*)?$`, "m");
      if (!re.test(g)) throw new Error(`EXPANSION_LEADS line not found for ${s.name}`);
      g = g.replace(re, (_, note) => `  ${JSON.stringify(s.name.toLowerCase())}: ${JSON.stringify(s.to)},${note ?? ""}`);
    }
    writeFileSync(GAIN_PATH, g);
  }
  console.log(`wrote featured-recast.json, journey-casts.generated.ts, expansion-recast.json${leadSwaps.length ? ", shader-gain.generated.ts (EXPANSION_LEADS)" : ""}`);
}
// particle voices -> particle-voices.generated.ts
if (!DRY) {
  const names = new Map();
  for (const id of voiceIds) { const n = voiceInfo(id).name.trim().toLowerCase(); names.set(n, names.has(n) ? null : id); }
  const ids = voiceIds.filter((id) => VOICES[id]?.length);
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(VOICES[id])}, // ${voiceInfo(id).name} (${characterOf(id)})`).join("\n");
  const byName = [...names].filter(([, id]) => id && VOICES[id]?.length).map(([n, id]) => `  ${JSON.stringify(n)}: ${JSON.stringify(VOICES[id])},`).join("\n");
  writeFileSync(ROOT + "src/lib/journeys/particle-voices.generated.ts", `// GENERATED by scripts/rebalance-shader-casts.mjs (7. PARTICLE PASS) — do not edit by hand.
// Each non-mastered loop journey's PARTICLE VOICES (src/lib/journeys/particle-shaders.ts):
// the particle shaders the engine lays on the companion layer to keep ~33 % of the
// journey's shader time on particle shaders (Karel 2026-10-13). The cast's own particle
// members join them at runtime. Character (quiet / middle / energetic) from the analysis.
export const PARTICLE_VOICES: Readonly<Record<string, readonly string[]>> = {
${body}
};

/** The same lists by journey name (unique names only) — DB / path rows that wrap a built-in. */
export const PARTICLE_VOICES_BY_NAME: Readonly<Record<string, readonly string[]>> = {
${byName}
};
`);
  console.log(`wrote particle-voices.generated.ts (${ids.length} journeys)`);
  // the pack's phase skeletons for the loop's pack rows (the pack is gitignored):
  // lets particle-shaders.test.ts replay every loop journey in the real engine
  const sk = W.filter((w) => w.row).map((w) => `  ${JSON.stringify(w.id)}: ${JSON.stringify({ name: w.name, dur: Math.round(w.dur * 10) / 10, realmId: w.row.realm_id ?? null, blockedShaders: w.row.theme?.blockedShaders ?? [], owned: w.kind === "exp" || !!w.owned, phases: w.phases.map((p) => ({ id: p.id, start: p.start, end: p.end, intensityMultiplier: p.intensityMultiplier ?? 1, ...(p.sparse ? { sparse: true } : {}), ...(p.shaderOwned ? { shaderOwned: true } : {}) })) })},`).join("\n");
  writeFileSync(ROOT + "src/lib/journeys/loop-phase-skeletons.generated.ts", `// GENERATED by scripts/rebalance-shader-casts.mjs from the Tramokyo pack — do not edit by hand.
// Phase skeletons (bounds, intensity, sparse, owned) + track durations of the kiosk
// loop's pack rows, so tests can replay them in the real engine without the gitignored pack.
export interface LoopPhaseSkeleton { name: string; dur: number; realmId: string | null; blockedShaders: string[]; owned: boolean; phases: { id: string; start: number; end: number; intensityMultiplier: number; sparse?: boolean; shaderOwned?: boolean }[] }
export const LOOP_PHASE_SKELETONS: Readonly<Record<string, LoopPhaseSkeleton>> = {
${sk}
};
`);
}

// globally banned shaders leave the generated vetted pool (uncast journeys regenerate from it)
if (!DRY) {
  let ts = readFileSync(TS_PATH, "utf8");
  ts = ts.replace(/^export const VETTED_SHADER_POOL: ReadonlySet<string> = new Set\((\[.*\])\);$/m, (_, arr) => `export const VETTED_SHADER_POOL: ReadonlySet<string> = new Set(${JSON.stringify(JSON.parse(arr).filter((m) => !J.GLOBAL_SHADER_BLOCKLIST.includes(m)))});`);
  writeFileSync(TS_PATH, ts);
  featured.pool = featured.pool.filter((m) => !J.GLOBAL_SHADER_BLOCKLIST.includes(m));
  writeFileSync(FEAT_PATH, JSON.stringify(featured, null, 1));
}

// ── pack apply input: every Expansion journey whose pack phases differ from
//    its final cast, plus the parked Surrounded by Light takes (pins, pack
//    only). `before` = the pack before tonight's hand edit (backup), when it
//    exists; `handEdited` = the pack as it is now. The apply script writes a
//    phase only when it still holds one of those (or already the final cast).
if (!DRY) {
  const BACKUP = arg("backup", `${process.env.HOME}/Documents/Resonance/pack-journeys.backup-2026-10-13-dharma.json`);
  const backup = existsSync(BACKUP) ? new Map(JSON.parse(readFileSync(BACKUP, "utf8")).map((r) => [r.id, r])) : new Map();
  const phaseMap = (row) => (row ? Object.fromEntries(row.phases.map((p) => [p.id, p.shaderModes ?? null])) : null);
  const apply = {};
  for (const w of W.filter((x) => x.kind === "exp")) {
    const now = phaseMap(packById.get(w.id));
    if (now && JSON.stringify(Object.keys(w.cast).map((k) => now[k])) === JSON.stringify(Object.values(w.cast))) continue;
    apply[w.id] = { name: w.name, before: phaseMap(backup.get(w.id)) ?? w.before, handEdited: now, after: w.cast };
  }
  const ensure = {};
  for (const [id, musts] of Object.entries(BAL.SHADER_JOURNEY_MUSTS)) {
    if (byId.has(id)) continue;
    const row = packById.get(id);
    if (!row) { log.push(`WARN pinned journey ${id} not in the pack`); continue; }
    ensure[id] = { name: row.name, musts, bans: [...BAL.SHADER_BANNED_EVERYWHERE, ...(BAL.SHADER_JOURNEY_BANS[id] ?? [])], before: phaseMap(backup.get(id)), handEdited: phaseMap(row) };
  }
  // purge: every other pack row (never a mastered one — Snowflake / Ghost are
  // frozen) whose phases still name a globally blocked shader. Featured /
  // album rows play their bundled cast at runtime, but the pack should not
  // carry dead names: each blocked shader becomes the replacement this run
  // chose for that journey, else it is dropped from the phase.
  const purge = {};
  // rows that play a scripted take (Snowflake / Ghost / Realized, matched by
  // id or by the built-in's name) never read their pack shaders — left as is
  const takeNames = new Set(Object.keys(PT.SCRIPTED_TAKES).map((id) => (J.getJourney(id)?.name ?? id).trim().toLowerCase()));
  const playsTake = (row) => !!PT.SCRIPTED_TAKES[row.id] || takeNames.has((row.name ?? "").trim().toLowerCase());
  for (const row of pack) {
    if (apply[row.id] || MAST.isMasteredJourneyLike(row) || playsTake(row)) continue;
    const held = new Set(row.phases.flatMap((p) => p.shaderModes ?? []).filter((m) => BLOCKED.has(m)));
    if (!held.size) continue;
    const map = {};
    for (const m of held) {
      const w = byId.get(row.id);
      const fromCast = w ? [...modesOf(w)].filter((x) => !new Set(Object.values(w.before).flat()).has(x)) : [];
      const ch = changes.filter((c) => c.id === row.id && c.from === m).at(-1);
      map[m] = (ch && ch.to !== "(dropped)" ? ch.to : null) ?? (fromCast.length === 1 ? fromCast[0] : null);
    }
    purge[row.id] = { name: row.name, map, handEdited: phaseMap(row) };
  }
  for (const row of pack) if (MAST.isMasteredJourneyLike(row) && row.phases.some((p) => (p.shaderModes ?? []).some((m) => BLOCKED.has(m)))) console.log(`WARN mastered pack row ${row.name} names a globally blocked shader — left frozen (the engine refuses it at pick time)`);
  // --apply-out: a later targeted pass (2026-10-13b: the sun promotion) keeps
  // the earlier apply input as a record and writes its own
  const APPLY_OUT = arg("apply-out", "scripts/shader-recast-2026-10-13.expansion-casts.json");
  writeFileSync(ROOT + APPLY_OUT, JSON.stringify({ by: "scripts/rebalance-shader-casts.mjs", note: `Expansion casts live in the pack (data/journeys.json phases[].shaderModes) + DB rows; apply with scripts/apply-shader-recast-2026-10-13.mjs --input=${APPLY_OUT}`, journeys: apply, ensure, purge }, null, 1) + "\n");
  console.log(`apply input: ${Object.keys(apply).length} Expansion journeys + ${Object.keys(ensure).length} parked pins + ${Object.keys(purge).length} blocked-shader purges → ${APPLY_OUT}`);
}

if (REPORT) {
  const fmtCast = (c) => Object.entries(c).map(([p, l]) => `${p}: ${l.join(", ")}`).join(" · ");
  const fl = byId.get(BAL.FIRST_LIGHT_ID), gh = byId.get(BAL.GRASSHOPPER_ID);
  const tb = top(before.counts).slice(0, 20), ta = top(after.counts).slice(0, 20);
  const rows = tb.map((x, i) => `| ${i + 1} | ${x[0]} (${V[x[0]]?.hue ?? "?"}) | ${x[1]} | ${ta[i][0]} (${V[ta[i][0]]?.hue ?? "?"}) | ${ta[i][1]} |`).join("\n");
  const watch = ["dharma", "magma", "parsec", "ember", "zenith", "seraph", "aureole"].map((m) => `| ${m} | ${before.counts.get(m) ?? 0} | ${after.counts.get(m) ?? 0} |`).join("\n");
  const byWhy = {}; for (const c of changes) { const k = c.why.replace(/ <= \d+$/, "").replace(/^cap .*/, "loop caps"); byWhy[k] = (byWhy[k] ?? 0) + 1; }
  const md = `# Shader recast — 2026-10-13

Loop-wide recast for diversity, from Karel's notes of 2026-10-12/13 (magma / parsec "a lot", "i cant stand dharma in resonance", seraph ALWAYS in First Light + every Surrounded by Light, "no ember 3d plane moving shader in bath", zenith/seraph "dope", "never mind seeing cosmos and infinite space", Grasshopper's moving plane "on repeat"). Built on main f731e4a1.
Laws: \`src/lib/journeys/shader-balance.ts\` · generator: \`scripts/rebalance-shader-casts.mjs\` · guard: \`src/lib/journeys/shader-balance.test.ts\`.

Counts are **loop journeys a shader appears in** (kiosk setlist, ${NL} journeys; mastered Snowflake / Realized / Ghost takes count but never change). Amber = SHADER_HUES gold + ember, plus parsec (its GLSL reads violet; on screen it is "that amber 3d moving plane").

## Headline

| | before | after |
|---|---|---|
| amber share of cast appearances (non-mastered) | ${(before.amber.share * 100).toFixed(1)} % (${before.amber.amb}/${before.amber.tot}) | ${(after.amber.share * 100).toFixed(1)} % (${after.amber.amb}/${after.amber.tot}) |
| most-used shader | ${top(before.counts)[0][0]} ×${top(before.counts)[0][1]} | ${top(after.counts)[0][0]} ×${top(after.counts)[0][1]} |
| journeys whose cast changed | — | ${changed.length} (${changed.filter((w) => w.kind === "feat").length} featured/album, ${changed.filter((w) => w.kind === "exp").length} Expansion) |
| slot substitutions | — | ${changes.length} |
| dharma in | ${before.dharmaIn.length}: ${before.dharmaIn.join(", ")} | ${after.dharmaIn.length}: ${after.dharmaIn.join(", ")} |

| shader | before | after |
|---|---|---|
${watch}

## Per-shader journey counts — top 20

| # | before | n | after | n |
|---|---|---|---|---|
${rows}

## First Light

- before: ${fmtCast(fl.before)}
- after: ${fmtCast(fl.cast)}

## Bath (no ember, no parsec)

- before: ${fmtCast(byId.get(BAL.BATH_ID).before)}
- after: ${fmtCast(byId.get(BAL.BATH_ID).cast)}
- The engine also refuses journey-banned shaders at pick time (\`isShaderAllowed\` → \`isShaderBannedFor\`), so the finale-forced switch (\`forceShaderSwitch\`, which logged "ember (finale-forced)" at p0.887) can no longer land on ember in Bath.

## Seraph pins (First Light + every Surrounded by Light)

${Object.keys(BAL.SHADER_JOURNEY_MUSTS).map((id) => { const w = byId.get(id); return w ? `- ${w.name}: ${BAL.SHADER_JOURNEY_MUSTS[id].join(" + ")} in ${Object.entries(w.cast).filter(([, l]) => BAL.SHADER_JOURNEY_MUSTS[id].some((m) => l.includes(m))).map(([p]) => p).join(", ")}` : `- ${packById.get(id)?.name ?? id} (parked, pack only): ensured by the apply step`; }).join("\n")}

## Expansion lead swaps

${leadSwaps.length ? leadSwaps.map((s) => `- ${s.name}: ${s.from} → ${s.to} (EXPANSION_LEADS updated)`).join("\n") : "none"}

## Grasshopper

- before: ${fmtCast(gh.before)}
- after: ${fmtCast(gh.cast)}

## Why slots changed

${Object.entries(byWhy).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`).join("\n")}

## H lens (real JourneyEngine replay, every changed journey)

${hReport.length} journeys replayed before/after · regressions: ${regress.length ? regress.map((r) => `${r.name} (${r.regress.join(", ")})`).join("; ") : "none"}.
Amber screen-time (sum of per-shader on-screen share) across changed journeys: ${hReport.reduce((s, r) => s + r.before.amberScreen, 0).toFixed(1)} → ${hReport.reduce((s, r) => s + r.after.amberScreen, 0).toFixed(1)}.
${hReport.filter((r) => r.after.fails.length).map((r) => `- ${r.name}: before [${r.before.fails.join(", ") || "ok"}] → after [${r.after.fails.join(", ") || "ok"}]`).join("\n")}

## Notes

- **Per-shader cap.** The brief asked for ≈5 journeys per shader. The loop holds ${W.length} cast journeys × ~12 shaders (${after.amber.tot} appearances) over a ${BASE_POOL.length}-shader vetted pool — an average of ${(after.amber.tot / BASE_POOL.length).toFixed(1)} journeys per shader, so a uniform cap of 5 would need a ~2.5× larger vetted pool (new shaders must go through the GPU vetting rig, scripts/vet-shaders.mjs). What ships: magma / parsec / ember capped at 5, dharma at 0 (globally blocked), every other shader at ${BAL.SHADER_LOOP_CAP} (was up to 16), and the amber share under ${BAL.AMBER_SHARE_MAX * 100} % — which needs the cool shaders to carry ~${BAL.SHADER_LOOP_CAP} each (62 cool shaders × 14 < the ~870 cool appearances a 25 % amber share requires).
- **Engine borrowing.** \`journey-engine.ts\` kinBorrow (unseen kindred shaders once a roster is spent) drew uniformly from every vetted shader in the roster's hue families — with 23 gold + 8 ember shaders in the pool it pulled amber whenever a roster held one amber member. It now never borrows dharma / magma / parsec / ember and takes cool kin first unless the roster itself is mostly amber. Scripted (mastered) takes are exempt, so Snowflake / Ghost / Realized play exactly as mastered.
- **Future casts.** \`scripts/mv-rollout/cast-shaders.mjs\`, \`cast-owned-featured.mjs\` and \`recast-featured.mjs\` read the same laws (caps, journey bans, amber penalty / cosmic lean); re-run this rebalancer after any recast.
- **Runtime path.** Featured / album casts ship in the bundle (\`journey-casts.generated.ts\`) — a deploy is enough. Expansion casts are read from the Tramokyo pack (\`data/journeys.json\` phases[].shaderModes) and the DB rows, so they need \`node scripts/apply-shader-recast-2026-10-13.mjs --pack\` on the kiosk Mac (and \`--db\` with \`.env.local\` for the web). \`shader-balance.test.ts\` fails on a pack that has not been applied.

## Changed journeys

${changed.map((w) => `- ${w.name} (${w.kind === "exp" ? "Expansion" : "featured/album"}): ${changes.filter((c) => c.id === w.id).map((c) => `${c.phase} ${c.from ?? "+"}→${c.to}`).join(", ")}`).join("\n")}
`;
  writeFileSync(ROOT + "docs/shader-recast-2026-10-13.md", md);
  console.log("wrote docs/shader-recast-2026-10-13.md");
}
