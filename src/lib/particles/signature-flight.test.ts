import { describe, expect, it } from "vitest";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";
import { emblemEnvelope } from "./image-follow";
import {
  FLIGHT, REST_POSE, SIGNATURE_FLIGHTS, birdFlightEnabled, closingFlightStart, flightHold, flightPose,
  offFrame, openingFlightStart, signatureFlightFor, travel, wingBeatHz,
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
    expect(flightHold(-1)).toBe(0);
    expect(flightHold(FLIGHT.OPEN_SEC + FLIGHT.HOLD_FADE_SEC + 0.1)).toBe(0);
    expect(flightHold(2)).toBe(1);
    // the hold lets go smoothly (no step)
    for (let e = 0.01; e < 10; e += 0.01) expect(Math.abs(flightHold(e + 0.01) - flightHold(e))).toBeLessThan(0.02);
  });
});

describe("signature flight — wing-beat", () => {
  it("≤ 1 Hz (one per three beats)", () => {
    const hz = wingBeatHz(prof.tempo.bpm);
    expect(hz).toBeLessThanOrEqual(1);
    expect(hz).toBeCloseTo(111 / 60 / 3, 3);
    expect(wingBeatHz(400)).toBeLessThanOrEqual(1);
    expect(wingBeatHz(undefined)).toBeGreaterThan(0);
  });
});

describe.each([["closing", FLIGHT.SEC], ["opening", FLIGHT.OPEN_SEC]] as const)("signature flight — the %s path", (_which, SEC) => {
  const hz = wingBeatHz(prof.tempo.bpm);
  const dt = 1 / 120;
  const poses = Array.from({ length: Math.round((SEC + 2) / dt) }, (_, i) => flightPose(i * dt - 1, yb, hz, SEC));
  // the Yellow Bird emblem rests centred; its bird spans ~±0.6 of the plane
  // (emblem plane scale ≤ 0.6) — half-extent in screen half-extents
  const HALF = { x: 0.6 * 0.6, y: 0.6 * 0.6 };

  it("starts exactly at rest — no jump at liftoff", () => {
    expect(flightPose(0, yb, hz, SEC)).toEqual(REST_POSE);
    const p = flightPose(dt, yb, hz, SEC);
    expect(Math.abs(p.x) + Math.abs(p.y)).toBeLessThan(1e-4);
    expect(Math.abs(p.scale - 1)).toBeLessThan(1e-4);
    expect(Math.abs(p.squash - 1)).toBeLessThan(1e-3);
    expect(Math.abs(p.roll)).toBeLessThan(1e-3);
    expect(p.shed).toBe(0);
    expect(travel(0)).toBe(0);
    expect(travel(1)).toBe(1);
  });

  it("smooth: bounded velocity and acceleration, everything eased (no steps)", () => {
    let maxV = 0, maxA = 0, maxQv = 0, maxRv = 0, maxSv = 0;
    for (let i = 2; i < poses.length; i++) {
      const a = poses[i - 2], b = poses[i - 1], c = poses[i];
      const vx = (c.x - b.x) / dt, vy = (c.y - b.y) / dt;
      const ax = (c.x - 2 * b.x + a.x) / (dt * dt), ay = (c.y - 2 * b.y + a.y) / (dt * dt);
      maxV = Math.max(maxV, Math.hypot(vx, vy));
      maxA = Math.max(maxA, Math.hypot(ax, ay));
      maxQv = Math.max(maxQv, Math.abs(c.squash - b.squash) / dt);
      maxRv = Math.max(maxRv, Math.abs(c.roll - b.roll) / dt);
      maxSv = Math.max(maxSv, Math.abs(c.shed - b.shed) / dt);
    }
    // screen half-extents per second — a glide, never a dart
    expect(maxV).toBeLessThan(0.55);
    expect(maxA).toBeLessThan(0.7); // (≈ 2 u/s² at the kiosk camera — the motes follow at ω 3)
    // wing-beat: ≤ amp × 2πf
    expect(maxQv).toBeLessThanOrEqual(FLIGHT.BEAT_AMP * 2 * Math.PI * hz + 0.05);
    expect(maxRv).toBeLessThan(0.3);
    expect(maxSv).toBeLessThan(1.5);
  });

  it("a gentle arc: climbs first, then glides out the way it faces; ends still", () => {
    const at = (e: number) => flightPose(e, yb, hz, SEC);
    const q = at(SEC * 0.35);
    // climbing faster than travelling sideways early on (relative to the totals)
    expect(q.y / FLIGHT.Y_END).toBeGreaterThan(Math.abs(q.x) / FLIGHT.X_END);
    expect(at(SEC).x).toBeLessThan(0); // left
    expect(at(SEC).y).toBeGreaterThan(0); // up
    // monotone travel (it never turns back)
    for (let i = 1; i < poses.length; i++) { expect(poses[i].x).toBeLessThanOrEqual(poses[i - 1].x + 1e-12); expect(poses[i].y).toBeGreaterThanOrEqual(poses[i - 1].y - 1e-12); }
    const end = at(SEC), after = at(SEC + 3);
    expect(after.x).toBeCloseTo(end.x, 9);
    expect(after.y).toBeCloseTo(end.y, 9);
    expect(after.squash).toBeCloseTo(1, 9);
  });

  it("legible: shrinks with distance but stays ≥ 0.4 scale until off-frame — and leaves the frame", () => {
    let leftAt = -1;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      if (leftAt < 0 && offFrame(p, HALF)) leftAt = i * dt - 1;
      if (leftAt < 0) expect(p.scale).toBeGreaterThanOrEqual(0.4);
      expect(p.squash).toBeGreaterThan(0.8);
      expect(p.squash).toBeLessThan(1.2);
    }
    expect(leftAt).toBeGreaterThan(0);
    expect(leftAt).toBeLessThanOrEqual(SEC);
    // a bigger resting form still clears the frame by the end
    expect(offFrame(flightPose(SEC, yb, hz, SEC), { x: 0.5, y: 0.5 })).toBe(true);
  });

  it("motion only — a pose has no brightness / alpha term", () => {
    expect(Object.keys(flightPose(2, yb, hz, SEC)).sort()).toEqual(["roll", "scale", "shed", "squash", "u", "x", "y"]);
  });
});
