/**
 * soundwalk.ts — 6DoF ambisonic soundfield navigation engine
 *
 * ## What this adds over a head-only ambisonic field (cycle 1, 394)
 * Cycle 1 let you ROTATE a fixed soundfield (turn your head, the field
 * counter-rotates). It had no notion of the listener's *position* — every source
 * stayed at a fixed distance. This engine gives the listener a 2D world position
 * (lx, lz) and a heading yaw, then re-renders the field for that vantage point.
 *
 * Because the lab SYNTHESISES the sources, we know each source's TRUE world
 * position (wx, wz). That is exactly the input the Google paper
 * ("Ambisonics soundfield navigation using directional decomposition and path
 * distance estimation") needs: it decomposes a recorded field into directional
 * components and estimates the path distance to each so it can re-render the
 * field at a translated listener position. We have the directional components for
 * free (each source IS a known direction), so the "directional decomposition" is
 * trivial and we focus on the second half: per-source **path-distance** re-render.
 *
 * ## The per-frame math (for each source s, listener at (lx,lz) facing yaw)
 *   1. World vector to source:   dx = wx - lx,  dz = wz - lz
 *   2. Path distance:            d  = max(hypot(dx,dz), D_MIN)
 *   3. Relative azimuth:         az = atan2(dx, dz) - yaw
 *      (atan2(dx,dz): 0 = straight ahead/+Z, +CW to the right; subtract heading
 *       so turning your head swings the whole field — same rotation idea as 394.)
 *   4. Distance attenuation:     g  = clamp(D_REF / d, 0, G_MAX)   (inverse law)
 *   5. Air / near-field LP:      cutoff = lerp by distance — far = duller,
 *      near = open. Distant sources lose highs (air absorption); a source you walk
 *      onto opens fully.
 *   6. PARALLAX falls out for free: as you walk past a source, atan2(dx,dz) sweeps
 *      from front → side → behind, so the binaural image swings around you. This is
 *      the "wow" and it needs no extra code — it's a consequence of recomputing az
 *      from the live (lx,lz).
 *
 * ## Why PannerNode-per-source (not a hand-rolled FOA decode)
 * Cycle 1 hand-rolled the FOA encode→rotate→virtual-speaker-HRTF-decode chain
 * because it was rendering a single ROTATING field. For 6DoF TRANSLATION the
 * cleanest, most robust path is one HRTF PannerNode per source positioned at its
 * relative (x,y,z): the browser's HRTF already does binaural placement, distance
 * gain and parallax follow directly from updating panner.position each frame, and
 * there is no virtual-speaker quantisation. It is less "ambisonic-pure" than a
 * full decode but produces identical perceptual results here and cannot drift out
 * of sync between 7 sources. We keep the ambisonic *vocabulary* (directional
 * decomposition + path distance) and let the panner be the final decode stage.
 *
 * Web Audio coordinate convention: +x = right, +y = up, +z = toward the listener.
 * We keep the listener at the origin facing -z and move the SOURCES around it
 * (relative rendering) rather than moving an AudioListener — simpler and avoids
 * listener-orientation quirks across browsers.
 */

export const ROOM_HALF = 4.5 // metres — soft wall the walker bounces off

const D_MIN = 0.6 // never closer than this (anti-blast)
const D_REF = 1.6 // reference distance for unity-ish gain
const G_MAX = 1.15 // gain ceiling per source
const LP_NEAR = 9000 // cutoff when right next to a source
const LP_FAR = 900 // cutoff at the far wall
const D_FAR = 9.0 // distance that maps to LP_FAR

export interface SourceWorld {
  wx: number
  wz: number
}

interface SpatialSource {
  wx: number
  wz: number
  panner: PannerNode
  lp: BiquadFilterNode
  gain: GainNode
  /** live relative azimuth (rad) + distance (m), updated each frame */
  az: number
  d: number
}

export class SoundwalkField {
  private ctx: AudioContext
  private dest: AudioNode
  private sources: SpatialSource[] = []

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.dest = destination
  }

  /**
   * Register a synthesised source. `input` is the voice's mono `out` node.
   * Chain: input → lp (air/near-field) → gain (distance) → panner (HRTF) → dest.
   */
  addSource(input: AudioNode, world: SourceWorld) {
    const ctx = this.ctx

    const lp = ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = LP_NEAR
    lp.Q.value = 0.4

    const gain = ctx.createGain()
    gain.gain.value = 0.5

    const panner = ctx.createPanner()
    panner.panningModel = "HRTF"
    panner.distanceModel = "inverse"
    panner.refDistance = 1
    panner.maxDistance = 100
    panner.rolloffFactor = 0 // we do distance gain ourselves for full control
    panner.coneInnerAngle = 360
    panner.positionX.value = 0
    panner.positionY.value = 0
    panner.positionZ.value = -1

    input.connect(lp)
    lp.connect(gain)
    gain.connect(panner)
    panner.connect(this.dest)

    this.sources.push({ wx: world.wx, wz: world.wz, panner, lp, gain, az: 0, d: D_REF })
  }

  /**
   * Re-render the field for a listener at (lx, lz) facing `yaw` radians.
   * Returns per-source {az, d, gain01} so the UI/haptics can read the live state.
   */
  step(lx: number, lz: number, yaw: number): { az: number; d: number; gain01: number }[] {
    const ctx = this.ctx
    const t = ctx.currentTime
    const out: { az: number; d: number; gain01: number }[] = []

    for (const s of this.sources) {
      const dx = s.wx - lx
      const dz = s.wz - lz
      const dist = Math.max(Math.hypot(dx, dz), D_MIN)

      // Relative azimuth: 0 = ahead, subtract heading so turning swings the field.
      const az = Math.atan2(dx, dz) - yaw

      // Inverse-distance gain, clamped (anti-blast).
      const g = Math.min(G_MAX, D_REF / dist)

      // Air / near-field low-pass cutoff: near = bright, far = dull.
      const frac = Math.min(1, Math.max(0, (dist - D_MIN) / (D_FAR - D_MIN)))
      const cutoff = LP_NEAR + (LP_FAR - LP_NEAR) * frac

      // Place panner at the relative direction on the unit-ish circle.
      // +x right, +z toward listener → source ahead is at z>0 from listener but
      // Web Audio "toward listener" is +z, so a source in front maps to +z.
      const px = Math.sin(az) * dist
      const pz = Math.cos(az) * dist
      s.panner.positionX.setTargetAtTime(px, t, 0.05)
      s.panner.positionY.setTargetAtTime(0, t, 0.05)
      s.panner.positionZ.setTargetAtTime(pz, t, 0.05)

      s.gain.gain.setTargetAtTime(g, t, 0.05)
      s.lp.frequency.setTargetAtTime(cutoff, t, 0.08)

      s.az = az
      s.d = dist
      out.push({ az, d: dist, gain01: g / G_MAX })
    }

    return out
  }

  dispose() {
    for (const s of this.sources) {
      try { s.panner.disconnect() } catch { /* noop */ }
      try { s.gain.disconnect() } catch { /* noop */ }
      try { s.lp.disconnect() } catch { /* noop */ }
    }
    this.sources = []
  }
}

// ── Locomotion auto-pilot ─────────────────────────────────────────────────────

/**
 * A wandering waypoint auto-pilot. After Start the walker drifts toward a target
 * inside the room; when it arrives it picks a new target. Drag-to-steer nudges the
 * walk DIRECTION (it biases the next heading), so a reviewer who does nothing still
 * hears voices swell, pass and recede hands-free within a few seconds.
 */
export class Walker {
  x = -2.0
  z = 3.0
  /** facing heading in radians (0 = +Z), driven by device-orientation if granted */
  yaw = 0

  private tx = 0
  private tz = 0
  private speed = 0.85 // m/s — a calm stroll
  private steerBias = 0 // radians, decays; set by drag
  private rng = mulberry32(0xC0FFEE)

  constructor() {
    this.pickTarget()
  }

  private pickTarget() {
    const r = ROOM_HALF * 0.8
    this.tx = (this.rng() * 2 - 1) * r
    this.tz = (this.rng() * 2 - 1) * r
  }

  /** Nudge the walk direction (drag-to-steer). dxNorm in roughly [-1,1]. */
  steer(dxNorm: number) {
    this.steerBias = Math.max(-1.2, Math.min(1.2, this.steerBias + dxNorm * 0.9))
  }

  /** Advance the walk by dt seconds. `headingFromSensor` overrides yaw if provided. */
  step(dt: number, headingFromSensor: number | null) {
    let dx = this.tx - this.x
    let dz = this.tz - this.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.4) this.pickTarget()

    // Normalised movement direction toward target, plus decaying steer bias.
    if (dist > 1e-3) { dx /= dist; dz /= dist }
    const moveAngle = Math.atan2(dx, dz) + this.steerBias
    this.steerBias *= Math.pow(0.5, dt / 0.6) // ~0.6 s half-life

    const mx = Math.sin(moveAngle)
    const mz = Math.cos(moveAngle)
    this.x += mx * this.speed * dt
    this.z += mz * this.speed * dt

    // Soft wall bounce.
    if (this.x > ROOM_HALF) { this.x = ROOM_HALF; this.pickTarget() }
    if (this.x < -ROOM_HALF) { this.x = -ROOM_HALF; this.pickTarget() }
    if (this.z > ROOM_HALF) { this.z = ROOM_HALF; this.pickTarget() }
    if (this.z < -ROOM_HALF) { this.z = -ROOM_HALF; this.pickTarget() }

    // Heading: sensor if granted, else face the way we're walking (immersive).
    if (headingFromSensor !== null) {
      this.yaw = headingFromSensor
    } else {
      // Ease yaw toward movement direction.
      const target = moveAngle
      let d = target - this.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.yaw += d * Math.min(1, dt * 2.2)
    }
  }
}

/** Tiny deterministic PRNG so the auto-walk path is stable per session. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
