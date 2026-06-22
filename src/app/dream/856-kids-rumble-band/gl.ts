// Hand-written WebGL2 renderer for "Feel the Beat".
//
// A dark playful gradient field with additive glow point-sprites:
//   - a soft cloud of ~700 drifting "stars" that breathe with the felt beat
//   - two big glowing "creatures" (warm melody + cool harmony) that move with
//     the two thumbsticks
//   - drum hits push expanding ripple/sparkle bursts
//
// Two passes:
//   1) a full-screen background quad (gradient + pulsing vignette)
//   2) instanced additive point-sprites (stars, creatures, ripples)
//
// Additive blending: gl.blendFunc(SRC_ALPHA, ONE). GLSL ES 3.00.

// ── Background pass ──────────────────────────────────────────────────────────
const BG_VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](
  vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0)
);
out vec2 vUv;
void main() {
  vec2 p = verts[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uBeat;    // 0..1 felt-beat pulse
uniform float uAspect;  // w/h

const vec3 TOP = vec3(0.055, 0.035, 0.130);  // deep grape
const vec3 BOT = vec3(0.020, 0.030, 0.075);  // midnight blue

void main() {
  vec2 uv = vUv;
  // vertical gradient
  vec3 col = mix(BOT, TOP, smoothstep(0.0, 1.0, uv.y));

  // soft moving aurora bands
  float band = 0.5 + 0.5 * sin(uv.x * 3.0 + uTime * 0.25 + uv.y * 2.0);
  col += vec3(0.05, 0.03, 0.09) * band * 0.5;

  // beat vignette: the whole field gently brightens on the beat from center
  vec2 c = uv - 0.5;
  c.x *= uAspect;
  float r = length(c);
  float pulse = uBeat * (1.0 - smoothstep(0.0, 0.95, r));
  col += vec3(0.12, 0.07, 0.18) * pulse;

  // gentle outer darkening so glows pop
  col *= 1.0 - 0.35 * smoothstep(0.55, 1.2, r);

  outColor = vec4(col, 1.0);
}`;

// ── Sprite pass (instanced additive points) ──────────────────────────────────
const SP_VERT = `#version 300 es
precision highp float;
// quad corners (unit), instanced per sprite
layout(location = 0) in vec2 aCorner;   // -1..1
layout(location = 1) in vec2 aPos;      // clip-space center -1..1
layout(location = 2) in float aSize;    // half-size in clip units
layout(location = 3) in vec3 aColor;    // additive color
layout(location = 4) in float aAlpha;   // intensity
uniform float uAspect;                  // w/h
out vec2 vLocal;
out vec3 vColor;
out float vAlpha;
void main() {
  vLocal = aCorner;
  vColor = aColor;
  vAlpha = aAlpha;
  vec2 offset = aCorner * aSize;
  offset.x /= uAspect;                  // keep sprites round
  gl_Position = vec4(aPos + offset, 0.0, 1.0);
}`;

const SP_FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  // soft gaussian-ish falloff with a hot core
  float glow = exp(-d * d * 3.5);
  float core = exp(-d * d * 14.0) * 0.7;
  float a = (glow + core) * vAlpha;
  outColor = vec4(vColor * a, a);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("Program link error: " + log);
  }
  return prog;
}

// One sprite = 7 floats: posX, posY, size, r, g, b, alpha
const FLOATS_PER_SPRITE = 7;

export type Sprite = {
  x: number; // clip -1..1
  y: number;
  size: number; // half-size, clip units
  r: number;
  g: number;
  b: number;
  alpha: number;
};

export type GLRenderer = {
  draw: (
    sprites: Sprite[],
    beat: number,
    time: number,
    w: number,
    h: number,
  ) => void;
  dispose: () => void;
};

export function makeRenderer(gl: WebGL2RenderingContext): GLRenderer {
  const bgProg = linkProgram(gl, BG_VERT, BG_FRAG);
  const spProg = linkProgram(gl, SP_VERT, SP_FRAG);

  const uBgTime = gl.getUniformLocation(bgProg, "uTime");
  const uBgBeat = gl.getUniformLocation(bgProg, "uBeat");
  const uBgAspect = gl.getUniformLocation(bgProg, "uAspect");
  const uSpAspect = gl.getUniformLocation(spProg, "uAspect");

  // Background draws from a 3-vertex attributeless triangle.
  const bgVao = gl.createVertexArray();

  // Sprite VAO: unit quad + instanced per-sprite buffer.
  const spVao = gl.createVertexArray();
  gl.bindVertexArray(spVao);

  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  // two triangles covering -1..1
  const quad = new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  let instCapacity = 1024;
  let instData = new Float32Array(instCapacity * FLOATS_PER_SPRITE);
  gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);

  const stride = FLOATS_PER_SPRITE * 4;
  // aPos (loc 1) vec2
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(1, 1);
  // aSize (loc 2) float
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 8);
  gl.vertexAttribDivisor(2, 1);
  // aColor (loc 3) vec3
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 12);
  gl.vertexAttribDivisor(3, 1);
  // aAlpha (loc 4) float
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 24);
  gl.vertexAttribDivisor(4, 1);

  gl.bindVertexArray(null);

  function draw(
    sprites: Sprite[],
    beat: number,
    time: number,
    w: number,
    h: number,
  ) {
    const aspect = w / Math.max(1, h);
    gl.viewport(0, 0, w, h);

    // ── Background (opaque) ──
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.bindVertexArray(bgVao);
    gl.uniform1f(uBgTime, time);
    gl.uniform1f(uBgBeat, beat);
    gl.uniform1f(uBgAspect, aspect);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── Sprites (additive) ──
    const n = sprites.length;
    if (n > 0) {
      if (n > instCapacity) {
        instCapacity = n * 2;
        instData = new Float32Array(instCapacity * FLOATS_PER_SPRITE);
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
      }
      for (let i = 0; i < n; i++) {
        const s = sprites[i];
        const o = i * FLOATS_PER_SPRITE;
        instData[o] = s.x;
        instData[o + 1] = s.y;
        instData[o + 2] = s.size;
        instData[o + 3] = s.r;
        instData[o + 4] = s.g;
        instData[o + 5] = s.b;
        instData[o + 6] = s.alpha;
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(spProg);
      gl.uniform1f(uSpAspect, aspect);
      gl.bindVertexArray(spVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        instData.subarray(0, n * FLOATS_PER_SPRITE),
      );
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    }

    gl.bindVertexArray(null);
  }

  function dispose() {
    gl.deleteProgram(bgProg);
    gl.deleteProgram(spProg);
    gl.deleteVertexArray(bgVao);
    gl.deleteVertexArray(spVao);
    gl.deleteBuffer(quadBuf);
    gl.deleteBuffer(instBuf);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return { draw, dispose };
}
