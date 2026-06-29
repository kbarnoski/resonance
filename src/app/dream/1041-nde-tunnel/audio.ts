/* ── 1041-nde-tunnel · cosmic-ambient generative audio engine ─────────────
 *
 *  Pure Web Audio API. A sustained generative drone bank feeds a synthetic
 *  convolution-reverb "void" for cathedral/underwater vastness. A low-pass
 *  filter OPENS toward the light and closes on return. The whole rig is
 *  driven from the same timeline as the visuals — but DELIBERATELY LAGGED:
 *  the audio swell trails the visual surge (the ketamine NMDA-antagonist
 *  audio-visual desync), so the two normally-bound streams gently decouple.
 *
 *  Master gain is modest and ramps in/out smoothly; teardown is complete.
 */

interface DroneVoice {
  osc: OscillatorNode;
  sub: OscillatorNode; // detuned partner for slow beating
  gain: GainNode;
  baseHz: number;
}

export interface NdeAudio {
  /** Drive per-frame. `light` 0..1 = nearness to the being of light. */
  update(light: number, openness: number, timeScale: number): void;
  /** Smoothly silence + tear down everything. */
  stop(): void;
}

/* Build a long synthetic impulse response: exponentially-decaying, low-pass
 * filtered noise. Gives a ~4s cathedral tail without any external asset. */
function makeImpulseResponse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.4); // smooth exponential-ish tail
      const noise = Math.random() * 2 - 1;
      // one-pole low-pass to remove harshness → "underwater" darkness
      lp += (noise - lp) * 0.22;
      data[i] = lp * decay;
    }
  }
  return ir;
}

/** Root frequencies of the drone bank — a low, slightly detuned open chord
 *  (fundamental + fifth + octave + a high shimmering partner). Hz. */
const DRONE_HZ = [55.0, 82.4, 110.0, 164.8];

export function makeNdeAudio(ac: AudioContext, masterTarget = 0.15): NdeAudio {
  const now = ac.currentTime;

  // ── master chain: drones → filter → [dry + reverb] → master → out ──
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 6); // slow fade-in

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(220, now); // starts closed/dark
  filter.Q.value = 0.7;

  const convolver = ac.createConvolver();
  convolver.buffer = makeImpulseResponse(ac, 4.5);

  const wet = ac.createGain();
  wet.gain.value = 0.85; // generous reverb for vastness
  const dry = ac.createGain();
  dry.gain.value = 0.55;

  filter.connect(dry);
  filter.connect(convolver);
  convolver.connect(wet);
  dry.connect(master);
  wet.connect(master);

  // gentle limiter so the swell never clips
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.3;
  master.connect(limiter);
  limiter.connect(ac.destination);

  // ── drone bank ──
  const voices: DroneVoice[] = DRONE_HZ.map((hz, i) => {
    const osc = ac.createOscillator();
    const sub = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = i >= 3 ? "triangle" : "sine";
    sub.type = "sine";
    osc.frequency.value = hz;
    sub.frequency.value = hz * 1.003 + 0.07 * (i + 1); // slow beating
    gain.gain.value = 0.0001;
    osc.connect(gain);
    sub.connect(gain);
    gain.connect(filter);
    osc.start(now);
    sub.start(now);
    // stagger voice entries for an "opening void" feel
    gain.gain.exponentialRampToValueAtTime(
      i >= 3 ? 0.06 : 0.16,
      now + 4 + i * 1.5,
    );
    return { osc, sub, gain, baseHz: hz };
  });

  // lagged envelope state: audio target trails the visual `light`
  let laggedLight = 0;
  let stopped = false;

  return {
    update(light: number, openness: number, timeScale: number) {
      if (stopped) return;
      const t = ac.currentTime;
      // ── dissociation desync: ease toward the visual light, but slowly,
      //    so the audio swell arrives a beat after the visual surge ──
      const lag = 0.018 * timeScale; // smaller = more lag
      laggedLight += (light - laggedLight) * lag;

      // filter OPENS toward the light, closes on return
      const cutoff = 200 + laggedLight * 2600 + openness * 400;
      filter.frequency.setTargetAtTime(cutoff, t, 0.4);

      // the high shimmer voice swells with the light; reverb wet rises too
      voices[3].gain.gain.setTargetAtTime(0.05 + laggedLight * 0.12, t, 0.6);
      wet.gain.setTargetAtTime(0.7 + laggedLight * 0.35, t, 0.8);

      // very slow pitch drift on the partners for time-dilation shimmer
      const drift = 1 + 0.002 * Math.sin(t * 0.05 * timeScale);
      voices.forEach((v) => {
        v.sub.frequency.setTargetAtTime(
          v.baseHz * 1.003 * drift,
          t,
          1.5,
        );
      });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      voices.forEach((v) => {
        try {
          v.osc.stop(t + 1.4);
          v.sub.stop(t + 1.4);
        } catch {
          /* already stopped */
        }
      });
      window.setTimeout(() => {
        voices.forEach((v) => {
          v.osc.disconnect();
          v.sub.disconnect();
          v.gain.disconnect();
        });
        filter.disconnect();
        convolver.disconnect();
        wet.disconnect();
        dry.disconnect();
        limiter.disconnect();
        master.disconnect();
      }, 1600);
    },
  };
}
