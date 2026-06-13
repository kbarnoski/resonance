/**
 * gpu.ts — WebGPU compute path for the silk membrane.
 *
 * The headline renderer: a WGSL compute shader runs Verlet integration and
 * position-based distance relaxation on the GPU (the same algorithm as
 * membrane.ts, Jakobsen 2001), one workgroup pass per relaxation iteration.
 * Positions live in storage buffers; after the frame we copy them back to a
 * mappable buffer so the CPU can draw the glowing filaments and read region
 * tension for the audio engine.
 *
 * Everything degrades: makeGpuMembrane() returns null when navigator.gpu is
 * missing or adapter/device requests fail, and the caller falls back to the
 * CPU + Canvas2D path. No throws escape.
 */

import type { Membrane } from "./membrane";

const WGSL = /* wgsl */ `
struct Params {
  cols : u32,
  rows : u32,
  restX : f32,
  restY : f32,
  gravity : f32,
  damp : f32,
  dt2 : f32,
  phase : u32, // 0 = integrate, 1 = relax
};

@group(0) @binding(0) var<storage, read_write> pos  : array<f32>;
@group(0) @binding(1) var<storage, read_write> prev : array<f32>;
@group(0) @binding(2) var<storage, read>       free : array<f32>;
@group(0) @binding(3) var<uniform>             P    : Params;

fn idx(c : u32, r : u32) -> u32 { return r * P.cols + c; }

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let n = P.cols * P.rows;
  if (i >= n) { return; }
  if (free[i] == 0.0) { return; }
  let ix = i * 2u;
  let iy = ix + 1u;
  let x = pos[ix];
  let y = pos[iy];
  let vx = (x - prev[ix]) * P.damp;
  let vy = (y - prev[iy]) * P.damp;
  prev[ix] = x;
  prev[iy] = y;
  pos[ix] = x + vx;
  pos[iy] = y + vy + P.gravity * P.dt2;
}

fn solveLink(a : u32, b : u32, rest : f32) {
  let ax = a * 2u;
  let bx = b * 2u;
  let dx0 = pos[bx] - pos[ax];
  let dy0 = pos[bx + 1u] - pos[ax + 1u];
  let d = max(sqrt(dx0 * dx0 + dy0 * dy0), 1e-6);
  let diff = (d - rest) / d;
  let k = 0.5;
  let fa = free[a];
  let fb = free[b];
  let wsum = fa + fb;
  if (wsum == 0.0) { return; }
  let sa = fa / wsum;
  let sb = fb / wsum;
  let dx = dx0 * diff * k;
  let dy = dy0 * diff * k;
  pos[ax] = pos[ax] + dx * sa * 2.0;
  pos[ax + 1u] = pos[ax + 1u] + dy * sa * 2.0;
  pos[bx] = pos[bx] - dx * sb * 2.0;
  pos[bx + 1u] = pos[bx + 1u] - dy * sb * 2.0;
}

// One thread per row, walking its links left-to-right then its verticals.
// (Red/black-ish: rows are independent for horizontal links; we accept the
// mild order dependence on verticals — it converges over iterations and reads
// as soft silk, which is the goal.)
@compute @workgroup_size(64)
fn relax(@builtin(global_invocation_id) gid : vec3<u32>) {
  let r = gid.x;
  if (r >= P.rows) { return; }
  let restDiag = sqrt(P.restX * P.restX + P.restY * P.restY);
  for (var c : u32 = 0u; c + 1u < P.cols; c = c + 1u) {
    solveLink(idx(c, r), idx(c + 1u, r), P.restX);
  }
  if (r + 1u < P.rows) {
    for (var c : u32 = 0u; c < P.cols; c = c + 1u) {
      solveLink(idx(c, r), idx(c, r + 1u), P.restY);
    }
    for (var c : u32 = 0u; c + 1u < P.cols; c = c + 1u) {
      solveLink(idx(c, r), idx(c + 1u, r + 1u), restDiag);
      solveLink(idx(c + 1u, r), idx(c, r + 1u), restDiag);
    }
  }
}
`;

export type GpuMembrane = {
  device: GPUDevice;
  step: (
    m: Membrane,
    gravity: number,
    damp: number,
    dt2: number,
    iterations: number,
  ) => Promise<void>;
  destroy: () => void;
};

export async function makeGpuMembrane(
  m: Membrane,
): Promise<GpuMembrane | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let device: GPUDevice;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  try {
    const n = m.cols * m.rows;
    const floatBytes = n * 2 * 4;

    const posBuf = device.createBuffer({
      size: floatBytes,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    const prevBuf = device.createBuffer({
      size: floatBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const freeBuf = device.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const paramsBuf = device.createBuffer({
      size: 32, // 6*4 padded up to 16-byte multiple
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const readBuf = device.createBuffer({
      size: floatBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Seed GPU buffers from the CPU membrane's rest state.
    device.queue.writeBuffer(posBuf, 0, m.pos.buffer as ArrayBuffer);
    device.queue.writeBuffer(prevBuf, 0, m.prev.buffer as ArrayBuffer);
    device.queue.writeBuffer(freeBuf, 0, m.free.buffer as ArrayBuffer);

    const shaderModule = device.createShaderModule({ code: WGSL });
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [layout],
    });
    const integratePipe = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: "integrate" },
    });
    const relaxPipe = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: "relax" },
    });
    const bind = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: posBuf } },
        { binding: 1, resource: { buffer: prevBuf } },
        { binding: 2, resource: { buffer: freeBuf } },
        { binding: 3, resource: { buffer: paramsBuf } },
      ],
    });

    // Reusable param scratch (cols,rows as u32 view; floats overlaid).
    const paramU32 = new Uint32Array(8);
    const paramF32 = new Float32Array(paramU32.buffer);

    let mapping = false;

    const step = async (
      mem: Membrane,
      gravity: number,
      damp: number,
      dt2: number,
      iterations: number,
    ): Promise<void> => {
      // Push held-node positions (grabs) into the GPU buffer before solving.
      // We write the whole pos buffer only for grabbed nodes by patching the
      // CPU mirror; cheaper: write just the grabbed entries.
      for (const g of mem.grabs.values()) {
        const off = g.node * 2 * 4;
        const xy = new Float32Array([g.x, g.y]).buffer as ArrayBuffer;
        device.queue.writeBuffer(posBuf, off, xy);
        // Pin prev too so velocity doesn't fling it.
        device.queue.writeBuffer(prevBuf, off, xy);
      }

      paramU32[0] = mem.cols;
      paramU32[1] = mem.rows;
      paramF32[2] = mem.restX;
      paramF32[3] = mem.restY;
      paramF32[4] = gravity;
      paramF32[5] = damp;
      paramF32[6] = dt2;
      paramU32[7] = 0;
      device.queue.writeBuffer(paramsBuf, 0, paramU32.buffer as ArrayBuffer);

      const enc = device.createCommandEncoder();
      const nodeGroups = Math.ceil((mem.cols * mem.rows) / 64);
      const rowGroups = Math.ceil(mem.rows / 64);

      // Integrate.
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(integratePipe);
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroups(nodeGroups);
        pass.end();
      }
      // Relax (re-pinning grabs between iterations via buffer writes is too
      // costly per-iter; instead the relax shader leaves pinned nodes — free=0
      // for the top edge — fixed, and grabbed nodes are re-pinned next frame).
      for (let k = 0; k < iterations; k++) {
        const pass = enc.beginComputePass();
        pass.setPipeline(relaxPipe);
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroups(rowGroups);
        pass.end();
      }

      enc.copyBufferToBuffer(posBuf, 0, readBuf, 0, floatBytes);
      device.queue.submit([enc.finish()]);

      if (!mapping) {
        mapping = true;
        try {
          await readBuf.mapAsync(GPUMapMode.READ);
          const data = new Float32Array(readBuf.getMappedRange());
          mem.pos.set(data);
          readBuf.unmap();
        } catch {
          // Device lost or mapping failed — caller's wrapper handles fallback.
        } finally {
          mapping = false;
        }
      }
    };

    const destroy = () => {
      try {
        posBuf.destroy();
        prevBuf.destroy();
        freeBuf.destroy();
        paramsBuf.destroy();
        readBuf.destroy();
      } catch {
        /* ignore */
      }
    };

    return { device, step, destroy };
  } catch {
    return null;
  }
}
