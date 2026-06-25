// webgl-fallback.ts — raw WebGL2 fragment-shader version of the Tonnetz room.
// Used when WebGPU is unavailable. Same warm lattice; GLSL ES 3.00 port of the
// WGSL shader. If WebGL2 is also unavailable, the caller drops to a DOM view.

import type { RoomState } from "./gpu";

const VERT = `#version 300 es
precision highp float;
const vec2 verts[4] = vec2[4](vec2(-1.,-1.), vec2(1.,-1.), vec2(-1.,1.), vec2(1.,1.));
out vec2 vUv;
void main(){
  vec2 p = verts[gl_VertexID];
  vUv = p*0.5+0.5;
  gl_Position = vec4(p,0.,1.);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform vec4 uData0;  // focalX, focalY, nearEnergy, motion
uniform vec4 uNodeA;  // aX, aY, bX, bY
uniform vec4 uNodeBC; // cX, cY, time, glow
uniform vec4 uMisc;   // aspect, hueShift, pad, pad

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  return length(pa-ba*h);
}
void main(){
  float aspect=uMisc.x;
  vec2 uv=vUv;
  vec2 p=uv; p.x=(p.x-0.5)*aspect+0.5;
  float nearE=uData0.z; float motion=uData0.w; float t=uNodeBC.z; float glow=uNodeBC.w;

  vec3 col=mix(vec3(0.03,0.045,0.055), vec3(0.05,0.035,0.03), uv.y);
  vec2 hazeC=vec2(0.5,0.32);
  float hd=length((p-hazeC)*vec2(1.0,1.3));
  col+=vec3(0.16,0.09,0.05)*exp(-hd*hd*5.5)*(0.5+0.6*nearE);

  float gs=0.14;
  vec2 lp=p/gs; lp.x+=lp.y*0.5;
  vec2 cell=floor(lp); vec2 f=fract(lp);
  float nodeGlow=0.0;
  for(int dy=-1;dy<=1;dy++){
    for(int dx=-1;dx<=1;dx++){
      vec2 g=cell+vec2(float(dx),float(dy));
      vec2 np=g+vec2(0.5);
      float d=length(p-vec2((np.x-np.y*0.5)*gs, np.y*gs));
      float tw=0.6+0.4*sin(t*0.6+hash(g)*6.28);
      nodeGlow+=smoothstep(0.02,0.0,d)*tw;
    }
  }

  vec2 A=uNodeA.xy; vec2 B=uNodeA.zw; vec2 C=uNodeBC.xy;
  float triEdge=min(segDist(p,A,B), min(segDist(p,B,C), segDist(p,C,A)));
  float edge=smoothstep(0.012,0.0,triEdge)*(0.7+0.8*glow);
  vec2 centroid=(A+B+C)/3.0;
  float fillD=length(p-centroid);
  float fill=exp(-fillD*fillD*22.0)*(0.25+0.9*nearE)*(0.6+0.7*glow);

  vec2 focal=uData0.xy;
  vec2 fp=vec2((focal.x-0.5)*aspect+0.5, focal.y);
  float fd=length(p-fp);
  float focalGlow=exp(-fd*fd*36.0)*(0.6+1.2*nearE);

  vec3 amber=vec3(1.0,0.62,0.28);
  vec3 rose=vec3(1.0,0.42,0.5);
  vec3 teal=vec3(0.3,0.85,0.78);
  float hueShift=uMisc.y;

  col+=amber*nodeGlow*0.6;
  col+=mix(rose,amber,hueShift)*edge*1.4;
  col+=mix(rose,amber,hueShift)*fill*1.2;
  col+=mix(teal,amber,0.5)*focalGlow*1.5;

  float sh=hash(floor(p*220.0)+floor(vec2(t*8.0)));
  col+=vec3(0.5,0.4,0.3)*sh*motion*0.12;

  float vd=length(uv-vec2(0.5));
  col*=1.0-vd*vd*0.7;
  col=col/(col+vec3(0.85));
  col=pow(col,vec3(0.92));
  frag=vec4(col,1.0);
}`;

export interface TonnetzGl {
  readonly kind: "webgl2";
  render(state: RoomState): void;
  resize(): void;
  dispose(): void;
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

export function initTonnetzGl(canvas: HTMLCanvasElement): TonnetzGl | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;
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

  const uData0 = gl.getUniformLocation(prog, "uData0");
  const uNodeA = gl.getUniformLocation(prog, "uNodeA");
  const uNodeBC = gl.getUniformLocation(prog, "uNodeBC");
  const uMisc = gl.getUniformLocation(prog, "uMisc");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  sizeCanvas();

  return {
    kind: "webgl2",
    render(s: RoomState) {
      sizeCanvas();
      const aspect = canvas.width / Math.max(1, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform4f(uData0, s.focalX, s.focalY, s.nearEnergy, s.motion);
      gl.uniform4f(uNodeA, s.ax, s.ay, s.bx, s.by);
      gl.uniform4f(uNodeBC, s.cx, s.cy, s.time, s.glow);
      gl.uniform4f(uMisc, aspect, s.hueShift, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    resize() {
      sizeCanvas();
    },
    dispose() {
      try {
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteVertexArray(vao);
      } catch {
        /* noop */
      }
    },
  };
}
