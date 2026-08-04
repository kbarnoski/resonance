// gl.ts — the descent IS the image.
//
// The background is the live loss landscape: a smooth height/colour field over
// the (ratio, index) parameter plane, recomputed every frame. Dark ridges,
// a glowing violet basin at the current minimum, faint contour rings. The
// current parameter point rolls DOWNHILL toward the basin, trailing a fading
// comet tail; a bright star marks the target basin. Along the bottom, two
// luminous curves — the live target spectrum and the synth's spectrum —
// converge as the loss falls. On a silent, static frame it reads as "a point
// rolling down a glowing valley toward a target." Raw WebGL2; Canvas2D
// fallback draws the same idea. Slow luminance drift only — no strobe.

import { N_BINS } from "./features";

export interface RenderState {
  /** Normalized loss field, FIELD_RES² row-major (0 = basin, 1 = ridge). */
  field: Float32Array;
  fieldRes: number;
  /** Current param point in the (ratio, index) plane, [0,1]². */
  point: { x: number; y: number };
  /** Basin (target) location in the same plane. */
  basin: { x: number; y: number };
  /** Interleaved x,y of the recent trajectory (oldest → newest), [0,1]. */
  trailPos: Float32Array;
  /** Per-trail-node brightness (1 = newest). */
  trailVal: Float32Array;
  trailCount: number;
  /** Target and synth normalized spectra (N_BINS each, [0,1]). */
  targetSpec: Float32Array;
  synthSpec: Float32Array;
  /** Match in [0,1] (1 = converged) — drives point & basin glow. */
  match: number;
  time: number;
  reducedMotion: boolean;
}

export interface Renderer {
  draw(state: RenderState): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
  readonly mode: "webgl2" | "canvas2d";
}

/* ── shaders ───────────────────────────────────────────────────────────── */

const FIELD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }`;

// The field texture is sampled across a centred region; outside it, vignette.
const FIELD_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_field;
uniform float u_time;
uniform float u_drift;   // luminance breathing amount (0 when reduced motion)
void main(){
  vec2 p = (v_uv - 0.5)/0.86 + 0.5;         // map to param plane [0,1]
  vec2 cl = clamp(p, 0.0, 1.0);
  float inside = step(0.0, p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);
  float h = texture(u_field, cl).r;          // 0 basin .. 1 ridge
  float breathe = 0.85 + u_drift*sin(u_time*0.18);
  float basin = smoothstep(0.5, 0.0, h);
  vec3 deep = vec3(0.03,0.02,0.065);
  vec3 mid  = vec3(0.16,0.09,0.36);
  vec3 glow = vec3(0.52,0.40,1.0);
  vec3 col = mix(deep, mid, (1.0-h)*(1.0-h));
  col += glow*basin*basin*0.55*breathe;
  // topographic contour rings
  float c = abs(fract(h*9.0)-0.5);
  col += vec3(0.28,0.20,0.55)*smoothstep(0.055,0.0,c)*0.35;
  // gentle vignette + outside-plane darkening
  vec2 q = v_uv-0.5;
  float vig = smoothstep(0.95,0.30,length(q));
  col *= mix(0.35, 1.0, inside)*(0.55+0.45*vig);
  o = vec4(col,1.0);
}`;

const PT_VERT = `#version 300 es
in vec2 a_pos;   // [0,1] plane coords
in float a_val;  // brightness
uniform float u_size;
uniform float u_time;
uniform float u_mode; // 0 trail, 1 point, 2 basin star
uniform float u_drift;
out float v_val;
void main(){
  vec2 c = (a_pos*2.0-1.0)*0.86;
  gl_Position = vec4(c,0.0,1.0);
  float pulse = (u_mode>1.5) ? (0.8+0.2*sin(u_time*1.6)) : 1.0;
  float base = (u_mode<0.5) ? (0.35+0.6*a_val)
             : (u_mode<1.5) ? 1.9
             : 2.4;
  gl_PointSize = u_size*base*pulse;
  v_val = a_val;
}`;

const PT_FRAG = `#version 300 es
precision highp float;
in float v_val;
out vec4 o;
uniform float u_mode;
void main(){
  vec2 d = gl_PointCoord-0.5;
  float r = length(d);
  float a = smoothstep(0.5,0.0,r);
  if(a<=0.0) discard;
  float core = pow(a,2.2);
  vec3 col;
  if(u_mode>1.5){                    // basin star: violet-white
    col = mix(vec3(0.7,0.55,1.0), vec3(1.0,0.97,1.0), core);
  } else if(u_mode>0.5){             // current point: hot white-violet, glows with match
    col = mix(vec3(0.62,0.45,1.0), vec3(1.0,0.95,1.0), core*(0.4+0.6*v_val));
  } else {                           // trail: cool violet, fading
    col = mix(vec3(0.30,0.18,0.60), vec3(0.70,0.55,1.0), v_val);
  }
  o = vec4(col*a, a);
}`;

const LINE_VERT = `#version 300 es
in vec2 a_pos;   // clip space
in float a_val;
out float v_val;
void main(){ v_val=a_val; gl_Position=vec4(a_pos,0.0,1.0); }`;

const LINE_FRAG = `#version 300 es
precision highp float;
in float v_val;
out vec4 o;
uniform vec3 u_tint;
void main(){ o = vec4(u_tint*(0.35+1.0*v_val), 0.85); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

/* ── WebGL2 renderer ───────────────────────────────────────────────────── */

export function makeWebGLRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const glc = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!glc) return null;
  const gl: WebGL2RenderingContext = glc;

  let fieldProg: WebGLProgram;
  let ptProg: WebGLProgram;
  let lineProg: WebGLProgram;
  try {
    fieldProg = link(gl, FIELD_VERT, FIELD_FRAG);
    ptProg = link(gl, PT_VERT, PT_FRAG);
    lineProg = link(gl, LINE_VERT, LINE_FRAG);
  } catch {
    return null;
  }

  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const ptBuf = gl.createBuffer()!;
  const lineBuf = gl.createBuffer()!;
  let scratch = new Float32Array(0);

  // loss-field texture (R8, linear-filtered → smooth valley)
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let texRes = 0;
  let texBuf = new Uint8Array(0);

  const fU = {
    field: gl.getUniformLocation(fieldProg, "u_field"),
    time: gl.getUniformLocation(fieldProg, "u_time"),
    drift: gl.getUniformLocation(fieldProg, "u_drift"),
  };
  const fPos = gl.getAttribLocation(fieldProg, "a_pos");

  const pU = {
    size: gl.getUniformLocation(ptProg, "u_size"),
    time: gl.getUniformLocation(ptProg, "u_time"),
    mode: gl.getUniformLocation(ptProg, "u_mode"),
    drift: gl.getUniformLocation(ptProg, "u_drift"),
  };
  const pPos = gl.getAttribLocation(ptProg, "a_pos");
  const pVal = gl.getAttribLocation(ptProg, "a_val");

  const lU = { tint: gl.getUniformLocation(lineProg, "u_tint") };
  const lPos = gl.getAttribLocation(lineProg, "a_pos");
  const lVal = gl.getAttribLocation(lineProg, "a_val");

  let pw = 1;
  let ph = 1;
  let unit = 6;

  function drawPoints(
    xy: Float32Array,
    val: Float32Array,
    count: number,
    mode: number,
  ) {
    if (count <= 0) return;
    if (scratch.length < count * 3) scratch = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      scratch[i * 3] = xy[i * 2];
      scratch[i * 3 + 1] = xy[i * 2 + 1];
      scratch[i * 3 + 2] = val[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, count * 3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(pPos);
    gl.vertexAttribPointer(pPos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(pVal);
    gl.vertexAttribPointer(pVal, 1, gl.FLOAT, false, 12, 8);
    gl.uniform1f(pU.mode, mode);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  // spectrum curve: N_BINS points in a bottom strip
  const lineScratch = new Float32Array(N_BINS * 3);
  function drawSpectrum(spec: Float32Array, tint: [number, number, number]) {
    for (let i = 0; i < N_BINS; i++) {
      const x = -0.86 + (i / (N_BINS - 1)) * 1.72;
      const y = -0.97 + spec[i] * 0.34;
      lineScratch[i * 3] = x;
      lineScratch[i * 3 + 1] = y;
      lineScratch[i * 3 + 2] = spec[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lineScratch, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(lPos);
    gl.vertexAttribPointer(lPos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(lVal);
    gl.vertexAttribPointer(lVal, 1, gl.FLOAT, false, 12, 8);
    gl.uniform3f(lU.tint, tint[0], tint[1], tint[2]);
    gl.drawArrays(gl.LINE_STRIP, 0, N_BINS);
  }

  const starXY = new Float32Array(2);
  const starVal = new Float32Array(1);
  const ptXY = new Float32Array(2);
  const ptVal = new Float32Array(1);

  return {
    mode: "webgl2",
    resize(w, h, dpr) {
      pw = Math.max(1, Math.round(w * dpr));
      ph = Math.max(1, Math.round(h * dpr));
      canvas.width = pw;
      canvas.height = ph;
      gl.viewport(0, 0, pw, ph);
      unit = Math.max(4, Math.min(pw, ph) / 46);
    },
    draw(s) {
      const drift = s.reducedMotion ? 0.0 : 0.12;

      // upload the loss field
      const res = s.fieldRes;
      if (texRes !== res) {
        texBuf = new Uint8Array(res * res);
        texRes = res;
      }
      for (let i = 0; i < res * res; i++) {
        const v = s.field[i];
        texBuf[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, res, res, 0, gl.RED, gl.UNSIGNED_BYTE, texBuf);

      // field background
      gl.disable(gl.BLEND);
      gl.useProgram(fieldProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(fU.field, 0);
      gl.uniform1f(fU.time, s.time);
      gl.uniform1f(fU.drift, drift);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(fPos);
      gl.vertexAttribPointer(fPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // additive glowing overlays
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      // spectra curves (behind the point cloud)
      gl.useProgram(lineProg);
      drawSpectrum(s.targetSpec, [0.55, 0.42, 0.95]);
      drawSpectrum(s.synthSpec, [0.95, 0.85, 1.0]);

      // points
      gl.useProgram(ptProg);
      gl.uniform1f(pU.time, s.time);
      gl.uniform1f(pU.size, unit);
      gl.uniform1f(pU.drift, drift);
      drawPoints(s.trailPos, s.trailVal, s.trailCount, 0);
      starXY[0] = s.basin.x;
      starXY[1] = s.basin.y;
      starVal[0] = 0.6 + 0.4 * s.match;
      drawPoints(starXY, starVal, 1, 2);
      ptXY[0] = s.point.x;
      ptXY[1] = s.point.y;
      ptVal[0] = s.match;
      drawPoints(ptXY, ptVal, 1, 1);
    },
    dispose() {
      gl.deleteBuffer(quad);
      gl.deleteBuffer(ptBuf);
      gl.deleteBuffer(lineBuf);
      gl.deleteTexture(tex);
      gl.deleteProgram(fieldProg);
      gl.deleteProgram(ptProg);
      gl.deleteProgram(lineProg);
    },
  };
}

/* ── Canvas2D fallback ─────────────────────────────────────────────────── */

export function makeCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let w = 1;
  let h = 1;
  let unit = 6;

  // map param plane [0,1]² → pixels (0.86 centred margin, y up)
  function px(x: number, y: number) {
    const cx = (x * 2 - 1) * 0.86;
    const cy = (y * 2 - 1) * 0.86;
    return [(cx * 0.5 + 0.5) * w, (0.5 - cy * 0.5) * h] as const;
  }

  function blob(x: number, y: number, r: number, inner: string, outer: string) {
    const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx!.fillStyle = g;
    ctx!.beginPath();
    ctx!.arc(x, y, r, 0, Math.PI * 2);
    ctx!.fill();
  }

  return {
    mode: "canvas2d",
    resize(cw, ch, dpr) {
      w = cw;
      h = ch;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      unit = Math.max(4, Math.min(cw, ch) / 46);
    },
    draw(s) {
      ctx.fillStyle = "#05030c";
      ctx.fillRect(0, 0, w, h);

      // loss field as coarse cells
      const res = s.fieldRes;
      const cw = (0.86 * w) / res;
      const ch = (0.86 * h) / res;
      const x0 = 0.07 * w;
      const y0 = 0.07 * h;
      for (let iy = 0; iy < res; iy++) {
        for (let ix = 0; ix < res; ix++) {
          const hh = s.field[iy * res + ix];
          const basin = Math.max(0, 1 - hh * 2);
          const rr = Math.round(8 + (1 - hh) * 40 + basin * 90);
          const gg = Math.round(5 + (1 - hh) * 24 + basin * 70);
          const bb = Math.round(16 + (1 - hh) * 70 + basin * 160);
          ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
          // y flipped so index increases upward
          ctx.fillRect(x0 + ix * cw, y0 + (res - 1 - iy) * ch, cw + 1, ch + 1);
        }
      }

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const drift = s.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(s.time * 0.18);

      // spectra curves along the bottom
      const specLine = (spec: Float32Array, color: string) => {
        ctx.beginPath();
        for (let i = 0; i < N_BINS; i++) {
          const x = 0.07 * w + (i / (N_BINS - 1)) * 0.86 * w;
          const y = h * 0.985 - spec[i] * h * 0.17;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      };
      specLine(s.targetSpec, "rgba(150,110,240,0.8)");
      specLine(s.synthSpec, "rgba(240,220,255,0.9)");

      // trail
      const tv = s.trailVal;
      for (let i = 0; i < s.trailCount; i++) {
        const [x, y] = px(s.trailPos[i * 2], s.trailPos[i * 2 + 1]);
        const v = tv[i];
        blob(x, y, unit * (0.4 + 0.8 * v), `rgba(150,110,230,${0.3 * v * drift})`, "rgba(90,60,160,0)");
      }
      // basin star
      const [bx, by] = px(s.basin.x, s.basin.y);
      const pulse = s.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(s.time * 1.6);
      blob(bx, by, unit * 2.2 * pulse, "rgba(255,250,255,0.95)", "rgba(170,140,255,0)");
      // current point
      const [cx, cy] = px(s.point.x, s.point.y);
      blob(cx, cy, unit * (1.4 + s.match), `rgba(255,250,255,${0.85})`, "rgba(150,110,255,0)");
      ctx.restore();
    },
    dispose() {},
  };
}
