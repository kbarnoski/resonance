// The luminous ocean-energy field. WebGPU preferred (fullscreen fragment
// shader of interfering swell wavefronts + caustic light); Canvas2D fallback
// (layered sine-band waves + glow). Both reactive to live drone level and the
// real wave_period / height / direction.

import type { SwellState } from "./ocean";

export type FieldParams = {
  // Visual-facing distilled values, all pre-normalised by the caller.
  level: number; // 0..1 audio level (crest brightness)
  height: number; // 0..1 wave height (energy / contrast)
  wavelength: number; // 0..1 from wave period (longer = bigger waves)
  dirRad: number; // flow angle in radians from wave direction
};

export type FieldHandle = {
  kind: "webgpu" | "canvas2d";
  resize: (w: number, h: number, dpr: number) => void;
  render: (p: FieldParams, time: number) => void;
  dispose: () => void;
};

export function paramsFromSwell(s: SwellState, level: number): FieldParams {
  const height = Math.max(0, Math.min(1, (s.waveHeight - 0.4) / 3.6));
  const wavelength = Math.max(0, Math.min(1, (s.wavePeriod - 6) / 10));
  // Compass degrees: 0 = from North. Convert to a flow direction in radians.
  const dirRad = ((s.waveDir + 180) % 360) * (Math.PI / 180);
  return { level, height, wavelength, dirRad };
}

// ── WebGPU path ─────────────────────────────────────────────────────────────

const WGSL = /* wgsl */ `
struct U {
  res: vec2f,
  time: f32,
  level: f32,
  height: f32,
  wavelength: f32,
  dirCos: f32,
  dirSin: f32,
};
@group(0) @binding(0) var<uniform> u: U;

struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,6>(
    vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1),
    vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy, 0, 1), xy);
}

fn hashF(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn smoothNoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hashF(i),             hashF(i + vec2f(1,0)), s.x),
    mix(hashF(i + vec2f(0,1)), hashF(i + vec2f(1,1)), s.x),
    s.y);
}

@fragment fn fs(in: V) -> @location(0) vec4f {
  let aspect = u.res.x / max(u.res.y, 1.0);
  var uv = in.uv;
  uv.x = uv.x * aspect;

  // Flow direction from real wave direction.
  let dir = vec2f(u.dirCos, u.dirSin);
  let perp = vec2f(-dir.y, dir.x);

  // Wavelength from wave period: longer period -> larger, slower waves.
  let waveK = mix(11.0, 4.0, u.wavelength);     // spatial frequency
  let speed = mix(0.35, 0.16, u.wavelength);    // crest travel speed
  let t = u.time * speed;

  // Three interfering swell wavefronts at slightly fanned angles.
  var energy = 0.0;
  for (var n = 0; n < 3; n = n + 1) {
    let fan = (f32(n) - 1.0) * 0.28;
    let d = dir * cos(fan) + perp * sin(fan);
    let phase = dot(uv, d) * waveK - t * 6.2831 - f32(n) * 1.7;
    // caustic-like sharpened crests
    let w = sin(phase) * 0.5 + 0.5;
    energy = energy + pow(w, mix(1.4, 3.2, u.height)) / 3.0;
  }

  // Slow drifting noise gives the sea-surface texture.
  let nz = smoothNoise(uv * 3.0 + dir * t * 1.5);
  energy = energy * (0.78 + 0.34 * nz);

  // Breath: whole field brightens with the audio level.
  let breath = 0.35 + 1.15 * u.level;
  energy = energy * breath;

  // Deep teal/indigo base -> aqua mids -> warm gold on crests.
  let deep   = vec3f(0.02, 0.06, 0.11);
  let indigo = vec3f(0.05, 0.10, 0.22);
  let aqua   = vec3f(0.10, 0.45, 0.52);
  let gold   = vec3f(1.00, 0.78, 0.42);

  var col = mix(deep, indigo, smoothstep(0.0, 0.4, energy));
  col = mix(col, aqua, smoothstep(0.25, 0.8, energy));
  // gold only on the brightest crests, scaled by height (bigger seas glow more)
  let crest = smoothstep(0.72, 1.05, energy) * (0.4 + 0.6 * u.height);
  col = mix(col, gold, crest);

  // gentle vignette toward the deep
  let vig = 1.0 - 0.5 * dot(in.uv, in.uv);
  col = col * vig;

  return vec4f(col, 1.0);
}
`;

export async function buildWebGPUField(canvas: HTMLCanvasElement): Promise<FieldHandle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const shaderModule = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  // 8 floats -> 32 bytes (round to 16-byte multiple is fine at 32).
  const uniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformData = new Float32Array(8);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });

  let disposed = false;

  function resize(w: number, h: number, dpr: number) {
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
  }

  function render(p: FieldParams, time: number) {
    if (disposed) return;
    uniformData[0] = canvas.width;
    uniformData[1] = canvas.height;
    uniformData[2] = time;
    uniformData[3] = p.level;
    uniformData[4] = p.height;
    uniformData[5] = p.wavelength;
    uniformData[6] = Math.cos(p.dirRad);
    uniformData[7] = Math.sin(p.dirRad);
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const view = ctx!.getCurrentTexture().createView();
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.06, b: 0.11, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  function dispose() {
    disposed = true;
    try {
      device.destroy();
    } catch {
      // ignore
    }
  }

  return { kind: "webgpu", resize, render, dispose };
}

// ── Canvas2D fallback ─────────────────────────────────────────────────────────

export function buildCanvas2DField(canvas: HTMLCanvasElement): FieldHandle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let W = 1;
  let H = 1;
  let dprS = 1;

  function resize(w: number, h: number, dpr: number) {
    dprS = dpr;
    W = Math.max(1, Math.floor(w * dpr));
    H = Math.max(1, Math.floor(h * dpr));
    canvas.width = W;
    canvas.height = H;
  }

  function render(p: FieldParams, time: number) {
    const c = ctx!;
    // deep base wash
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#08111f");
    bg.addColorStop(1, "#04080f");
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    const dirX = Math.cos(p.dirRad);
    const dirY = Math.sin(p.dirRad);
    const bands = 7 + Math.round(p.height * 6);
    const waveLenPx = (60 + p.wavelength * 140) * dprS;
    const speed = (40 - p.wavelength * 22) * dprS;
    const breath = 0.4 + 1.2 * p.level;

    c.globalCompositeOperation = "lighter";
    for (let b = 0; b < bands; b++) {
      const fb = b / bands;
      // base line position sweeps along the flow direction
      const baseOff = fb * H * 1.4 - H * 0.2;
      const amp = (18 + p.height * 46) * dprS * (0.6 + 0.4 * Math.sin(fb * 6.0 + time));
      const phase = time * speed * 0.06 + b * 1.3;

      c.beginPath();
      const step = Math.max(4, Math.floor(W / 160));
      for (let x = 0; x <= W; x += step) {
        // project across flow direction for an angled wavefront
        const along = (x * dirX + baseOff * dirY) / waveLenPx;
        const y =
          baseOff +
          Math.sin(along * Math.PI * 2 + phase) * amp +
          Math.sin(along * Math.PI * 4.3 + phase * 1.7) * amp * 0.35;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }

      // crest brightness from audio level + height; warm gold on the brightest
      const crest = Math.max(0, Math.min(1, breath * (0.4 + 0.6 * Math.sin(fb * 9 + time * 0.5))));
      const aquaA = 0.10 + 0.16 * crest;
      c.strokeStyle = `rgba(60, 190, 200, ${aquaA.toFixed(3)})`;
      c.lineWidth = (1 + p.height * 2) * dprS;
      c.stroke();

      if (crest > 0.55) {
        const goldA = (crest - 0.55) * (0.5 + 0.5 * p.height);
        c.strokeStyle = `rgba(255, 200, 110, ${Math.min(0.6, goldA).toFixed(3)})`;
        c.lineWidth = (0.8 + p.height) * dprS;
        c.stroke();
      }
    }

    // overall breathing glow
    const glow = c.createRadialGradient(
      W * 0.5,
      H * 0.55,
      0,
      W * 0.5,
      H * 0.55,
      Math.max(W, H) * 0.7,
    );
    const gA = 0.04 + 0.12 * p.level;
    glow.addColorStop(0, `rgba(40, 120, 140, ${gA.toFixed(3)})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
  }

  function dispose() {
    // nothing retained
  }

  return { kind: "canvas2d", resize, render, dispose };
}
