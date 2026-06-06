// scene.ts — three.js orthographic top-down tonal map scene for 370-tonal-map.
//
// Layout: 12 major key territories as glowing disc "regions" arranged on the
// circle of fifths around a central plane. Each territory has a canvas-texture
// label sprite. The center-of-effect (comet) glides across the map with a
// decaying trail. A focus-driven halo ring surrounds the comet. The active
// territory brightens with a soft region glow.

import * as THREE from "three"
import {
  MAJOR_KEYS,
  MAP_RADIUS,
  type KeyTerritory,
} from "./tonal-map"

// ─── Constants ────────────────────────────────────────────────────────────────

const TRAIL_LENGTH = 60        // frames kept in the comet trail
const TERRITORY_RADIUS = 0.85  // visual radius of each key disc
const LABEL_SIZE = 0.7         // world-units square for label sprites

// Orthographic frustum half-size
const ORTHO_HALF = 6.8

// Color palette
const COL_TERRITORY_IDLE  = new THREE.Color(0x1a2035)
const COL_TERRITORY_HOVER = new THREE.Color(0x2a4070)
const COL_COMET           = new THREE.Color(0xffeebb)
const COL_TRAIL_BRIGHT    = new THREE.Color(0xf5c842)
const COL_TRAIL_DIM       = new THREE.Color(0x663300)
const COL_HALO            = new THREE.Color(0x7daaff)
const COL_LABEL_IDLE      = "#8899bb"
const COL_LABEL_ACTIVE    = "#ffffff"
const COL_TERRITORY_RING  = 0x3355aa

// ─── Canvas texture helper ────────────────────────────────────────────────────

function makeLabel(text: string, active: boolean): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.clearRect(0, 0, size, size)
  ctx.font = "bold 42px 'Arial', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = active ? COL_LABEL_ACTIVE : COL_LABEL_IDLE
  ctx.fillText(text, size / 2, size / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

// ─── Territory mesh group ─────────────────────────────────────────────────────

interface TerritoryObjects {
  key: KeyTerritory
  disc: THREE.Mesh
  ring: THREE.LineLoop
  labelSprite: THREE.Sprite
  labelTex: THREE.CanvasTexture
  labelTexActive: THREE.CanvasTexture
  isActive: boolean
}

// ─── Trail position ring buffer ───────────────────────────────────────────────

interface TrailPoint {
  x: number
  y: number
}

// ─── TonalMapScene ────────────────────────────────────────────────────────────

export class TonalMapScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  private territories: TerritoryObjects[] = []

  // Comet
  private cometMesh: THREE.Mesh
  private haloMesh: THREE.Mesh
  private cometPos: THREE.Vector2 = new THREE.Vector2(0, 0)
  private cometTarget: THREE.Vector2 = new THREE.Vector2(0, 0)

  // Trail
  private trail: TrailPoint[] = []
  private trailLine: THREE.Line
  private trailGeo: THREE.BufferGeometry

  // Halo state
  private halosRadius = 0.5

  // Host element for resize
  private host: HTMLElement
  private onResize: () => void

  // Disposables
  private disposables: Array<{ dispose: () => void }> = []

  constructor(host: HTMLElement) {
    this.host = host
    const w = host.clientWidth || 600
    const h = host.clientHeight || 600
    const aspect = w / h

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.setClearColor(0x080d1a, 1)
    host.appendChild(this.renderer.domElement)

    // ── Scene ──
    this.scene = new THREE.Scene()

    // ── Orthographic camera (top-down) ──
    const hw = ORTHO_HALF * aspect
    const hh = ORTHO_HALF
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 100)
    this.camera.position.set(0, 0, 20)
    this.camera.lookAt(0, 0, 0)

    // ── Ambient starfield background dots ──
    this.buildBackground()

    // ── Center-of-fifths decorative ring ──
    this.buildCenterRing()

    // ── Territory discs + labels ──
    MAJOR_KEYS.forEach(key => {
      this.territories.push(this.buildTerritory(key))
    })

    // ── Comet ──
    const cometGeo = new THREE.CircleGeometry(0.14, 24)
    const cometMat = new THREE.MeshBasicMaterial({ color: COL_COMET })
    this.cometMesh = new THREE.Mesh(cometGeo, cometMat)
    this.cometMesh.position.set(0, 0, 2)
    this.scene.add(this.cometMesh)
    this.disposables.push(cometGeo, cometMat)

    // ── Halo ring around comet ──
    const haloGeo = new THREE.RingGeometry(0.35, 0.50, 40)
    const haloMat = new THREE.MeshBasicMaterial({
      color: COL_HALO,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    })
    this.haloMesh = new THREE.Mesh(haloGeo, haloMat)
    this.haloMesh.position.set(0, 0, 1.8)
    this.scene.add(this.haloMesh)
    this.disposables.push(haloGeo, haloMat)

    // ── Trail ──
    const trailPositions = new Float32Array(TRAIL_LENGTH * 3)
    this.trailGeo = new THREE.BufferGeometry()
    this.trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3))
    const trailMat = new THREE.LineBasicMaterial({
      color: COL_TRAIL_BRIGHT,
      transparent: true,
      opacity: 0.7,
      vertexColors: false,
    })
    this.trailLine = new THREE.Line(this.trailGeo, trailMat)
    this.trailLine.position.z = 1.5
    this.scene.add(this.trailLine)
    this.disposables.push(this.trailGeo, trailMat)

    // ── Resize handler ──
    this.onResize = () => {
      const nw = host.clientWidth || 600
      const nh = host.clientHeight || 600
      const na = nw / nh
      const nhw = ORTHO_HALF * na
      const nhh = ORTHO_HALF
      this.camera.left = -nhw
      this.camera.right = nhw
      this.camera.top = nhh
      this.camera.bottom = -nhh
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(nw, nh)
    }
    window.addEventListener("resize", this.onResize)
  }

  // ─── Build helpers ───────────────────────────────────────────────────────────

  private buildBackground(): void {
    const count = 180
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 28
      positions[i * 3 + 1] = (Math.random() - 0.5) * 28
      positions[i * 3 + 2] = -0.5
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({ color: 0x334466, size: 0.04 })
    this.scene.add(new THREE.Points(geo, mat))
    this.disposables.push(geo, mat)
  }

  private buildCenterRing(): void {
    const segs = 80
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= segs; i++) {
      const a = (2 * Math.PI * i) / segs
      pts.push(new THREE.Vector2(MAP_RADIUS * Math.cos(a), MAP_RADIUS * Math.sin(a)))
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(p.x, p.y, -0.1))
    )
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x223355,
      transparent: true,
      opacity: 0.5,
    })
    this.scene.add(new THREE.Line(ringGeo, ringMat))
    this.disposables.push(ringGeo, ringMat)

    // Tick marks between territories
    for (let i = 0; i < 12; i++) {
      const a = (2 * Math.PI * i) / 12 - Math.PI / 2
      const inner = MAP_RADIUS * 0.88
      const outer = MAP_RADIUS * 1.12
      const pts2 = [
        new THREE.Vector3(inner * Math.cos(a), inner * Math.sin(a), -0.05),
        new THREE.Vector3(outer * Math.cos(a), outer * Math.sin(a), -0.05),
      ]
      const tickGeo = new THREE.BufferGeometry().setFromPoints(pts2)
      const tickMat = new THREE.LineBasicMaterial({ color: 0x1a2a44, transparent: true, opacity: 0.6 })
      this.scene.add(new THREE.Line(tickGeo, tickMat))
      this.disposables.push(tickGeo, tickMat)
    }
  }

  private buildTerritory(key: KeyTerritory): TerritoryObjects {
    const [cx, cy] = key.center

    // Disc
    const discGeo = new THREE.CircleGeometry(TERRITORY_RADIUS, 32)
    const discMat = new THREE.MeshBasicMaterial({
      color: COL_TERRITORY_IDLE.clone(),
      transparent: true,
      opacity: 0.55,
    })
    const disc = new THREE.Mesh(discGeo, discMat)
    disc.position.set(cx, cy, 0)
    this.scene.add(disc)
    this.disposables.push(discGeo, discMat)

    // Ring border
    const segs = 36
    const ringPts: THREE.Vector3[] = []
    for (let i = 0; i <= segs; i++) {
      const a = (2 * Math.PI * i) / segs
      ringPts.push(new THREE.Vector3(
        cx + TERRITORY_RADIUS * Math.cos(a),
        cy + TERRITORY_RADIUS * Math.sin(a),
        0.1
      ))
    }
    const ringGeo2 = new THREE.BufferGeometry().setFromPoints(ringPts)
    const ringMat2 = new THREE.LineBasicMaterial({
      color: COL_TERRITORY_RING,
      transparent: true,
      opacity: 0.4,
    })
    const ring = new THREE.LineLoop(ringGeo2, ringMat2)
    this.scene.add(ring)
    this.disposables.push(ringGeo2, ringMat2)

    // Label sprite (idle + active versions)
    const labelTex = makeLabel(key.label, false)
    const labelTexActive = makeLabel(key.label, true)
    const spriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.position.set(cx, cy, 0.5)
    sprite.scale.set(LABEL_SIZE, LABEL_SIZE, 1)
    this.scene.add(sprite)
    this.disposables.push(labelTex, labelTexActive, spriteMat)

    return { key, disc, ring, labelSprite: sprite, labelTex, labelTexActive, isActive: false }
  }

  // ─── Per-frame update ────────────────────────────────────────────────────────

  /**
   * Call each animation frame.
   * @param coe   [x,y] center of effect in world coords
   * @param focus tonal-focus scalar [0..1]
   * @param activeKeyRoot the current key root (pitch class 0..11)
   */
  tick(coe: [number, number], focus: number, activeKeyRoot: number): void {
    // Smoothly interpolate comet toward target
    this.cometTarget.set(coe[0], coe[1])
    this.cometPos.lerp(this.cometTarget, 0.06)

    const cx = this.cometPos.x
    const cy = this.cometPos.y

    // Update comet mesh
    this.cometMesh.position.set(cx, cy, 2)

    // Halo: focus controls inner/outer radius.
    // focus=1 → tight bright halo (inner~0.18, outer~0.30)
    // focus=0 → wide diffuse halo (inner~0.5, outer~1.1)
    const targetHaloR = 0.25 + (1 - focus) * 1.0
    this.halosRadius += (targetHaloR - this.halosRadius) * 0.08
    this.rebuildHalo(this.halosRadius)
    this.haloMesh.position.set(cx, cy, 1.8)

    // Halo opacity: high focus = more opaque, but always visible
    const haloMat = this.haloMesh.material as THREE.MeshBasicMaterial
    haloMat.opacity = 0.25 + focus * 0.45

    // Update trail
    this.trail.unshift({ x: cx, y: cy })
    if (this.trail.length > TRAIL_LENGTH) this.trail.pop()
    this.updateTrail()

    // Highlight the active territory
    this.updateTerritoryHighlights(activeKeyRoot)
  }

  private rebuildHalo(r: number): void {
    const inner = Math.max(0.12, r * 0.55)
    const outer = r
    // Rebuild the ring geometry in-place
    const geo = new THREE.RingGeometry(inner, outer, 40)
    this.haloMesh.geometry.dispose()
    this.haloMesh.geometry = geo
  }

  private updateTrail(): void {
    const posAttr = this.trailGeo.getAttribute("position") as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    const n = this.trail.length

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      if (i < n) {
        arr[i * 3]     = this.trail[i].x
        arr[i * 3 + 1] = this.trail[i].y
        arr[i * 3 + 2] = 0
      } else {
        // Fill remainder with last known point (avoids ugly lines to origin)
        const last = this.trail[n - 1] ?? { x: 0, y: 0 }
        arr[i * 3]     = last.x
        arr[i * 3 + 1] = last.y
        arr[i * 3 + 2] = 0
      }
    }
    posAttr.needsUpdate = true

    // Update draw range so stale tail points don't show as a line to origin
    this.trailGeo.setDrawRange(0, Math.max(1, n))

    // Fade trail material based on oldest point
    const trailMat = this.trailLine.material as THREE.LineBasicMaterial
    trailMat.color.lerpColors(COL_TRAIL_DIM, COL_TRAIL_BRIGHT, 0.7)
  }

  private updateTerritoryHighlights(activeRoot: number): void {
    // Find which territory index matches the active key root
    let targetIdx = -1
    this.territories.forEach((t, i) => {
      if (t.key.root === activeRoot) targetIdx = i
    })

    this.territories.forEach((t, i) => {
      const shouldBeActive = i === targetIdx
      if (shouldBeActive !== t.isActive) {
        t.isActive = shouldBeActive
        // Swap label texture
        const spriteMat = t.labelSprite.material as THREE.SpriteMaterial
        spriteMat.map = shouldBeActive ? t.labelTexActive : t.labelTex
        spriteMat.needsUpdate = true
      }

      // Smoothly interpolate disc color
      const discMat = t.disc.material as THREE.MeshBasicMaterial
      const target = shouldBeActive ? COL_TERRITORY_HOVER : COL_TERRITORY_IDLE
      discMat.color.lerp(target, 0.1)
      discMat.opacity = shouldBeActive ? 0.75 : 0.45

      // Ring brightness
      const ringMat = t.ring.material as THREE.LineBasicMaterial
      ringMat.opacity = shouldBeActive ? 0.9 : 0.35
      const ringColor = shouldBeActive ? 0x5588ff : COL_TERRITORY_RING
      ringMat.color.set(ringColor)
    })

  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize)
    this.disposables.forEach(d => d.dispose())
    this.territories.forEach(t => {
      // sprite material holds a ref to the texture; dispose manually
      ;(t.labelSprite.material as THREE.SpriteMaterial).dispose()
    })
    this.renderer.dispose()
    this.host.removeChild(this.renderer.domElement)
  }
}
