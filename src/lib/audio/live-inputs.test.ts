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
