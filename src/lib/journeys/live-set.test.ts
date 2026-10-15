import { describe, it, expect } from "vitest";
import {
  isExcludedWorld, setWorldPool, rankWorlds, worldChangeTimes, planTrackWorlds, parseLiveSetCommand,
  SET_MIN_SCENE_S, SET_MAX_SCENE_S, type SetWorld,
} from "./live-set";
import { JOSEPH_SET_ORDER, JOSEPH_TRACKS, josephSet, josephTrackUrl } from "./joseph-set";
import type { Journey } from "./types";

const world = (id: string, name: string, prompt = "", extra: Partial<Journey> = {}): SetWorld =>
  ({
    journey: { id, name, description: "", phases: [{ aiPrompt: prompt, aiPromptSequence: [prompt] }], ...extra } as unknown as Journey,
    track: { id: `t-${id}` },
  });

const POOL: SetWorld[] = [
  world("ghost", "Ghost", "storm ocean cliff wave lightning"),
  world("first-snow", "Snowflake", "storm ocean cliff wave"),
  world("9eb3df10-7835-4107-b995-4c9ad6f2edf1", "Ghost", "storm sky"),
  world("1895014a-ce59-4640-aa23-b9421b588d70", "Snowflake", "storm sky"),
  world("borrow", "Borrowed", "storm ocean cliff", { localImageUrls: ["/tramokyo-pack/images/journeys/ghost/gen-001.jpg"] }),
  world("tempest", "The Tempest", "storm over a dark ocean, waves breaking on a cliff, lightning in the sky"),
  world("forge", "Realized", "fire and flame, molten ember, a blaze"),
  world("grove", "Redwoods Sway 2", "redwood trunks, a forest canopy, moss and fern, leaves"),
  world("mist", "Tranquility 3", "soft mist, still water, quiet haze"),
  world("bird", "Yellow Bird", "a bird in flight, wing and feather, the sky"),
  world("horse", "Horses 1", "storm ocean wave"),
  world("plain", "Night Wind 2", "grass and seeds in a night breeze"),
];
const track = (id: string) => JOSEPH_TRACKS.find((t) => t.id === id)!;
const MASTERED = new Set(["ghost", "first-snow", "9eb3df10-7835-4107-b995-4c9ad6f2edf1", "1895014a-ce59-4640-aa23-b9421b588d70", "borrow"]);

describe("joseph set — order + manifest", () => {
  it("plays 24 tracks in the draft order, every id known and unique", () => {
    const set = josephSet();
    expect(set).toHaveLength(24);
    expect(new Set(JOSEPH_SET_ORDER).size).toBe(JOSEPH_SET_ORDER.length);
    expect(set.map((t) => t.id)).toEqual(JOSEPH_SET_ORDER);
    expect(set[0].title).toBe("Closer to an end than a beginning");
    expect(set[2].title).toBe("You were the sky and I was the storm");
    expect(set[16].title).toBe("A better wish");
    expect(set[17].title).toBe("Time"); // "Time goes after better wish"
    expect(set[22].title).toBe("Faded Outlines");
    expect(set[23].title).toBe("Maybe");
  });
  it("uses the final 'Just for a moment', never the superseded one", () => {
    expect(JOSEPH_TRACKS.map((t) => t.file)).not.toContain("Just for a moment.m4a");
    expect(track("joseph-just-for-a-moment").file).toBe("Just for a moment (final).m4a");
  });
  it("display names: Faded Outlines + Closer now (II)", () => {
    expect(track("joseph-faded-outlines").file).toMatch(/FADED OUTLINES/);
    expect(track("joseph-closer-now-2").title).toBe("Closer now (II)");
  });
  it("reordering is just the array (ids never encode a position); unknown ids drop", () => {
    expect(josephSet(["joseph-maybe", "nope", "joseph-time"]).map((t) => t.title)).toEqual(["Maybe", "Time"]);
    expect(JOSEPH_TRACKS.every((t) => !/\d{2}/.test(t.id.replace("closer-now-2", "")))).toBe(true);
  });
  it("serves from the local pack only (never Supabase / /api/audio)", () => {
    expect(josephTrackUrl("joseph-maybe")).toBe("/tramokyo-pack/joseph/joseph-maybe.m4a");
    for (const t of JOSEPH_TRACKS) expect(t.duration).toBeGreaterThan(120);
  });
  it("only Teaching birds to fly may use bird worlds", () => {
    expect(JOSEPH_TRACKS.filter((t) => t.birds).map((t) => t.id)).toEqual(["joseph-teaching-birds-to-fly"]);
  });
});

describe("live set — world exclusions", () => {
  it("never Snowflake or Ghost (ids, DB copies, names, their pack imagery)", () => {
    for (const w of POOL) if (MASTERED.has(w.journey.id)) expect(isExcludedWorld(w.journey)).toBe(true);
    expect(isExcludedWorld({ id: "x", name: "Ghost (alt)" })).toBe(true);
    expect(isExcludedWorld({ id: "x", name: "Snowflake" })).toBe(true);
    expect(isExcludedWorld({ id: "x", name: "y", localImageUrls: ["/tramokyo-pack/images/journeys/first-snow/a.jpg"] })).toBe(true);
    expect(isExcludedWorld({ id: "tempest", name: "The Tempest" })).toBe(false);
  });
  it("every track's ranking and plan stays clear of them, of horses, and of birds unless asked", () => {
    for (const t of josephSet()) {
      const ids = rankWorlds(t, "intense", POOL).map((r) => r.world.journey.id);
      for (const m of MASTERED) expect(ids).not.toContain(m);
      expect(ids).not.toContain("horse");
      if (!t.birds) expect(ids).not.toContain("bird");
      const plan = planTrackWorlds(t, { id: t.id, duration: t.duration, sections: [] }, POOL, []);
      for (const p of plan) expect(MASTERED.has(p.world.journey.id) || p.world.journey.id === "horse").toBe(false);
    }
    expect(setWorldPool(POOL, track("joseph-teaching-birds-to-fly")).map((w) => w.journey.id)).toContain("bird");
  });
  it("matches worlds to the music's character", () => {
    expect(rankWorlds(track("joseph-sky-and-storm"), "calm", POOL)[0].world.journey.id).toBe("tempest");
    expect(rankWorlds(track("joseph-burning-bush"), "intense", POOL)[0].world.journey.id).toBe("forge");
    expect(rankWorlds(track("joseph-whispers-in-the-trees"), "building", POOL)[0].world.journey.id).toBe("grove");
    expect(rankWorlds(track("joseph-teaching-birds-to-fly"), "building", POOL)[0].world.journey.id).toBe("bird");
  });
});

describe("live set — scene timing", () => {
  it("changes on section boundaries, spaced, capped, never in the last 30 s", () => {
    const t = worldChangeTimes({
      duration: 520,
      sections: [
        { start: 0, end: 32, energy: "low" }, { start: 32, end: 86, energy: "low" }, { start: 86, end: 233, energy: "mid" },
        { start: 233, end: 279, energy: "high" }, { start: 279, end: 484, energy: "high" }, { start: 484, end: 520, energy: "low" },
      ],
    });
    expect(t[0]).toEqual({ at: 0, energy: "low" });
    for (let i = 1; i < t.length; i++) expect(t[i].at - t[i - 1].at).toBeGreaterThanOrEqual(SET_MIN_SCENE_S - 0.2);
    const edges = [...t.map((x) => x.at), 520];
    for (let i = 1; i < edges.length; i++) expect(edges[i] - edges[i - 1]).toBeLessThanOrEqual(SET_MAX_SCENE_S + 30);
    expect(t.every((x) => x.at === 0 || 520 - x.at >= 30)).toBe(true);
    expect(t.map((x) => x.at)).toContain(233);
    expect(t.find((x) => x.at === 233)!.energy).toBe("high");
  });
  it("without analysis: ~150 s scenes", () => {
    expect(worldChangeTimes({ duration: 300, sections: [] }).map((x) => x.at)).toEqual([0, 150]);
  });
  it("a track OPENS on its best match even if shown a while ago — only not the world on screen", () => {
    const bush = track("joseph-burning-bush");
    const a = { id: bush.id, duration: 374, arc: "intense" as const, sections: [{ start: 0, end: 60, energy: "low" as const }, { start: 60, end: 374, energy: "high" as const }] };
    expect(planTrackWorlds(bush, a, POOL, ["forge", "mist"])[0].world.journey.id).toBe("forge");
    expect(planTrackWorlds(bush, a, POOL, ["mist", "forge"])[0].world.journey.id).not.toBe("forge");
  });
  it("one world never shows twice in a track, even as a builtin + DB copy", () => {
    const dup = [...POOL, world("forge-db", "Realized", "fire and flame, molten ember, a blaze")];
    const plan = planTrackWorlds(track("joseph-burning-bush"), { id: "x", duration: 700, sections: [] }, dup, []);
    expect(plan.filter((p) => p.world.journey.name === "Realized")).toHaveLength(1);
  });
  it("no world twice in a track, recent worlds avoided", () => {
    const plan = planTrackWorlds(track("joseph-in-motion"), { id: "x", duration: 600, sections: [] }, POOL, ["tempest"]);
    const ids = plan.map((p) => p.world.journey.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).not.toBe("tempest");
  });
});

describe("live set — phone commands", () => {
  it("parses liveset:joseph / @N / world", () => {
    expect(parseLiveSetCommand("liveset:joseph")).toEqual({ type: "start", set: "joseph", at: 1 });
    expect(parseLiveSetCommand("liveset:joseph@9")).toEqual({ type: "start", set: "joseph", at: 9 });
    expect(parseLiveSetCommand("liveset:joseph@99")).toEqual({ type: "start", set: "joseph", at: 24 });
    expect(parseLiveSetCommand("liveset:joseph@0")).toEqual({ type: "start", set: "joseph", at: 1 });
    expect(parseLiveSetCommand("liveset:world")).toEqual({ type: "world" });
  });
  it("rejects anything else", () => {
    for (const c of ["liveset:", "liveset:nobody", "liveset:joseph@x", "live", "skip", "jump:ghost", "liveset:joseph@9@1"]) {
      expect(parseLiveSetCommand(c)).toBeNull();
    }
  });
});

import { josephTrackGain, JOSEPH_LUFS } from "./joseph-set";

describe("joseph set — level matching (QA 2026-10-15)", () => {
  it("every track is measured", () => {
    for (const t of JOSEPH_TRACKS) expect(JOSEPH_LUFS[t.id], t.id).toBeTypeOf("number");
  });
  it("attenuate-only: never a boost, hot tracks trimmed into the set", () => {
    for (const t of JOSEPH_TRACKS) {
      const g = josephTrackGain(t.id);
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(1);
      // after the trim no track sits above the target
      expect(JOSEPH_LUFS[t.id] + 20 * Math.log10(g)).toBeLessThanOrEqual(-13 + 1e-9);
    }
    expect(20 * Math.log10(josephTrackGain("joseph-i-am"))).toBeCloseTo(-4.9, 1);
    expect(josephTrackGain("joseph-road-less-traveled")).toBe(1);
    expect(josephTrackGain("unknown")).toBe(1);
  });
});
