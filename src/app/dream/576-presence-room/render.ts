// render.ts — raw WebGL2 fullscreen-triangle renderer for 576-presence-room.
//
// A warm volumetric haze (amber / rose / violet on near-black). Around a ring
// sits one soft glowing orb per drone voice; each orb brightens with its bloom
// (how much the listener is facing/leaning toward it). The whole field also
// drifts in the look direction, so the brightest region tracks where the head
// is "looking". No three.js — shaders are compiled by hand, drawn as a single
// fullscreen triangle with a handful of per-frame uniforms.
//
// If WebGL2 is unavailable, createRenderer returns null and the caller shows a
// text notice (audio still runs).

import { VOICES } from "./audio";

const VERT = `#version 300 es
// Fullscreen triangle: 3 vertices cover the screen, no buffers needed.
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; // 0..2
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const MAX_VOICES = 8;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uLook;            // look direction projected to screen (-1..1)
uniform float uPresence;        // 0..1, dims when no face
uniform int   uCount;
uniform vec2  uOrb[${MAX_VOICES}];   // orb screen pos (-1..1, aspect-corrected)
uniform vec3  uOrbCol[${MAX_VOICES}];
uniform float uOrbGlow[${MAX_VOICES}]; // 0..1 bloom

// cheap value noise for haze
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1,0));
  float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for(int i=0;i<5;i++){ v += amp*noise(p); p*=2.02; amp*=0.5; }
  return v;
}

void main(){
  vec2 uv = (vUv - 1.0); // -1..1
  float aspect = uRes.x / uRes.y;
  uv.x *= aspect;

  // Slow drifting haze, pushed in the look direction so brightness follows gaze.
  vec2 flow = uLook * 0.6;
  float t = uTime * 0.05;
  float haze = fbm(uv * 1.3 + flow + vec2(t, -t*0.7));
  haze = pow(haze, 1.6);

  // Warm base gradient: rose-violet bottom → amber centre, near-black edges.
  vec3 base = mix(vec3(0.05,0.02,0.06), vec3(0.18,0.07,0.05), haze);
  base += vec3(0.10,0.05,0.12) * smoothstep(1.2, 0.0, length(uv));

  vec3 col = base;

  // Soft glowing orbs, one per voice.
  for(int i=0;i<${MAX_VOICES};i++){
    if(i >= uCount) break;
    vec2 o = uOrb[i];
    o.x *= aspect;
    float d = length(uv - o);
    float glow = uOrbGlow[i];
    // core + wide halo; halo widens & brightens with bloom.
    float core = exp(-d*d * 60.0) * (0.6 + glow*1.4);
    float halo = exp(-d*d * (7.0 - glow*4.0)) * (0.25 + glow*0.9);
    // gentle living pulse
    float pulse = 0.85 + 0.15*sin(uTime*0.8 + float(i)*1.7);
    col += uOrbCol[i] * (core + halo) * pulse;
  }

  // Vignette + presence dim.
  float vig = smoothstep(1.7, 0.3, length(uv));
  col *= mix(0.45, 1.0, uPresence) * (0.6 + 0.4*vig);

  // Soft filmic-ish tonemap so blooms never blow out harshly.
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.9));

  frag = vec4(col, 1.0);
}`;

export interface Renderer {
  draw(args: {
    time: number;
    look: [number, number];
    presence: number;
    orbScreen: Array<[number, number]>;
    bloom: number[];
  }): void;
  resize(): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

/** Build the WebGL2 renderer, or null if WebGL2 is unavailable. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  let program: WebGLProgram | null = null;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(program));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  } catch {
    return null;
  }

  gl.useProgram(program);
  const u = {
    res: gl.getUniformLocation(program, "uRes"),
    time: gl.getUniformLocation(program, "uTime"),
    look: gl.getUniformLocation(program, "uLook"),
    presence: gl.getUniformLocation(program, "uPresence"),
    count: gl.getUniformLocation(program, "uCount"),
    orb: gl.getUniformLocation(program, "uOrb"),
    orbCol: gl.getUniformLocation(program, "uOrbCol"),
    orbGlow: gl.getUniformLocation(program, "uOrbGlow"),
  };

  // A VAO is required to draw in WebGL2 even with no attributes.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Static orb colours from the voice defs.
  const cols = new Float32Array(MAX_VOICES * 3);
  VOICES.forEach((v, i) => {
    if (i < MAX_VOICES) {
      cols[i * 3] = v.color[0];
      cols[i * 3 + 1] = v.color[1];
      cols[i * 3 + 2] = v.color[2];
    }
  });
  gl.uniform3fv(u.orbCol, cols);

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  const orbBuf = new Float32Array(MAX_VOICES * 2);
  const glowBuf = new Float32Array(MAX_VOICES);

  function draw(args: {
    time: number;
    look: [number, number];
    presence: number;
    orbScreen: Array<[number, number]>;
    bloom: number[];
  }): void {
    const g = gl!;
    g.useProgram(program);
    g.bindVertexArray(vao);
    const n = Math.min(args.orbScreen.length, MAX_VOICES);
    for (let i = 0; i < n; i++) {
      orbBuf[i * 2] = args.orbScreen[i][0];
      orbBuf[i * 2 + 1] = args.orbScreen[i][1];
      glowBuf[i] = args.bloom[i] ?? 0;
    }
    g.uniform2f(u.res, canvas.width, canvas.height);
    g.uniform1f(u.time, args.time);
    g.uniform2f(u.look, args.look[0], args.look[1]);
    g.uniform1f(u.presence, args.presence);
    g.uniform1i(u.count, n);
    g.uniform2fv(u.orb, orbBuf);
    g.uniform1fv(u.orbGlow, glowBuf);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl!.deleteProgram(program);
    gl!.deleteVertexArray(vao);
  }

  return { draw, resize, dispose };
}
