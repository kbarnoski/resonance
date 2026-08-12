// ─────────────────────────────────────────────────────────────────────────────
// webgl.ts — the WebGL2 substrate for Tideglass.
//
//   A shallow iridescent tide-pool rendered by a single #version 300 es
//   fragment shader over a fullscreen quad. Nothing here depends on
//   float render targets, so it survives hostile GPUs: the WAKE is an
//   ANALYTIC field — a sum of expanding, decaying ring-waves, one per
//   "stamp" the droplet drops as it moves. Because the wake is a pure
//   function of the stamp list (and the stamp list is a pure function of the
//   recorded trajectory), replay is deterministic to the pixel.
//
//   The shader:
//     1. sums the wake height h(p) over all live stamps (each an expanding
//        cosine ring with a gaussian envelope + exponential decay),
//     2. reconstructs a surface normal by finite-differencing h,
//     3. shades it as NACREOUS oil-on-water — a deep aqua-teal pool floor with
//        thin-film iridescence whose hue rides the surface slope + a Fresnel
//        term, so the wake glints mother-of-pearl green/teal/violet,
//     4. adds each active droplet as a bright caustic bloom on top.
//
//   Palette is deliberately cool/nacreous (NOT warm, NOT an empty void).
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_STAMPS = 64;
export const MAX_DROPS = 8;

/** One expanding ring-wave shed by a moving droplet. */
export interface WakeUniforms {
  /** flat [x, y, age(s), strength] × MAX_STAMPS. */
  stamps: Float32Array;
  stampCount: number;
  /** flat [x, y, radius, brightness] × MAX_DROPS. */
  drops: Float32Array;
  dropCount: number;
  time: number;
}

export interface TideBackend {
  ok: boolean;
  render(u: WakeUniforms): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uAspect;
uniform int uStampCount;
uniform int uDropCount;
uniform vec4 uStamps[${MAX_STAMPS}];
uniform vec4 uDrops[${MAX_DROPS}];

// wake tuning
const float WAVE_SPEED = 0.42;   // ring radius growth per second (uv units)
const float RING_WIDTH = 0.045;  // gaussian thickness of a ring
const float DECAY      = 0.85;   // temporal fade of a stamp
const float FREQ       = 62.0;   // spatial ripple frequency inside the envelope

// aspect-corrected distance from p to a stamp centre
float adist(vec2 p, vec2 c){
  vec2 d = vec2((p.x-c.x)*uAspect, p.y-c.y);
  return length(d);
}

// analytic wake height at point p (sum of expanding ring-waves)
float wakeAt(vec2 p){
  float h = 0.0;
  for(int i=0;i<${MAX_STAMPS};i++){
    if(i>=uStampCount) break;
    vec4 s = uStamps[i];
    float age = s.z;
    float dist = adist(p, s.xy);
    float radius = age*WAVE_SPEED;
    float env = exp(-pow((dist-radius)/RING_WIDTH, 2.0));
    float decay = exp(-age*DECAY);
    h += s.w * decay * env * cos((dist-radius)*FREQ);
  }
  return h;
}

// nacreous thin-film palette — a cosine ramp kept in the aqua→teal→violet
// mother-of-pearl range (never warm). t is a phase, roughly 0..1+.
vec3 nacre(float t){
  vec3 a = vec3(0.28, 0.52, 0.55);
  vec3 b = vec3(0.30, 0.38, 0.42);
  vec3 c = vec3(1.00, 0.92, 0.85);
  vec3 d = vec3(0.15, 0.42, 0.68); // phase offsets tilt toward teal/violet
  return a + b*cos(6.2831853*(c*t + d));
}

void main(){
  vec2 p = vUv;

  // sample the wake + two neighbours for a normal
  float e = 1.6/uRes.y;
  float h  = wakeAt(p);
  float hx = wakeAt(p + vec2(e,0.0));
  float hy = wakeAt(p + vec2(0.0,e));
  vec3 normal = normalize(vec3(-(hx-h), -(hy-h), e*3.2));

  // ── shallow-pool floor: deep aqua-teal with a faint slow caustic shimmer ──
  float caustic =
      0.5 + 0.5*sin(p.x*22.0 + uTime*0.35)
                *sin(p.y*19.0 - uTime*0.28);
  caustic = pow(caustic, 3.0);
  vec3 floorDeep = vec3(0.015, 0.055, 0.075);
  vec3 floorLit  = vec3(0.03, 0.13, 0.155);
  vec3 col = mix(floorDeep, floorLit, 0.35 + 0.4*caustic);

  // subtle vignette so the pool sits in its glass
  float vig = smoothstep(1.15, 0.25, length((vUv-0.5)*vec2(uAspect,1.0)));
  col *= 0.55 + 0.45*vig;

  // ── thin-film iridescence on the wake ────────────────────────────────────
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.4);
  float slope = length(vec2(hx-h, hy-h)) * 120.0;
  float phase = h*7.5 + fres*1.4 + slope*0.6 + 0.15;
  vec3 irid = nacre(phase);
  float filmAmt = clamp(abs(h)*3.4 + slope*0.5, 0.0, 1.0);
  col = mix(col, col + irid*0.9, filmAmt*(0.35 + 0.65*fres));

  // crisp specular glint off the ripple crests
  vec3 lightDir = normalize(vec3(0.35, 0.55, 0.8));
  float spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 42.0);
  col += vec3(0.55, 0.85, 0.9) * spec * clamp(filmAmt*1.4, 0.0, 1.0);

  // ── droplets: bright caustic blooms riding the surface ───────────────────
  for(int i=0;i<${MAX_DROPS};i++){
    if(i>=uDropCount) break;
    vec4 dp = uDrops[i];
    float dist = adist(p, dp.xy);
    float r = max(dp.z, 0.0025);
    float core = exp(-pow(dist/r, 2.0));
    float halo = exp(-dist/(r*3.2)) * 0.5;
    vec3 dropCol = mix(vec3(0.45, 0.95, 0.92), vec3(0.85, 0.97, 1.0), core);
    col += dropCol * (core*1.15 + halo) * dp.w;
  }

  // gentle filmic-ish roll-off to keep highlights from clipping harshly
  col = col / (1.0 + col*0.55);
  col = pow(max(col, 0.0), vec3(0.85));

  outColor = vec4(col, 1.0);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("tideglass shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the WebGL2 backend, or return { ok:false } if unavailable. */
export function makeTideBackend(canvas: HTMLCanvasElement): TideBackend {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });

  const dead: TideBackend = {
    ok: false,
    render() {},
    resize() {},
    destroy() {},
  };
  if (!gl) return dead;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return dead;

  const prog = gl.createProgram();
  if (!prog) return dead;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("tideglass link:", gl.getProgramInfoLog(prog));
    return dead;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // fullscreen triangle-pair
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uAspect = gl.getUniformLocation(prog, "uAspect");
  const uStampCount = gl.getUniformLocation(prog, "uStampCount");
  const uDropCount = gl.getUniformLocation(prog, "uDropCount");
  const uStamps = gl.getUniformLocation(prog, "uStamps");
  const uDrops = gl.getUniformLocation(prog, "uDrops");

  gl.useProgram(prog);

  let W = canvas.width;
  let H = canvas.height;

  return {
    ok: true,
    resize(w: number, h: number) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
    },
    render(u: WakeUniforms) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, u.time);
      gl.uniform1f(uAspect, W / H);
      gl.uniform1i(uStampCount, Math.min(u.stampCount, MAX_STAMPS));
      gl.uniform1i(uDropCount, Math.min(u.dropCount, MAX_DROPS));
      gl.uniform4fv(uStamps, u.stamps);
      gl.uniform4fv(uDrops, u.drops);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      try {
        gl.deleteProgram(prog);
        gl.deleteBuffer(buf);
        gl.deleteVertexArray(vao);
      } catch {
        /* context already lost */
      }
    },
  };
}
