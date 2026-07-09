// 808 groove engine: look-ahead scheduler ("Tale of Two Clocks"),
// Web-Audio-synthesised TR-808 drum voices, swing, per-step probability,
// and a motion-driven build -> drop. All state persists and accretes as
// you dance the pattern in, so the groove is different after a minute.

export const STEPS = 8; // columns (eighth notes -> a 2s loop at 120 BPM)
export const VOICES = 5; // rows, index 0..4 = kick, snare, hat, clap, tom

export interface VoiceDef {
  key: string;
  label: string;
  hue: number; // amber/red family
}

// index order is bottom -> top on the machine: kick at the floor, tom up top
export const VOICE_DEFS: VoiceDef[] = [
  { key: "kick", label: "KICK", hue: 6 },
  { key: "snare", label: "SNARE", hue: 18 },
  { key: "hat", label: "HAT", hue: 44 },
  { key: "clap", label: "CLAP", hue: 30 },
  { key: "tom", label: "TOM", hue: 12 },
];

export type Phase = "normal" | "build" | "silence" | "slam";

export interface SeqSnapshot {
  step: number; // integer current step 0..STEPS-1
  bpm: number;
  swing: number;
  steps: number;
  phase: Phase;
  density: number; // fraction of armed cells 0..1
  intensity: number; // smoothed motion energy 0..1
  armed: boolean[][]; // [voice][step]
  prob: number[][]; // [voice][step] 0..1
  flash: Float64Array[]; // [voice] -> per-step ctx time of last fire
  scheduled: { step: number; time: number }[];
}

interface Marker {
  buildStart: number;
  buildEnd: number;
  silenceEnd: number;
  slamEnd: number;
}

export interface Sequencer {
  ctx: AudioContext;
  start(): void;
  getSnapshot(): SeqSnapshot;
  getPlayhead(now: number): number; // float column, includes wrap
  armCell(voice: number, step: number): void;
  toggleCell(voice: number, step: number): void;
  setBpm(bpm: number): void;
  setSwing(swing: number): void;
  setMotionIntensity(x: number): void;
  triggerBuild(): void;
  clear(): void;
  loadAutoDemo(): void;
  dispose(): void;
}

function makeGrid<T>(fill: () => T): T[][] {
  return Array.from({ length: VOICES }, () =>
    Array.from({ length: STEPS }, fill),
  );
}

export function createSequencer(
  ctx: AudioContext,
  masterGain: number,
): Sequencer {
  // ---- master chain: gain -> compressor/limiter -> destination ----
  const master = ctx.createGain();
  master.gain.value = 0; // fade in on start
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);

  // shared noise buffer (1s of white noise), reused by every noisy voice
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // ---- persistent pattern state ----
  const armed = makeGrid(() => false);
  const prob = makeGrid(() => 0.9);
  const flash: Float64Array[] = Array.from(
    { length: VOICES },
    () => new Float64Array(STEPS).fill(-1),
  );

  let bpm = 120;
  let swing = 0.16; // delay on odd (off-beat) steps
  let running = false;

  let nextNoteTime = 0;
  let absStep = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  let intensitySmooth = 0;
  let dancePress = 0; // sustained-motion counter for auto build
  let cooldownUntil = 0;

  const marker: Marker = {
    buildStart: -1,
    buildEnd: -1,
    silenceEnd: -1,
    slamEnd: -1,
  };

  const scheduled: { step: number; time: number }[] = [];

  const stepDur = () => 60 / bpm / 2; // eighth-note grid

  function density(): number {
    let n = 0;
    for (let v = 0; v < VOICES; v++)
      for (let s = 0; s < STEPS; s++) if (armed[v][s]) n++;
    return n / (VOICES * STEPS);
  }

  function phaseFor(abs: number): Phase {
    if (marker.buildStart < 0) return "normal";
    if (abs >= marker.buildStart && abs < marker.buildEnd) return "build";
    if (abs >= marker.buildEnd && abs < marker.silenceEnd) return "silence";
    if (abs >= marker.silenceEnd && abs < marker.slamEnd) return "slam";
    return "normal";
  }

  // ---------- 808 voice synths ----------
  function playKick(t: number, vel: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.55);
    // sub reinforcement for weight on phones
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(50, t);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    sub.connect(sg).connect(master);
    sub.start(t);
    sub.stop(t + 0.3);
  }

  function playSnare(t: number, vel: number) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.8, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(hp).connect(ng).connect(master);
    n.start(t);
    n.stop(t + 0.22);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(185, t);
    og.gain.setValueAtTime(vel * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.13);
  }

  function playHat(t: number, vel: number, open = false) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    const dec = open ? 0.18 : 0.045;
    g.gain.setValueAtTime(vel * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    n.connect(hp).connect(g).connect(master);
    n.start(t);
    n.stop(t + dec + 0.02);
  }

  function playClap(t: number, vel: number) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1000;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    bp.connect(g).connect(master);
    // three quick taps + a short tail = the 808 clap smear
    const taps = [0, 0.01, 0.02, 0.035];
    for (let i = 0; i < taps.length; i++) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuf;
      const tg = ctx.createGain();
      const tt = t + taps[i];
      const amp = i === taps.length - 1 ? vel * 0.6 : vel * 0.85;
      const dec = i === taps.length - 1 ? 0.12 : 0.02;
      tg.gain.setValueAtTime(amp, tt);
      tg.gain.exponentialRampToValueAtTime(0.0001, tt + dec);
      n.connect(tg).connect(bp);
      n.start(tt);
      n.stop(tt + dec + 0.02);
    }
    g.gain.setValueAtTime(1, t);
  }

  function playTom(t: number, vel: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.8, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.32);
  }

  // acid-ish resonant stab that emerges only when the pattern is dense
  const acidNotes = [55, 55, 82.41, 65.41]; // A1 A1 E2 C2 — minor colour
  function playAcid(t: number, idx: number, vel: number) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = acidNotes[idx % acidNotes.length];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 9;
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.26);
  }

  // upward riser during the build: filtered noise sweep + rising sine
  function playRiser(t: number, dur: number) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(master);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  const VOICE_FN = [playKick, playSnare, playHat, playClap, playTom] as const;

  function fire(voice: number, step: number, t: number, vel: number) {
    if (voice === 3) playClap(t, vel);
    else VOICE_FN[voice](t, vel);
    flash[voice][step] = t;
  }

  // ---------- the scheduler ----------
  function scheduleStep(step: number, gridTime: number, abs: number) {
    const phase = phaseFor(abs);
    const dur = stepDur();
    const swung = step % 2 === 1 ? swing * dur : 0;
    const t = gridTime + swung;

    scheduled.push({ step, time: gridTime });
    if (scheduled.length > 40) scheduled.shift();

    if (phase === "silence") return; // the held breath before the drop

    const dens = density();

    for (let v = 0; v < VOICES; v++) {
      if (!armed[v][step]) continue;
      let p = prob[v][step];
      let vel = 0.9;
      if (phase === "slam") {
        p = 1; // no ghosting on the drop — everything lands
        vel = 1;
      } else if (phase === "build") {
        p = Math.min(1, p + 0.1);
        vel = 0.95;
      }
      if (Math.random() <= p) fire(v, step, t, vel);
    }

    // driving hats through the build so it lifts
    if (phase === "build") {
      playHat(t, 0.4 + (abs % 4) * 0.05, false);
    }
    // slam: force a four-on-the-floor kick + off-beat clap for impact
    if (phase === "slam") {
      if (step % 2 === 0) playKick(t, 1);
      playHat(t, 0.5, step % 2 === 1);
    }

    // acid stab surfaces once the groove is busy
    if (phase !== "slam" && dens > 0.34 && step % 4 === 2) {
      playAcid(t, Math.floor(abs / 4), 0.9);
    }
  }

  function scheduler() {
    const ahead = 0.12; // schedule ~120ms into the future
    while (nextNoteTime < ctx.currentTime + ahead) {
      const step = ((absStep % STEPS) + STEPS) % STEPS;
      scheduleStep(step, nextNoteTime, absStep);
      nextNoteTime += stepDur();
      absStep++;
    }
    // expire finished build/drop arcs
    if (marker.buildStart >= 0 && absStep >= marker.slamEnd) {
      marker.buildStart = -1;
      marker.buildEnd = -1;
      marker.silenceEnd = -1;
      marker.slamEnd = -1;
    }
  }

  // ---------- public API ----------
  return {
    ctx,
    start() {
      if (running) return;
      running = true;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(masterGain, now + 0.4);
      nextNoteTime = now + 0.08;
      absStep = 0;
      timer = setInterval(scheduler, 25);
    },
    getSnapshot(): SeqSnapshot {
      return {
        step: ((absStep - 1) % STEPS + STEPS) % STEPS,
        bpm,
        swing,
        steps: STEPS,
        phase: phaseFor(absStep),
        density: density(),
        intensity: intensitySmooth,
        armed,
        prob,
        flash,
        scheduled,
      };
    },
    getPlayhead(now: number): number {
      let idx = -1;
      for (let i = scheduled.length - 1; i >= 0; i--) {
        if (scheduled[i].time <= now) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return 0;
      const cur = scheduled[idx];
      const nxt = scheduled[idx + 1];
      if (!nxt) return cur.step;
      const frac = (now - cur.time) / Math.max(1e-4, nxt.time - cur.time);
      return cur.step + Math.max(0, Math.min(1, frac));
    },
    armCell(voice, step) {
      if (voice < 0 || voice >= VOICES || step < 0 || step >= STEPS) return;
      armed[voice][step] = true;
    },
    toggleCell(voice, step) {
      if (voice < 0 || voice >= VOICES || step < 0 || step >= STEPS) return;
      armed[voice][step] = !armed[voice][step];
    },
    setBpm(v) {
      bpm = Math.max(90, Math.min(140, v));
    },
    setSwing(v) {
      swing = Math.max(0, Math.min(0.4, v));
    },
    setMotionIntensity(x) {
      intensitySmooth = intensitySmooth * 0.9 + x * 0.1;
      if (intensitySmooth > 0.5) dancePress = Math.min(120, dancePress + 1);
      else dancePress = Math.max(0, dancePress - 2);
      const now = ctx.currentTime;
      if (dancePress > 45 && now > cooldownUntil) {
        this.triggerBuild();
        cooldownUntil = now + 12;
        dancePress = 0;
      }
    },
    triggerBuild() {
      if (marker.buildStart >= 0) return; // already mid-arc
      const BUILD = 16;
      const SILENCE = 2;
      const SLAM = 16;
      marker.buildStart = absStep + 1;
      marker.buildEnd = marker.buildStart + BUILD;
      marker.silenceEnd = marker.buildEnd + SILENCE;
      marker.slamEnd = marker.silenceEnd + SLAM;
      // schedule the riser to span the whole build window
      const t = Math.max(ctx.currentTime, nextNoteTime);
      playRiser(t, BUILD * stepDur());
    },
    clear() {
      for (let v = 0; v < VOICES; v++)
        for (let s = 0; s < STEPS; s++) {
          armed[v][s] = false;
          flash[v][s] = -1;
        }
    },
    loadAutoDemo() {
      // a real, danceable starter groove so the piece is never silent —
      // leaves the snare/clap/tom cells open for you to dance in
      const k = [0, 3, 4, 6]; // kick
      const h = [0, 1, 2, 3, 4, 5, 6, 7]; // hat every step
      const s = [2, 6]; // snare backbeat
      k.forEach((i) => (armed[0][i] = true));
      s.forEach((i) => (armed[1][i] = true));
      h.forEach((i) => (armed[2][i] = true));
      // ghost some hats via probability so it breathes (BeatState-style)
      prob[2][1] = 0.55;
      prob[2][3] = 0.6;
      prob[2][5] = 0.55;
      prob[2][7] = 0.6;
      armed[3][6] = true; // a clap doubling the backbeat
    },
    dispose() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
      try {
        master.disconnect();
        comp.disconnect();
      } catch {
        /* already gone */
      }
    },
  };
}
