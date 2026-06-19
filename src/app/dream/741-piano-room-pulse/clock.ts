// clock.ts — the heart of this build: a SHARED, slowly-drifting pulse both
// devices agree on, NTP-style, so an ensemble LOCK emerges across ~80–150ms of
// network latency.
//
// Two problems, two layers:
//
//   1. CLOCK OFFSET. Phone A's Date.now() and Phone B's are not the same. We
//      exchange ping/pong timestamps and estimate `offset` (how far my clock is
//      from a shared reference) + `rtt` (round-trip time), NTP-style:
//
//          peer receives ping{t0}, replies pong{t0, t1=peerNow}
//          I receive pong at t3=myNow
//          rtt    = (t3 - t0)                          // round trip
//          offset = t1 - (t0 + rtt/2)                  // peer clock − my clock
//                                                      // at the midpoint
//
//      Smoothed over several samples (lowest-RTT samples trusted most), this
//      gives a stable `offset`. `sharedNow()` = local now + offset → a clock
//      both peers read the SAME value from.
//
//   2. SHARED PHASE. Given one shared clock + one agreed epoch + one BPM, BOTH
//      devices compute the identical `beatPhase(now)` with pure arithmetic — no
//      messages needed once the clock is locked. The metronome is emergent, not
//      transmitted. (This is the Ableton-Link idea: agree on a timeline, not on
//      individual hits.)
//
// All of this is plain math + a small amount of state — NO browser APIs at
// module top. `performance`/`Date` are only read inside methods called from the
// client.

export interface ClockState {
  offset: number; // ms: shared_now − local_now (peer/host clock − mine)
  rtt: number; // ms: smoothed round-trip estimate
  samples: number; // how many usable pong samples we've folded in
  locked: boolean; // have we got a trustworthy offset yet?
}

// A fixed shared epoch + tempo. Because both devices hardcode these, they derive
// the SAME beat grid from the same shared clock. (Epoch is arbitrary; only the
// difference matters.)
export const SHARED_EPOCH_MS = 1_700_000_000_000; // a fixed point in the past
export const BPM = 68; // gentle felt groove, 60–76 range
export const BEAT_MS = 60_000 / BPM; // ms per quarter-note beat
export const SUBBEATS = 2; // quantize to nearest 1/2 beat
export const SUBBEAT_MS = BEAT_MS / SUBBEATS;

export interface PingMsg {
  t0: number; // sender's local-now when ping left
  from: string;
}
export interface PongMsg {
  t0: number; // echoed: original ping send time (in asker's clock)
  t1: number; // responder's local-now when it replied
  from: string;
}

// Manages offset/rtt estimation from ping/pong exchanges + derives shared phase.
export class SharedClock {
  private offset = 0;
  private rtt = 90; // optimistic default until measured
  private sampleCount = 0;
  // keep the best (lowest-rtt) recent samples; their offsets are most accurate
  private best: Array<{ offset: number; rtt: number }> = [];

  // current local clock (ms). Wrapped so tests/headless never touch it directly.
  localNow(): number {
    return Date.now();
  }

  // The clock both peers agree on.
  sharedNow(): number {
    return this.localNow() + this.offset;
  }

  // Build a ping to send. Receiver should reply with makePong().
  makePing(from: string): PingMsg {
    return { t0: this.localNow(), from };
  }

  // Responder side: turn a received ping into a pong (stamp our local now).
  makePong(ping: PingMsg, from: string): PongMsg {
    return { t0: ping.t0, t1: this.localNow(), from };
  }

  // Asker side: fold a returned pong into the offset/rtt estimate (NTP-style).
  ingestPong(pong: PongMsg): void {
    const t3 = this.localNow();
    const rtt = t3 - pong.t0;
    if (rtt < 0 || rtt > 2000) return; // garbage / stale — ignore
    // peer clock − my clock, measured at the round-trip midpoint
    const sampleOffset = pong.t1 - (pong.t0 + rtt / 2);

    this.best.push({ offset: sampleOffset, rtt });
    // keep the 6 lowest-rtt samples
    this.best.sort((a, b) => a.rtt - b.rtt);
    if (this.best.length > 6) this.best.length = 6;

    // weighted mean: lower rtt → higher weight (1/(rtt+1))
    let wsum = 0;
    let osum = 0;
    let rsum = 0;
    for (const s of this.best) {
      const w = 1 / (s.rtt + 1);
      wsum += w;
      osum += w * s.offset;
      rsum += w * s.rtt;
    }
    const targetOffset = osum / wsum;
    const targetRtt = rsum / wsum;

    // gently slew toward the new estimate so the grid drifts, never jumps
    this.offset = this.offset === 0 && this.sampleCount === 0
      ? targetOffset
      : this.offset + (targetOffset - this.offset) * 0.4;
    this.rtt = this.rtt + (targetRtt - this.rtt) * 0.4;
    this.sampleCount++;
  }

  state(): ClockState {
    return {
      offset: this.offset,
      rtt: this.rtt,
      samples: this.sampleCount,
      locked: this.sampleCount >= 2,
    };
  }

  // ── Shared metronome (pure, identical on both devices) ──

  // Continuous beat number since the shared epoch (e.g. 1234.5 = halfway through
  // beat 1234). Both peers compute the SAME value from the same sharedNow().
  beatAt(sharedMs: number): number {
    return (sharedMs - SHARED_EPOCH_MS) / BEAT_MS;
  }

  // Phase within the current beat, 0..1 — drives the breathing pulse ring.
  beatPhase(sharedMs: number): number {
    const b = this.beatAt(sharedMs);
    return b - Math.floor(b);
  }

  // Quantize a desired SHARED sounding time to the nearest sub-beat, with a soft
  // humanize so the lock feels alive, not robotic. Returns a SHARED-clock ms.
  // `humanizeMs`: small +/- jitter (caller passes ~8–14ms).
  quantizeShared(desiredSharedMs: number, humanizeMs: number): number {
    const subIndex = Math.round(
      (desiredSharedMs - SHARED_EPOCH_MS) / SUBBEAT_MS,
    );
    let snapped = SHARED_EPOCH_MS + subIndex * SUBBEAT_MS;
    // never schedule in the past relative to the request; nudge to next sub-beat
    if (snapped < desiredSharedMs - SUBBEAT_MS * 0.5) snapped += SUBBEAT_MS;
    const jitter = (Math.random() * 2 - 1) * humanizeMs;
    return snapped + jitter;
  }

  // Convert a SHARED-clock ms into MY local-clock ms (for scheduling audio).
  sharedToLocal(sharedMs: number): number {
    return sharedMs - this.offset;
  }
}
