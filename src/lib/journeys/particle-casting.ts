/**
 * PARTICLE LANGUAGE v2 — casting + conducting from a journey's v2 deep
 * analysis (Karel 2026-10-05: "having them always there and always part of
 * every transition gets too much … change color and respond to the music and
 * playful at times … diversity … based on the feeling of the music and its
 * analysis … sometimes have the journey just be particle against the black
 * for a few seconds here and there to give visual breaks").
 *
 * Pure + deterministic (unit-tested). Input = the compact profile baked by
 * scripts/build-particle-profiles.mjs. Output = a ParticleCast:
 *  - windows: WHEN particles are present (rest otherwise) — a few chosen
 *    section-change transitions (≈1 in 3–4 still changes), the builds, the
 *    summit, the coda;
 *  - breaks: 2–3 particle-only moments (imagery + shaders veiled to black)
 *    at breaths / valleys / phrase ends;
 *  - souls per window kind, chosen by mood/energy/playfulness traits with a
 *    per-journey seed and neighbour diversity (castSet);
 *  - colour per section from harmony (major warmer/golden, minor cooler/
 *    violet, key changes rotate further, register lifts saturation);
 *  - playfulness + motion from tempo/feel/texture.
 */
import { SOULS, SHAPE_SOULS, type SoulId, type SoulPreset } from "@/lib/particles/souls";

export interface ParticleSection {
  start: number;
  end: number;
  trend: string;
  intensity: number;
  onsetRate: number;
  localKey: string | null;
  major: number;
  minor: number;
  suspended: number;
  diminished: number;
  centerMidi: number | null;
  brightnessHz: number | null;
}

export interface ParticleProfile {
  name: string;
  recordingId: string;
  palette: { primary: string; secondary: string; accent: string; glow: string } | null;
  duration: number;
  key: string | null;
  climaxTime: number | null;
  quietestTime: number | null;
  /** Journey phase boundaries (s) — the travel morphs ride these. */
  phaseBounds?: number[];
  curve: [number, number][];
  sections: ParticleSection[];
  mood: { words: string[]; arousal: number; valence: number };
  tempo: { bpm: number; feel: string; steadiness: number; pulseClarity: number; onsetRate: number };
}

export type WindowKind = "transition" | "build" | "peak" | "break" | "coda";

export interface PresenceWindow {
  kind: WindowKind;
  start: number;
  end: number;
  soul: SoulId;
  /** world density (0 = one ember … 1 = full field) */
  density: number;
  /** density at the window's end (glides start → end) */
  densityEnd: number;
}

export interface SectionColor {
  start: number;
  end: number;
  /** YIQ hue rotation (rad): + cooler/violet (minor), − warmer/golden (major) */
  hue: number;
  sat: number;
}

export interface ParticleCast {
  name: string;
  windows: PresenceWindow[];
  /** particle-only breaks (subset of windows with kind "break") */
  breaks: PresenceWindow[];
  colors: SectionColor[];
  souls: Record<WindowKind, SoulId>;
  /** 0 serene … 1 playful/rhythmic — gates scatter / bounce / melody-follow */
  playfulness: number;
  /** rhythmic steadiness (bounce on the pulse) */
  rhythmic: boolean;
  /** motion multiplier from tempo/feel/arousal */
  motion: number;
  /** cymatic plate mode (n, m) + lissajous ratios from the harmony */
  form: [number, number, number, number];
  /** journey phase boundaries (s) — the layer's dissolve look-ahead */
  phaseBounds: number[];
  /** v3: the form that GATHERS at the end of each travel morph, per phase
   *  (index = the phase the morph leads into) */
  morphSouls: SoulId[];
  /** hue gradient across the form (rad) */
  hueSpread: number;
}

const EDGE = 3; // presence ramps (s)

// ── helpers ──────────────────────────────────────────────────────────────────
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const PLAYFUL_RE = /playful|danc|lively|joy|bounc|sparkl|whims|buoyant|rhythm|exuber|spirit|jaunty|giddy|circling|driv|forward/i;
const SERENE_RE = /serene|meditat|calm|still|hush|tender|reveren|contempla|settled|unhurried|spacious/i;
const DARK_RE = /brood|dark|shadow|smould|elegi|ominous|grief|haunt|restless|unsettl|bitter/i;

export function playfulnessOf(p: ParticleProfile): number {
  const w = p.mood.words;
  let x = 0.15;
  x += w.filter((s) => PLAYFUL_RE.test(s)).length * 0.18;
  x -= w.filter((s) => SERENE_RE.test(s)).length * 0.08;
  if (p.tempo.onsetRate > 4) x += 0.15;
  if (p.tempo.steadiness > 0.85 && p.tempo.pulseClarity > 0.5) x += 0.15;
  if (p.mood.arousal > 0.58) x += 0.1;
  return Math.round(clamp01(x) * 100) / 100;
}

export function darknessOf(p: ParticleProfile): number {
  const minorKey = /minor/i.test(p.key ?? "") ? 0.35 : 0;
  const words = p.mood.words.filter((s) => DARK_RE.test(s)).length * 0.15;
  return Math.round(clamp01(minorKey + words + Math.max(0, -p.mood.valence) * 0.6) * 100) / 100;
}

export function motionOf(p: ParticleProfile): number {
  const feel = p.tempo.feel === "slow" ? -0.12 : p.tempo.feel === "fast" ? 0.15 : 0;
  return Math.round(Math.max(0.6, Math.min(1.5, 0.75 + (p.mood.arousal - 0.4) * 0.9 + (p.tempo.bpm - 80) / 200 + feel)) * 100) / 100;
}

function intensityAt(p: ParticleProfile, t: number): number {
  const c = p.curve;
  if (!c.length) return 0.5;
  for (let i = 0; i < c.length - 1; i++) {
    if (t < c[i + 1][0]) {
      const k = (t - c[i][0]) / (c[i + 1][0] - c[i][0]);
      return c[i][1] + (c[i + 1][1] - c[i][1]) * Math.max(0, k);
    }
  }
  return c[c.length - 1][1];
}

// ── soul choice ─────────────────────────────────────────────────────────────
interface Mood { energy: number; playful: number; dark: number }

function score(soul: SoulPreset, kind: WindowKind, m: Mood, seed: number): number {
  const t = soul.traits;
  let s = 0;
  const want = kind === "peak" ? Math.max(0.6, m.energy) : kind === "build" ? m.energy * 0.9 + 0.1 : kind === "break" || kind === "coda" ? m.energy * 0.4 : m.energy * 0.7;
  s -= Math.abs(t.energy - want) * 1.2;
  s -= Math.abs(t.dark - m.dark) * 0.9;
  s -= Math.abs(t.playful - m.playful) * 0.8;
  if (kind === "peak") s += t.peak * 1.4;
  if (kind === "break" || kind === "coda") s += t.solo * 1.2;
  s += hash(`${seed}:${soul.id}:${kind}`) * 0.55; // per-journey variety
  return s;
}

const SHAPES = SOULS.filter((x) => SHAPE_SOULS.includes(x.id));

/** v3: only the gathering, legible SHAPE souls are cast in journeys. */
function rankSouls(kind: WindowKind, m: Mood, seed: number, avoid: Set<SoulId>): SoulId[] {
  const pool = SHAPES.filter((x) => !avoid.has(x.id));
  return (pool.length >= 3 ? pool : SHAPES)
    .map((x) => ({ id: x.id, s: score(x, kind, m, seed) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}

function pickSoul(kind: WindowKind, m: Mood, seed: number, avoid: Set<SoulId>): SoulId {
  return rankSouls(kind, m, seed, avoid)[0] ?? "rings";
}

// ── colour from harmony ─────────────────────────────────────────────────────
export function sectionColors(p: ParticleProfile): SectionColor[] {
  const globalKey = p.key ?? "";
  const midis = p.sections.map((s) => s.centerMidi ?? 55);
  const midMedian = midis.slice().sort((a, b) => a - b)[Math.floor(midis.length / 2)] ?? 55;
  let keyTurns = 0;
  // v3 (Karel: "i didnt notice them changing color much"): wider travel —
  // harmony (minor cooler/violet, major warmer/golden), key turns, mood
  // valence and tension all move the hue; the journey's mean is centred so
  // sections never all pin to one rail, and intensity spreads it further
  const raw = p.sections.map((s, i) => {
    const minorness = s.minor + s.diminished * 1.5 - s.major * 0.8 + s.suspended * 0.2;
    if (i > 0 && s.localKey && s.localKey !== p.sections[i - 1].localKey) keyTurns += 1;
    const keyShift = s.localKey && s.localKey !== globalKey ? 0.3 + 0.1 * (keyTurns % 2) : 0;
    const tension = s.diminished * 1.2 + s.suspended * 0.3;
    return minorness * 1.6 + keyShift * 1.6 + tension * 0.5 - (p.mood.valence ?? 0) * 0.35;
  });
  const mean = raw.reduce((a, b) => a + b, 0) / Math.max(1, raw.length);
  const meanI = p.sections.reduce((a, s) => a + s.intensity, 0) / Math.max(1, p.sections.length);
  const centre = Math.max(-0.6, Math.min(0.9, mean));
  return p.sections.map((s, i) => {
    const hue = Math.max(-1.1, Math.min(1.3, centre + (raw[i] - mean) + (s.intensity - meanI) * 1.2));
    const reg = ((s.centerMidi ?? midMedian) - midMedian) / 12;
    const sat = Math.max(0.8, Math.min(1.5, 1.05 + reg * 0.3 + (s.intensity - 0.6) * 0.6));
    return { start: s.start, end: s.end, hue: Math.round(hue * 100) / 100, sat: Math.round(sat * 100) / 100 };
  });
}

/** Harmony → form: cymatic plate mode + lissajous ratio (major ≈ 3:2, minor ≈ 6:5). */
export function formOf(p: ParticleProfile): [number, number, number, number] {
  const minor = /minor/i.test(p.key ?? "");
  const n = 2 + Math.round(hash(`${p.recordingId}:n`) * 3);
  const m = n + 1 + Math.round(hash(`${p.recordingId}:m`) * 3);
  return minor ? [n, m, 1.2, 1.5] : [n, m, 1.5, 2.0];
}

// ── the conductor ───────────────────────────────────────────────────────────
export function conduct(p: ParticleProfile, souls: Record<WindowKind, SoulId>): { windows: PresenceWindow[]; breaks: PresenceWindow[] } {
  const D = p.duration;
  const out: PresenceWindow[] = [];
  // the summit window must fit before the coda even when the analysed climax
  // sits at the very end of the take
  const climax = Math.max(25, Math.min(p.climaxTime ?? D * 0.7, D - 30));

  // the summit
  const half = Math.max(7, Math.min(18, D * 0.08));
  out.push({ kind: "peak", start: Math.max(15, climax - half * 1.1), end: Math.min(D - 18, climax + half * 0.9), soul: souls.peak, density: 0.5, densityEnd: 0.65 }); // a held form, not a full-frame swarm

  // builds: the late part of building sections that rise above the median
  const ints = p.sections.map((s) => s.intensity).sort((a, b) => a - b);
  const med = ints[Math.floor(ints.length / 2)] ?? 0.6;
  for (const s of p.sections) {
    if (s.trend !== "building" || s.intensity < med || s.end - s.start < 18) continue;
    const len = Math.min(30, (s.end - s.start) * 0.45);
    out.push({ kind: "build", start: s.end - len, end: s.end + 4, soul: souls.build, density: 0.12, densityEnd: 0.45 });
  }

  // transitions: the section changes with the most contrast, ~1 per 75 s —
  // but only INSIDE phases (the phase changes belong to the travel morphs);
  // phase midpoints are fallback candidates
  const pb = p.phaseBounds ?? [];
  const tLen = Math.min(24, Math.max(16, D * 0.12));
  // a dissolve may START only ≥14 s after a phase change and ≥12 s before the
  // next — a transition window must contain ≥4 s of such time
  const segOf = (t: number) => {
    const e = [0, ...pb, D];
    for (let i = 0; i < e.length - 1; i++) if (t >= e[i] && t < e[i + 1]) return [e[i], e[i + 1]];
    return [0, D];
  };
  const dissolvable = (start: number, end: number) => {
    const [a, b] = segOf(start + 4);
    return Math.min(end, b - 12) - Math.max(start, a === 0 ? 0 : a + 14) >= 4;
  };
  const bounds = p.sections.slice(1).map((s, i) => ({
    t: s.start,
    contrast: Math.abs(s.intensity - p.sections[i].intensity) + (s.localKey !== p.sections[i].localKey ? 0.4 : 0) + Math.abs(s.minor - p.sections[i].minor),
  }));
  const edges = [0, ...pb, D];
  for (let i = 0; i < edges.length - 1; i++) bounds.push({ t: (edges[i] + edges[i + 1]) / 2, contrast: 0.05 });
  const nTrans = Math.max(1, Math.round(D / 75));
  bounds
    .filter((b) => b.t > 20 && b.t < D - 25 && dissolvable(b.t - 4, b.t - 4 + tLen))
    .sort((a, b) => b.contrast - a.contrast)
    .slice(0, nTrans)
    // 24 s: the pack's still cadence is ~20 s, so a window this long almost
    // always catches one still change to dissolve through
    // (shorter on short tracks so restraint holds)
    .forEach((b) => out.push({ kind: "transition", start: b.t - 4, end: b.t - 4 + tLen, soul: souls.transition, density: 0.45, densityEnd: 0.4 }));

  // particle-only breaks: valleys of the dynamics curve + receding phrase ends
  const cand: { t: number; depth: number }[] = [];
  const c = p.curve;
  for (let i = 1; i < c.length - 1; i++) {
    if (c[i][1] <= c[i - 1][1] && c[i][1] <= c[i + 1][1]) cand.push({ t: c[i][0], depth: 1 - c[i][1] });
  }
  for (const s of p.sections) if (s.trend === "receding") cand.push({ t: s.end, depth: 0.45 + (1 - s.intensity) * 0.3 });
  // fallback: quiet moments in the middle of a phase
  {
    const e = [0, ...pb, D];
    for (let i = 0; i < e.length - 1; i++) {
      const m = e[i] + 14 + 2;
      if (m + 7 < e[i + 1] - 1) cand.push({ t: m, depth: 0.2 + (1 - intensityAt(p, m)) * 0.3 });
    }
  }
  const breaks: PresenceWindow[] = [];
  // a particle-only black break is a full-screen moment: one per journey at
  // most, and none in short pieces (Karel 2026-10-05: "only rarely")
  const maxBreaks = D >= 150 ? 1 : 0;
  for (const k of cand.sort((a, b) => b.depth - a.depth)) {
    if (breaks.length >= maxBreaks) break;
    if (k.t < 30 || k.t > D - 30 || Math.abs(k.t - climax) < 35) continue;
    // never veil a travel morph: the break sits ≥14 s after a phase change
    // and ends before the next one
    if (pb.some((x) => !(x >= k.t + 7 + 1 || x <= k.t - 2 - 14))) continue;
    if (breaks.some((b) => Math.abs(b.start - k.t) < 55)) continue;
    const w: PresenceWindow = { kind: "break", start: k.t - 2, end: k.t + 7, soul: souls.break, density: 0.12, densityEnd: 0.1 };
    if (out.some((o) => o.kind !== "transition" && o.start < w.end + 4 && w.start < o.end + 4)) continue;
    breaks.push(w);
  }
  out.push(...breaks);

  // coda: the last light settles to one ember
  out.push({ kind: "coda", start: D - Math.min(12, Math.max(6, D * 0.08)), end: D + 2, soul: souls.coda, density: 0.012, densityEnd: 0 });

  // resolve overlaps by precedence (peak > break > coda > build > transition)
  const rank: Record<WindowKind, number> = { peak: 5, break: 4, coda: 3.5, build: 3, transition: 2 };
  const sorted = out.sort((a, b) => rank[b.kind] - rank[a.kind]);
  const kept: PresenceWindow[] = [];
  for (const w of sorted) {
    let cur: PresenceWindow | null = { ...w };
    for (const k of kept) {
      if (!cur) break;
      if (cur.start < k.end && k.start < cur.end) {
        // trim to the side that remains; drop if too short
        if (cur.start >= k.start) cur.start = k.end;
        else cur.end = Math.min(cur.end, k.start);
        if (cur.end - cur.start < 8) cur = null;
      }
    }
    if (cur) kept.push(cur);
  }
  kept.sort((a, b) => a.start - b.start);

  // RESTRAINT (Karel: "always there … gets too much"): ≥12 s of rest between
  // windows, then cap total presence. Builds go first, then transitions —
  // but a few transitions are protected (Karel liked particles as part of the
  // imaging transitions); the summit, breaks and coda are never dropped.
  const dropOrder = (w: PresenceWindow) => (w.kind === "build" ? 1 : w.kind === "transition" ? 2 : 99);
  const minTrans = D > 200 ? 2 : 1;
  const canDrop = (w: PresenceWindow) =>
    w.kind === "build" || (w.kind === "transition" && kept.filter((x) => x.kind === "transition").length > minTrans);
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1], b = kept[i];
    if (b.start - a.end >= 12) continue;
    const pick = [a, b].filter(canDrop).sort((x, y) => dropOrder(x) - dropOrder(y))[0];
    if (pick) { kept.splice(kept.indexOf(pick), 1); i = 0; }
  }
  // v3: the morph-end emergences (runtime, ~18 s per travel morph) now carry
  // most overlays — the conducted windows stay sparse around them
  const CAP = 0.3;
  while (presenceFraction({ windows: kept }, D) > CAP) {
    const order = kept.filter(canDrop).sort((x, y) => dropOrder(x) - dropOrder(y) || y.start - x.start);
    if (!order.length) break;
    kept.splice(kept.indexOf(order[0]), 1);
  }
  // hard ceiling: if the summit, breaks and coda alone are dense, even the
  // protected transition yields (the morph emergences carry the overlays)
  while (presenceFraction({ windows: kept }, D) > 0.38) {
    const tr = kept.filter((w) => w.kind === "transition").sort((x, y) => y.start - x.start)[0];
    if (!tr) break;
    kept.splice(kept.indexOf(tr), 1);
  }
  // …and on short tracks, surplus breaks (one always stays)
  while (presenceFraction({ windows: kept }, D) > 0.38 && kept.filter((w) => w.kind === "break").length > 1) {
    const br = kept.filter((w) => w.kind === "break").sort((x, y) => y.start - x.start)[0];
    kept.splice(kept.indexOf(br), 1);
  }
  return { windows: kept, breaks: kept.filter((w) => w.kind === "break") };
}

/** Presence (0..1) + the active window at time t — smooth ramps, never a cut. */
export function presenceAt(cast: Pick<ParticleCast, "windows">, t: number): { presence: number; window: PresenceWindow | null; breakVeil: number; density: number } {
  let best: { presence: number; window: PresenceWindow | null } = { presence: 0, window: null };
  for (const w of cast.windows) {
    const ramp = w.kind === "break" ? 2.5 : EDGE;
    const x = Math.min((t - w.start) / ramp, (w.end - t) / ramp);
    const pr = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    if (pr > best.presence) best = { presence: pr, window: w };
  }
  const w = best.window;
  const k = w ? clamp01((t - w.start) / Math.max(1, w.end - w.start)) : 0;
  return {
    presence: best.presence,
    window: w,
    breakVeil: w?.kind === "break" ? best.presence : 0,
    density: w ? w.density + (w.densityEnd - w.density) * k : 0,
  };
}

export function colorAt(cast: Pick<ParticleCast, "colors">, t: number): { hue: number; sat: number } {
  const c = cast.colors.find((x) => t >= x.start && t < x.end) ?? cast.colors[cast.colors.length - 1];
  return c ? { hue: c.hue, sat: c.sat } : { hue: 0, sat: 1 };
}

/** Cast one journey (avoid = souls its loop neighbours already lead with). */
export function castJourney(p: ParticleProfile, avoid: Set<SoulId> = new Set()): ParticleCast {
  const seed = Math.floor(hash(p.recordingId) * 1e6);
  const playfulness = playfulnessOf(p);
  const m: Mood = { energy: clamp01(p.mood.arousal * 0.9 + (p.tempo.onsetRate - 3) * 0.08), playful: playfulness, dark: darknessOf(p) };
  const used = new Set<SoulId>(avoid);
  const take = (kind: WindowKind) => {
    const id = pickSoul(kind, m, seed, used);
    used.add(id);
    return id;
  };
  const souls = {} as Record<WindowKind, SoulId>;
  for (const k of ["peak", "build", "transition", "break", "coda"] as WindowKind[]) souls[k] = take(k);
  const { windows, breaks } = conduct(p, souls);
  // one gathering form per phase (the morph INTO phase i lands on morphSouls[i]);
  // consecutive phases always differ, neighbours' forms avoided where possible
  const nPhases = (p.phaseBounds?.length ?? 0) + 1;
  const ranked = rankSouls("transition", m, seed + 7, avoid);
  const morphSouls: SoulId[] = [];
  for (let i = 0; i < nPhases; i++) {
    let id = ranked[(i * 2 + (i > 2 ? 1 : 0)) % ranked.length];
    if (i > 0 && id === morphSouls[i - 1]) id = ranked[(i * 2 + 1) % ranked.length];
    morphSouls.push(id);
  }
  return {
    name: p.name,
    windows,
    breaks,
    colors: sectionColors(p),
    souls,
    playfulness,
    rhythmic: p.tempo.steadiness > 0.85 && p.tempo.pulseClarity > 0.5,
    motion: motionOf(p),
    form: formOf(p),
    phaseBounds: p.phaseBounds ?? [],
    morphSouls,
    hueSpread: Math.round((0.3 + p.mood.arousal * 0.45) * 100) / 100,
  };
}

/** Cast a set in loop order: no soul repeats between neighbours (±1). */
export function castSet(profiles: ParticleProfile[]): ParticleCast[] {
  const casts: ParticleCast[] = [];
  for (let i = 0; i < profiles.length; i++) {
    const avoid = new Set<SoulId>();
    if (i > 0) {
      for (const s of Object.values(casts[i - 1].souls)) avoid.add(s);
      // keep the pool wide enough to cast from
      if (SHAPE_SOULS.length - avoid.size < 6) for (const s of [...avoid].slice(0, avoid.size - (SHAPE_SOULS.length - 6))) avoid.delete(s);
    }
    casts.push(castJourney(profiles[i], avoid));
  }
  return casts;
}

/** Fraction of the track where particles are present (> 0.5). */
export function presenceFraction(cast: Pick<ParticleCast, "windows">, duration: number): number {
  let on = 0;
  for (let t = 0; t < duration; t += 0.5) if (presenceAt(cast, t).presence > 0.5) on += 0.5;
  return on / duration;
}
