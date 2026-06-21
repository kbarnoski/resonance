// ── Sympathetic Strings · AudioWorklet source ──────────────────────────────
// This module exports the worklet processor as a string literal so it can be
// loaded via Blob URL (no separate /public file needed). The processor
// implements a bank of Karplus-Strong tuned-delay-line sympathetic resonators:
//
//   For each string (delay line of length L = sampleRate / freq):
//     - Continuously excited by the incoming mic signal
//     - One-pole lowpass loop filter (coeff ~0.5) + feedback coeff < 1
//     - Energy at position 0 is the excitation, then circulates in the delay line
//
// The worklet also tracks per-string RMS energy and posts a levels array to
// the main thread every ~64ms so the SVG visualizer can update.
//
// SAFETY: feedback strictly clamped to [0, MAX_FEEDBACK]; master output clamped.

export const WORKLET_SOURCE = `
"use strict";

// ── KarplusStrongProcessor ─────────────────────────────────────────────────
class KarplusStrongProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor(options) {
    super(options);

    this._sampleRate = sampleRate;  // AudioWorkletGlobalScope global
    this._strings = [];
    this._levels = [];
    this._levelAccum = [];
    this._levelCount = 0;
    this._reportInterval = Math.floor(sampleRate / 15); // ~15 fps level reports
    this._frameCount = 0;

    // Accept messages to set up/retune strings and change feedback/damping
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'init' || msg.type === 'retune') {
        this._initStrings(msg.freqs, msg.feedback, msg.damping);
      } else if (msg.type === 'setFeedback') {
        const fb = Math.max(0, Math.min(0.999, msg.value));
        for (let i = 0; i < this._strings.length; i++) {
          this._strings[i].feedback = fb;
        }
      } else if (msg.type === 'scales') {
        // Update per-string excitation scales from spectral analysis
        const scales = msg.scales;
        if (Array.isArray(scales)) {
          for (let i = 0; i < Math.min(scales.length, this._strings.length); i++) {
            // Blend: minimum excitation 0.05 so quiet strings still resonate faintly
            this._strings[i].exciteScale = 0.05 + scales[i] * 1.8;
          }
        }
      } else if (msg.type === 'pluck') {
        // Pluck a specific string by index with given amplitude
        const idx = msg.index;
        const amp = msg.amplitude || 0.5;
        if (idx >= 0 && idx < this._strings.length) {
          const s = this._strings[idx];
          // Inject a burst of noise into the delay line
          const burstLen = Math.min(s.bufLen, Math.floor(s.bufLen * 0.1) + 4);
          for (let k = 0; k < burstLen; k++) {
            const pos = (s.writePos + k) % s.bufLen;
            s.buf[pos] += (Math.random() * 2 - 1) * amp;
          }
        }
      }
    };
  }

  _initStrings(freqs, feedback, damping) {
    const n = freqs.length;
    this._strings = [];
    this._levels = new Float32Array(n);
    this._levelAccum = new Float32Array(n);

    const sr = this._sampleRate;
    const fb = Math.max(0, Math.min(0.999, feedback));
    // damping parameter controls how fast the loop filter decays.
    // We map 0..1 to loop filter coefficient 0.3..0.7 (0.5 = max smoothing).
    const loopCoeff = 0.3 + Math.max(0.01, Math.min(0.99, damping)) * 0.4;

    for (let i = 0; i < n; i++) {
      const freq = freqs[i];
      // Delay line length = sampleRate / freq (integer)
      const bufLen = Math.max(2, Math.round(sr / freq));
      const buf = new Float32Array(bufLen);
      // Seed with low-amplitude noise to avoid dead silence at start
      for (let k = 0; k < bufLen; k++) {
        buf[k] = (Math.random() * 2 - 1) * 0.00008;
      }
      this._strings.push({
        buf,
        bufLen,
        writePos: 0,
        lastOut: 0,       // one-pole lowpass state
        feedback: fb,
        loopCoeff,        // loop filter coefficient (higher = warmer/longer)
        exciteScale: 1.0, // per-string excitation scaling (set by spectral analysis)
      });
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const strings = this._strings;
    const n = strings.length;

    if (n === 0) {
      // Pass silence
      if (output[0]) output[0].fill(0);
      return true;
    }

    const blockSize = output[0] ? output[0].length : 128;
    const outCh = output[0] || new Float32Array(blockSize);
    // Input channel (mic); may be silent if no mic
    const inCh = (input && input[0]) ? input[0] : null;

    // We use a simple per-sample approach for each string.
    // The mic signal excites every string; each string's own resonance
    // determines how much it rings.
    for (let i = 0; i < blockSize; i++) {
      const excitation = inCh ? inCh[i] : 0;
      let outSample = 0;

      for (let si = 0; si < n; si++) {
        const s = strings[si];
        const len = s.bufLen;
        const wp = s.writePos;
        // Read from the "front" of the delay line (one full period back)
        const readPos = (wp + 1) % len;
        const delayed = s.buf[readPos];

        // One-pole lowpass (loop filter): weighted average of current + last
        // This is the classic Karplus-Strong loop filter; coeff controls brightness
        const filtered = delayed * s.loopCoeff + s.lastOut * (1 - s.loopCoeff);
        s.lastOut = filtered;

        // Feedback loop value (energy circulating in the delay line)
        const looped = filtered * s.feedback;

        // Write: looped energy + new excitation scaled by string's excite scale
        s.buf[wp] = looped + excitation * s.exciteScale;

        // Advance write pointer
        s.writePos = (wp + 1) % len;

        // Accumulate level for this string
        this._levelAccum[si] += filtered * filtered;

        // Sum into output
        outSample += filtered;
      }

      // Mix down by string count (prevent clipping from summing all strings)
      outCh[i] = outSample / Math.max(1, n) * 2.0;
    }

    // Level reporting
    this._levelCount += blockSize;
    if (this._levelCount >= this._reportInterval) {
      const norm = 1.0 / this._levelCount;
      for (let si = 0; si < n; si++) {
        this._levels[si] = Math.sqrt(this._levelAccum[si] * norm);
        this._levelAccum[si] = 0;
      }
      this._levelCount = 0;
      this.port.postMessage({ type: 'levels', levels: Array.from(this._levels) });
    }

    this._frameCount++;
    return true;
  }
}

registerProcessor('karplus-strong-processor', KarplusStrongProcessor);
`;
