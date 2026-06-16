// Layered Web Audio synth bed + Chris-Wilson look-ahead scheduler.
// Everything is synthesized — no samples, no file loads.
//
// Master chain (ear-safe): masterGain(<=0.5) -> compressor -> destination.
// On the kick we duck the "pump" bus (bass+pad+chord) via gain automation —
// that is the audible sidechain pump. Visuals read the same kick envelope.

import {
  ArcState,
  Phase,
  PHASE_BARS,
  stepArcBar,
  applyArcDerived,
} from "./arc";

const SCHEDULE_AHEAD = 0.12; // seconds to schedule ahead of currentTime
const LOOKAHEAD_MS = 25; // scheduler tick

// Lydian-ish bright scale degrees (semitones) over a major-leaning mode.
// Root D (so we lean luminous). Lydian: 0 2 4 6 7 9 11.
const ROOT_MIDI = 38; // D2
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

// Chord (relative semitones from root) — a wide, bright add9 stack.
const CHORD_INTERVALS = [0, 7, 12, 16, 19, 23]; // root, 5, oct, 3, 5, 7-ish
// Arp pattern walks bright degrees up high.
const ARP_PATTERN = [0, 4, 7, 11, 12, 11, 7, 4];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface SynthCallbacks {
  // Called (scheduled) when a kick fires — used to flash visuals in sync.
  onKick?: (time: number, intensity: number) => void;
  // Called when a phase boundary is crossed (impact/crash, color sweep).
  onPhase?: (phase: Phase, time: number) => void;
  // Called every 16th step so the UI can mirror arc state without owning it.
  onStep?: (arc: ArcState) => void;
}

interface MaybeWebkit {
  webkitAudioContext: typeof AudioContext;
}

export class PulseEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  // "pump" bus — everything that ducks under the kick.
  private pumpBus: GainNode | null = null;
  private leadBus: GainNode | null = null; // arp + riser (not ducked as hard)
  private noiseBuf: AudioBuffer | null = null;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step16 = 0; // running 16th-note counter
  private bpmRef = 124;
  private energyRef = 1; // 0..1 layer toggle from ENERGY control

  private arc: ArcState;
  private cb: SynthCallbacks;
  private riserNode: { osc: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null =
    null;
  private forcedDrop = false;

  // expose latest kick envelope for visuals (peaks at kick, decays)
  kickEnv = 0;
  ducked = 0; // current pump-duck amount (0 open .. 1 fully ducked)

  constructor(arc: ArcState, cb: SynthCallbacks) {
    this.arc = arc;
    this.cb = cb;
  }

  setBpm(b: number) {
    this.bpmRef = b;
  }
  setEnergy(e: number) {
    this.energyRef = Math.min(1, Math.max(0, e));
  }
  requestForcedDrop() {
    this.forcedDrop = true;
  }

  get running(): boolean {
    return this.ctx !== null && this.timer !== null;
  }

  // Create/resume context INSIDE a user gesture (iOS unlock).
  async start(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as MaybeWebkit).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.comp = comp;

    const master = ctx.createGain();
    master.gain.value = 0; // fade in
    master.connect(comp);
    this.master = master;

    const pump = ctx.createGain();
    pump.gain.value = 1;
    pump.connect(master);
    this.pumpBus = pump;

    const lead = ctx.createGain();
    lead.gain.value = 1;
    lead.connect(master);
    this.leadBus = lead;

    // Precompute a noise buffer for riser / crash.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // Fade master in over ~0.8s, capped at 0.45 (<=0.5).
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.45, now + 0.8);

    await ctx.resume();

    this.nextNoteTime = ctx.currentTime + 0.06;
    this.step16 = 0;
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.riserNode) {
      try {
        this.riserNode.osc.stop();
      } catch {
        /* already stopped */
      }
      this.riserNode = null;
    }
    if (this.ctx) {
      const c = this.ctx;
      // Quick fade to avoid a click, then close.
      if (this.master) {
        const t = c.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(0, t + 0.15);
      }
      window.setTimeout(() => {
        c.close().catch(() => {});
      }, 220);
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.pumpBus = null;
      this.leadBus = null;
    }
  }

  private secondsPerStep(): number {
    // 16th notes.
    return 60 / this.bpmRef / 4;
  }

  // The look-ahead scheduler: schedule everything due before currentTime+ahead.
  private scheduler() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step16, this.nextNoteTime);
      // Advance running counter & arc bookkeeping at bar boundaries.
      this.step16 += 1;
      if (this.step16 % 16 === 0) {
        if (this.forcedDrop) {
          this.forcedDrop = false;
          if (this.arc.phase !== "DROP") {
            this.arc.phase = "BUILD";
            this.arc.barInPhase = PHASE_BARS.BUILD - 1;
            applyArcDerived(this.arc);
          }
        }
        const res = stepArcBar(this.arc);
        if (res.crossed && res.entered) {
          this.cb.onPhase?.(res.entered, this.nextNoteTime);
          if (res.entered === "DROP") this.fireImpact(this.nextNoteTime);
          if (res.entered === "BUILD") this.startRiser(this.nextNoteTime);
        }
      }
      this.cb.onStep?.(this.arc);
      this.nextNoteTime += this.secondsPerStep();
    }
  }

  // Schedule one 16th-note worth of events.
  private scheduleStep(globalStep: number, time: number) {
    const stepInBar = globalStep % 16;
    const a = this.arc;
    const intensity = a.intensity;
    const energy = this.energyRef;

    // Update riser sweep live during BUILD.
    this.updateRiser(time, a);

    // --- KICK: four-on-the-floor (every quarter = steps 0,4,8,12) ---
    if (stepInBar % 4 === 0) {
      this.fireKick(time, intensity);
      this.duckPump(time, intensity);
      this.cb.onKick?.(time, intensity);
    }

    // --- BASS: offbeat rolling, Shepard-folded octave, ducked by kick ---
    if (a.phase !== "BUILD" || a.barInPhase >= 2) {
      // rolling 8ths on the off-positions for that pumping feel
      if (stepInBar % 2 === 1 || stepInBar % 4 === 2) {
        const deg = LYDIAN[(globalStep >> 1) % LYDIAN.length];
        const fold = ((a.foldStep % 3) - 1) * 12; // -12,0,+12 cycling = endless climb feel
        const midi = ROOT_MIDI + deg + fold;
        this.fireBass(time, midiToFreq(midi), intensity * (0.7 + 0.3 * energy));
      }
    }

    // --- CHORD STACK + PAD: supersaw on the downbeat of each bar/half ---
    if ((stepInBar === 0 || stepInBar === 8) && energy > 0.25) {
      const chordRootDeg = LYDIAN[(globalStep >> 4) % LYDIAN.length];
      this.fireChord(time, ROOT_MIDI + 24 + chordRootDeg, intensity);
    }

    // --- ARP: plucky high pattern, denser as intensity rises ---
    const arpOn = a.phase === "DROP" || a.phase === "SUSTAIN" || intensity > 0.45;
    if (arpOn && energy > 0.4) {
      const dense = intensity > 0.7 ? 1 : 2; // every 16th vs every 8th
      if (stepInBar % dense === 0) {
        const semi = ARP_PATTERN[globalStep % ARP_PATTERN.length];
        this.fireArp(time, ROOT_MIDI + 36 + semi, intensity);
      }
    }
  }

  // ---- Layer voices ----

  private fireKick(time: number, intensity: number) {
    const ctx = this.ctx!;
    const dst = this.master!; // kick goes straight to master (it drives the duck)
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    const f0 = 150;
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.08);
    const peak = 0.85 * (0.7 + 0.3 * intensity);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    osc.connect(g).connect(dst);
    osc.start(time);
    osc.stop(time + 0.36);

    // click transient
    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(1800, time);
    cg.gain.setValueAtTime(0.18, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
    click.connect(cg).connect(dst);
    click.start(time);
    click.stop(time + 0.03);
  }

  // Sidechain: duck the pump bus down then release — the audible "pump".
  private duckPump(time: number, intensity: number) {
    const bus = this.pumpBus;
    if (!bus) return;
    const depth = 0.28 + 0.5 * intensity; // deeper duck at higher energy
    const floor = Math.max(0.12, 1 - depth);
    const g = bus.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(1, time);
    g.linearRampToValueAtTime(floor, time + 0.012); // fast down on kick
    g.setTargetAtTime(1, time + 0.02, 0.09); // exponential release = pump
  }

  private fireBass(time: number, freq: number, amp: number) {
    const ctx = this.ctx!;
    const bus = this.pumpBus!;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    sub.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    sub.frequency.setValueAtTime(freq / 2, time);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(420 + 1400 * amp, time);
    filt.Q.value = 6;
    const peak = 0.22 * amp;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(filt);
    sub.connect(filt);
    filt.connect(g).connect(bus);
    osc.start(time);
    sub.start(time);
    osc.stop(time + 0.2);
    sub.stop(time + 0.2);
  }

  private fireChord(time: number, rootMidi: number, intensity: number) {
    const ctx = this.ctx!;
    const bus = this.pumpBus!;
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(800 + 4000 * intensity, time);
    filt.Q.value = 0.7;
    const peak = 0.11 * (0.5 + 0.5 * intensity);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
    filt.connect(g).connect(bus);
    // supersaw: detuned saws per chord tone
    for (const iv of CHORD_INTERVALS) {
      const f = midiToFreq(rootMidi + iv);
      for (const det of [-7, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, time);
        o.detune.setValueAtTime(det, time);
        o.connect(filt);
        o.start(time);
        o.stop(time + 1.7);
      }
    }
  }

  private fireArp(time: number, midi: number, intensity: number) {
    const ctx = this.ctx!;
    const bus = this.leadBus!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    o.type = "square";
    o.frequency.setValueAtTime(midiToFreq(midi), time);
    filt.type = "bandpass";
    filt.frequency.value = midiToFreq(midi) * 1.5;
    filt.Q.value = 4;
    const peak = 0.07 * (0.4 + 0.6 * intensity);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    o.connect(filt).connect(g).connect(bus);
    o.start(time);
    o.stop(time + 0.16);
  }

  // ---- Riser (noise sweep) during BUILD ----
  private startRiser(time: number) {
    if (!this.ctx || !this.noiseBuf || !this.leadBus) return;
    // tear down any existing riser
    if (this.riserNode) {
      try {
        this.riserNode.osc.stop(time);
      } catch {
        /* noop */
      }
      this.riserNode = null;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(300, time);
    filt.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    src.connect(filt).connect(g).connect(this.leadBus);
    src.start(time);
    this.riserNode = { osc: src, filt, gain: g };
  }

  private updateRiser(time: number, a: ArcState) {
    if (!this.riserNode) return;
    if (a.phase === "BUILD") {
      const r = a.riser;
      // sweep cutoff up and volume up as the build tenses
      this.riserNode.filt.frequency.setTargetAtTime(
        300 + 7000 * r,
        time,
        0.05
      );
      this.riserNode.gain.gain.setTargetAtTime(0.001 + 0.13 * r, time, 0.05);
    } else {
      // duck riser out once we leave BUILD
      this.riserNode.gain.gain.setTargetAtTime(0.0001, time, 0.04);
    }
  }

  // ---- Impact / crash at the DROP ----
  private fireImpact(time: number) {
    if (!this.ctx || !this.noiseBuf || !this.master) return;
    const ctx = this.ctx;
    // tasteful filtered noise crash (not painful)
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.18, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
    src.connect(hp).connect(g).connect(this.master);
    src.start(time);
    src.stop(time + 1.5);

    // sub boom under the impact
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(80, time);
    o.frequency.exponentialRampToValueAtTime(38, time + 0.4);
    og.gain.setValueAtTime(0.0001, time);
    og.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    o.connect(og).connect(this.master);
    o.start(time);
    o.stop(time + 1.0);
  }
}
