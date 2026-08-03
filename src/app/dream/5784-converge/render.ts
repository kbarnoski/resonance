// render.ts — raw WebGL2 point-cloud visual (Canvas2D fallback).
//
// The whole search reads on a silent screen: every candidate synth is a
// glowing violet point in the 2-D timbre plane (x = spectral centroid,
// y = spectral spread), the TARGET timbre is a bright pulsing star, and a
// fading trail marks where the best-so-far has travelled. As the population
// converges the swarm collapses onto the star. Slow luminance drift only —
// no strobe. Hand-written GLSL, additive blending, gl.POINTS.

export interface RenderState {
  /** Interleaved x,y in [0,1] per candidate. */
  candPos: Float32Array;
  /** Per-candidate brightness in [0,1] (1 = best fit). */
  candVal: Float32Array;
  /** Interleaved x,y of the best-so-far trail (oldest → newest). */
  trailPos: Float32Array;
  /** Trail brightness (1 = newest). */
  trailVal: Float32Array;
  trailCount: number;
  /** Target timbre position in [0,1]. */
  target: { x: number; y: number };
  /** Best-so-far fit in [0,1] (1 = converged) — drives the star's glow. */
  bestFit: number;
  time: number;
}

export interface Renderer {
  draw(state: RenderState): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
  readonly mode: "webgl2" | "canvas2d";
}

/* ── shaders ───────────────────────────────────────────────────────────── */

const BG_VERT = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const BG_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
void main(){
  vec2 uv = gl_FragCoord.xy/u_res;
  vec2 p = uv-0.5; p.x *= u_res.x/u_res.y;
  float t = u_time*0.05;                       // very slow drift
  float n = noise(p*2.2 + vec2(t, -t*0.6))*0.5
          + noise(p*4.5 - vec2(t*0.4, t))*0.25;
  float rad = smoothstep(1.15, 0.15, length(p));
  float lum = 0.30 + 0.14*sin(u_time*0.18);    // gentle luminance breathing
  vec3 base = vec3(0.045, 0.03, 0.085);
  vec3 glow = vec3(0.16, 0.09, 0.36)*n*rad*lum;
  o = vec4(base + glow, 1.0);
}`;

const PT_VERT = `#version 300 es
in vec2 a_pos;   // [0,1] timbre coords
in float a_val;  // brightness
uniform float u_size;
uniform float u_time;
uniform float u_mode; // 0 candidates, 1 trail, 2 star
out float v_val;
void main(){
  vec2 c = a_pos*2.0 - 1.0;
  c *= 0.86;                     // margin
  c.y = -c.y;                    // y down in data → up on screen
  gl_Position = vec4(c, 0.0, 1.0);
  float pulse = (u_mode > 1.5) ? (0.75 + 0.25*sin(u_time*2.4)) : 1.0;
  float base = (u_mode < 0.5) ? (0.55 + 0.9*a_val)
             : (u_mode < 1.5) ? (0.35 + 0.5*a_val)
             : 2.6;
  gl_PointSize = u_size * base * pulse;
  v_val = a_val;
}`;

const PT_FRAG = `#version 300 es
precision highp float;
in float v_val;
out vec4 o;
uniform float u_mode;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  if (a <= 0.0) discard;
  float core = pow(a, 2.4);
  vec3 dim = vec3(0.42, 0.24, 0.72);
  vec3 hot = vec3(0.72, 0.56, 1.0);
  vec3 col;
  if (u_mode > 1.5) {           // star: bright violet-white
    col = mix(vec3(0.75,0.6,1.0), vec3(1.0,0.97,1.0), core);
  } else if (u_mode > 0.5) {    // trail: cool violet
    col = mix(dim*0.7, hot, v_val);
  } else {                      // candidate: violet, whiter when fitter
    col = mix(dim, hot, v_val);
    col += vec3(1.0)*core*v_val*0.6;
  }
  o = vec4(col*a, a);
}`;

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

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

/* ── WebGL2 renderer ───────────────────────────────────────────────────── */

export function makeWebGLRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const glc = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!glc) return null;
  const gl: WebGL2RenderingContext = glc;

  let bgProg: WebGLProgram;
  let ptProg: WebGLProgram;
  try {
    bgProg = link(gl, BG_VERT, BG_FRAG);
    ptProg = link(gl, PT_VERT, PT_FRAG);
  } catch {
    return null;
  }

  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  // Interleaved [x,y,val] dynamic buffer for point groups.
  const ptBuf = gl.createBuffer()!;
  let scratch = new Float32Array(0);

  const bgU = {
    res: gl.getUniformLocation(bgProg, "u_res"),
    time: gl.getUniformLocation(bgProg, "u_time"),
  };
  const bgPos = gl.getAttribLocation(bgProg, "a_pos");

  const ptU = {
    size: gl.getUniformLocation(ptProg, "u_size"),
    time: gl.getUniformLocation(ptProg, "u_time"),
    mode: gl.getUniformLocation(ptProg, "u_mode"),
  };
  const ptPos = gl.getAttribLocation(ptProg, "a_pos");
  const ptValLoc = gl.getAttribLocation(ptProg, "a_val");

  let pw = 1;
  let ph = 1;
  let unit = 6;

  function drawGroup(
    xy: Float32Array,
    val: Float32Array,
    count: number,
    mode: number,
    size: number,
  ) {
    if (count <= 0) return;
    if (scratch.length < count * 3) scratch = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      scratch[i * 3] = xy[i * 2];
      scratch[i * 3 + 1] = xy[i * 2 + 1];
      scratch[i * 3 + 2] = val[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      scratch.subarray(0, count * 3),
      gl.DYNAMIC_DRAW,
    );
    gl.enableVertexAttribArray(ptPos);
    gl.vertexAttribPointer(ptPos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(ptValLoc);
    gl.vertexAttribPointer(ptValLoc, 1, gl.FLOAT, false, 12, 8);
    gl.uniform1f(ptU.mode, mode);
    gl.uniform1f(ptU.size, size);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  return {
    mode: "webgl2",
    resize(w, h, dpr) {
      pw = Math.max(1, Math.round(w * dpr));
      ph = Math.max(1, Math.round(h * dpr));
      canvas.width = pw;
      canvas.height = ph;
      gl.viewport(0, 0, pw, ph);
      unit = Math.max(4, Math.min(pw, ph) / 42);
    },
    draw(s) {
      // background wash
      gl.disable(gl.BLEND);
      gl.useProgram(bgProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(bgPos);
      gl.vertexAttribPointer(bgPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(bgU.res, pw, ph);
      gl.uniform1f(bgU.time, s.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // additive glowing points
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(ptProg);
      gl.uniform1f(ptU.time, s.time);

      // trail (behind), candidates, then the star on top
      drawGroup(s.trailPos, s.trailVal, s.trailCount, 1, unit);
      drawGroup(
        s.candPos,
        s.candVal,
        s.candVal.length,
        0,
        unit,
      );
      const starXY = new Float32Array([s.target.x, s.target.y]);
      const starVal = new Float32Array([0.6 + 0.4 * s.bestFit]);
      drawGroup(starXY, starVal, 1, 2, unit);
    },
    dispose() {
      gl.deleteBuffer(quad);
      gl.deleteBuffer(ptBuf);
      gl.deleteProgram(bgProg);
      gl.deleteProgram(ptProg);
    },
  };
}

/* ── Canvas2D fallback ─────────────────────────────────────────────────── */

export function makeCanvas2DRenderer(
  canvas: HTMLCanvasElement,
): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let w = 1;
  let h = 1;
  let unit = 6;

  function pt(x: number, y: number) {
    return [0.07 * w + x * 0.86 * w, 0.07 * h + y * 0.86 * h] as const;
  }

  function blob(
    x: number,
    y: number,
    r: number,
    inner: string,
    outer: string,
  ) {
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
      unit = Math.max(4, Math.min(cw, ch) / 42);
    },
    draw(s) {
      const drift = 0.85 + 0.15 * Math.sin(s.time * 0.18);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0a0716");
      g.addColorStop(1, "#05030c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // trail
      for (let i = 0; i < s.trailCount; i++) {
        const [x, y] = pt(s.trailPos[i * 2], s.trailPos[i * 2 + 1]);
        const v = s.trailVal[i];
        blob(
          x,
          y,
          unit * (0.5 + v),
          `rgba(150,110,220,${0.25 * v * drift})`,
          "rgba(90,60,150,0)",
        );
      }
      // candidates
      for (let i = 0; i < s.candVal.length; i++) {
        const [x, y] = pt(s.candPos[i * 2], s.candPos[i * 2 + 1]);
        const v = s.candVal[i];
        blob(
          x,
          y,
          unit * (0.7 + 0.9 * v),
          `rgba(${150 + v * 105},${110 + v * 130},255,${(0.35 + 0.5 * v) * drift})`,
          "rgba(110,70,180,0)",
        );
      }
      // star
      const [sx, sy] = pt(s.target.x, s.target.y);
      const pulse = 0.75 + 0.25 * Math.sin(s.time * 2.4);
      blob(
        sx,
        sy,
        unit * 2.6 * pulse,
        "rgba(255,250,255,0.95)",
        "rgba(170,140,255,0)",
      );
      ctx.restore();
    },
    dispose() {},
  };
}
