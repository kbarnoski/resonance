// ─────────────────────────────────────────────────────────────────────────────
// Spectral Scrub — WebGL2 fragment-shader spectral field
//
// The hero visual is a full-screen GLSL fragment shader whose texture is a live
// scrolling spectrogram of the audio (fed from an AnalyserNode). Each frame we
// write the newest byte spectrum into one row of a ring-buffer R8 texture; the
// shader samples that history with domain-warped, flowing coordinates so the
// FFT reads as drifting pigment rather than a rectangle — Refik Anadol's
// "data as pigment" spectral aesthetic. Palette is deep-ocean navy → teal →
// electric cyan → violet → white-hot on near-black.
//
// A Canvas2D fallback (drawFallbackSpectrogram) covers browsers without WebGL2.
// ─────────────────────────────────────────────────────────────────────────────

export const HISTORY = 256; // spectrogram rows (time)

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
uniform sampler2D uSpec;   // R8, width=bins, height=HISTORY (ring buffer)
uniform float uScroll;     // writeRow / HISTORY (newest row)
uniform float uLevel;      // overall output level 0..1
uniform float uSculpt;     // vertical sculpt 0..1 → cutoff line
uniform float uPos;        // scrub playhead 0..1

// cheap value-noise for domain warp
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
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

// deep-ocean → electric ramp
vec3 palette(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.008, 0.020, 0.055); // near-black navy
  vec3 c1 = vec3(0.015, 0.090, 0.240); // deep ocean blue
  vec3 c2 = vec3(0.020, 0.360, 0.520); // teal
  vec3 c3 = vec3(0.130, 0.820, 0.920); // electric cyan
  vec3 c4 = vec3(0.560, 0.360, 0.980); // violet
  vec3 c5 = vec3(0.960, 0.920, 1.000); // white-hot
  vec3 col = mix(c0, c1, smoothstep(0.00, 0.22, t));
  col = mix(col, c2, smoothstep(0.20, 0.45, t));
  col = mix(col, c3, smoothstep(0.42, 0.68, t));
  col = mix(col, c4, smoothstep(0.64, 0.86, t));
  col = mix(col, c5, smoothstep(0.85, 1.00, t));
  return col;
}

float sampleSpec(vec2 uv){
  // uv.x = frequency (0..1), uv.y = age (0 = now at bottom → 1 = oldest)
  float row = fract(uScroll - uv.y);
  return texture(uSpec, vec2(uv.x, row)).r;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  // domain warp: drift the sampling coordinates like slow currents
  vec2 w = vec2(
    fbm(uv*3.0 + vec2(0.0, uTime*0.05)),
    fbm(uv*3.0 + vec2(5.2, -uTime*0.035))
  );
  float freq = uv.x + (w.x - 0.5) * 0.06;
  float age  = (1.0 - uv.y) + (w.y - 0.5) * 0.05;
  freq = clamp(freq, 0.0, 1.0);
  age  = clamp(age, 0.0, 1.0);

  // perceptual frequency stretch (emphasise low/mid where the piano lives)
  float fCoord = pow(freq, 1.7);

  float m = sampleSpec(vec2(fCoord, age));
  // lift + gamma so quiet detail glows on near-black
  m = pow(m, 0.72);

  // multi-tap bloom across nearby frequencies for a painterly smear
  float bloom = 0.0;
  bloom += sampleSpec(vec2(fCoord+0.006, age)) * 0.5;
  bloom += sampleSpec(vec2(fCoord-0.006, age)) * 0.5;
  bloom += sampleSpec(vec2(fCoord, age+0.03)) * 0.4;
  m = max(m, pow(bloom*0.5, 0.9));

  float t = m * (0.55 + 0.9*m);
  vec3 col = palette(t);

  // sculpt cutoff line: everything below the cutoff freq glows warmer/cyan
  float cutY = pow(uSculpt, 1.7);
  float band = smoothstep(0.02, 0.0, abs(fCoord - cutY));
  col += vec3(0.10, 0.55, 0.75) * band * (0.4 + 0.6*uLevel);
  // gentle brightening of the "in focus" region below the cutoff
  col *= 1.0 + 0.18 * smoothstep(cutY+0.05, cutY-0.05, fCoord);

  // playhead shimmer: a soft vertical caustic that breathes with level
  float ph = smoothstep(0.035, 0.0, abs(uv.x - uPos));
  col += vec3(0.35, 0.75, 1.0) * ph * (0.25 + 0.75*uLevel) * 0.6;

  // level-driven overall lift so freeze/shimmer stays alive
  col += vec3(0.02, 0.05, 0.10) * uLevel;

  // grain + vignette
  float g = (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.03;
  col += g;
  float vig = smoothstep(1.25, 0.35, length((uv-0.5)*vec2(aspect,1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(max(col, 0.0), 1.0);
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

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

export interface FieldUniforms {
  time: number;
  level: number;
  sculpt: number;
  pos: number;
}

export class SpectralField {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private bins: number;
  private writeRow = 0;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private lostHandler: (e: Event) => void;

  constructor(private canvas: HTMLCanvasElement, bins: number) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.bins = bins;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;

    this.vao = gl.createVertexArray()!;

    for (const name of ["uRes", "uTime", "uSpec", "uScroll", "uLevel", "uSculpt", "uPos"]) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }

    // Ring-buffer spectrogram texture (R8), width = bins, height = HISTORY.
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      bins,
      HISTORY,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      new Uint8Array(bins * HISTORY),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    this.lostHandler = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", this.lostHandler, false);
  }

  /** Push one spectrum row into the ring buffer. */
  push(spectrum: Uint8Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      this.writeRow,
      this.bins,
      1,
      gl.RED,
      gl.UNSIGNED_BYTE,
      spectrum,
    );
    this.writeRow = (this.writeRow + 1) % HISTORY;
  }

  resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  render(u: FieldUniforms) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uSpec, 0);
    gl.uniform2f(this.loc.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.uTime, u.time);
    gl.uniform1f(this.loc.uScroll, this.writeRow / HISTORY);
    gl.uniform1f(this.loc.uLevel, u.level);
    gl.uniform1f(this.loc.uSculpt, u.sculpt);
    gl.uniform1f(this.loc.uPos, u.pos);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.lostHandler, false);
    try {
      gl.deleteTexture(this.tex);
      gl.deleteProgram(this.prog);
      gl.deleteVertexArray(this.vao);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {
      /* ignore */
    }
  }
}

// ─── Canvas2D fallback ───────────────────────────────────────────────────────
const fallbackHistory: number[][] = [];

export function drawFallbackSpectrogram(
  cvs: HTMLCanvasElement,
  spectrum: Uint8Array,
  level: number,
) {
  const ctx = cvs.getContext("2d");
  if (!ctx) return;
  const cols = 96;
  const step = Math.max(1, Math.floor(spectrum.length / cols));
  const row: number[] = [];
  for (let i = 0; i < cols; i++) row.push(spectrum[i * step] / 255);
  fallbackHistory.push(row);
  if (fallbackHistory.length > HISTORY) fallbackHistory.shift();

  const w = cvs.width;
  const h = cvs.height;
  ctx.fillStyle = "#04060f";
  ctx.fillRect(0, 0, w, h);
  const rows = fallbackHistory.length;
  const cw = w / cols;
  const rh = h / HISTORY;
  for (let r = 0; r < rows; r++) {
    const data = fallbackHistory[rows - 1 - r];
    const y = r * rh;
    for (let c = 0; c < cols; c++) {
      const m = Math.pow(data[c], 0.7);
      if (m < 0.02) continue;
      const hue = 200 - m * 90; // cyan → violet-ish
      const lgt = 12 + m * 55;
      ctx.fillStyle = `hsl(${hue}, 90%, ${lgt}%)`;
      ctx.fillRect(c * cw, y, cw + 0.5, rh + 0.5);
    }
  }
  ctx.fillStyle = `rgba(120,200,255,${0.05 + level * 0.15})`;
  ctx.fillRect(0, 0, w, h);
}
