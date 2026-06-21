/**
 * AudioEngine for 799-kids-sing-garden.
 * Handles mic input, pitch detection, ambient pad, and call-and-response playback.
 */

// C-major pentatonic: C D E G A across several octaves
const PENTATONIC_HZ = [
  65.41, 73.42, 82.41, 98.0, 110.0,
  130.81, 146.83, 164.81, 196.0, 220.0,
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.26, 784.0, 880.0,
];

/** Snap a frequency to the nearest C-major pentatonic pitch */
function snapToPentatonic(hz: number): number {
  let best = PENTATONIC_HZ[0];
  let bestDist = Math.abs(hz - best);
  for (const p of PENTATONIC_HZ) {
    const d = Math.abs(hz - p);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** Normalized autocorrelation (Chris Wilson / ACF2+ method) pitch detection.
 *  Returns fundamental frequency in Hz, or -1 if unclear. */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;

  // RMS gate
  let rmsSum = 0;
  for (let i = 0; i < n; i++) rmsSum += buf[i] * buf[i];
  const rms = Math.sqrt(rmsSum / n);
  if (rms < 0.008) return -1;

  // Autocorrelation
  const corr = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    corr[lag] = s;
  }

  // Normalize by corr[0] to get range –1…1
  if (corr[0] === 0) return -1;
  const norm = new Float32Array(n);
  for (let i = 0; i < n; i++) norm[i] = corr[i] / corr[0];

  // Find first zero-crossing, then the next peak
  let start = 0;
  while (start < n - 1 && norm[start] > 0) start++;
  if (start >= n - 1) return -1;

  let maxVal = -1;
  let maxIdx = start;
  for (let i = start; i < n; i++) {
    if (norm[i] > maxVal) { maxVal = norm[i]; maxIdx = i; }
  }

  // Clarity threshold
  if (maxVal < 0.82) return -1;

  // Parabolic interpolation for sub-sample accuracy
  const y0 = norm[Math.max(0, maxIdx - 1)];
  const y1 = norm[maxIdx];
  const y2 = norm[Math.min(n - 1, maxIdx + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom === 0 ? maxIdx : maxIdx + (y0 - y2) / denom;

  const freq = sampleRate / refined;
  return freq >= 80 && freq <= 900 ? freq : -1;
}

/** Compute RMS from float time-domain data */
function computeRms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private timeDomainBuf: Float32Array | null = null;
  private rafId: number | null = null;

  // Phrase tracking
  private phrase: Array<{ hz: number; duration: number }> = [];
  private lastVoiceAt = 0;
  private silenceTimerId: ReturnType<typeof setTimeout> | null = null;
  private silenceThresholdMs = 1000;
  private onSilenceCb: (() => void) | null = null;
  private lastNoteHz = 0;
  private noteStartedAt = 0;
  private isInSilence = false;

  // Ghost hum (mic-denied fallback)
  private ghostActive = false;
  private ghostTimerId: ReturnType<typeof setTimeout> | null = null;

  // Ambient pad oscillators
  private padOscs: OscillatorNode[] = [];

  async start(
    onPitch: (hz: number, rms: number) => void,
    onSilence: () => void
  ): Promise<void> {
    this.onSilenceCb = onSilence;

    const Ctx =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext as typeof AudioContext;
    this.ctx = new Ctx();

    // Master chain: masterGain → lowpass → compressor → destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.28;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 7000;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.knee.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    this.masterGain.connect(lpf);
    lpf.connect(comp);
    comp.connect(this.ctx.destination);

    // Always-on ambient pad: C2 + G2 with slow LFO
    this.startAmbientPad();

    // Try to open microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;

      const source = this.ctx.createMediaStreamSource(stream);

      // Analyser — NOT connected to destination (no feedback)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.1;
      source.connect(this.analyser);

      this.timeDomainBuf = new Float32Array(this.analyser.fftSize);
      this.lastVoiceAt = performance.now();
      this.isInSilence = false;

      this.runAnalysisLoop(onPitch);
    } catch {
      // Mic denied → ghost hum fallback
      this.startGhostHum(onPitch);
    }
  }

  private startAmbientPad(): void {
    if (!this.ctx || !this.masterGain) return;

    const notes = [65.41, 98.0]; // C2, G2
    const detunes = [0, 5];

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = detunes[i];

      const padGain = this.ctx.createGain();
      padGain.gain.value = 0;

      // Slow LFO on gain
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07 + i * 0.03;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.008;

      lfo.connect(lfoGain);
      lfoGain.connect(padGain.gain);
      padGain.gain.setValueAtTime(0.018, this.ctx.currentTime);

      osc.connect(padGain);
      padGain.connect(this.masterGain);

      osc.start();
      lfo.start();
      this.padOscs.push(osc, lfo);
    });
  }

  private runAnalysisLoop(onPitch: (hz: number, rms: number) => void): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.analyser || !this.timeDomainBuf || !this.ctx) return;

      this.analyser.getFloatTimeDomainData(
        this.timeDomainBuf as unknown as Float32Array<ArrayBuffer>
      );

      const rms = computeRms(this.timeDomainBuf);
      const hz = detectPitch(this.timeDomainBuf, this.ctx.sampleRate);

      const nowMs = performance.now();

      if (hz > 0 && rms > 0.012) {
        // Voice detected
        const snapped = snapToPentatonic(hz);

        if (this.isInSilence) {
          // Came back from silence — new note
          this.isInSilence = false;
          this.noteStartedAt = nowMs;
          this.lastNoteHz = snapped;
        }

        if (Math.abs(snapped - this.lastNoteHz) > 5) {
          // Pitch changed — close previous note, start new
          if (this.lastNoteHz > 0 && this.noteStartedAt > 0) {
            const dur = (nowMs - this.noteStartedAt) / 1000;
            this.phrase.push({ hz: this.lastNoteHz, duration: dur });
            if (this.phrase.length > 32) this.phrase.shift();
          }
          this.noteStartedAt = nowMs;
          this.lastNoteHz = snapped;
        }

        this.lastVoiceAt = nowMs;
        onPitch(snapped, rms);

        // Clear any pending silence timer
        if (this.silenceTimerId !== null) {
          clearTimeout(this.silenceTimerId);
          this.silenceTimerId = null;
        }
      } else {
        // Silent frame
        if (!this.isInSilence && nowMs - this.lastVoiceAt > this.silenceThresholdMs) {
          this.isInSilence = true;

          // Close last note
          if (this.lastNoteHz > 0 && this.noteStartedAt > 0) {
            const dur = (nowMs - this.noteStartedAt) / 1000;
            this.phrase.push({ hz: this.lastNoteHz, duration: dur });
            if (this.phrase.length > 32) this.phrase.shift();
          }
          this.lastNoteHz = 0;
          this.noteStartedAt = 0;

          // Fire silence callback
          if (this.phrase.length > 0 && this.onSilenceCb) {
            const cb = this.onSilenceCb;
            this.silenceTimerId = setTimeout(() => {
              cb();
              this.silenceTimerId = null;
            }, 100);
          }
        }
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private startGhostHum(onPitch: (hz: number, rms: number) => void): void {
    this.ghostActive = true;

    // Auto-populate phrase with pentatonic melody
    const ghostNotes = [261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 261.63];
    let noteIdx = 0;

    const playGhostNote = () => {
      if (!this.ghostActive) return;
      const hz = ghostNotes[noteIdx % ghostNotes.length];
      const rms = 0.3 + Math.random() * 0.2;
      noteIdx++;

      this.phrase.push({ hz, duration: 0.4 + Math.random() * 0.3 });
      if (this.phrase.length > 32) this.phrase.shift();

      onPitch(hz, rms);

      // After a phrase of notes, fire silence → call-and-response
      if (noteIdx % 5 === 0 && this.onSilenceCb) {
        setTimeout(() => {
          if (this.onSilenceCb) this.onSilenceCb();
        }, 500);
      }

      const nextDelay = 400 + Math.random() * 600;
      this.ghostTimerId = setTimeout(playGhostNote, nextDelay);
    };

    // Start after 2 seconds
    this.ghostTimerId = setTimeout(playGhostNote, 2000);
  }

  /** Play a melody back on soft mallet/bell voice */
  playCallResponse(notes: Array<{ hz: number; duration: number }>): void {
    if (!this.ctx || !this.masterGain || notes.length === 0) return;

    let t = this.ctx.currentTime + 0.1;

    for (const note of notes) {
      const dur = Math.min(1.2, Math.max(0.1, note.duration));
      this.playBellNote(note.hz, t, dur);
      // Also play shimmer octave above
      if (note.hz * 2 < 1800) {
        this.playBellNote(note.hz * 2, t + 0.02, dur * 0.6);
      }
      t += dur * 0.85 + 0.05;
    }
  }

  private playBellNote(hz: number, startTime: number, dur: number): void {
    if (!this.ctx || !this.masterGain) return;

    // Main sine (mallet fundamental)
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;

    // Inharmonic partial for bell character
    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 2.756; // classic bell inharmonic ratio

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(0.22, startTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + dur + 0.3);

    const env2 = this.ctx.createGain();
    env2.gain.setValueAtTime(0, startTime);
    env2.gain.linearRampToValueAtTime(0.06, startTime + 0.005);
    env2.gain.exponentialRampToValueAtTime(0.001, startTime + dur * 0.4);

    osc.connect(env);
    osc2.connect(env2);
    env.connect(this.masterGain);
    env2.connect(this.masterGain);

    osc.start(startTime);
    osc2.start(startTime);
    osc.stop(startTime + dur + 0.4);
    osc2.stop(startTime + dur + 0.4);
  }

  /** Get the currently accumulated phrase */
  getPhrase(): Array<{ hz: number; duration: number }> {
    return [...this.phrase];
  }

  /** Clear the phrase buffer */
  clearPhrase(): void {
    this.phrase = [];
  }

  stop(): void {
    this.ghostActive = false;
    if (this.ghostTimerId !== null) {
      clearTimeout(this.ghostTimerId);
      this.ghostTimerId = null;
    }
    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const osc of this.padOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.padOscs = [];
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.masterGain = null;
    this.timeDomainBuf = null;
    this.onSilenceCb = null;
  }
}
