// scene.ts — 358-beat-mirror
// Subsystem (c): the three.js renderer that makes the tracker LEGIBLE.
//
// Two registers, clinical not glowy (Ikeda-precise):
//   • PULSE  — a thin ring + filled disc, centered. On each predicted beat the
//     disc flashes and the ring snaps to full radius, then decays — so a beat is
//     an unmistakable visual EVENT, not a smear. Ring color tracks confidence
//     (amber low → emerald high).
//   • SCOPE  — a scrolling onset-strength waveform across the bottom. Detected
//     onsets are marked (white ticks below the line); predicted beats are
//     overlaid as tall vertical ticks (emerald). The whole point: you can SEE
//     whether the beat grid lands on the onsets.
//
// One driver per frame mutates geometry buffers / material uniforms via refs;
// React never re-renders per frame. Full teardown on dispose().

import * as THREE from "three"
import type { TrackerReadout } from "./tracker"

const SCOPE_W = 600 // samples drawn (matches tracker ENV_LEN)

export class BeatScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private host: HTMLElement
  private onResize: () => void
  private disposables: Array<{ dispose: () => void }> = []

  // pulse
  private disc: THREE.Mesh
  private ring: THREE.Mesh
  private discMat: THREE.MeshBasicMaterial
  private ringMat: THREE.MeshBasicMaterial
  private flash = 0 // 0..1 decaying flash energy

  // scope
  private wavePos: THREE.BufferAttribute
  private waveLine: THREE.Line
  private waveMat: THREE.LineBasicMaterial
  private beatTicks: THREE.LineSegments
  private beatTickMat: THREE.LineBasicMaterial
  private onsetTicks: THREE.LineSegments
  private onsetTickMat: THREE.LineBasicMaterial
  private baseline: THREE.Line

  // viewport: world units span x:[-1,1] y:[-1,1]; scope sits in lower band.
  private scopeY0 = -0.95
  private scopeY1 = -0.45
  private pulseY = 0.25

  constructor(host: HTMLElement) {
    this.host = host
    const w = host.clientWidth || 800
    const h = host.clientHeight || 500

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    // square-ish ortho cam; we letterbox by aspect in onResize
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    this.camera.position.z = 2

    // --- pulse disc + ring ---
    const discGeo = new THREE.CircleGeometry(0.18, 64)
    this.discMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
    })
    this.disc = new THREE.Mesh(discGeo, this.discMat)
    this.disc.position.y = this.pulseY
    this.scene.add(this.disc)
    this.disposables.push(discGeo, this.discMat)

    const ringGeo = new THREE.RingGeometry(0.19, 0.205, 80)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
    this.ring = new THREE.Mesh(ringGeo, this.ringMat)
    this.ring.position.y = this.pulseY
    this.scene.add(this.ring)
    this.disposables.push(ringGeo, this.ringMat)

    // crosshair guide behind the pulse (clinical reference)
    const guideMat = new THREE.LineBasicMaterial({
      color: 0x2a4a55,
      transparent: true,
      opacity: 0.5,
    })
    this.disposables.push(guideMat)
    const guidePts: THREE.Vector3[] = []
    for (let a = 0; a <= 64; a++) {
      const ang = (a / 64) * Math.PI * 2
      guidePts.push(
        new THREE.Vector3(
          Math.cos(ang) * 0.42,
          this.pulseY + Math.sin(ang) * 0.42,
          0
        )
      )
    }
    const guideGeo = new THREE.BufferGeometry().setFromPoints(guidePts)
    this.scene.add(new THREE.Line(guideGeo, guideMat))
    this.disposables.push(guideGeo)

    // --- scope waveform ---
    const wavePts = new Float32Array(SCOPE_W * 3)
    for (let i = 0; i < SCOPE_W; i++) {
      wavePts[i * 3] = this.xAt(i)
      wavePts[i * 3 + 1] = this.scopeY0
      wavePts[i * 3 + 2] = 0
    }
    const waveGeo = new THREE.BufferGeometry()
    this.wavePos = new THREE.BufferAttribute(wavePts, 3)
    waveGeo.setAttribute("position", this.wavePos)
    this.waveMat = new THREE.LineBasicMaterial({
      color: 0xc4b5fd,
      transparent: true,
      opacity: 0.9,
    })
    this.waveLine = new THREE.Line(waveGeo, this.waveMat)
    this.scene.add(this.waveLine)
    this.disposables.push(waveGeo, this.waveMat)

    // scope baseline
    const baseGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1, this.scopeY0, 0),
      new THREE.Vector3(1, this.scopeY0, 0),
    ])
    const baseMat = new THREE.LineBasicMaterial({
      color: 0x33414a,
      transparent: true,
      opacity: 0.7,
    })
    this.baseline = new THREE.Line(baseGeo, baseMat)
    this.scene.add(this.baseline)
    this.disposables.push(baseGeo, baseMat)

    // predicted-beat ticks (tall, emerald) — preallocate a generous buffer
    this.beatTickMat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.85,
    })
    this.beatTicks = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      this.beatTickMat
    )
    this.scene.add(this.beatTicks)
    this.disposables.push(this.beatTickMat)

    // detected-onset marks (short, white, below baseline)
    this.onsetTickMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    })
    this.onsetTicks = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      this.onsetTickMat
    )
    this.scene.add(this.onsetTicks)
    this.disposables.push(this.onsetTickMat)

    this.onResize = () => {
      const nw = host.clientWidth || w
      const nh = host.clientHeight || h
      this.renderer.setSize(nw, nh)
      const aspect = nw / nh
      // keep x in [-1,1], scale y so content isn't stretched
      this.camera.top = 1 / aspect
      this.camera.bottom = -1 / aspect
      this.camera.left = -1
      this.camera.right = 1
      this.camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", this.onResize)
    this.onResize()
  }

  private xAt(i: number): number {
    return -1 + (i / (SCOPE_W - 1)) * 2
  }

  // Confidence → ring color (amber low, emerald high).
  private static confColor(conf: number): THREE.Color {
    const c = Math.max(0, Math.min(1, conf))
    // amber 0xf59e0b → emerald 0x34d399
    const lo = new THREE.Color(0xf59e0b)
    const hi = new THREE.Color(0x34d399)
    return lo.clone().lerp(hi, c)
  }

  // Called every animation frame with the latest tracker readout.
  update(r: TrackerReadout, dt: number) {
    // --- pulse ---
    if (r.beatNow) this.flash = 1
    this.flash = Math.max(0, this.flash - dt * 3.2) // ~300ms decay
    const f = this.flash

    const scale = 1 + 0.35 * f + 0.05 * r.beatPhase
    this.disc.scale.setScalar(scale)
    this.ring.scale.setScalar(1 + 0.4 * f)
    this.discMat.opacity = 0.12 + 0.6 * f
    const col = BeatScene.confColor(r.confidence)
    this.ringMat.color.copy(col)
    this.ringMat.opacity = 0.4 + 0.55 * (0.3 + 0.7 * f)
    this.discMat.color.copy(col)

    // --- scope waveform: map envelope -> y in [scopeY0, scopeY1] ---
    const env = r.envelope
    const n = Math.min(env.length, SCOPE_W)
    // normalize by a rolling-ish peak for visibility
    let peak = 1e-4
    for (let i = 0; i < n; i++) if (env[i] > peak) peak = env[i]
    const arr = this.wavePos.array as Float32Array
    const span = this.scopeY1 - this.scopeY0
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, env[i] / peak)
      arr[i * 3 + 1] = this.scopeY0 + v * span
    }
    this.wavePos.needsUpdate = true

    // --- predicted beat ticks ---
    this.setTicks(this.beatTicks, r.beatTicks, this.scopeY0, this.scopeY1 + 0.06)
    // --- onset marks (below baseline) ---
    this.setTicks(
      this.onsetTicks,
      r.onsetMarks,
      this.scopeY0 - 0.05,
      this.scopeY0
    )

    this.renderer.render(this.scene, this.camera)
  }

  private setTicks(
    seg: THREE.LineSegments,
    idxs: number[],
    y0: number,
    y1: number
  ) {
    const pts = new Float32Array(idxs.length * 6)
    for (let k = 0; k < idxs.length; k++) {
      const x = this.xAt(Math.max(0, Math.min(SCOPE_W - 1, idxs[k])))
      pts[k * 6] = x
      pts[k * 6 + 1] = y0
      pts[k * 6 + 2] = 0
      pts[k * 6 + 3] = x
      pts[k * 6 + 4] = y1
      pts[k * 6 + 5] = 0
    }
    const geo = seg.geometry
    geo.setAttribute("position", new THREE.BufferAttribute(pts, 3))
    geo.computeBoundingSphere?.()
  }

  dispose() {
    window.removeEventListener("resize", this.onResize)
    // tick geometries are swapped each frame; dispose the live ones
    this.beatTicks.geometry.dispose()
    this.onsetTicks.geometry.dispose()
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
