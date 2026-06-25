// glfallback.ts — hand-written raw WebGL2 renderer.
//
// Used when navigator.gpu is unavailable. Renders the SAME scene as gpu.ts: a
// warm chord-colored sky gradient, a tempo-driven shimmer band, twinkle dust,
// and player note-blooms — via a single full-screen-quad fragment shader.
// No three.js, no libraries.

import type { SkyRenderer, SkyState } from './scene-types'

const MAX_BLOOMS = 8

const VERT = `#version 300 es
precision highp float;
const vec2 verts[4] = vec2[4](
  vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0), vec2(1.0,1.0)
);
out vec2 vUv;
void main(){
  vec2 p = verts[gl_VertexID];
  // uv with y down (top = 0) to match the WebGPU path
  vUv = vec2(p.x*0.5+0.5, 1.0 - (p.y*0.5+0.5));
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uAspect;
uniform float uPulse;
uniform vec3  uHue;
uniform float uBeatPhase;
uniform float uBloomCount;
uniform vec4  uBlooms[${MAX_BLOOMS}]; // x, y, age, bright

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

void main(){
  vec2 uv = vUv;
  vec2 p = uv;
  p.x = (p.x - 0.5) * uAspect + 0.5;

  vec3 deep = uHue * 0.30 + vec3(0.03, 0.02, 0.05);
  vec3 lift = uHue * 0.72 + vec3(0.05, 0.04, 0.06);
  vec3 col = mix(lift, deep, smoothstep(0.0, 1.0, uv.y));

  col += 0.02 * sin(uTime * 0.5 + uv.x * 3.0) * uHue;

  float band = exp(-pow((uv.y - uBeatPhase) * 3.5, 2.0));
  col += uHue * band * (0.10 + 0.20 * uPulse);

  vec2 cell = floor(uv * 90.0);
  float h = hash(cell);
  if (h > 0.985) {
    float tw = 0.5 + 0.5 * sin(uTime * 1.5 + h * 30.0);
    col += vec3(1.0, 0.96, 0.9) * tw * 0.5;
  }

  for (int i = 0; i < ${MAX_BLOOMS}; i++) {
    if (float(i) >= uBloomCount) break;
    vec4 b = uBlooms[i];
    float bx = (b.x - 0.5) * uAspect + 0.5;
    float age = b.z;
    float bright = b.w;
    if (age > 0.0) {
      float d = length(p - vec2(bx, b.y));
      float core = exp(-d*d * 240.0) * age * bright;
      float ring = exp(-pow((d - (1.0-age)*0.18) * 26.0, 2.0)) * age * 0.5 * bright;
      vec3 warm = mix(uHue, vec3(1.0, 0.95, 0.8), 0.6);
      col += warm * (core * 1.6 + ring);
    }
  }

  float vd = length(uv - vec2(0.5));
  col *= 1.0 - vd*vd*0.6;

  col = col / (col + vec3(0.9));
  col = pow(col, vec3(0.9));
  outColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function initSkyGl(canvas: HTMLCanvasElement): SkyRenderer | null {
  const glOrNull = canvas.getContext('webgl2', { antialias: true, alpha: false }) as WebGL2RenderingContext | null
  if (!glOrNull) return null
  const gl: WebGL2RenderingContext = glOrNull

  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  const vao = gl.createVertexArray()

  const uTime = gl.getUniformLocation(prog, 'uTime')
  const uAspect = gl.getUniformLocation(prog, 'uAspect')
  const uPulse = gl.getUniformLocation(prog, 'uPulse')
  const uHue = gl.getUniformLocation(prog, 'uHue')
  const uBeatPhase = gl.getUniformLocation(prog, 'uBeatPhase')
  const uBloomCount = gl.getUniformLocation(prog, 'uBloomCount')
  const uBlooms = gl.getUniformLocation(prog, 'uBlooms[0]')

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const bloomBuf = new Float32Array(MAX_BLOOMS * 4)

  function sizeCanvas() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  sizeCanvas()

  return {
    kind: 'webgl2',
    render(s: SkyState) {
      sizeCanvas()
      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      gl.uniform1f(uTime, s.time)
      gl.uniform1f(uAspect, canvas.width / Math.max(1, canvas.height))
      gl.uniform1f(uPulse, s.pulse)
      gl.uniform3f(uHue, s.hue[0], s.hue[1], s.hue[2])
      gl.uniform1f(uBeatPhase, s.beatPhase)
      const n = Math.min(MAX_BLOOMS, s.blooms.length)
      gl.uniform1f(uBloomCount, n)
      bloomBuf.fill(0)
      for (let i = 0; i < n; i++) {
        const b = s.blooms[i]
        bloomBuf[i * 4] = b.x
        bloomBuf[i * 4 + 1] = b.y
        bloomBuf[i * 4 + 2] = b.age
        bloomBuf[i * 4 + 3] = b.bright
      }
      gl.uniform4fv(uBlooms, bloomBuf)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    resize() {
      sizeCanvas()
    },
    dispose() {
      try {
        gl.deleteProgram(prog)
        if (vao) gl.deleteVertexArray(vao)
      } catch {
        /* noop */
      }
      try {
        const ext = gl.getExtension('WEBGL_lose_context')
        if (ext) ext.loseContext()
      } catch {
        /* noop */
      }
    },
  }
}
