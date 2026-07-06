// fhn.ts — FitzHugh–Nagumo excitable medium on the icosphere.
//
// Each vertex carries an excitation variable u (fast, "voltage") and a recovery
// variable v (slow, "refractoriness"). We integrate the Barkley reduction of
// the FitzHugh–Nagumo model — the numerically robust member of the FHN family
// that reliably supports spiral waves — coupled diffusively along the mesh
// edges so depolarisation fronts sweep across the curved surface.
//
//   du/dt = D·∇²u + (1/ε)·u·(1−u)·(u − (v + b)/a)
//   dv/dt = u − v
//
// The graph Laplacian ∇²u ≈ mean(neighbours) − u. b is the excitation
// threshold / refractory knob: high b -> waves fail (calm/dissolution),
// low b -> spiral tips destabilise into multi-wavelet chaos (fibrillation).
//
// References: FitzHugh (1961); Nagumo, Arimoto & Yoshizawa (1962);
// Barkley (1991); reentry & spiral waves — Winfree.

import type { IcoSphere } from "./mesh"

const A = 0.75 // plateau / excitation gain
const EPS = 0.02 // timescale separation (slow recovery)
const D = 0.9 // diffusive coupling strength
const DT = 0.022 // integration step (model time)

export class FhnMedium {
  readonly mesh: IcoSphere
  readonly count: number
  u: Float32Array
  v: Float32Array
  private uNext: Float32Array
  /** Slowly-decaying memory of recent excitation — the faint refractory "scar". */
  scar: Float32Array
  /** Small fixed per-vertex heterogeneity so the medium never loops identically. */
  private hetero: Float32Array

  /** Excitation threshold b, driven by the arc / conductor (calm <-> fibrillation). */
  b = 0.08

  constructor(mesh: IcoSphere) {
    this.mesh = mesh
    this.count = mesh.count
    this.u = new Float32Array(this.count)
    this.v = new Float32Array(this.count)
    this.uNext = new Float32Array(this.count)
    this.scar = new Float32Array(this.count)
    this.hetero = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      this.hetero[i] = (Math.random() - 0.5) * 0.06
    }
  }

  /** Deposit a supra-threshold stimulus at a vertex and its neighbourhood. */
  stimulate(vertex: number, radius = 1, strength = 1) {
    const { neighbourStart, neighbourList } = this.mesh
    const visit = (idx: number) => {
      this.u[idx] = Math.min(1, this.u[idx] + strength)
    }
    visit(vertex)
    if (radius >= 1) {
      for (let k = neighbourStart[vertex]; k < neighbourStart[vertex + 1]; k++) {
        const j = neighbourList[k]
        visit(j)
        if (radius >= 2) {
          for (let m = neighbourStart[j]; m < neighbourStart[j + 1]; m++) visit(neighbourList[m])
        }
      }
    }
  }

  /**
   * Seed a reentrant rotor via the classic cross-field initial condition:
   * one hemisphere excited (a wave front) crossed with a perpendicular recovery
   * gradient. The free end of the broken front curls into a sustained spiral
   * that wraps the sphere — genuine reentry, not a scripted animation.
   * `axis`/`grad` are orthonormal directions, randomised per seeding for variety.
   */
  seedRotor(axis: [number, number, number], grad: [number, number, number]) {
    const { positions, count } = this.mesh
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]
      const along = x * axis[0] + y * axis[1] + z * axis[2]
      const perp = x * grad[0] + y * grad[1] + z * grad[2]
      this.u[i] = along > 0 ? 1 : 0
      this.v[i] = Math.max(0, (perp * 0.5 + 0.5)) * A * 0.9
    }
  }

  /** Reset the medium to quiescent rest. */
  clearField() {
    this.u.fill(0)
    this.v.fill(0)
  }

  /** Advance `substeps` explicit-Euler steps. Returns nothing; mutates u/v/scar. */
  step(substeps = 8) {
    const { neighbourStart, neighbourList } = this.mesh
    const { u, v, uNext, hetero } = this
    const count = this.count
    for (let s = 0; s < substeps; s++) {
      for (let i = 0; i < count; i++) {
        const ui = u[i]
        const start = neighbourStart[i]
        const end = neighbourStart[i + 1]
        let sum = 0
        for (let k = start; k < end; k++) sum += u[neighbourList[k]]
        const lap = sum / (end - start) - ui
        const bi = this.b + hetero[i]
        const reaction = (1 / EPS) * ui * (1 - ui) * (ui - (v[i] + bi) / A)
        let un = ui + DT * (D * lap + reaction)
        if (un < 0) un = 0
        else if (un > 1) un = 1
        uNext[i] = un
      }
      // recovery + swap
      for (let i = 0; i < count; i++) {
        v[i] += DT * (uNext[i] - v[i])
        u[i] = uNext[i]
      }
    }
    // Scar memory: rises where excited, decays slowly elsewhere.
    const scar = this.scar
    for (let i = 0; i < count; i++) {
      const target = u[i]
      scar[i] = scar[i] > target ? scar[i] * 0.985 : scar[i] + (target - scar[i]) * 0.25
    }
  }
}
