/**
 * LAYERING FLOOR (Karel 2026-10-13, watching the kiosk loop: "ensure journeys
 * have image layering. in some cases it seems like it is a slide show ... not
 * dizzying it but some layering to ensure it is engaging" — The First
 * (Expanded), Grasshopper, Yellow Bird).
 *
 * WHAT THE FLIGHT LOG SHOWED (sessions as52kx + iqnn0q, reconstructed per
 * second): the collage was a crossfade slideshow — one still at full opacity
 * almost every second, ~1.4-1.6 stills visible on average, the second one
 * nearly always the PREVIOUS still on its way out. The "n=3" in layer-push
 * counted departing and video layers. Five stacked causes:
 *
 *  1. Departing stills held cap slots. pushImage counted every still,
 *     fading-out ones too, against the conducted cap (1/2/3 by intensity). With
 *     cap 2, one still leaving over its 10 s fade plus one still within its
 *     6 s fade-in + 9 s peak hold = full, so the next still was refused until
 *     ~15 s after the last push. Logged as idle-rescue 11 s, then push-refused
 *     cap=2 (x2), then layer-evict at 14 s. Pushes were 13-16 s apart. The First
 *     iqnn0q 71.2/72.8 s refused, 74.4 s evict; Grasshopper 84.0/87.2 s. That
 *     run also dropped two pinned-take stills (gen-004 @38 s, gen-010 @62 s).
 *  2. Cap 1 below intensity 0.4 (openings and endings), plus the solo-hold
 *     gate that keeps a lone still alone for 18 s. Grasshopper 147-150 s and
 *     184-188 s show push-refused cap=1, and the endings of The First
 *     (110-118 s) and Grasshopper (185-201 s) were one still.
 *  3. Idle rescue only fired after 10 s, which became 11-14 s once the
 *     refusals above were added.
 *  4. Nothing else moved in quiet passages: clones are capped to 0 below
 *     intensity 0.45, stills below 0.6 get no Ken Burns (motion=0.00), and the
 *     depth-parallax camera holds still below 0.6.
 *  5. The depth-parallax base always shows the SAME picture as the newest
 *     collage still. It swaps 1.5 s after each push with a 2.6 s crossfade,
 *     which doubles the dominant image and reads like a cut.
 *
 * THE FLOOR (flag `?layering=1`, default OFF, kept in sessionStorage; never
 * on a mastered journey, see mastered.ts):
 *  - Cap slots count only stills that are not already leaving. The conducted
 *    cap gets a floor of 2. The sparse interlude (law: one small still) and
 *    kinetic-whisper journeys (0) keep their own caps.
 *  - Anti-dizzy guard: at most one unscripted still fading in at once, and at
 *    most 3 collage stills visible. Unscripted pushes stay >= 6 s apart.
 *  - Idle rescue fires at 8 s instead of 10 s. Rescue walks never leave a
 *    scripted take: pinned images and timings play exactly as recorded, and
 *    layering builds on top of them. A take still that comes due fires the
 *    gen tick at once and lands like a morph cover (no cap refusal). In
 *    iqnn0q the legacy path lost The First's gen-004 and gen-010 to those
 *    refusals.
 *  - Gentle motion floor: stills drift at >= 0.2, clones never drop below 1,
 *    and the depth camera drifts at >= 0.25.
 *  - Parallax lag: the depth base takes the PREVIOUS shown still with a 6.5 s
 *    mix. The image leaving the collage settles into the depth plane, drifting
 *    dimly under the new one. That makes a distinct second image layer without
 *    any extra decode (the base loads one texture per push either way).
 *  - The 11 s / 10 s image-tempo law, the boundary freeze protocol, the morph
 *    quiet windows and the no-live-imagery valve are all unchanged.
 */
import { isMasteredJourneyLike } from "./mastered";

export const LAYERING_DEFAULT = true; // shipped 2026-10-13 (Karel: "ensure journeys have image layering"; A/B filmed, flicker gate PASS)
const LAYERING_SESSION_KEY = "resonance.layering";

/** Tunables (A/B on the kiosk; see the module doc for why each exists). */
export const LAYERING = {
  /** Minimum conducted collage cap outside the sparse interlude. */
  FLOOR: 2,
  /** Ceiling of VISIBLE collage stills (departing included) an unscripted push may join. */
  MAX_VISIBLE_STILLS: 3,
  /** A still counts as visible above this opacity (a 10 s tail below it is a whisper). */
  VISIBLE_OPACITY: 0.25,
  /** Stills allowed to be fading in at the same moment (unscripted, non-cover). */
  MAX_ARRIVING: 1,
  /** Idle rescue threshold (legacy 10 s). */
  IDLE_MAX_MS: 8_000,
  /** Unscripted still pushes never closer than this. */
  MIN_PUSH_GAP_MS: 6_000,
  /** Pinned-take stills keep their own timing, but a morph window can bunch two
   *  due stills together — they still land at least this far apart (the
   *  tightest gap in any pinned take is 5 s, so a recorded gap is never altered). */
  SCRIPT_MIN_GAP_MS: 4_000,
  /** Ken Burns floor for stills (legacy 0 below intensity 0.6). */
  MOTION_FLOOR: 0.2,
  /** Clone floor (legacy 0 below intensity 0.45). */
  CLONE_FLOOR: 1,
  /** Depth-parallax camera amplitude floor (legacy 0 below intensity 0.6). */
  PARALLAX_CAM_FLOOR: 0.25,
  /** Depth-parallax crossfade under the lag (legacy 2.6 s). */
  PARALLAX_MIX_MS: 6_500,
} as const;

/** Legacy constants the scheduler mirrors (ai-image-layer.tsx). */
export const LEGACY = {
  IDLE_MAX_MS: 10_000,
  FADE_IN_MS: 6_000,
  FADE_OUT_MS: 10_000,
  MIN_PEAK_MS: 9_000,
  STILL_AGE_MAX_MS: 11_000,
} as const;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `?layering=1` / `=0` (kept in sessionStorage across the kiosk loop), else default OFF. */
export function layeringEnabled(search?: string, store?: Store | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("layering");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(LAYERING_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(LAYERING_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return LAYERING_DEFAULT;
}

let cachedOn: boolean | null = null;
/** Browser convenience — read once per page load, never throws. */
export function layeringOn(): boolean {
  if (cachedOn === null) {
    try {
      cachedOn = layeringEnabled(undefined, typeof window !== "undefined" ? window.sessionStorage : null);
    } catch { cachedOn = false; }
  }
  return cachedOn;
}

/** The floor applies to a journey only when the flag is on and it isn't mastered. */
export function layeringAppliesTo(journey: { id?: string | null; name?: string | null } | null | undefined, on: boolean): boolean {
  if (!on || !journey) return false;
  return !isMasteredJourneyLike(journey);
}

/** Conducted collage cap with the floor. 0 (kinetic whisper) and the sparse
 *  interlude's 1 are laws of their own and pass through untouched. */
export function layeredCap(baseCap: number, ctx: { sparse: boolean }): number {
  if (baseCap <= 0 || ctx.sparse) return baseCap;
  return Math.max(LAYERING.FLOOR, baseCap);
}

export interface CollageStill {
  state: "fading-in" | "peak" | "fading-out";
  opacity: number;
  fadeStartTime: number;
}

/** Stills that occupy cap slots. Legacy counts departing stills too (the
 *  starvation); the floor counts only stills that are staying. */
export function capOccupancy(stills: readonly CollageStill[], layering: boolean): number {
  return layering ? stills.filter((s) => s.state !== "fading-out").length : stills.length;
}

/** Anti-dizzy admission guard for an unscripted, non-cover still. */
export function dizzyGuard(stills: readonly CollageStill[]): "ok" | "arriving" | "crowded" {
  if (stills.filter((s) => s.state === "fading-in").length >= LAYERING.MAX_ARRIVING) return "arriving";
  if (stills.filter((s) => s.opacity > LAYERING.VISIBLE_OPACITY).length >= LAYERING.MAX_VISIBLE_STILLS) return "crowded";
  return "ok";
}

export function idleMaxMs(layering: boolean): number {
  return layering ? LAYERING.IDLE_MAX_MS : LEGACY.IDLE_MAX_MS;
}

/** Unscripted pushes keep a minimum spacing under the floor. */
export function pushGapOk(nowMs: number, lastPushMs: number, layering: boolean, scripted: boolean): boolean {
  if (!layering) return true;
  return nowMs - lastPushMs >= (scripted ? LAYERING.SCRIPT_MIN_GAP_MS : LAYERING.MIN_PUSH_GAP_MS);
}

/** May the idle rescue walk off the current slot? Never off a scripted take under the floor. */
export function rescueMayWalk(layering: boolean, scripted: boolean): boolean {
  return !(layering && scripted);
}

/**
 * A pinned take's still is due NOW (it hasn't been shown yet): under the floor
 * the gen tick fires for it instead of waiting out the 9-12 s tick interval,
 * and it passes the soft gates like a phase entry (video and the boundary
 * settle stay sacred). Retries are rate-limited like the idle rescue so a
 * refused still is never re-decoded every 400 ms.
 */
export function scriptedStillDue(layering: boolean, scripted: string | null, lastScriptedShown: string | null, nowMs: number, lastGenMs: number): boolean {
  return layering && !!scripted && scripted !== lastScriptedShown && nowMs - lastGenMs > 1_500;
}

/** Pinned-take stills land like morph covers under the floor: no cap refusal
 *  (the departing still eases out on the 11 s age rule), no dizzy guard. */
export function bypassesCap(layering: boolean, scripted: boolean, cover: boolean): boolean {
  return cover || (layering && scripted);
}

export function stillMotion(base: number, layering: boolean): number {
  return layering ? Math.max(LAYERING.MOTION_FLOOR, base) : base;
}

export function cloneCap(base: number, layering: boolean, sparse: boolean): number {
  if (!layering || sparse) return base;
  return Math.max(LAYERING.CLONE_FLOOR, base);
}

export function parallaxCamTarget(base: number, layering: boolean): number {
  return layering ? Math.max(LAYERING.PARALLAX_CAM_FLOOR, base) : base;
}

/**
 * Parallax lag: which still the depth base should take for a push that just
 * showed `shown`. Under the floor it is the previously shown still of this
 * journey (the first push of a journey seeds the base with itself). Returns
 * null when the base already holds that picture (no texture upload).
 */
export function parallaxLagSrc(shown: string, prevShown: string | null, lastSent: string | null, layering: boolean): string | null {
  const want = layering ? (prevShown ?? shown) : shown;
  if (layering && want === lastSent) return null;
  return want;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure simulator: the collage scheduler + its companions on a synthetic
// timeline. It composes the SAME decision functions the components use; the
// fade/age/eviction mechanics mirror ai-image-layer.tsx. Used by the tests
// (layering-floor.test.ts) and for offline what-ifs, never at runtime.
// ────────────────────────────────────────────────────────────────────────────

export interface SimOptions {
  layering: boolean;
  durationSec: number;
  /** Phase starts (0-1). A travel morph plays at each start after the first. */
  phaseStarts: number[];
  /** Intensity at progress p (0-1). */
  intensity: (p: number) => number;
  /** Pinned still script [sec, name] (pinned-takes TAKE_STILL_SCRIPTS). */
  script?: readonly (readonly [number, string])[];
  /** Pack slot cadence: the phase-mapped slot changes every slotSec. */
  slotSec?: number;
  /** Sparse interlude window (progress). */
  sparse?: [number, number];
  /** Depth parallax available (every pack journey has depth since 2026-09-26). */
  parallax?: boolean;
  /** Fraction of ticks blocked by the soft gates (recent shader switch, stillness). */
  gateBlockRate?: number;
  seed?: number;
  morphSec?: number;
}

export interface SimSecond {
  t: number;
  /** Collage stills at opacity > 0.25. */
  collageVisible: number;
  /** ...of which drift (motion > 0). */
  collageMoving: number;
  /** Stills currently fading in (non-cover / cover). */
  arriving: number;
  arrivingNonCover: number;
  /** Collage stills at opacity > 0.05. */
  collageAny: number;
  clones: number;
  /** Depth base shows a picture distinct from every visible collage still. */
  parallaxDistinct: boolean;
  parallaxMoving: boolean;
  /** Distinct image layers on screen / how many of them move. */
  imageLayers: number;
  movingLayers: number;
  /** A morph is playing. */
  video: boolean;
  /** The morph's whole quiet window (playback + end dwell): stills wait. */
  videoQuiet: boolean;
  settle: boolean;
  sparse: boolean;
}

export interface SimPush { t: number; name: string; cover: boolean; scripted: boolean }

export interface SimResult {
  seconds: SimSecond[];
  pushes: SimPush[];
  refusals: number;
  refusalReasons: Record<string, number>;
  /** Longest stretch with no push while the frame had room for one (title
   *  settle, morph windows and a frame already at MAX_VISIBLE_STILLS excluded). */
  maxIdleSec: number;
  maxIdleAt: number;
  cloneSpawns: number[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

interface SimStill extends CollageStill { name: string; born: number; peakAt: number; motion: number; cover: boolean; scripted: boolean; fadeFrom: number }

const SETTLE_SEC = 10.5;

export function simulateCollage(o: SimOptions): SimResult {
  const r = rng(o.seed ?? 7);
  const dt = 0.1;
  const morphSec = o.morphSec ?? 5;
  const slotSec = o.slotSec ?? 12;
  const blockRate = o.gateBlockRate ?? 0.2;
  const parallaxOn = o.parallax ?? true;
  const L = o.layering;
  const stills: SimStill[] = [];
  const pushes: SimPush[] = [];
  const clones: { born: number; life: number }[] = [];
  let refusals = 0;
  const reasons: Record<string, number> = {};
  let lastGen = -1e9;
  let nextInterval = 0;
  let lastPush = 0; // journey change at t = 0 seeds the idle floor
  let lastIdx = "";
  let lastUrl = "";
  let maxIdle = 0;
  let lastFull = 0;
  let maxIdleAt = 0;
  let lastScriptShown: string | null = null;
  const cloneSpawns: number[] = [];
  let prevShown: string | null = null;
  let lastSent: string | null = null;
  const parallaxEvents: { at: number; src: string }[] = [];
  let pxCur: string | null = null; // picture the base shows (after its mix)
  let pxMixUntil = -1;
  let pxPending: string | null = null;
  let lastAgeCheck = 0;
  let lastRespawn = 0;
  let lastCloneSrc: string | null = null;
  const morphs = o.phaseStarts.slice(1).map((p) => p * o.durationSec).filter((s) => s / o.durationSec <= 0.9);
  const coverDue = new Set<number>();
  const seconds: SimSecond[] = [];
  let nextSample = 0;

  const prog = (t: number) => t / o.durationSec;
  const inSparse = (t: number) => !!o.sparse && prog(t) >= o.sparse[0] && prog(t) < o.sparse[1];
  const videoAt = (t: number) => morphs.some((m) => t >= m && t < m + morphSec + 5.2);
  const morphPlaying = (t: number) => morphs.some((m) => t >= m && t < m + morphSec);
  const settleAt = (t: number) => t < SETTLE_SEC;
  const baseCap = (t: number) => {
    if (inSparse(t)) return 1;
    const i = o.intensity(prog(t));
    const cap = i < 0.4 ? 1 : i < 0.65 ? 2 : 3;
    const p = prog(t);
    if (p > 0.72 && p < 0.88) return Math.max(2, cap);
    return cap;
  };
  const cap = (t: number) => (L ? layeredCap(baseCap(t), { sparse: inSparse(t) }) : baseCap(t));
  const scriptAt = (t: number): string | null => {
    if (!o.script) return null;
    let hit: string | null = null;
    for (const [at, name] of o.script) if (t + 0.5 >= at) hit = name;
    return hit;
  };

  const tryPush = (t: number, name: string, cover: boolean, scripted: boolean, idleSec: number): boolean => {
    for (let i = stills.length - 1; i >= 0; i--) if (stills[i].opacity <= 0 && stills[i].state === "fading-out") stills.splice(i, 1);
    if (L && !cover && !scripted) {
      const g = dizzyGuard(stills);
      if (g !== "ok") { reasons[g] = (reasons[g] ?? 0) + 1; return false; }
    }
    if (!bypassesCap(L, scripted, cover) && capOccupancy(stills, L) >= cap(t)) {
      const ev = stills.find((s) => s.state !== "fading-out" && ((s.state === "fading-in" && t - s.fadeStartTime >= 2.5) || (s.state === "peak" && t - s.peakAt >= LEGACY.MIN_PEAK_MS / 1000)));
      const victim = ev ?? (idleSec > 18 ? stills.find((s) => s.state !== "fading-out" && s.opacity > 0) : undefined);
      if (!victim) { reasons.cap = (reasons.cap ?? 0) + 1; return false; }
      victim.fadeFrom = victim.opacity; victim.state = "fading-out"; victim.fadeStartTime = t;
    }
    const i = o.intensity(prog(t));
    const base = i < 0.6 ? 0 : i < 0.85 ? 0.35 : prog(t) > 0.45 ? 1 : 0.35;
    const motion = stillMotion(cover ? Math.max(0.35, base) : base, L);
    stills.push({ name, born: t, peakAt: 0, motion, cover, scripted, state: "fading-in", opacity: 0, fadeStartTime: t, fadeFrom: 0 });
    pushes.push({ t, name, cover, scripted });
    lastPush = t;
    // clone of the arriving image (ai-overlay-elements)
    spawnClone(t);
    lastCloneSrc = name;
    // depth base 1.5 s behind the collage
    const send = parallaxLagSrc(name, prevShown, lastSent, L);
    prevShown = name;
    if (send) { lastSent = send; parallaxEvents.push({ at: t + 1.5, src: send }); }
    return true;
  };
  const cloneCapAt = (t: number) => {
    if (settleAt(t)) return 0;
    const i = o.intensity(prog(t));
    const base = inSparse(t) ? 0 : i < 0.45 ? 0 : i < 0.7 ? 1 : 2;
    return cloneCap(base, L, inSparse(t));
  };
  const spawnClone = (t: number) => {
    const alive = clones.filter((c) => t < c.born + c.life).length;
    if (alive >= cloneCapAt(t)) return;
    clones.push({ born: t, life: 16 + r() * 8 });
    cloneSpawns.push(t);
  };

  for (let t = 0; t <= o.durationSec + 1e-9; t += dt) {
    // opacity mechanics (render loop)
    for (const s of stills) {
      if (s.state === "fading-in") {
        const raw = Math.min(1, (t - s.fadeStartTime) / ((s.cover ? 1.2 : settleAt(s.born) ? 8 : LEGACY.FADE_IN_MS / 1000)));
        s.opacity = ease(raw);
        if (raw >= 1) { s.state = "peak"; s.peakAt = t; s.opacity = 1; }
      } else if (s.state === "fading-out") {
        const raw = Math.min(1, (t - s.fadeStartTime) / (LEGACY.FADE_OUT_MS / 1000));
        s.opacity = s.fadeFrom * (1 - ease(raw));
      }
    }
    for (let i = stills.length - 1; i >= 0; i--) if (stills[i].state === "fading-out" && stills[i].opacity <= 0) stills.splice(i, 1);

    // still-age-fade (every 2 s; not during settle or video)
    if (t - lastAgeCheck >= 2) {
      lastAgeCheck = t;
      if (!settleAt(t) && !videoAt(t)) {
        const live = stills.filter((s) => s.state !== "fading-out");
        if (live.length >= 2) for (const s of live) if (t - s.born > LEGACY.STILL_AGE_MAX_MS / 1000) { s.fadeFrom = s.opacity; s.state = "fading-out"; s.fadeStartTime = t; }
      }
    }

    // morph end → cover still bypasses the gates
    for (const m of morphs) {
      if (!coverDue.has(m) && t >= m + morphSec) {
        coverDue.add(m);
        let idx = scriptAt(t) ?? `slot-${Math.floor(t / slotSec)}`;
        if (idx === lastUrl || stills.some((s) => s.name === idx && s.state !== "fading-out")) idx = `${idx}-cover`;
        lastIdx = idx; lastUrl = idx;
        tryPush(t, idx, true, false, t - lastPush);
      }
    }

    // gen tick (400 ms) — ai-image-layer triggerGeneration
    if (Math.round(t * 10) % 4 === 0) {
      const idle = t - Math.max(lastPush, 0);
      // idle as the viewer feels it: video windows and the title settle are sacred
      const lastVideoEnd = Math.max(0, ...morphs.map((m) => m + morphSec + 5.2).filter((e) => e <= t));
      // a frame already holding MAX_VISIBLE_STILLS isn't idle — it's full
      if (stills.filter((s) => s.opacity > LAYERING.VISIBLE_OPACITY).length >= LAYERING.MAX_VISIBLE_STILLS) lastFull = t;
      if (!settleAt(t) && !videoAt(t) && prog(t) <= 0.96) {
        const gap = t - Math.max(lastPush, SETTLE_SEC, lastVideoEnd, lastFull);
        if (gap > maxIdle) { maxIdle = gap; maxIdleAt = t; }
      }
      const rescueDue = idle * 1000 > idleMaxMs(L) + 500 && t - lastGen > 1.5;
      const scriptDue = scriptedStillDue(L, scriptAt(t), lastScriptShown, t * 1000, lastGen * 1000);
      if (t - lastGen >= nextInterval || rescueDue || scriptDue) {
        lastGen = t;
        const i = o.intensity(prog(t));
        nextInterval = (6.5 + r()) * (i < 0.5 ? 1.6 : 1.35);
        if (t >= 1.5 && prog(t) <= 0.96) {
          const settle = settleAt(t);
          const video = videoAt(t);
          const solo = cap(t) === 1 && stills.some((s) => s.opacity > 0.3 && t - s.born < 18);
          const blocked = video || solo || r() < blockRate;
          const sc = scriptAt(t);
          let idx = sc ?? `slot-${Math.floor(t / slotSec)}`;
          const idleRescue = idle * 1000 > idleMaxMs(L) && !video && !settle;
          if (idleRescue && idx === lastIdx && rescueMayWalk(L, !!sc)) idx = `${idx}+${Math.round(t)}`;
          const scriptEntry = scriptDue && !video;
          const canPush = (!blocked || idleRescue || scriptEntry) && !settle;
          if (canPush && idx !== lastIdx && pushGapOk(t * 1000, lastPush * 1000, L, !!sc)) {
            lastIdx = idx;
            const onScreen = stills.some((s) => s.name === idx && s.state !== "fading-out");
            if (idx !== lastUrl && !onScreen) {
              lastUrl = idx;
              if (!tryPush(t, idx, false, !!sc, idle)) { refusals++; lastIdx = ""; lastUrl = ""; }
              else if (sc && idx === sc) lastScriptShown = sc;
            }
          }
        }
      }
      // clone respawn timer (3.5 s, from the last image)
      if (t - lastRespawn >= 3.5) { lastRespawn = t; if (lastCloneSrc) spawnClone(t); }
    }

    // depth base: queued mixes, latest wins, never cut mid-mix; holds in settle
    if (parallaxOn) {
      while (parallaxEvents.length && parallaxEvents[0].at <= t) pxPending = parallaxEvents.shift()!.src;
      if (pxPending && !settleAt(t) && t >= pxMixUntil) {
        pxCur = pxPending; pxPending = null;
        pxMixUntil = t + (L ? LAYERING.PARALLAX_MIX_MS : 2600) / 1000;
      }
    }

    if (t >= nextSample - 1e-9) {
      nextSample += 1;
      const vis = stills.filter((s) => s.opacity > 0.25);
      const cl = clones.filter((c) => {
        const f = (t - c.born) / c.life;
        return f >= 0.15 && f <= 0.85;
      }).length;
      const pxDistinct = parallaxOn && !!pxCur && !vis.some((s) => s.name === pxCur);
      const pxMoving = parallaxOn && !!pxCur && parallaxCamTarget(o.intensity(prog(t)) < 0.6 ? 0 : 0.35, L) > 0;
      const collageMoving = vis.filter((s) => s.motion > 0).length;
      seconds.push({
        t: Math.round(t),
        collageVisible: vis.length,
        collageMoving,
        arriving: stills.filter((s) => s.state === "fading-in").length,
        arrivingNonCover: stills.filter((s) => s.state === "fading-in" && !s.cover && !s.scripted).length,
        collageAny: stills.filter((s) => s.opacity > 0.05).length,
        clones: cl,
        parallaxDistinct: pxDistinct,
        parallaxMoving: pxMoving,
        imageLayers: vis.length + cl + (pxDistinct ? 1 : 0),
        movingLayers: collageMoving + cl + (pxDistinct && pxMoving ? 1 : 0),
        video: morphPlaying(t),
        videoQuiet: videoAt(t),
        settle: settleAt(t),
        sparse: inSparse(t),
      });
    }
  }
  return { seconds, pushes, refusals, refusalReasons: reasons, maxIdleSec: maxIdle, maxIdleAt, cloneSpawns };
}

// ────────────────────────────────────────────────────────────────────────────
// GHOST OPENING LIFT (Karel 2026-10-15, watching Ghost on the kiosk: "opening
// first 1/3 of ghost needs a little imaging. it was a bit of a slide show.
// ensure a bit of layering. dont over do it though").
//
// Ghost is mastered, so the floor above never reaches it. Kiosk session
// 2hmi02 (Ghost 0-75 s): 8 of 10 still pushes at motion=0.00, a 17 s
// single-image stretch (8.8 s push, then push-refused cap=2 at 19.6/21.2 s:
// the departing still held a cap slot), and only 3 clones in the opening vs
// 10 after it. The lift applies four of the floor's knobs to Ghost's first
// third ONLY: departing stills free their cap slot, the anti-dizzy guard
// (one arriving, <= 3 visible), a gentle 0.2 drift floor on stills, and one
// soft clone. Ghost's stills, take, shaders, particles, arc, idle/push timing
// and depth parallax are untouched; nothing changes after the first third.
// ────────────────────────────────────────────────────────────────────────────

/** Fraction of Ghost's track the lift covers. */
export const GHOST_OPENING_LIFT_END = 1 / 3;

export function ghostOpeningLift(journeyId: string | null | undefined, currentTime: number, duration: number): boolean {
  return journeyId === "ghost" && duration > 0 && currentTime >= 0 && currentTime / duration < GHOST_OPENING_LIFT_END;
}
