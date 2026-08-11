// ─────────────────────────────────────────────────────────────────────────────
// 9944-restrata · void-gl.ts — a layered-shader COLD void of N concentric ring
// strata drifting in near-black space. Each stratum carries TWO co-located rings:
//
//   • the IMAGE ring — silver-white, sampled from the SHARED swell envelope at t.
//     All strata's image rings bloom together (the one reference event).
//   • the VOICE ring — a cold jade/teal tint, sampled from that stratum's OWN
//     voice envelope at (t + offset_i), and radially SPLIT away from the image
//     ring by an amount that grows as the stratum comes un-bound.
//
// When a stratum is bound, split→0: its image and voice rings sit on top of one
// another and pulse as a single clean event. When it drifts, the two rings peel
// apart in space AND fall out of phase in time — the cross-modal desync made
// visible, per stratum. Each ring also carries a bright angular lobe rotating at
// its OWN speed, so the strata read as separate streams on separate timelines.
//
// This module only draws what it is handed each frame; it knows nothing of the
// offsets themselves — the page owns the clock and the desync engine.
// ─────────────────────────────────────────────────────────────────────────────

export const STRATA = 5;

export interface VoidScene {
  ok: boolean;
  render(p: {
    time: number;
    img: number; // shared image swell 0..1 (all strata bloom together)
    voice: number[]; // per-stratum voice swell 0..1 (each on its own timeline)
    bound: number[]; // per-stratum bind amount 0..1 (1 = locked, 0 = adrift)
    allBound: number; // 0..1, 1 = every stratum locked
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

// Cold, luminous, near-black. Silver image rings; jade / teal-white voice rings.
const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uImg;         // shared image swell 0..1
uniform float uVoice[5];    // per-stratum voice swell 0..1 (own timeline)
uniform float uBound[5];    // per-stratum bind amount, 1 bound .. 0 adrift
uniform float uAllBound;    // 0..1 global lock confirmation glow
uniform vec2  uPointer;     // gentle parallax nudge, -1..1

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// jade → teal-white → silver, all cold
vec3 coldColor(float f){
  vec3 jade   = vec3(0.42, 0.95, 0.76);
  vec3 teal   = vec3(0.60, 1.00, 1.00);
  vec3 silver = vec3(0.80, 0.88, 0.99);
  return f < 0.5 ? mix(jade, teal, f * 2.0)
                 : mix(teal, silver, (f - 0.5) * 2.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv += uPointer * 0.02; // tiny parallax

  float r   = length(uv);
  float ang = atan(uv.y, uv.x);

  vec3 silver = vec3(0.82, 0.90, 1.00);
  vec3 col = vec3(0.0);

  for(int i = 0; i < 5; i++){
    float fi  = float(i) / 4.0;
    float R   = 0.11 + float(i) * 0.088;   // concentric radii
    vec3  sc  = coldColor(fi);
    float bnd = uBound[i];
    float split = (1.0 - bnd) * 0.045;      // rings peel apart as it un-binds

    // a bright angular lobe orbiting the ring at its OWN rate → separate stream
    float arc = 0.55 + 0.45 * sin(ang * 3.0 + uTime * (0.20 + 0.05 * float(i)) + fi * 6.2832);

    // IMAGE ring — silver, shared swell at t, sits at R
    float dImg = abs(r - R);
    float imgB = 0.20 + 1.45 * uImg;
    col += silver * exp(-dImg * dImg * 2300.0) * imgB;

    // VOICE ring — tinted, own swell at t+offset_i, split away from R
    float dV = abs(r - (R + split));
    float vB = (0.12 + 1.65 * uVoice[i]) * (0.55 + 0.45 * arc);
    col += sc * exp(-dV * dV * 2050.0) * vB;

    // faint always-on structure so the strata are visible at rest
    col += sc * 0.045 * exp(-dImg * dImg * 1300.0);

    // bound confirmation: a crisp steady thread when locked
    col += silver * bnd * 0.16 * exp(-dImg * dImg * 9000.0);
  }

  // sparse cold dust — the drifting point-field of the void
  vec2 cell = floor(uv * 42.0 + vec2(uTime * 0.03, -uTime * 0.02));
  float d = hash21(cell);
  float tw = 0.5 + 0.5 * sin(uTime * 1.3 + d * 40.0);
  col += vec3(0.55, 0.90, 0.86) * step(0.987, d) * (0.10 + 0.10 * tw);

  // cold near-black ground + faint central bloom so it is never dead-flat black
  col += vec3(0.008, 0.014, 0.019);
  col += vec3(0.02, 0.05, 0.06) * exp(-r * r * 5.0);

  // global re-bind confirmation: a subtle cold lift when all strata lock
  col *= (1.0 + 0.18 * uAllBound);

  // soft tone map — luminous, never a full-frame flash
  col = vec3(1.0) - exp(-col * 1.3);

  // vignette to seat the void in darkness
  float vig = smoothstep(1.2, 0.2, length(uv));
  col *= 0.34 + 0.66 * vig;

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

const DEAD: VoidScene = {
  ok: false,
  render: () => {},
  resize: () => {},
  dispose: () => {},
};

export function createVoidScene(canvas: HTMLCanvasElement): VoidScene {
  const gl = (canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

  if (!gl) return DEAD;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return DEAD;

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return DEAD;
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
  const uImg = gl.getUniformLocation(prog, "uImg");
  const uVoice = gl.getUniformLocation(prog, "uVoice");
  const uBound = gl.getUniformLocation(prog, "uBound");
  const uAllBound = gl.getUniformLocation(prog, "uAllBound");
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
    render({ time, img, voice, bound, allBound, pointerX, pointerY }) {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uImg, img);
      gl.uniform1fv(uVoice, voice);
      gl.uniform1fv(uBound, bound);
      gl.uniform1f(uAllBound, allBound);
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
