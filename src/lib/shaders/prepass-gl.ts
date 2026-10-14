// ─────────────────────────────────────────────────────────────────────────────
// prepass-gl.ts — the GL side of SHADER_PREPASS (shaders/index.ts): compiles a
// shader's prepass STAGES, sizes and allocates their targets, draws them each
// frame before the shader and binds their textures for it. Shared by the
// visualizer (components/audio/visualizer.tsx) and the perf rigs
// (scripts/perf/*), so a measurement runs exactly what the kiosk runs.
//
// Stage k renders into its own texture; it may sample every earlier stage.
// Samplers / sizes: stage 0 = u_pre / u_preres, stage k = u_pre<k> /
// u_preres<k>. Every program also gets the usual u_time, u_resolution (the
// MAIN canvas — or the stage's own target for a `whole` stage) and the four
// audio uniforms.
// ─────────────────────────────────────────────────────────────────────────────

/** One prepass stage. Size rules (first match): `size` — a fixed table;
 *  `columns` — a per-ROW table (columns x canvas rows); `tiles` — a coarse
 *  screen-tile table (ceil(W/px) x ceil(H/px)·rows); else a scaled field
 *  (round(W·scale) x round(H·scale)·blocks + extraRows). */
export interface PrepassStage {
  frag: string;
  scale: number;
  size?: readonly [number, number];
  /** a per-ROW table: `columns` texels for every canvas row */
  columns?: number;
  /** a screen-TILE table: one column per px-wide tile, `rows` rows per tile row */
  tiles?: { px: number; rows: number };
  /** stacked field blocks (each round(H*scale) rows) */
  blocks?: number;
  /** table rows above the field blocks */
  extraRows?: number;
  nearest?: boolean;
  /** a 32-bit FLOAT target (needs OES_texture_float + WEBGL_color_buffer_float) */
  float?: boolean;
  /** the SHADER itself renders at `scale` (frag = its FRAG); the layer upsamples */
  whole?: boolean;
}

/** A shader's prepass: its first stage (+ optional later stages) and, for a
 *  float prepass, the original single-pass shader to run without float targets. */
export interface ShaderPrepass extends PrepassStage {
  fallback?: string;
  then?: readonly PrepassStage[];
}

export function prepassStages(p: ShaderPrepass): PrepassStage[] {
  return [p, ...(p.then ?? [])];
}

export function stageSize(st: PrepassStage, cw: number, ch: number): [number, number] {
  if (st.size) return [st.size[0], st.size[1]];
  if (st.columns) return [st.columns, ch];
  if (st.tiles) return [Math.ceil(cw / st.tiles.px), Math.ceil(ch / st.tiles.px) * st.tiles.rows];
  return [Math.max(1, Math.round(cw * st.scale)), Math.max(1, Math.round(ch * st.scale)) * (st.blocks ?? 1) + (st.extraRows ?? 0)];
}

/** Float render targets on this context (getExtension also enables them). */
export function floatTargetsOk(gl: WebGLRenderingContext, needLinear: boolean): boolean {
  return !!gl.getExtension("OES_texture_float") && !!gl.getExtension("WEBGL_color_buffer_float") && (!needLinear || !!gl.getExtension("OES_texture_float_linear"));
}
/** Can this context run every stage of the prepass? */
export function prepassSupported(gl: WebGLRenderingContext, p: ShaderPrepass): boolean {
  const st = prepassStages(p);
  if (!st.some((s) => s.float)) return true;
  return floatTargetsOk(gl, st.some((s) => s.float && !s.nearest));
}

const samplerName = (k: number) => (k === 0 ? "u_pre" : `u_pre${k}`);
const sizeName = (k: number) => (k === 0 ? "u_preres" : `u_preres${k}`);
const COMMON = ["u_time", "u_resolution", "u_bass", "u_mid", "u_treble", "u_amplitude"] as const;

export interface PrepassChain {
  /** true while any stage program is still compiling (KHR_parallel_shader_compile) */
  compiling(ext: { COMPLETION_STATUS_KHR: number } | null): boolean;
  /** the first stage that failed to link, with its log — or null */
  linkError(): string | null;
  /** cache uniform locations (after link) for the stages and the main program */
  resolve(main: WebGLProgram): void;
  /** allocate / resize the targets for a canvas of cw x ch */
  ensure(cw: number, ch: number): void;
  /** draw every stage; leaves the default framebuffer bound, the viewport at
   *  the canvas and stage k's texture on texture unit k */
  draw(cw: number, ch: number, time: number, audio: readonly [number, number, number, number]): void;
  /** with the main program in use: its samplers + stage sizes */
  bindMain(): void;
  dispose(): void;
}

export function createPrepassChain(gl: WebGLRenderingContext, vs: WebGLShader, p: ShaderPrepass): PrepassChain {
  const stages = prepassStages(p);
  const progs = stages.map((st) => {
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, st.frag);
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "a_position");
    gl.linkProgram(prog);
    return { fs, prog };
  });
  const tex: (WebGLTexture | null)[] = stages.map(() => null);
  const fbo: (WebGLFramebuffer | null)[] = stages.map(() => null);
  const sizes: [number, number][] = stages.map(() => [0, 0]);
  type L = WebGLUniformLocation | null;
  let stageU: Record<string, L>[] = [];
  let mainU: { samplers: L[]; sizes: L[] } = { samplers: [], sizes: [] };

  const allocate = (k: number, w: number, h: number) => {
    const st = stages[k];
    if (!tex[k]) tex[k] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex[k]);
    const filter = st.nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, st.float ? gl.FLOAT : gl.UNSIGNED_BYTE, null);
    if (!fbo[k]) fbo[k] = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[k]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[k], 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    sizes[k] = [w, h];
  };

  const chain: PrepassChain = {
    compiling(ext) {
      return !!ext && progs.some((x) => !gl.getProgramParameter(x.prog, ext.COMPLETION_STATUS_KHR));
    },
    linkError() {
      for (let k = 0; k < progs.length; k++) {
        if (!gl.getProgramParameter(progs[k].prog, gl.LINK_STATUS)) return `stage ${k}: ${gl.getShaderInfoLog(progs[k].fs) || gl.getProgramInfoLog(progs[k].prog)}`;
      }
      return null;
    },
    resolve(main) {
      stageU = progs.map(({ prog }, k) => {
        const u: Record<string, L> = {};
        for (const n of COMMON) u[n] = gl.getUniformLocation(prog, n);
        for (let j = 0; j <= k; j++) {
          u[sizeName(j)] = gl.getUniformLocation(prog, sizeName(j));
          if (j < k) u[samplerName(j)] = gl.getUniformLocation(prog, samplerName(j));
        }
        return u;
      });
      mainU = {
        samplers: stages.map((_, j) => gl.getUniformLocation(main, samplerName(j))),
        sizes: stages.map((_, j) => gl.getUniformLocation(main, sizeName(j))),
      };
    },
    ensure(cw, ch) {
      for (let k = 0; k < stages.length; k++) {
        const [w, h] = stageSize(stages[k], cw, ch);
        if (!tex[k] || sizes[k][0] !== w || sizes[k][1] !== h) allocate(k, w, h);
      }
    },
    draw(cw, ch, time, audio) {
      chain.ensure(cw, ch);
      for (let k = 0; k < stages.length; k++) {
        const [w, h] = sizes[k];
        const u = stageU[k];
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[k]);
        gl.viewport(0, 0, w, h);
        gl.useProgram(progs[k].prog);
        gl.uniform1f(u.u_time, time);
        if (stages[k].whole) gl.uniform2f(u.u_resolution, w, h);
        else gl.uniform2f(u.u_resolution, cw, ch);
        gl.uniform1f(u.u_bass, audio[0]);
        gl.uniform1f(u.u_mid, audio[1]);
        gl.uniform1f(u.u_treble, audio[2]);
        gl.uniform1f(u.u_amplitude, audio[3]);
        for (let j = 0; j <= k; j++) {
          const sl = u[sizeName(j)];
          if (sl) gl.uniform2f(sl, sizes[j][0], sizes[j][1]);
          if (j < k) {
            gl.activeTexture(gl.TEXTURE0 + j);
            gl.bindTexture(gl.TEXTURE_2D, tex[j]);
            const sa = u[samplerName(j)];
            if (sa) gl.uniform1i(sa, j);
          }
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      for (let j = 0; j < stages.length; j++) {
        gl.activeTexture(gl.TEXTURE0 + j);
        gl.bindTexture(gl.TEXTURE_2D, tex[j]);
      }
      gl.activeTexture(gl.TEXTURE0);
    },
    bindMain() {
      for (let j = 0; j < stages.length; j++) {
        if (mainU.samplers[j]) gl.uniform1i(mainU.samplers[j], j);
        if (mainU.sizes[j]) gl.uniform2f(mainU.sizes[j], sizes[j][0], sizes[j][1]);
      }
    },
    dispose() {
      for (const x of progs) { gl.deleteProgram(x.prog); gl.deleteShader(x.fs); }
      for (const t of tex) if (t) gl.deleteTexture(t);
      for (const f of fbo) if (f) gl.deleteFramebuffer(f);
    },
  };
  return chain;
}
