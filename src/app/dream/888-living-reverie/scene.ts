/*
 * 888 · LIVING REVERIE — visual: a morphing DISPLACED MESH (not particles)
 *
 * A single high-resolution subdivided icosphere whose vertices are displaced in
 * a vertex shader by layered 3D noise. THE MESH IS THE ARC:
 *   sparse     — nearly flat, calm, dark, slow undulation
 *   blooming   — ridges rise, color warms, gentle outward growth
 *   dense      — complex folded turbulent membrane, fullest palette, fastest
 *   dissolving — amplitude collapses back to flat, color cools and fades
 *
 * Displacement amplitude, noise frequency, palette and emissive glow are driven
 * by `age`, the section, and a smoothed audio RMS level. Additive glow shell +
 * fog give a bloom-like look without postprocessing. Drag to orbit.
 *
 * All GPU resources are tracked in `disposables` for mandatory cleanup.
 */

import * as THREE from "three";

export interface SceneHandle {
  render: (
    age: number,
    sectionIndex: number,
    audioLevel: number,
    dt: number,
  ) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

// Palette stops across the arc (cool indigo -> warm amber/rose -> deep violet).
const COOL = new THREE.Color(0x2a2f6b); // indigo (sparse)
const WARM = new THREE.Color(0xff9d5c); // amber (bloom)
const ROSE = new THREE.Color(0xff6f8f); // rose (dense)
const VIOLET = new THREE.Color(0x4b2a6b); // deep violet (dissolve)

// GLSL noise (Ashima simplex 3D) shared by the displacement shader.
const NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
// fractal sum of noise (fbm)
float fbm(vec3 p){
  float f = 0.0;
  float amp = 0.5;
  for(int i=0;i<4;i++){
    f += amp * snoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return f;
}
`;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uLevel;
varying float vDisp;
varying vec3 vNormalW;
${NOISE_GLSL}
void main(){
  vec3 n = normalize(position);
  float t = uTime * 0.18;
  float d = fbm(n * uFreq + vec3(t, t*0.7, -t*0.5));
  // audio level adds a fast micro-tremble
  d += uLevel * 0.35 * snoise(n * (uFreq*2.2) + uTime*1.3);
  float disp = d * uAmp;
  vDisp = disp;
  vec3 displaced = position + n * disp;
  vNormalW = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColorLo;
uniform vec3 uColorHi;
uniform float uEmissive;
uniform float uFade;
varying float vDisp;
varying vec3 vNormalW;
void main(){
  float h = clamp(vDisp * 1.6 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColorLo, uColorHi, h);
  // simple rim/fresnel-ish lift using view-space normal z
  float rim = pow(1.0 - abs(vNormalW.z), 2.0);
  col += rim * uEmissive * uColorHi;
  col += uEmissive * 0.25 * h;
  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

export function createScene(canvas: HTMLCanvasElement): SceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const disposables: { dispose: () => void }[] = [];

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x05060d, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060d, 0.035);

  const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.1,
    100,
  );
  camera.position.set(0, 0, 6);

  // --- main displaced membrane (icosphere, high subdivision) ---
  // detail 7 -> 20 * 4^7 = 327,680 triangles: dense enough for smooth
  // vertex displacement, light enough to stay at 60fps.
  const geo = new THREE.IcosahedronGeometry(2, 7);
  disposables.push(geo);

  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.05 },
    uFreq: { value: 1.2 },
    uLevel: { value: 0 },
    uColorLo: { value: COOL.clone() },
    uColorHi: { value: WARM.clone() },
    uEmissive: { value: 0.2 },
    uFade: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
  });
  disposables.push(mat);

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // --- additive glow shell (slightly larger, back-side, additive) for bloom ---
  const glowGeo = new THREE.IcosahedronGeometry(2.05, 3);
  disposables.push(glowGeo);
  const glowUniforms = {
    uColor: { value: WARM.clone() },
    uStrength: { value: 0.15 },
  };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main(){
        vN = normalize(normalMatrix * normalize(position));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec3 vN;
      void main(){
        float rim = pow(1.0 - abs(vN.z), 3.0);
        gl_FragColor = vec4(uColor * rim * uStrength, rim * uStrength);
      }
    `,
  });
  disposables.push(glowMat);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  scene.add(glow);

  // --- soft fill light isn't needed (shader is unlit), but add ambient feel
  // via background gradient handled by clear color + fog. ---

  // ---- drag-to-orbit ----
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let yaw = 0;
  let pitch = 0;
  let autoYaw = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.005;
    pitch += (e.clientY - lastY) * 0.005;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  const colorLo = new THREE.Color();
  const colorHi = new THREE.Color();

  // Map age/section to palette + displacement parameters.
  function paletteForArc(age: number, section: number, lo: THREE.Color, hi: THREE.Color) {
    // section: 0 sparse, 1 blooming, 2 dense, 3 dissolving
    if (section === 0) {
      lo.copy(COOL).multiplyScalar(0.6);
      hi.copy(COOL).lerp(WARM, 0.25);
    } else if (section === 1) {
      lo.copy(COOL).lerp(WARM, 0.4);
      hi.copy(WARM);
    } else if (section === 2) {
      lo.copy(WARM).lerp(ROSE, 0.4);
      hi.copy(ROSE);
    } else {
      const t = (age - 0.8) / 0.2;
      lo.copy(ROSE).lerp(VIOLET, t);
      hi.copy(WARM).lerp(VIOLET, t);
    }
  }

  function render(
    age: number,
    sectionIndex: number,
    audioLevel: number,
    dt: number,
  ) {
    uniforms.uTime.value += dt * arcSpeed(sectionIndex);

    // displacement amplitude follows the arc (rise then collapse)
    const ampTarget = arcAmplitude(age, sectionIndex) + audioLevel * 0.6;
    uniforms.uAmp.value += (ampTarget - uniforms.uAmp.value) * 0.05;

    // noise frequency rises into density, falls in dissolve
    const freqTarget = arcFreq(sectionIndex);
    uniforms.uFreq.value += (freqTarget - uniforms.uFreq.value) * 0.03;

    uniforms.uLevel.value += (audioLevel - uniforms.uLevel.value) * 0.2;

    // palette
    paletteForArc(age, sectionIndex, colorLo, colorHi);
    (uniforms.uColorLo.value as THREE.Color).lerp(colorLo, 0.04);
    (uniforms.uColorHi.value as THREE.Color).lerp(colorHi, 0.04);
    (glowUniforms.uColor.value as THREE.Color).copy(
      uniforms.uColorHi.value as THREE.Color,
    );

    // emissive grows into bloom/dense, fades in dissolve
    const emTarget = arcEmissive(age, sectionIndex) + audioLevel * 0.4;
    uniforms.uEmissive.value += (emTarget - uniforms.uEmissive.value) * 0.04;
    glowUniforms.uStrength.value = 0.08 + uniforms.uEmissive.value * 0.5;

    // global fade-out near the very end so it dissolves to near-black
    const fadeTarget = sectionIndex === 3 ? 1 - ((age - 0.8) / 0.2) * 0.6 : 1;
    uniforms.uFade.value += (fadeTarget - uniforms.uFade.value) * 0.03;

    // camera orbit (auto-drift + drag)
    if (!dragging) autoYaw += dt * 0.04;
    const totalYaw = yaw + autoYaw;
    const radius = 6;
    camera.position.x = Math.sin(totalYaw) * Math.cos(pitch) * radius;
    camera.position.y = Math.sin(pitch) * radius;
    camera.position.z = Math.cos(totalYaw) * Math.cos(pitch) * radius;
    camera.lookAt(0, 0, 0);

    mesh.rotation.y += dt * 0.02;
    glow.rotation.copy(mesh.rotation);

    renderer.render(scene, camera);
  }

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  resize(canvas.clientWidth, canvas.clientHeight);

  return { render, resize, dispose };
}

// arc helpers ----------------------------------------------------------------
function arcAmplitude(age: number, section: number): number {
  if (section === 0) return 0.06;
  if (section === 1) return 0.18 + (age - 0.2) * 0.4;
  if (section === 2) return 0.5;
  // dissolving: collapse
  const t = (age - 0.8) / 0.2;
  return 0.5 * (1 - t) + 0.04;
}
function arcFreq(section: number): number {
  if (section === 0) return 1.0;
  if (section === 1) return 1.6;
  if (section === 2) return 2.6;
  return 1.4;
}
function arcEmissive(age: number, section: number): number {
  if (section === 0) return 0.12;
  if (section === 1) return 0.3;
  if (section === 2) return 0.5;
  const t = (age - 0.8) / 0.2;
  return 0.4 * (1 - t) + 0.02;
}
function arcSpeed(section: number): number {
  if (section === 0) return 0.5;
  if (section === 1) return 0.9;
  if (section === 2) return 1.4;
  return 0.6;
}
