// 2952-tabla — rng.ts
// mulberry32 seeded PRNG + a deterministic tabla-esque autopilot so the page is
// ALIVE (playing itself) at a silent 06:30 phone review before anyone touches
// it. The pattern is a loose theka of bols — dha / dhin / tin / ta — placed at
// different radii (rim = bright 'na', centre = deep 'ge'), with occasional
// palm-press pitch glides ('ga').

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrikeEvent {
  kind: "strike";
  x: number;
  y: number;
  vel: number;
  width: number;
}
export interface PressEvent {
  kind: "press";
  x: number;
  y: number;
  amount: number;
  radius: number;
}
export interface ReleaseEvent {
  kind: "release";
}
export type AutoEvent = StrikeEvent | PressEvent | ReleaseEvent;

export interface Autopilot {
  step: (dtMs: number) => AutoEvent[];
}

// A 16-step theka. "-" = rest. "dha"/"dhin" are compound (rim + centre).
const PATTERN: string[] = [
  "dha", "-", "dhin", "-", "dhin", "-", "dha", "-",
  "dha", "-", "tin", "-", "ta", "-", "dhin", "-",
];

const STEP_MS = 150; // ~100 bpm, 16ths → a 2.4 s cycle

/** rim-width → smaller (brighter partials) toward the rim. */
function widthForRadius(r: number): number {
  return 3.2 - 2.2 * Math.min(1, r);
}

export function makeAutopilot(seed: number): Autopilot {
  const rand = mulberry32(seed);
  let clock = 0;
  let lastStep = -1;
  const bend = { active: false, t: 0, x: 0, y: 0 };

  function place(r: number): { x: number; y: number } {
    const a = rand() * Math.PI * 2;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }

  function strikeAt(r: number, vel: number, out: AutoEvent[]): { x: number; y: number } {
    const p = place(r);
    out.push({
      kind: "strike",
      x: p.x,
      y: p.y,
      vel: vel * (0.8 + 0.4 * rand()),
      width: widthForRadius(r),
    });
    return p;
  }

  function startBend(p: { x: number; y: number }): void {
    bend.active = true;
    bend.t = 0;
    bend.x = p.x;
    bend.y = p.y;
  }

  function emit(bol: string, out: AutoEvent[]): void {
    switch (bol) {
      case "dha": {
        strikeAt(0.9, 0.62, out); // 'na' rim ring
        const g = strikeAt(0.16, 0.95, out); // 'ge' resonant centre
        if (rand() < 0.4) startBend(g); // 'ga' glide
        break;
      }
      case "dhin": {
        strikeAt(0.85, 0.55, out);
        const g = strikeAt(0.2, 0.85, out);
        if (rand() < 0.55) startBend(g);
        break;
      }
      case "tin":
        strikeAt(0.55, 0.55, out);
        break;
      case "ta":
        strikeAt(0.92, 0.6, out);
        break;
      default:
        break;
    }
  }

  return {
    step(dtMs: number): AutoEvent[] {
      const out: AutoEvent[] = [];
      clock += dtMs;
      const cycle = PATTERN.length * STEP_MS;
      const idx = Math.floor((clock % cycle) / STEP_MS);
      if (idx !== lastStep) {
        lastStep = idx;
        const bol = PATTERN[idx];
        if (bol !== "-") emit(bol, out);
      }
      if (bend.active) {
        bend.t += dtMs;
        if (bend.t < 380) {
          const amount = Math.min(1, bend.t / 260) * 0.92;
          out.push({ kind: "press", x: bend.x, y: bend.y, amount, radius: 0.3 });
        } else {
          out.push({ kind: "release" });
          bend.active = false;
        }
      }
      return out;
    },
  };
}
