/**
 * gl.ts — Raw WebGL2 sky renderer for the Happy/Sad Tree, with a Canvas2D fallback.
 *
 * Technique:
 *   - Full-screen triangle (gl_VertexID trick, no vertex buffers).
 *   - Fragment shader paints a soft vertical gradient sky plus a few slowly
 *     drifting bands of light (sine-warped, fbm-ish) for a living storybook feel.
 *   - A single uniform `u_mode` (0 = major, 1 = minor) crossfades the whole
 *     palette between warm gold and cool tender indigo. The page eases this
 *     value over ~600ms so the sky breathes between worlds.
 *
 * No external imports — copy-self-contained per dream-lab rules.
 */

export interface SkyRenderer {
  /** Draw one frame. mode in [0,1]: 0 = major/gold, 1 = minor/indigo. */
  draw(timeSec: number, mode: number): void;
  /** Resize backing store to CSS size * dpr. */
  resize(): void;
  /** Release all GPU / 2D resources. */
  dispose(): void;
  /** true if the hardware-accelerated WebGL2 path is active. */
  readonly isWebGL2: boolean;
}

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p;
  if(gl_VertexID==0) p=vec2(-1.0,-1.0);
  else if(gl_VertexID==1) p=vec2(3.0,-1.0);
  else p=vec2(-1.0,3.0);
  vUv = p*0.5+0.5;
  gl_Position = vec4(p,0.0,1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2  u_res;
uniform float u_time;
uniform float u_mode; // 0 major (gold) .. 1 minor (indigo)

// cheap value noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.0,0.0));
  float c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

void main(){
  vec2 uv = vUv;
  float t = u_time;

  // ---- Major (warm storybook gold) palette ----
  vec3 majTop = vec3(0.99, 0.86, 0.55); // sun gold
  vec3 majBot = vec3(0.99, 0.66, 0.42); // peach horizon
  vec3 majGlow= vec3(1.00, 0.95, 0.74);

  // ---- Minor (cool tender indigo) palette ----
  vec3 minTop = vec3(0.30, 0.32, 0.66); // indigo
  vec3 minBot = vec3(0.46, 0.40, 0.72); // soft violet horizon
  vec3 minGlow= vec3(0.72, 0.78, 0.98);

  vec3 top  = mix(majTop,  minTop,  u_mode);
  vec3 bot  = mix(majBot,  minBot,  u_mode);
  vec3 glow = mix(majGlow, minGlow, u_mode);

  // vertical gradient (top brighter)
  float g = smoothstep(0.0, 1.0, uv.y);
  vec3 col = mix(bot, top, g);

  // soft drifting light bands
  float bands = 0.0;
  for(float i=0.0;i<3.0;i+=1.0){
    float speed = 0.03 + i*0.018;
    float y = uv.y*2.0 + i*1.7;
    float x = uv.x*1.4;
    float n = vnoise(vec2(x*1.5 + t*speed, y + t*speed*0.5));
    bands += smoothstep(0.55,0.95,n) * (0.06 + 0.03*i);
  }
  col += glow * bands;

  // a gentle warm sun / cool moon orb glow up-left
  vec2 orb = vec2(0.26, 0.80);
  float d = distance(uv*vec2(u_res.x/u_res.y,1.0), orb*vec2(u_res.x/u_res.y,1.0));
  float halo = smoothstep(0.42, 0.0, d);
  col += glow * halo * 0.35;

  // subtle vignette to frame the play world
  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5)));
  col *= mix(0.82, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

/**
 * Try to build a WebGL2 sky. Falls back to a Canvas2D gradient sky if WebGL2 is
 * unavailable or shader compilation fails — same visual intent, lower fidelity.
 */
export function makeSky(canvas: HTMLCanvasElement, dpr: number): SkyRenderer {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });

  if (gl) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram();
    if (vs && fs && prog) {
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const vao = gl.createVertexArray();
        const uRes = gl.getUniformLocation(prog, "u_res");
        const uTime = gl.getUniformLocation(prog, "u_time");
        const uMode = gl.getUniformLocation(prog, "u_mode");

        const resize = () => {
          canvas.width = Math.max(1, Math.floor(canvas.offsetWidth * dpr));
          canvas.height = Math.max(1, Math.floor(canvas.offsetHeight * dpr));
        };
        resize();

        return {
          isWebGL2: true,
          resize,
          draw(timeSec: number, mode: number) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(prog);
            gl.bindVertexArray(vao);
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform1f(uTime, timeSec);
            gl.uniform1f(uMode, mode);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          },
          dispose() {
            gl.deleteProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            if (vao) gl.deleteVertexArray(vao);
          },
        };
      }
    }
  }

  // ---- Canvas2D fallback ----
  const ctx = canvas.getContext("2d");
  const resize2d = () => {
    canvas.width = Math.max(1, Math.floor(canvas.offsetWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.offsetHeight * dpr));
  };
  resize2d();

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const rgb = (r: number, g: number, b: number) =>
    `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

  return {
    isWebGL2: false,
    resize: resize2d,
    draw(timeSec: number, mode: number) {
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      // gold -> indigo crossfade
      const topR = lerp(252, 77, mode), topG = lerp(219, 82, mode), topB = lerp(140, 168, mode);
      const botR = lerp(252, 117, mode), botG = lerp(168, 102, mode), botB = lerp(107, 184, mode);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, rgb(botR, botG, botB));
      grad.addColorStop(1, rgb(topR, topG, topB));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // drifting soft light orb (sun/moon)
      const ox = w * 0.26;
      const oy = h * (0.2 + 0.02 * Math.sin(timeSec * 0.3));
      const glowR = lerp(255, 184, mode), glowG = lerp(243, 199, mode), glowB = lerp(189, 250, mode);
      const halo = ctx.createRadialGradient(ox, oy, 0, ox, oy, h * 0.5);
      halo.addColorStop(0, `rgba(${Math.round(glowR)},${Math.round(glowG)},${Math.round(glowB)},0.45)`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    },
    dispose() {
      /* nothing to release for 2D */
    },
  };
}
