// Virtual clock for the offline export (docs/export-4k.md).
//
// Time only moves when the exporter steps a frame: frame n sits at exactly
// n·1000/fps virtual ms (computed from the integer frame index — no drift).
// Timers fire in (due, creation) order with the clock jumping to each
// timer's due time, HTML nesting clamp included (a nested 0 ms chain
// becomes 4 ms, so a self-rescheduling setTimeout(0) can't spin forever
// inside one frame). rAF callbacks registered during a rAF run go to the
// NEXT frame, as in browsers.
//
// CONSTRAINT: concatenated into the page init script — no imports,
// top-level `export function` only.

export function createVirtualClock(opts) {
  const fps = Number(opts && opts.fps);
  if (!(fps > 0)) throw new Error(`createVirtualClock: bad fps ${opts && opts.fps}`);
  const epochMs = Number((opts && opts.epochMs) ?? 0);
  const onError = (opts && opts.onError) || ((e) => { throw e; });
  const maxFiringsPerFrame = (opts && opts.maxFiringsPerFrame) || 100000;

  let frame = 0;
  let nowMs = 0;
  let nextTimerId = 1;
  let seq = 0;
  let nesting = 0; // nesting level of the timer currently firing (0 = not in a timer)
  const timers = new Map(); // id -> { id, due, seq, fn, args, interval, nesting }
  let nextRafId = 1;
  let raf = new Map();
  let nextIdleId = 1;
  let idle = new Map();

  const frameTime = (n) => (n * 1000) / fps;

  function addTimer(fn, ms, args, repeat) {
    let delay = Number(ms);
    if (!(delay > 0)) delay = 0;
    const lvl = nesting + 1;
    if (lvl > 5 && delay < 4) delay = 4;
    const id = nextTimerId++;
    timers.set(id, { id, due: nowMs + delay, seq: seq++, fn, args, interval: repeat ? delay : null, nesting: lvl });
    return id;
  }

  function nextDue(limit) {
    let best = null;
    for (const t of timers.values()) {
      if (t.due > limit) continue;
      if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
    }
    return best;
  }

  return {
    fps,
    frameMs: 1000 / fps,
    /** Virtual performance.now(). */
    now: () => nowMs,
    /** Virtual Date.now() (ms since epoch, integer like the real one). */
    dateNow: () => Math.floor(epochMs + nowMs),
    frame: () => frame,
    frameTime,

    setTimeout: (fn, ms, ...args) => addTimer(fn, ms, args, false),
    setInterval: (fn, ms, ...args) => addTimer(fn, ms, args, true),
    clearTimer: (id) => { timers.delete(id); },
    pendingTimers: () => timers.size,

    requestAnimationFrame: (cb) => { const id = nextRafId++; raf.set(id, cb); return id; },
    cancelAnimationFrame: (id) => { raf.delete(id); },
    pendingAnimationFrames: () => raf.size,

    requestIdleCallback: (cb) => { const id = nextIdleId++; idle.set(id, cb); return id; },
    cancelIdleCallback: (id) => { idle.delete(id); },

    /** Advance the frame counter; returns the new frame's virtual ms. Timers do not fire yet. */
    beginFrame() {
      frame += 1;
      return frameTime(frame);
    },

    /**
     * Fire every timer due at or before `targetMs`, the clock jumping to
     * each due time. `between` (optional, may be async) runs after each
     * callback — the page passes a microtask flush.
     */
    async runTimersUntil(targetMs, between) {
      let fired = 0;
      for (;;) {
        const t = nextDue(targetMs);
        if (!t) break;
        if (++fired > maxFiringsPerFrame) {
          throw new Error(`virtual clock: more than ${maxFiringsPerFrame} timer firings in one frame (runaway timer loop)`);
        }
        if (t.due > nowMs) nowMs = t.due;
        if (t.interval !== null) {
          // re-armed before the callback (clearInterval inside it still wins);
          // each repetition nests one level deeper → the 4 ms clamp kicks in
          t.nesting += 1;
          if (t.nesting > 5 && t.interval < 4) t.interval = 4;
          t.due = nowMs + t.interval;
          t.seq = seq++;
        } else timers.delete(t.id);
        const prevNesting = nesting;
        nesting = t.interval !== null ? t.nesting - 1 : t.nesting;
        try {
          if (typeof t.fn === "function") t.fn(...t.args);
        } catch (e) {
          onError(e);
        } finally {
          nesting = prevNesting;
        }
        if (between) await between();
      }
      if (targetMs > nowMs) nowMs = targetMs;
    },

    /** Run the rAF callbacks queued before this call, with `timestamp`. */
    runAnimationFrames(timestamp) {
      const batch = raf;
      raf = new Map();
      for (const cb of batch.values()) {
        try { cb(timestamp); } catch (e) { onError(e); }
      }
      return batch.size;
    },

    /** Run queued idle callbacks (once per frame, after rAF). */
    runIdleCallbacks() {
      const batch = idle;
      idle = new Map();
      const deadline = { didTimeout: false, timeRemaining: () => 50 };
      for (const cb of batch.values()) {
        try { cb(deadline); } catch (e) { onError(e); }
      }
      return batch.size;
    },
  };
}

/** Mulberry32 — the same PRNG as src/lib/journeys/seeded-random.ts. */
export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
