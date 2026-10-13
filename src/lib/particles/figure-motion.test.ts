/**
 * FIGURE MOTION — the laws (figure-motion.ts, Karel 2026-10-13: "be careful of
 * the starburst particle shape just sitting there … it doesnt move … and was
 * on screen a long time"): every figure has a motion floor, figures feel the
 * field a little as one body, and no figure soul holds the screen > the cap.
 */
import { describe, it, expect } from "vitest";
import {
  FIGURE_LAWS, FIGURE_SOULS, FIGURE_MOTION, isFigureSoul, figureMotionFloor, figureMotionGlsl,
  figureRigidTarget, glideRigid, rigidMatrix, REST_RIGID, type FigureRigidInput,
} from "./figure-motion";
import {
  conductPhrases, createPhraseCursor, figureHoldDue, figureZones, figureDeadline, formHoldDue, takePhraseEvent,
  PHRASE_LAWS, PHRASE_LOCKED_JOURNEYS, type PhraseTimeline,
} from "./phrase-conductor";
import { SOUL_IDS, SHAPE_SOULS, type SoulId } from "./souls";
import { SIM_FS, DRAW_VS, DRAW_FS, COMP_FS, buildSimFS } from "./shaders";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";
import { PARTICLE_LEADS } from "@/lib/journeys/particle-lead";
import { replayLoop, loopOrder } from "@/lib/journeys/loop-replay";

const CAP = FIGURE_LAWS.MAX_HOLD_SEC;

describe("figure souls", () => {
  it("the geometric figures are figures; the free souls are not", () => {
    for (const id of ["starburst", "girih", "medallion", "mandala", "rings", "rose", "kaleido", "blossom", "harmonics", "lissajous", "torus", "vortex"] as SoulId[]) expect(isFigureSoul(id), id).toBe(true);
    for (const id of ["fireflies", "motes", "nebula", "aurora", "smoke", "pollen", "embers", "ink", "attractor", "smokering", "murmuration", "flame", "wisp", "petalfall", "spirit"] as SoulId[]) expect(isFigureSoul(id), id).toBe(false);
    expect(isFigureSoul("")).toBe(false);
  });
  it("every figure cast in the journeys is covered", () => {
    const castFigures = SHAPE_SOULS.filter((s) => isFigureSoul(s));
    expect(castFigures.length).toBeGreaterThanOrEqual(12);
  });
});

describe("1. the motion floor", () => {
  it("every figure turns AND rocks; free souls are untouched", () => {
    for (const id of SOUL_IDS) {
      const m = FIGURE_MOTION[id];
      if (FIGURE_SOULS.has(id)) {
        expect(Math.abs(m.spin), id).toBeGreaterThanOrEqual(FIGURE_LAWS.SPIN_FLOOR);
        expect(m.sway, id).toBeGreaterThanOrEqual(FIGURE_LAWS.SWAY_FLOOR);
        expect(figureMotionFloor(id), id).toBeGreaterThan(FIGURE_LAWS.SPIN_FLOOR);
        // slow: a steady drift, never a spin (≤ ~5°/s) and a rock ≥ 30 s
        expect(Math.abs(m.spin), id).toBeLessThanOrEqual(0.09);
        expect(m.sway, id).toBeLessThanOrEqual(0.12);
        expect(m.period, id).toBeGreaterThanOrEqual(30);
      } else {
        expect(m.spin, id).toBe(0);
        expect(m.sway, id).toBe(0);
      }
    }
  });
  it("the starburst — the one that sat still — is above the floor", () => {
    expect(figureMotionFloor("starburst")).toBeGreaterThan(figureMotionFloor("girih"));
  });
  it("the shader carries the same table, indexed by soul", () => {
    const glsl = figureMotionGlsl();
    expect(SIM_FS).toContain(glsl);
    const spins = glsl.match(/FIG_SPIN\[\d+\] = float\[\d+\]\(([^)]*)\)/)![1].split(",").map(Number);
    expect(spins.length).toBe(SOUL_IDS.length);
    SOUL_IDS.forEach((id, i) => expect(spins[i], id).toBeCloseTo(FIGURE_MOTION[id].spin, 9));
  });
  it("is a moving FRAME around the force law — steady clock, no light, no position / velocity set", () => {
    const fStart = SIM_FS.indexOf("mat3 figureFrame(int soul)");
    const frame = SIM_FS.slice(fStart, SIM_FS.indexOf("vec4 soulForce(", fStart));
    const lStart = SIM_FS.indexOf("int sk = k == 0 ? uSoulA : uSoulB;");
    const loop = SIM_FS.slice(lStart, SIM_FS.indexOf("f.xyz *= I.w;", lStart));
    expect(fStart).toBeGreaterThan(0);
    expect(lStart).toBeGreaterThan(0);
    for (const block of [frame, loop]) {
      expect(block).not.toMatch(/uClock|uBands|uBandLv|uSwell|drv\s*[*+]|lvl\s*[*+]/); // never the beat
      expect(block).not.toMatch(/uAlpha|uGain|uDensity|uHue|uSat|uExposure|oPos|oVel|gl_PointSize/); // never light / size
      expect(block).not.toMatch(/(^|[^.\w])[pv]\s*[+\-*]?=(?!=)/m);
    }
    expect(frame).toContain("uTime");
    // still ONE inlined soulForce call (the kiosk compile-stall law)
    expect(SIM_FS.match(/soulForce\(/g)!.length).toBe(2); // the definition + one call
    expect(loop).toContain("mat3 FM = fg ? figureFrame(sk) : mat3(1.0);"); // free souls: identity
    for (const src of [DRAW_VS, DRAW_FS, COMP_FS]) { expect(src).not.toContain("uFig"); expect(src).not.toContain("FIG_SPIN"); }
  });
  it("the starburst's own rays counter-turn on the steady clock and breathe as groups (no per-mote random phase)", () => {
    const sb = SIM_FS.slice(SIM_FS.indexOf("if (soul == 44) {"), SIM_FS.indexOf("if (soul == 45) {"));
    expect(sb).toMatch(/rotY\(uTime \* sDir/);
    expect(sb).toMatch(/sin\(uTime \* 0\.21 \+ g \* 0\.83\)/);
    expect(sb).not.toContain("hash11(s.a * 5.0)");
    expect(sb).not.toMatch(/uAlpha|uGain|uHue|gl_PointSize/);
  });
  it("is in every per-variant program (figures and free souls alike compile)", () => {
    for (const ids of [[44], [40, 12], [0, 1], [27, 32]]) {
      const src = buildSimFS(ids, { score: false, hands: false });
      expect(src).toContain("mat3 figureFrame(int soul)");
      expect(src).toContain("uniform mat3 uFigRot;");
    }
  });
});

describe("2. figures feel the field a little, as one body", () => {
  const rest: FigureRigidInput = { curAmount: 0, curTension: 0, curClock: 0, brAmount: 0, breath: 0, handsLow: 0, handsHigh: 0, gravGain: 0, gravX: 0, gravY: 0 };
  it("features off (Snowflake, Ghost) = rest", () => {
    expect(figureRigidTarget(rest)).toEqual(REST_RIGID);
    for (const T of [0, 13.7, 999]) expect(figureRigidTarget({ ...rest, curClock: T })).toEqual(REST_RIGID);
  });
  it("feels every feature — bounded, small (FEEL of the effect)", () => {
    const full = figureRigidTarget({ curAmount: 1, curTension: 1, curClock: 40, brAmount: 1, breath: 1, handsLow: 1, handsHigh: 0, gravGain: 1, gravX: 0.8, gravY: -0.5 });
    expect(Math.hypot(full.right, full.up)).toBeGreaterThan(0.01);
    expect(full.scale).toBeGreaterThan(1.01);
    expect(Math.abs(full.tilt)).toBeGreaterThan(0.02);
    expect(full.turnRate).toBeGreaterThan(0.005);
    let seed = 3;
    const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 5000; i++) {
      const o = figureRigidTarget({ curAmount: r() * 3 - 1, curTension: r() * 3 - 1, curClock: r() * 1e5, brAmount: r() * 3, breath: r() * 4 - 2, handsLow: r() * 5, handsHigh: r() * 5, gravGain: r() * 3, gravX: r() * 9 - 4.5, gravY: r() * 9 - 4.5 });
      expect(Math.hypot(o.right, o.up)).toBeLessThanOrEqual(FIGURE_LAWS.MAX_OFFSET + 1e-9);
      expect(Math.abs(o.depth)).toBeLessThanOrEqual(FIGURE_LAWS.MAX_OFFSET + 1e-9);
      expect(Math.abs(o.scale - 1)).toBeLessThanOrEqual(FIGURE_LAWS.MAX_SCALE_DEV + 1e-9);
      expect(Math.abs(o.tilt)).toBeLessThanOrEqual(FIGURE_LAWS.MAX_TILT + 1e-9);
      expect(o.turnRate).toBeGreaterThanOrEqual(0);
      expect(o.turnRate).toBeLessThanOrEqual(FIGURE_LAWS.MAX_TURN + 1e-9);
    }
    // NaN never reaches the GPU
    const nan = figureRigidTarget({ ...rest, curAmount: NaN, curClock: NaN, breath: NaN, gravX: NaN });
    for (const v of Object.values(nan)) expect(Number.isFinite(v)).toBe(true);
  });
  it("the wander is SLOW (the currents' steady clock — no beat): offset moves < 0.3 %/s of the half-height", () => {
    const at = (T: number) => figureRigidTarget({ ...rest, curAmount: 1, curClock: T });
    for (let T = 0; T < 600; T += 0.5) {
      const a = at(T), b = at(T + 1);
      expect(Math.hypot(b.right - a.right, b.up - a.up)).toBeLessThan(0.003);
    }
  });
  it("glides (no step) and the matrix is a rotation in the shader's rotY convention", () => {
    const tgt = figureRigidTarget({ ...rest, curAmount: 1, curTension: 1, curClock: 9, brAmount: 1, breath: -1, handsLow: 1 });
    const g1 = glideRigid({ ...REST_RIGID }, tgt, 1 / 60);
    expect(Math.abs(g1.scale - 1)).toBeLessThan(Math.abs(tgt.scale - 1) * 0.02);
    const m = rigidMatrix([0.6, 0, 0.8], 0.07, 1.1);
    const col = (c: number) => [m[c * 3], m[c * 3 + 1], m[c * 3 + 2]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const d = col(a).reduce((s, x, k) => s + x * col(b)[k], 0);
      expect(d).toBeCloseTo(a === b ? 1 : 0, 6);
    }
    // tilt 0: pure turn about +y — GLSL rotY(a) = mat3(c, 0, -s, 0, 1, 0, s, 0, c)
    const y = rigidMatrix([1, 0, 0], 0, 0.4);
    expect([...y].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([Math.cos(0.4), 0, -Math.sin(0.4), 0, 1, 0, Math.sin(0.4), 0, Math.cos(0.4)].map((x) => Math.round(x * 1e6) / 1e6));
  });
});

describe("3. max on-screen time for a figure", () => {
  const optsFor = (id: string) => ({ journeyId: id, formChanges: PARTICLE_LEADS[id].windows.map((w) => w.start) });
  const ids = Object.keys(PARTICLE_PROFILES).filter((id) => PARTICLE_LEADS[id] && !PARTICLE_LEADS[id].mastered);

  /** The layer's form gate, figure always on screen, worst cases taken: a travel
   *  morph keeps the same soul, the busy zone (±4 s) and the image lead-in
   *  (15 s, overdue 8 s) refuse changes, a refigure keeps the look. Returns the
   *  longest any one figure soul stays visible. */
  function longestFigure(id: string, tl: PhraseTimeline | null): { max: number; at: number } {
    const p = PARTICLE_PROFILES[id];
    const D = p.duration;
    const pbs = PARTICLE_LEADS[id].phaseBounds ?? p.phaseBounds ?? [];
    const zones = figureZones(D, pbs);
    const imgs = [...(D > 200 ? [D * 0.5] : []), ...(D > 40 ? [D - 17] : [])];
    const cursor = tl ? createPhraseCursor(tl) : null;
    const dt = 0.1;
    let formAt: number = PHRASE_LAWS.OPENING_EMBLEM_END, soulAt = formAt, max = 0, at = 0, cycle = 0;
    for (let t = PHRASE_LAWS.OPENING_EMBLEM_END; t < D - 17; t += dt) {
      // the mid emblem is worn: the figure leaves; it re-forms after
      if (D > 200 && t >= D * 0.5 - 1 && t < D * 0.5 + 15) { formAt = soulAt = D * 0.5 + 15; continue; }
      if (pbs.some((pb) => pb > t - dt && pb <= t)) formAt = t; // the morph: worst case the same soul
      const held = t - soulAt;
      if (held > max) { max = held; at = t; }
      const g = figureHoldDue(cursor, t, (t - formAt) * 1000, 13_500, held, zones);
      const busy = pbs.some((pb) => Math.abs(pb - t) < PHRASE_LAWS.PHASE_BUSY_SEC);
      const lead = g.capped ? FIGURE_LAWS.OVERDUE_LEAD_SEC : PHRASE_LAWS.TIMED_LEAD_SEC;
      const timedSoon = (D > 40 && t >= D - 20) || imgs.some((m) => m > t && m - t < lead);
      if (busy || !g.due || timedSoon) continue;
      if (g.event) takePhraseEvent(cursor, g.index);
      const refigure = g.action ? g.action === "refigure" : ++cycle % 3 === 0;
      formAt = t;
      if (!refigure) soulAt = t;
    }
    return { max, at };
  }

  it("covers the catalogue", () => expect(ids.length).toBeGreaterThan(40));
  it(`phrase conductor ON: no figure held > ${CAP} s on any journey`, () => {
    for (const id of ids) {
      const tl = conductPhrases(PARTICLE_PROFILES[id], optsFor(id));
      const { max, at } = longestFigure(id, tl.events.length ? tl : null);
      expect(max, `${PARTICLE_PROFILES[id].name} @${at.toFixed(1)}`).toBeLessThanOrEqual(CAP + 0.11);
    }
  });
  it(`phrase conductor OFF (the hold clock): no figure held > ${CAP} s either`, () => {
    for (const id of ids) {
      const { max, at } = longestFigure(id, null);
      expect(max, `${PARTICLE_PROFILES[id].name} @${at.toFixed(1)}`).toBeLessThanOrEqual(CAP + 0.11);
    }
  });
  it("Grasshopper (the starburst Karel saw held 48 s → 94 s) is capped", () => {
    const id = "fdc6470e-5c7e-43b4-968c-3e907f1fa88f";
    expect(PARTICLE_PROFILES[id]).toBeTruthy();
    const tl = conductPhrases(PARTICLE_PROFILES[id], optsFor(id));
    expect(longestFigure(id, tl).max).toBeLessThanOrEqual(CAP + 0.11);
  });
  it("a refigure of the same soul is the SAME look: it never resets the figure's clock", () => {
    const id = ids[0];
    const tl = conductPhrases(PARTICLE_PROFILES[id], optsFor(id));
    const i = tl.events.findIndex((e) => e.action === "refigure");
    expect(i).toBeGreaterThanOrEqual(0);
    const e = tl.events[i];
    // the figure has held 15 s; 11 s since its last change; a refigure is due
    const r = figureHoldDue(createPhraseCursor(tl), e.t + 0.5, 11_000, 13_500, 15);
    expect(r.due).toBe(true);
    // nothing more can land inside the cap (7 s left < the 10 s hold) → a NEW form, on this phrase
    expect(r.action).toBe("form");
    expect(r.capped).toBe(false);
    expect(r.index).toBe(i);
    // a free soul: exactly the conductor's own choice
    const free = figureHoldDue(createPhraseCursor(tl), e.t + 0.5, 11_000, 13_500, null);
    expect(free.action).toBe("refigure");
    // a figure that just arrived: the refigure stays a refigure when a later change still fits
    const later = tl.events.find((x, k) => k > i && (x.action === "form" || x.action === "refigure") && x.t - e.t >= PHRASE_LAWS.MIN_FORM_HOLD_SEC);
    if (later && later.t - e.t <= CAP - 1) {
      const fresh = figureHoldDue(createPhraseCursor(tl), e.t + 0.5, 11_000, 13_500, 0.5);
      expect(fresh.action).toBe("refigure");
    }
  });
  it("overdue = due now as a new form, after the one-big-change gap; free souls are never capped", () => {
    const r = figureHoldDue(null, 100, 5_000, 13_500, CAP + 0.1);
    expect(r).toMatchObject({ due: true, action: "form", capped: true });
    expect(figureHoldDue(null, 100, 2_000, 13_500, CAP + 5).due).toBe(false); // < 3 s since a change
    // free soul / null: identical to formHoldDue (10k random cases)
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 10_000; k++) {
      const since = rnd() * 60_000, fd = 12_000 + rnd() * 6_000, t = rnd() * 300;
      const a = figureHoldDue(null, t, since, fd, null), b = formHoldDue(null, t, since, fd);
      expect(a.due).toBe(b.due);
      expect(a.capped).toBe(false);
    }
  });
  it("the deadline steps back out of a no-change zone (a morph's one-big-change zone, an image lead-in)", () => {
    const zones = figureZones(240, [60]);
    expect(figureDeadline(40, zones)).toBe(60 - PHRASE_LAWS.PHASE_BUSY_SEC - PHRASE_LAWS.BIG_CHANGE_GAP_SEC); // 62 is inside [53, 64)
    expect(figureDeadline(10, zones)).toBe(32);
    expect(figureDeadline(200, zones)).toBe(240 - 17 - FIGURE_LAWS.OVERDUE_LEAD_SEC - 0.5); // closing emblem lead-in
    for (const [a, b] of zones) expect(b).toBeGreaterThan(a);
  });
  it("the loop replay (conductor on) never holds a figure soul past the cap", () => {
    const logs = replayLoop(loopOrder(), 2, undefined, { phrase: true });
    for (const l of logs) {
      if (l.mastered) continue;
      // merge consecutive same-soul entries (a re-show of the same soul is the same look)
      let run: { soul: SoulId; sec: number } | null = null;
      const runs: { soul: SoulId; sec: number }[] = [];
      for (const f of l.forms) {
        if (run && run.soul === f.soul) run.sec += f.sec;
        else { if (run) runs.push(run); run = { ...f }; }
      }
      if (run) runs.push(run);
      // (the last run ends at the closing emblem; the first starts under the opening one)
      for (const r of runs) if (isFigureSoul(r.soul)) expect(r.sec, `${l.name} ${r.soul}`).toBeLessThanOrEqual(CAP + 0.51);
    }
  });
});

describe("4. Snowflake + Ghost", () => {
  it("are mastered: the cap never touches their scripted forms (the layer passes no hold), the conductor stays off", () => {
    for (const id of ["first-snow", "ghost"]) {
      expect(PARTICLE_LEADS[id]?.mastered, id).toBe(true);
      expect(PHRASE_LOCKED_JOURNEYS.has(id)).toBe(true);
      expect(conductPhrases(PARTICLE_PROFILES[id], { journeyId: id }).events).toEqual([]);
    }
  });
  it("…and get the motion floor all the same (every figure soul they cast turns)", () => {
    for (const id of ["first-snow", "ghost"]) {
      const c = PARTICLE_LEADS[id];
      const souls = new Set<SoulId>([...c.formCycle, ...c.morphSouls, ...c.windows.map((w) => w.soul)]);
      for (const s of souls) if (isFigureSoul(s)) expect(figureMotionFloor(s), `${id} ${s}`).toBeGreaterThan(FIGURE_LAWS.SPIN_FLOOR);
    }
  });
});
