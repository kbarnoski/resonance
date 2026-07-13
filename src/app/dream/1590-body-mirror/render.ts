// render.ts — raw WebGL2 renderer for 1590 · Body Mirror.
//
// A single full-screen fragment shader paints the room's response to the body:
// a warm, breathing wash + glowing trails that follow each hand + bright cores
// at the hands + a filament that binds the two hands when both are raised.
// Palette is deliberately WARM / EMBODIED (copper · amber · teal) — this is the
// ART canvas, where off-violet hues are sanctioned. No Canvas2D is used.

export interface TrailPoint {
  x: number; // 0..1 screen
  y: number; // 0..1 screen (y-down, as sampled)
  life: number; // 1 → 0
  hue: number; // 0..1 into the warm ramp
}

export interface HandRenderState {
  x: number;
  y: number;
  present: boolean;
  energy: number; // pinch flash 0..1
  hue: number;
}

export interface RenderState {
  time: number;
  points: TrailPoint[];
  hands: HandRenderState[];
  swell: number; // 0..1 chord swell
}

const MAX_POINTS = 64;

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform int uCount;
uniform vec4 uPoints[${MAX_POINTS}]; // xy=pos(0..1,y-down), z=life, w=hue
uniform vec4 uHands[2];              // xy=pos, z=present, w=energy
uniform float uSwell;

// Warm embodied ramp: copper -> amber -> teal.
vec3 warm(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 copper = vec3(0.85, 0.34, 0.14);
  vec3 amber  = vec3(1.00, 0.66, 0.24);
  vec3 teal   = vec3(0.10, 0.72, 0.66);
  if(t < 0.5) return mix(copper, amber, t / 0.5);
  return mix(amber, teal, (t - 0.5) / 0.5);
}

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0));
  float d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;          // 0..1, y-up
  float aspect = uRes.x / uRes.y;

  // Work in a y-down space to match sampled hand coords, aspect-corrected.
  vec2 P = vec2(uv.x, 1.0 - uv.y);
  P.x *= aspect;

  vec3 col = vec3(0.0);

  // --- Warm breathing background wash ---
  float flow = noise(P * 2.2 + vec2(uTime * 0.05, uTime * 0.03));
  flow += 0.5 * noise(P * 4.5 - vec2(uTime * 0.02, 0.0));
  float bg = 0.03 + 0.05 * flow + 0.06 * uSwell;
  vec2 c = P - vec2(0.5 * aspect, 0.5);
  float vig = 1.0 - 0.9 * dot(c, c);
  col += warm(0.08 + 0.25 * flow) * bg * vig;

  // --- Glowing trails ---
  for(int i = 0; i < ${MAX_POINTS}; i++){
    if(i >= uCount) break;
    vec4 pt = uPoints[i];
    vec2 pp = vec2(pt.x, pt.y);
    pp.x *= aspect;
    float d = distance(P, pp);
    float life = pt.z;
    float glow = life * life * 0.0016 / (d * d + 0.0004);
    col += warm(pt.w) * glow;
  }

  // --- Hand cores + pinch flash + binding filament ---
  vec2 hp[2];
  float present[2];
  for(int h = 0; h < 2; h++){
    vec4 hd = uHands[h];
    vec2 p = vec2(hd.x, hd.y); p.x *= aspect;
    hp[h] = p;
    present[h] = hd.z;
    if(hd.z > 0.5){
      float d = distance(P, p);
      float core = 0.0022 / (d * d + 0.0003);
      float energy = hd.w;
      col += warm(h == 0 ? 0.18 : 0.9) * core * (0.8 + 2.5 * energy);
    }
  }

  // Filament between two raised hands, brightened by the chord swell.
  if(present[0] > 0.5 && present[1] > 0.5){
    vec2 a = hp[0]; vec2 b = hp[1];
    vec2 ab = b - a;
    float t = clamp(dot(P - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    vec2 proj = a + t * ab;
    float d = distance(P, proj);
    float line = (0.0009 + 0.0016 * uSwell) / (d * d + 0.0006);
    col += warm(0.5) * line * (0.3 + 0.9 * uSwell);
  }

  // Gentle filmic-ish tone curve, no hard clipping / no strobe.
  col = col / (col + vec3(0.8));
  col = pow(col, vec3(0.85));
  outColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export interface Renderer {
  render(state: RenderState): void;
  resize(): void;
  dispose(): void;
}

/** Build a WebGL2 renderer for `canvas`. Throws if WebGL2 is unavailable —
 *  callers must catch and degrade gracefully. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!ctx) throw new Error("WebGL2 unavailable");
  // Bind to a non-null local so narrowing survives inside the closures below.
  const gl: WebGL2RenderingContext = ctx;

  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error("program link failed: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(prog);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uCount = gl.getUniformLocation(prog, "uCount");
  const uPoints = gl.getUniformLocation(prog, "uPoints");
  const uHands = gl.getUniformLocation(prog, "uHands");
  const uSwell = gl.getUniformLocation(prog, "uSwell");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const pointBuf = new Float32Array(MAX_POINTS * 4);
  const handBuf = new Float32Array(2 * 4);

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(state: RenderState): void {
    resize();
    const count = Math.min(state.points.length, MAX_POINTS);
    for (let i = 0; i < count; i++) {
      const p = state.points[i];
      pointBuf[i * 4] = p.x;
      pointBuf[i * 4 + 1] = p.y;
      pointBuf[i * 4 + 2] = p.life;
      pointBuf[i * 4 + 3] = p.hue;
    }
    for (let h = 0; h < 2; h++) {
      const hd = state.hands[h];
      handBuf[h * 4] = hd ? hd.x : 0;
      handBuf[h * 4 + 1] = hd ? hd.y : 0;
      handBuf[h * 4 + 2] = hd && hd.present ? 1 : 0;
      handBuf[h * 4 + 3] = hd ? hd.energy : 0;
    }

    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, state.time);
    gl.uniform1i(uCount, count);
    gl.uniform4fv(uPoints, pointBuf);
    gl.uniform4fv(uHands, handBuf);
    gl.uniform1f(uSwell, state.swell);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return { render, resize, dispose };
}

export { MAX_POINTS };
