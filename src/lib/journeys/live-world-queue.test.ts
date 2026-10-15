import { describe, it, expect } from "vitest";
import { createWorldRequester } from "./live-world-queue";

describe("live 'next world' taps are never dropped (QA 2026-10-15)", () => {
  it("idle: runs at once", () => {
    let ran = 0;
    const r = createWorldRequester(() => false);
    expect(r.request(() => ran++)).toBe("ran");
    expect(ran).toBe(1);
  });
  it("mid-change (incl. right after entering Live): queued, then runs after the dip", () => {
    let busy = true, ran = 0;
    const r = createWorldRequester(() => busy);
    expect(r.request(() => ran++)).toBe("queued");
    expect(ran).toBe(0);
    busy = false;
    r.next()?.();
    expect(ran).toBe(1);
    expect(r.next()).toBeUndefined();
  });
  it("several taps queue in order, capped (a stuck finger can't stack minutes of dips)", () => {
    const order: number[] = [];
    const r = createWorldRequester(() => true, 3);
    for (let i = 0; i < 5; i++) r.request(() => order.push(i));
    expect(r.pending).toBe(3);
    let f; while ((f = r.next())) f();
    expect(order).toEqual([0, 1, 2]);
  });
});
