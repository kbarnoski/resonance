// Hand-written TRUE-3D WebGL2 renderer for the moon trampoline.
// Draws: a starry-night point field, the cloth as glowing lines + node stars,
// and the moon-ball as a soft additive sphere. Own perspective/view matrices.

import {
  makePerspective,
  makeLookAt,
  multiply,
  type Mat4,
  type Vec3,
} from "./gl-math";
import { N, type Cloth, type BallState } from "./cloth";

const VERT_LINE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aGlow;
uniform mat4 uVP;
out float vGlow;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  vGlow = aGlow;
}`;

const FRAG_LINE = `#version 300 es
precision highp float;
in float vGlow;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor * (0.35 + vGlow), 0.55 + vGlow * 0.45);
}`;

const VERT_POINT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aSize;
layout(location=2) in vec3 aColor;
uniform mat4 uVP;
out vec3 vColor;
void main() {
  vec4 clip = uVP * vec4(aPos, 1.0);
  gl_Position = clip;
  // perspective-scaled point size (nearer = bigger -> reads as depth)
  gl_PointSize = aSize / max(0.2, clip.w);
  vColor = aColor;
}`;

const FRAG_POINT = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r); // soft round glow
  outColor = vec4(vColor * a, a);
}`;

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
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

export interface Renderer {
  draw: (cloth: Cloth, ball: BallState, tSec: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

// Precompute line index pairs for the cloth lattice (structural grid only).
function buildLineIndices(): number[] {
  const idx: number[] = [];
  const at = (i: number, j: number) => j * N + i;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (i + 1 < N) idx.push(at(i, j), at(i + 1, j));
      if (j + 1 < N) idx.push(at(i, j), at(i, j + 1));
    }
  }
  return idx;
}

export function makeRenderer(gl: WebGL2RenderingContext): Renderer {
  const lineProg = link(gl, VERT_LINE, FRAG_LINE);
  const pointProg = link(gl, VERT_POINT, FRAG_POINT);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive -> glow

  // --- Star background (static random field on a far dome-ish box) ---
  const STAR_COUNT = 220;
  const starData = new Float32Array(STAR_COUNT * 7); // pos3 size1 color3
  for (let s = 0; s < STAR_COUNT; s++) {
    const o = s * 7;
    // scatter across a wide far plane behind the cloth
    starData[o] = (Math.random() - 0.5) * 26;
    starData[o + 1] = (Math.random() - 0.2) * 16 - 2;
    starData[o + 2] = -10 - Math.random() * 14;
    starData[o + 3] = 60 + Math.random() * 120; // base point size
    const warm = Math.random() < 0.5;
    starData[o + 4] = warm ? 1.0 : 0.8;
    starData[o + 5] = warm ? 0.92 : 0.86;
    starData[o + 6] = warm ? 0.7 : 1.0;
  }
  const starBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
  gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);

  // --- Cloth line geometry (dynamic) ---
  const lineIdx = buildLineIndices();
  const lineIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(lineIdx),
    gl.STATIC_DRAW,
  );
  const clothVerts = new Float32Array(N * N * 4); // pos3 + glow1
  const clothBuf = gl.createBuffer();

  // --- Cloth node points (reuse positions; pos3 size1 color3) ---
  const nodeData = new Float32Array(N * N * 7);

  // --- Moon-ball: a small cluster of additive points -> soft sphere ---
  const BALL_PTS = 90;
  const ballOffsets = new Float32Array(BALL_PTS * 3);
  for (let b = 0; b < BALL_PTS; b++) {
    // fibonacci-ish sphere sampling
    const y = 1 - (b / (BALL_PTS - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = b * 2.399963;
    ballOffsets[b * 3] = Math.cos(theta) * rad;
    ballOffsets[b * 3 + 1] = y;
    ballOffsets[b * 3 + 2] = Math.sin(theta) * rad;
  }
  const ballData = new Float32Array(BALL_PTS * 7);
  const ballBuf = gl.createBuffer();

  let aspect = 1;

  const resize = (w: number, h: number) => {
    aspect = w / Math.max(1, h);
    gl.viewport(0, 0, w, h);
  };

  const draw = (cloth: Cloth, ball: BallState, tSec: number) => {
    gl.clearColor(0.04, 0.04, 0.11, 1); // deep indigo night
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Camera gently orbits so depth reads (sheet stretches toward/away).
    const ang = Math.sin(tSec * 0.12) * 0.5;
    const eye: Vec3 = [Math.sin(ang) * 6.5, 4.2, Math.cos(ang) * 6.5 + 1.5];
    const view = makeLookAt(eye, [0, -0.4, 0], [0, 1, 0]);
    const proj = makePerspective((52 * Math.PI) / 180, aspect, 0.1, 100);
    const vp: Mat4 = multiply(proj, view);

    // --- Stars ---
    gl.useProgram(pointProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(pointProg, "uVP"), false, vp);
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    // twinkle by nudging point sizes over time
    for (let s = 0; s < STAR_COUNT; s++) {
      const base = 60 + ((s * 53) % 80);
      starData[s * 7 + 3] =
        base * (0.7 + 0.3 * Math.sin(tSec * 1.3 + s * 0.7));
    }
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, STAR_COUNT);

    // --- Cloth lines ---
    const { px, py, pz } = cloth;
    for (let k = 0; k < N * N; k++) {
      const dent = Math.min(1, Math.max(0, (0 - py[k]) * 1.5));
      clothVerts[k * 4] = px[k];
      clothVerts[k * 4 + 1] = py[k];
      clothVerts[k * 4 + 2] = pz[k];
      clothVerts[k * 4 + 3] = dent; // glow rises where the sheet is stretched
    }
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, "uVP"), false, vp);
    gl.uniform3f(gl.getUniformLocation(lineProg, "uColor"), 0.5, 0.55, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, clothBuf);
    gl.bufferData(gl.ARRAY_BUFFER, clothVerts, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuf);
    gl.drawElements(gl.LINES, lineIdx.length, gl.UNSIGNED_SHORT, 0);

    // --- Cloth node stars (gold/white glints) ---
    for (let k = 0; k < N * N; k++) {
      const o = k * 7;
      nodeData[o] = px[k];
      nodeData[o + 1] = py[k];
      nodeData[o + 2] = pz[k];
      const dent = Math.min(1, Math.max(0, (0 - py[k]) * 1.5));
      nodeData[o + 3] = 70 + dent * 130;
      nodeData[o + 4] = 1.0;
      nodeData[o + 5] = 0.92 - dent * 0.2;
      nodeData[o + 6] = 0.65 + dent * 0.25;
    }
    gl.useProgram(pointProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(pointProg, "uVP"), false, vp);
    gl.bindBuffer(gl.ARRAY_BUFFER, clothBuf); // reuse buffer slot via node data
    gl.bufferData(gl.ARRAY_BUFFER, nodeData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    gl.drawArrays(gl.POINTS, 0, N * N);

    // --- Moon-ball (soft additive sphere) ---
    const by = -cloth.maxDent * 0.5 + ball.radius * 0.2; // ride the dent
    for (let b = 0; b < BALL_PTS; b++) {
      const o = b * 7;
      nodeFromBall(
        ballData,
        o,
        ball.x + ballOffsets[b * 3] * ball.radius,
        by + ballOffsets[b * 3 + 1] * ball.radius,
        ball.z + ballOffsets[b * 3 + 2] * ball.radius,
      );
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ballBuf);
    gl.bufferData(gl.ARRAY_BUFFER, ballData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    gl.drawArrays(gl.POINTS, 0, BALL_PTS);
  };

  const dispose = () => {
    gl.deleteProgram(lineProg);
    gl.deleteProgram(pointProg);
    gl.deleteBuffer(starBuf);
    gl.deleteBuffer(clothBuf);
    gl.deleteBuffer(ballBuf);
    gl.deleteBuffer(lineIndexBuf);
  };

  return { draw, resize, dispose };
}

// Helper (not a hook): write one moon-ball point into the interleaved array.
function nodeFromBall(
  arr: Float32Array,
  o: number,
  x: number,
  y: number,
  z: number,
): void {
  arr[o] = x;
  arr[o + 1] = y;
  arr[o + 2] = z;
  arr[o + 3] = 230; // big soft glow points
  arr[o + 4] = 0.85; // moon = pale gold-white
  arr[o + 5] = 0.88;
  arr[o + 6] = 1.0;
}
