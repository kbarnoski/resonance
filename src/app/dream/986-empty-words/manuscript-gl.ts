// ─────────────────────────────────────────────────────────────────────────────
// manuscript-gl.ts — WebGL2 engraved-manuscript renderer.
//
// Renders the text as warm off-white glyphs on deep charcoal "parchment". Glyphs
// are drawn into an offscreen 2D canvas atlas (so we get real letterforms) and
// uploaded as a texture; the GL program then composites that texture with a
// procedural parchment background, a subtle paper grain, ruled staff lines, and
// an animated highlight glow around the currently-singing token.
//
// If WebGL2 is unavailable the caller falls back to Canvas2D (see page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import type { Token } from "./composer";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_text;   // glyph atlas (alpha in .a, white glyphs)
uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;     // vertical scroll offset in uv units
uniform vec2 u_glow;        // glow centre in uv (canvas) space
uniform float u_glowOn;     // 0..1 intensity of the highlight
uniform float u_glowW;      // glow half-width in uv

// cheap hash noise for paper grain
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.));
  float c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

void main() {
  vec2 uv = v_uv;

  // ── parchment background ──────────────────────────────────────────────
  // deep charcoal with a faint warm vignette toward the centre
  vec3 dark = vec3(0.086, 0.082, 0.078);   // #16150F-ish charcoal
  vec3 warm = vec3(0.145, 0.130, 0.110);   // slightly warmer
  float vig = smoothstep(1.15, 0.2, distance(uv, vec2(0.5)));
  vec3 bg = mix(dark, warm, vig * 0.7);

  // ruled "staff" lines that scroll with the text, like manuscript paper
  float lineUv = fract((uv.y + u_scroll) * 26.0);
  float rule = smoothstep(0.0, 0.04, lineUv) * smoothstep(0.10, 0.06, lineUv);
  bg += vec3(0.06, 0.055, 0.05) * rule * 0.5;

  // paper grain
  float grain = noise(uv * vec2(u_res.x, u_res.y) * 0.5 + u_time * 0.01);
  bg += (grain - 0.5) * 0.025;

  // ── glyph layer ───────────────────────────────────────────────────────
  // sample the scrolled atlas
  vec2 tuv = vec2(uv.x, uv.y + u_scroll);
  float ink = texture(u_text, tuv).a;

  // ink colour: warm off-white parchment ink
  vec3 inkCol = vec3(0.93, 0.90, 0.82);

  // ── highlight glow on the currently-singing token ────────────────────
  // distance from the (already scroll-adjusted) glow centre
  float gd = distance(vec2(uv.x, uv.y), u_glow);
  float halo = smoothstep(u_glowW, 0.0, gd) * u_glowOn;
  // a warm amber glow under the ink + a brighter ink where lit
  vec3 glowCol = mix(vec3(0.85, 0.62, 0.30), vec3(1.0, 0.93, 0.72), 0.5);
  bg += glowCol * halo * 0.35;
  inkCol = mix(inkCol, vec3(1.0, 0.97, 0.86), halo);

  // slight glyph emboss: offset sample for a faint shadow
  float shadow = texture(u_text, tuv + vec2(0.0015, 0.0022)).a;
  bg = mix(bg, bg * 0.55, clamp(shadow - ink, 0.0, 1.0) * 0.5);

  vec3 col = mix(bg, inkCol, clamp(ink, 0.0, 1.0));

  // subtle film grain over everything
  col += (hash(uv * u_res + u_time) - 0.5) * 0.012;

  outColor = vec4(col, 1.0);
}`;

export type GlyphBox = {
  tokenIndex: number;
  // normalized centre in atlas/canvas uv (0..1), atlas is full document height
  cx: number;
  cy: number; // absolute document y (0..docHeight in uv before scroll)
  w: number; // half width in uv
};

export type LayoutResult = {
  boxes: GlyphBox[];
  docHeightUv: number; // total laid-out height in uv units (>=1 means scrolls)
};

export class ManuscriptGL {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private tex: WebGLTexture;
  private atlas: HTMLCanvasElement;
  private actx: CanvasRenderingContext2D;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private layout: LayoutResult = { boxes: [], docHeightUv: 1 };
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;

    this.prog = this.makeProgram(VERT, FRAG);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    for (const name of ["u_text", "u_res", "u_time", "u_scroll", "u_glow", "u_glowOn", "u_glowW"]) {
      this.uni[name] = gl.getUniformLocation(this.prog, name);
    }

    // offscreen atlas where we actually draw the letters
    this.atlas = document.createElement("canvas");
    this.actx = this.atlas.getContext("2d")!;

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private makeProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("Shader compile error: " + log);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  /** Resize the GL drawing buffer to match the CSS size. */
  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  /**
   * Lay out the tokens into the offscreen atlas and upload as a texture.
   * Returns the layout so the caller knows where each token sits (for scroll +
   * glow). The atlas height grows with the text (multi-page documents scroll).
   */
  setText(tokens: Token[], cssW: number, cssH: number): LayoutResult {
    const dpr = this.dpr;
    const W = Math.max(1, Math.floor(cssW * dpr));
    const viewH = Math.max(1, Math.floor(cssH * dpr));

    const ctx = this.actx;
    const fontPx = Math.max(20, Math.round(W / 30));
    const lineH = fontPx * 1.9;
    const marginX = W * 0.08;
    const maxX = W - marginX;

    // first pass: measure to compute total height
    ctx.font = `${fontPx}px Georgia, "Times New Roman", serif`;
    let penX = marginX;
    let penY = lineH;
    const placed: { tok: Token; tokenIndex: number; x: number; y: number; w: number }[] = [];

    const spaceW = ctx.measureText(" ").width;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.kind === "newline") {
        penX = marginX;
        penY += lineH;
        continue;
      }
      if (tok.kind === "space") {
        penX += spaceW * tok.raw.length;
        continue;
      }
      const text = tok.raw;
      const w = ctx.measureText(text).width;
      if (tok.kind === "word" && penX + w > maxX && penX > marginX) {
        penX = marginX;
        penY += lineH;
      }
      placed.push({ tok, tokenIndex: i, x: penX, y: penY, w });
      penX += w + (tok.kind === "punct" ? 0 : 0);
    }

    const docH = Math.max(viewH, penY + lineH);
    this.atlas.width = W;
    this.atlas.height = docH;

    // second pass: actually draw
    const c = this.actx;
    c.clearRect(0, 0, W, docH);
    c.font = `${fontPx}px Georgia, "Times New Roman", serif`;
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
    c.fillStyle = "#ffffff";

    const boxes: GlyphBox[] = [];
    for (const p of placed) {
      // vary ink weight a touch by token kind for an engraved feel
      c.globalAlpha = p.tok.kind === "punct" ? 0.78 : p.tok.allCaps ? 1.0 : 0.94;
      c.fillText(p.tok.raw, p.x, p.y);
      boxes.push({
        tokenIndex: p.tokenIndex,
        cx: (p.x + p.w / 2) / W,
        cy: (p.y - fontPx * 0.32) / docH,
        w: Math.max(p.w / 2 / W, 0.01),
      });
    }
    c.globalAlpha = 1;

    // upload atlas
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);

    this.layout = { boxes, docHeightUv: docH / viewH };
    return this.layout;
  }

  getLayout(): LayoutResult {
    return this.layout;
  }

  /**
   * Draw a frame.
   * @param time seconds
   * @param scrollUv vertical scroll in viewport-height units (0 = top)
   * @param glowBox the box of the currently-singing token (or null)
   * @param glowIntensity 0..1
   */
  draw(time: number, scrollUv: number, glowBox: GlyphBox | null, glowIntensity: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uni.u_text, 0);
    gl.uniform2f(this.uni.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uni.u_time, time);

    // scroll in uv: atlas is docHeightUv tall in viewport units; we move the
    // sampling window down. Texture coords are in [0, docHeightUv].
    const docH = this.layout.docHeightUv;
    // The atlas was sized to docHeightUv * viewport; but we sample with v in
    // [0,1] mapping to the *atlas*. Convert scroll (in viewport units) to uv.
    const scrollTex = scrollUv / docH;
    gl.uniform1f(this.uni.u_scroll, scrollTex);

    if (glowBox) {
      const gy = glowBox.cy - scrollTex; // glow box cy is in atlas-uv; shift by scroll
      gl.uniform2f(this.uni.u_glow, glowBox.cx, gy);
      gl.uniform1f(this.uni.u_glowOn, glowIntensity);
      gl.uniform1f(this.uni.u_glowW, Math.max(glowBox.w * 2.4, 0.04));
    } else {
      gl.uniform1f(this.uni.u_glowOn, 0);
      gl.uniform2f(this.uni.u_glow, -1, -1);
      gl.uniform1f(this.uni.u_glowW, 0.05);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.deleteTexture(this.tex);
      gl.deleteProgram(this.prog);
      gl.deleteVertexArray(this.vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* noop */
    }
  }
}
