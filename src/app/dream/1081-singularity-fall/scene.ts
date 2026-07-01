// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the Singularity Fall (three.js).
//
//   You fall toward a Schwarzschild black hole. The background starfield is
//   sampled through a fullscreen LENSING fragment shader: each screen ray is
//   bent toward the shadow center by a deflection angle ∝ 1/impact-parameter
//   (an approximation of Schwarzschild light-bending), producing an Einstein
//   ring and a black shadow disk. An accretion disk ring is Doppler-beamed
//   (approaching side brighter/bluer, receding side dimmer/redder). A swarm of
//   GPU points spirals inward on geodesic-ish paths, stretched and reddened
//   near the horizon, vanishing at the shadow.
//
//   The camera FALLS inward over a long arc; device tilt / keyboard steers the
//   infall vector. The horizon-crossing white-out is a slow luminance RAMP
//   driven from React (safeFlicker-bounded there), never a strobe.
//
//   This is a real-time browser APPROXIMATION — not a geodesic integrator.
//   Reference: Interstellar "Gargantua" DNGR renderer (James, von Tunzelmann,
//   Franklin, Thorne, 2015) + 2026 Three.js/WebGPU "Singularity" raymarch pieces.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const PARTICLE_COUNT = 4000;

/** Probe for a usable WebGL context before constructing the renderer. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// The lensing pass is a fullscreen triangle. We reconstruct a view ray per
// pixel, then bend it toward the hole and sample a procedural starfield in that
// direction. This keeps everything on the GPU and lets us drive an Einstein
// ring + shadow entirely from `uDeflect` / `uShadow`.
const LENS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uDeflect;   // strength of ray bending (grows on approach)
uniform float uShadow;    // apparent shadow radius in screen units
uniform float uRing;      // photon-ring brightness
uniform float uDiskTilt;  // accretion disk foreshortening
uniform float uDoppler;   // Doppler-beaming strength on the disk
uniform vec2  uSteer;     // singularity offset from screen center (steering)
uniform float uReddish;   // global red-shift of the sky near horizon
uniform float uLuma;      // white-out luminance ramp (>=1 washes toward white)

// hash / value-noise starfield sampled by a bent direction.
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 starfield(vec2 dir){
  // Tile the bent direction and drop sparse bright stars.
  vec3 col = vec3(0.0);
  for (float k = 1.0; k <= 3.0; k += 1.0){
    vec2 g = dir * (60.0 * k);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float h = hash21(cell + k * 17.0);
    if (h > 0.955){
      vec2 star = vec2(hash21(cell + 3.0), hash21(cell + 9.0));
      float d = length(f - star);
      float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 30.0);
      float b = smoothstep(0.09, 0.0, d) * tw / k;
      // faint colour variety
      vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash21(cell + 21.0));
      col += b * tint;
    }
  }
  // dim nebular wash so the void is not pure black
  float neb = 0.04 * (0.5 + 0.5 * sin(dir.x * 8.0) * cos(dir.y * 7.0));
  col += vec3(0.02, 0.03, 0.06) + neb * vec3(0.10, 0.05, 0.14);
  return col;
}

void main(){
  // Screen coord centred on the (steered) singularity, aspect-corrected.
  vec2 p = (vUv - 0.5);
  p.x *= uAspect;
  vec2 c = p - uSteer;
  float b = length(c);              // impact parameter (screen units)
  vec2 dirToHole = c / max(b, 1e-4);

  // Schwarzschild-ish deflection: bend the ray TOWARD the hole by ~ k / b.
  // Near the shadow the bend blows up (Einstein ring); far away it fades.
  float bend = uDeflect / (b + 0.02);
  // The sampled sky direction is the screen ray pushed toward the hole.
  vec2 skyDir = c - dirToHole * bend * 0.15;

  vec3 col = starfield(skyDir + vec2(uTime * 0.003, 0.0));

  // Photon ring: a bright thin ring just outside the shadow where deflection
  // piles rays up. Blinding-white, the hottest thing on screen.
  float ringR = uShadow * 1.12;
  float ring = smoothstep(0.05, 0.0, abs(b - ringR)) * uRing;
  col += vec3(ring) * vec3(1.0, 0.98, 0.95) * 2.2;

  // Accretion disk: an ellipse (foreshortened) around the hole with Doppler
  // beaming — the side sweeping toward us (left, by convention) is brighter and
  // blue-shifted; the receding side dimmer and red-shifted.
  vec2 dc = c;
  dc.y /= max(uDiskTilt, 0.15);          // squash into a tilted ellipse
  float dr = length(dc);
  float diskR = uShadow * 1.6;
  float diskBand = smoothstep(0.22, 0.0, abs(dr - diskR));
  float side = dirToHole.x;               // -1 approaching .. +1 receding
  float beam = 1.0 + uDoppler * (-side);  // brighter on approaching side
  vec3 diskCol = mix(vec3(1.0, 0.55, 0.2), vec3(0.55, 0.75, 1.0), clamp(-side * 0.5 + 0.5, 0.0, 1.0));
  // hide the disk band that passes behind the shadow (front half only-ish)
  float front = smoothstep(-0.15, 0.15, c.y + 0.02);
  float diskMask = mix(front, 1.0, 0.35);
  col += diskBand * beam * diskCol * 1.4 * diskMask;

  // Global red-shift of the sky as we approach the horizon.
  col.b *= (1.0 - 0.35 * uReddish);
  col.g *= (1.0 - 0.18 * uReddish);
  col.r *= (1.0 + 0.12 * uReddish);

  // The shadow: a black disk with a soft edge that eats everything.
  float shadow = smoothstep(uShadow, uShadow * 0.92, b);
  col *= shadow;

  // Horizon-crossing white-out: a SMOOTH luminance ramp (safeFlicker-bounded
  // upstream). uLuma>1 lifts brightness and washes the whole frame toward white.
  col *= uLuma;
  float wash = clamp(uLuma - 1.0, 0.0, 1.0);
  col = mix(col, vec3(1.0), wash);

  gl_FragColor = vec4(col, 1.0);
}
`;

const LENS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Infalling particles: each has a base radius/angle/height; the vertex shader
// advances angle (faster when nearer), shrinks radius over the point's own
// phase, stretches + reddens as it nears the horizon, and fades at the shadow.
const PARTICLE_VERT = /* glsl */ `
precision highp float;
attribute float aSeed;
attribute float aRadius;
attribute float aAngle;
attribute float aHeight;
uniform float uTime;
uniform float uHorizon;   // radius at which particles vanish (world units)
uniform float uPixel;
varying float vShade;     // 0 far .. 1 near horizon (for red-shift)
varying float vAlpha;

void main(){
  // Each particle cycles inward over its own period, then respawns outward.
  float period = 9.0 + aSeed * 8.0;
  float ph = fract((uTime + aSeed * period) / period);   // 0..1 outward->inward
  float r = mix(aRadius, uHorizon * 0.9, ph);
  // angular velocity rises as radius shrinks (Keplerian-ish spin-up)
  float ang = aAngle + (uTime * (0.4 + 1.6 / max(r, 0.4)));
  float h = aHeight * (1.0 - ph * 0.7);   // flatten toward the disk near horizon

  vec3 pos = vec3(cos(ang) * r, h, sin(ang) * r);

  vShade = smoothstep(uHorizon * 3.0, uHorizon, r);      // near-horizon shading
  // fade in on spawn, fade out as it reaches the shadow
  vAlpha = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.85, 1.0, ph));

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // stretch (bigger point) + brighten near horizon
  float sz = uPixel * (1.2 + vShade * 3.0) / max(-mv.z, 0.5);
  gl_PointSize = clamp(sz, 1.0, 14.0);
}
`;

const PARTICLE_FRAG = /* glsl */ `
precision highp float;
uniform float uLuma;
varying float vShade;
varying float vAlpha;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.0, length(d));
  if (m <= 0.0) discard;
  // blue/white far out, red-shifted (orange->red) near the horizon
  vec3 col = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.28, 0.12), vShade);
  col = mix(col, vec3(1.0), clamp(uLuma - 1.0, 0.0, 1.0));
  gl_FragColor = vec4(col * max(uLuma, 1.0), m * vAlpha * (0.5 + 0.5 * vShade));
}
`;

/** Steering input in [-1,1] per axis, plus the arc progress [0,1]. */
export interface FallState {
  steerX: number;
  steerY: number;
  /** 0 = distant approach .. 1 = at the horizon. Drives lensing intensity. */
  progress: number;
}

export class SingularityScene {
  private renderer: THREE.WebGLRenderer;
  private lensScene: THREE.Scene;
  private lensCam: THREE.OrthographicCamera;
  private lensMat: THREE.ShaderMaterial;
  private lensGeom: THREE.BufferGeometry;

  private worldScene: THREE.Scene;
  private worldCam: THREE.PerspectiveCamera;
  private particleMat: THREE.ShaderMaterial;
  private particleGeom: THREE.BufferGeometry;
  private points: THREE.Points;

  private width = 1;
  private height = 1;
  private disposed = false;

  // smoothed steering so tilt never jerks the camera
  private steerX = 0;
  private steerY = 0;

  constructor(container: HTMLElement) {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    // ── Lensing background pass (fullscreen) ──
    this.lensCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lensScene = new THREE.Scene();
    this.lensMat = new THREE.ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: w / h },
        uDeflect: { value: 0.02 },
        uShadow: { value: 0.06 },
        uRing: { value: 0.4 },
        uDiskTilt: { value: 0.35 },
        uDoppler: { value: 0.6 },
        uSteer: { value: new THREE.Vector2(0, 0) },
        uReddish: { value: 0 },
        uLuma: { value: 1 },
      },
    });
    this.lensGeom = new THREE.BufferGeometry();
    // fullscreen triangle
    this.lensGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.lensGeom.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
    );
    this.lensScene.add(new THREE.Mesh(this.lensGeom, this.lensMat));

    // ── Infalling particle swarm (world pass, drawn over the lens) ──
    this.worldScene = new THREE.Scene();
    this.worldCam = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    this.worldCam.position.set(0, 1.6, 9);
    this.worldCam.lookAt(0, 0, 0);

    const seeds = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const angles = new Float32Array(PARTICLE_COUNT);
    const heights = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random();
      radii[i] = 3.5 + Math.random() * 7.5;
      angles[i] = Math.random() * Math.PI * 2;
      heights[i] = (Math.random() - 0.5) * 2.4;
    }
    this.particleGeom = new THREE.BufferGeometry();
    // A dummy position attribute (unused; vertex shader builds pos from attrs)
    this.particleGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3),
    );
    this.particleGeom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    this.particleGeom.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
    this.particleGeom.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
    this.particleGeom.setAttribute("aHeight", new THREE.BufferAttribute(heights, 1));

    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHorizon: { value: 1.2 },
        uPixel: { value: 320 * Math.min(window.devicePixelRatio || 1, 2) },
        uLuma: { value: 1 },
      },
    });
    this.points = new THREE.Points(this.particleGeom, this.particleMat);
    this.points.frustumCulled = false;
    this.worldScene.add(this.points);
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(w: number, h: number): void {
    if (this.disposed || w === 0 || h === 0) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.lensMat.uniforms.uAspect.value = w / h;
    this.worldCam.aspect = w / h;
    this.worldCam.updateProjectionMatrix();
  }

  /**
   * Advance the sim. `t` is absolute seconds; `state` carries steering + the
   * long-arc progress. `luma` is the safeFlicker-bounded white-out multiplier
   * (1 = normal). Returns nothing; renders both passes.
   */
  render(t: number, state: FallState, luma: number): void {
    if (this.disposed) return;

    // Smooth the steering so tilt is fluid.
    this.steerX += (state.steerX - this.steerX) * 0.06;
    this.steerY += (state.steerY - this.steerY) * 0.06;

    const p = Math.min(1, Math.max(0, state.progress));

    // Lensing grows as we approach: shadow swells, deflection & ring intensify.
    const u = this.lensMat.uniforms;
    u.uTime.value = t;
    u.uShadow.value = 0.05 + p * p * 0.42;
    u.uDeflect.value = 0.015 + p * 0.09;
    u.uRing.value = 0.35 + p * 0.9;
    u.uDoppler.value = 0.5 + p * 0.5;
    u.uReddish.value = p;
    // Steering offsets the singularity slightly opposite the tilt (you steer
    // the fall, the hole drifts across the view). Clamp so it never leaves.
    (u.uSteer.value as THREE.Vector2).set(
      THREE.MathUtils.clamp(this.steerX * 0.22 * (0.4 + p), -0.35, 0.35),
      THREE.MathUtils.clamp(this.steerY * 0.16 * (0.4 + p), -0.28, 0.28),
    );

    // Particle swarm spins up; horizon radius shrinks toward the camera as we fall.
    this.particleMat.uniforms.uTime.value = t;
    this.particleMat.uniforms.uHorizon.value = 1.4 - p * 0.6;

    // Camera drifts inward + tilt sways it, giving parallax on the swarm.
    const cz = 9.0 - p * 6.5;
    this.worldCam.position.set(
      this.steerX * 1.4,
      1.6 - p * 1.2 + this.steerY * 0.8,
      cz,
    );
    this.worldCam.lookAt(this.steerX * 0.3, 0, 0);

    // White-out / red-shift luminance ramp, driven by the safeFlicker-bounded
    // `luma` (>=1 washes toward white at horizon crossing). No strobe.
    u.uLuma.value = luma;
    this.particleMat.uniforms.uLuma.value = luma;

    this.renderer.clear();
    this.renderer.render(this.lensScene, this.lensCam);
    this.renderer.render(this.worldScene, this.worldCam);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lensGeom.dispose();
    this.lensMat.dispose();
    this.particleGeom.dispose();
    this.particleMat.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    el.parentElement?.removeChild(el);
  }
}
