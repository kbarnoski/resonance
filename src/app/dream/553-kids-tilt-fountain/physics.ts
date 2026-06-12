// physics.ts — Simple Euler orb physics with tilt-controlled gravity

export interface Orb {
  id: number;
  x: number; // world units (roughly metres)
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  // visual state
  color: number; // THREE color hex
  radius: number;
  flash: number; // 0..1, decays after zone-hit
  age: number;
  // which zone this orb last triggered (to avoid re-triggering same zone every frame)
  lastZoneHit: number;
  lastZoneHitTime: number;
  alive: boolean;
}

export interface GravityState {
  gx: number; // m/s² lateral
  gy: number; // m/s² vertical (positive = down)
  gz: number; // m/s² depth
}

// Smooth EMA for tilt gravity
export function smoothGravity(
  current: GravityState,
  target: GravityState,
  alpha: number // 0..1, bigger = more responsive
): GravityState {
  return {
    gx: current.gx + alpha * (target.gx - current.gx),
    gy: current.gy + alpha * (target.gy - current.gy),
    gz: current.gz + alpha * (target.gz - current.gz),
  };
}

// Update all orbs one timestep
export function stepOrbs(
  orbs: Orb[],
  gravity: GravityState,
  dt: number,
  worldW: number,
  worldH: number,
  worldD: number
): void {
  const DRAG = 0.985; // slight drag to prevent infinite acceleration
  const RESTITUTION = 0.45;
  const FLOOR_Y = -worldH / 2;
  const CEIL_Y = worldH / 2;
  const LEFT_X = -worldW / 2;
  const RIGHT_X = worldW / 2;
  const FRONT_Z = worldD / 2;
  const BACK_Z = -worldD / 2;

  for (const orb of orbs) {
    if (!orb.alive) continue;
    orb.age += dt;

    // Euler integration
    orb.vx = (orb.vx + gravity.gx * dt) * DRAG;
    orb.vy = (orb.vy - gravity.gy * dt) * DRAG; // gy positive = down in world = -y
    orb.vz = (orb.vz + gravity.gz * dt) * DRAG;

    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.z += orb.vz * dt;

    // Decay flash
    orb.flash = Math.max(0, orb.flash - dt * 3.5);

    // Boundary collisions — kill old ones that fall past the floor
    if (orb.y < FLOOR_Y) {
      if (orb.age > 4.0) {
        orb.alive = false;
        continue;
      }
      orb.y = FLOOR_Y + orb.radius;
      orb.vy = Math.abs(orb.vy) * RESTITUTION;
    }
    if (orb.y > CEIL_Y) {
      orb.y = CEIL_Y - orb.radius;
      orb.vy = -(Math.abs(orb.vy) * RESTITUTION);
    }
    if (orb.x < LEFT_X) {
      orb.x = LEFT_X + orb.radius;
      orb.vx = Math.abs(orb.vx) * RESTITUTION;
    }
    if (orb.x > RIGHT_X) {
      orb.x = RIGHT_X - orb.radius;
      orb.vx = -(Math.abs(orb.vx) * RESTITUTION);
    }
    if (orb.z < BACK_Z) {
      orb.z = BACK_Z + orb.radius;
      orb.vz = Math.abs(orb.vz) * RESTITUTION;
    }
    if (orb.z > FRONT_Z) {
      orb.z = FRONT_Z - orb.radius;
      orb.vz = -(Math.abs(orb.vz) * RESTITUTION);
    }

    // Retire very old orbs regardless
    if (orb.age > 12.0) {
      orb.alive = false;
    }
  }
}

// ORB_COLORS: warm, playful kid-safe palette
export const ORB_COLORS = [
  0xff6b9d, // pink
  0xffbe0b, // golden yellow
  0x06d6a0, // teal green
  0x74b9ff, // sky blue
  0xff9a3c, // warm orange
  0xc084fc, // violet
  0x67e8f9, // cyan
  0xffd166, // butter yellow
];

let _orbId = 0;

export function makeOrb(
  x: number,
  y: number,
  z: number,
  colorIdx: number
): Orb {
  return {
    id: _orbId++,
    x,
    y,
    z,
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0,
    vz: (Math.random() - 0.5) * 0.5,
    color: ORB_COLORS[colorIdx % ORB_COLORS.length],
    radius: 0.09 + Math.random() * 0.04,
    flash: 0,
    age: 0,
    lastZoneHit: -1,
    lastZoneHitTime: -999,
    alive: true,
  };
}

// Zone definition — axis-aligned box in world coords
export interface Zone {
  idx: number;
  cx: number; // center x
  cy: number; // center y
  cz: number; // center z
  hw: number; // half-width (x)
  hh: number; // half-height (y)
  hd: number; // half-depth (z)
  color: number;
  timbre: "bell" | "string" | "chime" | "marimba";
  flashStrength: number; // 0..1 decays
}

export function orbInZone(orb: Orb, zone: Zone): boolean {
  return (
    orb.x >= zone.cx - zone.hw &&
    orb.x <= zone.cx + zone.hw &&
    orb.y >= zone.cy - zone.hh &&
    orb.y <= zone.cy + zone.hh &&
    orb.z >= zone.cz - zone.hd &&
    orb.z <= zone.cz + zone.hd
  );
}

// Returns normalized x position within zone (0..1)
export function orbZoneXNorm(orb: Orb, zone: Zone): number {
  return Math.max(0, Math.min(1, (orb.x - (zone.cx - zone.hw)) / (zone.hw * 2)));
}
