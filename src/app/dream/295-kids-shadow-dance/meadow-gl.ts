// meadow-gl.ts — the dusk meadow itself, rendered in a single full-screen-quad
// WebGL2 fragment shader (#version 300 es). One program, two textures:
//   u_motion  — the low-res motion field (R = motion this frame per cell)
//   u_trail   — an accumulated light-trail buffer (decays each frame in JS)
// plus a faint self-silhouette composited from the same motion/luma data.
// No three.js. If WebGL2 is unavailable the caller shows a fallback notice.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// One fragment shader paints the whole meadow. The motion field (uploaded as a
// small RG texture) blooms flowers, opens light and casts a soft silhouette.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_energy;     // 0..1 total movement → how awake the meadow is
uniform sampler2D u_motion; // R = motion this frame, G = silhouette presence
uniform sampler2D u_trail;  // accumulated glowing trails (RGB)

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 4; i++) { v += amp * vnoise(p); p *= 2.02; amp *= 0.5; }
  return v;
}

// Sample the motion field with a little bilinear softening (texture is set to
// LINEAR, so a single fetch already interpolates).
float motionAt(vec2 uv) {
  // mirror x so the meadow reads like a mirror — the child's left is screen left
  return texture(u_motion, vec2(1.0 - uv.x, uv.y)).r;
}
float silhouetteAt(vec2 uv) {
  return texture(u_motion, vec2(1.0 - uv.x, uv.y)).g;
}

// A single soft flower bloom: bright warm centre, petals falling off.
vec3 flower(vec2 uv, vec2 c, float r, float hue, float open) {
  float d = length((uv - c) * vec2(u_res.x / u_res.y, 1.0));
  float petal = 0.5 + 0.5 * cos(atan(uv.y - c.y, uv.x - c.x) * 6.0 + hue * 9.0);
  float body = smoothstep(r, 0.0, d) * open;
  float ring = smoothstep(r * 1.3, r * 0.4, d) * petal * 0.5 * open;
  vec3 warm = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.55, 0.75), fract(hue));
  vec3 core = vec3(1.0, 0.95, 0.8);
  return core * body * 1.4 + warm * ring;
}

void main() {
  vec2 uv = v_uv;

  // ── dusk sky → meadow gradient ─────────────────────────────────────────
  vec3 skyTop = vec3(0.10, 0.09, 0.22);
  vec3 skyLow = vec3(0.34, 0.18, 0.30);
  vec3 grass  = vec3(0.06, 0.10, 0.10);
  float horizon = 0.46;
  vec3 col;
  if (uv.y > horizon) {
    float g = smoothstep(horizon, 1.0, uv.y);
    col = mix(skyLow, skyTop, g);
    // a soft setting glow low in the sky, brighter when the meadow is awake
    float glow = exp(-abs(uv.y - horizon) * 4.0) * (0.25 + 0.5 * u_energy);
    col += glow * vec3(1.0, 0.55, 0.30) * (0.4 + 0.6 * (1.0 - abs(uv.x - 0.5) * 1.4));
    // a few quiet dusk stars up high
    vec2 sp = uv * vec2(u_res.x / u_res.y, 1.0) * 70.0;
    float star = hash(floor(sp));
    float tw = 0.5 + 0.5 * sin(u_time * 2.0 + star * 40.0);
    col += smoothstep(0.991, 1.0, star) * tw * vec3(0.8, 0.85, 1.0) * g;
  } else {
    float g = smoothstep(0.0, horizon, uv.y);
    col = mix(grass * 0.6, grass, g);
    // gently waving grass blades (denser, brighter as the meadow wakes)
    float blades = fbm(vec2(uv.x * 60.0 + sin(uv.y * 30.0 + u_time * 0.6) * 0.4,
                            uv.y * 18.0));
    col += smoothstep(0.55, 0.95, blades) * vec3(0.10, 0.22, 0.12)
           * (0.4 + 0.8 * u_energy);
  }

  // ── light trails (accumulated, decaying buffer) ────────────────────────
  vec3 trail = texture(u_trail, vec2(1.0 - uv.x, uv.y)).rgb;
  col += trail;

  // ── blooms from hot motion cells ───────────────────────────────────────
  // Sample motion on a coarse grid and bloom a flower from each lit cell.
  float m = motionAt(uv);
  // bloom right at this fragment scaled by local motion + global energy
  float open = smoothstep(0.06, 0.5, m);
  vec3 here = flower(uv, uv, 0.012 + 0.05 * m, hash(floor(uv * 14.0)) + u_time * 0.02, open);
  col += here * (0.8 + 0.6 * u_energy);

  // ── faint self-silhouette composite ────────────────────────────────────
  float sil = silhouetteAt(uv);
  // a cool rim so the child reads as a glowing presence, never a hard cutout
  vec3 silCol = mix(vec3(0.25, 0.45, 0.55), vec3(0.55, 0.75, 0.95), sil);
  col = mix(col, col * 0.55 + silCol * 0.35, smoothstep(0.12, 0.6, sil) * 0.7);

  // gentle vignette + clamp
  float vig = smoothstep(1.3, 0.4, length(uv - 0.5));
  col *= mix(0.82, 1.0, vig);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// A tiny second program accumulates the decaying trail buffer:
//   newTrail = oldTrail * decay + freshMotionColor
const TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_prev;   // previous trail buffer
uniform sampler2D u_motion; // current motion field
uniform float u_decay;      // ~0.92 per frame
uniform float u_time;
void main() {
  vec2 uv = v_uv;
  vec3 prev = texture(u_prev, uv).rgb * u_decay;
  float m = texture(u_motion, uv).r;
  // fresh glow tinted by position (warm low, cool high) so trails shimmer
  vec3 tint = mix(vec3(1.0, 0.6, 0.35), vec3(0.55, 0.85, 1.0), uv.y);
  vec3 fresh = tint * smoothstep(0.05, 0.6, m) * (0.6 + 0.4 * sin(u_time + uv.x * 20.0));
  fragColor = vec4(max(prev, prev + fresh * 0.5), 1.0);
}`;

export const MOTION_W = 32;
export const MOTION_H = 24;

export interface MeadowHandle {
  /** Upload a fresh motion field (RG bytes, length MOTION_W*MOTION_H*2). */
  setMotion: (data: Uint8Array, energy: number) => void;
  /** Stop the render loop and release GL resources. */
  dispose: () => void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("meadow shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("meadow program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// A small float/byte texture we re-upload the motion field into.
function makeTex(gl: WebGL2RenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Start the meadow. Returns null if WebGL2 is unavailable / setup fails so the
// caller can show a graceful fallback.
export function startMeadow(canvas: HTMLCanvasElement): MeadowHandle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const sceneProg = link(gl, VERT, FRAG);
  const trailProg = link(gl, VERT, TRAIL_FRAG);
  if (!sceneProg || !trailProg) return null;

  // Full-screen quad shared by both passes.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Motion field texture (RG8, MOTION_W×MOTION_H).
  const motionTex = makeTex(gl);
  if (!motionTex) return null;
  const initMotion = new Uint8Array(MOTION_W * MOTION_H * 2);
  gl.bindTexture(gl.TEXTURE_2D, motionTex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RG8, MOTION_W, MOTION_H, 0,
    gl.RG, gl.UNSIGNED_BYTE, initMotion,
  );

  // Two ping-pong RGBA8 trail buffers + framebuffers.
  const trailW = 256;
  const trailH = 192;
  const trailTex: (WebGLTexture | null)[] = [makeTex(gl), makeTex(gl)];
  const trailFbo: (WebGLFramebuffer | null)[] = [];
  for (let i = 0; i < 2; i++) {
    gl.bindTexture(gl.TEXTURE_2D, trailTex[i]);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, trailW, trailH, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, trailTex[i], 0,
    );
    trailFbo[i] = fbo;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let cur = 0; // which trail buffer is "current" (the source)

  // Uniform locations.
  const sU = {
    res: gl.getUniformLocation(sceneProg, "u_res"),
    time: gl.getUniformLocation(sceneProg, "u_time"),
    energy: gl.getUniformLocation(sceneProg, "u_energy"),
    motion: gl.getUniformLocation(sceneProg, "u_motion"),
    trail: gl.getUniformLocation(sceneProg, "u_trail"),
  };
  const tU = {
    prev: gl.getUniformLocation(trailProg, "u_prev"),
    motion: gl.getUniformLocation(trailProg, "u_motion"),
    decay: gl.getUniformLocation(trailProg, "u_decay"),
    time: gl.getUniformLocation(trailProg, "u_time"),
  };

  let energy = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
    }
  };

  let raf = 0;
  let disposed = false;
  const startT = performance.now();

  const frame = () => {
    if (disposed) return;
    resize();
    const t = (performance.now() - startT) / 1000;

    // ── pass 1: accumulate trails into the "other" buffer ────────────────
    const next = 1 - cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFbo[next]);
    gl.viewport(0, 0, trailW, trailH);
    gl.useProgram(trailProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTex[cur]);
    gl.uniform1i(tU.prev, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, motionTex);
    gl.uniform1i(tU.motion, 1);
    gl.uniform1f(tU.decay, 0.9);
    gl.uniform1f(tU.time, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ── pass 2: render meadow to screen using fresh trail buffer ─────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(sceneProg);
    gl.uniform2f(sU.res, canvas.width, canvas.height);
    gl.uniform1f(sU.time, t);
    gl.uniform1f(sU.energy, energy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, motionTex);
    gl.uniform1i(sU.motion, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, trailTex[next]);
    gl.uniform1i(sU.trail, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    cur = next;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setMotion: (data: Uint8Array, e: number) => {
      energy += (e - energy) * 0.2; // smooth energy a touch
      gl.bindTexture(gl.TEXTURE_2D, motionTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0, MOTION_W, MOTION_H,
        gl.RG, gl.UNSIGNED_BYTE, data,
      );
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteBuffer(quad);
      gl.deleteProgram(sceneProg);
      gl.deleteProgram(trailProg);
      gl.deleteTexture(motionTex);
      trailTex.forEach((tx) => tx && gl.deleteTexture(tx));
      trailFbo.forEach((f) => f && gl.deleteFramebuffer(f));
    },
  };
}
