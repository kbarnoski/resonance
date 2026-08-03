// synth.ts — Web Audio build-and-drop synthesizer + 16th-note look-ahead
// scheduler. All musical timing is scheduled against AudioContext.currentTime
// and the tick loop uses setTimeout (never setInterval, never rAF, for the
// musical clock). Every generative choice is driven by a seeded PRNG
// (mulberry32 @ 0x6008) — no Math.random / Date.now / performance.now.

import {
  SEC_PER_BAR,
  SIXTEENTH,
  SPB,
  energyAt,
  riserAt,
  sectionAt,
  wrap,
} from "./arrangement";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// A-minor material for the drops.
const BASS_ROOTS = [33, 33, 29, 31]; // A1, A1, F1, G1 per bar of the phrase
const PENTA = [57, 60, 64, 67, 69, 72]; // A-minor pentatonic topline

export interface SurgeAudio {
  start(): void;
  stop(): void;
  seek(arrTime: number): void;
  playheadTime(): number; // wrapped arrangement seconds
  visualPump(): number; // 0..1 smoothed swell for the visual
}

export function makeSurgeAudio(ctx: AudioContext, master = 0.18): SurgeAudio {
  const rng = mulberry32(0x6008);

  // ── master chain ──────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.min(0.2, master);

  limiter.connect(masterGain).connect(ctx.destination);

  // master lowpass — opens as ENERGY rises, slams open into the drop.
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 400;
  lowpass.Q.value = 0.8;
  lowpass.connect(limiter);

  // sidechain "pump" bus — ducked on every kick.
  const pumpBus = ctx.createGain();
  pumpBus.gain.value = 1;
  pumpBus.connect(lowpass);

  // melodic / rhythmic voices route through the pump + filter.
  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(pumpBus);

  // kicks + impacts bypass the filter/pump so they always punch.
  const punchBus = ctx.createGain();
  punchBus.gain.value = 1;
  punchBus.connect(limiter);

  // ── reverb (impulse generated in code, seeded) ──────────────────────────
  const convolver = ctx.createConvolver();
  {
    const dur = 2.2;
    const len = Math.floor(ctx.sampleRate * dur);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    convolver.buffer = imp;
  }
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.9;
  reverbSend.connect(convolver).connect(limiter);

  // ── shared seeded noise buffer for hats / claps / riser ─────────────────
  const noiseBuf = (() => {
    const len = Math.floor(ctx.sampleRate * 1.0);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
    return b;
  })();

  function noiseSource() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    // seeded read offset so successive hits aren't identical
    s.playbackRate.value = 0.9 + rng() * 0.3;
    return s;
  }

  // ── voices ──────────────────────────────────────────────────────────────
  function kick(at: number, g: number) {
    const o = ctx.createOscillator();
    const amp = ctx.createGain();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    o.connect(amp).connect(punchBus);
    o.start(at);
    o.stop(at + 0.36);
  }

  function impact(at: number, e: number) {
    // sub boom
    const o = ctx.createOscillator();
    const amp = ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.25);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(1.0, at + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(amp).connect(punchBus);
    o.start(at);
    o.stop(at + 0.62);

    // white-noise crash into the reverb
    const n = noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const na = ctx.createGain();
    na.gain.setValueAtTime(0.0001, at);
    na.gain.exponentialRampToValueAtTime(0.5 * (0.6 + e), at + 0.01);
    na.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    n.connect(hp).connect(na);
    na.connect(voiceBus);
    na.connect(reverbSend);
    n.start(at);
    n.stop(at + 1.5);
  }

  function sub(at: number, midi: number, g: number) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o.frequency.value = mtof(midi);
    o2.frequency.value = mtof(midi);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + SPB * 0.9);
    o.connect(amp);
    o2.connect(amp);
    amp.connect(voiceBus);
    o.start(at);
    o2.start(at);
    o.stop(at + SPB);
    o2.stop(at + SPB);
  }

  function stab(at: number, root: number, g: number, e: number) {
    const chord = [root + 12, root + 19, root + 24, root + 28];
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + 6000 * e;
    for (const m of chord) {
      const o = ctx.createOscillator();
      o.type = rng() > 0.5 ? "sawtooth" : "square";
      o.frequency.value = mtof(m);
      o.detune.value = (rng() * 2 - 1) * 8;
      o.connect(lp);
      o.start(at);
      o.stop(at + 0.2);
    }
    lp.connect(amp);
    amp.connect(voiceBus);
    amp.connect(reverbSend);
  }

  function arp(at: number, midi: number, g: number) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = mtof(midi);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + SIXTEENTH * 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    o.connect(lp).connect(amp);
    amp.connect(voiceBus);
    amp.connect(reverbSend);
    o.start(at);
    o.stop(at + SIXTEENTH * 1.8);
  }

  function hat(at: number, g: number, open: boolean) {
    const n = noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const amp = ctx.createGain();
    const dur = open ? 0.14 : 0.03;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(hp).connect(amp).connect(voiceBus);
    n.start(at);
    n.stop(at + dur + 0.02);
  }

  function clap(at: number, g: number) {
    const n = noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 1.2;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    n.connect(bp).connect(amp);
    amp.connect(voiceBus);
    amp.connect(reverbSend);
    n.start(at);
    n.stop(at + 0.18);
  }

  // snare-roll riser hit — bandpass centre + gain rise with the riser amount.
  function riserHit(at: number, ri: number, dur: number) {
    const n = noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200 + 3200 * ri;
    bp.Q.value = 0.9;
    const amp = ctx.createGain();
    const g = 0.12 + 0.5 * ri;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(bp).connect(amp);
    amp.connect(voiceBus);
    amp.connect(reverbSend);
    n.start(at);
    n.stop(at + dur + 0.02);
  }

  function pad(at: number, root: number, g: number) {
    const chord = [root + 12, root + 15, root + 19];
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(g, at + 0.4);
    amp.gain.linearRampToValueAtTime(0.0001, at + SEC_PER_BAR * 0.95);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    for (const m of chord) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(m);
      o.detune.value = (rng() * 2 - 1) * 6;
      o.connect(lp);
      o.start(at);
      o.stop(at + SEC_PER_BAR);
    }
    lp.connect(amp);
    amp.connect(voiceBus);
    amp.connect(reverbSend);
  }

  // sidechain duck on each kick.
  function duck(at: number, e: number) {
    const g = pumpBus.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(0.85 - 0.5 * e, at);
    g.linearRampToValueAtTime(1, at + SPB * 0.8);
  }

  function cutoff(e: number) {
    return 250 * Math.pow(70, e); // ~250 Hz .. ~17.5 kHz
  }

  // ── scheduler state ─────────────────────────────────────────────────────
  let arrAnchor = 0; // arrangement seconds at the anchor
  let ctxAnchor = ctx.currentTime; // ctx time at the anchor
  let nextStepArr = 0; // arrangement time of the next 16th to schedule
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const LOOKAHEAD = 0.12;
  const INTERVAL = 25;

  const arrNow = () => arrAnchor + (ctx.currentTime - ctxAnchor);

  function scheduleStep(arrT: number, at: number) {
    const w = wrap(arrT);
    const s = sectionAt(w);
    const e = energyAt(w);
    const ri = riserAt(w);

    const step = Math.round(w / SIXTEENTH);
    const inBar = ((step % 16) + 16) % 16; // 0..15 within the bar
    const wBar = Math.floor(w / SEC_PER_BAR + 1e-6);
    const barInPhrase = wBar % 4;
    const root = BASS_ROOTS[barInPhrase];

    // filter automation follows ENERGY
    lowpass.frequency.setTargetAtTime(cutoff(e), at, 0.04);

    // KICK — four-on-floor except during the breakdown emptiness
    const kickOn = s.name !== "Breakdown";
    if (kickOn && inBar % 4 === 0) {
      const g = s.name === "Intro" ? 0.55 : s.name === "Outro" ? 0.55 * e : 0.95;
      kick(at, g);
      duck(at, e);
    }

    // DROP IMPACT — one hit on the downbeat of each drop section
    if (s.isDrop && wBar === s.startBar && inBar === 0) {
      impact(at, e);
    }

    // SUB-BASS — driving through the drops (and the build peak)
    if (s.isDrop || (s.name === "Build" && e > 0.72)) {
      if (inBar % 4 === 0) sub(at, root, 0.5);
      else if (inBar % 4 === 2) sub(at, root + 12, 0.32);
    }

    // STABS — offbeat chord stabs on the floor
    if (s.isDrop || (s.isBuild && e > 0.65)) {
      if (inBar % 4 === 2 || (e > 0.7 && (inBar === 7 || inBar === 15))) {
        stab(at, root, 0.16, e);
      }
    }

    // ARP — 16th topline through builds, the melodic breakdown, and drops
    const arpOn =
      s.isBuild ||
      s.isDrop ||
      (s.name === "Breakdown" && (w - s.startTime) / (s.endTime - s.startTime) < 0.55);
    if (arpOn) {
      const note = PENTA[step % PENTA.length] + (s.isDrop ? 12 : 0);
      const g = 0.06 + 0.08 * e;
      arp(at, note, g);
    }

    // HATS — fill in as energy climbs; open hat on the offbeat
    if (e > 0.32) {
      if (rng() < e) hat(at, 0.05 + 0.05 * e, false);
      if (inBar % 4 === 2) hat(at, 0.05 + 0.06 * e, true);
    }

    // CLAP/SNARE backbeat on 2 & 4 in the energetic sections
    if ((s.isDrop || (s.isBuild && e > 0.7)) && (inBar === 4 || inBar === 12)) {
      clap(at, 0.22);
    }

    // ATMOSPHERE pad once per bar in the quiet sections
    if ((s.name === "Intro" || s.name === "Breakdown") && inBar === 0) {
      pad(at, root, 0.05);
    }

    // SNARE-ROLL RISER — subdivides faster as it peaks (16ths -> 32nds)
    if (ri > 0.03) {
      riserHit(at, ri, SIXTEENTH * 0.9);
      if (ri > 0.6) riserHit(at + SIXTEENTH / 2, ri, SIXTEENTH * 0.5);
      if (ri > 0.9) {
        riserHit(at + SIXTEENTH / 4, ri, SIXTEENTH * 0.3);
        riserHit(at + (SIXTEENTH * 3) / 4, ri, SIXTEENTH * 0.3);
      }
    }
  }

  function tick() {
    if (!running) return;
    const horizon = arrNow() + LOOKAHEAD;
    while (nextStepArr < horizon) {
      const at = ctxAnchor + (nextStepArr - arrAnchor);
      scheduleStep(nextStepArr, Math.max(at, ctx.currentTime + 0.001));
      nextStepArr += SIXTEENTH;
    }
    timer = setTimeout(tick, INTERVAL);
  }

  function anchorTo(arrTime: number) {
    arrAnchor = arrTime;
    ctxAnchor = ctx.currentTime;
    // quantize the next step up to the 16th grid
    nextStepArr = Math.ceil(arrTime / SIXTEENTH) * SIXTEENTH;
  }

  return {
    start() {
      if (running) return;
      running = true;
      anchorTo(arrNow());
      tick();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      try {
        voiceBus.disconnect();
        punchBus.disconnect();
        pumpBus.disconnect();
        lowpass.disconnect();
        reverbSend.disconnect();
        convolver.disconnect();
        limiter.disconnect();
        masterGain.disconnect();
      } catch {
        // already torn down
      }
    },
    seek(arrTime: number) {
      anchorTo(wrap(arrTime));
    },
    playheadTime() {
      return wrap(arrNow());
    },
    visualPump() {
      const w = wrap(arrNow());
      const s = sectionAt(w);
      if (s.name === "Breakdown") return 0;
      const e = energyAt(w);
      const ph = ((w % SPB) + SPB) % SPB; // seconds since the last beat
      // 50 ms attack ramp then smooth decay — slow, no strobe (< 3 Hz)
      const env = ph < 0.05 ? ph / 0.05 : Math.exp(-(ph - 0.05) * 7);
      return clamp01(env * (0.4 + 0.6 * e));
    },
  };
}
