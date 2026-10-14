#!/usr/bin/env node
// build-looks.mjs — one TouchDesigner look preset per journey, derived from
// the journey's own data in this repo (never from its title):
//
//   colour  ← src/lib/particles/journey-palettes.generated.ts (its stills,
//             whole-journey + per-phase palettes) or the profile's theme palette
//   motion  ← src/lib/journeys/particle-profiles.generated.ts (v2 deep analysis:
//             energy curve, sections, mood arousal/valence, tempo, brightness)
//   voice   ← src/lib/journeys/particle-voices.generated.ts (quiet/middle/energetic)
//
// Output: scripts/touchdesigner/looks.json — read by build_show.py inside TD
// (embedded in ResonanceShow.toe) and by make_toe.mjs. A journey that is not
// listed falls back, inside TD, to a palette-derived default built live from
// the /resonance/palette/* OSC channels.
//
//   node scripts/touchdesigner/build-looks.mjs [--out path]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

/** Evaluate the object literal of `export const NAME ... = { ... };` in a generated TS file. */
export function extractConst(src, name) {
  const at = src.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`${name} not found`);
  const eq = src.indexOf("= {", at);
  const end = src.lastIndexOf("};");
  const body = src.slice(eq + 2, end + 1);
  return Function(`"use strict"; return (${body});`)();
}

function voiceCharacters(src) {
  const out = {};
  for (const m of src.matchAll(/^\s*"([^"]+)":\s*\[[^\]]*\],?\s*\/\/\s*(.*?)\s*\((quiet|middle|energetic)\)\s*$/gm)) {
    out[m[1]] = { name: m[2], character: m[3] };
  }
  return out;
}

const hexToRgb = (h) => {
  const s = String(h || "").replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.padEnd(6, "0").slice(0, 6);
  const n = parseInt(f, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Math.round(v * 1000) / 1000);
};
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

/**
 * Seizure-safe palette: dark → light, 5 stops, and NO stop is both bright and
 * saturated red (the red-flash rule); the brightest stop is capped so a
 * whole-field wash can never reach full white.
 */
export function safePalette(hexes) {
  let cols = (hexes || []).filter(Boolean).map(hexToRgb);
  if (!cols.length) cols = [[0.05, 0.06, 0.09], [0.2, 0.25, 0.35], [0.55, 0.6, 0.7], [0.85, 0.75, 0.55], [0.95, 0.9, 0.8]];
  while (cols.length < 5) cols.push(cols[cols.length - 1]);
  cols = cols.slice(0, 5).sort((a, b) => lum(a) - lum(b));
  return cols.map(([r, g, b]) => {
    const sum = r + g + b || 1;
    if (r / sum >= 0.7 && r > 0.5) { g = Math.max(g, r * 0.35); b = Math.max(b, r * 0.2); } // de-saturate pure reds
    const L = lum([r, g, b]);
    const k = L > 0.85 ? 0.85 / L : 1;
    return [r3(r * k), r3(g * k), r3(b * k)];
  });
}

/** Motion knobs from the deep analysis. All 0..1 unless noted. */
export function motionFromProfile(p, character) {
  const curve = (p?.curve || []).map((c) => c[1]);
  const energy = curve.length ? mean(curve) : 0.5;
  const dyn = curve.length ? clamp(std(curve) * 3, 0, 1) : 0.4;
  const sections = p?.sections || [];
  const onset = sections.length ? mean(sections.map((s) => s.onsetRate || 0)) : (p?.tempo?.onsetRate ?? 2.5);
  const bright = sections.length ? mean(sections.map((s) => s.brightnessHz || 500)) : 500;
  const major = sections.length ? mean(sections.map((s) => s.major || 0)) : 0.4;
  const minor = sections.length ? mean(sections.map((s) => s.minor || 0)) : 0.2;
  const building = sections.filter((s) => s.trend === "building").length / Math.max(1, sections.length);
  const arousal = p?.mood?.arousal ?? energy;
  const valence = p?.mood?.valence ?? 0.5;
  const bpm = p?.tempo?.bpm || 72;
  const charBoost = character === "energetic" ? 0.12 : character === "quiet" ? -0.12 : 0;

  const activity = clamp(0.55 * arousal + 0.3 * energy + 0.15 * clamp(onset / 6, 0, 1) + charBoost, 0, 1);
  // flow form: 0 drift (calm field), 1 rise (building, hopeful), 2 vortex (energetic),
  // 3 fall (tender, receding — snow / petals), 4 orbit (steady, meditative)
  let form = 0;
  if (activity > 0.62) form = 2;
  else if (building > 0.4 && valence >= 0.45) form = 1;
  else if (valence < 0.4 && activity < 0.45) form = 3;
  else if ((p?.tempo?.steadiness ?? 0.5) > 0.6) form = 4;
  return {
    activity: r3(activity),
    energy: r3(energy),
    dynamics: r3(dyn),
    form,
    speed: r3(0.25 + 0.6 * activity),             // flow speed (motion, never brightness)
    turbulence: r3(0.2 + 0.6 * clamp(0.5 * activity + 0.5 * dyn, 0, 1)),
    emission: r3(0.35 + 0.45 * activity),         // base share of particles alive
    size: r3(0.7 + 0.5 * (1 - activity)),          // quieter music → larger, softer motes
    trail: r3(0.9 + 0.075 * (1 - activity)),       // feedback persistence 0.90..0.975
    warmth: r3(clamp(0.5 + 0.6 * (major - minor) * (valence - 0.2), 0, 1)),
    sparkle: r3(clamp((bright - 350) / 600, 0, 1)), // spectral brightness → fine grain, not light
    tempo: Math.round(bpm),
  };
}

export function buildLooks() {
  const palettes = extractConst(read("src/lib/particles/journey-palettes.generated.ts"), "JOURNEY_IMAGE_PALETTES");
  const profiles = extractConst(read("src/lib/journeys/particle-profiles.generated.ts"), "PARTICLE_PROFILES");
  const voices = voiceCharacters(read("src/lib/journeys/particle-voices.generated.ts"));
  const casts = extractConst(read("src/lib/journeys/journey-casts.generated.ts"), "JOURNEY_CASTS");
  const ids = [...new Set([...Object.keys(profiles), ...Object.keys(palettes)])];
  const looks = {};
  for (const id of ids) {
    const prof = profiles[id];
    const pal = palettes[id];
    const name = prof?.name || casts[id]?.name || voices[id]?.name || id;
    const theme = prof?.palette ? [prof.palette.primary, prof.palette.secondary, prof.palette.accent, prof.palette.glow] : null;
    const base = pal?.colors || theme;
    const phases = (pal?.phases || []).slice(0, 6).map((ph) => safePalette(ph.colors));
    const palette = safePalette(base);
    while (phases.length < 6) phases.push(phases[phases.length - 1] || palette);
    looks[id] = {
      name,
      source: { palette: pal ? "stills" : theme ? "theme" : "default", motion: prof ? "analysis" : "default" },
      character: voices[id]?.character || null,
      palette,
      phases,
      ...motionFromProfile(prof, voices[id]?.character),
    };
  }
  return looks;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf("--out");
  const out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "scripts/touchdesigner/looks.json");
  const looks = buildLooks();
  const n = Object.keys(looks).length;
  const stats = Object.values(looks).reduce((s, l) => { s[l.source.palette + "/" + l.source.motion] = (s[l.source.palette + "/" + l.source.motion] || 0) + 1; return s; }, {});
  writeFileSync(out, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), count: n, looks }, null, 0) + "\n");
  console.log(`[looks] ${n} journey looks → ${path.relative(ROOT, out)}`, stats);
}
