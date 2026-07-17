// gl.ts — raw WebGL2 long-exposure renderer (no three.js).
//
// A ping-pong feedback texture accumulates the pendulum tip's path with
// additive blending and a slow per-frame fade, so the chaotic orbit paints a
// glowing Lissajous-like figure (an Ikeda-plot vibe). Rods and bobs are drawn
// live on top each frame. A Canvas2D fallback keeps no-GPU reviewers covered.

import type { Joints } from "./physics";

export interface FrameInput {
  center: [number, number];
  scale: [number, number];
  mainA: [number, number];
  mainB: [number, number];
  twinA: [number, number];
  twinB: [number, number];
  mainJoints: Joints;
  twinJoints: Joints;
  reduced: boolean;
}

export interface Renderer {
  kind: "webgl2" | "canvas2d";
  resize: (w: number, h: number, dpr: number) => void;
  frame: (input: FrameInput) => void;
  dispose: () => void;
}

// Violet ramp (matches --primary) for the glow; one hot accent for live bob.
const GLOW_MAIN: [number, number, number] = [0.62, 0.4, 1.0];
const GLOW_TWIN: [number, number, number] = [0.42, 0.55, 0.95];
const ACCENT: [number, number, number] = [1.0, 0.55, 0.85];

const GEOM_VS = `#version 300 es
in vec2 aPos;
in vec4 aColor;
uniform vec2 uCenter;
uniform vec2 uScale;
uniform float uPointSize;
out vec4 vColor;
void main() {
  vec2 c = (aPos - uCenter) * uScale;
  gl_Position = vec4(c, 0.0, 1.0);
  gl_PointSize = uPointSize;
  vColor = aColor;
}`;

const GEOM_FS = `#version 300 es
precision highp float;
in vec4 vColor;
uniform int uIsPoint;
out vec4 frag;
void main() {
  float a = vColor.a;
  if (uIsPoint == 1) {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    a *= smoothstep(1.0, 0.0, r);
  }
  frag = vec4(vColor.rgb * a, a);
}`;

const FULL_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FADE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uFade;
out vec4 frag;
void main() {
  frag = texture(uTex, vUv) * uFade;
}`;

const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 frag;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  // gentle soft-knee so bright cores bloom without hard clipping
  c = c / (c + vec3(0.7)) * 1.7;
  frag = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
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
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  return p;
}

/** Attempt the WebGL2 renderer; returns null if unavailable. */
export function createWebGL2Renderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const geom = link(gl, GEOM_VS, GEOM_FS);
  const fade = link(gl, FULL_VS, FADE_FS);
  const present = link(gl, FULL_VS, PRESENT_FS);
  if (!geom || !fade || !present) return null;

  // fullscreen quad
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  // dynamic geometry buffer (x,y,r,g,b,a per vertex)
  const dyn = gl.createBuffer();

  // ping-pong accumulation targets
  let texW = 2;
  let texH = 2;
  const tex: WebGLTexture[] = [];
  const fbo: WebGLFramebuffer[] = [];
  for (let i = 0; i < 2; i++) {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    tex.push(t);
    fbo.push(fb);
  }
  let src = 0;

  function allocTargets(w: number, h: number) {
    texW = Math.max(2, w);
    texH = Math.max(2, h);
    for (let i = 0; i < 2; i++) {
      gl!.bindTexture(gl!.TEXTURE_2D, tex[i]);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        texW,
        texH,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        null,
      );
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo[i]);
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        tex[i],
        0,
      );
      gl!.clearColor(0, 0, 0, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }
  allocTargets(texW, texH);

  const aGeomPos = gl.getAttribLocation(geom, "aPos");
  const aGeomCol = gl.getAttribLocation(geom, "aColor");
  const uCenter = gl.getUniformLocation(geom, "uCenter");
  const uScale = gl.getUniformLocation(geom, "uScale");
  const uPoint = gl.getUniformLocation(geom, "uPointSize");
  const uIsPoint = gl.getUniformLocation(geom, "uIsPoint");

  const aFadePos = gl.getAttribLocation(fade, "aPos");
  const uFadeTex = gl.getUniformLocation(fade, "uTex");
  const uFadeAmt = gl.getUniformLocation(fade, "uFade");

  const aPresPos = gl.getAttribLocation(present, "aPos");
  const uPresTex = gl.getUniformLocation(present, "uTex");

  function drawGeom(
    verts: Float32Array,
    mode: number,
    isPoint: boolean,
    pointSize: number,
    center: [number, number],
    scale: [number, number],
  ) {
    const g = gl!;
    g.useProgram(geom);
    g.bindBuffer(g.ARRAY_BUFFER, dyn);
    g.bufferData(g.ARRAY_BUFFER, verts, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(aGeomPos);
    g.vertexAttribPointer(aGeomPos, 2, g.FLOAT, false, 24, 0);
    g.enableVertexAttribArray(aGeomCol);
    g.vertexAttribPointer(aGeomCol, 4, g.FLOAT, false, 24, 8);
    g.uniform2f(uCenter, center[0], center[1]);
    g.uniform2f(uScale, scale[0], scale[1]);
    g.uniform1f(uPoint, pointSize);
    g.uniform1i(uIsPoint, isPoint ? 1 : 0);
    g.drawArrays(mode, 0, verts.length / 6);
  }

  function fullscreen(prog: WebGLProgram, attrib: number) {
    const g = gl!;
    g.useProgram(prog);
    g.bindBuffer(g.ARRAY_BUFFER, quad);
    g.enableVertexAttribArray(attrib);
    g.vertexAttribPointer(attrib, 2, g.FLOAT, false, 0, 0);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }

  function seg(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    col: [number, number, number],
    a: number,
  ): number[] {
    return [ax, ay, col[0], col[1], col[2], a, bx, by, col[0], col[1], col[2], a];
  }

  const renderer: Renderer = {
    kind: "webgl2",
    resize(w, h, dpr) {
      const pw = Math.floor(w * dpr);
      const ph = Math.floor(h * dpr);
      canvas.width = pw;
      canvas.height = ph;
      allocTargets(pw, ph);
    },
    frame(input) {
      const g = gl!;
      const dst = src ^ 1;
      const fadeAmt = input.reduced ? 0.9 : 0.965;
      const trailA = input.reduced ? 0.25 : 0.6;
      const ptSize = input.reduced ? 4 : 7;

      // 1) fade prev -> dst (overwrite, no blend)
      g.bindFramebuffer(g.FRAMEBUFFER, fbo[dst]);
      g.viewport(0, 0, texW, texH);
      g.disable(g.BLEND);
      g.useProgram(fade);
      g.uniform1f(uFadeAmt, fadeAmt);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, tex[src]);
      g.uniform1i(uFadeTex, 0);
      fullscreen(fade, aFadePos);

      // 2) additive-accumulate the new tip segments + glow points
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE);
      const trail = [
        ...seg(
          input.twinA[0],
          input.twinA[1],
          input.twinB[0],
          input.twinB[1],
          GLOW_TWIN,
          trailA * 0.5,
        ),
        ...seg(
          input.mainA[0],
          input.mainA[1],
          input.mainB[0],
          input.mainB[1],
          GLOW_MAIN,
          trailA,
        ),
      ];
      drawGeom(new Float32Array(trail), g.LINES, false, 1, input.center, input.scale);

      const dots = [
        input.twinB[0], input.twinB[1], GLOW_TWIN[0], GLOW_TWIN[1], GLOW_TWIN[2], trailA * 0.5,
        input.mainB[0], input.mainB[1], GLOW_MAIN[0], GLOW_MAIN[1], GLOW_MAIN[2], trailA,
      ];
      drawGeom(new Float32Array(dots), g.POINTS, true, ptSize, input.center, input.scale);

      // 3) present dst -> screen
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, canvas.width, canvas.height);
      g.disable(g.BLEND);
      g.useProgram(present);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, tex[dst]);
      g.uniform1i(uPresTex, 0);
      fullscreen(present, aPresPos);

      // 4) live rods + bobs on top (additive glow)
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE);
      const tj = input.twinJoints;
      const mj = input.mainJoints;
      const rodTwin = [
        ...seg(0, 0.36, tj.x1, tj.y1, GLOW_TWIN, 0.18),
        ...seg(tj.x1, tj.y1, tj.x2, tj.y2, GLOW_TWIN, 0.18),
      ];
      drawGeom(new Float32Array(rodTwin), g.LINES, false, 1, input.center, input.scale);
      const rodMain = [
        ...seg(0, 0.36, mj.x1, mj.y1, GLOW_MAIN, 0.5),
        ...seg(mj.x1, mj.y1, mj.x2, mj.y2, GLOW_MAIN, 0.5),
      ];
      drawGeom(new Float32Array(rodMain), g.LINES, false, 1, input.center, input.scale);
      const bobs = [
        tj.x1, tj.y1, GLOW_TWIN[0], GLOW_TWIN[1], GLOW_TWIN[2], 0.3,
        tj.x2, tj.y2, GLOW_TWIN[0], GLOW_TWIN[1], GLOW_TWIN[2], 0.4,
        mj.x1, mj.y1, GLOW_MAIN[0], GLOW_MAIN[1], GLOW_MAIN[2], 0.7,
        mj.x2, mj.y2, ACCENT[0], ACCENT[1], ACCENT[2], 0.95,
      ];
      drawGeom(new Float32Array(bobs), g.POINTS, true, input.reduced ? 8 : 12, input.center, input.scale);

      g.disable(g.BLEND);
      src = dst;
    },
    dispose() {
      const g = gl!;
      tex.forEach((t) => g.deleteTexture(t));
      fbo.forEach((f) => g.deleteFramebuffer(f));
      g.deleteBuffer(quad);
      g.deleteBuffer(dyn);
      g.deleteProgram(geom);
      g.deleteProgram(fade);
      g.deleteProgram(present);
      const ext = g.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
  return renderer;
}

/** Canvas2D fallback trail — decaying additive strokes. */
export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let W = 2;
  let H = 2;

  function toPx(x: number, y: number, c: [number, number], s: [number, number]) {
    const cx = (x - c[0]) * s[0];
    const cy = (y - c[1]) * s[1];
    return [(cx * 0.5 + 0.5) * W, (0.5 - cy * 0.5) * H] as const;
  }

  return {
    kind: "canvas2d",
    resize(w, h, dpr) {
      W = canvas.width = Math.floor(w * dpr);
      H = canvas.height = Math.floor(h * dpr);
      ctx.fillStyle = "#050308";
      ctx.fillRect(0, 0, W, H);
    },
    frame(input) {
      const fade = input.reduced ? 0.14 : 0.06;
      ctx.fillStyle = `rgba(5,3,8,${fade})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const a = input.reduced ? 0.3 : 0.7;

      const [tax, tay] = toPx(input.twinA[0], input.twinA[1], input.center, input.scale);
      const [tbx, tby] = toPx(input.twinB[0], input.twinB[1], input.center, input.scale);
      ctx.strokeStyle = `rgba(110,140,240,${a * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tax, tay);
      ctx.lineTo(tbx, tby);
      ctx.stroke();

      const [max, may] = toPx(input.mainA[0], input.mainA[1], input.center, input.scale);
      const [mbx, mby] = toPx(input.mainB[0], input.mainB[1], input.center, input.scale);
      ctx.strokeStyle = `rgba(160,100,255,${a})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(max, may);
      ctx.lineTo(mbx, mby);
      ctx.stroke();

      // live rods
      ctx.globalCompositeOperation = "source-over";
      const mj = input.mainJoints;
      const [p0x, p0y] = toPx(0, 0.36, input.center, input.scale);
      const [j1x, j1y] = toPx(mj.x1, mj.y1, input.center, input.scale);
      const [j2x, j2y] = toPx(mj.x2, mj.y2, input.center, input.scale);
      ctx.strokeStyle = "rgba(180,150,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.lineTo(j1x, j1y);
      ctx.lineTo(j2x, j2y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,140,215,0.95)";
      ctx.beginPath();
      ctx.arc(j2x, j2y, 5, 0, Math.PI * 2);
      ctx.fill();
    },
    dispose() {
      /* nothing persistent to release */
    },
  };
}
