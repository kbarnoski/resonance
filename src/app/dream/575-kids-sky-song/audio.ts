// audio.ts — Web Audio engine for "today's sky song".
//
// The live weather (Sky) COMPOSES: it picks the scale (key/mode), the tempo,
// the instrument palette, the pattern density and the timbral register/warmth.
// A Chris-Wilson look-ahead scheduler ("A Tale of Two Clocks") plays an evolving
// ostinato in today's key. The child PERFORMS on top via playTouch() — always in key.
//
// Kids-safe master chain: gain -> lowpass(<=8000) -> compressor -> destination.
// All gain changes via setTargetAtTime. Always-on soft ambient bed.

import type { Sky, Condition } from "./weather";

// ---- scales (semitone offsets from the root) -----------------------------
const SCALES: Record<Condition, number[]> = {
  clear: [0, 2, 4, 7, 9, 12, 14, 16], // bright major / lydian-ish
  partly: [0, 2, 4, 7, 9, 11, 12, 14], // major
  overcast: [0, 2, 5, 7, 9, 12, 14], // suspended / soft (no 3rd)
  fog: [0, 7, 12, 7, 0, 12], // open fifths / octaves — drone-ish
  rain: [0, 3, 5, 7, 10, 12, 15], // minor pentatonic
  snow: [0, 4, 7, 11, 12, 16, 19], // high glassy maj7 spread
  showers: [0, 3, 5, 8, 10, 12], // minor-ish, restless
  thunder: [0, 3, 7, 10, 12, 14, 15], // dorian/minor with tension-but-consonant
};

// Each condition picks a root note (Hz) and oscillator timbre.
interface Palette {
  rootHz: number;
  osc: OscillatorType;
  // a 2nd partial oscillator type layered slightly detuned for body
  osc2: OscillatorType;
  attack: number;
  release: number;
  // base note gain
  level: number;
}

function paletteFor(sky: Sky): Palette {
  const night = !sky.isDay;
  // register from temperature: cold -> a touch higher/brighter, warm -> rounder.
  // night drops everything an octave for a hushed lower register.
  const octave = night ? 0.5 : 1;
  switch (sky.condition) {
    case "clear":
      return { rootHz: 261.63 * octave, osc: "triangle", osc2: "sine", attack: 0.01, release: 1.1, level: 0.16 };
    case "partly":
      return { rootHz: 233.08 * octave, osc: "triangle", osc2: "sine", attack: 0.015, release: 1.3, level: 0.15 };
    case "overcast":
      return { rootHz: 196.0 * octave, osc: "sine", osc2: "triangle", attack: 0.08, release: 1.8, level: 0.14 };
    case "fog":
      return { rootHz: 130.81 * octave, osc: "sine", osc2: "sine", attack: 0.25, release: 2.6, level: 0.13 };
    case "rain":
      return { rootHz: 220.0 * octave, osc: "triangle", osc2: "sine", attack: 0.006, release: 0.7, level: 0.15 };
    case "snow":
      return { rootHz: 523.25 * octave, osc: "sine", osc2: "triangle", attack: 0.004, release: 1.6, level: 0.12 };
    case "showers":
      return { rootHz: 246.94 * octave, osc: "triangle", osc2: "sine", attack: 0.006, release: 0.6, level: 0.15 };
    case "thunder":
      return { rootHz: 174.61 * octave, osc: "sine", osc2: "triangle", attack: 0.02, release: 1.5, level: 0.15 };
  }
}

function midiHz(rootHz: number, semis: number): number {
  return rootHz * Math.pow(2, semis / 12);
}

// A scheduled note that fired — the visual layer reads these to "bloom" the field.
export interface NoteEvent {
  when: number; // AudioContext time
  hz: number;
  // normalized pitch height 0..1 (low..high) for placing the bloom vertically
  height: number;
  // 0 = generative voice, 1 = child touch voice
  source: 0 | 1;
  // x,y in 0..1 for touch blooms (generative ones are auto-placed)
  x?: number;
  y?: number;
}

export class SkySong {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private comp!: DynamicsCompressorNode;
  private bedGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;

  private sky: Sky;
  private palette!: Palette;
  private scale: number[] = [0, 2, 4, 7, 9];

  // scheduler state
  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private secondsPerStep = 0.32;
  private density = 0.6; // chance a step sounds, from cloud cover
  private running = false;

  // generative pattern memory (evolves slowly via recombination)
  private pattern: number[] = [];
  private patternAge = 0;

  // events for the visual layer to drain
  private events: NoteEvent[] = [];

  constructor(sky: Sky) {
    this.sky = sky;
  }

  // must be called inside a user gesture (iOS unlock)
  start(): void {
    if (this.ac) {
      void this.ac.resume();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ac = new Ctor();
    this.ac = ac;

    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;

    this.lowpass = ac.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7600; // <= 8000 kids-safe

    this.master = ac.createGain();
    this.master.gain.value = 0.0001;

    // gentle reverb tail for the dreamy bloom
    this.reverb = ac.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.2);
    this.reverbGain = ac.createGain();
    this.reverbGain.gain.value = 0.5;

    // chain: master -> lowpass -> compressor -> destination
    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(ac.destination);
    // reverb sends back into the lowpass
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.lowpass);

    // ambient bed (always on, soft)
    this.bedGain = ac.createGain();
    this.bedGain.gain.value = 0.0001;
    this.bedGain.connect(this.master);

    this.applySky(this.sky);
    this.makeBed();

    // ease master up smoothly — no transient
    void ac.resume();
    this.master.gain.setTargetAtTime(0.9, ac.currentTime, 0.6);
    this.bedGain.gain.setTargetAtTime(0.5, ac.currentTime, 1.2);

    this.nextNoteTime = ac.currentTime + 0.1;
    this.running = true;
    this.timer = window.setInterval(this.scheduler, 25);
  }

  // re-compose when real weather patches in over the baked start
  applySky(sky: Sky): void {
    this.sky = sky;
    this.palette = paletteFor(sky);
    this.scale = SCALES[sky.condition];
    // wind -> tempo: 0 km/h ~ slow (0.46s/step), 40+ km/h ~ brisk (0.16s/step)
    const w = Math.max(0, Math.min(40, sky.windSpeed)) / 40;
    this.secondsPerStep = 0.46 - w * 0.3;
    // cloud cover -> density of the auto pattern
    this.density = 0.35 + (sky.cloudCover / 100) * 0.5;
    // temperature -> filter warmth: colder = brighter top, warmer = rounder
    if (this.ac && this.lowpass) {
      const t = Math.max(-10, Math.min(35, sky.tempC));
      const cutoff = 3200 + ((t + 10) / 45) * 4200; // 3200..7400
      this.lowpass.frequency.setTargetAtTime(Math.min(7600, cutoff), this.ac.currentTime, 0.8);
    }
    this.regeneratePattern();
  }

  // build a fresh ostinato in today's scale (8 steps)
  private regeneratePattern(): void {
    const len = 8;
    const next: number[] = [];
    for (let i = 0; i < len; i++) {
      next.push(Math.floor(Math.random() * this.scale.length));
    }
    this.pattern = next;
    this.patternAge = 0;
  }

  // slowly evolve the pattern (Eno-ish recombination) so the piece never loops flat
  private evolvePattern(): void {
    if (this.pattern.length === 0) return this.regeneratePattern();
    // mutate one or two notes
    const muts = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let m = 0; m < muts; m++) {
      const i = Math.floor(Math.random() * this.pattern.length);
      this.pattern[i] = Math.floor(Math.random() * this.scale.length);
    }
    this.patternAge++;
  }

  private scheduler = (): void => {
    if (!this.ac || !this.running) return;
    const ac = this.ac;
    // schedule everything up to 120ms ahead on the audio clock
    while (this.nextNoteTime < ac.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.secondsPerStep;
      this.step = (this.step + 1) % 8;
      if (this.step === 0) {
        this.evolvePattern();
        // every few bars, occasionally re-seed for genuine motion over time
        if (this.patternAge >= 4 && Math.random() < 0.5) this.regeneratePattern();
      }
    }
  };

  private scheduleStep(step: number, when: number): void {
    if (!this.ac) return;
    // probability a generative note sounds this step (density)
    const willSound = Math.random() < this.density;
    if (willSound) {
      const degree = this.pattern[step] ?? 0;
      const semis = this.scale[degree % this.scale.length];
      // alternate octave lift for sparkle on offbeats
      const lift = step % 2 === 1 && this.sky.condition !== "fog" ? 12 : 0;
      const hz = midiHz(this.palette.rootHz, semis + lift);
      this.voice(hz, when, this.palette.level, 0);
      const height = Math.max(0, Math.min(1, (semis + lift) / 24));
      this.events.push({ when, hz, height, source: 0 });
    }
    // precipitation -> an overlaid rain/snow voice layer
    if (this.sky.precipitation > 0.05 && (step % 2 === 0)) {
      const wet = Math.min(1, this.sky.precipitation / 3);
      if (Math.random() < 0.3 + wet * 0.5) {
        this.dropletVoice(when, wet);
      }
    }
  }

  // a single sung note (two detuned oscillators)
  private voice(hz: number, when: number, level: number, source: 0 | 1): void {
    if (!this.ac) return;
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    const a = ac.createOscillator();
    a.type = this.palette.osc;
    a.frequency.value = hz;
    const b = ac.createOscillator();
    b.type = this.palette.osc2;
    b.frequency.value = hz;
    b.detune.value = source === 1 ? 6 : -5;
    a.connect(g);
    b.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    const atk = this.palette.attack;
    const rel = this.palette.release * (source === 1 ? 1.4 : 1);
    const peak = level * (source === 1 ? 1.25 : 1);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + atk + rel);
    a.start(when);
    b.start(when);
    a.stop(when + atk + rel + 0.05);
    b.stop(when + atk + rel + 0.05);
  }

  // soft pitched droplet for rain/snow layer
  private dropletVoice(when: number, wet: number): void {
    if (!this.ac) return;
    const ac = this.ac;
    const snow = this.sky.condition === "snow";
    const semis = this.scale[Math.floor(Math.random() * this.scale.length)] + (snow ? 24 : 12);
    const hz = midiHz(this.palette.rootHz, semis);
    const g = ac.createGain();
    g.gain.value = 0.0001;
    const o = ac.createOscillator();
    o.type = snow ? "sine" : "triangle";
    o.frequency.value = hz;
    o.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    const peak = 0.05 + wet * 0.05;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    o.start(when);
    o.stop(when + 0.45);
  }

  // the child's touch -> a glowing voice in today's key, pitched by height
  playTouch(x: number, y: number): NoteEvent | null {
    if (!this.ac) return null;
    const ac = this.ac;
    // y (0 top .. 1 bottom) -> high to low pitch; snap to today's scale
    const up = 1 - Math.max(0, Math.min(1, y));
    const span = this.scale.length - 1;
    const idx = Math.round(up * span);
    const octaveLift = up > 0.66 ? 12 : 0;
    const semis = this.scale[idx] + octaveLift;
    const hz = midiHz(this.palette.rootHz, semis);
    const when = ac.currentTime + 0.005;
    this.voice(hz, when, this.palette.level * 1.2, 1);
    const ev: NoteEvent = { when, hz, height: Math.max(0, Math.min(1, (semis + 6) / 30)), source: 1, x, y };
    this.events.push(ev);
    return ev;
  }

  // always-on ambient bed: two slow drone oscillators on root + fifth, LFO-shimmer
  private makeBed(): void {
    if (!this.ac) return;
    const ac = this.ac;
    const root = this.palette.rootHz / 2;
    const tones = [root, root * 1.5];
    tones.forEach((hz, i) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      const g = ac.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.3;
      // slow tremolo so the bed breathes
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.03;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      o.connect(g);
      g.connect(this.bedGain);
      o.start();
      lfo.start();
    });
  }

  private makeImpulse(dur: number, decay: number): AudioBuffer {
    const ac = this.ac!;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // visual layer drains pending note events each frame
  drainEvents(): NoteEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  get currentTime(): number {
    return this.ac ? this.ac.currentTime : 0;
  }

  get isRunning(): boolean {
    return this.running && !!this.ac;
  }

  dispose(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ac) {
      void this.ac.close();
      this.ac = null;
    }
  }
}
