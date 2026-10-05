import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JOURNEY_CASTS, VETTED_SHADER_POOL } from "./journey-casts.generated";
import {
  JOURNEYS, getJourney, castJourneyShaders, getJourneyCast, regenerateJourneyShaders,
  GLOBAL_SHADER_BLOCKLIST, PICKTIME_SHADER_BLOCKLIST, REALM_SHADER_BLOCKLIST, PICKTIME_REALM_BLOCKLIST,
} from "./journeys";
import { TRAMOKYO_SETLIST } from "./installation-sequence";
import { SCRIPTED_TAKES } from "./pinned-takes";
import { MASTERED_JOURNEYS } from "./mastered";
import { SCRIPTED_TAKES } from "./pinned-takes";
import { journeyLayerGain, expansionLayerGain, isKineticJourneyName, isWhisperImageryName } from "./kinetic";
import { SHADER_SUPPORT_GAIN } from "@/lib/shaders/shader-gain.generated";
import { MODE_META, MODES_3D } from "@/lib/shaders";
import { getJourneyEngine } from "./journey-engine";
import { createSeededRandom } from "./seeded-random";

// Karel 2026-10-05: "your shader work is for featured journeys too not
// just expansion and the other albums?" -> "everything besides
// snowflake, realized, ghost is getting the treatment". Guards the
// featured/album recast (scripts/recast-featured.mjs) the same way
// expansion-recast.test.ts guards the Expansion.
const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
type FJ = { id: string; name: string; builtin: boolean; setlistPos: number | null; path: string; pathIdx: number | null; pathLen: number | null; shaders: string[]; cast: Record<string, string[]>; owned?: boolean; lead?: string };
const featured = read("scripts/featured-recast.json") as { journeys: FJ[]; kineticLabCasts: Record<string, string[]>; constraints: { owned?: { minDist: number; cap: number } } };
// Snowflake Standard rollout (Karel 2026-10-05): rolled-out journeys carry
// PHASE-OWNED casts (10-12 shaders, one phase each, lead on the peak) under
// a loosened loop cap and the closest spacing the 95-shader pool allows.
const OWNED = new Set(featured.journeys.filter((j) => j.owned).map((j) => j.id));
const OWNED_DIST = featured.constraints.owned?.minDist ?? Infinity;
const OWNED_CAP = featured.constraints.owned?.cap ?? 0;
const expansion = read("scripts/expansion-recast.json") as { journeys: { id: string; lead: string; cast: Record<string, (string | null)[]> }[] };
const vet = read("scripts/shader-vetting.json") as { pool: string[] };

const KAREL_REJECTED = ["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"];
const KINETIC_LAB = ["Chemiluminescence 1", "Rolling 2", "Stand 10", "Cabin Soul 8", "Cabin Soul 5"];
const KINETIC_LAB_LEADS = ["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"];
const GEOMETRY = new Set<string>(MODE_META.filter((m) => m.category === "Geometry").map((m) => m.mode));
const MIN_DIST = 10; // never within the next 9 journeys (cyclic) — 11 became infeasible once Vigil (+7, 2026-10-05) joined the loop; the solver proves 10
const LEAD_DIST = 12;
const CAP = 4;

const L = TRAMOKYO_SETLIST.length;
const cdist = (a: number, b: number, n: number) => { const d = Math.abs(a - b); return Math.min(d, n - d); };
const castShaders = (id: string) => [...new Set(Object.values(JOURNEY_CASTS[id].cast).flat())];

/** Every shader each setlist position plays (fixed + recast). */
function loopUses() {
  const exp = new Map(expansion.journeys.map((j) => [j.id, j]));
  return TRAMOKYO_SETLIST.map((id) => {
    if (SCRIPTED_TAKES[id]) return { id, kind: "mastered", modes: [...new Set(SCRIPTED_TAKES[id].map((e) => e.mode).filter(Boolean))], lead: null as string | null };
    const e = exp.get(id);
    if (e) return { id, kind: "expansion", modes: [...new Set(Object.values(e.cast).flat().filter((m): m is string => !!m))], lead: e.lead };
    if (featured.kineticLabCasts[id]) return { id, kind: "kinetic-lab", modes: featured.kineticLabCasts[id], lead: null };
    if (JOURNEY_CASTS[id]) return { id, kind: "recast", modes: castShaders(id), lead: null };
    return { id, kind: "unknown", modes: [] as string[], lead: null };
  });
}

describe("featured + album recast: coverage", () => {
  it("casts every setlist journey that is not mastered, Kinetic Lab or Expansion", () => {
    const uses = loopUses();
    expect(uses.filter((u) => u.kind === "unknown").map((u) => u.id)).toEqual([]);
    // 40 album/featured + 7 Vigil (Oct 4 2026 studio) = 47
    expect(uses.filter((u) => u.kind === "recast")).toHaveLength(47);
    expect(uses.filter((u) => u.kind === "kinetic-lab")).toHaveLength(5);
    expect(uses.filter((u) => u.kind === "expansion")).toHaveLength(49);
  });

  it("casts every non-mastered built-in, and never a mastered, Kinetic Lab or Expansion journey", () => {
    for (const j of JOURNEYS) {
      // Realized left the mastered lock 2026-10-05 but keeps its scripted
      // shader take (Karel's mastered roster), so it stays uncast.
      if (MASTERED_JOURNEYS.has(j.id) || SCRIPTED_TAKES[j.id]) {
        expect(JOURNEY_CASTS[j.id], j.id).toBeUndefined();
        expect(getJourneyCast(j)).toBeNull();
        expect(castJourneyShaders(j)).toBeNull();
      } else expect(JOURNEY_CASTS[j.id], j.id).toBeDefined();
    }
    for (const id of [...Object.keys(featured.kineticLabCasts), ...expansion.journeys.map((j) => j.id)]) expect(JOURNEY_CASTS[id], id).toBeUndefined();
    // shared rows wrapping a mastered built-in (DB uuid id, live name) stay uncast
    for (const name of ["Snowflake", "Realized", "Ghost"]) expect(getJourneyCast({ id: "some-db-uuid", name })).toBeNull();
    expect(JOURNEY_CASTS["b4ea4c60-d158-40ca-8bd5-4d2d57473e4f"], "Cosmic Homecoming closes the Welcome Home program").toBeDefined();
  });

  it("keeps the generated casts and the report in sync", () => {
    for (const j of featured.journeys) expect(JOURNEY_CASTS[j.id]?.cast, j.name).toEqual(j.cast);
    expect(Object.keys(JOURNEY_CASTS).length).toBe(featured.journeys.length);
  });
});

describe("featured + album recast: quality", () => {
  it("uses only vetted, non-blocked, non-geometry, non-3D shaders, honoring realm + journey bans", () => {
    const pool = new Set(vet.pool);
    for (const [id, { name, cast }] of Object.entries(JOURNEY_CASTS)) {
      const b = getJourney(id);
      const realm = b?.realmId;
      const bans = new Set([...(b?.blockedShaders ?? []), ...(realm ? REALM_SHADER_BLOCKLIST[realm] ?? [] : []), ...(realm ? [...(PICKTIME_REALM_BLOCKLIST[realm] ?? [])] : [])]);
      for (const m of Object.values(cast).flat()) {
        const tag = `${name}: ${m}`;
        expect(pool.has(m), tag).toBe(true);
        expect(VETTED_SHADER_POOL.has(m), tag).toBe(true);
        expect(KAREL_REJECTED.includes(m), tag).toBe(false);
        expect(KINETIC_LAB_LEADS.includes(m), tag).toBe(false);
        expect(GLOBAL_SHADER_BLOCKLIST.includes(m), tag).toBe(false);
        expect(PICKTIME_SHADER_BLOCKLIST.has(m), tag).toBe(false);
        expect(GEOMETRY.has(m), tag).toBe(false);
        expect((MODES_3D as ReadonlySet<string>).has(m), tag).toBe(false);
        expect(bans.has(m), tag).toBe(false);
      }
    }
  });

  it("gives every legacy phase >= 3 distinct shaders and keeps each shader on ONE contiguous run of phases", () => {
    for (const [id, { name, cast }] of Object.entries(JOURNEY_CASTS)) {
      if (OWNED.has(id)) continue;
      const phases = Object.values(cast);
      for (const list of phases) { expect(list.length, name).toBeGreaterThanOrEqual(3); expect(new Set(list).size, name).toBe(list.length); }
      for (const m of new Set(phases.flat())) {
        const idx = phases.map((l, i) => (l.includes(m) ? i : -1)).filter((i) => i >= 0);
        expect(idx.at(-1)! - idx[0] + 1, `${name}: ${m} returns after a gap`).toBe(idx.length);
      }
    }
  });

  it("gives every legacy journey 7-9 distinct shaders and every rolled-out journey 10-12", () => {
    for (const id of Object.keys(JOURNEY_CASTS)) {
      const n = castShaders(id).length;
      const [lo, hi] = OWNED.has(id) ? [10, 12] : [7, 9];
      expect(n, JOURNEY_CASTS[id].name).toBeGreaterThanOrEqual(lo); expect(n, JOURNEY_CASTS[id].name).toBeLessThanOrEqual(hi);
    }
  });

  it("rolled-out journeys: every support lives in ONE phase, the lead on <= 2 adjacent phases, no empty phase", () => {
    for (const j of featured.journeys.filter((x) => x.owned)) {
      const phases = Object.values(j.cast);
      for (const list of phases) { expect(list.length, j.name).toBeGreaterThanOrEqual(1); expect(new Set(list).size, j.name).toBe(list.length); }
      expect(JOURNEY_CASTS[j.id].cast, j.name).toEqual(j.cast);
      for (const m of new Set(phases.flat())) {
        const idx = phases.map((l, i) => (l.includes(m) ? i : -1)).filter((i) => i >= 0);
        if (m === j.lead) { expect(idx.length, `${j.name}: lead ${m}`).toBeLessThanOrEqual(2); expect(idx.at(-1)! - idx[0], `${j.name}: lead ${m} adjacent`).toBeLessThanOrEqual(1); }
        else expect(idx.length, `${j.name}: ${m} spans ${idx.length} phases`).toBe(1);
      }
    }
  });
});

describe("featured + album recast: diversity across the WHOLE kiosk loop", () => {
  it("never repeats a recast shader within the next 10 journeys — against every journey in the loop (mastered takes, Kinetic Lab, Expansion included)", () => {
    const uses = loopUses();
    uses.forEach((u, i) => {
      if (u.kind !== "recast") return;
      uses.forEach((v, k) => {
        if (k === i) return;
        for (const m of u.modes) if (v.modes.includes(m)) {
          const min = v.lead === m ? LEAD_DIST : (OWNED.has(u.id) || OWNED.has(v.id) ? Math.min(MIN_DIST, OWNED_DIST) : MIN_DIST);
          expect(cdist(i, k, L), `${m}: #${i} ${JOURNEY_CASTS[u.id].name} / #${k} ${v.kind} ${v.id}`).toBeGreaterThanOrEqual(min);
        }
      });
    });
  });

  it(`caps every shader at ${CAP} uses among the recast loop journeys (the loosened rollout cap once any journey is rolled out)`, () => {
    const n = new Map<string, number>();
    for (const u of loopUses()) if (u.kind === "recast") for (const m of u.modes) n.set(m, (n.get(m) ?? 0) + 1);
    for (const [m, c] of n) expect(c, m).toBeLessThanOrEqual(OWNED.size ? Math.max(CAP, OWNED_CAP) : CAP);
  });

  it("spaces repeats within each album path (each also loops alone as its own program)", () => {
    const byPath = new Map<string, FJ[]>();
    for (const j of featured.journeys) if (j.pathLen) byPath.set(j.path, [...(byPath.get(j.path) ?? []), j]);
    expect([...byPath.keys()].sort()).toEqual(["March Light", "Surrounded by Light", "Welcome Home"]);
    for (const [path, js] of byPath) for (const a of js) for (const b of js) {
      if (a === b) continue;
      for (const m of a.shaders) if (b.shaders.includes(m)) expect(cdist(a.pathIdx!, b.pathIdx!, a.pathLen!), `${path}: ${m} in ${a.name} + ${b.name}`).toBeGreaterThanOrEqual(Math.floor(a.pathLen! / 2));
    }
  });
});

describe("the engine plays the cast", () => {
  afterEach(() => { getJourneyEngine().stop(); vi.restoreAllMocks(); });

  it("a cast built-in only ever renders shaders from its cast", () => {
    const j = getJourney("the-bloom")!;
    const allowed = new Set(castShaders("the-bloom"));
    const engine = getJourneyEngine();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    engine.start(j, { seed: 7, trackDuration: 215 });
    const seen = new Set<string>();
    for (let i = 0; i <= 300; i++) {
      clock += 1500;
      const f = engine.getFrame(i / 300);
      if (!f) continue;
      for (const m of [f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode]) if (m) seen.add(m);
    }
    expect(seen.size).toBeGreaterThan(3);
    for (const m of seen) expect(allowed.has(m), m).toBe(true);
  });

  it("a shared row wrapping a cast built-in (DB id, live name) resolves the built-in's cast", () => {
    expect(getJourneyCast({ id: "00000000-0000-0000-0000-000000000000", name: "The Bloom" })).toEqual(JOURNEY_CASTS["the-bloom"].cast);
  });

  it("an uncast, non-mastered journey regenerates from the vetted pool only", () => {
    const base = getJourney("the-bloom")!;
    const custom = { ...base, id: "user-custom", name: "My Own Journey" };
    const out = regenerateJourneyShaders(custom, createSeededRandom(3), 240);
    for (const m of out.phases.flatMap((p) => p.shaderModes)) expect(VETTED_SHADER_POOL.has(m), m).toBe(true);
  });
});

describe("brightness gain reaches every journey except the mastered three and the Kinetic Lab", () => {
  const bright = Object.keys(SHADER_SUPPORT_GAIN).find((m) => SHADER_SUPPORT_GAIN[m] < 0.9)!;

  it("leaves Snowflake + Ghost at full level (built-in ids, shared-row ids by name)", () => {
    for (const id of MASTERED_JOURNEYS) expect(journeyLayerGain({ id, name: getJourney(id)!.name }, bright)).toBe(1);
    for (const name of ["Snowflake", "Ghost"]) expect(journeyLayerGain({ id: "db-uuid", name }, bright)).toBe(1);
    // Realized gets the global features now (Karel 2026-10-05), gain included.
    expect(journeyLayerGain({ id: "inferno", name: "Realized" }, bright)).toBeLessThan(1);
  });

  it("leaves the Kinetic Lab at full level", () => {
    for (const name of KINETIC_LAB) expect(journeyLayerGain({ id: "x", name }, bright)).toBe(1);
  });

  it("keeps the Expansion's own gains", () => {
    expect(journeyLayerGain({ id: "x", name: "Nothing 30" }, bright)).toBe(expansionLayerGain("Nothing 30", bright));
  });

  it("dims bright shaders in featured + album journeys", () => {
    for (const name of ["The Summit", "Interplay", "Welcome Home", "Rolling", "Rise", "Love Again", "COSMIC HOMECOMING"]) {
      expect(journeyLayerGain({ id: "x", name }, bright), name).toBe(SHADER_SUPPORT_GAIN[bright]);
    }
    expect(journeyLayerGain({ id: "x", name: "Interplay" }, "not-a-gained-shader")).toBe(1);
  });

  it("Welcome Home's \"Rolling\" is an album piece, not a Kinetic Lab take", () => {
    expect(isKineticJourneyName("Rolling")).toBe(false);
    expect(isWhisperImageryName("Rolling")).toBe(false);
    for (const name of KINETIC_LAB) expect(isKineticJourneyName(name), name).toBe(true);
  });
});
