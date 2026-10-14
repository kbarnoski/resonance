// A recording fake of the WebGPU slice the engine uses (tests only — no GPU).
// Every call lands in `calls`; any property the engine touches that the fake
// does not implement is recorded as `missing:<name>` (e.g. a synchronous
// createComputePipeline would show up here and fail the no-sync test).

export interface GpuCall { name: string; args: unknown[] }

export interface FakeGpuOptions {
  adapter?: boolean;
  timestamps?: boolean;
  /** WGSL compile errors to report for modules whose label includes the key */
  compileErrors?: Record<string, string>;
  maxStorageBufferBindingSize?: number;
}

export function fakeGpu(o: FakeGpuOptions = {}) {
  const calls: GpuCall[] = [];
  const rec = (name: string, ...args: unknown[]) => { calls.push({ name, args }); };
  let id = 1;
  const trap = <T extends object>(kind: string, obj: T): T =>
    new Proxy(obj, {
      get(t, p, r) {
        if (typeof p === "string" && !(p in t) && p !== "then") rec(`missing:${kind}.${p}`);
        return Reflect.get(t, p, r);
      },
    });

  const buffers: { label: string; size: number; usage: number }[] = [];
  const lastWrite = new Map<string, ArrayBuffer>();
  const mkBuffer = (d: { size: number; usage: number; label?: string }) => {
    const b = {
      id: id++,
      size: d.size,
      label: d.label ?? "",
      usage: d.usage,
      mapState: "unmapped" as "unmapped" | "pending" | "mapped",
      mapAsync(mode: number) {
        rec("mapAsync", b.label, mode);
        b.mapState = "pending";
        return Promise.resolve().then(() => { b.mapState = "mapped"; });
      },
      getMappedRange: () => new ArrayBuffer(d.size),
      unmap() { b.mapState = "unmapped"; },
      destroy: () => rec("buffer.destroy", b.label),
    };
    buffers.push({ label: b.label, size: d.size, usage: d.usage });
    return trap("buffer", b);
  };
  const mkTexture = (d: { size: [number, number] | { width: number; height: number }; label?: string }) => {
    const [w, h] = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height];
    return trap("texture", { width: w, height: h, label: d.label ?? "", createView: () => ({ view: id++ }), destroy: () => rec("texture.destroy", d.label) });
  };
  const pass = (kind: string, label: string) =>
    trap(kind, {
      setPipeline: (p: unknown) => rec(`${kind}.setPipeline`, label, p),
      setBindGroup: (i: number, g: unknown) => rec(`${kind}.setBindGroup`, label, i, g),
      dispatchWorkgroups: (x: number, y = 1, z = 1) => rec("dispatchWorkgroups", label, x, y, z),
      setBlendConstant: (c: unknown) => rec("setBlendConstant", label, c),
      draw: (v: number, inst = 1) => rec("draw", label, v, inst),
      end: () => rec(`${kind}.end`, label),
    });
  const queue = trap("queue", {
    submit: (b: unknown[]) => rec("submit", b.length),
    writeBuffer: (buf: { label: string }, off: number, data: ArrayBufferView | ArrayBuffer, dataOff?: number, size?: number) => {
      // (a typed array's offset / size are in ELEMENTS, an ArrayBuffer's in bytes — the WebGPU rule)
      const el = ArrayBuffer.isView(data) ? (data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1 : 1;
      const bytes = size !== undefined ? size * el : (data as ArrayBufferView).byteLength ?? (data as ArrayBuffer).byteLength;
      rec("writeBuffer", buf.label, off, bytes, dataOff ?? 0);
      // keep small uniform payloads for assertions
      if (bytes <= 4096) {
        const ab = data instanceof ArrayBuffer ? data : (data as ArrayBufferView).buffer.slice((data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteOffset + (data as ArrayBufferView).byteLength);
        lastWrite.set(buf.label, (ab as ArrayBuffer).slice(0));
      }
    },
    writeTexture: (dst: { texture: { label: string } }, _d: unknown, _l: unknown, size: number[]) => rec("writeTexture", dst.texture.label, size),
    copyExternalImageToTexture: (src: { flipY?: boolean }, dst: { texture: { label: string } }, size: number[]) => rec("copyExternalImageToTexture", dst.texture.label, size, !!src.flipY),
  });
  const limits = {
    maxStorageBufferBindingSize: o.maxStorageBufferBindingSize ?? 1 << 30,
    maxBufferSize: 1 << 30,
    maxComputeWorkgroupsPerDimension: 65535,
    maxComputeInvocationsPerWorkgroup: 256,
    maxStorageBuffersPerShaderStage: 8,
  };
  const device = trap("device", {
    queue,
    features: new Set(o.timestamps ? ["timestamp-query"] : []),
    limits,
    lost: new Promise<{ reason: string; message: string }>(() => {}),
    onuncapturederror: null as null | ((e: { error: { message: string } }) => void),
    createBuffer: (d: { size: number; usage: number; label?: string }) => { rec("createBuffer", d.label, d.size); return mkBuffer(d); },
    createTexture: (d: { size: [number, number]; label?: string }) => { rec("createTexture", d.label, d.size); return mkTexture(d); },
    createSampler: () => ({}),
    createShaderModule: (d: { code: string; label?: string }) => {
      rec("createShaderModule", d.label);
      const err = Object.entries(o.compileErrors ?? {}).find(([k]) => (d.label ?? "").includes(k));
      return trap("module", {
        code: d.code,
        getCompilationInfo: async () => ({ messages: err ? [{ type: "error", message: err[1], lineNum: 1, linePos: 1 }] : [] }),
      });
    },
    createBindGroup: (d: { label?: string }) => { rec("createBindGroup", d.label); return { bg: id++ }; },
    createBindGroupLayout: (d: { label?: string }) => { rec("createBindGroupLayout", d.label); return { bgl: id++ }; },
    createPipelineLayout: () => ({ pl: id++ }),
    createComputePipelineAsync: async (d: { label?: string }) => { rec("createComputePipelineAsync", d.label); return { pipeline: d.label, getBindGroupLayout: () => ({}) }; },
    createRenderPipelineAsync: async (d: { label?: string }) => { rec("createRenderPipelineAsync", d.label); return { pipeline: d.label, getBindGroupLayout: () => ({}) }; },
    createCommandEncoder: (d?: { label?: string }) => {
      const label = d?.label ?? "";
      rec("createCommandEncoder", label);
      return trap("encoder", {
        beginComputePass: (pd?: { label?: string; timestampWrites?: unknown }) => { rec("beginComputePass", pd?.label, !!pd?.timestampWrites); return pass("compute", pd?.label ?? ""); },
        beginRenderPass: (pd: { label?: string; timestampWrites?: unknown; colorAttachments: { loadOp: string }[] }) => {
          rec("beginRenderPass", pd.label, pd.colorAttachments[0]?.loadOp, !!pd.timestampWrites);
          return pass("render", pd.label ?? "");
        },
        copyBufferToBuffer: (...a: unknown[]) => rec("copyBufferToBuffer", ...a),
        resolveQuerySet: (...a: unknown[]) => rec("resolveQuerySet", ...a),
        finish: () => ({ cb: label }),
      });
    },
    createQuerySet: () => ({ destroy: () => {} }),
    pushErrorScope: () => {},
    popErrorScope: async () => null,
    destroy: () => rec("device.destroy"),
  });
  const adapter = trap("adapter", {
    features: new Set(o.timestamps ? ["timestamp-query"] : []),
    limits,
    info: { vendor: "fake", architecture: "test" },
    requestDevice: async (d: unknown) => { rec("requestDevice", d); return device; },
  });
  const gpu = {
    requestAdapter: async () => { rec("requestAdapter"); return o.adapter === false ? null : adapter; },
    getPreferredCanvasFormat: () => "bgra8unorm" as const,
  };
  const context = trap("context", {
    configure: (d: unknown) => rec("configure", d),
    unconfigure: () => rec("unconfigure"),
    getCurrentTexture: () => mkTexture({ size: [800, 500], label: "canvas" }),
  });
  const canvas = {
    width: 800,
    height: 500,
    style: {} as Record<string, string>,
    getContext: (kind: string) => { rec("getContext", kind); return kind === "webgpu" ? context : null; },
    getBoundingClientRect: () => ({ width: 800, height: 500 }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return { gpu, adapter, device, canvas, calls, buffers, lastWrite };
}

/** Let every pending promise chain settle (pipelines, compile info, maps). */
export async function settle(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
