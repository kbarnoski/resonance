// gl.ts — raw WebGL2 full-screen fragment shader (GLSL ES 3.00).
//
// Renders a glowing deep cave / ocean abyss. The deep's colour and motion
// shift with the migrating drone's current key (hue + warmth uniforms come
// from harmony.deepLookAt). Bioluminescent blues/teals/violets, drifting
// toward warm amber ONLY at the home resolution. Pads are drawn as glowing
// stones whose tint/pulse the page feeds in via uniforms.
//
// If WebGL2 is unavailable, makeRenderer returns null and the page shows a
// graceful notice — the audio still runs.

const VERT = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_hue;     // current deep hue (degrees)
uniform float u_warmth;  // 0..1, warm amber bias at home
uniform float u_energy;  // recent tap energy 0..1 (brightens field)

const int MAX_PADS = 8;
uniform int   u_padCount;
uniform vec2  u_padPos[MAX_PADS];   // normalized 0..1 (y down)
uniform float u_padR[MAX_PADS];     // radius in normalized units
uniform float u_padHit[MAX_PADS];   // 0..1 hit flash
uniform float u_padTen[MAX_PADS];   // 0..1 functional tension (recontext)

vec3 hsl2rgb(float h, float s, float l){
  h = mod(h,360.0)/360.0;
  vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
}

// cheap value noise
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, amp=0.5;
  for(int i=0;i<5;i++){ v+=amp*noise(p); p*=2.02; amp*=0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p  = uv;
  p.y = 1.0 - p.y;                 // y down to match pad coords
  float aspect = u_res.x / u_res.y;

  // ── deep abyss field ──────────────────────────────────────────────
  vec2 q = uv;
  q.x *= aspect;
  float t = u_time * 0.05;
  // slow rising murk + caustic shimmer
  float murk = fbm(q*2.4 + vec2(0.0, -t*1.6));
  float caustic = fbm(q*5.0 + vec2(t*0.7, t*1.1));
  float depth = uv.y;              // top brighter, bottom darker abyss

  float baseL = mix(0.02, 0.12, depth);     // dark deep, faint glow up top
  baseL += murk*0.05 + caustic*0.04;
  baseL *= 0.7 + u_energy*0.6;

  // saturation/light biased toward warm amber only at home (high warmth)
  float sat = mix(0.85, 0.55, u_warmth);
  float hue = u_hue;
  // warmth pulls hue toward amber (~40deg) and lifts light a touch
  float warmHue = 40.0;
  float dh = warmHue - hue;
  if(dh>180.0) dh-=360.0; if(dh<-180.0) dh+=360.0;
  hue = hue + dh * (u_warmth*0.35);
  baseL += u_warmth*0.03;

  vec3 col = hsl2rgb(hue, sat, clamp(baseL,0.0,0.6));

  // distant bioluminescent motes
  float motes = pow(fbm(q*9.0 + vec2(0.0,-t*3.0)), 6.0) * 2.2;
  col += hsl2rgb(hue+30.0, 0.6, 0.5) * motes * (0.4+u_energy*0.5);

  // god-ray-ish vertical glow from the surface
  float ray = smoothstep(0.0,1.0,1.0-depth);
  col += hsl2rgb(hue+10.0,0.4,0.5) * ray*ray*0.06;

  // ── glowing pad stones ────────────────────────────────────────────
  for(int i=0;i<MAX_PADS;i++){
    if(i>=u_padCount) break;
    vec2 c = u_padPos[i];
    vec2 d = p - c;
    d.x *= aspect;
    float r = u_padR[i];
    float dist = length(d);

    float hit = u_padHit[i];
    float ten = u_padTen[i];

    // pad core colour: shifts with tension (home=warm/teal, tension=violet)
    // tension recolours the SAME pad as the floor migrates — the visual of
    // functional recontextualization.
    float padHue = mix(hue+8.0, hue+95.0, ten);
    float padSat = 0.7;
    // breathing idle glow + strong flash on hit
    float breathe = 0.5 + 0.5*sin(u_time*1.3 + float(i)*1.7);
    float idle = smoothstep(r*1.25, r*0.2, dist) * (0.18 + 0.10*breathe);
    float flash = smoothstep(r*2.4, r*0.0, dist) * hit * 1.4;
    float rim = smoothstep(r, r*0.86, dist) - smoothstep(r*0.86, r*0.7, dist);

    vec3 padCol = hsl2rgb(padHue, padSat, 0.6);
    col += padCol * idle;
    col += hsl2rgb(padHue+20.0, 0.7, 0.7) * flash;
    col += padCol * max(rim,0.0) * (0.5 + hit*0.8);
  }

  // gentle vignette + tonemap
  float vig = smoothstep(1.3, 0.2, length((uv-0.5)*vec2(aspect,1.0)));
  col *= mix(0.55, 1.0, vig);
  col = col/(col+vec3(0.7));            // soft filmic clamp, no harsh whites
  col = pow(col, vec3(0.85));

  outColor = vec4(col, 1.0);
}
`;

export interface PadVisual {
  x: number; // normalized 0..1
  y: number; // normalized 0..1 (y down)
  r: number; // normalized radius
  hit: number; // 0..1
  ten: number; // 0..1
}

export interface Renderer {
  draw(
    time: number,
    hue: number,
    warmth: number,
    energy: number,
    pads: PadVisual[],
  ): void;
  resize(): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

export function makeRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  let vs: WebGLShader;
  let fs: WebGLShader;
  let prog: WebGLProgram | null;
  try {
    vs = compile(gl, gl.VERTEX_SHADER, VERT);
    fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  } catch {
    return null;
  }
  prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, "u_res"),
    time: gl.getUniformLocation(prog, "u_time"),
    hue: gl.getUniformLocation(prog, "u_hue"),
    warmth: gl.getUniformLocation(prog, "u_warmth"),
    energy: gl.getUniformLocation(prog, "u_energy"),
    padCount: gl.getUniformLocation(prog, "u_padCount"),
    padPos: gl.getUniformLocation(prog, "u_padPos"),
    padR: gl.getUniformLocation(prog, "u_padR"),
    padHit: gl.getUniformLocation(prog, "u_padHit"),
    padTen: gl.getUniformLocation(prog, "u_padTen"),
  };

  const MAX_PADS = 8;
  const posArr = new Float32Array(MAX_PADS * 2);
  const rArr = new Float32Array(MAX_PADS);
  const hitArr = new Float32Array(MAX_PADS);
  const tenArr = new Float32Array(MAX_PADS);

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

  const draw = (
    time: number,
    hue: number,
    warmth: number,
    energy: number,
    pads: PadVisual[],
  ) => {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.hue, hue);
    gl.uniform1f(u.warmth, warmth);
    gl.uniform1f(u.energy, energy);
    const n = Math.min(pads.length, MAX_PADS);
    gl.uniform1i(u.padCount, n);
    for (let i = 0; i < n; i++) {
      posArr[i * 2] = pads[i].x;
      posArr[i * 2 + 1] = pads[i].y;
      rArr[i] = pads[i].r;
      hitArr[i] = pads[i].hit;
      tenArr[i] = pads[i].ten;
    }
    gl.uniform2fv(u.padPos, posArr);
    gl.uniform1fv(u.padR, rArr);
    gl.uniform1fv(u.padHit, hitArr);
    gl.uniform1fv(u.padTen, tenArr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
    if (prog) gl.deleteProgram(prog);
    prog = null;
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  };

  return { draw, resize, dispose };
}
