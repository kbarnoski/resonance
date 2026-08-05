// ─────────────────────────────────────────────────────────────────────────────
// 7032-chladni · renderer.ts — the WebGL2 rig that runs the GPU sand sim.
//
//   Three programs: BACKGROUND (the plate square), UPDATE (transform-feedback
//   advection of grains toward nodal lines), RENDER (additive glowing point
//   sprites). Grain state ping-pongs between two interleaved [x,y,seed] VBOs.
//   Returns null when WebGL2 is unavailable so the page can degrade gracefully.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BG_FRAG,
  BG_VERT,
  RENDER_FRAG,
  RENDER_VERT,
  UPDATE_FRAG,
  UPDATE_VERT,
} from "./sim";

export interface StepOpts {
  modesData: Float32Array; // 8×vec3 (m,n,w)
  modeCount: number;
  norm: number;
  shake: number; // 0..1 audio amplitude
  frame: number;
}

export interface Renderer {
  resize(): void;
  step(opts: StepOpts): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  feedback?: string[],
): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  if (feedback) gl.transformFeedbackVaryings(prog, feedback, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

/** Deterministic PRNG — seeded grain layout, no Math.random / Date.now. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRenderer(
  canvas: HTMLCanvasElement,
  count: number,
  seed: number,
): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const bgProg = link(gl, BG_VERT, BG_FRAG);
  const updateProg = link(gl, UPDATE_VERT, UPDATE_FRAG, ["v_pos", "v_seed"]);
  const renderProg = link(gl, RENDER_VERT, RENDER_FRAG);
  if (!bgProg || !updateProg || !renderProg) return null;

  // ── grain buffers: interleaved [x, y, seed] × count, ping-ponged ────────
  const rnd = mulberry32(seed);
  const init = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    init[i * 3 + 0] = rnd();
    init[i * 3 + 1] = rnd();
    init[i * 3 + 2] = rnd();
  }
  const bufs: [WebGLBuffer, WebGLBuffer] = [
    gl.createBuffer() as WebGLBuffer,
    gl.createBuffer() as WebGLBuffer,
  ];
  for (const b of bufs) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
  }

  const STRIDE = 12;
  const bindGrainAttribs = () => {
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8);
  };

  // Two VAOs, one per source buffer; attrib layout fixed via layout(location).
  const vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject] = [
    gl.createVertexArray() as WebGLVertexArrayObject,
    gl.createVertexArray() as WebGLVertexArrayObject,
  ];
  for (let i = 0; i < 2; i++) {
    gl.bindVertexArray(vaos[i]);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
    bindGrainAttribs();
  }
  gl.bindVertexArray(null);

  const tf = gl.createTransformFeedback();

  // ── background quad ─────────────────────────────────────────────────────
  const bgVao = gl.createVertexArray();
  const bgBuf = gl.createBuffer();
  gl.bindVertexArray(bgVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // ── uniform locations ───────────────────────────────────────────────────
  const uBg = { fit: gl.getUniformLocation(bgProg, "u_fit") };
  const uU = {
    count: gl.getUniformLocation(updateProg, "u_count"),
    modes: gl.getUniformLocation(updateProg, "u_modes"),
    norm: gl.getUniformLocation(updateProg, "u_norm"),
    step: gl.getUniformLocation(updateProg, "u_step"),
    jitter: gl.getUniformLocation(updateProg, "u_jitter"),
    shake: gl.getUniformLocation(updateProg, "u_shake"),
    frame: gl.getUniformLocation(updateProg, "u_frame"),
  };
  const uR = {
    fit: gl.getUniformLocation(renderProg, "u_fit"),
    count: gl.getUniformLocation(renderProg, "u_count"),
    modes: gl.getUniformLocation(renderProg, "u_modes"),
    norm: gl.getUniformLocation(renderProg, "u_norm"),
    point: gl.getUniformLocation(renderProg, "u_point"),
  };

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pointSize = Math.max(1.5, 2.4 * dpr);
  let cur = 0; // source buffer index

  const resize = () => {
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  resize();

  const step = (opts: StepOpts) => {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const s = Math.min(w, h);
    const fitX = s / w;
    const fitY = s / h;
    const dst = 1 - cur;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);

    // Pass 1 — background plate.
    gl.useProgram(bgProg);
    gl.bindVertexArray(bgVao);
    gl.uniform2f(uBg.fit, fitX, fitY);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2 — UPDATE grains via transform feedback (no rasterization).
    gl.useProgram(updateProg);
    gl.uniform1i(uU.count, opts.modeCount);
    gl.uniform3fv(uU.modes, opts.modesData);
    gl.uniform1f(uU.norm, opts.norm);
    gl.uniform1f(uU.step, 0.009);
    gl.uniform1f(uU.jitter, 0.011);
    gl.uniform1f(uU.shake, 0.25 + 0.75 * Math.min(1, opts.shake));
    gl.uniform1f(uU.frame, opts.frame);
    gl.bindVertexArray(vaos[cur]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufs[dst]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    // Pass 3 — RENDER the freshly written grains as additive glow.
    gl.useProgram(renderProg);
    gl.uniform2f(uR.fit, fitX, fitY);
    gl.uniform1i(uR.count, opts.modeCount);
    gl.uniform3fv(uR.modes, opts.modesData);
    gl.uniform1f(uR.norm, opts.norm);
    gl.uniform1f(uR.point, pointSize);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(vaos[dst]);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    cur = dst;
  };

  const dispose = () => {
    gl.deleteProgram(bgProg);
    gl.deleteProgram(updateProg);
    gl.deleteProgram(renderProg);
    gl.deleteBuffer(bufs[0]);
    gl.deleteBuffer(bufs[1]);
    gl.deleteBuffer(bgBuf);
    gl.deleteVertexArray(vaos[0]);
    gl.deleteVertexArray(vaos[1]);
    gl.deleteVertexArray(bgVao);
    if (tf) gl.deleteTransformFeedback(tf);
  };

  return { resize, step, dispose };
}
