import { describe, it, expect } from "vitest";
import { pickLiveInputs } from "./audio-engine";

// this Mac, 2026-10-15: the DEFAULT input is a virtual NDI device and an iPhone
// Continuity mic shows up — live mode must still hear the built-in mic
const devs = [
  { kind: "audioinput", deviceId: "default", label: "Default - NDI Audio" },
  { kind: "audioinput", deviceId: "ndi", label: "NDI Audio" },
  { kind: "audioinput", deviceId: "phone", label: "iPhone (4) Microphone" },
  { kind: "audioinput", deviceId: "mbp", label: "MacBook Pro Microphone (Built-in)" },
  { kind: "audioinput", deviceId: "bh", label: "BlackHole 2ch (Virtual)" },
  { kind: "audiooutput", deviceId: "spk", label: "MacBook Pro Speakers" },
];

describe("live mode inputs (Karel 2026-10-15: mic, laptop sound, or both)", () => {
  it("mic = the built-in MacBook mic, never the virtual default or the iPhone", () => {
    expect(pickLiveInputs(devs, "mic")).toEqual({ mic: "mbp", laptop: null });
  });
  it("the laptop mic stays the default with a mic plugged in; the plugged-in one only without it", () => {
    const ext = [...devs, { kind: "audioinput", deviceId: "usb", label: "Scarlett Solo USB" }];
    expect(pickLiveInputs(ext, "mic")).toEqual({ mic: "mbp", laptop: null });
    expect(pickLiveInputs(ext.filter((d) => d.deviceId !== "mbp"), "mic")).toEqual({ mic: "usb", laptop: null });
  });
  it("laptop = the BlackHole loopback", () => {
    expect(pickLiveInputs(devs, "laptop")).toEqual({ mic: null, laptop: "bh" });
  });
  it("both = mixed", () => {
    expect(pickLiveInputs(devs, "both")).toEqual({ mic: "mbp", laptop: "bh" });
  });
  it("no BlackHole installed: laptop has nothing to hear (reported, never the mic by mistake)", () => {
    const noBh = devs.filter((d) => d.deviceId !== "bh");
    expect(pickLiveInputs(noBh, "laptop")).toEqual({ mic: null, laptop: null });
    expect(pickLiveInputs(noBh, "both")).toEqual({ mic: "mbp", laptop: null });
  });
});

import { describeLiveInputs } from "./audio-engine";

describe("live input status (QA 2026-10-15: the phone + log must say what is heard)", () => {
  it("mic found: ok, no note", () => {
    const s = describeLiveInputs("mic", { mic: "mbp", laptop: null }, ["MacBook Pro Microphone"], false);
    expect(s).toMatchObject({ src: "mic", ok: true, missing: [], note: null });
  });
  it("laptop without BlackHole: unavailable, says so, visuals drift", () => {
    const s = describeLiveInputs("laptop", { mic: null, laptop: null }, [], false);
    expect(s.ok).toBe(false);
    expect(s.missing).toEqual(["laptop"]);
    expect(s.note).toMatch(/BlackHole not installed/);
    expect(s.note).toMatch(/drift/);
  });
  it("both without BlackHole: the mic drives, the laptop half is reported missing", () => {
    const s = describeLiveInputs("both", { mic: "mbp", laptop: null }, ["MacBook Pro Microphone"], false);
    expect(s.ok).toBe(true);
    expect(s.missing).toEqual(["laptop"]);
    expect(s.note).toMatch(/laptop sound unavailable/);
  });
  it("permission refused: not ok, the reason is kept", () => {
    const s = describeLiveInputs("mic", { mic: null, laptop: null }, [], false, "NotAllowedError");
    expect(s.ok).toBe(false);
    expect(s.note).toMatch(/NotAllowedError/);
  });
  it("default-input fallback is named", () => {
    const s = describeLiveInputs("mic", { mic: null, laptop: null }, ["Default"], true);
    expect(s.ok).toBe(true);
    expect(s.missing).toEqual([]);
    expect(s.note).toMatch(/default input/);
  });
});
