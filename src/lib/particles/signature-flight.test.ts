import { describe, expect, it } from "vitest";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";
import { emblemEnvelope } from "./image-follow";
import {
  FLIGHT, REST_POSE, REST_WINGS, SIGNATURE_FLIGHTS, birdFlightEnabled, closingFlightStart, flightHold, flightPose, flightReleased,
  offFrame, openingFlightStart, signatureFlightFor, travel, strokeHz, strokePhase, flapAngle, wingRootAngle,
  wingPose, wingFrame, wingDisplacement, toQ, wingState, undulation, pitchAt, tailSpread,
} from "./signature-flight";

const YB = "c80a89bc-2c88-4bde-bec8-4be6916acb62";
const yb = SIGNATURE_FLIGHTS[YB];
const prof = PARTICLE_PROFILES[YB];

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("signature flight — who flies", () => {
  it("only Yellow Bird", () => {
    expect(Object.keys(SIGNATURE_FLIGHTS)).toEqual([YB]);
    expect(signatureFlightFor(YB)?.name).toBe("Yellow Bird");
    expect(prof?.name).toBe("Yellow Bird");
    for (const id of Object.keys(PARTICLE_PROFILES)) if (id !== YB) expect(signatureFlightFor(id)).toBeNull();
  });
  it("flies the way the emblem faces (left, up)", () => {
    expect(yb.dir).toEqual({ x: -1, y: 1 });
  });
});

describe("signature flight — flag", () => {
  it("is off by default; =1 flies both emblems, kept for the tab", () => {
    const st = memStore();
    expect(birdFlightEnabled("", st)).toEqual({ closing: false, opening: false });
    expect(birdFlightEnabled("?birdflight=1", st)).toEqual({ closing: true, opening: true });
    expect(birdFlightEnabled("", st)).toEqual({ closing: true, opening: true });
    expect(birdFlightEnabled("?birdflight=0", st)).toEqual({ closing: false, opening: false });
    expect(birdFlightEnabled("", st)).toEqual({ closing: false, opening: false });
    expect(birdFlightEnabled("?birdflight=yes", null)).toEqual({ closing: false, opening: false });
  });
  it("survives blocked storage", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(birdFlightEnabled("?birdflight=1", bad)).toEqual({ closing: true, opening: true });
    expect(birdFlightEnabled("", bad)).toEqual({ closing: false, opening: false });
  });
});

describe("signature flight — timing from the music", () => {
  const D = prof.duration;
  const st = closingFlightStart(D, prof)!;
  it("Yellow Bird lifts off on the final decay, inside the closing emblem, before the end", () => {
    expect(st).not.toBeNull();
    expect(st).toBeCloseTo(126.9, 1); // (D 137.4: quietest 132 − 6 → held to D − 17 + 6.5)
    // the closing emblem is fully worn first
    expect(st).toBeGreaterThanOrEqual(D - FLIGHT.CLOSING_SEC + FLIGHT.MIN_HOLD_SEC - 1e-9);
    const env = emblemEnvelope(st, D);
    expect(env.occ).toBe(2);
    expect(env.form).toBeGreaterThan(0.99);
    expect(env.show).toBeGreaterThan(0.99);
    // gone before the journey ends (boundary freeze untouched)
    expect(st + FLIGHT.SEC).toBeLessThanOrEqual(D - FLIGHT.END_MARGIN_SEC + 1e-9);
    // ~ the bird is gone as the music reaches its quietest moment
    expect(Math.abs(st + FLIGHT.SEC - (prof.quietestTime ?? 0))).toBeLessThan(1.5);
    // and the energy is already falling (receding last section)
    expect(prof.sections[prof.sections.length - 1].trend).toBe("receding");
  });
  it("falls back to the decay crossing when the quietest moment is elsewhere", () => {
    const curve: [number, number][] = [[0, 0.5], [100, 0.8], [110, 0.8], [115, 0.6], [120, 0.3], [130, 0.1]];
    const s = closingFlightStart(130, { quietestTime: 3, curve })!;
    expect(s).toBeGreaterThanOrEqual(130 - 17 + FLIGHT.MIN_HOLD_SEC);
    expect(s).toBeLessThanOrEqual(130 - FLIGHT.END_MARGIN_SEC - FLIGHT.SEC);
  });
  it("no closing flight in short pieces (no closing emblem)", () => {
    expect(closingFlightStart(40, prof)).toBeNull();
    expect(closingFlightStart(30, null)).toBeNull();
    expect(openingFlightStart(30)).toBeNull();
  });
  it("the opening flight: from the fully worn emblem, inside the boundary settle, over before the opening's 16 s", () => {
    const o = openingFlightStart(D)!;
    const env = emblemEnvelope(o, D);
    expect(env.occ).toBe(0);
    expect(env.form).toBeGreaterThan(0.99);
    expect(env.show).toBeGreaterThan(0.99);
    // lifts off inside the 10.5 s settle (clips + parallax hold: the bird is the one mover)…
    expect(o).toBeLessThan(10.5);
    // …before the emblem's own release (11 s) would have begun dissolving it
    expect(o + 1).toBeLessThan(11);
    expect(o + FLIGHT.OPEN_SEC + FLIGHT.HOLD_FADE_SEC).toBeLessThanOrEqual(16 + 1e-9);
    // worn while it flies, then released at once when off-frame (no stream back)
    expect(flightHold(-1)).toBe(0);
    expect(flightHold(2)).toBe(1);
    expect(flightHold(FLIGHT.OPEN_SEC + 0.01)).toBe(0);
  });
});

describe.each([["closing", FLIGHT.SEC], ["opening", FLIGHT.OPEN_SEC]] as const)("signature flight — the %s let-go (no return morph)", (_which, SEC) => {
  // the Yellow Bird rests centred; its bird spans ~±0.6 of a ≤ 0.6-scale plane
  const HALF = { x: 0.6 * 0.6, y: 0.6 * 0.6 };
  it("lets go only once the bird is off-frame", () => {
    for (let e = 0; e < SEC; e += 0.05) expect(flightReleased(e, SEC)).toBe(false);
    expect(flightReleased(SEC, SEC)).toBe(true);
    expect(offFrame(flightPose(SEC, yb, SEC), HALF)).toBe(true);
    expect(flightHold(SEC, SEC)).toBe(0);
  });
  it("the flown bird's pose holds where it left (the plane never flies back while motes are bound)", () => {
    const end = flightPose(SEC, yb, SEC);
    for (let e = SEC; e < SEC + 10; e += 0.25) {
      const p = flightPose(e, yb, SEC);
      expect(p.x).toBeCloseTo(end.x, 9);
      expect(p.y).toBeCloseTo(end.y, 9);
    }
  });
  it("the let-go window is inside the piece (opening: before 16 s; closing: before the end)", () => {
    const D = prof.duration;
    const st = _which === "opening" ? openingFlightStart(D)! : closingFlightStart(D, prof)!;
    expect(st + SEC + FLIGHT.HOLD_FADE_SEC).toBeLessThanOrEqual(_which === "opening" ? 16 : D);
  });
});

describe.each([["closing", FLIGHT.SEC], ["opening", FLIGHT.OPEN_SEC]] as const)("signature flight — the %s path", (_which, SEC) => {
  const dt = 1 / 120;
  const poses = Array.from({ length: Math.round((SEC + 2) / dt) }, (_, i) => flightPose(i * dt - 1, yb, SEC));
  // the Yellow Bird emblem rests centred; its bird spans ~±0.6 of the plane
  // (emblem plane scale ≤ 0.6) — half-extent in screen half-extents
  const HALF = { x: 0.6 * 0.6, y: 0.6 * 0.6 };

  it("starts exactly at rest — no jump at liftoff", () => {
    expect(flightPose(0, yb, SEC)).toEqual(REST_POSE);
    const p = flightPose(dt, yb, SEC);
    expect(Math.abs(p.x) + Math.abs(p.y)).toBeLessThan(1e-4);
    expect(Math.abs(p.scale - 1)).toBeLessThan(1e-4);
    expect(p.shed).toBe(0);
    expect(travel(0)).toBe(0);
    expect(travel(1)).toBe(1);
  });

  it("smooth: bounded velocity and acceleration (the whole bird glides — only the wings beat fast)", () => {
    let maxV = 0, maxA = 0, maxSv = 0;
    for (let i = 2; i < poses.length; i++) {
      const a = poses[i - 2], b = poses[i - 1], c = poses[i];
      maxV = Math.max(maxV, Math.hypot((c.x - b.x) / dt, (c.y - b.y) / dt));
      maxA = Math.max(maxA, Math.hypot((c.x - 2 * b.x + a.x) / (dt * dt), (c.y - 2 * b.y + a.y) / (dt * dt)));
      maxSv = Math.max(maxSv, Math.abs(c.shed - b.shed) / dt);
    }
    // screen half-extents per second — a glide, never a dart
    expect(maxV).toBeLessThan(0.55);
    expect(maxA).toBeLessThan(0.7);
    expect(maxSv).toBeLessThan(1.5);
  });

  it("a gentle arc: climbs first, then glides out the way it faces; ends still", () => {
    const at = (e: number) => flightPose(e, yb, SEC);
    const q = at(SEC * 0.35);
    expect(q.y / FLIGHT.Y_END).toBeGreaterThan(Math.abs(q.x) / FLIGHT.X_END);
    expect(at(SEC).x).toBeLessThan(0); // left
    expect(at(SEC).y).toBeGreaterThan(0); // up
    for (let i = 1; i < poses.length; i++) { expect(poses[i].x).toBeLessThanOrEqual(poses[i - 1].x + 1e-12); expect(poses[i].y).toBeGreaterThanOrEqual(poses[i - 1].y - 1e-12); }
    const end = at(SEC), after = at(SEC + 3);
    expect(after.x).toBeCloseTo(end.x, 9);
    expect(after.y).toBeCloseTo(end.y, 9);
  });

  it("legible: shrinks with distance but stays ≥ 0.4 scale until off-frame — and leaves the frame", () => {
    let leftAt = -1;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      if (leftAt < 0 && offFrame(p, HALF)) leftAt = i * dt - 1;
      if (leftAt < 0) expect(p.scale).toBeGreaterThanOrEqual(0.4);
    }
    expect(leftAt).toBeGreaterThan(0);
    expect(leftAt).toBeLessThanOrEqual(SEC);
    expect(offFrame(flightPose(SEC, yb, SEC), { x: 0.5, y: 0.5 })).toBe(true);
  });

  // ── the wings (small-passerine flap-bounding) ──
  const bpm = prof.tempo.bpm;
  const wings = Array.from({ length: Math.round((SEC + 2) / dt) }, (_, i) => ({ e: i * dt - 1, st: wingState(i * dt - 1, SEC, bpm), pose: wingPose(i * dt - 1, SEC, bpm) }));

  it("wings: continuous — at rest before liftoff, no jumps anywhere, fold into a last bound and hold", () => {
    expect(wingPose(0, SEC, bpm)).toEqual(REST_WINGS);
    const early = wingPose(dt, SEC, bpm);
    expect(Math.abs(early.root) + Math.abs(early.tip) + Math.abs(early.bob)).toBeLessThan(0.03);
    const keys = ["root", "tip", "bob", "flex", "fold", "sweep", "tail"] as const;
    const lim = { root: 0.2, tip: 0.2, bob: 0.003, flex: 0.16, fold: 0.16, sweep: 0.16, tail: 0.05 }; // (sin² over a 0.2 s downstroke peaks ~16/s)
    for (let i = 1; i < wings.length; i++) for (const k of keys) expect(Math.abs(wings[i].pose[k] - wings[i - 1].pose[k])).toBeLessThan(lim[k]);
    const after = wingPose(SEC + 2, SEC, bpm);
    expect(after.root).toBeCloseTo(FLIGHT.BOUND_ANGLE, 6);
    expect(after.tip).toBeCloseTo(FLIGHT.BOUND_ANGLE, 6);
    expect(after.fold).toBeCloseTo(1, 6);
    expect(after.flex).toBeCloseTo(0, 6);
    expect(wingState(SEC + 1, SEC, bpm).kind).toBe("bound");
  });

  it("flap-bounding: a takeoff burst, then bursts of flaps and FOLDED bounds (wings against the body)", () => {
    const runs: Array<{ kind: string; from: number; to: number; maxFold: number }> = [];
    for (const w of wings) {
      if (w.e <= 0 || w.e > SEC - FLIGHT.FINAL_BOUND_SEC) continue;
      const last = runs[runs.length - 1];
      if (last && last.kind === w.st.kind) { last.to = w.e; last.maxFold = Math.max(last.maxFold, w.st.fold); } else runs.push({ kind: w.st.kind, from: w.e, to: w.e, maxFold: w.st.fold });
    }
    expect(runs[0].kind).toBe("flap");
    expect(runs[0].to - runs[0].from).toBeGreaterThan(1); // the takeoff burst
    const bounds = runs.filter((r) => r.kind === "bound" && r.to < SEC - FLIGHT.FINAL_BOUND_SEC - 0.05);
    expect(bounds.length).toBeGreaterThanOrEqual(1);
    for (const b of bounds) { expect(b.maxFold).toBeGreaterThan(0.99); expect(b.to - b.from).toBeGreaterThan(0.5); expect(b.to - b.from).toBeLessThan(1.1); }
    // in a bound the wing is folded and barely raised — no bright wing sweep
    for (const w of wings) if (w.st.kind === "bound" && w.e < SEC - FLIGHT.FINAL_BOUND_SEC) expect(w.st.angle).toBeLessThanOrEqual(FLIGHT.BOUND_ANGLE + 1e-9);
  });

  it("the path undulates: rising through each burst, sinking through the bound", () => {
    let sawRise = false, sawSink = false;
    for (let i = 1; i < wings.length; i++) {
      const e = wings[i].e;
      if (e <= 0 || e > SEC - FLIGHT.FINAL_BOUND_SEC) continue;
      const du = undulation(e, SEC, bpm) - undulation(wings[i - 1].e, SEC, bpm);
      if (wings[i].st.kind === "bound" && wings[i].st.fold > 0.5) { expect(du).toBeLessThanOrEqual(1e-12); if (du < -1e-6) sawSink = true; }
      if (wings[i].st.kind === "flap" && undulation(e, SEC, bpm) > 0 && du > 1e-6) sawRise = true;
    }
    expect(sawRise).toBe(true);
    expect(sawSink).toBe(true);
    for (let e = 0; e < SEC + 1; e += 0.01) { const u = undulation(e, SEC, bpm); expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(FLIGHT.UNDULATE + 1e-9); }
  });
});

describe("signature flight — the stroke", () => {
  const bpm = prof.tempo.bpm;
  it("rates: takeoff on the beat (≤ 2.2 Hz — photosensitive-safe) easing to a half-beat cruise", () => {
    const { takeoff, cruise } = strokeHz(bpm);
    expect(takeoff).toBeGreaterThanOrEqual(1.5);
    expect(takeoff).toBeLessThanOrEqual(2.2);
    expect(takeoff).toBeCloseTo(111 / 60, 3);
    expect(cruise).toBeCloseTo(111 / 120, 3);
    expect(cruise).toBeLessThan(takeoff);
    const r0 = (strokePhase(0.11, 6, bpm) - strokePhase(0.1, 6, bpm)) / 0.01;
    const r1 = (strokePhase(5.01, 6, bpm) - strokePhase(5, 6, bpm)) / 0.01;
    expect(r0).toBeCloseTo(takeoff, 1);
    expect(r1).toBeCloseTo(cruise, 1);
    // never above 2.2 strokes/s anywhere, any tempo
    for (const b of [60, 111, 200, 400]) for (let e = 0; e < 6; e += 0.05) expect((strokePhase(e + 0.01, 6, b) - strokePhase(e, 6, b)) / 0.01).toBeLessThanOrEqual(2.2 + 1e-6);
  });
  it("asymmetric: the downstroke (power) takes 40 %, the upstroke 60 % — zero velocity at the turns", () => {
    const N = 1000;
    let peakAt = 0, peak = 0;
    for (let i = 0; i <= N; i++) { const a = flapAngle(i / N, 2); if (a > peak) { peak = a; peakAt = i / N; } }
    expect(peakAt).toBeCloseTo(FLIGHT.DOWN_SHARE, 2);
    expect(peak).toBeCloseTo(2, 6);
    const dDown = (flapAngle(0.2 + 1e-4, 2) - flapAngle(0.2, 2)) / 1e-4;
    const dUp = (flapAngle(0.7, 2) - flapAngle(0.7 + 1e-4, 2)) / 1e-4;
    expect(dDown).toBeGreaterThan(dUp * 1.3);
    expect(Math.abs(flapAngle(1e-4, 2))).toBeLessThan(1e-5);
    expect(Math.abs(flapAngle(0.4 + 1e-4, 2) - 2)).toBeLessThan(1e-5);
    expect(Math.abs(flapAngle(1 - 1e-4, 2))).toBeLessThan(1e-5);
  });
  it("downstroke: extended + swept forward (no flex); upstroke: flexed at the wrist (no sweep)", () => {
    let downFlex = 0, upSweep = 0, maxSweep = 0, maxFlex = 0;
    for (let e = 0.001; e < 1.5; e += 0.002) {
      const w = wingState(e, 6, bpm);
      if (w.kind !== "flap") continue;
      const phi = strokePhase(e, 6, bpm), x = phi - Math.floor(phi);
      if (x < FLIGHT.DOWN_SHARE) { downFlex = Math.max(downFlex, w.flex); maxSweep = Math.max(maxSweep, w.sweep); }
      else { upSweep = Math.max(upSweep, w.sweep); maxFlex = Math.max(maxFlex, w.flex); }
    }
    expect(downFlex).toBe(0);
    expect(upSweep).toBe(0);
    expect(maxSweep).toBeGreaterThan(0.95);
    expect(maxFlex).toBeGreaterThan(0.95);
  });
  it("the tip trails the root (the wing flexes)", () => {
    let rootPeak = 0, tipPeak = 0, rp = -1, tp = -1;
    for (let e = 0; e < 0.45; e += 0.001) {
      const w = wingPose(e, 6, bpm);
      if (w.root > rootPeak) { rootPeak = w.root; rp = e; }
      if (w.tip > tipPeak) { tipPeak = w.tip; tp = e; }
    }
    expect(tp - rp).toBeCloseTo(FLIGHT.TIP_LAG_SEC, 2);
    const mid = wingPose(0.08, 6, bpm);
    expect(mid.tip).toBeLessThan(mid.root);
  });
  it("the body lifts on the downstroke (opposite the wings), never sinks below rest", () => {
    const down = wingPose(0.2, 6, bpm), up0 = wingPose(0.001, 6, bpm);
    expect(down.root).toBeGreaterThan(1);
    expect(down.bob).toBeGreaterThan(up0.bob);
    for (let e = 0; e < 7; e += 0.01) expect(wingPose(e, 6, bpm).bob).toBeGreaterThanOrEqual(0);
  });
  it("takeoff: nose-up pitch levelling into cruise; tail spread at takeoff, closed in cruise", () => {
    expect(pitchAt(0)).toBe(0);
    expect(pitchAt(0.5)).toBeGreaterThan(0.3);
    expect(pitchAt(4)).toBeCloseTo(FLIGHT.PITCH_CRUISE, 6);
    for (let e = 0; e < 6; e += 0.01) expect(Math.abs(pitchAt(e + 0.01) - pitchAt(e))).toBeLessThan(0.02);
    // facing left: nose-up is a clockwise (negative) turn
    expect(flightPose(0.5, yb, 6).pitch).toBeLessThan(0);
    expect(tailSpread(0.4)).toBeCloseTo(1, 6);
    expect(tailSpread(4)).toBe(0);
    expect(wingPose(0.4, 6, bpm).tail).toBeCloseTo(1, 6);
  });
});

describe("signature flight — the Yellow Bird's anatomy", () => {
  const fr = wingFrame(yb.wing, 1);
  const bpm = prof.tempo.bpm;
  // landmarks in the emblem picture (x right, y down)
  const BODY: Array<[string, [number, number]]> = [["beak", [0.32, 0.43]], ["eye", [0.4, 0.44]], ["head top", [0.41, 0.41]], ["chest", [0.45, 0.53]], ["belly", [0.52, 0.58]], ["feet", [0.58, 0.62]], ["tail base", [0.65, 0.62]], ["tail tip", [0.78, 0.7]]];
  const WING: Array<[string, [number, number]]> = [["near wing tip", [0.79, 0.21]], ["far wing tip", [0.66, 0.22]], ["near wing mid", [0.66, 0.33]], ["far wing mid", [0.58, 0.3]]];
  const full = { ...REST_WINGS, root: FLIGHT.DOWN_TAKEOFF, tip: FLIGHT.DOWN_TAKEOFF };
  const sq = (d: number[]) => Math.hypot(...d);

  it("a side view: hinge along the back, wing normal pointing up (toward the raised wings)", () => {
    expect(yb.wing.view).toBe("side");
    expect(fr.normal[1]).toBeGreaterThan(0.5);
    expect(Math.hypot(...fr.axis)).toBeCloseTo(1, 6);
    expect(fr.rMax).toBeGreaterThan(0.25);
  });
  it.each(BODY)("body mote (%s) never flaps — through every wing state (no body lift, no tail fan)", (_n, p) => {
    for (let e = 0; e < 7; e += 0.05) {
      const w = { ...wingPose(e, 6, bpm), tail: 0 };
      expect(sq(wingDisplacement(toQ(p), fr, w, false))).toBeLessThan(1e-3);
    }
  });
  it("wing motes swing about the shoulder: down past the back and out of the plane, more toward the tip", () => {
    const tip = wingDisplacement(toQ(WING[0][1]), fr, full, false);
    const mid = wingDisplacement(toQ(WING[2][1]), fr, full, false);
    expect(Math.hypot(tip[0], tip[1])).toBeGreaterThan(Math.hypot(mid[0], mid[1]));
    expect(tip[1]).toBeLessThan(-0.25);
    const tq = toQ(WING[0][1]);
    const after = [tq[0] + tip[0], tq[1] + tip[1]];
    expect((after[0] - fr.hinge[0]) * fr.normal[0] + (after[1] - fr.hinge[1]) * fr.normal[1]).toBeLessThan(0);
    const side = wingDisplacement(tq, fr, { ...full, root: Math.PI / 2, tip: Math.PI / 2 }, false);
    expect(side[2]).toBeGreaterThan(0.25);
    for (const [, p] of WING) expect(sq(wingDisplacement(toQ(p), fr, full, false))).toBeGreaterThan(0.1);
  });
  it("upstroke flex: the hand folds in (span shrinks) and back; the arm barely moves", () => {
    const flexed = { ...REST_WINGS, flex: 1 };
    const tq = toQ(WING[0][1]);
    const d = wingDisplacement(tq, fr, flexed, false);
    const r0 = (tq[0] - fr.hinge[0]) * fr.normal[0] + (tq[1] - fr.hinge[1]) * fr.normal[1];
    const r1 = (tq[0] + d[0] - fr.hinge[0]) * fr.normal[0] + (tq[1] + d[1] - fr.hinge[1]) * fr.normal[1];
    expect(r1).toBeLessThan(r0 * 0.85); // span reduced
    expect(d[0] * fr.axis[0] + d[1] * fr.axis[1]).toBeGreaterThan(0); // tip swept back toward the tail
    // a point inside the arm (below the wrist) does not flex
    const arm: [number, number] = [fr.hinge[0] + fr.normal[0] * 0.1, fr.hinge[1] + fr.normal[1] * 0.1];
    expect(sq(wingDisplacement(arm, fr, flexed, false))).toBeLessThan(1e-9);
  });
  it("bound: the wing folds onto the back, lying toward the tail", () => {
    const folded = { ...REST_WINGS, fold: 1, root: FLIGHT.BOUND_ANGLE, tip: FLIGHT.BOUND_ANGLE };
    const tq = toQ(WING[0][1]);
    const d = wingDisplacement(tq, fr, folded, false);
    const r1 = (tq[0] + d[0] - fr.hinge[0]) * fr.normal[0] + (tq[1] + d[1] - fr.hinge[1]) * fr.normal[1];
    expect(r1).toBeLessThan(0.06); // on the back
    expect(r1).toBeGreaterThan(-0.02);
    const a1 = (tq[0] + d[0] - fr.hinge[0]) * fr.axis[0] + (tq[1] + d[1] - fr.hinge[1]) * fr.axis[1];
    expect(a1).toBeGreaterThan(0.15); // reaching back toward the tail
  });
  it("tail fan: the tail widens at takeoff; the body and wings do not", () => {
    const fan = { ...REST_WINGS, tail: 1 };
    const tb = toQ(yb.wing.tail), tt = toQ(yb.wing.tailTip);
    const off: [number, number] = [tt[0] - fr.tailDir[1] * 0.05, tt[1] + fr.tailDir[0] * 0.05];
    const d = wingDisplacement(off, fr, fan, false);
    expect(sq(d)).toBeGreaterThan(0.01);
    expect(sq(wingDisplacement(tb, fr, fan, false))).toBeLessThan(1e-6);
    for (const [, p] of WING) expect(sq(wingDisplacement(toQ(p), fr, fan, false))).toBeLessThan(1e-9);
    for (const [n, p] of BODY) if (!n.startsWith("tail")) expect(sq(wingDisplacement(toQ(p), fr, fan, false))).toBeLessThan(1e-9);
  });
  it("the wings stay attached: continuous across the root band in every shape", () => {
    const sh = toQ(yb.wing.shoulder);
    for (const w of [full, { ...full, flex: 1 }, { ...REST_WINGS, fold: 1, root: 0.25, tip: 0.25 }, { ...full, sweep: 1 }]) {
      let prev = wingDisplacement(sh, fr, w, false);
      for (let k = 1; k <= 200; k++) {
        const r = (k / 200) * 0.1;
        const d = wingDisplacement([sh[0] + fr.normal[0] * r, sh[1] + fr.normal[1] * r], fr, w, false);
        expect(Math.hypot(d[0] - prev[0], d[1] - prev[1], d[2] - prev[2])).toBeLessThan(0.006);
        prev = d;
      }
    }
  });
  it("the body lift moves every mote together", () => {
    const w = { ...REST_WINGS, bob: 0.02 };
    for (const [, p] of [...BODY, ...WING]) {
      const d = wingDisplacement(toQ(p), fr, w);
      expect(d[0]).toBeCloseTo(0, 9);
      expect(d[1]).toBeCloseTo(0.02, 9);
      expect(d[2]).toBeCloseTo(0, 9);
    }
  });
  it("motion only — no luminance / alpha terms anywhere in the flight", () => {
    expect(Object.keys(flightPose(2, yb, 6)).sort()).toEqual(["pitch", "scale", "shed", "u", "x", "y"]);
    expect(Object.keys(wingPose(1, 6, bpm)).sort()).toEqual(["bob", "flex", "fold", "root", "sweep", "tail", "tip"]);
    expect(wingDisplacement([0, 0], fr, wingPose(1, 6, bpm))).toHaveLength(3);
  });
});
