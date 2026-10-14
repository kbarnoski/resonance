/**
 * UNREAL BUNDLE — the pure half of scripts/export-unreal-bundle.mjs: the
 * bundle's file layout (and its validator), the still schedule, palettes in
 * Unreal's linear colour space, and shader-timeline compaction.
 *
 * The exporter does the IO (pack reads, ffmpeg decode, copies); everything
 * that decides WHAT goes in the bundle lives here so it is unit-tested
 * (bundle.test.ts). docs/unreal-pipeline.md is the Unreal-side recipe.
 */

import { allocateByPhase, packImageIndexForProgress, packPhaseSliceForProgress, nextSlotInSlice, TRAMOKYO_PHASE_WEIGHT, type PhaseSpan } from "@/lib/journeys/pack-image-allocation";

export const BUNDLE_VERSION = 1;

/** Files every bundle has (paths relative to the bundle root). */
export const BUNDLE_REQUIRED = [
  "README.md",
  "bundle.json",
  "curves.csv",
  "curvetable.csv",
  "events.json",
  "palette.json",
  "images/index.json",
] as const;

/** Media a full (non --no-media) bundle also carries. */
export const BUNDLE_MEDIA_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: "audio/<slug>.wav (48 kHz PCM)", re: /^audio\/[^/]+\.wav$/ },
  { label: "audio/<slug>.m4a|mp3 (the pack's track)", re: /^audio\/[^/]+\.(m4a|mp3)$/ },
  { label: "images/<still>.jpg|png", re: /^images\/[^/]+\.(jpe?g|png)$/ },
];

/** Missing pieces of a bundle (empty = valid). `files` = paths relative to the root. */
export function validateBundleLayout(files: readonly string[], opts: { media: boolean; depth?: boolean }): string[] {
  const set = new Set(files.map((f) => f.replace(/\\/g, "/")));
  const missing: string[] = BUNDLE_REQUIRED.filter((f) => !set.has(f));
  if (opts.media) {
    for (const p of BUNDLE_MEDIA_PATTERNS) if (![...set].some((f) => p.re.test(f))) missing.push(p.label);
    if (opts.depth && ![...set].some((f) => /^images\/depth\/[^/]+\.png$/.test(f))) missing.push("images/depth/<still>.png");
  }
  return missing;
}

/** A filesystem-safe slug ("Yellow Bird" → "yellow-bird"). */
export function slugify(name: string): string {
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "journey";
}

// ── colour ────────────────────────────────────────────────────────────────

/** sRGB 0..1 → linear (Unreal's FLinearColor). */
export function srgbToLinear(c: number): number {
  const x = Math.max(0, Math.min(1, c));
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export interface BundleColor { hex: string; srgb: [number, number, number]; linear: [number, number, number] }

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function bundleColor(hex: string): BundleColor | null {
  let s = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  const m = /^([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const srgb: [number, number, number] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  return { hex: "#" + m[1].toLowerCase(), srgb: srgb.map(r4) as [number, number, number], linear: srgb.map((c) => r4(srgbToLinear(c))) as [number, number, number] };
}

// ── the still schedule ────────────────────────────────────────────────────

export interface StillShow { start: number; end: number; slot: number; file: string; phase: string; reason: "intro" | "phase-entry" | "slot" | "walk" | "scripted" | "finale" }

export interface StillScheduleInput {
  /** journey phases (progress fractions) */
  phases: readonly PhaseSpan[];
  /** the pack's still file names, in pack order (slot order = story order) */
  files: readonly string[];
  duration: number;
  /** seconds between still changes (the kiosk's ~10 s image tempo) */
  cadence?: number;
  /** pinned take: [seconds, file name] (pinned-takes.ts TAKE_STILL_SCRIPTS) */
  script?: readonly (readonly [number, string])[];
  /** pinned titling still (file name) */
  introFile?: string | null;
  /** pinned finale still (file name): opens the last phase, held to the end */
  finaleFile?: string | null;
  /** phase weights of the pack harvest (null = by length) */
  phaseWeight?: Record<string, number> | null;
}

/**
 * When each still is on screen — the kiosk's arc-law slot mapping
 * (pack-image-allocation.ts: phase slices, phase entry on the slice's first
 * slot, idle walks that never leave the slice, scripted takes, the finale
 * pin, no new still after 96 %) replayed on a fixed cadence with jitter 0.
 * An EDIT SUGGESTION for the film, not a recording of a kiosk run.
 */
export function stillSchedule(inp: StillScheduleInput): StillShow[] {
  const n = inp.files.length;
  const D = inp.duration;
  if (!n || !(D > 0)) return [];
  const C = Math.max(2, inp.cadence ?? 10);
  const weight = inp.phaseWeight === undefined ? TRAMOKYO_PHASE_WEIGHT : inp.phaseWeight;
  const phaseAt = (prog: number) => inp.phases.find((p, i) => prog < (p.end ?? 1) || i === inp.phases.length - 1)?.id ?? "";
  const lastStart = inp.phases.length ? (inp.phases[inp.phases.length - 1].start ?? 1) * D : Infinity;
  const finaleSlot = inp.finaleFile ? inp.files.indexOf(inp.finaleFile) : -1;
  const out: StillShow[] = [];
  let lastSlot = -1;
  let lastSliceStart = -1;
  const push = (t: number, slot: number, reason: StillShow["reason"]) => {
    if (out.length) out[out.length - 1].end = t;
    out.push({ start: t, end: D, slot, file: inp.files[slot], phase: phaseAt(t / D), reason });
    lastSlot = slot;
  };
  const intro = inp.introFile ? inp.files.indexOf(inp.introFile) : -1;
  for (let t = 0; t < D * 0.96; t += C) {
    if (finaleSlot >= 0 && t >= lastStart) break;
    const prog = t / D;
    let idx = packImageIndexForProgress(inp.phases, n, prog, weight);
    let reason: StillShow["reason"] = "slot";
    if (idx < 0) idx = Math.floor(t / C) % n;
    const slice = packPhaseSliceForProgress(inp.phases, n, prog, weight);
    if (slice && slice.start !== lastSliceStart) { idx = slice.start; reason = "phase-entry"; lastSliceStart = slice.start; }
    if (t === 0 && intro >= 0) { idx = intro; reason = "intro"; }
    let sc: string | null = null;
    for (const [at, name] of inp.script ?? []) if (t + 0.5 >= at) sc = name;
    if (sc) { const k = inp.files.indexOf(sc); if (k >= 0) { idx = k; reason = "scripted"; } }
    if (idx === lastSlot && reason !== "scripted") {
      const next = slice ? nextSlotInSlice(idx, slice, (i) => i !== lastSlot) : (idx + 1) % n;
      if (next === idx) continue; // a one-still slice holds
      idx = next; reason = "walk";
    }
    if (idx === lastSlot) continue;
    push(t, idx, reason);
  }
  if (finaleSlot >= 0 && lastStart < D) push(lastStart, finaleSlot, "finale");
  return out.map((s) => ({ ...s, start: r4(s.start), end: r4(s.end) }));
}

/** Story order of the pack slots: the phase each slot belongs to. */
export function slotPhases(phases: readonly PhaseSpan[], n: number, phaseWeight: Record<string, number> | null = TRAMOKYO_PHASE_WEIGHT): string[] {
  const counts = allocateByPhase(phases, n, phaseWeight);
  const out: string[] = [];
  phases.forEach((p, i) => { for (let k = 0; k < counts[i]; k++) out.push(p.id); });
  while (out.length < n) out.push(phases[phases.length - 1]?.id ?? "");
  return out;
}

// ── shader timeline ───────────────────────────────────────────────────────

export type ShaderLayer = "primary" | "dual" | "tertiary";
export interface ShaderSample { t: number; primary: string | null; dual: string | null; tertiary: string | null; opacity: number }
export interface ShaderSegment { layer: ShaderLayer; shader: string; start: number; end: number }

/** Fixed-step engine samples → per-layer segments (a shader's continuous run on one layer). */
export function shaderSegments(samples: readonly ShaderSample[], duration: number): ShaderSegment[] {
  const out: ShaderSegment[] = [];
  for (const layer of ["primary", "dual", "tertiary"] as const) {
    let cur: ShaderSegment | null = null;
    for (const s of samples) {
      const m = s[layer];
      if (cur && cur.shader !== m) { cur.end = s.t; out.push(cur); cur = null; }
      if (!cur && m) cur = { layer, shader: m, start: s.t, end: duration };
    }
    if (cur) { cur.end = duration; out.push(cur); }
  }
  return out.sort((a, b) => a.start - b.start || a.layer.localeCompare(b.layer)).map((g) => ({ ...g, start: r4(g.start), end: r4(g.end) }));
}
