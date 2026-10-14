// Browser runtime for the perf rigs (shader-ab / shader-gpu / shader-raf):
// a shader exactly as the visualizer runs it — its main program plus its
// prepass chain (src/lib/shaders/prepass-gl.ts, the same module).
// Bundle: npx esbuild scripts/perf/gl-runtime.ts --bundle --format=iife --outfile=/tmp/gl-runtime.js
import { createPrepassChain, prepassSupported, type ShaderPrepass } from "../../src/lib/shaders/prepass-gl";

const VERT = "attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}";

export interface RunSpec { main: string; prepass: ShaderPrepass | null }

function makeShader(gl: WebGLRenderingContext, spec: RunSpec, W: number, H: number) {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERT);
  gl.compileShader(vs);
  if (spec.prepass && !prepassSupported(gl, spec.prepass)) throw new Error("prepass unsupported on this context");
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, spec.main);
  gl.compileShader(fs);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_position");
  gl.linkProgram(prog);
  const chain = spec.prepass ? createPrepassChain(gl, vs, spec.prepass) : null;
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("main: " + gl.getShaderInfoLog(fs));
  const err = chain?.linkError();
  if (err) throw new Error(err);
  chain?.resolve(prog);
  chain?.ensure(W, H);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { t: u("u_time"), r: u("u_resolution"), b: u("u_bass"), m: u("u_mid"), tr: u("u_treble"), a: u("u_amplitude") };
  return {
    draw(t: number, au: readonly [number, number, number, number]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      chain?.draw(W, H, t, au);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(prog);
      chain?.bindMain();
      gl.uniform1f(U.t, t);
      gl.uniform2f(U.r, W, H);
      gl.uniform1f(U.b, au[0]);
      gl.uniform1f(U.m, au[1]);
      gl.uniform1f(U.tr, au[2]);
      gl.uniform1f(U.a, au[3]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() { chain?.dispose(); gl.deleteProgram(prog); },
  };
}

(window as unknown as { __glrt: unknown }).__glrt = { makeShader };
