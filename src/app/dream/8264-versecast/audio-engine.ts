// VerseCast — audio engine + prosody analyzer.
//
// Two of the four subsystems live here:
//   (1) PROSODY ANALYZER  — classify(char) + noteContext() turn text into
//       musical intent (vowels -> sustained pitch classes, consonants ->
//       transient attacks, punctuation -> cadence/rest, line -> register).
//   (2) VOICE ENGINE + POLYPHONIC SCHEDULER — Web Audio graph, low-latency
//       triggering, and a voice-manager that caps polyphony and lets a
//       backspace silence the most recent voice.
//
// No Math.random / Date.now / new Date anywhere. Randomness comes from an
// injected mulberry32 stream; time comes from the AudioContext clock.

export type Role = "vowel" | "consonant" | "punct" | "space" | "newline";

export interface Classified {
  role: Role;
  // 0..1 "warmth/register hint" used by the visual layer for tinting.
  tone: number;
}

// ---- prosody analyzer -------------------------------------------------------

const VOWELS = "aeiouy";
// Warm minor-pentatonic-ish scale degrees (semitones from the line root).
const VOWEL_ST: Record<string, number> = {
  a: 0,
  e: 3,
  i: 5,
  o: 7,
  u: 10,
  y: 12,
};
const SCALE = [0, 3, 5, 7, 10, 12, 15];
// Interlocking registers assigned per line so stacked lines voice apart.
const REGISTER = [0, 7, -5, 12, -12, 5, -7];
const ROOT_MIDI = 50; // ~D3

const VOICED = "bdgvzmnlrwj"; // pitched consonant plucks
// everything else consonantal (p t k f s h c x q ...) -> noise clicks

export function classify(ch: string): Classified {
  if (ch === "\n") return { role: "newline", tone: 0.5 };
  if (ch === " " || ch === "\t") return { role: "space", tone: 0 };
  const lower = ch.toLowerCase();
  if (/[a-z]/.test(lower)) {
    if (VOWELS.includes(lower)) {
      return { role: "vowel", tone: 0.55 + (VOWEL_ST[lower] ?? 0) / 24 };
    }
    return { role: "consonant", tone: 0.2 + (lower.charCodeAt(0) % 7) / 20 };
  }
  if (/[.,;:!?]/.test(ch)) return { role: "punct", tone: 0.35 };
  return { role: "consonant", tone: 0.15 };
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Context derived from the text that precedes a keystroke.
export interface NoteContext {
  wordLen: number; // length of the trailing word -> phrase length
  lineIndex: number; // which line -> register
}

export function contextFor(prevText: string): NoteContext {
  const lines = prevText.split("\n");
  const lineIndex = lines.length - 1;
  const current = lines[lineIndex] ?? "";
  const m = current.match(/[A-Za-z]+$/);
  const wordLen = m ? m[0].length : 0;
  return { wordLen, lineIndex };
}

// ---- voice engine + scheduler ----------------------------------------------

export type VoiceHandle = { release: (when?: number) => void } | null;

type Rng = () => number;

export class VerseEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sustained: Array<{ h: NonNullable<VoiceHandle>; born: number }> = [];
  private rng: Rng;
  private readonly MAX = 12;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  // Must be called from a user gesture (autoplay policy).
  async unlock(): Promise<boolean> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return true;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    tone.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    // Contemplative tail: a soft feedback delay send.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.28;
    delay.connect(feedback);
    feedback.connect(delay);
    delaySend.connect(delay);
    delay.connect(tone);

    tone.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);

    this.master = master;
    this.tone = tone;
    this.comp = comp;
    this.delay = delay;
    this.feedback = feedback;
    this.delaySend = delaySend;

    // one shared noise buffer for consonant clicks / breaths
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = this.rng() * 2 - 1;
    this.noise = buf;

    if (ctx.state === "suspended") await ctx.resume();
    return true;
  }

  private jitterCents(): number {
    return (this.rng() * 2 - 1) * 7;
  }

  private out(node: AudioNode) {
    if (this.tone) node.connect(this.tone);
    if (this.delaySend) node.connect(this.delaySend);
  }

  private cap() {
    if (this.sustained.length <= this.MAX) return;
    this.sustained.sort((a, b) => a.born - b.born);
    while (this.sustained.length > this.MAX) {
      const v = this.sustained.shift();
      v?.h.release();
    }
  }

  // Trigger sound for one character. Returns a handle only for sustained
  // (vowel) voices so a backspace can silence exactly that voice.
  trigger(ch: string, cx: NoteContext): VoiceHandle {
    const ctx = this.ctx;
    if (!ctx) return null;
    const info = classify(ch);
    const reg = REGISTER[((cx.lineIndex % REGISTER.length) + REGISTER.length) %
      REGISTER.length];
    const now = ctx.currentTime;

    if (info.role === "vowel") {
      const lower = ch.toLowerCase();
      const st = VOWEL_ST[lower] ?? 0;
      const freq = midiToFreq(ROOT_MIDI + st + reg);
      const dur = 0.5 + Math.min(cx.wordLen, 10) * 0.13; // word -> phrase len
      return this.sustainedVoice(freq, dur, now);
    }

    if (info.role === "consonant") {
      const lower = ch.toLowerCase();
      if (VOICED.includes(lower)) {
        const deg = SCALE[lower.charCodeAt(0) % SCALE.length];
        this.pluck(midiToFreq(ROOT_MIDI + 12 + deg + reg), now, 0.09);
      } else {
        this.click(1400 + (lower.charCodeAt(0) % 11) * 260, now, 0.085);
      }
      return null;
    }

    if (info.role === "punct") {
      this.punctuate(ch, reg, now);
      return null;
    }

    if (info.role === "space") {
      this.breath(now);
      return null;
    }

    return null; // newline: register change is handled by the next note
  }

  private sustainedVoice(freq: number, dur: number, now: number): VoiceHandle {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = this.jitterCents();
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq;
    osc2.detune.value = -12 + this.jitterCents();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.13, now + 0.03);
    g.gain.setValueAtTime(0.13, now + Math.max(0.06, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    osc2.connect(g);
    this.out(g);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + dur + 0.05);
    osc2.stop(now + dur + 0.05);

    let released = false;
    const entry = {
      h: {
        release: (when?: number) => {
          if (released || !this.ctx) return;
          released = true;
          const t = when ?? this.ctx.currentTime;
          try {
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
            osc.stop(t + 0.16);
            osc2.stop(t + 0.16);
          } catch {
            /* node already stopped */
          }
          this.sustained = this.sustained.filter((v) => v.h !== entry.h);
        },
      },
      born: now,
    };
    this.sustained.push(entry);
    osc.onended = () => {
      this.sustained = this.sustained.filter((v) => v.h !== entry.h);
    };
    this.cap();
    return entry.h;
  }

  private pluck(freq: number, now: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = this.jitterCents();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 1.5;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.1, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(bp);
    bp.connect(g);
    this.out(g);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  private click(freq: number, now: number, dur: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + this.rng() * 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp);
    bp.connect(g);
    this.out(g);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  private breath(now: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.02, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    src.connect(lp);
    lp.connect(g);
    if (this.tone) g.connect(this.tone);
    src.start(now);
    src.stop(now + 0.18);
  }

  private punctuate(ch: string, reg: number, now: number) {
    if (ch === "?") {
      // rising inflection
      const ctx = this.ctx!;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const f0 = midiToFreq(ROOT_MIDI + 7 + reg);
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.5, now + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      osc.connect(g);
      this.out(g);
      osc.start(now);
      osc.stop(now + 0.36);
      return;
    }
    if (ch === "!") {
      this.pluck(midiToFreq(ROOT_MIDI + 24 + reg), now, 0.14);
      return;
    }
    // . , ; : -> soft cadence chord in the low register (a rest that resolves)
    const dur = ch === "." ? 1.3 : 0.7;
    const gain = ch === "." ? 0.09 : 0.06;
    const chord = ch === "." ? [0, 7, 12] : [0, 7];
    const ctx = this.ctx!;
    for (const st of chord) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToFreq(ROOT_MIDI - 12 + st + reg);
      osc.detune.value = this.jitterCents();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      this.out(g);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
  }

  // Silence the most recent sustained voice (used on backspace).
  releaseLatest() {
    const v = this.sustained[this.sustained.length - 1];
    v?.h.release();
  }

  async close() {
    for (const v of this.sustained) v.h.release();
    this.sustained = [];
    try {
      this.master?.disconnect();
      this.tone?.disconnect();
      this.comp?.disconnect();
      this.delay?.disconnect();
      this.feedback?.disconnect();
      this.delaySend?.disconnect();
    } catch {
      /* noop */
    }
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* noop */
      }
    }
    this.ctx = null;
  }
}
