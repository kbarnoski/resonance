// ════════════════════════════════════════════════════════════════════════════
// 2664 · Quantum Whispers — WebGL2 visualizer.
//
// Each agent is a ring of glowing points (a cloud of candidate-note amplitudes)
// around its centre. On a downbeat the cloud CONTRACTS toward the collapsed bin
// and flares a bright core (the note it actually plays), then re-blooms. Teleport
// events draw a bright thread between agents. Colour lives on the violet→magenta
// brand ramp — raw hex/hsl is confined to this art layer. Additive blending over
// a near-black violet field. No strobe: luminance changes stay slow (<3 Hz).
// ════════════════════════════════════════════════════════════════════════════

import { N_AGENTS, N_BINS, type Agent, type Thread } from "./engine";

// violet → magenta brand ramp (linear RGB, art layer only)
const VIOLET: [number, number, number] = [0.55, 0.28, 0.98];
const MAGENTA: [number, number, number] = [0.98, 0.24, 0.72];

function rampColor(t: number, out: [number, number, number]): void {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  out[0] = VIOLET[0] + (MAGENTA[0] - VIOLET[0]) * c;
  out[1] = VIOLET[1] + (MAGENTA[1] - VIOLET[1]) * c;
  out[2] = VIOLET[2] + (MAGENTA[2] - VIOLET[2]) * c;
}

const POINT_VERT = `#version 300 es
in vec2 aPos;
in float aSize;
in vec3 aColor;
out vec3 vColor;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  gl_PointSize = aSize;
  vColor = aColor;
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 frag;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float a = exp(-r * r * 3.6);
  frag = vec4(vColor * a, a);
}`;

const LINE_VERT = `#version 300 es
in vec2 aPos;
in vec3 aColor;
out vec3 vColor;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vColor = aColor;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 frag;
void main() { frag = vec4(vColor, 1.0); }`;

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

function makeProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

const RING_R = 0.30; // base ring radius (clip y units)
const COLLAPSE_MS = 640;

export class QuantumViz {
  private gl: WebGL2RenderingContext | null = null;
  private ptProg: WebGLProgram | null = null;
  private lnProg: WebGLProgram | null = null;
  private ptBuf: WebGLBuffer | null = null;
  private lnBuf: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private lnVao: WebGLVertexArrayObject | null = null;

  private ptData: Float32Array;
  private lnData: Float32Array;
  private tmp: [number, number, number] = [0, 0, 0];

  constructor() {
    // per point: x, y, size, r, g, b  (6 floats). +1 core flash per agent.
    const maxPoints = N_AGENTS * (N_BINS + 1);
    this.ptData = new Float32Array(maxPoints * 6);
    // per thread: 2 verts * (x, y, r, g, b) = 10 floats
    this.lnData = new Float32Array(N_AGENTS * 10);
  }

  init(canvas: HTMLCanvasElement): boolean {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    if (!gl) return false;
    const ptProg = makeProgram(gl, POINT_VERT, POINT_FRAG);
    const lnProg = makeProgram(gl, LINE_VERT, LINE_FRAG);
    if (!ptProg || !lnProg) return false;

    this.gl = gl;
    this.ptProg = ptProg;
    this.lnProg = lnProg;
    this.ptBuf = gl.createBuffer();
    this.lnBuf = gl.createBuffer();

    // points VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    const stride = 6 * 4;
    const aPos = gl.getAttribLocation(ptProg, "aPos");
    const aSize = gl.getAttribLocation(ptProg, "aSize");
    const aColor = gl.getAttribLocation(ptProg, "aColor");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 3 * 4);

    // lines VAO
    this.lnVao = gl.createVertexArray();
    gl.bindVertexArray(this.lnVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lnBuf);
    const lstride = 5 * 4;
    const lPos = gl.getAttribLocation(lnProg, "aPos");
    const lColor = gl.getAttribLocation(lnProg, "aColor");
    gl.enableVertexAttribArray(lPos);
    gl.vertexAttribPointer(lPos, 2, gl.FLOAT, false, lstride, 0);
    gl.enableVertexAttribArray(lColor);
    gl.vertexAttribPointer(lColor, 3, gl.FLOAT, false, lstride, 2 * 4);

    gl.bindVertexArray(null);
    return true;
  }

  private resize(canvas: HTMLCanvasElement): number {
    const gl = this.gl!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return dpr;
  }

  draw(
    canvas: HTMLCanvasElement,
    agents: Agent[],
    threads: Thread[],
    now: number,
    reduced: boolean,
  ): void {
    const gl = this.gl;
    if (!gl || !this.ptProg || !this.lnProg) return;
    const dpr = this.resize(canvas);
    const aspect = canvas.width / Math.max(1, canvas.height);

    gl.clearColor(0.03, 0.02, 0.06, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive glow

    // ── build point data ──────────────────────────────────────────────────
    const flashCap = reduced ? 0.4 : 1.0;
    let pi = 0;
    for (const ag of agents) {
      // collapse envelope: triangle peak just after the downbeat, then bloom out
      const c = (now - ag.collapseTime) / COLLAPSE_MS;
      let u = 0;
      if (c >= 0 && c < 1) u = c < 0.22 ? c / 0.22 : 1 - (c - 0.22) / 0.78;
      u *= flashCap;

      const cbin = ag.collapsedBin;
      const cAngle = -Math.PI / 2 + (cbin / N_BINS) * Math.PI * 2;
      const cRad = RING_R + 0.02;
      const cX = ag.cx + (Math.cos(cAngle) * cRad) / aspect;
      const cY = ag.cy + Math.sin(cAngle) * cRad;

      for (let i = 0; i < N_BINS; i++) {
        const amp = Math.sqrt(ag.prob[i] * N_BINS); // amplitude-like glow
        const shimmer = reduced ? 0 : 0.012 * Math.sin(ag.phase[i]);
        const angle = -Math.PI / 2 + (i / N_BINS) * Math.PI * 2;
        const rad = RING_R + amp * 0.055 + shimmer;
        let x = ag.cx + (Math.cos(angle) * rad) / aspect;
        let y = ag.cy + Math.sin(angle) * rad;
        // contract toward the collapsed bin
        const pull = u * 0.7;
        x += (cX - x) * pull;
        y += (cY - y) * pull;

        const isC = i === cbin;
        let bright = amp * (isC ? 1 + u * 3.0 : 1 - u * 0.55);
        bright = Math.max(0, bright);
        // colour along the ramp: agent hue offset + bin position
        rampColor(0.15 + ag.hue * 0.5 + (i / N_BINS) * 0.35, this.tmp);
        const gain = 0.42 * bright;
        const size = (2.5 + amp * 9 + (isC ? u * 6 : 0)) * dpr;

        this.ptData[pi++] = x;
        this.ptData[pi++] = y;
        this.ptData[pi++] = size;
        this.ptData[pi++] = this.tmp[0] * gain;
        this.ptData[pi++] = this.tmp[1] * gain;
        this.ptData[pi++] = this.tmp[2] * gain;
      }

      // bright collapse core
      if (u > 0.001 && cbin >= 0) {
        rampColor(0.85, this.tmp);
        const g = u * 0.9;
        this.ptData[pi++] = cX;
        this.ptData[pi++] = cY;
        this.ptData[pi++] = (10 + u * 46) * dpr;
        this.ptData[pi++] = this.tmp[0] * g;
        this.ptData[pi++] = this.tmp[1] * g;
        this.ptData[pi++] = this.tmp[2] * g;
      }
    }

    gl.useProgram(this.ptProg);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.ptData.subarray(0, pi), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, pi / 6);

    // ── build thread data ─────────────────────────────────────────────────
    let li = 0;
    for (const th of threads) {
      const age = (now - th.t) / 260;
      if (age < 0 || age > 1) continue;
      const b = (1 - age) * (reduced ? 0.5 : 1);
      const from = agents[th.from];
      const to = agents[th.to];
      rampColor(0.7, this.tmp);
      const g = 0.9 * b;
      this.lnData[li++] = from.cx;
      this.lnData[li++] = from.cy;
      this.lnData[li++] = this.tmp[0] * g;
      this.lnData[li++] = this.tmp[1] * g;
      this.lnData[li++] = this.tmp[2] * g;
      this.lnData[li++] = to.cx;
      this.lnData[li++] = to.cy;
      this.lnData[li++] = this.tmp[0] * g;
      this.lnData[li++] = this.tmp[1] * g;
      this.lnData[li++] = this.tmp[2] * g;
    }
    if (li > 0) {
      gl.useProgram(this.lnProg);
      gl.bindVertexArray(this.lnVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lnBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.lnData.subarray(0, li), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, li / 5);
    }

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.ptProg) gl.deleteProgram(this.ptProg);
    if (this.lnProg) gl.deleteProgram(this.lnProg);
    if (this.ptBuf) gl.deleteBuffer(this.ptBuf);
    if (this.lnBuf) gl.deleteBuffer(this.lnBuf);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.lnVao) gl.deleteVertexArray(this.lnVao);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    this.gl = null;
    this.ptProg = null;
    this.lnProg = null;
  }
}
