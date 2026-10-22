// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound of Foreshadow. Everything here is Karel's OWN recording:
// no oscillator, no synth, no noise. All nodes terminate at safeMaster.input.
//
//  · GROUND TRUTH: one decoded take loops at ~0.9 gain — the harmony that
//    actually arrives.
//  · GHOST PRE-ECHO: just before a chord boundary we play a quiet, warm "ghost"
//    of the PREDICTED chord by replaying another instance of that chord symbol
//    from elsewhere in the take (a slice of his decoded buffer, long raised-
//    cosine window, low-pass warmed). You HEAR the harmony arriving before it
//    does. If the predicted symbol never recurs in the piece, we fall back to a
//    two-DelayNode, raised-cosine-crossfaded pitch-shift that nudges the current
//    slice toward the predicted root — still his audio, still no oscillator.
//    (Honest caveat: most predicted chords DO recur, so the self-foreshadow
//    slice plays almost always; the pitch-shift fallback is rare and its tuning
//    is approximate — a felt warm nudge, not a precise transposition.)
//  · SETTLE BLOOM: on arrival, a soft warm swell of the chord that actually
//    came, its brightness scaled by surprisal (the felt "resolution" — or the
//    felt rupture when the forecast was defied).
// ─────────────────────────────────────────────────────────────────────────────

import { chordRoot, type TrackChord } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

interface Voice {
  nodes: AudioNode[];
  src: AudioBufferSourceNode;
}

export interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  duration: number;
  freq: Uint8Array<ArrayBuffer>;
  playhead(): number;
  /** Quiet warm ghost of the predicted chord, ahead of its arrival. */
  foreshadow(
    predictedSymbol: string,
    predictedRoot: number,
    current: TrackChord,
    gain: number,
  ): void;
  /** Warm swell of the chord that actually arrived (intensity from surprisal). */
  settle(arrived: TrackChord, intensity: number): void;
  teardown(): void;
}

function raisedCosine(len: number): Float32Array {
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
  return w;
}

export function createEngine(
  ctx: AudioContext,
  buffer: AudioBuffer,
  chords: TrackChord[],
): Engine {
  const master = createSafeMaster(ctx);
  const duration = buffer.duration;

  // ── ground truth: the take loops at ~0.9 ──
  const loopGain = ctx.createGain();
  loopGain.gain.value = 0.0001;
  loopGain.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2); // gentle fade-in
  loopGain.connect(master.input);

  const loopSrc = ctx.createBufferSource();
  loopSrc.buffer = buffer;
  loopSrc.loop = true;
  loopSrc.connect(loopGain);
  const startTime = ctx.currentTime + 0.06;
  loopSrc.start(startTime);

  const freq = new Uint8Array(master.analyser.frequencyBinCount);
  const voices: Voice[] = [];

  function trackVoice(v: Voice): void {
    voices.push(v);
    v.src.onended = () => {
      for (const n of v.nodes) {
        try {
          n.disconnect();
        } catch {
          /* noop */
        }
      }
      const i = voices.indexOf(v);
      if (i >= 0) voices.splice(i, 1);
    };
  }

  // Play a windowed slice of HIS buffer, low-pass warmed, through the master.
  function playSlice(
    offset: number,
    dur: number,
    peak: number,
    cutoff: number,
  ): void {
    const off = Math.max(0, Math.min(duration - 0.05, offset));
    const d = Math.max(0.12, Math.min(dur, duration - off, 1.6));
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    const win = raisedCosine(48);
    for (let i = 0; i < win.length; i++) win[i] *= peak;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.setValueCurveAtTime(win, now + 0.005, d);

    src.connect(lp);
    lp.connect(g);
    g.connect(master.input);
    try {
      src.start(now, off, d + 0.06);
      src.stop(now + d + 0.1);
    } catch {
      return;
    }
    trackVoice({ nodes: [lp, g], src });
  }

  // Rare fallback: two delay lines, raised-cosine crossfaded, ramp the active
  // delay each segment to transpose the current slice toward the predicted root.
  // Driven entirely by AudioParam automation — no oscillator. Tuning is approx.
  function playPitchNudge(
    offset: number,
    dur: number,
    semitones: number,
    peak: number,
  ): void {
    const off = Math.max(0, Math.min(duration - 0.05, offset));
    const d = Math.max(0.2, Math.min(dur, duration - off, 1.4));
    const ratio = Math.pow(2, semitones / 12);
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const d1 = ctx.createDelay(0.3);
    const d2 = ctx.createDelay(0.3);
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const outG = ctx.createGain();

    src.connect(d1);
    src.connect(d2);
    d1.connect(g1);
    d2.connect(g2);
    g1.connect(lp);
    g2.connect(lp);
    lp.connect(outG);
    outG.connect(master.input);

    const seg = 0.09;
    const segs = Math.max(2, Math.floor(d / seg));
    const slope = (1 - ratio) * seg; // delay change per segment
    const mid = 0.12;
    const S = 32;
    const up = new Float32Array(S);
    const down = new Float32Array(S);
    for (let i = 0; i < S; i++) {
      const c = 0.5 - 0.5 * Math.cos((Math.PI * i) / (S - 1));
      up[i] = c;
      down[i] = 1 - c;
    }
    for (let s = 0; s < segs; s++) {
      const t0 = now + 0.005 + s * seg;
      const first = s % 2 === 0;
      const gA = first ? g1 : g2;
      const gB = first ? g2 : g1;
      const dA = first ? d1 : d2;
      gA.gain.setValueCurveAtTime(up, t0, seg);
      gB.gain.setValueCurveAtTime(down, t0, seg);
      const start = Math.max(0.01, Math.min(0.28, mid + slope * 0.5));
      const end = Math.max(0.01, Math.min(0.28, mid - slope * 0.5));
      dA.delayTime.setValueAtTime(start, t0);
      dA.delayTime.linearRampToValueAtTime(end, t0 + seg);
    }
    // overall raised-cosine envelope
    const env = raisedCosine(48);
    for (let i = 0; i < env.length; i++) env[i] *= peak;
    outG.gain.setValueAtTime(0.0001, now);
    outG.gain.setValueCurveAtTime(env, now + 0.005, d);

    try {
      src.start(now, off, d + 0.06);
      src.stop(now + d + 0.12);
    } catch {
      return;
    }
    trackVoice({ nodes: [d1, d2, g1, g2, lp, outG], src });
  }

  return {
    ctx,
    master,
    buffer,
    duration,
    freq,
    playhead() {
      return ((ctx.currentTime - startTime) % duration + duration) % duration;
    },
    foreshadow(predictedSymbol, predictedRoot, current, gain) {
      // find another instance of the predicted chord symbol elsewhere in the take
      let bestDur = -1;
      let pick: TrackChord | null = null;
      for (const c of chords) {
        if (c.chord !== predictedSymbol) continue;
        if (Math.abs(c.time - current.time) < 0.4) continue; // not the one at hand
        // prefer a clean, roughly 1s instance
        const score = -Math.abs((c.duration || 1) - 1.0);
        if (score > bestDur) {
          bestDur = score;
          pick = c;
        }
      }
      if (pick) {
        playSlice(pick.time, Math.min(pick.duration || 1.1, 1.3), gain, 1200);
        return;
      }
      // fallback: nudge the current slice toward the predicted root (rare)
      const curRoot = chordRoot(current.chord);
      let semis = 0;
      if (curRoot !== null) {
        semis = ((predictedRoot - curRoot + 18) % 12) - 6; // nearest direction
      }
      playPitchNudge(current.time, Math.min(current.duration || 1.0, 1.2), semis, gain * 0.9);
    },
    settle(arrived, intensity) {
      const peak = 0.3 + 0.4 * Math.max(0, Math.min(1, intensity));
      // brighter tone-cap when the arrival was a surprise (a felt rupture of light)
      const cutoff = 900 + intensity * 2200;
      playSlice(arrived.time, Math.min(arrived.duration || 1.2, 1.4), peak, cutoff);
    },
    teardown() {
      for (const v of voices.slice()) {
        try {
          v.src.stop();
        } catch {
          /* noop */
        }
        for (const n of v.nodes) {
          try {
            n.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      voices.length = 0;
      try {
        loopSrc.stop();
      } catch {
        /* noop */
      }
      try {
        loopSrc.disconnect();
      } catch {
        /* noop */
      }
      try {
        loopGain.disconnect();
      } catch {
        /* noop */
      }
      master.disconnect();
      if (ctx.state !== "closed") void ctx.close();
    },
  };
}
