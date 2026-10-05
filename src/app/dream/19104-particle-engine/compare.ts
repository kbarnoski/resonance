// compare.ts — renders one of TODAY's journey shaders on its own canvas so
// the showcase can put it side by side with the particle engine on the same
// audio. Mirrors how src/components/audio/visualizer.tsx draws a layer:
// WebGL1 full-screen fragment shader, the shared u_time / u_resolution /
// u_bass / u_mid / u_treble / u_amplitude uniforms, band values × 0.85
// (visualizer REACTIVITY), and the high-tier 1.5× DPR ceiling, so the left
// half shows what a journey actually draws, not a strawman.

export interface ShaderLayer {
  render(time: number, bass: number, mid: number, treble: number, amp: number): void;
  dispose(): void;
}

const VS = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const REACTIVITY = 0.85;
const DPR_CEIL = 1.5;

export function createShaderLayer(canvas: HTMLCanvasElement, frag: string): ShaderLayer | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uTime = u("u_time"), uRes = u("u_resolution"), uBass = u("u_bass");
  const uMid = u("u_mid"), uTreble = u("u_treble"), uAmp = u("u_amplitude");

  return {
    render(time, bass, mid, treble, amp) {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CEIL);
      const w = Math.max(16, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(16, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uBass, bass * REACTIVITY);
      gl.uniform1f(uMid, mid * REACTIVITY);
      gl.uniform1f(uTreble, treble * REACTIVITY);
      gl.uniform1f(uAmp, amp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    },
  };
}
