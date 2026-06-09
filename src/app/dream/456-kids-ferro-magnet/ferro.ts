/**
 * ferro.ts — WebGL2 ferrofluid renderer + CPU Rosensweig-instability physics
 *
 * Technique:
 *   - N blob centers driven by spring-gravity physics toward the magnet.
 *   - IQ polynomial smin fuses the SDF blobs into one gooey membrane.
 *   - Near the magnet, hexagonal ripple modulation resolves spikes (Rosensweig
 *     normal-field instability approximation).
 *   - GLSL ES 3.00 fragment shader on a full-screen quad.
 *
 * References:
 *   R.E. Rosensweig, Ferrohydrodynamics (1985)
 *   I. Quilez, polynomial smooth-min / SDF metaballs (iquilezles.org)
 */

// ── GLSL ES 3.00 vertex shader (full-screen triangle) ────────────────────────

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  // Two triangles covering NDC [-1,1]
  vec2 pos[6];
  pos[0]=vec2(-1,-1); pos[1]=vec2(3,-1); pos[2]=vec2(-1,3);
  pos[3]=vec2(-1,-1); pos[4]=vec2(3,-1); pos[5]=vec2(-1,3);
  // Actually: use a single large triangle
  vec2 p = vec2(
    float(gl_VertexID==1)*4.0 - 1.0,
    float(gl_VertexID==2)*4.0 - 1.0
  );
  // Standard large-triangle trick
  if(gl_VertexID==0) p=vec2(-1,-1);
  if(gl_VertexID==1) p=vec2( 3,-1);
  if(gl_VertexID==2) p=vec2(-1, 3);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p,0,1);
}`;

// ── GLSL ES 3.00 fragment shader ─────────────────────────────────────────────
// Uniforms:
//   u_res      vec2  canvas pixels
//   u_time     float elapsed seconds
//   u_magnet   vec2  magnet normalised position [0,1]
//   u_strength float field strength [0,1]
//   u_blobs    vec4[MAX_BLOBS]  .xy=pos(norm) .z=radius .w=spike_height
//   u_nbells   int   (1..5)
//   u_bells    vec4[5]  .xy=pos(norm) .z=radius .w=glow[0..1]

const MAX_BLOBS = 16;
const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_magnet;
uniform float u_strength;
uniform vec4  u_blobs[${MAX_BLOBS}];
uniform int   u_nblobs;
uniform vec4  u_bells[5];
uniform int   u_nbells;

// ── IQ polynomial smooth-min ────────────────────────────────────────────────
float smin(float a, float b, float k){
  float h = max(k - abs(a-b), 0.0) / k;
  return min(a,b) - h*h*h*k*(1.0/6.0);
}

// ── 2D SDF circle ───────────────────────────────────────────────────────────
float sdCircle(vec2 p, vec2 c, float r){ return length(p-c)-r; }

// ── Hex grid ripple (Rosensweig instability approximation) ──────────────────
// Returns a value [0,1] peaking on hex-lattice nodes
float hexRipple(vec2 p, float scale){
  // Three-wave interference at 0°, 60°, 120° — produces hex pattern
  vec2 sp = p * scale;
  float a = cos(sp.x*1.732 + sp.y);
  float b = cos(-sp.x*1.732 + sp.y);
  float c2 = cos(sp.y * 2.0);
  float v = (a + b + c2) / 3.0; // [-1,1]
  return v * 0.5 + 0.5;          // [0,1]
}

// ── Noise hash ──────────────────────────────────────────────────────────────
float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}
float vnoise(vec2 p){
  vec2 i=floor(p); vec2 f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0));
  float c3=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,u.x),mix(c3,d,u.x),u.y);
}

void main(){
  vec2 uv = vUv; // [0,1] with y=0 bottom

  // Aspect-correct coordinates centred on screen
  float asp = u_res.x / u_res.y;
  vec2 ap = (uv - 0.5) * vec2(asp, 1.0); // aspect-space [-asp/2, asp/2] x [-0.5,0.5]

  // Magnet position in aspect-space
  vec2 mag_ap = (u_magnet - 0.5) * vec2(asp, 1.0);

  // ── Build SDF of ferrofluid blobs ────────────────────────────────────────
  float d = 1e6;
  for(int i=0; i<${MAX_BLOBS}; i++){
    if(i >= u_nblobs) break;
    vec2 bc = (u_blobs[i].xy - 0.5) * vec2(asp, 1.0);
    float br = u_blobs[i].z;
    float sh = u_blobs[i].w; // spike-pull height
    float sd = sdCircle(ap, bc, br);

    // Spike sharpening: pull blobs into points near magnet
    // spike_height > 0 → elongate toward magnet
    if(sh > 0.001){
      vec2 toMag = normalize(mag_ap - bc);
      // Project fragment onto spike axis
      vec2 fromC = ap - bc;
      float proj = dot(fromC, toMag);
      float perp = length(fromC - toMag*proj);
      // SDF of a cone-ish spike
      float spike = max(perp * 3.5 - (sh - proj) * 0.8, -proj) - br * 0.25;
      sd = smin(sd, spike, 0.04);
    }

    d = smin(d, sd, 0.055);
  }

  // ── Rosensweig hex modulation near magnet ───────────────────────────────
  float magDist = length(ap - mag_ap);
  float fieldRadius = 0.28 + u_strength * 0.12;
  float fieldEnv = smoothstep(fieldRadius, fieldRadius * 0.3, magDist);
  float hex = hexRipple(ap - mag_ap, 11.0);
  // Indent the surface with hex ripple → creates spike array
  float hexDepth = fieldEnv * u_strength * 0.045 * (hex * 2.0 - 1.0);
  d -= hexDepth;

  // Gentle time-animation of the surface
  float noise = vnoise(ap * 4.8 + u_time * 0.18) - 0.5;
  d += noise * 0.007 * (1.0 - u_strength * 0.5);

  // ── Pool body shading ────────────────────────────────────────────────────
  // Inside fluid (d < 0), outside (d > 0)
  float inside = 1.0 - smoothstep(-0.003, 0.003, d);

  // Base ferrofluid colour: very dark, slightly blue-black
  vec3 fluidBase = vec3(0.03, 0.035, 0.05);

  // Glossy specular: fake env reflection, highlight toward magnet
  vec3 viewDir = vec3(0,0,1);
  // Surface normal approximation from SDF gradient
  float eps = 0.002;
  vec2 gx = vec2(
    smin(d, 1e6, 0.055) - (d - eps), // finite diff in x (approx)
    smin(d, 1e6, 0.055) - (d - eps)  // placeholder
  );
  // Compute gradient analytically: perturb sample
  float dx = 0.0, dy2 = 0.0;
  // We approximate: specular based on magnet direction and surface proximity
  float rimBrightness = smoothstep(0.018, 0.0, abs(d));
  vec2 toMagN = normalize(mag_ap - ap + vec2(0.0001));
  float rimDot = dot(toMagN, vec2(0.3, 0.9)); // fake light from upper-magnet
  float spec = pow(max(rimDot, 0.0), 14.0) * rimBrightness;

  // Warm golden rim highlight from magnet field
  vec3 rimColor = vec3(1.0, 0.72, 0.32);
  float fieldGlow = smoothstep(0.22, 0.0, magDist) * u_strength;
  vec3 fluidColor = fluidBase
    + rimColor * spec * 0.7
    + vec3(0.05, 0.08, 0.12) * rimBrightness * 0.4  // cool blue edge
    + fluidBase * fieldGlow * 2.0;                    // field-warmed body

  // Surface micro-gloss: thin bright band at d~0
  float surfLine = exp(-abs(d) * 180.0) * 0.35;
  fluidColor += vec3(0.6, 0.5, 0.3) * surfLine;

  // ── Magnet glow ──────────────────────────────────────────────────────────
  // A warm glowing disc beneath the pool
  float mDist = length(ap - mag_ap);
  float mGlow = exp(-mDist * mDist / (0.003 + u_strength * 0.012)) * u_strength;
  vec3 magnetColor = vec3(1.0, 0.55 + u_strength * 0.2, 0.1) * mGlow * 1.8;

  // ── Rim bell glows ───────────────────────────────────────────────────────
  vec3 bellGlow = vec3(0.0);
  for(int i=0; i<5; i++){
    if(i >= u_nbells) break;
    vec2 bc2 = (u_bells[i].xy - 0.5) * vec2(asp, 1.0);
    float br2 = u_bells[i].z;
    float bv = u_bells[i].w; // glow 0..1
    float bd = length(ap - bc2);
    // Ring marker
    float ring = smoothstep(br2 + 0.008, br2, bd) - smoothstep(br2 - 0.004, br2 - 0.012, bd);
    // Bell index → color: warm amber to cool violet
    float hue = float(i) / 4.0;
    vec3 bc3 = mix(vec3(1.0, 0.75, 0.2), vec3(0.65, 0.45, 1.0), hue);
    bellGlow += bc3 * (ring * (0.5 + bv * 0.7) + bv * exp(-bd*bd/0.001) * 1.4);
  }

  // ── Background: dark pool, subtle vignette ───────────────────────────────
  vec3 bg = vec3(0.01, 0.012, 0.022);
  // Circular pool rim
  float poolR = 0.44 * asp;
  float poolD = length(ap) - poolR * 0.92;
  float poolRim = smoothstep(0.01, 0.0, poolD) * 0.025;
  bg += vec3(0.2, 0.25, 0.4) * poolRim;

  // Compose
  vec3 col = bg;
  col = mix(col, fluidColor, inside);
  col += magnetColor * (1.0 - inside * 0.6);
  col += bellGlow;

  // Vignette
  float vign = 1.0 - smoothstep(0.35, 0.7, length(uv - 0.5));
  col *= vign;

  // Tonemap (simple Reinhard)
  col = col / (col + 1.0);

  fragColor = vec4(col, 1.0);
}`;

// ── Physics types ────────────────────────────────────────────────────────────

export interface Blob {
  x: number;   // normalised [0,1]
  y: number;
  vx: number;
  vy: number;
  rx: number;  // rest x
  ry: number;  // rest y
  r: number;   // radius (normalised)
  spikeH: number; // current spike height [0,~0.12]
}

export interface RimBell {
  x: number;
  y: number;
  r: number;   // radius
  glow: number; // 0..1
}

export interface PhysicsState {
  blobs: Blob[];
  bells: RimBell[];
  magnetX: number; // [0,1]
  magnetY: number;
  strength: number;  // [0,1]
}

// ── Initialise physics ───────────────────────────────────────────────────────

export function initPhysics(): PhysicsState {
  const blobs: Blob[] = [];

  // Centre blob — the main pool mass
  blobs.push({
    x: 0.5, y: 0.5, vx: 0, vy: 0,
    rx: 0.5, ry: 0.5,
    r: 0.22, spikeH: 0,
  });

  // Satellite blobs in a ring — they spread to form the pool shape
  const N = 8;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    const rx = 0.5 + Math.cos(angle) * 0.14;
    const ry = 0.5 + Math.sin(angle) * 0.14;
    blobs.push({
      x: rx, y: ry, vx: 0, vy: 0,
      rx, ry,
      r: 0.10, spikeH: 0,
    });
  }

  // Spike blobs — start at rest positions near centre, activate when field is strong
  const S = 6;
  for (let i = 0; i < S; i++) {
    const angle = (i / S) * Math.PI * 2 + Math.PI / S;
    const rx = 0.5 + Math.cos(angle) * 0.07;
    const ry = 0.5 + Math.sin(angle) * 0.07;
    blobs.push({
      x: rx, y: ry, vx: 0, vy: 0,
      rx, ry,
      r: 0.055, spikeH: 0,
    });
  }

  // Five rim bells equally spaced around pool edge
  const bells: RimBell[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    bells.push({
      x: 0.5 + Math.cos(angle) * 0.35,
      y: 0.5 + Math.sin(angle) * 0.35,
      r: 0.028 + (4 - i) * 0.006, // bigger bells have lower index
      glow: 0,
    });
  }

  return {
    blobs,
    bells,
    magnetX: 0.5,
    magnetY: 0.5,
    strength: 0,
  };
}

// ── Step physics ─────────────────────────────────────────────────────────────

export function stepPhysics(
  state: PhysicsState,
  dt: number, // seconds, clamped externally
): void {
  const { blobs, magnetX, magnetY, strength } = state;
  const GRAVITY_K = 8.0;      // spring constant back to rest
  const DAMPING = 0.88;        // velocity damping per frame
  const MAGNET_K = 14.0;       // magnet attraction strength
  const MAX_SPIKE_H = 0.13;
  const SPIKE_RISE = 2.8;
  const SPIKE_FALL = 1.6;
  const MAGNET_RADIUS = 0.28;

  for (const b of blobs) {
    // Spring back to rest position
    const dx = b.rx - b.x;
    const dy = b.ry - b.y;
    b.vx += dx * GRAVITY_K * dt;
    b.vy += dy * GRAVITY_K * dt;

    // Magnet attraction
    const mx = magnetX - b.x;
    const my = magnetY - b.y;
    const dist = Math.sqrt(mx * mx + my * my) + 0.001;
    const envelope = Math.max(0, 1 - dist / MAGNET_RADIUS);
    const force = MAGNET_K * strength * envelope * envelope;
    b.vx += (mx / dist) * force * dt;
    b.vy += (my / dist) * force * dt;

    // Velocity damping
    b.vx *= Math.pow(DAMPING, dt * 60);
    b.vy *= Math.pow(DAMPING, dt * 60);

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Spike height: rises when magnet is close and strength is high
    const spikeEnv = Math.max(0, 1 - dist / (MAGNET_RADIUS * 0.6));
    const targetSpike = spikeEnv * spikeEnv * strength * MAX_SPIKE_H;
    if (targetSpike > b.spikeH) {
      b.spikeH += (targetSpike - b.spikeH) * SPIKE_RISE * dt;
    } else {
      b.spikeH += (targetSpike - b.spikeH) * SPIKE_FALL * dt;
    }
    b.spikeH = Math.max(0, b.spikeH);
  }

  // Bell glow decay
  for (const bell of state.bells) {
    bell.glow *= Math.pow(0.18, dt); // fast decay
  }
}

// ── Spike–bell collision test ────────────────────────────────────────────────
// Returns indices of bells that should ring this frame (each fires once until
// the spike retreats below the threshold)

export function detectBellTouches(
  state: PhysicsState,
  lastTouched: boolean[],
): number[] {
  const ringing: number[] = [];
  const { blobs, bells } = state;

  for (let bi = 0; bi < bells.length; bi++) {
    const bell = bells[bi];
    // Check if ANY blob's spike tip reaches the bell centre
    let touching = false;
    for (const b of blobs) {
      if (b.spikeH < 0.015) continue;
      // Spike tip position: blob centre + spikeH in direction of magnet
      const mxDir = state.magnetX - b.x;
      const myDir = state.magnetY - b.y;
      const mDist = Math.sqrt(mxDir * mxDir + myDir * myDir) + 0.001;
      const tipX = b.x + (mxDir / mDist) * b.spikeH;
      const tipY = b.y + (myDir / mDist) * b.spikeH;
      const dx = tipX - bell.x;
      const dy = tipY - bell.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bell.r + 0.025) {
        touching = true;
        break;
      }
    }
    if (touching && !lastTouched[bi]) {
      ringing.push(bi);
      bells[bi].glow = 1.0;
    }
    lastTouched[bi] = touching;
  }
  return ringing;
}

// ── WebGL2 renderer ──────────────────────────────────────────────────────────

export interface Renderer {
  draw: (state: PhysicsState, time: number) => void;
  resize: (w: number, h: number) => void;
  teardown: () => void;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile error: " + gl.getShaderInfoLog(s));
  }
  return s;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const glMaybe = canvas.getContext("webgl2");
  if (!glMaybe) return null;
  // Assign to a const with a non-nullable type so closures keep the guarantee
  const gl: WebGL2RenderingContext = glMaybe;

  // Compile program
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // Empty VAO — vertex positions are procedural in vertex shader
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // Cache uniform locations
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uMagnet = gl.getUniformLocation(prog, "u_magnet");
  const uStrength = gl.getUniformLocation(prog, "u_strength");
  const uNblobs = gl.getUniformLocation(prog, "u_nblobs");
  const uNbells = gl.getUniformLocation(prog, "u_nbells");

  // Pre-allocate flat arrays
  const blobData = new Float32Array(MAX_BLOBS * 4);
  const bellData = new Float32Array(5 * 4);

  let width = canvas.width;
  let height = canvas.height;

  function resize(w: number, h: number): void {
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function draw(state: PhysicsState, time: number): void {
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(uRes, width, height);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uMagnet, state.magnetX, state.magnetY);
    gl.uniform1f(uStrength, state.strength);

    const nb = Math.min(state.blobs.length, MAX_BLOBS);
    for (let i = 0; i < nb; i++) {
      const b = state.blobs[i];
      blobData[i * 4 + 0] = b.x;
      blobData[i * 4 + 1] = b.y;
      blobData[i * 4 + 2] = b.r;
      blobData[i * 4 + 3] = b.spikeH;
    }
    // Upload the full MAX_BLOBS array (unused slots are at 0,0,0,0)
    for (let i = nb; i < MAX_BLOBS; i++) {
      blobData[i * 4] = 0; blobData[i * 4 + 1] = 0;
      blobData[i * 4 + 2] = 0; blobData[i * 4 + 3] = 0;
    }
    gl.uniform4fv(gl.getUniformLocation(prog, "u_blobs[0]"), blobData);
    gl.uniform1i(uNblobs, nb);

    const nbells = Math.min(state.bells.length, 5);
    for (let i = 0; i < nbells; i++) {
      const bell = state.bells[i];
      bellData[i * 4 + 0] = bell.x;
      bellData[i * 4 + 1] = bell.y;
      bellData[i * 4 + 2] = bell.r;
      bellData[i * 4 + 3] = bell.glow;
    }
    gl.uniform4fv(gl.getUniformLocation(prog, "u_bells[0]"), bellData);
    gl.uniform1i(uNbells, nbells);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function teardown(): void {
    gl.deleteProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    gl.deleteVertexArray(vao);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }

  return { draw, resize, teardown };
}
