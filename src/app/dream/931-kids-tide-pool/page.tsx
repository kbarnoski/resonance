"use client"

import { useEffect, useRef, useState } from "react"

// ----------------------------------------------------------------------------
// Kids Tide Pool — an all-GPU moonlit sea you tilt at bedtime.
//
// A 4-year-old tilts the iPad; a glowing shallow-water simulation flows downhill
// and pools in the low corner. The ENTIRE water solve lives on the GPU: water
// height + four directional pipe-fluxes live in float textures, advanced by
// fragment shaders each frame (virtual-pipes / Mei-Decaudin-Hu 2007). A handful
// of "lily" probe texels are read back cheaply; when a pool rises past a
// threshold the lily rings a soft pentatonic bell. The rhythm of the music is
// the rhythm of how they tilt.
// ----------------------------------------------------------------------------

// Warm pentatonic bell bank (Hz): C4 D4 E4 G4 A4 C5 D5 E5 — consonant by
// construction. Pitch is held deliberately dumb; the music is in the rhythm.
const BELL_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]

// Audio safety
const MASTER_GAIN = 0.24
const LOWPASS_HZ = 6000

// Simulation grid (square float textures on the GPU).
const SIM = 256

// Lily probe points (fixed UVs across the pool). One bell each.
const LILIES: { u: number; v: number; note: number }[] = [
  { u: 0.28, v: 0.30, note: 0 },
  { u: 0.62, v: 0.26, note: 2 },
  { u: 0.80, v: 0.50, note: 4 },
  { u: 0.44, v: 0.52, note: 5 },
  { u: 0.22, v: 0.70, note: 1 },
  { u: 0.55, v: 0.74, note: 3 },
  { u: 0.76, v: 0.78, note: 7 },
]

const DEPTH_THRESHOLD = 0.55 // probe depth rising-edge for a bell
const BELL_COOLDOWN_S = 0.22 // per-lily minimum spacing

// --- shader sources ------------------------------------------------------

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// Pass A: update the four outflow fluxes (L,R,D,U) from neighbour height
// differences plus the tilt-gravity term, damped, then scaled so no cell can
// drain negative. State texture: R = water height, GBA = unused here.
// Flux texture: RGBA = flux to (L, R, D, U).
const FRAG_FLUX = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outFlux;
uniform sampler2D u_state;  // R = height
uniform sampler2D u_flux;   // rgba = L,R,D,U outflow
uniform vec2 u_texel;       // 1/SIM
uniform vec2 u_grav;        // tilt gravity (gx, gy) in grid space
uniform float u_dt;

float heightAt(vec2 uv) {
  return texture(u_state, uv).r;
}

void main() {
  vec2 uv = v_uv;
  float h = heightAt(uv);

  float hL = heightAt(uv + vec2(-u_texel.x, 0.0));
  float hR = heightAt(uv + vec2( u_texel.x, 0.0));
  float hD = heightAt(uv + vec2(0.0, -u_texel.y));
  float hU = heightAt(uv + vec2(0.0,  u_texel.y));

  vec4 flux = texture(u_flux, uv);

  // Gravity pushes water "downhill" in tilt direction. A positive u_grav.x
  // means the low side is to the right, so flux to the right is encouraged.
  float A = 9.0;     // pipe acceleration (gravity * area / length, lumped)
  float damp = 0.985;

  float fL = flux.r + u_dt * (A * (h - hL) - u_grav.x);
  float fR = flux.g + u_dt * (A * (h - hR) + u_grav.x);
  float fD = flux.b + u_dt * (A * (h - hD) - u_grav.y);
  float fU = flux.a + u_dt * (A * (h - hU) + u_grav.y);

  fL = max(0.0, fL) * damp;
  fR = max(0.0, fR) * damp;
  fD = max(0.0, fD) * damp;
  fU = max(0.0, fU) * damp;

  // No-flux at the walls (closed tide pool).
  if (uv.x - u_texel.x < 0.0) fL = 0.0;
  if (uv.x + u_texel.x > 1.0) fR = 0.0;
  if (uv.y - u_texel.y < 0.0) fD = 0.0;
  if (uv.y + u_texel.y > 1.0) fU = 0.0;

  // Scale outflow so total out <= available water this step (stability).
  float totalOut = (fL + fR + fD + fU) * u_dt;
  if (totalOut > h && totalOut > 1e-6) {
    float k = h / totalOut;
    fL *= k; fR *= k; fD *= k; fU *= k;
  }

  outFlux = vec4(fL, fR, fD, fU);
}`

// Pass B: update water height from net flux in/out, plus a slow gentle source
// so the pool never fully drains.
const FRAG_HEIGHT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outState;
uniform sampler2D u_state;
uniform sampler2D u_flux;
uniform vec2 u_texel;
uniform float u_dt;
uniform float u_time;

void main() {
  vec2 uv = v_uv;
  float h = texture(u_state, uv).r;
  vec4 self = texture(u_flux, uv); // my outflow L,R,D,U

  // Inflow = neighbours' outflow aimed at me.
  float inL = texture(u_flux, uv + vec2(-u_texel.x, 0.0)).g; // left cell's R flux
  float inR = texture(u_flux, uv + vec2( u_texel.x, 0.0)).r; // right cell's L flux
  float inD = texture(u_flux, uv + vec2(0.0, -u_texel.y)).a; // down cell's U flux
  float inU = texture(u_flux, uv + vec2(0.0,  u_texel.y)).b; // up cell's D flux

  float inflow = inL + inR + inD + inU;
  float outflow = self.r + self.g + self.b + self.a;

  h += u_dt * (inflow - outflow);

  // Slow, very gentle springs near centre so the sea breathes & never dies.
  vec2 c = uv - vec2(0.5);
  float ring = exp(-dot(c, c) * 16.0);
  h += u_dt * 0.06 * ring * (0.6 + 0.4 * sin(u_time * 0.6));

  h = clamp(h, 0.0, 4.0);
  outState = vec4(h, 0.0, 0.0, 1.0);
}`

// Pass C: shade the height field to a glowing moonlit sea. Deep = cool indigo,
// pooled/high = warm gold; additive glow; height-normal specular shimmer; lily
// nodes glow brighter when they recently rang.
const FRAG_SHADE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_time;
uniform vec2 u_lilyUV[8];
uniform float u_lilyGlow[8]; // 0..1 recent-ring brightness
uniform int u_lilyCount;

void main() {
  vec2 uv = v_uv;
  float h = texture(u_state, uv).r;

  // height-based color ramp: indigo -> teal -> gold
  vec3 deep = vec3(0.05, 0.07, 0.20);
  vec3 mid  = vec3(0.10, 0.35, 0.55);
  vec3 high = vec3(1.00, 0.78, 0.38);
  float t = clamp(h / 1.6, 0.0, 1.0);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.5, t));
  col = mix(col, high, smoothstep(0.5, 1.0, t));

  // normals from height for a soft moonlit specular shimmer
  float hL = texture(u_state, uv + vec2(-u_texel.x, 0.0)).r;
  float hR = texture(u_state, uv + vec2( u_texel.x, 0.0)).r;
  float hD = texture(u_state, uv + vec2(0.0, -u_texel.y)).r;
  float hU = texture(u_state, uv + vec2(0.0,  u_texel.y)).r;
  vec3 n = normalize(vec3(hL - hR, hD - hU, 0.12));
  vec3 lightDir = normalize(vec3(0.3, 0.6, 0.7));
  float spec = pow(max(dot(n, lightDir), 0.0), 22.0);
  col += vec3(0.55, 0.62, 0.85) * spec * 0.8;

  // glow scales with depth (additive bloom for pooled water)
  col += high * t * t * 0.35;

  // lily nodes: a soft radial glow, brighter right after they ring
  for (int i = 0; i < 8; i++) {
    if (i >= u_lilyCount) break;
    vec2 d = uv - u_lilyUV[i];
    float r = length(d);
    float core = exp(-r * r * 900.0);
    float halo = exp(-r * r * 120.0);
    float g = u_lilyGlow[i];
    vec3 lilyCol = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.9, 0.6), g);
    col += lilyCol * (core * (0.25 + 0.9 * g) + halo * (0.05 + 0.4 * g));
  }

  // gentle vignette for bedtime calm
  vec2 cc = uv - 0.5;
  float vig = 1.0 - dot(cc, cc) * 0.7;
  col *= vig;

  fragColor = vec4(col, 1.0);
}`

// --- typed WebGL helpers -------------------------------------------------

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error("shader create failed")
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error("shader compile failed: " + log)
  }
  return sh
}

function makeProgram(
  gl: WebGL2RenderingContext,
  fragSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const prog = gl.createProgram()
  if (!prog) throw new Error("program create failed")
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.bindAttribLocation(prog, 0, "a_pos")
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error("program link failed: " + log)
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return prog
}

interface SimTarget {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
}

function makeTarget(
  gl: WebGL2RenderingContext,
  size: number,
  internalFormat: number,
  type: number,
  seed: Float32Array | null
): SimTarget {
  const tex = gl.createTexture()
  if (!tex) throw new Error("texture create failed")
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    size,
    size,
    0,
    gl.RGBA,
    type,
    seed
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error("fbo create failed")
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0
  )
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fbo }
}

export default function KidsTidePoolPage() {
  const mountRef = useRef<HTMLCanvasElement | null>(null)
  const [started, setStarted] = useState(false)
  const [permissionNote, setPermissionNote] = useState<string | null>(null)
  const [noGpuNote, setNoGpuNote] = useState<string | null>(null)
  const [bellCount, setBellCount] = useState(0)

  // long-lived audio refs
  const audioRef = useRef<{
    actx: AudioContext
    master: GainNode
    padOscs: OscillatorNode[]
    padGain: GainNode
  } | null>(null)

  // pointer-drag gravity (fallback / desktop)
  const pointerGravRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  })
  // device-orientation gravity
  const tiltGravRef = useRef<{ x: number; y: number; have: boolean }>({
    x: 0,
    y: 0,
    have: false,
  })

  useEffect(() => {
    if (!started) return
    const canvasMaybe = mountRef.current
    const audio = audioRef.current
    if (!canvasMaybe || !audio) return
    const canvas: HTMLCanvasElement = canvasMaybe
    const { actx, master } = audio

    // --- soft bell voice (warm, slow attack, gentle decay) ---
    function ringBell(hz: number) {
      const t = actx.currentTime
      const g = actx.createGain()
      g.connect(master)
      g.gain.setValueAtTime(0.0001, t)
      // >=40ms attack, no sudden transient
      g.gain.linearRampToValueAtTime(0.16, t + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)

      const o = actx.createOscillator()
      o.type = "sine"
      o.frequency.value = hz
      // gentle FM-ish shimmer partial, low level
      const o2 = actx.createOscillator()
      o2.type = "sine"
      o2.frequency.value = hz * 2.01
      const g2 = actx.createGain()
      g2.gain.value = 0.18
      o.connect(g)
      o2.connect(g2)
      g2.connect(g)
      o.start(t)
      o2.start(t)
      o.stop(t + 2.7)
      o2.stop(t + 2.7)
    }

    // ---- WebGL2 setup ----
    const glCtx = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    })

    let rafId = 0
    let teardownGL: (() => void) | null = null

    if (!glCtx) {
      setNoGpuNote(
        "This device can't run the GPU sea — but the lullaby is still playing."
      )
    } else {
      // non-null binding so all the inner closures see a typed context
      const gl: WebGL2RenderingContext = glCtx
      const floatExt = gl.getExtension("EXT_color_buffer_float")
      const halfFloatExt = gl.getExtension("EXT_color_buffer_half_float")
      let stateFmt: number = gl.RGBA32F
      let stateType: number = gl.FLOAT
      if (floatExt) {
        stateFmt = gl.RGBA32F
        stateType = gl.FLOAT
      } else if (halfFloatExt) {
        stateFmt = gl.RGBA16F
        stateType = gl.HALF_FLOAT
      }

      if (!floatExt && !halfFloatExt) {
        setNoGpuNote(
          "This device can't pool light on the GPU — but the lullaby is still playing."
        )
      } else {
        try {
          // fullscreen triangle-pair quad
          const quad = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, quad)
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 3, -1, -1, 3]),
            gl.STATIC_DRAW
          )
          const vao = gl.createVertexArray()
          gl.bindVertexArray(vao)
          gl.enableVertexAttribArray(0)
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

          const progFlux = makeProgram(gl, FRAG_FLUX)
          const progHeight = makeProgram(gl, FRAG_HEIGHT)
          const progShade = makeProgram(gl, FRAG_SHADE)

          // seed state: a calm shallow film of water everywhere
          const seed = new Float32Array(SIM * SIM * 4)
          for (let i = 0; i < SIM * SIM; i++) {
            seed[i * 4 + 0] = 0.5 // height
            seed[i * 4 + 3] = 1.0
          }

          let stateA = makeTarget(gl, SIM, stateFmt, stateType, seed)
          let stateB = makeTarget(gl, SIM, stateFmt, stateType, null)
          const zeroFlux = new Float32Array(SIM * SIM * 4)
          let fluxA = makeTarget(gl, SIM, stateFmt, stateType, zeroFlux)
          let fluxB = makeTarget(gl, SIM, stateFmt, stateType, zeroFlux)

          // Cheap probe readback: we sample just the handful of lily texels
          // directly from the sim FBO (no full-grid stall), into this buffer.
          const probePixels = new Float32Array(LILIES.length * 4)

          // uniform locations
          const uFlux = {
            state: gl.getUniformLocation(progFlux, "u_state"),
            flux: gl.getUniformLocation(progFlux, "u_flux"),
            texel: gl.getUniformLocation(progFlux, "u_texel"),
            grav: gl.getUniformLocation(progFlux, "u_grav"),
            dt: gl.getUniformLocation(progFlux, "u_dt"),
          }
          const uHeight = {
            state: gl.getUniformLocation(progHeight, "u_state"),
            flux: gl.getUniformLocation(progHeight, "u_flux"),
            texel: gl.getUniformLocation(progHeight, "u_texel"),
            dt: gl.getUniformLocation(progHeight, "u_dt"),
            time: gl.getUniformLocation(progHeight, "u_time"),
          }
          const uShade = {
            state: gl.getUniformLocation(progShade, "u_state"),
            texel: gl.getUniformLocation(progShade, "u_texel"),
            time: gl.getUniformLocation(progShade, "u_time"),
            lilyUV: gl.getUniformLocation(progShade, "u_lilyUV"),
            lilyGlow: gl.getUniformLocation(progShade, "u_lilyGlow"),
            lilyCount: gl.getUniformLocation(progShade, "u_lilyCount"),
          }

          const lilyUVFlat = new Float32Array(16)
          for (let i = 0; i < LILIES.length; i++) {
            lilyUVFlat[i * 2] = LILIES[i].u
            lilyUVFlat[i * 2 + 1] = LILIES[i].v
          }
          const lilyGlow = new Float32Array(8)
          const lilyArmed = new Array(LILIES.length).fill(true)
          const lilyLastRing = new Float32Array(LILIES.length)

          const texel = [1 / SIM, 1 / SIM]
          let smGx = 0
          let smGy = 0
          let bells = 0
          const startMs = performance.now()
          let lastProbe = 0

          function drawQuad() {
            gl.bindVertexArray(vao)
            gl.drawArrays(gl.TRIANGLES, 0, 3)
          }

          function stepSim(nowS: number, dt: number) {
            // --- target gravity from tilt or pointer, smoothed (lerp) ---
            let tgx = 0
            let tgy = 0
            if (tiltGravRef.current.have) {
              tgx = tiltGravRef.current.x
              tgy = tiltGravRef.current.y
            } else if (pointerGravRef.current.active) {
              tgx = pointerGravRef.current.x
              tgy = pointerGravRef.current.y
            } else {
              // idle auto-demo: a slow gentle rocking so a hands-free glance
              // SEES the sea flow + pool and HEARS bells within ~0.6s.
              tgx = Math.sin(nowS * 0.7) * 0.9
              tgy = Math.cos(nowS * 0.52) * 0.9
            }
            smGx += (tgx - smGx) * 0.08
            smGy += (tgy - smGy) * 0.08

            // (a) flux update pass
            gl.useProgram(progFlux)
            gl.bindFramebuffer(gl.FRAMEBUFFER, fluxB.fbo)
            gl.viewport(0, 0, SIM, SIM)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, stateA.tex)
            gl.uniform1i(uFlux.state, 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, fluxA.tex)
            gl.uniform1i(uFlux.flux, 1)
            gl.uniform2f(uFlux.texel, texel[0], texel[1])
            gl.uniform2f(uFlux.grav, smGx, smGy)
            gl.uniform1f(uFlux.dt, dt)
            drawQuad()
            const tmpF = fluxA
            fluxA = fluxB
            fluxB = tmpF

            // (b) height update pass
            gl.useProgram(progHeight)
            gl.bindFramebuffer(gl.FRAMEBUFFER, stateB.fbo)
            gl.viewport(0, 0, SIM, SIM)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, stateA.tex)
            gl.uniform1i(uHeight.state, 0)
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, fluxA.tex)
            gl.uniform1i(uHeight.flux, 1)
            gl.uniform2f(uHeight.texel, texel[0], texel[1])
            gl.uniform1f(uHeight.dt, dt)
            gl.uniform1f(uHeight.time, nowS)
            drawQuad()
            const tmpS = stateA
            stateA = stateB
            stateB = tmpS
          }

          function readProbes(nowS: number) {
            // Read back ONLY the handful of lily texels straight from the sim
            // FBO at their grid coords — a few 1x1 reads, no full-grid stall.
            gl.bindFramebuffer(gl.FRAMEBUFFER, stateA.fbo)
            for (let i = 0; i < LILIES.length; i++) {
              const px = Math.min(SIM - 1, Math.floor(LILIES[i].u * SIM))
              const py = Math.min(SIM - 1, Math.floor(LILIES[i].v * SIM))
              const one = probePixels.subarray(i * 4, i * 4 + 4)
              gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, one)
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)

            // rising-edge bell triggering with per-lily cooldown
            for (let i = 0; i < LILIES.length; i++) {
              const depth = probePixels[i * 4]
              const overshoot = depth > DEPTH_THRESHOLD
              if (
                overshoot &&
                lilyArmed[i] &&
                nowS - lilyLastRing[i] > BELL_COOLDOWN_S
              ) {
                ringBell(BELL_HZ[LILIES[i].note % BELL_HZ.length])
                lilyArmed[i] = false
                lilyLastRing[i] = nowS
                lilyGlow[i] = 1.0
                bells++
                setBellCount(bells)
              }
              // re-arm with hysteresis when it drops back below
              if (depth < DEPTH_THRESHOLD - 0.08) lilyArmed[i] = true
              // decay the visual glow
              lilyGlow[i] *= 0.92
            }
          }

          function drawShade(nowS: number) {
            gl.useProgram(progShade)
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.viewport(0, 0, canvas.width, canvas.height)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, stateA.tex)
            gl.uniform1i(uShade.state, 0)
            gl.uniform2f(uShade.texel, texel[0], texel[1])
            gl.uniform1f(uShade.time, nowS)
            gl.uniform2fv(uShade.lilyUV, lilyUVFlat)
            gl.uniform1fv(uShade.lilyGlow, lilyGlow)
            gl.uniform1i(uShade.lilyCount, LILIES.length)
            drawQuad()
          }

          function frame(now: number) {
            rafId = requestAnimationFrame(frame)
            const nowS = (now - startMs) / 1000
            const dt = 0.016 // fixed sim dt for stability

            // a few sub-steps per frame for a livelier, stable solve
            const sub = 3
            for (let s = 0; s < sub; s++) stepSim(nowS, dt)

            // probe readback throttled (~ every 30ms) to stay cheap
            if (now - lastProbe > 30) {
              lastProbe = now
              readProbes(nowS)
            } else {
              for (let i = 0; i < LILIES.length; i++) lilyGlow[i] *= 0.96
            }

            drawShade(nowS)
          }
          rafId = requestAnimationFrame(frame)

          teardownGL = () => {
            gl.deleteProgram(progFlux)
            gl.deleteProgram(progHeight)
            gl.deleteProgram(progShade)
            gl.deleteBuffer(quad)
            gl.deleteVertexArray(vao)
            gl.deleteTexture(stateA.tex)
            gl.deleteTexture(stateB.tex)
            gl.deleteTexture(fluxA.tex)
            gl.deleteTexture(fluxB.tex)
            gl.deleteFramebuffer(stateA.fbo)
            gl.deleteFramebuffer(stateB.fbo)
            gl.deleteFramebuffer(fluxA.fbo)
            gl.deleteFramebuffer(fluxB.fbo)
            const lose = gl.getExtension("WEBGL_lose_context")
            if (lose) lose.loseContext()
          }
        } catch (e) {
          setNoGpuNote(
            "The GPU sea couldn't start — but the lullaby is still playing."
          )
          console.warn("tide-pool GPU init failed", e)
        }
      }
    }

    // ---- size the canvas to its box ----
    function resize() {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.floor(canvas.clientWidth * dpr)
      const h = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
    resize()
    window.addEventListener("resize", resize)

    // ---- device orientation -> tilt gravity ----
    function onOrient(ev: DeviceOrientationEvent) {
      if (ev.beta === null && ev.gamma === null) return
      const beta = ev.beta ?? 0 // front-back tilt [-180,180]
      const gamma = ev.gamma ?? 0 // left-right tilt [-90,90]
      // map to a gentle gravity vector in grid space
      const gx = Math.max(-1, Math.min(1, gamma / 30)) * 1.6
      const gy = Math.max(-1, Math.min(1, beta / 30)) * 1.6
      tiltGravRef.current.x = gx
      tiltGravRef.current.y = -gy
      tiltGravRef.current.have = true
    }
    window.addEventListener("deviceorientation", onOrient)

    // ---- pointer drag -> tip the sea (desktop / fallback) ----
    function pointerGrav(ev: PointerEvent) {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const nx = (ev.clientX - rect.left) / rect.width // 0..1
      const ny = (ev.clientY - rect.top) / rect.height
      pointerGravRef.current.x = (nx - 0.5) * 3.0
      pointerGravRef.current.y = -(ny - 0.5) * 3.0
    }
    function pointerDown(ev: PointerEvent) {
      pointerGravRef.current.active = true
      pointerGrav(ev)
    }
    function pointerMove(ev: PointerEvent) {
      if (pointerGravRef.current.active) pointerGrav(ev)
    }
    function pointerUp() {
      pointerGravRef.current.active = false
    }
    canvas.addEventListener("pointerdown", pointerDown)
    window.addEventListener("pointermove", pointerMove)
    window.addEventListener("pointerup", pointerUp)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("deviceorientation", onOrient)
      canvas.removeEventListener("pointerdown", pointerDown)
      window.removeEventListener("pointermove", pointerMove)
      window.removeEventListener("pointerup", pointerUp)
      if (teardownGL) teardownGL()
    }
  }, [started])

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        try {
          for (const o of audio.padOscs) o.stop()
        } catch {
          // already stopped
        }
        if (audio.actx.state !== "closed") {
          audio.actx.close().catch(() => {})
        }
        audioRef.current = null
      }
    }
  }, [])

  // ---- Start tap: audio context + master chain + ambient pad + tilt perm ----
  async function startSea() {
    if (audioRef.current) {
      setStarted(true)
      return
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const actx = new Ctx()
    if (actx.state === "suspended") await actx.resume()

    // master chain: gain -> lowpass -> compressor/limiter -> destination
    const master = actx.createGain()
    master.gain.value = MASTER_GAIN
    const lp = actx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = LOWPASS_HZ
    const comp = actx.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.knee.value = 24
    comp.ratio.value = 20
    comp.attack.value = 0.003
    comp.release.value = 0.25
    master.connect(lp)
    lp.connect(comp)
    comp.connect(actx.destination)

    // always-on soft ambient drone (C2 + G2) so it's never silent
    const padGain = actx.createGain()
    padGain.gain.setValueAtTime(0.0001, actx.currentTime)
    padGain.gain.linearRampToValueAtTime(0.06, actx.currentTime + 5)
    const padFilter = actx.createBiquadFilter()
    padFilter.type = "lowpass"
    padFilter.frequency.value = 600
    padFilter.Q.value = 0.3
    padFilter.connect(padGain)
    padGain.connect(master)

    const padOscs: OscillatorNode[] = []
    for (const f of [65.41, 98.0]) {
      const o = actx.createOscillator()
      o.type = "sine"
      o.frequency.value = f
      const od = actx.createOscillator()
      od.type = "sine"
      od.frequency.value = f * 1.005
      o.connect(padFilter)
      od.connect(padFilter)
      o.start()
      od.start()
      padOscs.push(o, od)
    }
    // slow LFO breathing the pad filter
    const lfo = actx.createOscillator()
    lfo.frequency.value = 0.04
    const lfoGain = actx.createGain()
    lfoGain.gain.value = 250
    lfo.connect(lfoGain)
    lfoGain.connect(padFilter.frequency)
    lfo.start()
    padOscs.push(lfo)

    audioRef.current = { actx, master, padOscs, padGain }

    // iOS 13+ requires explicit permission, inside this user gesture.
    const dom = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>
    }
    if (dom && typeof dom.requestPermission === "function") {
      try {
        const res = await dom.requestPermission()
        if (res !== "granted") {
          setPermissionNote(
            "No tilt this time — drag the sea with your finger. It still flows and sings."
          )
        }
      } catch {
        setPermissionNote(
          "No tilt this time — drag the sea with your finger. It still flows and sings."
        )
      }
    }

    setStarted(true)
  }

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04060f] text-foreground">
      <canvas ref={mountRef} className="absolute inset-0 h-full w-full" />

      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#04060f]/95 px-6 text-center">
          <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
            Moonlit Tide Pool
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            Tilt the screen and a sea of light flows downhill, pooling in the low
            corner. Every pool rings a soft bell. Rock it gently for slow drops,
            or sway it for a sparkle of chimes.
          </p>
          <button
            type="button"
            onClick={startSea}
            className="min-h-[64px] min-w-[64px] rounded-full bg-violet-400/90 px-8 py-4 text-xl font-medium text-violet-950 shadow-lg shadow-violet-500/20 transition active:scale-95"
          >
            Touch the sea
          </button>
          <p className="text-base text-muted-foreground">
            Best with the volume gentle and low, lying down at bedtime.
          </p>
        </div>
      )}

      {started && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 select-none font-mono text-base text-muted-foreground">
          <div className="text-violet-300/95">{bellCount} bells</div>
          <div className="text-muted-foreground">tilt or drag the sea</div>
        </div>
      )}

      {started && permissionNote && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-[60%] text-right text-base text-violet-300">
          {permissionNote}
        </div>
      )}

      {started && noGpuNote && (
        <div className="pointer-events-none absolute inset-x-4 bottom-16 z-10 text-center text-base text-violet-300">
          {noGpuNote}
        </div>
      )}

      <a
        href="/dream/931-kids-tide-pool/README.md"
        className="absolute bottom-3 right-4 z-10 font-mono text-base text-violet-300/80 underline-offset-2 hover:underline"
      >
        design notes
      </a>
    </main>
  )
}
