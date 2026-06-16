// WebGL2 renderer for the Pulse Cathedral nave.
// A luminous vertical light-column / cathedral nave: a full-screen fragment
// shader draws receding light-shafts whose brightness pulses with the kick
// (the sidechain duck is visible as a brightness dip-and-bloom), color sweeps
// violet (BUILD) -> gold/white (DROP), and shafts erupt at the DROP.
//
// Falls back to a Canvas2D renderer if WebGL2 is unavailable.

import { Phase } from "./arc";

export interface RenderInputs {
  time: number; // seconds
  intensity: number; // 0..1
  riser: number; // 0..1
  kickFlash: number; // 0..1 decaying kick envelope
  duck: number; // 0..1 sidechain duck amount (1 = fully ducked)
  phase: Phase;
  dropPulse: number; // 0..1 decaying impulse fired at each DROP entry
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uIntensity;
uniform float uRiser;
uniform float uKick;
uniform float uDuck;
uniform float uPhase;     // 0=build 1=drop 2=sustain
uniform float uDrop;      // drop impulse

float hash(float n){ return fract(sin(n)*43758.5453123); }

void main(){
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;

  // Cathedral nave: vertical light-shafts converging toward a high vanishing
  // point. We work in a "perspective" coordinate.
  float y = uv.y;
  float vanish = 0.65;                 // height of the vanishing glow
  float depth = clamp((vanish - y) , 0.001, 2.0);
  float persp = uv.x / (depth + 0.18); // shafts spread toward the floor

  // Bright color targets: violet (build) -> gold/white (drop).
  vec3 violet = vec3(0.45, 0.28, 0.95);
  vec3 gold   = vec3(1.0, 0.82, 0.42);
  vec3 white  = vec3(1.0, 0.98, 0.95);
  float dropMix = smoothstep(0.0, 1.0, uIntensity);
  vec3 base = mix(violet, gold, dropMix);
  base = mix(base, white, uDrop * 0.7);

  // Vertical light columns (the "pulse cathedral" pillars).
  float cols = 9.0;
  float colId = floor((persp * 0.5 + 0.5) * cols);
  float colPhase = hash(colId * 1.37);
  float colX = fract((persp * 0.5 + 0.5) * cols) - 0.5;
  float pillar = smoothstep(0.42, 0.0, abs(colX));
  // shafts shimmer & rise with the riser
  float shimmer = 0.6 + 0.4 * sin(uTime * (2.0 + colPhase * 4.0) + y * 6.0 - uRiser * 10.0);
  pillar *= shimmer;

  // Vanishing-point bloom — the altar light.
  float halo = exp(-pow(length(vec2(uv.x, (y - vanish)) ) * 2.2, 2.0));

  // Kick flash with a visible duck: brightness dips then blooms.
  float pump = 1.0 - uDuck * 0.55;          // dip on kick
  float bloom = uKick * (0.8 + uIntensity); // bloom right after

  // Floor glow ramp.
  float floorGlow = smoothstep(-1.0, -0.2, y) * (0.2 + 0.5 * uIntensity);

  // Drop eruption: radial particle-ish sparks.
  float sparks = 0.0;
  if (uDrop > 0.01){
    for(int i=0;i<10;i++){
      float fi = float(i);
      float ang = hash(fi*3.1)*6.2831;
      float sp = 0.4 + hash(fi*7.7)*1.4;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 p = dir * sp * uDrop;
      float d = length(uv - vec2(0.0, vanish) - p);
      sparks += exp(-d*d*55.0) * uDrop;
    }
  }

  float energy = (pillar * (0.35 + 0.65*uIntensity) + halo * (1.2 + bloom))
                 * pump + floorGlow;
  energy += bloom * 1.4;
  energy += sparks * 1.6;
  energy += uRiser * halo * 1.5;

  vec3 col = base * energy;
  col += white * sparks * 0.8;
  col += vec3(0.04, 0.02, 0.08); // deep cathedral ambient

  // soft vignette
  float vig = smoothstep(1.6, 0.2, length(uv));
  col *= vig;

  // gentle tone curve
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.85));

  fragColor = vec4(col, 1.0);
}
`;

export interface Renderer {
  mode: "webgl2" | "canvas2d";
  render: (input: RenderInputs) => void;
  resize: () => void;
  dispose: () => void;
}

function phaseToNum(p: Phase): number {
  return p === "BUILD" ? 0 : p === "DROP" ? 1 : 2;
}

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

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (gl) {
    const built = buildGl(gl, canvas);
    if (built) return built;
  }
  return buildCanvas2d(canvas);
}

function buildGl(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement): Renderer | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    intensity: gl.getUniformLocation(prog, "uIntensity"),
    riser: gl.getUniformLocation(prog, "uRiser"),
    kick: gl.getUniformLocation(prog, "uKick"),
    duck: gl.getUniformLocation(prog, "uDuck"),
    phase: gl.getUniformLocation(prog, "uPhase"),
    drop: gl.getUniformLocation(prog, "uDrop"),
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  return {
    mode: "webgl2",
    resize,
    render: (i) => {
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, i.time);
      gl.uniform1f(u.intensity, i.intensity);
      gl.uniform1f(u.riser, i.riser);
      gl.uniform1f(u.kick, i.kickFlash);
      gl.uniform1f(u.duck, i.duck);
      gl.uniform1f(u.phase, phaseToNum(i.phase));
      gl.uniform1f(u.drop, i.dropPulse);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => {
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    },
  };
}

// ---- Canvas2D fallback: a simpler luminous nave ----
function buildCanvas2d(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  };
  resize();

  return {
    mode: "canvas2d",
    resize,
    render: (i) => {
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const dropMix = i.intensity;
      // background
      ctx.fillStyle = "#0a0612";
      ctx.fillRect(0, 0, w, h);

      const vanishY = h * 0.34;
      const pump = 1 - i.duck * 0.5;
      const bloom = i.kickFlash * (0.8 + i.intensity);

      // altar halo
      const halo = ctx.createRadialGradient(
        w / 2,
        vanishY,
        0,
        w / 2,
        vanishY,
        h * (0.5 + 0.4 * i.intensity)
      );
      const r = Math.round(120 + 135 * dropMix + 60 * bloom);
      const g = Math.round(70 + 130 * dropMix + 70 * bloom);
      const b = Math.round(220 - 80 * dropMix);
      const a = (0.5 + 0.4 * i.intensity) * pump + bloom * 0.5;
      halo.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, a)})`);
      halo.addColorStop(1, "rgba(10,6,18,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // light pillars
      const cols = 9;
      for (let c = 0; c < cols; c++) {
        const t = (c + 0.5) / cols;
        const baseX = t * w;
        const topX = w / 2 + (baseX - w / 2) * 0.15;
        const shimmer = 0.55 + 0.45 * Math.sin(i.time * 2.4 + c - i.riser * 8);
        const alpha = (0.05 + 0.16 * i.intensity) * shimmer * pump + bloom * 0.08;
        const grad = ctx.createLinearGradient(topX, vanishY, baseX, h);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},${Math.max(0, alpha)})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(topX - 2, vanishY);
        ctx.lineTo(topX + 2, vanishY);
        ctx.lineTo(baseX + w / cols / 2, h);
        ctx.lineTo(baseX - w / cols / 2, h);
        ctx.closePath();
        ctx.fill();
      }

      // drop sparks
      if (i.dropPulse > 0.01) {
        ctx.fillStyle = `rgba(255,250,240,${i.dropPulse})`;
        for (let s = 0; s < 24; s++) {
          const ang = (s / 24) * Math.PI * 2;
          const rad = i.dropPulse * h * 0.5 * (0.4 + (s % 3) * 0.3);
          const px = w / 2 + Math.cos(ang) * rad;
          const py = vanishY + Math.sin(ang) * rad;
          ctx.beginPath();
          ctx.arc(px, py, 2 + 4 * i.dropPulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    dispose: () => {},
  };
}
