// three.js globe for 337-seismic-globe.
// A dark wireframe Earth that slowly auto-rotates, with a glowing point per
// sounding quake placed at its lon/lat. Points pulse with magnitude and are
// hued by depth (shallow warm -> deep cool). A faint graticule sits underneath.
// One driver per frame mutates buffers/uniforms only — no React re-renders.

import * as THREE from "three"
import type { Quake } from "./quakes"

// lon/lat -> point on a sphere of radius r. Matches the audio azimuth/elevation
// mapping so what you see and what you hear share one geometry.
function lonLatToVec3(lon: number, lat: number, r: number): THREE.Vector3 {
  const az = (lon * Math.PI) / 180
  const el = (lat * Math.PI) / 180
  return new THREE.Vector3(
    r * Math.cos(el) * Math.sin(az),
    r * Math.sin(el),
    -r * Math.cos(el) * Math.cos(az)
  )
}

// Depth -> hue: shallow (~0 km) warm amber, deep (~600 km) cool blue.
function depthColor(depthKm: number): THREE.Color {
  const t = Math.min(depthKm / 600, 1)
  const hue = 0.08 + t * 0.55 // 0.08 amber -> 0.63 blue
  return new THREE.Color().setHSL(hue, 0.85, 0.55)
}

interface QuakeMarker {
  id: string
  mesh: THREE.Mesh
  baseScale: number
  phase: number
}

export class SeismicGlobe {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private world: THREE.Group
  private markers = new Map<string, QuakeMarker>()
  private disposables: Array<{ dispose: () => void }> = []
  private host: HTMLElement
  private onResize: () => void

  constructor(host: HTMLElement) {
    this.host = host
    const w = host.clientWidth || 600
    const h = host.clientHeight || 600

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 0.6, 7.2)
    this.camera.lookAt(0, 0, 0)

    this.world = new THREE.Group()
    this.world.rotation.x = 0.35
    this.scene.add(this.world)

    const R = 2

    // Wireframe Earth.
    const sphereGeo = new THREE.SphereGeometry(R, 36, 24)
    const wireGeo = new THREE.WireframeGeometry(sphereGeo)
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x2a6f8a,
      transparent: true,
      opacity: 0.28,
    })
    const wire = new THREE.LineSegments(wireGeo, wireMat)
    this.world.add(wire)
    this.disposables.push(sphereGeo, wireGeo, wireMat)

    // Solid dark inner shell so back-facing points read as occluded.
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x040a14 })
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 32, 20), shellMat)
    this.world.add(shell)
    this.disposables.push(shellMat, shell.geometry as THREE.BufferGeometry)

    // Faint graticule (a few extra lat rings).
    const gratMat = new THREE.LineBasicMaterial({ color: 0x1a4a5e, transparent: true, opacity: 0.35 })
    this.disposables.push(gratMat)
    for (const latDeg of [-60, -30, 0, 30, 60]) {
      const pts: THREE.Vector3[] = []
      for (let lon = 0; lon <= 360; lon += 6) pts.push(lonLatToVec3(lon, latDeg, R * 1.002))
      const g = new THREE.BufferGeometry().setFromPoints(pts)
      this.world.add(new THREE.Line(g, gratMat))
      this.disposables.push(g)
    }

    // Soft atmosphere halo.
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x2e7fa6,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    })
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 32, 20), haloMat)
    this.world.add(halo)
    this.disposables.push(haloMat, halo.geometry as THREE.BufferGeometry)

    this.onResize = () => {
      const nw = host.clientWidth || w
      const nh = host.clientHeight || h
      this.renderer.setSize(nw, nh)
      this.camera.aspect = nw / nh
      this.camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", this.onResize)
  }

  // Reconcile markers with the sounding quake set (fade out removed ones).
  setQuakes(quakes: Quake[]) {
    const wanted = new Set(quakes.map((q) => q.id))
    const R = 2.04

    for (const [id, m] of this.markers) {
      if (!wanted.has(id)) {
        this.world.remove(m.mesh)
        ;(m.mesh.geometry as THREE.BufferGeometry).dispose()
        ;(m.mesh.material as THREE.Material).dispose()
        this.markers.delete(id)
      }
    }

    for (const q of quakes) {
      if (this.markers.has(q.id)) continue
      const size = 0.025 + q.mag * 0.012
      const geo = new THREE.SphereGeometry(size, 12, 12)
      const mat = new THREE.MeshBasicMaterial({
        color: depthColor(q.depthKm),
        transparent: true,
        opacity: 0.95,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(lonLatToVec3(q.lon, q.lat, R))
      this.world.add(mesh)
      this.markers.set(q.id, {
        id: q.id,
        mesh,
        baseScale: 1,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }

  // Called once per animation frame. dt in seconds.
  tick(dt: number, t: number) {
    this.world.rotation.y += dt * 0.08 // slow auto-rotation
    for (const m of this.markers.values()) {
      const pulse = 1 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.4 + m.phase))
      m.mesh.scale.setScalar(m.baseScale * pulse)
      const mat = m.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4 + m.phase))
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    window.removeEventListener("resize", this.onResize)
    for (const [, m] of this.markers) {
      ;(m.mesh.geometry as THREE.BufferGeometry).dispose()
      ;(m.mesh.material as THREE.Material).dispose()
    }
    this.markers.clear()
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
