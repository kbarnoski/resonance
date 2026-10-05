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
// Mastered Kinetic Lab journeys and Ghost are never touched (not in the
// Expansion path). Writes scripts/expansion-recast.json.
// Usage: node --env-file=.env.local scripts/recast-expansion.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const vet = JSON.parse(readFileSync("scripts/shader-vetting.json", "utf8"));
const set1 = JSON.parse(readFileSync("scripts/expansion-output.json", "utf8"));
const set2 = JSON.parse(readFileSync("scripts/expansion2-output.json", "utf8"));
const order = [...set1.journeys.map((j) => ({ id: j.journeyId, rec: j.recordingId, title: j.title })), ...set2.journeys.map((j) => ({ id: j.journeyId, rec: j.recordingId, title: j.title }))];
const MASTERED_LEADS = new Set(["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"]);
const POOL = vet.pass.filter((m) => !MASTERED_LEADS.has(m));
// LAYER BUDGET (on-screen luma check 2026-10-04: three screen-blended
// kinetic layers + the image stack add — single-layer vetting at
// p5 ≤ 15 / mean ≤ 70 still lifted the black floor to ~40). Supports must
// be DARK (mean ≤ 25, p5 ≤ 6); a lead may be brighter (mean ≤ 45, p5 ≤ 10)
// because it is the one featured voice.
const V = vet.verdicts;
const isDark = (m) => V[m].mean <= 25 && V[m].p5 <= 6;
const leadOk = (m) => V[m].mean <= 45 && V[m].p5 <= 10;

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

// ── 2a. leads: most-constrained journey first, best palette fit, actor-like forms preferred ──
const actorScore = () => 0;
const leadOf = new Map();
const used = new Set();
const candidatesFor = (r) => POOL.filter(leadOk).map((m) => ({ m, s: fit(m, paletteFamilies(r.palette)) * 2 + actorScore(m) + (isDark(m) ? 0 : 2.5) + hash(r.title + m) * 0.5 }));
const byConstraint = [...rows].sort((a, b) => candidatesFor(a).filter((c) => c.s >= 8.5).length - candidatesFor(b).filter((c) => c.s >= 8.5).length);
for (const r of byConstraint) {
  const best = candidatesFor(r).filter((c) => !used.has(c.m)).sort((a, b) => b.s - a.s)[0];
  leadOf.set(r.id, best.m); used.add(best.m); r.lead = best.m; r.leadFit = fit(best.m, paletteFamilies(r.palette));
}
const SUPPORT = POOL.filter((m) => !used.has(m) && isDark(m));

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

// ── 2c. supports: distinct within journey, balanced, palette-aware, none shared with the previous journey ──
const uses = new Map(SUPPORT.map((m) => [m, 0]));
let prev = new Set();
for (const r of rows) {
  const pf = paletteFamilies(r.palette);
  const need = r.phases.reduce((n, _, i) => n + (r.leadPhases.has(i) ? 2 : 3), 0);
  const pick = [];
  const ranked = () => SUPPORT.filter((m) => !pick.includes(m) && !prev.has(m)).sort((a, b) => (uses.get(a) - uses.get(b)) * 4 - (fit(a, pf) - fit(b, pf)) + (hash(r.title + a) - hash(r.title + b)) * 0.5);
  while (pick.length < need) { const m = ranked()[0]; pick.push(m); uses.set(m, uses.get(m) + 1); }
  // order the journey's supports quiet->loud: calmer shaders (lower mean) into quieter phases
  const byCalm = [...pick].sort((a, b) => vet.verdicts[a].mean - vet.verdicts[b].mean);
  const phaseOrder = r.phases.map((_, i) => i).sort((a, b) => r.intensity[a] - r.intensity[b]);
  const slots = new Map();
  let k = 0;
  for (const i of phaseOrder) { const n = r.leadPhases.has(i) ? 2 : 3; slots.set(i, byCalm.slice(k, k + n)); k += n; }
  r.cast = Object.fromEntries(r.phases.map((p, i) => [p.id, r.leadPhases.has(i) ? [r.lead, ...slots.get(i)] : slots.get(i)]));
  r.supports = pick; prev = new Set(pick);
}

// ── write phases ──
const post = (I) => ({ bloomIntensity: r2(0.1 + 0.3 * (I - 0.3) / 0.7), colorTemperature: r2(0.1 * (I - 0.3) / 0.7), vignette: r2(0.35 - 0.15 * (I - 0.3) / 0.7), halation: r2(0.02 + 0.08 * (I - 0.3) / 0.7), chromaticAberration: r2(0.03 * (I - 0.3) / 0.7), particleDensity: r2(0.01 + 0.06 * (I - 0.3) / 0.7) });
for (const r of rows) {
  const phases = r.phases.map((p, i) => ({ ...p, intensityMultiplier: r.intensity[i], ...post(r.intensity[i]), filmGrain: 0, shaderModes: r.cast[p.id] }));
  if (!DRY) { const { error } = await sb.from("journeys").update({ phases, audio_reactive: true }).eq("id", r.id); if (error) throw error; }
  console.log(`${r.title.padEnd(23)} lead ${r.lead.padEnd(18)} fit${r.leadFit} cover ${r.leadCoverage}  I ${r.intensity.join(" ")}  peak ${r.peakPhase}${r.crests ? " (crests)" : ""}`);
}
const hist = [...uses.entries()].sort((a, b) => b[1] - a[1]);
writeFileSync("scripts/expansion-recast.json", JSON.stringify({
  generated: new Date().toISOString(),
  pool: { vettedPass: vet.pass.length, leads: rows.length, supportPool: SUPPORT.length },
  supportUses: Object.fromEntries(hist),
  journeys: rows.map((r) => ({ id: r.id, title: r.title, lead: r.lead, leadHue: vet.verdicts[r.lead].hue, leadFit: r.leadFit, leadCoverage: r.leadCoverage, energy: r.energy, intensity: r.intensity, crests: r.crests, peakPhase: r.peakPhase, cast: r.cast })),
}, null, 1));
console.log(`\nsupport pool ${SUPPORT.length} · uses min ${hist.at(-1)[1]} max ${hist[0][1]} · ${DRY ? "DRY RUN" : "DB updated"} → scripts/expansion-recast.json`);
