/**
 * sim.ts — CPU MLS-MPM granular sand simulation (fallback path)
 *
 * Implements a simplified Moving Least Squares Material Point Method
 * (APIC / MLS-MPM) for granular material (sand) following Hu et al. 2018
 * and the "mpm88" / "mpm99" taichi reference implementations.
 *
 * Grid: GRID × GRID cells (64×64 by default)
 * Particles: ~2000 grains
 *
 * Physics highlights:
 *   - Affine-momentum (APIC) C-matrix: each particle carries an affine velocity field
 *   - Drucker-Prager plasticity: yields on shear, piles at angle of repose, avalanches
 *   - Boundary condition: sticky floor, slip walls
 *   - Gravity vector is external and can be rotated to "tip" the world
 *
 * References:
 *   Hu, Fang, Ge, Qu, Stomakhin, Jiang — "A Moving Least Squares Material
 *   Point Method with Displacement Discontinuity and Fracture" (SIGGRAPH 2018)
 *   taichi mpm88 / mpm99 reference code
 */

export const GRID = 64;
export const N_PARTICLES = 2000;
const DT = 1 / 120; // simulation timestep
const DX = 1.0 / GRID;
const INV_DX = GRID;
const PARTICLE_MASS = 1.0;
const VOL = 0.5 * DX * DX; // 2D volume per particle
const E = 400; // Young's modulus (stiffness)
const NU = 0.2; // Poisson ratio
const MU0 = E / (2 * (1 + NU));
const LAMBDA0 = (E * NU) / ((1 + NU) * (1 - 2 * NU));

// Drucker-Prager friction angle (determines angle of repose ~30°)
const SIN_PHI = Math.sin((30 * Math.PI) / 180);
const ALPHA_DP = Math.SQRT2 * SIN_PHI / Math.sqrt(3 - SIN_PHI * SIN_PHI);

export interface Particle {
  x: number; // position x [0,1]
  y: number; // position y [0,1]
  vx: number; // velocity x
  vy: number; // velocity y
  // 2×2 deformation gradient (F), stored as [Fxx, Fxy, Fyx, Fyy]
  F: [number, number, number, number];
  // APIC affine matrix C (2×2): [Cxx, Cxy, Cyx, Cyy]
  C: [number, number, number, number];
  // Jacobian determinant (volume change)
  Jp: number;
}

// Grid nodes (flattened 2D array)
const gridVx = new Float32Array(GRID * GRID);
const gridVy = new Float32Array(GRID * GRID);
const gridMass = new Float32Array(GRID * GRID);

/** Initialise a dune pile: particles stacked in a mound in the lower-centre */
export function initParticles(): Particle[] {
  const particles: Particle[] = [];

  // Create a natural dune heap: broad base, tapers upward
  const cx = 0.5;

  for (let i = 0; i < N_PARTICLES; i++) {
    // Layer particles in a triangular mound profile
    const t = i / N_PARTICLES;
    // Horizontal spread decreases with height layer
    const layer = Math.floor(t * 30); // ~30 horizontal rows
    const layerT = t * 30 - layer; // position within layer 0..1
    const halfW = 0.22 * (1 - layer / 30) + 0.01;
    const px = cx + (layerT - 0.5) * 2 * halfW + (Math.random() - 0.5) * 0.008;
    const py = 0.06 + (layer / 30) * 0.38 + (Math.random() - 0.5) * 0.008;

    particles.push({
      x: Math.max(0.02, Math.min(0.98, px)),
      y: Math.max(0.02, Math.min(0.95, py)),
      vx: 0,
      vy: 0,
      F: [1, 0, 0, 1],
      C: [0, 0, 0, 0],
      Jp: 1,
    });
  }

  return particles;
}

/** 2D polar decomposition: returns R (rotation part) */
function polarDecomp2(
  F: [number, number, number, number]
): [number, number, number, number] {
  const [a, , c, d] = F;
  // Analytic 2×2 polar decomposition
  const x = a + d;
  const y = c - F[1]; // F[1] = b
  const scale = Math.sqrt(x * x + y * y);
  const cos = scale < 1e-8 ? 1 : x / scale;
  const sin = scale < 1e-8 ? 0 : y / scale;

  return [cos, -sin, sin, cos];
}

/** Clamp singular values for Drucker-Prager granular plasticity */
function applyDruckerPrager(
  F: [number, number, number, number],
  Jp: number
): { Fp: [number, number, number, number]; Jp: number } {
  // For 2D, approximate SVD via polar decomp then clamp
  const R = polarDecomp2(F);

  // Compute strain e = log(singular values) via trace approach (simplified)
  // For a quick but reasonable sand plasticity:
  // trace of log(F) = log(det(F)) = log(Jp_current)
  const [a, b, c, d] = F;
  const detF = a * d - b * c;
  const logDetF = Math.log(Math.max(1e-6, Math.abs(detF)));

  // Frobenius norm of F - I gives shear strain
  const shear = Math.sqrt(
    (a - 1) * (a - 1) + b * b + c * c + (d - 1) * (d - 1)
  );

  // Drucker-Prager yield: if shear strain exceeds volumetric * alpha, plastically correct
  const vol = logDetF;
  const yield_ = shear + ALPHA_DP * vol;

  if (yield_ > 0 && vol < 0) {
    // Project back to yield surface: scale F toward rotation R
    // (the simplified approach: reduce deviatoric part)
    const scale = 1 - Math.min(0.3, yield_ * 0.15);
    const Fp: [number, number, number, number] = [
      R[0] + (a - R[0]) * scale,
      R[1] + (b - R[1]) * scale,
      R[2] + (c - R[2]) * scale,
      R[3] + (d - R[3]) * scale,
    ];
    return { Fp, Jp: Jp * Math.max(0.95, 1 - yield_ * 0.05) };
  }

  return { Fp: F, Jp };
}

/**
 * Quadratic B-spline weights for MLS-MPM (mpm88 convention).
 * d = particle_pos * inv_dx - base_node_index, d ∈ [0.5, 1.5]
 * Returns [w0, w1, w2] for nodes at base, base+1, base+2.
 */
function buildWeights(
  xp: number,
  baseIdx: number
): [number, number, number] {
  const d = xp * INV_DX - baseIdx; // in [0.5, 1.5]
  const w0 = 0.5 * (1.5 - d) * (1.5 - d);   // node at baseIdx
  const w1 = 0.75 - (d - 1) * (d - 1);       // node at baseIdx+1
  const w2 = 0.5 * (d - 0.5) * (d - 0.5);   // node at baseIdx+2
  return [w0, w1, w2];
}

/** One MPM step: P2G → grid update → G2P */
export function stepMPM(
  particles: Particle[],
  gravX: number,
  gravY: number,
  substeps = 4
): { kineticEnergy: number; shearRate: number; avalanchePulse: number } {
  let totalKE = 0;
  let totalShear = 0;
  let maxAvalanche = 0;

  for (let sub = 0; sub < substeps; sub++) {
    // ── Clear grid ─────────────────────────────────────────────────────────
    gridVx.fill(0);
    gridVy.fill(0);
    gridMass.fill(0);

    // ── P2G scatter ────────────────────────────────────────────────────────
    for (const p of particles) {
      const ix = Math.floor(p.x * INV_DX - 0.5);
      const iy = Math.floor(p.y * INV_DX - 0.5);

      const wx = buildWeights(p.x, ix);
      const wy = buildWeights(p.y, iy);

      // Neo-Hookean stress: P = mu*(F - R) + lambda*log(J)*F^{-T}
      const [a, b, c, d] = p.F;
      const J = Math.max(0.2, a * d - b * c);

      // Cauchy stress approximation (simplified for granular)
      const mu = MU0;
      const lam = LAMBDA0;
      const logJ = Math.log(J);

      // P = 2*mu*(F-I) + lam*log(J)*I (simplified neo-Hookean for sand)
      const Pxx = 2 * mu * (a - 1) + lam * logJ;
      const Pxy = 2 * mu * b;
      const Pyx = 2 * mu * c;
      const Pyy = 2 * mu * (d - 1) + lam * logJ;

      const stress_scale = -DT * VOL * 4 * INV_DX * INV_DX;
      const Kxx = stress_scale * Pxx;
      const Kxy = stress_scale * Pxy;
      const Kyx = stress_scale * Pyx;
      const Kyy = stress_scale * Pyy;

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const ni = ix + i;
          const nj = iy + j;
          if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;

          const w = wx[i] * wy[j];
          const gIdx = nj * GRID + ni;

          const dx = (ni - p.x * INV_DX) * DX;
          const dy = (nj - p.y * INV_DX) * DX;

          const mass_w = PARTICLE_MASS * w;
          gridMass[gIdx] += mass_w;

          // APIC momentum: mv + mass*(C*dpos) + stress*dpos
          const affineFx = p.C[0] * dx + p.C[1] * dy;
          const affineFy = p.C[2] * dx + p.C[3] * dy;

          gridVx[gIdx] += mass_w * (p.vx + affineFx) + w * (Kxx * dx + Kxy * dy);
          gridVy[gIdx] += mass_w * (p.vy + affineFy) + w * (Kyx * dx + Kyy * dy);
        }
      }
    }

    // ── Grid velocity update (gravity + boundary) ──────────────────────────
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const idx = j * GRID + i;
        const m = gridMass[idx];
        if (m < 1e-10) continue;

        // Normalise to velocity
        let vx = gridVx[idx] / m;
        let vy = gridVy[idx] / m;

        // Apply gravity
        vx += gravX * DT * 80;
        vy += gravY * DT * 80;

        // Boundary conditions: sticky walls
        const margin = 2;
        if (i < margin) vx = Math.max(0, vx);
        if (i >= GRID - margin) vx = Math.min(0, vx);
        if (j < margin) vy = Math.max(0, vy);
        if (j >= GRID - margin) vy = Math.min(0, vy);

        gridVx[idx] = vx;
        gridVy[idx] = vy;
      }
    }

    // ── G2P gather ────────────────────────────────────────────────────────
    for (const p of particles) {
      const ix = Math.floor(p.x * INV_DX - 0.5);
      const iy = Math.floor(p.y * INV_DX - 0.5);

      const wx = buildWeights(p.x, ix);
      const wy = buildWeights(p.y, iy);

      let newVx = 0;
      let newVy = 0;
      let newCxx = 0;
      let newCxy = 0;
      let newCyx = 0;
      let newCyy = 0;

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const ni = ix + i;
          const nj = iy + j;
          if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;

          const w = wx[i] * wy[j];
          const gIdx = nj * GRID + ni;
          const gvx = gridVx[gIdx];
          const gvy = gridVy[gIdx];

          newVx += w * gvx;
          newVy += w * gvy;

          const dx = (ni - p.x * INV_DX) * DX;
          const dy = (nj - p.y * INV_DX) * DX;

          // APIC C matrix update (affine velocity gradient)
          const sc = 4 * INV_DX * INV_DX * w;
          newCxx += sc * gvx * dx;
          newCxy += sc * gvx * dy;
          newCyx += sc * gvy * dx;
          newCyy += sc * gvy * dy;
        }
      }

      p.vx = newVx;
      p.vy = newVy;
      p.C = [newCxx, newCxy, newCyx, newCyy];

      // Advect position
      p.x = Math.max(0.01, Math.min(0.99, p.x + newVx * DT));
      p.y = Math.max(0.01, Math.min(0.99, p.y + newVy * DT));

      // Update deformation gradient: F_new = (I + dt*C) * F
      const [Fxx, Fxy, Fyx, Fyy] = p.F;
      const Ixx = 1 + DT * newCxx;
      const Ixy = DT * newCxy;
      const Iyx = DT * newCyx;
      const Iyy = 1 + DT * newCyy;

      const newFxx = Ixx * Fxx + Ixy * Fyx;
      const newFxy = Ixx * Fxy + Ixy * Fyy;
      const newFyx = Iyx * Fxx + Iyy * Fyx;
      const newFyy = Iyx * Fxy + Iyy * Fyy;

      const F_candidate: [number, number, number, number] = [newFxx, newFxy, newFyx, newFyy];
      const { Fp, Jp } = applyDruckerPrager(F_candidate, p.Jp);
      p.F = Fp;
      p.Jp = Jp;

      // Track per-particle speed for audio
      const speed2 = newVx * newVx + newVy * newVy;
      totalKE += speed2;
      const shearMag = Math.sqrt(newCxy * newCxy + newCyx * newCyx);
      totalShear += shearMag;

      // Avalanche = sudden increase in velocity
      if (speed2 > 0.8) maxAvalanche = Math.max(maxAvalanche, Math.sqrt(speed2) - 0.89);
    }
  }

  const norm = 1 / N_PARTICLES;
  const ke = Math.min(1, totalKE * norm * 0.6);
  const shear = Math.min(1, totalShear * norm * 4);

  return {
    kineticEnergy: ke,
    shearRate: shear,
    avalanchePulse: Math.min(1, maxAvalanche * 0.5),
  };
}
