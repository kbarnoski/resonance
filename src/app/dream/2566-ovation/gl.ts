// gl.ts — raw WebGL2 renderer for the crowd field (no three.js).
//
// One GL_POINT per clapper, positioned in the stadium bowl. A per-agent
// "flash" attribute (uploaded each frame) blooms bright violet-white on a clap
// and decays, so an incoherent crowd twinkles at random while a phase-locked
// crowd pulses as one — with traveling wavefronts from the position-based
// phase lead in the sim. A translucent fade quad each frame leaves soft
// persistence trails so the waves read.

export interface Renderer {
  resize(w: number, h: number, dpr: number): void;
  frame(
    posX: Float32Array,
    posY: Float32Array,
    flash: Float32Array,
    n: number,
    r: number,
  ): void;
  dispose(): void;
}

const POINT_VS = `#version 300 es
in vec2 aPos;
in float aFlash;
uniform float uPointSize;
uniform float uAspect;
out float vFlash;
void main(){
  vec2 p = aPos;
  p.x /= uAspect;
  gl_Position = vec4(p * 0.95, 0.0, 1.0);
  gl_PointSize = uPointSize * (1.0 + aFlash * 2.4);
  vFlash = aFlash;
}`;

const POINT_FS = `#version 300 es
precision highp float;
in float vFlash;
uniform float uCoh;
out vec4 frag;
void main(){
  vec2 d = gl_PointCoord - vec2(0.5);
  float rr = length(d) * 2.0;
  float disc = smoothstep(1.0, 0.0, rr);
  // Idle seats are a dim violet; a clap blooms toward hot white.
  vec3 idle = vec3(0.20, 0.13, 0.34);
  vec3 warm = vec3(0.62, 0.42, 1.0);
  vec3 hot  = vec3(1.0, 0.94, 1.0);
  float f = clamp(vFlash, 0.0, 1.0);
  vec3 col = mix(idle, warm, smoothstep(0.0, 0.35, f));
  col = mix(col, hot, smoothstep(0.45, 1.0, f) * (0.6 + 0.4 * uCoh));
  float a = disc * (0.16 + f * 0.9);
  frag = vec4(col * a, a);
}`;

const FADE_VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FADE_FS = `#version 300 es
precision highp float;
uniform float uFade;
out vec4 frag;
void main(){ frag = vec4(0.02, 0.015, 0.04, uFade); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? "link");
  }
  return p;
}

export function createWebGL2Renderer(
  canvas: HTMLCanvasElement,
  maxAgents: number,
): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
  });
  if (!gl) return null;

  const pointProg = link(gl, POINT_VS, POINT_FS);
  const fadeProg = link(gl, FADE_VS, FADE_FS);

  const aPos = gl.getAttribLocation(pointProg, "aPos");
  const aFlash = gl.getAttribLocation(pointProg, "aFlash");
  const uPointSize = gl.getUniformLocation(pointProg, "uPointSize");
  const uAspect = gl.getUniformLocation(pointProg, "uAspect");
  const uCoh = gl.getUniformLocation(pointProg, "uCoh");
  const aFadePos = gl.getAttribLocation(fadeProg, "aPos");
  const uFade = gl.getUniformLocation(fadeProg, "uFade");

  const posBuf = gl.createBuffer()!;
  const interleaved = new Float32Array(maxAgents * 2);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved.byteLength, gl.DYNAMIC_DRAW);

  const flashBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, flashBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxAgents * 4, gl.DYNAMIC_DRAW);

  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  let aspect = 1;
  let dprScale = 1;

  return {
    resize(w, h, dpr) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      aspect = canvas.width / canvas.height;
      dprScale = dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.02, 0.015, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    frame(posX, posY, flash, n, r) {
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Persistence: fade the previous frame instead of clearing.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(fadeProg);
      gl.uniform1f(uFade, 0.34);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aFadePos);
      gl.vertexAttribPointer(aFadePos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Upload positions (interleaved) + flash for the active crowd.
      for (let i = 0; i < n; i++) {
        interleaved[i * 2] = posX[i];
        interleaved[i * 2 + 1] = posY[i];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, interleaved.subarray(0, n * 2));
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, flashBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, flash.subarray(0, n));
      gl.enableVertexAttribArray(aFlash);
      gl.vertexAttribPointer(aFlash, 1, gl.FLOAT, false, 0, 0);

      // Additive claps.
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pointProg);
      const base = Math.max(
        2,
        Math.min(9, 46 / Math.sqrt(n)) * dprScale,
      );
      gl.uniform1f(uPointSize, base);
      gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uCoh, r);
      gl.drawArrays(gl.POINTS, 0, n);

      gl.disable(gl.BLEND);
    },
    dispose() {
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(flashBuf);
      gl.deleteBuffer(quad);
      gl.deleteProgram(pointProg);
      gl.deleteProgram(fadeProg);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
}
