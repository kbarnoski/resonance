// Rate gate shared by the page sender and the relay: lets one tick through
// per period on average, never bursting after a stall (a long gap does not
// bank credit). Pure; the caller passes the clock.

export class RateGate {
  /** @param {number} hz maximum ticks per second (clamped 1..120) */
  constructor(hz) {
    this.setHz(hz);
    this.next = -Infinity;
    this.passed = 0;
    this.dropped = 0;
  }

  setHz(hz) {
    const h = Math.max(1, Math.min(120, Number(hz) || 20));
    this.hz = h;
    this.periodMs = 1000 / h;
  }

  /** true = go; false = too soon (counted as dropped). Keeps a schedule: a
   *  tick up to 10 % early (timer jitter) passes and the schedule advances by
   *  one period, so the average never exceeds hz; after a stall the schedule
   *  restarts from now (no banked credit, no burst). */
  allow(nowMs) {
    const p = this.periodMs;
    if (nowMs < this.next - p * 0.1) {
      this.dropped++;
      return false;
    }
    this.next = nowMs - this.next > p ? nowMs + p : this.next + p;
    this.passed++;
    return true;
  }
}
