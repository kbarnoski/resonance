// 2304-seismic-choir — three.js globe.
//
// A slowly auto-rotating abyssal-teal wireframe Earth on near-black, with a
// glowing magma-amber marker at every quake's real lon/lat. Marker size scales
// with magnitude and gently pulses; color runs from bright amber (shallow) to
// deep ember (deep). Drag to orbit; click a marker to SOLO it (spotlight +
// stats). Auto-rotation resumes after a short idle. One driver per frame mutates
// three.js state through refs — React never re-renders per frame.
//
// Palette is deliberately TECTONIC (teal/slate + magma amber), not violet-gold.

import * as THREE from "three";
import type { Quake } from "./data";

// Tectonic palette (raw hex is fine INSIDE the art).
const COL_WIRE = 0x24525c; // abyssal slate-teal
const COL_GRAT = 0x16343c; // fainter graticule
const COL_SHELL = 0x03080c; // near-black inner shell
const COL_HALO = 0x1c4a55; // cold atmosphere

// lon/lat -> point on a sphere of radius r. +x right, +y up, -z toward viewer.
function lonLatToVec3(lon: number, lat: number, r: number): THREE.Vector3 {
  const az = (lon * Math.PI) / 180;
  const el = (lat * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(el) * Math.sin(az),
    r * Math.sin(el),
    -r * Math.cos(el) * Math.cos(az)
  );
}

// Depth -> magma color: shallow bright amber -> deep ember red.
function depthColor(depthKm: number): THREE.Color {
  const t = Math.min(depthKm / 600, 1);
  const hue = 0.11 - t * 0.09; // 0.11 amber -> 0.02 ember red
  const light = 0.62 - t * 0.14;
  return new THREE.Color().setHSL(hue, 0.95, light);
}

interface Marker {
  id: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh; // spotlight halo, shown only when soloed
  ringMat: THREE.MeshBasicMaterial;
  baseScale: number;
  phase: number;
}

export class SeismicGlobe {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: THREE.Group;
  private markers = new Map<string, Marker>();
  private disposables: Array<{ dispose: () => void }> = [];
  private host: HTMLElement;
  private raycaster = new THREE.Raycaster();
  private soloId: string | null = null;

  // Orbit / idle state.
  private yaw = 0;
  private pitch = 0.32;
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private idleMs = 0;

  private onResize: () => void;
  private onDown: (e: PointerEvent) => void;
  private onMove: (e: PointerEvent) => void;
  private onUp: (e: PointerEvent) => void;
  private pickCb: (id: string | null) => void;

  constructor(host: HTMLElement, pickCb: (id: string | null) => void) {
    this.host = host;
    this.pickCb = pickCb;
    const w = host.clientWidth || 600;
    const h = host.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 7.4);
    this.camera.lookAt(0, 0, 0);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    const R = 2;

    // Wireframe Earth.
    const sphereGeo = new THREE.SphereGeometry(R, 40, 26);
    const wireGeo = new THREE.WireframeGeometry(sphereGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: COL_WIRE,
      transparent: true,
      opacity: 0.3,
    });
    this.world.add(new THREE.LineSegments(wireGeo, wireMat));
    this.disposables.push(sphereGeo, wireGeo, wireMat);

    // Dark solid shell so back-facing markers read as occluded.
    const shellGeo = new THREE.SphereGeometry(R * 0.985, 36, 24);
    const shellMat = new THREE.MeshBasicMaterial({ color: COL_SHELL });
    this.world.add(new THREE.Mesh(shellGeo, shellMat));
    this.disposables.push(shellGeo, shellMat);

    // Faint graticule rings.
    const gratMat = new THREE.LineBasicMaterial({
      color: COL_GRAT,
      transparent: true,
      opacity: 0.4,
    });
    this.disposables.push(gratMat);
    for (const latDeg of [-60, -30, 0, 30, 60]) {
      const pts: THREE.Vector3[] = [];
      for (let lon = 0; lon <= 360; lon += 6) {
        pts.push(lonLatToVec3(lon, latDeg, R * 1.002));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      this.world.add(new THREE.Line(g, gratMat));
      this.disposables.push(g);
    }

    // Cold atmosphere halo.
    const haloGeo = new THREE.SphereGeometry(R * 1.2, 32, 22);
    const haloMat = new THREE.MeshBasicMaterial({
      color: COL_HALO,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    this.world.add(new THREE.Mesh(haloGeo, haloMat));
    this.disposables.push(haloGeo, haloMat);

    // ── Interaction ─────────────────────────────────────────────────────────
    this.onDown = (e) => {
      this.dragging = true;
      this.moved = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idleMs = 0;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };
    this.onMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw += dx * 0.006;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * 0.006));
      this.idleMs = 0;
    };
    this.onUp = (e) => {
      const wasDrag = this.moved > 6;
      this.dragging = false;
      this.idleMs = 0;
      try {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (!wasDrag) this.pick(e);
    };
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);

    this.onResize = () => {
      const nw = host.clientWidth || w;
      const nh = host.clientHeight || h;
      this.renderer.setSize(nw, nh);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", this.onResize);
  }

  // Click -> raycast markers -> toggle solo through the callback.
  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const m of this.markers.values()) meshes.push(m.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.id as string;
      this.pickCb(id === this.soloId ? null : id);
    } else {
      this.pickCb(null);
    }
  }

  // Reconcile markers with the sounding quake set.
  setQuakes(quakes: Quake[]) {
    const wanted = new Set(quakes.map((q) => q.id));
    const R = 2.05;

    for (const [id, m] of this.markers) {
      if (!wanted.has(id)) {
        this.world.remove(m.mesh);
        this.world.remove(m.ring);
        m.mat.dispose();
        m.ringMat.dispose();
        (m.mesh.geometry as THREE.BufferGeometry).dispose();
        (m.ring.geometry as THREE.BufferGeometry).dispose();
        this.markers.delete(id);
      }
    }

    for (const q of quakes) {
      if (this.markers.has(q.id)) continue;
      const size = 0.03 + q.mag * 0.014;
      const geo = new THREE.SphereGeometry(size, 14, 14);
      const mat = new THREE.MeshBasicMaterial({
        color: depthColor(q.depthKm),
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(lonLatToVec3(q.lon, q.lat, R));
      mesh.userData.id = q.id;
      this.world.add(mesh);

      // Spotlight ring, hidden until soloed.
      const ringGeo = new THREE.RingGeometry(size * 1.8, size * 2.5, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffc061,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(mesh.position);
      this.world.add(ring);

      this.markers.set(q.id, {
        id: q.id,
        mesh,
        mat,
        ring,
        ringMat,
        baseScale: 1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  setSolo(id: string | null) {
    this.soloId = id;
    this.idleMs = 0;
  }

  tick(dt: number, t: number) {
    // Resume auto-rotation after ~2.5 s of no interaction.
    this.idleMs += dt * 1000;
    if (!this.dragging && this.idleMs > 2500) this.yaw += dt * 0.09;

    this.world.rotation.y = this.yaw;
    this.world.rotation.x = this.pitch;

    for (const m of this.markers.values()) {
      const isSolo = m.id === this.soloId;
      const pulse =
        1 + (isSolo ? 0.7 : 0.4) * (0.5 + 0.5 * Math.sin(t * 2.2 + m.phase));
      m.mesh.scale.setScalar(m.baseScale * pulse * (isSolo ? 1.5 : 1));
      m.mat.opacity = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2 + m.phase));

      // Keep the spotlight ring facing the camera; fade it in only when soloed.
      m.ring.lookAt(this.camera.position);
      const targetRing = isSolo ? 0.6 + 0.4 * Math.sin(t * 3) : 0;
      m.ringMat.opacity += (targetRing - m.ringMat.opacity) * 0.15;
      m.ring.scale.setScalar(isSolo ? pulse : 1);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    for (const [, m] of this.markers) {
      m.mat.dispose();
      m.ringMat.dispose();
      (m.mesh.geometry as THREE.BufferGeometry).dispose();
      (m.ring.geometry as THREE.BufferGeometry).dispose();
    }
    this.markers.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.renderer.dispose();
    if (el.parentNode === this.host) this.host.removeChild(el);
  }
}
