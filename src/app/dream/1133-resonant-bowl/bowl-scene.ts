// ════════════════════════════════════════════════════════════════════════════
// bowl-scene.ts — the 3D resonance-bath (true three.js / WebGL).
//
// Concentric luminous point-shells sit around a central bowl. Each shell is a
// sphere of points; each point is displaced along its radius by a Chladni-like
// spherical-harmonic nodal function of its direction, scaled by ONE overtone
// partial's amplitude (shell i ← partial i). So a strike lights the whole nested
// stack of standing-wave shells, low partials driving the big slow outer shells
// and high partials the tight inner ones. Everything breathes over many seconds;
// rubbing the rim makes the shells shimmer. Additive transparent blending gives a
// cheap volumetric glow. The camera drifts slowly on its own orbit.
// ════════════════════════════════════════════════════════════════════════════

import * as THREE from "three";

const COOL_TEAL = new THREE.Color(0x2ee6d6);
const SOFT_VIOLET = new THREE.Color(0x9d7bff);

export interface BowlScene {
  render(
    amps: ArrayLike<number>,
    energy: number,
    rub: number,
    timeSec: number,
  ): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

// A cheap Chladni-like zonal+sectoral scalar in [-1,1] from a unit direction.
function harmonicScalar(x: number, y: number, z: number, l: number): number {
  const theta = Math.acos(Math.max(-1, Math.min(1, z))); // polar
  const phi = Math.atan2(y, x); // azimuth
  const m = l;
  return Math.cos(l * theta) * 0.6 + Math.sin(m * phi) * Math.sin(theta) * 0.4;
}

function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

interface Shell {
  points: THREE.Points;
  geom: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  dirs: Float32Array; // unit directions, xyz per vertex
  sh: Float32Array; // precomputed harmonic scalar per vertex
  baseRadius: number;
  phase: number;
}

export function makeBowlScene(
  container: HTMLElement,
  shellCount: number,
): BowlScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.setClearColor(0x05060f, 1);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.028);

  const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 200);
  camera.position.set(0, 2.5, 11);
  camera.lookAt(0, 0, 0);

  const glowTex = makeGlowTexture();

  // ── central bowl: a lathe profile, dark metal with a faint teal emissive ──
  const profile: THREE.Vector2[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // bowl silhouette: rounded base rising to a flared rim
    const y = -1.1 + t * 1.7;
    const bulge = Math.sin(t * Math.PI * 0.62);
    const r = 0.35 + bulge * 1.15 + Math.pow(t, 3) * 0.35;
    profile.push(new THREE.Vector2(r, y));
  }
  const bowlGeom = new THREE.LatheGeometry(profile, 96);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: 0x1a2236,
    metalness: 0.85,
    roughness: 0.35,
    emissive: new THREE.Color(0x0d3a44),
    emissiveIntensity: 0.4,
    side: THREE.DoubleSide,
  });
  const bowl = new THREE.Mesh(bowlGeom, bowlMat);
  scene.add(bowl);

  const ambient = new THREE.AmbientLight(0x334466, 0.6);
  const key = new THREE.PointLight(0x66ffe0, 1.2, 40);
  key.position.set(3, 6, 5);
  scene.add(ambient, key);

  // soft central bloom sprite (cheap glow that swells with energy)
  const bloomMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: COOL_TEAL.clone(),
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bloom = new THREE.Sprite(bloomMat);
  bloom.scale.set(6, 6, 1);
  scene.add(bloom);

  // ── resonance shells ──
  const shells: Shell[] = [];
  const detail = 3; // icosphere subdivision → ~642 verts/shell
  for (let i = 0; i < shellCount; i++) {
    const ico = new THREE.IcosahedronGeometry(1, detail);
    const src = ico.getAttribute("position") as THREE.BufferAttribute;
    const count = src.count;
    const dirs = new Float32Array(count * 3);
    const sh = new Float32Array(count);
    const l = i + 2; // more nodal bands on inner shells
    for (let v = 0; v < count; v++) {
      const x = src.getX(v);
      const y = src.getY(v);
      const z = src.getZ(v);
      const len = Math.hypot(x, y, z) || 1;
      const ux = x / len;
      const uy = y / len;
      const uz = z / len;
      dirs[v * 3] = ux;
      dirs[v * 3 + 1] = uy;
      dirs[v * 3 + 2] = uz;
      sh[v] = harmonicScalar(ux, uy, uz, l);
    }
    ico.dispose();

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(dirs.slice(), 3));

    const color = COOL_TEAL.clone().lerp(
      SOFT_VIOLET,
      shellCount > 1 ? i / (shellCount - 1) : 0,
    );
    const material = new THREE.PointsMaterial({
      color,
      map: glowTex,
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, material);
    scene.add(points);

    shells.push({
      points,
      geom,
      material,
      dirs,
      sh,
      baseRadius: 2.2 + i * 1.35,
      phase: i * 1.7,
    });
  }

  function render(
    amps: ArrayLike<number>,
    energy: number,
    rub: number,
    timeSec: number,
  ) {
    // slow drifting camera orbit
    const orbit = timeSec * 0.045;
    const rad = 11 + Math.sin(timeSec * 0.05) * 1.2;
    camera.position.set(
      Math.sin(orbit) * rad,
      2.2 + Math.sin(timeSec * 0.07) * 1.6,
      Math.cos(orbit) * rad,
    );
    camera.lookAt(0, 0, 0);

    // bowl + bloom respond to energy
    bowlMat.emissiveIntensity = 0.35 + Math.min(1.4, energy * 6);
    const bloomScale = 5.5 + Math.min(9, energy * 40);
    bloom.scale.set(bloomScale, bloomScale, 1);
    bloomMat.opacity = 0.18 + Math.min(0.5, energy * 3);
    bloomMat.color.copy(COOL_TEAL).lerp(SOFT_VIOLET, Math.min(1, rub));

    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i];
      const amp = i < amps.length ? amps[i] : 0;
      const attr = shell.geom.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;

      const breathe = 1 + 0.055 * Math.sin(timeSec * 0.16 + shell.phase);
      const shimmerFreq = 0.5 + i * 0.12;
      const shimmerAmp = 0.55 + 0.45 * (1 + rub); // rubbing lifts the shimmer
      const displace = amp * (7.5 + rub * 4);

      const count = shell.sh.length;
      for (let v = 0; v < count; v++) {
        const shimmer =
          0.6 +
          0.4 * Math.sin(timeSec * shimmerFreq + shell.phase + shell.sh[v] * 3);
        const mag =
          shell.baseRadius * breathe +
          displace * shell.sh[v] * shimmer * shimmerAmp;
        const b = v * 3;
        arr[b] = shell.dirs[b] * mag;
        arr[b + 1] = shell.dirs[b + 1] * mag;
        arr[b + 2] = shell.dirs[b + 2] * mag;
      }
      attr.needsUpdate = true;

      shell.material.opacity = Math.max(
        0.08,
        Math.min(0.85, 0.1 + amp * 3.2 + rub * 0.15),
      );
      shell.material.size = 0.13 + Math.min(0.22, amp * 2.5);
    }

    renderer.render(scene, camera);
  }

  function resize(nw: number, nh: number) {
    camera.aspect = nw / Math.max(1, nh);
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  }

  function dispose() {
    for (const shell of shells) {
      scene.remove(shell.points);
      shell.geom.dispose();
      shell.material.dispose();
    }
    scene.remove(bowl, bloom, ambient, key);
    bowlGeom.dispose();
    bowlMat.dispose();
    bloomMat.dispose();
    glowTex.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { render, resize, dispose };
}
