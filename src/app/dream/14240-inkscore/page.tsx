"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14240 · Ink Score
//
//   ONE QUESTION
//   What if you could COMPOSE a brand-new coherent piece by weaving phrases
//   sampled from your WHOLE recorded catalog onto a paper-white, ink-on-paper
//   graphic score — and a harmony engine kept the woven result in key, so it's
//   music, not collage?
//
//   You play the COMPUTER KEYBOARD like a composer, not a pianist. Number keys
//   pick which recording the next phrase comes from; SPACE drops the "next best"
//   in-key phrase onto a left-to-right time-score at the sweeping playhead. Each
//   placed mark is a real slice of one of Karel's takes — no synthesis anywhere.
//   The score loops; as the playhead re-crosses a mark, that phrase sounds again.
//
//   THREE SUBSYSTEMS
//     1. PHRASE CORPUS  — every track's note-roll is split into phrases at
//        silences (corpus.ts). Each phrase carries its chroma, register, energy
//        and melodic contour. The recordings ARE the sound bank.
//     2. AUDIO          — a phrase plays as one AudioBufferSourceNode reading its
//        track's decoded buffer from startTime for its length, with equal-power
//        fades, through the shared ear-safety master. Zero oscillators.
//     3. HARMONY ENGINE — a running key. Placing a phrase SELECTS the best-fitting
//        one (Krumhansl key-profile correlation), and a small playback-rate detune
//        SNAPS its mean pitch onto the key's nearest diatonic degree. A CONSONANCE
//        slider crossfades from raw collage (0) to fully in-key (1) — and it acts
//        live, so re-keying the piece reshapes every looping mark.
//
//   AESTHETIC  Cardew's *Treatise* and Xenakis's UPIC: expressive abstract ink
//   marks on warm paper, height = register, length = duration, weight = energy.
//   Ink on paper — no grid, no neon.
//
//   REFS  Cornelius Cardew, *Treatise* (1967); Iannis Xenakis, UPIC (1977; see the
//   2025 open-access "From Xenakis's UPIC to Graphic Notation Today", ZKM/Hatje
//   Cantz); "The Concatenator: A Bayesian Approach to Real-Time Concatenative
//   Musaicing" (arXiv:2411.04366). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  buildPhrases,
  buildFallbackPhrases,
  keyProfile,
  fitScore,
  nearestScaleOffset,
  keyName,
  parseKey,
  estimateKey,
  type Phrase,
} from "./corpus";

// ── ink-on-paper palette (canvas ART only — chrome uses semantic tokens) ──────
const PAPER = "#f2ecdd";
const PAPER_EDGE = "#e7dfca";
const INK = "#241f18";
const INK_FAINT = "rgba(36, 31, 24, 0.08)";
const ACCENT = "#9c4a2c"; // restrained sienna — playhead + trigger flash

const BANK_SIZE = 8;
const MIDI_LO = 40;
const MIDI_HI = 90;

interface PlacedGlyph {
  id: number;
  phrase: Phrase;
  t01: number; // position within the loop, 0..1
  placedPass: number; // loop pass it was dropped on (avoids instant re-trigger)
  flash: number; // 0..1, decays after a trigger
}

// deterministic hand-drawn jitter (no Math.random) — stable per (id, point).
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2; // -1..1
}

type Phase = "idle" | "loading" | "ready" | "error";

export default function InkScorePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tracksLoaded, setTracksLoaded] = useState(0);
  const [phraseCount, setPhraseCount] = useState(0);
  const [bank, setBank] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [consonance, setConsonance] = useState(0.85);
  const [keyPc, setKeyPc] = useState(0);
  const [keyMinor, setKeyMinor] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [loopLen, setLoopLen] = useState(16);
  const [placedTotal, setPlacedTotal] = useState(0);
  const [status, setStatus] = useState("Press Play to load your catalog.");
  const [showNotes, setShowNotes] = useState(false);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const fadeInRef = useRef<Float32Array | null>(null);
  const fadeOutRef = useRef<Float32Array | null>(null);

  // corpus
  const corpusRef = useRef<Map<string, Phrase[]>>(new Map());
  const needsFallbackRef = useRef<Set<string>>(new Set());
  const bufferRef = useRef<Map<string, AudioBuffer>>(new Map());
  const decodeRef = useRef<Map<string, Promise<AudioBuffer>>>(new Map());
  const rrRef = useRef<Map<string, number>>(new Map());
  const keyInitedRef = useRef(false);

  // score / transport
  const placedRef = useRef<PlacedGlyph[]>([]);
  const glyphIdRef = useRef(0);
  const playTimeRef = useRef(0);
  const lastTsRef = useRef(0);

  // live mirrors read inside rAF / handlers
  const playingRef = useRef(playing);
  const loopLenRef = useRef(loopLen);
  const consonanceRef = useRef(consonance);
  const keyRef = useRef({ pc: keyPc, minor: keyMinor });
  const selectedRef = useRef(selectedIdx);
  useEffect(() => void (playingRef.current = playing), [playing]);
  useEffect(() => void (loopLenRef.current = loopLen), [loopLen]);
  useEffect(() => void (consonanceRef.current = consonance), [consonance]);
  useEffect(() => void (keyRef.current = { pc: keyPc, minor: keyMinor }), [keyPc, keyMinor]);
  useEffect(() => void (selectedRef.current = selectedIdx), [selectedIdx]);

  // canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const dimRef = useRef({ w: 0, h: 0 });
  const levelRef = useRef(0);

  const trackTitle = (id: string) => REAL_TRACKS.find((t) => t.id === id)?.title ?? id;

  // ── lazy decode a track's buffer; build fallback phrases if needed ──────────
  const ensureBuffer = useCallback((id: string): Promise<AudioBuffer> => {
    const cached = bufferRef.current.get(id);
    if (cached) return Promise.resolve(cached);
    const inflight = decodeRef.current.get(id);
    if (inflight) return inflight;
    const ctx = ctxRef.current;
    if (!ctx) return Promise.reject(new Error("no audio context"));
    const p = loadRealTrackBuffer(ctx, id).then(({ buffer }) => {
      bufferRef.current.set(id, buffer);
      if (needsFallbackRef.current.has(id) && !(corpusRef.current.get(id)?.length)) {
        const fb = buildFallbackPhrases(id, buffer.duration);
        corpusRef.current.set(id, fb);
        needsFallbackRef.current.delete(id);
        let total = 0;
        corpusRef.current.forEach((v) => (total += v.length));
        setPhraseCount(total);
      }
      return buffer;
    });
    decodeRef.current.set(id, p);
    return p;
  }, []);

  // ── harmony-aware phrase selection for a track ──────────────────────────────
  const selectPhrase = useCallback((id: string): Phrase | null => {
    const phrases = corpusRef.current.get(id);
    if (!phrases || phrases.length === 0) return null;
    const { pc, minor } = keyRef.current;
    const profile = keyProfile(pc, minor);
    const ranked = phrases
      .map((ph) => ({ ph, s: fitScore(ph.chroma, profile) }))
      .sort((a, b) => b.s - a.s);
    const cons = consonanceRef.current;
    const rr = (rrRef.current.get(id) ?? 0) + 1;
    rrRef.current.set(id, rr);
    // consonance 1 → best-fitting (index 0); 0 → cycle through all in rank order.
    const idx = Math.round((1 - cons) * Math.min(ranked.length - 1, rr % ranked.length));
    return ranked[Math.max(0, Math.min(ranked.length - 1, idx))].ph;
  }, []);

  // ── live detune that snaps a phrase toward the running key ──────────────────
  const shiftFor = useCallback((ph: Phrase): number => {
    if (ph.unpitched) return 0;
    const { pc, minor } = keyRef.current;
    const off = nearestScaleOffset(ph.meanPc, pc, minor);
    const scaled = off * consonanceRef.current;
    return Math.max(-4, Math.min(4, Math.round(scaled)));
  }, []);

  // ── play one phrase as a real slice of its recording ────────────────────────
  const playPhrase = useCallback(
    (ph: Phrase, when: number) => {
      const ctx = ctxRef.current;
      const safe = safeRef.current;
      const buf = bufferRef.current.get(ph.trackId);
      const fin = fadeInRef.current;
      const fout = fadeOutRef.current;
      if (!ctx || !safe || !buf || !fin || !fout) return;
      const rate = Math.pow(2, shiftFor(ph) / 12);
      const srcDur = Math.max(0.05, ph.endTime - ph.startTime);
      const playDur = srcDur / rate; // real (output) time
      const fade = Math.min(0.03, playDur * 0.3);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      src.connect(g).connect(safe.input);
      g.gain.setValueCurveAtTime(fin, when, fade);
      g.gain.setValueCurveAtTime(fout, Math.max(when + fade, when + playDur - fade), fade);
      try {
        src.start(when, ph.startTime, srcDur);
      } catch {
        return;
      }
      src.onended = () => {
        try {
          g.disconnect();
          src.disconnect();
        } catch {
          /* gone */
        }
      };
    },
    [shiftFor],
  );

  // ── the compose gesture: drop the next best phrase at the playhead ──────────
  const dropPhrase = useCallback(() => {
    if (phase !== "ready") return;
    const id = REAL_TRACKS[selectedRef.current]?.id;
    if (!id) return;
    const phrases = corpusRef.current.get(id);
    if (!phrases || phrases.length === 0) {
      if (needsFallbackRef.current.has(id)) {
        setStatus(`Decoding “${trackTitle(id)}” — try again in a moment.`);
        void ensureBuffer(id).catch(() => {});
      } else {
        setStatus(`“${trackTitle(id)}” has no usable phrases — pick another.`);
      }
      return;
    }
    if (!playingRef.current) {
      playingRef.current = true;
      setPlaying(true);
    }
    const ph = selectPhrase(id);
    if (!ph) return;
    const L = loopLenRef.current;
    const t01 = ((playTimeRef.current % L) + L) % L / L;
    const glyph: PlacedGlyph = {
      id: glyphIdRef.current++,
      phrase: ph,
      t01,
      placedPass: Math.floor(playTimeRef.current / L),
      flash: 1,
    };
    placedRef.current.push(glyph);
    setPlacedTotal(placedRef.current.length);
    setStatus(`Wove a phrase from “${trackTitle(id)}”.`);
    // audition immediately (decodes if needed)
    const ctx = ctxRef.current;
    ensureBuffer(id)
      .then(() => {
        if (ctx) playPhrase(ph, ctx.currentTime);
      })
      .catch(() => {});
  }, [phase, selectPhrase, ensureBuffer, playPhrase]);

  // ── seed a few in-key phrases so a visitor hears something in one click ─────
  const seedDemo = useCallback(async () => {
    if (phase !== "ready") return;
    const loaded = REAL_TRACKS.filter((t) => (corpusRef.current.get(t.id)?.length ?? 0) > 0);
    if (loaded.length === 0) {
      setStatus("Catalog still loading — one moment.");
      return;
    }
    setStatus("Seeding an in-key phrase weave…");
    const spots = [0.08, 0.26, 0.44, 0.62, 0.8];
    const L = loopLenRef.current;
    for (let i = 0; i < spots.length; i++) {
      const id = loaded[i % loaded.length].id;
      const ph = selectPhrase(id);
      if (!ph) continue;
      placedRef.current.push({
        id: glyphIdRef.current++,
        phrase: ph,
        t01: spots[i],
        placedPass: -1,
        flash: 0.5,
      });
      // pre-decode so the loop can sound them
      void ensureBuffer(id).catch(() => {});
    }
    setPlacedTotal(placedRef.current.length);
    playingRef.current = true;
    setPlaying(true);
    // jump the playhead just before the first mark for a quick first sound
    playTimeRef.current = Math.max(0, spots[0] * L - 0.4);
    setStatus("Seeded — the playhead is sweeping the weave.");
  }, [phase, selectPhrase, ensureBuffer]);

  const clearAll = useCallback(() => {
    placedRef.current = [];
    setPlacedTotal(0);
    setStatus("Cleared the score.");
  }, []);

  const removeLast = useCallback(() => {
    placedRef.current.pop();
    setPlacedTotal(placedRef.current.length);
  }, []);

  // ── start: audio + corpus load ─────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase === "loading" || phase === "ready") return;
    setPhase("loading");
    setErrorMsg(null);
    setStatus("Waking the audio engine…");
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      safeRef.current = createSafeMaster(ctx);

      // equal-power fade curves
      const cn = 48;
      const fin = new Float32Array(cn);
      const fout = new Float32Array(cn);
      for (let i = 0; i < cn; i++) {
        const t = i / (cn - 1);
        fin[i] = Math.sin(0.5 * Math.PI * t);
        fout[i] = Math.cos(0.5 * Math.PI * t);
      }
      fadeInRef.current = fin;
      fadeOutRef.current = fout;

      setPhase("ready");
      setStatus("Loading the phrase corpus…");
      playTimeRef.current = 0;

      // decode the first track eagerly so the first keypress makes sound
      void ensureBuffer(REAL_TRACKS[0].id).catch(() => {});

      // load analyses for the whole catalog, building phrases as each arrives
      let done = 0;
      await Promise.all(
        REAL_TRACKS.map(async (t) => {
          try {
            const a = await loadTrackAnalysis(t.id);
            if (a && a.notes.length) {
              const ph = buildPhrases(t.id, a.notes);
              if (ph.length) {
                corpusRef.current.set(t.id, ph);
                if (!keyInitedRef.current) {
                  keyInitedRef.current = true;
                  const parsed = a.key_signature
                    ? parseKey(a.key_signature)
                    : estimateKey(ph.map((p) => p.chroma));
                  setKeyPc(parsed.pc);
                  setKeyMinor(parsed.minor);
                  keyRef.current = parsed;
                }
              } else {
                needsFallbackRef.current.add(t.id);
              }
            } else {
              needsFallbackRef.current.add(t.id);
            }
          } catch {
            needsFallbackRef.current.add(t.id);
          }
          done += 1;
          setTracksLoaded(done);
          let total = 0;
          corpusRef.current.forEach((v) => (total += v.length));
          setPhraseCount(total);
        }),
      );
      setStatus("Catalog ready. Press 1–8 to pick a recording, SPACE to weave.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not start audio.");
      setPhase("error");
    }
  }, [phase, ensureBuffer]);

  // ── keyboard: the primary compose surface ──────────────────────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key;
      if (k >= "1" && k <= "8") {
        e.preventDefault();
        const idx = bank * BANK_SIZE + (parseInt(k, 10) - 1);
        if (idx < REAL_TRACKS.length) setSelectedIdx(idx);
        return;
      }
      switch (k) {
        case " ":
          e.preventDefault();
          if (!e.repeat) dropPhrase();
          break;
        case "Enter":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "`":
          e.preventDefault();
          setBank((b) => (b === 0 ? 1 : 0));
          break;
        case "[":
        case "ArrowLeft":
          e.preventDefault();
          setKeyPc((p) => (p + 11) % 12);
          break;
        case "]":
        case "ArrowRight":
          e.preventDefault();
          setKeyPc((p) => (p + 1) % 12);
          break;
        case "-":
        case "_":
        case "ArrowDown":
          e.preventDefault();
          setConsonance((c) => Math.max(0, Math.round((c - 0.1) * 100) / 100));
          break;
        case "=":
        case "+":
        case "ArrowUp":
          e.preventDefault();
          setConsonance((c) => Math.min(1, Math.round((c + 0.1) * 100) / 100));
          break;
        case "m":
        case "M":
          e.preventDefault();
          setKeyMinor((m) => !m);
          break;
        case "Backspace":
          e.preventDefault();
          removeLast();
          break;
        case "\\":
          e.preventDefault();
          clearAll();
          break;
        case "d":
        case "D":
          e.preventDefault();
          void seedDemo();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, bank, dropPhrase, removeLast, clearAll, seedDemo]);

  // ── render loop: sweep the playhead, trigger crossings, draw ink ────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      setStatus("Canvas 2D unavailable in this browser.");
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      dimRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const analyser = safeRef.current?.analyser ?? null;
    const levelBuf = analyser ? new Uint8Array(analyser.fftSize) : null;

    const midiToY = (midi: number, h: number) => {
      const pad = h * 0.1;
      const t = (Math.max(MIDI_LO, Math.min(MIDI_HI, midi)) - MIDI_LO) / (MIDI_HI - MIDI_LO);
      return pad + (1 - t) * (h - 2 * pad);
    };

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const { w, h } = dimRef.current;
      const L = loopLenRef.current;
      let dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;
      if (dt > 0.05) dt = 0.05;

      // advance + trigger
      if (playingRef.current && dt > 0) {
        const prev = playTimeRef.current;
        const cur = prev + dt;
        playTimeRef.current = cur;
        const passPrev = Math.floor(prev / L);
        const passCur = Math.floor(cur / L);
        const pPrev = ((prev % L) + L) % L / L;
        const pCur = ((cur % L) + L) % L / L;
        const ctx = ctxRef.current;
        for (const gl of placedRef.current) {
          let hit = false;
          if (passCur === passPrev) {
            if (pPrev < gl.t01 && gl.t01 <= pCur) hit = true;
          } else if (gl.t01 > pPrev || gl.t01 <= pCur) {
            hit = true;
          }
          if (hit && gl.placedPass !== passCur) {
            gl.flash = 1;
            if (ctx && bufferRef.current.get(gl.phrase.trackId)) {
              playPhrase(gl.phrase, ctx.currentTime);
            } else {
              void ensureBuffer(gl.phrase.trackId).catch(() => {});
            }
          }
        }
      }

      // audio level (drives the playhead's ink weight)
      let level = 0;
      if (analyser && levelBuf) {
        analyser.getByteTimeDomainData(levelBuf as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < levelBuf.length; i++) {
          const v = (levelBuf[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.sqrt(sum / levelBuf.length);
      }
      levelRef.current += (level - levelRef.current) * 0.2;

      // ── paper ground ──
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, PAPER);
      grad.addColorStop(1, PAPER_EDGE);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);

      // faint register staff lines (octave Cs) + time ticks
      g.strokeStyle = INK_FAINT;
      g.lineWidth = 1;
      for (let midi = 48; midi <= 84; midi += 12) {
        const y = midiToY(midi, h);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.strokeStyle = INK_FAINT;
      for (let i = 1; i < 8; i++) {
        const x = (i / 8) * w;
        g.beginPath();
        g.moveTo(x, h * 0.06);
        g.lineTo(x, h * 0.94);
        g.stroke();
      }

      // ── ink glyphs ──
      const pxPerSec = w / L;
      g.lineJoin = "round";
      g.lineCap = "round";
      for (const gl of placedRef.current) {
        const ph = gl.phrase;
        const x0 = gl.t01 * w;
        const glyphW = Math.max(12, (ph.endTime - ph.startTime) * pxPerSec);
        const pts: [number, number][] = ph.contour.map((c, i) => {
          const jx = reduced ? 0 : jitter(gl.id * 7.1 + i * 1.7);
          const jy = reduced ? 0 : jitter(gl.id * 3.3 + i * 2.9);
          return [x0 + c.p * glyphW + jx * 1.4, midiToY(c.midi, h) + jy * 1.6];
        });
        const flash = gl.flash;
        const weight = (0.9 + ph.energy * 3.2) * (1 + flash * 1.8);
        if (ph.unpitched) {
          g.strokeStyle = flash > 0.02 ? ACCENT : "rgba(90, 70, 52, 0.55)";
          g.setLineDash([5, 4]);
        } else {
          g.strokeStyle =
            flash > 0.02
              ? `rgba(156, 74, 44, ${Math.min(1, 0.5 + flash * 0.5)})`
              : INK;
          g.setLineDash([]);
        }
        g.lineWidth = weight;
        g.beginPath();
        if (pts.length >= 2) {
          g.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2;
            const my = (pts[i][1] + pts[i + 1][1]) / 2;
            g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
          }
          const last = pts[pts.length - 1];
          g.lineTo(last[0], last[1]);
        }
        g.stroke();
        g.setLineDash([]);
        // ink head — a struck dot at the phrase's onset
        g.fillStyle = flash > 0.02 ? ACCENT : INK;
        g.beginPath();
        g.arc(pts[0][0], pts[0][1], 1.6 + ph.energy * 2.4 + flash * 2, 0, Math.PI * 2);
        g.fill();
        // decay the flash
        if (gl.flash > 0) gl.flash = Math.max(0, gl.flash - dt * 2.2);
      }

      // ── playhead (the one accent) ──
      const px = (((playTimeRef.current % L) + L) % L / L) * w;
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.4 + levelRef.current * 6;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(px, h * 0.04);
      g.lineTo(px, h * 0.96);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = ACCENT;
      g.beginPath();
      g.moveTo(px - 6, h * 0.04);
      g.lineTo(px + 6, h * 0.04);
      g.lineTo(px, h * 0.04 + 9);
      g.closePath();
      g.fill();
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase, playPhrase, ensureBuffer]);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      safeRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const label = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";

  const bankTracks = REAL_TRACKS.slice(bank * BANK_SIZE, bank * BANK_SIZE + BANK_SIZE);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PrototypeNav slugs={["14240-inkscore"]} />

      <div className="mx-auto max-w-5xl px-5 py-10 pb-24">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <p className={label}>14240 · concatenative graphic score</p>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Read the design notes
            </button>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ink Score — compose from your whole catalog
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            Play the computer keyboard like a composer. Number keys pick a
            recording; <span className="text-foreground">SPACE</span> weaves its
            next in-key phrase — a real slice of Karel&apos;s take — onto a
            left-to-right ink score. A harmony engine keeps the woven result in key,
            so it reads as music, not collage. In the lineage of Cardew&apos;s{" "}
            <span className="italic">Treatise</span> and Xenakis&apos;s UPIC.
          </p>
        </header>

        {/* stage */}
        <div className="relative mb-5 overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="block h-[52vh] min-h-[320px] w-full"
            aria-label="Ink-on-paper graphic score — placed phrases as ink glyphs with a sweeping playhead"
          />
          {phase !== "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 p-6 text-center backdrop-blur-sm">
              {phase === "error" ? (
                <p className="max-w-md text-base text-destructive">{errorMsg}</p>
              ) : (
                <p className="max-w-md text-base text-muted-foreground">
                  Press Play to wake the audio engine and load the phrase corpus from
                  Karel&apos;s catalog, then compose with the keyboard.
                </p>
              )}
              <button type="button" onClick={start} disabled={phase === "loading"} className={btnPrimary}>
                {phase === "loading" ? "Loading…" : phase === "error" ? "Try again" : "Play"}
              </button>
            </div>
          )}
        </div>

        {/* status + transport */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className={label}>{status}</span>
          {phase === "ready" && (
            <span className={label}>
              · corpus {tracksLoaded}/{REAL_TRACKS.length} tracks · {phraseCount} phrases ·{" "}
              {placedTotal} placed
            </span>
          )}
          {phase === "ready" && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => setPlaying((p) => !p)} className={btnGhost}>
                {playing ? "Pause (Enter)" : "Play (Enter)"}
              </button>
              <button type="button" onClick={() => void seedDemo()} className={btnGhost}>
                Seed a phrase (D)
              </button>
              <button type="button" onClick={removeLast} className={btnGhost}>
                Undo (Backspace)
              </button>
              <button type="button" onClick={clearAll} className={btnGhost}>
                Clear (\)
              </button>
            </div>
          )}
        </div>

        {phase === "ready" && (
          <>
            {/* track bank */}
            <section className="mb-6">
              <div className="mb-2 flex items-center gap-3">
                <p className={label}>
                  Recording — keys 1–8 (bank {bank === 0 ? "A" : "B"})
                </p>
                <button
                  type="button"
                  onClick={() => setBank((b) => (b === 0 ? 1 : 0))}
                  className="rounded-md border border-border bg-background/60 px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  swap bank (`)
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {bankTracks.map((t, i) => {
                  const idx = bank * BANK_SIZE + i;
                  const active = idx === selectedIdx;
                  const loaded = (corpusRef.current.get(t.id)?.length ?? 0) > 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={
                        active
                          ? "min-h-[44px] rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                          : "min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      }
                    >
                      <span className="font-mono text-xs opacity-70">{i + 1}</span>{" "}
                      {t.title}
                      {!loaded && <span className="ml-1 opacity-50">·…</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* harmony controls */}
            <section className="mb-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="consonance" className={label}>
                  Consonance · {Math.round(consonance * 100)}% (↑/↓ or −/=)
                </label>
                <input
                  id="consonance"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={consonance}
                  onChange={(e) => setConsonance(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  0 — raw collage: any phrase, no detune. 1 — every phrase selected
                  and pitch-snapped to the running key. Acts live on the loop.
                </p>
              </div>
              <div>
                <p className={label}>
                  Running key · {keyName(keyPc, keyMinor)} ([ / ] · M for minor)
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setKeyPc((p) => (p + 11) % 12)} className={btnGhost}>
                    ♭ key
                  </button>
                  <button type="button" onClick={() => setKeyPc((p) => (p + 1) % 12)} className={btnGhost}>
                    ♯ key
                  </button>
                  <button type="button" onClick={() => setKeyMinor((m) => !m)} className={btnGhost}>
                    {keyMinor ? "→ major" : "→ minor"}
                  </button>
                </div>
                <div className="mt-3">
                  <label htmlFor="loop" className={label}>
                    Scroll · one loop = {loopLen}s
                  </label>
                  <input
                    id="loop"
                    type="range"
                    min={8}
                    max={32}
                    step={1}
                    value={loopLen}
                    onChange={(e) => setLoopLen(parseInt(e.target.value, 10))}
                    className="mt-2 w-full accent-primary"
                  />
                </div>
              </div>
            </section>

            {/* keybinding legend */}
            <section className="mb-6">
              <p className={`${label} mb-2`}>Keys</p>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {[
                  ["1–8", "pick recording"],
                  ["`", "swap bank"],
                  ["SPACE", "weave next phrase"],
                  ["Enter", "play / pause"],
                  ["[ ]  ← →", "key ♭ / ♯"],
                  ["↑ ↓  − =", "consonance"],
                  ["M", "major / minor"],
                  ["D", "seed a weave"],
                  ["Backspace", "undo"],
                  ["\\", "clear"],
                ].map(([key, what]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5"
                  >
                    <kbd className="font-mono text-xs text-foreground">{key}</kbd>
                    <span className="text-xs">{what}</span>
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="mt-8 space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
          <p className={label}>How it works</p>
          <p>
            Every one of Karel&apos;s recordings is split into phrases at its
            silences — contiguous note-runs, each carrying its own chroma, register,
            energy and melodic contour. That is the sound bank: nothing is
            synthesised. When you weave a phrase, the harmony engine correlates each
            candidate&apos;s chroma against a Krumhansl key profile for the running
            key and picks the best fit, then applies a small playback-rate detune
            (≤ ±4 semitones) that snaps its mean pitch onto the nearest diatonic
            degree. The consonance slider crossfades between raw collage and a fully
            in-key weave — and because the detune is applied live at each loop pass,
            re-keying the piece reshapes every mark you already placed. The tradeoff:
            playback-rate detune also shifts a phrase&apos;s tempo and timbre, so the
            snaps are kept small on purpose.
          </p>
          <p className="text-muted-foreground/70">
            Refs: Cornelius Cardew, <span className="italic">Treatise</span> (1967);
            Iannis Xenakis, UPIC (1977); &ldquo;The Concatenator: A Bayesian Approach
            to Real-Time Concatenative Musaicing&rdquo; (arXiv:2411.04366).
          </p>
        </section>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Ink Score — design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Ink Score asks whether you can compose a genuinely new, coherent piece
                by weaving phrases sampled from your whole recorded catalog onto a
                paper-white graphic score — with a harmony engine keeping the result in
                key so it&apos;s music, not collage. It is the horizontal, sequential
                cousin of a piano-roll: a scrolling time-score in the lineage of
                Cornelius Cardew&apos;s <span className="italic">Treatise</span> (1967)
                and Iannis Xenakis&apos;s UPIC (1977).
              </p>
              <p>
                The corpus is real: each of Karel&apos;s takes is cut into phrases at
                its silences, and every mark you place plays back as one
                AudioBufferSourceNode reading that take&apos;s decoded buffer — no
                oscillators, no generated tone. The framing follows &ldquo;The
                Concatenator&rdquo; (arXiv:2411.04366): the recordings themselves are
                the sound bank being re-assembled.
              </p>
              <p>
                Harmony is the third subsystem. A running key drives a Krumhansl-style
                key-profile correlation that selects the best-fitting phrase, and a
                small playback-rate detune snaps its mean pitch onto the key&apos;s
                nearest diatonic degree. The consonance slider moves from raw collage
                (0) to fully in-key (1); the detune is applied live, so changing the
                key re-voices the whole loop.
              </p>
              <p className="text-muted-foreground/70">
                What&apos;s rough: triggering is frame-quantised rather than sample-
                scheduled, so timing has a few milliseconds of jitter; large detunes
                audibly change tempo/timbre (kept ≤ ±4 semitones on purpose); tracks
                with no note analysis fall back to flat, unpitched time-slices drawn as
                dashed marks. Everything routes through the shared ear-safety master.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
