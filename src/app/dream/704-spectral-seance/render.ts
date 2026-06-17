/* ──────────────────────────────────────────────────────────────────────────
   render.ts — WebGL2 raster output (the data-spectacle).

   The dreamed image is uploaded as a texture and drawn on a full-screen quad
   via a fragment shader. The shader adds, in lock-step with audio playback:
     • a sweeping vertical CYAN scan-line at the current playback column,
     • a faint Ikeda grid + scanline darkening,
     • a soft cross-fade between the outgoing and incoming dream textures.
   Canvas2D is NOT used for output here — only WebGL2. If webgl2 is null the
   caller shows a notice and keeps audio running.
   ────────────────────────────────────────────────────────────────────────── */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_curr;
uniform sampler2D u_prev;
uniform float u_fade;    // 0..1 cross-fade from prev→curr
uniform float u_scan;    // 0..1 scan-line position (playback column)
uniform float u_time;
uniform vec2  u_res;

void main() {
  vec2 uv = v_uv;
  vec3 a = texture(u_prev, uv).rgb;
  vec3 b = texture(u_curr, uv).rgb;
  vec3 col = mix(a, b, clamp(u_fade, 0.0, 1.0));

  // austere data grid
  vec2 g = abs(fract(uv * vec2(48.0, 36.0)) - 0.5);
  float grid = smoothstep(0.49, 0.5, max(g.x, g.y));
  col += vec3(0.0, 0.06, 0.08) * grid * 0.4;

  // horizontal scanline darkening (CRT-ish data read)
  float sl = 0.92 + 0.08 * sin(uv.y * u_res.y * 1.4);
  col *= sl;

  // sweeping cyan scan-line at the playback column
  float d = abs(uv.x - u_scan);
  float line = smoothstep(0.012, 0.0, d);
  // a soft glow trailing BEHIND the head (to the left of u_scan)
  float behind = u_scan - uv.x;               // >0 to the left of the head
  float trail = smoothstep(0.12, 0.0, behind) * step(0.0, behind);
  vec3 cyan = vec3(0.30, 0.95, 1.0);
  col += cyan * line;
  col += cyan * trail * 0.16;

  // vignette
  float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
  col *= vig;

  outColor = vec4(col, 1.0);
}`;

export interface Renderer {
  setCurrent: (cv: HTMLCanvasElement) => void; // promote curr→prev, set new curr
  setScan: (x: number) => void; // 0..1 playback position
  dispose: () => void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

function makeTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // 1x1 black placeholder
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );
  return t;
}

// returns null if webgl2 unavailable (caller shows graceful notice)
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || "link failed");
    }
  } catch {
    return null;
  }

  // full-screen triangle pair
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texCurr = makeTexture(gl);
  const texPrev = makeTexture(gl);

  const uCurr = gl.getUniformLocation(prog, "u_curr");
  const uPrev = gl.getUniformLocation(prog, "u_prev");
  const uFade = gl.getUniformLocation(prog, "u_fade");
  const uScan = gl.getUniformLocation(prog, "u_scan");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uRes = gl.getUniformLocation(prog, "u_res");

  let fade = 1; // starts fully on current
  let scan = 0;
  let disposed = false;
  let raf = 0;
  const t0 = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr) || 2;
    const h = Math.floor(canvas.clientHeight * dpr) || 2;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);

  function uploadTo(tex: WebGLTexture, cv: HTMLCanvasElement) {
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, 0);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      cv
    );
  }

  // We keep prev = the previously-shown canvas so the cross-fade is correct:
  // the old current image becomes prev, the new one becomes current.
  let lastCanvas: HTMLCanvasElement | null = null;
  function setCurrent(cv: HTMLCanvasElement) {
    if (lastCanvas) uploadTo(texPrev, lastCanvas);
    uploadTo(texCurr, cv);
    lastCanvas = cv;
    fade = 0; // animate prev→curr
  }

  function setScan(x: number) {
    scan = x;
  }

  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    resize();
    fade = Math.min(1, fade + 0.02); // ~0.8s cross-fade

    gl!.useProgram(prog);
    gl!.bindVertexArray(vao);

    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texCurr);
    gl!.uniform1i(uCurr, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, texPrev);
    gl!.uniform1i(uPrev, 1);

    gl!.uniform1f(uFade, fade);
    gl!.uniform1f(uScan, scan);
    gl!.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl!.uniform2f(uRes, canvas.width, canvas.height);

    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  }
  frame();

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    try {
      gl!.deleteTexture(texCurr);
      gl!.deleteTexture(texPrev);
      gl!.deleteBuffer(buf);
      gl!.deleteVertexArray(vao);
      gl!.deleteProgram(prog);
    } catch {
      /* context may be lost */
    }
  }

  return { setCurrent, setScan, dispose };
}
