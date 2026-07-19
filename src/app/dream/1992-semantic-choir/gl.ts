// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — the semantic field, a raw WebGL2 fragment shader (no three.js, no
// WebGPU). A full-screen domain-warped interference pattern whose uniforms are
// driven entirely by the reduced embedding: hue, hue-spread, turbulence,
// mirror-symmetry, warp scale and flow speed. The embedding of the sung words
// is literally the brush (cf. Memo Akten, Refik Anadol). This is a FLOWING
// interference field — deliberately NOT a log-polar / concentric form-constant
// warp.
// ─────────────────────────────────────────────────────────────────────────────

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
uniform float uHue;        // 0..1 base hue
uniform float uHueSpread;  // secondary hue offset
uniform float uTurb;       // 0..1 turbulence
uniform float uSym;        // mirror-fold count (1..6)
uniform float uWarp;       // warp scale
uniform float uSpeed;      // flow speed
uniform float uBright;     // 0..1 brightness / value tilt
uniform float uLevel;      // live audio level 0..1
uniform float uMorph;      // 0..1 how "settled" the current field is

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 1.7; a *= 0.5; }
  return v;
}

// HSV → RGB (hue chosen by the embedding, so it spans the wheel)
vec3 hsv(float h, float s, float v){
  vec3 c = clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), c, s);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / min(uRes.x, uRes.y);
  float t = uTime * (0.15 + uSpeed*0.55);

  // ── mirror symmetry (cartesian fold — NOT a concentric/log-polar warp) ──
  float sym = max(1.0, floor(uSym + 0.5));
  float ang = atan(uv.y, uv.x);
  float rad = length(uv);
  float seg = 6.2831853 / sym;
  ang = abs(mod(ang, seg) - 0.5*seg);
  vec2 p = vec2(cos(ang), sin(ang)) * rad;

  // ── two-pass domain warp → flowing interference ──
  float wscale = 1.4 * uWarp;
  vec2 q = vec2(
    fbm(p*wscale + vec2(0.0, t*0.6)),
    fbm(p*wscale + vec2(5.2, -t*0.5 + 1.3))
  );
  vec2 r = vec2(
    fbm(p*wscale + 3.0*q + vec2(1.7, t*0.4)),
    fbm(p*wscale + 3.0*q + vec2(8.3, -t*0.35))
  );
  float warp = uTurb*1.6 + 0.4;
  vec2 warped = p + warp*(r - 0.5);

  // interference of a few travelling wave directions
  float f = 0.0;
  for(int i=0;i<3;i++){
    float a = 3.14159 * (0.21 + 0.33*float(i)) + uHueSpread*2.0;
    vec2 dir = vec2(cos(a), sin(a));
    float freq = 6.0 + 5.0*float(i) + 10.0*uTurb;
    f += sin(dot(warped, dir)*freq + t*(1.0+0.5*float(i)) + r.x*6.2831);
  }
  f = f/3.0;                          // -1..1
  float field = 0.5 + 0.5*f;          // 0..1

  // fine filaments so the field reads as pigment, not gradient
  float fil = fbm(warped*8.0 + t*0.3);
  field = mix(field, field*fil*1.4, 0.35*uTurb);

  // ── colour: hue from embedding, two-tone blend, brightness tilt ──
  float h = fract(uHue + uHueSpread * (field - 0.5) * 2.0);
  float sat = mix(0.35, 0.92, 0.5 + 0.5*sin(field*3.14159));
  float val = mix(0.05, 1.0, pow(field, mix(2.2, 0.8, uBright)));
  val *= (0.75 + 0.45*uLevel);        // audio breathes the light
  vec3 col = hsv(h, sat, val);

  // a warmer/cooler counter-hue in the troughs for depth
  vec3 alt = hsv(fract(uHue + 0.5), sat*0.8, val*0.7);
  col = mix(alt, col, smoothstep(0.25, 0.75, field));

  // subtle vignette + settle-in bloom on a fresh phrase
  float vig = smoothstep(1.25, 0.2, rad);
  col *= vig;
  col += (1.0 - uMorph) * 0.12 * hsv(h, 0.6, 1.0);

  fragColor = vec4(col, 1.0);
}
`;

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

interface Uniforms {
  hue: number;
  hueSpread: number;
  turb: number;
  sym: number;
  warp: number;
  speed: number;
  bright: number;
  level: number;
  morph: number;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export class SemanticGL {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private loc: Record<string, WebGLUniformLocation | null>;
  private start = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("program link failed: " + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;
    this.vao = gl.createVertexArray()!;

    const names = [
      "uRes",
      "uTime",
      "uHue",
      "uHueSpread",
      "uTurb",
      "uSym",
      "uWarp",
      "uSpeed",
      "uBright",
      "uLevel",
      "uMorph",
    ];
    this.loc = {};
    for (const n of names) this.loc[n] = gl.getUniformLocation(prog, n);
  }

  resize(w: number, h: number, dpr: number): void {
    const cw = Math.max(1, Math.floor(w * dpr));
    const ch = Math.max(1, Math.floor(h * dpr));
    const cvs = this.gl.canvas as HTMLCanvasElement;
    if (cvs.width !== cw || cvs.height !== ch) {
      cvs.width = cw;
      cvs.height = ch;
    }
    this.gl.viewport(0, 0, cw, ch);
  }

  render(u: Uniforms): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const t = (performance.now() - this.start) / 1000;
    gl.uniform2f(this.loc.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.loc.uTime, t);
    gl.uniform1f(this.loc.uHue, u.hue);
    gl.uniform1f(this.loc.uHueSpread, u.hueSpread);
    gl.uniform1f(this.loc.uTurb, u.turb);
    gl.uniform1f(this.loc.uSym, u.sym);
    gl.uniform1f(this.loc.uWarp, u.warp);
    gl.uniform1f(this.loc.uSpeed, u.speed);
    gl.uniform1f(this.loc.uBright, u.bright);
    gl.uniform1f(this.loc.uLevel, u.level);
    gl.uniform1f(this.loc.uMorph, u.morph);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
  }
}
