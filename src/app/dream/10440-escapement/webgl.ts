// ─────────────────────────────────────────────────────────────────────────────
// webgl.ts — the WebGL2 substrate for Escapement.
//
//   The visible MECHANISM is the score. A single #version 300 es fragment shader
//   over a fullscreen quad draws, as signed-distance fields, a whole anchor
//   escapement in brass / steel / graphite:
//
//     • a toothed ESCAPE WHEEL that steps forward one tooth per release,
//     • a rocking ANCHOR whose two pallets alternately CATCH and RELEASE the
//       wheel at the top-left / top-right,
//     • a swinging PENDULUM (rod + bob) that drives the anchor,
//     • three secondary HAMMERS on the right that tap resonant plates,
//     • soft strike-FLASHES at each catch/release and each hammer tap.
//
//   Nothing depends on float render-targets or extensions, so it survives
//   hostile GPUs. Everything is deterministic given the uniforms the JS loop
//   feeds it — the geometry is a pure function of pendulum angle + wheel angle.
//
//   Palette: precise clockwork — warm BRASS, cool STEEL, dark GRAPHITE ground.
//   No molten/amber glow, no cosmic-void indigo, no clinical pure white.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_FLASH = 16;

/** Layout constants shared with the JS loop (world space: y ∈ [-1,1], x scaled
 *  by aspect). Kept in sync with the `const`s inside the fragment shader. */
export const LAYOUT = {
  pivot: [0.0, 0.9] as [number, number],
  rodLen: 1.12,
  bobR: 0.135,
  amp: 0.3, // pendulum swing amplitude (rad)
  wheelC: [0.0, -0.02] as [number, number],
  wheelR: 0.34,
  teeth: 24,
  // pallet contact points near the wheel's top-left / top-right rim
  palletL: [-0.105, 0.303] as [number, number],
  palletR: [0.105, 0.303] as [number, number],
  hamPivot: [
    [0.98, 0.62],
    [1.14, 0.1],
    [1.0, -0.5],
  ] as [number, number][],
  hamPlate: [
    [0.6, 0.5],
    [0.86, 0.1],
    [0.62, -0.36],
  ] as [number, number][],
};

export interface SceneUniforms {
  time: number;
  theta: number; // pendulum angle (rad, +right)
  anchorAngle: number; // anchor rock (rad)
  wheelRot: number; // escape-wheel rotation (rad)
  hamHit: [number, number, number]; // 0..1 strike animation per hammer
  gravity: number; // 0..1 tempo — subtle motion-blur / glow of the wheel
  /** flat [x, y, intensity, kind] × MAX_FLASH. kind: 0 tick, 1 tock, 2 hammer. */
  flashes: Float32Array;
  flashCount: number;
}

export interface SceneBackend {
  ok: boolean;
  render(u: SceneUniforms): void;
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
uniform float uTheta;
uniform float uAnchorAngle;
uniform float uWheelRot;
uniform float uGravity;
uniform vec3 uHamHit;
uniform vec2 uHamPivot[3];
uniform vec2 uHamPlate[3];
uniform int uFlashCount;
uniform vec4 uFlashes[${MAX_FLASH}];

const float PI = 3.14159265;
const vec2 PIVOT = vec2(0.0, 0.9);
const float ROD_LEN = 1.12;
const float BOB_R = 0.135;
const vec2 WHEEL_C = vec2(0.0, -0.02);
const float WHEEL_R = 0.34;
const float TOOTH_H = 0.05;
const int TEETH = 24;

// ── materials ────────────────────────────────────────────────────────────────
const vec3 BRASS = vec3(0.80, 0.61, 0.29);
const vec3 STEEL = vec3(0.60, 0.65, 0.72);
const vec3 GRAPH = vec3(0.05, 0.055, 0.066);

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

float sdCircle(vec2 p, vec2 c, float r){ return length(p-c)-r; }

float sdSeg(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p-a, ba = b-a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}

// toothed escape-wheel body (filled disk with a radial ratchet profile)
float sdWheel(vec2 p){
  vec2 q = p - WHEEL_C;
  float r = length(q);
  float a = atan(q.y, q.x) - uWheelRot;
  float saw = fract(a * float(TEETH) / (2.0*PI));
  float rr = WHEEL_R + TOOTH_H * saw; // ramp then drop → ratchet teeth
  return r - rr;
}

// composite one opaque shape over the running colour
vec3 paint(vec3 col, float d, vec3 base, float shade, float rimAmt){
  float aa = fwidth(d)*1.25 + 1e-4;
  float m = smoothstep(aa, -aa, d);
  float rim = (1.0 - smoothstep(0.0, aa*3.0, abs(d))) * rimAmt;
  vec3 c = clamp(base*shade + rim, 0.0, 1.4);
  return mix(col, c, m);
}

void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  p.x *= uAspect;

  vec2 Ldir = normalize(vec2(-0.4, 0.75)); // key light, upper-left

  // ── graphite backplate with a faint machined vignette ────────────────────
  float vig = smoothstep(1.9, 0.2, length(p*vec2(0.72,1.0)));
  float grain = 0.5 + 0.5*sin(p.x*140.0)*sin(p.y*90.0);
  vec3 col = GRAPH * (0.5 + 0.6*vig) + vec3(0.012)*grain*vig;

  // ── escape wheel ─────────────────────────────────────────────────────────
  {
    float d = sdWheel(p);
    vec2 q = p - WHEEL_C;
    vec2 n = normalize(q + 1e-5);
    float ndl = 0.5 + 0.5*dot(n, Ldir);
    // brushed-metal ring: brightness rides the (rotating) polar angle
    float brush = 0.5 + 0.5*cos((atan(q.y,q.x) - uWheelRot)*float(TEETH));
    float shade = 0.55 + 0.6*ndl + 0.18*brush + uGravity*0.05;
    col = paint(col, d, STEEL*0.9 + BRASS*0.1, shade, 0.35);
    // hub
    float hub = sdCircle(p, WHEEL_C, 0.11);
    col = paint(col, hub, BRASS, 0.55 + 0.7*ndl, 0.4);
    float core = sdCircle(p, WHEEL_C, 0.032);
    col = paint(col, core, GRAPH*3.0, 0.9, 0.3);
    // spokes
    for(int s=0; s<5; s++){
      float a = uWheelRot + float(s)*(2.0*PI/5.0);
      vec2 tip = WHEEL_C + vec2(cos(a),sin(a))*(WHEEL_R-0.02);
      float sp = sdSeg(p, WHEEL_C, tip, 0.02);
      col = paint(col, sp, STEEL, 0.5 + 0.5*ndl, 0.25);
    }
  }

  // ── anchor + two pallets (rocks with the pendulum) ───────────────────────
  {
    mat2 R = rot(uAnchorAngle);
    vec2 tipL = PIVOT + R*vec2(-0.16, -0.60);
    vec2 tipR = PIVOT + R*vec2( 0.16, -0.60);
    float armL = sdSeg(p, PIVOT, tipL, 0.026);
    float armR = sdSeg(p, PIVOT, tipR, 0.026);
    float arms = min(armL, armR);
    col = paint(col, arms, STEEL*1.05, 0.7, 0.45);
    // pallet jewels at the tips — glint on the one currently dipping in
    float dipL = clamp(-uAnchorAngle*3.0, 0.0, 1.0);
    float dipR = clamp( uAnchorAngle*3.0, 0.0, 1.0);
    float pl = sdCircle(p, tipL, 0.03);
    float pr = sdCircle(p, tipR, 0.03);
    col = paint(col, pl, BRASS, 0.7 + dipL*0.8, 0.4 + dipL*0.5);
    col = paint(col, pr, BRASS, 0.7 + dipR*0.8, 0.4 + dipR*0.5);
    // anchor hub
    float ah = sdCircle(p, PIVOT, 0.05);
    col = paint(col, ah, STEEL, 0.8, 0.4);
  }

  // ── pendulum rod + bob ───────────────────────────────────────────────────
  {
    vec2 bob = PIVOT + ROD_LEN*vec2(sin(uTheta), -cos(uTheta));
    float rod = sdSeg(p, PIVOT, bob, 0.017);
    col = paint(col, rod, STEEL, 0.75, 0.4);
    float d = sdCircle(p, bob, BOB_R);
    vec2 n = normalize(p - bob + 1e-5);
    float ndl = 0.5 + 0.5*dot(n, Ldir);
    float spec = pow(max(dot(n, Ldir),0.0), 8.0);
    col = paint(col, d, BRASS, 0.5 + 0.85*ndl + spec*0.6, 0.5);
    // engraved ring on the bob
    float ring = abs(sdCircle(p, bob, BOB_R*0.6)) - 0.006;
    col = paint(col, ring, BRASS*0.6, 0.6 + 0.4*ndl, 0.2);
  }

  // ── three secondary hammers + resonant plates ────────────────────────────
  for(int i=0;i<3;i++){
    vec2 pv = uHamPivot[i];
    vec2 pl = uHamPlate[i];
    float hit = clamp(uHamHit[i], 0.0, 1.0);
    vec2 dir = normalize(pl - pv);
    float dlen = length(pl - pv);
    vec2 head = pv + dir * dlen * mix(0.5, 0.92, hit);
    // plate
    float plate = sdCircle(p, pl, 0.05);
    float pShade = 0.6 + hit*1.1;
    col = paint(col, plate, BRASS, pShade, 0.4 + hit*0.6);
    // hammer arm + head
    float arm = sdSeg(p, pv, head, 0.02);
    col = paint(col, arm, STEEL, 0.55 + hit*0.4, 0.35);
    float hd = sdCircle(p, head, 0.038);
    col = paint(col, hd, STEEL*1.1, 0.6 + hit*0.5, 0.45);
    // pivot pin
    float pin = sdCircle(p, pv, 0.028);
    col = paint(col, pin, BRASS, 0.7, 0.35);
  }

  // ── soft strike-flashes (additive, brief, never a strobe) ────────────────
  for(int i=0;i<${MAX_FLASH};i++){
    if(i>=uFlashCount) break;
    vec4 f = uFlashes[i];
    vec2 c = f.xy;
    float inten = f.z;
    float kind = f.w;
    vec3 hue = kind < 0.5 ? vec3(1.0, 0.82, 0.5)     // tick — warm brass
             : kind < 1.5 ? vec3(0.68, 0.82, 1.0)     // tock — cool steel
                          : vec3(0.95, 0.88, 0.72);    // hammer — pale gold
    float dist = length(p - c);
    float core = exp(-pow(dist/0.05, 2.0));
    float halo = exp(-dist/0.14) * 0.5;
    col += hue * (core*1.2 + halo) * inten;
  }

  // gentle roll-off so highlights never clip harshly (no strobe, no glare)
  col = col / (1.0 + col*0.5);
  col = pow(max(col, 0.0), vec3(0.9));

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
    console.warn("escapement shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the WebGL2 backend, or return { ok:false } if unavailable. */
export function makeSceneBackend(canvas: HTMLCanvasElement): SceneBackend {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });

  const dead: SceneBackend = {
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
    console.warn("escapement link:", gl.getProgramInfoLog(prog));
    return dead;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

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
  const uTheta = gl.getUniformLocation(prog, "uTheta");
  const uAnchorAngle = gl.getUniformLocation(prog, "uAnchorAngle");
  const uWheelRot = gl.getUniformLocation(prog, "uWheelRot");
  const uGravity = gl.getUniformLocation(prog, "uGravity");
  const uHamHit = gl.getUniformLocation(prog, "uHamHit");
  const uHamPivot = gl.getUniformLocation(prog, "uHamPivot");
  const uHamPlate = gl.getUniformLocation(prog, "uHamPlate");
  const uFlashCount = gl.getUniformLocation(prog, "uFlashCount");
  const uFlashes = gl.getUniformLocation(prog, "uFlashes");

  gl.useProgram(prog);

  // static hammer geometry uploaded once
  const pivotFlat = new Float32Array(6);
  const plateFlat = new Float32Array(6);
  for (let i = 0; i < 3; i++) {
    pivotFlat[i * 2] = LAYOUT.hamPivot[i][0];
    pivotFlat[i * 2 + 1] = LAYOUT.hamPivot[i][1];
    plateFlat[i * 2] = LAYOUT.hamPlate[i][0];
    plateFlat[i * 2 + 1] = LAYOUT.hamPlate[i][1];
  }
  gl.uniform2fv(uHamPivot, pivotFlat);
  gl.uniform2fv(uHamPlate, plateFlat);

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
    render(u: SceneUniforms) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, u.time);
      gl.uniform1f(uAspect, W / H);
      gl.uniform1f(uTheta, u.theta);
      gl.uniform1f(uAnchorAngle, u.anchorAngle);
      gl.uniform1f(uWheelRot, u.wheelRot);
      gl.uniform1f(uGravity, u.gravity);
      gl.uniform3f(uHamHit, u.hamHit[0], u.hamHit[1], u.hamHit[2]);
      gl.uniform1i(uFlashCount, Math.min(u.flashCount, MAX_FLASH));
      gl.uniform4fv(uFlashes, u.flashes);
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
