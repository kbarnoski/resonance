import { describe, it, expect, vi, afterEach } from "vitest";
import { reconcile, mergeView, PENDING_MAX_MS, type Pending, type PresenterReport } from "./presenter-optimistic";

const report = (o: Partial<PresenterReport> = {}): PresenterReport => ({
  playback: "manual", holdOn: "ending", status: "playing", setId: "ra",
  current: { journeyId: "ghost", programId: "ra", name: "Ghost" }, cued: null, next: null, ...o,
});
const ref = (journeyId: string, programId = "ra") => ({ journeyId, programId, name: journeyId });

describe("phone optimistic UI — taps show at once, never jump back unless the kiosk disagrees", () => {
  it("a tap shows immediately, before any kiosk report", () => {
    const p: Pending = { playback: { v: "auto", at: 0 } };
    expect(mergeView(report(), p, { setId: "ra" }).playback).toBe("auto");
  });
  it("a stale report (sent before the command landed) does not move it back", () => {
    const p: Pending = { playback: { v: "auto", at: 0 } };
    const r = reconcile(p, report({ playback: "manual" }), 2_000);
    expect(mergeView(report({ playback: "manual" }), r, { setId: "ra" }).playback).toBe("auto");
  });
  it("confirmed by the kiosk: the pending choice is dropped, and nothing moves", () => {
    const p: Pending = { playback: { v: "auto", at: 0 }, cued: { v: ref("spectre", "ml"), at: 0 } };
    const r = reconcile(p, report({ playback: "auto", cued: ref("spectre", "ml") }), 500);
    expect(r).toEqual({});
    expect(mergeView(report({ playback: "auto", cued: ref("spectre", "ml") }), r, { setId: "ra" })).toMatchObject({ playback: "auto", cued: { journeyId: "spectre" } });
  });
  it("the kiosk never confirms: after the window the kiosk's truth shows", () => {
    const p: Pending = { playback: { v: "auto", at: 0 } };
    expect(reconcile(p, report(), PENDING_MAX_MS + 1)).toEqual({});
  });
  it("Next / Play: 'going' at once, until the kiosk moves (status or track change)", () => {
    const p: Pending = { action: { v: "going", at: 0, fromStatus: "holding", fromCurrent: "ghost" } };
    expect(mergeView(report({ status: "holding" }), p, { setId: "ra" }).status).toBe("going");
    expect(reconcile(p, report({ status: "holding" }), 300).action).toBeDefined();
    expect(reconcile(p, report({ status: "going" }), 300).action).toBeUndefined();
    expect(reconcile(p, report({ status: "playing", current: ref("first-snow") }), 300).action).toBeUndefined();
  });
  it("clearing a pick (null) is optimistic too", () => {
    const p: Pending = { cued: { v: null, at: 0 } };
    expect(mergeView(report({ cued: ref("spectre") }), p, { setId: "ra" }).cued).toBeNull();
    expect(reconcile(p, report({ cued: null }), 100)).toEqual({});
  });
});

// The bus: a phone command reaches a parked kiosk long-poll in milliseconds,
// and the phone's fast poll carries the set + track lists only when they change.
describe("remote bus — long-poll delivery + light status", () => {
  afterEach(() => { vi.unstubAllEnvs(); delete (globalThis as Record<string, unknown>).__packRemoteBus; vi.resetModules(); });

  it("measured: command → parked kiosk poll < 50 ms; idle poll parks ≤ 1.5 s", async () => {
    vi.stubEnv("OFFLINE_PACK", "1");
    vi.resetModules();
    const { POST, GET } = await import("@/app/api/pack/remote/route");
    const kiosk = (status: Record<string, unknown>) =>
      POST(new Request("http://k/api/pack/remote?wait=1", { method: "POST", body: JSON.stringify({ role: "kiosk", status }) }));
    const phone = (command: string) =>
      POST(new Request("http://k/api/pack/remote", { method: "POST", body: JSON.stringify({ command }) }));

    // idle: the kiosk's poll parks ~1.5 s and returns empty
    let t0 = performance.now();
    const idle = await (await kiosk({ programs: [{ id: "ra" }] })).json();
    const parked = performance.now() - t0;
    expect(idle.commands).toEqual([]);
    expect(parked).toBeGreaterThan(1_300);
    expect(parked).toBeLessThan(1_800);

    // a tap while the kiosk is parked: delivered at once
    const pending = kiosk({ programs: [{ id: "ra" }] });
    await new Promise((r) => setTimeout(r, 100));
    t0 = performance.now();
    await phone("next");
    const got = await (await pending).json();
    const latency = performance.now() - t0;
    expect(got.commands).toEqual(["next"]);
    expect(latency).toBeLessThan(50);
    // eslint-disable-next-line no-console
    console.log(`[bus] command → kiosk ${latency.toFixed(1)} ms (was up to 2000 ms polling)`);

    // the phone's fast poll: lists only when they changed
    const first = await (await GET(new Request("http://k/api/pack/remote?have=0"))).json();
    expect(first.status.programs).toEqual([{ id: "ra" }]);
    const again = await (await GET(new Request(`http://k/api/pack/remote?have=${first.programsRev}`))).json();
    expect(again.status.programs).toBeUndefined();
    expect(JSON.stringify(again).length).toBeLessThan(JSON.stringify(first).length);
  }, 10_000);
});
