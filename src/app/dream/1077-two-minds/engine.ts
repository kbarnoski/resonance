// ─────────────────────────────────────────────────────────────────────────────
// 1077 · two-minds — engine.ts
//
// The synchrony core for two coupled "minds". Each mind is a phase oscillator
// (Kuramoto, 1975): dφ/dt = 2π·f + K·sin(φ_other − φ_self). Tapping supplies
// onset timestamps; from the inter-onset intervals we estimate the local mind's
// tempo (median IOI) and re-align its phase to each tap. A synthetic "guide"
// stands in for an absent partner and slowly entrains toward the local tempo.
//
// Synchrony index ∈ [0,1] = phase-locking value |mean(e^{iΔφ})| over a short
// sliding window of the instantaneous phase difference, slewed so it reads like
// a felt state rather than a jitter.
//
// Audio (composed, not re-synthesised): two shared droneBank voices — one per
// mind — detuned apart when out of sync (slow beating) and ramped toward unison
// as synchrony rises, so you HEAR the minds lock. Both route through the shared
// createVoidReverb → a compressor → destination. Each tap fires a soft FM pluck
// panned to that mind's side; a sustained high index blooms a collective chord.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

export interface EngineSnapshot {
  /** Smoothed synchrony index 0..1 (phase-locking value). */
  sync: number;
  /** Local mind phase, radians 0..2π. */
  phaseLocal: number;
  /** Partner/guide phase, radians 0..2π. */
  phaseRemote: number;
  /** Local tempo in Hz (beats per second). */
  freqLocal: number;
  /** Partner tempo in Hz. */
  freqRemote: number;
  /** Signed phase difference remote − local, wrapped to (−π, π]. */
  phaseDiff: number;
  /** Is a real BroadcastChannel partner present (vs the guide)? */
  partnerConnected: boolean;
  /** 0..1 approach factor driving the two presences toward centre. */
  approach: number;
  /** Momentary tap energy for the local side (0..1, decays). */
  pulseLocal: number;
  /** Momentary tap energy for the remote side (0..1, decays). */
  pulseRemote: number;
  /** Bloom intensity 0..1 (sustained high sync). */
  bloom: number;
}

interface Peer {
  freq: number;
  phase: number;
  lastBeat: number; // performance.now() of last received onset
  lastSeen: number; // performance.now() of last message
}

interface PeerMessage {
  id: string;
  kind: "onset" | "state" | "leave";
  freq: number;
  phase: number;
  t: number;
}

const TWO_PI = Math.PI * 2;
const DEFAULT_FREQ = 0.9; // ~54 bpm resting pulse
const MIN_FREQ = 0.3;
const MAX_FREQ = 3.0;
const COUPLING = 1.6; // Kuramoto K — how hard the phases pull together
const PEER_TIMEOUT = 5000; // ms without a message → prune
const CHANNEL = "two-minds";

/** Wrap an angle to (−π, π]. */
function wrapPi(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
}

/** Median of a numeric list (non-mutating on caller). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class TwoMindsEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private verb: VoidReverb;
  private droneLocal: DroneBank;
  private droneRemote: DroneBank;
  private panLocal: StereoPannerNode;
  private panRemote: StereoPannerNode;

  private readonly rootBase = 96; // Hz — the two minds tune around this (G2-ish)

  // Oscillator state.
  private phaseL = Math.random() * TWO_PI;
  private phaseR = Math.random() * TWO_PI;
  private freqL = DEFAULT_FREQ;
  private freqR = DEFAULT_FREQ * 1.28; // guide starts audibly OFF

  // Onset history for tempo estimation.
  private taps: number[] = []; // performance.now() timestamps
  private lastAudioTime = 0;

  // Synchrony window (instantaneous phase diffs as unit vectors).
  private plvRe = 0;
  private plvIm = 0;
  private syncRaw = 0;
  private sync = 0;
  private approach = 0;
  private bloom = 0;
  private bloomHold = 0;

  private pulseL = 0;
  private pulseR = 0;

  // BroadcastChannel peer state.
  private bc: BroadcastChannel | null = null;
  private readonly selfId = Math.random().toString(36).slice(2);
  private peers = new Map<string, Peer>();
  private lastBroadcast = 0;

  // Guide (synthetic partner) entrainment.
  private guideActive = true;
  private guideStart = 0;
  private guideBaseFreq = DEFAULT_FREQ * 1.28;

  // Idle self-pulse.
  private lastLocalTap = 0;
  private nextSelfPulse = 0;

  private tickTimer: number | null = null;
  private prevTick = 0;
  private started = false;
  private closed = false;
  private prevRemotePhase = 0;

  private voiceCount = 0;
  private readonly maxVoices = 10;

  // Two detuned sustained voices that BEAT apart out of sync and ramp to unison
  // as sync rises — the audible "minds locking" cue the drones alone can't give.
  private beatOscL!: OscillatorNode;
  private beatOscR!: OscillatorNode;
  private beatGain!: GainNode;

  // Held collective chord that blooms at sustained high sync.
  private chordOscs: OscillatorNode[] = [];
  private chordGain!: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    this.verb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.32 });

    // verb → compressor → master → destination
    this.verb.output.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Each mind: drone → its panner → verb input.
    this.panLocal = ctx.createStereoPanner();
    this.panLocal.pan.value = -0.6;
    this.panRemote = ctx.createStereoPanner();
    this.panRemote.pan.value = 0.6;
    this.panLocal.connect(this.verb.input);
    this.panRemote.connect(this.verb.input);

    // Warm-cool drone pair. Low peak gain each so two beds sit calmly together.
    this.droneLocal = startDroneBank(ctx, this.panLocal, {
      root: this.rootBase,
      ratios: [1, 3 / 2, 2],
      cutoffLow: 200,
      cutoffHigh: 2200,
      peakGain: 0.16,
    });
    this.droneRemote = startDroneBank(ctx, this.panRemote, {
      root: this.rootBase,
      ratios: [1, 3 / 2, 2],
      cutoffLow: 200,
      cutoffHigh: 2200,
      peakGain: 0.16,
    });

    // Beating pair: two sines an octave above the root, one per side.
    this.beatGain = ctx.createGain();
    this.beatGain.gain.value = 0.05;
    this.beatGain.connect(this.verb.input);
    this.beatOscL = ctx.createOscillator();
    this.beatOscL.type = "sine";
    this.beatOscL.frequency.value = this.rootBase * 2;
    this.beatOscR = ctx.createOscillator();
    this.beatOscR.type = "sine";
    this.beatOscR.frequency.value = this.rootBase * 2;
    const bpL = ctx.createStereoPanner();
    bpL.pan.value = -0.5;
    const bpR = ctx.createStereoPanner();
    bpR.pan.value = 0.5;
    this.beatOscL.connect(bpL);
    this.beatOscR.connect(bpR);
    bpL.connect(this.beatGain);
    bpR.connect(this.beatGain);
    this.beatOscL.start();
    this.beatOscR.start();

    // Collective chord (added-sixth, just intonation), silent until it blooms.
    this.chordGain = ctx.createGain();
    this.chordGain.gain.value = 0.0001;
    this.chordGain.connect(this.verb.input);
    for (const ratio of [1, 5 / 4, 3 / 2, 5 / 3, 2]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = this.rootBase * 2 * ratio;
      const g = ctx.createGain();
      g.gain.value = 0.12 / ratio;
      o.connect(g);
      g.connect(this.chordGain);
      o.start();
      this.chordOscs.push(o);
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    const now = performance.now();
    this.prevTick = now;
    this.guideStart = now;
    this.lastLocalTap = now;
    this.nextSelfPulse = now + 2500;
    this.lastAudioTime = this.ctx.currentTime;

    // Feature-detect BroadcastChannel with proper typing.
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.bc = new BroadcastChannel(CHANNEL);
        this.bc.onmessage = (ev: MessageEvent) => this.onPeerMessage(ev.data as PeerMessage);
        this.bc.postMessage({
          id: this.selfId,
          kind: "state",
          freq: this.freqL,
          phase: this.phaseL,
          t: now,
        } satisfies PeerMessage);
      } catch {
        this.bc = null;
      }
    }

    // ~60 Hz logic tick (visuals read a snapshot on their own rAF).
    this.tickTimer = window.setInterval(() => this.tick(), 16);
  }

  /** A local tap: click / spacebar. Records onset, re-aligns phase, plucks. */
  tapLocal() {
    if (!this.started || this.closed) return;
    const now = performance.now();
    this.lastLocalTap = now;

    this.taps.push(now);
    // Keep the last ~8 taps for tempo estimation.
    if (this.taps.length > 8) this.taps.shift();
    this.updateLocalTempo();

    // Snap local phase to the beat (a tap IS the downbeat).
    this.phaseL = 0;
    this.pulseL = 1;
    this.pluck(true);

    // Broadcast the onset so a partner tab couples to us.
    if (this.bc) {
      try {
        this.bc.postMessage({
          id: this.selfId,
          kind: "onset",
          freq: this.freqL,
          phase: this.phaseL,
          t: now,
        } satisfies PeerMessage);
      } catch {
        /* channel gone */
      }
    }
  }

  private updateLocalTempo() {
    if (this.taps.length < 2) return;
    const iois: number[] = [];
    for (let i = 1; i < this.taps.length; i++) {
      const dt = (this.taps[i] - this.taps[i - 1]) / 1000;
      if (dt > 0.1 && dt < 3.5) iois.push(dt);
    }
    if (iois.length === 0) return;
    const ioi = median(iois);
    const f = 1 / ioi;
    this.freqL = Math.min(MAX_FREQ, Math.max(MIN_FREQ, f));
  }

  private onPeerMessage(msg: PeerMessage) {
    if (!msg || msg.id === this.selfId) return;
    const now = performance.now();
    if (msg.kind === "leave") {
      this.peers.delete(msg.id);
      return;
    }
    const peer = this.peers.get(msg.id) ?? {
      freq: msg.freq,
      phase: msg.phase,
      lastBeat: now,
      lastSeen: now,
    };
    peer.freq = Math.min(MAX_FREQ, Math.max(MIN_FREQ, msg.freq));
    peer.lastSeen = now;
    if (msg.kind === "onset") {
      peer.phase = 0;
      peer.lastBeat = now;
      // A real partner beat: pluck on the remote side.
      this.pulseR = 1;
      this.pluck(false);
    }
    this.peers.set(msg.id, peer);
  }

  private pruneAndPickPartner(now: number): Peer | null {
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > PEER_TIMEOUT) this.peers.delete(id);
    }
    // Last-writer-wins: the most-recently-seen live peer is THE partner.
    let best: Peer | null = null;
    for (const p of this.peers.values()) {
      if (!best || p.lastSeen > best.lastSeen) best = p;
    }
    return best;
  }

  private tick() {
    if (this.closed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.prevTick) / 1000);
    this.prevTick = now;

    const partner = this.pruneAndPickPartner(now);
    const partnerConnected = partner !== null;

    // Idle self-pulse so the piece sounds & moves untouched.
    if (now - this.lastLocalTap > 4000 && now >= this.nextSelfPulse) {
      this.tapLocal();
      this.nextSelfPulse = now + (1 / this.freqL) * 1000;
    }

    // ── Remote oscillator: real partner, or the entraining guide. ──────────
    if (partnerConnected && partner) {
      this.guideActive = false;
      this.freqR = partner.freq;
      // Advance the partner phase from its last received beat.
      this.phaseR = (partner.phase + TWO_PI * partner.freq * ((now - partner.lastBeat) / 1000)) % TWO_PI;
    } else {
      // Guide: over ~35 s, drift its tempo & phase toward the local mind.
      this.guideActive = true;
      const elapsed = (now - this.guideStart) / 1000;
      const arc = Math.min(1, elapsed / 35); // 0 apart → 1 matched
      const ease = arc * arc * (3 - 2 * arc); // smoothstep
      this.freqR = this.guideBaseFreq + (this.freqL - this.guideBaseFreq) * ease;
      this.phaseR += TWO_PI * this.freqR * dt;
      // Late in the arc, actively pull the guide phase onto the local phase.
      const guidePull = COUPLING * (0.2 + 1.4 * ease);
      this.phaseR += guidePull * Math.sin(this.phaseL - this.phaseR) * dt;
      this.phaseR = ((this.phaseR % TWO_PI) + TWO_PI) % TWO_PI;
    }

    // ── Local oscillator: free-run + Kuramoto pull toward the remote. ──────
    const prevPhaseL = this.phaseL;
    this.phaseL += TWO_PI * this.freqL * dt;
    this.phaseL += COUPLING * Math.sin(this.phaseR - this.phaseL) * dt;
    this.phaseL = ((this.phaseL % TWO_PI) + TWO_PI) % TWO_PI;

    // ── Beat detection: a phase wrap past 2π marks a downbeat → auto pulse. ─
    // (Manual taps already flash pulseL/pulseR; this covers the free-running
    // visual beat so each orb blinks on its own tempo even while idle.)
    if (this.phaseL < prevPhaseL) this.pulseL = Math.max(this.pulseL, 0.55);
    if (this.phaseR < this.prevRemotePhase) this.pulseR = Math.max(this.pulseR, 0.5);
    this.prevRemotePhase = this.phaseR;

    // ── Synchrony index: PLV over a slewed window of the phase diff. ───────
    const diff = wrapPi(this.phaseR - this.phaseL);
    const re = Math.cos(diff);
    const im = Math.sin(diff);
    const a = 0.06; // window slew — larger = snappier
    this.plvRe += (re - this.plvRe) * a;
    this.plvIm += (im - this.plvIm) * a;
    this.syncRaw = Math.sqrt(this.plvRe * this.plvRe + this.plvIm * this.plvIm);
    // Felt-state smoothing of the readout.
    this.sync += (this.syncRaw - this.sync) * 0.08;

    // Approach: presences drift toward centre as sync rises (eased, lagging).
    this.approach += (this.sync - this.approach) * 0.05;

    // Bloom: sustained high sync opens the collective chord.
    if (this.sync > 0.82) this.bloomHold = Math.min(1, this.bloomHold + dt / 2.5);
    else this.bloomHold = Math.max(0, this.bloomHold - dt / 3.5);
    this.bloom += (this.bloomHold - this.bloom) * 0.04;

    // ── Audio mapping. ─────────────────────────────────────────────────────
    this.applyAudio();

    // Decay the visual pulse energies.
    this.pulseL *= Math.pow(0.5, dt / 0.28);
    this.pulseR *= Math.pow(0.5, dt / 0.28);

    // Broadcast our state ~8 Hz so late-joining partners see us.
    if (this.bc && now - this.lastBroadcast > 120) {
      this.lastBroadcast = now;
      try {
        this.bc.postMessage({
          id: this.selfId,
          kind: "state",
          freq: this.freqL,
          phase: this.phaseL,
          t: now,
        } satisfies PeerMessage);
      } catch {
        /* channel gone */
      }
    }
  }

  private applyAudio() {
    // droneBank exposes only drive, so the "lock" cue is carried by drive rising
    // with engagement + bloom, the pluck beating between the two panned sides,
    // and the collective chord that the bloom opens.
    const driveL = 0.28 + 0.4 * this.pulseL + 0.3 * this.bloom;
    const driveR = 0.28 + 0.4 * this.pulseR + 0.3 * this.bloom;
    this.droneLocal.setDrive(Math.min(1, driveL));
    this.droneRemote.setDrive(Math.min(1, driveR));

    // Beating pair: detune the two sustained sines apart when out of sync so a
    // slow beat is audible; ramp toward UNISON as sync rises → the beat stops.
    const now = this.ctx.currentTime;
    const spread = (1 - this.sync) * 4.5; // Hz apart at 0 sync
    this.beatOscL.frequency.setTargetAtTime(this.rootBase * 2 - spread, now, 0.2);
    this.beatOscR.frequency.setTargetAtTime(this.rootBase * 2 + spread, now, 0.2);

    // Reverb opens toward the ecstatic peak.
    this.verb.setWet(0.3 + 0.4 * this.bloom);

    // Sustained high sync blooms a held collective just-intonation chord.
    this.chordGain.gain.setTargetAtTime(0.0001 + 0.5 * this.bloom, now, 0.4);
  }

  /** A soft 2-op FM pluck panned to one side; poly-capped, self-cleaning. */
  private pluck(local: boolean) {
    if (this.closed || this.voiceCount >= this.maxVoices) return;
    const ctx = this.ctx;
    let t = ctx.currentTime;
    if (t <= this.lastAudioTime) t = this.lastAudioTime + 0.001;
    this.lastAudioTime = t;

    // Just-intonation note per side: local a fifth apart from remote root.
    const ratios = local ? [1, 3 / 2, 2] : [3 / 2, 2, 3];
    const idx = Math.floor(Math.random() * ratios.length);
    const base = this.rootBase * 4 * ratios[idx]; // up two octaves, bell range

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = base;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = base * 2; // 2:1 → bell-ish
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(base * 1.8, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);

    const pan = ctx.createStereoPanner();
    pan.pan.value = local ? -0.55 : 0.55;

    carrier.connect(amp);
    amp.connect(pan);
    pan.connect(this.verb.input);

    this.voiceCount++;
    carrier.start(t);
    mod.start(t);
    const stopAt = t + 1.2;
    carrier.stop(stopAt);
    mod.stop(stopAt);
    const cleanup = () => {
      try {
        carrier.disconnect();
        mod.disconnect();
        modGain.disconnect();
        amp.disconnect();
        pan.disconnect();
      } catch {
        /* already gone */
      }
      this.voiceCount = Math.max(0, this.voiceCount - 1);
    };
    carrier.onended = cleanup;
  }

  snapshot(): EngineSnapshot {
    return {
      sync: this.sync,
      phaseLocal: this.phaseL,
      phaseRemote: this.phaseR,
      freqLocal: this.freqL,
      freqRemote: this.freqR,
      phaseDiff: wrapPi(this.phaseR - this.phaseL),
      partnerConnected: !this.guideActive && this.peers.size > 0,
      approach: this.approach,
      pulseLocal: Math.min(1, this.pulseL),
      pulseRemote: Math.min(1, this.pulseR),
      bloom: this.bloom,
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.bc) {
      try {
        this.bc.postMessage({
          id: this.selfId,
          kind: "leave",
          freq: this.freqL,
          phase: this.phaseL,
          t: performance.now(),
        } satisfies PeerMessage);
        this.bc.close();
      } catch {
        /* already closed */
      }
      this.bc = null;
    }
    try {
      this.droneLocal.stop();
      this.droneRemote.stop();
      const stopAt = this.ctx.currentTime + 0.6;
      this.beatGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      this.chordGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      this.beatOscL.stop(stopAt);
      this.beatOscR.stop(stopAt);
      for (const o of this.chordOscs) o.stop(stopAt);
    } catch {
      /* ctx closing */
    }
    // Let tails ring, then tear the context down.
    await new Promise((r) => setTimeout(r, 900));
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
