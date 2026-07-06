// arc.ts — the long-form ARC state machine that turns Karel's short recording
// into a slow almanac of the hours. It holds continuous memory (`elapsed`) and
// drives every granular parameter through eight named canonical hours, so the
// texture at minute 5 is genuinely not the texture at minute 1. This is NOT a
// loop: the read-head crawls, the day drifts a little every cycle, and the
// controller interpolates smoothly between hour targets.

export interface HourDef {
  key: string;
  name: string; // canonical hour, e.g. "Matins"
  gloss: string; // plain-language time of day
  caption: string; // drifting almanac text for this hour
  density: number; // grain spawns per second
  grainDur: number; // seconds per grain window
  spread: number; // transposition spread in semitones
  register: number; // transposition centre in semitones (0 = source pitch)
  layers: number; // concurrent grains per spawn
  readRate: number; // corpus read speed (<1 = time-stretch)
  brightness: number; // 0..1 → low-pass openness
  gain: number; // 0..1 hour loudness
}

// One slow day, structured as the Liturgy of the Hours (canonical hours).
export const HOURS: HourDef[] = [
  {
    key: "matins",
    name: "Matins",
    gloss: "deep night, before first light",
    caption:
      "Matins. The house is asleep and the piano remembers itself in the dark — low, sparse, a single grain at a time drifting up from beneath.",
    density: 1.6, grainDur: 0.30, spread: 3, register: -12, layers: 1, readRate: 0.10, brightness: 0.26, gain: 0.52,
  },
  {
    key: "lauds",
    name: "Lauds",
    gloss: "first light, dawn",
    caption:
      "Lauds. Cream and peach seep over the sill. Grains gather in twos; the register lifts a fifth as the day draws its first slow breath.",
    density: 3.0, grainDur: 0.21, spread: 5, register: -7, layers: 2, readRate: 0.14, brightness: 0.44, gain: 0.70,
  },
  {
    key: "prime",
    name: "Prime",
    gloss: "early morning",
    caption:
      "Prime. Pale gold. The stretch quickens, the cloud of grains thickens and warms — the first busy hour of the working light.",
    density: 4.6, grainDur: 0.16, spread: 7, register: -3, layers: 2, readRate: 0.18, brightness: 0.57, gain: 0.80,
  },
  {
    key: "terce",
    name: "Terce",
    gloss: "mid-morning",
    caption:
      "Terce. The air goes green-blue and clear. Three voices at once now, spread wide across the keyboard, bright and moving.",
    density: 6.4, grainDur: 0.13, spread: 9, register: 0, layers: 3, readRate: 0.22, brightness: 0.70, gain: 0.90,
  },
  {
    key: "sext",
    name: "Sext",
    gloss: "midday, the sun at its height",
    caption:
      "Sext. Pale noon blue at full flood — the densest, brightest hour. Grains rise a bright third above the source and shimmer at the top of the dial.",
    density: 8.6, grainDur: 0.11, spread: 12, register: 4, layers: 3, readRate: 0.26, brightness: 0.84, gain: 1.0,
  },
  {
    key: "none",
    name: "None",
    gloss: "mid-afternoon, the light warming",
    caption:
      "None. The blue warms back to amber. The cloud settles a little, unhurried — the long, golden descent of the afternoon begins.",
    density: 6.0, grainDur: 0.15, spread: 9, register: 2, layers: 3, readRate: 0.20, brightness: 0.66, gain: 0.86,
  },
  {
    key: "vespers",
    name: "Vespers",
    gloss: "evening, dusk",
    caption:
      "Vespers. Dusty rose along the horizon. Voices thin to two, the register sinks, the grains lengthen and soften toward rest.",
    density: 3.6, grainDur: 0.21, spread: 6, register: -3, layers: 2, readRate: 0.14, brightness: 0.46, gain: 0.70,
  },
  {
    key: "compline",
    name: "Compline",
    gloss: "night, the last hour",
    caption:
      "Compline. Lavender dusk into dark. One low grain at a time, long and slow — the day is laid down, and Matins waits on the far side.",
    density: 1.8, grainDur: 0.32, spread: 3, register: -10, layers: 1, readRate: 0.10, brightness: 0.28, gain: 0.54,
  },
];

export const HOUR_SECONDS = 46; // each hour lasts ~46s
export const DAY_SECONDS = HOUR_SECONDS * HOURS.length; // ~368s ≈ 6.1 min per day

// Live parameter set handed to the granular engine each frame.
export interface ArcLive {
  density: number;
  grainDur: number;
  spread: number;
  register: number;
  layers: number;
  readRate: number;
  brightness: number;
  gain: number;
}

// Full per-frame state, including display + one-shot events.
export interface ArcState extends ArcLive {
  elapsed: number;
  day: number;
  dayFraction: number; // 0..1 around the dial
  hourIndex: number;
  hourName: string;
  hourGloss: string;
  caption: string;
  hourChanged: boolean; // just crossed into a new hour → ring the hour
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Small deterministic per-day drift so each new day is a variation, not a
// hard repeat — the piece keeps evolving past the 5-minute mark forever.
function dayDrift(day: number): { reg: number; spread: number; read: number } {
  const s = Math.sin(day * 12.9898) * 43758.5453;
  const r = s - Math.floor(s);
  const s2 = Math.sin((day + 1) * 78.233) * 12543.213;
  const r2 = s2 - Math.floor(s2);
  return {
    reg: (r - 0.5) * 4, // ±2 semitones
    spread: (r2 - 0.5) * 3, // ±1.5 semitones
    read: (r - 0.5) * 0.05, // ±0.025 stretch
  };
}

export class ArcController {
  private elapsed = 0;
  private lastHourIndex = -1;
  private lastDay = 0;
  // -1 = lighten (higher/brighter/sparser), +1 = deepen (lower/darker/denser)
  deepen = 0;

  reset(): void {
    this.elapsed = 0;
    this.lastHourIndex = -1;
    this.lastDay = 0;
  }

  // Skip to a fraction (0..1) of the current day — dragging the sun on the dial.
  seek(fraction: number): void {
    const f = ((fraction % 1) + 1) % 1;
    const dayStart = Math.floor(this.elapsed / DAY_SECONDS) * DAY_SECONDS;
    this.elapsed = dayStart + f * DAY_SECONDS;
    // Re-arm event detection so a chime can fire on the newly-entered hour.
    this.lastHourIndex = -1;
  }

  advance(dt: number): ArcState {
    this.elapsed += dt;

    const day = Math.floor(this.elapsed / DAY_SECONDS);
    const dayFraction = (this.elapsed % DAY_SECONDS) / DAY_SECONDS;
    const hourFloat = dayFraction * HOURS.length;
    const hourIndex = Math.floor(hourFloat) % HOURS.length;
    const frac = smoothstep(hourFloat - Math.floor(hourFloat));
    const next = (hourIndex + 1) % HOURS.length;

    const a = HOURS[hourIndex];
    const b = HOURS[next];
    const drift = dayDrift(day);

    // Deepen/lighten user bias.
    const d = this.deepen;
    const regBias = -6 * d;
    const brightBias = 1 - 0.4 * d;
    const durBias = 1 + 0.35 * d;
    const densBias = 1 + 0.25 * d;

    const live: ArcLive = {
      density: lerp(a.density, b.density, frac) * densBias,
      grainDur: lerp(a.grainDur, b.grainDur, frac) * durBias,
      spread: lerp(a.spread, b.spread, frac) + drift.spread,
      register: lerp(a.register, b.register, frac) + drift.reg + regBias,
      layers: Math.max(1, Math.round(lerp(a.layers, b.layers, frac))),
      readRate: Math.max(0.05, lerp(a.readRate, b.readRate, frac) + drift.read),
      brightness: Math.min(1, Math.max(0.1, lerp(a.brightness, b.brightness, frac) * brightBias)),
      gain: lerp(a.gain, b.gain, frac),
    };

    const hourChanged = hourIndex !== this.lastHourIndex && this.lastHourIndex !== -1;
    // Also treat the very first entry after a reset/seek as a chime moment.
    const firstEntry = this.lastHourIndex === -1;
    this.lastHourIndex = hourIndex;
    this.lastDay = day;

    return {
      ...live,
      elapsed: this.elapsed,
      day,
      dayFraction,
      hourIndex,
      hourName: a.name,
      hourGloss: a.gloss,
      caption: a.caption,
      hourChanged: hourChanged || firstEntry,
    };
  }

  get currentDay(): number {
    return this.lastDay;
  }
}
