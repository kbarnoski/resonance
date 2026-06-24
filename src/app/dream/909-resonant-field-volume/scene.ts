// 909-resonant-field-volume — scene.ts
// GPU raymarched volumetric nebula (three.js fullscreen ShaderMaterial on an
// orthographic quad). The cloud's FORM is the timbre. Uniforms are driven from
// the feature pipeline; a uAge accumulator gives the field MEMORY so it evolves
// as a long-form nebula rather than a per-frame VU meter.
//
// WebGL-unavailable -> Canvas2D glow fallback running the SAME feature data.

import * as THREE from "three";
import { Features } from "./features";

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform float uAge;        // memory accumulator (0..~1+), warmth of the field
uniform float uRms;        // density & luminosity
uniform float uCentroid;   // brightness -> hue + glow altitude
uniform float uFlatness;   // noisy<->tonal -> domain-warp turbulence
uniform float uFlux;       // burst density injection
uniform float uBands[8];   // coarse spectral silhouette colouring depth

// --- value noise + fbm ---
float hash(vec3 p){
  p = fract(p*0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for(int i=0;i<5;i++){
    s += a*vnoise(p);
    p = p*2.02 + vec3(11.3,7.1,5.7);
    a *= 0.5;
  }
  return s;
}

// Density field: domain-warped fbm. Flatness drives turbulence; flux injects
// bursts; uAge thickens the long-form cloud.
float density(vec3 p){
  float t = uTime*0.05;
  // slow drift / parallax
  p += vec3(t*0.3, -t*0.18, t*0.12);
  // domain warp scaled by flatness (noisy = more turbulent)
  float warpAmt = 0.4 + uFlatness*1.6 + uFlux*0.8;
  vec3 q = p + warpAmt*vec3(
    fbm(p*1.2 + vec3(0.0, t, 0.0)),
    fbm(p*1.2 + vec3(5.2, 1.3, t)),
    fbm(p*1.2 + vec3(t, 9.2, 1.7)));
  float base = fbm(q*0.9);
  // altitude bias by brightness: bright sounds float the glow higher
  float alt = (p.y - (uCentroid-0.5)*2.5);
  float shell = 1.0 - smoothstep(0.0, 2.2, length(p)*0.7 + abs(alt)*0.5);
  float d = (base - (0.62 - uRms*0.28 - uAge*0.12)) ;
  d = max(0.0, d) * max(0.0, shell);
  return d * (0.7 + uAge*0.9);
}

// band-driven palette: deeper layers tinted by the spectral silhouette
vec3 palette(float depth01){
  // hue scrolls with brightness; uAge warms it
  float hue = 0.62 - uCentroid*0.42 + depth01*0.18 - uAge*0.05;
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0);
  vec3 dphase = vec3(0.0, 0.33, 0.66);
  vec3 col = a + b*cos(6.2831*(c*hue + dphase));
  // mix in band energy across depth
  int bi = int(clamp(depth01*8.0, 0.0, 7.0));
  float bandE = uBands[bi];
  col += vec3(bandE*0.5, bandE*0.3, bandE*0.6);
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  // camera
  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(uv, -1.45));
  // slow orbit so the nebula has parallax
  float a = uTime*0.03;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  ro.xz = rot*ro.xz;
  rd.xz = rot*rd.xz;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float t = 0.4;
  const int STEPS = 24; // modest for mobile headroom
  for(int i=0;i<STEPS;i++){
    vec3 pos = ro + rd*t;
    float d = density(pos);
    if(d > 0.001){
      float depth01 = clamp((3.0 - t)/3.0, 0.0, 1.0);
      vec3 c = palette(depth01);
      // luminosity tied to rms + age; flux flares it
      float lum = (0.35 + uRms*1.1 + uFlux*0.9) * (0.6 + uAge*0.8);
      float a2 = d * 0.5;
      col += trans * c * d * lum;
      trans *= (1.0 - a2);
      if(trans < 0.02) break;
    }
    t += 0.16 + (1.0-uRms)*0.04;
  }

  // subtle vignette + base wash so silence is never pure black
  float vig = smoothstep(1.3, 0.2, length(uv));
  vec3 baseWash = vec3(0.02, 0.025, 0.05) * (0.4 + uAge*0.6);
  col = col + baseWash;
  col *= vig;
  // gentle tonemap
  col = col / (1.0 + col);
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export interface FieldScene {
  resize(w: number, h: number, dpr: number): void;
  update(f: Features, age: number, dt: number): void;
  render(): void;
  dispose(): void;
  webgl: boolean;
}

/** Try to build the GPU raymarch scene; returns null if WebGL unavailable. */
export function createGpuScene(canvas: HTMLCanvasElement): FieldScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geom = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uAge: { value: 0 },
      uRms: { value: 0 },
      uCentroid: { value: 0.3 },
      uFlatness: { value: 0.5 },
      uFlux: { value: 0 },
      uBands: { value: new Float32Array(8) },
    },
  });
  const mesh = new THREE.Mesh(geom, material);
  scene.add(mesh);

  let time = 0;

  return {
    webgl: true,
    resize(w, h, dpr) {
      renderer.setPixelRatio(Math.min(dpr, 1.75));
      renderer.setSize(w, h, false);
      const px = renderer.getContext().drawingBufferWidth;
      const py = renderer.getContext().drawingBufferHeight;
      material.uniforms.uRes.value.set(px, py);
    },
    update(f, age, dt) {
      time += dt;
      const u = material.uniforms;
      u.uTime.value = time;
      u.uAge.value = age;
      u.uRms.value = f.rms;
      u.uCentroid.value = f.centroid;
      u.uFlatness.value = f.flatness;
      u.uFlux.value = f.flux;
      (u.uBands.value as Float32Array).set(f.bands);
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      geom.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/**
 * Canvas2D glow fallback — same feature data, never a blank screen. A handful of
 * radial blobs whose count/altitude/spread mirror the timbre mapping.
 */
export function createCanvas2DScene(
  canvas: HTMLCanvasElement
): FieldScene | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let w = 1;
  let h = 1;
  let time = 0;

  // Persistent blob field for smear/memory feel.
  return {
    webgl: false,
    resize(cw, ch, dpr) {
      const scale = Math.min(dpr, 1.75);
      canvas.width = Math.floor(cw * scale);
      canvas.height = Math.floor(ch * scale);
      w = canvas.width;
      h = canvas.height;
    },
    update(f, age, dt) {
      time += dt;
      drawGlow(ctx, w, h, f, age, time);
    },
    render() {
      /* drawing happens in update for 2D */
    },
    dispose() {
      /* nothing to dispose */
    },
  };
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  f: Features,
  age: number,
  time: number
) {
  // fade previous frame for a smear/memory trail (relaxes in silence).
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(2,3,8,${0.16 + (1 - age) * 0.1})`;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";
  const hue = 240 - f.centroid * 200; // brightness -> hue
  const count = Math.floor(6 + f.rms * 28 + f.flux * 20);
  const cx = w / 2;
  const cy = h * (0.62 - f.centroid * 0.3); // bright = higher glow altitude
  const spread = (0.1 + f.flatness * 0.45) * Math.min(w, h);
  const baseR = Math.min(w, h) * (0.05 + f.rms * 0.12 + age * 0.05);

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + time * 0.2;
    const rad = spread * (0.3 + Math.random() * 0.7);
    const x = cx + Math.cos(ang) * rad * (0.6 + Math.sin(time + i) * 0.4);
    const y = cy + Math.sin(ang) * rad * 0.5;
    const r = baseR * (0.5 + Math.random() * 0.8);
    const sat = 70 + f.flux * 30;
    const light = 45 + f.rms * 25;
    const alpha = 0.05 + f.rms * 0.12 + age * 0.05;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${hue + i * 4},${sat}%,${light}%,${alpha})`);
    g.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
