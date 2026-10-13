import { describe, it, expect } from "vitest";
import {
  layoutStruct, structWGSL, UniformBlock, SIM_LAYOUT, RENDER_LAYOUT, GOVERNOR_LAYOUT,
  dispatchSize, clampCount, maxParticlesFor, uploadChunks, particleBytes, UPLOAD_CHUNK_BYTES, WORKGROUP, MAX_GROUPS_PER_DIM,
} from "./layout";

describe("uniform layout (WGSL host-shareable rules)", () => {
  it("packs a scalar into a vec3's tail and pads vec3 → vec4 boundaries", () => {
    const l = layoutStruct("T", [
      { name: "a", type: "vec3f" },
      { name: "b", type: "f32" },
      { name: "c", type: "f32" },
      { name: "d", type: "vec3f" },
      { name: "e", type: "vec2f" },
      { name: "m", type: "mat4x4f" },
      { name: "arr", type: { array: "vec4f", n: 3 } },
    ]);
    const at = Object.fromEntries(l.fields.map((f) => [f.name, f.offset]));
    expect(at).toEqual({ a: 0, b: 12, c: 16, d: 32, e: 48, m: 64, arr: 128 });
    expect(l.size).toBe(176);
  });

  it("every engine block: 16-byte multiple, fields aligned, no overlap", () => {
    for (const l of [SIM_LAYOUT, RENDER_LAYOUT, GOVERNOR_LAYOUT]) {
      expect(l.size % 16).toBe(0);
      let end = 0;
      for (const f of l.fields) {
        expect(f.offset % f.align, `${l.name}.${f.name}`).toBe(0);
        expect(f.offset).toBeGreaterThanOrEqual(end);
        end = f.offset + f.size;
      }
      expect(end).toBeLessThanOrEqual(l.size);
    }
  });

  it("the engine blocks waste no padding (vec3 + scalar pairs)", () => {
    const used = (l: typeof SIM_LAYOUT) => l.fields.reduce((s, f) => s + f.size, 0);
    expect(used(SIM_LAYOUT)).toBe(SIM_LAYOUT.size);
    expect(used(RENDER_LAYOUT)).toBe(RENDER_LAYOUT.size);
  });

  it("the WGSL struct lists the fields in layout order with their offsets", () => {
    const src = structWGSL(SIM_LAYOUT);
    let last = -1;
    for (const f of SIM_LAYOUT.fields) {
      const k = src.indexOf(`  ${f.name}: `);
      expect(k, f.name).toBeGreaterThan(last);
      expect(src).toContain(`// @${f.offset}`);
      last = k;
    }
    expect(src.startsWith("struct SimU {")).toBe(true);
  });

  it("UniformBlock writes u32 as integers, f32 as floats, vectors by lane", () => {
    const u = new UniformBlock(SIM_LAYOUT);
    u.set("count", 1_000_000).set("dt", 0.016).set("planeR", [1, 2, 3]).set("shape", [1, 2, 0.5, 1]);
    expect(u.get("count")).toBe(1_000_000);
    expect(u.u32[SIM_LAYOUT.fields.find((f) => f.name === "count")!.offset / 4]).toBe(1_000_000);
    expect(u.get("dt")).toBeCloseTo(0.016);
    const pr = SIM_LAYOUT.fields.find((f) => f.name === "planeR")!.offset / 4;
    expect([...u.f32.slice(pr, pr + 3)]).toEqual([1, 2, 3]);
    expect(() => u.set("nope", 1)).toThrow();
    expect(() => u.set("planeR", [1, 2, 3, 4])).toThrow();
  });

  it("rejects duplicate fields", () => {
    expect(() => layoutStruct("D", [{ name: "a", type: "f32" }, { name: "a", type: "f32" }])).toThrow();
  });
});

describe("particle storage + dispatch", () => {
  it("1M motes fit one dimension; 20M split into 2-D within the limit", () => {
    expect(dispatchSize(1_000_000)).toEqual([Math.ceil(1_000_000 / WORKGROUP), 1]);
    const [x, y] = dispatchSize(20_000_000);
    expect(x).toBeLessThanOrEqual(MAX_GROUPS_PER_DIM);
    expect(x * y * WORKGROUP).toBeGreaterThanOrEqual(20_000_000);
    expect(dispatchSize(1)).toEqual([1, 1]);
  });

  it("count clamp: 4,096 … 4,194,304, and within the device's storage limit", () => {
    expect(clampCount(10)).toBe(4096);
    expect(clampCount(1e9)).toBe(4_194_304);
    expect(clampCount(NaN)).toBe(409_600);
    const small = { maxStorageBufferBindingSize: 128 << 20, maxBufferSize: 256 << 20 };
    expect(maxParticlesFor(small)).toBe((128 << 20) / 16);
    expect(clampCount(1e9, small)).toBe(4_194_304 > (128 << 20) / 16 ? (128 << 20) / 16 : 4_194_304);
  });

  it("1M motes = 64 MB of GPU state (pos, vel, seed + double-buffered uv)", () => {
    expect(particleBytes(1_000_000)).toBe(1_000_000 * (16 * 3 + 8 * 2));
  });

  it("uploads split into ≤ 1 MB, 4-byte-aligned chunks that cover the data exactly", () => {
    const bytes = 8_000_000;
    const ch = uploadChunks(bytes);
    expect(ch.length).toBe(Math.ceil(bytes / UPLOAD_CHUNK_BYTES));
    let o = 0;
    for (const [off, size] of ch) {
      expect(off).toBe(o);
      expect(off % 4).toBe(0);
      expect(size).toBeLessThanOrEqual(UPLOAD_CHUNK_BYTES);
      o += size;
    }
    expect(o).toBe(bytes);
    expect(uploadChunks(0)).toEqual([]);
  });
});
