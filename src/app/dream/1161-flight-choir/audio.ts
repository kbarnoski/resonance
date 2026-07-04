// ── Flight Choir · audio engine ──────────────────────────────────────────────
// Web Audio API only, no libraries. Each tracked aircraft becomes ONE sustained
// voice with a real lifecycle: fade-in on entry, sustain while tracked,
// fade-out on exit. Voices are capped with voice-stealing and routed through a
// shared convolver reverb + a DynamicsCompressor limiter (ear protection).
//
// Mappings (documented, also in README):
//   altitude    → pitch, quantised to a bright JUST-INTONATION lydian lattice
//                 (higher altitude = higher pitch)
//   ground speed→ low-pass filter cutoff (faster = brighter / richer partials)
//   longitude   → stereo pan (west = left, east = right — matches the map)
//   vertical rate→ vibrato depth + a small detune glide (climb = sharper/shimmer)
//   traffic density→ shared sub-drone bed gain + overall harmonic richness

import { mulberry32 } from "./data";

export type Voiceable = {
  id: string;
  callsign: string;
  lon: number;
  lat: number;
  alt: number; // metres
  speed: number; // m/s
  heading: number;
  vrate: number; // m/s
};

const MAX_VOICES = 16;

// Just-intonation LYDIAN degrees (bright — note the 11/8 raised fourth).
const JI_LYDIAN = [1, 9 / 8, 5 / 4, 11 / 8, 3 / 2, 5 / 3, 15 / 8];
const ROOT_HZ = 130.81; // C3
const OCTAVES = 4; // C3 → ~C7
const ALT_MIN = 0; // m
const ALT_MAX = 13000; // m (~43k ft)

// Quantise an altitude to a stable frequency on the lattice.
function altToHz(alt: number): number {
  const norm = Math.max(0, Math.min(1, (alt - ALT_MIN) / (ALT_MAX - ALT_MIN)));
  const totalDeg = JI_LYDIAN.length * OCTAVES;
  const step = Math.min(totalDeg - 1, Math.floor(norm * totalDeg));
  const oct = Math.floor(step / JI_LYDIAN.length);
  const deg = step % JI_LYDIAN.length;
  return ROOT_HZ * Math.pow(2, oct) * JI_LYDIAN[deg];
}

// Ground speed → filter cutoff (log-ish). Faster aircraft = brighter voice.
function speedToCutoff(speed: number): number {
  const norm = Math.max(0, Math.min(1, speed / 300)); // 0..~580 kt
  return 380 * Math.pow(6000 / 380, norm); // 380 Hz → 6 kHz
}

type Voice = {
  id: string;
  osc: OscillatorNode; // main partial (saw)
  osc2: OscillatorNode; // shimmer partial (triangle, +octave-ish)
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  vibLfo: OscillatorNode;
  vibGain: GainNode;
  born: number; // ctx time
  releasing: boolean;
  stopAt: number; // ctx time the voice fully stops (for sweeping the map)
  osc2Gain: GainNode;
};

export type Engine = {
  ctx: AudioContext;
  start(): void;
  update(list: Voiceable[], focusedId: string | null, reduced: boolean): void;
  stop(): void;
  activeCount(): number;
};

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const rnd = mulberry32(0x1161);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (rnd() * 2 - 1) * env;
    }
  }
  return buf;
}

export function createEngine(): Engine {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // ── master bus: limiter → destination ──
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // dry + reverb sends
  const dry = ctx.createGain();
  dry.gain.value = 0.72;
  dry.connect(master);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 3.4, 2.6);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.5;
  reverbSend.connect(convolver);
  convolver.connect(master);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(dry);
  voiceBus.connect(reverbSend);

  // ── shared sub-drone bed (scales with traffic density) ──
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0001;
  droneGain.connect(dry);
  droneGain.connect(reverbSend);
  const droneOscs: OscillatorNode[] = [];
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 320;
  droneFilter.connect(droneGain);
  for (const mul of [0.5, 0.75, 1]) {
    // sub-octave root + fifth-ish for a warm bed
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = ROOT_HZ * mul;
    const g = ctx.createGain();
    g.gain.value = mul === 1 ? 0.6 : 0.4;
    o.connect(g);
    g.connect(droneFilter);
    droneOscs.push(o);
  }

  const voices = new Map<string, Voice>();
  let started = false;

  function makeVoice(a: Voiceable, now: number, reduced: boolean): Voice {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1.1;
    filter.frequency.value = speedToCutoff(a.speed);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.28;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, a.lon / 180));

    // vibrato LFO → osc detune (depth from vertical rate)
    const vibLfo = ctx.createOscillator();
    vibLfo.type = "sine";
    vibLfo.frequency.value = reduced ? 3.2 : 5.2;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 0;
    vibLfo.connect(vibGain);
    vibGain.connect(osc.detune);
    vibGain.connect(osc2.detune);

    const hz = altToHz(a.alt);
    osc.frequency.value = hz;
    osc2.frequency.value = hz * 2; // octave shimmer

    osc.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(voiceBus);

    osc.start();
    osc2.start();
    vibLfo.start();

    // fade-in
    const target = voiceTarget(voices.size + 1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setTargetAtTime(target, now, reduced ? 1.6 : 0.9);

    return {
      id: a.id,
      osc,
      osc2,
      filter,
      gain,
      pan,
      vibLfo,
      vibGain,
      osc2Gain,
      born: now,
      releasing: false,
      stopAt: Infinity,
    };
  }

  function voiceTarget(n: number): number {
    // keep the sum bounded → lean on the limiter for the rest
    return 0.62 / Math.sqrt(Math.max(1, n));
  }

  function releaseVoice(v: Voice, now: number, reduced: boolean): void {
    if (v.releasing) return;
    v.releasing = true;
    const tc = reduced ? 1.8 : 1.1;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0.0001, now, tc);
    const stopAt = now + tc * 6 + 0.4;
    v.stopAt = stopAt;
    try {
      v.osc.stop(stopAt);
      v.osc2.stop(stopAt);
      v.vibLfo.stop(stopAt);
    } catch {
      /* already stopped */
    }
    window.setTimeout(
      () => {
        try {
          v.osc.disconnect();
          v.osc2.disconnect();
          v.osc2Gain.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
          v.pan.disconnect();
          v.vibGain.disconnect();
        } catch {
          /* ignore */
        }
      },
      (stopAt - now) * 1000 + 200,
    );
  }

  function updateVoice(v: Voice, a: Voiceable, focused: boolean, now: number, reduced: boolean): void {
    // pitch (glides on altitude change)
    const hz = altToHz(a.alt);
    v.osc.frequency.setTargetAtTime(hz, now, 0.35);
    v.osc2.frequency.setTargetAtTime(hz * 2, now, 0.35);
    // brightness from ground speed
    v.filter.frequency.setTargetAtTime(speedToCutoff(a.speed), now, 0.3);
    // pan from longitude
    v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, a.lon / 180)), now, 0.3);
    // vibrato depth from vertical rate + a small sustained detune glide
    const vib = reduced ? 0 : Math.min(38, Math.abs(a.vrate) * 6);
    v.vibGain.gain.setTargetAtTime(vib, now, 0.4);
    const detune = Math.max(-45, Math.min(45, a.vrate * 5));
    v.osc.detune.setTargetAtTime(detune, now, 0.5);
    // focused aircraft sits slightly forward in the mix
    const base = voiceTarget(Math.max(1, voices.size));
    if (!v.releasing) {
      v.gain.gain.setTargetAtTime(focused ? base * 1.5 : base, now, 0.4);
    }
  }

  return {
    ctx,
    activeCount: () => voices.size,
    start() {
      if (started) return;
      started = true;
      for (const o of droneOscs) o.start();
      if (ctx.state === "suspended") void ctx.resume();
    },
    update(list, focusedId, reduced) {
      if (!started) return;
      const now = ctx.currentTime;

      // density → drone bed + reverb depth
      const density = Math.min(1, list.length / 40);
      droneGain.gain.setTargetAtTime(0.0001 + density * 0.16, now, 0.8);
      reverbSend.gain.setTargetAtTime(0.4 + density * 0.28, now, 0.8);

      // Prioritise which aircraft get a voice: focused first, then highest
      // (loudest-feeling) — fast + high aircraft — so the choir favours the
      // dramatic ones. Cap with voice-stealing.
      const incoming = new Map(list.map((a) => [a.id, a]));
      const ranked = [...list].sort((p, q) => {
        if (p.id === focusedId) return -1;
        if (q.id === focusedId) return 1;
        return q.speed + q.alt / 200 - (p.speed + p.alt / 200);
      });
      const keep = new Set(ranked.slice(0, MAX_VOICES).map((a) => a.id));

      // release voices no longer present or stolen
      for (const [id, v] of voices) {
        if (!keep.has(id) && !v.releasing) {
          releaseVoice(v, now, reduced);
        }
      }
      // sweep fully-released voices out of the map (by scheduled stop time)
      for (const [id, v] of voices) {
        if (v.releasing && now >= v.stopAt) {
          voices.delete(id);
        }
      }

      // create / update kept voices
      for (const id of keep) {
        const a = incoming.get(id);
        if (!a) continue;
        let v = voices.get(id);
        if (v && v.releasing) {
          // was stolen then re-selected: let the old one die, skip this frame
          continue;
        }
        if (!v) {
          if (voices.size >= MAX_VOICES + 6) continue; // hard ceiling incl. dying
          v = makeVoice(a, now, reduced);
          voices.set(id, v);
        }
        updateVoice(v, a, id === focusedId, now, reduced);
      }
    },
    stop() {
      const now = ctx.currentTime;
      for (const v of voices.values()) releaseVoice(v, now, false);
      voices.clear();
      try {
        for (const o of droneOscs) o.stop(now + 0.3);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        if (ctx.state !== "closed") void ctx.close();
      }, 500);
    },
  };
}
