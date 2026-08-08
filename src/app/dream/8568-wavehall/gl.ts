// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — raw WebGL2 renderer for the wave-hall.
//
// A top-down architectural cross-section of an apsidal nave: graphite ground,
// crisp wall line-work, two stalls. Cast phrases become expanding luminous
// wavefronts that sweep the plan and REFLECT off the walls via the image-source
// method (each wall mirrors the source; the reflected ring appears to emanate
// from the mirrored image source — geometrically exact for a first-order
// bounce). Warm amber = you (LEFT), cool teal = partner (RIGHT). No violet.
//
// Hand-written vertex + fragment GLSL, compiled and linked here. Full-screen
// triangle; all the drawing lives in the fragment shader.
// ─────────────────────────────────────────────────────────────────────────────

/** Hall geometry in world units (shared with audio for arrival timing). */
export const WALL = { x: 1.0, y: 0.6 };
export const STALL_L = { x: -0.82, y: 0 };
export const STALL_R = { x: 0.82, y: 0 };

export const MAX_FRONTS = 12;

export interface Front {
  x: number;
  y: number;
  t0: number; // seconds, same clock as draw time
  amp: number;
  side: 0 | 1; // 0 = you/warm, 1 = partner/cool
  speed: number;
}

export interface DrawState {
  time: number; // seconds since renderer start
  fronts: Front[];
  pulseL: number; // 0..1 stall emission glow
  pulseR: number;
  reduce: boolean;
}

const VERT = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;

uniform vec2 uRes;
uniform vec2 uHalf;      // world half-extent that NDC [-1,1] maps to
uniform float uTime;
uniform vec2 uWall;      // wall half-extents (x,y)
uniform vec2 uStallL;
uniform vec2 uStallR;
uniform vec2 uPulse;     // stall emission glow (L,R)
uniform float uWidth;    // ring thickness
uniform int uCount;
uniform vec4 uFrontA[${MAX_FRONTS}]; // x, y, t0, amp
uniform vec4 uFrontB[${MAX_FRONTS}]; // side, speed, _, _

const vec3 GROUND   = vec3(0.043, 0.048, 0.055);
const vec3 GROUND2  = vec3(0.070, 0.078, 0.090);
const vec3 LINE     = vec3(0.34, 0.40, 0.46);
const vec3 WARM     = vec3(1.00, 0.70, 0.30); // #ffb24d-ish, you
const vec3 COOL     = vec3(0.36, 0.82, 0.86); // teal, partner

// distance to the rectangular nave wall (signed-ish border field)
float wallLine(vec2 p, vec2 h) {
  vec2 d = abs(p) - h;
  float outside = length(max(d, 0.0));
  float inside = min(max(d.x, d.y), 0.0);
  return abs(outside + inside);
}

// one gaussian ring of radius r centred on src
float ring(vec2 p, vec2 src, float r) {
  float d = distance(p, src);
  float x = (d - r) / uWidth;
  return exp(-x * x);
}

// accumulate direct + 4 first-order image-source reflections for one front
float frontLum(vec2 p, vec2 s, float r) {
  float acc = ring(p, s, r);
  // image sources across each wall
  vec2 mL = vec2(-2.0 * uWall.x - s.x, s.y);
  vec2 mR = vec2( 2.0 * uWall.x - s.x, s.y);
  vec2 mB = vec2(s.x, -2.0 * uWall.y - s.y);
  vec2 mT = vec2(s.x,  2.0 * uWall.y - s.y);
  // reflected rings fade in once the direct front has reached that wall
  float gL = smoothstep(0.0, uWidth * 3.0, r - (s.x + uWall.x));
  float gR = smoothstep(0.0, uWidth * 3.0, r - (uWall.x - s.x));
  float gB = smoothstep(0.0, uWidth * 3.0, r - (s.y + uWall.y));
  float gT = smoothstep(0.0, uWidth * 3.0, r - (uWall.y - s.y));
  acc += 0.42 * (ring(p, mL, r) * gL + ring(p, mR, r) * gR
              +  ring(p, mB, r) * gB + ring(p, mT, r) * gT);
  return acc;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec2 p = ndc * uHalf;

  // ground: soft graphite with a faint central sonar gradient
  float vig = smoothstep(1.6, 0.2, length(p * vec2(0.62, 1.0)));
  vec3 col = mix(GROUND, GROUND2, vig * 0.6);

  // nave interior wash (slightly lifted inside the walls)
  float insideMask = smoothstep(0.02, -0.03,
      max(abs(p.x) - uWall.x, abs(p.y) - uWall.y));
  col += GROUND2 * 0.5 * insideMask;

  // apsidal end arcs (decorative) at both short walls
  float apseR = uWall.y;
  float aL = abs(distance(p, vec2(-uWall.x, 0.0)) - apseR);
  float aR = abs(distance(p, vec2( uWall.x, 0.0)) - apseR);
  float apseMask = step(abs(p.x), uWall.x + 0.001);
  float apse = (smoothstep(0.012, 0.0, aL) + smoothstep(0.012, 0.0, aR)) * apseMask;

  // walls
  float wl = wallLine(p, uWall);
  float wall = smoothstep(0.014, 0.0, wl);
  col = mix(col, LINE, clamp(wall + apse * 0.7, 0.0, 1.0) * 0.9);

  // centre axis + a couple of pew rows for architectural read
  float axis = smoothstep(0.004, 0.0, abs(p.y)) * insideMask * 0.18;
  col += LINE * axis;

  // stall markers (brackets) with emission glow
  float sl = distance(p, uStallL);
  float sr = distance(p, uStallR);
  col += WARM * (smoothstep(0.055, 0.0, sl) * (0.35 + uPulse.x * 0.9));
  col += COOL * (smoothstep(0.055, 0.0, sr) * (0.35 + uPulse.y * 0.9));
  // faint stall ring outlines
  col += WARM * smoothstep(0.006, 0.0, abs(sl - 0.05)) * 0.5;
  col += COOL * smoothstep(0.006, 0.0, abs(sr - 0.05)) * 0.5;

  // travelling wavefronts
  float warmAcc = 0.0;
  float coolAcc = 0.0;
  for (int i = 0; i < ${MAX_FRONTS}; i++) {
    if (i >= uCount) break;
    vec4 fa = uFrontA[i];
    vec4 fb = uFrontB[i];
    float age = uTime - fa.z;
    if (age < 0.0) continue;
    float r = fb.y * age;
    float env = fa.w * exp(-age * 0.9);
    float lum = frontLum(p, fa.xy, r) * env;
    if (fb.x < 0.5) warmAcc += lum; else coolAcc += lum;
  }
  // keep the interior brighter than the exterior so reflections read as "in room"
  float roomGain = mix(0.5, 1.0, insideMask);
  col += WARM * warmAcc * roomGain;
  col += COOL * coolAcc * roomGain;

  // gentle filmic clamp — smooth luminance, never a hard strobe
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.82));
  o = vec4(col, 1.0);
}`;

export interface Renderer {
  resize: () => void;
  draw: (s: DrawState) => void;
  dispose: () => void;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the renderer, or return null if WebGL2 is unavailable / shaders fail. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  const loc = {
    res: u("uRes"),
    half: u("uHalf"),
    time: u("uTime"),
    wall: u("uWall"),
    stallL: u("uStallL"),
    stallR: u("uStallR"),
    pulse: u("uPulse"),
    width: u("uWidth"),
    count: u("uCount"),
    frontA: u("uFrontA"),
    frontB: u("uFrontB"),
  };

  const frontA = new Float32Array(MAX_FRONTS * 4);
  const frontB = new Float32Array(MAX_FRONTS * 4);

  // world half-extent so the hall fits with margin, aspect-preserving
  let halfX = 1.25;
  let halfY = 0.85;

  function resize() {
    const view = gl as WebGL2RenderingContext;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    view.viewport(0, 0, w, h);
    // fit hall (half-extent ~1.15 x 0.75 incl. margin) into the viewport
    const HX = 1.18;
    const HY = 0.78;
    const viewAspect = w / h;
    const hallAspect = HX / HY;
    if (viewAspect > hallAspect) {
      halfY = HY;
      halfX = HY * viewAspect;
    } else {
      halfX = HX;
      halfY = HX / viewAspect;
    }
  }

  function draw(s: DrawState) {
    const view = gl as WebGL2RenderingContext;
    const n = Math.min(s.fronts.length, MAX_FRONTS);
    for (let i = 0; i < n; i++) {
      const f = s.fronts[i];
      frontA[i * 4] = f.x;
      frontA[i * 4 + 1] = f.y;
      frontA[i * 4 + 2] = f.t0;
      frontA[i * 4 + 3] = f.amp;
      frontB[i * 4] = f.side;
      frontB[i * 4 + 1] = f.speed;
    }
    view.useProgram(prog);
    view.bindVertexArray(vao);
    view.uniform2f(loc.res, canvas.width, canvas.height);
    view.uniform2f(loc.half, halfX, halfY);
    view.uniform1f(loc.time, s.time);
    view.uniform2f(loc.wall, WALL.x, WALL.y);
    view.uniform2f(loc.stallL, STALL_L.x, STALL_L.y);
    view.uniform2f(loc.stallR, STALL_R.x, STALL_R.y);
    view.uniform2f(loc.pulse, s.pulseL, s.pulseR);
    view.uniform1f(loc.width, s.reduce ? 0.055 : 0.038);
    view.uniform1i(loc.count, n);
    view.uniform4fv(loc.frontA, frontA);
    view.uniform4fv(loc.frontB, frontB);
    view.drawArrays(view.TRIANGLES, 0, 3);
  }

  function dispose() {
    const view = gl as WebGL2RenderingContext;
    view.deleteProgram(prog);
    view.deleteBuffer(buf);
    view.deleteVertexArray(vao);
    const lose = view.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  }

  return { resize, draw, dispose };
}
