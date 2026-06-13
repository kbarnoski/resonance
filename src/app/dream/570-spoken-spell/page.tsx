"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognition,
  type SpeechRecognitionEvent,
  type SpeechRecognitionType,
} from "@/lib/browser/speech-recognition";
import {
  tokeniseToPhrases,
  buildPhraseScore,
  type WordNote,
} from "./text-music";
import {
  buildAudioEngine,
  destroyAudioEngine,
  enqueueLiveNotes,
  addLoopVoice,
  type AudioEngine,
  type ScheduledNote,
} from "./audio";

// ─── Auto-demo seed poem ──────────────────────────────────────────────────────
const DEMO_POEM = [
  "the word becomes light",
  "sound is the first spell",
  "each syllable a stone",
  "the river carries them all",
  "speak and the air remembers",
];

// ─── Displayed word state ─────────────────────────────────────────────────────
interface DisplayWord {
  id: number;
  word: string;
  x: number;         // SVG viewport x (0–1000)
  y: number;         // SVG viewport y
  scale: number;     // CSS transform scale
  opacity: number;
  lit: boolean;      // currently sounding
  isLoop: boolean;   // part of an ostinato loop
  hue: number;       // violet-ish accent hue (260–310)
  fontSize: number;
}

let wordIdCounter = 0;
function nextWordId() { return ++wordIdCounter; }

// ─── Stable hash ─────────────────────────────────────────────────────────────
function quickHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

// ─── Position logic: words flow left to right, wrapping down ─────────────────
// We keep a simple cursor state as a ref.
interface CursorState {
  x: number;
  y: number;
  rowH: number;
}

function placeWord(
  word: string,
  cursor: CursorState,
  vw: number,
  fontSize: number
): { x: number; y: number } {
  // Approx character width in SVG units (font is bold, ~0.6×fontSize)
  const charW = fontSize * 0.62;
  const wordW = word.length * charW + 24; // +padding
  if (cursor.x + wordW > vw - 30 && cursor.x > 40) {
    cursor.x = 40;
    cursor.y += cursor.rowH + 12;
    cursor.rowH = fontSize;
  }
  const pos = { x: cursor.x, y: cursor.y };
  cursor.x += wordW;
  cursor.rowH = Math.max(cursor.rowH, fontSize);
  return pos;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SpokenSpellPage() {
  const [started, setStarted] = useState(false);
  const [srAvail, setSrAvail] = useState<boolean | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [listening, setListening] = useState(false);
  const [displayWords, setDisplayWords] = useState<DisplayWord[]>([]);
  const [loopCount, setLoopCount] = useState(0);
  const [typedInput, setTypedInput] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  // Refs for mutable engine state
  const engineRef = useRef<AudioEngine | null>(null);
  const startedRef = useRef(false);
  const srRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const cursorRef = useRef<CursorState>({ x: 40, y: 60, rowH: 36 });
  const displayWordsRef = useRef<DisplayWord[]>([]);
  const litTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const currentPhraseWordsRef = useRef<WordNote[]>([]);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const phraseGapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDemoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDemoIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDemoActiveRef = useRef(false);
  const lastInputTimeRef = useRef<number>(0);
  const resumeAutoDemoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(1000);
  const [svgHeight, setSvgHeight] = useState(600);

  // ── Detect SVG size ────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const el = svgRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setSvgWidth(rect.width || 1000);
        setSvgHeight(rect.height || 600);
        // reset cursor on resize
        cursorRef.current = { x: 40, y: 60, rowH: 36 };
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Check speech recognition availability ──────────────────────────────────
  useEffect(() => {
    setSrAvail(!!getSpeechRecognition());
  }, []);

  // ── Sync displayWords ref ──────────────────────────────────────────────────
  useEffect(() => {
    displayWordsRef.current = displayWords;
  }, [displayWords]);

  // ── Light a word at the right time ────────────────────────────────────────
  const lightWord = useCallback((id: number, durationMs: number) => {
    setDisplayWords(prev =>
      prev.map(w => w.id === id ? { ...w, lit: true, scale: 1.18 } : w)
    );
    const t = setTimeout(() => {
      setDisplayWords(prev =>
        prev.map(w => w.id === id ? { ...w, lit: false, scale: 1.0 } : w)
      );
      litTimeoutsRef.current.delete(id);
    }, durationMs);
    litTimeoutsRef.current.set(id, t);
  }, []);

  // ── Freeze current phrase as loop ──────────────────────────────────────────
  const freezePhraseAsLoop = useCallback(() => {
    const engine = engineRef.current;
    const phrase = currentPhraseWordsRef.current;
    if (!engine || phrase.length < 2) {
      currentPhraseWordsRef.current = [];
      return;
    }
    const loopNotes: ScheduledNote[] = phrase.map(wn => ({
      pitchMidi: wn.pitchMidi,
      durationBeats: wn.durationBeats,
      accent: wn.accent,
      timbre: wn.timbre,
      startTime: 0,
    }));
    addLoopVoice(engine, loopNotes);
    currentPhraseWordsRef.current = [];
    setLoopCount(prev => Math.min(prev + 1, 4));

    // Mark those words as loop members
    setDisplayWords(prev =>
      prev.map(w => !w.isLoop && w.opacity > 0.3 ? { ...w, isLoop: true, opacity: 0.55 } : w)
    );
  }, []);

  // ── Process a batch of words (from speech or typed or demo) ───────────────
  const processWords = useCallback((words: string[], isDemo: boolean) => {
    const engine = engineRef.current;
    if (!engine || words.length === 0) return;

    const phrases = tokeniseToPhrases(words.join(" "));
    for (const phraseWords of phrases) {
      if (phraseWords.length === 0) continue;
      const score = buildPhraseScore(phraseWords);
      const liveNotes: ScheduledNote[] = score.notes.map(wn => ({
        pitchMidi: wn.pitchMidi,
        durationBeats: wn.durationBeats,
        accent: wn.accent,
        timbre: wn.timbre,
        startTime: 0,
      }));
      enqueueLiveNotes(engine, liveNotes);

      // Accumulate for loop accretion
      for (const wn of score.notes) {
        currentPhraseWordsRef.current.push(wn);
      }

      // Add words to SVG display
      setDisplayWords(prev => {
        const newWords: DisplayWord[] = [...prev];
        // Trim to last 60 words max
        const trimmed = newWords.length > 60 ? newWords.slice(-60) : newWords;

        for (const wn of score.notes) {
          const id = nextWordId();
          const fontSize = 26 + (quickHash(wn.word) % 14); // 26–39px
          const hue = 265 + (quickHash(wn.word) % 40);     // violet range
          const pos = placeWord(wn.word, cursorRef.current, svgWidth, fontSize);

          // Wrap cursor if near bottom
          if (cursorRef.current.y > svgHeight - 80) {
            cursorRef.current = { x: 40, y: 60, rowH: 36 };
          }

          trimmed.push({
            id,
            word: wn.word,
            x: pos.x,
            y: pos.y,
            scale: 1.0,
            opacity: isDemo ? 0.75 : 0.88,
            lit: false,
            isLoop: false,
            hue,
            fontSize,
          });
        }
        return trimmed;
      });
    }

    // Schedule visual lighting: use engine's note play callback
    engine.onNotePlay = (note: ScheduledNote) => {
      const delay = Math.max(0, (note.startTime - engine.ctx.currentTime) * 1000);
      const durationMs = note.durationBeats * (60 / 100) * 1000;

      // Find first unlit, non-loop word
      const target = displayWordsRef.current.find(w => !w.lit && !w.isLoop);
      if (target) {
        const id = target.id;
        setTimeout(() => lightWord(id, durationMs), delay);
      }
    };
  }, [lightWord, svgWidth, svgHeight]);

  // ── Phrase gap detection ───────────────────────────────────────────────────
  const resetPhraseGapTimer = useCallback(() => {
    if (phraseGapTimerRef.current) clearTimeout(phraseGapTimerRef.current);
    phraseGapTimerRef.current = setTimeout(() => {
      freezePhraseAsLoop();
    }, 1200);
  }, [freezePhraseAsLoop]);

  // ── Auto-demo ─────────────────────────────────────────────────────────────
  const stopAutoDemo = useCallback(() => {
    autoDemoActiveRef.current = false;
    if (autoDemoTimerRef.current) { clearTimeout(autoDemoTimerRef.current); autoDemoTimerRef.current = null; }
    if (autoDemoIntervalRef.current) { clearTimeout(autoDemoIntervalRef.current); autoDemoIntervalRef.current = null; }
    if (resumeAutoDemoTimerRef.current) { clearTimeout(resumeAutoDemoTimerRef.current); resumeAutoDemoTimerRef.current = null; }
  }, []);

  const startAutoDemo = useCallback(() => {
    if (autoDemoActiveRef.current) return;
    autoDemoActiveRef.current = true;
    let lineIdx = 0;

    const playNextLine = () => {
      if (!autoDemoActiveRef.current) return;
      if (lineIdx >= DEMO_POEM.length) lineIdx = 0;
      const line = DEMO_POEM[lineIdx++];
      const words = line.split(/\s+/).filter(Boolean);
      processWords(words, true);
      resetPhraseGapTimer();

      // Schedule next line after ~3s
      autoDemoIntervalRef.current = setTimeout(playNextLine, 3000);
    };

    playNextLine();
  }, [processWords, resetPhraseGapTimer]);

  const scheduleAutoDemoResume = useCallback(() => {
    if (resumeAutoDemoTimerRef.current) clearTimeout(resumeAutoDemoTimerRef.current);
    resumeAutoDemoTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastInputTimeRef.current >= 4800) {
        startAutoDemo();
      }
    }, 5000);
  }, [startAutoDemo]);

  // ── Start speech recognition ───────────────────────────────────────────────
  const startSpeech = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    try {
      const sr = new SR();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = "en-US";

      let lastFinalLen = 0;
      sr.onresult = (ev: SpeechRecognitionEvent) => {
        lastInputTimeRef.current = Date.now();
        stopAutoDemo();

        let newFinalText = "";
        for (let i = lastFinalLen; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) {
            newFinalText += ev.results[i][0].transcript + " ";
            lastFinalLen = i + 1;
          }
        }

        if (newFinalText.trim()) {
          const words = newFinalText.trim().split(/\s+/).filter(Boolean);
          processWords(words, false);
          resetPhraseGapTimer();
          scheduleAutoDemoResume();
          lastSpeechTimeRef.current = Date.now();
        }
      };

      sr.onerror = () => {
        setMicDenied(true);
        setListening(false);
        scheduleAutoDemoResume();
      };

      sr.onend = () => {
        // Auto-restart unless we've stopped intentionally
        if (srRef.current === sr && startedRef.current) {
          try { sr.start(); } catch { /* ignore */ }
        }
      };

      sr.start();
      srRef.current = sr;
      setListening(true);
    } catch {
      setMicDenied(true);
    }
  }, [processWords, resetPhraseGapTimer, scheduleAutoDemoResume, stopAutoDemo]);

  // ── Handle typed input ─────────────────────────────────────────────────────
  const handleTypedSubmit = useCallback(() => {
    const text = typedInput.trim();
    if (!text) return;
    lastInputTimeRef.current = Date.now();
    stopAutoDemo();
    const words = text.split(/\s+/).filter(Boolean);
    processWords(words, false);
    resetPhraseGapTimer();
    scheduleAutoDemoResume();
    setTypedInput("");
  }, [typedInput, processWords, resetPhraseGapTimer, scheduleAutoDemoResume, stopAutoDemo]);

  // ── Main start handler ─────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (started) return;
    setStarted(true);
    startedRef.current = true;

    // Build audio engine inside user gesture
    const engine = buildAudioEngine();
    engineRef.current = engine;

    // Reset cursor
    cursorRef.current = { x: 40, y: 60, rowH: 36 };

    // Start speech if available
    if (getSpeechRecognition()) {
      startSpeech();
    }

    // Schedule auto-demo if no input within 3s
    autoDemoTimerRef.current = setTimeout(() => {
      if (Date.now() - lastInputTimeRef.current < 2800) return;
      startAutoDemo();
    }, 3000);
  }, [started, startSpeech, startAutoDemo]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAutoDemo();
      if (phraseGapTimerRef.current) clearTimeout(phraseGapTimerRef.current);
      if (srRef.current) { try { srRef.current.stop(); } catch { /* ok */ } srRef.current = null; }
      if (engineRef.current) { destroyAudioEngine(engineRef.current); engineRef.current = null; }
      litTimeoutsRef.current.forEach(t => clearTimeout(t));
      litTimeoutsRef.current.clear();
    };
  }, [stopAutoDemo]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#0a090f] flex flex-col text-white select-none overflow-hidden">

      {/* ── Header ── */}
      <header className="relative z-10 flex items-start justify-between px-6 pt-6 pb-2 shrink-0">
        <div>
          <h1 className="text-3xl font-serif font-light tracking-wide text-white/95">
            Spoken Spell
          </h1>
          <p className="mt-1 text-base text-white/75 max-w-lg leading-snug">
            Speak — your words become a self-layering musical incantation.
            Each phrase freezes as a looping ostinato; new words bloom above.
          </p>
        </div>

        {/* Status badges */}
        <div className="flex flex-col items-end gap-1.5 text-sm shrink-0 ml-4">
          {started && (
            <>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                listening
                  ? "bg-violet-500/20 text-violet-300"
                  : "bg-white/10 text-white/55"
              }`}>
                {listening ? "● listening" : "○ awaiting"}
              </span>
              {loopCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-white/55">
                  {loopCount} loop{loopCount !== 1 ? "s" : ""} accreted
                </span>
              )}
            </>
          )}
        </div>
      </header>

      {/* ── Speech unavailable notice ── */}
      {srAvail === false && (
        <div className="px-6 py-2 shrink-0">
          <p className="text-rose-300 text-sm">
            Live speech needs Chrome or Edge — type below to cast the spell.
          </p>
        </div>
      )}
      {micDenied && (
        <div className="px-6 py-1 shrink-0">
          <p className="text-rose-300 text-sm">
            Mic permission denied — use the text input below.
          </p>
        </div>
      )}

      {/* ── SVG word river ── */}
      <div className="relative flex-1 min-h-[300px] mx-4 my-2 rounded-xl overflow-hidden border border-white/5 bg-[#07060d]">
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMinYMin meet"
          aria-label="Word river visualization"
        >
          {/* Ambient violet glow at top */}
          <defs>
            <radialGradient id="ambientGlow" cx="50%" cy="0%" r="60%">
              <stop offset="0%" stopColor="rgba(139,92,246,0.12)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <filter id="wordGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="loopGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={svgWidth} height={svgHeight} fill="url(#ambientGlow)" />

          {/* Words */}
          {displayWords.map(dw => {
            const baseColor = dw.lit
              ? `hsl(${dw.hue}, 90%, 88%)`
              : dw.isLoop
              ? `hsl(${dw.hue}, 55%, 62%)`
              : `hsl(${dw.hue}, 60%, 72%)`;

            return (
              <text
                key={dw.id}
                x={dw.x}
                y={dw.y + dw.fontSize}
                fontSize={dw.fontSize}
                fontWeight={dw.lit ? "700" : "400"}
                fontFamily="'Georgia', 'Times New Roman', serif"
                fill={baseColor}
                opacity={dw.opacity}
                filter={dw.lit ? "url(#wordGlow)" : dw.isLoop ? "url(#loopGlow)" : undefined}
                style={{
                  transform: dw.scale !== 1
                    ? `scale(${dw.scale})`
                    : undefined,
                  transformOrigin: `${dw.x + (dw.word.length * dw.fontSize * 0.31)}px ${dw.y + dw.fontSize * 0.5}px`,
                  transition: "transform 0.08s ease-out, opacity 0.4s ease",
                  letterSpacing: "0.02em",
                }}
              >
                {dw.word}
              </text>
            );
          })}

          {/* Placeholder when idle */}
          {!started && (
            <text
              x={svgWidth / 2}
              y={svgHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="22"
              fontFamily="'Georgia', 'Times New Roman', serif"
              fill="rgba(139,92,246,0.35)"
              letterSpacing="0.08em"
            >
              the spell awaits your voice
            </text>
          )}
        </svg>
      </div>

      {/* ── Controls ── */}
      <div className="px-6 pb-4 pt-2 shrink-0 flex flex-col gap-3">

        {/* Start button */}
        {!started && (
          <button
            onClick={handleStart}
            className="self-start min-h-[44px] px-6 py-2.5 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-medium hover:bg-violet-500/30 hover:border-violet-400/60 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400/50"
          >
            Start — speak to it
          </button>
        )}

        {/* Typed fallback (visible once started) */}
        {started && (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={typedInput}
              onChange={e => setTypedInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleTypedSubmit(); }}
              placeholder={
                srAvail && !micDenied
                  ? "Or type here and press Enter…"
                  : "Type a word or sentence and press Enter…"
              }
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/95 text-base placeholder:text-white/30 focus:outline-none focus:border-violet-400/50 focus:bg-white/8 transition-colors"
            />
            <button
              onClick={handleTypedSubmit}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-base hover:bg-violet-500/25 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400/50"
            >
              Cast
            </button>
          </div>
        )}

        {/* Design notes toggle */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowNotes(n => !n)}
            className="text-sm text-white/55 hover:text-white/75 transition-colors underline underline-offset-2"
          >
            {showNotes ? "hide design notes" : "design notes"}
          </button>
          {started && loopCount === 0 && (
            <span className="text-sm text-white/55 italic">
              {listening ? "speak now — words will appear above" : "type above to begin"}
            </span>
          )}
        </div>

        {/* Design notes panel */}
        {showNotes && (
          <div className="mt-1 p-4 rounded-lg bg-white/4 border border-white/8 text-sm text-white/75 max-w-2xl space-y-2">
            <p className="font-medium text-white/90 text-base">Spoken Spell — Design Notes</p>
            <p>
              Each spoken word is hashed deterministically to a pitch in D pentatonic
              (D E F# A B across two octaves). Word length and vowel density map to duration;
              consonant-heavy words get a pluck timbre, vowel-rich words a sustained triangle tone.
            </p>
            <p>
              Phrases accrete: after a ~1.2s pause or sentence punctuation, the phrase freezes
              as a quiet looping ostinato (up to 4 simultaneous). New live words play brighter on top.
              A look-ahead Web Audio scheduler ensures sample-accurate timing.
            </p>
            <p>
              Inspired by Steve Reich&rsquo;s <em>Different Trains</em> (speech-melody),
              Alvin Lucier&rsquo;s <em>I Am Sitting in a Room</em> (language&rarr;resonance),
              and the 2026 in-browser ASR wave (Whisper/LiteASR via ONNX/WASM — the offline upgrade path).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
