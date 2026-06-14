/// <reference types="@webgpu/types" />
// gpu.ts — the WebGPU spectacle. A slowly rotating equirectangular world of
// tectonic light on black; each quake blooms as a pulse at its (lon,lat),
// ripples outward, and the whole field trembles in sympathy with the audio.
// Palette: deep oxblood red, magma orange, ash grey — geological, not cozy.
//
// A pure-JS Canvas2D fallback (same world + pulses) lives in render2d.ts.

export type GpuQuakePulse = {
  lon: number;
  lat: number;
  mag: number;
  depthN: number; // 0 shallow → 1 deep
  startMs: number; // performance.now() when triggered
};

const MAX_PULSES = 64;

// Each pulse: vec4(lonN, latN, mag, depthN) + vec4(ageSec, _, _, _) packed as 2 vec4
// We pass an array of vec4 pulses + a count + global uniforms.

const SHADER = /* wgsl */ `
struct Uniforms {
  res: vec2f,
  time: f32,
  audioBass: f32,
  audioLevel: f32,
  rotation: f32,
  shake: f32,
  count: f32,
};

// pulse: a = (lonN[-1..1], latN[-1..1], mag, depthN); b = (ageSec, dead, _, _)
struct Pulse { a: vec4f, b: vec4f };

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> pulses: array<Pulse, ${MAX_PULSES}>;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = p[vi] * 0.5 + 0.5;
  return o;
}

const PI = 3.14159265;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// project a sphere surface point (lon,lat after rotation) to screen disc.
// returns vec3(screenX, screenY, frontFacing) in [-1,1] disc space.
fn project(lonDeg: f32, latDeg: f32, rot: f32) -> vec3f {
  let lon = lonDeg * PI / 180.0 + rot;
  let lat = latDeg * PI / 180.0;
  let x = cos(lat) * sin(lon);
  let z = cos(lat) * cos(lon);
  let y = sin(lat);
  // camera looks down -z; tilt slightly
  let tilt = 0.35;
  let yy = y * cos(tilt) - z * sin(tilt);
  let zz = y * sin(tilt) + z * cos(tilt);
  let front = step(0.0, zz);
  return vec3f(x, yy, front);
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let aspect = u.res.x / max(u.res.y, 1.0);
  var p = in.uv * 2.0 - 1.0;
  p.x *= aspect;
  // tremor: whole field shakes with the audio
  let sh = u.shake * 0.04;
  p += vec2f(sin(u.time * 53.0), cos(u.time * 47.0)) * sh;

  let R = 0.82;
  let r = length(p);

  // background: dark with faint magma vignette + audio breathing
  var col = vec3f(0.02, 0.01, 0.012);
  col += vec3f(0.06, 0.02, 0.0) * (1.0 - smoothstep(0.0, 1.6, r)) * (0.4 + u.audioBass * 0.8);

  if (r < R + 0.02) {
    // sphere shading
    let zsph = sqrt(max(0.0, R * R - r * r));
    let n = normalize(vec3f(p, zsph));
    let nlon = atan2(n.x, n.z);
    let nlat = asin(clamp(n.y, -1.0, 1.0));
    // un-rotate to get geographic lon for the static tectonic texture
    let glon = nlon - u.rotation;

    // limb darkening → globe form
    let lim = pow(max(0.0, zsph / R), 0.6);

    // procedural tectonic "plate" glow lines (ash grey ridges)
    let plate = abs(sin(glon * 4.0) * cos(nlat * 3.0));
    let ridge = smoothstep(0.86, 0.99, plate);
    let ash = vec3f(0.16, 0.15, 0.16) * ridge;

    // faint magma graticule
    let grat = smoothstep(0.97, 1.0, abs(sin(nlat * 6.0)));
    let baseGlobe = vec3f(0.05, 0.018, 0.01) * lim;
    col = baseGlobe + ash * lim + vec3f(0.10, 0.03, 0.0) * grat * lim;

    // accumulate quake pulses on the sphere surface
    var nQuakes = i32(u.count);
    var pulseCol = vec3f(0.0);
    for (var i = 0; i < ${MAX_PULSES}; i = i + 1) {
      if (i >= nQuakes) { break; }
      let pa = pulses[i].a;
      let age = pulses[i].b.x;
      if (pulses[i].b.y > 0.5) { continue; } // dead
      let lonDeg = pa.x * 180.0;
      let latDeg = pa.y * 90.0;
      let mag = pa.z;
      let depthN = pa.w;
      // angular distance from this fragment's surface point to the quake
      let qlon = lonDeg * PI / 180.0;
      let qlat = latDeg * PI / 180.0;
      let qv = vec3f(cos(qlat) * sin(qlon), sin(qlat), cos(qlat) * cos(qlon));
      // fragment geographic direction
      let fv = vec3f(cos(nlat) * sin(glon), sin(nlat), cos(nlat) * cos(glon));
      let ang = acos(clamp(dot(qv, fv), -1.0, 1.0)); // radians 0..PI

      // ripple ring expanding with age
      let speed = 0.9;
      let ringR = age * speed;
      let life = clamp(1.0 - age / (1.2 + mag * 0.5), 0.0, 1.0);
      let ring = exp(-pow((ang - ringR) * 14.0, 2.0)) * life;
      // central bloom
      let bloom = exp(-pow(ang * (10.0 - mag), 2.0)) * exp(-age * 2.2);

      // hue: shallow = magma orange, deep = oxblood/violet
      let shallowC = vec3f(1.0, 0.45, 0.08);
      let deepC = vec3f(0.55, 0.05, 0.10);
      let hue = mix(shallowC, deepC, depthN);
      let amp = (ring * 0.7 + bloom * 1.4) * (0.4 + mag * 0.25);
      pulseCol += hue * amp;
    }
    col += pulseCol * lim;
    col += pulseCol; // slight overshoot for flare on big quakes

    // atmosphere rim (oxblood)
    let rim = smoothstep(R - 0.04, R + 0.01, r) * (1.0 - smoothstep(R + 0.01, R + 0.06, r));
    col += vec3f(0.5, 0.08, 0.06) * rim * (0.5 + u.audioLevel);
  }

  // film grain
  col += (hash(in.uv * u.res + u.time) - 0.5) * 0.025;
  // overall audio bloom
  col *= 1.0 + u.audioLevel * 0.5;
  return vec4f(col, 1.0);
}
`;

export type GpuRenderer = {
  render: (params: GpuFrameParams) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
};

export type GpuFrameParams = {
  timeSec: number;
  bass: number;
  level: number;
  rotation: number;
  shake: number;
  pulses: GpuQuakePulse[];
  nowMs: number;
};

// Returns a renderer, or null if WebGPU is unavailable / init fails.
export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuRenderer | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;
  let device: GPUDevice;
  let context: GPUCanvasContext;
  let format: GPUTextureFormat;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const ctx = canvas.getContext("webgpu");
    if (!ctx) return null;
    context = ctx;
    format = nav.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
  } catch {
    return null;
  }

  const shaderModule = device.createShaderModule({ code: SHADER });

  const uniformBuf = device.createBuffer({
    size: 48, // 8 f32 -> 32, padded to 48 for alignment headroom
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // each Pulse = 2 vec4 = 32 bytes
  const pulseBuf = device.createBuffer({
    size: MAX_PULSES * 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: pulseBuf } },
    ],
  });

  const uniformData = new Float32Array(12);
  const pulseData = new Float32Array(MAX_PULSES * 8);
  let disposed = false;

  function render(params: GpuFrameParams) {
    if (disposed) return;
    // pack pulses (most recent MAX_PULSES, alive ones first)
    const alive = params.pulses.filter(
      (q) => (params.nowMs - q.startMs) / 1000 < 1.2 + q.mag * 0.5
    );
    const used = alive.slice(-MAX_PULSES);
    pulseData.fill(0);
    for (let i = 0; i < used.length; i++) {
      const q = used[i];
      const o = i * 8;
      pulseData[o] = Math.max(-1, Math.min(1, q.lon / 180));
      pulseData[o + 1] = Math.max(-1, Math.min(1, q.lat / 90));
      pulseData[o + 2] = q.mag;
      pulseData[o + 3] = q.depthN;
      pulseData[o + 4] = (params.nowMs - q.startMs) / 1000; // age sec
      pulseData[o + 5] = 0; // alive
    }
    device.queue.writeBuffer(pulseBuf, 0, pulseData);

    uniformData[0] = canvas.width;
    uniformData[1] = canvas.height;
    uniformData[2] = params.timeSec;
    uniformData[3] = params.bass;
    uniformData[4] = params.level;
    uniformData[5] = params.rotation;
    uniformData[6] = params.shake;
    uniformData[7] = used.length;
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const encoder = device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function resize(w: number, h: number) {
    canvas.width = w;
    canvas.height = h;
  }

  function dispose() {
    disposed = true;
    try {
      uniformBuf.destroy();
      pulseBuf.destroy();
      device.destroy();
    } catch {
      /* noop */
    }
  }

  return { render, resize, dispose };
}
