/**
 * THE BRIDGE — particles carry light from one world into the next.
 *
 * At a phase boundary the show leaves one still for the next (a travel morph
 * clip, or a crossfade). Shortly before the boundary a SPARSE share of the
 * field (never all of it) quietly takes on the colours of the OUTGOING still
 * wherever each mote sits; through the transition those motes recolour toward
 * the INCOMING still and drift a little toward where its light is, then let
 * go. Light appears to be carried across from one world into the next — one
 * slow exhale (≈ 12 s), never a visible "effect".
 *
 * This module is the PURE scheduler (no DOM, no GL — unit tested in
 * bridge.test.ts). particle-lead-layer feeds it one input per tick and hands
 * the output (presence / mix / drift / fraction) to the engine, which glides
 * every value again per frame; the still colours come downscaled from a
 * worker (bridge-sampler.ts) — never a main-thread read-back.
 *
 * Karel's laws, enforced here:
 *  - MOTION, NOT BRIGHTNESS: the output has no luminance field. The engine
 *    transfers only CHROMA (YIQ I/Q) from the still onto each carrier and keeps
 *    the mote's own luma, so nothing brightens or flashes; over black pixels a
 *    mote simply keeps its colour (the black floor stays black).
 *  - NEVER ABRUPT: presence rises over RISE_SEC, the colour crosses over
 *    CROSS_SEC, the carriers let go over FALL_SEC; a cancelled bridge still
 *    lets go over ≥ ABORT_FALL_SEC from wherever it was. No value ever steps.
 *  - ONE MOVER: with a travel morph at this boundary the clip is the mover and
 *    the bridge is only an accompaniment (half the carriers, less drift). It
 *    never starts within SHADER_QUIET_SEC after a shader switch (busyNow's
 *    shader rule), holds off entirely when an emblem / timed form / conducted
 *    window would land inside its span (formSoon), and lets go if an image
 *    form, dissolve or motif takes the field while it runs (blockedNow). While
 *    it runs it reports `busy`, so the conductor starts no new form on top.
 *  - MASTERED (Snowflake "first-snow", Ghost "ghost"): never bridged.
 *
 * Off by default (BRIDGE_DEFAULT) until Karel has seen it: `?bridge=1` on the
 * kiosk URL turns it on for the tab (kept in sessionStorage), `?bridge=0` off.
 */

export const BRIDGE_DEFAULT = false;
export const BRIDGE_SESSION_KEY = "resonance-bridge";
/** Locked, mastered journeys — never bridged. */
export const BRIDGE_LOCKED_JOURNEYS: ReadonlySet<string> = new Set(["first-snow", "ghost"]);

export const BRIDGE_LAWS = {
  /** the exhale begins this long before the boundary */
  LEAD_SEC: 5,
  /** …and may slide later (shader quiet, stills still sampling) until this
   *  long before it — after that the boundary is let go */
  LATEST_START_SEC: 2,
  /** outgoing colours settle onto the carriers */
  RISE_SEC: 3.5,
  /** the A → B recolour begins this long after the boundary (negative = before) */
  CROSS_AT_SEC: -0.5,
  /** A → B recolour length */
  CROSS_SEC: 4,
  /** the carriers let go */
  FALL_SEC: 3.5,
  /** a cancelled bridge still lets go at least this slowly */
  ABORT_FALL_SEC: 3,
  /** the incoming still must be in hand by boundary + this, else the bridge
   *  lets go wearing the outgoing colours (no cross) */
  B_DEADLINE_SEC: 2.5,
  /** busyNow's shader rule: never START within this long after a shader switch */
  SHADER_QUIET_SEC: 3,
  /** the opening emblem owns the first 16 s */
  OPENING_END_SEC: 16,
  /** an emblem / form this close to either end of the exhale holds it off */
  FORM_GUARD_SEC: 2,
  /** share of the field that carries (solo — the bridge is the mover) */
  FRACTION: 0.2,
  /** …with the travel morph as the mover: an accompaniment */
  FRACTION_MORPH: 0.1,
  /** drift toward the incoming light (engine scales to ≤ ~5 % of the screen) */
  DRIFT: 1,
  DRIFT_MORPH: 0.45,
  /** a clock jump bigger than this (seek / replay) resets the scheduler */
  JUMP_SEC: 2.5,
} as const;

/** The nominal span of one exhale (start → let go), seconds. */
export const BRIDGE_SPAN_SEC =
  BRIDGE_LAWS.LEAD_SEC + BRIDGE_LAWS.CROSS_AT_SEC + BRIDGE_LAWS.CROSS_SEC + BRIDGE_LAWS.FALL_SEC;

export function bridgeEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("bridge");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(BRIDGE_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(BRIDGE_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return BRIDGE_DEFAULT;
}

export type BridgePhase = "idle" | "rise" | "cross" | "fall";

export interface BridgeState {
  phase: BridgePhase;
  /** the boundary being bridged (s), null when idle */
  pb: number | null;
  startAt: number;
  crossAt: number;
  fallAt: number;
  fallSec: number;
  /** presence / mix at the moment the fall began (the fall eases from there) */
  presFrom: number;
  mixFrom: number;
  /** the travel morph is the mover at this boundary */
  gentle: boolean;
  /** boundaries already bridged or let go this run */
  done: number[];
  lastT: number;
  /** why the last boundary was let go / cut short (diagnostics) */
  note: string;
}

export interface BridgeInput {
  t: number;
  /** track duration (s); 0 = unknown */
  duration: number;
  phaseBounds: readonly number[];
  journeyId: string;
  mastered: boolean;
  /** the outgoing still's colours are sampled for the next boundary */
  aReady: boolean;
  /** the incoming still's colours are sampled */
  bReady: boolean;
  /** a travel morph plays (or is armed) at this boundary */
  morph: boolean;
  /** seconds since the last shader switch */
  sinceShader: number;
  /** an emblem / timed image form / conducted window lands within [from, to] */
  formSoon: (from: number, to: number) => boolean;
  /** something already holds the field (image form worn, dissolve, motif …): reason, or null */
  blockedNow: string | null;
}

export interface BridgeOut {
  /** carriers wear the still colours 0..1 */
  presence: number;
  /** outgoing → incoming colour 0..1 */
  mix: number;
  /** drift toward the incoming light 0..1 */
  drift: number;
  /** share of the field that carries */
  fraction: number;
  /** the bridge holds the field: no new form on top (one mover) */
  busy: boolean;
  phase: BridgePhase;
  pb: number | null;
}

export function createBridgeState(): BridgeState {
  return { phase: "idle", pb: null, startAt: 0, crossAt: 0, fallAt: 0, fallSec: BRIDGE_LAWS.FALL_SEC, presFrom: 0, mixFrom: 0, gentle: false, done: [], lastT: -1, note: "" };
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** The next boundary this run could still bridge (not yet done, not past its latest start). */
export function nextBridgeBoundary(t: number, phaseBounds: readonly number[], done: readonly number[]): number | null {
  for (const pb of phaseBounds) {
    if (pb - t < BRIDGE_LAWS.LATEST_START_SEC) continue;
    if (done.includes(pb)) continue;
    return pb;
  }
  return null;
}

/** Presence / mix the state shows at time t (pure read). */
function shape(s: BridgeState, t: number): { presence: number; mix: number } {
  switch (s.phase) {
    // (idle holds the last mix: it only shows through presence, and holding it
    // means the colour never moves while a mote still wears a trace of it)
    case "idle": return { presence: 0, mix: s.mixFrom };
    case "rise": return { presence: ease((t - s.startAt) / BRIDGE_LAWS.RISE_SEC), mix: 0 };
    case "cross": return { presence: 1, mix: ease((t - s.crossAt) / BRIDGE_LAWS.CROSS_SEC) };
    case "fall": {
      const k = 1 - ease((t - s.fallAt) / s.fallSec);
      return { presence: s.presFrom * k, mix: s.mixFrom };
    }
  }
}

function out(s: BridgeState, t: number): BridgeOut {
  const { presence, mix } = shape(s, t);
  const L = BRIDGE_LAWS;
  return {
    presence,
    mix,
    drift: presence * ease(mix) * (s.gentle ? L.DRIFT_MORPH : L.DRIFT),
    fraction: s.gentle ? L.FRACTION_MORPH : L.FRACTION,
    busy: s.phase !== "idle",
    phase: s.phase,
    pb: s.pb,
  };
}

function beginFall(s: BridgeState, t: number, fallSec: number, note?: string): BridgeState {
  const { presence, mix } = shape(s, t);
  return { ...s, phase: "fall", fallAt: t, fallSec, presFrom: presence, mixFrom: mix, note: note ?? s.note };
}

/**
 * One scheduler step. Pure: same state + input → same result.
 */
export function stepBridge(prev: BridgeState, inp: BridgeInput): { state: BridgeState; out: BridgeOut } {
  const L = BRIDGE_LAWS;
  const { t } = inp;
  let s: BridgeState = prev;

  // MASTERED: never bridged (anything running lets go — it cannot, the flag
  // is per journey, but the scheduler is defensive)
  if (inp.mastered || BRIDGE_LOCKED_JOURNEYS.has(inp.journeyId)) {
    if (s.phase !== "idle" && s.phase !== "fall") s = beginFall(s, t, L.ABORT_FALL_SEC, "mastered");
  }

  // seek / replay: start over (the engine's own glide hides the reset)
  if (s.lastT >= 0 && (t < s.lastT - 0.5 || t - s.lastT > L.JUMP_SEC)) {
    s = { ...createBridgeState(), done: t < s.lastT ? [] : s.done.filter((pb) => pb <= t), note: "clock jump" };
  }
  s = { ...s, lastT: t };

  // ── running ───────────────────────────────────────────────────────────
  if (s.phase !== "idle" && s.pb !== null) {
    const pb = s.pb;
    // something took the field: let go slowly from wherever we are
    if (inp.blockedNow && s.phase !== "fall") {
      s = beginFall(s, t, Math.max(L.ABORT_FALL_SEC, L.FALL_SEC * shape(s, t).presence), `yield: ${inp.blockedNow}`);
    }
    // the cross waits until the outgoing colours have fully settled AND the
    // boundary is near — and only with the incoming still in hand
    if (s.phase === "rise" && t >= s.startAt + L.RISE_SEC && t >= pb + L.CROSS_AT_SEC) {
      if (inp.bReady) s = { ...s, phase: "cross", crossAt: t };
      else if (t >= pb + L.B_DEADLINE_SEC) s = beginFall(s, t, L.FALL_SEC, "incoming still not ready — let go on the outgoing colours");
    }
    if (s.phase === "cross" && t >= s.crossAt + L.CROSS_SEC) s = beginFall(s, t, L.FALL_SEC);
    if (s.phase === "fall" && t >= s.fallAt + s.fallSec) {
      s = { ...s, phase: "idle", pb: null, presFrom: 0 };
    }
    return { state: s, out: out(s, t) };
  }

  // ── idle: is a boundary coming? ─────────────────────────────────────────
  if (inp.mastered || BRIDGE_LOCKED_JOURNEYS.has(inp.journeyId)) return { state: s, out: out(s, t) };
  const pb = nextBridgeBoundary(t, inp.phaseBounds, s.done);
  if (pb === null || pb - t > L.LEAD_SEC) return { state: s, out: out(s, t) };
  // (pb - t is now within [LATEST_START_SEC, LEAD_SEC])
  const skip = (note: string) => ({ state: { ...s, done: [...s.done, pb], note: `${pb.toFixed(1)}: ${note}` }, out: out(s, t) });
  const end = pb + L.CROSS_AT_SEC + L.CROSS_SEC + L.FALL_SEC + 1.5; // + slack for a late start
  if (t - L.FORM_GUARD_SEC < L.OPENING_END_SEC) return skip("opening emblem");
  if (inp.duration > 0 && end > inp.duration) return skip("past the end of the track");
  if (inp.formSoon(t - L.FORM_GUARD_SEC, end + L.FORM_GUARD_SEC)) return skip("an emblem / form lands inside the exhale");
  // transient holds: wait (the window slides) — nextBridgeBoundary lets the
  // boundary go once its latest start has passed
  if (inp.blockedNow || inp.sinceShader < L.SHADER_QUIET_SEC || !inp.aReady) {
    const why = inp.blockedNow ?? (inp.sinceShader < L.SHADER_QUIET_SEC ? "shader switch" : "outgoing still not sampled");
    if (pb - t - 0.1 < L.LATEST_START_SEC) return skip(`never clear to start (${why})`);
    return { state: { ...s, note: `${pb.toFixed(1)}: waiting (${why})` }, out: out(s, t) };
  }
  s = { ...s, phase: "rise", pb, startAt: t, gentle: inp.morph, done: [...s.done, pb], note: `${pb.toFixed(1)}: carrying${inp.morph ? " (with the morph)" : ""}` };
  return { state: s, out: out(s, t) };
}

// ── hint bus: the image layer tells the particles which stills meet ─────────

/** Which stills meet at the next boundary (published by ai-image-layer). */
export interface BridgeHint {
  journeyId: string;
  /** the boundary (s of the track) */
  boundarySec: number;
  /** the still on screen now (outgoing), if known */
  outgoing: string | null;
  /** the incoming phase's opening still */
  incoming: string | null;
  /** a travel morph is armed for this boundary */
  morph: boolean;
}

const hintListeners = new Set<(h: BridgeHint) => void>();
let lastHintKey = "";
let lastHint: BridgeHint | null = null;
/** Subscribe; the latest hint (if any) is delivered at once — the particle
 *  layer mounts a beat after the image layer's first tick of a journey. */
export function onBridgeHint(cb: (h: BridgeHint) => void): () => void {
  hintListeners.add(cb);
  if (lastHint) { try { cb(lastHint); } catch { /* never breaks imagery */ } }
  return () => { hintListeners.delete(cb); };
}
/** Publish (deduped — the image layer calls this every tick). */
export function publishBridgeHint(h: BridgeHint): void {
  const key = `${h.journeyId}|${h.boundarySec.toFixed(2)}|${h.outgoing}|${h.incoming}|${h.morph}`;
  if (key === lastHintKey) return;
  lastHintKey = key;
  lastHint = h;
  for (const cb of hintListeners) {
    try { cb(h); } catch { /* a listener never breaks imagery */ }
  }
}
/** test helper */
export function resetBridgeHints(): void { lastHintKey = ""; lastHint = null; hintListeners.clear(); }

/**
 * The next boundary after `progress` and the incoming phase's opening still,
 * from the pack's phase slices (the image layer's phase-entry still).
 * `slice(progress)` = packPhaseSliceForProgress bound to this list.
 */
export function nextBoundaryStill(
  phases: readonly { start?: number; end?: number }[] | null | undefined,
  urls: readonly string[],
  progress: number,
  duration: number,
  slice: (progress: number) => { start: number; end: number } | null,
): { phaseIdx: number; boundarySec: number; incoming: string | null } | null {
  if (!phases || !phases.length || !(duration > 0) || !(progress >= 0)) return null;
  for (let i = 1; i < phases.length; i++) {
    const st = phases[i].start;
    if (typeof st !== "number") return null;
    if (st > progress) {
      const sl = slice(Math.min(1, st + 1e-6));
      return { phaseIdx: i, boundarySec: st * duration, incoming: sl ? urls[sl.start] ?? null : null };
    }
  }
  return null;
}
