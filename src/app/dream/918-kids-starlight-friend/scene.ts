// scene.ts — three.js starfield for "Starlight Friend".
// GPU points for the ambient twinkle field + a small pool of "shooting stars"
// and persistent "placed stars" that bloom when a chime arrives (local or peer).
//
// Coordinates: events arrive as {x,y} in 0..1 (top-left origin, like a screen).
// We map them into an orthographic plane that fills the viewport.

import * as THREE from 'three'

// Warm/cool star palette per the VIBE: warm gold/rose + cool cyan/violet.
// hue 0..1 -> THREE.Color. Low hue = warm gold/rose, high = cyan/violet.
export function hueToColor(hue: number): THREE.Color {
  // We hand-blend two ramps so colors stay "candy" bright, never muddy.
  const warm = new THREE.Color('#ffd27a') // gold
  const rose = new THREE.Color('#ff9ec4') // rose
  const cyan = new THREE.Color('#8ff0ff') // cyan
  const violet = new THREE.Color('#c4a8ff') // violet
  const c = new THREE.Color()
  if (hue < 0.33) {
    c.copy(warm).lerp(rose, hue / 0.33)
  } else if (hue < 0.66) {
    c.copy(rose).lerp(cyan, (hue - 0.33) / 0.33)
  } else {
    c.copy(cyan).lerp(violet, (hue - 0.66) / 0.34)
  }
  return c
}

type Shooter = {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  // motion in world units
  x: number
  y: number
  vx: number
  vy: number
  life: number // 0..1 remaining
  trail: THREE.Line
  trailMat: THREE.LineBasicMaterial
}

type Placed = {
  sprite: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  baseScale: number
  born: number
  hue: number
  x: number
  y: number
}

export type StarScene = {
  // Fling a shooting star from a launch point toward (vx,vy). Returns the
  // landing point (0..1) where a placed star will bloom + a chime should fire.
  flingTo: (x: number, y: number, vx: number, vy: number, hue: number) => void
  // Bloom a placed star directly at (0..1) — used when a peer/ghost event lands.
  bloomAt: (x: number, y: number, hue: number) => void
  resize: (w: number, h: number) => void
  render: (tMs: number) => void
  dispose: () => void
  ok: boolean
}

const FIELD_N = 900 // ambient twinkle points
const MAX_SHOOTERS = 24
const MAX_PLACED = 64

export function makeScene(mount: HTMLDivElement): StarScene {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' })
  } catch {
    return {
      flingTo: () => {},
      bloomAt: () => {},
      resize: () => {},
      render: () => {},
      dispose: () => {},
      ok: false,
    }
  }

  let W = mount.clientWidth || window.innerWidth
  let H = mount.clientHeight || window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(W, H)
  mount.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'

  const scene = new THREE.Scene()

  // Orthographic camera covering an aspect-correct plane.
  // World coords: x in [-aspect, aspect], y in [-1, 1]. We convert 0..1 sky
  // coords (top-left origin) to this space in `toWorld`.
  let aspect = W / H
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10)
  camera.position.z = 5

  function toWorld(x: number, y: number): [number, number] {
    return [(x * 2 - 1) * aspect, 1 - y * 2]
  }
  function toSky(wx: number, wy: number): [number, number] {
    return [(wx / aspect + 1) / 2, (1 - wy) / 2]
  }

  // ── deep indigo -> violet gradient backdrop (a full-screen quad) ───────────
  const bgGeo = new THREE.PlaneGeometry(2, 2)
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main(){
        // top deep indigo -> bottom violet, with a slow breathing shimmer
        vec3 top = vec3(0.043, 0.027, 0.110);   // #0b0712 deep indigo
        vec3 bot = vec3(0.118, 0.063, 0.196);   // #1e1032 violet
        float g = smoothstep(0.0, 1.0, vUv.y);
        vec3 col = mix(bot, top, g);
        float breathe = 0.012 * sin(uTime * 0.0004 + vUv.x * 3.0);
        col += breathe;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const bgMesh = new THREE.Mesh(bgGeo, bgMat)
  bgMesh.frustumCulled = false
  scene.add(bgMesh)

  // ── ambient twinkle field (GPU points) ─────────────────────────────────────
  const fieldGeo = new THREE.BufferGeometry()
  const fpos = new Float32Array(FIELD_N * 3)
  const fphase = new Float32Array(FIELD_N)
  const fsize = new Float32Array(FIELD_N)
  for (let i = 0; i < FIELD_N; i++) {
    fpos[i * 3] = (Math.random() * 2 - 1) * aspect
    fpos[i * 3 + 1] = Math.random() * 2 - 1
    fpos[i * 3 + 2] = 0
    fphase[i] = Math.random() * Math.PI * 2
    fsize[i] = Math.random() * 2.2 + 0.6
  }
  fieldGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3))
  fieldGeo.setAttribute('aPhase', new THREE.BufferAttribute(fphase, 1))
  fieldGeo.setAttribute('aSize', new THREE.BufferAttribute(fsize, 1))
  const fieldMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDpr: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uDpr;
      varying float vTw;
      void main(){
        float tw = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 0.0011 + aPhase));
        vTw = tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uDpr * (0.7 + tw);
      }
    `,
    fragmentShader: `
      varying float vTw;
      void main(){
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        float a = smoothstep(0.5, 0.0, r) * vTw * 0.8;
        vec3 col = mix(vec3(0.8,0.85,1.0), vec3(1.0,0.95,0.85), vTw);
        gl_FragColor = vec4(col, a);
      }
    `,
  })
  const field = new THREE.Points(fieldGeo, fieldMat)
  scene.add(field)

  // ── shared soft sprite texture (radial glow) ────────────────────────────────
  const glowTex = makeGlowTexture()

  // ── shooting-star pool ──────────────────────────────────────────────────────
  const shooterGeo = new THREE.PlaneGeometry(0.07, 0.07)
  const shooters: Shooter[] = []

  function spawnShooter(sx: number, sy: number, vx: number, vy: number, hue: number) {
    if (shooters.length >= MAX_SHOOTERS) {
      const old = shooters.shift()!
      disposeShooter(old)
    }
    const color = hueToColor(hue)
    const mat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(shooterGeo, mat)
    const [wx, wy] = toWorld(sx, sy)
    mesh.position.set(wx, wy, 0.1)
    scene.add(mesh)

    // a short fading trail line
    const trailMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    const trailGeo = new THREE.BufferGeometry()
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const trail = new THREE.Line(trailGeo, trailMat)
    scene.add(trail)

    shooters.push({
      mesh,
      mat,
      x: wx,
      y: wy,
      vx: vx * aspect, // scale x velocity by aspect so it feels even
      vy: -vy, // screen-down is world-down
      life: 1,
      trail,
      trailMat,
    })
  }

  function disposeShooter(s: Shooter) {
    scene.remove(s.mesh)
    scene.remove(s.trail)
    s.mat.dispose()
    s.trailMat.dispose()
    s.trail.geometry.dispose()
  }

  // ── placed-star pool (persistent, gently twinkling) ─────────────────────────
  const placedGeo = new THREE.PlaneGeometry(0.13, 0.13)
  const placed: Placed[] = []

  function addPlaced(x: number, y: number, hue: number, now: number) {
    if (placed.length >= MAX_PLACED) {
      const old = placed.shift()!
      scene.remove(old.sprite)
      old.mat.dispose()
    }
    const mat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: hueToColor(hue),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sprite = new THREE.Mesh(placedGeo, mat)
    const [wx, wy] = toWorld(x, y)
    sprite.position.set(wx, wy, 0.05)
    scene.add(sprite)
    placed.push({ sprite, mat, baseScale: 0.8 + Math.random() * 0.5, born: now, hue, x, y })
  }

  // ── public ops ──────────────────────────────────────────────────────────────
  function flingTo(x: number, y: number, vx: number, vy: number, hue: number) {
    spawnShooter(x, y, vx, vy, hue)
  }

  function bloomAt(x: number, y: number, hue: number) {
    addPlaced(x, y, hue, performance.now())
    // a quick incoming shooter that converges to the bloom (peer star arriving)
  }

  function resize(w: number, h: number) {
    W = w
    H = h
    aspect = W / H
    camera.left = -aspect
    camera.right = aspect
    camera.top = 1
    camera.bottom = -1
    camera.updateProjectionMatrix()
    renderer.setSize(W, H)
    fieldMat.uniforms.uDpr.value = renderer.getPixelRatio()
  }

  let last = performance.now()
  function render(tMs: number) {
    const dt = Math.min(64, tMs - last) / 1000
    last = tMs
    bgMat.uniforms.uTime.value = tMs
    fieldMat.uniforms.uTime.value = tMs

    // shooters
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i]
      const px = s.x
      const py = s.y
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.life -= dt * 0.7
      s.mesh.position.set(s.x, s.y, 0.1)
      const a = Math.max(0, s.life)
      s.mat.opacity = a
      s.mesh.scale.setScalar(0.6 + a * 0.8)
      // trail from previous to current
      const tp = s.trail.geometry.getAttribute('position') as THREE.BufferAttribute
      tp.setXYZ(0, px, py, 0.09)
      tp.setXYZ(1, s.x, s.y, 0.09)
      tp.needsUpdate = true
      s.trailMat.opacity = a * 0.6

      if (s.life <= 0) {
        // land: drop a placed star where it died, clamped to screen
        const [sx, sy] = toSky(s.x, s.y)
        addPlaced(Math.min(0.98, Math.max(0.02, sx)), Math.min(0.96, Math.max(0.04, sy)), hueFromColor(s.mat.color), tMs)
        disposeShooter(s)
        shooters.splice(i, 1)
      }
    }

    // placed twinkle
    for (const p of placed) {
      const age = (tMs - p.born) / 1000
      const grow = Math.min(1, age / 0.35) // soft bloom-in
      const tw = 0.85 + 0.15 * Math.sin(tMs * 0.002 + p.x * 10)
      p.sprite.scale.setScalar(p.baseScale * grow * tw)
      p.mat.opacity = 0.95 * grow
    }

    renderer.render(scene, camera)
  }

  function dispose() {
    shooters.forEach(disposeShooter)
    placed.forEach((p) => {
      scene.remove(p.sprite)
      p.mat.dispose()
    })
    bgGeo.dispose()
    bgMat.dispose()
    fieldGeo.dispose()
    fieldMat.dispose()
    shooterGeo.dispose()
    placedGeo.dispose()
    glowTex.dispose()
    renderer.dispose()
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
  }

  return { flingTo, bloomAt, resize, render, dispose, ok: true }
}

// reverse-map a THREE.Color back to an approximate hue 0..1 for landing blooms
function hueFromColor(c: THREE.Color): number {
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  // our warm->cool ramp roughly runs gold(0.13) -> rose(0.92) -> cyan(0.5) -> violet(0.72)
  // good enough: just reuse the THREE hue as a stable-ish key
  return hsl.h
}

function makeGlowTexture(): THREE.Texture {
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.25)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(cv)
  tex.needsUpdate = true
  return tex
}
