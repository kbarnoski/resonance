// ════════════════════════════════════════════════════════════════════════════
// gl.ts — WebGL2 "reducing valve" renderer for 2864-stillpoint.
//
// A fullscreen fragment shader that samples the live camera and, as the valve
// opens (uValve 0→1), progressively warps that image through the retina→V1
// log-polar map (imported from _shared/psych/logpolar's LOGPOLAR_GLSL) and
// blends it with animated Klüver form-constant geometry — tunnels, spokes,
// spirals, honeycombs — until at full stillness the camera is almost entirely
// overwritten by slowly-breathing kaleidoscopic geometry.
//
// No camera? uHasVideo=0 and the shader synthesises a calm nebula to warp, so
// the piece still self-plays.
// ════════════════════════════════════════════════════════════════════════════

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uVideo;
uniform vec2  uRes;
uniform float uTime;
uniform float uValve;    // 0 = valve CLOSED (literal camera) .. 1 = OPEN (geometry)
uniform float uForm;     // 0..1 continuous morph across the four form constants
uniform float uFlicker;  // safe luminance multiplier in [floor, 1]
uniform float uHasVideo; // 1.0 if a real camera texture is bound, else 0.0

${LOGPOLAR_GLSL}

const float TAU = 6.28318530718;

// IQ cosine palette — violet-leaning, iridescent.
vec3 palette(float t) {
  vec3 a = vec3(0.50, 0.42, 0.60);
  vec3 b = vec3(0.45, 0.38, 0.48);
  vec3 c = vec3(1.0, 1.05, 1.20);
  vec3 d = vec3(0.28, 0.10, 0.42);
  return a + b * cos(TAU * (c * t + d));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// A calm procedural nebula, used as the "literal image" when no camera exists.
vec3 nebula(vec2 uv) {
  float t = uTime * 0.05;
  float n = 0.0;
  n += 0.5 * sin(uv.x * 3.0 + t);
  n += 0.5 * sin(uv.y * 2.3 - t * 1.3);
  n += 0.4 * sin((uv.x + uv.y) * 1.7 + t * 0.7);
  float v = 0.5 + 0.22 * n;
  return mix(vec3(0.03, 0.01, 0.08), vec3(0.30, 0.24, 0.42), v);
}

// Sample the camera (or nebula) at a centered, aspect-normalized coord.
vec3 sampleScene(vec2 c) {
  if (uHasVideo > 0.5) {
    // cover-fit the video across the screen; mirror x for a selfie feel.
    float k = min(uRes.x, uRes.y);
    vec2 tc = c * k / uRes;      // back to screen-space fraction, centered
    tc = tc + 0.5;
    tc.x = 1.0 - tc.x;           // mirror
    if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) return vec3(0.02, 0.0, 0.05);
    return texture(uVideo, tc).rgb;
  }
  return nebula(c);
}

// The four Klüver form constants morphed continuously by uForm.
float formField(vec2 cx, float phase) {
  float freq = 7.5;
  float wTunnel = formConstant(cx, 0.0, freq, phase);          // concentric rings
  float wSpoke  = formConstant(cx, 1.5707963, freq, phase);    // radial spokes
  float wSpiral = formConstant(cx, 0.7853982, freq, phase);    // diagonals
  float wHex    = honeycomb(cx, freq * 0.6, phase);            // lattice

  float m = clamp(uForm, 0.0, 1.0) * 3.0;
  float v;
  if (m < 1.0)      v = mix(wTunnel, wSpoke,  smoothstep(0.0, 1.0, m));
  else if (m < 2.0) v = mix(wSpoke,  wSpiral, smoothstep(1.0, 2.0, m));
  else              v = mix(wSpiral, wHex,    smoothstep(2.0, 3.0, m));
  return v;
}

void main() {
  vec2 c = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // --- log-polar warp of the scene, growing with the valve --------------------
  vec2 cx = screenToCortex(c);
  // slow breathing zoom (always gentle) + a spiral twist that grows as we still.
  float breath = 0.06 * sin(uTime * 0.18);
  cx.x += breath;
  cx.y += uValve * (0.55 * sin(cx.x * 2.0 + uTime * 0.25));
  vec2 warped = cortexToScreen(cx);
  vec2 sampleC = mix(c, warped, uValve);

  vec3 cam = sampleScene(sampleC);
  float camLuma = dot(cam, vec3(0.299, 0.587, 0.114));

  // --- form-constant geometry, driven partly by the camera's own structure ----
  float phase = uTime * (0.35 + uValve * 0.5);
  float g = formField(cx, phase);                 // [-? ] roughly [0,1]
  float hue = uTime * 0.02 + g * 0.6 + camLuma * 0.25;
  vec3 geo = palette(hue);
  // the camera image still faintly drives the geometry brightness (overwriting
  // what you see, not erasing it).
  geo *= 0.55 + 0.6 * camLuma;

  // --- blend: geometry bleeds through as the valve opens ----------------------
  float geoAmount = smoothstep(0.12, 0.96, uValve);
  vec3 col = mix(cam, geo, geoAmount);

  // saturation / neural gain rises with the valve
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.85 + uValve * 0.6);

  // radial vignette frames the tunnel
  float r0 = length(c);
  float vig = smoothstep(1.25, 0.1, r0);
  col *= mix(0.30, 1.0, vig);
  col += vec3(0.05, 0.0, 0.09) * (1.0 - vig) * uValve;

  // gentle visual-snow grain, stronger as geometry takes over
  float gr = hash21(gl_FragCoord.xy + fract(uTime) * 71.3);
  col += (gr - 0.5) * (0.02 + uValve * 0.05);

  // safe slow luminance drift (<=3 Hz, gated upstream)
  col *= uFlicker;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface StillpointGL {
  render(opts: {
    video: HTMLVideoElement | null;
    time: number;
    valve: number;
    form: number;
    flicker: number;
  }): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile error: " + log);
  }
  return sh;
}

/** Build the renderer. Returns null if WebGL2 is unavailable. */
export function createStillpointGL(canvas: HTMLCanvasElement): StillpointGL | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    throw new Error("program link error: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(prog);

  // fullscreen triangle
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uValve = gl.getUniformLocation(prog, "uValve");
  const uForm = gl.getUniformLocation(prog, "uForm");
  const uFlicker = gl.getUniformLocation(prog, "uFlicker");
  const uHasVideo = gl.getUniformLocation(prog, "uHasVideo");
  const uVideo = gl.getUniformLocation(prog, "uVideo");

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uVideo, 0);
  // seed a 1x1 so the sampler is always valid
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 2, 20, 255]));

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cssW = canvas.clientWidth || window.innerWidth;
  let cssH = canvas.clientHeight || window.innerHeight;

  function applySize() {
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  applySize();

  let hadVideoFrame = false;

  return {
    render({ video, time, valve, form, flicker }) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);

      let hasVideo = 0;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          hasVideo = 1;
          hadVideoFrame = true;
        } catch {
          hasVideo = hadVideoFrame ? 1 : 0;
        }
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uValve, valve);
      gl.uniform1f(uForm, form);
      gl.uniform1f(uFlicker, flicker);
      gl.uniform1f(uHasVideo, hasVideo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w: number, h: number) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = w;
      cssH = h;
      applySize();
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}
