"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15392 · recur — the catalog composing a NEW, never-repeating piece of ITSELF,
// and drawing its FORM as a shape.
//
//   ONE QUESTION — What if Karel's catalog through-composed a fresh movement out
//   of REAL slices of his own recordings — organized across three time-scales —
//   and you could SEE its form as a picture: the whole movement laid out as
//   nested scales, with every thematic RETURN drawn as an arc back to where the
//   theme was first heard?
//
// This is a SELF-COMPOSING engine, not a mixer or a shuffle. Three time-scales:
//   • FORM  (coarse) — a slow arc (settle → gather → peak → return → rest) steers
//                      what KIND of material the engine reaches for at each stage.
//   • PHRASE(mid)     — it picks the next real phrase-slice by musical fit: smooth
//                      voice-leading (circle-of-fifths root closeness + chord-
//                      quality match) + melodic-contour continuity, biased by the
//                      form stage, with anti-repetition so the whole catalog is
//                      pulled in.
//   • MOTIF (fine)    — it REMEMBERS a few early phrases as THEMES; at return
//                      points it brings a remembered theme BACK (optionally
//                      transposed). Thematic return is what makes this a
//                      composition, not a chain.
//
// Every sound is a REAL decoded slice of one of Karel's recordings, played
// bufferSource.start(when, offset, dur) through createSafeMaster. ZERO synthesis.
//
//   SURFACE — a Canvas2D "hierarchical map": the form arc as a tension ribbon
//   (coarse), phrase marks along a track-lane spine (mid), the note contour drawn
//   inside each mark (fine). THE signature move: when a theme returns, an arc is
//   drawn from the new mark back to the mark where the theme was first heard. Over
//   minutes the accumulating return-arcs literally draw the movement's form.
//
//   Lineage: Scott H. Hawley, "Helping Music Co-Creation Agents 'Listen' Well"
//   (arXiv:2608.04378, 2026-08-05) — the time-scale hierarchy; David Cope's EMI /
//   recombinant composition — reassembling a voice from its own fragments; Paul
//   Lamere's Infinite Jukebox (2012) — navigating real audio by self-similarity.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
  type TrackNote,
} from "../_shared/trackAnalysis";

// ── musical constants ────────────────────────────────────────────────────────
const MIN_SLICE = 0.9; // merge slivers up to at least this long
const MAX_SLICE = 4.2; // never quote longer than this
const FALLBACK_WIN = 2.0; // even window when a track has no chords
const PER_TRACK_CAP = 60;
const PAUSE_MS = 300; // rest between phrases

// The FORM arc — a slow, cycling through-line. Each stage names a tension target
// (what energy of material to reach for) and a length in phrases. `returns` marks
// the stages where remembered themes are brought back.
interface Stage {
  name: string;
  tension: number;
  len: number;
  returns: boolean;
}
const STAGES: readonly Stage[] = [
  { name: "settle", tension: 0.16, len: 6, returns: false },
  { name: "gather", tension: 0.46, len: 8, returns: false },
  { name: "peak", tension: 0.94, len: 7, returns: true },
  { name: "return", tension: 0.5, len: 9, returns: true },
  { name: "rest", tension: 0.22, len: 6, returns: false },
];

const MAX_THEMES = 5;
const THEME_LABELS = ["α", "β", "γ", "δ", "ε"];
const MAX_MARKS = 220;
// transpositions a returning theme may take (semitones); weighted toward 0 so a
// theme stays recognizable when it comes back.
const RETURN_TRANSPOSE = [0, 0, 0, 0, -5, 7, -12, 12];

// ── a real phrase-slice of one recording ─────────────────────────────────────
interface Phrase {
  trackId: string;
  title: string;
  trackIndex: number; // stable lane, 0..REAL_TRACKS.length-1
  start: number; // seconds into the source recording
  end: number;
  rootPc: number | null;
  isMinor: boolean;
  chordHist: number[]; // 12-bin, L2-normalized
  contour: number[]; // intervals between consecutive notes
  contourNorm: number[]; // note pitches mapped to -1..1 (for drawing)
  firstMidi: number;
  lastMidi: number;
  energy: number; // 0..1 loudness/density
  noteCount: number;
}

interface Corpus {
  phrases: Phrase[];
  buffers: Map<string, AudioBuffer>;
  loadedTitles: string[];
  loadedIds: string[];
}

// ── pure vector helpers ──────────────────────────────────────────────────────
function l2unit(v: number[]): number[] {
  let n = 0;
  for (const w of v) n += w * w;
  n = Math.sqrt(n);
  if (n < 1e-9) return v.slice();
  return v.map((w) => w / n);
}

function intervalsOf(midis: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < midis.length; i++) out.push(midis[i] - midis[i - 1]);
  return out;
}

function resample(vec: number[], n: number): number[] {
  if (vec.length === 0) return new Array(n).fill(0);
  if (vec.length === 1) return new Array(n).fill(vec[0]);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (vec.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(vec.length - 1, lo + 1);
    const frac = t - lo;
    out[i] = vec[lo] * (1 - frac) + vec[hi] * frac;
  }
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-9 || nb < 1e-9) return na < 1e-9 && nb < 1e-9 ? 1 : 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Circle-of-fifths closeness of two pitch-classes, in [0,1]. */
function cofCloseness(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0.5;
  const pa = (a * 7) % 12;
  const pb = (b * 7) % 12;
  const raw = Math.abs(pa - pb);
  const d = Math.min(raw, 12 - raw); // 0..6
  return 1 - d / 6;
}

function chordTones(symbol: string): { pcs: number[]; root: number | null } {
  const root = chordRoot(symbol);
  if (root === null) return { pcs: [], root: null };
  const third = (root + (chordIsMinor(symbol) ? 3 : 4)) % 12;
  const fifth = (root + 7) % 12;
  return { pcs: [root, third, fifth], root };
}

// ── build one track's phrase-slices from its analysis ────────────────────────
function buildPhrases(
  trackId: string,
  title: string,
  trackIndex: number,
  notes: TrackNote[],
  chords: TrackChord[],
  bufferDuration: number,
): Phrase[] {
  // Choose slice boundaries: chord onsets merged to >= MIN_SLICE; if a track has
  // no usable chords, fall back to even ~FALLBACK_WIN windows.
  const bounds: { start: number; end: number }[] = [];
  if (chords.length >= 2) {
    let s = chords[0].time;
    for (let i = 1; i <= chords.length; i++) {
      const t =
        i < chords.length
          ? chords[i].time
          : chords[chords.length - 1].time +
            Math.max(0.2, chords[chords.length - 1].duration);
      if (t - s >= MIN_SLICE || i === chords.length) {
        const end = Math.min(s + MAX_SLICE, t);
        if (end - s >= MIN_SLICE * 0.7) bounds.push({ start: s, end });
        s = t;
      }
    }
  } else {
    const span = Math.min(bufferDuration, notes[notes.length - 1].time + 2);
    for (let t = notes[0].time; t < span; t += FALLBACK_WIN) {
      bounds.push({ start: t, end: Math.min(t + FALLBACK_WIN, span) });
    }
  }

  const out: Phrase[] = [];
  for (const b of bounds) {
    if (out.length >= PER_TRACK_CAP) break;
    const inSlice = notes.filter((n) => n.time >= b.start && n.time < b.end);
    if (inSlice.length < 3) continue;
    const midis = inSlice.map((n) => n.midi);
    const lo = Math.min(...midis);
    const hi = Math.max(...midis);
    const spanPc = Math.max(1, hi - lo);
    const contourNorm = midis.map((m) => ((m - lo) / spanPc) * 2 - 1);

    // harmony over the slice: chord-tone histogram + dominant chord root/quality
    const hist = new Array<number>(12).fill(0);
    let bestRoot: number | null = null;
    let bestMinor = false;
    let bestOverlap = 0;
    for (const ch of chords) {
      const cs = ch.time;
      const ce = ch.time + Math.max(0.1, ch.duration);
      const overlap = Math.min(b.end, ce) - Math.max(b.start, cs);
      if (overlap <= 0) continue;
      const { pcs, root } = chordTones(ch.chord);
      for (const pc of pcs) hist[pc] += overlap;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestRoot = root;
        bestMinor = chordIsMinor(ch.chord);
      }
    }
    if (bestOverlap === 0) {
      // no chord here — imply harmony from the melody's most-present pitch-class
      const pc = new Array<number>(12).fill(0);
      for (const n of inSlice) pc[((n.midi % 12) + 12) % 12] += n.duration;
      let mx = -1;
      for (let i = 0; i < 12; i++) {
        hist[i] += pc[i];
        if (pc[i] > mx) {
          mx = pc[i];
          bestRoot = i;
        }
      }
    }

    let velSum = 0;
    for (const n of inSlice) velSum += n.velocity;
    const avgVel = velSum / inSlice.length;
    const dur = Math.max(0.2, b.end - b.start);
    const density = inSlice.length / dur;
    const energy = Math.min(
      1,
      Math.max(0, (avgVel / 127) * 0.6 + Math.min(1, density / 6) * 0.4),
    );

    out.push({
      trackId,
      title,
      trackIndex,
      start: b.start,
      end: b.end,
      rootPc: bestRoot,
      isMinor: bestMinor,
      chordHist: l2unit(hist),
      contour: intervalsOf(midis),
      contourNorm,
      firstMidi: midis[0],
      lastMidi: midis[midis.length - 1],
      energy,
      noteCount: inSlice.length,
    });
  }
  return out;
}

/** Load Karel's whole verified catalog and assemble the phrase corpus. Any track
 *  whose audio or analysis fails is skipped — never fatal. */
async function buildCorpus(
  ctx: AudioContext,
  onProgress: (msg: string) => void,
): Promise<Corpus> {
  const buffers = new Map<string, AudioBuffer>();
  const loadedTitles: string[] = [];
  const loadedIds: string[] = [];
  const phrases: Phrase[] = [];

  for (let i = 0; i < REAL_TRACKS.length; i++) {
    const seed = REAL_TRACKS[i];
    onProgress(`loading ${seed.title}… (${i + 1}/${REAL_TRACKS.length})`);
    let buffer: AudioBuffer | null = null;
    try {
      const r = await loadRealTrackBuffer(ctx, seed.id);
      buffer = r.buffer;
    } catch {
      buffer = null;
    }
    if (!buffer) continue;

    let analysis;
    try {
      analysis = await loadTrackAnalysis(seed.id);
    } catch {
      analysis = null;
    }
    if (!analysis || analysis.notes.length < 4) continue;

    const trackPhrases = buildPhrases(
      seed.id,
      seed.title,
      i,
      analysis.notes,
      analysis.chords ?? [],
      buffer.duration,
    );
    if (trackPhrases.length === 0) continue;

    buffers.set(seed.id, buffer);
    loadedTitles.push(seed.title);
    loadedIds.push(seed.id);
    for (const p of trackPhrases) phrases.push(p);
  }

  return { phrases, buffers, loadedTitles, loadedIds };
}

// ── the composer's live weights (steer layer, all optional) ──────────────────
interface Weights {
  formBias: number; // 0..1 — tension / how hard the form steers material
  harmonic: number; // 0..1 — voice-leading smoothness vs melodic continuity
  motifRate: number; // 0..1 — how often themes return at return points
}

/** How well a candidate follows the previous phrase, biased by the form stage. */
function scoreCandidate(
  prev: Phrase | null,
  cand: Phrase,
  targetTension: number,
  w: Weights,
): number {
  // voice-leading: smooth root motion + chord-quality agreement + chord overlap
  let voice = 0.5;
  let contourCont = 0.5;
  if (prev) {
    const rootClose = cofCloseness(prev.rootPc, cand.rootPc);
    const qual = prev.isMinor === cand.isMinor ? 1 : 0.55;
    const histSim = cosine(prev.chordHist, cand.chordHist);
    voice = 0.42 * rootClose + 0.28 * qual + 0.3 * histSim;
    // melodic continuity: contour shape + how near the join is (last→first note)
    const shape = (cosine(resample(prev.contour, 8), resample(cand.contour, 8)) + 1) / 2;
    const leap = Math.abs(prev.lastMidi - cand.firstMidi);
    const join = 1 - Math.min(1, leap / 14);
    contourCont = 0.55 * shape + 0.45 * join;
  }
  const hw = Math.min(1, Math.max(0, w.harmonic));
  const musical = hw * voice + (1 - hw) * contourCont;
  // form fit: does this material's energy match the stage's tension target?
  const formFit = 1 - Math.abs(cand.energy - targetTension);
  const formWeight = 0.25 + w.formBias * 0.4;
  return (1 - formWeight) * musical + formWeight * formFit;
}

// ── slice player: real buffer slices only, click-free, optional transpose ────
class SlicePlayer {
  private cur: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(
    private ctx: AudioContext,
    private dest: AudioNode,
  ) {}

  stop(): void {
    if (!this.cur) return;
    const { src, gain } = this.cur;
    const t = this.ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, 0.04);
      src.stop(t + 0.2);
    } catch {
      /* already stopped */
    }
    this.cur = null;
  }

  /** Play a slice, optionally transposed by `semi` semitones (playbackRate).
   *  Returns the SOUNDING duration in seconds. */
  play(
    buffer: AudioBuffer,
    start: number,
    end: number,
    level = 0.9,
    semi = 0,
  ): number {
    this.stop();
    const ctx = this.ctx;
    const sliceDur = Math.max(MIN_SLICE * 0.6, Math.min(MAX_SLICE, end - start));
    const rate = Math.pow(2, semi / 12);
    const sounding = sliceDur / rate;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.dest);

    const t = ctx.currentTime + 0.02;
    const fadeIn = 0.03;
    const fadeOut = Math.min(0.16, sounding * 0.3);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + fadeIn);
    gain.gain.setValueAtTime(level, t + sounding - fadeOut);
    gain.gain.linearRampToValueAtTime(0, t + sounding);
    src.start(t, start, sliceDur + 0.05);

    const entry = { src, gain };
    this.cur = entry;
    src.onended = () => {
      if (this.cur === entry) this.cur = null;
    };
    return sounding;
  }

  dispose(): void {
    this.stop();
  }
}

// ── the drawn map: marks (phrases) + arcs (recurrence) + tension ribbon ──────
interface Mark {
  id: number;
  trackIndex: number;
  rootPc: number | null;
  isMinor: boolean;
  energy: number;
  contourNorm: number[];
  tension: number;
  stage: number;
  isThemeOrigin: boolean;
  isReturn: boolean;
  themeLabel?: string;
}
interface Arc {
  fromId: number; // theme origin mark
  toId: number; // the returning mark
  label: string;
  semi: number;
}

interface Theme {
  phrase: Phrase;
  originId: number;
  label: string;
  returns: number;
}

// violet brand accent used for the three time-scales + recurrence arcs
const VIOLET = "139, 92, 246"; // rgb of --primary (approx)

function drawMap(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  marks: Mark[],
  arcs: Arc[],
  activeId: number | null,
  level: number,
  ink: string,
  faint: string,
  stageName: string,
  nTracks: number,
) {
  ctx.clearRect(0, 0, W, H);

  const marginX = 44;
  const usableW = W - marginX * 2;
  const topBandH = H * 0.2;
  const topBandBottom = topBandH + 24;
  const spineTop = topBandBottom + 40;
  const spineBottom = H - 54;
  const spineH = spineBottom - spineTop;
  const spineMid = (spineTop + spineBottom) / 2;
  const laneGap = spineH / Math.max(12, nTracks + 2);

  const N = marks.length;
  const xOf = (i: number) =>
    marginX + (N <= 1 ? usableW / 2 : (i / (N - 1)) * usableW);
  const laneY = (ti: number) =>
    spineMid + (ti - (nTracks - 1) / 2) * laneGap;

  // index lookup so arcs can find their endpoints after culling
  const xById = new Map<number, number>();
  const yById = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    xById.set(marks[i].id, xOf(i));
    yById.set(marks[i].id, laneY(marks[i].trackIndex));
  }

  // ── FORM (coarse): the tension ribbon across the whole width ──────────────
  if (N >= 2) {
    ctx.beginPath();
    ctx.moveTo(xOf(0), topBandBottom);
    for (let i = 0; i < N; i++) {
      const x = xOf(i);
      const y = topBandBottom - marks[i].tension * topBandH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(xOf(N - 1), topBandBottom);
    ctx.closePath();
    ctx.fillStyle = `rgba(${VIOLET}, 0.1)`;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = xOf(i);
      const y = topBandBottom - marks[i].tension * topBandH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${VIOLET}, 0.55)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // baseline of the form band
  ctx.beginPath();
  ctx.moveTo(marginX, topBandBottom);
  ctx.lineTo(W - marginX, topBandBottom);
  ctx.strokeStyle = faint;
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── spine + faint track lanes ─────────────────────────────────────────────
  ctx.strokeStyle = faint;
  ctx.lineWidth = 1;
  for (let ti = 0; ti < nTracks; ti++) {
    const y = laneY(ti);
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(marginX, y);
    ctx.lineTo(W - marginX, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ── RECURRENCE (the signature move): arcs from each return back to origin ──
  for (const a of arcs) {
    const x0 = xById.get(a.fromId);
    const y0 = yById.get(a.fromId);
    const x1 = xById.get(a.toId);
    const y1 = yById.get(a.toId);
    if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined)
      continue;
    const dist = Math.abs(x1 - x0);
    const lift = Math.min(topBandH + 30, 30 + dist * 0.45);
    const apexY = Math.min(y0, y1) - lift;
    const cx = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, apexY, x1, y1);
    ctx.strokeStyle = `rgba(${VIOLET}, 0.42)`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // label at the apex
    ctx.fillStyle = `rgba(${VIOLET}, 0.85)`;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    const tag = a.semi !== 0 ? `${a.label}${a.semi > 0 ? "+" : ""}${a.semi}` : a.label;
    ctx.fillText(tag, cx, apexY + 4);
  }

  // ── PHRASE (mid) marks + NOTE (fine) contour inside each ──────────────────
  const drawContour = N <= 120; // keep it legible/perf-friendly when dense
  for (let i = 0; i < N; i++) {
    const m = marks[i];
    const x = xOf(i);
    const y = laneY(m.trackIndex);
    const isActive = m.id === activeId;
    const r = 2 + m.energy * 4;

    // NOTE scale: the contour of the phrase, drawn small around the mark
    if ((drawContour || isActive || m.isThemeOrigin) && m.contourNorm.length > 1) {
      const cw = Math.min(16, (usableW / Math.max(1, N)) * 0.9 + 6);
      const amp = laneGap * 0.42;
      ctx.beginPath();
      for (let k = 0; k < m.contourNorm.length; k++) {
        const px = x - cw / 2 + (k / (m.contourNorm.length - 1)) * cw;
        const py = y - m.contourNorm[k] * amp;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = isActive
        ? `rgba(${VIOLET}, 0.9)`
        : m.isThemeOrigin
          ? `rgba(${VIOLET}, 0.5)`
          : faint;
      ctx.lineWidth = isActive ? 1.4 : 0.8;
      ctx.stroke();
    }

    // the mark itself. brightness ← energy; minor darker; major brighter.
    const shade = 0.35 + m.energy * 0.5 + (m.isMinor ? -0.08 : 0.08);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (m.isReturn) {
      ctx.fillStyle = `rgba(${VIOLET}, 0.95)`;
      ctx.fill();
    } else if (m.isThemeOrigin) {
      ctx.fillStyle = `rgba(${VIOLET}, 0.28)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${VIOLET}, 0.9)`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.fillStyle = ink;
      ctx.globalAlpha = Math.min(1, Math.max(0.25, shade));
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // active mark: a live glow driven by the sounding level
    if (isActive) {
      const gr = r + 4 + level * 22;
      const grad = ctx.createRadialGradient(x, y, r, x, y, gr);
      grad.addColorStop(0, `rgba(${VIOLET}, ${0.35 + level * 0.4})`);
      grad.addColorStop(1, `rgba(${VIOLET}, 0)`);
      ctx.beginPath();
      ctx.arc(x, y, gr, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // theme-origin label
    if (m.isThemeOrigin && m.themeLabel) {
      ctx.fillStyle = `rgba(${VIOLET}, 0.9)`;
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(m.themeLabel, x, y + r + 13);
    }
  }

  // ── scale labels (so the nesting reads) ───────────────────────────────────
  ctx.textAlign = "left";
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = faint;
  ctx.fillText("FORM · tension arc", marginX, 16);
  ctx.fillText(`PHRASE · ${stageName}`, marginX, topBandBottom + 16);
  ctx.textAlign = "right";
  ctx.fillText("track lanes ↓", W - marginX, topBandBottom + 16);
  ctx.textAlign = "left";
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RecurPage() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadedTitles, setLoadedTitles] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(false);

  // live HUD state
  const [stageName, setStageName] = useState("—");
  const [phraseCount, setPhraseCount] = useState(0);
  const [themeCount, setThemeCount] = useState(0);
  const [returnCount, setReturnCount] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<string>("");

  // steer state (mirrored into a ref for the live loop)
  const [formBias, setFormBias] = useState(0.5);
  const [harmonic, setHarmonic] = useState(0.55);
  const [motifRate, setMotifRate] = useState(0.4);
  const weightsRef = useRef<Weights>({
    formBias: 0.5,
    harmonic: 0.55,
    motifRate: 0.4,
  });

  // audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const playerRef = useRef<SlicePlayer | null>(null);
  const corpusRef = useRef<Corpus | null>(null);

  // composition state (the engine's memory)
  const runningRef = useRef(false);
  const prevPhraseRef = useRef<Phrase | null>(null);
  const visitsRef = useRef<Map<string, number>>(new Map());
  const stageIdxRef = useRef(0);
  const stagePhraseRef = useRef(0);
  const cycleRef = useRef(0);
  const themesRef = useRef<Theme[]>([]);
  const marksRef = useRef<Mark[]>([]);
  const arcsRef = useRef<Arc[]>([]);
  const markIdRef = useRef(0);
  const activeIdRef = useRef<number | null>(null);
  const nudgeRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const nTracksRef = useRef(0);

  // draw refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const levelRef = useRef(0);
  const themeInkRef = useRef({ ink: "#e5e5e5", faint: "rgba(160,160,170,0.5)" });

  // ── one composed phrase: choose material, remember/return themes, play it ──
  const composeNext = useCallback(() => {
    if (!runningRef.current) return;
    const corpus = corpusRef.current;
    const player = playerRef.current;
    if (!corpus || !player || corpus.phrases.length === 0) return;

    const w = weightsRef.current;
    const stage = STAGES[stageIdxRef.current];
    // form bias raises the tension target the material is matched against
    const targetTension = Math.min(
      1,
      Math.max(0, stage.tension + (w.formBias - 0.5) * 0.5),
    );

    // ── MOTIF RETURN: at a return-point in the form, bring a theme back ──────
    let chosen: Phrase | null = null;
    let semi = 0;
    let returningTheme: Theme | null = null;
    const canReturn =
      stage.returns && themesRef.current.length > 0 && cycleRef.current >= 1;
    if (canReturn && Math.random() < 0.25 + w.motifRate * 0.6) {
      // prefer the theme brought back least often
      const themes = themesRef.current.slice().sort((a, b) => a.returns - b.returns);
      returningTheme = themes[0];
      chosen = returningTheme.phrase;
      semi = RETURN_TRANSPOSE[Math.floor(Math.random() * RETURN_TRANSPOSE.length)];
    }

    // ── PHRASE SELECTION: otherwise pick the best-fitting fresh slice ─────────
    if (!chosen) {
      const prev = prevPhraseRef.current;
      const scored = corpus.phrases
        .map((c) => ({ c, s: scoreCandidate(prev, c, targetTension, w) }))
        .sort((a, b) => b.s - a.s);
      // adventurousness widens with tension; nudge widens once
      let K = Math.round(5 + targetTension * 22);
      if (nudgeRef.current) K = Math.min(scored.length, K + 24);
      let pool = scored.slice(0, Math.min(K, scored.length));
      // never immediately repeat the exact same phrase
      if (prev) {
        const f = pool.filter(
          (e) => !(e.c.trackId === prev.trackId && e.c.start === prev.start),
        );
        if (f.length > 0) pool = f;
      }
      if (nudgeRef.current && pool.length > 3) {
        pool = pool.slice(Math.floor(pool.length / 2)); // leap further
      }
      // weighted draw: sharper toward the top, anti-repetition per track
      const floor = pool[pool.length - 1]?.s ?? 0;
      let total = 0;
      const weights = pool.map((e) => {
        const base = Math.pow(Math.max(0.02, e.s - floor + 0.05), 2.2);
        const visits = visitsRef.current.get(e.c.trackId) ?? 0;
        const anti = 1 / (1 + 1.8 * visits);
        const weight = base * anti;
        total += weight;
        return weight;
      });
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      chosen = pool[idx]?.c ?? corpus.phrases[0];
    }
    nudgeRef.current = false;

    const buffer = corpus.buffers.get(chosen.trackId);
    if (!buffer) {
      timerRef.current = window.setTimeout(composeNext, 250);
      return;
    }

    // ── record the mark on the map ───────────────────────────────────────────
    const id = ++markIdRef.current;
    // is this early phrase worth remembering as a THEME? (first cycle, spaced out)
    let isThemeOrigin = false;
    let themeLabel: string | undefined;
    if (
      !returningTheme &&
      cycleRef.current === 0 &&
      themesRef.current.length < MAX_THEMES &&
      stagePhraseRef.current % 2 === 1 &&
      chosen.noteCount >= 4
    ) {
      themeLabel = THEME_LABELS[themesRef.current.length];
      isThemeOrigin = true;
      themesRef.current.push({
        phrase: chosen,
        originId: id,
        label: themeLabel,
        returns: 0,
      });
      setThemeCount(themesRef.current.length);
    }

    const mark: Mark = {
      id,
      trackIndex: chosen.trackIndex,
      rootPc: chosen.rootPc,
      isMinor: chosen.isMinor,
      energy: chosen.energy,
      contourNorm: chosen.contourNorm,
      tension: targetTension,
      stage: stageIdxRef.current,
      isThemeOrigin,
      isReturn: !!returningTheme,
      themeLabel,
    };
    marksRef.current.push(mark);

    // ── the RECURRENCE arc: connect this return to where the theme began ─────
    if (returningTheme) {
      returningTheme.returns += 1;
      arcsRef.current.push({
        fromId: returningTheme.originId,
        toId: id,
        label: returningTheme.label,
        semi,
      });
      setReturnCount((c) => c + 1);
    }

    // cull oldest non-theme-origin marks so the map stays performant, but keep
    // theme origins pinned so their recurrence arcs always have an anchor.
    if (marksRef.current.length > MAX_MARKS) {
      const removeIdx = marksRef.current.findIndex((m) => !m.isThemeOrigin);
      if (removeIdx >= 0) marksRef.current.splice(removeIdx, 1);
    }

    activeIdRef.current = id;
    visitsRef.current.set(
      chosen.trackId,
      (visitsRef.current.get(chosen.trackId) ?? 0) + 1,
    );
    prevPhraseRef.current = chosen;
    setPhraseCount((c) => c + 1);
    setNowPlaying(
      `${chosen.title}${returningTheme ? ` · theme ${returningTheme.label}${semi ? ` @${semi > 0 ? "+" : ""}${semi}` : ""}` : ""}`,
    );

    // ── play the REAL slice ──────────────────────────────────────────────────
    const level = 0.72 + targetTension * 0.22;
    const sounding = player.play(buffer, chosen.start, chosen.end, level, semi);

    // ── advance the FORM arc ─────────────────────────────────────────────────
    stagePhraseRef.current += 1;
    if (stagePhraseRef.current >= stage.len) {
      stagePhraseRef.current = 0;
      stageIdxRef.current = (stageIdxRef.current + 1) % STAGES.length;
      if (stageIdxRef.current === 0) cycleRef.current += 1;
      setStageName(STAGES[stageIdxRef.current].name);
    }

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => {
        if (runningRef.current) composeNext();
      },
      sounding * 1000 + PAUSE_MS,
    );
  }, []);

  // ── the draw loop: read the live level, render the hierarchical map ────────
  useEffect(() => {
    const frame = () => {
      const canvas = canvasRef.current;
      const master = masterRef.current;
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        const c2d = canvas.getContext("2d");
        if (c2d) {
          if (master) {
            const an = master.analyser;
            if (!freqRef.current || freqRef.current.length !== an.frequencyBinCount) {
              freqRef.current = new Uint8Array(an.frequencyBinCount);
            }
            an.getByteFrequencyData(freqRef.current);
            let sum = 0;
            for (let i = 0; i < freqRef.current.length; i++) sum += freqRef.current[i];
            const raw = sum / (freqRef.current.length * 255);
            levelRef.current = levelRef.current * 0.6 + Math.min(1, raw * 3) * 0.4;
          }
          c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
          const { ink, faint } = themeInkRef.current;
          drawMap(
            c2d,
            w,
            h,
            marksRef.current,
            arcsRef.current,
            activeIdRef.current,
            levelRef.current,
            ink,
            faint,
            STAGES[stageIdxRef.current].name,
            nTracksRef.current || REAL_TRACKS.length,
          );
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // resolve the real foreground/border colors from CSS tokens for the canvas ink
  useEffect(() => {
    if (typeof window === "undefined") return;
    const probe = document.createElement("div");
    probe.style.display = "none";
    document.body.appendChild(probe);
    probe.className = "text-foreground";
    const ink = getComputedStyle(probe).color || "#e5e5e5";
    probe.className = "text-muted-foreground";
    const muted = getComputedStyle(probe).color || "rgba(160,160,170,0.5)";
    document.body.removeChild(probe);
    themeInkRef.current = { ink, faint: muted };
  }, []);

  // ── full teardown ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      playerRef.current?.dispose();
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── Start: build audio + corpus, then let the piece compose itself ─────────
  const start = useCallback(async () => {
    if (running || loading) return;
    setError(null);
    setLoading(true);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) throw new Error("This browser blocks Web Audio.");
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      masterRef.current = createSafeMaster(ctx, { gain: 0.85 });
      playerRef.current = new SlicePlayer(ctx, masterRef.current.input);

      const corpus = await buildCorpus(ctx, (m) => setLoadMsg(m));
      if (corpus.phrases.length === 0) {
        throw new Error(
          "Could not load any of Karel's tracks (network?). Try again.",
        );
      }
      corpusRef.current = corpus;
      nTracksRef.current = corpus.loadedIds.length;
      setLoadedTitles(corpus.loadedTitles);
      setLoadMsg("");
      setStageName(STAGES[0].name);

      runningRef.current = true;
      setRunning(true);
      timerRef.current = window.setTimeout(composeNext, 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start.");
    } finally {
      setLoading(false);
    }
  }, [running, loading, composeNext]);

  const nudge = useCallback(() => {
    nudgeRef.current = true;
  }, []);

  const onFormBias = (v: number) => {
    setFormBias(v);
    weightsRef.current = { ...weightsRef.current, formBias: v };
  };
  const onHarmonic = (v: number) => {
    setHarmonic(v);
    weightsRef.current = { ...weightsRef.current, harmonic: v };
  };
  const onMotif = (v: number) => {
    setMotifRate(v);
    weightsRef.current = { ...weightsRef.current, motifRate: v };
  };

  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <a
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </a>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        design notes
      </button>

      <header className="shrink-0 space-y-2 px-6 pb-4 pt-14">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          15392 · recur
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          The catalog composing a piece of itself
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A self-composing engine assembles a new, never-repeating movement out of
          real slices of Karel&apos;s recordings across three time-scales — form,
          phrase, motif. Press Start and it composes on its own: the map draws the
          form as a tension ribbon, each phrase as a mark on its track lane, and
          every thematic <span className="text-foreground">return</span> as an arc
          back to where the theme was first heard.
        </p>
      </header>

      {loadedTitles.length > 0 && (
        <div className="shrink-0 px-6 pb-2">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            corpus · {loadedTitles.length} tracks drawn in
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {loadedTitles.map((t) => (
              <span key={t} className="font-mono text-sm text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* the hierarchical map */}
      <div className="relative min-h-0 flex-1 px-4 pb-2">
        <canvas ref={canvasRef} className="h-full w-full" />
        {!running && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <p className="max-w-md text-center text-base text-muted-foreground">
              {loading
                ? loadMsg || "loading his catalog…"
                : "Press Start — the engine will compose a movement of itself and draw its form here."}
            </p>
          </div>
        )}
      </div>

      {/* HUD */}
      {running && (
        <div className="shrink-0 px-6">
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span>
              form · <span className="text-foreground">{stageName}</span>
            </span>
            <span>
              phrases · <span className="text-foreground">{phraseCount}</span>
            </span>
            <span>
              themes · <span className="text-foreground">{themeCount}</span>
            </span>
            <span>
              returns · <span className="text-primary">{returnCount}</span>
            </span>
            {nowPlaying && (
              <span className="normal-case tracking-normal text-primary">
                ♪ {nowPlaying}
              </span>
            )}
          </div>
        </div>
      )}

      {/* controls */}
      <div className="shrink-0 space-y-3 border-t border-border px-6 py-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {running && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <Slider label="Form bias · tension" value={formBias} onChange={onFormBias} />
            <Slider label="Harmonic smoothness" value={harmonic} onChange={onHarmonic} />
            <Slider label="Motif-return rate" value={motifRate} onChange={onMotif} />
            <button
              onClick={nudge}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              nudge — reach further
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {running
              ? "self-composing — steer freely or leave it be"
              : "self-propelling — no mic, camera, or input device needed"}
          </p>
          {!running && (
            <button
              onClick={start}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "loading his catalog…" : "Start composing"}
            </button>
          )}
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                A self-composing engine through-composes a new movement out of{" "}
                <span className="text-foreground">real slices</span> of Karel&apos;s
                recordings — never a synth tone. It works on three nested
                time-scales, after Scott&nbsp;H.&nbsp;Hawley&apos;s argument that a
                co-creation agent must &ldquo;listen&rdquo; across scales at once.
              </p>
              <p>
                <span className="text-foreground">Form</span> is a slow arc — settle,
                gather, peak, return, rest — that steers what energy of material the
                engine reaches for.{" "}
                <span className="text-foreground">Phrase</span> selection scores each
                real slice by voice-leading (circle-of-fifths root closeness +
                chord-quality match) and melodic-contour continuity, biased by the
                stage, with anti-repetition so the whole catalog is pulled in.{" "}
                <span className="text-foreground">Motif</span> memory remembers a few
                early phrases as themes and, at return points, brings one back —
                optionally transposed.
              </p>
              <p>
                The map makes the scales spatial: the{" "}
                <span className="text-primary">violet ribbon</span> is the form&apos;s
                tension; each mark is a phrase on its track lane; the fine line inside
                is its note contour. The signature move — each thematic{" "}
                <span className="text-primary">return draws an arc</span> back to where
                the theme was first heard, so over minutes the accumulating arcs draw
                the movement&apos;s form as a picture.
              </p>
              <p>
                Lineage: David&nbsp;Cope&apos;s EMI / recombinant composition
                (reassembling a voice from its own fragments); Paul&nbsp;Lamere&apos;s
                Infinite&nbsp;Jukebox (2012); Hawley,{" "}
                <em>Helping Music Co-Creation Agents &ldquo;Listen&rdquo; Well</em>{" "}
                (arXiv:2608.04378).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15392-recur"]} />
    </main>
  );
}

// ── a minimal achromatic slider ──────────────────────────────────────────────
function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-44 cursor-pointer appearance-none rounded-full bg-border accent-foreground"
      />
    </label>
  );
}
