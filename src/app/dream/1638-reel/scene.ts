// 1638-reel — scene.ts
//
// The cinematic visual: an abstract widescreen ATMOSPHERE rendered by a
// fragment shader on a fullscreen three.js quad (WebGL — never Canvas 2D).
// A drifting horizon, layered volumetric fog bands, particulate light and a
// slow filmic camera push. Everything — color grade, turbulence, fog density,
// horizon glow, grain — is driven by the SAME dramatic-tension signal that
// drives the score, handed in from story.ts each frame.
//
// Guarded three ways (capability check, constructor try/catch, context null
// check); createReelScene returns null so the page can degrade to audio-only.

import * as THREE from "three";

export interface ReelSceneHandle {
  update(
    time: number,
    tension: number,
    shadow: [number, number, number],
    mid: [number, number, number],
    hi: [number, number, number],
    turb: number,
    fog: number,
    reduced: boolean,
  ): void;
  resize(): void;
  dispose(): void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uTension;
  uniform vec2  uRes;
  uniform vec3  uShadow;
  uniform vec3  uMid;
  uniform vec3  uHi;
  uniform float uTurb;
  uniform float uFog;
  uniform float uReduced;

  // ---- value noise + fbm -------------------------------------------------
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p = m * p;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // widescreen aspect-corrected coordinates, origin at frame centre
    vec2 uv = vUv;
    float aspect = uRes.x / max(1.0, uRes.y);
    vec2 p = (uv - 0.5);
    p.x *= aspect;

    float camScale = mix(1.0, 0.35, uReduced); // reduced-motion: gentle drift
    float t = uTime * camScale;

    // slow filmic push-in + lateral drift
    float push = 1.0 + 0.06 * sin(t * 0.05);
    p *= push;
    p.x += 0.04 * sin(t * 0.033);

    // horizon sits a touch below centre; it rises slightly as tension climbs
    float horizon = -0.02 + uTension * 0.06;
    float dToHorizon = p.y - horizon;

    // turbulent atmosphere: fbm advected sideways, warped harder with tension
    float warp = 0.35 + uTurb * 1.4;
    vec2 q = vec2(
      p.x * 1.4 + t * 0.02,
      p.y * (2.2 + uTurb * 1.5) - t * (0.015 + uTurb * 0.05)
    );
    float f = fbm(q + fbm(q * 0.7 + vec2(t * 0.01, 0.0)) * warp);

    // vertical banding — volumetric strata thicker in the lower atmosphere
    float bands = fbm(vec2(p.x * 0.8, p.y * 6.0 - t * 0.04));
    float atmos = mix(f, bands, 0.35);

    // sky-to-ground gradient graded shadow -> mid
    float g = smoothstep(-0.55, 0.4, p.y);
    vec3 col = mix(uShadow, uMid, g);

    // fog banks sitting near the horizon
    float fogBand = exp(-abs(dToHorizon) * (3.5 + uFog * 4.0));
    float fogMass = fogBand * (0.4 + atmos) * (0.5 + uFog);
    col = mix(col, uMid * 1.1, clamp(fogMass, 0.0, 1.0) * 0.7);

    // the horizon glow — the emotional "light source"; sharpens + heats with
    // tension so the climax burns brightest
    float glowW = mix(0.25, 0.06, uTension);
    float glow = exp(-pow(abs(dToHorizon) / glowW, 2.0));
    float glowAmt = (0.35 + uTension * 0.9) * glow;
    col += uHi * glowAmt;

    // particulate light drifting upward through the beam
    vec2 sp = vec2(p.x * 3.0, p.y * 3.0 - t * 0.12);
    float spark = fbm(sp * 6.0);
    spark = smoothstep(0.72, 0.98, spark);
    col += uHi * spark * (0.15 + uTension * 0.4) * glow;

    // turbulence lifts mid-tones into highlight where the atmosphere churns
    col = mix(col, uHi, clamp(atmos * uTurb * 0.5, 0.0, 0.6));

    // filmic vignette
    float vig = smoothstep(1.25, 0.35, length(p));
    col *= 0.55 + 0.45 * vig;

    // subtle, non-strobing film grain (spatial + slow temporal drift)
    float grain = hash(uv * uRes + floor(t * 6.0)) - 0.5;
    col += grain * 0.035;

    // gentle filmic tone curve
    col = col / (col + vec3(0.85));
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createReelScene(mount: HTMLElement): ReelSceneHandle | null {
  if (!hasWebGL()) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!renderer.getContext()) return null;
  } catch {
    return null;
  }

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);

  const uniforms = {
    uTime: { value: 0 },
    uTension: { value: 0 },
    uRes: {
      value: new THREE.Vector2(
        (mount.clientWidth || 1) * dpr,
        (mount.clientHeight || 1) * dpr,
      ),
    },
    uShadow: { value: new THREE.Vector3(0.04, 0.07, 0.12) },
    uMid: { value: new THREE.Vector3(0.12, 0.23, 0.27) },
    uHi: { value: new THREE.Vector3(0.78, 0.66, 0.42) },
    uTurb: { value: 0.2 },
    uFog: { value: 0.5 },
    uReduced: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  function resize() {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h);
    uniforms.uRes.value.set(w * dpr, h * dpr);
  }

  function update(
    time: number,
    tension: number,
    shadow: [number, number, number],
    mid: [number, number, number],
    hi: [number, number, number],
    turb: number,
    fog: number,
    reduced: boolean,
  ) {
    uniforms.uTime.value = time;
    uniforms.uTension.value = tension;
    uniforms.uShadow.value.set(shadow[0], shadow[1], shadow[2]);
    uniforms.uMid.value.set(mid[0], mid[1], mid[2]);
    uniforms.uHi.value.set(hi[0], hi[1], hi[2]);
    uniforms.uTurb.value = turb;
    uniforms.uFog.value = fog;
    uniforms.uReduced.value = reduced ? 1 : 0;
    renderer.render(scene, camera);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    const gl = renderer.getContext();
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
  }

  return { update, resize, dispose };
}
