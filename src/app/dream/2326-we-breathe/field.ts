// field.ts — raw WebGL2 fullscreen fragment field (no three.js, no Canvas2D).
//
// A warm-dawn respiratory field. Each present breath-oscillator is a soft warm
// bloom that swells on its own inhale. The EMERGENT coherence R reshapes the
// whole field: low R domain-warps and grains it and shifts it cool and choppy
// ("many"); high R merges the blooms into one slow warm swell ("one"). The
// collective breath phase gently breathes the global luminance at breath rate
// (≤0.3 Hz). No fast flicker anywhere — motion is all slow luminance drift.
//
// All hex/warm-dawn colour lives HERE, inside the art layer (per house rules);
// the React chrome uses only semantic tokens.

export const MAX_PRESENCES = 12;

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uR;         // emergent coherence 0..1
uniform float uMeanPhase; // collective breath phase
uniform float uReduced;   // 1.0 => prefers-reduced-motion
uniform int   uCount;
uniform vec2  uPos[${MAX_PRESENCES}];
uniform float uPhase[${MAX_PRESENCES}];
uniform float uEnergy[${MAX_PRESENCES}];
uniform float uHue[${MAX_PRESENCES}];

// warm-dawn ramp: coral -> rose -> amber -> cream. No gold, no violet.
vec3 warmPalette(float t){
  vec3 coral = vec3(0.98, 0.55, 0.45);
  vec3 rose  = vec3(0.97, 0.68, 0.60);
  vec3 amber = vec3(0.98, 0.80, 0.63);
  vec3 cream = vec3(1.00, 0.94, 0.85);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.34) return mix(coral, rose, t / 0.34);
  if (t < 0.67) return mix(rose, amber, (t - 0.34) / 0.33);
  return mix(amber, cream, (t - 0.67) / 0.33);
}

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;

  float motion = mix(1.0, 0.35, uReduced); // reduced-motion damps drift
  float incoh = 1.0 - uR;

  // Domain warp: choppy turbulence when incoherent, still when unified. Slow.
  float wt = uTime * 0.06 * motion;
  vec2 warp = incoh * 0.05 * motion * vec2(
    vnoise(uv * 3.0 + wt) - 0.5,
    vnoise(uv * 3.0 - wt + 7.3) - 0.5
  );
  vec2 p = uv + warp;

  // Accumulate warm breath blooms.
  float lum = 0.0;
  vec3  col = vec3(0.0);
  float sigma = mix(0.11, 0.26, uR); // high R => blooms spread & merge into one
  for (int i = 0; i < ${MAX_PRESENCES}; i++){
    if (i >= uCount) break;
    vec2 d = p - uPos[i];
    d.x *= aspect;
    float r2 = dot(d, d);
    float breath = 0.5 + 0.5 * sin(uPhase[i]);
    float amp = mix(0.12, 1.0, uEnergy[i]) * (0.35 + 0.65 * breath);
    float g = exp(-r2 / (sigma * sigma)) * amp;
    lum += g;
    col += warmPalette(uHue[i]) * g;
  }
  vec3 base = lum > 1e-4 ? col / lum : vec3(0.0);

  // Cool, desaturated shift when incoherent (the room hasn't found itself yet).
  vec3 cool = vec3(0.44, 0.46, 0.52);
  base = mix(mix(cool, base, 0.5), base, uR);

  // At high R the palette pulls toward a shared warm plenum (rose-amber),
  // but stays ambient — never an over-bright white union.
  vec3 plenum = warmPalette(0.55);
  base = mix(base, plenum, uR * 0.35);

  float L = clamp(lum, 0.0, 1.4);

  // Collective breath swells global luminance — stronger when coherent.
  float gswell = 0.5 + 0.5 * sin(uMeanPhase);
  L *= mix(1.0, 0.72 + 0.28 * gswell, uR * motion);

  // Grain: fine spatial noise, amplitude rises with incoherence. Not a flicker
  // (spatial, low amplitude, slow temporal seed) — safe.
  float gr = hash(frag + floor(uTime * 2.0)) - 0.5;
  L += gr * 0.05 * incoh * motion;

  vec3 bg = vec3(0.055, 0.048, 0.043); // warm dark charcoal
  vec3 c = bg + base * L;

  // Gentle vignette to seat the room in the dark.
  vec2 q = uv - 0.5;
  c *= 1.0 - 0.5 * dot(q, q);

  // Reinhard tonemap keeps highs ambient (prevents a blown-out plenum).
  c = c / (c + vec3(0.55));
  c = pow(c, vec3(0.85)); // slight lift into the dawn

  fragColor = vec4(c, 1.0);
}
`;

export interface FieldPresence {
  pos: [number, number];
  phase: number;
  energy: number;
  hue: number;
}

export interface FieldUniforms {
  time: number;
  R: number;
  meanPhase: number;
  reduced: boolean;
  presences: FieldPresence[];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

export class FieldRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private posBuf = new Float32Array(MAX_PRESENCES * 2);
  private phaseBuf = new Float32Array(MAX_PRESENCES);
  private energyBuf = new Float32Array(MAX_PRESENCES);
  private hueBuf = new Float32Array(MAX_PRESENCES);

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;

    for (const name of [
      "uRes", "uTime", "uR", "uMeanPhase", "uReduced", "uCount",
      "uPos", "uPhase", "uEnergy", "uHue",
    ]) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }
  }

  resize(w: number, h: number, dpr: number): void {
    const gl = this.gl;
    gl.canvas.width = Math.max(1, Math.floor(w * dpr));
    gl.canvas.height = Math.max(1, Math.floor(h * dpr));
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  render(u: FieldUniforms): void {
    const gl = this.gl;
    const n = Math.min(MAX_PRESENCES, u.presences.length);
    for (let i = 0; i < n; i++) {
      const p = u.presences[i];
      this.posBuf[i * 2] = p.pos[0];
      this.posBuf[i * 2 + 1] = 1.0 - p.pos[1]; // flip: presence y is top-down
      this.phaseBuf[i] = p.phase;
      this.energyBuf[i] = p.energy;
      this.hueBuf[i] = p.hue;
    }

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.loc.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.loc.uTime, u.time);
    gl.uniform1f(this.loc.uR, u.R);
    gl.uniform1f(this.loc.uMeanPhase, u.meanPhase);
    gl.uniform1f(this.loc.uReduced, u.reduced ? 1.0 : 0.0);
    gl.uniform1i(this.loc.uCount, n);
    gl.uniform2fv(this.loc.uPos, this.posBuf);
    gl.uniform1fv(this.loc.uPhase, this.phaseBuf);
    gl.uniform1fv(this.loc.uEnergy, this.energyBuf);
    gl.uniform1fv(this.loc.uHue, this.hueBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.prog);
      gl.deleteVertexArray(this.vao);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {
      /* ignore */
    }
  }
}
