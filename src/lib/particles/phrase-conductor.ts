/**
 * PHRASE CONDUCTOR — the particle field moves with the COMPOSITION, not a clock
 * (particle-upgrade-plan.md v2, step 4 "Phrase-level music"; Karel 2026-10-12:
 * "right now we have a screensaver experience").
 *
 * Pure + deterministic. Input = a journey's deep-analysis profile (the compact
 * v2 profile the kiosk already bakes: sections with start/end/trend/intensity,
 * the 5 s dynamics curve, tempo, climax, phase bounds). Output = a timeline of
 * musical events, each with a suggested particle action:
 *
 *  - SECTION START → a new FORM (the music turns a page, so does the field);
 *  - PHRASE (tempo-aligned sub-phrases inside long sections, ~15 s of bars) →
 *    a new form or a refigure, so no form sits longer than a phrase;
 *  - CREST (an energy peak of the dynamics curve, the climax strongest) → a
 *    SWELL: density, mote size and music response lean into the crest and ease
 *    off after it;
 *  - BREATH (an energy dip) → THIN: density + response settle, the field
 *    hovers more sparsely, then fills back.
 *
 * Karel's laws, enforced here (and asserted in phrase-conductor.test.ts):
 *  - ONE BIG CHANGE AT A TIME: no form change within 3 s of another big change:
 *    a phrase form lands ≥ 7 s before a travel morph (the layer's ±4 s busy
 *    zone + 3 s), ≥ 3 s before a conducted window's form, and ≥ 10 s after
 *    either; a section start that falls on a morph is carried BY the morph.
 *  - FORMS HOLD: ≥ 10 s always, ≥ 14 s between the conductor's own changes.
 *  - NEVER OUT-AND-RIGHT-BACK (BRIDGE_SEC 12): the conductor never touches
 *    presence; a breath only thins (density ≥ 0.6×) over ≥ 12 s, and breaths /
 *    crests are ≥ 12 s apart so a thin is never snapped back by a swell.
 *  - EMBLEMS ARE UNTOUCHABLE: opening (0-16 s), mid (D/2, tracks > 200 s) and
 *    closing (D-17) emblem windows carry no conductor event, no form change in
 *    the 15 s lead-in the layer's timedSoon() already guards, and the swell is
 *    neutral while an emblem is worn.
 *  - MASTERED (Snowflake "first-snow", Ghost "ghost"): never conducted — the
 *    timeline is empty, the swell is neutral, their signature moments stay.
 *  - MOTION, NOT BRIGHTNESS: swells move density / size / react only — never
 *    gain, opacity, hue or saturation (SwellState has no luminance field).
 *
 * Off by default (PHRASE_CONDUCTOR_DEFAULT): `?phrase=1` on the kiosk URL turns
 * it on for the tab (remembered in sessionStorage), `?phrase=0` turns it off.
 */

export const PHRASE_CONDUCTOR_DEFAULT = true; // Karel's keep 2026-10-13
export const PHRASE_SESSION_KEY = "resonance-phrase";
/** Locked, mastered journeys — never conducted by phrase. */
export const PHRASE_LOCKED_JOURNEYS: ReadonlySet<string> = new Set(["first-snow", "ghost"]);

export const PHRASE_LAWS = {
  /** no big change within this many seconds of another */
  BIG_CHANGE_GAP_SEC: 3,
  /** a form is held at least this long, whatever triggers the next one */
  MIN_FORM_HOLD_SEC: 10,
  /** the conductor's own form changes are this far apart (default formDur) */
  FORM_HOLD_SEC: 14,
  /** the layer's busy zone either side of a phase boundary (travel morph) */
  PHASE_BUSY_SEC: 4,
  /** never fade out and right back in (particle-lead-layer BRIDGE_SEC) */
  BRIDGE_SEC: 12,
  /** form changes the layer refuses near an image moment (timedSoon horizon) */
  TIMED_LEAD_SEC: 15,
  /** a due event may still be taken this long after its time (guards clear) */
  EVENT_GRACE_SEC: 4,
  /** target sub-phrase length inside long sections */
  PHRASE_TARGET_SEC: 15,
  /** the opening emblem owns the first 16 s */
  OPENING_EMBLEM_END: 16,
} as const;

export interface PhraseSection {
  start: number;
  end: number;
  trend: string;
  /** 0..1 (the profile's section intensity) */
  intensity: number;
  /** the deep analysis's section name, when known (report / probe only) */
  name?: string;
}

export interface PhraseInput {
  duration: number;
  tempo?: { bpm: number } | null;
  sections: readonly PhraseSection[];
  /** [time s, intensity 0..1] on the analysis grid (5 s) */
  curve: readonly (readonly [number, number])[];
  climaxTime?: number | null;
  phaseBounds?: readonly number[];
}

export interface PhraseOptions {
  journeyId?: string;
  /** conduct a locked journey anyway (mastered-features.ts, ?masters=1) */
  allowLocked?: boolean;
  /** other big FORM changes known ahead (conducted window starts …) */
  formChanges?: readonly number[];
  /** extra untouchable windows [start, end] (signature moments) */
  reserved?: readonly (readonly [number, number])[];
}

export type PhraseKind = "section" | "phrase" | "crest" | "breath";
/** form = a new form · refigure = same form, new figure · swell / thin =
 *  density + size + response envelope · morph = the travel morph at this phase
 *  boundary already carries it (no extra change) */
export type PhraseAction = "form" | "refigure" | "swell" | "thin" | "morph";

export interface PhraseEvent {
  t: number;
  kind: PhraseKind;
  action: PhraseAction;
  /** 0..1 */
  strength: number;
  label: string;
  /** swell / thin envelope: seconds of lead-in before t and of release after it */
  rise?: number;
  fall?: number;
}

export interface PhraseTimeline {
  journeyId: string;
  duration: number;
  /** the tempo-aligned sub-phrase length used (s) */
  phraseSec: number;
  /** every event, time order (form/refigure/swell/thin/morph) */
  events: PhraseEvent[];
  /** emblem (+ signature) windows: no events, neutral swell */
  emblemWindows: [number, number][];
  /** windows in which no form change may happen */
  formBlocked: [number, number][];
  /** section starts that drive no form of their own, and why (emblem window /
   *  travel morph nearby / a conducted window's form / inside another hold) */
  skipped: { t: number; label: string; reason: "emblem" | "morph" | "window" | "hold" }[];
}

export interface SwellState {
  /** multipliers (1 = neutral) — MOTION only: density, mote size, music response */
  density: number;
  size: number;
  react: number;
}

export const NEUTRAL_SWELL: Readonly<SwellState> = Object.freeze({ density: 1, size: 1, react: 1 });

/** swell / thin depth per unit strength */
const SWELL = { density: 0.35, size: 0.15, react: 0.3 } as const;
const THIN = { density: 0.35, size: 0.08, react: 0.25 } as const;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ss = (e0: number, e1: number, x: number) => {
  const u = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** The emblem windows (image-follow.ts emblemEnvelope): opening, mid (> 200 s), closing (> 40 s). */
export function emblemWindows(D: number): [number, number][] {
  const out: [number, number][] = [[0, PHRASE_LAWS.OPENING_EMBLEM_END]];
  if (D > 200) out.push([D * 0.5 - 1, D * 0.5 + 15]);
  if (D > 40) out.push([D - 20, D + 2]);
  return out;
}

/** Where no form change may land: the emblems + the layer's 15 s lead-in
 *  (timedSoon) + a full hold after each image lets go. */
function formBlockedZones(D: number, reserved: readonly (readonly [number, number])[]): [number, number][] {
  const L = PHRASE_LAWS;
  const out: [number, number][] = [[0, L.OPENING_EMBLEM_END + L.MIN_FORM_HOLD_SEC]];
  if (D > 200) out.push([D * 0.5 - L.TIMED_LEAD_SEC, D * 0.5 + 15 + L.MIN_FORM_HOLD_SEC]);
  if (D > 40) out.push([D - 17 - L.TIMED_LEAD_SEC, D + 2]);
  for (const [a, b] of reserved) out.push([a - L.TIMED_LEAD_SEC, b + L.MIN_FORM_HOLD_SEC]);
  return out;
}

const inZones = (t: number, z: readonly (readonly [number, number])[]) => z.some(([a, b]) => t >= a && t < b);

/** Sub-phrase length: whole bars (4/4) closest to ~15 s, within 10-22 s. */
export function phraseSeconds(bpm: number | undefined | null): number {
  const target: number = PHRASE_LAWS.PHRASE_TARGET_SEC;
  if (!bpm || !Number.isFinite(bpm) || bpm < 30 || bpm > 260) return target;
  const bar = (4 * 60) / bpm;
  let best = target, bestErr = Infinity;
  for (const bars of [2, 4, 6, 8, 12, 16]) {
    const s = bars * bar;
    if (s < 10 || s > 22) continue;
    const err = Math.abs(s - target);
    if (err < bestErr) { best = s; bestErr = err; }
  }
  return r2(best);
}

interface Extremum { t: number; v: number; prom: number }

/** Crests (maxima) and breaths (minima) of the dynamics curve: a point that
 *  dominates ±10 s and stands ≥ 0.05 above (below) the lowest (highest) point
 *  on BOTH sides within ±20 s; times refined between grid points. */
function extrema(curve: PhraseInput["curve"], kind: "max" | "min"): Extremum[] {
  const c = curve.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (c.length < 3) return [];
  const v = c.map((p) => p[1]);
  const sign = kind === "max" ? 1 : -1;
  const out: Extremum[] = [];
  for (let i = 1; i < c.length - 1; i++) {
    const x = sign * v[i];
    if (!(x >= sign * v[i - 1] && x > sign * v[i + 1])) continue;
    let dominant = true, left = 0, right = 0;
    for (let j = 0; j < c.length && dominant; j++) {
      const dt = c[j][0] - c[i][0];
      if (j === i || Math.abs(dt) > 20) continue;
      const y = sign * v[j];
      if (Math.abs(dt) <= 10 && (y > x || (y === x && j < i))) dominant = false;
      if (dt < 0) left = Math.max(left, x - y); else right = Math.max(right, x - y);
    }
    const prom = Math.min(left, right);
    if (!dominant || !(prom >= 0.045)) continue;
    // parabolic vertex through the three smoothed points (grid → seconds)
    const a = sign * v[i - 1], b = x, d = sign * v[i + 1];
    const den = a - 2 * b + d;
    const off = den !== 0 ? clamp((0.5 * (a - d)) / den, -0.5, 0.5) : 0;
    const step = (c[i + 1][0] - c[i - 1][0]) / 2;
    out.push({ t: c[i][0] + off * step, v: v[i], prom });
  }
  return out;
}

/** The phrase timeline for one journey. Empty for the locked journeys. */
export function conductPhrases(input: PhraseInput, opts: PhraseOptions = {}): PhraseTimeline {
  const L = PHRASE_LAWS;
  const D = Math.max(0, input.duration || 0);
  const journeyId = opts.journeyId ?? "";
  const reserved = (opts.reserved ?? []).map(([a, b]) => [a, b] as [number, number]);
  const emblems = [...emblemWindows(D), ...reserved];
  const formBlocked = formBlockedZones(D, reserved);
  const phraseSec = phraseSeconds(input.tempo?.bpm);
  const empty: PhraseTimeline = { journeyId, duration: D, phraseSec, events: [], emblemWindows: emblems, formBlocked, skipped: [] };
  if ((!opts.allowLocked && PHRASE_LOCKED_JOURNEYS.has(journeyId)) || D < 30 || !input.sections?.length) return empty;

  // other FORM changes the layer makes on its own: travel morphs at the phase
  // bounds, conducted windows' forms — a phrase form keeps a full hold from each
  // A phrase form lands ≥ 7 s before a travel morph (the layer's ±4 s busy
  // zone + the 3 s one-big-change gap) and ≥ 3 s before a window's form, and
  // ≥ 10 s after either (a full hold for the form they brought). The layer's
  // own hold clock still guards their form switches at run time.
  const pbs = [...(input.phaseBounds ?? [])].filter((x) => x > 0 && x < D);
  const wins = [...(opts.formChanges ?? [])].filter((x) => Number.isFinite(x));
  const nearMorph = (t: number) => pbs.some((x) => t > x - (L.PHASE_BUSY_SEC + L.BIG_CHANGE_GAP_SEC) && t < x + L.MIN_FORM_HOLD_SEC);
  const nearWindow = (t: number) => wins.some((x) => t > x - L.BIG_CHANGE_GAP_SEC && t < x + L.MIN_FORM_HOLD_SEC);
  const events: PhraseEvent[] = [];

  // ── forms: section starts, then tempo-aligned sub-phrases ──
  const secs = [...input.sections].sort((a, b) => a.start - b.start);
  type Cand = PhraseEvent & { prio: number };
  const cands: Cand[] = [];
  secs.forEach((s, i) => {
    if (i > 0) {
      const p = secs[i - 1];
      const strength = r2(clamp(0.15 + Math.abs(s.intensity - p.intensity) * 0.9 + (s.trend !== p.trend ? 0.2 : 0), 0, 1));
      const label = `section ${i + 1}${s.name ? ` "${s.name}"` : ""} (${s.trend}, ${Math.round(s.intensity * 100)} %)`;
      cands.push({ t: s.start, kind: "section", action: "form", strength, label, prio: 2 + strength });
    }
    // sub-phrases on the section's own bar grid: whole phrases first, then
    // half phrases where a gap is still open (every one lands on a bar line)
    for (let h = 1; ; h++) {
      const t = s.start + (h * phraseSec) / 2;
      if (t > s.end - 6) break;
      const whole = h % 2 === 0;
      const k = h / 2;
      cands.push({ t: r2(t), kind: "phrase", action: whole && k % 3 === 2 ? "refigure" : "form", strength: whole ? 0.3 : 0.2, label: `${whole ? `phrase ${k + 1}` : "half-phrase"} in section ${i + 1}${s.name ? ` "${s.name}"` : ""}`, prio: (whole ? 1 : 0.5) - t / 1e5 });
    }
  });
  const accepted: Cand[] = [];
  const skipped: PhraseTimeline["skipped"] = [];
  for (const c of cands.sort((a, b) => b.prio - a.prio)) {
    if (c.t <= 0 || c.t >= D) continue;
    const why = inZones(c.t, formBlocked) ? "emblem" : nearMorph(c.t) ? "morph" : nearWindow(c.t) ? "window" : accepted.some((a) => Math.abs(a.t - c.t) < L.FORM_HOLD_SEC) ? "hold" : null;
    if (why === "morph" && c.kind === "section") {
      // a section start on a travel morph: the morph carries the change
      const pb = pbs.reduce((m, x) => (Math.abs(x - c.t) < Math.abs(m - c.t) ? x : m), pbs[0]);
      events.push({ t: r2(pb), kind: "section", action: "morph", strength: c.strength, label: `${c.label} — carried by the travel morph` });
    }
    if (why) { if (c.kind === "section") skipped.push({ t: c.t, label: c.label, reason: why }); continue; }
    accepted.push(c);
  }
  for (const a of accepted) events.push({ t: r2(a.t), kind: a.kind, action: a.action, strength: a.strength, label: a.label });

  // ── swells (crests) and thins (breaths) ──
  const crestsRaw = extrema(input.curve, "max").map((e) => ({ t: e.t, strength: r2(clamp(e.prom / 0.25, 0.2, 1) * (0.6 + 0.4 * clamp(e.v, 0, 1))), climax: false }));
  // the loudest sections always crest somewhere (a plateau has no sharp peak:
  // Bells 1's "Full Peal") — at the curve's top inside the section
  for (const s of secs) {
    if (s.intensity < 0.85 || crestsRaw.some((c) => c.t >= s.start && c.t < s.end)) continue;
    const inside = input.curve.filter(([t]) => t >= s.start + 3 && t <= s.end - 3);
    if (!inside.length) continue;
    const top = inside.reduce((m, p) => (p[1] > m[1] ? p : m), inside[0]);
    crestsRaw.push({ t: top[0], strength: r2(0.5 * s.intensity), climax: false });
  }
  const climax = input.climaxTime;
  if (climax != null && Number.isFinite(climax) && climax > 0 && climax < D) {
    const near = crestsRaw.find((c) => Math.abs(c.t - climax) < 6);
    if (near) { near.strength = 1; near.climax = true; }
    else crestsRaw.push({ t: climax, strength: 1, climax: true });
  }
  // a swell / thin's whole envelope (≤ 8 s lead-in, ≤ 10 s release) stays
  // clear of every emblem window and its 2 s neutral ramp
  const swellOk = (t: number) => !inZones(t, emblems.map(([a, b]) => [a - 12, b + 10] as [number, number]));
  // a crest inside one of the loudest sections swells at least by half
  const secAt = (t: number) => secs.find((s) => t >= s.start && t < s.end);
  for (const c of crestsRaw) { const si = secAt(c.t)?.intensity ?? 0; if (si >= 0.85) c.strength = Math.max(c.strength, r2(0.55 * si)); }
  const breathsRaw = extrema(input.curve, "min").map((e) => ({ t: e.t, strength: r2(clamp(e.prom / 0.25, 0.2, 1)), climax: false }));
  // crests and breaths ≥ BRIDGE_SEC apart, whichever kind: a thin snapped
  // straight back by a swell is an out-and-right-back. The strongest stays
  // (swells weigh a little more — the field leaning in is the point)
  type Mark = { t: number; strength: number; climax: boolean; crest: boolean };
  const marks: Mark[] = [...crestsRaw.map((c) => ({ ...c, crest: true })), ...breathsRaw.map((b) => ({ ...b, crest: false }))].filter((m) => swellOk(m.t));
  const keptMarks: Mark[] = [];
  for (const m of marks.sort((a, b) => (b.climax ? 9 : b.strength * (b.crest ? 1.25 : 1)) - (a.climax ? 9 : a.strength * (a.crest ? 1.25 : 1)) || a.t - b.t)) {
    if (!keptMarks.some((k) => Math.abs(k.t - m.t) < L.BRIDGE_SEC)) keptMarks.push(m);
  }
  const crests = keptMarks.filter((m) => m.crest).sort((a, b) => a.t - b.t);
  const breaths = keptMarks.filter((m) => !m.crest).sort((a, b) => a.t - b.t);
  for (const c of crests) {
    const prevDip = Math.max(0, ...breaths.filter((b) => b.t < c.t).map((b) => b.t));
    const rise = r2(clamp(c.t - prevDip - 2, 4, 8));
    events.push({ t: r2(c.t), kind: "crest", action: "swell", strength: c.strength, label: c.climax ? "climax" : "crest", rise, fall: 6 });
  }
  for (const b of breaths) events.push({ t: r2(b.t), kind: "breath", action: "thin", strength: b.strength, label: "breath", rise: 4, fall: 8 });

  events.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));
  for (const e of events) if (e.kind === "crest" || e.kind === "breath") e.label = `${e.label} at ${fmt(e.t)}`;
  return { journeyId, duration: D, phraseSec, events, emblemWindows: emblems, formBlocked, skipped };
}

/** Envelope 0..1 of one swell / thin at time t (peak AT the event, held 2 s for a thin). */
function envelope(e: PhraseEvent, t: number): number {
  const rise = e.rise ?? 4, fall = e.fall ?? 6;
  const hold = e.action === "thin" ? 2 : 0;
  if (t < e.t - rise || t > e.t + hold + fall) return 0;
  if (t <= e.t) return ss(e.t - rise, e.t, t);
  if (t <= e.t + hold) return 1;
  return 1 - ss(e.t + hold, e.t + hold + fall, t);
}

/** Motion multipliers at time t (neutral outside events, inside emblem windows,
 *  and for the locked journeys). Never a luminance channel. */
export function swellAt(tl: PhraseTimeline | null, t: number): SwellState {
  if (!tl || !tl.events.length) return { ...NEUTRAL_SWELL };
  let sw = 0, br = 0;
  for (const e of tl.events) {
    if (e.action === "swell") sw = Math.max(sw, e.strength * envelope(e, t));
    else if (e.action === "thin") br = Math.max(br, e.strength * envelope(e, t));
  }
  if (sw === 0 && br === 0) return { ...NEUTRAL_SWELL };
  // emblems are untouchable: ease to neutral 2 s around every emblem window
  let mask = 0;
  for (const [a, b] of tl.emblemWindows) mask = Math.max(mask, ss(a - 2, a, t) * (1 - ss(b, b + 2, t)));
  const k = 1 - mask;
  return {
    density: r3(clamp(1 + (SWELL.density * sw - THIN.density * br) * k, 0.6, 1.4)),
    size: r3(clamp(1 + (SWELL.size * sw - THIN.size * br) * k, 0.9, 1.2)),
    react: r3(clamp(1 + (SWELL.react * sw - THIN.react * br) * k, 0.7, 1.35)),
  };
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * The form-timing gate. `cursor = null` (flag off, locked journeys) is EXACTLY
 * the layer's old hold clock: due ⇔ sinceFormMs > formDur. With a cursor the
 * conductor's events decide: a form / refigure event is due from its time for
 * EVENT_GRACE_SEC, once the current form has held MIN_FORM_HOLD_SEC; if the
 * guards kept every event out, the clock takes over at formDur × 2.2 (never a
 * form sitting forever).
 */
export interface PhraseCursor { tl: PhraseTimeline; taken: Set<number> }
export function createPhraseCursor(tl: PhraseTimeline): PhraseCursor {
  return { tl, taken: new Set() };
}
export function formHoldDue(cursor: PhraseCursor | null, t: number, sinceFormMs: number, formDur: number): { due: boolean; event: PhraseEvent | null; index: number } {
  if (!cursor) return { due: sinceFormMs > formDur, event: null, index: -1 };
  const ev = cursor.tl.events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.t > t) break;
    if ((e.action !== "form" && e.action !== "refigure") || cursor.taken.has(i)) continue;
    if (t - e.t > PHRASE_LAWS.EVENT_GRACE_SEC) continue;
    if (sinceFormMs >= PHRASE_LAWS.MIN_FORM_HOLD_SEC * 1000) return { due: true, event: e, index: i };
  }
  return { due: sinceFormMs > formDur * 2.2, event: null, index: -1 };
}
/** Mark an event as used (the layer calls this when the change happens). */
export function takePhraseEvent(cursor: PhraseCursor | null, index: number): void {
  if (cursor && index >= 0) cursor.taken.add(index);
}

/** Is the phrase conductor on for this tab? `?phrase=1` / `?phrase=0` (kept in
 *  sessionStorage across the kiosk loop's navigations), else the default. */
export function phraseConductorEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("phrase");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(PHRASE_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(PHRASE_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return PHRASE_CONDUCTOR_DEFAULT;
}
