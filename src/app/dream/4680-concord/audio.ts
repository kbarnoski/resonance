// ─────────────────────────────────────────────────────────────────────────────
// 4680 · concord — audio.ts  (Web Audio, two distinct wills, two timbres)
//
// YOU      = bright, plucked/struck: two detuned saws → lowpass w/ fast falling
//            cutoff → percussive env. It attacks and rings out.
// PARTNER  = cool, breathy reed pad: sine + soft triangle, slow attack, gentle
//            vibrato, heavy lowpass. It answers, held and calm.
//
// Pitches arrive pre-snapped to a shared diatonic scale from agent.ts, so the
// dyads are consonant-ENOUGH; the friction you hear is the two different pitch-
// CENTERS, not atonality. On agreement a shared cadence RINGS; on a standoff the
// two centers sound at once as a gentle polytonal beating.
//
// Photosensitive-irrelevant (audio), but envelopes are smooth — no clicks.
// ─────────────────────────────────────────────────────────────────────────────

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface ConcordAudio {
  readonly ctx: AudioContext;
  playYou(midis: number[], delay?: number): void;
  playPartner(midis: number[], delay?: number): void;
  cadence(centerMidi: number): void;
  standoff(youMidi: number, partnerMidi: number): void;
  dispose(): void;
}

/** Create the audio engine. Must be called from inside a user gesture. Throws
 *  if Web Audio is unavailable so the caller can degrade gracefully. */
export function createAudio(): ConcordAudio {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio unavailable");
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.5;
  const soft = ctx.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 6500;
  soft.connect(master);
  master.connect(ctx.destination);

  // Track live sources so teardown can silence everything.
  const active = new Set<OscillatorNode>();
  function track(o: OscillatorNode) {
    active.add(o);
    o.onended = () => active.delete(o);
  }

  // ── YOU: bright plucked/struck ─────────────────────────────────────────────
  function pluck(freq: number, t0: number, gainPeak: number) {
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq;
    o2.detune.value = 7; // subtle chorus
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(6000, freq * 8), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.6), t0 + 0.28);
    lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.34);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(soft);
    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + 0.4);
    o2.stop(t0 + 0.4);
    track(o1);
    track(o2);
  }

  // ── PARTNER: cool breathy reed pad ─────────────────────────────────────────
  function reed(freq: number, t0: number, gainPeak: number, dur: number) {
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq;
    o2.detune.value = -5;
    // Breath: slow vibrato.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = freq * 0.006;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(2200, freq * 4);
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.09);
    g.gain.setValueAtTime(gainPeak, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(soft);
    o1.start(t0);
    o2.start(t0);
    lfo.start(t0);
    o1.stop(t0 + dur + 0.05);
    o2.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
    track(o1);
    track(o2);
    track(lfo);
  }

  function playYou(midis: number[], delay = 0) {
    const t0 = ctx.currentTime + delay;
    midis.forEach((m, i) => pluck(mtof(m), t0 + i * 0.055, 0.16));
  }

  function playPartner(midis: number[], delay = 0) {
    const t0 = ctx.currentTime + delay;
    // Reed answers as a small sustained gesture.
    midis.forEach((m, i) => reed(mtof(m), t0 + i * 0.06, 0.1, 0.34));
  }

  function cadence(centerMidi: number) {
    const t0 = ctx.currentTime + 0.02;
    // Shared, ringing resolution: root + fifth + octave, both timbres locked.
    const chord = [centerMidi, centerMidi + 7, centerMidi + 12];
    chord.forEach((m, i) => {
      reed(mtof(m), t0 + i * 0.02, 0.11, 1.3);
      pluck(mtof(m), t0 + i * 0.05, 0.14);
    });
  }

  function standoff(youMidi: number, partnerMidi: number) {
    const t0 = ctx.currentTime + 0.02;
    // Two wills, two keys at once — gentle polytonal beating.
    reed(mtof(youMidi), t0, 0.09, 1.2);
    reed(mtof(partnerMidi), t0, 0.09, 1.2);
    pluck(mtof(youMidi), t0, 0.12);
    reed(mtof(partnerMidi + 12), t0 + 0.08, 0.06, 1.1);
  }

  function dispose() {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    } catch {
      /* ignore */
    }
    for (const o of active) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    active.clear();
    // Defer close so the fade doesn't click.
    window.setTimeout(() => {
      ctx.close().catch(() => {
        /* ignore */
      });
    }, 120);
  }

  return { ctx, playYou, playPartner, cadence, standoff, dispose };
}
