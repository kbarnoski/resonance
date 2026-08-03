// render.ts — raw WebGL2 setup + draw for the energy ridge. Hand-written
// GLSL, getContext("webgl2"), no three.js. Static arrays (the energy curve
// and section marks) upload once; per-frame we only push the playhead,
// pump and time uniforms.

import { FRAG_SRC, VERT_SRC } from "./shaders";

export interface Rig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
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
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

const UNIFORMS = [
  "u_res",
  "u_time",
  "u_playhead",
  "u_playE",
  "u_pump",
  "u_reduce",
  "u_energy",
  "u_hot",
  "u_sec",
  "u_secN",
];

export function makeGLRig(canvas: HTMLCanvasElement): Rig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of UNIFORMS) u[n] = gl.getUniformLocation(program, n);

  return { gl, program, u };
}

// Upload the fixed arrangement data (energy curve + section marks) once.
export function uploadStatic(
  rig: Rig,
  energy: Float32Array,
  hot: Float32Array,
  sec: Float32Array,
  secN: number,
) {
  const { gl, u } = rig;
  gl.uniform1fv(u.u_energy, energy);
  gl.uniform1fv(u.u_hot, hot);
  gl.uniform1fv(u.u_sec, sec);
  gl.uniform1i(u.u_secN, secN);
}

export interface FrameOpts {
  time: number;
  playhead: number;
  playE: number;
  pump: number;
  reduce: boolean;
}

export function drawRidge(rig: Rig, o: FrameOpts) {
  const { gl, u } = rig;
  gl.uniform2f(u.u_res, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(u.u_time, o.time);
  gl.uniform1f(u.u_playhead, o.playhead);
  gl.uniform1f(u.u_playE, o.playE);
  gl.uniform1f(u.u_pump, o.pump);
  gl.uniform1f(u.u_reduce, o.reduce ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function disposeRig(rig: Rig) {
  rig.gl.deleteProgram(rig.program);
  rig.gl.getExtension("WEBGL_lose_context")?.loseContext();
}
