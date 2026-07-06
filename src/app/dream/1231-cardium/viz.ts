// viz.ts — three.js rendering of the excitable sphere.
//
// The icosphere is drawn once; every frame we push the per-vertex excitation
// (aExc) and refractory-scar (aScar) values as buffer attributes and a small
// shader maps them to colour. Palette: cool slate-teal resting tissue with
// oxblood/ember excitation fronts (saturated chromatic chiaroscuro) and a faint
// violet scar trail. A soft fresnel rim gives the globe its form. All change is
// carried by smoothly sweeping fronts — no full-frame luminance flashes.

import * as THREE from "three"
import type { IcoSphere } from "./mesh"

const VERT = /* glsl */ `
  attribute float aExc;
  attribute float aScar;
  varying float vExc;
  varying float vScar;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vExc = aExc;
    vScar = aScar;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying float vExc;
  varying float vScar;
  varying vec3 vNormal;
  varying vec3 vWorld;
  uniform vec3 uCamPos;

  void main() {
    float u = clamp(vExc, 0.0, 1.0);
    vec3 rest  = vec3(0.075, 0.155, 0.185);   // cool slate-teal resting tissue
    vec3 ox    = vec3(0.55, 0.075, 0.065);    // deep oxblood front
    vec3 ember = vec3(0.98, 0.42, 0.14);      // hot ember crest
    vec3 scarC = vec3(0.13, 0.09, 0.16);      // faint violet refractory scar

    float exc  = smoothstep(0.08, 0.5, u);
    vec3 front = mix(ox, ember, smoothstep(0.35, 0.92, u));
    vec3 base  = mix(rest, front, exc);
    base = mix(base, scarC, clamp(vScar, 0.0, 1.0) * 0.45 * (1.0 - exc));

    vec3 viewDir = normalize(uCamPos - vWorld);
    float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.0);
    base += fres * vec3(0.05, 0.12, 0.145) * (1.0 - exc * 0.7);

    // Gentle self-emissive lift on the hot crests only.
    base += front * exc * exc * 0.45;

    gl_FragColor = vec4(base, 1.0);
  }
`

export class CardiumViz {
  private host: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private world: THREE.Group
  private mesh: THREE.Mesh
  private geom: THREE.BufferGeometry
  private mat: THREE.ShaderMaterial
  private excAttr: THREE.BufferAttribute
  private scarAttr: THREE.BufferAttribute
  private markers: THREE.Mesh[] = []
  private disposables: { dispose(): void }[] = []
  private onResize: () => void
  readonly raycaster = new THREE.Raycaster()

  constructor(host: HTMLElement, ico: IcoSphere) {
    this.host = host
    const w = host.clientWidth || 640
    const h = host.clientHeight || 480

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100)
    this.camera.position.set(0, 0, 4.2)

    this.world = new THREE.Group()
    this.scene.add(this.world)

    const R = 1.6
    this.geom = new THREE.BufferGeometry()
    const scaled = new Float32Array(ico.positions.length)
    for (let i = 0; i < ico.positions.length; i++) scaled[i] = ico.positions[i] * R
    this.geom.setAttribute("position", new THREE.BufferAttribute(scaled, 3))
    // Unit-sphere positions double as normals.
    this.geom.setAttribute("normal", new THREE.BufferAttribute(ico.positions.slice(), 3))
    this.geom.setIndex(new THREE.BufferAttribute(ico.indices, 1))

    this.excAttr = new THREE.BufferAttribute(new Float32Array(ico.count), 1)
    this.excAttr.setUsage(THREE.DynamicDrawUsage)
    this.scarAttr = new THREE.BufferAttribute(new Float32Array(ico.count), 1)
    this.scarAttr.setUsage(THREE.DynamicDrawUsage)
    this.geom.setAttribute("aExc", this.excAttr)
    this.geom.setAttribute("aScar", this.scarAttr)

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uCamPos: { value: new THREE.Vector3() } },
    })
    this.mesh = new THREE.Mesh(this.geom, this.mat)
    this.world.add(this.mesh)
    this.disposables.push(this.geom, this.mat)

    // Faint inner shell so back-facing gaps read as depth, not void.
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x081416, side: THREE.BackSide })
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 0.94, 24, 18), shellMat)
    this.world.add(shell)
    this.disposables.push(shellMat, shell.geometry as THREE.BufferGeometry)

    this.onResize = () => {
      const nw = host.clientWidth || w
      const nh = host.clientHeight || h
      this.renderer.setSize(nw, nh)
      this.camera.aspect = nw / nh
      this.camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", this.onResize)
  }

  /** Place small markers at the pace node and listening regions. */
  setNodes(positions: THREE.Vector3[], colours: number[]) {
    const R = 1.63
    for (let i = 0; i < positions.length; i++) {
      const geo = new THREE.SphereGeometry(0.045, 12, 12)
      const mat = new THREE.MeshBasicMaterial({ color: colours[i], transparent: true, opacity: 0.9 })
      const m = new THREE.Mesh(geo, mat)
      m.position.copy(positions[i].clone().normalize().multiplyScalar(R))
      this.world.add(m)
      this.markers.push(m)
      this.disposables.push(geo, mat)
    }
  }

  /** Raycast screen coords (NDC) against the sphere; returns the hit point dir or null. */
  pick(ndcX: number, ndcY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const hits = this.raycaster.intersectObject(this.mesh, false)
    if (hits.length === 0) return null
    // Undo the world rotation so the hit maps back to model space.
    const p = hits[0].point.clone()
    this.world.worldToLocal(p)
    return p.normalize()
  }

  /** Push new field values and render. dt in seconds. */
  render(u: Float32Array, scar: Float32Array, dt: number, spin: number) {
    ;(this.excAttr.array as Float32Array).set(u)
    ;(this.scarAttr.array as Float32Array).set(scar)
    this.excAttr.needsUpdate = true
    this.scarAttr.needsUpdate = true
    this.world.rotation.y += dt * spin
    this.world.rotation.x = Math.sin(this.world.rotation.y * 0.25) * 0.12
    this.mat.uniforms.uCamPos.value.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    window.removeEventListener("resize", this.onResize)
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.host) {
      this.host.removeChild(this.renderer.domElement)
    }
  }
}
