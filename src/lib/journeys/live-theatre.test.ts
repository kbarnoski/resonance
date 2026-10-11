import { describe, it, expect } from "vitest";
import { liveWorldPool, pickLiveWorld, LIVE_SCENE_MS, LIVE_VEIL_MS } from "./live-theatre";
import type { InstallationProgram, SequenceEntry } from "@/components/audio/installation-loop-client";

const entry = (id: string, track = true): SequenceEntry =>
  ({ journey: { id, name: id }, track: track ? { id: `t-${id}`, title: id, audioUrl: `/a/${id}`, duration: 200 } : null } as unknown as SequenceEntry);
const prog = (id: string, ids: string[]): InstallationProgram =>
  ({ id, presenting: id, description: "", sequence: ids.map((j) => entry(j)) } as unknown as InstallationProgram);

describe("live theatre worlds", () => {
  it("pools every distinct playable world, never the mastered EP worlds", () => {
    const pool = liveWorldPool([prog("ra", ["a", "b", "first-snow", "ghost"]), prog("x", ["b", "c"])]);
    expect(pool.map((e) => e.journey.id)).toEqual(["a", "b", "c"]);
    const unpaired = liveWorldPool([{ ...prog("y", []), sequence: [entry("d", false)] } as InstallationProgram]);
    expect(unpaired).toEqual([]);
  });
  it("never repeats a recent world while fresh ones remain", () => {
    const pool = ["a", "b", "c", "d", "e"].map((j) => entry(j));
    const hist: string[] = [];
    let r = 0;
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 40; i++) {
      const w = pickLiveWorld(pool, hist, rand)!;
      expect(hist.slice(-4)).not.toContain(w.journey.id);
      hist.push(w.journey.id);
    }
  });
  it("handles tiny and empty pools", () => {
    expect(pickLiveWorld([], [], Math.random)).toBeNull();
    expect(pickLiveWorld([entry("a")], ["a"], Math.random)!.journey.id).toBe("a");
  });
  it("scene changes are slow (minutes per world, multi-second dips)", () => {
    expect(LIVE_SCENE_MS).toBeGreaterThanOrEqual(120_000);
    expect(LIVE_VEIL_MS).toBeGreaterThanOrEqual(2_000);
  });
});
