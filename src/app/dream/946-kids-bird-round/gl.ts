// gl.ts — hand-written WebGL2 (raw GLSL, no three.js) dawn-treetop scene:
// a soft warm-gold sky, leafy silhouette, and glowing birds with light-trails
// that pulse when they sing. Falls back to Canvas2D drawing the same scene.

export interface BirdView {
  x: number; // 0..1 across width
  y: number; // 0..1, 0 = bottom, 1 = top
  hue: number; // 0..1
  glow: number; // 0..1 pulse amount
  trail: { x: number; y: number; a: number }[]; // recent positions, a = alpha
}

export interface SceneState {
  birds: BirdView[];
  // the dragging bird (live), if any
  dragging: { x: number; y: number; hue: number; glow: number } | null;
  time: number; // seconds
}

export interface Renderer {
  draw: (s: SceneState) => void;
  resize: (w: number, h: number, dpr: number) => void;
  dispose: () => void;
  kind: "webgl2" | "canvas2d";
}

// Pentatonic-ish hues mapped warm: greens → golds. Used by both backends.
export function birdHue(scaleIdx: number, len: number): number {
  const t = len <= 1 ? 0 : scaleIdx / (len - 1);
  // low = leafy green (~0.33), high = warm gold (~0.12)
  return 0.33 - t * 0.21;
}

// ---------------------------------------------------------------------------
// WebGL2 backend
// ---------------------------------------------------------------------------
const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fullscreen fragment shader: dawn gradient sky + soft leaf canopy + up to
// MAXB glowing birds (point + trail glow accumulated in the loop).
const MAXB = 5;
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform vec2 u_res;
uniform int u_count;
uniform vec3 u_bird[${MAXB}];   // x, y, glow
uniform float u_hue[${MAXB}];
uniform vec3 u_drag;            // x, y, glow (z<0 => none)
uniform float u_draghue;

vec3 hsv2rgb(float h, float s, float v) {
  vec3 c = vec3(h, s, v);
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(1.0, u_res.y);

  // ---- dawn sky gradient: warm gold low → soft peach/blue high ----
  vec3 lowSky  = vec3(1.0, 0.80, 0.55);   // warm horizon gold
  vec3 midSky  = vec3(0.99, 0.86, 0.68);
  vec3 highSky = vec3(0.74, 0.85, 0.92);  // gentle morning blue
  vec3 sky = mix(lowSky, midSky, smoothstep(0.0, 0.45, uv.y));
  sky = mix(sky, highSky, smoothstep(0.4, 1.0, uv.y));

  // soft rising sun glow near horizon
  vec2 sunp = vec2(0.5, 0.12);
  float sun = exp(-12.0 * length((uv - sunp) * vec2(aspect, 1.0)));
  sky += vec3(1.0, 0.92, 0.7) * sun * 0.6;

  vec3 col = sky;

  // ---- leafy canopy silhouette along the bottom + sides ----
  float canopy = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float x = uv.x * 6.0 + fi * 1.7;
    float blob = sin(x) * 0.04 + sin(x * 2.3 + fi) * 0.02;
    float edge = 0.12 + blob + fi * 0.005;
    canopy = max(canopy, smoothstep(edge + 0.03, edge - 0.02, uv.y));
  }
  // gentle leaf texture
  float leafTex = hash(floor(uv * vec2(80.0, 60.0))) * 0.12;
  vec3 leaf = mix(vec3(0.15, 0.34, 0.18), vec3(0.22, 0.45, 0.24), leafTex);
  col = mix(col, leaf, canopy);

  // ---- glowing birds + trail (drawn as additive glow) ----
  for (int i = 0; i < ${MAXB}; i++) {
    if (i >= u_count) break;
    vec3 b = u_bird[i];
    vec2 d = (uv - b.xy) * vec2(aspect, 1.0);
    float dist = length(d);
    float core = exp(-260.0 * dist * dist);
    float halo = exp(-30.0 * dist * dist) * (0.4 + b.z * 0.9);
    vec3 c = hsv2rgb(u_hue[i], 0.55, 1.0);
    col += c * (core * 1.4 + halo * (0.5 + b.z));
  }

  // ---- live dragging bird ----
  if (u_drag.z >= 0.0) {
    vec2 d = (uv - u_drag.xy) * vec2(aspect, 1.0);
    float dist = length(d);
    float core = exp(-220.0 * dist * dist);
    float halo = exp(-22.0 * dist * dist) * (0.5 + u_drag.z);
    vec3 c = hsv2rgb(u_draghue, 0.6, 1.0);
    col += c * (core * 1.6 + halo * 0.9);
  }

  // gentle vignette
  float vig = smoothstep(1.3, 0.3, length(uv - 0.5));
  col *= 0.85 + 0.15 * vig;

  outColor = vec4(col, 1.0);
}`;

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

function makeGlRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // fullscreen triangle pair
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, "u_time");
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uCount = gl.getUniformLocation(prog, "u_count");
  const uBird = gl.getUniformLocation(prog, "u_bird");
  const uHue = gl.getUniformLocation(prog, "u_hue");
  const uDrag = gl.getUniformLocation(prog, "u_drag");
  const uDragHue = gl.getUniformLocation(prog, "u_draghue");

  let W = canvas.width;
  let H = canvas.height;

  const birdBuf = new Float32Array(MAXB * 3);
  const hueBuf = new Float32Array(MAXB);

  return {
    kind: "webgl2",
    resize(w, h, dpr) {
      W = Math.floor(w * dpr);
      H = Math.floor(h * dpr);
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
    },
    draw(s) {
      gl.useProgram(prog);
      gl.uniform1f(uTime, s.time);
      gl.uniform2f(uRes, W, H);
      const n = Math.min(MAXB, s.birds.length);
      gl.uniform1i(uCount, n);
      for (let i = 0; i < n; i++) {
        birdBuf[i * 3] = s.birds[i].x;
        birdBuf[i * 3 + 1] = s.birds[i].y;
        birdBuf[i * 3 + 2] = s.birds[i].glow;
        hueBuf[i] = s.birds[i].hue;
      }
      gl.uniform3fv(uBird, birdBuf);
      gl.uniform1fv(uHue, hueBuf);
      if (s.dragging) {
        gl.uniform3f(uDrag, s.dragging.x, s.dragging.y, s.dragging.glow);
        gl.uniform1f(uDragHue, s.dragging.hue);
      } else {
        gl.uniform3f(uDrag, 0, 0, -1);
        gl.uniform1f(uDragHue, 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    },
  };
}

// ---------------------------------------------------------------------------
// Canvas2D fallback — draws the same dawn-treetop scene + glowing birds.
// ---------------------------------------------------------------------------
function makeCanvasRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let W = canvas.width;
  let H = canvas.height;
  let DPR = 1;

  const drawGlow = (
    x: number,
    y: number,
    r: number,
    hue: number,
    glow: number,
  ) => {
    const px = x * W;
    const py = (1 - y) * H;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    const h = Math.round(hue * 360);
    grad.addColorStop(0, `hsla(${h}, 80%, 88%, ${0.95})`);
    grad.addColorStop(0.3, `hsla(${h}, 75%, 70%, ${0.6 + glow * 0.4})`);
    grad.addColorStop(1, `hsla(${h}, 70%, 60%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };

  return {
    kind: "canvas2d",
    resize(w, h, dpr) {
      DPR = dpr;
      W = Math.floor(w * dpr);
      H = Math.floor(h * dpr);
      canvas.width = W;
      canvas.height = H;
    },
    draw(s) {
      // dawn sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "rgb(189, 217, 235)");
      sky.addColorStop(0.55, "rgb(252, 219, 173)");
      sky.addColorStop(1, "rgb(255, 204, 140)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // sun glow
      const sun = ctx.createRadialGradient(
        W * 0.5,
        H * 0.88,
        0,
        W * 0.5,
        H * 0.88,
        H * 0.5,
      );
      sun.addColorStop(0, "rgba(255,240,200,0.55)");
      sun.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);

      // canopy silhouette along the bottom
      ctx.fillStyle = "rgb(40, 88, 48)";
      ctx.beginPath();
      ctx.moveTo(0, H);
      const baseY = H * 0.86;
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * W;
        const yy =
          baseY -
          Math.abs(Math.sin(i * 0.7) * 18 + Math.sin(i * 0.27) * 28) * DPR;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // additive glows for birds
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const b of s.birds) {
        for (const t of b.trail) {
          drawGlow(t.x, t.y, 14 * DPR, b.hue, 0.2 * t.a);
        }
        drawGlow(b.x, b.y, (34 + b.glow * 26) * DPR, b.hue, b.glow);
      }
      if (s.dragging) {
        drawGlow(
          s.dragging.x,
          s.dragging.y,
          (40 + s.dragging.glow * 24) * DPR,
          s.dragging.hue,
          s.dragging.glow,
        );
      }
      ctx.restore();
    },
    dispose() {
      ctx.clearRect(0, 0, W, H);
    },
  };
}

// Try WebGL2 first; gracefully degrade to Canvas2D.
export function makeRenderer(canvas: HTMLCanvasElement): Renderer | null {
  try {
    const gl = makeGlRenderer(canvas);
    if (gl) return gl;
  } catch {
    /* fall through to canvas2d */
  }
  return makeCanvasRenderer(canvas);
}
