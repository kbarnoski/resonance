// VJ bridge core: the send loop, socket lifecycle and event derivation, with
// every browser dependency injected (client.ts wires the real ones), so the
// laws are unit-tested: off = no socket and no timer; sends are rate-gated
// and dropped (never queued up) when the socket backs up; events survive a
// rate-limited tick; nothing here runs inside requestAnimationFrame.

import { RateGate } from "./rate-gate.mjs";
import {
  BandSmoother, VJ_MAX_EVENTS_PER_FRAME, beatClock, beatCrossings, isContinuousStep, packFrame, timelineCrossings,
  type BeatClock, type VjConfig, type VjEvent, type VjSnapshot,
} from "./protocol";
import { VJ_TAP, type VjTap } from "./tap";

/** the parts of a browser WebSocket the bridge uses */
export interface WsLike {
  readyState: number;
  bufferedAmount: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}
const WS_OPEN = 1;

/** Show state the client reads each tick (store + journey engine + window). */
export interface VjShowState {
  time: number;
  duration: number;
  playing: boolean;
  holding: boolean;
  volume: number;
  label: string | null;
  bpm: number | null;
  journeyId: string | null;
  journeyName: string | null;
  phase: string | null;
  phaseIndex: number;
  phaseCount: number;
  phaseProgress: number;
  progress: number;
  themePalette: string[] | null;
  shader: string | null;
  dualShader: string | null;
  shaderOpacity: number;
  particlesOn: boolean;
  morphOn: boolean;
  morphProgress: number;
}

export interface VjDeps {
  createSocket(url: string): WsLike;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  now(): number;
  /** latest analyser bytes (the lead layer's tapped buffer, else a read) */
  spectrum(): ArrayLike<number> | null;
  show(): VjShowState;
  tap?: VjTap;
}

/** Above this many bytes waiting in the socket, frames are skipped. */
export const VJ_BACKPRESSURE_BYTES = 64 * 1024;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

export class VjBridgeCore {
  private ws: WsLike | null = null;
  private timer: unknown = null;
  private retry: unknown = null;
  private backoff = RECONNECT_MIN_MS;
  private gate: RateGate;
  private bands = new BandSmoother();
  private seq = 0;
  private lastTickMs = -1;
  private lastTime = NaN;
  private lastClock: BeatClock | null = null;
  private lastPhase = "";
  private lastJourney = "";
  private stopped = true;
  readonly stats = { sent: 0, skippedBackpressure: 0, rateLimited: 0, connects: 0, bytes: 0 };

  constructor(private readonly cfg: VjConfig, private readonly deps: VjDeps) {
    this.gate = new RateGate(cfg.hz);
  }

  private get tap(): VjTap {
    return this.deps.tap ?? VJ_TAP;
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WS_OPEN;
  }

  /** Off → does nothing at all (no socket, no timer). */
  start(): void {
    if (!this.cfg.on || !this.stopped) return;
    this.stopped = false;
    this.tap.on = true;
    this.connect();
    this.timer = this.deps.setInterval(() => this.tick(), Math.round(1000 / this.cfg.hz));
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.tap.on = false;
    this.tap.events.clear();
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    if (this.retry !== null) this.deps.clearTimeout(this.retry);
    this.timer = this.retry = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = null;
      ws.onmessage = null;
      try { ws.close(); } catch { /* already closed */ }
    }
  }

  private connect(): void {
    if (this.stopped) return;
    let ws: WsLike;
    try {
      ws = this.deps.createSocket(this.cfg.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS;
      this.stats.connects++;
      // nothing stale crosses a reconnect
      this.tap.events.clear();
      this.lastTime = NaN;
      this.lastClock = null;
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onmessage = null; // the relay's hello is informational
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retry !== null) return;
    const wait = this.backoff;
    this.backoff = Math.min(RECONNECT_MAX_MS, this.backoff * 2);
    this.retry = this.deps.setTimeout(() => {
      this.retry = null;
      this.connect();
    }, wait);
  }

  /** One send tick (timer-driven, never from requestAnimationFrame). */
  tick(): void {
    if (this.stopped) return;
    const now = this.deps.now();
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN) {
      // no relay: no work beyond keeping the queue bounded (VjEventQueue cap)
      this.lastTime = NaN;
      return;
    }
    if (!this.gate.allow(now)) { this.stats.rateLimited++; return; }
    if (ws.bufferedAmount > VJ_BACKPRESSURE_BYTES) {
      // the relay is not keeping up: skip (drop) this frame, keep events queued
      this.stats.skippedBackpressure++;
      return;
    }
    const dt = this.lastTickMs < 0 ? 1 / 20 : Math.min(1, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;

    const show = this.deps.show();
    const tap = this.tap;
    const bands = this.bands.step(this.deps.spectrum(), dt);
    const clock = beatClock(show.time, show.bpm);

    // derived events: journey / phase changes, phrase + cadence + beat crossings
    const derived: VjEvent[] = [];
    const jid = show.journeyId ?? "";
    if (jid && jid !== this.lastJourney) derived.push(["journey", jid, show.journeyName ?? ""]);
    if (jid !== this.lastJourney) this.lastPhase = "";
    this.lastJourney = jid;
    const ph = show.phase ?? "";
    if (ph && ph !== this.lastPhase) derived.push(["phase", ph, show.phaseIndex]);
    this.lastPhase = ph;
    const t0 = this.lastTime, t1 = show.time;
    if (show.playing && isContinuousStep(t0, t1)) {
      const sameJourney = !tap.journeyId || tap.journeyId === jid;
      if (sameJourney) {
        for (const e of timelineCrossings(tap.phraseTl?.events, t0, t1)) derived.push(["phrase", e.kind, e.action, e.strength, e.label]);
        const ends = (tap.breathTl?.phrases ?? []).filter((p) => p.cadence).map((p) => ({ t: p.end, peak: p.peak }));
        for (const c of timelineCrossings(ends, t0, t1)) derived.push(["cadence", c.peak]);
      }
      if (this.lastClock) derived.push(...beatCrossings(this.lastClock, clock, t0, t1));
    }
    this.lastTime = t1;
    this.lastClock = clock;

    const snap: VjSnapshot = {
      seq: ++this.seq,
      ms: now,
      bands,
      clock,
      playing: show.playing,
      holding: show.holding,
      time: show.time,
      duration: show.duration,
      volume: show.volume,
      label: show.label,
      journeyId: show.journeyId,
      journeyName: show.journeyName,
      phase: show.phase,
      phaseIndex: show.phaseIndex,
      phaseCount: show.phaseCount,
      phaseProgress: show.phaseProgress,
      progress: show.progress,
      themePalette: show.themePalette,
      imagePalette: tap.imagePalette,
      image: tap.image,
      emblem: tap.emblem,
      shader: show.shader,
      dualShader: show.dualShader,
      shaderOpacity: show.shaderOpacity,
      soul: tap.soul,
      particlesOn: show.particlesOn,
      swell: tap.swell,
      current: tap.current,
      breath: tap.breath,
      morphOn: show.morphOn,
      morphProgress: show.morphProgress,
      events: [...derived, ...tap.events.drain(Math.max(0, VJ_MAX_EVENTS_PER_FRAME - derived.length))],
    };
    const json = JSON.stringify(packFrame(snap));
    try {
      ws.send(json);
      this.stats.sent++;
      this.stats.bytes += json.length;
    } catch { /* closing — onclose reconnects */ }
  }
}
