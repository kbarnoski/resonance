// ─────────────────────────────────────────────────────────────────────────────
// 1462-box-temple · shader.ts — WebGL2 full-screen Mandelbox raymarcher.
//
//   One fragment shader sphere-traces a Mandelbox distance estimator (Tglad,
//   2010; DE technique per Iñigo Quílez). A single full-screen triangle drives
//   it — no vertex attributes, no meshes, no three.js. Surface normals come from
//   the DE gradient; step-count gives cheap ambient occlusion; corridors glow
//   from a grazing-distance accumulator. Colour is an IQ cosine palette driven
//   by the orbit trap, tuned to cold temple stone with a warm inner light.
//
//   All camera / fold parameters arrive as uniforms so the CPU sampler in
//   mandelbox.ts can march the SAME field for audio.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
void main() {
  // full-screen triangle from gl_VertexID — covers the clip cube, no buffers
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform vec3  uCamFwd;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform float uScale;
uniform int   uIter;
uniform float uMinR2;
uniform float uFixedR2;
uniform float uTime;
uniform float uDrive;    // 0..1 fold intensity → warmer, brighter interior
uniform float uReduced;  // 1.0 = prefers-reduced-motion → damp brightness

const int   MAX_ITER  = 16;
const int   MAX_STEPS = 110;
const float MAX_DIST  = 22.0;

// Mandelbox DE with an orbit-trap colour channel written to \`trap\`.
float mbox(vec3 pos, out float trap) {
  vec3 v = pos;
  vec3 c = pos;
  float dr = 1.0;
  trap = 1e9;
  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= uIter) break;
    // box fold
    v = clamp(v, -1.0, 1.0) * 2.0 - v;
    // sphere fold
    float r2 = dot(v, v);
    if (r2 < uMinR2) {
      float t = uFixedR2 / uMinR2;
      v *= t; dr *= t;
    } else if (r2 < uFixedR2) {
      float t = uFixedR2 / r2;
      v *= t; dr *= t;
    }
    v = v * uScale + c;
    dr = dr * abs(uScale) + 1.0;
    trap = min(trap, length(v));
  }
  return length(v) / abs(dr);
}

float mboxDE(vec3 p) {
  float t;
  return mbox(p, t);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    mboxDE(p + e.xyy) - mboxDE(p - e.xyy),
    mboxDE(p + e.yxy) - mboxDE(p - e.yxy),
    mboxDE(p + e.yyx) - mboxDE(p - e.yyx)
  ));
}

// IQ cosine palette — cold indigo/violet stone into warm amber light.
vec3 pal(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.0, 0.9, 0.75) + vec3(0.0, 0.18, 0.5)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uv.x * uCamRight + uv.y * uCamUp + 1.5 * uCamFwd);

  vec3 bg = vec3(0.015, 0.017, 0.045);

  float t = 0.02;
  float trap = 1e9;
  float glow = 0.0;
  int steps = 0;
  bool hit = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    float tr;
    float d = mbox(p, tr);
    // grazing-distance corridor haze
    glow += 0.014 / (1.0 + d * d * 60.0);
    float eps = 0.0007 * t + 0.0004;
    if (d < eps) {
      trap = tr;
      steps = i;
      hit = true;
      break;
    }
    t += d * 0.9;
    steps = i;
    if (t > MAX_DIST) break;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 L = normalize(vec3(0.45, 0.72, 0.42));
    float ao = 1.0 - float(steps) / float(MAX_STEPS);
    float dif = clamp(dot(n, L), 0.0, 1.0);
    float amb = 0.22 + 0.30 * ao;
    float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);

    float tt = trap * 0.55 + uTime * 0.008;
    vec3 base = pal(tt);
    col = base * (amb + dif * 0.8);
    col += rim * pal(tt + 0.35) * 0.45;
    // warm inner light grows with fold drive
    col += pal(trap * 0.6 + 0.55) * (0.10 + 0.30 * uDrive) * ao;
    // depth fog toward the void
    float fog = exp(-t * 0.10);
    col = mix(bg, col, fog);
  } else {
    col = bg;
  }

  // corridor haze tint drifts cold→warm with drive
  vec3 hazeTint = mix(vec3(0.28, 0.32, 0.62), vec3(0.95, 0.68, 0.36), uDrive);
  col += glow * hazeTint * (0.9 - 0.35 * uReduced);

  // gentle tone map + gamma — keep it calm, no blown highlights (photosafe)
  col = col / (1.0 + col);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));
  col *= (1.0 - 0.15 * uReduced);

  fragColor = vec4(col, 1.0);
}`;

export interface RenderUniforms {
  camPos: [number, number, number];
  camFwd: [number, number, number];
  camRight: [number, number, number];
  camUp: [number, number, number];
  scale: number;
  iterations: number;
  minRadius2: number;
  fixedRadius2: number;
  time: number;
  drive: number;
  reduced: number;
}

export interface Rig {
  render(u: RenderUniforms): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

/** Build the raymarch rig, or return null if WebGL2 is unavailable. */
export function makeRig(canvas: HTMLCanvasElement): Rig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();

  const loc = {
    res: gl.getUniformLocation(prog, "uRes"),
    camPos: gl.getUniformLocation(prog, "uCamPos"),
    camFwd: gl.getUniformLocation(prog, "uCamFwd"),
    camRight: gl.getUniformLocation(prog, "uCamRight"),
    camUp: gl.getUniformLocation(prog, "uCamUp"),
    scale: gl.getUniformLocation(prog, "uScale"),
    iter: gl.getUniformLocation(prog, "uIter"),
    minR2: gl.getUniformLocation(prog, "uMinR2"),
    fixedR2: gl.getUniformLocation(prog, "uFixedR2"),
    time: gl.getUniformLocation(prog, "uTime"),
    drive: gl.getUniformLocation(prog, "uDrive"),
    reduced: gl.getUniformLocation(prog, "uReduced"),
  };

  const lose = gl.getExtension("WEBGL_lose_context");

  return {
    render(u: RenderUniforms) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform3fv(loc.camPos, u.camPos);
      gl.uniform3fv(loc.camFwd, u.camFwd);
      gl.uniform3fv(loc.camRight, u.camRight);
      gl.uniform3fv(loc.camUp, u.camUp);
      gl.uniform1f(loc.scale, u.scale);
      gl.uniform1i(loc.iter, u.iterations);
      gl.uniform1f(loc.minR2, u.minRadius2);
      gl.uniform1f(loc.fixedR2, u.fixedRadius2);
      gl.uniform1f(loc.time, u.time);
      gl.uniform1f(loc.drive, u.drive);
      gl.uniform1f(loc.reduced, u.reduced);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w: number, h: number, dpr: number) {
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    },
    dispose() {
      try {
        gl.useProgram(null);
        gl.bindVertexArray(null);
        if (vao) gl.deleteVertexArray(vao);
        gl.deleteProgram(prog);
        lose?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
