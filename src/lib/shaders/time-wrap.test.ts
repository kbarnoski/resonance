import { readFileSync } from "node:fs";
/**
 * Periodic-time wrap lint (kiosk film 2026-10-10: supernova's big shock
 * ring vanished in ONE frame while a tiny new one appeared at the centre).
 *
 * Every registered shader that drives something with fract()/mod() of time
 * must be either
 *   - FIXED: enveloped so the cycling element is at zero across the wrap
 *     (the pinned snippet must stay in the source), or
 *   - SCANNED_CLEAN: rendered by scripts/audit-shader-time-wraps.mjs
 *     (96x54, 30 fps, 150 s, audio 0.3 / 0 / sine + audio sweep) with no
 *     one-frame discontinuity (already enveloped, periodic-continuous like
 *     angle sweeps / triangle waves, or off-screen at the wrap), or
 *   - LOCKED: mastered Snowflake / Ghost roster, never edited here.
 * The same holds for floor(time) selections (a hash or pattern index that
 * re-rolls in one frame). A NEW such shader fails until scanned and listed.
 */
import { describe, it, expect } from "vitest";
import { SHADERS, SHADER_PREPASS } from "./index";
// a shader's whole GPU source: its FRAG plus its prepass (shaders/index.ts
// SHADER_PREPASS — the per-frame light tables carry the clocks now)
const fullSrc = (m: string): string | undefined => { const f = SHADERS[m as keyof typeof SHADERS]; return f ? f + (SHADER_PREPASS[m as keyof typeof SHADER_PREPASS]?.frag ?? "") : f; };
import { RS_WRAP_ENV } from "./time-wrap";
import { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "@/lib/journeys/pinned-takes";
import { JOURNEYS, RECAST_SAFELIST } from "@/lib/journeys/journeys";

/** Fixed 2026-10-10 — snippet(s) that carry the envelope. */
const FIXED: Record<string, string[]> = {
  supernova: ["float cycleEnv = rsWrapEnv((age - 0.3) / 5.0);", "shockTotal * 0.7 * cycleEnv", "* (0.6 + u_mid * 0.4) * cycleEnv", "interior * (0.5 + u_mid * 0.5) * cycleEnv"],
  redshift: ["return ring * rsWrapEnv(ph);"],
  nova: ["float cycleEnv = rsWrapEnv(phase);", "smoothstep(0.0, 0.08, ringPhase)", "expandT * cycleEnv", "rings * 0.5 + t * 0.15 + paletteShift"],
  "mobius-strip": ["smoothstep(0.0, 0.2, lpm1)", "smoothstep(0.0, 0.2, lpm2)"],
  brachistochrone: ["glow * trail * 0.07 * curveEnv", "* beadEnv;"],
  "fracture-light": ["float wNew = smoothstep(0.0, 0.06, age);", "float sclk = u_time * 0.17;"],
  "r-smokerings": ["(1.0 - life) * smoothstep(0.0, 0.08, life)"],
  "r-embers": ["(1.0 - smoothstep(0.6, 1.4, life)) * smoothstep(0.0, 0.1, life)"],
  "r2-pixie": ["float fade = (1.0 - life) * smoothstep(0.0, 0.08, life);"],
  "r2-spore": ["exp(-life * 1.0) * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(1.25, 1.5, life))"],
  "r3-ghostribbons": ["0.005 * abs(fract(fi * 0.31 + t * 0.1) * 2.0 - 1.0)"],
  "r3-plasmastorm": ["abs(fract(fi * 0.21 + t * 0.1) * 2.0 - 1.0)"],
  "r3-wishtrails": ["(1.0 - tt) * smoothstep(0.0, 0.08, tt)"],
  protostar: ["(0.3 + progress * 0.7) * rsWrapEnvK(progress, 0.08, 0.9)", "* 0.5 * knotEnv;"],
  helix: ["float dRung = sdSegment3D(p, rA, rB) + (1.0 - rungEnv) * 2.0;"],
  "binary-stars": ["vec2 jit = mix(h0.xy, h1.xy, smoothstep(0.0, 1.0, fract(jt)));"],
  sparkler: ["vec3 rnd = hash3(birthSlot * 1.37) - 0.5;", "smoothstep(0.0, 0.06, age)"],
  synapse: ["* rsWrapEnvK(particleTime, 0.05, 0.92);"],
};

/** Periodic time, but the render audit found no one-frame cut. */
const SCANNED_CLEAN = new Set([
  "monsoon", "ember", "pulsar", "enzyme", "moire",
  "catenary", "halo", "gnosis", "stigmata", "aureole", "apophatic", "satori", "photon", "kepler",
  "fibonacci-spiral", "maelstrom", "deluge", "flame", "maelstrom-dark", "furnace", "epicycloid", "stamen",
  "meristem", "ember-drift", "shadow-fire", "smoke-signal", "iron-forge", "dark-crystal",
  "volcanic", "lightning-field", "night-forest", "jubilee", "lectio",
  "ember-fountain", "meteor-rain", "galaxy-seed", "cascade-veil",
  // floor(time) selections that cross-fade or only switch while invisible
  "ripple",
]);

function lockedRoster(): Set<string> {
  const locked = new Set<string>();
  for (const id of ["first-snow", "ghost"]) {
    for (const e of SCRIPTED_TAKES[id] ?? []) if (e.mode) locked.add(e.mode);
    if (TAKE_FINALE_SHADERS[id]) locked.add(TAKE_FINALE_SHADERS[id]);
    const j = JOURNEYS.find((x) => x.id === id);
    for (const m of (j ? RECAST_SAFELIST[j.realmId] : undefined) ?? []) locked.add(m);
  }
  return locked;
}

const stripComments = (s: string) => s.replace(/\/\/[^\n]*/g, "");
/** fract()/mod() fed by u_time or a local t. */
const PERIODIC_TIME = /\b(fract|mod)\s*\(([^;]*?)\bu_time\b|\b(fract|mod)\s*\([^;]*\bt\s*[*+\-/)]/;
/** floor() of time: a hash / pattern index that re-rolls in one frame. */
const FLOOR_TIME = /\bfloor\s*\([^;]*?\b(u_time|t)\b\s*[*+\-/)]/;

describe("RS_WRAP_ENV", () => {
  it("defines the envelope helpers with GLSL-safe (ascending) smoothstep edges", () => {
    expect(RS_WRAP_ENV).toContain("float rsWrapEnvK(float ph, float fin, float fout)");
    expect(RS_WRAP_ENV).toContain("float rsWrapEnv(float ph)");
    expect(RS_WRAP_ENV).not.toMatch(/smoothstep\(\s*1\.0\s*,/);
  });
  it("is zero at both ends of the cycle and 1 in the middle", () => {
    const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const env = (ph: number) => ss(0, 0.08, ph) * (1 - ss(0.85, 1, ph));
    expect(env(0)).toBe(0);
    expect(env(1)).toBe(0);
    expect(env(0.5)).toBe(1);
  });
});

/** Position clocks that multiplied u_time by an audio uniform: on a
 *  long-running layer the phase leapt as the band moved (kiosk slew
 *  audit 2026-10-10). Pinned to constant rates. */
const AUDIO_CLOCK_FIXED = ["sparkler", "comet-swarm", "ribbon-of-light", "galaxy-seed", "helix-stream", "binary-stars", "meteor-rain"];
const AUDIO_POSITION_CLOCK = /\b(float\s+(t|orb|spin|climb|cycle)\s*=\s*(fract\s*\()?u_time\s*\*\s*\([^;]*u_(bass|mid|treble|amplitude))/;

describe("shader registry — periodic-time wraps", () => {
  const entries = Object.keys(SHADERS).map((m) => [m, fullSrc(m)!]) as [string, string][];
  const locked = lockedRoster();

  it("every periodic-time shader is enveloped, render-verified, or locked", () => {
    const unverified = entries
      .filter(([, s]) => PERIODIC_TIME.test(stripComments(s)) || FLOOR_TIME.test(stripComments(s)))
      .map(([m]) => m)
      .filter((m) => !FIXED[m] && !SCANNED_CLEAN.has(m) && !locked.has(m));
    expect(unverified, "fract/mod of time wraps in one frame — envelope it (time-wrap.ts) and run scripts/audit-shader-time-wraps.mjs --only=<mode>").toEqual([]);
  });

  it("fixed shaders keep their envelopes", () => {
    for (const [m, snippets] of Object.entries(FIXED)) {
      const s = fullSrc(m);
      expect(s, `${m} not registered`).toBeTruthy();
      for (const snip of snippets) expect(s!.includes(snip), `${m}: lost "${snip}"`).toBe(true);
      if (snippets.some((x) => x.includes("rsWrapEnv"))) expect(s!).toContain("float rsWrapEnvK(");
    }
  });

  it("the un-enveloped originals cannot come back", () => {
    expect(SHADERS.supernova!).not.toContain("color += shockCol * shockTotal * 0.7;");
    expect(SHADERS.nova!).not.toContain("blast *= smoothstep(0.6, 0.1, r) * expandT;");
    expect(SHADERS.redshift!).not.toMatch(/return ring;/);
  });

  it("audio no longer scales the fixed position clocks", () => {
    for (const m of AUDIO_CLOCK_FIXED) {
      const s = fullSrc(m)!;
      expect(stripComments(s), m).not.toMatch(AUDIO_POSITION_CLOCK);
      expect(s, m).toContain("kiosk slew audit 2026-10-10");
    }
  });

  it("pulsar's beam and ascension's drift run at a constant rate (tour 2026-10-10)", () => {
    // both multiplied an ever-growing time by (1 + bass * 0.4): the beam angle /
    // particle drift leapt as bass moved on a long-running layer
    expect(stripComments(SHADERS.pulsar!)).not.toMatch(/t \* \(1\.0 \+ bass \* 0\.4\)/);
    // (ascension is not a registered mode — pinned at the source)
    expect(stripComments(readFileSync("src/lib/shaders/ascension.ts", "utf8"))).not.toMatch(/speed \* \(1\.0 \+ u_bass \* 0\.4\)/);
  });

  it("allowlist has no stale entries", () => {
    for (const m of SCANNED_CLEAN) expect(SHADERS[m as keyof typeof SHADERS], `${m} not registered`).toBeTruthy();
  });

  it("mastered Snowflake / Ghost shaders are not touched by the wrap envelope", () => {
    for (const m of locked) {
      expect(FIXED[m], `${m} is locked`).toBeUndefined();
      expect(SHADERS[m as keyof typeof SHADERS]?.includes("rsWrapEnv") ?? false, m).toBe(false);
    }
  });
});
