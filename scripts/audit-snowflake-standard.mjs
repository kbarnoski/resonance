#!/usr/bin/env node
// audit-snowflake-standard.mjs — score every non-mastered kiosk-loop
// journey against the Snowflake Standard (docs/snowflake-standard.md).
//
// Karel 2026-10-05: "im really expecting incredible journeys that are
// following the design and arc definition that snowflake has with micro
// and macro and a POV journey more like a music video than a slide show
// of photos. also a lot of the shaders stick around for the whole
// journey ... as if youre moving through them not watching wallpaper."
//
// Six lenses (L = literalness, Karel 2026-10-05: "visionary and surreal ... not literal"), each measured from the thing the kiosk actually plays:
//   S  SHOT LIST   — phases[].aiPromptSequence as the pack serves it
//                    (public/tramokyo-pack/data/journeys.json; built-ins
//                    from journeys.ts): distinct shots, scale registers,
//                    micro<->macro alternation, place-noun lock, cosmic
//                    escape, camera language, sparse opening.
//   H  SHADERS     — the REAL JourneyEngine (journey-engine.ts via jiti,
//                    clock stubbed) run over the track's real duration:
//                    distinct shaders, each shader's on-screen share and
//                    longest continuous presence across all three layers,
//                    layer load. Same code path as the kiosk (casts,
//                    kinetic lock, stillness, sparse interlude), minus
//                    morph quiet windows.
//   P  STILLS      — the pack images (sharp, 64px): near-duplicate
//                    clusters (dHash), centred-subject share, negative
//                    space, background polarity. The slideshow detector.
//   M  MOTION      — travel-morph slots in local-clips.json vs phase
//                    boundaries (heroes are disabled app-wide).
//   C  CADENCE     — the latest flight-recorder run per journey
//                    (docs/glitch-events.jsonl): distinct stills/min,
//                    repeats, morphs played, primary switches/min.
//
// Snowflake (first-snow) is scored as the reference row (its scripted
// take is replayed exactly) and is never a target.
//
// Usage: node scripts/audit-snowflake-standard.mjs [--json=out.json] [--md=out.md] [--only=<id,...>] [--no-images]
// Node 20 (repo .nvmrc). Read-only: touches no pack/DB/source file.
import { createJiti } from "jiti";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const ONLY = arg("only")?.split(",");
const NO_IMAGES = process.argv.includes("--no-images");

// ── stub the clock BEFORE the engine loads (it reads performance.now) ──
let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT + "src" } });
const J = await jiti.import("../src/lib/journeys/journeys.ts");
const ENG = await jiti.import("../src/lib/journeys/journey-engine.ts");
const SEQ = await jiti.import("../src/lib/journeys/installation-sequence.ts");
const TAKES = await jiti.import("../src/lib/journeys/pinned-takes.ts");
const KIN = await jiti.import("../src/lib/journeys/kinetic.ts");
const { MASTERED_JOURNEYS } = await jiti.import("../src/lib/journeys/mastered.ts");

const PACK = ROOT + "public/tramokyo-pack/";
const rows = JSON.parse(readFileSync(PACK + "data/journeys.json", "utf8"));
const recs = JSON.parse(readFileSync(PACK + "data/recordings.json", "utf8"));
const featured = JSON.parse(readFileSync(ROOT + "scripts/featured-recast.json", "utf8"));
const images = JSON.parse(readFileSync(PACK + "local-images.json", "utf8"));
const clips = JSON.parse(readFileSync(PACK + "local-clips.json", "utf8"));
const rowById = new Map(rows.map((r) => [r.id, r]));
const durByRec = new Map(recs.map((r) => [r.id, Number(r.duration) || 0]));
const durFeatured = new Map(featured.journeys.map((j) => [j.id, j.dur]));
const BUILTIN_DUR = { "first-snow": 178, "inferno": 242, "ghost": 219 };

// ══════════════════════ THE STANDARD (thresholds) ══════════════════════
// Derived from Snowflake's measured take + Karel's laws; documented in
// docs/snowflake-standard.md. Change both together.
export const STD = {
  S1_distinctShots: 12,      // ≥12 genuinely different shots (Snowflake: 6 phases + 12 curated particle stills)
  S2_registers: 4,           // spec law 2: ≥4 scale registers
  S3_alternation: 0.6,       // ≥60% of adjacent shots change register (micro↔macro)
  S4_placeLock: 3,           // no place noun in more than 3 phases (spec law 5)
  S5_cosmic: 1,              // ≥1 cosmic/abstract escape
  S6_camera: 0.25,           // ≥25% of shots carry camera/POV travel language
  S7_sparseOpen: 1,          // the opening shot is a sparse one-subject-on-dark frame
  L1_literal: 0.15,          // ≤15% of shots literal (Karel 2026-10-05: visionary + surreal, never literal)
  H1_distinct: 10,           // ≥10 distinct shaders on screen (Snowflake take: 14)
  H2_maxShare: 0.35,         // no shader on screen >35% of the track (lead excepted up to H3)
  H3_leadShare: 0.5,         // the single lead ≤50%
  H4_maxRun: 0.25,           // no shader continuously on screen >25% of the track (~one phase)
  H5_layers: 1.8,            // mean live shader layers ≤1.8 (Snowflake ≈1.2: one voice, the dual is earned)
  P1_dupRate: 0.2,           // ≤20% of distinct stills are near-duplicates (16px zero-mean correlation ≥0.85) of another
  P2_centred: 0.35,          // ≤35% of stills put their subject dead centre
  P3_negSpace: 0.45,         // median dark-pixel share ≥45% (room to layer on top)
  M1_morphCover: 0.8,        // ≥80% of phase boundaries have a travel morph
  C1_stillsPerMin: 3.5,      // measured ≥3.5 new stills/min (Snowflake ≈4.3)
  C2_repeatRate: 0.1,
  C3_presence: 0.35,         // measured: no shader on screen (any layer) >35% of a real kiosk run (Snowflake: 23%)        // ≤10% of still pushes re-show an image already shown this run
};

// ══════════════════════ helpers ══════════════════════
const STOP = new Set("a an the of and in into on at to from with its it is as by for at across over under through one each every all this that like than then while their them there where which who whose is are be been being toward towards against within without only most more very".split(" "));
const BOILER = /(asymmetric off-center composition[^,]*,?|completely uninhabited,?|no text no signatures no watermarks no letters no writing|no figures|no trees no roots( no plants)?|no sun no sky no landscape no figures,?)/gi;
const norm = (s) => (s ?? "").replace(BOILER, " ").replace(/^(DARK BACKGROUND|PURE WHITE BACKGROUND)\s*[—,:-]\s*/i, "").toLowerCase();
const words = (s) => new Set(norm(s).replace(/[^a-z\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function jaccard(a, b) { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, a.size + b.size - i); }
// Register classifier — first match by precedence over the shot's HEAD
// (the first ~140 chars carry the framing; tails are decoration).
const REG = [
  ["micro", /\b(extreme macro|macro|microscop\w*|close study|closest range|extreme close|cell|cells|membrane|grain|grains|droplet|dewdrop|filament|spore|pollen grain|facet)\b/],
  ["cosmic", /\b(cosmic|cosmos|galax\w*|nebula\w*|constellation\w*|deep space|star ?field|starlight|universe|celestial|infinite (dark|void|space)|void)\b/],
  ["aerial", /\b(aerial|from (directly )?above|overhead|bird'?s.eye|looking (straight )?down|high above|planetary|atmospher\w*|from orbit)\b/],
  ["abstract", /\b(abstract|mandala|fractal|lattice|geometr\w*|interference|pattern|kaleidoscop\w*)\b/],
  ["interior", /\b(interior|inside|within the|riding|tunnel|chamber|beneath the surface|under(water| the surface))\b/],
  ["intimate", /\b(close|a single|single|one (small|lone|last)|lone|small|tiny)\b/],
  ["landscape", /\b(wide|landscape|meadow|field|valley|shore|forest|horizon|plain|river|lake|sea|ocean|canyon|hills?|mountain\w*|desert|marsh|grove|garden|island|coast|prairie|tundra|dunes?)\b/],
];
function register(shot) { const h = norm(shot).slice(0, 140); for (const [r, re] of REG) if (re.test(h)) return r; return "unclassed"; }
const PLACES = ["meadow", "field", "valley", "shore", "forest", "sky", "river", "lake", "sea", "ocean", "canyon", "cave", "desert", "garden", "island", "room", "hall", "cathedral", "tunnel", "plain", "prairie", "hill", "cliff", "beach", "marsh", "grove", "mountain", "harbor", "harbour", "bay", "glade", "orchard", "vineyard", "chapel", "church", "barn", "cabin", "porch", "road", "track", "station", "city", "village"];
const CAMERA = /\b(through|into|toward|towards|descend\w*|rising|rises|diving|dives|flying|fly|riding|rides|passing|emerg\w*|approach\w*|pull(ing|s)? back|push(ing|es)? in|enter\w*|plung\w*|soar\w*|glid\w*|travel\w*|camera|following|drawn (in|toward)|sweeping past|falling (through|toward))\b/;
// LITERALNESS (Karel 2026-10-05: "i never want these to look too literal.
// these are visionary and surreal ... not literal"). A shot is literal
// when it names an everyday object/structure/creature, or a plain
// nature scene, without transfiguring it (light-made, impossible scale
// or physics, fractal/kaleidoscopic structure, cosmic dissolve).
const LIT_OBJECT = /\b(room|house|home|window|door|table|chair|piano|keys|instrument|guitar|violin|bells?|building|street|road|car|train|barn|cabin|porch|church|chapel|cathedral|lantern|candle|lamp|cup|book|boat|ship|bridge|fence|wall|stairs|kitchen|bed|clock|photograph|horses?|birds?|deer|wolf|wolves|fish|butterfl\w*|bees?|grapes?|vines?|wine|bottle|glass of)\b/;
const LIT_SCENE = /\b(meadow|field|forest|woods|valley|shore|beach|lake|river|mountains?|sunset|sunrise|trees?|grass\w*|flowers?|hills?|coast|vineyard|orchard|garden|thistle\w*|dandelion|wheat|redwoods?|clouds?|rain|storm|ocean|sea|water)\b/;
const TRANSFIGURE = /\b(made (only )?of light|of pure light|luminous|impossible|fractal|kaleidoscop\w*|surreal|dreamlike|otherworldly|visionary|cosmic|galax\w*|nebula\w*|dissolv\w*|particles?|glitter|prismatic|worlds? within|inside (a|an|the) (single|tiny)|suspended in (the )?void|abstract|mandala|spiral\w*|fibonacci|infinite|translucent|weightless|inverted|upside|floating island|light-threads?)\b/g;
function literal(shot) {
  const t = norm(shot);
  const marks = (t.match(TRANSFIGURE) ?? []).length;
  if (LIT_OBJECT.test(t)) return marks < 2;
  if (LIT_SCENE.test(t)) return marks < 1 || (/photoreal/.test(t) && marks < 2);
  return false;
}
const SPARSE = /\b(single|one (small|lone|last|tiny)|lone|tiny|almost nothing|vast (dark|black|silence|negative)|negative space|nearly the entire frame|small in|dark background)\b/i;

function shotsOf(phases) {
  const out = [];
  for (const p of phases) {
    const seq = p.aiPromptSequence?.length ? p.aiPromptSequence : p.aiPrompt ? [p.aiPrompt] : [];
    for (const s of seq) out.push({ phase: p.id, text: s });
  }
  return out;
}

function auditShots(phases) {
  const shots = shotsOf(phases);
  const W = shots.map((s) => words(s.text));
  // distinct = greedy clustering at Jaccard ≥ 0.5
  const reps = [];
  for (let i = 0; i < shots.length; i++) if (!reps.some((r) => jaccard(W[r], W[i]) >= 0.5)) reps.push(i);
  const regs = shots.map((s) => register(s.text));
  let changes = 0; for (let i = 1; i < regs.length; i++) if (regs[i] !== regs[i - 1]) changes++;
  const placeCount = {};
  for (const p of phases) {
    const txt = norm([p.aiPrompt, ...(p.aiPromptSequence ?? [])].join(" "));
    for (const pl of PLACES) if (new RegExp(`\\b${pl}s?\\b`).test(txt)) placeCount[pl] = (placeCount[pl] ?? 0) + 1;
  }
  const [lockNoun, lockN] = Object.entries(placeCount).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  const first = shots[0]?.text ?? "";
  return {
    shots: shots.length,
    distinct: reps.length,
    registers: [...new Set(regs.filter((r) => r !== "unclassed"))],
    regSeq: regs,
    alternation: regs.length > 1 ? changes / (regs.length - 1) : 0,
    placeLock: { noun: lockNoun, phases: lockN },
    cosmic: regs.filter((r) => r === "cosmic" || r === "abstract").length,
    camera: shots.filter((s) => CAMERA.test(norm(s.text))).length / Math.max(1, shots.length),
    sparseOpen: SPARSE.test(first) ? 1 : 0,
    literal: shots.filter((s) => literal(s.text)).length / Math.max(1, shots.length),
    literalShots: shots.filter((s) => literal(s.text)).map((s) => `${s.phase}: ${norm(s.text).slice(0, 90)}`),
  };
}

// ── real engine simulation ──
function simulate(journey, dur, script, seed = 20261005) {
  const eng = ENG.getJourneyEngine();
  CLOCK = 1000;
  eng.start(journey, { seed, trackDuration: dur, script });
  const step = 0.5;
  const on = new Map(); // mode -> seconds on screen
  const runs = new Map(); // mode -> longest continuous seconds
  const cur = new Map(); // mode -> current continuous seconds
  let layerSum = 0, n = 0, primarySwitches = 0, lastP = null;
  for (let s = 0; s <= dur; s += step) {
    CLOCK = 1000 + s * 1000;
    const f = eng.getFrame(s / dur);
    if (!f) continue;
    const live = new Set([f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode].filter(Boolean));
    if (f.shaderMode !== lastP) { if (lastP !== null) primarySwitches++; lastP = f.shaderMode; }
    layerSum += live.size; n++;
    for (const m of live) { on.set(m, (on.get(m) ?? 0) + step); cur.set(m, (cur.get(m) ?? 0) + step); runs.set(m, Math.max(runs.get(m) ?? 0, cur.get(m))); }
    for (const m of [...cur.keys()]) if (!live.has(m)) cur.delete(m);
  }
  eng.stop();
  const share = [...on].map(([m, sec]) => ({ m, share: sec / dur, run: (runs.get(m) ?? 0) / dur })).sort((a, b) => b.share - a.share);
  return { distinct: share.length, top: share.slice(0, 4), meanLayers: layerSum / Math.max(1, n), primarySwitchesPerMin: primarySwitches / (dur / 60) };
}

// ── pack stills ──
async function stillStats(urlsRaw) {
  const urls = [...new Set(urlsRaw)];
  const stats = [];
  for (const u of urls) {
    const f = PACK + u.replace(/^\/tramokyo-pack\//, "");
    if (!existsSync(f)) continue;
    try {
      const { data, info } = await sharp(f).greyscale().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      let sum = 0, dark = 0, mx = 0, my = 0, mw = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = data[y * W + x] / 255; sum += v; if (v < 0.09) dark++;
        const w = Math.max(0, v - 0.15); mx += x * w; my += y * w; mw += w;
      }
      const mean = sum / (W * H);
      const cx = mw ? mx / mw / W - 0.5 : 0, cy = mw ? my / mw / H - 0.5 : 0;
      // 16px zero-mean unit vector — near-duplicates correlate ≥0.85
      const t = [...(await sharp(f).greyscale().resize(16, 16, { fit: "fill" }).raw().toBuffer())];
      const m = t.reduce((a, b) => a + b, 0) / t.length; const c = t.map((x) => x - m); const nrm = Math.hypot(...c) || 1;
      stats.push({ u, mean, dark: dark / (W * H), off: Math.hypot(cx, cy), white: mean > 0.55, vec: c.map((x) => x / nrm) });
    } catch { /* unreadable mid-write — skip */ }
  }
  const corr = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };
  let dups = 0;
  for (let i = 0; i < stats.length; i++) if (stats.some((s, j) => j !== i && corr(s.vec, stats[i].vec) >= 0.85)) dups++;
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  return {
    n: stats.length,
    listed: urlsRaw.length,
    dupRate: stats.length ? dups / stats.length : 0,
    centred: stats.length ? stats.filter((s) => s.off < 0.06).length / stats.length : 0,
    negSpace: med(stats.map((s) => s.dark)),
    white: stats.filter((s) => s.white).length,
  };
}

// ── flight recorder: latest run per journey ──
function flightRuns() {
  const lines = readFileSync(ROOT + "docs/glitch-events.jsonl", "utf8").split("\n");
  const sess = new Map(); const runs = [];
  // Shader presence across all three layers, reconstructed from the
  // switch events (primary/dual hold until replaced; tertiary on/off).
  const tick = (r, t) => { for (const m of Object.values(r.layer)) if (m) r.pres[m] = (r.pres[m] ?? 0) + (t - r.last); r.last = t; };
  for (const l of lines) {
    if (!l.trim()) continue; let e; try { e = JSON.parse(l); } catch { continue; }
    let s = sess.get(e.session); if (!s) { s = { run: null }; sess.set(e.session, s); }
    const open = (id) => { if (s.run) tick(s.run, e.t); s.run = { journey: id, t0: e.t, t1: e.t, last: e.t, stills: [], clips: 0, prim: 0, layer: { p: null, d: null, t: null }, pres: {} }; runs.push(s.run); };
    if (e.type === "take-seed") { open((e.detail ?? "").split(" ")[0]); continue; }
    if (e.type === "journey-change") { const to = (e.detail ?? "").split("->")[1]?.trim(); if (to && s.run?.journey !== to) open(to); continue; }
    if (!s.run) continue;
    const r = s.run;
    if (e.t - r.t1 > 120000) { r.dead = true; } // idle/paused session tail — not a played run
    if (r.dead) continue;
    r.t1 = e.t;
    const m = (e.detail ?? "").split(" ")[0];
    if (e.type === "still") r.stills.push(e.detail);
    else if (e.type === "clip") r.clips++;
    else if (/^shader-/.test(e.type)) {
      tick(r, e.t);
      if (e.type === "shader-initial" || e.type === "shader-primary") { r.layer.p = m; if (e.type === "shader-primary") r.prim++; }
      else if (e.type === "shader-dual") r.layer.d = m;
      else if (e.type === "shader-tertiary-on") r.layer.t = m;
      else if (e.type === "shader-tertiary-off") r.layer.t = null;
    }
  }
  const latest = new Map();
  for (const r of runs) {
    tick(r, r.t1);
    const ms = r.t1 - r.t0, min = ms / 60000;
    if (min < 1) continue; // fragment
    const top = Object.entries(r.pres).sort((a, b) => b[1] - a[1])[0];
    latest.set(r.journey, { min, distinct: new Set(r.stills).size, pushes: r.stills.length, repeats: r.stills.length - new Set(r.stills).size, clips: r.clips, prim: r.prim, shaders: Object.keys(r.pres).length, topShader: top?.[0] ?? null, topPresence: top ? top[1] / ms : 0 });
  }
  return latest;
}

// ══════════════════════ targets ══════════════════════
const loop = [...SEQ.TRAMOKYO_SETLIST].filter((id) => !SEQ.TRAMOKYO_EXCLUDED_JOURNEYS.has(id));
const setOf = (idx) => SEQ.TRAMOKYO_SETS.find((s) => idx < s.end)?.presenting ?? "?";
function journeyFor(id) {
  const b = J.JOURNEYS.find((j) => j.id === id);
  if (b) return { journey: b, dur: BUILTIN_DUR[id] ?? durFeatured.get(id) ?? 240, builtin: true };
  const r = rowById.get(id);
  if (!r) return null;
  const journey = { id: r.id, name: r.name, realmId: r.realm_id, phases: r.phases, ...(r.theme ?? {}) };
  return { journey, dur: durByRec.get(r.recording_id) || durFeatured.get(id) || 200, builtin: false };
}

const flights = flightRuns();
const targets = ["first-snow", ...loop.filter((id) => {
  const jf = journeyFor(id);
  return jf && !MASTERED_JOURNEYS.has(id) && !(KIN.isKineticJourneyName(jf.journey.name) && !KIN.isExpansionKineticName(jf.journey.name));
})].filter((id) => !ONLY || ONLY.includes(id) || id === "first-snow");

const results = [];
for (const id of targets) {
  const { journey, dur } = journeyFor(id);
  const idx = loop.indexOf(id);
  const S = auditShots(journey.phases);
  const H = simulate(journey, dur, TAKES.SCRIPTED_TAKES[id], typeof TAKES.PINNED_TAKES[id] === "number" ? TAKES.PINNED_TAKES[id] : 20261005);
  const P = NO_IMAGES ? null : await stillStats(images[id] ?? []);
  const c = clips[id] ?? {};
  const boundaries = Math.max(1, journey.phases.length - 1);
  const morphSlots = Object.keys(c).filter((k) => /^t\d$/.test(k)).length;
  const F = flights.get(id) ?? null;
  const lead = KIN.isExpansionKineticName(journey.name) ? (H.top[0]?.m ?? null) : null;
  const nonLead = H.top.filter((t) => t.m !== lead);
  const ref = id === "first-snow"; // hand-curated pack: its shot list IS its stills, not phase prompts
  const checks = {
    L1: ref ? null : S.literal <= STD.L1_literal,
    S1: ref ? null : S.distinct >= STD.S1_distinctShots,
    S2: ref ? null : S.registers.length >= STD.S2_registers,
    S3: ref ? null : S.alternation >= STD.S3_alternation,
    S4: ref ? null : S.placeLock.phases <= STD.S4_placeLock,
    S5: ref ? null : S.cosmic >= STD.S5_cosmic,
    S6: ref ? null : S.camera >= STD.S6_camera,
    S7: ref ? null : S.sparseOpen >= STD.S7_sparseOpen,
    H1: H.distinct >= STD.H1_distinct,
    H2: (nonLead[0]?.share ?? 0) <= STD.H2_maxShare && (!lead || H.top[0].share <= STD.H3_leadShare),
    H4: Math.max(...H.top.map((t) => t.run)) <= STD.H4_maxRun,
    H5: H.meanLayers <= STD.H5_layers,
    P1: P ? P.dupRate <= STD.P1_dupRate : null,
    P2: P ? P.centred <= STD.P2_centred : null,
    P3: P ? P.negSpace >= STD.P3_negSpace : null,
    M1: morphSlots / boundaries >= STD.M1_morphCover,
    C1: F ? F.distinct / F.min >= STD.C1_stillsPerMin : null,
    C2: F ? (F.pushes ? F.repeats / F.pushes : 0) <= STD.C2_repeatRate : null,
    C3: F && F.shaders ? F.topPresence <= STD.C3_presence : null,
  };
  const scored = Object.values(checks).filter((v) => v !== null);
  results.push({
    id, name: journey.name, set: id === "first-snow" ? "REFERENCE" : setOf(idx), pos: idx + 1, dur: Math.round(dur),
    score: scored.filter(Boolean).length, of: scored.length,
    S, H, P, M: { morphSlots, boundaries }, F, checks,
  });
  process.stderr.write(`· ${journey.name}\n`);
}

// ══════════════════════ report ══════════════════════
const pct = (x) => `${Math.round(x * 100)}%`;
const lines = [];
lines.push(`# Snowflake Standard scorecard — ${new Date().toISOString().slice(0, 16)}Z`, "");
lines.push(`${results.length - 1} non-mastered loop journeys vs the reference (first-snow). Checks per docs/snowflake-standard.md; ✗ = fails.`, "");
lines.push("| # | Journey | Set | Score | Literal | Shots (distinct/total) | Registers · alt | Place lock | Shaders · top share · longest run · layers | Stills dup · centred · neg | Morphs | Measured stills/min · repeats · top shader presence | Fails |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const ordered = [results[0], ...results.slice(1).sort((a, b) => a.score / a.of - b.score / b.of || a.pos - b.pos)];
for (const r of ordered) {
  const fails = Object.entries(r.checks).filter(([, v]) => v === false).map(([k]) => k).join(" ");
  const top = r.H.top[0];
  lines.push(`| ${r.pos || "ref"} | ${r.name} | ${r.set} | ${r.score}/${r.of} | ${pct(r.S.literal)} | ${r.S.distinct}/${r.S.shots} | ${r.S.registers.length} · ${pct(r.S.alternation)} | ${r.S.placeLock.noun}×${r.S.placeLock.phases} | ${r.H.distinct} · ${top?.m} ${pct(top?.share ?? 0)} · ${pct(Math.max(...r.H.top.map((t) => t.run)))} · ${r.H.meanLayers.toFixed(1)} | ${r.P ? `${pct(r.P.dupRate)} · ${pct(r.P.centred)} · ${pct(r.P.negSpace)} (n${r.P.n})` : "-"} | ${r.M.morphSlots}/${r.M.boundaries} | ${r.F ? `${(r.F.distinct / r.F.min).toFixed(1)} · ${r.F.repeats} · ${r.F.topShader} ${pct(r.F.topPresence)}` : "no run"} | ${fails} |`);
}
const fails = {};
for (const r of results.slice(1)) for (const [k, v] of Object.entries(r.checks)) if (v === false) fails[k] = (fails[k] ?? 0) + 1;
lines.push("", "## Failure counts (of " + (results.length - 1) + ")", "", Object.entries(fails).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`).join("\n"));
const md = lines.join("\n");
if (arg("md")) writeFileSync(arg("md"), md + "\n");
if (arg("json")) writeFileSync(arg("json"), JSON.stringify(results, (k, v) => (typeof v === "bigint" ? undefined : v), 1));
console.log(md);
