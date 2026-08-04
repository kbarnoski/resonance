/**
 * Networking + partner-drivers for `6664-cohere`.
 *
 * Design law (Band-app-v2, 2026): send only CONTROL SIGNALS over the wire,
 * never audio. Both the synthetic GhostPeer and the real RtcPeer emit the
 * same tiny `{type:'orb', x, y, t}` messages; each browser synthesizes the
 * shared chord LOCALLY from both orb positions. That is what makes a
 * serverless browser duet feasible.
 *
 * Two implementations behind one `Peer` interface:
 *   - GhostPeer  — a musically intelligent ghost that drives the partner orb,
 *                  seeking consonance and occasionally leaning into tension
 *                  then resolving. Alive on load, zero setup.
 *   - RtcPeer    — a copy/paste WebRTC data channel (STUN only, no server).
 *
 * Nothing in here may throw into the render loop: every network path is
 * wrapped, and failures surface as on-brand status strings.
 */

export interface OrbMsg {
  type: "orb";
  x: number;
  y: number;
  t: number;
}

export interface Peer {
  readonly kind: "ghost" | "rtc";
  /** Feed this peer MY local orb position (control signal out). */
  send(msg: OrbMsg): void;
  /** Advance internal simulation (ghost only); called each animation frame. */
  tick(nowMs: number): void;
  /** Register a handler for the PARTNER orb position (control signal in). */
  onMessage(cb: (msg: OrbMsg) => void): void;
  /** Register a handler for human-readable status changes. */
  onStatus(cb: (status: string) => void): void;
  close(): void;
}

/* -------------------------------------------------------------------------- */
/* Seeded PRNG — house rule: never Math.random for art/behavior.              */
/* -------------------------------------------------------------------------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* GhostPeer — the ghost musician.                                            */
/* -------------------------------------------------------------------------- */

type GhostMode = "consonant" | "tension";

/**
 * A duet partner, not a random mover. It watches your orb and steers its own
 * toward musically meaningful positions relative to yours:
 *   - mostly `consonant`: nestles close to you (calm unisons / octaves bloom),
 *     offset by a pleasant scale interval;
 *   - occasionally `tension`: drifts wide (rich dissonance strains), then
 *     resolves back home. Motion is critically eased with a little living drift
 *     so it breathes rather than snaps.
 */
export class GhostPeer implements Peer {
  readonly kind = "ghost" as const;

  private rng: () => number;
  private a = { x: 0.32, y: 0.6 }; // last-known local (your) orb
  private pos = { x: 0.64, y: 0.42 }; // ghost orb
  private target = { x: 0.64, y: 0.42 };
  private mode: GhostMode = "consonant";
  private nextDecisionMs = 0;
  private lastEmitMs = 0;
  private phase: number;
  private msgCb: ((m: OrbMsg) => void) | null = null;
  private statusCb: ((s: string) => void) | null = null;

  constructor(seed = 0x6664c0) {
    this.rng = mulberry32(seed);
    this.phase = this.rng() * Math.PI * 2;
  }

  send(msg: OrbMsg): void {
    this.a.x = msg.x;
    this.a.y = msg.y;
  }

  onMessage(cb: (m: OrbMsg) => void): void {
    this.msgCb = cb;
  }

  onStatus(cb: (s: string) => void): void {
    this.statusCb = cb;
    cb("ghost duet — a partner is improvising with you");
  }

  private clamp(v: number): number {
    return v < 0.08 ? 0.08 : v > 0.92 ? 0.92 : v;
  }

  private decide(nowMs: number): void {
    // Weighted coin: mostly consonant, sometimes lean into tension.
    const leanTension = this.rng() < 0.32;
    this.mode = leanTension ? "tension" : "consonant";

    if (this.mode === "consonant") {
      // Nestle near you, offset by a small pleasant interval on x (a third /
      // a fifth in scale-steps) and a gentle register difference on y.
      const intervalOffsets = [0.0, 0.08, 0.16, -0.08, 0.24];
      const dx = intervalOffsets[Math.floor(this.rng() * intervalOffsets.length)];
      this.target.x = this.clamp(this.a.x + dx);
      // Slightly higher register than you (upper structure), staying close.
      this.target.y = this.clamp(this.a.y - 0.06 - this.rng() * 0.14);
      this.nextDecisionMs = nowMs + 2600 + this.rng() * 3200;
    } else {
      // Drift wide — the interval opens up, the chord strains.
      const away = this.rng() < 0.5 ? -1 : 1;
      this.target.x = this.clamp(this.a.x + away * (0.34 + this.rng() * 0.22));
      this.target.y = this.clamp(0.14 + this.rng() * 0.34);
      this.nextDecisionMs = nowMs + 1600 + this.rng() * 1800; // resolve sooner
    }
  }

  tick(nowMs: number): void {
    if (this.nextDecisionMs === 0) {
      this.nextDecisionMs = nowMs + 900;
    }
    if (nowMs >= this.nextDecisionMs) this.decide(nowMs);

    // Critically-eased approach toward the target.
    const ease = 0.045;
    this.pos.x += (this.target.x - this.pos.x) * ease;
    this.pos.y += (this.target.y - this.pos.y) * ease;

    // Living drift so it never sits perfectly still.
    this.phase += 0.017;
    const driftX = Math.sin(this.phase * 0.9) * 0.012;
    const driftY = Math.cos(this.phase * 0.7 + 1.3) * 0.010;

    const ex = this.clamp(this.pos.x + driftX);
    const ey = this.clamp(this.pos.y + driftY);

    // Emit control signal ~30 Hz.
    if (nowMs - this.lastEmitMs >= 33 && this.msgCb) {
      this.lastEmitMs = nowMs;
      this.msgCb({ type: "orb", x: ex, y: ey, t: nowMs });
    }
  }

  close(): void {
    this.msgCb = null;
    this.statusCb = null;
  }
}

/* -------------------------------------------------------------------------- */
/* RtcPeer — serverless copy/paste WebRTC.                                     */
/* -------------------------------------------------------------------------- */

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/** Resolve once ICE gathering finishes (with a safety timeout). */
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", check);
    // Fallback: STUN can dawdle; ship whatever candidates we have.
    setTimeout(finish, 3500);
  });
}

const encode = (d: RTCSessionDescription | RTCSessionDescriptionInit): string =>
  btoa(JSON.stringify(d));

const decode = (code: string): RTCSessionDescriptionInit =>
  JSON.parse(atob(code.trim()));

export class RtcPeer implements Peer {
  readonly kind = "rtc" as const;

  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private msgCb: ((m: OrbMsg) => void) | null = null;
  private statusCb: ((s: string) => void) | null = null;
  private openCb: (() => void) | null = null;
  private closed = false;

  private constructor(pc: RTCPeerConnection) {
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed" || s === "disconnected" || s === "closed") {
        this.emitStatus(`connection ${s} — reverting to ghost`);
      }
    };
  }

  private emitStatus(s: string): void {
    if (this.statusCb) this.statusCb(s);
  }

  private wireChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      this.emitStatus("connected — a real partner is holding the chord with you");
      if (this.openCb) this.openCb();
    };
    dc.onclose = () => this.emitStatus("partner left — reverting to ghost");
    dc.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data) as OrbMsg;
        if (m && m.type === "orb" && this.msgCb) this.msgCb(m);
      } catch {
        /* ignore malformed control frames */
      }
    };
  }

  /** Called by the page when the channel opens, to swap ghost → this peer. */
  onOpen(cb: () => void): void {
    this.openCb = cb;
    if (this.dc && this.dc.readyState === "open") cb();
  }

  /** True once the data channel is live. */
  get isOpen(): boolean {
    return !!this.dc && this.dc.readyState === "open";
  }

  send(msg: OrbMsg): void {
    if (this.closed) return;
    try {
      if (this.dc && this.dc.readyState === "open") {
        this.dc.send(JSON.stringify(msg));
      }
    } catch {
      /* never throw into the render loop */
    }
  }

  tick(): void {
    /* real partner drives itself; nothing to simulate */
  }

  onMessage(cb: (m: OrbMsg) => void): void {
    this.msgCb = cb;
  }

  onStatus(cb: (s: string) => void): void {
    this.statusCb = cb;
  }

  close(): void {
    this.closed = true;
    this.msgCb = null;
    this.openCb = null;
    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }

  /* ----- Handshake factories ----- */

  /** HOST: create the offer. Returns the peer plus the code to share. */
  static async host(): Promise<{ peer: RtcPeer; code: string }> {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peer = new RtcPeer(pc);
    const dc = pc.createDataChannel("duet", { ordered: false, maxRetransmits: 0 });
    peer.wireChannel(dc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    const code = encode(pc.localDescription ?? offer);
    return { peer, code };
  }

  /** HOST step 2: paste the guest's answer code. */
  async acceptAnswer(code: string): Promise<void> {
    await this.pc.setRemoteDescription(decode(code));
  }

  /** GUEST: paste host code, get back an answer code + the peer. */
  static async guest(hostCode: string): Promise<{ peer: RtcPeer; code: string }> {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peer = new RtcPeer(pc);
    pc.ondatachannel = (ev) => peer.wireChannel(ev.channel);
    await pc.setRemoteDescription(decode(hostCode));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    const code = encode(pc.localDescription ?? answer);
    return { peer, code };
  }
}
