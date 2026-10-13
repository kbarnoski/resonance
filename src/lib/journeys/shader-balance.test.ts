import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JOURNEY_CASTS } from "./journey-casts.generated";
import { TRAMOKYO_SETLIST } from "./installation-sequence";
import { SCRIPTED_TAKES } from "./pinned-takes";
import { getJourney, GLOBAL_SHADER_BLOCKLIST } from "./journeys";
import { VETTED_SHADER_POOL } from "./journey-casts.generated";
import { EXPANSION_LEADS } from "@/lib/shaders/shader-gain.generated";
import { getJourneyEngine } from "./journey-engine";
import {
  SHADER_LOOP_CAP, SHADER_NAMED_CAPS, shaderLoopCap, AMBER_SHARE_MAX, isAmberShader, SHADER_BANNED_EVERYWHERE,
  FIRST_LIGHT_ID, GRASSHOPPER_ID, BATH_ID, SURROUNDED_BY_LIGHT_IDS, SHADER_JOURNEY_BANS, SHADER_JOURNEY_MUSTS,
  LIGHT_FAVOURED, LIGHT_JOURNEY_IDS, KIN_BORROW_AVOID, SECONDS_PER_VOICE,
} from "./shader-balance";
import type { Journey } from "./types";

// Loop-wide shader balance (Karel 2026-10-12): amber hues were ~37 % of every
// cast appearance, magma / parsec / ember in 14-16 journeys each, dharma in 13
// ("once in a great while ok"), First Light opened its expansion on dharma.
// Casts are written by scripts/rebalance-shader-casts.mjs; this guards them.
const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const expansion = read("scripts/expansion-recast.json") as { journeys: { id: string; title: string; lead: string; cast: Record<string, (string | null)[]> }[] };
const featured = read("scripts/featured-recast.json") as { journeys: { id: string; name: string; dur: number; cast: Record<string, string[]>; longPhaseVoices?: boolean }[] };
const expById = new Map(expansion.journeys.map((j) => [j.id, j]));

/** Every loop journey's roster (mastered takes are fixed but count). */
const loop = TRAMOKYO_SETLIST.map((id) => {
  if (SCRIPTED_TAKES[id]) return { id, name: id, mastered: true, modes: new Set(SCRIPTED_TAKES[id].map((e) => e.mode).filter(Boolean)) };
  const e = expById.get(id);
  if (e) return { id, name: e.title, mastered: false, modes: new Set(Object.values(e.cast).flat().filter((m): m is string => !!m)) };
  const c = JOURNEY_CASTS[id];
  return { id, name: c?.name ?? id, mastered: false, modes: new Set(c ? Object.values(c.cast).flat() : []) };
});
const holders = (m: string) => loop.filter((j) => j.modes.has(m)).map((j) => j.name);

describe("shader balance across the kiosk loop", () => {
  it("every loop journey has a cast", () => {
    for (const j of loop) expect(j.modes.size, j.name).toBeGreaterThan(0);
  });

  it(`caps every shader at ${SHADER_LOOP_CAP} loop journeys, the over-seen ones tighter`, () => {
    const n = new Map<string, number>();
    for (const j of loop) for (const m of j.modes) n.set(m, (n.get(m) ?? 0) + 1);
    for (const [m, c] of n) expect(c, `${m} in ${holders(m).join(", ")}`).toBeLessThanOrEqual(shaderLoopCap(m));
    for (const cap of Object.values(SHADER_NAMED_CAPS)) expect(cap).toBeLessThanOrEqual(5);
  });

  it(`keeps amber (gold + ember hues, parsec) at <= ${AMBER_SHARE_MAX * 100} % of cast appearances`, () => {
    let all = 0, amber = 0;
    for (const j of loop) if (!j.mastered) for (const m of j.modes) { all++; if (isAmberShader(m)) amber++; }
    expect(amber / all).toBeLessThanOrEqual(AMBER_SHARE_MAX);
    // parsec reads violet in the GLSL analysis but on screen it is amber (Karel)
    expect(isAmberShader("parsec")).toBe(true);
    expect(isAmberShader("magma")).toBe(true);
    expect(isAmberShader("zenith")).toBe(false);
  });

  it("dharma (the spinning wheel) is gone: \"i cant stand dharma in resonance\" (Karel 2026-10-13)", () => {
    expect(holders("dharma")).toEqual([]);
    expect(SHADER_NAMED_CAPS.dharma).toBe(0);
    expect(SHADER_BANNED_EVERYWHERE.has("dharma")).toBe(true);
    expect(GLOBAL_SHADER_BLOCKLIST).toContain("dharma");
    expect(VETTED_SHADER_POOL.has("dharma")).toBe(false);
    for (const j of featured.journeys) expect(Object.values(j.cast).flat(), j.name).not.toContain("dharma");
    for (const j of expansion.journeys) { expect(j.lead, j.title).not.toBe("dharma"); expect(Object.values(j.cast).flat(), j.title).not.toContain("dharma"); }
    expect(Object.values(EXPANSION_LEADS)).not.toContain("dharma");
    expect(loop.find((j) => j.id === FIRST_LIGHT_ID)!.modes.has("aureole")).toBe(true);
  });

  it("SERAPH is pinned in First Light and every Surrounded by Light journey (Karel 2026-10-13)", () => {
    for (const id of [FIRST_LIGHT_ID, ...SURROUNDED_BY_LIGHT_IDS]) expect(SHADER_JOURNEY_MUSTS[id], id).toContain("seraph");
    const inLoop = [FIRST_LIGHT_ID, ...SURROUNDED_BY_LIGHT_IDS].filter((id) => TRAMOKYO_SETLIST.includes(id));
    expect(inLoop.length).toBe(4); // First Light, both album Surrounded By Light, Surrounded by Light 6
    for (const id of inLoop) {
      const j = loop.find((x) => x.id === id)!;
      expect(j.modes.has("seraph"), j.name).toBe(true);
    }
    // the parked takes (19, 3) carry it in the pack (apply step's `ensure`)
    const apply = read("scripts/shader-recast-2026-10-13.expansion-casts.json") as { ensure: Record<string, { musts: string[] }> };
    for (const id of SURROUNDED_BY_LIGHT_IDS.filter((x) => !TRAMOKYO_SETLIST.includes(x))) expect(apply.ensure[id]?.musts, id).toContain("seraph");
  });

  it("Bath never casts ember or parsec (\"no ember 3d plane moving shader in bath\")", () => {
    expect(SHADER_JOURNEY_BANS[BATH_ID]).toEqual(expect.arrayContaining(["ember", "parsec"]));
    const bath = loop.find((j) => j.id === BATH_ID)!;
    expect(bath.modes.has("ember")).toBe(false);
    expect(bath.modes.has("parsec")).toBe(false);
  });

  it("honours every per-journey ban and must (Grasshopper: no parsec)", () => {
    for (const [id, bans] of Object.entries(SHADER_JOURNEY_BANS)) {
      const j = loop.find((x) => x.id === id)!;
      for (const b of bans) expect(j.modes.has(b), `${j.name}: ${b}`).toBe(false);
    }
    for (const [id, musts] of Object.entries(SHADER_JOURNEY_MUSTS)) {
      const j = loop.find((x) => x.id === id);
      if (!j) continue; // parked takes: pack only (see the seraph test)
      for (const m of musts) expect(j.modes.has(m), `${j.name}: ${m}`).toBe(true);
    }
  });

  it("every light-themed journey casts a light-ray shader (zenith / seraph)", () => {
    for (const id of LIGHT_JOURNEY_IDS) {
      const j = loop.find((x) => x.id === id);
      expect(j, id).toBeDefined();
      expect(LIGHT_FAVOURED.some((m) => j!.modes.has(m)), j!.name).toBe(true);
    }
  });

  it("Grasshopper's long illumination phase has one voice per SECONDS_PER_VOICE", () => {
    const g = featured.journeys.find((j) => j.id === GRASSHOPPER_ID)!;
    expect(g.longPhaseVoices).toBe(true);
    expect(g.cast.illumination.length).toBeGreaterThanOrEqual(Math.ceil(60 / SECONDS_PER_VOICE));
    expect(g.cast.illumination.some((m) => SHADER_NAMED_CAPS[m] != null)).toBe(false);
  });

  // The pack is gitignored: on the kiosk Mac it must carry the recast
  // Expansion casts (scripts/apply-shader-recast-2026-10-13.mjs).
  it("the Tramokyo pack plays the recast Expansion casts (where the pack exists)", () => {
    const path = join(process.cwd(), "public/tramokyo-pack/data/journeys.json");
    if (!existsSync(path)) return;
    const pack = JSON.parse(readFileSync(path, "utf8")) as { id: string; phases: { id: string; shaderModes: string[] }[] }[];
    for (const e of expansion.journeys) {
      const row = pack.find((r) => r.id === e.id);
      if (!row) continue;
      for (const p of row.phases) expect(p.shaderModes, `${e.title}/${p.id} — run scripts/apply-shader-recast-2026-10-13.mjs`).toEqual(e.cast[p.id]);
    }
  });
});

describe("the engine's kindred borrow leans cool and skips the over-seen", () => {
  type Peek = { journey: Journey | null; seenShaders: Set<string>; scriptedTake: boolean; kinBorrow(live: Set<string | null>): string | null };
  afterEach(() => getJourneyEngine().stop());

  function borrowAll(roster: string[], name = "Kin Test") {
    const base = getJourney("the-bloom")!;
    const engine = getJourneyEngine();
    engine.stop();
    const peek = engine as unknown as Peek;
    peek.journey = { ...base, id: "kin-test", name, phases: base.phases.map((p) => ({ ...p, shaderModes: [...roster] })) };
    peek.scriptedTake = false;
    peek.seenShaders = new Set(roster);
    const out: string[] = [];
    for (let i = 0; i < 200; i++) { const k = peek.kinBorrow(new Set()); if (!k) break; out.push(k); peek.seenShaders.add(k); }
    return out;
  }

  it("a mostly-cool roster with an amber member borrows every cool kin before any amber, never dharma / magma / parsec / ember", () => {
    const got = borrowAll(["aureole", "nadir", "r-mercury"]);
    const firstAmber = got.findIndex(isAmberShader);
    expect(firstAmber).toBeGreaterThan(5); // a long run of cool kin first
    expect(got.slice(firstAmber).some((m) => !isAmberShader(m))).toBe(false);
    for (const m of got) expect(KIN_BORROW_AVOID.has(m), m).toBe(false);
  });

  it("an amber roster may borrow amber kin, still never the over-seen", () => {
    const got = borrowAll(["aureole", "covenant", "kairos"]);
    expect(got.some(isAmberShader)).toBe(true);
    for (const m of got) expect(KIN_BORROW_AVOID.has(m), m).toBe(false);
  });

  it("even a scripted (mastered) take never borrows dharma", () => {
    const base = getJourney("the-bloom")!;
    const peek = getJourneyEngine() as unknown as Peek;
    peek.journey = { ...base, id: "kin-test", name: "Kin Test", phases: base.phases.map((p) => ({ ...p, shaderModes: ["aureole", "covenant", "kairos"] })) };
    peek.scriptedTake = true;
    peek.seenShaders = new Set(["aureole", "covenant", "kairos"]);
    for (let i = 0; i < 200; i++) { const k = peek.kinBorrow(new Set()); if (!k) break; expect(k).not.toBe("dharma"); peek.seenShaders.add(k); }
  });
});

describe("the engine honours the bans at pick time", () => {
  afterEach(() => { getJourneyEngine().stop(); vi.restoreAllMocks(); });

  it("Bath's finale-forced switch never lands on ember / parsec, nothing ever plays dharma", () => {
    // a Bath whose phases (stale pack / DB row) still hold the banned shaders
    const base = getJourney("the-bloom")!;
    const bath = { ...base, id: BATH_ID, name: "Bath", phases: base.phases.map((p) => ({ ...p, shaderModes: ["ember", "parsec", "dharma", "r-mercury", "meteor-rain", "will-o-wisp"] })) };
    const engine = getJourneyEngine();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    engine.start(bath, { seed: 11, trackDuration: 180 });
    const seen = new Set<string>();
    for (let i = 0; i <= 360; i++) {
      clock += 500;
      const f = engine.getFrame(i / 360);
      if (i % 30 === 0 && i > 300) engine.forceShaderSwitch(); // the finale's forced arrivals
      const g = engine.getFrame(i / 360);
      for (const fr of [f, g]) if (fr) for (const m of [fr.shaderMode, fr.dualShaderMode, fr.tertiaryShaderMode]) if (m) seen.add(m);
    }
    for (const banned of ["ember", "parsec", "dharma"]) expect(seen.has(banned), banned).toBe(false);
    expect(seen.size).toBeGreaterThan(0);
  });
});
