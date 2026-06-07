/**
 * ambisonics.ts — First-Order Ambisonic (FOA) B-format engine
 *
 * ## Theory
 * Each sound source at azimuth `az` (radians, 0=front, +CW), elevation `el`
 * (radians, 0=horizon, +up) is encoded into 4 B-format channels using
 * ACN channel order with SN3D normalisation (first-order subset):
 *
 *   W  (ACN 0): gain = 1/√2          — omnidirectional pressure
 *   Y  (ACN 1): gain = sin(az)·cos(el) — left-right
 *   Z  (ACN 2): gain = sin(el)         — up-down
 *   X  (ACN 3): gain = cos(az)·cos(el) — front-back
 *
 * (The classic B-format ordering is W,X,Y,Z; here we keep ACN for clarity
 * but the physics is identical.)
 *
 * ## Rotation
 * A yaw rotation by angle θ (listener turns right → field turns left by −θ)
 * leaves W unchanged and applies a 2D rotation to the horizontal (X,Y) pair:
 *
 *   X' = X·cos(θ) + Y·sin(θ)
 *   Y' = -X·sin(θ) + Y·cos(θ)
 *   Z' = Z
 *
 * Pitch and roll rotations extend this to the full (X,Y,Z) space via
 * proper 3×3 SO(3) rotation matrices.
 *
 * ## Decoding (binaural via virtual loudspeakers)
 * We place N virtual speakers around the listener (cardioid max-rE weights).
 * Each speaker at (az_k, el_k) receives signal:
 *
 *   s_k = g_W·W + g_X·X'·decode_X_k + g_Y·Y'·decode_Y_k + g_Z·Z'·decode_Z_k
 *
 * where decode_k = [cos(az_k)cos(el_k), sin(az_k)cos(el_k), sin(el_k)]
 * and g_W, g_X/Y/Z are the max-rE decode weights for first-order:
 *   g_W = 1/√2,  g_XYZ = √(3)/2  (max-rE, from the Zotter & Frank 2019 table)
 *
 * Each decoded speaker signal feeds a Web Audio PannerNode (HRTF) placed at
 * the corresponding fixed speaker position. Summed across all speakers, this
 * produces binaural output that accurately renders the full soundfield.
 *
 * References:
 *   - JSAmbisonics: https://github.com/polarch/JSAmbisonics
 *   - Google Omnitone: https://github.com/GoogleChrome/omnitone
 *   - Zotter & Frank, "Ambisonics", Springer 2019
 */

export interface BFormatChannels {
  W: GainNode
  X: GainNode
  Y: GainNode
  Z: GainNode
}

/** One virtual loudspeaker in the decode ring */
interface VirtualSpeaker {
  az: number  // radians
  el: number  // radians
  panner: PannerNode
  /** Four gain nodes: wGain, xGain, yGain, zGain → sum → panner */
  wGain: GainNode
  xGain: GainNode
  yGain: GainNode
  zGain: GainNode
  sumGain: GainNode
}

/**
 * Virtual loudspeaker layout.
 * 6 horizontal + 2 elevated (±45°) = 8 speakers.
 * This gives good spatial resolution while keeping CPU manageable.
 */
const SPEAKER_LAYOUT: Array<{ az: number; el: number }> = [
  { az: 0,                el: 0 },          // front
  { az: Math.PI / 3,      el: 0 },          // front-right 60°
  { az: (2 * Math.PI) / 3, el: 0 },         // back-right 120°
  { az: Math.PI,          el: 0 },          // back
  { az: -(2 * Math.PI) / 3, el: 0 },        // back-left 120°
  { az: -Math.PI / 3,     el: 0 },          // front-left 60°
  { az: 0,                el: Math.PI / 4 }, // above-front 45°
  { az: Math.PI,          el: Math.PI / 4 }, // above-back 45°
]

/** max-rE decode weights for first-order (from Zotter & Frank 2019) */
const G_W = 1 / Math.SQRT2          // ≈ 0.7071
const G_XYZ = Math.sqrt(3) / 2      // ≈ 0.8660

/**
 * AmbisonicField manages the B-format bus, rotation, and binaural decode.
 *
 * Usage:
 *   const field = new AmbisonicField(ctx, masterGain)
 *   // Connect a source's output to field.inputGains(az, el) → returns GainNodes
 *   field.setOrientation(yaw, pitch, roll)
 *   // Call repeatedly from rAF to update the rotation
 */
export class AmbisonicField {
  private ctx: AudioContext
  private speakers: VirtualSpeaker[] = []

  /** B-format bus — all sources sum into these */
  readonly busW: GainNode
  readonly busX: GainNode
  readonly busY: GainNode
  readonly busZ: GainNode

  /** Rotated B-format intermediaries — one set per speaker */
  // (rotation is applied dynamically in setOrientation via gain coefficient updates)

  /**
   * For each speaker k and each B-format channel, we need a gain node
   * that scales B-channel by its decode coefficient.
   * We update these coefficients in setOrientation.
   *
   * Per speaker: wDec (fixed), xDec (updated), yDec (updated), zDec (updated).
   * The rotation effectively pre-multiplies the decode matrix, so:
   *   decoded_k = G_W·W·wCoef_k + G_XYZ·(X·xCoef_k + Y·yCoef_k + Z·zCoef_k)
   * where (xCoef_k, yCoef_k, zCoef_k) = R^T · (cos az_k cos el_k, sin az_k cos el_k, sin el_k)
   * or equivalently: B_rotated = R·B, then decode with fixed speaker positions.
   * We do the latter: update the xCoef/yCoef/zCoef per speaker from the rotated
   * speaker direction.
   */

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx

    // Create B-format summing buses
    this.busW = ctx.createGain(); this.busW.gain.value = 1
    this.busX = ctx.createGain(); this.busX.gain.value = 1
    this.busY = ctx.createGain(); this.busY.gain.value = 1
    this.busZ = ctx.createGain(); this.busZ.gain.value = 1

    // Create virtual speakers
    for (const { az, el } of SPEAKER_LAYOUT) {
      const panner = ctx.createPanner()
      panner.panningModel = "HRTF"
      panner.distanceModel = "inverse"
      panner.refDistance = 1
      panner.maxDistance = 10000
      panner.rolloffFactor = 0

      // Place speaker in 3D: x=sin(az)cos(el), y=sin(el), z=-cos(az)cos(el)
      // Web Audio convention: +x=right, +y=up, +z=toward listener
      const sx =  Math.sin(az) * Math.cos(el)
      const sy =  Math.sin(el)
      const sz = -Math.cos(az) * Math.cos(el)
      panner.positionX.value = sx
      panner.positionY.value = sy
      panner.positionZ.value = sz

      panner.connect(destination)

      // Decode gain nodes (B-format channel → decode coefficient → sum → panner)
      const wGain = ctx.createGain()
      const xGain = ctx.createGain()
      const yGain = ctx.createGain()
      const zGain = ctx.createGain()
      const sumGain = ctx.createGain()
      sumGain.gain.value = 1

      this.busW.connect(wGain)
      this.busX.connect(xGain)
      this.busY.connect(yGain)
      this.busZ.connect(zGain)

      wGain.connect(sumGain)
      xGain.connect(sumGain)
      yGain.connect(sumGain)
      zGain.connect(sumGain)
      sumGain.connect(panner)

      // Initial decode coefficients (no rotation)
      wGain.gain.value  = G_W
      xGain.gain.value  = G_XYZ * Math.cos(az) * Math.cos(el)
      yGain.gain.value  = G_XYZ * Math.sin(az) * Math.cos(el)
      zGain.gain.value  = G_XYZ * Math.sin(el)

      this.speakers.push({ az, el, panner, wGain, xGain, yGain, zGain, sumGain })
    }
  }

  /**
   * Update the rotation applied to the soundfield.
   *
   * Strategy: Instead of rotating B-format channels (which requires cross-connects),
   * we rotate the speaker *directions* by the inverse rotation R^{-1} = R^T,
   * then recompute the decode coefficients. This is mathematically equivalent to
   * rotating the field by R: a listener turning right (yaw +θ) means the field
   * appears to rotate left (sources at −θ).
   *
   * @param yaw   — rotation around vertical axis, radians (right = +)
   * @param pitch — rotation around left-right axis, radians (up = +)
   * @param roll  — rotation around front-back axis, radians (right-side down = +)
   */
  setOrientation(yaw: number, pitch: number, roll: number) {
    // Build the inverse rotation matrix R^T (transpose = inverse for SO(3))
    // R = Ry(yaw) · Rx(pitch) · Rz(roll)
    // We apply R^T to each speaker direction to find where it should decode from.

    const cy = Math.cos(yaw),   sy = Math.sin(yaw)
    const cp = Math.cos(pitch), sp = Math.sin(pitch)
    const cr = Math.cos(roll),  sr = Math.sin(roll)

    // Combined rotation matrix R = Ry * Rx * Rz
    // (row-major, applied as column-vector right-multiply)
    const r00 =  cy*cr + sy*sp*sr
    const r01 = -cy*sr + sy*sp*cr
    const r02 =  sy*cp
    const r10 =  cp*sr
    const r11 =  cp*cr
    const r12 = -sp
    const r20 = -sy*cr + cy*sp*sr
    const r21 =  sy*sr + cy*sp*cr
    const r22 =  cy*cp

    // Transpose for the inverse
    // R^T: rows become columns
    const ri00 = r00; const ri01 = r10; const ri02 = r20
    const ri10 = r01; const ri11 = r11; const ri12 = r21
    const ri20 = r02; const ri21 = r12; const ri22 = r22

    for (const spk of this.speakers) {
      // Original speaker Cartesian direction
      const dx0 = Math.cos(spk.az) * Math.cos(spk.el)   // X (front-back in our convention)
      const dy0 = Math.sin(spk.az) * Math.cos(spk.el)   // Y (left-right)
      const dz0 = Math.sin(spk.el)                        // Z (up-down)

      // Rotated direction: d' = R^T · d
      const dx = ri00*dx0 + ri01*dy0 + ri02*dz0
      const dy = ri10*dx0 + ri11*dy0 + ri12*dz0
      const dz = ri20*dx0 + ri21*dy0 + ri22*dz0

      // Update decode coefficients
      // wGain: G_W (constant)
      // xGain: G_XYZ * dx  (X spherical harmonic = cos(az)cos(el))
      // yGain: G_XYZ * dy  (Y spherical harmonic = sin(az)cos(el))
      // zGain: G_XYZ * dz  (Z spherical harmonic = sin(el))
      spk.wGain.gain.setTargetAtTime(G_W,       this.ctx.currentTime, 0.02)
      spk.xGain.gain.setTargetAtTime(G_XYZ * dx, this.ctx.currentTime, 0.02)
      spk.yGain.gain.setTargetAtTime(G_XYZ * dy, this.ctx.currentTime, 0.02)
      spk.zGain.gain.setTargetAtTime(G_XYZ * dz, this.ctx.currentTime, 0.02)
    }
  }

  /**
   * Create encoder gain nodes for a source at (az, el).
   * Connect your source AudioNode to all four returned gain nodes.
   * Returns the 4 gain nodes (W, X, Y, Z bus inputs).
   *
   * The gains implement the SH encoding:
   *   W: 1/√2
   *   X: cos(az)·cos(el)
   *   Y: sin(az)·cos(el)
   *   Z: sin(el)
   */
  createEncoder(az: number, el: number): { wEnc: GainNode; xEnc: GainNode; yEnc: GainNode; zEnc: GainNode } {
    const wEnc = this.ctx.createGain()
    const xEnc = this.ctx.createGain()
    const yEnc = this.ctx.createGain()
    const zEnc = this.ctx.createGain()

    wEnc.gain.value = 1 / Math.SQRT2
    xEnc.gain.value = Math.cos(az) * Math.cos(el)
    yEnc.gain.value = Math.sin(az) * Math.cos(el)
    zEnc.gain.value = Math.sin(el)

    wEnc.connect(this.busW)
    xEnc.connect(this.busX)
    yEnc.connect(this.busY)
    zEnc.connect(this.busZ)

    return { wEnc, xEnc, yEnc, zEnc }
  }

  dispose() {
    for (const spk of this.speakers) {
      spk.wGain.disconnect()
      spk.xGain.disconnect()
      spk.yGain.disconnect()
      spk.zGain.disconnect()
      spk.sumGain.disconnect()
      spk.panner.disconnect()
    }
    this.busW.disconnect()
    this.busX.disconnect()
    this.busY.disconnect()
    this.busZ.disconnect()
    this.speakers = []
  }
}
