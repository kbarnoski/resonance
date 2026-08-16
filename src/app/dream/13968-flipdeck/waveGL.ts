// ─────────────────────────────────────────────────────────────────────────────
// waveGL.ts — the WebGL2 flip-ribbon renderer.
//
// Karel's whole waveform is drawn as a horizontal ribbon (a TRIANGLE_STRIP built
// from precomputed per-bin min/max peaks), with the detected beat/bar grid baked
// into a second static buffer, and the loop region + playhead re-uploaded each
// frame into a small dynamic buffer. One shader program throughout: vec2 clip
// position + vec4 colour per vertex.  Palette: cool ice → violet.
//
// Everything lives in normalised time t ∈ [0,1] mapped to clip x ∈ [-1,1].
// Returns null if WebGL2 is unavailable so the page can fall back to SVG.
// ─────────────────────────────────────────────────────────────────────────────

export interface WaveDrawState {
  /** playhead position, normalised time 0..1. */
  playhead01: number;
  /** loop region bounds, normalised time 0..1. */
  loopStart01: number;
  loopEnd01: number;
  loopActive: boolean;
  /** live drag selection (while the pointer is down), or null. */
  selStart01: number | null;
  selEnd01: number | null;
  /** 0..1 spectrum glow from the analyser. */
  glow: number;
}

export interface WaveRenderer {
  setGrid(beatTimes: number[], barTimes: number[], duration: number): void;
  setWaveform(min: Float32Array, max: Float32Array): void;
  resize(): void;
  draw(state: WaveDrawState): void;
  destroy(): void;
}

const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec4 a_col;
out vec4 v_col;
void main() {
  v_col = a_col;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_col;
out vec4 o;
void main() { o = v_col; }`;

// ice (deep teal-blue) → violet, both cool
const ICE: [number, number, number] = [0.36, 0.72, 0.95];
const VIOLET: [number, number, number] = [0.62, 0.42, 0.98];

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export function createWaveRenderer(canvas: HTMLCanvasElement): WaveRenderer | null {
  const glMaybe = canvas.getContext("webgl2", {
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!glMaybe) return null;
  const gl = glMaybe; // narrowed non-null, captured by the closures below

  let program: WebGLProgram;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  } catch {
    return null;
  }

  const aPos = gl.getAttribLocation(program, "a_pos");
  const aCol = gl.getAttribLocation(program, "a_col");

  // ── waveform (static strip) ──
  const waveVAO = gl.createVertexArray()!;
  const waveBuf = gl.createBuffer()!;
  let waveCount = 0;

  // ── grid (static triangles) ──
  const gridVAO = gl.createVertexArray()!;
  const gridBuf = gl.createBuffer()!;
  let gridCount = 0;

  // ── overlay (dynamic: loop region, selection, playhead) ──
  const overVAO = gl.createVertexArray()!;
  const overBuf = gl.createBuffer()!;

  function bindLayout(vao: WebGLVertexArrayObject, buf: WebGLBuffer): void {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 24, 8);
  }
  bindLayout(waveVAO, waveBuf);
  bindLayout(gridVAO, gridBuf);
  bindLayout(overVAO, overBuf);
  gl.bindVertexArray(null);

  const t2x = (t: number) => t * 2 - 1;

  function setWaveform(min: Float32Array, max: Float32Array): void {
    const bins = Math.min(min.length, max.length);
    // TRIANGLE_STRIP: 2 verts per bin (bottom=min, top=max), 6 floats each
    const verts = new Float32Array(bins * 2 * 6);
    let p = 0;
    const yScale = 0.82;
    for (let b = 0; b < bins; b++) {
      const t = bins > 1 ? b / (bins - 1) : 0;
      const x = t2x(t);
      const [r, g, bl] = mix3(ICE, VIOLET, t);
      // top vertex (max), slightly brighter
      verts[p++] = x;
      verts[p++] = Math.max(0.004, max[b]) * yScale;
      verts[p++] = r * 1.05;
      verts[p++] = g * 1.05;
      verts[p++] = bl * 1.05;
      verts[p++] = 0.92;
      // bottom vertex (min)
      verts[p++] = x;
      verts[p++] = Math.min(-0.004, min[b]) * yScale;
      verts[p++] = r * 0.7;
      verts[p++] = g * 0.7;
      verts[p++] = bl * 0.7;
      verts[p++] = 0.92;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, waveBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    waveCount = bins * 2;
  }

  function pushVLine(
    arr: number[],
    t: number,
    halfW: number,
    y0: number,
    y1: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    const x = t2x(t);
    const l = x - halfW;
    const rr = x + halfW;
    // two triangles
    arr.push(l, y0, r, g, b, a, rr, y0, r, g, b, a, rr, y1, r, g, b, a);
    arr.push(l, y0, r, g, b, a, rr, y1, r, g, b, a, l, y1, r, g, b, a);
  }

  function pushRect(
    arr: number[],
    t0: number,
    t1: number,
    y0: number,
    y1: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    const l = t2x(t0);
    const rr = t2x(t1);
    arr.push(l, y0, r, g, b, a, rr, y0, r, g, b, a, rr, y1, r, g, b, a);
    arr.push(l, y0, r, g, b, a, rr, y1, r, g, b, a, l, y1, r, g, b, a);
  }

  function setGrid(beatTimes: number[], barTimes: number[], duration: number): void {
    const arr: number[] = [];
    const barSet = new Set(barTimes);
    const hw = 0.0009;
    for (const t of beatTimes) {
      const t01 = duration > 0 ? t / duration : 0;
      if (barSet.has(t)) {
        // downbeat — brighter, taller violet-white
        pushVLine(arr, t01, hw * 2.2, -0.95, 0.95, 0.78, 0.7, 1.0, 0.5);
      } else {
        // beat — subtle ice
        pushVLine(arr, t01, hw, -0.7, 0.7, 0.5, 0.62, 0.8, 0.22);
      }
    }
    const data = new Float32Array(arr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gridCount = arr.length / 6;
  }

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

  function draw(state: WaveDrawState): void {
    resize();
    // deep cool background
    gl.clearColor(0.035, 0.045, 0.075, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);

    // overlay first (behind waveform): loop-region + selection fills
    const arr: number[] = [];
    if (state.loopActive) {
      const g = 0.14 + 0.16 * state.glow;
      pushRect(arr, state.loopStart01, state.loopEnd01, -1, 1, 0.55, 0.42, 0.95, g);
      // edges
      pushVLine(arr, state.loopStart01, 0.0016, -1, 1, 0.75, 0.6, 1.0, 0.8);
      pushVLine(arr, state.loopEnd01, 0.0016, -1, 1, 0.75, 0.6, 1.0, 0.8);
    }
    if (state.selStart01 != null && state.selEnd01 != null) {
      const a = Math.min(state.selStart01, state.selEnd01);
      const b = Math.max(state.selStart01, state.selEnd01);
      pushRect(arr, a, b, -1, 1, 0.4, 0.8, 0.95, 0.16);
    }
    if (arr.length > 0) {
      gl.bindVertexArray(overVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, overBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, arr.length / 6);
    }

    // waveform ribbon
    if (waveCount > 0) {
      gl.bindVertexArray(waveVAO);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, waveCount);
    }

    // beat grid
    if (gridCount > 0) {
      gl.bindVertexArray(gridVAO);
      gl.drawArrays(gl.TRIANGLES, 0, gridCount);
    }

    // playhead on top
    const ph: number[] = [];
    const gl0 = 0.85 + 0.15 * state.glow;
    pushVLine(ph, state.playhead01, 0.0022, -1, 1, 0.95 * gl0, 0.98 * gl0, 1.0, 0.98);
    pushVLine(ph, state.playhead01, 0.006, -1, 1, 0.8, 0.9, 1.0, 0.18 * gl0);
    gl.bindVertexArray(overVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, overBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ph), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, ph.length / 6);

    gl.bindVertexArray(null);
  }

  function destroy(): void {
    try {
      gl.deleteBuffer(waveBuf);
      gl.deleteBuffer(gridBuf);
      gl.deleteBuffer(overBuf);
      gl.deleteVertexArray(waveVAO);
      gl.deleteVertexArray(gridVAO);
      gl.deleteVertexArray(overVAO);
      gl.deleteProgram(program);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch {
      /* context already gone */
    }
  }

  return { setGrid, setWaveform, resize, draw, destroy };
}
