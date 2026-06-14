// gl.ts — WebGL2 spectral "vivisection" renderer for 606-piano-vivisection.
// Hand-written GLSL ES 3.00, no three.js, no CDN. Renders the two extracted
// layers as data textures: harmonic = glowing HORIZONTAL streaks (cool cyan),
// percussive = sharp VERTICAL strikes (hot magenta/white). A balance uniform
// tilts which layer dominates; a playhead sweeps in time with playback.

export interface GlScene {
  /** Upload the two separated magnitude spectrograms (frames * bins each). */
  setSpectrograms(
    harmonic: Float32Array,
    percussive: Float32Array,
    frames: number,
    bins: number,
  ): void;
  /** balance: 0 = all strings, 1 = all hammers. playhead: 0..1. time: secs. */
  render(balance: number, playhead: number, time: number): void;
  resize(): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fragment: sample the two spectrogram textures. Apply a log-ish gain so quiet
// detail is visible. Tint harmonic cool-cyan, percussive hot-magenta. The
// balance shifts the relative brightness so the dominant layer "reveals" while
// the other recedes. A thin bright playhead sweeps the time axis.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform sampler2D u_harm;   // R channel = harmonic magnitude
uniform sampler2D u_perc;   // R channel = percussive magnitude
uniform float u_balance;    // 0 strings .. 1 hammers
uniform float u_playhead;   // 0..1 along time (x)
uniform float u_time;       // seconds
uniform float u_scaleH;     // viz gain for harmonic
uniform float u_scaleP;     // viz gain for percussive

float compress(float v, float g) {
  // log-style compression so faint trails are visible without clipping.
  return clamp(log(1.0 + v * g) / log(1.0 + g), 0.0, 1.0);
}

void main() {
  // x = time (frames), y = frequency (bins). Spectrograms stored frame-major:
  // texel (x = frame, y = bin). Flip y so low freq sits at the bottom.
  vec2 uv = vec2(v_uv.x, v_uv.y);
  float h = texture(u_harm, uv).r;
  float p = texture(u_perc, uv).r;

  float hc = compress(h, u_scaleH);
  float pc = compress(p, u_scaleP);

  // Balance weights: emphasise the dominant layer, dim the other.
  float wH = (1.0 - u_balance);
  float wP = u_balance;
  // Keep both at least faintly visible so the split is always legible.
  wH = 0.18 + 0.82 * wH;
  wP = 0.18 + 0.82 * wP;

  // Clinical palette. Strings: cool grey-cyan. Hammers: hot magenta -> white.
  vec3 cyan = vec3(0.45, 0.85, 1.0);
  vec3 steel = vec3(0.6, 0.7, 0.78);
  vec3 magenta = vec3(1.0, 0.18, 0.7);
  vec3 hot = vec3(1.0, 0.95, 1.0);

  float hi = hc * wH;
  float pi = pc * wP;

  vec3 harmCol = mix(steel, cyan, hc) * hi * 1.4;
  vec3 percCol = mix(magenta, hot, pc) * pi * 1.7;

  vec3 col = harmCol + percCol;

  // Subtle scanning grid to read like a surgical / oscilloscope display.
  float grid = 0.0;
  grid += smoothstep(0.0, 0.5, 0.012 - abs(fract(v_uv.y * 12.0) - 0.0));
  col += vec3(0.02, 0.05, 0.06) * grid;

  // Playhead: a bright vertical line that sweeps with playback.
  float ph = 1.0 - smoothstep(0.0, 0.004, abs(v_uv.x - u_playhead));
  col += vec3(0.9, 1.0, 1.0) * ph * 0.85;
  // Soft leading glow behind the playhead.
  float trail = smoothstep(0.06, 0.0, u_playhead - v_uv.x) * step(v_uv.x, u_playhead);
  col += vec3(0.1, 0.3, 0.35) * trail * 0.25;

  // Vignette + faint flicker so a still glance reads as "alive".
  float vig = smoothstep(1.3, 0.2, length(v_uv - 0.5));
  col *= 0.55 + 0.45 * vig;
  col += vec3(0.01, 0.015, 0.02) * (0.5 + 0.5 * sin(u_time * 1.7));

  frag = vec4(col, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function makeFloatTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * Create the WebGL2 scene. Throws if WebGL2 (or the float-texture extension we
 * need for linear filtering) is unavailable — the caller shows a text-rose-300
 * notice in that case.
 */
export function createScene(canvas: HTMLCanvasElement): GlScene {
  const glCtx = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!glCtx) throw new Error("WebGL2 unavailable");
  // Non-null binding so nested closures see a narrowed type.
  const gl: WebGL2RenderingContext = glCtx;

  // We upload R32F textures and want LINEAR filtering on them.
  const extColor = gl.getExtension("EXT_color_buffer_float");
  const extLinear = gl.getExtension("OES_texture_float_linear");
  // extColor isn't strictly required (we don't render to float), but request it
  // to keep some drivers happy. extLinear lets us LINEAR-filter R32F.
  void extColor;

  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // Fullscreen triangle.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const harmTex = makeFloatTexture(gl);
  const percTex = makeFloatTexture(gl);

  const uHarm = gl.getUniformLocation(prog, "u_harm");
  const uPerc = gl.getUniformLocation(prog, "u_perc");
  const uBalance = gl.getUniformLocation(prog, "u_balance");
  const uPlayhead = gl.getUniformLocation(prog, "u_playhead");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uScaleH = gl.getUniformLocation(prog, "u_scaleH");
  const uScaleP = gl.getUniformLocation(prog, "u_scaleP");

  let texW = 1;
  let texH = 1;
  let useFloat = !!extLinear;
  let scaleH = 60;
  let scaleP = 90;

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Transpose a frame-major (frame*bins+bin) spectrogram into a texture laid
  // out as (x = frame/time, y = bin/freq), low freq at bottom. Also normalize.
  function uploadSpectrogram(
    tex: WebGLTexture,
    spec: Float32Array,
    frames: number,
    bins: number,
  ): number {
    // Find a robust max for normalization (95th-ish percentile via plain max).
    let max = 0;
    for (let i = 0; i < spec.length; i++) if (spec[i] > max) max = spec[i];
    const inv = max > 1e-9 ? 1 / max : 1;

    const w = frames;
    const h = bins;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, useFloat ? 4 : 1);

    if (useFloat) {
      const data = new Float32Array(w * h);
      for (let f = 0; f < frames; f++) {
        for (let b = 0; b < bins; b++) {
          // texel row = bin, flip so low freq at bottom; col = frame.
          const dy = bins - 1 - b;
          data[dy * w + f] = spec[f * bins + b] * inv;
        }
      }
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
      } catch {
        useFloat = false;
      }
    }
    if (!useFloat) {
      const data = new Uint8Array(w * h);
      for (let f = 0; f < frames; f++) {
        for (let b = 0; b < bins; b++) {
          const dy = bins - 1 - b;
          data[dy * w + f] = Math.min(255, Math.round(spec[f * bins + b] * inv * 255));
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    }
    texW = w;
    texH = h;
    return max;
  }

  function setSpectrograms(
    harmonic: Float32Array,
    percussive: Float32Array,
    frames: number,
    bins: number,
  ): void {
    uploadSpectrogram(harmTex, harmonic, frames, bins);
    uploadSpectrogram(percTex, percussive, frames, bins);
    // When falling back to 8-bit textures, magnitudes are already 0..1 so use a
    // lighter compression gain.
    if (!useFloat) {
      scaleH = 12;
      scaleP = 18;
    }
    void texW;
    void texH;
  }

  function render(balance: number, playhead: number, time: number): void {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, harmTex);
    gl.uniform1i(uHarm, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, percTex);
    gl.uniform1i(uPerc, 1);

    gl.uniform1f(uBalance, balance);
    gl.uniform1f(uPlayhead, playhead);
    gl.uniform1f(uTime, time);
    gl.uniform1f(uScaleH, scaleH);
    gl.uniform1f(uScaleP, scaleP);

    gl.clearColor(0.015, 0.02, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteProgram(prog);
    gl.deleteTexture(harmTex);
    gl.deleteTexture(percTex);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
  }

  resize();
  return { setSpectrograms, render, resize, dispose };
}
