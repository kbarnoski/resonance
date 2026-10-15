import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTICLE_SHADERS, GENTLE_PARTICLE_SHADERS, LIVELY_PARTICLE_SHADERS, PARTICLE_SHADER_SET, GENTLE_PARTICLE_SET,
  PARTICLE_LOOP_CAP, PARTICLE_SHARE_MIN, PARTICLE_SHARE_MAX, PARTICLE_JOURNEY_MIN, PARTICLE_JOURNEY_MAX,
  PARTICLE_COVERAGE_MIN, PARTICLE_FAVOURITE_MAX, isParticleShader, castScreenTime,
} from "./particle-shaders";
import { PARTICLE_VOICES } from "./particle-voices.generated";
import { LOOP_PHASE_SKELETONS } from "./loop-phase-skeletons.generated";
import { PARTICLE_PROFILES } from "./particle-profiles.generated";
import { JOURNEY_CASTS, VETTED_SHADER_POOL } from "./journey-casts.generated";
import { TRAMOKYO_SETLIST, TRAMOKYO_RISE_ABOVE } from "./installation-sequence";
import { SCRIPTED_TAKES, PINNED_TAKES } from "./pinned-takes";
import { getJourney, GLOBAL_SHADER_BLOCKLIST, KAREL_BANNED_SHADERS } from "./journeys";
import { isMasteredJourneyLike } from "./mastered";
import { AMBER_SHARE_MAX, isAmberShader, isShaderBannedFor, SHADER_LOOP_CAP } from "./shader-balance";
import { getJourneyEngine } from "./journey-engine";
import { pickMorphShader } from "./morph-shader";
import { SHADERS } from "@/lib/shaders";
import { STD } from "../../../scripts/lib/snowflake-standard.mjs";
import type { Journey } from "./types";

// Karel 2026-10-13: "i like the particle shaders and hoping you use them in
// good portion across journeys … they are cute" → "dont mess with ghost or
// snowflake but all others def ensure particle shaders appear in them all and
// ensure they are present 33% of the time for a journey".
const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const expansion = read("scripts/expansion-recast.json") as { journeys: { id: string; title: string; cast: Record<string, (string | null)[]> }[] };
const expById = new Map(expansion.journeys.map((j) => [j.id, j]));
const castOf = (id: string): Record<string, readonly (string | null)[]> | null => expById.get(id)?.cast ?? JOURNEY_CASTS[id]?.cast ?? null;
const mastered = (id: string) => isMasteredJourneyLike(getJourney(id) ?? { id, name: LOOP_PHASE_SKELETONS[id]?.name });
const LOOP = TRAMOKYO_SETLIST.filter((id) => !mastered(id));

/** A loop journey as the kiosk plays it (pack rows from their committed skeletons). */
function loopJourney(id: string): { journey: Journey; dur: number; seeds: number[]; script?: (typeof SCRIPTED_TAKES)[string] } {
  const pin = PINNED_TAKES[id];
  const seeds = pin != null ? [[pin].flat()[0]] : [20261005, 1, 2];
  const script = SCRIPTED_TAKES[id];
  const builtin = getJourney(id);
  const sk = LOOP_PHASE_SKELETONS[id];
  if (script) return { journey: builtin!, dur: PARTICLE_PROFILES[id]?.duration ?? 200, seeds: [pin != null ? [pin].flat()[0] : 1], script };
  if (!sk) return { journey: builtin!, dur: PARTICLE_PROFILES[id]?.duration ?? 200, seeds };
  const tpl = getJourney("the-bloom")!;
  const cast = castOf(id) ?? {};
  const phases = sk.phases.map((p, i) => ({
    ...tpl.phases[Math.min(i, tpl.phases.length - 1)],
    id: p.id as Journey["phases"][number]["id"], start: p.start, end: p.end, intensityMultiplier: p.intensityMultiplier, sparse: p.sparse,
    shaderModes: (cast[p.id] ?? []).filter((m): m is string => !!m),
    shaderOwned: sk.owned ? true : p.shaderOwned,
  }));
  return { journey: { ...tpl, id, name: sk.name, realmId: (sk.realmId ?? tpl.realmId) as Journey["realmId"], blockedShaders: sk.blockedShaders, phases }, dur: sk.dur, seeds };
}

/** Real-engine replay: on-screen seconds per shader over every layer, mean over the seeds. */
// The replay clock only ever moves FORWARD, as performance.now does on the
// kiosk (2026-10-15: the old replay rewound it to 1 s per journey; the engine's
// cross-journey switch spacing (lastAnySwitchMs) then read a negative gap and
// held the opening shader — Realized's orbit-weaver at 43.6 % — depending on
// which journey replayed before: the "flaky" H2).
let replayClockBase = 1000;
function replay(id: string): { share: number; on: Map<string, number>; total: number; dur: number } {
  const { journey, dur, seeds, script } = loopJourney(id);
  const on = new Map<string, number>();
  let total = 0;
  let clock = replayClockBase;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  for (const seed of seeds) {
    const eng = getJourneyEngine();
    const base = replayClockBase + 60_000; // a minute between journeys, like the loop's hand-off and title
    clock = base;
    eng.start(journey, { seed, trackDuration: dur, script });
    for (let t = 0; t <= dur; t += 0.5) {
      clock = base + t * 1000;
      const f = eng.getFrame(t / dur);
      if (!f) continue;
      for (const m of new Set([f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode].filter((x): x is string => !!x))) { on.set(m, (on.get(m) ?? 0) + 0.5 / seeds.length); total += 0.5 / seeds.length; }
    }
    eng.stop();
    replayClockBase = clock;
  }
  vi.restoreAllMocks();
  let p = 0;
  for (const [m, s] of on) if (isParticleShader(m)) p += s;
  return { share: total ? p / total : 0, on, total, dur };
}

describe("the particle-shader family", () => {
  it("is the vetted, unbanned motes / sparkles / dust shaders — never r-petals (Ghost only) or a wash", () => {
    expect(PARTICLE_SHADERS.length).toBe(15);
    expect(new Set(PARTICLE_SHADERS).size).toBe(PARTICLE_SHADERS.length);
    for (const m of PARTICLE_SHADERS) {
      expect(SHADERS[m as keyof typeof SHADERS], `${m} registered`).toBeTruthy();
      expect(VETTED_SHADER_POOL.has(m), `${m} vetted`).toBe(true);
      expect(GLOBAL_SHADER_BLOCKLIST, m).not.toContain(m);
      expect(KAREL_BANNED_SHADERS.has(m), m).toBe(false);
    }
    for (const out of ["r-petals", "sparkler", "r2-curlswarm", "r-droplets", "r-mercury", "pollen", "plankton", "drift", "parsec"]) expect(PARTICLE_SHADER_SET.has(out), out).toBe(false);
    expect([...GENTLE_PARTICLE_SHADERS, ...LIVELY_PARTICLE_SHADERS].sort()).toEqual([...PARTICLE_SHADERS].sort());
  });
});

describe("particle voices (the recast pipeline's particle pass)", () => {
  const union = (id: string) => new Set([...(PARTICLE_VOICES[id] ?? []), ...Object.values(castOf(id) ?? {}).flat().filter((m): m is string => !!m && isParticleShader(m))]);

  it("every non-mastered loop journey carries >= 3 particle shaders (cast + voices); Snowflake / Ghost none added", () => {
    for (const id of LOOP) expect(union(id).size, LOOP_PHASE_SKELETONS[id]?.name ?? id).toBeGreaterThanOrEqual(3);
    expect(PARTICLE_VOICES["first-snow"]).toBeUndefined();
    expect(PARTICLE_VOICES["ghost"]).toBeUndefined();
    const covered = LOOP.filter((id) => union(id).size > 0).length;
    expect(covered / LOOP.length).toBeGreaterThanOrEqual(PARTICLE_COVERAGE_MIN);
    expect(covered).toBe(LOOP.length); // Karel: "ensure particle shaders appear in them all"
  });

  it("voices are family members, unbanned for their journey, and never a shader the cast already plays", () => {
    for (const [id, voices] of Object.entries(PARTICLE_VOICES)) {
      const cast = new Set(Object.values(castOf(id) ?? {}).flat());
      const j = getJourney(id);
      const blocked = new Set([...(j?.blockedShaders ?? []), ...(LOOP_PHASE_SKELETONS[id]?.blockedShaders ?? [])]);
      for (const m of voices) {
        expect(isParticleShader(m), `${id}: ${m}`).toBe(true);
        expect(isShaderBannedFor(id, m), `${id}: ${m}`).toBe(false);
        expect(blocked.has(m), `${id}: ${m}`).toBe(false);
        expect(cast.has(m), `${id}: ${m} doubles the cast`).toBe(false);
      }
    }
  });

  it(`caps each family shader at ${PARTICLE_LOOP_CAP} loop journeys (cast + voices) and spreads the whole family`, () => {
    const n = new Map<string, number>();
    for (const id of TRAMOKYO_SETLIST) {
      const modes = SCRIPTED_TAKES[id] && mastered(id) ? new Set(SCRIPTED_TAKES[id].map((e) => e.mode)) : new Set([...union(id), ...Object.values(castOf(id) ?? {}).flat()]);
      for (const m of modes) if (m && isParticleShader(m)) n.set(m, (n.get(m) ?? 0) + 1);
    }
    for (const m of PARTICLE_SHADERS) {
      expect(n.get(m) ?? 0, m).toBeLessThanOrEqual(PARTICLE_LOOP_CAP);
      expect(n.get(m) ?? 0, `${m} barely used`).toBeGreaterThanOrEqual(12);
    }
    expect(PARTICLE_LOOP_CAP).toBeGreaterThan(SHADER_LOOP_CAP); // a family-wide budget, see PARTICLE_LOOP_CAP
  });

  it(`keeps amber (gold + ember) <= ${AMBER_SHARE_MAX * 100} % of the voices and of the loop's cast + voice appearances`, () => {
    const voices = Object.values(PARTICLE_VOICES).flat();
    expect(voices.filter(isAmberShader).length / voices.length).toBeLessThanOrEqual(AMBER_SHARE_MAX);
    let all = 0, amber = 0;
    for (const id of LOOP) for (const m of new Set([...Object.values(castOf(id) ?? {}).flat(), ...(PARTICLE_VOICES[id] ?? [])])) { if (!m) continue; all++; if (isAmberShader(m)) amber++; }
    expect(amber / all).toBeLessThanOrEqual(AMBER_SHARE_MAX);
  });

  it("casts by musical character: quiet journeys lean gentle, energetic ones lively", () => {
    const energy = (id: string) => { const c = PARTICLE_PROFILES[id]?.curve ?? []; return c.length ? c.reduce((a, [, v]) => a + v, 0) / c.length : 0.5; };
    const sorted = LOOP.map(energy).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 3)], q2 = sorted[Math.floor((2 * sorted.length) / 3)];
    let quietGentle = 0, quietAll = 0, loudLively = 0, loudAll = 0;
    for (const id of LOOP) for (const m of PARTICLE_VOICES[id] ?? []) {
      if (energy(id) < q1) { quietAll++; if (GENTLE_PARTICLE_SET.has(m)) quietGentle++; }
      else if (energy(id) >= q2) { loudAll++; if (!GENTLE_PARTICLE_SET.has(m)) loudLively++; }
    }
    expect(quietGentle / quietAll).toBeGreaterThanOrEqual(0.6);
    expect(loudLively / loudAll).toBeGreaterThanOrEqual(0.6);
  });
});

describe("particle screen-time on the real engine (every loop journey replayed)", () => {
  afterEach(() => { getJourneyEngine().stop(); vi.restoreAllMocks(); });
  const runs = new Map<string, ReturnType<typeof replay>>();
  const get = (id: string) => { if (!runs.has(id)) runs.set(id, replay(id)); return runs.get(id)!; };

  it(`every non-mastered journey keeps ~33 % of its shader time on particle shaders (${PARTICLE_JOURNEY_MIN * 100}-${PARTICLE_JOURNEY_MAX * 100} %)`, () => {
    const out: string[] = [];
    for (const id of LOOP) {
      const r = get(id);
      if (r.share < PARTICLE_JOURNEY_MIN - 0.005 || r.share > PARTICLE_JOURNEY_MAX + 0.005) out.push(`${LOOP_PHASE_SKELETONS[id]?.name ?? id} ${(r.share * 100).toFixed(1)} %`);
    }
    expect(out).toEqual([]);
  });

  it(`the loop and the Rise Above set sit at ${PARTICLE_SHARE_MIN * 100}-${PARTICLE_SHARE_MAX * 100} % of all shader time`, () => {
    for (const ids of [TRAMOKYO_SETLIST.filter((id) => !mastered(id)), TRAMOKYO_RISE_ABOVE.filter((id) => !mastered(id))]) {
      let p = 0, t = 0;
      for (const id of ids) { const r = get(id); p += r.share * r.total; t += r.total; }
      expect(p / t).toBeGreaterThanOrEqual(PARTICLE_SHARE_MIN);
      expect(p / t).toBeLessThanOrEqual(PARTICLE_SHARE_MAX);
    }
  });

  it("spreads the time across the family (no favourite) and no particle shader hogs a journey (H2)", () => {
    const by = new Map<string, number>();
    let tot = 0;
    for (const id of LOOP) {
      const r = get(id);
      for (const [m, s] of r.on) if (isParticleShader(m)) {
        by.set(m, (by.get(m) ?? 0) + s); tot += s;
        expect(s / r.dur, `${LOOP_PHASE_SKELETONS[id]?.name ?? id}: ${m}`).toBeLessThanOrEqual(STD.H2_maxShare + 0.05);
      }
    }
    for (const m of PARTICLE_SHADERS) expect((by.get(m) ?? 0) / tot, m).toBeLessThanOrEqual(PARTICLE_FAVOURITE_MAX);
    expect(by.size).toBe(PARTICLE_SHADERS.length);
  });

  it("Snowflake and Ghost play exactly as mastered: no particle voice", () => {
    for (const id of ["first-snow", "ghost"]) {
      const eng = getJourneyEngine();
      eng.start(getJourney(id)!, { seed: [PINNED_TAKES[id]].flat()[0] as number, trackDuration: 200, script: SCRIPTED_TAKES[id] });
      expect((eng as unknown as { particleOn: boolean }).particleOn, id).toBe(false);
      eng.stop();
    }
  });
});

describe("the screen-time model and the morph arrival", () => {
  it("castScreenTime shares each phase's layer-seconds among its voices", () => {
    const t = castScreenTime({ a: ["x"], b: ["y", "z"] }, [10], 30, { owned: true, layers: 2 });
    expect(t.get("x")).toBeCloseTo(10);
    expect(t.get("y")).toBeCloseTo(20);
    expect(t.get("z")).toBeCloseTo(20);
  });

  it("prefers a particle shader for the morph arrival with the SAME single draw", () => {
    let draws = 0;
    const base = { phaseModes: ["kelp", "r-stardust", "zenith"], nextPhaseModes: [], owned: true, current: "nadir", dual: null, tertiary: null, seen: new Set<string>(), allowed: () => true, luma: { kelp: 40, "r-stardust": 40, zenith: 40, nadir: 40 }, fadeMs: () => 2000 };
    const r = () => { draws++; return 0.99; };
    const plain = pickMorphShader({ ...base, random: r });
    expect(plain?.mode).toBe("zenith");
    const fav = pickMorphShader({ ...base, random: r, prefer: isParticleShader });
    expect(fav?.mode).toBe("r-stardust");
    expect(draws).toBe(2);
  });
});
