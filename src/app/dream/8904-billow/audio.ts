// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — struck spectral-bell modal synthesis. NO drone bed.
//
// Each cloth region owns a pitch. When a region's strain-rate × speed crosses a
// threshold, we STRIKE a modal voice: a bank of inharmonic partials with a fast
// attack + long decay. A fold sweeping across the fabric therefore lights region
// after region = an audible glissando / arpeggio. Louder gust ⇒ brighter (more
// partials) and louder strike.
// ─────────────────────────────────────────────────────────────────────────────

import { NREG, REGX, Excite } from "./cloth";

// classic-ish inharmonic bell partial ratios (relative to the struck pitch)
const RATIOS = [1.0, 2.0, 2.76, 3.0, 4.19, 5.42];
// pentatonic degree per region column → left→right sweep ascends pleasantly
const PENTA = [0, 2, 4, 7, 9, 12];
// octave offset per region row (row 0 = top → brightest)
const ROW_OCT = [12, 7, 0, -5];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function regionFreq(r: number): number {
  const col = r % REGX;
  const row = Math.floor(r / REGX);
  const base = 55; // A2 root
  const midi = base + PENTA[col % PENTA.length] + ROW_OCT[row % ROW_OCT.length];
  return midiToFreq(midi);
}

export class BellField {
  private readonly ac: AudioContext;
  private readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly reverbSend: GainNode;
  private readonly freqs: number[] = [];
  private readonly cooldown: Float32Array; // next-allowed time per region
  private active = 0; // rough live-oscillator count for polyphony guard

  constructor(rng: () => number) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new Ctor();

    this.comp = this.ac.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.master = this.ac.createGain();
    this.master.gain.value = 0.0;

    // small synthesized plate reverb (decaying seeded noise impulse)
    const conv = this.ac.createConvolver();
    const len = Math.floor(this.ac.sampleRate * 1.8);
    const imp = this.ac.createBuffer(2, len, this.ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    conv.buffer = imp;
    this.reverbSend = this.ac.createGain();
    this.reverbSend.gain.value = 0.32;

    this.master.connect(this.comp);
    this.master.connect(this.reverbSend);
    this.reverbSend.connect(conv);
    conv.connect(this.comp);
    this.comp.connect(this.ac.destination);

    for (let r = 0; r < NREG; r++) this.freqs.push(regionFreq(r));
    this.cooldown = new Float32Array(NREG);
  }

  get context(): AudioContext {
    return this.ac;
  }

  async resume(): Promise<void> {
    if (this.ac.state !== "running") await this.ac.resume();
    // fade master up so the first strikes aren't clipped by a cold context
    const now = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.9, now + 0.4);
  }

  suspend(): void {
    if (this.ac.state === "running") void this.ac.suspend();
  }

  close(): void {
    try {
      this.master.disconnect();
      this.comp.disconnect();
    } catch {
      /* already gone */
    }
    if (this.ac.state !== "closed") void this.ac.close();
  }

  // Evaluate every region's excitation and strike where warranted.
  update(excite: Excite[]): void {
    if (this.ac.state !== "running") return;
    const now = this.ac.currentTime;
    for (let r = 0; r < NREG; r++) {
      const e = excite[r];
      // combined excitation: strain-rate (fold sweeping) gated by motion
      const energy = e.strainRate * 26 + e.speed * 0.9;
      if (energy < 0.9) continue;
      if (now < this.cooldown[r]) continue;
      if (this.active > 64) continue;
      const amp = Math.min(0.85, 0.12 + energy * 0.16);
      const brightness = Math.min(1, energy * 0.22);
      this.strike(r, amp, brightness, now);
      this.cooldown[r] = now + 0.11 + (1 - brightness) * 0.14;
    }
  }

  private strike(r: number, amp: number, brightness: number, now: number): void {
    const f0 = this.freqs[r];
    const nP = 3 + Math.round(brightness * (RATIOS.length - 3));
    const voice = this.ac.createGain();
    voice.gain.value = 1;
    voice.connect(this.master);

    for (let p = 0; p < nP; p++) {
      const osc = this.ac.createOscillator();
      osc.type = p === 0 ? "triangle" : "sine";
      osc.frequency.value = f0 * RATIOS[p];
      // slight seeded-free detune per partial for a shimmering, real bell edge
      osc.detune.value = (p % 2 === 0 ? 1 : -1) * p * 1.4;

      const g = this.ac.createGain();
      // higher partials: quieter + faster decay (spectral roll-off)
      const pGain = (amp * (0.9 / (p + 1))) * (0.5 + 0.5 * brightness);
      const decay = (2.4 - p * 0.28) * (0.7 + 0.6 * brightness);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(pGain, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0006, now + Math.max(0.2, decay));

      osc.connect(g);
      g.connect(voice);
      osc.start(now);
      const stop = now + Math.max(0.2, decay) + 0.05;
      osc.stop(stop);
      this.active++;
      osc.onended = () => {
        this.active--;
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* noop */
        }
      };
    }
    // release the voice node a touch after its longest partial
    window.setTimeout(() => {
      try {
        voice.disconnect();
      } catch {
        /* noop */
      }
    }, 3200);
  }
}
