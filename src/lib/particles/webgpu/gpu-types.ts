// ─────────────────────────────────────────────────────────────────────────────
// gpu-types.ts — the slice of the WebGPU API the particle engine uses.
//
// TypeScript 5.9's lib.dom has no WebGPU types, and @webgpu/types is not a
// direct dependency of this repo (it only arrives transitively). Rather than
// add a dependency (lockfile churn on the kiosk build), the engine declares the
// exact surface it touches here — module-scoped names (W*), so a future global
// @webgpu/types can never clash. Spec: https://www.w3.org/TR/webgpu/
// ─────────────────────────────────────────────────────────────────────────────

/** GPUBufferUsage flags (spec constants — the globals are not typed here). */
export const BufferUsage = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
} as const;

/** GPUTextureUsage flags. */
export const TextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
} as const;

/** GPUShaderStage flags. */
export const ShaderStage = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const;

/** GPUMapMode flags. */
export const MapMode = { READ: 0x0001, WRITE: 0x0002 } as const;

export type WTextureFormat = "bgra8unorm" | "rgba8unorm" | "r8unorm" | "rgba16float" | "rgba32float" | "r32float";

export interface WAdapterInfo { vendor?: string; architecture?: string; device?: string; description?: string }

export interface WSupportedLimits {
  maxStorageBufferBindingSize: number;
  maxBufferSize: number;
  maxComputeWorkgroupsPerDimension: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxStorageBuffersPerShaderStage: number;
}

export interface WAdapter {
  readonly features: ReadonlySet<string>;
  readonly limits: WSupportedLimits;
  readonly info?: WAdapterInfo;
  requestDevice(desc?: { requiredFeatures?: string[]; requiredLimits?: Record<string, number>; label?: string }): Promise<WDevice>;
}

export interface WGPU {
  requestAdapter(opts?: { powerPreference?: "high-performance" | "low-power" }): Promise<WAdapter | null>;
  getPreferredCanvasFormat(): WTextureFormat;
}

export interface WBuffer {
  readonly size: number;
  readonly mapState?: "unmapped" | "pending" | "mapped";
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

export interface WTexture {
  readonly width: number;
  readonly height: number;
  createView(desc?: object): WTextureView;
  destroy(): void;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WTextureView {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WSampler {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WBindGroup {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WBindGroupLayout {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WPipelineLayout {}
export interface WQuerySet { destroy(): void }

export interface WCompilationMessage { message: string; type: "error" | "warning" | "info"; lineNum: number; linePos: number }
export interface WShaderModule { getCompilationInfo(): Promise<{ messages: readonly WCompilationMessage[] }> }

export interface WComputePipeline { getBindGroupLayout(i: number): WBindGroupLayout }
export interface WRenderPipeline { getBindGroupLayout(i: number): WBindGroupLayout }

export interface WComputePass {
  setPipeline(p: WComputePipeline): void;
  setBindGroup(i: number, g: WBindGroup): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}
export interface WRenderPass {
  setPipeline(p: WRenderPipeline): void;
  setBindGroup(i: number, g: WBindGroup): void;
  setBlendConstant(c: [number, number, number, number] | { r: number; g: number; b: number; a: number }): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndirect(buf: WBuffer, offset: number): void;
  end(): void;
}

export interface WRenderPassColorAttachment {
  view: WTextureView;
  loadOp: "load" | "clear";
  storeOp: "store" | "discard";
  clearValue?: { r: number; g: number; b: number; a: number };
}

export type WTimestampWrites = { querySet: WQuerySet; beginningOfPassWriteIndex?: number; endOfPassWriteIndex?: number };

export interface WCommandEncoder {
  beginComputePass(desc?: { label?: string; timestampWrites?: WTimestampWrites }): WComputePass;
  beginRenderPass(desc: { label?: string; colorAttachments: WRenderPassColorAttachment[]; timestampWrites?: WTimestampWrites }): WRenderPass;
  copyBufferToBuffer(src: WBuffer, srcOffset: number, dst: WBuffer, dstOffset: number, size: number): void;
  resolveQuerySet(q: WQuerySet, first: number, count: number, dst: WBuffer, dstOffset: number): void;
  finish(): WCommandBuffer;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WCommandBuffer {}

export interface WQueue {
  submit(buffers: WCommandBuffer[]): void;
  writeBuffer(buf: WBuffer, offset: number, data: ArrayBufferView | ArrayBufferLike, dataOffset?: number, size?: number): void;
  writeTexture(dst: { texture: WTexture }, data: ArrayBufferView, layout: { bytesPerRow: number; rowsPerImage?: number }, size: [number, number]): void;
  copyExternalImageToTexture(src: { source: unknown; flipY?: boolean }, dst: { texture: WTexture }, size: [number, number]): void;
}

export interface WBindGroupEntry {
  binding: number;
  resource: { buffer: WBuffer; offset?: number; size?: number } | WTextureView | WSampler;
}

export interface WBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: { type: "uniform" | "storage" | "read-only-storage" };
  texture?: { sampleType: "float" | "unfilterable-float" };
  sampler?: { type: "filtering" | "non-filtering" };
  storageTexture?: { access: "write-only"; format: WTextureFormat };
}

export interface WDevice {
  readonly queue: WQueue;
  readonly features: ReadonlySet<string>;
  readonly limits: WSupportedLimits;
  readonly lost: Promise<{ reason: string; message: string }>;
  onuncapturederror: ((e: { error: { message: string } }) => void) | null;
  createBuffer(desc: { size: number; usage: number; mappedAtCreation?: boolean; label?: string }): WBuffer;
  createTexture(desc: { size: [number, number] | { width: number; height: number }; format: WTextureFormat; usage: number; label?: string }): WTexture;
  createSampler(desc?: { magFilter?: "linear" | "nearest"; minFilter?: "linear" | "nearest" }): WSampler;
  createShaderModule(desc: { code: string; label?: string }): WShaderModule;
  createBindGroup(desc: { layout: WBindGroupLayout; entries: WBindGroupEntry[]; label?: string }): WBindGroup;
  createBindGroupLayout(desc: { entries: WBindGroupLayoutEntry[]; label?: string }): WBindGroupLayout;
  createPipelineLayout(desc: { bindGroupLayouts: WBindGroupLayout[]; label?: string }): WPipelineLayout;
  createComputePipelineAsync(desc: { layout: "auto" | WPipelineLayout; compute: { module: WShaderModule; entryPoint: string; constants?: Record<string, number> }; label?: string }): Promise<WComputePipeline>;
  createRenderPipelineAsync(desc: object): Promise<WRenderPipeline>;
  createCommandEncoder(desc?: { label?: string }): WCommandEncoder;
  createQuerySet(desc: { type: "timestamp"; count: number }): WQuerySet;
  pushErrorScope(filter: "validation" | "out-of-memory" | "internal"): void;
  popErrorScope(): Promise<{ message: string } | null>;
  destroy(): void;
}

export interface WCanvasContext {
  configure(desc: { device: WDevice; format: WTextureFormat; alphaMode?: "opaque" | "premultiplied" }): void;
  unconfigure(): void;
  getCurrentTexture(): WTexture;
}

/** navigator.gpu, typed — undefined where WebGPU is absent (or SSR). */
export function navigatorGpu(): WGPU | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as unknown as { gpu?: WGPU }).gpu;
}
