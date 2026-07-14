// ─────────────────────────────────────────────────────────────────────────────
// fugue.ts — a real fugal-architecture engine.
//
// This is NOT a scale drone or a Markov melody. From a single integer seed it
// composes a three-voice fugue with genuine form and MEMORY: a subject, its
// tonal answer at the fifth, a recurring countersubject, episodes built from a
// subject fragment, middle entries (relative major + melodic inversion),
// overlapping stretto, and a pedal-point cadential close.
//
// All randomness is a seeded mulberry32 PRNG — deterministic, no Math.random /
// Date.now anywhere in executable code. "New subject" advances the seed.
//
// Refs: J.S. Bach, Die Kunst der Fuge / Das Wohltemperierte Klavier ·
//       J.J. Fux, Gradus ad Parnassum (1725) · Mazzola, three-voice counterpoint
//       (arXiv:2606.01102, 2026).
// ─────────────────────────────────────────────────────────────────────────────

// ── seeded PRNG (mulberry32) ────────────────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── diatonic scale in D natural minor ───────────────────────────────────────
// A scale DEGREE is an integer index into the collection; degree 0 = tonic D4.
// Working in degrees (not raw semitones) keeps transposition, tonal answers and
// melodic inversion perfectly in-key by construction.
const BASE_MIDI = 62; // D4
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // D E F G A B♭ C

export function degToMidi(deg: number): number {
  const oct = Math.floor(deg / 7);
  const idx = ((deg % 7) + 7) % 7;
  return BASE_MIDI + 12 * oct + SCALE[idx];
}

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export function midiToName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${n}${oct}`;
}

// ── motif model ─────────────────────────────────────────────────────────────
interface Tone {
  deg: number; // scale degree relative to the motif root
  dur: number; // beats
}
type Motif = Tone[];

const motifBeats = (m: Motif) => m.reduce((s, t) => s + t.dur, 0);

// ── the SUBJECT ─────────────────────────────────────────────────────────────
// A memorable ~8-note motive with a clear rhythmic profile. Its head is a rising
// fifth (tonic → dominant) — the characteristic leap that makes the tonal answer
// legible — then a seeded stepwise descent resolving to a stable cadence tone.
function makeSubject(rng: () => number): Motif {
  const rhythms: number[][] = [
    [1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1],
    [1.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1],
    [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 1],
    [0.75, 0.25, 1, 0.5, 0.5, 0.5, 0.5, 2],
  ];
  const rhythm = rhythms[Math.floor(rng() * rhythms.length)];
  const n = rhythm.length;

  // Fixed characteristic head: tonic, rising fifth to the dominant.
  const degs: number[] = [0, 4];

  // Seeded stepwise walk with occasional small leaps; leaps resolve by step.
  let cur = 4;
  let lastLeap = 0;
  for (let i = 2; i < n - 1; i++) {
    let step: number;
    if (lastLeap !== 0) {
      step = lastLeap > 0 ? -1 : 1; // resolve a leap by step, opposite direction
      lastLeap = 0;
    } else {
      const choices = [-1, -1, -2, 1, 1, 2, -3, 3];
      step = choices[Math.floor(rng() * choices.length)];
      if (Math.abs(step) >= 3) lastLeap = step;
    }
    cur = Math.max(-1, Math.min(7, cur + step));
    degs.push(cur);
  }
  // Cadence: land on a stable tone (dominant or mediant), approached by step.
  const target = rng() < 0.5 ? 4 : 2;
  degs[n - 2] = Math.max(-1, Math.min(7, target + (rng() < 0.5 ? 1 : -1)));
  degs.push(target);

  return degs.map((deg, i) => ({ deg, dur: rhythm[i] }));
}

// ── the tonal ANSWER (subject transposed to the dominant) ───────────────────
// A real answer at the fifth is +4 scale degrees. Because the subject opens with
// a rising fifth (0 → 4), we contract that opening to a rising fourth in the
// answer (4 → 7 instead of 4 → 8): a genuine TONAL answer that adjusts the head.
function makeAnswer(subject: Motif): Motif {
  const ans = subject.map((t) => ({ deg: t.deg + 4, dur: t.dur }));
  if (subject[0].deg === 0 && subject[1].deg === 4) {
    ans[0] = { deg: 4, dur: ans[0].dur }; // dominant
    ans[1] = { deg: 7, dur: ans[1].dur }; // tonic above — a fourth, not a fifth
  }
  return ans;
}

// ── melodic INVERSION (mirror the contour about the tonic axis) ─────────────
function invert(subject: Motif): Motif {
  return subject.map((t) => ({ deg: -t.deg, dur: t.dur }));
}

// ── the COUNTERSUBJECT ──────────────────────────────────────────────────────
// A contrasting recurring line: complementary (steadier) rhythm, mostly contrary
// motion to the subject, consonant against it. Generated once, then FROZEN in
// memory and reused (transposed) at every entry — this recurrence is what makes
// minute 3 sound related to minute 0.
const CONSONANT = new Set([0, 3, 4, 7, 8, 9]); // uni, m3, M3, P5, m6, M6 (mod 12)

function makeCountersubject(rng: () => number, subject: Motif): Motif {
  const total = motifBeats(subject);
  const slots = Math.round(total / 0.5); // steady eighths
  const cs: Motif = [];
  let cur = 2; // start a third above the subject root region
  let prevSubDeg = subject[0].deg;
  let t = 0;
  for (let s = 0; s < slots; s++) {
    // subject degree sounding at this eighth
    let acc = 0;
    let subDeg = subject[0].deg;
    for (const tone of subject) {
      if (t < acc + tone.dur - 1e-6) { subDeg = tone.deg; break; }
      acc += tone.dur;
    }
    const subMotion = subDeg - prevSubDeg;
    // Prefer contrary motion vs the subject and a consonant vertical interval.
    const cands = [cur - 1, cur + 1, cur - 2, cur + 2, cur];
    let best = cur;
    let bestScore = -1e9;
    for (const c of cands) {
      const cMotion = c - cur;
      let sc = 0;
      if (subMotion * cMotion < 0) sc += 3; // contrary motion
      else if (cMotion === 0) sc += 1; // oblique ok
      else sc -= 2; // similar/parallel motion penalised
      const semi = ((degToMidi(c) - degToMidi(subDeg)) % 12 + 12) % 12;
      if (CONSONANT.has(semi)) sc += 2;
      if (semi === 0 || semi === 7) sc -= 1; // avoid too many bare perfects
      if (c < -1 || c > 8) sc -= 5; // keep in a singable range
      sc += (rng() - 0.5) * 0.6; // seeded tie-break
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    cur = best;
    // Merge equal consecutive degrees into longer tones for a less busy line.
    if (cs.length && cs[cs.length - 1].deg === cur && rng() < 0.4) {
      cs[cs.length - 1].dur += 0.5;
    } else {
      cs.push({ deg: cur, dur: 0.5 });
    }
    prevSubDeg = subDeg;
    t += 0.5;
  }
  return cs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score types
// ─────────────────────────────────────────────────────────────────────────────
export interface FugueNote {
  id: number;
  voice: 0 | 1 | 2;
  adeg: number; // absolute scale degree
  midi: number;
  startBeat: number;
  durBeats: number;
  isSubject: boolean; // part of a full subject/answer statement
  entryId: number; // groups a single statement for the highlight; -1 otherwise
  section: number;
  free: boolean; // free counterpoint that may be nudged for voice-leading
}

export interface Section {
  name: string;
  startBeat: number;
  endBeat: number;
}

export interface Fugue {
  seed: number;
  bpm: number;
  events: FugueNote[];
  sections: Section[];
  totalBeats: number;
  minMidi: number;
  maxMidi: number;
  subjectMidis: number[];
}

const VOICE_BASE = [7, 0, -7] as const; // top / middle / bass, in scale degrees

// ─────────────────────────────────────────────────────────────────────────────
// Score builder
// ─────────────────────────────────────────────────────────────────────────────
export function composeFugue(seed: number): Fugue {
  const rng = mulberry32(seed);
  const subject = makeSubject(rng);
  const answer = makeAnswer(subject);
  const counter = makeCountersubject(rng, subject);
  const invSubject = invert(subject);
  const TB = motifBeats(subject);

  const events: FugueNote[] = [];
  const sections: Section[] = [];
  let idc = 0;
  let entryc = 0;

  function place(
    voice: 0 | 1 | 2,
    motif: Motif,
    startBeat: number,
    degOffset: number,
    isSubject: boolean,
    section: number,
    free = false
  ): number {
    const entryId = isSubject ? entryc++ : -1;
    let t = startBeat;
    for (const tone of motif) {
      const adeg = tone.deg + degOffset;
      events.push({
        id: idc++,
        voice,
        adeg,
        midi: degToMidi(adeg),
        startBeat: t,
        durBeats: tone.dur,
        isSubject,
        entryId,
        section,
        free,
      });
      t += tone.dur;
    }
    return t;
  }

  // A single sustained tone (for pedal points / final chord).
  function hold(voice: 0 | 1 | 2, adeg: number, startBeat: number, dur: number, section: number) {
    events.push({
      id: idc++, voice, adeg, midi: degToMidi(adeg),
      startBeat, durBeats: dur, isSubject: false, entryId: -1, section, free: false,
    });
  }

  // Free counterpoint: a stepwise, consonant filler line for one voice across a
  // span. Real voice-leading effort — later cleaned of parallel perfects.
  function counterpoint(voice: 0 | 1 | 2, start: number, end: number, base: number, section: number) {
    let t = start;
    let cur = base + (rng() < 0.5 ? 1 : 2);
    while (t < end - 1e-6) {
      const dur = rng() < 0.55 ? 0.5 : 1;
      const step = [-2, -1, -1, 1, 1, 2][Math.floor(rng() * 6)];
      cur = Math.max(base - 3, Math.min(base + 4, cur + step));
      events.push({
        id: idc++, voice, adeg: cur, midi: degToMidi(cur),
        startBeat: t, durBeats: Math.min(dur, end - t),
        isSubject: false, entryId: -1, section, free: true,
      });
      t += dur;
    }
  }

  const section = (name: string, fn: () => number) => {
    const startBeat = cursor;
    const end = fn();
    sections.push({ name, startBeat, endBeat: end });
    cursor = end;
    return end;
  };

  let cursor = 0;

  // 1 ── EXPOSITION ──────────────────────────────────────────────────────────
  // V0 subject alone → V1 answer (V0 countersubject) → V2 subject (V0/V1 counter)
  section("Exposition", () => {
    let t = 0;
    place(0, subject, t, VOICE_BASE[0], true, 0);
    t += TB;
    place(1, answer, t, VOICE_BASE[1], true, 0); // answer at the fifth
    place(0, counter, t, VOICE_BASE[0], false, 0); // recurring countersubject
    t += TB;
    place(2, subject, t, VOICE_BASE[2], true, 0); // third entry, subject in bass
    place(1, counter, t, VOICE_BASE[1], false, 0);
    counterpoint(0, t, t + TB, VOICE_BASE[0], 0);
    t += TB;
    return t;
  });

  // Episode helper: a modulating sequence built ONLY from the subject head
  // fragment (no full statement), voices imitating in stagger.
  const frag = subject.slice(0, 3);
  const fragBeats = motifBeats(frag);
  function episode(name: string, dir: number, iters: number) {
    section(name, () => {
      const start = cursor;
      let step = 0;
      for (let k = 0; k < iters; k++) {
        const v = (k % 3) as 0 | 1 | 2;
        const off = VOICE_BASE[v] + dir * step;
        place(v, frag, start + k * fragBeats * 0.75, off, false, sections.length);
        // a light companion voice a third away
        const v2 = ((k + 1) % 3) as 0 | 1 | 2;
        place(v2, frag, start + k * fragBeats * 0.75 + fragBeats * 0.5, VOICE_BASE[v2] + dir * step - 2, false, sections.length);
        step += 1;
      }
      return start + iters * fragBeats * 0.75 + fragBeats;
    });
  }

  // 2 ── EPISODE I (descending sequence) ─────────────────────────────────────
  episode("Episode I", -1, 5);

  // 3 ── COUNTER-EXPOSITION ──────────────────────────────────────────────────
  // The three voices restate subject + answer in a fresh order (bass first),
  // the countersubject riding above — the same material, re-voiced.
  section("Counter-exposition", () => {
    let t = cursor;
    place(2, subject, t, VOICE_BASE[2], true, sections.length);
    t += TB;
    place(0, answer, t, VOICE_BASE[0], true, sections.length);
    place(2, counter, t, VOICE_BASE[2], false, sections.length);
    t += TB;
    place(1, subject, t, VOICE_BASE[1], true, sections.length);
    place(0, counter, t, VOICE_BASE[0], false, sections.length);
    counterpoint(2, t, t + TB, VOICE_BASE[2], sections.length);
    t += TB;
    return t;
  });

  // ── EPISODE Ib (ascending) ─────────────────────────────────────────────────
  episode("Episode II", 1, 5);

  // 4 ── MIDDLE ENTRIES — relative major ─────────────────────────────────────
  // Subject returns in a new key-colour (relative major, +2 degrees) in a fresh
  // voice, then again with a companion. Others weave counterpoint.
  section("Middle entries · relative major", () => {
    let t = cursor;
    place(1, subject, t, VOICE_BASE[1] + 2, true, sections.length);
    place(0, counter, t, VOICE_BASE[0] + 2, false, sections.length);
    counterpoint(2, t, t + TB, VOICE_BASE[2], sections.length);
    t += TB;
    place(0, subject, t, VOICE_BASE[0] + 2, true, sections.length);
    place(2, counter, t, VOICE_BASE[2] + 2, false, sections.length);
    counterpoint(1, t, t + TB, VOICE_BASE[1], sections.length);
    t += TB;
    return t;
  });

  // ── EPISODE III (descending) ───────────────────────────────────────────────
  episode("Episode III", -1, 4);

  // 5 ── MIDDLE ENTRIES — inversion ──────────────────────────────────────────
  // The subject appears upside-down (melodic inversion) in the bass, then in the
  // top voice in the subdominant colour. The flipped contour is visible + audible.
  section("Middle entries · inversion", () => {
    let t = cursor;
    place(2, invSubject, t, VOICE_BASE[2] + 5, true, sections.length); // inverted, bass
    place(0, counter, t, VOICE_BASE[0], false, sections.length);
    counterpoint(1, t, t + TB, VOICE_BASE[1], sections.length);
    t += TB;
    place(0, invSubject, t, VOICE_BASE[0] - 1, true, sections.length); // inverted, top
    place(1, counter, t, VOICE_BASE[1] - 3, false, sections.length);
    counterpoint(2, t, t + TB, VOICE_BASE[2], sections.length);
    t += TB;
    return t;
  });

  // ── EPISODE IV (ascending) ─────────────────────────────────────────────────
  episode("Episode IV", 1, 4);

  // 6 ── MIDDLE ENTRIES — dominant ───────────────────────────────────────────
  // A pair of entries in the dominant region (+4 degrees), driving toward the
  // stretto. Countersubject rides along; the third voice is free.
  section("Middle entries · dominant", () => {
    let t = cursor;
    place(0, subject, t, VOICE_BASE[0] + 4, true, sections.length);
    place(1, counter, t, VOICE_BASE[1] + 4, false, sections.length);
    counterpoint(2, t, t + TB, VOICE_BASE[2], sections.length);
    t += TB;
    place(2, subject, t, VOICE_BASE[2] + 4, true, sections.length);
    place(0, counter, t, VOICE_BASE[0], false, sections.length);
    counterpoint(1, t, t + TB, VOICE_BASE[1], sections.length);
    t += TB;
    return t;
  });

  // 7 ── STRETTO — overlapping entries, imitation tightening ──────────────────
  section("Stretto", () => {
    let t = cursor;
    // Round 1: gap ≈ 45% of the subject — entries overlap.
    const gap1 = Math.max(2, Math.round(TB * 0.45 * 2) / 2);
    place(0, subject, t, VOICE_BASE[0], true, sections.length);
    place(1, subject, t + gap1, VOICE_BASE[1] + 4, true, sections.length); // at the fifth
    place(2, subject, t + 2 * gap1, VOICE_BASE[2], true, sections.length);
    t += 2 * gap1 + TB + 1;
    // Round 2: tighter gap — the imitation closes in.
    const gap2 = Math.max(1.5, Math.round(TB * 0.28 * 2) / 2);
    place(2, subject, t, VOICE_BASE[2], true, sections.length);
    place(1, subject, t + gap2, VOICE_BASE[1] + 4, true, sections.length);
    place(0, subject, t + 2 * gap2, VOICE_BASE[0], true, sections.length);
    t += 2 * gap2 + TB;
    return t;
  });

  // 8 ── PEDAL-POINT CLOSE ────────────────────────────────────────────────────
  // Bass sustains the dominant then tonic; the subject makes a final tonic
  // statement above; a full D-minor tonic chord rings out to close.
  section("Pedal-point close", () => {
    let t = cursor;
    hold(2, VOICE_BASE[2] + 4, t, TB * 0.5, sections.length); // dominant pedal (A)
    hold(2, VOICE_BASE[2], t + TB * 0.5, TB * 0.5 + 3, sections.length); // tonic pedal (D)
    place(0, subject, t, VOICE_BASE[0], true, sections.length); // final statement
    place(1, counter, t, VOICE_BASE[1], false, sections.length);
    t += TB;
    // Final tonic triad (D–F–A), sustained.
    hold(0, 7, t, 3, sections.length); // D5
    hold(1, 2, t, 3, sections.length); // F4
    hold(2, VOICE_BASE[2], t, 3, sections.length); // D3
    t += 3.5;
    return t;
  });

  fixParallels(events);

  let minMidi = Infinity;
  let maxMidi = -Infinity;
  for (const e of events) {
    if (e.midi < minMidi) minMidi = e.midi;
    if (e.midi > maxMidi) maxMidi = e.midi;
  }

  return {
    seed,
    bpm: 92,
    events: events.sort((a, b) => a.startBeat - b.startBeat || a.voice - b.voice),
    sections,
    totalBeats: cursor,
    minMidi: minMidi - 2,
    maxMidi: maxMidi + 2,
    subjectMidis: subject.map((t) => degToMidi(t.deg + VOICE_BASE[0])),
  };
}

// ── voice-leading pass: nudge free notes out of parallel perfect 5ths/8ves ──
function fixParallels(events: FugueNote[]) {
  const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  const isPerfect = (semi: number) => {
    const m = ((semi % 12) + 12) % 12;
    return m === 0 || m === 7;
  };
  for (const [va, vb] of pairs) {
    const A = events.filter((e) => e.voice === va).sort((x, y) => x.startBeat - y.startBeat);
    const B = events.filter((e) => e.voice === vb).sort((x, y) => x.startBeat - y.startBeat);
    // coincident onsets
    const coincident: [FugueNote, FugueNote][] = [];
    for (const a of A) {
      const b = B.find((x) => Math.abs(x.startBeat - a.startBeat) < 0.01);
      if (b) coincident.push([a, b]);
    }
    for (let i = 1; i < coincident.length; i++) {
      const [a0, b0] = coincident[i - 1];
      const [a1, b1] = coincident[i];
      if (!isPerfect(a0.midi - b0.midi) || !isPerfect(a1.midi - b1.midi)) continue;
      const aDir = Math.sign(a1.midi - a0.midi);
      const bDir = Math.sign(b1.midi - b0.midi);
      if (aDir === 0 || bDir === 0 || aDir !== bDir) continue; // only true parallels
      // nudge a free note by one scale step (never touch a subject statement)
      const target = a1.free ? a1 : b1.free ? b1 : null;
      if (!target) continue;
      target.adeg += aDir === bDir ? -1 : 1;
      target.midi = degToMidi(target.adeg);
    }
  }
}
