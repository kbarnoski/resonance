// scene.ts — three.js dark Earth from orbit with auroral ovals + magnetosphere bloom.
// Visual continuity with 463-terra-gamelan's luminous dot-sphere, upgraded with:
//   • Auroral ovals (north + south magnetic poles) — width/brightness/hue track Kp + |Bz|
//   • Magnetosphere bloom halo — surges on the drop (Kp ≥ 5)
//   • Starfield, sunlit limb, draggable auto-rotating globe
// Fully self-contained; disposes all geometry/materials/renderer on unmount.

import * as THREE from "three";

const GLOBE_RADIUS = 1.6;

// Magnetic north pole: ~80.7°N, 72°W (IGRF approximate)
// Magnetic south pole: ~64.5°S, 136°E
const MAG_NORTH = { lat: 80.7, lon: -72 };
const MAG_SOUTH = { lat: -64.5, lon: 136 };

export interface HeliosScene {
  /** Update driving parameters every frame from the glided weather state. */
  applyWeather: (kp: number, bz: number) => void;
  /** Trigger the instantaneous bloom flash (called once when storm drops). */
  triggerBloom: () => void;
  /** Pointer drag for globe rotation. */
  drag: (dx: number, dy: number) => void;
  resize: () => void;
  dispose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Build an auroral oval as a torus-like ring of particles around a magnetic pole.
// poleDir: unit vector pointing toward the pole from globe center.
// Returns a Points object (additive blending, disposes geo+mat in returned disposer).
interface AuroraOval {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  /** Mutable param block updated each frame. */
  params: {
    intensity: number;   // 0..1 overall brightness
    width: number;       // angular half-width of oval in radians
    hue: number;         // 0=green, 1=magenta/red
    shimmer: number;     // shimmer speed multiplier
    colatitude: number;  // angular radius of oval (rad) from pole — expands with Kp
  };
  disposer: () => void;
}

function makeAuroraOval(
  poleDir: THREE.Vector3,
  particleCount: number
): AuroraOval {
  const positions = new Float32Array(particleCount * 3);
  const randoms = new Float32Array(particleCount); // per-particle random [0,1] for shimmer

  // Build a reference frame for the pole
  const up = poleDir.clone().normalize();
  // Choose an arbitrary perpendicular
  const arbitrary = Math.abs(up.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up, arbitrary).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize();

  // Default colatitude: ~25° from pole
  const DEFAULT_COLAT = 25 * (Math.PI / 180);

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.18;
    const theta = DEFAULT_COLAT + (Math.random() - 0.5) * 0.05;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const x = sinT * Math.cos(angle);
    const y = sinT * Math.sin(angle);
    const z = cosT;
    // Transform: local z→up, local x→right, local y→fwd
    const world = new THREE.Vector3(
      right.x * x + fwd.x * y + up.x * z,
      right.y * x + fwd.y * y + up.y * z,
      right.z * x + fwd.z * y + up.z * z
    ).multiplyScalar(GLOBE_RADIUS * 1.028);
    positions[i * 3] = world.x;
    positions[i * 3 + 1] = world.y;
    positions[i * 3 + 2] = world.z;
    randoms[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uWidth: { value: 0.08 },
      uHue: { value: 0 },        // 0=green 1=magenta
      uShimmer: { value: 1.0 },
      uHeight: { value: 600 },
    },
    vertexShader: `
      attribute float aRandom;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uShimmer;
      uniform float uHeight;
      varying float vRandom;
      varying float vAlpha;
      void main() {
        vRandom = aRandom;
        // shimmer: amplitude pulse per particle
        float pulse = 0.6 + 0.4 * sin(uTime * uShimmer * 2.8 + aRandom * 6.28318);
        vAlpha = uIntensity * pulse;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float sz = (0.04 + uIntensity * 0.06) * uHeight / max(-mv.z, 0.001);
        gl_PointSize = sz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uHue;
      varying float vRandom;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r) * vAlpha;
        // green (0,1,0.4) <-> magenta/red (1,0.2,0.6)
        vec3 green  = vec3(0.0, 1.0, 0.4);
        vec3 magenta = vec3(1.0, 0.2, 0.6);
        vec3 col = mix(green, magenta, uHue);
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const params = {
    intensity: 0,
    width: 0.08,
    hue: 0,
    shimmer: 1,
    colatitude: DEFAULT_COLAT,
  };

  const disposer = () => {
    geo.dispose();
    mat.dispose();
  };

  return { points, geo, mat, params, disposer };
}

// Rebuild positions for an oval when colatitude changes substantially
function rebuildOvalPositions(
  oval: AuroraOval,
  poleDir: THREE.Vector3,
  particleCount: number
): void {
  const up = poleDir.clone().normalize();
  const arbitrary = Math.abs(up.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up, arbitrary).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
  const colat = oval.params.colatitude;

  const pos = oval.geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + (pos.array as Float32Array)[i] * 0.1;
    const theta = colat + (Math.random() - 0.5) * 0.06;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const x = sinT * Math.cos(angle);
    const y = sinT * Math.sin(angle);
    const z = cosT;
    const world = new THREE.Vector3(
      right.x * x + fwd.x * y + up.x * z,
      right.y * x + fwd.y * y + up.y * z,
      right.z * x + fwd.z * y + up.z * z
    ).multiplyScalar(GLOBE_RADIUS * 1.028);
    (pos.array as Float32Array)[i * 3] = world.x;
    (pos.array as Float32Array)[i * 3 + 1] = world.y;
    (pos.array as Float32Array)[i * 3 + 2] = world.z;
  }
  pos.needsUpdate = true;
}

// ── Main scene factory ────────────────────────────────────────────────────────

export function createHeliosScene(canvas: HTMLCanvasElement): HeliosScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const parent = canvas.parentElement;
  const W = () => parent?.clientWidth || canvas.clientWidth || 640;
  const H = () => parent?.clientHeight || canvas.clientHeight || 480;

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H(), false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 200);
  camera.position.set(0, 0, 5.4);

  // ── world group (rotates for spin + drag) ────────────────────────────────
  const world = new THREE.Group();
  scene.add(world);

  // ── starfield (stays fixed — not part of world) ─────────────────────────
  const STAR_COUNT = 1800;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 50 + Math.random() * 60;
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3] = r * s * Math.cos(t);
    starPos[i * 3 + 1] = r * u;
    starPos[i * 3 + 2] = r * s * Math.sin(t);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x9bb8ff,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ── globe: Fibonacci dot-sphere (dark blue, like cycle 1) ───────────────
  const DOT_COUNT = 3000;
  const dotPos = new Float32Array(DOT_COUNT * 3);
  for (let i = 0; i < DOT_COUNT; i++) {
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / DOT_COUNT);
    const theta = Math.PI * (1 + Math.sqrt(5)) * k;
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.sin(phi) * Math.sin(theta);
    const z = Math.cos(phi);
    dotPos[i * 3] = x * GLOBE_RADIUS;
    dotPos[i * 3 + 1] = y * GLOBE_RADIUS;
    dotPos[i * 3 + 2] = z * GLOBE_RADIUS;
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0x1a4a80,
    size: 0.028,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const globeDots = new THREE.Points(dotGeo, dotMat);
  world.add(globeDots);

  // Solid dark core (occludes back side)
  const coreGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.985, 36, 28);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x020810 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  world.add(core);

  // Faint wireframe grid
  const wireGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 0.992, 28, 20);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x0d2d50,
    wireframe: true,
    transparent: true,
    opacity: 0.18,
  });
  world.add(new THREE.Mesh(wireGeo, wireMat));

  // ── atmosphere halo (thin, back-side — always on) ────────────────────────
  const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.14, 36, 28);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x1e55a8,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  world.add(atmo);

  // ── sunlit limb (subtle warm crescent on one side) ───────────────────────
  const limbGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 36, 28);
  const limbMat = new THREE.MeshBasicMaterial({
    color: 0xffd580,
    transparent: true,
    opacity: 0.065,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const limb = new THREE.Mesh(limbGeo, limbMat);
  limb.position.x = 1.2; // offset sun direction
  world.add(limb);

  // ── magnetosphere bloom shell (large, additive, intensity drives storms) ─
  const magnetoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 2.8, 36, 28);
  const magnetoMat = new THREE.MeshBasicMaterial({
    color: 0x7040ff,
    transparent: true,
    opacity: 0.0,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const magnetosphere = new THREE.Mesh(magnetoGeo, magnetoMat);
  scene.add(magnetosphere); // outside world so it doesn't rotate

  // Inner corona (tighter, brighter on drop)
  const coronaGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.55, 36, 28);
  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0x60a0ff,
    transparent: true,
    opacity: 0.0,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const corona = new THREE.Mesh(coronaGeo, coronaMat);
  scene.add(corona);

  // ── auroral ovals ────────────────────────────────────────────────────────
  const AURORA_PARTICLES = 1200;

  const northDir = latLonToVec3(MAG_NORTH.lat, MAG_NORTH.lon, 1).normalize();
  const southDir = latLonToVec3(MAG_SOUTH.lat, MAG_SOUTH.lon, 1).normalize();

  const northOval = makeAuroraOval(northDir, AURORA_PARTICLES);
  const southOval = makeAuroraOval(southDir, AURORA_PARTICLES);
  world.add(northOval.points);
  world.add(southOval.points);

  let lastNorthColat = northOval.params.colatitude;
  let lastSouthColat = southOval.params.colatitude;

  // ── bloom state ──────────────────────────────────────────────────────────
  let bloomFlash = 0; // 0..1, decays after triggerBloom()
  let bloomPeak = 0;

  // ── interaction state ────────────────────────────────────────────────────
  let spinY = 0;
  let spinX = 0.1;
  let dragVelY = 0;

  // ── render loop ───────────────────────────────────────────────────────────
  let raf = 0;
  let elapsed = 0;
  let disposed = false;
  let last = performance.now();

  // ── hi-hat timing for visual shimmer sync ───────────────────────────────
  let hhTimer = 0;
  const HH_INTERVAL = 0.12; // ~120ms tick for shimmer variation

  function frame(t: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    elapsed += dt;

    // Auto-rotate + drag inertia
    dragVelY *= 0.93;
    spinY += dt * 0.055 + dragVelY;
    world.rotation.y = spinY;
    world.rotation.x = spinX;
    stars.rotation.y += dt * 0.003;

    // Bloom flash decay
    bloomFlash *= Math.pow(0.04, dt); // fast initial decay

    // Update magnetosphere opacity from bloom + kp-driven ambient
    const magnetoBase = 0; // starts fully off
    const magnetoStorm = bloomPeak * bloomFlash * 0.18;
    magnetoMat.opacity = Math.min(0.18, magnetoBase + magnetoStorm);
    const coronaBase = 0;
    const coronaStorm = bloomPeak * bloomFlash * 0.28;
    coronaMat.opacity = Math.min(0.32, coronaBase + coronaStorm);

    // Aurora shimmer time propagation
    hhTimer += dt;
    if (hhTimer > HH_INTERVAL) hhTimer = 0;

    for (const oval of [northOval, southOval]) {
      oval.mat.uniforms.uTime.value = elapsed;
      oval.mat.uniforms.uIntensity.value = oval.params.intensity;
      oval.mat.uniforms.uHue.value = oval.params.hue;
      oval.mat.uniforms.uShimmer.value = oval.params.shimmer;
      oval.mat.uniforms.uWidth.value = oval.params.width;
      oval.mat.uniforms.uHeight.value = H();
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ── public API ────────────────────────────────────────────────────────────

  function applyWeather(kp: number, bz: number): void {
    // Normalize kp: 0..9 -> 0..1
    const kpN = Math.min(1, Math.max(0, kp / 9));
    // Bz geoeffectiveness: negative bz (southward) up to 20 nT
    const bzEffect = Math.min(1, Math.max(0, -bz / 20));
    // Combined aurora driver
    const auroraDriver = Math.min(1, kpN * 0.7 + bzEffect * 0.3);

    // Storm threshold (Kp ≥ 5 → kpN ≥ 0.55)
    const stormActive = kp >= 5;

    // ── auroral oval params ──────────────────────────────────────────────
    // Intensity: quiet aurora at Kp~1, full glow at storm
    const intensity = Math.max(0, auroraDriver > 0.05
      ? 0.08 + auroraDriver * 0.92
      : 0);

    // Colatitude of oval: expands from ~25° at Kp=0 to ~40° at Kp=9
    // (lower colatitude means the oval is tighter around the pole)
    const colatDeg = 25 + auroraDriver * 15;
    const colatRad = colatDeg * (Math.PI / 180);

    // Hue: green at low/mid, drift toward magenta/red at high Kp or strong Bz
    const hue = Math.min(1, Math.max(0, (kpN - 0.3) / 0.7));

    // Shimmer speed: quickens as storm builds
    const shimmer = 1 + auroraDriver * 3.5;

    // Apply to both ovals
    for (const oval of [northOval, southOval]) {
      oval.params.intensity = intensity;
      oval.params.hue = hue;
      oval.params.shimmer = shimmer;
      oval.params.colatitude = colatRad;
    }

    // Rebuild oval ring positions if colatitude changed significantly
    if (Math.abs(colatRad - lastNorthColat) > 0.015) {
      rebuildOvalPositions(northOval, northDir, AURORA_PARTICLES);
      rebuildOvalPositions(southOval, southDir, AURORA_PARTICLES);
      lastNorthColat = colatRad;
      lastSouthColat = colatRad;
    } else {
      // suppress unused warning
      void lastSouthColat;
    }

    // ── atmosphere color: shifts toward green/violet as aurora brightens ─
    atmoMat.color.setHSL(
      stormActive ? 0.75 : 0.6,           // violet in storm, blue in quiet
      0.7 + intensity * 0.3,
      0.12 + intensity * 0.08
    );
    atmoMat.opacity = 0.08 + intensity * 0.1;

    // ── magnetosphere ambient glow (separate from bloom flash) ──────────
    if (stormActive) {
      magnetoMat.opacity = Math.max(
        magnetoMat.opacity,
        0.04 + auroraDriver * 0.08
      );
      coronaMat.opacity = Math.max(
        coronaMat.opacity,
        0.06 + auroraDriver * 0.12
      );
    }
  }

  function triggerBloom(): void {
    bloomFlash = 1;
    bloomPeak = 1;
    // Instantly raise magnetosphere opacity, let it decay in frame loop
    magnetoMat.opacity = 0.18;
    coronaMat.opacity = 0.32;
  }

  function drag(dx: number, dy: number): void {
    spinY += dx * 0.005;
    spinX = Math.max(-1.2, Math.min(1.2, spinX + dy * 0.005));
    dragVelY = dx * 0.005;
  }

  function resize(): void {
    const w = W();
    const h = H();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose(): void {
    disposed = true;
    cancelAnimationFrame(raf);

    starGeo.dispose();
    starMat.dispose();
    dotGeo.dispose();
    dotMat.dispose();
    coreGeo.dispose();
    coreMat.dispose();
    wireGeo.dispose();
    wireMat.dispose();
    atmoGeo.dispose();
    atmoMat.dispose();
    limbGeo.dispose();
    limbMat.dispose();
    magnetoGeo.dispose();
    magnetoMat.dispose();
    coronaGeo.dispose();
    coronaMat.dispose();

    northOval.disposer();
    southOval.disposer();

    renderer.dispose();
  }

  return { applyWeather, triggerBloom, drag, resize, dispose };
}
