// scene.ts — 365-cadence-ladder
//
// Three.js functional tension ladder renderer.
//
// Layout (orthographic, world units x:[-1,1] y:[-1,1]):
//
//   ┌─────────────────────────────────────────────────────┐
//   │  DOMINANT   zone  (top, rose-amber)                 │
//   │  ─────────────────────────────────────────────────  │
//   │  SUBDOMINANT zone (middle, violet)                  │
//   │  ─────────────────────────────────────────────────  │
//   │  TONIC      zone  (bottom, emerald)                 │
//   └─────────────────────────────────────────────────────┘
//
// Each active chord drops into its zone as a glowing rectangular block,
// labelled with its Roman numeral + chord symbol, colour + brightness
// encoding harmonic tension (0=dim, 1=bright). The latest chord is the
// brightest; older ones fade out over ~2 seconds.
//
// Cadence arcs are THREE.QuadraticBezierCurve3 geometry lines that flash
// when an authentic / plagal / deceptive cadence is detected:
//   authentic  → bright emerald  (V→I: top to bottom)
//   plagal     → soft violet     (IV→I: mid to bottom)
//   deceptive  → amber swerve    (V→vi: top to tonic mid)
//
// Zone labels are DOM div overlays (CSS text) so they are crisp at any DPI.
// Block labels are also DOM, positioned via project-to-screen.
//
// Modulation: a horizontal ripple plane sweeps the scene when the key changes.

import * as THREE from "three"
import type { ChordEvent, CadenceType } from "./key-finder"

// ── geometry helpers ──────────────────────────────────────────────────────────

const ZONE_DOMINANT    = { y0: 0.35,  y1: 0.90 }
const ZONE_SUBDOMINANT = { y0: -0.18, y1: 0.30 }
const ZONE_TONIC       = { y0: -0.88, y1: -0.23 }

const BLOCK_W = 0.38
const BLOCK_H = 0.16

const COLOR_DOMINANT    = new THREE.Color(0xfb923c)   // amber-400
const COLOR_SUBDOMINANT = new THREE.Color(0xa78bfa)   // violet-400
const COLOR_TONIC       = new THREE.Color(0x34d399)   // emerald-400
const COLOR_UNKNOWN     = new THREE.Color(0xffffff)

const COLOR_ARC_AUTHENTIC  = new THREE.Color(0x34d399)   // emerald
const COLOR_ARC_PLAGAL     = new THREE.Color(0xa78bfa)   // violet
const COLOR_ARC_DECEPTIVE  = new THREE.Color(0xfbbf24)   // amber

function zoneY(fn: ChordEvent["fn"], tension: number): number {
  let zone: { y0: number; y1: number }
  if (fn === "Dominant")    zone = ZONE_DOMINANT
  else if (fn === "Subdominant") zone = ZONE_SUBDOMINANT
  else                      zone = ZONE_TONIC

  // Within zone, tension maps high → top
  const t = Math.max(0, Math.min(1, tension))
  return zone.y0 + (zone.y1 - zone.y0) * t
}

function zoneColor(fn: ChordEvent["fn"]): THREE.Color {
  if (fn === "Dominant")    return COLOR_DOMINANT
  if (fn === "Subdominant") return COLOR_SUBDOMINANT
  if (fn === "Tonic")       return COLOR_TONIC
  return COLOR_UNKNOWN
}

// ── Block ─────────────────────────────────────────────────────────────────────

interface Block {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  geo: THREE.PlaneGeometry
  age: number     // seconds since creation
  fn: ChordEvent["fn"]
  targetY: number
  currentY: number
  label: HTMLDivElement
}

// ── Arc ───────────────────────────────────────────────────────────────────────

interface Arc {
  line: THREE.Line
  mat: THREE.LineBasicMaterial
  geo: THREE.BufferGeometry
  life: number  // 0..1, counts down
  type: CadenceType
}

// ── Ripple ────────────────────────────────────────────────────────────────────

interface Ripple {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  age: number
}

// ── Main scene class ──────────────────────────────────────────────────────────

export class LadderScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private host: HTMLElement
  private overlay: HTMLDivElement
  private onResize: () => void

  private blocks: Block[] = []
  private arcs: Arc[] = []
  private ripples: Ripple[] = []

  private readonly MAX_BLOCKS = 6
  private readonly BLOCK_FADE_SEC = 2.5

  // Zone divider lines (horizontal)
  private disposables: Array<{ dispose: () => void }> = []

  constructor(host: HTMLElement, overlay: HTMLDivElement) {
    this.host = host
    this.overlay = overlay

    const w = host.clientWidth || 640
    const h = host.clientHeight || 480

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    this.camera.position.z = 2

    this.buildBackground()
    this.buildDividers()

    this.onResize = () => {
      const nw = host.clientWidth || w
      const nh = host.clientHeight || h
      this.renderer.setSize(nw, nh)
      const aspect = nw / nh
      this.camera.top    =  1 / aspect
      this.camera.bottom = -1 / aspect
      this.camera.left   = -1
      this.camera.right  =  1
      this.camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", this.onResize)
    this.onResize()
  }

  // ── background coloured zone bands ──────────────────────────────────────────

  private buildBackground() {
    const zones = [
      { z: ZONE_DOMINANT,    color: 0x2a1200, opacity: 0.55 },
      { z: ZONE_SUBDOMINANT, color: 0x160a2a, opacity: 0.55 },
      { z: ZONE_TONIC,       color: 0x041a10, opacity: 0.60 },
    ]
    for (const { z, color, opacity } of zones) {
      const h = z.y1 - z.y0
      const geo = new THREE.PlaneGeometry(2.2, h)
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(0, (z.y0 + z.y1) / 2, -0.1)
      this.scene.add(mesh)
      this.disposables.push(geo, mat)
    }
  }

  private buildDividers() {
    const ys = [ZONE_DOMINANT.y0, ZONE_SUBDOMINANT.y0]
    for (const y of ys) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.1, y, 0),
        new THREE.Vector3( 1.1, y, 0),
      ])
      const mat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.7 })
      this.scene.add(new THREE.Line(geo, mat))
      this.disposables.push(geo, mat)
    }
  }

  // ── public API ───────────────────────────────────────────────────────────────

  /** Called when a new chord is identified */
  addChord(chord: ChordEvent) {
    const y = zoneY(chord.fn, chord.tension)
    const color = zoneColor(chord.fn)

    // Fade out old blocks
    // If at max, mark oldest as expired
    if (this.blocks.length >= this.MAX_BLOCKS) {
      this.blocks[0].age = this.BLOCK_FADE_SEC + 1
    }

    // Block geometry
    const geo = new THREE.PlaneGeometry(BLOCK_W, BLOCK_H, 1, 1)
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, y, 0.05)
    this.scene.add(mesh)

    // Glow ring border
    const ringGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(BLOCK_W + 0.01, BLOCK_H + 0.01))
    const ringMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    const ring = new THREE.LineSegments(ringGeo, ringMat)
    ring.position.copy(mesh.position)
    ring.position.z = 0.06
    this.scene.add(ring)
    // Store ring on mesh as userData for cleanup
    mesh.userData.ring = ring
    mesh.userData.ringMat = ringMat
    mesh.userData.ringGeo = ringGeo

    // DOM label
    const label = document.createElement("div")
    label.style.cssText = [
      "position:absolute",
      "pointer-events:none",
      "text-align:center",
      "transform:translate(-50%,-50%)",
      "font-family:ui-monospace,monospace",
      "line-height:1.2",
    ].join(";")
    label.innerHTML = `
      <div style="font-size:1.05rem;font-weight:700;color:#fff;">${chord.roman}</div>
      <div style="font-size:0.72rem;color:rgba(255,255,255,0.7);">${chord.symbol}</div>
    `
    this.overlay.appendChild(label)

    const block: Block = {
      mesh,
      mat,
      geo,
      age: 0,
      fn: chord.fn,
      targetY: y,
      currentY: y + 0.12,   // start slightly above, drop in
      label,
    }
    this.blocks.push(block)
  }

  /** Trigger a cadence arc */
  triggerCadence(type: CadenceType) {
    if (!type) return

    // Source and destination y-centres
    let y0: number, y1: number
    if (type === "authentic") {
      y0 = (ZONE_DOMINANT.y0 + ZONE_DOMINANT.y1) / 2
      y1 = (ZONE_TONIC.y0 + ZONE_TONIC.y1) / 2
    } else if (type === "plagal") {
      y0 = (ZONE_SUBDOMINANT.y0 + ZONE_SUBDOMINANT.y1) / 2
      y1 = (ZONE_TONIC.y0 + ZONE_TONIC.y1) / 2
    } else {
      // deceptive V→vi: from top to upper tonic
      y0 = (ZONE_DOMINANT.y0 + ZONE_DOMINANT.y1) / 2
      y1 = ZONE_TONIC.y1 - 0.05
    }

    // Use x-offset so arcs are visible and don't stack
    const xOff = (this.arcs.length % 3 - 1) * 0.22

    const arcColor =
      type === "authentic"  ? COLOR_ARC_AUTHENTIC :
      type === "plagal"     ? COLOR_ARC_PLAGAL     :
                              COLOR_ARC_DECEPTIVE

    // Quadratic bezier curve points
    const p0 = new THREE.Vector3(xOff - 0.05, y0, 0.08)
    const p1 = new THREE.Vector3(xOff + 0.45, (y0 + y1) / 2, 0.08)
    const p2 = new THREE.Vector3(xOff - 0.05, y1, 0.08)

    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2)
    const pts = curve.getPoints(40)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({
      color: arcColor,
      transparent: true,
      opacity: 1.0,
      linewidth: 2,
    })
    const line = new THREE.Line(geo, mat)
    this.scene.add(line)

    this.arcs.push({ line, mat, geo, life: 1, type })
  }

  /** Trigger a modulation ripple sweep */
  triggerModulation() {
    const geo = new THREE.PlaneGeometry(2.2, 0.04)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, 1.1, 0.1)  // start above the scene, sweeps down
    this.scene.add(mesh)
    this.ripples.push({ mesh, mat, age: 0 })
    this.disposables.push(geo, mat)
  }

  // ── frame update ─────────────────────────────────────────────────────────────

  update(dt: number) {
    // -- blocks --
    const toRemove: Block[] = []
    for (const b of this.blocks) {
      b.age += dt

      // Drop animation
      b.currentY = b.currentY + (b.targetY - b.currentY) * Math.min(1, dt * 8)
      b.mesh.position.y = b.currentY
      const ring = b.mesh.userData.ring as THREE.LineSegments | undefined
      if (ring) ring.position.y = b.currentY

      // Fade: newest block is full opacity, old ones fade
      const remaining = this.BLOCK_FADE_SEC - b.age
      const alpha = Math.max(0, Math.min(1, remaining / 0.6))
      b.mat.opacity = alpha * 0.55
      const rm = b.mesh.userData.ringMat as THREE.LineBasicMaterial | undefined
      if (rm) rm.opacity = alpha

      // Update DOM label position
      const screenPos = this.worldToScreen(b.mesh.position.x, b.mesh.position.y)
      b.label.style.left = `${screenPos.x}px`
      b.label.style.top  = `${screenPos.y}px`
      // Fade label opacity
      b.label.style.opacity = String(alpha)

      if (b.age > this.BLOCK_FADE_SEC) toRemove.push(b)
    }
    for (const b of toRemove) this.removeBlock(b)

    // -- arcs --
    const arcRemove: Arc[] = []
    for (const arc of this.arcs) {
      arc.life -= dt * 0.9   // ~1.1s lifetime
      arc.mat.opacity = Math.max(0, arc.life)
      if (arc.life <= 0) arcRemove.push(arc)
    }
    for (const arc of arcRemove) {
      this.scene.remove(arc.line)
      arc.geo.dispose()
      arc.mat.dispose()
      this.arcs.splice(this.arcs.indexOf(arc), 1)
    }

    // -- ripples --
    const rippleRemove: Ripple[] = []
    for (const rp of this.ripples) {
      rp.age += dt
      const speed = 2.4   // world units/sec, traverses 2.0 units scene height
      rp.mesh.position.y = 1.1 - rp.age * speed
      rp.mat.opacity = Math.max(0, 0.9 - rp.age * 0.5)
      if (rp.age > 1.2) rippleRemove.push(rp)
    }
    for (const rp of rippleRemove) {
      this.scene.remove(rp.mesh)
      this.ripples.splice(this.ripples.indexOf(rp), 1)
    }

    this.renderer.render(this.scene, this.camera)
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const cam = this.camera
    const vec = new THREE.Vector3(wx, wy, 0)
    vec.project(cam)
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    return {
      x: ((vec.x + 1) / 2) * w,
      y: ((-vec.y + 1) / 2) * h,
    }
  }

  private removeBlock(b: Block) {
    this.scene.remove(b.mesh)
    b.geo.dispose()
    b.mat.dispose()
    const ring = b.mesh.userData.ring as THREE.Object3D | undefined
    if (ring) {
      this.scene.remove(ring)
      ;(b.mesh.userData.ringGeo as THREE.BufferGeometry | undefined)?.dispose()
      ;(b.mesh.userData.ringMat as THREE.Material | undefined)?.dispose()
    }
    if (b.label.parentNode === this.overlay) {
      this.overlay.removeChild(b.label)
    }
    this.blocks.splice(this.blocks.indexOf(b), 1)
  }

  dispose() {
    window.removeEventListener("resize", this.onResize)
    for (const b of [...this.blocks]) this.removeBlock(b)
    for (const arc of this.arcs) {
      this.scene.remove(arc.line)
      arc.geo.dispose()
      arc.mat.dispose()
    }
    for (const rp of this.ripples) this.scene.remove(rp.mesh)
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
