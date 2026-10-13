import { describe, it, expect } from "vitest";
import {
  packFrame, BandSmoother, beatClock, beatCrossings, timelineCrossings, vjBridgeConfig, safeRelayUrl,
  VjEventQueue, VJ_DEFAULT_URL, VJ_MAX_EVENTS_PER_FRAME, VJ_EVENT_QUEUE_CAP, type VjEvent,
} from "./protocol";
import { RateGate } from "./rate-gate.mjs";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("frame packing", () => {
  it("packs a full snapshot: rounded to 3 decimals, clamped, palettes validated", () => {
    const f = packFrame({
      seq: 7, ms: 1234.567,
      bands: { bass: 0.123456, mid: 0.5, treble: 1 / 3, level: 0.2, rawBass: 0.9, rawMid: 0.1, rawTreble: 0.05, rawLevel: 0.3, silent: false },
      clock: beatClock(10, 72),
      playing: true, holding: false, time: 10.00049, duration: 240, volume: 1.7, label: "Rise Above",
      journeyId: "ghost", journeyName: "Ghost", phase: "expansion", phaseIndex: 1, phaseCount: 6, phaseProgress: 0.4444, progress: -0.2,
      themePalette: ["#AABBCC", "not-a-colour", "#112233"], imagePalette: ["#13171d", "#572a12"],
      image: "emblem", emblem: true, shader: "cosmos", dualShader: null, shaderOpacity: 0.8,
      soul: "vortex", particlesOn: true,
      swell: { density: 1.2, size: 1.05, react: 1.1 }, current: { amount: 0.6, tension: 0.71234, layering: 0.5 }, breath: { amount: 0.7, breath: -0.33333, settle: 0.1 },
      morphOn: false, morphProgress: 0,
      events: [["onset", 0.87654, 0.123456, 1234.5]],
    });
    expect(f.v).toBe(1);
    expect(f.ms).toBe(1235);
    expect(f.au).toEqual({ b: 0.123, m: 0.5, t: 0.333, l: 0.2, rb: 0.9, rm: 0.1, rt: 0.05, rl: 0.3, sil: 0 });
    expect(f.ck).toEqual({ bpm: 72, beat: 12, bph: 0, bar: 3, barph: 0 });
    expect(f.pr).toEqual({ play: 1, hold: 0, time: 10, dur: 240, vol: 1, label: "Rise Above" });
    expect(f.jn.theme).toEqual(["#aabbcc", "#112233"]);
    expect(f.jn.pal).toEqual(["#13171d", "#572a12"]);
    expect(f.jn.prog).toBe(0);
    expect(f.jn.pp).toBe(0.444);
    expect(f.jn.emb).toBe(1);
    expect(f.sh).toEqual({ mode: "cosmos", dual: "", op: 0.8 });
    expect(f.pt).toEqual({ soul: "vortex", on: 1, sw: [1.2, 1.05, 1.1], cur: [0.6, 0.712, 0.5], br: [0.7, -0.333, 0.1] });
    expect(f.ev).toEqual([["onset", 0.877, 0.123, 1234.5]]);
    // compact: a full frame is well under 1.5 kB
    expect(JSON.stringify(f).length).toBeLessThan(1500);
  });

  it("packs an empty snapshot to a neutral, silent frame (no NaN, no undefined)", () => {
    const f = packFrame({ seq: 1, ms: 0 });
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/NaN|null|undefined/);
    expect(f.au.sil).toBe(1);
    expect(f.pt.sw).toEqual([1, 1, 1]);
    expect(f.ev).toEqual([]);
  });

  it("caps events per frame and string lengths", () => {
    const events: VjEvent[] = Array.from({ length: 200 }, (_, i) => ["beat", i]);
    const f = packFrame({ seq: 1, ms: 0, events, journeyName: "x".repeat(500) });
    expect(f.ev.length).toBe(VJ_MAX_EVENTS_PER_FRAME);
    expect(f.jn.name.length).toBeLessThanOrEqual(96);
  });
});

describe("event queue", () => {
  it("is bounded — never grows when nobody drains it (relay down)", () => {
    const q = new VjEventQueue();
    for (let i = 0; i < 10_000; i++) q.push(["beat", i]);
    expect(q.size).toBe(VJ_EVENT_QUEUE_CAP);
    expect(q.dropped).toBe(10_000 - VJ_EVENT_QUEUE_CAP);
    // oldest dropped first: the newest survive
    const all = q.drain(1000);
    expect(all[all.length - 1]).toEqual(["beat", 9999]);
  });
});

describe("rate limiting", () => {
  it("lets one tick through per period and never bursts after a stall", () => {
    const g = new RateGate(20); // 50 ms (45 with slack)
    let passed = 0;
    for (let t = 0; t < 1000; t += 5) if (g.allow(t)) passed++;
    expect(passed).toBeGreaterThanOrEqual(19);
    expect(passed).toBeLessThanOrEqual(21);
    // a 5 s stall then a flood: exactly one passes, no banked credit
    let burst = 0;
    for (let t = 6000; t < 6040; t += 1) if (g.allow(t)) burst++;
    expect(burst).toBe(1);
  });

  it("clamps silly rates", () => {
    expect(new RateGate(0).hz).toBe(20);
    expect(new RateGate(10_000).hz).toBe(120);
  });
});

describe("band drive", () => {
  it("uses the shader bins and freezes in silence", () => {
    const sm = new BandSmoother();
    const loud = new Uint8Array(128).fill(0);
    for (let i = 0; i <= 5; i++) loud[i] = 255;
    let d = sm.step(loud, 1 / 20);
    expect(d.rawBass).toBe(1);
    expect(d.rawMid).toBe(0);
    expect(d.silent).toBe(false);
    for (let i = 0; i < 100; i++) d = sm.step(loud, 1 / 20);
    expect(d.bass).toBeGreaterThan(0.95);
    const held = d.bass;
    d = sm.step(new Uint8Array(128), 1 / 20);
    expect(d.silent).toBe(true);
    expect(d.bass).toBe(held); // frozen, not decayed
  });

  it("is rate-free: 20 Hz matches 60 Hz after the same wall time", () => {
    const a = new BandSmoother(), b = new BandSmoother();
    const x = new Uint8Array(128).fill(128);
    let ra = a.step(x, 0), rb = b.step(x, 0);
    for (let i = 0; i < 20; i++) ra = a.step(x, 1 / 20);
    for (let i = 0; i < 60; i++) rb = b.step(x, 1 / 60);
    expect(ra.level).toBeCloseTo(rb.level, 6);
  });
});

describe("beat clock + crossings", () => {
  it("counts beats and bars from the analysis tempo", () => {
    expect(beatClock(2.5, 120)).toEqual({ bpm: 120, beat: 5, beatPhase: 0, bar: 1, barPhase: 0.25 });
    expect(beatClock(10, null).bpm).toBe(0);
    expect(beatClock(10, 5000).bpm).toBe(0);
  });

  it("emits each beat once on continuous play, a bar every 4th, nothing across a seek", () => {
    const a = beatClock(1.9, 120), b = beatClock(2.1, 120); // beat 3.8 → 4.2
    expect(beatCrossings(a, b, 1.9, 2.1)).toEqual([["beat", 4], ["bar", 1]]);
    expect(beatCrossings(a, beatClock(60, 120), 1.9, 60)).toEqual([]); // seek
    expect(beatCrossings(b, a, 2.1, 1.9)).toEqual([]); // backwards
  });

  it("finds phrase events in (from, to] only", () => {
    const ev = [{ t: 1 }, { t: 2 }, { t: 3 }];
    expect(timelineCrossings(ev, 1, 2)).toEqual([{ t: 2 }]);
    expect(timelineCrossings(ev, 0.5, 3)).toEqual([{ t: 1 }, { t: 2 }, { t: 3 }]);
    expect(timelineCrossings(ev, 2, 2)).toEqual([]);
    expect(timelineCrossings(ev, NaN, 2)).toEqual([]);
  });
});

describe("enabling", () => {
  it("is OFF by default", () => {
    expect(vjBridgeConfig("", mem(), mem()).on).toBe(false);
  });

  it("?osc=1 sticks for the tab; ?osc=0 clears it; ?osc=always is the kiosk setting", () => {
    const s = mem(), l = mem();
    expect(vjBridgeConfig("?osc=1", s, l).on).toBe(true);
    expect(vjBridgeConfig("?loop=1", s, l).on).toBe(true); // kept across loop navigations
    expect(vjBridgeConfig("?osc=0", s, l).on).toBe(false);
    expect(vjBridgeConfig("", s, l).on).toBe(false);
    const s2 = mem();
    expect(vjBridgeConfig("?osc=always", s2, l).on).toBe(true);
    expect(vjBridgeConfig("", mem(), l).on).toBe(true); // a fresh tab on the kiosk
    vjBridgeConfig("?osc=0", mem(), l);
    expect(vjBridgeConfig("", mem(), l).on).toBe(false);
  });

  it("relay URL is loopback only; rate clamped to 10..30 Hz", () => {
    const s = mem();
    expect(vjBridgeConfig("?osc=1&oscws=ws://127.0.0.1:9200&oschz=200", s, null)).toEqual({ on: true, url: "ws://127.0.0.1:9200", hz: 30 });
    expect(vjBridgeConfig("?osc=1&oscws=ws://evil.example.com:80", mem(), null).url).toBe(VJ_DEFAULT_URL);
    expect(safeRelayUrl("ws://192.168.1.4:9100")).toBeNull();
    expect(safeRelayUrl("http://127.0.0.1:9100")).toBeNull();
    expect(safeRelayUrl("ws://localhost:9100")).toBe("ws://localhost:9100");
    expect(vjBridgeConfig("?osc=1&oschz=2", mem(), null).hz).toBe(10);
  });

  it("survives blocked storage", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(vjBridgeConfig("", bad, bad).on).toBe(false);
    expect(vjBridgeConfig("?osc=1", bad, bad).on).toBe(true);
  });
});
