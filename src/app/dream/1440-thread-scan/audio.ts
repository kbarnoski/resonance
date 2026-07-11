// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — ThreadAudio: the woven line of pitch.
//
//   The whole field is heard as ONE continuous thread. A single sustained
//   THREAD VOICE (two detuned saws → lowpass) is always sounding; as the
//   reading-head travels the Hilbert curve its pitch GLIDES continuously with
//   the head's vertical field position (a true glissando — NOT a scale, NOT a
//   pentatonic/JI index; deliberately, so the line is a woven continuum of pitch
//   rather than the ever-consonant scale-steps the rest of the lab is full of).
//     • brightness under the head → thread amplitude
//     • hue under the head       → filter cutoff / timbre
//     • local density            → a shimmer partial an octave up
//
//   On top, when the head crosses INTO a bright mark, a soft GRAIN is plucked at
//   the current pitch (panned by horizontal position) — the mark "sounds".
//   Grains are polyphonic under a voice cap.
//
//   Signal path: [thread + grains] → master gain (ramps 0 → ≤0.22) →
//   DynamicsCompressor limiter → destination. Full teardown on close().
// ─────────────────────────────────────────────────────────────────────────────

const MASTER_TARGET = 0.2; // ≤ 0.22 per the lab safety budget
const MASTER_RAMP = 1.8; // s, silence → target
const VOICE_CAP = 12; // max simultaneous grains
const PITCH_LO = 110; // Hz — bottom of the field (fy = 1)
const PITCH_HI = 1320; // Hz — top of the field (fy = 0)
const TRIG = 0.28; // brightness rising-edge that plucks a grain

interface Grain {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  end: number;
}

export interface HeadReading {
  fx: number; // 0..1 horizontal
  fy: number; // 0..1 vertical (0 = top = high pitch)
  bri: number; // 0..1 brightness under head
  hue: number; // 0..1 colour under head
  density: number; // 0..1 neighbourhood energy
}

function pitchFor(fy: number): number {
  // continuous exponential glide across the vertical axis
  const u = 1 - Math.min(1, Math.max(0, fy)); // top → 1
  return PITCH_LO * Math.pow(PITCH_HI / PITCH_LO, u);
}

export class ThreadAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;

  // the continuous thread voice
  private tOsc1: OscillatorNode;
  private tOsc2: OscillatorNode;
  private tShimmer: OscillatorNode;
  private tFilter: BiquadFilterNode;
  private tGain: GainNode;
  private tShimmerGain: GainNode;

  private grains: Grain[] = [];
  private prevBri = 0;
  private closed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    const t = ctx.currentTime;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(MASTER_TARGET, t + MASTER_RAMP);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // ── thread voice ──────────────────────────────────────────────────────────
    this.tFilter = ctx.createBiquadFilter();
    this.tFilter.type = "lowpass";
    this.tFilter.frequency.value = 800;
    this.tFilter.Q.value = 1.2;

    this.tGain = ctx.createGain();
    this.tGain.gain.value = 0.0001;

    this.tOsc1 = ctx.createOscillator();
    this.tOsc1.type = "sawtooth";
    this.tOsc2 = ctx.createOscillator();
    this.tOsc2.type = "sawtooth";
    this.tOsc2.detune.value = 8; // gentle width
    this.tOsc1.frequency.value = 220;
    this.tOsc2.frequency.value = 220;
    this.tOsc1.connect(this.tFilter);
    this.tOsc2.connect(this.tFilter);
    this.tFilter.connect(this.tGain);
    this.tGain.connect(this.master);

    this.tShimmerGain = ctx.createGain();
    this.tShimmerGain.gain.value = 0.0001;
    this.tShimmer = ctx.createOscillator();
    this.tShimmer.type = "sine";
    this.tShimmer.frequency.value = 440;
    this.tShimmer.connect(this.tShimmerGain);
    this.tShimmerGain.connect(this.master);

    this.tOsc1.start();
    this.tOsc2.start();
    this.tShimmer.start();
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — will resume on next gesture */
      }
    }
  }

  /** Called every animation frame with what the head is currently over. */
  update(r: HeadReading, breath: number, active: boolean): void {
    if (this.closed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const freq = pitchFor(r.fy);
    // portamento glide — continuous, never quantised
    this.tOsc1.frequency.setTargetAtTime(freq, now, 0.035);
    this.tOsc2.frequency.setTargetAtTime(freq, now, 0.035);
    this.tShimmer.frequency.setTargetAtTime(freq * 2, now, 0.05);

    // brightness → amplitude of the thread (silent over empty field)
    const amp = active ? Math.min(1, r.bri) * 0.42 * breath : 0.0001;
    this.tGain.gain.setTargetAtTime(Math.max(0.0001, amp), now, 0.05);

    // hue → filter cutoff (timbre); brightness opens it a little too
    const cutoff = 320 + r.hue * 3200 + r.bri * 2400;
    this.tFilter.frequency.setTargetAtTime(cutoff, now, 0.06);

    // density → shimmer partial
    const shim = active ? Math.min(1, r.density * 1.4) * 0.12 * breath : 0.0001;
    this.tShimmerGain.gain.setTargetAtTime(Math.max(0.0001, shim), now, 0.08);

    // rising edge into a mark → pluck a grain
    if (active && r.bri > TRIG && this.prevBri <= TRIG) {
      this.pluck(freq, r);
    }
    this.prevBri = r.bri;

    // reap finished grains
    if (this.grains.length) {
      this.grains = this.grains.filter((g) => {
        if (g.end <= now) {
          try {
            g.osc.stop();
            g.osc2.stop();
          } catch {
            /* already stopped */
          }
          return false;
        }
        return true;
      });
    }
  }

  private pluck(freq: number, r: HeadReading): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // voice cap — cull the oldest
    while (this.grains.length >= VOICE_CAP) {
      const g = this.grains.shift();
      if (g) {
        try {
          g.osc.stop();
          g.osc2.stop();
        } catch {
          /* noop */
        }
      }
    }

    const dur = 0.35 + r.density * 0.5;
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 600 + r.hue * 4200;
    filt.Q.value = 3;

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (r.fx - 0.5) * 1.8));

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.01; // shimmer partial, slightly detuned
    const g2 = ctx.createGain();
    g2.gain.value = 0.25 + r.density * 0.35;

    osc.connect(filt);
    osc2.connect(g2);
    g2.connect(filt);
    filt.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);

    const peak = Math.min(0.9, 0.2 + r.bri * 0.6);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.start(now);
    osc2.start(now);
    const end = now + dur + 0.05;
    osc.stop(end);
    osc2.stop(end);
    this.grains.push({ osc, osc2, gain, end });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.05);
    } catch {
      /* noop */
    }
    for (const g of this.grains) {
      try {
        g.osc.stop();
        g.osc2.stop();
      } catch {
        /* noop */
      }
    }
    this.grains = [];
    try {
      this.tOsc1.stop();
      this.tOsc2.stop();
      this.tShimmer.stop();
    } catch {
      /* noop */
    }
    // give the fade a moment, then close the context fully
    window.setTimeout(() => {
      this.ctx.close().catch(() => {
        /* already closing */
      });
    }, 120);
  }
}
