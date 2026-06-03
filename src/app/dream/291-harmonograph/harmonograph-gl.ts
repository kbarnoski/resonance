// ── Harmonograph geometry + raw WebGL2 line renderer ─────────────────────────
// We synthesize a multi-pendulum harmonograph curve from held-note ratios and
// stream it into a VBO each frame as a LINE_STRIP. A translucent fullscreen
// quad fades the previous frame to leave a fading ink trail.

import { midiToFreq, snapToJustRatio } from "./audio-engine";

export type Pendulum = {
  ratio: number; // frequency ratio vs lowest note  → rᵢ
  amp: number; // amplitude (velocity-scaled)         → aᵢ
  phaseX: number; // φᵢ
  phaseY: number; // kᵢ (extra y phase)
  decay: number; // dᵢ
};

export type NoteInput = { midi: number; velocity: number };

/** Build the pendulum set from held notes + tuning mode. */
export function buildPendulums(
  notes: NoteInput[],
  justIntonation: boolean
): Pendulum[] {
  if (notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) => a.midi - b.midi);
  const baseMidi = sorted[0].midi;
  const baseFreq = midiToFreq(baseMidi);
  return sorted.map((n, i) => {
    const rawRatio = midiToFreq(n.midi) / baseFreq;
    const ratio = justIntonation ? snapToJustRatio(rawRatio) : rawRatio;
    return {
      ratio,
      amp: 0.45 + n.velocity * 0.55,
      phaseX: (i * Math.PI) / 3,
      phaseY: (i * Math.PI) / 5 + Math.PI / 7,
      // small per-note decay so the figure spirals inward
      decay: 0.012 + i * 0.004,
    };
  });
}

/** Idle "seed" pendulums shown when nothing is held — a gentle Lissajous. */
export function seedPendulums(time: number): Pendulum[] {
  const wobble = 0.06 * Math.sin(time * 0.18);
  return [
    { ratio: 1, amp: 0.7, phaseX: 0, phaseY: 0, decay: 0.0 },
    { ratio: 2 + wobble, amp: 0.4, phaseX: Math.PI / 2, phaseY: 0.3, decay: 0.0 },
    { ratio: 3, amp: 0.22, phaseX: 0.7, phaseY: 1.1, decay: 0.0 },
  ];
}

/**
 * Resample the harmonograph curve into an interleaved Float32Array of (x,y).
 * `rotate` slowly turns the whole figure; `tMax` is the parameter span.
 */
export function sampleCurve(
  out: Float32Array,
  pts: number,
  pends: Pendulum[],
  rotate: number,
  tMax: number
): number {
  if (pends.length === 0) return 0;
  const cosR = Math.cos(rotate);
  const sinR = Math.sin(rotate);
  let norm = 0;
  for (const p of pends) norm += p.amp;
  norm = norm > 0 ? 1 / norm : 1;

  for (let i = 0; i < pts; i++) {
    const t = (i / (pts - 1)) * tMax;
    let x = 0;
    let y = 0;
    for (const p of pends) {
      const env = Math.exp(-p.decay * t);
      x += p.amp * Math.sin(p.ratio * t + p.phaseX) * env;
      y += p.amp * Math.cos(p.ratio * t + p.phaseY) * env;
    }
    x *= norm;
    y *= norm;
    // rotate + scale to clip space (leave margin)
    const rx = (x * cosR - y * sinR) * 0.82;
    const ry = (x * sinR + y * cosR) * 0.82;
    out[i * 2] = rx;
    out[i * 2 + 1] = ry;
  }
  return pts;
}

// ── GLSL ─────────────────────────────────────────────────────────────────────

const LINE_VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform float uAspect;
out float vT;
void main(){
  vT = float(gl_VertexID);
  vec2 p = aPos;
  // correct for aspect so the figure isn't stretched
  if (uAspect > 1.0) p.x /= uAspect; else p.y *= uAspect;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in float vT;
uniform float uCount;
uniform vec3 uColor;
out vec4 frag;
void main(){
  // brighter at the leading end of the trail
  float head = vT / max(uCount, 1.0);
  float a = mix(0.10, 0.85, head);
  frag = vec4(uColor * a, a);
}`;

const FADE_VS = `#version 300 es
const vec2 verts[4] = vec2[4](
  vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0), vec2(1.0,1.0));
void main(){ gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }`;

const FADE_FS = `#version 300 es
precision highp float;
uniform float uFade;
out vec4 frag;
void main(){ frag = vec4(0.02, 0.03, 0.05, uFade); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram();
  if (!p) throw new Error("program create failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

export type GLRenderer = {
  resize: (w: number, h: number, dpr: number) => void;
  fade: (amount: number) => void;
  drawCurve: (data: Float32Array, count: number, color: [number, number, number], aspect: number) => void;
  clear: () => void;
  dispose: () => void;
};

/** Build the renderer or throw if WebGL2 is unavailable. */
export function makeRenderer(
  gl: WebGL2RenderingContext,
  maxPoints: number
): GLRenderer {
  const lineProg = link(gl, LINE_VS, LINE_FS);
  const fadeProg = link(gl, FADE_VS, FADE_FS);

  const uAspect = gl.getUniformLocation(lineProg, "uAspect");
  const uCount = gl.getUniformLocation(lineProg, "uCount");
  const uColor = gl.getUniformLocation(lineProg, "uColor");
  const uFade = gl.getUniformLocation(fadeProg, "uFade");

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, maxPoints * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const emptyVao = gl.createVertexArray(); // for the fullscreen fade quad

  gl.enable(gl.BLEND);

  return {
    resize(w, h, dpr) {
      gl.canvas.width = Math.max(1, Math.floor(w * dpr));
      gl.canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    },
    clear() {
      gl.clearColor(0.02, 0.03, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    fade(amount) {
      // draw a translucent near-black quad over the whole frame
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(fadeProg);
      gl.uniform1f(uFade, amount);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
    drawCurve(data, count, color, aspect) {
      if (count < 2) return;
      // additive glow for the ink
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(lineProg);
      gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uCount, count);
      gl.uniform3f(uColor, color[0], color[1], color[2]);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * 2));
      gl.drawArrays(gl.LINE_STRIP, 0, count);
      gl.bindVertexArray(null);
    },
    dispose() {
      try {
        gl.deleteBuffer(vbo);
        gl.deleteVertexArray(vao);
        gl.deleteVertexArray(emptyVao);
        gl.deleteProgram(lineProg);
        gl.deleteProgram(fadeProg);
      } catch {
        /* noop */
      }
    },
  };
}
