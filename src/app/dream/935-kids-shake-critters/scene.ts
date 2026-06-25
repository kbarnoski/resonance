// three.js scene: a little band of blobby glowing jelly-critters.
//
// Each critter is an icosphere with a custom vertex shader that displaces its
// surface with layered noise → soft, gummy, jiggly. Shake energy drives squash,
// jiggle amplitude and emissive glow. Collisions puff sparkle particles off the
// critters. Bright, saturated, daylight-playful palette on a warm bright sky.

import * as THREE from "three";

const CRITTER_COLORS = [
  0xff4d6d, // bold rose-red
  0xffd23f, // sunny yellow
  0x4dd4ff, // bright cyan
  0x8a5cff, // playful violet
  0x4ade80, // fresh green
];

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uSquash;
  varying vec3 vNormal;
  varying float vDisp;

  // cheap 3D noise (value-ish) for organic wobble
  vec3 hash3(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
  }
  float noise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f*f*(3.0-2.0*f);
    return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)),
                       dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                   mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),
                       dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
               mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),
                       dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                   mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),
                       dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
  }

  void main(){
    vNormal = normal;
    float wob = noise(normal * 2.4 + uTime * 1.3);
    float fast = noise(normal * 5.0 - uTime * 2.2);
    float disp = wob * (0.10 + 0.34 * uEnergy) + fast * 0.05 * uEnergy;
    vDisp = disp;
    vec3 pos = position + normal * disp;
    // squash-and-stretch: flatten Y, widen XZ with shake (jelly bounce)
    pos.y *= (1.0 - 0.28 * uSquash);
    pos.xz *= (1.0 + 0.20 * uSquash);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying float vDisp;

  void main(){
    // soft rim/fresnel glow toward the camera (z+)
    float facing = clamp(dot(normalize(vNormal), vec3(0.0,0.0,1.0)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.0);
    vec3 base = uColor;
    // brighten with displacement (the gummy highlights) + energy glow
    vec3 col = base * (0.55 + 0.6 * facing);
    col += base * rim * (0.8 + 1.4 * uEnergy);
    col += vec3(1.0) * max(0.0, vDisp) * 0.5;
    // gentle bloom-ish lift
    col = col / (col + vec3(0.85));
    col = pow(col, vec3(0.85));
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Critter {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  baseScale: number;
  homeX: number;
  homeY: number;
  phase: number;
  jiggleX: number;
  jiggleY: number;
}

const MAX_SPARKLES = 600;

export class CritterScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  critters: Critter[] = [];

  // sparkle particle system
  private sparkGeo: THREE.BufferGeometry;
  private sparkPos: Float32Array;
  private sparkCol: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private sparkPoints: THREE.Points;
  private sparkCursor = 0;

  private clock = new THREE.Clock();
  private bgColor = new THREE.Color(0x2a1a4a);
  private bgTarget = new THREE.Color(0xffe8c2); // warm bright daylight

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = this.bgColor.clone();

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 8);

    const count = 5;
    const geo = new THREE.IcosahedronGeometry(1, 24);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uSquash: { value: 0 },
          uColor: { value: new THREE.Color(CRITTER_COLORS[i]) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const t = (i / (count - 1) - 0.5) * 2; // -1..1
      const homeX = t * 4.4;
      const homeY = Math.sin(i * 1.7) * 1.1;
      const baseScale = 0.85 + (i % 2) * 0.25;
      mesh.position.set(homeX, homeY, 0);
      mesh.scale.setScalar(baseScale);
      this.scene.add(mesh);
      this.critters.push({
        mesh,
        mat,
        baseScale,
        homeX,
        homeY,
        phase: i * 1.37,
        jiggleX: 0,
        jiggleY: 0,
      });
    }

    // ── sparkle puff particles ──────────────────────────────────────────────
    this.sparkPos = new Float32Array(MAX_SPARKLES * 3);
    this.sparkCol = new Float32Array(MAX_SPARKLES * 3);
    this.sparkVel = new Float32Array(MAX_SPARKLES * 3);
    this.sparkLife = new Float32Array(MAX_SPARKLES);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.sparkPos, 3),
    );
    this.sparkGeo.setAttribute(
      "color",
      new THREE.BufferAttribute(this.sparkCol, 3),
    );
    const sparkMat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPoints = new THREE.Points(this.sparkGeo, sparkMat);
    this.scene.add(this.sparkPoints);
    // park all sparkles offscreen initially
    for (let i = 0; i < MAX_SPARKLES; i++) this.sparkPos[i * 3 + 1] = 9999;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // puff a burst of sparkles off a random critter, tinted by voice color
  puff(voiceIdx: number, energy: number) {
    const c = this.critters[(voiceIdx + this.sparkCursor) % this.critters.length];
    if (!c) return;
    const n = 2 + Math.floor(energy * 4);
    const tint = new THREE.Color(CRITTER_COLORS[voiceIdx % CRITTER_COLORS.length]);
    for (let k = 0; k < n; k++) {
      const idx = this.sparkCursor % MAX_SPARKLES;
      this.sparkCursor++;
      const p = idx * 3;
      this.sparkPos[p] = c.mesh.position.x + (Math.random() - 0.5) * 1.2;
      this.sparkPos[p + 1] = c.mesh.position.y + (Math.random() - 0.5) * 1.2;
      this.sparkPos[p + 2] = (Math.random() - 0.5) * 1.0;
      const sp = 0.04 + energy * 0.08;
      this.sparkVel[p] = (Math.random() - 0.5) * sp;
      this.sparkVel[p + 1] = Math.random() * sp + 0.02;
      this.sparkVel[p + 2] = (Math.random() - 0.5) * sp;
      this.sparkCol[p] = tint.r;
      this.sparkCol[p + 1] = tint.g;
      this.sparkCol[p + 2] = tint.b;
      this.sparkLife[idx] = 1.0;
    }
  }

  // energy 0..1, loopEnergy 0..1 from audio engine
  render(energy: number, loopEnergy: number) {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // background warms up as the band wakes; stays bright + playful
    const wake = Math.min(1, energy * 1.4 + loopEnergy * 0.6 + 0.25);
    this.bgColor.lerpColors(
      new THREE.Color(0x3a2a5a),
      this.bgTarget,
      wake,
    );
    (this.scene.background as THREE.Color).copy(this.bgColor);

    const combined = Math.min(1, energy + loopEnergy * 0.7);

    for (let i = 0; i < this.critters.length; i++) {
      const c = this.critters[i];
      c.mat.uniforms.uTime.value = t;
      c.mat.uniforms.uEnergy.value = combined;
      // squash pulses with energy + a per-critter bounce
      const bounce = Math.max(0, Math.sin(t * 6 + c.phase)) * combined;
      c.mat.uniforms.uSquash.value = bounce * 0.8;

      // jiggle home position with shake (spring-ish random walk)
      const target = combined * 0.5;
      c.jiggleX += (Math.sin(t * 7.3 + c.phase) * target - c.jiggleX) * 0.2;
      c.jiggleY += (Math.cos(t * 5.1 + c.phase * 1.3) * target - c.jiggleY) * 0.2;
      c.mesh.position.x = c.homeX + c.jiggleX;
      c.mesh.position.y =
        c.homeY + c.jiggleY + Math.sin(t * 1.2 + c.phase) * 0.18;
      // squash scale: bigger pop on bounce
      const s = c.baseScale * (1 + bounce * 0.18);
      c.mesh.scale.setScalar(s);
      c.mesh.rotation.y = t * 0.3 + c.phase;
      c.mesh.rotation.x = Math.sin(t * 0.4 + c.phase) * 0.3;
    }

    // advance sparkles
    for (let i = 0; i < MAX_SPARKLES; i++) {
      if (this.sparkLife[i] <= 0) continue;
      const p = i * 3;
      this.sparkPos[p] += this.sparkVel[p];
      this.sparkPos[p + 1] += this.sparkVel[p + 1];
      this.sparkPos[p + 2] += this.sparkVel[p + 2];
      this.sparkVel[p + 1] -= 0.0015; // gentle gravity
      this.sparkLife[i] -= dt * 1.6;
      const life = Math.max(0, this.sparkLife[i]);
      // fade by dimming color
      this.sparkCol[p] *= 0.985;
      this.sparkCol[p + 1] *= 0.985;
      this.sparkCol[p + 2] *= 0.985;
      if (life <= 0) this.sparkPos[p + 1] = 9999;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.critters.forEach((c) => {
      c.mat.dispose();
      (c.mesh.geometry as THREE.BufferGeometry).dispose();
    });
    this.sparkGeo.dispose();
    (this.sparkPoints.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
