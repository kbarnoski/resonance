// ─────────────────────────────────────────────────────────────────────────────
// 16448 · phosphene — lattice.ts
//
// The luminous crystalline light-body itself: a compact object of a few thousand
// GPU points arranged with kaleidoscopic (dihedral) symmetry so it reads as a
// faceted jewel, wrapped in a thin silver icosahedral facet-cage that gives it
// edges and a solid 3D read as the camera orbits it.
//
// Everything the harmony carves is a UNIFORM the render loop drives:
//   • uSymmetry — folding order (chord root → 3..9 lobes). Changing it live
//     reshapes the facets, so a chord change visibly re-cuts the crystal.
//   • uTwist    — a spiral shear across the shells (chord color / minorness).
//   • uJewel    — the single saturated jewel-tone (amethyst ⇄ teal).
//   • uBright   — point brightness (note density under the playhead).
//   • uBloom    — an expanding wavefront radius; an onset launches it and it
//     travels outward through the shells, pushing + lighting the points it
//     passes, then decays. This is the onset "bloom-pulse".
//   • uAudio    — continuous shimmer from the master analyser.
//
// No audio is created here — this file is pure geometry / light.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

const TAU = Math.PI * 2;

const VERT = /* glsl */ `
  precision highp float;

  attribute float aShell;   // 0..1 base radius (which lattice shell)
  attribute float aAz;      // 0..TAU seed azimuth
  attribute float aPolar;   // 0..PI seed polar angle
  attribute float aRnd;     // per-point randomness

  uniform float uTime;
  uniform float uSymmetry;  // folding order (float, morphs smoothly)
  uniform float uTwist;
  uniform float uScale;
  uniform float uBloom;     // wavefront radius, 0..~1.3
  uniform float uAudio;     // 0..1
  uniform float uPointSize;
  uniform float uDpr;

  varying float vGlow;
  varying float vShell;

  void main() {
    // ── kaleidoscopic fold of the azimuth into uSymmetry mirrored sectors ──────
    float sector = 6.2831853 / max(2.0, uSymmetry);
    float lobe = floor(aAz / sector);
    float within = aAz - lobe * sector;
    // mirror within each sector so the motif reflects like a kaleidoscope
    within = abs(within - sector * 0.5);
    float phi = lobe * sector + within;

    // spiral shear across shells (a Kluver spiral form-constant), plus a slow
    // breathing rotation so the solid always turns a little on its own axis.
    phi += uTwist * aShell + uTime * 0.06;

    // polar facets: a gentle top/bottom mirror keeps it a closed solid
    float theta = aPolar;
    theta += sin(theta * 3.0 + uTime * 0.2) * 0.03;

    // ── onset bloom wavefront: a gaussian ring travelling outward ─────────────
    float d = aShell - uBloom;
    float wave = exp(-d * d * 46.0);

    float rr = aShell * uScale * (1.0 + wave * 0.22 + uAudio * 0.05);

    vec3 pos = rr * vec3(
      sin(theta) * cos(phi),
      cos(theta),
      sin(theta) * sin(phi)
    );

    vGlow = 0.35 + aRnd * 0.5 + wave * 1.7 + uAudio * 0.4;
    vShell = aShell;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = -mv.z;
    gl_PointSize = uPointSize * uDpr * (0.5 + aRnd * 0.9) *
                   (1.0 + wave * 1.2) * (300.0 / max(1.0, dist));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uJewel;   // the saturated facet tone
  uniform float uBright;

  varying float vGlow;
  varying float vShell;

  void main() {
    // soft round dot
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float falloff = smoothstep(0.5, 0.0, r);
    float core = pow(falloff, 3.0);

    // cold silver-mercury core that blooms to the jewel tone at the rim
    vec3 silver = vec3(0.78, 0.83, 0.92);
    vec3 col = mix(uJewel, silver, core * 0.85);

    float g = vGlow * uBright * (0.55 + vShell * 0.55);
    gl_FragColor = vec4(col * g * falloff, falloff);
  }
`;

export interface HarmonyState {
  /** folding order the crystal is retuning toward (chord root). */
  symmetry: number;
  /** spiral shear (chord minorness / tension). */
  twist: number;
  /** the jewel tone, linear-ish rgb 0..1. */
  jewel: [number, number, number];
  /** point brightness from note density, 0..~1.5. */
  brightness: number;
}

export interface PhospheneLattice {
  object3d: THREE.Group;
  /** ease the crystal toward a new harmony target. */
  setHarmony(next: Partial<HarmonyState>): void;
  /** launch an onset bloom wavefront from the core outward. */
  pulse(strength: number): void;
  /** advance one frame. audio is a 0..1 continuous shimmer level. */
  update(dt: number, audio: number): void;
  dispose(): void;
}

export function buildLattice(pointCount = 15000): PhospheneLattice {
  const group = new THREE.Group();

  // ── the point cloud ─────────────────────────────────────────────────────────
  const shells = new Float32Array(pointCount);
  const az = new Float32Array(pointCount);
  const polar = new Float32Array(pointCount);
  const rnd = new Float32Array(pointCount);

  const SHELL_COUNT = 9;
  for (let i = 0; i < pointCount; i++) {
    const k = i % SHELL_COUNT;
    // bias points outward a touch so the jewel has a bright skin
    const base = (k + 1) / SHELL_COUNT;
    shells[i] = base * (0.82 + Math.random() * 0.18);
    az[i] = Math.random() * TAU;
    // concentrate points away from the exact poles so it reads as faceted
    polar[i] = 0.12 + Math.random() * (Math.PI - 0.24);
    rnd[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  // position is a required attribute; the shader ignores it but three needs a
  // count, so hand it a zeroed one of the right length.
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3));
  geo.setAttribute("aShell", new THREE.BufferAttribute(shells, 1));
  geo.setAttribute("aAz", new THREE.BufferAttribute(az, 1));
  geo.setAttribute("aPolar", new THREE.BufferAttribute(polar, 1));
  geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);

  const uniforms = {
    uTime: { value: 0 },
    uSymmetry: { value: 6 },
    uTwist: { value: 0.6 },
    uScale: { value: 2.6 },
    uBloom: { value: 2 }, // parked past the outer shell = invisible
    uAudio: { value: 0 },
    uBright: { value: 1 },
    uPointSize: { value: 3.4 },
    uDpr: { value: 1 },
    uJewel: { value: new THREE.Color(0.55, 0.32, 0.86) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // ── the facet-cage: a thin silver icosahedral wireframe = the crystal's edges
  const cageGeo = new THREE.IcosahedronGeometry(1, 1);
  const cageWire = new THREE.WireframeGeometry(cageGeo);
  const cageMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(0.72, 0.78, 0.9),
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const cage = new THREE.LineSegments(cageWire, cageMat);
  group.add(cage);

  // ── eased harmony targets ─────────────────────────────────────────────────────
  const target: HarmonyState = {
    symmetry: 6,
    twist: 0.6,
    jewel: [0.55, 0.32, 0.86],
    brightness: 1,
  };
  let bloomActive = false;

  return {
    object3d: group,

    setHarmony(next) {
      if (next.symmetry !== undefined) target.symmetry = next.symmetry;
      if (next.twist !== undefined) target.twist = next.twist;
      if (next.jewel !== undefined) target.jewel = next.jewel;
      if (next.brightness !== undefined) target.brightness = next.brightness;
    },

    pulse(strength) {
      // (re)launch the wavefront from the core; strength scales how bright it is
      uniforms.uBloom.value = -0.05;
      uniforms.uPointSize.value = 3.4 + strength * 2.2;
      bloomActive = true;
    },

    update(dt, audio) {
      uniforms.uTime.value += dt;
      // continuous shimmer
      uniforms.uAudio.value += (audio - uniforms.uAudio.value) * 0.2;

      // ease every carved parameter toward its harmonic target
      const k = 1 - Math.pow(0.0016, dt); // ~time-constant easing
      uniforms.uSymmetry.value += (target.symmetry - uniforms.uSymmetry.value) * k;
      uniforms.uTwist.value += (target.twist - uniforms.uTwist.value) * k;
      uniforms.uBright.value += (target.brightness - uniforms.uBright.value) * k;
      const jc = uniforms.uJewel.value;
      jc.r += (target.jewel[0] - jc.r) * k;
      jc.g += (target.jewel[1] - jc.g) * k;
      jc.b += (target.jewel[2] - jc.b) * k;

      // advance the bloom wavefront outward, then park it
      if (bloomActive) {
        uniforms.uBloom.value += dt * 1.35;
        if (uniforms.uBloom.value > 1.35) {
          bloomActive = false;
          uniforms.uBloom.value = 2;
          uniforms.uPointSize.value = 3.4;
        }
      }

      // the cage tracks the crystal's size and turns against its inner twist
      const scale = uniforms.uScale.value;
      cage.scale.setScalar(scale * 1.02);
      cage.rotation.y -= dt * 0.05;
      cage.rotation.x += dt * 0.02;
      (cage.material as THREE.LineBasicMaterial).opacity =
        0.14 + audio * 0.14 + (bloomActive ? 0.1 : 0);
    },

    dispose() {
      geo.dispose();
      mat.dispose();
      cageGeo.dispose();
      cageWire.dispose();
      cageMat.dispose();
    },
  };
}
