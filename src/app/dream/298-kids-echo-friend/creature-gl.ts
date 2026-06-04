// creature-gl.ts — WebGL2 shader creature for Kids Echo Friend.
// A soft glowing blob creature that breathes, blooms, and changes hue
// based on the sung pitch. Hand-written GLSL, no three.js, no Canvas2D.
// If WebGL2 is unavailable, returns null and caller shows a text notice.

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Full-screen fragment shader. The creature is drawn entirely procedurally
// using signed-distance fields and domain warping.
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_pitch;      // 0..1 normalised pitch (0=low D, 1=high)
uniform float u_singing;    // 0..1 (child is singing right now)
uniform float u_singback;   // 0..1 (creature is singing back)
uniform float u_phrases;    // 0..N number of remembered phrases
uniform float u_amplitude;  // 0..1 live mic amplitude

// ── noise helpers ──────────────────────────────────────────────────────────
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(
    mix(hash(i), hash(i+vec2(1,0)), u.x),
    mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a*vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

// ── D-Dorian palette: warm violet at low, bright cyan/lime at high ─────────
// Low pitch → warm violet/rose glow; mid → amber/gold; high → sky/emerald
vec3 pitchHue(float t) {
  // t=0: violet, t=0.33: warm gold, t=0.66: teal, t=1: bright lime
  vec3 c0 = vec3(0.62, 0.30, 0.90); // violet
  vec3 c1 = vec3(0.98, 0.75, 0.25); // warm amber
  vec3 c2 = vec3(0.20, 0.85, 0.75); // teal
  vec3 c3 = vec3(0.55, 0.95, 0.40); // bright lime
  if (t < 0.33) return mix(c0, c1, t / 0.33);
  if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
  return mix(c2, c3, (t - 0.66) / 0.34);
}

// ── Soft SDF blob (domain-warped circle) ───────────────────────────────────
float creatureSDF(vec2 p, float t, float breathe, float sing) {
  // Organic domain warp driven by time + pitch
  float warp = fbm(p * 2.3 + t * 0.18) * 0.28;
  float warp2 = fbm(p * 3.7 - t * 0.11 + 4.7) * 0.15;
  vec2 warped = p + vec2(warp, warp2);

  // Base radius: larger when low pitch, smaller + brighter when high
  float baseR = 0.28 + breathe * 0.04 - sing * 0.04;
  return length(warped) - baseR;
}

void main() {
  vec2 uv  = gl_FragCoord.xy / u_res;
  vec2 p   = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

  float t = u_time;
  float pitch = u_pitch;
  float singing = u_singing;
  float singback = u_singback;

  // Breathing: slow sine oscillation
  float breathe = 0.5 + 0.5 * sin(t * 0.9 + 0.3);
  // Excitement when singing or being sung to
  float excite = max(singing, singback);
  breathe = mix(breathe, 0.5 + 0.5 * sin(t * 2.8), excite * 0.6);

  // ── Dark aurora background ─────────────────────────────────────────────
  vec3 bgTop = vec3(0.04, 0.05, 0.14);
  vec3 bgBot = vec3(0.08, 0.04, 0.18);
  vec3 bg = mix(bgBot, bgTop, uv.y);

  // Subtle aurora ribbons in background
  float aurora = fbm(vec2(uv.x * 2.0 + t * 0.04, uv.y * 0.6 + 0.3));
  aurora = smoothstep(0.46, 0.62, aurora) * (0.7 - uv.y * 0.5);
  vec3 auroraCol = mix(vec3(0.20, 0.55, 0.75), vec3(0.50, 0.25, 0.80), uv.x);
  bg = mix(bg, bg + auroraCol * 0.18, aurora * 0.5);

  // ── Memory orbs (one per remembered phrase, orbiting creature) ────────
  float nPhrases = clamp(u_phrases, 0.0, 12.0);
  vec3 orbGlow = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= nPhrases) break;
    float fi = float(i);
    float angle = fi * 6.2832 / max(nPhrases, 1.0) + t * (0.18 + fi * 0.03);
    float r = 0.38 + 0.04 * sin(t * 0.7 + fi * 1.3);
    vec2 orbPos = vec2(cos(angle), sin(angle)) * r;
    float orbDist = length(p - orbPos);
    float orb = exp(-orbDist * 18.0) * 0.6;
    vec3 orbColor = pitchHue(fract(fi * 0.17 + 0.05));
    orbGlow += orb * orbColor;
  }

  // ── Creature body ──────────────────────────────────────────────────────
  float sdf = creatureSDF(p, t, breathe, singing * 0.12);

  // Outer halo glow
  float halo = exp(-max(sdf, 0.0) * 7.0) * (0.55 + excite * 0.35);
  vec3 creatureColor = pitchHue(pitch);
  // Warmer at rest (low-mid tones), brightens to live pitch when singing
  vec3 idleColor = pitchHue(0.15); // warm amber-violet
  vec3 liveColor = creatureColor;
  vec3 bodyColor = mix(idleColor, liveColor, max(singing, singback * 0.7));

  // Inner body fill (soft SDF step)
  float body = smoothstep(0.012, -0.005, sdf);
  // Surface shimmer
  float shimmer = fbm(p * 6.0 + t * 0.4) * 0.3;

  // Singback pulse: a bright ring expands when the creature sings back
  float pulseR = 0.30 + singback * 0.25;
  float pulseSDF = length(p) - pulseR;
  float pulseRing = exp(-abs(pulseSDF) * 22.0) * singback * 0.8;
  orbGlow += pulseRing * bodyColor;

  // Amplitude wobble — live mic energy makes the creature quiver
  float ampWobble = u_amplitude * 0.12;
  float ampGlow = exp(-max(sdf - ampWobble, 0.0) * 9.0) * u_amplitude * 0.4;

  // Compose: background + aurora + orbs + halo + body
  vec3 col = bg;
  col += orbGlow;
  col += halo * bodyColor * 1.2;
  col += ampGlow * bodyColor;
  col = mix(col, bodyColor + shimmer * 0.15, body);

  // Soft inner highlight (top-left) for 3D feel
  vec2 highlight = p - vec2(-0.07, 0.09);
  float hl = exp(-length(highlight) * 12.0) * body * 0.45;
  col += hl * vec3(1.0);

  // Eye dots when idle / listening (two small dark circles)
  float eyeAnim = 1.0 - excite * 0.7;
  vec2 eyeL = p - vec2(-0.07, 0.08);
  vec2 eyeR = p - vec2( 0.07, 0.08);
  float eyeSize = 0.025 * eyeAnim;
  float eL = smoothstep(eyeSize, eyeSize - 0.008, length(eyeL));
  float eR = smoothstep(eyeSize, eyeSize - 0.008, length(eyeR));
  col = mix(col, vec3(0.12, 0.08, 0.20), (eL + eR) * body);

  // Gentle vignette
  float vig = smoothstep(1.15, 0.4, length(uv - 0.5));
  col *= mix(0.78, 1.0, vig);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export interface CreatureUniforms {
  pitch: number;       // 0..1
  singing: number;     // 0..1
  singback: number;    // 0..1
  phrases: number;     // 0..N
  amplitude: number;   // 0..1
}

export interface CreatureHandle {
  setUniforms: (u: Partial<CreatureUniforms>) => void;
  dispose: () => void;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("creature shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function startCreature(
  canvas: HTMLCanvasElement,
): CreatureHandle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("creature program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // Full-screen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations
  const uRes      = gl.getUniformLocation(prog, "u_res");
  const uTime     = gl.getUniformLocation(prog, "u_time");
  const uPitch    = gl.getUniformLocation(prog, "u_pitch");
  const uSinging  = gl.getUniformLocation(prog, "u_singing");
  const uSingback = gl.getUniformLocation(prog, "u_singback");
  const uPhrases  = gl.getUniformLocation(prog, "u_phrases");
  const uAmp      = gl.getUniformLocation(prog, "u_amplitude");

  const cur: CreatureUniforms = {
    pitch: 0.15,
    singing: 0,
    singback: 0,
    phrases: 0,
    amplitude: 0,
  };

  const start = performance.now();
  let raf = 0;
  let disposed = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const frame = () => {
    if (disposed) return;
    resize();
    const t = (performance.now() - start) / 1000;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uPitch, cur.pitch);
    gl.uniform1f(uSinging, cur.singing);
    gl.uniform1f(uSingback, cur.singback);
    gl.uniform1f(uPhrases, cur.phrases);
    gl.uniform1f(uAmp, cur.amplitude);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setUniforms: (u) => {
      Object.assign(cur, u);
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
