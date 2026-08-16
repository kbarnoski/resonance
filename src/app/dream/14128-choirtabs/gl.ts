// ─────────────────────────────────────────────────────────────────────────────
// 14128-choirtabs · gl.ts — the WebGL2 voice-field renderer.
//
//   A cool violet / ice field of glowing voice-columns. Each voice is a vertical
//   beam + orb whose brightness tracks its own activation (it flares on every
//   canon onset) and the choir's overall level. A horizontal pulse sweeps the
//   field on the shared beat, and the leader's column carries a cyan-ice tint.
//   Pure WebGL2, single fullscreen draw; degrades to a notice if unavailable.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_VOICES = 12;

// Per-voice packing: vec4(x, level, kind, activation)
//   kind: 0 = peer, 1 = self, 2 = leader (peer), 3 = self + leader
export interface FieldVoice {
  x: number;
  level: number;
  kind: number;
  activation: number;
}

export interface FieldState {
  voices: FieldVoice[];
  beatPhase: number; // 0..1 within a bar
  level: number; // 0..1 overall
  time: number; // seconds
}

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uBeatPhase;
uniform float uLevel;
uniform int uCount;
uniform vec4 uVoices[${MAX_VOICES}];

vec3 iceRamp(float t) {
  vec3 c0 = vec3(0.05, 0.04, 0.15);  // deep indigo
  vec3 c1 = vec3(0.28, 0.18, 0.62);  // violet
  vec3 c2 = vec3(0.46, 0.60, 0.98);  // ice blue
  vec3 c3 = vec3(0.88, 0.94, 1.0);   // pale
  t = clamp(t, 0.0, 1.0);
  if (t < 0.4) return mix(c0, c1, t / 0.4);
  if (t < 0.75) return mix(c1, c2, (t - 0.4) / 0.35);
  return mix(c2, c3, (t - 0.75) / 0.25);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;

  // Cool background gradient + a slow violet nebula that breathes with the mix.
  vec3 col = mix(vec3(0.015, 0.017, 0.05), vec3(0.05, 0.045, 0.13), uv.y);
  float neb = (0.5 + 0.5 * sin(uv.x * 5.0 + uTime * 0.25))
            * (0.5 + 0.5 * sin(uv.y * 3.5 - uTime * 0.18));
  col += vec3(0.04, 0.03, 0.10) * neb * (0.35 + 0.65 * uLevel);

  // Shared beat: a sweep line rising with the bar phase + a downbeat flash.
  float sweep = smoothstep(0.02, 0.0, abs(uv.y - uBeatPhase));
  col += vec3(0.30, 0.42, 0.85) * sweep * 0.14;
  float flash = pow(1.0 - uBeatPhase, 5.0);
  col += vec3(0.12, 0.15, 0.32) * flash * 0.5;

  for (int i = 0; i < ${MAX_VOICES}; i++) {
    if (i >= uCount) break;
    vec4 v = uVoices[i];
    float vx = v.x, lvl = v.y, kind = v.z, act = v.w;

    float dx = abs(uv.x - vx);
    float colw = 0.010 + 0.028 * lvl;
    float beam = exp(-(dx * dx) / (colw * colw));

    float d = distance(uv, vec2(vx, 0.5));
    float orbR = 0.04 + 0.10 * (0.3 + 0.7 * act);
    float orb = exp(-(d * d) / (orbR * orbR));

    float inten = beam * (0.25 + 0.9 * lvl) + orb * (0.5 + 1.3 * act);
    vec3 vc = iceRamp(0.2 + 0.8 * act);
    if (kind > 1.5) vc = mix(vc, vec3(0.55, 0.95, 1.0), 0.45); // leader tint
    col += vc * inten * (0.55 + 0.6 * uLevel);

    // A bright ring marks YOUR voice.
    if (kind == 1.0 || kind > 2.5) {
      float ring = smoothstep(0.006, 0.0, abs(d - orbR * 0.95));
      col += vec3(0.82, 0.88, 1.0) * ring * 0.45;
    }
  }

  // Soft cool vignette.
  float vig = smoothstep(1.2, 0.28, length(uv - 0.5) * 1.5);
  col *= mix(0.5, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

export class Field {
  readonly ok: boolean;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private readonly data = new Float32Array(MAX_VOICES * 4);
  private uRes: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uBeatPhase: WebGLUniformLocation | null = null;
  private uLevel: WebGLUniformLocation | null = null;
  private uCount: WebGLUniformLocation | null = null;
  private uVoices: WebGLUniformLocation | null = null;

  constructor(canvas: HTMLCanvasElement) {
    let ok = false;
    try {
      const gl = canvas.getContext("webgl2", {
        antialias: true,
        premultipliedAlpha: false,
      });
      if (gl) {
        this.gl = gl;
        const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
        const program = gl.createProgram();
        if (!program) throw new Error("program alloc failed");
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(
            "program link failed: " + gl.getProgramInfoLog(program),
          );
        }
        this.program = program;

        // Fullscreen triangle.
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );
        const loc = gl.getAttribLocation(program, "aPos");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        gl.useProgram(program);
        this.uRes = gl.getUniformLocation(program, "uRes");
        this.uTime = gl.getUniformLocation(program, "uTime");
        this.uBeatPhase = gl.getUniformLocation(program, "uBeatPhase");
        this.uLevel = gl.getUniformLocation(program, "uLevel");
        this.uCount = gl.getUniformLocation(program, "uCount");
        this.uVoices = gl.getUniformLocation(program, "uVoices");
        ok = true;
      }
    } catch {
      ok = false;
    }
    this.ok = ok;
  }

  resize(w: number, h: number, dpr: number): void {
    const gl = this.gl;
    if (!gl) return;
    const canvas = gl.canvas as HTMLCanvasElement;
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  draw(state: FieldState): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const canvas = gl.canvas as HTMLCanvasElement;

    const count = Math.min(MAX_VOICES, state.voices.length);
    for (let i = 0; i < count; i++) {
      const v = state.voices[i];
      this.data[i * 4] = v.x;
      this.data[i * 4 + 1] = v.level;
      this.data[i * 4 + 2] = v.kind;
      this.data[i * 4 + 3] = v.activation;
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.uRes, canvas.width, canvas.height);
    gl.uniform1f(this.uTime, state.time);
    gl.uniform1f(this.uBeatPhase, state.beatPhase);
    gl.uniform1f(this.uLevel, state.level);
    gl.uniform1i(this.uCount, count);
    gl.uniform4fv(this.uVoices, this.data);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {
      /* ignore */
    }
    this.gl = null;
    this.program = null;
  }
}
