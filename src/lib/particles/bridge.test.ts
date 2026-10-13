import { describe, it, expect, beforeEach } from "vitest";
import {
  BRIDGE_LAWS,
  BRIDGE_SPAN_SEC,
  bridgeEnabled,
  createBridgeState,
  stepBridge,
  nextBoundaryStill,
  onBridgeHint,
  publishBridgeHint,
  resetBridgeHints,
  type BridgeInput,
  type BridgeOut,
  type BridgeState,
} from "./bridge";

const PB = 60;
const base = (t: number, over: Partial<BridgeInput> = {}): BridgeInput => ({
  t,
  duration: 240,
  phaseBounds: [PB, 130],
  journeyId: "the-summit",
  mastered: false,
  aReady: true,
  bReady: true,
  morph: false,
  sinceShader: 99,
  formSoon: () => false,
  blockedNow: null,
  ...over,
});

/** run the scheduler at the conductor's 10 Hz tick */
function run(from: number, to: number, input: (t: number) => Partial<BridgeInput> = () => ({}), s0: BridgeState = createBridgeState()) {
  let s = s0;
  const outs: { t: number; o: BridgeOut; s: BridgeState }[] = [];
  for (let k = 0; from + k * 0.1 <= to + 1e-9; k++) {
    const t = +(from + k * 0.1).toFixed(3);
    const r = stepBridge(s, base(t, input(t)));
    s = r.state;
    outs.push({ t, o: r.out, s });
  }
  return { s, outs };
}
const active = <T extends { o: BridgeOut }>(outs: T[]) => outs.filter((x) => x.o.presence > 0.001);
/** largest per-tick change of a value while it can be SEEN (never-abrupt law;
 *  mix / drift only show through presence, so an invisible reset is no step) */
const maxStep = (outs: { o: BridgeOut }[], f: (o: BridgeOut) => number) =>
  outs.slice(1).reduce((m, x, i) => {
    const seen = f === presenceOf || Math.max(x.o.presence, outs[i].o.presence) > 0.001;
    return seen ? Math.max(m, Math.abs(f(x.o) - f(outs[i].o))) : m;
  }, 0);
const presenceOf = (o: BridgeOut) => o.presence;

describe("the bridge — one slow exhale across a boundary", () => {
  it("carries the outgoing colours before the boundary and the incoming after it", () => {
    const { outs } = run(40, 80);
    const on = active(outs);
    expect(on.length).toBeGreaterThan(0);
    const first = on[0].t, last = on[on.length - 1].t;
    // begins shortly before the boundary, ends after it
    expect(first).toBeGreaterThanOrEqual(PB - BRIDGE_LAWS.LEAD_SEC - 0.01);
    expect(first).toBeLessThan(PB - BRIDGE_LAWS.LATEST_START_SEC);
    expect(last).toBeGreaterThan(PB + 3);
    // a slow exhale: 6–14 s, the nominal span ≈ 12 s
    expect(last - first).toBeGreaterThanOrEqual(6);
    expect(last - first).toBeLessThanOrEqual(14);
    expect(BRIDGE_SPAN_SEC).toBeGreaterThanOrEqual(6);
    expect(BRIDGE_SPAN_SEC).toBeLessThanOrEqual(12.5);
    // outgoing colours before the boundary, fully incoming by the end
    const at = (t: number) => outs.find((x) => Math.abs(x.t - t) < 0.05)!.o;
    expect(at(PB - 1).mix).toBe(0);
    expect(at(PB - 1).presence).toBeGreaterThan(0.9);
    expect(on[on.length - 1].o.mix).toBeCloseTo(1, 5);
  });

  it("never steps: presence, mix and drift change smoothly tick to tick", () => {
    const { outs } = run(40, 80);
    // smoothstep's steepest slope is 1.5 / duration — at 10 Hz over ≥ 3 s ≤ 0.05
    expect(maxStep(outs, presenceOf)).toBeLessThanOrEqual(0.051);
    expect(maxStep(outs, (o) => o.mix)).toBeLessThanOrEqual(0.051);
    expect(maxStep(outs, (o) => o.drift)).toBeLessThanOrEqual(0.06);
  });

  it("is sparse: only a share of the field carries, half that with the morph", () => {
    const solo = run(40, 80);
    const withMorph = run(40, 80, () => ({ morph: true }));
    const fSolo = active(solo.outs)[0].o.fraction, fMorph = active(withMorph.outs)[0].o.fraction;
    expect(fSolo).toBeLessThanOrEqual(0.25);
    expect(fMorph).toBeLessThan(fSolo);
    // the morph is the mover: the particles drift less
    const dSolo = Math.max(...solo.outs.map((x) => x.o.drift));
    const dMorph = Math.max(...withMorph.outs.map((x) => x.o.drift));
    expect(dMorph).toBeLessThan(dSolo * 0.6);
  });

  it("holds the field while it runs (busy) so no new form lands on top", () => {
    const { outs } = run(40, 80);
    for (const x of outs) if (x.o.presence > 0.001) expect(x.o.busy).toBe(true);
    expect(outs[outs.length - 1].o.busy).toBe(false);
  });

  it("each boundary is bridged once; the next boundary gets its own exhale", () => {
    const { outs } = run(40, 145);
    const starts = outs.filter((x, i) => i > 0 && x.o.presence > 0 && outs[i - 1].o.presence === 0).map((x) => x.t);
    expect(starts.length).toBe(2);
    expect(starts[1]).toBeGreaterThan(120);
  });
});

describe("the bridge yields — one mover at a time", () => {
  it("MASTERED journeys (Snowflake, Ghost) are never bridged", () => {
    for (const over of [{ mastered: true }, { journeyId: "first-snow" }, { journeyId: "ghost" }]) {
      const { outs } = run(40, 80, () => over);
      expect(active(outs).length).toBe(0);
    }
  });

  it("holds off entirely when an emblem / form lands inside the exhale", () => {
    const formSoon = (from: number, to: number) => from <= PB + 6 && PB + 6 <= to;
    const { outs, s } = run(40, 80, () => ({ formSoon }));
    expect(active(outs).length).toBe(0);
    expect(s.note).toMatch(/emblem/);
  });

  it("never starts within 3 s after a shader switch — it slides, or lets the boundary go", () => {
    // shader switched at PB-5.5: the start slides to PB-2.5
    const slid = run(40, 80, (t) => ({ sinceShader: t - (PB - 5.5) >= 0 ? t - (PB - 5.5) : 99 }));
    const first = active(slid.outs)[0].t;
    expect(first).toBeGreaterThanOrEqual(PB - 2.5 - 0.01);
    // shader switching right through the lead-in: the boundary is let go
    const busy = run(40, 80, (t) => ({ sinceShader: t > PB - 6 && t < PB + 1 ? 0.5 : 99 }));
    expect(active(busy.outs).length).toBe(0);
  });

  it("an image form taking the field mid-exhale: lets go slowly (≥ 3 s), never cut", () => {
    const { outs } = run(40, 80, (t) => ({ blockedNow: t >= PB + 1 ? "emblem" : null }));
    const cut = outs.find((x) => x.t >= PB + 1 - 1e-9)!;
    expect(cut.o.presence).toBeGreaterThan(0.5);
    const gone = outs.find((x) => x.t > cut.t && x.o.presence < 0.001)!;
    expect(gone.t - cut.t).toBeGreaterThanOrEqual(BRIDGE_LAWS.ABORT_FALL_SEC - 0.05);
    expect(maxStep(outs, presenceOf)).toBeLessThanOrEqual(0.051);
    expect(maxStep(outs, (o) => o.mix)).toBeLessThanOrEqual(0.051);
  });

  it("never starts while something holds the field", () => {
    const { outs } = run(40, 80, () => ({ blockedNow: "dissolve" }));
    expect(active(outs).length).toBe(0);
  });

  it("without the incoming still it lets go on the outgoing colours (no cross)", () => {
    const { outs, s } = run(40, 80, () => ({ bReady: false }));
    expect(active(outs).length).toBeGreaterThan(0);
    expect(Math.max(...outs.map((x) => x.o.mix))).toBe(0);
    expect(s.note).toMatch(/incoming/);
  });

  it("without the outgoing still it never starts", () => {
    const { outs } = run(40, 80, () => ({ aReady: false }));
    expect(active(outs).length).toBe(0);
  });

  it("skips a boundary inside the opening emblem and one too close to the end", () => {
    const open = run(0, 40, () => ({ phaseBounds: [12] }));
    expect(active(open.outs).length).toBe(0);
    const end = run(200, 240, () => ({ phaseBounds: [232] }));
    expect(active(end.outs).length).toBe(0);
  });

  it("a seek resets it; the glide is the engine's", () => {
    let s = run(40, PB + 1).s;
    expect(s.phase).not.toBe("idle");
    s = stepBridge(s, base(10)).state;
    expect(s.phase).toBe("idle");
    expect(s.done).toEqual([]);
  });
});

describe("bridge flag + plumbing", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  };
  it("on by default (Karel kept it 2026-10-13); ?bridge=0 off for the tab, ?bridge=1 on", () => {
    const st = mem();
    expect(bridgeEnabled("", st)).toBe(true);
    expect(bridgeEnabled("?bridge=1", st)).toBe(true);
    expect(bridgeEnabled("", st)).toBe(true);
    expect(bridgeEnabled("?bridge=0", st)).toBe(false);
    expect(bridgeEnabled("", st)).toBe(false);
    expect(bridgeEnabled("?bridge=1", null)).toBe(true);
  });

  it("nextBoundaryStill: the next phase's opening still and its time", () => {
    const phases = [{ start: 0, end: 0.25 }, { start: 0.25, end: 0.6 }, { start: 0.6, end: 1 }];
    const urls = ["a0", "a1", "b0", "b1", "b2", "c0"];
    const slice = (p: number) => (p < 0.25 ? { start: 0, end: 2 } : p < 0.6 ? { start: 2, end: 5 } : { start: 5, end: 6 });
    expect(nextBoundaryStill(phases, urls, 0.1, 200, slice)).toEqual({ phaseIdx: 1, boundarySec: 50, incoming: "b0" });
    expect(nextBoundaryStill(phases, urls, 0.3, 200, slice)).toEqual({ phaseIdx: 2, boundarySec: 120, incoming: "c0" });
    expect(nextBoundaryStill(phases, urls, 0.7, 200, slice)).toBeNull();
    expect(nextBoundaryStill(null, urls, 0.1, 200, slice)).toBeNull();
  });

  describe("hint bus", () => {
    beforeEach(() => resetBridgeHints());
    it("publishes to listeners, deduped", () => {
      const got: string[] = [];
      const off = onBridgeHint((h) => got.push(h.incoming ?? "-"));
      const h = { journeyId: "j", boundarySec: 50, outgoing: "a0", incoming: "b0", morph: true };
      publishBridgeHint(h);
      publishBridgeHint({ ...h });
      publishBridgeHint({ ...h, outgoing: "a1" });
      off();
      publishBridgeHint({ ...h, outgoing: "a2" });
      expect(got).toEqual(["b0", "b0"]);
    });
    it("a late subscriber gets the latest hint at once", () => {
      publishBridgeHint({ journeyId: "j", boundarySec: 50, outgoing: "a0", incoming: "b9", morph: false });
      const got: string[] = [];
      onBridgeHint((h) => got.push(h.incoming ?? "-"));
      expect(got).toEqual(["b9"]);
    });
  });
});
