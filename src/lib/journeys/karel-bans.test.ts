/**
 * Karel's personal shader bans hold inside scripted takes (2026-10-13:
 * credo played at Realized @p0.382 as a scripted entry — "i said to ban
 * this shader from resonance").
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const logs: [string, string][] = [];
vi.mock("./glitch-recorder", () => ({
  glitchRecord: (type: string, detail: string) => { logs.push([type, String(detail ?? "")]); },
}));

import { getJourneyEngine } from "./journey-engine";
import { getJourney, GLOBAL_SHADER_BLOCKLIST, KAREL_BANNED_SHADERS } from "./journeys";
import { SCRIPTED_TAKES, TAKE_FINALE_SHADERS } from "./pinned-takes";
import type { TakeScriptEntry } from "./pinned-takes";
import type { Journey } from "./types";

function run(journey: Journey, script: TakeScriptEntry[]) {
  const engine = getJourneyEngine();
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  engine.start(journey, { seed: 7, trackDuration: 240, script });
  const seen: string[] = [];
  for (let i = 0; i <= 400; i++) {
    clock += 600;
    const f = engine.getFrame(i / 400);
    if (f) for (const m of [f.shaderMode, f.dualShaderMode, f.tertiaryShaderMode]) if (m) seen.push(m);
  }
  return seen;
}

describe("Karel's personal bans (KAREL_BANNED_SHADERS)", () => {
  afterEach(() => { getJourneyEngine().stop(); vi.restoreAllMocks(); logs.length = 0; });

  it("lists exactly his four asked-for bans, all in the global blocklist", () => {
    expect([...KAREL_BANNED_SHADERS].sort()).toEqual(["biofilm", "credo", "dharma", "r3-monsoonveil"]);
    for (const m of KAREL_BANNED_SHADERS) expect(GLOBAL_SHADER_BLOCKLIST, m).toContain(m);
  });

  it("no pinned/scripted take or finale shader names one", () => {
    for (const [id, take] of Object.entries(SCRIPTED_TAKES)) {
      for (const e of take) expect(KAREL_BANNED_SHADERS.has(e.mode), `${id} @p${e.p} ${e.mode}`).toBe(false);
    }
    for (const [id, m] of Object.entries(TAKE_FINALE_SHADERS)) expect(KAREL_BANNED_SHADERS.has(m), id).toBe(false);
  });

  it("every scripted take / finale shader still exists (banned shaders deleted from the code 2026-10-13)", async () => {
    const { SHADERS } = await import("@/lib/shaders");
    for (const [id, take] of Object.entries(SCRIPTED_TAKES)) {
      for (const e of take) if (e.mode) expect(SHADERS, `${id} @p${e.p} ${e.mode}`).toHaveProperty([e.mode]);
    }
    for (const [id, m] of Object.entries(TAKE_FINALE_SHADERS)) expect(SHADERS, id).toHaveProperty([m]);
    // Ghost's ending keeps r-petals (Karel 2026-10-13: "the one for ghost has to stay for ghost")
    expect(SCRIPTED_TAKES["ghost"].some((e) => e.mode === "r-petals")).toBe(true);
  });

  it("a scripted entry naming credo plays a deterministic cast replacement, logged", () => {
    const base = getJourney("inferno")!;
    const realized = { ...base, phases: base.phases.map((p) => ({ ...p, shaderModes: ["credo", "ember", "redshift", "singularity", "lectio", "parsec"] })) };
    const script: TakeScriptEntry[] = [
      { p: 0, role: "primary", mode: "ember" },
      { p: 0.382, role: "primary", mode: "credo" },
      { p: 0.5, role: "dual", mode: "dharma" },
      { p: 0.6, role: "primary", mode: "redshift" },
    ];
    const seen = run(realized, script);
    for (const m of KAREL_BANNED_SHADERS) expect(seen, m).not.toContain(m);
    const line = logs.find(([t, d]) => t === "shader-primary" && d.includes("@p0.38"));
    expect(line?.[1]).toMatch(/\(scripted→replaced credo\)$/);
    const sub = line![1].split(" ")[0];
    expect(["singularity", "lectio", "parsec"]).toContain(sub); // the journey's own cast, never a take neighbour already scripted
    // deterministic: the same take recasts credo the same way every run
    getJourneyEngine().stop(); logs.length = 0;
    run(realized, script);
    expect(logs.find(([t, d]) => t === "shader-primary" && d.includes("@p0.38"))?.[1].split(" ")[0]).toBe(sub);
  });

  it("the real Realized take never plays credo (its banned catacomb-torch slot recast)", () => {
    const base = getJourney("inferno")!;
    const realized = { ...base, phases: base.phases.map((p) => ({ ...p, shaderModes: ["credo", ...p.shaderModes] })) };
    const seen = run(realized, SCRIPTED_TAKES["inferno"]);
    expect(seen).not.toContain("credo");
    expect(seen.length).toBeGreaterThan(0);
  });

  it("the wider wash list is NOT applied to scripted takes (recorded entries kept)", () => {
    const base = getJourney("inferno")!;
    const seen = run(base, [{ p: 0, role: "primary", mode: "ember" }, { p: 0.3, role: "primary", mode: "r-petals" }]); // r-petals: globally blocked, kept for Ghost's take
    expect(seen).toContain("r-petals");
    expect(logs.some(([t, d]) => t === "shader-primary" && d.startsWith("r-petals") && d.endsWith("(scripted)"))).toBe(true);
  });
});
