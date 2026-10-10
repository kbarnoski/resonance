#!/usr/bin/env node
// cast-owned-featured.mjs — phase-owned shader cast for ONE featured/album
// journey being rolled out to the Journey Archetype through mv-rollout
// (first use: Welcome Home's title track, 2026-10-09). Album/featured casts
// live in scripts/featured-recast.json + src/lib/journeys/journey-casts.
// generated.ts (the engine plays JOURNEY_CASTS over the phase rows), so a
// rollout must write its cast there; recast-featured.mjs keeps owned casts.
//
// Every rule featured-recast.test.ts enforces, checked up front:
//  - vetted pool only, never blocked / pick-time-banned / Karel-rejected /
//    Kinetic Lab lead / Geometry / 3D, honouring realm + journey bans;
//  - owned layout: lead on the peak phase (+1 adjacent at most), every
//    support in ONE phase, no empty phase, 10–12 distinct;
//  - spacing within its loop set (>= owned minDist from any journey sharing
//    a shader, incl. Expansion casts), album-path spacing (>= floor(len/2)
//    cyclic), recast loop cap (owned cap), Rise Above hand-offs (its first
//    phase never holds what the borrowed predecessor ends on, and vice versa);
//  - plus <= 13 journeys per shader across the whole loop (Karel 2026-10-09);
// then VERIFIED with the real JourneyEngine replayed over the track (H1, H2,
// H4, H5k) and re-drawn until it passes. Sparse phase: dark shaders first.
//
// Rise Above (Karel's self-running loop since 2026-10-09) is a borrowing set,
// so its order is enforced here directly: no shader shared with EITHER Rise
// Above neighbour (scripted takes' rosters included), not just the hand-off.
// Built-in journeys (no pack row) read their phases from journeys.ts.
// Usage: node scripts/mv-rollout/cast-owned-featured.mjs <set> [--only=id] [--write] [--attempts=400]
//   (run one journey per process when casting neighbours: casts are read at start)
import { createJiti } from "jiti";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const setKey = process.argv[2];
const WRITE = process.argv.includes("--write");
const ONLY = arg("only")?.split(",");
const ATTEMPTS = Number(arg("attempts", 400));
let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const J = await jiti.import("../../src/lib/journeys/journeys.ts");
const ENG = await jiti.import("../../src/lib/journeys/journey-engine.ts");
const SEQ = await jiti.import("../../src/lib/journeys/installation-sequence.ts");
const SH = await jiti.import("../../src/lib/shaders/index.ts");
const { JOURNEY_CASTS, VETTED_SHADER_POOL } = await jiti.import("../../src/lib/journeys/journey-casts.generated.ts");
const { STD } = await import("../lib/snowflake-standard.mjs");
const { JOURNEYS: SETJ } = await import(`./shotlists/${setKey}.mjs`);
const { opacityArc } = await import("./shotlists/expansion-batch.mjs");

const FEAT_PATH = ROOT + "scripts/featured-recast.json";
const featured = JSON.parse(readFileSync(FEAT_PATH, "utf8"));
const expansion = JSON.parse(readFileSync(ROOT + "scripts/expansion-recast.json", "utf8"));
const vet = JSON.parse(readFileSync(ROOT + "scripts/shader-vetting.json", "utf8"));
const pack = JSON.parse(readFileSync(ROOT + "public/tramokyo-pack/data/journeys.json", "utf8"));
const recs = new Map(JSON.parse(readFileSync(ROOT + "public/tramokyo-pack/data/recordings.json", "utf8")).map((r) => [r.id, Number(r.duration) || 0]));
const V = vet.verdicts;
const eff = (m) => V[m].mean * (V[m].gain ?? 1);
const REJ = new Set(["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"]);
const KLAB = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const GEOMETRY = new Set(SH.MODE_META.filter((m) => m.category === "Geometry").map((m) => m.mode));
const OWNED_DIST = featured.constraints.owned?.minDist ?? 7;
const OWNED_CAP = featured.constraints.owned?.cap ?? 10;
const LOOP_CAP = 13;

const RING = ["ember", "gold", "green", "teal", "blue", "violet", "magenta"];
function hsv(hex) { const n = parseInt(hex.replace("#", ""), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, v: mx }; }
const fam = (h) => (h >= 345 || h < 25 ? "ember" : h < 70 ? "gold" : h < 160 ? "green" : h < 200 ? "teal" : h < 250 ? "blue" : h < 305 ? "violet" : "magenta");
function paletteFamilies(p) { const core = new Set(), near = new Set(); for (const k of ["primary", "accent", "glow"]) { if (!p?.[k]) continue; const c = hsv(p[k]); if (c.s < 0.2 || c.v < 0.15) continue; const i = RING.indexOf(fam(c.h)); if (k === "primary") core.add(RING[i]); near.add(RING[i]); near.add(RING[(i + 1) % 7]); near.add(RING[(i + 6) % 7]); } return { core, near }; }
const fit = (m, pf) => { const h = V[m]?.hue ?? "neutral"; return pf.core.has(h) ? 3 : pf.near.has(h) ? 2 : h === "prismatic" || h === "neutral" ? 1 : 0; };

// ── what every loop position plays (mirror of featured-recast.test loopUses) ──
const expById = new Map(expansion.journeys.map((j) => [j.id, j]));
const modesOf = (id) => {
  const e = expById.get(id);
  if (e) return new Set(Object.values(e.cast).flat().filter(Boolean));
  if (JOURNEY_CASTS[id]) return new Set(Object.values(JOURNEY_CASTS[id].cast).flat());
  return new Set();
};
const L = SEQ.TRAMOKYO_SETLIST;
const SET_OF = SEQ.TRAMOKYO_MAIN.sets.filter((s) => !s.borrows).flatMap((s, si) => s.journeyIds.map(() => si));
const RA = SEQ.TRAMOKYO_RISE_ABOVE;
const PT = await jiti.import("../../src/lib/journeys/pinned-takes.ts");
const rosterOf = (id) => PT.SCRIPTED_TAKES[id] ? new Set(PT.SCRIPTED_TAKES[id].map((e) => e.mode).filter(Boolean)) : modesOf(id);
const lastPhase = (id) => Object.values(expById.get(id)?.cast ?? JOURNEY_CASTS[id]?.cast ?? {}).at(-1) ?? [];
const firstPhase = (id) => Object.values(expById.get(id)?.cast ?? JOURNEY_CASTS[id]?.cast ?? {})[0] ?? [];

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

function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

for (const j of SETJ) {
  if (ONLY && !ONLY.includes(j.id)) continue;
  const builtinJ = J.getJourney(j.id);
  const row = pack.find((r) => r.id === j.id) ?? (builtinJ ? { id: j.id, name: builtinJ.name, realm_id: builtinJ.realmId, phases: builtinJ.phases, theme: { palette: builtinJ.phases[0]?.palette } } : null);
  const fj = featured.journeys.find((x) => x.id === j.id);
  if (!row || !fj) throw new Error(`${j.name}: not a featured/album recast journey`);
  const pos = L.indexOf(j.id);
  const builtin = J.getJourney(j.id);
  const bans = new Set([...(builtin?.blockedShaders ?? []), ...(row.realm_id ? J.REALM_SHADER_BLOCKLIST[row.realm_id] ?? [] : [])]);
  const POOL = [...VETTED_SHADER_POOL].filter((m) => vet.pool.includes(m) && !J.GLOBAL_SHADER_BLOCKLIST.includes(m) && !J.PICKTIME_SHADER_BLOCKLIST.has(m) && !REJ.has(m) && !KLAB.has(m) && !GEOMETRY.has(m) && !SH.MODES_3D.has(m) && !bans.has(m));
  // forbidden by spacing: same-set journeys closer than OWNED_DIST, album path closer than floor(len/2)
  const ban = new Set();
  L.forEach((id, k) => { if (k !== pos && SET_OF[k] === SET_OF[pos] && Math.abs(k - pos) < OWNED_DIST) for (const m of modesOf(id)) ban.add(m); });
  if (fj.pathLen) for (const o of featured.journeys) if (o.path === fj.path && o.id !== j.id && o.pathIdx != null) {
    const d = Math.abs(o.pathIdx - fj.pathIdx); const need = featured.constraints.owned?.pathMinDist != null ? Math.min(featured.constraints.owned.pathMinDist, Math.floor(fj.pathLen / 2)) : Math.floor(fj.pathLen / 2);
    if (Math.min(d, fj.pathLen - d) < need) for (const m of o.shaders) ban.add(m);
  }
  // caps
  const recastUses = {}, loopUses = {};
  L.forEach((id, k) => { if (id === j.id) return; for (const m of modesOf(id)) { loopUses[m] = (loopUses[m] ?? 0) + 1; if (JOURNEY_CASTS[id] && !expById.get(id)) recastUses[m] = (recastUses[m] ?? 0) + 1; } });
  // Rise Above hand-offs
  const ri = RA.indexOf(j.id);
  const banFirst = new Set(ri > 0 ? lastPhase(RA[ri - 1]) : []);
  const banLast = new Set(ri >= 0 && ri + 1 < RA.length ? firstPhase(RA[ri + 1]) : []);
  const raNeighbours = ri >= 0 ? [RA[(ri - 1 + RA.length) % RA.length], RA[(ri + 1) % RA.length]] : [];
  for (const id of raNeighbours) for (const m of rosterOf(id)) ban.add(m);
  const ok = (m) => !ban.has(m) && (recastUses[m] ?? 0) < OWNED_CAP && (loopUses[m] ?? 0) < LOOP_CAP && eff(m) <= 40;
  const avail = POOL.filter(ok);
  const pf = paletteFamilies(row.theme?.palette ?? row.phases[0]?.palette);
  console.log(`${j.name}: ${avail.length} eligible shaders (pool ${POOL.length}, spacing-banned ${ban.size}); RA bans first [${[...banFirst]}] last [${[...banLast]}]`);

  const ph = j.phases;
  const sparse = ph.findIndex((p) => p.sparse);
  const ints = ph.map((p, i) => (i === sparse ? -1 : p.intensity ?? 0.5));
  const peak = ints.indexOf(Math.max(...ints));
  const len = ph.map((p) => p.end - p.start);
  const arc = opacityArc(ph);
  const dur = (row.recording_id && recs.get(row.recording_id)) || fj.dur;
  let best = null;
  // --cast='{phase:[...]}' (+ --lead=m): evaluate/write a hand-made cast through the same checks
  const given = arg("cast") ? JSON.parse(process.argv.find((x) => x.startsWith("--cast=")).slice(7)) : null;
  for (let a = 0; a < (given ? 1 : ATTEMPTS) && !(best && !best.fails.length); a++) {
    const R = rng(1000 + a);
    const target = 12 - (a % 3 === 2 ? 1 : 0); // 12 (or 11) distinct incl. lead (test bound 10-12)
    // voices by screen time; sparse >= 2; lead adds the peak phase
    // a phase holding >= 20 % of the track needs >= 4 voices or one shader rides it whole (H4 > 25 %)
    // voices by screen time: one shader rarely holds > ~14 s, so a phase of
    // T seconds needs >= T/14 voices or one rides it whole (H4 > 25 %)
    const size = ph.map((_, i) => Math.max(i === sparse ? 2 : 1, Math.min(6, Math.ceil((len[i] * dur) / (8 + (a % 4) * 2)))));
    let left = target - 1 - size.reduce((x, y) => x + y, 0) + 1; // +1: lead occupies a slot in the peak phase
    while (left-- > 0) { let k = 0, g = -1e9; for (let i = 0; i < ph.length; i++) { const gap = len[i] * target - size[i]; if (gap > g) { g = gap; k = i; } } size[k]++; }
    // hard cap: featured-recast.test allows 10–12 distinct (lead counts once)
    while (size.reduce((x, y) => x + y, 0) > target) { let k = -1; for (let i = 0; i < ph.length; i++) { const min = i === sparse ? 2 : 1; if (size[i] > min && (k < 0 || len[i] < len[k])) k = i; } /* shortest phases give voices up first */ if (k < 0) break; size[k]--; }
    const lead = avail.map((m) => ({ m, s: fit(m, pf) * 2 + Math.min(eff(m), 30) / 10 + R() * 3 })).filter((x) => !banFirst.has(x.m) || peak !== 0).sort((x, y) => y.s - x.s)[0].m;
    const used = new Set([lead]);
    const cast = ph.map((_, i) => (i === peak ? [lead] : []));
    let failed = false;
    for (let i = 0; i < ph.length && !failed; i++) {
      while (cast[i].length < size[i]) {
        const dark = i === sparse && cast[i].length < 2;
        const c = avail.filter((m) => !used.has(m) && (!dark || eff(m) <= 12) && !(i === 0 && banFirst.has(m)) && !(i === ph.length - 1 && banLast.has(m)) && (i !== 0 || eff(m) <= 20))
          .map((m) => ({ m, s: fit(m, pf) * 2 - (recastUses[m] ?? 0) * 0.3 + (i === peak ? Math.min(eff(m), 30) / 15 : 0) + R() * 2.5 }));
        if (!c.length) { failed = true; break; }
        c.sort((x, y) => y.s - x.s); cast[i].push(c[0].m); used.add(c[0].m);
      }
    }
    if (failed && !given) { if (process.env.DEBUG) console.log("gen-fail", a, size.join(",")); continue; }
    // vary the walk order inside each phase (lead stays first, the sparse phase keeps its dark pair first)
    if (a % 2) cast.forEach((l, i) => { const head = i === sparse ? 2 : l[0] === lead ? 1 : 0; const tail = l.slice(head); for (let x = tail.length - 1; x > 0; x--) { const y = Math.floor(R() * (x + 1)); [tail[x], tail[y]] = [tail[y], tail[x]]; } cast[i] = [...l.slice(0, head), ...tail]; });
    if (given) {
      const all = [...new Set(Object.values(given).flat())];
      const bad = all.filter((m) => !avail.includes(m));
      if (bad.length) throw new Error(`--cast uses ineligible shaders: ${bad}`);
      ph.forEach((p, i) => { cast[i] = [...given[p.id]]; }); used.clear(); all.forEach((m) => used.add(m));
    }
    const castObj = Object.fromEntries(ph.map((p, i) => [p.id, cast[i]]));
    const phases = ph.map((p, i) => { const old = row.phases.find((o) => o.id === p.id) ?? {}; const o = { ...old, start: p.start, end: p.end, intensityMultiplier: p.intensity, shaderModes: cast[i], shaderOwned: true, shaderOpacity: arc[i] }; if (p.sparse) o.sparse = true; else delete o.sparse; return o; });
    // fake id/name: the engine must play THESE pools, not the stored JOURNEY_CASTS entry
    const H = simulate({ ...(builtinJ ?? {}), ...(row.theme ?? {}), id: "cast-check", name: "cast-check", realmId: row.realm_id, phases, strictCamera: true }, dur);
    const fails = [];
    if (H.distinct < STD.H1_distinct) fails.push(`H1 ${H.distinct}`);
    if ((H.top[0]?.share ?? 0) > STD.H3_leadShare || (H.top[1]?.share ?? 0) > STD.H2_maxShare) fails.push("H2");
    if (Math.max(...H.top.slice(0, 4).map((t) => t.run)) > STD.H4_maxRun) fails.push("H4");
    if (H.layers > STD.H5k_layers) fails.push("H5k");
    if (!best || fails.length < best.fails.length) best = { cast: castObj, lead: given ? arg("lead") ?? cast[peak][0] : lead, fails, H, all: [...used] };
  }
  if (!best) throw new Error("no feasible cast");
  console.log(`  ${best.all.length} shaders · lead ${best.lead} · on screen ${best.H.distinct} · top ${best.H.top[0].m} ${Math.round(best.H.top[0].share * 100)}% · layers ${best.H.layers.toFixed(2)} · runs ${best.H.top.slice(0, 4).map((t) => t.m + " " + Math.round(t.run * 100)).join("/")} · ${best.fails.length ? "FAILS " + best.fails.join(" ") : "H ok"}`);
  for (const [p, l] of Object.entries(best.cast)) console.log(`    ${p.padEnd(13)} ${l.join(", ")}`);
  if (!WRITE) continue;
  // --allow=H4: write anyway when the only failure is a known engine limit (reported)
  const allowed = (arg("allow") ?? "").split(",").filter(Boolean);
  if (best.fails.some((f) => !allowed.includes(f.split(" ")[0]))) throw new Error("refusing to write a cast that fails the H lens");
  fj.cast = best.cast; fj.shaders = best.all; fj.owned = true; fj.lead = best.lead;
  featured.constraints.owned.rollouts = [...new Set([...(featured.constraints.owned.rollouts ?? []), setKey])];
  writeFileSync(FEAT_PATH, JSON.stringify(featured, null, 1));
  const tsPath = ROOT + "src/lib/journeys/journey-casts.generated.ts";
  const ts = readFileSync(tsPath, "utf8");
  const re = new RegExp(`^  "${j.id}": \\{ name: "([^"]*)", cast: \\{.*?\\} \\},$`, "m");
  if (!re.test(ts)) throw new Error("cast line not found in journey-casts.generated.ts");
  writeFileSync(tsPath, ts.replace(re, (_, name) => `  "${j.id}": { name: "${name}", cast: ${JSON.stringify(best.cast)} },`));
  console.log(`  wrote featured-recast.json + journey-casts.generated.ts`);
}
