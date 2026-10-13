/**
 * Layering floor (Karel 2026-10-13: "in some cases it seems like it is a slide
 * show ... not dizzying it but some layering"). The scheduler is simulated on
 * synthetic journey timelines with the same decision functions the collage,
 * clone and depth layers use under `?layering=1`.
 */
import { describe, it, expect } from "vitest";
import {
  LAYERING, LEGACY, layeringEnabled, layeringAppliesTo, layeredCap, capOccupancy, dizzyGuard,
  idleMaxMs, pushGapOk, rescueMayWalk, stillMotion, cloneCap, parallaxCamTarget, parallaxLagSrc,
  simulateCollage, type SimOptions, type SimSecond,
} from "./layering-floor";
import { TAKE_STILL_SCRIPTS } from "./pinned-takes";
import { MASTERED_JOURNEYS } from "./mastered";

const THE_FIRST = "f0362f24-75f1-4717-8487-cc9cf12c7bcc";
const GRASSHOPPER = "fdc6470e-5c7e-43b4-968c-3e907f1fa88f";

/** Intensity arcs: quiet open → build → climax → quiet ending (the shape
 *  that put The First and Grasshopper at cap 1/2 for most of their laps). */
const ARCS: Record<string, (p: number) => number> = {
  arc: (p) => (p < 0.25 ? 0.3 : p < 0.5 ? 0.5 : p < 0.8 ? 0.75 : 0.35),
  quiet: () => 0.3,
  build: (p) => 0.25 + 0.65 * p,
};
const BASE: Omit<SimOptions, "layering" | "intensity"> = { durationSec: 200, phaseStarts: [0, 0.15, 0.3, 0.5, 0.75] };

/** Seconds the floor is owed: after the title settle + first still's fade,
 *  outside morph playback and the sparse interlude, before the 0.96 quiet zone. */
const owed = (s: SimSecond[], dur: number) => s.filter((x) => x.t >= 16 && x.t <= dur * 0.96 && !x.video && !x.sparse);
const longestRun = (s: SimSecond[], bad: (x: SimSecond) => boolean) => {
  let best = 0, cur = 0, prev = -2;
  for (const x of s) {
    if (bad(x)) { cur = x.t === prev + 1 ? cur + 1 : 1; prev = x.t; best = Math.max(best, cur); }
  }
  return best;
};

describe("layering flag", () => {
  it("defaults ON (shipped 2026-10-13) and is kept in sessionStorage", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(layeringEnabled("", store)).toBe(true);
    expect(layeringEnabled("?layering=1", store)).toBe(true);
    expect(layeringEnabled("", store)).toBe(true); // kept across the kiosk loop's navigations
    expect(layeringEnabled("?layering=0", store)).toBe(false);
    expect(layeringEnabled("", store)).toBe(false);
    expect(layeringEnabled("?layering=1", null)).toBe(true);
  });

  it("never applies to mastered journeys (Snowflake, Ghost) — by id or by name", () => {
    for (const id of MASTERED_JOURNEYS) expect(layeringAppliesTo({ id }, true)).toBe(false);
    expect(layeringAppliesTo({ id: "some-db-uuid", name: "Snowflake" }, true)).toBe(false);
    expect(layeringAppliesTo({ id: "some-db-uuid", name: "Ghost" }, true)).toBe(false);
    expect(layeringAppliesTo({ id: THE_FIRST, name: "The First (Expanded)" }, true)).toBe(true);
    expect(layeringAppliesTo({ id: GRASSHOPPER, name: "Grasshopper" }, true)).toBe(true);
    expect(layeringAppliesTo({ id: THE_FIRST }, false)).toBe(false); // flag off = legacy everywhere
    expect(layeringAppliesTo(null, true)).toBe(false);
  });
});

describe("decision functions", () => {
  it("cap floor 2, but whisper (0) and the sparse interlude (1) keep their laws", () => {
    expect(layeredCap(1, { sparse: false })).toBe(2);
    expect(layeredCap(3, { sparse: false })).toBe(3);
    expect(layeredCap(0, { sparse: false })).toBe(0);
    expect(layeredCap(1, { sparse: true })).toBe(1);
  });

  it("departing stills no longer hold cap slots (the cap=2 starvation)", () => {
    const leaving = { state: "fading-out" as const, opacity: 0.7, fadeStartTime: 0 };
    const staying = { state: "peak" as const, opacity: 1, fadeStartTime: 0 };
    expect(capOccupancy([leaving, staying], false)).toBe(2); // legacy: refused at cap 2
    expect(capOccupancy([leaving, staying], true)).toBe(1); // floor: room for the next still
  });

  it("anti-dizzy guard: one arrival at a time, at most 3 visible", () => {
    const s = (state: "fading-in" | "peak" | "fading-out", opacity: number) => ({ state, opacity, fadeStartTime: 0 });
    expect(dizzyGuard([s("peak", 1)])).toBe("ok");
    expect(dizzyGuard([s("peak", 1), s("fading-in", 0.4)])).toBe("arriving");
    expect(dizzyGuard([s("peak", 1), s("peak", 1), s("fading-out", 0.6)])).toBe("crowded");
    expect(dizzyGuard([s("peak", 1), s("peak", 1), s("fading-out", 0.1)])).toBe("ok"); // a whisper tail doesn't crowd
  });

  it("tunables behave as legacy when off", () => {
    expect(idleMaxMs(false)).toBe(LEGACY.IDLE_MAX_MS);
    expect(idleMaxMs(true)).toBe(LAYERING.IDLE_MAX_MS);
    expect(stillMotion(0, false)).toBe(0);
    expect(stillMotion(0, true)).toBe(LAYERING.MOTION_FLOOR);
    expect(stillMotion(1, true)).toBe(1);
    expect(cloneCap(0, false, false)).toBe(0);
    expect(cloneCap(0, true, false)).toBe(LAYERING.CLONE_FLOOR);
    expect(cloneCap(0, true, true)).toBe(0); // sparse interlude stays clone-free
    expect(parallaxCamTarget(0, false)).toBe(0);
    expect(parallaxCamTarget(0, true)).toBe(LAYERING.PARALLAX_CAM_FLOOR);
    expect(pushGapOk(3000, 0, true, false)).toBe(false);
    expect(pushGapOk(4000, 0, true, true)).toBe(true); // scripted timing wins (its tightest gap is 5 s)
    expect(pushGapOk(1600, 0, true, true)).toBe(false); // ...but a morph never bunches two arrivals
    expect(pushGapOk(3000, 0, false, false)).toBe(true);
    expect(rescueMayWalk(true, true)).toBe(false);
    expect(rescueMayWalk(false, true)).toBe(true);
  });

  it("parallax lag hands the depth base the previous still, never re-uploading the same one", () => {
    expect(parallaxLagSrc("a", null, null, false)).toBe("a");
    expect(parallaxLagSrc("b", "a", "a", false)).toBe("b");
    expect(parallaxLagSrc("a", null, null, true)).toBe("a"); // first still seeds the base
    expect(parallaxLagSrc("b", "a", "a", true)).toBe(null); // base already holds a
    expect(parallaxLagSrc("c", "b", "a", true)).toBe("b");
  });
});

describe("simulated journeys", () => {
  for (const [arcName, intensity] of Object.entries(ARCS)) {
    for (const seed of [1, 3, 11, 42]) {
      it(`floor holds — ${arcName} arc, seed ${seed}`, () => {
        const on = simulateCollage({ ...BASE, layering: true, intensity, seed });
        const off = simulateCollage({ ...BASE, layering: false, intensity, seed });
        const w = owed(on.seconds, BASE.durationSec);
        const wOff = owed(off.seconds, BASE.durationSec);
        const thin = (x: SimSecond) => x.imageLayers < LAYERING.FLOOR || x.movingLayers < LAYERING.FLOOR;
        // ≥ 2 image layers in motion: ≥ 95 % of owed seconds, never a gap > 2 s
        // (the only dips are the first second of a new still's fade-in)
        expect(w.filter(thin).length / w.length).toBeLessThanOrEqual(0.05);
        expect(longestRun(w, thin)).toBeLessThanOrEqual(2);
        // ...and clearly better than legacy, which had ≥ 5 s slideshow runs
        expect(w.filter(thin).length).toBeLessThan(wOff.filter(thin).length);
        // idle bound: no push-starved stretch past the new max (+ tick/rescue granularity)
        expect(on.maxIdleSec).toBeLessThanOrEqual(LAYERING.IDLE_MAX_MS / 1000 + 1.5);
      });

      it(`not dizzying — ${arcName} arc, seed ${seed}`, () => {
        const on = simulateCollage({ ...BASE, layering: true, intensity, seed });
        for (const x of on.seconds) {
          expect(x.arrivingNonCover).toBeLessThanOrEqual(LAYERING.MAX_ARRIVING);
          expect(x.arriving).toBeLessThanOrEqual(LAYERING.MAX_ARRIVING + 1); // + a morph cover, which must always land
          expect(x.collageVisible).toBeLessThanOrEqual(LAYERING.MAX_VISIBLE_STILLS + 1);
          expect(x.clones).toBeLessThanOrEqual(2);
        }
        const free = on.pushes.filter((p) => !p.cover);
        for (let i = 1; i < free.length; i++) expect(free[i].t - free[i - 1].t).toBeGreaterThanOrEqual(LAYERING.MIN_PUSH_GAP_MS / 1000 - 1e-6);
        // tempo: still cadence stays in the image-tempo law's world (~6-8/min), not a flicker
        const perMin = on.pushes.length / (BASE.durationSec / 60);
        expect(perMin).toBeLessThanOrEqual(60 / (LAYERING.MIN_PUSH_GAP_MS / 1000));
      });
    }
  }

  it("the sparse interlude keeps its one small still (law), no clones", () => {
    const on = simulateCollage({ ...BASE, layering: true, intensity: ARCS.arc, sparse: [0.55, 0.65], seed: 5 });
    expect(on.seconds.some((x) => x.sparse)).toBe(true);
    // the floor never spawns a clone inside the interlude
    expect(on.cloneSpawns.filter((t) => t >= 0.55 * 200 && t < 0.65 * 200)).toEqual([]);
  });
});

describe("pinned takes are untouched", () => {
  for (const id of [THE_FIRST, "87e106f9-4d74-4886-b944-fd625a827b02"]) {
    it(`${id.slice(0, 8)}: every scripted still plays, in order, and nothing off-script is pushed`, () => {
      const script = TAKE_STILL_SCRIPTS[id];
      expect(script).toBeTruthy();
      const durationSec = Math.ceil(script[script.length - 1][0] + 20);
      for (const seed of [1, 2, 3]) {
        const on = simulateCollage({ layering: true, durationSec, phaseStarts: [0, 0.17, 0.36, 0.47, 0.8], intensity: ARCS.arc, script, seed });
        const names = new Set(script.map(([, n]) => n));
        // no rescue walk / free push leaves the take (morph covers are the take's own rule)
        for (const p of on.pushes.filter((q) => !q.cover)) expect(names.has(p.name), `${p.name} @${p.t}`).toBe(true);
        // every scripted still is seen, in script order — unless its whole slot
        // fell inside a morph's quiet window (sacred; the next entry supersedes)
        const seen = on.pushes.filter((q) => names.has(q.name)).map((q) => q.name);
        const quiet = new Set(on.seconds.filter((x) => x.videoQuiet).map((x) => x.t));
        let k = 0;
        for (let e = 0; e < script.length; e++) {
          const [at0, n] = script[e];
          const at1 = e + 1 < script.length ? script[e + 1][0] : durationSec;
          const open = Array.from({ length: Math.max(0, Math.floor(at1 - at0)) }, (_, d) => Math.floor(at0) + d).filter((t) => !quiet.has(t)).length;
          if (open < 2) continue;
          const at = seen.indexOf(n, k);
          expect(at, `${n} missing`).toBeGreaterThanOrEqual(0);
          k = at; // repeats (gen-002 at 21 s and 99 s) may share a push
        }
        // a morph window never bunches two arrivals
        for (let i = 1; i < on.pushes.length; i++) if (!on.pushes[i].cover && !on.pushes[i - 1].cover) expect(on.pushes[i].t - on.pushes[i - 1].t).toBeGreaterThanOrEqual(LAYERING.SCRIPT_MIN_GAP_MS / 1000 - 1e-6);
        // the floor still holds on top of the take (companions: depth lag, clone, drift)
        const w = owed(on.seconds, durationSec);
        const thin = (x: SimSecond) => x.imageLayers < LAYERING.FLOOR;
        expect(w.filter(thin).length / w.length).toBeLessThanOrEqual(0.05);
      }
    });
  }

  it("no pinned take has a gap tighter than SCRIPT_MIN_GAP_MS", () => {
    for (const sc of Object.values(TAKE_STILL_SCRIPTS)) for (let i = 1; i < sc.length; i++) expect(sc[i][0] - sc[i - 1][0]).toBeGreaterThanOrEqual(LAYERING.SCRIPT_MIN_GAP_MS / 1000);
  });

  it("the pinned scripts themselves are not edited by this work", () => {
    expect(TAKE_STILL_SCRIPTS[THE_FIRST].map(([t, n]) => `${t}:${n}`).join(" ")).toBe(
      "11:gen-001.jpg 21:gen-002.jpg 30:gen-003.jpg 38:gen-004.jpg 47:gen-005.jpg 62:gen-010.jpg 74:gen-013.jpg 83:gen-014.jpg 99:gen-002.jpg",
    );
  });
});
