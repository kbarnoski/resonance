// ─────────────────────────────────────────────────────────────────────────────
// renderer.ts — the WebGL2 GPU particle / point-cloud renderer for "Emerge".
//
//   A volumetric drifting cloud of ~90,000 additive points, drawn in a SINGLE
//   gl.POINTS call. Each point carries two persistent, deterministically-seeded
//   home positions — a tight "body" (a luminous orb) and a wide "cloud" — plus a
//   random vec4. The vertex shader:
//     • blends body↔cloud by u_condense (the arc's boundary controller),
//     • advects each point with analytic 3D curl-noise flow (no ping-pong textures
//       needed — robust, dependency-free) whose amplitude/scale/speed the arc
//       drives, adding a second octave at the dissolution peak,
//     • pushes points outward by u_expansion when the boundary dissolves,
//     • gates visibility by u_population so the onset shows only a few motes,
//     • evolves color from cool teal/indigo → warm neon → white-gold light.
//
//   A center-out radial glow (a full-screen additive triangle) blooms with the
//   dissolution for the "boundless light" at the breakthrough. All GPU objects
//   are tracked so destroy() can fully tear the context down.
// ─────────────────────────────────────────────────────────────────────────────

import type { ArcState } from "./arc";

// Deterministic PRNG for particle seeds (never Math.random for seeds).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAM_DIST = 3.5;

// ── Shared GLSL: Ashima 3D simplex noise + curl ──────────────────────────────
const NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
vec3 snoiseVec3(vec3 x){
  return vec3(
    snoise(x),
    snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
    snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4))
  );
}
vec3 curlNoise(vec3 p){
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 px0 = snoiseVec3(p - dx), px1 = snoiseVec3(p + dx);
  vec3 py0 = snoiseVec3(p - dy), py1 = snoiseVec3(p + dy);
  vec3 pz0 = snoiseVec3(p - dz), pz1 = snoiseVec3(p + dz);
  float x = (py1.z - py0.z) - (pz1.y - pz0.y);
  float y = (pz1.x - pz0.x) - (px1.z - px0.z);
  float z = (px1.y - px0.y) - (py1.x - py0.x);
  return vec3(x, y, z) / (2.0 * e);
}
`;

const POINT_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec3 a_body;
layout(location=1) in vec3 a_cloud;
layout(location=2) in vec4 a_rand;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
uniform float u_condense;
uniform float u_expansion;
uniform float u_flowAmp;
uniform float u_flowScale;
uniform float u_flowSpeed;
uniform float u_dissolve;
uniform float u_warmth;
uniform float u_brightness;
uniform float u_alpha;
uniform float u_population;
uniform float u_pointSize;
uniform float u_camDist;
out vec3 vColor;
out float vAlpha;
${NOISE_GLSL}
void main(){
  float vis = step(a_rand.x, u_population);
  vec3 base = mix(a_cloud, a_body, u_condense);
  // analytic curl-noise advection — the whole flow lives in the vertex shader.
  vec3 flow = curlNoise(base * u_flowScale + u_time * u_flowSpeed + a_rand.yzw * 6.283);
  flow += curlNoise(base * (u_flowScale * 2.3) + u_time * (u_flowSpeed * 1.7)) * (0.45 * u_dissolve);
  vec3 dir = normalize(base + vec3(1e-4));
  vec3 outward = dir * u_expansion * (0.7 + a_rand.z * 1.1);
  vec3 pos = base + flow * u_flowAmp + outward;

  vec4 viewPos = u_view * vec4(pos, 1.0);
  gl_Position = u_proj * viewPos;
  float att = u_pointSize * (u_camDist / max(0.3, -viewPos.z)) * (0.55 + a_rand.w * 0.95);
  gl_PointSize = vis * min(att, 42.0);

  // Evolving luminous spectrum: teal/indigo → neon/amber → white-gold.
  vec3 indigo = vec3(0.16, 0.13, 0.62);
  vec3 teal   = vec3(0.03, 0.52, 0.55);
  vec3 neon   = vec3(1.0, 0.26, 0.5);
  vec3 amber  = vec3(1.0, 0.55, 0.2);
  vec3 gold   = vec3(1.0, 0.92, 0.72);
  vec3 cool = mix(indigo, teal, a_rand.y);
  vec3 warm = mix(neon, amber, a_rand.z);
  vec3 col = mix(cool, warm, smoothstep(0.0, 0.6, u_warmth));
  col = mix(col, mix(gold, vec3(1.0), u_dissolve * 0.6), u_dissolve * 0.85);
  vColor = col * u_brightness;
  vAlpha = u_alpha * (0.4 + 0.6 * a_rand.w) * vis;
}
`;

const POINT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float fall = exp(-d2 * 2.6);
  // premultiplied output for additive (ONE, ONE) blending.
  outColor = vec4(vColor * fall * vAlpha, vAlpha * fall);
}
`;

const GLOW_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vNdc;
void main(){
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vec2 ndc = pos * 2.0 - 1.0;
  vNdc = ndc;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const GLOW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vNdc;
uniform float u_intensity;
uniform float u_aspect;
uniform vec3 u_color;
out vec4 outColor;
void main(){
  vec2 p = vec2(vNdc.x * u_aspect, vNdc.y);
  float r = length(p);
  float g = exp(-r * r * 1.4) * u_intensity;
  outColor = vec4(u_color * g, g);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("Failed to create shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("Failed to create program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("Program link error: " + log);
  }
  return prog;
}

// ── tiny column-major mat4 helpers ───────────────────────────────────────────
type Mat4 = Float32Array;

function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

/** View = translate(0,0,-dist) · rotateX(tilt) · rotateY(angle). Column-major. */
function viewMatrix(angle: number, tilt: number, dist: number): Mat4 {
  const cy = Math.cos(angle), sy = Math.sin(angle);
  const cx = Math.cos(tilt), sx = Math.sin(tilt);
  // R = Rx * Ry
  const r00 = cy, r02 = sy;
  const r10 = sx * sy, r11 = cx, r12 = -sx * cy;
  const r20 = -cx * sy, r21 = sx, r22 = cx * cy;
  // Column-major; translation baked into last column.
  return new Float32Array([
    r00, r10, r20, 0,
    0, r11, r21, 0,
    r02, r12, r22, 0,
    0, 0, -dist, 1,
  ]);
}

export interface Renderer {
  draw(state: ArcState, angle: number, time: number, lum: number, dpr: number): void;
  destroy(): void;
  readonly count: number;
}

/** Build the point-cloud renderer bound to `canvas`. Throws if WebGL2 is
 *  unavailable so the caller can show a graceful notice. */
export function buildRenderer(canvas: HTMLCanvasElement, count: number): Renderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 is not available in this browser.");

  const pointProg = link(gl, POINT_VS, POINT_FS);
  const glowProg = link(gl, GLOW_VS, GLOW_FS);

  // Seed the two home fields deterministically.
  const body = new Float32Array(count * 3);
  const cloud = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  const rnd = mulberry32(0x1263e);
  const unit = (): [number, number, number] => {
    let x = 0, y = 0, z = 0, l = 0;
    do {
      x = rnd() * 2 - 1;
      y = rnd() * 2 - 1;
      z = rnd() * 2 - 1;
      l = x * x + y * y + z * z;
    } while (l > 1 || l < 1e-4);
    l = Math.sqrt(l);
    return [x / l, y / l, z / l];
  };
  for (let i = 0; i < count; i++) {
    const [bx, by, bz] = unit();
    // shell-biased ball → a luminous "body" orb with a denser skin.
    const rb = 0.32 + 0.28 * Math.cbrt(rnd());
    body[i * 3] = bx * rb;
    body[i * 3 + 1] = by * rb * 1.15; // slightly taller — a figure, not a ball
    body[i * 3 + 2] = bz * rb;
    const [cx, cy, cz] = unit();
    const rc = 0.4 + 1.5 * Math.cbrt(rnd());
    cloud[i * 3] = cx * rc;
    cloud[i * 3 + 1] = cy * rc;
    cloud[i * 3 + 2] = cz * rc;
    rand[i * 4] = rnd();
    rand[i * 4 + 1] = rnd();
    rand[i * 4 + 2] = rnd();
    rand[i * 4 + 3] = rnd();
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bodyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bodyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, body, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const cloudBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cloud, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const randBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, randBuf);
  gl.bufferData(gl.ARRAY_BUFFER, rand, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const glowVao = gl.createVertexArray(); // empty VAO for gl_VertexID-only draw

  // Cache uniform locations.
  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const pu = {
    proj: u(pointProg, "u_proj"),
    view: u(pointProg, "u_view"),
    time: u(pointProg, "u_time"),
    condense: u(pointProg, "u_condense"),
    expansion: u(pointProg, "u_expansion"),
    flowAmp: u(pointProg, "u_flowAmp"),
    flowScale: u(pointProg, "u_flowScale"),
    flowSpeed: u(pointProg, "u_flowSpeed"),
    dissolve: u(pointProg, "u_dissolve"),
    warmth: u(pointProg, "u_warmth"),
    brightness: u(pointProg, "u_brightness"),
    alpha: u(pointProg, "u_alpha"),
    population: u(pointProg, "u_population"),
    pointSize: u(pointProg, "u_pointSize"),
    camDist: u(pointProg, "u_camDist"),
  };
  const gu = {
    intensity: u(glowProg, "u_intensity"),
    aspect: u(glowProg, "u_aspect"),
    color: u(glowProg, "u_color"),
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive; fragments output premultiplied color

  let destroyed = false;

  return {
    count,
    draw(state, angle, time, lum, dpr) {
      if (destroyed) return;
      const w = canvas.width;
      const h = canvas.height;
      gl.viewport(0, 0, w, h);
      const aspect = w / Math.max(1, h);

      // Evolving dark void base color (teal → warm, brightening with dissolve).
      const d = state.dissolve;
      const wm = state.warmth;
      gl.clearColor(
        0.006 + 0.02 * wm + 0.05 * d,
        0.02 + 0.01 * wm + 0.045 * d,
        0.035 * (1 - 0.6 * wm) + 0.02 * d,
        1
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      // 1) center-out radial bloom for the "boundless light".
      const glowI = state.dissolve * state.brightness * lum * 0.85;
      if (glowI > 0.001) {
        gl.useProgram(glowProg);
        gl.uniform1f(gu.intensity, glowI);
        gl.uniform1f(gu.aspect, aspect);
        // white-gold at full dissolution.
        gl.uniform3f(gu.color, 0.55 + 0.45 * d, 0.5 + 0.35 * d, 0.32 + 0.18 * d);
        gl.bindVertexArray(glowVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
      }

      // 2) the point cloud — one POINTS draw.
      const proj = perspective((52 * Math.PI) / 180, aspect, 0.1, 20);
      const view = viewMatrix(angle, 0.28, CAM_DIST);
      gl.useProgram(pointProg);
      gl.uniformMatrix4fv(pu.proj, false, proj);
      gl.uniformMatrix4fv(pu.view, false, view);
      gl.uniform1f(pu.time, time);
      gl.uniform1f(pu.condense, state.condense);
      gl.uniform1f(pu.expansion, state.expansion);
      gl.uniform1f(pu.flowAmp, state.flowAmp);
      gl.uniform1f(pu.flowScale, state.flowScale);
      gl.uniform1f(pu.flowSpeed, state.flowSpeed);
      gl.uniform1f(pu.dissolve, state.dissolve);
      gl.uniform1f(pu.warmth, state.warmth);
      gl.uniform1f(pu.brightness, state.brightness * lum);
      gl.uniform1f(pu.alpha, state.alpha);
      gl.uniform1f(pu.population, state.population);
      gl.uniform1f(pu.pointSize, state.pointSize * dpr);
      gl.uniform1f(pu.camDist, CAM_DIST);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        gl.deleteBuffer(bodyBuf);
        gl.deleteBuffer(cloudBuf);
        gl.deleteBuffer(randBuf);
        gl.deleteVertexArray(vao);
        gl.deleteVertexArray(glowVao);
        gl.deleteProgram(pointProg);
        gl.deleteProgram(glowProg);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        // context already gone
      }
    },
  };
}
