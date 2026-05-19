"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── types ──────────────────────────────────────────────────────────────────────
type WaveKind = "sin" | "tri" | "saw" | "sq";

interface Voice {
  note: string;
  freq: number;
  wave: WaveKind;
  amp: number;
  hue: number; // 0–260: violet (bass) → red (treble)
}

interface OscPair {
  osc: OscillatorNode;
  gain: GainNode;
}

// ── note → frequency ───────────────────────────────────────────────────────────
// Semitone class per uppercase pitch letter (± accidental).
// Keys include both sharp (C#) and flat (DB, EB, GB, AB, BB) spellings.
const PC_MAP: Record<string, number> = {
  C: 0,  "C#": 1, DB: 1,
  D: 2,  "D#": 3, EB: 3,
  E: 4,
  F: 5,  "F#": 6, GB: 6,
  G: 7,  "G#": 8, AB: 8,
  A: 9,  "A#": 10, BB: 10,
  B: 11,
};

function noteFreq(note: string): number {
  const m = note.match(/^([A-Ga-g][#bB]?)(\d+)$/);
  if (!m) return 0;
  const pc = PC_MAP[m[1].toUpperCase()];
  if (pc === undefined) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + pc; // C4 = MIDI 60
  return 440 * Math.pow(2, (midi - 69) / 12);       // A4 = 440 Hz
}

// ── frequency → hue (violet=260 at bass → red=0 at treble) ────────────────────
function freqHue(f: number): number {
  const lo = Math.log2(55);
  const hi = Math.log2(16000);
  const t = (Math.log2(Math.max(55, Math.min(16000, f))) - lo) / (hi - lo);
  return Math.round(260 * (1 - t));
}

// ── code parser ─────────────────────────────────────────────────────────────────
// Each non-comment, non-empty line: NOTE WAVE AMP
// NOTE: pitch name like C4, D#3, Bb5
// WAVE: sin | tri | saw | sq   (defaults to sin)
// AMP:  0.0–1.0               (defaults to 0.6)
const WAVE_SET = new Set<string>(["sin", "tri", "saw", "sq"]);

function parseVoices(code: string): Voice[] {
  return code
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    .flatMap((l): Voice[] => {
      const [noteStr = "", waveStr = "sin", ampStr = "0.6"] = l.split(/\s+/);
      const freq = noteFreq(noteStr);
      if (!freq) return [];
      const wave = (WAVE_SET.has(waveStr) ? waveStr : "sin") as WaveKind;
      const amp = Math.min(1, Math.max(0, parseFloat(ampStr) || 0.6));
      return [{ note: noteStr, freq, wave, amp, hue: freqHue(freq) }];
    });
}

// ── oscillator type lookup ─────────────────────────────────────────────────────
const OSC_TYPES: Record<WaveKind, OscillatorType> = {
  sin: "sine",
  tri: "triangle",
  saw: "sawtooth",
  sq:  "square",
};

// ── circular constellation layout ─────────────────────────────────────────────
// Voices arranged in a circle; single voice sits at center.
// Radius adapts to N so large chords don't crowd the canvas edge.
function ringPos(idx: number, total: number, W: number, H: number): [number, number] {
  if (total <= 1) return [W / 2, H / 2];
  const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
  const r = Math.min(W, H) * (total <= 3 ? 0.24 : total <= 6 ? 0.28 : 0.32);
  return [W / 2 + Math.cos(angle) * r, H / 2 + Math.sin(angle) * r];
}

// ── default score ─────────────────────────────────────────────────────────────
const DEFAULT_CODE = [
  "// code-vis  —  write notes, hear them, see them",
  "// syntax:  NOTE  WAVE  AMP      (amp 0.0–1.0)",
  "// waves:   sin  tri  saw  sq",
  "",
  "C4  tri  0.8",
  "E4  sin  0.6",
  "G4  tri  0.5",
].join("\n");

// ── component ─────────────────────────────────────────────────────────────────
export default function CodeVisPage() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const audioRef    = useRef<AudioContext | null>(null);
  const masterRef   = useRef<GainNode | null>(null);
  const oscsRef     = useRef<OscPair[]>([]);
  const voicesRef   = useRef<Voice[]>([]);
  const bpmRef      = useRef<number>(80);
  const startTRef   = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [code, setCode]       = useState(DEFAULT_CODE);
  const [bpm, setBpm]         = useState(80);
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices]   = useState<Voice[]>(() => parseVoices(DEFAULT_CODE));
  const [status, setStatus]   = useState("press ▶ Start to hear the code");

  // keep refs in sync with state
  useEffect(() => { bpmRef.current  = bpm;    }, [bpm]);
  useEffect(() => { voicesRef.current = voices; }, [voices]);

  // ── apply voices to Web Audio ──────────────────────────────────────────────
  const applyVoices = useCallback((vs: Voice[]) => {
    const ctx    = audioRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    const now = ctx.currentTime;

    // Fade out and stop current oscillators
    oscsRef.current.forEach(({ osc, gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.stop(now + 0.2);
    });
    oscsRef.current = [];

    if (!vs.length) return;

    // Normalise master level for N simultaneous voices
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(
      0.55 / Math.max(1, Math.sqrt(vs.length)),
      now, 0.05
    );

    // Start new oscillators with fade-in
    oscsRef.current = vs.map((v) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = OSC_TYPES[v.wave];
      osc.frequency.value = v.freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(v.amp, now + 0.15);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      return { osc, gain };
    });
  }, []); // stable — uses only refs

  // ── debounced parse ────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const parsed = parseVoices(code);
      setVoices(parsed);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [code]);

  // ── apply when voices change while playing ─────────────────────────────────
  useEffect(() => {
    if (playing) applyVoices(voices);
  }, [voices, playing, applyVoices]);

  // ── canvas resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width  = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // ── animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    startTRef.current = Date.now();
    let rafId = 0;

    function tick() {
      const canvas = canvasRef.current;
      if (!canvas) { rafId = requestAnimationFrame(tick); return; }
      const g2d = canvas.getContext("2d");
      if (!g2d) { rafId = requestAnimationFrame(tick); return; }

      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) { rafId = requestAnimationFrame(tick); return; }

      const elapsed  = (Date.now() - startTRef.current) / 1000;
      const beatPer  = 60 / bpmRef.current;
      const beatFrac = (elapsed % beatPer) / beatPer; // 0..1 per beat
      // Smooth heartbeat: sin² (soft peak, natural decay)
      const pulse    = Math.pow(Math.sin(beatFrac * Math.PI), 2);

      const vs = voicesRef.current;

      // Dark background with light trail
      g2d.fillStyle = "rgba(8, 8, 18, 0.22)";
      g2d.fillRect(0, 0, W, H);

      if (!vs.length) {
        g2d.fillStyle = "rgba(110, 90, 170, 0.45)";
        g2d.font      = `${Math.max(11, Math.round(H * 0.032))}px monospace`;
        g2d.textAlign = "center";
        g2d.fillText("no valid notes — try: C4 tri 0.7", W / 2, H / 2);
        rafId = requestAnimationFrame(tick);
        return;
      }

      const N    = vs.length;
      const maxR = Math.min(W, H) * 0.11;

      vs.forEach((v, i) => {
        const [cx, cy] = ringPos(i, N, W, H);
        const baseR = maxR * (0.5 + v.amp * 0.5);
        const r     = Math.max(5, baseR * (0.88 + pulse * 0.12));
        const { hue } = v;

        // Glowing ring
        g2d.save();
        g2d.shadowColor = `hsl(${hue}, 100%, 65%)`;
        g2d.shadowBlur  = r * 1.8;
        g2d.beginPath();
        g2d.arc(cx, cy, r, 0, 2 * Math.PI);
        g2d.strokeStyle = `hsl(${hue}, 90%, ${55 + Math.round(pulse * 22)}%)`;
        g2d.lineWidth   = 1.5 + pulse * 2;
        g2d.stroke();

        // Soft radial fill (no shadow on fill)
        g2d.shadowBlur = 0;
        const grad = g2d.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,   `hsla(${hue}, 80%, 70%, ${0.18 + pulse * 0.22})`);
        grad.addColorStop(0.6, `hsla(${hue}, 70%, 50%, ${0.05 + pulse * 0.07})`);
        grad.addColorStop(1,   `hsla(${hue}, 60%, 30%, 0)`);
        g2d.fillStyle = grad;
        g2d.fill();
        g2d.restore();

        // Note label below the ring
        const lsz = Math.max(9, Math.round(Math.min(W, H) * 0.027));
        g2d.save();
        g2d.fillStyle = `hsla(${hue}, 80%, 82%, ${0.6 + pulse * 0.4})`;
        g2d.font      = `${lsz}px 'Courier New', monospace`;
        g2d.textAlign = "center";
        g2d.fillText(v.note, cx, cy + r + lsz * 1.5);
        g2d.restore();
      });

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // refs only — no state deps

  // ── start / stop ───────────────────────────────────────────────────────────
  function togglePlay() {
    if (playing) {
      const now = audioRef.current?.currentTime ?? 0;
      oscsRef.current.forEach(({ osc, gain }) => {
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.stop(now + 0.15);
      });
      oscsRef.current = [];
      setPlaying(false);
      setStatus("stopped");
    } else {
      if (!audioRef.current) {
        audioRef.current  = new AudioContext();
        masterRef.current = audioRef.current.createGain();
        masterRef.current.connect(audioRef.current.destination);
      }
      audioRef.current.resume().then(() => {
        applyVoices(voicesRef.current);
      });
      setPlaying(true);
      const n = voicesRef.current.length;
      setStatus(
        n > 0
          ? `playing ${n} voice${n === 1 ? "" : "s"}`
          : "playing — add a note above"
      );
    }
  }

  // ── save canvas ────────────────────────────────────────────────────────────
  function saveCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a  = document.createElement("a");
    a.href     = canvas.toDataURL("image/png");
    a.download = "code-vis.png";
    a.click();
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 3rem)", // account for dream layout header (12 × 0.25rem = 3rem)
        background: "#080812",
        color: "#e0e0f0",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      {/* ── title bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.45rem 1rem",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <div>
          <span style={{ fontSize: "0.95rem", letterSpacing: "0.1em", color: "#b8a0ff" }}>
            code-vis
          </span>
          <span
            style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", marginLeft: "1rem" }}
          >
            write notes · hear them · see them
          </span>
        </div>
        <Link
          href="/dream"
          style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)", textDecoration: "none" }}
        >
          ← all prototypes
        </Link>
      </div>

      {/* ── main: editor + canvas ── */}
      <div
        style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}
      >
        {/* Left: code editor */}
        <div
          style={{
            width: "42%",
            minWidth: "200px",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* file tab */}
          <div
            style={{
              padding: "0.3rem 0.85rem",
              fontSize: "0.58rem",
              color: "rgba(255,255,255,0.2)",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              flexShrink: 0,
            }}
          >
            score.cv
          </div>

          {/* textarea */}
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              color: "#ffaa66",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "0.82rem",
              lineHeight: 1.75,
              padding: "0.8rem 1rem",
              border: "none",
              outline: "none",
              resize: "none",
              whiteSpace: "pre",
              overflowWrap: "normal",
              overflowX: "auto",
              minHeight: 0,
            }}
            spellCheck={false}
            autoComplete="off"
          />

          {/* parse status */}
          <div
            style={{
              padding: "0.3rem 1rem",
              fontSize: "0.6rem",
              color:
                voices.length > 0
                  ? "rgba(150,255,130,0.6)"
                  : "rgba(255,180,80,0.45)",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              flexShrink: 0,
            }}
          >
            {voices.length > 0
              ? `${voices.length} voice${voices.length === 1 ? "" : "s"} parsed`
              : "no valid notes"}
          </div>
        </div>

        {/* Right: canvas */}
        <div
          style={{ flex: 1, position: "relative", minWidth: 0, overflow: "hidden" }}
        >
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
          <Link
            href="/dream/41-code-vis/README.md"
            style={{
              position: "absolute",
              bottom: "0.6rem",
              right: "0.8rem",
              fontSize: "0.6rem",
              color: "rgba(255,255,255,0.18)",
              textDecoration: "none",
            }}
          >
            design notes ↗
          </Link>
        </div>
      </div>

      {/* ── controls footer ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.45rem 1rem",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={togglePlay}
          style={{
            padding: "0.3rem 0.85rem",
            background: playing
              ? "rgba(255,70,70,0.12)"
              : "rgba(160,130,255,0.12)",
            color: playing ? "#ff6666" : "#c0a0ff",
            border: `1px solid ${playing ? "rgba(255,70,70,0.28)" : "rgba(160,130,255,0.28)"}`,
            borderRadius: "3px",
            fontFamily: "'Courier New', monospace",
            fontSize: "0.78rem",
            cursor: "pointer",
          }}
        >
          {playing ? "■ Stop" : "▶ Start"}
        </button>

        <label
          style={{
            fontSize: "0.7rem",
            color: "rgba(255,255,255,0.38)",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
          }}
        >
          <span>BPM {bpm}</span>
          <input
            type="range"
            min={40}
            max={200}
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value, 10))}
            style={{ accentColor: "#b8a0ff", width: "80px" }}
          />
        </label>

        <button
          onClick={saveCanvas}
          style={{
            padding: "0.3rem 0.65rem",
            background: "transparent",
            color: "rgba(255,255,255,0.28)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "3px",
            fontFamily: "'Courier New', monospace",
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          ↓ PNG
        </button>

        <span
          style={{
            fontSize: "0.62rem",
            color: "rgba(255,255,255,0.22)",
            marginLeft: "auto",
          }}
        >
          {status}
        </span>
      </div>
    </div>
  );
}
