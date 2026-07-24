// ────────────────────────────────────────────────────────────────────────────
// Signal (2494) — shared model: types, the sonification mapping, and the
// deterministic synthetic Deep Space Network used when the live feed is down.
//
// Pure data + pure functions only (no React, no audio nodes) so both the audio
// engine and the canvas visuals draw from one source of truth.
// ────────────────────────────────────────────────────────────────────────────

export interface DsnSignal {
  id: string;
  stationCode: string;
  station: string;
  dish: string;
  activity: string;
  direction: "up" | "down";
  band: string; // X / S / Ka / L
  dataRate: number; // bits/sec
  frequency: number; // Hz
  power: number; // dBm (usually negative on downlink)
  spacecraft: string;
  spacecraftId: string;
  lightSeconds: number; // one-way light time in seconds (0 = unknown)
}

export interface DsnStation {
  code: string;
  name: string;
}

export interface DsnSnapshot {
  stations: DsnStation[];
  signals: DsnSignal[];
  fetchedAt: number;
  synthetic: boolean;
}

// ── Station geography → stereo pan ──────────────────────────────────────────
// The three complexes sit ~120° apart around Earth. Pan them across the field
// so you can hear which side of the planet is doing the talking.
export const STATION_PAN: Record<string, number> = {
  gdscc: -0.75, // Goldstone, California
  mdscc: 0.0, // Madrid, Spain
  cdscc: 0.75, // Canberra, Australia
};

export function stationPan(code: string): number {
  return STATION_PAN[code] ?? 0;
}

// ── Musical mapping ─────────────────────────────────────────────────────────
// Everything snaps to one warm scale so the network is always a consonant
// chord. Band chooses the register; the spacecraft's identity chooses a stable
// degree within that register (so a given craft always sings the same note).

// Lydian-tinged pentatonic (semitone offsets): bright, hopeful, never sour.
const SCALE = [0, 2, 4, 7, 9, 11];
const ROOT_MIDI = 50; // D3

// Radio band → octave offset in semitones. Lower band = lower register.
const BAND_OCTAVE: Record<string, number> = {
  L: -24,
  S: -12,
  X: 0,
  KA: 12,
  KU: 12,
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable musical pitch (Hz) for a signal. */
export function signalFrequency(sig: DsnSignal): number {
  const h = hashStr(sig.spacecraft + sig.band);
  const degree = SCALE[h % SCALE.length];
  const octJitter = (Math.floor(h / 8) % 2) * 12;
  const bandOff = BAND_OCTAVE[sig.band] ?? 0;
  const midi = ROOT_MIDI + bandOff + degree + octJitter;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Tremolo / shimmer rate (Hz) from data rate: fast data fizzes, telemetry pulses slowly. */
export function shimmerRate(dataRate: number): number {
  if (dataRate <= 0) return 0.35;
  const l = Math.log10(Math.max(1, dataRate)); // ~0..7
  return 0.4 + Math.min(1, l / 7) * 11.5; // 0.4 .. ~12 Hz
}

/** 0..1 reverb/space depth from one-way light time. Voyager (huge) → drenched. */
export function spaceDepth(lightSeconds: number): number {
  if (lightSeconds <= 0) return 0.12;
  // log scale: Moon ~1s → ~0.15, Mars ~1000s → ~0.6, Voyager ~60000s → ~0.95.
  const l = Math.log10(lightSeconds + 1); // 0..~5
  return Math.min(0.97, 0.12 + l * 0.19);
}

/** Long echo/delay time (s) for very distant craft — arrival from far away. */
export function echoTime(lightSeconds: number): number {
  const d = spaceDepth(lightSeconds);
  return 0.12 + d * 0.65; // 0.12 .. ~0.75 s
}

/** Relative loudness 0..1 from downlink power (dBm) — used for beam brightness. */
export function signalStrength(sig: DsnSignal): number {
  if (sig.direction === "up") return 0.7;
  // Downlink power roughly -80 (strong) .. -180 (faint).
  const p = sig.power;
  if (p >= 0) return 0.5;
  const norm = (p + 180) / 100; // -180→0, -80→1
  return Math.max(0.1, Math.min(1, norm));
}

/** Priority for polyphony capping: keep the strongest / fastest links. */
export function signalPriority(sig: DsnSignal): number {
  return signalStrength(sig) * 2 + Math.log10(Math.max(1, sig.dataRate)) / 7;
}

export const MAX_VOICES = 11;

/** Human-readable one-way light time: "signal age". */
export function formatLightTime(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 90) return `${seconds.toFixed(1)} s`;
  const min = seconds / 60;
  if (min < 90) return `${min.toFixed(1)} min`;
  const hr = min / 60;
  if (hr < 48) return `${hr.toFixed(1)} hr`;
  return `${(hr / 24).toFixed(1)} days`;
}

export function formatDataRate(bps: number): string {
  if (bps <= 0) return "0 b/s";
  if (bps < 1000) return `${bps.toFixed(0)} b/s`;
  if (bps < 1e6) return `${(bps / 1e3).toFixed(1)} kb/s`;
  return `${(bps / 1e6).toFixed(2)} Mb/s`;
}

// ── Friendly names for common spacecraft codes ──────────────────────────────
export const CRAFT_NAMES: Record<string, string> = {
  VGR1: "Voyager 1",
  VGR2: "Voyager 2",
  MVN: "MAVEN",
  MRO: "Mars Recon Orbiter",
  MSL: "Curiosity",
  M20: "Perseverance",
  M01O: "Mars Odyssey",
  JWST: "James Webb",
  SPP: "Parker Solar Probe",
  STA: "STEREO-A",
  STB: "STEREO-B",
  NHPC: "New Horizons",
  LICI: "Lucy",
  PSYC: "Psyche",
  EMM: "Emirates Mars",
  KPLO: "Danuri (Moon)",
  ORX: "OSIRIS-APEX",
  DSCO: "DSCOVR",
  GAIA: "Gaia",
  CHDR: "CHANDRA",
  ACE: "ACE",
  WIND: "Wind",
  THEMIS: "THEMIS",
};

export function craftLabel(sig: DsnSignal): string {
  return CRAFT_NAMES[sig.spacecraft] ?? sig.spacecraft;
}

// ── Synthetic fallback DSN (deterministic) ──────────────────────────────────
// A plausible slice of the real network so the piece is ALWAYS alive: a Moon
// relay (dry & present), a Mars orbiter (mid distance), Parker near the Sun,
// and Voyager 1 drenched at the far edge of everything.
export function syntheticSnapshot(): DsnSnapshot {
  const stations: DsnStation[] = [
    { code: "gdscc", name: "Goldstone" },
    { code: "mdscc", name: "Madrid" },
    { code: "cdscc", name: "Canberra" },
  ];
  const mk = (
    stationCode: string,
    station: string,
    dish: string,
    direction: "up" | "down",
    band: string,
    dataRate: number,
    power: number,
    spacecraft: string,
    lightSeconds: number,
  ): DsnSignal => ({
    id: `${stationCode}-${dish}-${direction}-${spacecraft}`,
    stationCode,
    station,
    dish,
    activity: "Spacecraft Telemetry, Tracking, and Command",
    direction,
    band,
    dataRate,
    frequency: 8_420_000_000,
    power,
    spacecraft,
    spacecraftId: spacecraft,
    lightSeconds,
  });

  const signals: DsnSignal[] = [
    mk("cdscc", "Canberra", "DSS43", "down", "X", 160, -156.4, "VGR1", 82_800), // ~23 hr
    mk("gdscc", "Goldstone", "DSS14", "down", "S", 1400000, -122.1, "MRO", 1_150), // Mars ~19 min
    mk("gdscc", "Goldstone", "DSS24", "up", "X", 2000, 42.0, "M20", 1_150), // Perseverance uplink
    mk("mdscc", "Madrid", "DSS63", "down", "X", 480000, -118.5, "SPP", 480), // Parker
    mk("mdscc", "Madrid", "DSS56", "down", "X", 2048000, -101.2, "KPLO", 1.4), // Moon, near & dry
    mk("cdscc", "Canberra", "DSS35", "down", "Ka", 6400000, -110.0, "JWST", 5.0), // Webb at L2
  ];
  return { stations, signals, fetchedAt: Date.now(), synthetic: true };
}
