// "Next world" requests in Live Theatre (QA 2026-10-15): a tap that lands
// while a world change is in flight (the ~9 s dip → hold → fade) used to be
// silently dropped. Now it is queued (up to `max`) and runs as soon as the
// change in flight completes. Pure — tested in live-world-queue.test.ts.
export interface WorldRequester {
  /** Run now if idle; otherwise queue it. Returns "ran" | "queued" | "full". */
  request(run: () => void): "ran" | "queued" | "full";
  /** The change in flight finished: the next queued request (if any). */
  next(): (() => void) | undefined;
  readonly pending: number;
}

export function createWorldRequester(isBusy: () => boolean, max = 3): WorldRequester {
  const q: (() => void)[] = [];
  return {
    request(run) {
      if (!isBusy()) { run(); return "ran"; }
      if (q.length >= max) return "full";
      q.push(run);
      return "queued";
    },
    next() { return q.shift(); },
    get pending() { return q.length; },
  };
}
