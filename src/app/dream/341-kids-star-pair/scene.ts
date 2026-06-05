// scene.ts — raw WebGL2 renderer for the Star Pair.
//
// HARD CONSTRAINT: everything here is hand-written WebGL2 + GLSL ES 3.00. No SVG,
// no Canvas2D, no three.js, no WebGPU. We set up our own programs, VAOs and VBOs.
//
// What we draw, every frame, in two passes:
//   1. a full-screen background quad: soft dark indigo gradient + a slow starfield
//      + two faint vertical "arc" tracks (one per side) computed in the shader.
//   2. a stream of soft additive GLOW QUADS built CPU-side into one dynamic VBO:
//        • the BEAM between the two stars (a chain of quads; dotted/faint when
//          only "reaching", solid + bright when LOCKED),
//        • sparkles bursting along the beam on lock,
//        • the two big glowing STARS (a fat point quad each, with a soft radial
//          falloff and a few spokes in the fragment shader).
//
// Soft additive blending (ONE, ONE) over a dark background gives the "glowing
// light" look without any bloom library. Stars stay legible because their cores
// are near-white.

export interface SceneStar {
  /** Normalised x in [0,1] (left→right). */
  x: number;
  /** Normalised y in [0,1] (0 = top, 1 = bottom). */
  y: number;
  /** Core colour (rgb 0..1). */
  color: [number, number, number];
  /** Radius in clip-ish units (~0.0..0.2). */
  radius: number;
  /** Extra brightness 0..1 (pulses on lock / when singing). */
  glow: number;
  /** Jitter amplitude in screen units — driven by the beat frequency. */
  jitter: number;
}

export interface SceneState {
  me: SceneStar;
  friend: SceneStar;
  /** 0..1 — how close the two stars are to a consonant lock (dotted→solid). */
  nearness: number;
  /** True when the interval is locked (bright beam + sparkles). */
  locked: boolean;
  /** Beat frequency in Hz — drives jitter speed + beam shimmer. */
  beatHz: number;
  /** Seconds since the most recent lock began (for the celebration ramp). */
  lockAge: number;
  /** True when a real human peer is present (vs the robot friend). */
  hasPeer: boolean;
  time: number;
}

// ── shaders ──────────────────────────────────────────────────────────────────

const BG_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Deep indigo→violet→black gradient with a soft starfield and two faint vertical
// arc tracks (left = violet "me", right = cyan "friend"). All procedural.
const BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;          // 0..1, y up
out vec4 o;
uniform float u_time;
uniform float u_aspect;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = v_uv;
  // vertical gradient: a little brighter at the top, deep at the bottom
  vec3 top = vec3(0.06, 0.05, 0.13);
  vec3 bot = vec3(0.015, 0.02, 0.05);
  vec3 col = mix(bot, top, smoothstep(0.0, 1.0, uv.y));

  // gentle centre warmth that breathes, hinting the two sides should meet
  vec2 c = uv - vec2(0.5, 0.55);
  float r = length(c * vec2(1.0, 1.2));
  float breathe = 0.5 + 0.5 * sin(u_time * 0.3);
  col += vec3(0.05, 0.04, 0.09) * (1.0 - smoothstep(0.0, 0.8, r)) * (0.6 + 0.4 * breathe);

  // faint vertical arc tracks the stars ride on (x ≈ 0.2 and 0.8)
  float trackL = smoothstep(0.012, 0.0, abs(uv.x - 0.2));
  float trackR = smoothstep(0.012, 0.0, abs(uv.x - 0.8));
  float trackMask = smoothstep(0.08, 0.12, uv.y) * smoothstep(0.06, 0.12, 1.0 - uv.y);
  col += vec3(0.18, 0.12, 0.30) * trackL * trackMask * 0.5;
  col += vec3(0.10, 0.22, 0.30) * trackR * trackMask * 0.5;

  // starfield: sparse twinkling points
  vec2 g = uv * vec2(u_aspect, 1.0) * 26.0;
  vec2 gi = floor(g);
  float h = hash(gi);
  if (h > 0.86) {
    vec2 gf = fract(g) - 0.5;
    float tw = 0.5 + 0.5 * sin(u_time * (0.6 + h) + h * 30.0);
    float d = length(gf);
    float s = smoothstep(0.18, 0.0, d) * tw * 0.5;
    col += vec3(0.7, 0.75, 0.9) * s;
  }

  // soft vignette
  col *= 1.0 - 0.4 * smoothstep(0.55, 1.15, length(uv - 0.5));
  o = vec4(col, 1.0);
}`;

// Glow-quad program. Each quad carries a local coordinate in [-1,1]^2 (a_uv), a
// colour, a brightness and a "kind" flag (0 = soft blob/beam/sparkle, 1 = star
// with spokes). Drawn additively.
const GLOW_VERT = `#version 300 es
in vec2 a_pos;   // clip space
in vec2 a_uv;    // -1..1 across the quad
in vec3 a_color;
in float a_bright;
in float a_kind;
out vec2 v_uv;
out vec3 v_color;
out float v_bright;
out float v_kind;
void main(){
  v_uv = a_uv;
  v_color = a_color;
  v_bright = a_bright;
  v_kind = a_kind;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const GLOW_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec3 v_color;
in float v_bright;
in float v_kind;
out vec4 o;
void main(){
  float d = length(v_uv);
  // soft radial falloff
  float core = smoothstep(1.0, 0.0, d);
  float glow = pow(core, 2.2);

  if (v_kind > 0.5) {
    // STAR: bright near-white core + coloured halo + 4 soft spokes
    float ang = atan(v_uv.y, v_uv.x);
    float spokes = pow(abs(cos(ang * 2.0)), 8.0) * smoothstep(1.0, 0.2, d);
    float center = smoothstep(0.45, 0.0, d);
    vec3 col = v_color * (glow * 1.3) + vec3(1.0) * center * 0.9 + v_color * spokes * 0.6;
    float a = clamp(glow + center + spokes * 0.5, 0.0, 1.0) * v_bright;
    o = vec4(col * v_bright, a);
  } else {
    // soft blob (beam segment / sparkle)
    vec3 col = v_color * glow;
    o = vec4(col * v_bright, glow * v_bright);
  }
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
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

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  return p;
}

export interface StarScene {
  render: (state: SceneState) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

// One sparkle particle (spawned along the beam on lock).
interface Sparkle {
  x: number; // clip
  y: number; // clip
  vx: number;
  vy: number;
  life: number; // 1→0
  hue: [number, number, number];
}

const FLOATS = 9; // pos.xy, uv.xy, color.rgb, bright, kind

export function createStarScene(gl: WebGL2RenderingContext): StarScene {
  const bgProg = link(gl, BG_VERT, BG_FRAG);
  const glowProg = link(gl, GLOW_VERT, GLOW_FRAG);

  // full-screen triangle
  const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const quadVao = gl.createVertexArray()!;
  const quadVbo = gl.createBuffer()!;
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const bgPosLoc = gl.getAttribLocation(bgProg, "a_pos");
  gl.enableVertexAttribArray(bgPosLoc);
  gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);
  const bgTimeLoc = gl.getUniformLocation(bgProg, "u_time");
  const bgAspectLoc = gl.getUniformLocation(bgProg, "u_aspect");

  // dynamic glow-quad buffer
  const glowVao = gl.createVertexArray()!;
  const glowVbo = gl.createBuffer()!;
  gl.bindVertexArray(glowVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
  const stride = FLOATS * 4;
  const aPos = gl.getAttribLocation(glowProg, "a_pos");
  const aUv = gl.getAttribLocation(glowProg, "a_uv");
  const aColor = gl.getAttribLocation(glowProg, "a_color");
  const aBright = gl.getAttribLocation(glowProg, "a_bright");
  const aKind = gl.getAttribLocation(glowProg, "a_kind");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 16);
  gl.enableVertexAttribArray(aBright);
  gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride, 28);
  gl.enableVertexAttribArray(aKind);
  gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, stride, 32);
  gl.bindVertexArray(null);

  let scratch = new Float32Array(4096 * FLOATS);
  let aspect = 1;
  let cursor = 0; // write head into scratch (in floats)

  const sparkles: Sparkle[] = [];
  let prevLocked = false;
  let lastTime = 0;

  function ensure(extraQuads: number): void {
    const need = (cursor + extraQuads * 6 * FLOATS);
    if (scratch.length < need) {
      const grown = new Float32Array(Math.max(need, scratch.length * 2));
      grown.set(scratch.subarray(0, cursor));
      scratch = grown;
    }
  }

  // push one quad centred at clip (cx,cy) with half-extents (hx,hy)
  function pushQuad(
    cx: number,
    cy: number,
    hx: number,
    hy: number,
    col: [number, number, number],
    bright: number,
    kind: number,
  ): void {
    ensure(1);
    const verts = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [ux, uy] of verts) {
      const px = cx + ux * hx;
      const py = cy + uy * hy;
      scratch[cursor++] = px;
      scratch[cursor++] = py;
      scratch[cursor++] = ux;
      scratch[cursor++] = uy;
      scratch[cursor++] = col[0];
      scratch[cursor++] = col[1];
      scratch[cursor++] = col[2];
      scratch[cursor++] = bright;
      scratch[cursor++] = kind;
    }
  }

  // normalised (0..1, y-down) → clip space
  function cx(x: number): number {
    return x * 2 - 1;
  }
  function cy(y: number): number {
    return 1 - y * 2;
  }

  function render(state: SceneState): void {
    const dt = Math.min(0.05, Math.max(0, state.time - lastTime));
    lastTime = state.time;

    // ── pass 1: background ────────────────────────────────────────────────
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.uniform1f(bgTimeLoc, state.time);
    gl.uniform1f(bgAspectLoc, aspect);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── build glow geometry ───────────────────────────────────────────────
    cursor = 0;

    const me = state.me;
    const fr = state.friend;

    // jitter both stars at the beat frequency when out of tune (visible beating)
    const beatPhase = state.time * state.beatHz * Math.PI * 2;
    const mJx = state.locked ? 0 : me.jitter * Math.sin(beatPhase) * 0.5;
    const mJy = state.locked ? 0 : me.jitter * Math.cos(beatPhase * 0.7) * 0.5;
    const fJx = state.locked ? 0 : fr.jitter * Math.sin(beatPhase + 1.7) * 0.5;
    const fJy = state.locked ? 0 : fr.jitter * Math.cos(beatPhase * 0.7 + 1.1) * 0.5;

    const mx = cx(me.x) + mJx;
    const my = cy(me.y) + mJy;
    const fx = cx(fr.x) + fJx;
    const fy = cy(fr.y) + fJy;

    // ── beam between the stars ────────────────────────────────────────────
    // dotted/faint when only reaching; solid + bright when locked. We lay a
    // chain of soft blobs from me→friend.
    const segs = 26;
    const beamBright = state.locked
      ? 0.9 + 0.25 * Math.sin(state.time * 6.0)
      : state.nearness * state.nearness * 0.5;
    if (beamBright > 0.01) {
      const beamCol: [number, number, number] = [0.75, 0.85, 1.0];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        // when reaching (not locked) make it dotted: skip alternating segments,
        // and only draw the central portion that "grows" out from both ends.
        if (!state.locked) {
          const grow = state.nearness; // 0..1 how far the dots have reached
          const edge = Math.abs(t - 0.5) * 2; // 0 centre → 1 ends
          if (edge > grow) continue;
          if (i % 2 === 0) continue; // dotted
        }
        const bx = mx + (fx - mx) * t;
        const by = my + (fy - my) * t;
        const flow = state.locked
          ? 0.7 + 0.5 * Math.sin(state.time * 8.0 - t * 12.0)
          : 1.0;
        const r = state.locked ? 0.02 : 0.014;
        pushQuad(bx, by, r, r * aspect, beamCol, beamBright * flow, 0);
      }
    }

    // ── sparkles ──────────────────────────────────────────────────────────
    // spawn a burst along the beam on the rising edge of a lock, then keep a
    // gentle trickle while locked.
    if (state.locked && !prevLocked) {
      for (let i = 0; i < 60; i++) {
        const t = Math.random();
        const bx = mx + (fx - mx) * t;
        const by = my + (fy - my) * t;
        const ang = Math.random() * Math.PI * 2;
        const sp = 0.15 + Math.random() * 0.5;
        sparkles.push({
          x: bx,
          y: by,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 1,
          hue: Math.random() > 0.5 ? me.color : fr.color,
        });
      }
    }
    if (state.locked && Math.random() < 0.5) {
      const t = Math.random();
      const bx = mx + (fx - mx) * t;
      const by = my + (fy - my) * t;
      const ang = Math.random() * Math.PI * 2;
      sparkles.push({
        x: bx,
        y: by,
        vx: Math.cos(ang) * 0.2,
        vy: Math.sin(ang) * 0.2,
        life: 1,
        hue: [1, 1, 0.85],
      });
    }
    prevLocked = state.locked;

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life -= dt * 1.3;
      if (s.life <= 0) {
        sparkles.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += dt * 0.15; // slight drift
      const r = 0.012 * s.life;
      pushQuad(s.x, s.y, r, r * aspect, s.hue, s.life * 0.9, 0);
    }

    // ── the two stars (drawn last so their bright cores sit on top) ────────
    const pulse = state.locked
      ? 1 + 0.18 * Math.sin(state.lockAge * 6.0) // synced pulse on lock
      : 1;
    drawStar(me, mx, my, pulse, state);
    drawStar(fr, fx, fy, pulse, state);

    // ── upload + draw additively ──────────────────────────────────────────
    if (cursor > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(glowProg);
      gl.bindVertexArray(glowVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, glowVbo);
      gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, cursor), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, cursor / FLOATS);
      gl.disable(gl.BLEND);
    }
  }

  function drawStar(
    star: SceneStar,
    sx: number,
    sy: number,
    pulse: number,
    state: SceneState,
  ): void {
    const breathe = 1 + 0.06 * Math.sin(state.time * 1.6 + star.x * 10);
    const r = star.radius * pulse * breathe;
    const bright = 0.7 + star.glow * 0.6;
    // outer soft halo
    pushQuad(sx, sy, r * 2.2, r * 2.2 * aspect, star.color, bright * 0.5, 0);
    // the star itself (with spokes)
    pushQuad(sx, sy, r, r * aspect, star.color, bright, 1);
  }

  function resize(w: number, h: number): void {
    gl.viewport(0, 0, w, h);
    aspect = w / Math.max(1, h);
  }

  function dispose(): void {
    gl.deleteProgram(bgProg);
    gl.deleteProgram(glowProg);
    gl.deleteVertexArray(quadVao);
    gl.deleteVertexArray(glowVao);
    gl.deleteBuffer(quadVbo);
    gl.deleteBuffer(glowVbo);
  }

  return { render, resize, dispose };
}
