// ════════════════════════════════════════════════════════════════════════════
// Nearfield (8632) — spectral-waterfall + veil renderer (raw WebGL2, no three).
//
// A scrolling spectrogram lives behind a literal dark gauze "veil". As depth
// d → 1 the veil PARTS from the centre outward and the high & low bands fill
// in with warm colour; at d = 0 a dust/sepia grey haze muffles everything and
// only the mid band glows faintly through the weave.
//
// Colour is the payload: dust/sepia + muffled grey (d=0) → warm full spectrum,
// amber/gold through to cool highs (d=1). Raw hex is fine — this is art canvas.
//
// A Canvas2D fallback is provided for browsers without WebGL2.
// ════════════════════════════════════════════════════════════════════════════

import { SPECTRO_BINS } from "./audio";

const ROWS = 220; // history depth (time axis)

export interface VeilRenderer {
  render(column: Uint8Array, d: number, timeMs: number, reduced: boolean): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
}

// ── shaders ──────────────────────────────────────────────────────────────────

const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform sampler2D u_spectro; // R8, cols = frequency, rows = time (circular)
uniform float u_d;           // veil depth 0..1
uniform float u_time;        // seconds
uniform float u_head;        // current write-row index (0..ROWS-1)
uniform float u_rows;        // ROWS
uniform float u_reduced;     // 1.0 if prefers-reduced-motion

// cheap hash noise for the gauze weave
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.12);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.));
  float c = hash(i+vec2(0.,1.)), dd = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,dd,u.x), u.y);
}

void main(){
  // frequency along x (log baked into data), time along y (top = newest)
  float fx = v_uv.x;
  float age = (1.0 - v_uv.y) * u_rows;           // 0 at top (newest)
  float row = mod(u_head - age + u_rows*2.0, u_rows);
  float texY = (row + 0.5) / u_rows;
  float mag = texture(u_spectro, vec2(fx, texY)).r;
  mag = pow(mag, 0.82);

  // ── colour ramp ──
  // warm full spectrum: low freq amber → gold → cool highs
  vec3 warmLow  = vec3(0.98, 0.42, 0.12);
  vec3 warmMid  = vec3(1.00, 0.78, 0.32);
  vec3 warmHigh = vec3(0.72, 0.86, 1.00);
  vec3 warm = fx < 0.5 ? mix(warmLow, warmMid, fx*2.0)
                       : mix(warmMid, warmHigh, (fx-0.5)*2.0);
  // muffled dust/sepia grey
  float g = 0.30 + 0.22*fx;
  vec3 sepia = vec3(g*1.15, g*1.0, g*0.82);
  vec3 base = mix(sepia, warm, u_d);
  vec3 col = base * mag;

  // faint glow floor so quiet bins still read
  col += base * 0.06 * mag;

  // presence brightening near→far
  col *= mix(0.55, 1.15, u_d);

  // ── the veil (gauze) ──
  // curtains part from the centre as d rises
  float cx = abs(fx - 0.5) * 2.0;                // 0 centre → 1 edges
  float part = smoothstep(u_d - 0.12, u_d + 0.12, cx); // 1 = still veiled
  // gauze weave: layered noise, mostly static with a very slow drift
  float drift = u_time * (u_reduced > 0.5 ? 0.01 : 0.03);
  float weave = vnoise(v_uv * vec2(90.0, 26.0) + vec2(drift, 0.0));
  weave = mix(weave, vnoise(v_uv * vec2(220.0, 60.0)), 0.4);
  float threads = 0.75 + 0.25 * sin(v_uv.x * 240.0 + weave * 6.0);
  float gauze = clamp(part * (0.65 + 0.35*weave) * threads, 0.0, 1.0);
  // even in the parted centre, low d keeps a thin haze
  float haze = (1.0 - u_d) * 0.5 * (0.6 + 0.4*weave);
  float veil = clamp(max(gauze, haze), 0.0, 1.0);

  vec3 gauzeCol = vec3(0.05, 0.045, 0.04) + 0.015 * weave;
  col = mix(col, gauzeCol, veil);

  // slow, safe luminance drift (no strobe)
  float lum = 1.0 + (u_reduced > 0.5 ? 0.02 : 0.05)
              * sin(u_time * 0.35 + fx * 3.0);
  col *= lum;

  // gentle vignette
  vec2 q = v_uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.5;

  // tonemap
  col = col / (col + vec3(0.75));
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
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

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  return p;
}

/** WebGL2 renderer. Returns null if WebGL2 or the program is unavailable. */
export function createVeilRenderer(canvas: HTMLCanvasElement): VeilRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const prog = link(gl, QUAD_VERT, DISPLAY_FRAG);
  if (!prog) return null;

  // fullscreen quad
  const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // circular spectrogram texture (R8): width = frequency, height = time
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.R8, SPECTRO_BINS, ROWS, 0, gl.RED,
    gl.UNSIGNED_BYTE, new Uint8Array(SPECTRO_BINS * ROWS),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const uD = gl.getUniformLocation(prog, "u_d");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uHead = gl.getUniformLocation(prog, "u_head");
  const uRows = gl.getUniformLocation(prog, "u_rows");
  const uReduced = gl.getUniformLocation(prog, "u_reduced");
  const uSpectro = gl.getUniformLocation(prog, "u_spectro");

  let head = 0;

  return {
    render(column, d, timeMs, reduced) {
      // write newest column into the current head row
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, head, SPECTRO_BINS, 1, gl.RED,
        gl.UNSIGNED_BYTE, column,
      );

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uSpectro, 0);
      gl.uniform1f(uD, d);
      gl.uniform1f(uTime, timeMs / 1000);
      gl.uniform1f(uHead, head);
      gl.uniform1f(uRows, ROWS);
      gl.uniform1f(uReduced, reduced ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      head = (head + 1) % ROWS;
    },
    resize(w, h, dpr) {
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}

// ── Canvas2D fallback ─────────────────────────────────────────────────────────

/** Degraded renderer: a scrolling Canvas2D spectrogram with a gradient veil. */
export function createVeilRenderer2D(canvas: HTMLCanvasElement): VeilRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // offscreen spectrogram buffer (frequency across, time down)
  const spec = document.createElement("canvas");
  spec.width = SPECTRO_BINS;
  spec.height = ROWS;
  const sctx = spec.getContext("2d");
  if (!sctx) return null;

  const colColor = (fx: number, mag: number, d: number): string => {
    // warm ramp
    let wr: number, wg: number, wb: number;
    if (fx < 0.5) {
      const t = fx * 2;
      wr = 0.98 + (1.0 - 0.98) * t;
      wg = 0.42 + (0.78 - 0.42) * t;
      wb = 0.12 + (0.32 - 0.12) * t;
    } else {
      const t = (fx - 0.5) * 2;
      wr = 1.0 + (0.72 - 1.0) * t;
      wg = 0.78 + (0.86 - 0.78) * t;
      wb = 0.32 + (1.0 - 0.32) * t;
    }
    const g = 0.3 + 0.22 * fx;
    const sr = g * 1.15, sg = g, sb = g * 0.82;
    const r = (sr + (wr - sr) * d) * mag * (0.55 + 0.6 * d);
    const gg = (sg + (wg - sg) * d) * mag * (0.55 + 0.6 * d);
    const b = (sb + (wb - sb) * d) * mag * (0.55 + 0.6 * d);
    const tm = (x: number) => Math.round(255 * (x / (x + 0.75)));
    return `rgb(${tm(r)},${tm(gg)},${tm(b)})`;
  };

  return {
    render(column, d, _timeMs, _reduced) {
      // scroll spectrogram down by 1px, draw new row on top
      sctx.drawImage(spec, 0, 1);
      for (let i = 0; i < SPECTRO_BINS; i++) {
        const mag = Math.pow(column[i] / 255, 0.82);
        sctx.fillStyle = colColor(i / (SPECTRO_BINS - 1), mag, d);
        sctx.fillRect(i, 0, 1, 1);
      }
      // draw scaled to display
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(spec, 0, 0, canvas.width, canvas.height);

      // veil: darken edges, part the centre as d rises
      const w = canvas.width, h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const edge = `rgba(10,9,8,${0.92 * (1 - d) + 0.05})`;
      const mid = `rgba(12,11,10,${0.85 * (1 - d) * (1 - Math.min(1, d * 1.4))})`;
      grad.addColorStop(0, edge);
      grad.addColorStop(0.5, mid);
      grad.addColorStop(1, edge);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    resize(w, h, dpr) {
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    },
    dispose() {
      /* nothing retained beyond GC */
    },
  };
}
