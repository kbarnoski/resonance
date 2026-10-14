// The in-page runtime against a fake browser global (no real browser —
// the kiosk Mac stays untouched). Covers clocks, virtual media, the
// analyser stub (checked against the offline precompute), seeded
// randomness, CSS animation clocks, settle, and the built init script.
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { installExportRuntime } from "./page-runtime.mjs";
import { buildInitScript } from "./build-init-script.mjs";
import { precomputeByteSpectra } from "./analyser-math.mjs";

function makeFakeWindow({ pcmBytes } = {}) {
  class FakeMedia extends EventTarget {
    constructor() {
      super();
      this._ct = 0; this._paused = true; this._src = ""; this._dur = 120;
      this.nativePlays = 0; this.nativePauses = 0; this.nativeLoads = 0;
      this.readyState = 4; this.networkState = 1; this.preload = "auto"; this.autoplay = false;
      this.loop = false; this.muted = false; this.volume = 1; this.playbackRate = 1; this.error = null;
      this.isConnected = false; this.seeking = false;
    }
    get currentTime() { return this._ct; }
    set currentTime(v) { this._ct = v; }
    get paused() { return this._paused; }
    get ended() { return false; }
    get duration() { return this._dur; }
    get src() { return this._src; }
    set src(v) { this._src = v; }
    get currentSrc() { return this._src; }
    play() { this.nativePlays++; this._paused = false; return Promise.resolve(); }
    pause() { this.nativePauses++; this._paused = true; }
    load() { this.nativeLoads++; }
  }
  class AudioNode {
    constructor(ctx) { this.context = ctx; }
    connect(d) { return d; }
    disconnect() {}
  }
  class AnalyserNode extends AudioNode {
    constructor(ctx) { super(ctx); this.fftSize = 256; this.smoothingTimeConstant = 0.8; this.minDecibels = -100; this.maxDecibels = -30; }
    get frequencyBinCount() { return this.fftSize / 2; }
    getByteFrequencyData() { throw new Error("native analyser must not be called"); }
    getFloatFrequencyData() { throw new Error("native analyser must not be called"); }
    getByteTimeDomainData() { throw new Error("native analyser must not be called"); }
    getFloatTimeDomainData() { throw new Error("native analyser must not be called"); }
  }
  class AudioContext {
    constructor() { this.sampleRate = 48000; }
    createMediaElementSource() { return new AudioNode(this); }
    createAnalyser() { return new AnalyserNode(this); }
  }
  const animations = [];
  const g = {
    setTimeout, clearTimeout, MessageChannel, Event, EventTarget,
    performance: { now: () => performance.now() },
    Date,
    Math: Object.create(Math),
    console: { warn() {} },
    HTMLMediaElement: FakeMedia,
    AudioNode, AnalyserNode, AudioContext,
    document: { getAnimations: () => animations, querySelectorAll: () => [] },
    fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => pcmBytes }),
  };
  g.window = g;
  return { g, FakeMedia, animations };
}

const stepN = async (api, n) => { let d; for (let i = 0; i < n; i++) d = await api.step(); return d; };

describe("export page runtime", () => {
  it("replaces the clocks: performance.now, Date, timers and rAF only move on step()", async () => {
    const { g } = makeFakeWindow();
    const api = installExportRuntime(g, { fps: 60, epochMs: 5000, quietTurns: 1 });
    expect(g.performance.now()).toBe(0);
    expect(g.Date.now()).toBe(5000);
    expect(new g.Date().getTime()).toBe(5000);
    expect(new g.Date(123).getTime()).toBe(123);
    expect(new g.Date() instanceof Date).toBe(true);
    const log = [];
    g.setTimeout(() => log.push(["timeout", g.performance.now()]), 10);
    g.requestAnimationFrame((ts) => log.push(["raf", ts]));
    await new Promise((r) => setTimeout(r, 30)); // real time passes …
    expect(log).toEqual([]); // … virtual time doesn't
    const d = await api.step();
    expect(log).toEqual([["timeout", 10], ["raf", 1000 / 60]]);
    expect(d.frame).toBe(1);
    expect(g.Date.now()).toBe(5016);
    expect(installExportRuntime(g, {})).toBe(api); // idempotent
  });

  it("seeds Math.random — two installs, same sequence", () => {
    const a = makeFakeWindow().g;
    const b = makeFakeWindow().g;
    installExportRuntime(a, { seed: 7 });
    installExportRuntime(b, { seed: 7 });
    const sa = [a.Math.random(), a.Math.random(), a.Math.random()];
    expect([b.Math.random(), b.Math.random(), b.Math.random()]).toEqual(sa);
    expect(Math.random).not.toBe(a.Math.random); // the real global is untouched
  });

  it("media never plays natively; position advances exactly one frame per step with events", async () => {
    const { g, FakeMedia } = makeFakeWindow();
    const api = installExportRuntime(g, { fps: 60, quietTurns: 1 });
    const el = new FakeMedia();
    el.src = "http://lab/track.m4a";
    const seen = [];
    for (const n of ["play", "playing", "timeupdate", "pause", "ended", "seeked"]) el.addEventListener(n, () => seen.push(n));
    await el.play();
    expect(el.nativePlays).toBe(0);
    expect(el.paused).toBe(false);
    await stepN(api, 60);
    expect(el.currentTime).toBeCloseTo(1, 12);
    expect(seen.slice(0, 2)).toEqual(["play", "playing"]);
    expect(seen.filter((e) => e === "timeupdate").length).toBe(4);
    el.currentTime = 119.99;
    await api.step();
    expect(seen).toContain("seeked");
    await stepN(api, 2);
    expect(el.ended).toBe(true);
    expect(el.paused).toBe(true);
    expect(seen.slice(-2)).toEqual(["pause", "ended"]);
  });

  it("src change resets the virtual position (load algorithm)", async () => {
    const { g, FakeMedia } = makeFakeWindow();
    const api = installExportRuntime(g, { fps: 60, quietTurns: 1 });
    const el = new FakeMedia();
    el.src = "a.m4a";
    el.play();
    await stepN(api, 30);
    el.src = "b.m4a";
    expect(el.currentTime).toBe(0);
    expect(el.paused).toBe(true);
  });

  it("the analyser stub returns exactly the offline precompute at the element's virtual time", async () => {
    const sr = 48000;
    const pcm = Float32Array.from({ length: sr * 3 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 440 * i) / sr) + 0.2 * Math.sin((2 * Math.PI * 3000 * i) / sr) * (i % 9000 < 4500 ? 1 : 0));
    const { g, FakeMedia } = makeFakeWindow({ pcmBytes: pcm.buffer });
    const api = installExportRuntime(g, { fps: 60, quietTurns: 1 });
    const el = new FakeMedia();
    el.src = "http://lab/track.m4a";
    g.__resonanceAudio = el;
    const ctx = new g.AudioContext();
    const src = ctx.createMediaElementSource(el);
    const an = ctx.createAnalyser();
    src.connect(an);
    expect(api.wantedPcm()).toEqual([{ key: "http://lab/track.m4a", sampleRate: 48000 }]);
    expect(api.wantedPcm()).toEqual([]); // asked once
    expect(await api.loadPcm("http://lab/track.m4a", "/pcm/0.f32", sr)).toBe(pcm.length);
    el.play();
    const frames = 90;
    const got = new Uint8Array(frames * 128);
    const buf = new Uint8Array(128);
    for (let f = 0; f < frames; f++) {
      await api.step();
      an.getByteFrequencyData(buf);
      an.getByteFrequencyData(buf); // a second read in the same frame must not smooth again
      got.set(buf, f * 128);
    }
    // step k shows media time k/60 (k = 1..frames)
    const want = precomputeByteSpectra(pcm, sr, { fps: 60, frames, startTime: 1 / 60 });
    expect(Buffer.from(got).equals(Buffer.from(want.data))).toBe(true);
    expect(Math.max(...got)).toBeGreaterThan(100);

    const td = new Uint8Array(256);
    an.getByteTimeDomainData(td);
    expect(td.some((v) => v !== 128)).toBe(true);
  });

  it("a paused or muted source feeds the analyser silence (smoothing decays)", async () => {
    const sr = 48000;
    const pcm = Float32Array.from({ length: sr * 2 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr));
    const { g, FakeMedia } = makeFakeWindow({ pcmBytes: pcm.buffer });
    const api = installExportRuntime(g, { fps: 60, quietTurns: 1 });
    const el = new FakeMedia();
    el.src = "t.m4a";
    const ctx = new g.AudioContext();
    const an = ctx.createAnalyser();
    ctx.createMediaElementSource(el).connect(an);
    await api.loadPcm("t.m4a", "x", sr);
    el.play();
    const b = new Uint8Array(128);
    await stepN(api, 20);
    an.getByteFrequencyData(b);
    const loud = b[5];
    el.pause();
    await stepN(api, 1);
    an.getByteFrequencyData(b);
    expect(b[5]).toBeLessThan(loud);
    await stepN(api, 1);
    el.play();
    el.muted = true;
    for (let i = 0; i < 60; i++) { await api.step(); an.getByteFrequencyData(b); }
    expect(b[5]).toBe(0);
  });

  it("the silent data: unlock wav is never requested; a real src holds the frame before its rAF until PCM loads", async () => {
    const sr = 48000;
    const pcm = new Float32Array(sr * 2).fill(0.25);
    const { g, FakeMedia } = makeFakeWindow({ pcmBytes: pcm.buffer });
    const api = installExportRuntime(g, { fps: 60, quietTurns: 1 });
    const el = new FakeMedia();
    const ctx = new g.AudioContext();
    ctx.createMediaElementSource(el).connect(ctx.createAnalyser());
    el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAKhWAAACABAAZGF0YQAAAAA=";
    el.play();
    const d0 = await api.step();
    expect(d0.needPcm).toBeUndefined();
    expect(d0.wantedPcm).toEqual([]);
    let rafRan = 0;
    g.setTimeout(() => { el.src = "http://lab/track.m4a"; el.play(); }, 1);
    g.requestAnimationFrame(() => { rafRan++; });
    const held = await api.step();
    expect(held.needPcm).toEqual([{ key: "http://lab/track.m4a", sampleRate: 48000 }]);
    expect(rafRan).toBe(0); // paused before the frame's rAF
    await expect(api.step()).rejects.toThrow(/re-entered/);
    await api.loadPcm("http://lab/track.m4a", "/pcm/0.f32", sr);
    const d = await api.resume();
    expect(rafRan).toBe(1);
    expect(d.main.src).toBe("http://lab/track.m4a");
    expect(d.wantedPcm).toEqual([]);
  });

  it("workers are rebuilt with a seeded Math.random prelude (blob source inlined, URL via importScripts)", async () => {
    const { g } = makeFakeWindow();
    const made = [];
    const blobs = new Map();
    let n = 0;
    g.Blob = Blob;
    g.URL = class extends URL {
      static createObjectURL(b) { const u = `blob:fake/${++n}`; blobs.set(u, b); return u; }
    };
    g.location = { href: "http://lab/room" };
    g.Worker = class { constructor(url, opts) { made.push({ url, opts }); } postMessage() {} addEventListener() {} };
    installExportRuntime(g, { seed: 5 });
    const src = g.URL.createObjectURL(new Blob(["self.onmessage = () => postMessage(Math.random());"]));
    new g.Worker(src);
    new g.Worker("/w.js");
    new g.Worker("/m.js", { type: "module" });
    const text = async (u) => blobs.get(u).text();
    const a = await text(made[0].url);
    expect(a).toMatch(/^self\.Math\.random = \(function mulberry32/);
    expect(a).toMatch(/postMessage\(Math\.random\(\)\);$/);
    expect(await text(made[1].url)).toMatch(/importScripts\("http:\/\/lab\/w\.js"\)/);
    expect(made[2].url).toBe("/m.js"); // module workers left alone (warned)
    // the prelude really seeds: same seed → same draws as mulberry32
    const seeded = new Function("self", /^self\.Math\.random = [\s\S]*?\)\(\d+\);\n/.exec(await text(made[0].url))[0] + "return self.Math.random();");
    const self1 = { Math: Object.create(Math) };
    const self2 = { Math: Object.create(Math) };
    expect(seeded(self1)).toBe(seeded(self2));
  });

  it("disconnecting the source detaches the analyser from the element", () => {
    const { g, FakeMedia } = makeFakeWindow();
    installExportRuntime(g, {});
    const el = new FakeMedia();
    const ctx = new g.AudioContext();
    const an = ctx.createAnalyser();
    const s = ctx.createMediaElementSource(el);
    s.connect(an);
    s.disconnect();
    expect(() => an.getByteFrequencyData(new Uint8Array(128))).toThrow(/native analyser/); // falls through to native
  });

  it("CSS animations: paused at birth, currentTime driven from virtual time, finished at the end", async () => {
    const { g, animations } = makeFakeWindow();
    const api = installExportRuntime(g, { fps: 50, quietTurns: 1 });
    const mk = (end) => ({
      currentTime: null, playState: "running", playbackRate: 1, paused: 0, finished: 0,
      pause() { this.paused++; }, finish() { this.finished++; this.playState = "finished"; },
      effect: { getComputedTiming: () => ({ endTime: end }) },
    });
    await api.step(); // frame 1 @ 20 ms
    const a = mk(100);
    const inf = mk(Infinity);
    animations.push(a, inf);
    await api.step(); // discovered at frame 2 (40 ms) → born at 40
    expect(a.paused).toBe(1);
    expect(a.currentTime).toBe(0);
    await api.step(); // 60 ms
    expect(a.currentTime).toBe(20);
    expect(inf.currentTime).toBe(20);
    await stepN(api, 5); // 160 ms → past the 100 ms end
    expect(a.finished).toBe(1);
    expect(inf.currentTime).toBe(120);
  });

  it("settle waits for in-flight fetches before the frame is captured", async () => {
    const { g } = makeFakeWindow();
    let release;
    g.fetch = () => new Promise((r) => { release = r; });
    const api = installExportRuntime(g, { fps: 60, quietTurns: 2, settleMs: 2000 });
    void g.fetch("/slow");
    setTimeout(() => release({ ok: true }), 80);
    const t = Date.now();
    const d = await api.step();
    expect(d.settle.ok).toBe(true);
    expect(Date.now() - t).toBeGreaterThanOrEqual(70);
  });

  it("settle reports what never finished", async () => {
    const { g } = makeFakeWindow();
    g.fetch = () => new Promise(() => {});
    const api = installExportRuntime(g, { fps: 60, quietTurns: 1, settleMs: 50 });
    void g.fetch("/never");
    const d = await api.step();
    expect(d.settle.ok).toBe(false);
    expect(d.settle.pending.fetch).toBe(1);
    expect(d.totals.settleTimeouts).toBeGreaterThan(0);
  });
});

describe("built init script", () => {
  it("parses, and installs only on a top-level page with ?export=1", () => {
    const src = buildInitScript({ fps: 60, seed: 3 });
    expect(() => new vm.Script(src)).not.toThrow();
    expect(src).not.toMatch(/^\s*(import|export)\s/m);

    const run = (search, top) => {
      const { g } = makeFakeWindow();
      g.location = { search };
      g.top = top ?? g;
      g.URLSearchParams = URLSearchParams;
      g.Reflect = Reflect; g.Object = Object; g.Array = Array; g.Number = Number; g.String = String;
      g.Float32Array = Float32Array; g.Float64Array = Float64Array; g.Uint8Array = Uint8Array;
      g.Map = Map; g.Set = Set; g.WeakMap = WeakMap; g.WeakSet = WeakSet; g.Promise = Promise; g.Error = Error;
      g.JSON = JSON; g.Infinity = Infinity; g.NaN = NaN;
      vm.createContext(g);
      vm.runInContext(src, g);
      return g;
    };
    const on = run("?loop=1&export=1");
    expect(typeof on.__resonanceExport.step).toBe("function");
    expect(on.__resonanceExport.config.seed).toBe(3);
    expect(run("?loop=1").__resonanceExport).toBeUndefined();
    expect(run("?export=1", {}).__resonanceExport).toBeUndefined(); // iframe
  });
});
