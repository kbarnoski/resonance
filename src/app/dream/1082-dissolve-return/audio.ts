/* ── 1082-dissolve-return · generative drone + BEATING re-sync partial + motes ──
 *
 *  Pure Web Audio API. Cycle-2 deepening of 1063-dissolve-void's audio. Keeps
 *  1063's luminous void aesthetic — a generative drone bed and HRTF-spatialised
 *  sound motes — but its centrepiece is a partial that BEATS against the drone,
 *  so you literally HEAR the streams re-binding.
 *
 *  THE AUDIBLE RE-SYNC:
 *  A single "beat partial" sits a small interval above the drone fundamental. Its
 *  detuning — and therefore the acoustic BEAT frequency you hear (f_beat = |f1 −
 *  f2|) — is driven by the AUDIO oscillator's phase mismatch against the CONTROL
 *  oscillator in the page's Kuramoto engine. Out of phase → a fast, restless beat.
 *  As the phases lock (order parameter r → 1) the detuning collapses to ZERO-BEAT:
 *  the two tones fuse into one pure, still pitch — the audible moment of binding.
 *  At lock a brief bright bloom opens the drone's low-pass filter (the gamma
 *  "binding" flash) then softly relaxes as the streams breathe apart again.
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
  lfo: OscillatorNode;
  lfoGain: GainNode;
  gain: GainNode;
  panner: PannerNode;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  phase: number;
}

export interface ReturnAudio {
  /**
   * Drive per-frame.
   *  cx, cy   : RAW control −1..1 (nudges listener + mote centres).
   *  r        : Kuramoto order parameter 0..1 (coherence of the three phases).
   *  phaseMis : |Δphase| between AUDIO and CONTROL oscillators, 0..π.
   *  lock     : eased 0..1 lock indicator (drives the fusion bloom).
   *  depth    : dissociation depth 0..1.
   *  timeScale: global time dilation (<1 = slower).
   */
  update(
    cx: number,
    cy: number,
    r: number,
    phaseMis: number,
    lock: number,
    depth: number,
    timeScale: number,
  ): void;
  stop(): void;
}

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

const DRONE_HZ = [55.0, 82.4, 110.0, 164.8];
const MOTE_HZ = [220.0, 277.2, 329.6, 415.3, 493.9];

/* the beat partial sits just above the drone fundamental's octave (110 Hz). */
const BEAT_BASE_HZ = 110.0;

export function makeReturnAudio(ac: AudioContext, masterTarget = 0.16): ReturnAudio {
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

  const convolver = ac.createConvolver();
  convolver.buffer = makeImpulse(ac, 5.5);
  const wet = ac.createGain();
  wet.gain.value = 0.9;
  convolver.connect(wet);
  wet.connect(master);

  // ── drone bed ──
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(200, now);
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
    gain.gain.exponentialRampToValueAtTime(i >= 3 ? 0.05 : 0.14, now + 5 + i * 1.4);
    return { osc, sub, gain, baseHz: hz };
  });

  // ── THE BEAT PARTIAL: a reference tone + a detuned twin whose detuning ∝
  //    phase mismatch. Their sum produces an audible acoustic beat you hear
  //    slow to zero as the streams lock. Routed with a touch of dry so the
  //    zero-beat fusion is unmistakable. ──
  const beatRef = ac.createOscillator();
  const beatVar = ac.createOscillator();
  beatRef.type = "sine";
  beatVar.type = "sine";
  beatRef.frequency.setValueAtTime(BEAT_BASE_HZ, now);
  beatVar.frequency.setValueAtTime(BEAT_BASE_HZ + 6, now); // start ~6 Hz beat
  const beatGain = ac.createGain();
  beatGain.gain.value = 0.0001;
  beatRef.connect(beatGain);
  beatVar.connect(beatGain);
  beatGain.connect(filter);
  beatGain.connect(master); // a little dry so the beat reads clearly
  beatRef.start(now);
  beatVar.start(now);
  beatGain.gain.exponentialRampToValueAtTime(0.05, now + 6);

  // ── HRTF sound motes ──
  if (ac.listener.forwardZ) {
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
    lfo.frequency.value = 0.04 + 0.05 * i;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);

    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    lfoGain.connect(gain.gain);

    const panner = ac.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 60;
    panner.rolloffFactor = 0.9;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(convolver);
    panner.connect(master);

    osc.start(now);
    lfo.start(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 8 + i * 2);

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

  let laggedX = 0;
  let laggedY = 0;
  const t0 = ac.currentTime;
  let stopped = false;

  return {
    update(cx, cy, r, phaseMis, lock, depth, timeScale) {
      if (stopped) return;
      const t = ac.currentTime;
      const elapsed = (t - t0) * timeScale;

      // gently lag the control for the listener/motes (spatial drift), but the
      // headline re-sync now lives in the BEAT, driven by the phase mismatch.
      const lag = 0.03;
      laggedX += (cx - laggedX) * lag;
      laggedY += (cy - laggedY) * lag;

      // ── THE BEAT: detune ∝ phase mismatch. phaseMis ∈ 0..π. At full mismatch
      //    ~ up to 6 Hz beat; as coherence rises it collapses toward zero-beat. ──
      const mismatch = phaseMis / Math.PI; // 0..1
      const detune = mismatch * 6.2 * (1 - lock * 0.85); // Hz, → ~0 at lock
      beatVar.frequency.setTargetAtTime(BEAT_BASE_HZ + detune, t, 0.12);
      // the beat partial swells slightly at lock (the fusion becomes present)
      beatGain.gain.setTargetAtTime(0.05 + lock * 0.05, t, 0.3);

      // listener orientation nudged by the lagged control
      if (ac.listener.forwardX) {
        const fx = laggedX * 0.6;
        const fy = laggedY * 0.4;
        const fz = -Math.sqrt(Math.max(0.05, 1 - fx * fx - fy * fy));
        ac.listener.forwardX.setTargetAtTime(fx, t, 0.5);
        ac.listener.forwardY.setTargetAtTime(fy, t, 0.5);
        ac.listener.forwardZ.setTargetAtTime(fz, t, 0.5);
      }

      // drone filter: opens with coherence — the bright bloom at lock, closing
      // back down as the streams drift apart (breathing).
      const cutoff = 220 + depth * 900 + r * 1400 + lock * 2600;
      filter.frequency.setTargetAtTime(cutoff, t, lock > 0.5 ? 0.15 : 0.5);
      wet.gain.setTargetAtTime(0.7 + depth * 0.4 - lock * 0.25, t, 0.8);
      voices[3].gain.gain.setTargetAtTime(0.04 + r * 0.1, t, 0.6);

      const drift = 1 + 0.0025 * Math.sin(elapsed * 0.04);
      for (const v of voices) {
        v.sub.frequency.setTargetAtTime(v.baseHz * 1.004 * drift, t, 1.6);
      }

      // orbit the HRTF motes; orbits tighten toward the listener as they lock.
      const orbit = 0.3 + depth * 0.7 - lock * 0.3;
      for (const m of motes) {
        m.phase += 0.016;
        const ox = Math.sin(elapsed * m.sx + m.phase) * m.rx * orbit + laggedX * 8;
        const oy = Math.sin(elapsed * m.sy + m.phase * 1.3) * m.ry * orbit;
        const oz = Math.cos(elapsed * m.sz + m.phase) * m.rz * orbit + laggedY * 6 - 2;
        if (m.panner.positionX) {
          m.panner.positionX.setTargetAtTime(ox, t, 0.25);
          m.panner.positionY.setTargetAtTime(oy, t, 0.25);
          m.panner.positionZ.setTargetAtTime(oz, t, 0.25);
        } else {
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
      const sources: OscillatorNode[] = [beatRef, beatVar];
      voices.forEach((v) => sources.push(v.osc, v.sub));
      motes.forEach((m) => sources.push(m.osc, m.lfo));
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
        beatRef.disconnect();
        beatVar.disconnect();
        beatGain.disconnect();
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
