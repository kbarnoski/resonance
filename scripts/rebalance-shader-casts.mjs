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
// Usage: node scripts/rebalance-shader-casts.mjs [--dry-run] [--report] [--pack=<dir>]
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
const { VETTED_SHADER_POOL } = await jiti.import(ROOT + "src/lib/journeys/journey-casts.generated.ts");
const { STD } = await import("./lib/snowflake-standard.mjs");

const FEAT_PATH = ROOT + "scripts/featured-recast.json";
const EXP_PATH = ROOT + "scripts/expansion-recast.json";
const TS_PATH = ROOT + "src/lib/journeys/journey-casts.generated.ts";
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
function candidates(w, pi, si, m, { allowAmber = false, expDist = EXP_DISTS[0], want = null } = {}) {
  const have = modesOf(w);
  const budget = slotBudget(w, pi, si);
  const isLeadSlot = m && m === w.lead;
  const out = [];
  for (const r of want ?? poolOf(w)) {
    if (r === m || have.has(r) || w.bans.has(r)) continue;
    if (!poolOf(w).includes(r)) continue;
    if (!allowAmber && BAL.isAmberShader(r)) continue;
    if (BAL.KIN_BORROW_AVOID.has(r) && !want) continue; // never ADD an over-seen shader
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
  changes.push({ journey: w.name, id: w.id, phase: pid, from, to: r, why });
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

// 1. First Light: dharma -> aureole (Karel), Grasshopper: parsec out.
for (const [id, musts] of Object.entries(BAL.SHADER_JOURNEY_MUSTS)) {
  const w = byId.get(id);
  for (const want of musts) {
    if (modesOf(w).has(want)) continue;
    const ban = (BAL.SHADER_JOURNEY_BANS[id] ?? []).find((b) => modesOf(w).has(b));
    const [pi, si] = ban ? slotsOf(w, ban)[0] : [0, 0];
    // Karel's explicit pick: may exceed the general loop cap (trimmed elsewhere
    // below); journeys it now sits too close to give it up instead.
    const clash = spacingViolators(w, want, EXP_DISTS.at(-1));
    setSlot(w, pi, si, want, `Karel: ${want} in ${w.name}`);
    for (const vid of clash) {
      const v = byId.get(vid);
      if (!v || !replaceShader(v, want, `make room: ${want} in ${w.name}`)) log.push(`FAIL ${want} in ${w.name} clashes with ${v?.name ?? vid} (fixed)`);
    }
  }
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
      const c = candidates(w, pi, w.cast[pid].length, null)[0];
      if (!c) { log.push(`FAIL Grasshopper/${pid}: no candidate for voice ${w.cast[pid].length + 1}`); break; }
      setSlot(w, pi, w.cast[pid].length, c.r, `Grasshopper: ${Math.round(secs)} s phase -> ${need} voices`);
    }
  });
  w.longPhaseVoices = true;
}

// 3. Light journeys: a light-ray shader (zenith first, then seraph).
const protectedSlots = new Set(); // `${id}:${mode}` never removed below
for (const [id, musts] of Object.entries(BAL.SHADER_JOURNEY_MUSTS)) for (const m of musts) protectedSlots.add(`${id}:${m}`);
// most-constrained first: a journey whose options are blocked by FIXED
// rosters (mastered takes) picks before its light-themed neighbours.
const lightOptions = (id) => { const w = byId.get(id); return BAL.LIGHT_FAVOURED.filter((f) => !w.bans.has(f) && poolOf(w).includes(f) && spacingViolators(w, f, EXP_DISTS.at(-1)).every((v) => byId.has(v))).length; };
for (const id of [...BAL.LIGHT_JOURNEY_IDS].sort((a, b) => lightOptions(a) - lightOptions(b) || byId.get(a).pos - byId.get(b).pos)) {
  const w = byId.get(id);
  const has = BAL.LIGHT_FAVOURED.filter((f) => modesOf(w).has(f));
  for (const f of has) protectedSlots.add(`${id}:${f}`);
  if (has.length) continue;
  // trade the journey's most over-used non-lead amber (or else most-used)
  // single-phase shader for zenith (else seraph); nearby journeys that would
  // now sit too close give theirs up (Karel favours them HERE most). The
  // loop cap is restored in step 4 by trimming non-light journeys.
  const resolvable = (vid, fav) => { const v = byId.get(vid); return v && !protectedSlots.has(`${vid}:${fav}`) && !(v.kind === "exp" && v.lead === fav); };
  let done = false;
  for (const fav of BAL.LIGHT_FAVOURED) {
    if (w.bans.has(fav) || !poolOf(w).includes(fav)) continue;
    const viol = spacingViolators(w, fav, EXP_DISTS.at(-1));
    if (process.env.DEBUG) console.log("light", w.name, fav, viol.map((v) => byId.get(v)?.name ?? v), viol.map((v) => resolvable(v, fav)));
    if (!viol.every((vid) => resolvable(vid, fav))) continue;
    const opts = [...modesOf(w)].filter((m) => m !== w.lead && !protectedSlots.has(`${id}:${m}`) && slotsOf(w, m).length === 1)
      .sort((a, b) => (BAL.isAmberShader(b) - BAL.isAmberShader(a)) || (C.all.get(b) - C.all.get(a)) || a.localeCompare(b));
    const m = opts.find((x) => { const [pi, si] = slotsOf(w, x)[0]; return eff(fav) <= slotBudget(w, pi, si); });
    if (!m) continue;
    const [pi, si] = slotsOf(w, m)[0];
    setSlot(w, pi, si, fav, `light journey: ${fav}`);
    protectedSlots.add(`${id}:${fav}`);
    for (const vid of viol) if (!replaceShader(byId.get(vid), fav, `make room: ${fav} in ${w.name}`)) log.push(`FAIL ${fav} in ${w.name} clashes with ${byId.get(vid).name}`);
    done = true;
    break;
  }
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
for (const w of W) for (const m of [...modesOf(w)]) if (J.GLOBAL_SHADER_BLOCKLIST.includes(m) && !(w.kind === "exp" && w.lead === m)) if (!replaceShader(w, m, `${m} is globally blocked`)) log.push(`FAIL blocked ${m} in ${w.name}`);
for (let guard = 0; guard < 200; guard++) {
  const over = [...C.all].filter(([m, n]) => n > BAL.shaderLoopCap(m)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!over.length) break;
  const before = changes.length;
  for (const [m] of over) trimToCap(m);
  if (changes.length === before) break;
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

// ── verify with the real engine (H lens), before vs after ──
function journeyFor(w, cast) {
  const phases = w.phases.map((p) => ({ ...p, shaderModes: cast[p.id] ?? p.shaderModes, shaderOwned: w.kind === "exp" || w.owned ? true : p.shaderOwned }));
  const base = w.builtin && !w.row ? w.builtin : { ...(w.row.theme ?? {}), realmId: w.row.realm_id, strictCamera: true };
  return { ...base, id: "cast-check", name: "cast-check", phases };
}
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
  return { distinct: top.length, top, layers: layers / Math.max(1, n), maxRun: Math.max(...top.slice(0, 4).map((t) => t.run)) };
}
function hFails(w, H, lead) {
  const f = [];
  if (H.distinct < STD.H1_distinct) f.push(`H1 ${H.distinct}`);
  const nonLead = H.top.filter((t) => w.kind !== "exp" || t.m !== lead);
  if ((nonLead[0]?.share ?? 0) > STD.H2_maxShare) f.push(`H2 ${nonLead[0].m} ${nonLead[0].share.toFixed(2)}`);
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
  hReport.push({ name: w.name, kind: w.kind, before: { distinct: a.distinct, fails: fa, amberScreen: amberSec(a) }, after: { distinct: b.distinct, fails: fb, amberScreen: amberSec(b) }, regress: fb.filter((x) => !fa.some((y) => y.split(" ")[0] === x.split(" ")[0])) });
}
const regress = hReport.filter((r) => r.regress.length);

// ── summary ──
const after = { counts: C.all, amber: amberStats(), dharmaIn: W.filter((w) => modesOf(w).has("dharma")).map((w) => w.name) };
const top = (cnt) => [...cnt].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(log.join("\n"));
console.log(`changed journeys ${changed.length} (featured ${changed.filter((w) => w.kind === "feat").length}, Expansion ${changed.filter((w) => w.kind === "exp").length}) · slot changes ${changes.length}`);
console.log(`amber share ${before.amber.share.toFixed(3)} -> ${after.amber.share.toFixed(3)} · max uses ${top(before.counts)[0].join(":")} -> ${top(after.counts)[0].join(":")}`);
for (const m of ["dharma", "magma", "parsec", "ember", "zenith", "seraph", "aureole"]) console.log(`  ${m.padEnd(8)} ${before.counts.get(m) ?? 0} -> ${after.counts.get(m) ?? 0}`);
console.log(`dharma in: ${after.dharmaIn.join(", ")}`);
console.log(`H lens: ${hReport.length} replayed · regressions ${regress.length}${regress.length ? ": " + regress.map((r) => `${r.name} ${r.regress.join("/")}`).join("; ") : ""}`);
if (regress.length && !process.argv.includes("--allow-h-regress")) { console.error("refusing to write: H-lens regressions"); process.exit(1); }
if (log.some((x) => x.startsWith("FAIL"))) { console.error("refusing to write: FAIL above"); process.exit(1); }

if (!DRY && changed.length) {
  // featured / album casts -> featured-recast.json + the generated TS
  let ts = readFileSync(TS_PATH, "utf8");
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
  // Expansion casts -> expansion-recast.json + the pack/DB apply input
  const apply = {};
  for (const w of changed.filter((x) => x.kind === "exp")) {
    const e = w.rec;
    apply[w.id] = { name: w.name, before: w.before, after: w.cast };
    e.cast = w.cast;
    e.supports = [...modesOf(w)].filter((m) => m !== e.lead);
    e.shaderBalance = "2026-10-13";
  }
  const sup = {};
  for (const x of expansion.journeys) for (const m of new Set(Object.values(x.cast).flat().filter((m) => m && m !== x.lead))) sup[m] = (sup[m] ?? 0) + 1;
  expansion.supportUses = Object.fromEntries(Object.entries(sup).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  writeFileSync(EXP_PATH, JSON.stringify(expansion, null, 1));
  if (Object.keys(apply).length) writeFileSync(ROOT + "scripts/shader-recast-2026-10-13.expansion-casts.json", JSON.stringify({ generated: new Date().toISOString(), by: "scripts/rebalance-shader-casts.mjs", note: "Expansion casts live in the pack (data/journeys.json phases[].shaderModes) + DB rows; apply with scripts/apply-shader-recast-2026-10-13.mjs", journeys: apply }, null, 1) + "\n");
  console.log(`wrote featured-recast.json, journey-casts.generated.ts, expansion-recast.json${Object.keys(apply).length ? ", shader-recast-2026-10-13.expansion-casts.json" : ""}`);
}

if (REPORT) {
  const fmtCast = (c) => Object.entries(c).map(([p, l]) => `${p}: ${l.join(", ")}`).join(" · ");
  const fl = byId.get(BAL.FIRST_LIGHT_ID), gh = byId.get(BAL.GRASSHOPPER_ID);
  const tb = top(before.counts).slice(0, 20), ta = top(after.counts).slice(0, 20);
  const rows = tb.map((x, i) => `| ${i + 1} | ${x[0]} (${V[x[0]]?.hue ?? "?"}) | ${x[1]} | ${ta[i][0]} (${V[ta[i][0]]?.hue ?? "?"}) | ${ta[i][1]} |`).join("\n");
  const watch = ["dharma", "magma", "parsec", "ember", "zenith", "seraph", "aureole"].map((m) => `| ${m} | ${before.counts.get(m) ?? 0} | ${after.counts.get(m) ?? 0} |`).join("\n");
  const byWhy = {}; for (const c of changes) { const k = c.why.replace(/ <= \d+$/, "").replace(/^cap .*/, "loop caps"); byWhy[k] = (byWhy[k] ?? 0) + 1; }
  const md = `# Shader recast — 2026-10-13

Loop-wide recast for diversity, from Karel's 2026-10-12 notes (magma / parsec "a lot", dharma "once in a great while", zenith/seraph "dope", "never mind seeing cosmos and infinite space", Grasshopper's moving plane "on repeat").
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

- **Per-shader cap.** The brief asked for ≈5 journeys per shader. The loop holds ${W.length} cast journeys × ~12 shaders (${after.amber.tot} appearances) over a ${BASE_POOL.length}-shader vetted pool — an average of ${(after.amber.tot / BASE_POOL.length).toFixed(1)} journeys per shader, so a uniform cap of 5 would need a ~2.5× larger vetted pool (new shaders must go through the GPU vetting rig, scripts/vet-shaders.mjs). What ships: the named over-seen shaders capped at 5 (dharma 2), every other shader at ${BAL.SHADER_LOOP_CAP} (was up to 16), and the amber share under ${BAL.AMBER_SHARE_MAX * 100} % — which needs the cool shaders to carry ~${BAL.SHADER_LOOP_CAP} each (62 cool shaders × 14 < the ~870 cool appearances a 25 % amber share requires).
- **Engine borrowing.** \`journey-engine.ts\` kinBorrow (unseen kindred shaders once a roster is spent) drew uniformly from every vetted shader in the roster's hue families — with 23 gold + 8 ember shaders in the pool it pulled amber whenever a roster held one amber member. It now never borrows dharma / magma / parsec / ember and takes cool kin first unless the roster itself is mostly amber. Scripted (mastered) takes are exempt, so Snowflake / Ghost / Realized play exactly as mastered.
- **Future casts.** \`scripts/mv-rollout/cast-shaders.mjs\`, \`cast-owned-featured.mjs\` and \`recast-featured.mjs\` read the same laws (caps, journey bans, amber penalty / cosmic lean); re-run this rebalancer after any recast.
- **Runtime path.** Featured / album casts ship in the bundle (\`journey-casts.generated.ts\`) — a deploy is enough. Expansion casts are read from the Tramokyo pack (\`data/journeys.json\` phases[].shaderModes) and the DB rows, so they need \`node scripts/apply-shader-recast-2026-10-13.mjs --pack\` on the kiosk Mac (and \`--db\` with \`.env.local\` for the web). \`shader-balance.test.ts\` fails on a pack that has not been applied.

## Changed journeys

${changed.map((w) => `- ${w.name} (${w.kind === "exp" ? "Expansion" : "featured/album"}): ${changes.filter((c) => c.id === w.id).map((c) => `${c.phase} ${c.from ?? "+"}→${c.to}`).join(", ")}`).join("\n")}
`;
  writeFileSync(ROOT + "docs/shader-recast-2026-10-13.md", md);
  console.log("wrote docs/shader-recast-2026-10-13.md");
}
