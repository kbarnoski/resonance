// Raw WebGL2 renderer for the clap-along.
// ────────────────────────────────────────────────────────────────────────────
// The scene is deliberately simple and warm for a 4-year-old:
//
//   • a single friendly CREATURE — a soft breathing blob with two eyes — that
//     squashes/bounces when it claps, leans in to "listen" on the child's turn,
//     and beams (eyes curve into happy arcs) when the shared rhythm GROWS.
//   • a row of glowing "clap" BEADS beneath it — one per beat in the shared
//     pattern. A bead lights up as the creature claps it, and pulses again when
//     the child's clap lands near it. The row GROWS by one bead each level, so
//     the child can SEE the song getting longer.
//
// House compositing rules (matched to the sibling prototype): every layer is
// drawn with premultiplied alpha-over (gl.ONE, gl.ONE_MINUS_SRC_ALPHA) — a matte
// composite, NO additive glow-stacking / bloom blow-out. Brightness comes from
// colour, not from blend overflow.
//
// Two programs:
//   1. a full-screen background gradient quad (matte), warmth tracks "energy".
//   2. a point-sprite program drawing the creature body, eyes, and beads as
//      soft round sprites with per-point colour + alpha + a shape flag.
//
// Coordinates are normalised [0,1], y DOWN. Hand-written GLSL ES 3.00.

const BG_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// A calm warm gradient. At rest a soft dusk indigo; as warmth (call/celebrate)
// rises it blooms toward a gentle amber-rose. A slow breathing centre glow keeps
// it alive. Matte — no additive overflow.
const BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform float u_time;
uniform float u_warm; // 0..1
void main() {
  float y = v_uv.y; // 0 top .. 1 bottom

  vec3 topCalm = vec3(0.07, 0.06, 0.13);
  vec3 botCalm = vec3(0.04, 0.04, 0.09);
  vec3 topWarm = vec3(0.18, 0.12, 0.18);
  vec3 botWarm = vec3(0.22, 0.13, 0.11);

  float w = clamp(u_warm, 0.0, 1.0);
  vec3 top = mix(topCalm, topWarm, w);
  vec3 bot = mix(botCalm, botWarm, w);
  vec3 col = mix(top, bot, smoothstep(0.0, 1.0, y));

  // warm hearth glow behind the creature (upper-middle)
  vec2 c = v_uv - vec2(0.5, 0.42);
  float r = length(c * vec2(1.0, 1.2));
  float breathe = 0.5 + 0.5 * sin(u_time * 0.5);
  col += vec3(0.10, 0.06, 0.05) * (1.0 - smoothstep(0.0, 0.8, r)) * (0.5 + 0.5 * w) * (0.7 + 0.3 * breathe);

  // soft vignette
  col *= 1.0 - 0.34 * smoothstep(0.5, 1.15, length(v_uv - 0.5));
  o = vec4(col, 1.0);
}`;

// Point-sprite program. Each point: clip pos, px size, rgb, alpha, and a SHAPE
// flag (0 = soft round blob, 1 = round bead with a brighter rim, 2 = eye, the
// 2 carries a "smile" amount in a_extra for happy-arc eyes).
const PT_VERT = `#version 300 es
in vec2 a_pos;    // clip space
in float a_size;  // px
in vec3 a_color;
in float a_alpha;
in float a_shape; // 0 blob, 1 bead, 2 eye
in float a_extra; // shape-specific (eye smile 0..1)
out vec3 v_color;
out float v_alpha;
out float v_shape;
out float v_extra;
void main() {
  v_color = a_color;
  v_alpha = a_alpha;
  v_shape = a_shape;
  v_extra = a_extra;
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size;
}`;

const PT_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_alpha;
in float v_shape;
in float v_extra;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5); // -0.5..0.5
  float r = length(p) * 2.0;          // 0 centre .. 1 edge
  float a;
  if (v_shape < 0.5) {
    // soft round blob (creature body / glow): smooth radial falloff
    float core = 1.0 - smoothstep(0.0, 1.0, r);
    a = pow(core, 1.5) * v_alpha;
  } else if (v_shape < 1.5) {
    // clap bead: a filled disc with a slightly brighter centre, soft edge
    float disc = 1.0 - smoothstep(0.82, 1.0, r);
    float centre = (1.0 - smoothstep(0.0, 0.7, r)) * 0.5;
    a = (disc * 0.85 + centre) * v_alpha;
  } else {
    // eye: a dark pupil; if v_extra>0 it becomes a happy upward arc (a smile).
    float smile = v_extra;
    // distance to a curved arc vs a dot, blended by smile
    float dot = 1.0 - smoothstep(0.35, 0.62, r);
    // arc: a thin smile band -> y above a parabola
    float arc = smoothstep(0.10, 0.0, abs(p.y + 0.18 - 1.4 * p.x * p.x)) *
                step(abs(p.x), 0.42);
    float shape = mix(dot, arc, smile);
    a = clamp(shape, 0.0, 1.0) * v_alpha;
  }
  o = vec4(v_color * a, a); // premultiplied alpha-over (matte, house style)
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
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

// Creature mood that the page drives. The renderer just reads these numbers.
export interface CreatureView {
  /** 0 calm .. 1 fully excited (drives warmth + body pulse baseline). */
  warm: number;
  /** instantaneous clap squash 0..1 (set to ~1 on a clap, decays). */
  squash: number;
  /** "listening" lean 0..1 (creature tilts/leans during the child's turn). */
  listen: number;
  /** "delight" 0..1 (eyes become happy arcs, gentle bounce on a grow). */
  delight: number;
  /** the shared pattern length (how many beads to draw). */
  beadCount: number;
  /** which bead is lit right now, or -1 (a creature beat / child clap landing). */
  litBead: number;
  /** lit intensity 0..1 for the active bead. */
  litStrength: number;
  /** which "voice" lit it — tints the bead (creature call vs child answer). */
  litWho: "creature" | "child" | "none";
}

export interface CreatureRenderer {
  /** advance internal eased state. dt seconds. */
  step: (dt: number, view: CreatureView) => void;
  render: (timeSec: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

// Palettes (matte; brightness from colour, not blend overflow).
const BODY_CALM: [number, number, number] = [0.85, 0.55, 0.42]; // warm clay
const BODY_WARM: [number, number, number] = [0.98, 0.72, 0.42]; // amber
const BEAD_OFF: [number, number, number] = [0.32, 0.30, 0.42]; // dim periwinkle
const BEAD_CREATURE: [number, number, number] = [0.98, 0.74, 0.42]; // amber call
const BEAD_CHILD: [number, number, number] = [0.62, 0.86, 0.78]; // mint answer

// pos(2)+size(1)+color(3)+alpha(1)+shape(1)+extra(1) = 9 floats per point
const STRIDE_FLOATS = 9;
const MAX_POINTS = 64;

export function createCreatureRenderer(gl: WebGL2RenderingContext): CreatureRenderer {
  const bgProg = link(gl, BG_VERT, BG_FRAG);
  const ptProg = link(gl, PT_VERT, PT_FRAG);

  // full-screen tri
  const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const quadVao = gl.createVertexArray()!;
  const quadVbo = gl.createBuffer()!;
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const bgPos = gl.getAttribLocation(bgProg, "a_pos");
  gl.enableVertexAttribArray(bgPos);
  gl.vertexAttribPointer(bgPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const bgTimeLoc = gl.getUniformLocation(bgProg, "u_time");
  const bgWarmLoc = gl.getUniformLocation(bgProg, "u_warm");

  // dynamic point buffer
  const ptVao = gl.createVertexArray()!;
  const ptVbo = gl.createBuffer()!;
  gl.bindVertexArray(ptVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ptVbo);
  const stride = STRIDE_FLOATS * 4;
  const aPos = gl.getAttribLocation(ptProg, "a_pos");
  const aSize = gl.getAttribLocation(ptProg, "a_size");
  const aColor = gl.getAttribLocation(ptProg, "a_color");
  const aAlpha = gl.getAttribLocation(ptProg, "a_alpha");
  const aShape = gl.getAttribLocation(ptProg, "a_shape");
  const aExtra = gl.getAttribLocation(ptProg, "a_extra");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aSize);
  gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(aAlpha);
  gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride, 24);
  gl.enableVertexAttribArray(aShape);
  gl.vertexAttribPointer(aShape, 1, gl.FLOAT, false, stride, 28);
  gl.enableVertexAttribArray(aExtra);
  gl.vertexAttribPointer(aExtra, 1, gl.FLOAT, false, stride, 32);
  gl.bindVertexArray(null);

  const scratch = new Float32Array(MAX_POINTS * STRIDE_FLOATS);

  // eased internal state so motion is smooth even if the page sets steps
  let eWarm = 0;
  let eSquash = 0;
  let eListen = 0;
  let eDelight = 0;
  // per-bead lit envelopes so a lit bead glows then fades on its own
  const beadLit: number[] = new Array(MAX_POINTS).fill(0);
  const beadWho: number[] = new Array(MAX_POINTS).fill(0); // 0 none,1 creature,2 child
  let beadCount = 2;
  let viewportW = 1;
  let viewportH = 1;

  let lastView: CreatureView = {
    warm: 0,
    squash: 0,
    listen: 0,
    delight: 0,
    beadCount: 2,
    litBead: -1,
    litStrength: 0,
    litWho: "none",
  };

  function step(dt: number, view: CreatureView): void {
    lastView = view;
    beadCount = Math.max(1, Math.min(MAX_POINTS - 8, Math.round(view.beadCount)));

    // ease moods (fast attack on squash so a clap pops; slow release)
    eWarm += (view.warm - eWarm) * Math.min(1, dt * 4);
    eListen += (view.listen - eListen) * Math.min(1, dt * 5);
    eDelight += (view.delight - eDelight) * Math.min(1, dt * 4);
    // squash: jump up toward the incoming value, then decay
    eSquash = Math.max(eSquash, view.squash);
    eSquash += (0 - eSquash) * Math.min(1, dt * 6);

    // light the active bead, then let all beads decay
    if (view.litBead >= 0 && view.litBead < MAX_POINTS) {
      beadLit[view.litBead] = Math.max(beadLit[view.litBead], view.litStrength);
      beadWho[view.litBead] = view.litWho === "child" ? 2 : view.litWho === "creature" ? 1 : 0;
    }
    for (let i = 0; i < MAX_POINTS; i++) {
      beadLit[i] += (0 - beadLit[i]) * Math.min(1, dt * 3.2);
      if (beadLit[i] < 0.001) beadLit[i] = 0;
    }
  }

  function nx(x: number): number {
    return x * 2 - 1;
  }
  function ny(y: number): number {
    return 1 - y * 2; // y down → clip up
  }

  function put(
    o: number,
    x: number,
    y: number,
    sizePx: number,
    col: [number, number, number],
    alpha: number,
    shape: number,
    extra: number,
  ): number {
    scratch[o] = nx(x);
    scratch[o + 1] = ny(y);
    scratch[o + 2] = sizePx * dprScale;
    scratch[o + 3] = col[0];
    scratch[o + 4] = col[1];
    scratch[o + 5] = col[2];
    scratch[o + 6] = alpha;
    scratch[o + 7] = shape;
    scratch[o + 8] = extra;
    return o + STRIDE_FLOATS;
  }

  let dprScale = 1;

  function render(timeSec: number): void {
    // background (matte)
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.uniform1f(bgTimeLoc, timeSec);
    gl.uniform1f(bgWarmLoc, Math.min(1, eWarm + eDelight * 0.6));
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── build the creature + beads point list ───────────────────────────────
    let o = 0;

    // creature centre & breathing. base size in px relative to min(viewport).
    const base = Math.min(viewportW, viewportH);
    const breathe = 0.5 + 0.5 * Math.sin(timeSec * 0.9);
    const excite = Math.min(1, eWarm + eDelight);
    // squash makes it wider & shorter momentarily; delight adds a gentle bounce
    const bounce = eDelight * 0.03 * Math.sin(timeSec * 9.0);
    const cx = 0.5;
    const cy = 0.4 + eListen * 0.03 - bounce; // leans/sinks slightly to listen

    const bodyCol: [number, number, number] = [
      BODY_CALM[0] + (BODY_WARM[0] - BODY_CALM[0]) * excite,
      BODY_CALM[1] + (BODY_WARM[1] - BODY_CALM[1]) * excite,
      BODY_CALM[2] + (BODY_WARM[2] - BODY_CALM[2]) * excite,
    ];

    // soft outer halo (matte, low alpha — reads as warmth, not bloom)
    const haloSize = base * (0.62 + 0.04 * breathe + eSquash * 0.05);
    o = put(o, cx, cy, haloSize, bodyCol, 0.18 + 0.12 * excite, 0, 0);

    // main body — a couple of stacked blobs give a rounded squashy silhouette
    const bodySize = base * (0.42 + 0.03 * breathe + eSquash * 0.06);
    o = put(o, cx, cy, bodySize, bodyCol, 0.95, 0, 0);
    // a smaller top blob so it reads as a head/body, not a circle
    o = put(o, cx, cy - 0.07 - eSquash * 0.01, bodySize * 0.72, bodyCol, 0.9, 0, 0);

    // eyes — two dark pupils that curve into happy arcs on delight
    const eyeY = cy - 0.05;
    const eyeDx = 0.055 + eSquash * 0.008;
    const eyeSize = base * 0.085;
    const smile = Math.min(1, eDelight * 1.2);
    const eyeCol: [number, number, number] = [0.12, 0.08, 0.12];
    o = put(o, cx - eyeDx, eyeY, eyeSize, eyeCol, 0.95, 2, smile);
    o = put(o, cx + eyeDx, eyeY, eyeSize, eyeCol, 0.95, 2, smile);

    // tiny cheek warmth when delighted (two soft rosy dabs)
    if (eDelight > 0.05) {
      const cheek: [number, number, number] = [0.98, 0.5, 0.5];
      o = put(o, cx - 0.1, cy + 0.0, base * 0.05, cheek, 0.4 * eDelight, 0, 0);
      o = put(o, cx + 0.1, cy + 0.0, base * 0.05, cheek, 0.4 * eDelight, 0, 0);
    }

    // ── clap beads: a centred row beneath the creature ──────────────────────
    const n = beadCount;
    const rowY = 0.72;
    const spread = Math.min(0.74, 0.1 * n); // tighten spacing as it grows
    const beadSize = base * (0.05 + Math.max(0, 0.02 - n * 0.001));
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const x = 0.5 + (t - 0.5) * spread;
      const lit = beadLit[i];
      let col = BEAD_OFF;
      if (lit > 0.01) {
        const tint = beadWho[i] === 2 ? BEAD_CHILD : BEAD_CREATURE;
        col = [
          BEAD_OFF[0] + (tint[0] - BEAD_OFF[0]) * lit,
          BEAD_OFF[1] + (tint[1] - BEAD_OFF[1]) * lit,
          BEAD_OFF[2] + (tint[2] - BEAD_OFF[2]) * lit,
        ];
      }
      const size = beadSize * (1 + lit * 0.5);
      const alpha = 0.5 + lit * 0.5;
      o = put(o, x, rowY, size, col, alpha, 1, 0);
    }

    // upload + draw (matte premultiplied alpha-over — house style, no additive)
    const count = o / STRIDE_FLOATS;
    if (count > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(ptProg);
      gl.bindVertexArray(ptVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptVbo);
      gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, o), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    }

    void lastView;
  }

  function resize(w: number, h: number): void {
    gl.viewport(0, 0, w, h);
    viewportW = w;
    viewportH = h;
    dprScale = Math.max(1, w / Math.max(1, window.innerWidth || w));
  }

  function dispose(): void {
    gl.deleteBuffer(quadVbo);
    gl.deleteBuffer(ptVbo);
    gl.deleteVertexArray(quadVao);
    gl.deleteVertexArray(ptVao);
    gl.deleteProgram(bgProg);
    gl.deleteProgram(ptProg);
  }

  return { step, render, resize, dispose };
}
