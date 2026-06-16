// WebGL2 renderer for the bronze field. A fullscreen fragment shader paints a
// near-black temple-dusk ground with heat-haze shimmer; each key is drawn as a
// rounded bronze bar with additive glow that flares when struck and bends with
// the child's drag. Returns null if WebGL2 is unavailable (caller falls back to
// Canvas2D).

export interface KeyView {
  // normalized [0..1] center, half-extents, current bend (-1..1), strike glow
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  bend: number; // vertical bend offset in normalized units
  glow: number; // 0..1 additive strike glow
  tune: number; // 0..1 how in-tune (1 = at laras pitch) -> calm
}

const VERT = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const MAX_KEYS = 8;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform float u_pelog;          // 0 slendro .. 1 pelog (shifts hue)
uniform int u_count;
uniform vec4 u_keys[${MAX_KEYS}]; // cx, cy, hw, hh
uniform vec4 u_dyn[${MAX_KEYS}];  // bend, glow, tune, _

// rounded box sdf
float sdRound(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r;
}
float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = uv; p.x *= aspect;

  // heat-haze shimmer warps the lookup slightly
  vec2 warp = vec2(
    noise(uv*6.0 + vec2(0.0, u_time*0.15)),
    noise(uv*6.0 + vec2(u_time*0.12, 0.0))
  ) - 0.5;
  vec2 sp = p + warp * 0.012;

  // temple-dusk ground: deep bronze-to-teal vertical gradient on near black
  vec3 teal = vec3(0.02, 0.06, 0.07);
  vec3 bronzeDark = vec3(0.07, 0.045, 0.02);
  vec3 col = mix(bronzeDark, teal, smoothstep(0.0, 1.0, uv.y)) * 0.5;
  // a soft pool of warm light low-center
  float pool = exp(-pow(distance(uv, vec2(0.5,0.32)),2.0)*5.0);
  col += vec3(0.10,0.06,0.02) * pool;

  // pelog tilts the whole field a touch cooler/tenser
  col = mix(col, col*vec3(0.85,0.95,1.08), u_pelog*0.5);

  float ax = aspect;
  for(int i=0;i<${MAX_KEYS};i++){
    if(i>=u_count) break;
    vec4 k = u_keys[i];
    vec4 d = u_dyn[i];
    vec2 c = vec2(k.x*ax, k.y + d.x); // center incl. bend
    vec2 b = vec2(k.z*ax, k.w);
    float dist = sdRound(sp - c, b, 0.02);

    // bar body: warm bronze, brighter when in tune (calm glow)
    float body = smoothstep(0.004, -0.004, dist);
    float sheen = 0.5 + 0.5*sin((sp.y - c.y)*60.0 + u_time*0.6);
    vec3 bronze = mix(vec3(0.34,0.21,0.07), vec3(0.62,0.43,0.16), sheen);
    // out-of-tune bars flicker restlessly; in-tune bars are steady
    float restless = (1.0 - d.z);
    float flick = 1.0 + restless*0.25*sin(u_time*22.0 + float(i));
    col = mix(col, bronze*flick, body*0.92);

    // additive glow halo around the bar; flares on strike, calmer when in tune
    float halo = exp(-max(dist,0.0)*9.0);
    float strikeGlow = d.y;
    vec3 glowCol = mix(vec3(0.9,0.55,0.18), vec3(1.0,0.82,0.42), d.z);
    col += glowCol * halo * (0.25 + strikeGlow*1.4);

    // a thin in-tune crown line: when settled, a clean gold rim appears
    float rim = smoothstep(0.012,0.0,abs(dist)) * d.z;
    col += vec3(1.0,0.85,0.5) * rim * 0.5;
  }

  // gentle vignette + fine grain so a silent glance still looks alive
  float vig = smoothstep(1.2, 0.2, distance(uv, vec2(0.5)));
  col *= 0.55 + 0.45*vig;
  col += (noise(uv*u_res.xy*0.5 + u_time)-0.5)*0.015;

  o = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader: " + log);
  }
  return sh;
}

export interface GlRenderer {
  render: (
    keys: KeyView[],
    timeSec: number,
    pelog: number,
    w: number,
    h: number,
  ) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function makeGlRenderer(canvas: HTMLCanvasElement): GlRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "link failed");
    }
  } catch {
    return null;
  }

  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(program, "a_pos");

  const uRes = gl.getUniformLocation(program, "u_res");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uPelog = gl.getUniformLocation(program, "u_pelog");
  const uCount = gl.getUniformLocation(program, "u_count");
  const uKeys = gl.getUniformLocation(program, "u_keys");
  const uDyn = gl.getUniformLocation(program, "u_dyn");

  const keyBuf = new Float32Array(MAX_KEYS * 4);
  const dynBuf = new Float32Array(MAX_KEYS * 4);

  const resize = (w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  };

  const render = (
    keys: KeyView[],
    timeSec: number,
    pelog: number,
    w: number,
    h: number,
  ) => {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const n = Math.min(keys.length, MAX_KEYS);
    for (let i = 0; i < n; i++) {
      const k = keys[i];
      keyBuf[i * 4] = k.cx;
      keyBuf[i * 4 + 1] = k.cy;
      keyBuf[i * 4 + 2] = k.hw;
      keyBuf[i * 4 + 3] = k.hh;
      dynBuf[i * 4] = k.bend;
      dynBuf[i * 4 + 1] = k.glow;
      dynBuf[i * 4 + 2] = k.tune;
      dynBuf[i * 4 + 3] = 0;
    }
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, timeSec);
    gl.uniform1f(uPelog, pelog);
    gl.uniform1i(uCount, n);
    gl.uniform4fv(uKeys, keyBuf);
    gl.uniform4fv(uDyn, dynBuf);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    gl.deleteBuffer(buf);
    gl.deleteProgram(program);
  };

  return { render, resize, dispose };
}
