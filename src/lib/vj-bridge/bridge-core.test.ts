import { describe, it, expect, beforeEach } from "vitest";
import { VjBridgeCore, VJ_BACKPRESSURE_BYTES, type VjDeps, type VjShowState, type WsLike } from "./bridge-core";
import { VJ_TAP, __resetVjTap } from "./tap";
import type { VjFrame } from "./protocol";

class FakeWs implements WsLike {
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {}
  send(d: string) { this.sent.push(d); }
  close() { this.closed = true; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  drop() { this.readyState = 3; this.onclose?.({}); }
}

const baseShow = (): VjShowState => ({
  time: 0, duration: 200, playing: true, holding: false, volume: 1, label: null, bpm: 120,
  journeyId: "j1", journeyName: "J One", phase: "threshold", phaseIndex: 0, phaseCount: 6, phaseProgress: 0, progress: 0,
  themePalette: null, shader: "cosmos", dualShader: null, shaderOpacity: 1, particlesOn: true, morphOn: false, morphProgress: 0,
});

function harness(on = true, hz = 20) {
  const sockets: FakeWs[] = [];
  const intervals: { fn: () => void; ms: number }[] = [];
  const timeouts: { fn: () => void; ms: number }[] = [];
  let now = 0;
  let show = baseShow();
  const deps: VjDeps = {
    createSocket: (url) => { const s = new FakeWs(url); sockets.push(s); return s; },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: (id) => { intervals[(id as number) - 1] = { fn: () => {}, ms: -1 }; },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearTimeout: () => {},
    now: () => now,
    spectrum: () => new Uint8Array(128).fill(100),
    show: () => show,
  };
  const core = new VjBridgeCore({ on, url: "ws://127.0.0.1:9100", hz }, deps);
  return {
    core, sockets, intervals, timeouts,
    advance(ms: number) { now += ms; },
    setShow(p: Partial<VjShowState>) { show = { ...show, ...p }; },
    frames: () => sockets.flatMap((s) => s.sent.map((j) => JSON.parse(j) as VjFrame)),
  };
}

beforeEach(() => __resetVjTap());

describe("VJ bridge core", () => {
  it("OFF = no socket, no timer, no tap", () => {
    const h = harness(false);
    h.core.start();
    expect(h.sockets.length).toBe(0);
    expect(h.intervals.length).toBe(0);
    expect(h.timeouts.length).toBe(0);
    expect(VJ_TAP.on).toBe(false);
  });

  it("ON: one socket to the configured relay, one timer at the configured rate", () => {
    const h = harness(true, 20);
    h.core.start();
    h.core.start(); // idempotent
    expect(h.sockets.map((s) => s.url)).toEqual(["ws://127.0.0.1:9100"]);
    expect(h.intervals.map((i) => i.ms)).toEqual([50]);
    expect(VJ_TAP.on).toBe(true);
  });

  it("does no work until the relay is connected, then sends packed frames", () => {
    const h = harness();
    h.core.start();
    h.core.tick();
    expect(h.sockets[0].sent.length).toBe(0);
    h.sockets[0].open();
    h.advance(50);
    h.core.tick();
    const [f] = h.frames();
    expect(f.v).toBe(1);
    expect(f.jn.id).toBe("j1");
    expect(f.au.rl).toBeCloseTo(100 / 255, 3);
    // first frame announces the journey + phase
    expect(f.ev).toContainEqual(["journey", "j1", "J One"]);
    expect(f.ev).toContainEqual(["phase", "threshold", 0]);
  });

  it("rate-limits ticks that come too fast (timer clumping)", () => {
    const h = harness(true, 20);
    h.core.start();
    h.sockets[0].open();
    for (let i = 0; i < 10; i++) { h.advance(4); h.core.tick(); } // 10 ticks in 40 ms
    expect(h.sockets[0].sent.length).toBe(1);
    expect(h.core.stats.rateLimited).toBe(9);
  });

  it("drops frames under backpressure but keeps the events for the next one", () => {
    const h = harness();
    h.core.start();
    const ws = h.sockets[0];
    ws.open();
    ws.bufferedAmount = VJ_BACKPRESSURE_BYTES + 1;
    VJ_TAP.events.push(["onset", 0.5, 0.5, 1]);
    h.advance(50); h.core.tick();
    expect(ws.sent.length).toBe(0);
    expect(h.core.stats.skippedBackpressure).toBe(1);
    ws.bufferedAmount = 0;
    h.advance(50); h.core.tick();
    expect(h.frames()[0].ev).toContainEqual(["onset", 0.5, 0.5, 1]);
  });

  it("derives beat, phrase and cadence events on continuous play — none across a seek", () => {
    const h = harness();
    h.core.start();
    h.sockets[0].open();
    VJ_TAP.journeyId = "j1";
    VJ_TAP.phraseTl = { journeyId: "j1", duration: 200, phraseSec: 8, events: [{ t: 2.05, kind: "section", action: "form", strength: 0.9, label: "B" }], emblemWindows: [], formBlocked: [], skipped: [] };
    VJ_TAP.breathTl = { journeyId: "j1", duration: 200, phraseSec: 8, phrases: [{ start: 0, end: 2.08, cadence: true, peak: 0.7 }, { start: 2.08, end: 3, cadence: false, peak: 0.5 }], breath: [] } as unknown as typeof VJ_TAP.breathTl;
    h.setShow({ time: 1.98 }); h.advance(50); h.core.tick();
    h.setShow({ time: 2.1 }); h.advance(50); h.core.tick(); // beat 4 at 2.0 s (120 bpm), bar 1
    const ev = h.frames()[1].ev;
    expect(ev).toContainEqual(["beat", 4]);
    expect(ev).toContainEqual(["bar", 1]);
    expect(ev).toContainEqual(["phrase", "section", "form", 0.9, "B"]);
    expect(ev).toContainEqual(["cadence", 0.7]);
    h.setShow({ time: 90 }); h.advance(50); h.core.tick(); // seek
    expect(h.frames()[2].ev).toEqual([]);
  });

  it("reconnects with backoff when the relay goes away; stop() cancels everything", () => {
    const h = harness();
    h.core.start();
    h.sockets[0].drop();
    expect(h.timeouts.map((t) => t.ms)).toEqual([1000]);
    h.timeouts[0].fn();
    expect(h.sockets.length).toBe(2);
    h.sockets[1].drop();
    expect(h.timeouts.map((t) => t.ms)).toEqual([1000, 2000]);
    h.core.stop();
    expect(VJ_TAP.on).toBe(false);
    h.timeouts[1].fn(); // a stale retry after stop: no new socket
    expect(h.sockets.length).toBe(2);
  });
});
