// audio.ts — 2314 · The Return
//
// The sound is driven by TWO conflicting fields, never a single master knob:
//
//   Voice LIVE  — a pad whose pitch/pan follow the CENTROID of your live
//                 motion (where you ARE).
//   Voice ROOM  — a second pad whose pitch/pan follow the centroid of the
//                 room's PREDICTION field (where the room EXPECTS you).
//
// The drama is the GAP between them, delivered as prediction ERROR (surprise):
//   * high surprise → onset density rises, Voice ROOM detunes into beating
//     dissonance, brightness (filter cutoff) opens, a hot onset "tick" fires.
//   * low surprise  → Voice ROOM is snapped onto a consonant Lydian interval
//     above Voice LIVE; the two fuse into a calm, resolved standing pad.
//
// Modal set: D Lydian (avoids bare major-pentatonic). Master ≤0.2 through a
// DynamicsCompressor, 1s fade-in, silent until start().

// D Lydian degrees (semitones from the root). The #4 is what gives the mode
// its floating, unresolved-then-resolved quality.
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const ROOT_HZ = 146.83; // D3

function scaleHz(index: number, octaves = 2): number {
  const span = LYDIAN.length * octaves;
  const i = Math.max(0, Math.min(span - 1, Math.round(index)));
  const oct = Math.floor(i / LYDIAN.length);
  const deg = LYDIAN[i % LYDIAN.length];
  return ROOT_HZ * Math.pow(2, (deg + 12 * oct) / 12);
}

export interface FieldDrive {
  surprise: number; // 0..1 total prediction error
  liveX: number; // 0..1 centroid of live motion
  liveY: number; // 0..1
  predX: number; // 0..1 centroid of prediction field
  predY: number; // 0..1
  agreement: number; // 0..1 how well live matches prediction (1 = fused)
}

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode; // second oscillator for chorus/beating
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
}

export class ReturnAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private live: Voice;
  private room: Voice;
  private nextOnset = 0;
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // silent until start()
    this.comp.connect(this.master).connect(this.ctx.destination);

    this.live = this.makeVoice("sawtooth", -0.3);
    this.room = this.makeVoice("triangle", 0.3);
  }

  private makeVoice(type: OscillatorType, pan: number): Voice {
    const osc = this.ctx.createOscillator();
    const detune = this.ctx.createOscillator();
    osc.type = type;
    detune.type = type;
    osc.frequency.value = ROOT_HZ;
    detune.frequency.value = ROOT_HZ;
    detune.detune.value = 6;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.12;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    osc.connect(filter);
    detune.connect(filter);
    filter.connect(gain).connect(panner).connect(this.comp);
    osc.start();
    detune.start();
    return { osc, detune, gain, filter, pan: panner };
  }

  /** Begin sound: resume context and fade master in over 1s (≤0.2). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.2, now + 1.0);
  }

  get isStarted(): boolean {
    return this.started;
  }

  /** Map the two fields onto the two voices. Called ~30x/s. */
  update(d: FieldDrive): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const span = LYDIAN.length * 2;

    // Voice LIVE — follows your actual motion centroid.
    const liveIdx = (1 - d.liveY) * (span - 1); // higher = up the frame
    const liveHz = scaleHz(liveIdx);
    this.glide(this.live.osc.frequency, liveHz, t);
    this.glide(this.live.detune.frequency, liveHz, t);
    this.set(this.live.pan.pan, (d.liveX - 0.5) * 1.6, t);

    // Voice ROOM — follows the prediction centroid. When agreement is high we
    // snap it to a consonant Lydian interval above LIVE (fusion/resolution);
    // when surprise is high it drifts to its own centroid and beats.
    const predIdx = (1 - d.predY) * (span - 1);
    const consonantIdx = liveIdx + 2; // a Lydian third up = resolved
    const roomIdx = lerp(predIdx, consonantIdx, d.agreement);
    const roomHz = scaleHz(roomIdx);
    this.glide(this.room.osc.frequency, roomHz, t);
    this.glide(this.room.detune.frequency, roomHz, t);
    this.set(this.room.pan.pan, (d.predX - 0.5) * 1.6, t);

    // Beating/detune grows with surprise → dissonance under prediction error.
    const beat = 5 + d.surprise * 42;
    this.set(this.room.detune.detune, beat, t);
    this.set(this.live.detune.detune, 4 + d.surprise * 14, t);

    // Brightness opens with surprise (onset/edge), closes into a mellow pad
    // when the room has you.
    this.glide(this.live.filter.frequency, 500 + d.surprise * 2600, t, 0.15);
    this.glide(this.room.filter.frequency, 420 + d.surprise * 2000, t, 0.15);

    // Voice gains: LIVE steady; ROOM swells as it grows confident (agreement).
    this.set(this.live.gain.gain, 0.11, t);
    this.set(this.room.gain.gain, 0.05 + d.agreement * 0.09, t);

    // Onset density: surprise triggers hot ticks; calm = near silence.
    const rate = 0.15 + d.surprise * 5.5; // onsets/sec
    if (t >= this.nextOnset && d.surprise > 0.12) {
      this.tick(t, d);
      this.nextOnset = t + 1 / rate + Math.random() * 0.05;
    } else if (t >= this.nextOnset) {
      this.nextOnset = t + 0.4;
    }
  }

  /** A short percussive onset at the mismatch — the "surprise" transient. */
  private tick(t: number, d: FieldDrive): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    o.type = "triangle";
    // Pitch from the GAP between where you are and where the room expected you.
    const gapIdx = (1 - (d.liveY + d.predY) / 2) * (LYDIAN.length * 2 - 1) + 2;
    o.frequency.setValueAtTime(scaleHz(gapIdx) * 2, t);
    p.pan.value = (d.liveX - 0.5) * 1.4;
    const amp = 0.05 + d.surprise * 0.09;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(p).connect(this.comp);
    o.start(t);
    o.stop(t + 0.24);
  }

  private glide(
    param: AudioParam,
    value: number,
    t: number,
    tau = 0.08,
  ): void {
    param.setTargetAtTime(value, t, tau);
  }

  private set(param: AudioParam, value: number, t: number): void {
    param.setTargetAtTime(value, t, 0.05);
  }

  async dispose(): Promise<void> {
    try {
      this.live.osc.stop();
      this.live.detune.stop();
      this.room.osc.stop();
      this.room.detune.stop();
    } catch {
      /* already stopped */
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
