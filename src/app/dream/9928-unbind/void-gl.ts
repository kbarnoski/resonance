// ─────────────────────────────────────────────────────────────────────────────
// 9928-unbind · void-gl.ts — a WebGL1 fragment-shader raymarch of a sparse,
// luminous, COLD void. A few faint structures (rings, thin pillars, distant
// points) drift in vast dark space while a slow wandering camera path (sin/cos
// of time) recedes forever forward. Glow is accumulated volumetrically along
// each ray (step-weighted inverse-distance) so the structures read as faint
// light in blackness rather than hard surfaces — cheap and forgiving.
//
// The scene exposes ONE expressive input: `pulse` (0..1) — the visual swell that
// the audio "should" accompany. The page owns the clock and hands the SAME
// envelope to the audio side through a wandering time offset (the desync engine).
// This module only draws what it is told; it knows nothing of the offset.
// ─────────────────────────────────────────────────────────────────────────────

export interface VoidScene {
  ok: boolean;
  render(p: {
    time: number;
    pulse: number;
    lock: number;
    pointerX: number;
    pointerY: number;
  }): void;
  resize(): void;
  dispose(): void;
}

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Cold, luminous, near-black. Silver / pale-jade / teal-white points only.
const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uPulse;   // visual swell 0..1 (structure passing / brightness bloom)
uniform float uLock;    // 0 unbound .. 1 bound (re-bind confirmation glow)
uniform vec2  uPointer; // gentle camera nudge, -1..1

float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

// torus lying in the xy-plane (axis = z) so the receding camera passes through it
float sdTorus(vec3 p, float R, float r){
  vec2 q = vec2(length(p.xy) - R, p.z);
  return length(q) - r;
}

// sparse scattered rings, domain-repeated along z
float ringField(vec3 p){
  float cell = 6.5;
  float id = floor(p.z / cell);
  vec3 q = p;
  q.z = mod(p.z, cell) - cell * 0.5;
  q.xy -= (vec2(hash11(id*3.1), hash11(id*5.3)) - 0.5) * 2.4;
  float R = 1.0 + 1.1 * hash11(id*1.7);
  return sdTorus(q, R, 0.028);
}

// thin vertical pillars on a wide lattice — faint columns of light
float pillarField(vec3 p){
  vec3 pp = p;
  pp.xz = mod(pp.xz + 6.0, 12.0) - 6.0;
  return length(pp.xz) - 0.02;
}

// distant points — a sparse 3D lattice of luminous specks
float pointField(vec3 p){
  vec3 gp = mod(p + 9.5, 19.0) - 9.5;
  return length(gp) - 0.015;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // slow wandering camera, forever forward in +z (receding depth)
  vec3 ro = vec3(0.75 * sin(uTime*0.11), 0.55 * cos(uTime*0.09), uTime*0.55);
  ro.xy += uPointer * 0.7;
  vec3 ta = ro + vec3(0.28*sin(uTime*0.07), 0.20*cos(uTime*0.06), 2.0);
  vec3 fwd = normalize(ta - ro);
  vec3 rt  = normalize(cross(vec3(0.0,1.0,0.0), fwd));
  vec3 up  = cross(fwd, rt);
  vec3 rd  = normalize(uv.x*rt + uv.y*up + 1.45*fwd);

  vec3 jade   = vec3(0.55, 0.95, 0.80);  // pale-jade rings
  vec3 silver = vec3(0.78, 0.86, 0.95);  // cold silver pillars
  vec3 teal   = vec3(0.62, 1.00, 1.00);  // teal-white points

  vec3 col = vec3(0.0);
  float t = 0.15;
  float maxDist = 26.0;
  float pulseGain = 0.55 + 1.05 * uPulse; // rings bloom as the swell passes

  for(int i=0; i<72; i++){
    vec3 p = ro + rd * t;
    float dr  = ringField(p);
    float dpz = pillarField(p);
    float dpt = pointField(p);
    float dmin = min(dr, min(dpz, dpt));
    float stepLen = max(0.035, dmin * 0.7);
    float fog = exp(-t * 0.045); // receding depth fade

    col += jade   * exp(-dr  * 9.0)  * stepLen * pulseGain * fog;
    col += silver * exp(-dpz * 12.0) * stepLen * 0.9 * fog;
    col += teal   * exp(-dpt * 7.0)  * stepLen * 0.7 * fog;

    t += stepLen;
    if(t > maxDist) break;
  }

  // cold near-black ground, faint blue-green so it is never a dead flat black
  vec3 bg = vec3(0.010, 0.016, 0.021);
  col += bg;

  // re-bind confirmation: a subtle, cold brightness lift when the streams lock
  col *= (1.0 + 0.22 * uLock);

  // soft tone map — keeps it luminous but never a full-frame flash
  col = vec3(1.0) - exp(-col * 1.25);

  // gentle vignette to seat the void in darkness
  float vig = smoothstep(1.25, 0.25, length(uv));
  col *= 0.35 + 0.65 * vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
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

export function createVoidScene(canvas: HTMLCanvasElement): VoidScene {
  const gl = (canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  }) ||
    canvas.getContext(
      "experimental-webgl",
    )) as WebGLRenderingContext | null;

  if (!gl) {
    return {
      ok: false,
      render: () => {},
      resize: () => {},
      dispose: () => {},
    };
  }

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) {
    return { ok: false, render: () => {}, resize: () => {}, dispose: () => {} };
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return { ok: false, render: () => {}, resize: () => {}, dispose: () => {} };
  }
  gl.useProgram(prog);

  // fullscreen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uPulse = gl.getUniformLocation(prog, "uPulse");
  const uLock = gl.getUniformLocation(prog, "uLock");
  const uPointer = gl.getUniformLocation(prog, "uPointer");

  const resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  };
  resize();

  return {
    ok: true,
    render({ time, pulse, lock, pointerX, pointerY }) {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uPulse, pulse);
      gl.uniform1f(uLock, lock);
      gl.uniform2f(uPointer, pointerX, pointerY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize,
    dispose() {
      try {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        const lose = gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
