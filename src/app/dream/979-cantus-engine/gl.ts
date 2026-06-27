// gl.ts — raw WebGL2 scrolling piano-roll renderer (no three.js).
//
// Renders note rectangles as instanced-ish geometry (we just stream a vertex
// buffer of quads each frame — counts are small). Each note carries a voice
// color. The view scrolls right→left in "beat" space so the right edge is
// "now". A Canvas2D fallback (in canvas2d.ts) mirrors the same model.
//
// The manuscript register: warm paper-dark background, fine staff hairlines,
// muted distinct voice inks.

export interface RollNote {
  voice: number;
  midi: number;
  startBeat: number;
  durBeats: number;
}

// muted manuscript inks per voice (rgb 0..1)
export const VOICE_COLORS: [number, number, number][] = [
  [0.45, 0.55, 0.78], // bass — slate blue
  [0.78, 0.55, 0.42], // tenor — terracotta
  [0.52, 0.72, 0.58], // alto — sage
  [0.74, 0.62, 0.82], // soprano — muted violet
];

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;     // unit quad 0..1
layout(location=1) in vec4 aRect;    // x,y,w,h in clip-ish [-1,1] already
layout(location=2) in vec4 aColor;   // rgba
out vec4 vColor;
out vec2 vLocal;
void main() {
  vec2 p = aRect.xy + aPos * aRect.zw;
  vLocal = aPos;
  vColor = aColor;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vLocal;
out vec4 frag;
void main() {
  // soft rounded-ish edge in y for an inked look
  float edge = smoothstep(0.0, 0.16, vLocal.y) * smoothstep(0.0, 0.16, 1.0 - vLocal.y);
  frag = vec4(vColor.rgb, vColor.a * (0.55 + 0.45 * edge));
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
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

export class RollRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private quadBuf: WebGLBuffer;
  private instBuf: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  midiLow = 36;
  midiHigh = 84;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link failed: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;

    const vao = gl.createVertexArray()!;
    this.vao = vao;
    gl.bindVertexArray(vao);

    // unit quad
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // per-instance data: rect(4) + color(4) interleaved = 8 floats
    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(w: number, h: number, dpr: number) {
    const gl = this.gl;
    gl.canvas.width = Math.floor(w * dpr);
    gl.canvas.height = Math.floor(h * dpr);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  // nowBeat = the beat value at the right edge; windowBeats = how many beats
  // are visible across the width.
  render(notes: RollNote[], nowBeat: number, windowBeats: number) {
    const gl = this.gl;
    // warm paper-dark
    gl.clearColor(0.078, 0.07, 0.062, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const range = this.midiHigh - this.midiLow;
    const data: number[] = [];

    const toClipX = (beat: number) =>
      ((beat - (nowBeat - windowBeats)) / windowBeats) * 2 - 1;
    const toClipY = (midi: number) =>
      ((midi - this.midiLow) / range) * 2 - 1;
    const noteH = (1 / range) * 2 * 0.82;

    for (const n of notes) {
      if (n.startBeat + n.durBeats < nowBeat - windowBeats) continue;
      if (n.startBeat > nowBeat + 1) continue;
      const x0 = toClipX(n.startBeat);
      const x1 = toClipX(n.startBeat + n.durBeats);
      const w = Math.max(x1 - x0, 0.006);
      const y = toClipY(n.midi) - noteH / 2;
      const c = VOICE_COLORS[Math.min(n.voice, VOICE_COLORS.length - 1)];
      // notes near the "now" edge glow slightly brighter
      const recency = 1 - Math.min(1, Math.abs(nowBeat - n.startBeat) / windowBeats);
      const a = 0.5 + 0.45 * recency;
      data.push(x0, y, w, noteH, c[0], c[1], c[2], a);
    }

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    const count = data.length / 8;
    if (count > 0) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.instBuf);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.prog);
  }
}
