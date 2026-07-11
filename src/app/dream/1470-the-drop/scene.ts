// 1470-the-drop — scene.ts
//
// The sandpile rendered as a three.js scene-graph 3D INSTANCED-COLUMN TERRAIN:
// one THREE.InstancedMesh of N×N unit columns, each column's HEIGHT = its grain
// count and each column's COLOUR an ember gradient with a white-hot highlight
// driven by the cell's "heat" (how recently it toppled). An avalanche is a wave
// of light rippling across the landscape. The material is unlit MeshBasicMaterial
// so nothing can render black from a lighting misconfiguration.
//
// Guarded three ways: WebGL capability check, constructor try/catch, and a
// getContext() null-check. createDropScene returns null if any fails.

import * as THREE from "three";

export interface DropSceneHandle {
  /** Redraw from the live grain + heat arrays. flash in [0,1] adds a molten
   *  bloom across the whole terrain on a big drop (a slow luminance drift). */
  update(dt: number, elapsed: number, reduced: boolean, flash: number): void;
  /** Camera ray → grid cell under the pointer (NDC in [-1,1]); null if it misses. */
  pickGrid(ndcX: number, ndcY: number): { gx: number; gy: number } | null;
  resize(): void;
  dispose(): void;
}

const CELL = 1.0; // world size of one column footprint
const HEIGHT_UNIT = 0.95; // world height per grain (relief exaggerated a touch)
const BG = 0x0a0503; // near-black molten ember (NOT cosmic void)

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

export function createDropScene(
  mount: HTMLElement,
  n: number,
  h: Int32Array,
  heat: Float32Array,
): DropSceneHandle | null {
  if (!hasWebGL()) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!renderer.getContext()) return null;
  } catch {
    return null;
  }

  let width = Math.max(1, mount.clientWidth);
  let height = Math.max(1, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(BG, 1);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  mount.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.012);

  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 400);
  const span = n * CELL;

  // ── the terrain: one instanced box, base sitting on y=0 ──
  const count = n * n;
  const geo = new THREE.BoxGeometry(CELL * 0.92, 1, CELL * 0.92);
  geo.translate(0, 0.5, 0); // anchor base at y=0 so scaleY grows upward
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  // static XZ position per instance; only Y-scale + colour change per frame
  const px = new Float32Array(count);
  const pz = new Float32Array(count);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      px[i] = (x - (n - 1) / 2) * CELL;
      pz[i] = (y - (n - 1) / 2) * CELL;
    }
  }

  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();

  // ember palette anchors
  const lowC = new THREE.Color(0x2a0b05); // cool ember floor
  const midC = new THREE.Color(0xc4400c); // glowing orange
  const highC = new THREE.Color(0xffb347); // bright ember crest
  const hotC = new THREE.Color(0xfff2c8); // white-hot topple flash
  const bgColor = new THREE.Color(BG); // preallocated for the per-frame bloom

  // initialise instances once
  for (let i = 0; i < count; i++) {
    const sy = Math.max(0.05, h[i] * HEIGHT_UNIT);
    m4.makeScale(1, sy, 1);
    m4.setPosition(px[i], 0, pz[i]);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, lowC);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // a dim ground disc so the terrain never floats in pure black
  const floorGeo = new THREE.CircleGeometry(span * 0.95, 48);
  const floorMat = new THREE.MeshBasicMaterial({
    color: 0x160804,
    fog: true,
    transparent: true,
    opacity: 0.9,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  let orbit = 0.6;

  function applyCamera(elapsed: number): void {
    // a grazing orbit so the toppling spikes read as a lit skyline
    const radius = span * 0.82;
    const camY = span * 0.4;
    camera.position.set(
      Math.cos(orbit) * radius,
      camY,
      Math.sin(orbit) * radius,
    );
    camera.lookAt(0, span * 0.04, 0);
    void elapsed;
  }
  applyCamera(0);

  function tempColor(hi: number, ht: number, flash: number): THREE.Color {
    // height → ember ramp (low → mid → crest)
    const t = Math.min(1, hi / 6);
    if (t < 0.5) {
      col.copy(lowC).lerp(midC, t * 2);
    } else {
      col.copy(midC).lerp(highC, (t - 0.5) * 2);
    }
    // heat → white-hot topple highlight
    if (ht > 0.001) col.lerp(hotC, Math.min(1, ht));
    // big-drop bloom lifts the whole terrain toward ember (uniform drift)
    if (flash > 0.001) col.lerp(hotC, flash * 0.5);
    return col;
  }

  return {
    update(dt, elapsed, reduced, flash) {
      // slow camera drift; frozen / sub-Hz under reduced motion
      const rate = reduced ? 0.006 : 0.045;
      orbit += dt * rate;
      applyCamera(elapsed);

      for (let i = 0; i < count; i++) {
        const sy = Math.max(0.05, h[i] * HEIGHT_UNIT);
        m4.makeScale(1, sy, 1);
        m4.setPosition(px[i], 0, pz[i]);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, tempColor(h[i], heat[i], flash));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // molten bloom lifts fog colour a touch on a big drop (drift, ≤3 Hz)
      const bloom = flash * 0.25;
      col.copy(bgColor).lerp(hotC, bloom);
      renderer.setClearColor(col, 1);
      if (scene.fog) (scene.fog as THREE.FogExp2).color.copy(col);

      renderer.render(scene, camera);
    },
    pickGrid(ndcX, ndcY) {
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
      if (!hit) return null;
      const gx = hit.x / CELL + (n - 1) / 2;
      const gy = hit.z / CELL + (n - 1) / 2;
      if (gx < 0 || gy < 0 || gx > n - 1 || gy > n - 1) return null;
      return { gx: gx / (n - 1), gy: gy / (n - 1) };
    },
    resize() {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
      const gl = renderer.getContext();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    },
  };
}
