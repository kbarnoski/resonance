// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — synthesis of the original loop.
//
// We render a short, warm, slightly melancholy melodic phrase into a single
// Float32Array offline (no oscillators left running) so that the disintegration
// engine has a concrete block of samples it can erode. The phrase is a modal
// (Aeolian / natural-minor) fragment built from soft bell-ish additive tones
// with slow attack and long decay — an artifact, not a performance. It does NOT
// resolve onto a bright tonic cadence; it loops back into its own quiet.
// ─────────────────────────────────────────────────────────────────────────────

/** A4 reference. */
const A4 = 440;

/** MIDI note → frequency. */
function midiToHz(m: number): number {
  return A4 * Math.pow(2, (m - 69) / 12);
}

type Note = { midi: number; start: number; dur: number; gain: number };

// A Phrygian/Aeolian-tinged phrase in A minor that hangs unresolved.
// Times in seconds, relative to loop start. The loop is intentionally calm and
// a little hollow — root A, then drifting up to the minor 6th (F) and the b2-ish
// neighbor before sinking back, never landing decisively on the tonic.
function buildPhrase(loopLen: number): Note[] {
  const notes: Note[] = [];
  const add = (midi: number, start: number, dur: number, gain: number) =>
    notes.push({ midi, start, dur, gain });

  // Low sustained drone-ish root pair (A2 + E3) under the whole loop — the body
  // of the tape. This is the warm bed that will hollow out first.
  add(45, 0.0, loopLen, 0.16); // A2
  add(52, 0.0, loopLen, 0.11); // E3

  // Upper melodic fragment — bell tones. Sparse, gives the loop air to crumble.
  add(69, 0.2, 2.4, 0.22); // A4
  add(72, 1.6, 2.0, 0.18); // C5  (minor third — colour)
  add(77, 3.0, 2.6, 0.20); // F5  (minor sixth — the ache)
  add(76, 4.4, 1.8, 0.15); // E5  (steps down, no resolution)
  add(72, 5.6, 2.2, 0.16); // C5
  add(69, 6.8, loopLen - 6.8, 0.18); // A4 fades into the loop seam

  return notes;
}

/**
 * Additive bell-ish voice for one note, summed into `out` (in place).
 * Soft attack, long exponential decay, a few inharmonic partials for a glassy,
 * fragile timbre.
 */
function renderNote(out: Float32Array, sr: number, n: Note): void {
  const f0 = midiToHz(n.midi);
  const startS = Math.floor(n.start * sr);
  const lenS = Math.floor(n.dur * sr);
  // bell partials: ratio + relative amplitude. Slight inharmonicity.
  const partials: Array<[number, number]> = [
    [1.0, 1.0],
    [2.01, 0.5],
    [3.02, 0.28],
    [4.07, 0.16],
    [5.93, 0.09],
  ];
  const attack = 0.06 * sr;
  for (let i = 0; i < lenS; i++) {
    const idx = startS + i;
    if (idx >= out.length) break;
    const t = i / sr;
    // amplitude envelope: quick soft attack, long exponential tail
    const a = i < attack ? i / attack : 1;
    const env = a * Math.exp(-1.6 * t);
    let s = 0;
    for (const [ratio, amp] of partials) {
      s += Math.sin(2 * Math.PI * f0 * ratio * t) * amp;
    }
    // gentle low-order saturation to soften, keep it warm not harsh
    const v = Math.tanh(s * 0.6) * env * n.gain;
    out[idx] += v;
  }
}

/**
 * Render the full loop into a Float32Array. Pure, deterministic, no audio nodes.
 * The returned buffer is what the DisintegrationTape will erode.
 */
export function renderLoop(sampleRate: number, loopSeconds: number): Float32Array {
  const len = Math.floor(loopSeconds * sampleRate);
  const out = new Float32Array(len);
  const phrase = buildPhrase(loopSeconds);
  for (const n of phrase) renderNote(out, sampleRate, n);

  // crossfade the seam so the loop point doesn't click (the tape is a loop)
  const xf = Math.floor(0.03 * sampleRate);
  for (let i = 0; i < xf; i++) {
    const g = i / xf;
    const head = out[i];
    const tail = out[len - xf + i];
    out[i] = head * g + tail * (1 - g);
    out[len - xf + i] = tail * g + head * (1 - g);
  }

  // normalize to a safe peak so the limiter rarely has to work hard
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const norm = 0.7 / peak;
    for (let i = 0; i < len; i++) out[i] *= norm;
  }
  return out;
}

/**
 * Build the always-present low room-tone / drone bed (a separate, very quiet
 * sine pair) — it itself slowly fades as the loop dies, so there is never an
 * abrupt cut to silence until the true end. Returns the nodes to wire + a fade
 * handle.
 */
export function makeRoomTone(
  ctx: AudioContext,
  dest: AudioNode
): { gain: GainNode; stop: () => void } {
  const g = ctx.createGain();
  g.gain.value = 0.0;
  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = midiToHz(33); // A1 — felt more than heard
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = midiToHz(40); // E2
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 220;
  o1.connect(g);
  o2.connect(g);
  g.connect(lp);
  lp.connect(dest);
  o1.start();
  o2.start();
  // fade the room tone up gently at the start
  g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 6);
  return {
    gain: g,
    stop: () => {
      try {
        o1.stop();
        o2.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
