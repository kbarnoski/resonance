import { describe, it, expect } from "vitest";
import { encodeMessage, encodeBundle, decodePacket, toHex } from "./osc.mjs";

describe("OSC encoding — byte-exact", () => {
  it("matches the OSC 1.0 spec example: /oscillator/4/frequency ,f 440.0", () => {
    expect(toHex(encodeMessage("/oscillator/4/frequency", "f", [440]))).toBe(
      "2f 6f 73 63 69 6c 6c 61 74 6f 72 2f 34 2f 66 72 65 71 75 65 6e 63 79 00 " +
      "2c 66 00 00 43 dc 00 00",
    );
  });

  it("matches the OSC 1.0 spec example: /foo ,iisff 1000 -1 hello 1.234 5.678", () => {
    expect(toHex(encodeMessage("/foo", "iisff", [1000, -1, "hello", 1.234, 5.678]))).toBe(
      "2f 66 6f 6f 00 00 00 00 2c 69 69 73 66 66 00 00 00 00 03 e8 ff ff ff ff " +
      "68 65 6c 6c 6f 00 00 00 3f 9d f3 b6 40 b5 b2 2d",
    );
  });

  it("encodes a Resonance bass message (address padded 21→24, ',f' 2→4, 0.5 = 3f000000)", () => {
    const b = encodeMessage("/resonance/audio/bass", "f", [0.5]);
    expect(b.length).toBe(32);
    expect(toHex(b)).toBe(
      "2f 72 65 73 6f 6e 61 6e 63 65 2f 61 75 64 69 6f 2f 62 61 73 73 00 00 00 " +
      "2c 66 00 00 3f 00 00 00",
    );
  });

  it("pads a string whose length is a multiple of 4 with a full NUL word", () => {
    // "/abc" (4 chars) needs 4 NULs; ",s" → 4; "abcd" → 8
    expect(toHex(encodeMessage("/abc", "s", ["abcd"]))).toBe(
      "2f 61 62 63 00 00 00 00 2c 73 00 00 61 62 63 64 00 00 00 00",
    );
  });

  it("encodes T/F without payload and a blob with size + padding", () => {
    expect(toHex(encodeMessage("/t", "TFb", [new Uint8Array([1, 2, 3])]))).toBe(
      "2f 74 00 00 2c 54 46 62 00 00 00 00 00 00 00 03 01 02 03 00",
    );
  });

  it("wraps a bundle: #bundle, immediate timetag, size-prefixed elements", () => {
    const m = encodeMessage("/a", "i", [1]); // 2f 61 00 00 2c 69 00 00 00 00 00 01
    const b = encodeBundle([m]);
    expect(toHex(b)).toBe(
      "23 62 75 6e 64 6c 65 00 00 00 00 00 00 00 00 01 00 00 00 0c " +
      "2f 61 00 00 2c 69 00 00 00 00 00 01",
    );
  });

  it("round-trips through the decoder (bundles unrolled, UTF-8 kept)", () => {
    const pkt = encodeBundle([
      encodeMessage("/resonance/journey/name", "s", ["Ghost · 幽霊"]),
      encodeMessage("/resonance/midi/note", "ii", [60, 100]),
      encodeMessage("/resonance/audio/onset", "ff", [0.75, 0.25]),
    ]);
    const out = decodePacket(pkt);
    expect(out).toEqual([
      { address: "/resonance/journey/name", types: "s", args: ["Ghost · 幽霊"] },
      { address: "/resonance/midi/note", types: "ii", args: [60, 100] },
      { address: "/resonance/audio/onset", types: "ff", args: [0.75, 0.25] },
    ]);
  });

  it("rejects bad addresses and garbage", () => {
    expect(() => encodeMessage("nope", "", [])).toThrow();
    expect(() => decodePacket(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });

  it("writes non-finite floats as 0 (never NaN on the wire)", () => {
    const [m] = decodePacket(encodeMessage("/x", "f", [NaN]));
    expect(m.args[0]).toBe(0);
  });
});
