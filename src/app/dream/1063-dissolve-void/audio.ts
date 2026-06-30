/* ── 1063-dissolve-void · generative drone + HRTF-spatialised sound motes ──
 *
 *  Pure Web Audio API. Two layers:
 *
 *  1. A void DRONE bed: detuned sustained sines (a low open chord with slow
 *     beating) → a long low-pass that slowly OPENS → a synthetic convolution
 *     reverb (a multi-second decaying-noise impulse) for vastness. Master
 *     compressor/limiter guards the swell.
 *
 *  2. 5 sparse sound MOTES, each an oscillator + tremolo through its own
 *     HRTF PannerNode (panningModel: "HRTF"), drifting on slow Lissajous
 *     orbits through 3D space AROUND the listener. Vastness comes from
 *     spatialisation — the motes float overhead, behind, beside you.
 *
 *  THE DESYNC (second half of the lab's first desync engine):
 *  The page hands this engine the SAME raw control stream that drives the
 *  visuals. But here we apply a DIFFERENT, longer lag before the control
 *  nudges the AudioListener orientation, the drone filter, and the mote
 *  orbits. Because the visual lag (void.ts) and the audio lag differ — and
 *  both drift across the arc — what you do, what you see, and what you hear
 *  glide out of phase. This enacts the sensory-motor uncoupling that defines
 *  the dissociated brain state (Bera, Looger, Proekt & Cichon, 2026).
 *
 *  AudioContext is only created on a user gesture (the page enforces this).
 */

interface DroneVoice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  baseHz: number;
}

interface SoundMote {
  osc: OscillatorNode;
  lfo: OscillatorNode; // tremolo
  lfoGain: GainNode;
  gain: GainNode;
  panner: PannerNode;
  // slow orbital params
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  phase: number;
}

export interface VoidAudio {
  /**
   * Drive per-frame.
   *  cx, cy : RAW control −1..1 (same stream the visuals get).
   *  depth  : dissociation depth 0..1 (binding looseness).
   *  clarity: gamma-snap 0..1 (re-sync / brighten).
   *  timeScale: global time dilation (<1 = slower).
   */
  update(
    cx: number,
    cy: number,
    depth: number,
    clarity: number,
    timeScale: number,
  ): void;
  stop(): void;
}

/* long synthetic impulse response: exponentially-decaying low-passed noise. */
function makeImpulse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      const noise = Math.random() * 2 - 1;
      lp += (noise - lp) * 0.18;
      data[i] = lp * decay;
    }
  }
  return ir;
}

/* a low, slightly detuned open chord: fundamental, fifth, octave, +2 high. */
const DRONE_HZ = [55.0, 82.4, 110.0, 164.8];
/* the sound motes sit higher — sparse bell-ish partials. */
const MOTE_HZ = [220.0, 277.2, 329.6, 415.3, 493.9];

export function makeVoidAudio(ac: AudioContext, masterTarget = 0.16): VoidAudio {
  const now = ac.currentTime;

  // ── master chain ──
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 7);

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.3;
  master.connect(limiter);
  limiter.connect(ac.destination);

  // shared reverb (drone + motes feed it for one coherent vast space)
  const convolver = ac.createConvolver();
  convolver.buffer = makeImpulse(ac, 5.5);
  const wet = ac.createGain();
  wet.gain.value = 0.9;
  convolver.connect(wet);
  wet.connect(master);

  // ── drone bed ──
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180, now); // starts dark/closed
  filter.Q.value = 0.7;
  const droneDry = ac.createGain();
  droneDry.gain.value = 0.5;
  filter.connect(droneDry);
  filter.connect(convolver);
  droneDry.connect(master);

  const voices: DroneVoice[] = DRONE_HZ.map((hz, i) => {
    const osc = ac.createOscillator();
    const sub = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    sub.type = "sine";
    osc.frequency.value = hz;
    sub.frequency.value = hz * 1.004 + 0.06 * (i + 1);
    gain.gain.value = 0.0001;
    osc.connect(gain);
    sub.connect(gain);
    gain.connect(filter);
    osc.start(now);
    sub.start(now);
    gain.gain.exponentialRampToValueAtTime(
      i >= 3 ? 0.05 : 0.14,
      now + 5 + i * 1.4,
    );
    return { osc, sub, gain, baseHz: hz };
  });

  // ── HRTF sound motes ──
  if (ac.listener.forwardZ) {
    // modern API: face −Z, up +Y
    ac.listener.forwardX.value = 0;
    ac.listener.forwardY.value = 0;
    ac.listener.forwardZ.value = -1;
    ac.listener.upX.value = 0;
    ac.listener.upY.value = 1;
    ac.listener.upZ.value = 0;
  }

  const motes: SoundMote[] = MOTE_HZ.map((hz, i) => {
    const osc = ac.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = hz;

    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.04 + 0.05 * i; // slow tremolo
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);

    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    lfoGain.connect(gain.gain); // tremolo modulates amplitude around base

    const panner = ac.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 60;
    panner.rolloffFactor = 0.9;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(convolver);
    panner.connect(master); // a touch of dry so the position reads

    osc.start(now);
    lfo.start(now);
    // fade the steady amplitude up so motes emerge from the void
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 8 + i * 2);

    return {
      osc,
      lfo,
      lfoGain,
      gain,
      panner,
      rx: 5 + Math.random() * 7,
      ry: 2 + Math.random() * 5,
      rz: 5 + Math.random() * 7,
      sx: 0.01 + Math.random() * 0.03,
      sy: 0.013 + Math.random() * 0.03,
      sz: 0.011 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
    };
  });

  // ── desync state: a LONGER, drifting lag than the visuals ──
  let laggedX = 0;
  let laggedY = 0;
  const t0 = ac.currentTime;
  let stopped = false;

  return {
    update(cx, cy, depth, clarity, timeScale) {
      if (stopped) return;
      const t = ac.currentTime;
      const elapsed = (t - t0) * timeScale;

      // AUDIO lag: deliberately laggier than the visual at rest, loosening
      // further with depth and breathing on its OWN slow cycle (a different
      // phase than the visual's) → the two streams drift apart. The clarity
      // snap collapses the lag to near-instant (re-binding).
      const breathe = 0.5 + 0.5 * Math.sin(elapsed * 0.05 + 1.7);
      const looseness = depth * (0.7 + 0.3 * breathe);
      let lag = 0.03 * (1 - 0.9 * looseness);
      lag = lag + clarity * 0.2;
      lag = Math.max(0.002, Math.min(0.25, lag));

      laggedX += (cx - laggedX) * lag;
      laggedY += (cy - laggedY) * lag;

      // listener orientation nudged by the LAGGED control (desynced view)
      if (ac.listener.forwardX) {
        const fx = laggedX * 0.6;
        const fy = laggedY * 0.4;
        const fz = -Math.sqrt(Math.max(0.05, 1 - fx * fx - fy * fy));
        ac.listener.forwardX.setTargetAtTime(fx, t, 0.5);
        ac.listener.forwardY.setTargetAtTime(fy, t, 0.5);
        ac.listener.forwardZ.setTargetAtTime(fz, t, 0.5);
      }

      // drone filter slowly OPENS with depth + snap
      const cutoff = 200 + depth * 1800 + clarity * 2200;
      filter.frequency.setTargetAtTime(cutoff, t, 0.5);
      wet.gain.setTargetAtTime(0.7 + depth * 0.4 - clarity * 0.2, t, 0.8);
      voices[3].gain.gain.setTargetAtTime(0.04 + depth * 0.1, t, 0.6);

      // very slow pitch drift on the partners → time-dilation shimmer
      const drift = 1 + 0.0025 * Math.sin(elapsed * 0.04);
      for (const v of voices) {
        v.sub.frequency.setTargetAtTime(v.baseHz * 1.004 * drift, t, 1.6);
      }

      // ── orbit the HRTF motes; the LAGGED control nudges their centre ──
      const orbit = 0.3 + depth * 0.7; // wider orbits when dissociated
      for (const m of motes) {
        m.phase += 0.016;
        const ox =
          Math.sin(elapsed * m.sx + m.phase) * m.rx * orbit + laggedX * 8;
        const oy = Math.sin(elapsed * m.sy + m.phase * 1.3) * m.ry * orbit;
        const oz =
          Math.cos(elapsed * m.sz + m.phase) * m.rz * orbit + laggedY * 6 - 2;
        if (m.panner.positionX) {
          m.panner.positionX.setTargetAtTime(ox, t, 0.25);
          m.panner.positionY.setTargetAtTime(oy, t, 0.25);
          m.panner.positionZ.setTargetAtTime(oz, t, 0.25);
        } else {
          // very old API
          m.panner.setPosition(ox, oy, oz);
        }
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      const sources: OscillatorNode[] = [];
      voices.forEach((v) => {
        sources.push(v.osc, v.sub);
      });
      motes.forEach((m) => {
        sources.push(m.osc, m.lfo);
      });
      sources.forEach((s) => {
        try {
          s.stop(t + 1.6);
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
        motes.forEach((m) => {
          m.osc.disconnect();
          m.lfo.disconnect();
          m.lfoGain.disconnect();
          m.gain.disconnect();
          m.panner.disconnect();
        });
        filter.disconnect();
        droneDry.disconnect();
        convolver.disconnect();
        wet.disconnect();
        limiter.disconnect();
        master.disconnect();
      }, 1800);
    },
  };
}
