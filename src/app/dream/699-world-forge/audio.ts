// audio.ts — Web Audio sonification of the creation firehose.
//
// A living ambient TEXTURE, not a chord progression: a slowly drifting
// drone in D-Dorian whose density/brightness tracks the rolling event
// rate, plus a per-event voice whose timbre is the event TYPE and whose
// pitch is a stable hash of the repo (so the same repo tends to ring the
// same note). Panned by longitude. Ear-safe master chain throughout.

import { hashStr, type ForgeEvent } from "./feed";

// D-Dorian pitch classes (D E F G A B C), in semitones from D.
// We allow a slow tonal-centre drift between D-Dorian and A-Aeolian-ish
// colour by occasionally favouring different scale degrees — texture, not
// cadence. Frequencies are computed against a moving root.
const SCALE = [0, 2, 3, 5, 7, 9, 10]; // dorian intervals
const BASE_D = 146.832; // D3

function midiToFreq(semisFromRoot: number, rootHz: number): number {
  return rootHz * Math.pow(2, semisFromRoot / 12);
}

interface VoiceSpec {
  // partials (ratio, gain) for a short additive timbre
  partials: Array<[number, number]>;
  attack: number;
  release: number;
  octave: number; // octave offset relative to base
  level: number;
}

const VOICES: Record<string, VoiceSpec> = {
  // soft mallet/bell
  PushEvent: {
    partials: [[1, 1], [2.01, 0.32], [3.0, 0.12]],
    attack: 0.004,
    release: 1.6,
    octave: 1,
    level: 0.55,
  },
  // bright high shimmer ping (a star)
  WatchEvent: {
    partials: [[1, 1], [2.0, 0.5], [4.0, 0.22], [5.4, 0.1]],
    attack: 0.002,
    release: 2.2,
    octave: 2,
    level: 0.42,
  },
  // warm mid swell
  PullRequestEvent: {
    partials: [[1, 1], [1.5, 0.4], [2.0, 0.18]],
    attack: 0.18,
    release: 2.4,
    octave: 0,
    level: 0.5,
  },
  // muted tom / woodblock
  IssuesEvent: {
    partials: [[1, 1], [1.6, 0.25]],
    attack: 0.003,
    release: 0.5,
    octave: -1,
    level: 0.5,
  },
  // soft comment tick — like Issues but lighter/higher
  IssueCommentEvent: {
    partials: [[1, 1], [2.4, 0.2]],
    attack: 0.003,
    release: 0.45,
    octave: 0,
    level: 0.34,
  },
  // low bloom
  ForkEvent: {
    partials: [[1, 1], [1.5, 0.3], [2.0, 0.15]],
    attack: 0.06,
    release: 3.0,
    octave: -1,
    level: 0.55,
  },
  CreateEvent: {
    partials: [[1, 1], [1.5, 0.28], [3.0, 0.1]],
    attack: 0.05,
    release: 2.8,
    octave: -1,
    level: 0.52,
  },
};

export class ForgeAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;

  // drone
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private droneFilter: BiquadFilterNode;

  // rolling rate → set externally each frame via setIntensity()
  private intensity = 0;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // ── master chain: gain ≤0.4 → lowpass → compressor → destination ──
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 5200;
    this.lowpass.Q.value = 0.5;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    // ── drone bed ─────────────────────────────────────────────────────
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 600;
    this.droneFilter.Q.value = 0.7;
    this.droneGain.connect(this.droneFilter);
    this.droneFilter.connect(this.master);

    // Three stacked drone partials: root, fifth, octave+ninth-ish — a
    // stable open drone, detuned slightly for slow beating ("living").
    const droneRatios = [1, 1.5, 2.0, 3.0];
    const droneLevels = [0.5, 0.3, 0.16, 0.08];
    for (let i = 0; i < droneRatios.length; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? "sawtooth" : "sine";
      o.frequency.value = (BASE_D / 2) * droneRatios[i];
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.value = droneLevels[i];
      o.connect(g);
      g.connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
    }

    // gentle LFO on the drone filter for slow breathing
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);
    lfo.start();
  }

  /** Must be called from a user gesture (resumes a suspended context). */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.34, now + 4.0);
    this.droneGain.gain.linearRampToValueAtTime(0.14, now + 6.0);
  }

  /** Drifting tonal centre — slowly walk the root a touch for life. */
  private rootHz(): number {
    // breathe ±1 semitone over ~minutes via time-based sine; texture only.
    const t = this.ctx.currentTime;
    const drift = Math.sin(t * 0.012) * 0.6; // sub-semitone
    return BASE_D * Math.pow(2, drift / 12);
  }

  /**
   * Rolling event rate, normalised 0..1. Brightens the drone and opens the
   * master lowpass as the planet gets busier.
   */
  setIntensity(x: number): void {
    this.intensity = Math.max(0, Math.min(1, x));
    if (this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const lp = 2600 + this.intensity * 4200;
    this.lowpass.frequency.setTargetAtTime(lp, now, 0.6);
    const dF = 420 + this.intensity * 1400;
    this.droneFilter.frequency.setTargetAtTime(dF, now, 0.8);
    const dG = 0.1 + this.intensity * 0.12;
    this.droneGain.gain.setTargetAtTime(dG, now, 1.2);
  }

  /** Fire a single event voice. lon in -180..180 → stereo pan. */
  play(e: ForgeEvent, lon: number): void {
    if (this.ctx.state !== "running") return;
    const spec = VOICES[e.type] ?? VOICES.PushEvent;
    const now = this.ctx.currentTime;
    const root = this.rootHz();

    // stable pitch class from repo hash → degree in the mode
    const deg = hashStr(e.repo) % SCALE.length;
    // a stable per-actor octave nudge so the same actor sits in a register
    const octNudge = (hashStr(e.actor) >> 5) % 2; // 0 or 1
    const semis = SCALE[deg] + 12 * (spec.octave + octNudge);
    const freq = midiToFreq(semis, root);

    // per-voice gain envelope
    const vGain = this.ctx.createGain();
    vGain.gain.value = 0;

    // pan by longitude
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, lon / 180));

    vGain.connect(pan);
    pan.connect(this.master);

    // a touch of brightness scaling with intensity, but never harsh
    const peak = spec.level * (0.45 + this.intensity * 0.4);

    for (const [ratio, pg] of spec.partials) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * ratio;
      // slight inharmonic detune for bell-like voices
      if (e.type === "PushEvent" || e.type === "WatchEvent") {
        osc.detune.value = (ratio - Math.round(ratio)) * 30;
      }
      const pGain = this.ctx.createGain();
      pGain.gain.value = pg;
      osc.connect(pGain);
      pGain.connect(vGain);
      osc.start(now);
      osc.stop(now + spec.attack + spec.release + 0.1);
    }

    const a = spec.attack;
    const r = spec.release;
    vGain.gain.setValueAtTime(0, now);
    vGain.gain.linearRampToValueAtTime(peak, now + a);
    vGain.gain.exponentialRampToValueAtTime(0.0001, now + a + r);

    // cleanup the gain/pan nodes after the tail
    window.setTimeout(
      () => {
        try {
          vGain.disconnect();
          pan.disconnect();
        } catch {
          /* ignore */
        }
      },
      (a + r + 0.3) * 1000,
    );
  }

  async close(): Promise<void> {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.3);
    } catch {
      /* ignore */
    }
    for (const o of this.droneOscs) {
      try {
        o.stop(now + 0.5);
      } catch {
        /* ignore */
      }
    }
    await new Promise((res) => window.setTimeout(res, 600));
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
