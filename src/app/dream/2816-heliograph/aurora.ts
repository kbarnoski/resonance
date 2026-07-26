// ─────────────────────────────────────────────────────────────────────────────
// 2816-heliograph — the aurora renderer.
//
// Primary path is a WebGL2 fragment shader painting vertical auroral curtains:
//   • height / brightness  ← solar-wind speed + Kp
//   • color / turbulence   ← Bz  (calm green–violet drift when northward;
//                                  roiling, reddened, turbulent when southward)
// Motion is slow LUMINANCE DRIFT, never strobe (all oscillation ≤ ~0.3 Hz).
// If WebGL2 is unavailable the caller uses the Canvas2D fallback below.
// Raw hex/vec3 art colors live here inside the art layer, as sanctioned.
// ─────────────────────────────────────────────────────────────────────────────

import type { DerivedParams } from "./noaa";

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uSpeed;      // 0..1 aurora height/energy
uniform float uKp;         // 0..1 activity
uniform float uBright;     // 0..1 field brightness
uniform float uBz;         // -1..1 (positive = northward = calm)
uniform float uReduced;    // 1.0 = reduced motion

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++){
    v += amp * noise(p);
    p *= 2.02; amp *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;          // 0..1, y up
  float storm = clamp(-uBz, 0.0, 1.0);       // southward strength
  float calm  = clamp( uBz, 0.0, 1.0);       // northward strength

  // Slow drift time — reduced motion nearly freezes the flow.
  float t = uTime * mix(0.06, 0.012, uReduced);

  // Curtain field: vertical filaments that ripple horizontally. Turbulence
  // (extra warping + faster churn) grows with the storm.
  float turb = 0.25 + storm * 1.1;
  float warp = fbm(vec2(uv.x * 3.0, uv.y * 1.2 - t * 1.5)) * turb;
  float bands = fbm(vec2(uv.x * 14.0 + warp * 2.0 + t * 0.4, t * 0.5));
  float curtain = fbm(vec2(uv.x * 6.0 + bands * 1.5, uv.y * 2.0 - t * 2.0));

  // Vertical envelope: curtains rise from the horizon; taller with speed+Kp.
  float height = 0.35 + uSpeed * 0.45 + uKp * 0.2;
  float vgrad = smoothstep(height, 0.0, uv.y);          // bright low, fading up
  float base = smoothstep(0.02, 0.0, uv.y);             // horizon glow

  float intensity = curtain * vgrad;
  intensity = pow(clamp(intensity, 0.0, 1.0), 1.6);
  // Slow luminance breathing (≈0.18 Hz — safely below flicker range).
  float breathe = 0.82 + 0.18 * sin(uTime * 1.1 + uv.x * 2.0);
  intensity *= mix(1.0, breathe, 0.5);
  intensity += base * (0.15 + uKp * 0.2);
  intensity *= 0.5 + uBright * 0.8;

  // Palette — calm: aurora green → brand violet. Stormy: reddened + violet.
  vec3 green  = vec3(0.15, 0.95, 0.55);
  vec3 violet = vec3(0.55, 0.30, 1.00);   // brand-family
  vec3 red    = vec3(1.00, 0.28, 0.30);
  vec3 calmCol = mix(green, violet, 0.35 + 0.4 * fbm(vec2(uv.x * 2.0, t)));
  vec3 stormCol = mix(red, violet, 0.4 + 0.3 * curtain);
  vec3 col = mix(calmCol, stormCol, storm);
  col = mix(col, col * 1.15 + violet * 0.1, calm * 0.4);

  col *= intensity * 1.6;

  // Deep space backdrop with a faint violet wash near the horizon.
  vec3 bg = mix(vec3(0.02, 0.02, 0.05), vec3(0.05, 0.03, 0.10), base);
  col += bg;

  // Subtle sparse stars up high.
  float star = step(0.997, hash(floor(uv * uRes / 2.0)));
  col += star * (1.0 - vgrad) * 0.5;

  fragColor = vec4(col, 1.0);
}`;

export interface AuroraGL {
  render: (p: DerivedParams, timeSec: number, reduced: boolean) => void;
  resize: () => void;
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
    console.error("heliograph shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the WebGL2 aurora renderer, or return null if WebGL2 is unavailable. */
export function makeAuroraGL(canvas: HTMLCanvasElement): AuroraGL | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", { antialias: true });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("heliograph link:", gl.getProgramInfoLog(prog));
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
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);
  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    speed: gl.getUniformLocation(prog, "uSpeed"),
    kp: gl.getUniformLocation(prog, "uKp"),
    bright: gl.getUniformLocation(prog, "uBright"),
    bz: gl.getUniformLocation(prog, "uBz"),
    reduced: gl.getUniformLocation(prog, "uReduced"),
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  return {
    resize,
    render: (p, timeSec, reduced) => {
      gl!.useProgram(prog);
      gl!.bindVertexArray(vao);
      gl!.uniform2f(u.res, canvas.width, canvas.height);
      gl!.uniform1f(u.time, timeSec);
      gl!.uniform1f(u.speed, p.speedNorm);
      gl!.uniform1f(u.kp, p.intensity);
      gl!.uniform1f(u.bright, p.brightness);
      gl!.uniform1f(u.bz, p.bzSigned);
      gl!.uniform1f(u.reduced, reduced ? 1 : 0);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    },
    dispose: () => {
      gl!.deleteProgram(prog);
      gl!.deleteBuffer(buf);
      gl!.deleteVertexArray(vao);
      const lose = gl!.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
// Layered vertical curtains with slow horizontal drift; color from Bz. Lower
// fidelity than the shader but the aurora still breathes.
export interface Aurora2D {
  render: (p: DerivedParams, timeSec: number, reduced: boolean) => void;
  resize: () => void;
  dispose: () => void;
}

export function makeAurora2D(
  canvas: HTMLCanvasElement,
  rng: () => number,
): Aurora2D | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Fixed star field so the backdrop is deterministic + stable across frames.
  const stars = Array.from({ length: 90 }, () => ({
    x: rng(),
    y: rng() * 0.55,
    a: 0.2 + rng() * 0.6,
  }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  };
  resize();

  return {
    resize,
    render: (p, timeSec, reduced) => {
      const w = canvas.width;
      const h = canvas.height;
      const storm = Math.max(0, -p.bzSigned);
      const t = timeSec * (reduced ? 0.06 : 0.35);

      ctx.fillStyle = "#04030a";
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        ctx.globalAlpha = s.a * 0.7;
        ctx.fillStyle = "#c4b5fd";
        ctx.fillRect(s.x * w, s.y * h, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = "lighter";
      const columns = 46;
      const height = 0.35 + p.speedNorm * 0.45 + p.intensity * 0.2;
      for (let i = 0; i < columns; i++) {
        const fx = i / columns;
        const sway =
          Math.sin(fx * 9 + t) * 0.03 + Math.sin(fx * 20 - t * 1.3) * 0.02;
        const x = (fx + sway) * w;
        const amp =
          0.4 +
          0.6 *
            Math.abs(
              Math.sin(fx * 12 + t * 0.8 + i) *
                Math.sin(fx * 3 - t * 0.5),
            );
        const top = h * (1 - height * amp);
        const grad = ctx.createLinearGradient(0, h, 0, top);
        // Calm green→violet vs stormy red→violet.
        const g0 = storm > 0.5 ? "255,70,70" : "40,240,140";
        const g1 = "140,80,255";
        const breathe = 0.7 + 0.3 * Math.sin(timeSec * 1.0 + i);
        const alpha = (0.05 + p.brightness * 0.08) * breathe;
        grad.addColorStop(0, `rgba(${g0},${alpha})`);
        grad.addColorStop(0.6, `rgba(${g1},${alpha * 0.8})`);
        grad.addColorStop(1, "rgba(140,80,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - w / columns, top, (w / columns) * 2.2, h - top);
      }
      ctx.globalCompositeOperation = "source-over";
    },
    dispose: () => {},
  };
}
