/**
 * WebGL2 renderer for the chromatic organ.
 *
 * Each sounding note contributes an aspect-corrected plane wave, oriented by
 * its pitch-class around the circle and with a spatial frequency set by its
 * pitch. Every note's wave is *superimposed* (summed) in the fragment shader,
 * so two or more simultaneous notes interfere into shimmering moiré lattices —
 * the visual signature of polyphony.
 *
 * The colours come from Scriabin's Prometheus scale (see chromesthesia.ts).
 * A ping-pong feedback buffer gives sustained notes a gentle afterglow that
 * decays *toward warm paper white* rather than toward black — so the mean
 * brightness stays high (no strobe) and the piece lives in bright daylight
 * instead of the lab's default black void.
 */

import { scriabinColor } from "./chromesthesia";

export interface ActiveNote {
  midi: number;
  pitchClass: number;
  velocity: number; // 0..1
}

const MAX_NOTES = 8;

// Warm paper ground the colours bloom onto.
const PAPER: [number, number, number] = [0.965, 0.95, 0.92];

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

// Feedback / accumulation pass: samples the previous frame, decays it toward
// paper, then deposits fresh pigment from the superimposed note waves.
const FRAG_FEEDBACK = `#version 300 es
precision highp float;
out vec4 frag;

uniform sampler2D uPrev;
uniform vec2  uRes;
uniform float uTime;
uniform float uDecay;   // how much of prev survives (toward paper)
uniform float uMotion;  // 0..1 reduced-motion damp
uniform vec3  uPaper;
uniform int   uCount;
uniform vec3  uColor[${MAX_NOTES}];
// x = spatial frequency, y = orientation angle, z = amplitude, w = temporal speed
uniform vec4  uWave[${MAX_NOTES}];

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // slow drift so the afterglow shimmers rather than sits still
  vec2 drift = vec2(sin(uTime * 0.05), cos(uTime * 0.043)) * 0.0009 * uMotion;
  vec3 prev = texture(uPrev, uv + drift).rgb;
  prev = mix(uPaper, prev, uDecay); // fade toward paper, never black

  // superimpose all note waves so polyphony interferes into moiré
  float field = 0.0;   // summed positive wave energy
  float mass  = 0.0;   // total amplitude (for normalising)
  vec3  tint  = vec3(0.0);
  for (int i = 0; i < ${MAX_NOTES}; i++){
    if (i >= uCount) break;
    float k   = uWave[i].x;
    float ang = uWave[i].y;
    float amp = uWave[i].z;
    float spd = uWave[i].w;
    vec2 dir = vec2(cos(ang), sin(ang));
    float d = dot(p, dir);
    float r = length(p);
    float w = sin(k * d * 6.2831853 - uTime * spd * uMotion + float(i) * 1.7)
            + 0.55 * sin(k * 1.63 * r * 6.2831853 - uTime * spd * 0.5 * uMotion);
    float wp = 0.5 + 0.5 * clamp(w, -1.0, 1.0);
    field += amp * wp;
    mass  += amp;
    tint  += uColor[i] * amp * wp;
  }

  vec3 col = prev;
  if (mass > 1e-4){
    float norm = field / mass;                 // 0..1 interference envelope
    vec3 pigCol = tint / max(field, 1e-4);     // average colour at this fringe
    float dens = smoothstep(0.42, 0.96, norm) * 0.5;
    col = mix(prev, pigCol, dens);
  }

  frag = vec4(col, 1.0);
}
`;

// Present pass: copy the accumulation buffer to screen with a hair of vignette
// so the daylight field has a little depth.
const FRAG_PRESENT = `#version 300 es
precision highp float;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2 uRes;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uTex, uv).rgb;
  vec2 q = uv - 0.5;
  float vig = 1.0 - dot(q, q) * 0.35;
  frag = vec4(c * vig, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

export class OrganRenderer {
  private gl: WebGL2RenderingContext;
  private feedback: WebGLProgram;
  private present: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private targets: [Target, Target];
  private cur = 0;
  private w = 1;
  private h = 1;
  private reducedMotion: boolean;

  // uniform locations
  private uF: Record<string, WebGLUniformLocation | null> = {};
  private uP: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.reducedMotion = reducedMotion;

    this.feedback = link(gl, VERT, FRAG_FEEDBACK);
    this.present = link(gl, VERT, FRAG_PRESENT);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;

    for (const name of [
      "uPrev", "uRes", "uTime", "uDecay", "uMotion", "uPaper", "uCount",
    ]) {
      this.uF[name] = gl.getUniformLocation(this.feedback, name);
    }
    this.uF["uColor"] = gl.getUniformLocation(this.feedback, "uColor");
    this.uF["uWave"] = gl.getUniformLocation(this.feedback, "uWave");
    this.uP["uTex"] = gl.getUniformLocation(this.present, "uTex");
    this.uP["uRes"] = gl.getUniformLocation(this.present, "uRes");

    this.targets = [this.makeTarget(1, 1), this.makeTarget(1, 1)];
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error("target alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  resize(w: number, h: number): void {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const t of this.targets) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
      );
      // clear to paper so we start bright, not black
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(timeSec: number, notes: ActiveNote[]): void {
    const gl = this.gl;
    const src = this.targets[this.cur];
    const dst = this.targets[1 - this.cur];

    const colors = new Float32Array(MAX_NOTES * 3);
    const waves = new Float32Array(MAX_NOTES * 4);
    const count = Math.min(notes.length, MAX_NOTES);
    for (let i = 0; i < count; i++) {
      const n = notes[i];
      const [r, g, b] = scriabinColor(n.pitchClass);
      // octave → brightness: higher notes bloom a touch lighter
      const oct = Math.floor(n.midi / 12) - 4; // ~0 around middle C
      const lift = Math.max(0, Math.min(0.35, oct * 0.06));
      colors[i * 3 + 0] = Math.min(1, r + lift);
      colors[i * 3 + 1] = Math.min(1, g + lift);
      colors[i * 3 + 2] = Math.min(1, b + lift);
      // spatial frequency rises with pitch → tighter lattices up high
      const k = 2.5 + ((n.midi - 48) / 12) * 1.6;
      // orientation spread by pitch-class around the circle
      const ang = (n.pitchClass / 12) * Math.PI * 2 + oct * 0.15;
      const amp = 0.35 + n.velocity * 0.65;
      const spd = 0.6 + ((n.midi - 60) / 12) * 0.25;
      waves[i * 4 + 0] = Math.max(1.2, k);
      waves[i * 4 + 1] = ang;
      waves[i * 4 + 2] = amp;
      waves[i * 4 + 3] = spd;
    }

    // ---- feedback / accumulation pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.feedback);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(this.uF["uPrev"], 0);
    gl.uniform2f(this.uF["uRes"], this.w, this.h);
    gl.uniform1f(this.uF["uTime"], timeSec);
    // energy-preserving decay; reduced motion holds the afterglow longer/calmer
    gl.uniform1f(this.uF["uDecay"], this.reducedMotion ? 0.9 : 0.86);
    gl.uniform1f(this.uF["uMotion"], this.reducedMotion ? 0.25 : 1.0);
    gl.uniform3f(this.uF["uPaper"], PAPER[0], PAPER[1], PAPER[2]);
    gl.uniform1i(this.uF["uCount"], count);
    gl.uniform3fv(this.uF["uColor"], colors);
    gl.uniform4fv(this.uF["uWave"], waves);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- present pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.present);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(this.uP["uTex"], 0);
    gl.uniform2f(this.uP["uRes"], this.w, this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.cur = 1 - this.cur;
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    gl.deleteProgram(this.feedback);
    gl.deleteProgram(this.present);
    gl.deleteVertexArray(this.vao);
  }
}
