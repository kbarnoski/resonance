// ─────────────────────────────────────────────────────────────────────────────
// aurora.ts — the data-driven aurora renderer.
//
// Primary: a hand-written WGSL fullscreen fragment shader (WebGPU). Vertical
// auroral curtains built from curl-noise (Bridson) flow drift; turbulence,
// height and palette track the live solar wind:
//   bz south → bright crimson/violet surge (substorm)   ·  quiet → faint green
//   kp       → flicker / detuned shimmer                 ·  speed → drift rate
//
// Fallback: an equivalent Canvas2D aurora (same uniforms) with a visible badge,
// used when navigator.gpu is missing. The curtain is alive from frame one.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuroraUniforms {
  south: number; // 0..1 southward-Bz openness (the trigger)
  kp: number; // 0..1 normalized storm level
  speed: number; // 0..1 normalized wind speed
  density: number; // 0..1 normalized plasma density
}

export type Backend = "webgpu" | "canvas2d";

export interface AuroraRenderer {
  backend: Backend;
  render: (timeSec: number, u: AuroraUniforms) => void;
  resize: () => void;
  dispose: () => void;
}

const WGSL = /* wgsl */ `
struct Uni {
  res   : vec2<f32>,
  time  : f32,
  south : f32,
  kp    : f32,
  speed : f32,
  dens  : f32,
  _pad  : f32,
};
@group(0) @binding(0) var<uniform> U : Uni;

// hash / value noise --------------------------------------------------------
fn hash2(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i + vec2<f32>(0.0, 0.0));
  let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0));
  let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0; var s = 0.0; var a = 0.5;
  for (var i = 0; i < 5; i = i + 1) {
    s = s + a * vnoise(p);
    p = p * 2.02 + vec2<f32>(11.3, 7.7);
    a = a * 0.5;
  }
  return s;
}
// curl of a scalar potential field → divergence-free flow (Bridson curl noise)
fn curl(p: vec2<f32>) -> vec2<f32> {
  let e = 0.06;
  let n1 = fbm(p + vec2<f32>(0.0, e));
  let n2 = fbm(p - vec2<f32>(0.0, e));
  let n3 = fbm(p + vec2<f32>(e, 0.0));
  let n4 = fbm(p - vec2<f32>(e, 0.0));
  return vec2<f32>((n1 - n2), -(n3 - n4)) / (2.0 * e);
}

@vertex
fn vsMain(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  return vec4<f32>(p[vi], 0.0, 1.0);
}

@fragment
fn fsMain(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  var uv = frag.xy / U.res;        // 0..1, y down
  uv.y = 1.0 - uv.y;               // y up
  let aspect = U.res.x / U.res.y;
  let x = (uv.x - 0.5) * aspect;

  let t = U.time;
  let drift = t * (0.05 + 0.22 * U.speed);

  // curl-noise flow displaces the vertical curtains horizontally.
  let flow = curl(vec2<f32>(x * 1.6, uv.y * 1.2 - drift));
  let warp = flow.x * (0.18 + 0.5 * U.south) + flow.y * 0.1;

  // multiple vertical bands; storm raises their height + count of visible folds.
  let bands = 2.5 + 5.0 * U.south;
  let curtain = fbm(vec2<f32>((x + warp) * bands, uv.y * 1.4 - drift * 1.3));

  // vertical envelope: curtains rise from the horizon; south pushes them taller.
  let height = 0.35 + 0.55 * U.south;
  let vert = smoothstep(0.0, 0.18, uv.y) * (1.0 - smoothstep(height, height + 0.5, uv.y));

  // flicker from Kp (storm) — fast detuned shimmer.
  let flick = 1.0 + U.kp * 0.35 * sin(t * (9.0 + 24.0 * U.kp) + uv.x * 30.0 + curtain * 8.0);

  var bright = pow(curtain, 1.6) * vert * flick;
  bright = bright * (0.5 + 1.6 * (0.25 + U.south));

  // palette: quiet = faint green; storm-south = crimson + violet at the crown.
  let green  = vec3<f32>(0.486, 1.0, 0.698);   // #7CFFB2-ish
  let violet = vec3<f32>(0.62, 0.36, 0.95);
  let crimson= vec3<f32>(1.0, 0.22, 0.36);
  let stormMix = clamp(U.south * 0.9 + U.kp * 0.5, 0.0, 1.0);
  var col = mix(green, violet, smoothstep(0.2, 0.9, stormMix) * smoothstep(0.3, 0.95, uv.y));
  col = mix(col, crimson, stormMix * smoothstep(0.45, 1.0, uv.y) * 0.8);

  // density adds a granular sparkle dust low in the sky.
  let dust = step(0.985 - U.dens * 0.02, hash2(floor(frag.xy * 0.5) + floor(vec2<f32>(t * 8.0))));
  let dustCol = green * dust * U.dens * vert * 0.5;

  var rgb = col * bright + dustCol;
  // near-black sky with a faint cold base glow at the horizon.
  let sky = vec3<f32>(0.01, 0.02, 0.05) + green * 0.03 * smoothstep(0.4, 0.0, uv.y);
  rgb = rgb + sky;
  rgb = rgb / (rgb + vec3<f32>(1.0)); // reinhard tone-map
  return vec4<f32>(rgb, 1.0);
}
`;

// ── WebGPU backend ───────────────────────────────────────────────────────────
async function makeWebGPU(
  canvas: HTMLCanvasElement,
): Promise<AuroraRenderer | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const shaderModule = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vsMain" },
    fragment: { module: shaderModule, entryPoint: "fsMain", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const uniformBuf = device.createBuffer({
    size: 32, // 8 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });
  const uData = new Float32Array(8);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  resize();

  const render = (timeSec: number, u: AuroraUniforms) => {
    uData[0] = canvas.width;
    uData[1] = canvas.height;
    uData[2] = timeSec;
    uData[3] = u.south;
    uData[4] = u.kp;
    uData[5] = u.speed;
    uData[6] = u.density;
    uData[7] = 0;
    device.queue.writeBuffer(uniformBuf, 0, uData);

    const view = ctx.getCurrentTexture().createView();
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  };

  return {
    backend: "webgpu",
    render,
    resize,
    dispose: () => {
      try {
        device.destroy();
      } catch {
        /* noop */
      }
    },
  };
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
// Same data-driven curtains, drawn as stacked translucent vertical bands.
function makeCanvas2D(canvas: HTMLCanvasElement): AuroraRenderer {
  const ctx = canvas.getContext("2d")!;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  resize();

  // cheap value-noise so the JS curtains share the WGSL look.
  const hash = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi),
      b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1),
      d = hash(xi + 1, yi + 1);
    return (
      a * (1 - u) * (1 - v) +
      b * u * (1 - v) +
      c * (1 - u) * v +
      d * u * v
    );
  };

  const render = (timeSec: number, u: AuroraUniforms) => {
    const w = canvas.width,
      h = canvas.height;
    // near-black sky
    ctx.fillStyle = "#02030a";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const drift = timeSec * (0.4 + 1.6 * u.speed);
    const height = 0.35 + 0.55 * u.south;
    const cols = 120;
    const stormMix = Math.min(1, u.south * 0.9 + u.kp * 0.5);

    for (let i = 0; i < cols; i++) {
      const fx = i / cols;
      const x = fx * w;
      const warp =
        (noise(fx * 5 + 13, drift * 0.3) - 0.5) * (40 + 220 * u.south);
      const n = noise(fx * (3 + 6 * u.south) + warp * 0.01, drift * 0.5);
      const top = h * (1 - height * (0.6 + n * 0.7));
      const flick =
        1 + u.kp * 0.4 * Math.sin(timeSec * (9 + 24 * u.kp) + fx * 30 + n * 8);
      const bright = Math.pow(n, 1.4) * (0.3 + u.south) * flick;
      if (bright <= 0.02) continue;

      // palette interpolation green → violet → crimson
      let r = 124,
        g = 255,
        b = 178;
      if (stormMix > 0.2) {
        const m = Math.min(1, (stormMix - 0.2) / 0.7);
        r = Math.round(124 + m * (158 - 124));
        g = Math.round(255 + m * (92 - 255));
        b = Math.round(178 + m * (242 - 178));
        if (stormMix > 0.5) {
          const c2 = (stormMix - 0.5) * 1.6;
          r = Math.round(r + c2 * (255 - r));
          g = Math.round(g + c2 * (56 - g));
          b = Math.round(b + c2 * (92 - b));
        }
      }
      const grad = ctx.createLinearGradient(0, h * (1 - 0.0), 0, top);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${0.08 * bright})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${0.22 * bright})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, top, Math.ceil(w / cols) + 1, h - top);
    }

    // density dust
    if (u.density > 0.1) {
      ctx.fillStyle = `rgba(124,255,178,${0.18 * u.density})`;
      const dots = Math.floor(u.density * 120);
      for (let i = 0; i < dots; i++) {
        const dx = hash(i, Math.floor(timeSec * 6)) * w;
        const dy = h * (0.4 + hash(i + 9, Math.floor(timeSec * 6)) * 0.5);
        ctx.fillRect(dx, dy, 2, 2);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  };

  return {
    backend: "canvas2d",
    render,
    resize,
    dispose: () => {
      /* nothing to release */
    },
  };
}

export async function makeAurora(
  canvas: HTMLCanvasElement,
): Promise<AuroraRenderer> {
  try {
    const gpu = await makeWebGPU(canvas);
    if (gpu) return gpu;
  } catch {
    // fall through to Canvas2D
  }
  return makeCanvas2D(canvas);
}
