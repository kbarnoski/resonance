// ─────────────────────────────────────────────────────────────────────────────
// glrig.ts — raw WebGL2 additive point-sprite renderer for the mote nimbus,
// plus a lighter Canvas2D fallback when WebGL2 is unavailable.
//
//   No three.js. Motes are drawn as gl.POINTS with additive blending and a soft
//   round falloff computed from gl_PointCoord. Positions live in a dynamic VBO
//   re-uploaded each frame from the CPU sim; a per-mote seed lives in a static
//   VBO uploaded once. Colour is cool violet→pale by default, warming to a gold
//   accent as motes gather into the core on inhale.
// ─────────────────────────────────────────────────────────────────────────────

const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;   // normalized ~[-1,1] sim space
layout(location = 1) in float a_seed; // 0..1 per-mote

uniform vec2  u_res;
uniform float u_scale;   // world→clip scale (keeps the disc square)
uniform float u_point;   // base point size in px (dpr-aware)
uniform float u_gather;  // 0 dispersed … 1 gathered
uniform float u_bloom;   // 0..1 peak-inhale luminance swell
uniform float u_coh;     // 0..1 coherence

out vec3  v_col;
out float v_alpha;

void main() {
  // Square aspect: map sim space through the shorter axis so the disc stays round.
  float aspect = u_res.x / u_res.y;
  vec2 p = a_pos * u_scale;
  if (aspect >= 1.0) p.x /= aspect; else p.y *= aspect;
  gl_Position = vec4(p, 0.0, 1.0);

  float r = length(a_pos);
  // Core motes run warm gold; the outer veil stays cool violet→pale.
  vec3 gold   = vec3(1.00, 0.82, 0.42);
  vec3 violet = vec3(0.52, 0.36, 0.96);
  vec3 pale   = vec3(0.80, 0.78, 1.00);
  vec3 indigo = vec3(0.30, 0.32, 0.78);
  // Radial colour: gold at centre → violet → pale/indigo at the rim.
  float core = smoothstep(0.55, 0.0, r);           // 1 near centre
  vec3 outer = mix(indigo, pale, a_seed);           // rim variation
  vec3 body  = mix(outer, violet, smoothstep(1.1, 0.3, r));
  float goldMix = core * (0.35 + 0.65 * u_gather);  // warms as motes gather
  v_col = mix(body, gold, goldMix);

  // Brightness: gathered core swells, coherence adds a calm even glow, and the
  // peak-inhale bloom lifts the whole field toward a boundary-dissolving veil.
  float bright = 0.35 + 0.55 * core * u_gather + 0.25 * u_coh + 0.45 * u_bloom;
  v_alpha = clamp(bright, 0.0, 1.0);

  // Point size grows a touch at the gathered, bloomed core.
  float size = u_point * (0.75 + 0.9 * core * u_gather + 0.5 * u_bloom + 0.2 * a_seed);
  gl_PointSize = clamp(size, 1.0, 64.0);
}`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec3  v_col;
in float v_alpha;
out vec4 outColor;
void main() {
  // Soft round falloff — a Gaussian-ish sprite, no hard edges.
  vec2 d = gl_PointCoord - vec2(0.5);
  float dist2 = dot(d, d);
  float fall = exp(-dist2 * 9.0);
  float a = fall * v_alpha;
  // Additive: premultiply colour by alpha, alpha channel carries the add.
  outColor = vec4(v_col * a, a);
}`;

export interface GLRig {
  kind: "webgl2";
  gl: WebGL2RenderingContext;
  render(
    pos: Float32Array,
    res: [number, number],
    scale: number,
    pointPx: number,
    gather: number,
    bloom: number,
    coherence: number,
  ): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("nimbus shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeGLRig(
  canvas: HTMLCanvasElement,
  seedAttr: Float32Array,
): GLRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("nimbus link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Dynamic position VBO — re-uploaded every frame.
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seedAttr.length * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Static per-mote seed VBO — uploaded once.
  const seedBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seedAttr, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    scale: gl.getUniformLocation(program, "u_scale"),
    point: gl.getUniformLocation(program, "u_point"),
    gather: gl.getUniformLocation(program, "u_gather"),
    bloom: gl.getUniformLocation(program, "u_bloom"),
    coh: gl.getUniformLocation(program, "u_coh"),
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive (colour already premultiplied)

  const count = seedAttr.length;

  return {
    kind: "webgl2",
    gl,
    render(pos, res, scale, pointPx, gather, bloom, coherence) {
      gl.viewport(0, 0, res[0], res[1]);
      // Near-black violet base — a faint wash, not pure void.
      gl.clearColor(0.02, 0.012, 0.035, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);

      gl.uniform2f(u.res, res[0], res[1]);
      gl.uniform1f(u.scale, scale);
      gl.uniform1f(u.point, pointPx);
      gl.uniform1f(u.gather, gather);
      gl.uniform1f(u.bloom, bloom);
      gl.uniform1f(u.coh, coherence);

      gl.drawArrays(gl.POINTS, 0, count);
    },
    dispose() {
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(seedBuf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    },
  };
}

// ── Canvas2D fallback ─────────────────────────────────────────────────────────

export interface Canvas2DRig {
  kind: "canvas2d";
  render(
    pos: Float32Array,
    seed: Float32Array,
    res: [number, number],
    scale: number,
    gather: number,
    bloom: number,
    coherence: number,
  ): void;
}

export function makeCanvas2DRig(ctx: CanvasRenderingContext2D): Canvas2DRig {
  return {
    kind: "canvas2d",
    render(pos, seed, res, scale, gather, bloom, coherence) {
      const [w, h] = res;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#05030a";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const short = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;
      const n = seed.length;
      const baseA = 0.16 + 0.2 * coherence + 0.28 * bloom;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 2];
        const y = pos[i * 2 + 1];
        const r = Math.hypot(x, y);
        const px = cx + (x * scale * short) / 2;
        const py = cy + (y * scale * short) / 2;
        const core = Math.max(0, 1 - r / 0.55);
        const goldMix = core * (0.35 + 0.65 * gather);
        // Cool violet body → warm gold core.
        const cr = Math.round(133 + goldMix * 122 + seed[i] * 40);
        const cg = Math.round(92 + goldMix * 118);
        const cb = Math.round(246 - goldMix * 140);
        const a = Math.min(0.9, baseA + core * gather * 0.5);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
        const size = 1.2 + core * gather * 2.4 + bloom * 1.5;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
    },
  };
}
