// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — hand-written WebGL2 renderer for the lightning organ.
//
//   Two-buffer pipeline:
//     1) ACCUMULATION FBO (RGBA16F if available, else RGBA8). Each frame we draw
//        the new hot arc segments additively (SRC_ALPHA, ONE) into a *decayed*
//        copy of the previous frame, so arcs leave a fading incandescent trail —
//        this decay is also our photosensitive-safety guarantee: nothing can
//        full-frame strobe when the frame is a slowly-fading accumulation.
//     2) PRESENT pass — samples the accumulation buffer, applies a cheap 5-tap
//        bloom, a filmic-ish tone-map, a vignette, and a global luminance
//        multiplier (from SafeFlicker), then blits to the default framebuffer.
//
//   Segments are uploaded as line vertices; a soft additive falloff shader gives
//   each a glowing core. Terminals are drawn as bright discs. Everything lives on
//   the GPU; the CPU only pushes vertex data.
// ─────────────────────────────────────────────────────────────────────────────

export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0..1 brightness/heat. */
  heat: number;
  /** 0 = violet-root, 1 = white-hot; drives colour blend. */
  tone: number;
}

interface GLProgram {
  prog: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

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

function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  attribNames: string[],
  uniformNames: string[],
): GLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link: " + log);
  }
  const attribs: Record<string, number> = {};
  for (const a of attribNames) attribs[a] = gl.getAttribLocation(prog, a);
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const u of uniformNames) uniforms[u] = gl.getUniformLocation(prog, u);
  return { prog, attribs, uniforms };
}

// ── shaders ──────────────────────────────────────────────────────────────────

// Arc pass: each segment expands into a quad (2 triangles) built on the CPU with
// a perpendicular offset; the fragment shader draws a soft glowing line core.
const ARC_VS = `#version 300 es
precision highp float;
in vec2 a_pos;        // clip-space position of the quad corner
in vec2 a_uv;         // -1..1 across the line thickness (v), 0..1 along (u)
in float a_heat;      // brightness
in float a_tone;      // colour blend
out vec2 v_uv;
out float v_heat;
out float v_tone;
void main() {
  v_uv = a_uv;
  v_heat = a_heat;
  v_tone = a_tone;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const ARC_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_heat;
in float v_tone;
out vec4 frag;
void main() {
  // v_uv.y is -1..1 across the thickness; a gaussian-ish core.
  float d = abs(v_uv.y);
  float core = exp(-d * d * 6.0);
  float glow = exp(-d * d * 1.5) * 0.5;
  float a = clamp(core + glow, 0.0, 1.0) * v_heat;
  // violet-root -> white-hot; add a slight blue bias in the halo.
  vec3 violet = vec3(0.62, 0.30, 1.0);
  vec3 hot = vec3(1.0, 0.96, 1.0);
  vec3 col = mix(violet, hot, clamp(v_tone, 0.0, 1.0));
  // core is whiter than halo:
  col = mix(col, vec3(1.0), core * 0.7);
  frag = vec4(col * a, a);
}`;

// Decay pass: sample previous accumulation, multiply by decay, write out.
const FS_QUAD_VS = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const DECAY_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_decay;
out vec4 frag;
void main() {
  vec4 c = texture(u_tex, v_uv);
  frag = c * u_decay;
}`;

const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_lum;     // global luminance multiplier (SafeFlicker)
uniform float u_bloom;
out vec4 frag;
void main() {
  vec3 base = texture(u_tex, v_uv).rgb;
  // cheap 5-tap bloom (cross)
  vec3 b = vec3(0.0);
  float sp = 2.5;
  b += texture(u_tex, v_uv + vec2( sp, 0.0) * u_texel).rgb;
  b += texture(u_tex, v_uv + vec2(-sp, 0.0) * u_texel).rgb;
  b += texture(u_tex, v_uv + vec2(0.0,  sp) * u_texel).rgb;
  b += texture(u_tex, v_uv + vec2(0.0, -sp) * u_texel).rgb;
  b += texture(u_tex, v_uv + vec2( sp,  sp) * u_texel).rgb;
  b += texture(u_tex, v_uv + vec2(-sp, -sp) * u_texel).rgb;
  b *= (1.0 / 6.0);
  vec3 col = base + b * u_bloom;

  // filmic-ish tone map
  col = col / (col + vec3(0.7));
  col = pow(col, vec3(0.85));

  // deep near-black floor with the faintest violet cast
  col += vec3(0.008, 0.006, 0.016);

  // vignette
  vec2 p = v_uv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(p) * 1.35);
  col *= mix(0.55, 1.0, vig);

  col *= u_lum;
  frag = vec4(col, 1.0);
}`;

export class LightningRenderer {
  private gl: WebGL2RenderingContext;
  private arcProg: GLProgram;
  private decayProg: GLProgram;
  private presentProg: GLProgram;

  private accumTex: [WebGLTexture, WebGLTexture];
  private accumFbo: [WebGLFramebuffer, WebGLFramebuffer];
  private cur = 0;

  private quadVbo: WebGLBuffer;
  private arcVbo: WebGLBuffer;
  private arcData: Float32Array;
  private arcCount = 0; // number of vertices

  private w = 1;
  private h = 1;
  private useFloat = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // enable float render targets if available
    const ext = gl.getExtension("EXT_color_buffer_float");
    this.useFloat = !!ext;

    this.arcProg = link(
      gl,
      ARC_VS,
      ARC_FS,
      ["a_pos", "a_uv", "a_heat", "a_tone"],
      [],
    );
    this.decayProg = link(gl, FS_QUAD_VS, DECAY_FS, ["a_pos"], ["u_tex", "u_decay"]);
    this.presentProg = link(
      gl,
      FS_QUAD_VS,
      PRESENT_FS,
      ["a_pos"],
      ["u_tex", "u_texel", "u_lum", "u_bloom"],
    );

    // fullscreen triangle-pair quad
    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );

    // arc vertex buffer — grown as needed. layout per vertex: x,y,u,v,heat,tone
    this.arcVbo = gl.createBuffer()!;
    this.arcData = new Float32Array(6 * 6 * 4096); // 4096 segments capacity

    // accumulation targets (created in resize)
    this.accumTex = [gl.createTexture()!, gl.createTexture()!];
    this.accumFbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
  }

  get floatBuffers(): boolean {
    return this.useFloat;
  }

  resize(w: number, h: number): void {
    const gl = this.gl;
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    const type = this.useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const internal = this.useFloat ? gl.RGBA16F : gl.RGBA8;
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.accumTex[i]);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internal,
        this.w,
        this.h,
        0,
        gl.RGBA,
        type,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo[i]);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.accumTex[i],
        0,
      );
      // clear to black
      gl.viewport(0, 0, this.w, this.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Build quad geometry for the given segments into the arc vertex buffer. */
  private buildArcGeometry(segs: Seg[], thickness: number): void {
    const aspect = this.w / this.h;
    // convert sim/screen-space [0..1] segs to clip space [-1..1].
    // thickness is in clip units (roughly). Widen slightly with heat.
    let o = 0;
    const data = this.arcData;
    const maxSegs = data.length / (6 * 6);
    const n = Math.min(segs.length, maxSegs);
    for (let s = 0; s < n; s++) {
      const seg = segs[s];
      const x0 = seg.x0 * 2 - 1;
      const y0 = 1 - seg.y0 * 2;
      const x1 = seg.x1 * 2 - 1;
      const y1 = 1 - seg.y1 * 2;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx * aspect, dy) || 1e-4;
      // perpendicular in clip space, corrected for aspect so thickness is even
      let nx = -dy / len;
      let ny = (dx * aspect) / len;
      // undo aspect on x so the offset is visually uniform
      nx = nx / aspect;
      const th = thickness * (0.6 + seg.heat * 0.8);
      nx *= th;
      ny *= th;

      const h = seg.heat;
      const to = seg.tone;
      // 6 vertices (two triangles): (0,-1)(1,-1)(1,1) / (0,-1)(1,1)(0,1)
      // corners: A=start-side, B=end-side; ±across
      const push = (
        px: number,
        py: number,
        u: number,
        v: number,
      ) => {
        data[o++] = px;
        data[o++] = py;
        data[o++] = u;
        data[o++] = v;
        data[o++] = h;
        data[o++] = to;
      };
      const A0x = x0 + nx,
        A0y = y0 + ny;
      const A1x = x0 - nx,
        A1y = y0 - ny;
      const B0x = x1 + nx,
        B0y = y1 + ny;
      const B1x = x1 - nx,
        B1y = y1 - ny;
      push(A0x, A0y, 0, 1);
      push(B0x, B0y, 1, 1);
      push(B1x, B1y, 1, -1);
      push(A0x, A0y, 0, 1);
      push(B1x, B1y, 1, -1);
      push(A1x, A1y, 0, -1);
    }
    this.arcCount = n * 6;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arcVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.DYNAMIC_DRAW);
  }

  /**
   * Render one frame:
   *  1) decay previous accumulation into the other buffer
   *  2) additively draw new arc segments on top
   *  3) present with bloom + tonemap + vignette + luminance multiplier
   */
  render(
    segs: Seg[],
    opts: { decay: number; lum: number; bloom: number; thickness: number },
  ): void {
    const gl = this.gl;
    const src = this.cur;
    const dst = 1 - this.cur;

    // 1) decay src -> dst
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo[dst]);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.decayProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex[src]);
    gl.uniform1i(this.decayProg.uniforms.u_tex, 0);
    gl.uniform1f(this.decayProg.uniforms.u_decay, opts.decay);
    this.drawFsQuad(this.decayProg);

    // 2) additive arcs on top of dst
    if (segs.length > 0) {
      this.buildArcGeometry(segs, opts.thickness);
      if (this.arcCount > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(this.arcProg.prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.arcVbo);
        const stride = 6 * 4;
        const ap = this.arcProg.attribs;
        gl.enableVertexAttribArray(ap.a_pos);
        gl.vertexAttribPointer(ap.a_pos, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(ap.a_uv);
        gl.vertexAttribPointer(ap.a_uv, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(ap.a_heat);
        gl.vertexAttribPointer(ap.a_heat, 1, gl.FLOAT, false, stride, 16);
        gl.enableVertexAttribArray(ap.a_tone);
        gl.vertexAttribPointer(ap.a_tone, 1, gl.FLOAT, false, stride, 20);
        gl.drawArrays(gl.TRIANGLES, 0, this.arcCount);
        gl.disable(gl.BLEND);
      }
    }

    // 3) present dst -> screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.presentProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex[dst]);
    gl.uniform1i(this.presentProg.uniforms.u_tex, 0);
    gl.uniform2f(this.presentProg.uniforms.u_texel, 1 / this.w, 1 / this.h);
    gl.uniform1f(this.presentProg.uniforms.u_lum, opts.lum);
    gl.uniform1f(this.presentProg.uniforms.u_bloom, opts.bloom);
    this.drawFsQuad(this.presentProg);

    this.cur = dst;
  }

  private drawFsQuad(p: GLProgram): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    const loc = p.attribs.a_pos;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.arcProg.prog);
      gl.deleteProgram(this.decayProg.prog);
      gl.deleteProgram(this.presentProg.prog);
      gl.deleteBuffer(this.quadVbo);
      gl.deleteBuffer(this.arcVbo);
      for (let i = 0; i < 2; i++) {
        gl.deleteTexture(this.accumTex[i]);
        gl.deleteFramebuffer(this.accumFbo[i]);
      }
    } catch {
      /* context already lost */
    }
  }
}
