// render.ts — WebGL2 living magnetic-field-line field.
//
// A ping-pong feedback texture holds the field state. Each frame a SIM pass
// (1) advects the previous frame along a curl-noise flow field shaped by a
// cosmic dipole, (2) decays it, (3) injects thin iso-contour "field lines"
// whose count/width track density, and (4) accumulates a slow "memory" channel
// so a long storm folds into a persistent shimmering lattice. A DISPLAY pass
// colourises intensity+memory through teal → gold → magenta → white and blooms
// it. Calm = sparse cool drifting lines; storm = dense folding reconnection.
//
// Feedback prefers RGBA16F (EXT_color_buffer_float); if absent it falls back to
// RGBA8 (still a valid feedback path, just lower dynamic range). No WebGL2 at
// all → the renderer reports mode "none" and the page shows an on-brand notice.

export interface FieldState {
  time: number; // seconds, monotonic
  dt: number; // seconds since last frame (clamped)
  level: number; // 0..1 storm intensity (smoothed)
  memory: number; // 0..1 long-form accumulation (CPU side, biases colour)
  flow: number; // 0..1 flow velocity (solar-wind speed)
  thickness: number; // 0..1 line thickness/count (density)
  south: number; // 0..1 southward-Bz reconnection pressure
  flare: number; // 0..1 reconnection burst envelope (ramped ≥300ms)
  reduced: boolean; // prefers-reduced-motion
}

export interface FieldRenderer {
  draw(s: FieldState): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
  readonly mode: "webgl2-float" | "webgl2-rgba8" | "none";
}

const QUAD_VS = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/* Shared noise helpers. */
const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.02+vec2(3.1,1.7); a*=0.5; }
  return v;
}`;

/* SIM pass: advect + decay + inject field-line contours + memory. */
const SIM_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_prev;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dt;
uniform float u_level;
uniform float u_flow;
uniform float u_thick;
uniform float u_south;
uniform float u_flare;
uniform float u_reduced;
uniform float u_seed;
${NOISE}

// A streamfunction: large-scale cosmic dipole + storm-scaled turbulence.
// Field lines are its iso-contours; flow runs ALONG them (perp of gradient).
float streamfn(vec2 p){
  // dipole: two poles pull the field into arcing loops
  vec2 a = vec2(-0.55, 0.0);
  vec2 b = vec2( 0.55, 0.0);
  float dip = atan(p.y-a.y, p.x-a.x) - atan(p.y-b.y, p.x-b.x);
  // turbulence grows and folds as the storm builds
  float turbAmp = 0.35 + 1.6*u_level;
  float turbFreq = 1.4 + 3.0*u_level + 1.2*u_south;
  vec2 drift = vec2(u_time*0.02*(0.3+u_flow), u_time*0.013);
  float turb = fbm(p*turbFreq + drift + u_seed);
  float fold = u_level*u_level*fbm(p*turbFreq*2.3 - drift*1.5 + 7.0);
  return dip*0.5 + turbAmp*turb + 0.9*fold;
}

vec2 fieldDir(vec2 p){
  float e = 0.0035;
  float gx = streamfn(p+vec2(e,0.0)) - streamfn(p-vec2(e,0.0));
  float gy = streamfn(p+vec2(0.0,e)) - streamfn(p-vec2(0.0,e));
  // flow along contours = perpendicular to gradient
  vec2 d = vec2(gy, -gx);
  float l = length(d);
  return l>1e-5 ? d/l : vec2(1.0,0.0);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0)*2.4;

  vec2 dir = fieldDir(p);
  // advect previous frame back along the flow (semi-Lagrangian)
  float speed = (0.55 + 2.4*u_flow) * (u_reduced>0.5 ? 0.4 : 1.0);
  vec2 texel = 1.0/u_res;
  vec2 back = uv - dir * speed * texel * (60.0*u_dt);
  vec4 prev = texture(u_prev, back);

  float decay = mix(0.94, 0.975, u_level);
  if(u_reduced>0.5) decay = min(decay, 0.95);
  float inten = prev.r * decay;
  float mem = prev.g;

  // inject field lines as iso-contours of the streamfunction
  float sf = streamfn(p);
  float lineCount = 6.0 + 42.0*u_thick + 30.0*u_level; // density → more lines
  float band = fract(sf * lineCount);
  float d1 = abs(band-0.5);
  float w = 0.5 - (0.30 + 0.14*u_thick);   // thicker with density
  float line = smoothstep(w+0.06, w, d1);
  float emit = (0.18 + 0.9*u_level) * line;
  inten = max(inten, emit);

  // reconnection bursts on flare: bright arcs snapping across the field.
  // arcs are broad, ramped by the (already ≥300ms-smoothed) u_flare — no strobe.
  if(u_flare > 0.001){
    float ang = atan(p.y, p.x);
    float rad = length(p);
    float arc = 0.0;
    for(int k=0;k<3;k++){
      float fk = float(k);
      float sweep = sin(ang*(2.0+fk) + u_time*(1.2+0.4*fk) + fk*2.1);
      float shell = exp(-pow((rad-(0.5+0.5*fk))*3.0,2.0));
      arc += smoothstep(0.86,1.0,sweep)*shell;
    }
    inten = max(inten, arc * u_flare * 1.1);
  }

  // memory: slow deposit where the field is bright during a storm; slow bleed.
  float depo = max(0.0, u_level-0.2) * inten * 0.05;
  mem = mem*0.9985 + depo;
  if(u_reduced>0.5) mem *= 0.98;   // damp accumulation flashiness
  mem = clamp(mem, 0.0, 1.6);

  inten = clamp(inten, 0.0, 2.0);
  o = vec4(inten, mem, 0.0, 1.0);
}`;

/* DISPLAY pass: colourise intensity + memory, bloom, vignette, grain. */
const SHOW_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_field;
uniform vec2 u_res;
uniform float u_time;
uniform float u_level;
uniform float u_memory;
uniform float u_flare;
uniform float u_reduced;
${NOISE}

vec3 palette(float t){
  // teal-green → gold → magenta → white-hot
  vec3 teal = vec3(0.05,0.42,0.40);
  vec3 gold = vec3(0.95,0.72,0.22);
  vec3 mag  = vec3(0.92,0.20,0.70);
  vec3 white= vec3(1.0,0.97,0.98);
  t = clamp(t,0.0,1.0);
  vec3 c;
  if(t<0.4) c = mix(teal, gold, smoothstep(0.0,0.4,t));
  else if(t<0.75) c = mix(gold, mag, smoothstep(0.4,0.75,t));
  else c = mix(mag, white, smoothstep(0.75,1.0,t));
  return c;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 texel = 1.0/u_res;

  // small bloom: sample neighbours
  float c = texture(u_field, uv).r;
  float m = texture(u_field, uv).g;
  float glow = 0.0;
  glow += texture(u_field, uv+vec2( texel.x*2.0,0.0)).r;
  glow += texture(u_field, uv+vec2(-texel.x*2.0,0.0)).r;
  glow += texture(u_field, uv+vec2(0.0, texel.y*2.0)).r;
  glow += texture(u_field, uv+vec2(0.0,-texel.y*2.0)).r;
  glow += texture(u_field, uv+texel*3.0).r;
  glow += texture(u_field, uv-texel*3.0).r;
  glow /= 6.0;

  float bright = c + glow*0.6;
  // memory adds a persistent underlattice that colours toward magenta/white
  float lattice = m*(0.5+0.5*u_memory);
  float tone = clamp(bright*0.9 + lattice*0.7, 0.0, 1.0);

  // palette position advances up the ramp as the storm builds + accumulates
  float pos = clamp(0.15 + 0.55*u_level + 0.35*u_memory, 0.0, 1.0)
              * (0.35 + 0.9*tone);
  vec3 col = palette(pos) * (0.25 + 1.7*tone);
  // reconnection flash lifts everything toward white (smooth, ramped)
  col += vec3(1.0,0.95,0.9) * u_flare * bright * 0.5;

  // deep-space background wash so calm isn't pure black
  vec3 bg = mix(vec3(0.01,0.02,0.035), vec3(0.02,0.04,0.05),
                fbm(uv*3.0 + u_time*0.01));
  col += bg;

  // vignette
  vec2 q = uv-0.5;
  float vig = smoothstep(1.15,0.35,length(q)*1.3);
  col *= vig;

  // subtle grain to kill banding (reduced when motion-averse)
  float g = (hash(uv*u_res + fract(u_time))-0.5)
            * (u_reduced>0.5 ? 0.015 : 0.03);
  col += g;

  // gentle filmic tone map
  col = col/(col+vec3(0.9));
  col = pow(col, vec3(0.85));
  o = vec4(col, 1.0);
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
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

const noneRenderer: FieldRenderer = {
  draw() {},
  resize() {},
  dispose() {},
  mode: "none",
};

export function makeFieldRenderer(
  canvas: HTMLCanvasElement,
  seed: number,
): FieldRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return noneRenderer;

  const floatOk = gl.getExtension("EXT_color_buffer_float") !== null;
  gl.getExtension("OES_texture_float_linear");

  const simProg = link(gl, QUAD_VS, SIM_FS);
  const showProg = link(gl, QUAD_VS, SHOW_FS);
  if (!simProg || !showProg) {
    if (simProg) gl.deleteProgram(simProg);
    if (showProg) gl.deleteProgram(showProg);
    return noneRenderer;
  }

  // fullscreen triangle
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const internalFormat = floatOk ? gl.RGBA16F : gl.RGBA8;
  const texType = floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  let simW = 2;
  let simH = 2;

  interface Target {
    tex: WebGLTexture;
    fbo: WebGLFramebuffer;
  }
  function makeTarget(): Target {
    const g = gl as WebGL2RenderingContext;
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texImage2D(
      g.TEXTURE_2D,
      0,
      internalFormat,
      simW,
      simH,
      0,
      g.RGBA,
      texType,
      null,
    );
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const fbo = g.createFramebuffer()!;
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(
      g.FRAMEBUFFER,
      g.COLOR_ATTACHMENT0,
      g.TEXTURE_2D,
      tex,
      0,
    );
    return { tex, fbo };
  }

  let a = makeTarget();
  let b = makeTarget();

  const uni = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const sU = {
    res: uni(simProg, "u_res"),
    time: uni(simProg, "u_time"),
    dt: uni(simProg, "u_dt"),
    level: uni(simProg, "u_level"),
    flow: uni(simProg, "u_flow"),
    thick: uni(simProg, "u_thick"),
    south: uni(simProg, "u_south"),
    flare: uni(simProg, "u_flare"),
    reduced: uni(simProg, "u_reduced"),
    seed: uni(simProg, "u_seed"),
    prev: uni(simProg, "u_prev"),
  };
  const dU = {
    res: uni(showProg, "u_res"),
    time: uni(showProg, "u_time"),
    level: uni(showProg, "u_level"),
    memory: uni(showProg, "u_memory"),
    flare: uni(showProg, "u_flare"),
    reduced: uni(showProg, "u_reduced"),
    field: uni(showProg, "u_field"),
  };

  const seedF = (seed % 997) / 13.0;

  function resize(w: number, h: number, dpr: number): void {
    const g = gl as WebGL2RenderingContext;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    // sim resolution capped for perf; feedback stays smooth at half-ish res
    const scale = Math.min(1, 900 / Math.max(canvas.width, canvas.height));
    simW = Math.max(2, Math.floor(canvas.width * scale));
    simH = Math.max(2, Math.floor(canvas.height * scale));
    g.deleteTexture(a.tex);
    g.deleteFramebuffer(a.fbo);
    g.deleteTexture(b.tex);
    g.deleteFramebuffer(b.fbo);
    a = makeTarget();
    b = makeTarget();
  }

  function draw(s: FieldState): void {
    const g = gl as WebGL2RenderingContext;
    // SIM: read a, write b
    g.useProgram(simProg);
    g.bindVertexArray(vao);
    g.bindFramebuffer(g.FRAMEBUFFER, b.fbo);
    g.viewport(0, 0, simW, simH);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, a.tex);
    g.uniform1i(sU.prev, 0);
    g.uniform2f(sU.res, simW, simH);
    g.uniform1f(sU.time, s.time);
    g.uniform1f(sU.dt, Math.min(0.05, s.dt));
    g.uniform1f(sU.level, s.level);
    g.uniform1f(sU.flow, s.flow);
    g.uniform1f(sU.thick, s.thickness);
    g.uniform1f(sU.south, s.south);
    g.uniform1f(sU.flare, s.flare);
    g.uniform1f(sU.reduced, s.reduced ? 1 : 0);
    g.uniform1f(sU.seed, seedF);
    g.drawArrays(g.TRIANGLES, 0, 3);

    // DISPLAY: read b (new state) → screen
    g.useProgram(showProg);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, canvas.width, canvas.height);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, b.tex);
    g.uniform1i(dU.field, 0);
    g.uniform2f(dU.res, canvas.width, canvas.height);
    g.uniform1f(dU.time, s.time);
    g.uniform1f(dU.level, s.level);
    g.uniform1f(dU.memory, s.memory);
    g.uniform1f(dU.flare, s.flare);
    g.uniform1f(dU.reduced, s.reduced ? 1 : 0);
    g.drawArrays(g.TRIANGLES, 0, 3);

    // swap
    const t = a;
    a = b;
    b = t;
  }

  function dispose(): void {
    const g = gl as WebGL2RenderingContext;
    g.deleteProgram(simProg);
    g.deleteProgram(showProg);
    g.deleteBuffer(vbo);
    g.deleteVertexArray(vao);
    g.deleteTexture(a.tex);
    g.deleteFramebuffer(a.fbo);
    g.deleteTexture(b.tex);
    g.deleteFramebuffer(b.fbo);
    const lose = g.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return {
    draw,
    resize,
    dispose,
    mode: floatOk ? "webgl2-float" : "webgl2-rgba8",
  };
}
