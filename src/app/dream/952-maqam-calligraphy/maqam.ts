// maqam.ts — Arabic maqam theory in EXACT cents (no 12-TET rounding).
//
// Pitch is the whole point. Every degree is a cents offset from the tonic.
// freq = tonicHz * 2^(cents/1200). Quarter-tones (~150, ~350) are first-class.

// ── Ajnas (tetrachords / trichords) ──────────────────────────────────────
// Each jins is an ascending interval set, in cents, relative to its OWN root.
// (The root cents-from-tonic is supplied when the jins is placed in a maqam.)

export type JinsName =
  | "Rast"
  | "Bayati"
  | "Hijaz"
  | "Nahawand"
  | "Kurd"
  | "Saba"
  | "Ajam"
  | "Sikah";

export interface Jins {
  name: JinsName;
  // hue used for tinting the stroke + guide-lines (warm, ink-and-gold palette)
  hue: number;
  // ascending degrees within the jins, in cents from the jins root
  degrees: number[];
}

export const AJNAS: Record<JinsName, Jins> = {
  Rast: { name: "Rast", hue: 42, degrees: [0, 200, 350, 500] }, // neutral 3rd ≈350
  Bayati: { name: "Bayati", hue: 28, degrees: [0, 150, 300, 500] }, // neutral 2nd ≈150
  Hijaz: { name: "Hijaz", hue: 14, degrees: [0, 100, 400, 500] }, // aug-2nd gap 100→400
  Nahawand: { name: "Nahawand", hue: 200, degrees: [0, 200, 300, 500] }, // minor-ish
  Kurd: { name: "Kurd", hue: 220, degrees: [0, 100, 300, 500] }, // phrygian-ish
  Saba: { name: "Saba", hue: 320, degrees: [0, 150, 300, 400] }, // lowered 4th (uneasy)
  Ajam: { name: "Ajam", hue: 50, degrees: [0, 200, 400, 500] }, // major tetrachord
  Sikah: { name: "Sikah", hue: 36, degrees: [0, 150, 350] }, // trichord, rooted on 350
};

// ── Maqamat = lower jins on the tonic + upper jins on the ghammaz ─────────
// ghammaz is the pivot, the 4th (500c) or 5th (700c).

export interface MaqamDef {
  name: string;
  lower: JinsName;
  upper: JinsName;
  ghammaz: number; // cents where the upper jins is rooted (500 or 700)
}

export const MAQAMAT: Record<string, MaqamDef> = {
  Rast: { name: "Rast", lower: "Rast", upper: "Rast", ghammaz: 700 },
  Bayati: { name: "Bayati", lower: "Bayati", upper: "Nahawand", ghammaz: 500 },
  Hijaz: { name: "Hijaz", lower: "Hijaz", upper: "Rast", ghammaz: 500 },
  Saba: { name: "Saba", lower: "Saba", upper: "Hijaz", ghammaz: 300 },
  Nahawand: { name: "Nahawand", lower: "Nahawand", upper: "Hijaz", ghammaz: 700 },
};

export type MaqamName = keyof typeof MAQAMAT;

// Adjacency: which maqamat a taqsim customarily modulates between.
// Bayati ↔ Rast ↔ Saba ↔ Nahawand ↔ Hijaz
export const ADJACENCY: Record<MaqamName, MaqamName[]> = {
  Rast: ["Bayati", "Saba", "Nahawand", "Hijaz"],
  Bayati: ["Rast", "Saba", "Nahawand"],
  Hijaz: ["Rast", "Nahawand"],
  Saba: ["Rast", "Bayati", "Nahawand"],
  Nahawand: ["Rast", "Hijaz", "Saba", "Bayati"],
};

// A placed degree: an absolute cents value + which jins region it belongs to.
export interface ScaleDegree {
  cents: number;
  jins: JinsName;
  // role within the maqam — used to weight phrase targets + stroke emphasis
  role: "tonic" | "ghammaz" | "neutral" | "rest" | "ordinary";
}

// Expand a maqam definition into an absolute cents scale across the working
// register (roughly -200 .. +1400 cents around the tonic — low rest to high peak).
export function buildScale(def: MaqamDef): ScaleDegree[] {
  const out: ScaleDegree[] = [];
  const lower = AJNAS[def.lower];
  const upper = AJNAS[def.upper];

  const pushJins = (jins: Jins, root: number) => {
    jins.degrees.forEach((d, i) => {
      const cents = root + d;
      let role: ScaleDegree["role"] = "ordinary";
      if (cents === 0) role = "tonic";
      else if (cents === def.ghammaz) role = "ghammaz";
      else if (isNeutral(d)) role = "neutral";
      else if (i === 0 || i === jins.degrees.length - 1) role = "rest";
      out.push({ cents, jins: jins.name, role });
    });
  };

  // lower jins on the tonic
  pushJins(lower, 0);
  // upper jins on the ghammaz
  pushJins(upper, def.ghammaz);
  // extend one octave up so the peak register has somewhere to climb
  pushJins(lower, 1200);

  // a low neighbour below the tonic (the qarar leaning tone)
  out.unshift({ cents: -200, jins: def.lower, role: "rest" });

  // dedupe by cents, keep first (lower-jins) role
  const seen = new Set<number>();
  const deduped: ScaleDegree[] = [];
  for (const d of out.sort((a, b) => a.cents - b.cents)) {
    if (seen.has(d.cents)) continue;
    seen.add(d.cents);
    deduped.push(d);
  }
  return deduped;
}

// A "neutral" interval is a quarter-tone-ish step (≈150 or ≈350 within a jins).
function isNeutral(centsWithinJins: number): boolean {
  return centsWithinJins === 150 || centsWithinJins === 350;
}

export function centsToFreq(tonicHz: number, cents: number): number {
  return tonicHz * Math.pow(2, cents / 1200);
}

// The customary 12-TET ghost grid (semitone lines) for the visual contrast.
export const TET_LINES: number[] = (() => {
  const arr: number[] = [];
  for (let c = -200; c <= 1400; c += 100) arr.push(c);
  return arr;
})();
