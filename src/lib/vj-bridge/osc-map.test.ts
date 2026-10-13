import { describe, it, expect } from "vitest";
import { createMapState, frameToOsc, encodePackets, cueToCommand, PULSES } from "./osc-map.mjs";
import { decodePacket } from "./osc.mjs";
import { packFrame, beatClock } from "./protocol";

type Msg = { address: string; types: string; args: unknown[] };
const byAddr = (msgs: Msg[]) => new Map(msgs.map((m) => [m.address, m]));

const frame = (over: Parameters<typeof packFrame>[0] = { seq: 1, ms: 0 }) =>
  packFrame({
    playing: true, time: 12, duration: 200, volume: 0.8,
    bands: { bass: 0.4, mid: 0.3, treble: 0.2, level: 0.25, rawBass: 0.5, rawMid: 0.4, rawTreble: 0.3, rawLevel: 0.35, silent: false },
    clock: beatClock(12, 80),
    journeyId: "ghost", journeyName: "Ghost", phase: "expansion", phaseIndex: 1, phaseCount: 6, phaseProgress: 0.5, progress: 0.06,
    themePalette: ["#ff0000", "#00ff00", "#0000ff", "#ffffff"], imagePalette: ["#ff8000"],
    shader: "cosmos", soul: "vortex", particlesOn: true,
    current: { amount: 0.5, tension: 0.8, layering: 0.6 }, breath: { amount: 0.7, breath: 0.25, settle: 0 },
    ...over,
  });

// The documented address map (docs/touchdesigner-bridge.md) — renaming one breaks every patch.
const CONTINUOUS = [
  "/resonance/audio/bass", "/resonance/audio/mid", "/resonance/audio/treble", "/resonance/audio/level",
  "/resonance/audio/raw/bass", "/resonance/audio/raw/mid", "/resonance/audio/raw/treble", "/resonance/audio/raw/level",
  "/resonance/audio/silent",
  "/resonance/clock/bpm", "/resonance/clock/beat", "/resonance/clock/beat/phase", "/resonance/clock/bar", "/resonance/clock/bar/phase",
  "/resonance/presenter/playing", "/resonance/presenter/holding", "/resonance/presenter/time", "/resonance/presenter/duration", "/resonance/presenter/volume",
  "/resonance/journey/phase/index", "/resonance/journey/phase/count", "/resonance/journey/phase/progress", "/resonance/journey/progress", "/resonance/journey/emblem",
  "/resonance/palette/count", "/resonance/palette/0/r", "/resonance/palette/4/b",
  "/resonance/shader/opacity", "/resonance/particles/present",
  "/resonance/phrase/swell/density", "/resonance/phrase/swell/size", "/resonance/phrase/swell/react",
  "/resonance/harmony/current", "/resonance/harmony/tension", "/resonance/harmony/layering",
  "/resonance/breath/amount", "/resonance/breath/phase", "/resonance/breath/settle",
  "/resonance/morph/playing", "/resonance/morph/progress", "/resonance/heartbeat",
];
const STRINGS = [
  "/resonance/journey/id", "/resonance/journey/name", "/resonance/journey/phase", "/resonance/journey/image",
  "/resonance/shader/name", "/resonance/shader/dual", "/resonance/particles/soul", "/resonance/presenter/label",
  "/resonance/palette/hex", "/resonance/theme/hex",
];

describe("frame → OSC address map", () => {
  it("emits every documented continuous address as ONE number (CHOP-friendly)", () => {
    const m = byAddr(frameToOsc(frame(), createMapState(), 0) as Msg[]);
    for (const a of CONTINUOUS) {
      expect(m.has(a), a).toBe(true);
      expect(m.get(a)!.types, a).toMatch(/^[if]$/);
    }
    expect(m.get("/resonance/audio/bass")!.args).toEqual([0.4]);
    expect(m.get("/resonance/harmony/tension")!.args).toEqual([0.8]);
    expect(m.get("/resonance/breath/phase")!.args).toEqual([0.25]);
    expect(m.get("/resonance/clock/bpm")!.args).toEqual([80]);
    expect(m.get("/resonance/journey/phase/index")!.args).toEqual([1]);
    // image palette wins over the theme; a short palette repeats its last colour
    expect(m.get("/resonance/palette/count")!.args).toEqual([1]);
    expect(m.get("/resonance/palette/0/r")!.args).toEqual([1]);
    expect(m.get("/resonance/palette/0/g")!.args).toEqual([0.502]);
    expect(m.get("/resonance/palette/4/g")!.args).toEqual([0.502]);
    for (const p of PULSES) expect(m.get(`/resonance/pulse/${p}`)!.args, p).toEqual([0]);
  });

  it("sends strings on change and on the keyframe only", () => {
    const st = createMapState();
    const first = byAddr(frameToOsc(frame(), st, 0) as Msg[]);
    for (const a of STRINGS) expect(first.has(a), a).toBe(true);
    expect(first.get("/resonance/journey/name")!.args).toEqual(["Ghost"]);
    expect(first.get("/resonance/palette/hex")!.args).toEqual(["#ff8000"]);
    expect(first.get("/resonance/theme/hex")!.types).toBe("ssss");
    const second = byAddr(frameToOsc(frame(), st, 50) as Msg[]);
    for (const a of STRINGS) expect(second.has(a), a).toBe(false);
    const changed = byAddr(frameToOsc(frame({ seq: 3, ms: 0, shader: "aurora" }), st, 100) as Msg[]);
    expect(changed.get("/resonance/shader/name")!.args).toEqual(["aurora"]);
    expect(changed.has("/resonance/journey/name")).toBe(false);
    const key = byAddr(frameToOsc(frame(), st, 2100) as Msg[]);
    for (const a of STRINGS) expect(key.has(a), a).toBe(true);
  });

  it("maps events to messages + one-frame pulses", () => {
    const st = createMapState();
    frameToOsc(frame(), st, 0);
    const msgs = frameToOsc(frame({
      seq: 2, ms: 50,
      events: [
        ["onset", 0.9, 0.2, 50], ["note", 60, 127, 50], ["noteoff", 60, 51], ["pedal", 1, 52],
        ["phrase", "section", "form", 0.8, "B"], ["cadence", 0.6], ["phase", "illumination", 3],
        ["journey", "ghost", "Ghost"], ["morph", 1, 6.5], ["beat", 16], ["bar", 4],
      ],
    }), st, 50) as Msg[];
    const m = byAddr(msgs);
    expect(m.get("/resonance/audio/onset")).toEqual({ address: "/resonance/audio/onset", types: "ff", args: [0.9, 0.2] });
    expect(m.get("/resonance/midi/note")!.args).toEqual([60, 127]);
    expect(m.get("/resonance/midi/noteoff")!.args).toEqual([60]);
    expect(m.get("/resonance/midi/pedal")!.args).toEqual([1]);
    expect(m.get("/resonance/phrase/event")).toEqual({ address: "/resonance/phrase/event", types: "ssfs", args: ["section", "form", 0.8, "B"] });
    expect(m.get("/resonance/phrase/cadence")!.args).toEqual([0.6]);
    expect(m.get("/resonance/event/phase")!.args).toEqual(["illumination", 3]);
    expect(m.get("/resonance/event/journey")!.args).toEqual(["ghost", "Ghost"]);
    expect(m.get("/resonance/event/morph")!.args).toEqual([1, 6.5]);
    expect(m.get("/resonance/clock/tick")!.args).toEqual([16]);
    expect(m.get("/resonance/clock/downbeat")!.args).toEqual([4]);
    expect(m.get("/resonance/pulse/onset")!.args).toEqual([0.9]);
    expect(m.get("/resonance/pulse/note")!.args).toEqual([1]);
    expect(m.get("/resonance/pulse/section")!.args).toEqual([0.8]);
    expect(m.get("/resonance/pulse/bar")!.args).toEqual([1]);
    // next frame: the pulses fall back to 0; idle pulses are not resent
    const next = byAddr(frameToOsc(frame({ seq: 3, ms: 100 }), st, 100) as Msg[]);
    expect(next.get("/resonance/pulse/onset")!.args).toEqual([0]);
    expect(next.has("/resonance/pulse/crest")).toBe(false);
    const after = byAddr(frameToOsc(frame({ seq: 4, ms: 150 }), st, 150) as Msg[]);
    expect(after.has("/resonance/pulse/onset")).toBe(false);
  });

  it("events-only (rate-limited) frames still deliver events, no continuous values", () => {
    const msgs = frameToOsc(frame({ seq: 1, ms: 0, events: [["onset", 0.5, 0.5, 0]] }), createMapState(), 0, { eventsOnly: true }) as Msg[];
    const m = byAddr(msgs);
    expect(m.has("/resonance/audio/onset")).toBe(true);
    expect(m.has("/resonance/audio/bass")).toBe(false);
  });

  it("encodes to decodable OSC bundles, split under the datagram budget", () => {
    const msgs = frameToOsc(frame(), createMapState(), 0);
    const one = encodePackets(msgs);
    expect(one.length).toBe(1);
    expect(decodePacket(one[0]).length).toBe(msgs.length);
    const small = encodePackets(msgs, { maxBytes: 512 });
    expect(small.length).toBeGreaterThan(1);
    for (const p of small) expect(p.length).toBeLessThanOrEqual(512);
    expect(small.flatMap((p: Uint8Array) => decodePacket(p)).length).toBe(msgs.length);
    expect(encodePackets(msgs, { bundle: false }).length).toBe(msgs.length);
  });

  it("survives a malformed frame (no throw, zeros)", () => {
    expect(() => frameToOsc({ v: 1, ev: [null, ["onset"], "x"] }, createMapState(), 0)).not.toThrow();
  });
});

describe("cues (TD → Resonance)", () => {
  it("maps the allow-listed cues to remote-bus commands", () => {
    expect(cueToCommand("/resonance/cue/next", [1])).toBe("skip");
    expect(cueToCommand("/resonance/cue/next", [])).toBe("skip");
    expect(cueToCommand("/resonance/cue/next", [0])).toBeNull(); // button release
    expect(cueToCommand("/resonance/cue/prev")).toBe("prev");
    expect(cueToCommand("/resonance/cue/play")).toBe("toggle-play");
    expect(cueToCommand("/resonance/cue/set/next")).toBe("set-next");
    expect(cueToCommand("/resonance/cue/title/hold")).toBe("title-hold");
    expect(cueToCommand("/resonance/cue/volume", [0.5])).toBe("volume:0.500");
    expect(cueToCommand("/resonance/cue/volume", [7])).toBe("volume:1.000");
    expect(cueToCommand("/resonance/cue/journey", ["ghost@tramokyo-mix"])).toBe("jump:ghost@tramokyo-mix");
    expect(cueToCommand("/resonance/cue/program", ["rise-above"])).toBe("program:rise-above");
    expect(cueToCommand("/resonance/cue/mark")).toMatch(/^mark:\d+$/);
  });

  it("rejects anything else (no reload, no injection)", () => {
    expect(cueToCommand("/resonance/cue/reload")).toBeNull();
    expect(cueToCommand("/resonance/cue/break")).toBeNull();
    expect(cueToCommand("/resonance/cue/journey", ["../../x"])).toBeNull();
    expect(cueToCommand("/resonance/cue/journey", [42])).toBeNull();
    expect(cueToCommand("/other/cue/next")).toBeNull();
    expect(cueToCommand("/resonance/audio/bass", [1])).toBeNull();
  });
});
