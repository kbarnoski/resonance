// 766 · Sky Orrery — visual renderer.
//
// A real three.js 3D celestial dome: a large inverted sphere with a daylight
// gradient that shifts with sun elevation, a glowing sun sprite, a phased moon,
// a scatter of bright stars/planets — all placed at computed altitude/azimuth.
// Bodies pulse softly on phrase onsets. If WebGL is unavailable we fall back to
// a Canvas2D sky that still shows day/night colour and the same bodies, so the
// piece never dies to a notice-only state.
//
// Everything that touches the DOM/GL is constructed inside createDome(), which
// is only ever called from inside a React effect — nothing here runs at module
// scope.

import * as THREE from "three";

export type RenderBody = {
  id: string;
  kind: "sun" | "moon" | "planet" | "star";
  altDeg: number;
  azDeg: number;
  color: string;
  mag: number;
  /** 0..1 voice gain (drives glow) */
  gain: number;
  /** 0..1 moon illuminated fraction (moon only) */
  illum?: number;
  /** synodic phase 0..1 (moon only) */
  phase?: number;
};

export type DomeState = {
  bodies: RenderBody[];
  daylight: number; // 0 night .. 1 day
  level: number; // master audio RMS 0..~0.5 — drives a subtle horizon shimmer
};

export type Dome = {
  mode: "webgl" | "canvas2d";
  render: (s: DomeState) => void;
  pulse: (id: string) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
};

const DEG = Math.PI / 180;

/** altitude/azimuth (deg) → unit vector on the celestial sphere.
 *  three.js: +Y up, looking toward -Z (north). az 0=N,90=E. */
function altAzToVec(altDeg: number, azDeg: number): THREE.Vector3 {
  const alt = altDeg * DEG;
  const az = azDeg * DEG;
  const cosAlt = Math.cos(alt);
  // North = -Z, East = +X, up = +Y.
  return new THREE.Vector3(
    cosAlt * Math.sin(az),
    Math.sin(alt),
    -cosAlt * Math.cos(az),
  );
}

// Sky gradient colours by daylight factor.
function skyTop(d: number, c: THREE.Color): THREE.Color {
  // night deep indigo → day blue
  return c.setRGB(
    0.02 + d * 0.18,
    0.03 + d * 0.45,
    0.09 + d * 0.78,
  );
}
function skyHorizon(d: number, c: THREE.Color): THREE.Color {
  // night warm-dim → day pale + a golden-hour lift near d~0.45
  const gold = Math.max(0, 1 - Math.abs(d - 0.42) / 0.22);
  return c.setRGB(
    0.06 + d * 0.55 + gold * 0.35,
    0.05 + d * 0.5 + gold * 0.18,
    0.12 + d * 0.62,
  );
}

export function createDome(
  container: HTMLDivElement,
  width: number,
  height: number,
): Dome {
  // ---- Try WebGL ----------------------------------------------------------
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    renderer = null;
  }

  if (!renderer) {
    return createCanvas2D(container, width, height);
  }

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  const canvas = renderer.domElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 100);
  // Stand at centre, look toward the southern sky, slightly up.
  camera.position.set(0, 0.0, 0);
  camera.lookAt(0, 0.55, -1);

  const disposables: { dispose: () => void }[] = [];

  // ---- Sky dome: large inverted sphere with a vertex gradient -------------
  const domeGeo = new THREE.SphereGeometry(40, 48, 32);
  const topColor = new THREE.Color();
  const horColor = new THREE.Color();
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: new THREE.Color(0.05, 0.1, 0.3) },
      uHorizon: { value: new THREE.Color(0.1, 0.1, 0.2) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying float vY;
      void main() {
        float t = clamp(vY * 0.5 + 0.5, 0.0, 1.0);
        float k = smoothstep(0.42, 0.85, t);
        vec3 col = mix(uHorizon, uTop, k);
        // darken below horizon (ground glow)
        col *= mix(0.35, 1.0, smoothstep(-0.15, 0.06, vY));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  scene.add(dome);
  disposables.push(domeGeo, domeMat);

  // ---- Soft horizon ring --------------------------------------------------
  const ringGeo = new THREE.RingGeometry(38.5, 40, 96);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x0a0e18,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  disposables.push(ringGeo, ringMat);

  // ---- Background faint star field (rotates with sidereal drift) ----------
  const STAR_N = 600;
  const starPos = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++) {
    const v = new THREE.Vector3()
      .randomDirection()
      .multiplyScalar(38);
    if (v.y < 0) v.y = Math.abs(v.y) * 0.3; // bias above horizon
    starPos[i * 3] = v.x;
    starPos[i * 3 + 1] = v.y;
    starPos[i * 3 + 2] = v.z;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.22,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);
  disposables.push(starGeo, starMat);

  // ---- Radial glow sprite texture (shared) --------------------------------
  const glowTex = makeGlowTexture();
  disposables.push(glowTex);

  // ---- Per-body sprite groups --------------------------------------------
  type BodyVisual = {
    group: THREE.Group;
    glow: THREE.Sprite;
    glowMat: THREE.SpriteMaterial;
    core: THREE.Sprite;
    coreMat: THREE.SpriteMaterial;
    pulse: number;
  };
  const visuals = new Map<string, BodyVisual>();

  function ensureVisual(b: RenderBody): BodyVisual {
    const existing = visuals.get(b.id);
    if (existing) return existing;
    const group = new THREE.Group();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(b.color),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    const coreMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(b.color),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Sprite(coreMat);
    group.add(glow);
    group.add(core);
    scene.add(group);
    const v: BodyVisual = { group, glow, glowMat, core, coreMat, pulse: 0 };
    visuals.set(b.id, v);
    disposables.push(glowMat, coreMat);
    return v;
  }

  const tmpColor = new THREE.Color();
  let siderealDrift = 0;

  function render(s: DomeState): void {
    const d = s.daylight;
    domeMat.uniforms.uTop.value.copy(skyTop(d, topColor));
    domeMat.uniforms.uHorizon.value.copy(skyHorizon(d, horColor));
    const shimmer = Math.min(0.12, s.level * 0.4);
    ringMat.color.setRGB(
      0.04 + d * 0.2 + shimmer,
      0.05 + d * 0.18 + shimmer,
      0.08 + d * 0.22 + shimmer,
    );

    // Stars visible only when dark; gently drift to suggest sidereal turn.
    starMat.opacity = Math.max(0, 0.85 * (1 - d));
    siderealDrift += 0.00008;
    starField.rotation.y = siderealDrift;

    const seen = new Set<string>();
    for (const b of s.bodies) {
      seen.add(b.id);
      const v = ensureVisual(b);
      const up = b.altDeg > -2;
      const dir = altAzToVec(b.altDeg, b.azDeg);
      v.group.position.copy(dir.multiplyScalar(34));
      v.group.visible = up;
      if (!up) continue;

      const altN = Math.max(0, Math.min(1, b.altDeg / 90));
      // size: sun/moon big, planets medium, stars small; scaled by mag.
      let baseSize = 1.0;
      if (b.kind === "sun") baseSize = 5.2;
      else if (b.kind === "moon") baseSize = 4.2;
      else if (b.kind === "planet") baseSize = 1.7;
      else baseSize = 1.1;

      const pulse = v.pulse;
      const coreSize = baseSize * (1 + pulse * 0.5);
      v.core.scale.setScalar(coreSize);
      v.glow.scale.setScalar(coreSize * (2.6 + b.gain * 2.2 + pulse * 1.5));

      // Brightness: stars/planets fade out in daylight; sun blazes in day.
      let coreOpacity = 0.85;
      let glowOpacity = 0.25 + b.gain * 0.55 + pulse * 0.4;
      if (b.kind === "sun") {
        coreOpacity = 0.9 * Math.max(0.15, d);
        glowOpacity = (0.5 + b.gain * 0.5) * Math.max(0.2, d);
      } else if (b.kind === "moon") {
        const ill = b.illum ?? 0.5;
        coreOpacity = 0.35 + 0.55 * ill;
        glowOpacity = (0.2 + b.gain * 0.4) * (0.4 + 0.6 * (1 - d));
      } else {
        // stars & planets fade with daylight
        const vis = Math.max(0, 1 - d * 1.15);
        coreOpacity = (0.5 + b.mag * 0.5) * vis * (0.5 + altN * 0.5);
        glowOpacity *= vis;
      }
      v.coreMat.opacity = coreOpacity;
      v.glowMat.opacity = glowOpacity;
      v.coreMat.color.copy(tmpColor.set(b.color));
      v.glowMat.color.copy(tmpColor.set(b.color));

      v.pulse *= 0.9; // decay pulse
    }

    // hide visuals for bodies no longer present
    visuals.forEach((v, id) => {
      if (!seen.has(id)) v.group.visible = false;
    });

    renderer!.render(scene, camera);
  }

  function pulse(id: string): void {
    const v = visuals.get(id);
    if (v) v.pulse = Math.min(1.4, v.pulse + 1.0);
  }

  function resize(w: number, h: number): void {
    renderer!.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose(): void {
    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
    glowTex.dispose();
    scene.clear();
    try {
      renderer!.dispose();
      renderer!.forceContextLoss();
    } catch {
      // ignore
    }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { mode: "webgl", render, pulse, resize, dispose };
}

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const g = cv.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.25)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Canvas2D fallback — still a sky, still the bodies, still day/night colour.
// ---------------------------------------------------------------------------

function createCanvas2D(
  container: HTMLDivElement,
  width: number,
  height: number,
): Dome {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const pulses = new Map<string, number>();
  let w = canvas.width;
  let h = canvas.height;

  function project(altDeg: number, azDeg: number): { x: number; y: number } {
    // Simple dome projection: azimuth → x across, altitude → y up.
    // Centre on south (az 180). Map az 90..270 across the visible field.
    let rel = azDeg - 180;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    const x = w * (0.5 + rel / 220);
    const horizonY = h * 0.82;
    const y = horizonY - (altDeg / 90) * (horizonY - h * 0.08);
    return { x, y };
  }

  function render(s: DomeState): void {
    if (!ctx) return;
    const d = s.daylight;
    // Sky gradient.
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.85);
    const top = skyTop(d, new THREE.Color());
    const hor = skyHorizon(d, new THREE.Color());
    grad.addColorStop(
      0,
      `rgb(${(top.r * 255) | 0},${(top.g * 255) | 0},${(top.b * 255) | 0})`,
    );
    grad.addColorStop(
      1,
      `rgb(${(hor.r * 255) | 0},${(hor.g * 255) | 0},${(hor.b * 255) | 0})`,
    );
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Ground.
    ctx.fillStyle = `rgba(8,10,16,${0.85})`;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);

    for (const b of s.bodies) {
      if (b.altDeg < -2) continue;
      const { x, y } = project(b.altDeg, b.azDeg);
      const pulse = pulses.get(b.id) ?? 0;
      let r = 4;
      if (b.kind === "sun") r = 26;
      else if (b.kind === "moon") r = 20;
      else if (b.kind === "planet") r = 7;
      else r = 4;
      r *= 1 + pulse * 0.5;

      let alpha = 0.9;
      if (b.kind === "star" || b.kind === "planet") {
        alpha = Math.max(0, 1 - d * 1.1) * (0.5 + b.mag * 0.5);
      } else if (b.kind === "sun") {
        alpha = Math.max(0.2, d);
      }
      if (alpha <= 0.01) continue;

      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * (3 + b.gain * 2));
      g2.addColorStop(0, hexToRGBA(b.color, alpha));
      g2.addColorStop(0.3, hexToRGBA(b.color, alpha * 0.5));
      g2.addColorStop(1, hexToRGBA(b.color, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x, y, r * (3 + b.gain * 2), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = hexToRGBA(b.color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      pulses.set(b.id, pulse * 0.9);
    }
  }

  function pulse(id: string): void {
    pulses.set(id, Math.min(1.4, (pulses.get(id) ?? 0) + 1.0));
  }

  function resize(nw: number, nh: number): void {
    canvas.width = Math.floor(nw * ratio);
    canvas.height = Math.floor(nh * ratio);
    w = canvas.width;
    h = canvas.height;
  }

  function dispose(): void {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { mode: "canvas2d", render, pulse, resize, dispose };
}

function hexToRGBA(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
}
