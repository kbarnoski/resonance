/**
 * WEB MIDI INPUT (midi-input.ts): the pure state core (note on / off, the
 * sustain pedal, the note-on ring + cursor, notes per minute), the status
 * line, and the browser layer's single request + hot-plug with a fake
 * navigator.requestMIDIAccess.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { MidiState, midiStatusLine, startMidiInput, getMidiState, midiAccessState, midiRequestedByUrl, __resetMidiForTests } from "./midi-input";

describe("MidiState — notes", () => {
  it("note-on holds the note with its velocity + onset time; note-off releases it", () => {
    const s = new MidiState();
    s.handleMessage([0x90, 60, 100], 1000);
    s.handleMessage([0x93, 72, 40], 1010); // another channel — merged
    expect(s.held.get(60)).toMatchObject({ note: 60, velocity: 100, at: 1000 });
    expect(s.held.get(72)?.velocity).toBe(40);
    s.handleMessage([0x80, 60, 0], 1500);
    expect(s.held.has(60)).toBe(false);
    expect(s.held.size).toBe(1);
    expect(s.lastActivityAt).toBe(1500);
    expect(s.lastNoteOnAt).toBe(1010);
  });

  it("a note-on with velocity 0 is a note-off (running status)", () => {
    const s = new MidiState();
    s.handleMessage([0x90, 64, 90], 0);
    s.handleMessage([0x90, 64, 0], 200);
    expect(s.held.size).toBe(0);
    expect(s.seq).toBe(1);
  });

  it("ignores junk, sysex, clock and out-of-range data", () => {
    const s = new MidiState();
    s.handleMessage(null, 0);
    s.handleMessage([0xf8], 0);
    s.handleMessage([0xf0, 1, 2, 3, 0xf7], 0);
    s.handleMessage([0xe0, 0, 64], 0); // pitch bend
    expect(s.held.size).toBe(0);
    expect(s.seq).toBe(0);
  });

  it("the note-on ring + cursor deliver each note exactly once, in order", () => {
    const s = new MidiState();
    expect(s.noteOnsSince(0)).toHaveLength(0);
    s.noteOn(60, 80, 0); s.noteOn(64, 80, 5); s.noteOn(67, 80, 10);
    const a = s.noteOnsSince(0);
    expect(a.map((e) => e.note)).toEqual([60, 64, 67]);
    const cur = s.seq;
    expect(s.noteOnsSince(cur)).toHaveLength(0);
    s.noteOn(72, 80, 20);
    expect(s.noteOnsSince(cur).map((e) => e.note)).toEqual([72]);
  });

  it("notes per minute counts the last minute only", () => {
    const s = new MidiState();
    for (let i = 0; i < 12; i++) s.noteOn(60 + i, 70, i * 1000);
    expect(s.notesPerMinute(12_000)).toBe(12);
    expect(s.notesPerMinute(12_000 + 120_000)).toBe(0);
  });
});

describe("MidiState — sustain pedal", () => {
  it("CC64 ≥ 64 is down, < 64 up; emits only on a change", () => {
    const s = new MidiState();
    const seen: boolean[] = [];
    s.on((e) => { if (e.type === "pedal") seen.push(e.down); });
    s.handleMessage([0xb0, 64, 127], 0);
    expect(s.pedal).toBe(true);
    s.handleMessage([0xb0, 64, 100], 10); // still down (half-pedal data)
    s.handleMessage([0xb0, 64, 10], 20);
    expect(s.pedal).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("other controllers don't touch the pedal; all-notes-off releases that input", () => {
    const s = new MidiState();
    s.handleMessage([0xb0, 1, 127], 0, "a"); // mod wheel
    expect(s.pedal).toBe(false);
    s.noteOn(60, 80, 0, "a"); s.noteOn(62, 80, 0, "b");
    s.handleMessage([0xb0, 123, 0], 5, "a");
    expect([...s.held.keys()]).toEqual([62]);
  });

  it("the pedal is per input: one input lifting doesn't lift the other", () => {
    const s = new MidiState();
    s.setPedal(true, 0, "a");
    s.setPedal(true, 0, "b");
    s.setPedal(false, 10, "a");
    expect(s.pedal).toBe(true);
  });
});

describe("MidiState — hot-unplug", () => {
  it("releasing a source clears its held notes and its pedal, keeps the others", () => {
    const s = new MidiState();
    s.noteOn(48, 90, 0, "nord"); s.noteOn(60, 90, 0, "nord"); s.noteOn(84, 90, 0, "other");
    s.setPedal(true, 0, "nord");
    s.releaseSource("nord", 100);
    expect([...s.held.keys()]).toEqual([84]);
    expect(s.pedal).toBe(false);
  });

  it("clear() releases every note and the pedal", () => {
    const s = new MidiState();
    s.noteOn(48, 90, 0); s.setPedal(true, 0);
    s.clear(10);
    expect(s.held.size).toBe(0);
    expect(s.pedal).toBe(false);
  });
});

describe("status line", () => {
  it("is null when MIDI is off, names the device + rate when ready", () => {
    expect(midiStatusLine("off", null, 0)).toBeNull();
    expect(midiStatusLine("denied", null, 0)).toMatch(/blocked/);
    expect(midiStatusLine("unavailable", null, 0)).toMatch(/not available/);
    const s = new MidiState();
    expect(midiStatusLine("ready", s, 0)).toMatch(/no keyboard/);
    s.setDevices(["Nord Stage 3 MIDI Output"]);
    for (let i = 0; i < 12; i++) s.noteOn(60, 70, i * 1000);
    expect(midiStatusLine("ready", s, 12_000)).toBe("MIDI: Nord Stage 3 MIDI Output connected · 12 notes/min");
  });

  it("?midi=1 is the lab opt-in", () => {
    expect(midiRequestedByUrl("?midi=1")).toBe(true);
    expect(midiRequestedByUrl("?midi=0")).toBe(false);
    expect(midiRequestedByUrl("")).toBe(false);
  });
});

describe("startMidiInput — browser layer (fake Web MIDI)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetMidiForTests();
  });

  type Inp = { id: string; name: string; state: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null };
  function fakeAccess(inputs: Map<string, Inp>) {
    return { inputs, onstatechange: null as null | ((e: { port: { id: string; type: string } }) => void) };
  }

  it("asks ONCE, merges inputs, and a hot-unplug releases that keyboard's notes", async () => {
    const inputs = new Map<string, Inp>([["nord", { id: "nord", name: "Nord Stage 3", state: "connected", onmidimessage: null }]]);
    const acc = fakeAccess(inputs);
    const request = vi.fn(async (o?: { sysex?: boolean }) => { expect(o?.sysex).toBe(false); return acc; });
    vi.stubGlobal("navigator", { requestMIDIAccess: request });

    expect(await startMidiInput()).toBe(true);
    expect(await startMidiInput()).toBe(true); // no second prompt
    expect(request).toHaveBeenCalledTimes(1);
    expect(midiAccessState()).toBe("ready");
    const st = getMidiState()!;
    expect(st.devices).toEqual(["Nord Stage 3"]);

    inputs.get("nord")!.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });
    inputs.get("nord")!.onmidimessage!({ data: new Uint8Array([0xb0, 64, 127]) });
    expect(st.held.has(60)).toBe(true);
    expect(st.pedal).toBe(true);

    // hot-plug a second keyboard
    inputs.set("usb2", { id: "usb2", name: "Other", state: "connected", onmidimessage: null });
    acc.onstatechange!({ port: { id: "usb2", type: "input" } });
    expect(st.devices).toHaveLength(2);
    inputs.get("usb2")!.onmidimessage!({ data: new Uint8Array([0x90, 84, 50]) });

    // unplug the Nord: its note + pedal are gone at once, the other stays
    inputs.delete("nord");
    acc.onstatechange!({ port: { id: "nord", type: "input" } });
    expect(st.held.has(60)).toBe(false);
    expect(st.held.has(84)).toBe(true);
    expect(st.pedal).toBe(false);
    expect(st.devices).toEqual(["Other"]);
  });

  it("denied → resolves false, never asks again, the features stay on audio", async () => {
    const request = vi.fn(async () => { throw new Error("SecurityError"); });
    vi.stubGlobal("navigator", { requestMIDIAccess: request });
    expect(await startMidiInput()).toBe(false);
    expect(await startMidiInput()).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(midiAccessState()).toBe("denied");
  });

  it("no Web MIDI in the browser → unavailable, no throw", async () => {
    vi.stubGlobal("navigator", {});
    expect(await startMidiInput()).toBe(false);
    expect(midiAccessState()).toBe("unavailable");
  });
});
