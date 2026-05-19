"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── constants ─────────────────────────────────────────────────────────────────

const PC_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"] as const;
const FFT_SIZE  = 2048;
const SMOOTH_TC = 0.75;
const PX_PER_SEC = 40;   // timeline scroll speed
const CONF_MIN   = 0.60; // minimum raw template score to display a chord

// ── chord templates (24: 12 roots × {major, minor}) ──────────────────────────

interface ChordTpl {
  name: string;
  root: number;
  quality: "major" | "minor";
  wts: number[]; // 12 weights — root=1.5, third=1.0, fifth=0.8
}

const TEMPLATES: ChordTpl[] = (() => {
  const out: ChordTpl[] = [];
  for (let r = 0; r < 12; r++) {
    const maj = Array.from({ length: 12 }, () => 0);
    maj[r] = 1.5; maj[(r + 4) % 12] = 1.0; maj[(r + 7) % 12] = 0.8;
    out.push({ name: PC_NAMES[r], root: r, quality: "major", wts: maj });
    const min = Array.from({ length: 12 }, () => 0);
    min[r] = 1.5; min[(r + 3) % 12] = 1.0; min[(r + 7) % 12] = 0.8;
    out.push({ name: `${PC_NAMES[r]}m`, root: r, quality: "minor", wts: min });
  }
  return out;
})();

// ── demo chord sequence: ii–V–I in C major ────────────────────────────────────

const DEMO_SEQ = [
  { freqs: [293.66, 349.23, 440.00, 523.25] }, // Dm7: D4 F4 A4 C5
  { freqs: [392.00, 493.88, 587.33, 698.46] }, // G7:  G4 B4 D5 F5
  { freqs: [261.63, 329.63, 392.00, 493.88] }, // Cmaj7: C4 E4 G4 B4
];

// ── audio helpers ─────────────────────────────────────────────────────────────

function buildChroma(freq: Uint8Array<ArrayBuffer>, sampleRate: number): number[] {
  const ch = Array.from({ length: 12 }, () => 0);
  const binHz = sampleRate / FFT_SIZE;
  for (let b = 1; b < freq.length; b++) {
    const f = b * binHz;
    if (f > 4200) break;
    if (f < 27.5) continue;
    const pc = ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12;
    ch[pc] += freq[b] / 255;
  }
  // L1 normalize so that uniform noise scores ~0.275 and a clean chord ~1.1
  const total = ch.reduce((a, v) => a + v, 0);
  if (total < 0.001) return ch; // silence — return zeros
  return ch.map(v => v / total);
}

interface Hit {
  name: string;
  root: number;
  quality: "major" | "minor";
  conf: number; // raw template score; clean chord ≈ 1.0–1.1, noise ≈ 0.275
}

function matchChord(chroma: number[]): Hit {
  let best = TEMPLATES[0];
  let bestS = -1;
  for (const t of TEMPLATES) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += t.wts[i] * chroma[i];
    if (s > bestS) { bestS = s; best = t; }
  }
  return { name: best.name, root: best.root, quality: best.quality, conf: bestS };
}

// ── color helpers ─────────────────────────────────────────────────────────────

function chordHsla(root: number, quality: "major" | "minor", a = 1): string {
  const h = (root * 30) % 360;
  const s = quality === "major" ? 72 : 48;
  const l = quality === "major" ? 58 : 46;
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// ── timeline segment ──────────────────────────────────────────────────────────

interface Seg {
  name: string;
  root: number;
  quality: "major" | "minor";
  leftX: number; // current left-edge X in canvas pixels
  w: number;     // current width in canvas pixels
}

// ── component ─────────────────────────────────────────────────────────────────

type Mode = "idle" | "mic" | "demo";

export default function ChordCanvasPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [err,  setErr]  = useState<string | null>(null);
  const [hit,  setHit]  = useState<Hit | null>(null);

  const tlRef  = useRef<HTMLCanvasElement>(null); // timeline canvas
  const chRef  = useRef<HTMLCanvasElement>(null); // chromagram canvas
  const rafRef = useRef(0);

  const actxRef    = useRef<AudioContext | null>(null);
  const analRef    = useRef<AnalyserNode | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const fbufRef    = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const oscRef     = useRef<OscillatorNode[]>([]);
  const demoIntRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const segsRef     = useRef<Seg[]>([]);
  const lastNameRef = useRef("");   // last chord name that passed CONF_MIN; "" = gap
  const scrollRef   = useRef(0);   // total px scrolled (drives grid lines)

  // ── teardown ───────────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (demoIntRef.current) { clearInterval(demoIntRef.current); demoIntRef.current = null; }
    oscRef.current.forEach(o => { try { o.stop(); } catch (_) {} });
    oscRef.current = [];
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void actxRef.current?.close();
    actxRef.current = null;
    analRef.current = null;
    fbufRef.current = null;
    segsRef.current = [];
    lastNameRef.current = "";
    scrollRef.current = 0;
  }, []);

  // ── audio setup helpers ────────────────────────────────────────────────────

  const makeAnalyser = useCallback((): { ctx: AudioContext; anal: AnalyserNode } => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx  = new Ctx();
    const anal = ctx.createAnalyser();
    anal.fftSize = FFT_SIZE;
    anal.smoothingTimeConstant = SMOOTH_TC;
    actxRef.current = ctx;
    analRef.current = anal;
    fbufRef.current = new Uint8Array(new ArrayBuffer(anal.frequencyBinCount));
    return { ctx, anal };
  }, []);

  const spawnOscs = useCallback(
    (ctx: AudioContext, anal: AnalyserNode, freqs: number[]) => {
      oscRef.current.forEach(o => { try { o.stop(); } catch (_) {} });
      oscRef.current = [];
      freqs.forEach(f => {
        const o  = ctx.createOscillator();
        const gn = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        gn.gain.value = 0.08;
        o.connect(gn);
        gn.connect(anal);          // → analysed
        gn.connect(ctx.destination); // → audible (Karel can hear the chord)
        o.start();
        oscRef.current.push(o);
      });
    },
    [],
  );

  // ── start / stop ───────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    teardown(); setErr(null); setHit(null);
    try {
      const { ctx, anal } = makeAnalyser();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const gn  = ctx.createGain();
      gn.gain.value = 2.0;
      src.connect(gn);
      gn.connect(anal);
      setMode("mic");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Microphone unavailable. Check browser permissions.");
      setMode("idle");
      teardown();
    }
  }, [teardown, makeAnalyser]);

  const startDemo = useCallback(() => {
    teardown(); setErr(null); setHit(null);
    const { ctx, anal } = makeAnalyser();
    let idx = 0;
    spawnOscs(ctx, anal, DEMO_SEQ[0].freqs);
    demoIntRef.current = setInterval(() => {
      idx = (idx + 1) % DEMO_SEQ.length;
      spawnOscs(ctx, anal, DEMO_SEQ[idx].freqs);
    }, 2500);
    setMode("demo");
  }, [teardown, makeAnalyser, spawnOscs]);

  const stop = useCallback(() => {
    teardown();
    setMode("idle");
    setHit(null);
  }, [teardown]);

  // ── render loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const tl = tlRef.current;
    const ch = chRef.current;
    if (!tl || !ch) return;
    const tlCtx = tl.getContext("2d");
    const chCtx = ch.getContext("2d");
    if (!tlCtx || !chCtx) return;

    let prev = performance.now();

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const anal = analRef.current;
      const buf  = fbufRef.current;
      const actx = actxRef.current;
      if (!anal || !buf || !actx) return;

      const tlW = tl.width;
      if (!tlW) return; // canvas not yet sized

      const dt     = Math.min((now - prev) / 1000, 0.1);
      prev         = now;
      const scroll = dt * PX_PER_SEC;
      scrollRef.current += scroll;

      anal.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
      const chroma = buildChroma(buf, actx.sampleRate);
      const result = matchChord(chroma);
      const curNm  = result.conf >= CONF_MIN ? result.name : "";

      if (curNm) setHit(result);

      // ── timeline segments: scroll left, extend or create ───────────────
      for (const s of segsRef.current) s.leftX -= scroll;
      segsRef.current = segsRef.current.filter(s => s.leftX + s.w > 0);

      if (curNm && curNm === lastNameRef.current && segsRef.current.length > 0) {
        // Same chord: extend the last segment from the right
        segsRef.current[segsRef.current.length - 1].w += scroll;
      } else if (curNm) {
        // New chord or first detection after a gap
        segsRef.current.push({
          name: result.name,
          root: result.root,
          quality: result.quality,
          leftX: tlW - scroll,
          w: scroll,
        });
        lastNameRef.current = curNm;
      } else {
        // Below threshold — gap appears on the right side of the timeline
        lastNameRef.current = "";
      }

      // ── draw timeline ──────────────────────────────────────────────────
      const tlH = tl.height;
      tlCtx.fillStyle = "#07070f";
      tlCtx.fillRect(0, 0, tlW, tlH);

      // Vertical grid lines (time markers)
      const gs  = 80;
      const go  = scrollRef.current % gs;
      tlCtx.strokeStyle = "rgba(255,255,255,0.04)";
      tlCtx.lineWidth = 1;
      for (let x = tlW - go; x > 0; x -= gs) {
        tlCtx.beginPath(); tlCtx.moveTo(x, 0); tlCtx.lineTo(x, tlH); tlCtx.stroke();
      }

      for (const seg of segsRef.current) {
        const rx = Math.max(0, seg.leftX);
        const rw = Math.min(seg.w + Math.min(0, seg.leftX), tlW - rx);
        if (rw <= 0) continue;
        tlCtx.fillStyle = chordHsla(seg.root, seg.quality, 0.82);
        tlCtx.fillRect(rx, 5, rw, tlH - 10);
        if (seg.w > 44) {
          tlCtx.fillStyle = "rgba(255,255,255,0.90)";
          tlCtx.font = `bold ${Math.min(14, Math.floor(seg.w * 0.28))}px monospace`;
          tlCtx.textAlign = "center";
          tlCtx.textBaseline = "middle";
          tlCtx.fillText(seg.name, rx + rw / 2, tlH / 2, rw - 6);
        }
      }

      // "now" indicator at right edge
      tlCtx.strokeStyle = "rgba(255,255,255,0.28)";
      tlCtx.lineWidth = 1.5;
      tlCtx.beginPath();
      tlCtx.moveTo(tlW - 1, 0);
      tlCtx.lineTo(tlW - 1, tlH);
      tlCtx.stroke();

      // ── draw chromagram ────────────────────────────────────────────────
      const chW   = ch.width;
      const chH   = ch.height;
      const innerH = chH - 20;
      const bW    = chW / 12;

      chCtx.fillStyle = "#07070f";
      chCtx.fillRect(0, 0, chW, chH);

      for (let i = 0; i < 12; i++) {
        const v   = chroma[i];
        const bH  = v * innerH;
        const hue = i * 30;
        if (bH > 1) {
          const grad = chCtx.createLinearGradient(0, chH - 20 - bH, 0, chH - 20);
          grad.addColorStop(0, `hsla(${hue},80%,68%,1)`);
          grad.addColorStop(1, `hsla(${hue},55%,32%,0.85)`);
          chCtx.fillStyle = grad;
          chCtx.fillRect(i * bW + 1, chH - 20 - bH, bW - 2, bH);
        }
        chCtx.fillStyle = "rgba(255,255,255,0.45)";
        chCtx.font = "9px monospace";
        chCtx.textAlign = "center";
        chCtx.textBaseline = "bottom";
        chCtx.fillText(PC_NAMES[i], i * bW + bW / 2, chH - 3);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── canvas sizing ──────────────────────────────────────────────────────────

  useEffect(() => {
    const tl = tlRef.current;
    const ch = chRef.current;
    if (!tl || !ch) return;
    const resize = () => {
      const w = tl.parentElement?.clientWidth ?? 400;
      tl.width = w; tl.height = 72;
      ch.width = w; ch.height = 86;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (tl.parentElement) ro.observe(tl.parentElement);
    return () => ro.disconnect();
  }, []);

  // ── cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => () => teardown(), [teardown]);

  // ── render ─────────────────────────────────────────────────────────────────

  const confPct = hit
    ? Math.max(0, Math.min(100, Math.round((hit.conf - 0.275) / 0.825 * 100)))
    : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050510",
        color: "#dcdcf0",
        fontFamily: "monospace",
        padding: "24px 20px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 3, color: "#b8b8e0" }}>
            CHORD CANVAS
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#484880", letterSpacing: 1 }}>
            PLAY PIANO — YOUR CHORD APPEARS IN REAL TIME
          </p>
        </div>
        <Link href="/dream" style={{ fontSize: 11, color: "#2e2e60", textDecoration: "none" }}>
          ← dream
        </Link>
      </div>

      {/* Large chord name display */}
      <div
        style={{
          textAlign: "center",
          padding: "28px 0 22px",
          borderTop: "1px solid #12123a",
          borderBottom: "1px solid #12123a",
          marginBottom: 16,
        }}
      >
        {hit ? (
          <>
            <div
              style={{
                fontSize: 88,
                fontWeight: "bold",
                lineHeight: 1,
                letterSpacing: -2,
                color: chordHsla(hit.root, hit.quality),
                textShadow: `0 0 60px ${chordHsla(hit.root, hit.quality, 0.5)}`,
                transition: "color 0.2s, text-shadow 0.2s",
              }}
            >
              {hit.name}
            </div>
            <div style={{ fontSize: 11, color: "#404080", marginTop: 10, letterSpacing: 2 }}>
              {PC_NAMES[hit.root]}&nbsp;
              {hit.quality === "major" ? "MAJOR" : "MINOR"}
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <span style={{ color: "#2e2e70" }}>{confPct}% confidence</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 72, color: "#181840", fontWeight: "bold", lineHeight: 1 }}>
            {mode === "idle" ? "— —" : "···"}
          </div>
        )}
      </div>

      {/* Chord timeline */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#333368", letterSpacing: 2, marginBottom: 5 }}>
          CHORD TIMELINE — NEW CHORDS APPEAR AT RIGHT, SCROLL LEFT
        </div>
        <canvas ref={tlRef} style={{ display: "block", width: "100%", borderRadius: 3 }} />
      </div>

      {/* Chromagram */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: "#333368", letterSpacing: 2, marginBottom: 5 }}>
          CHROMAGRAM — PITCH CLASS ENERGY (ALL OCTAVES)
        </div>
        <canvas ref={chRef} style={{ display: "block", width: "100%", borderRadius: 3 }} />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {mode !== "mic" && (
          <button
            onClick={() => { void startMic(); }}
            style={{
              background: "transparent",
              border: "1px solid #3a3a90",
              color: "#8888c8",
              padding: "10px 20px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 1,
              borderRadius: 3,
            }}
          >
            START MIC
          </button>
        )}
        {mode !== "demo" && (
          <button
            onClick={startDemo}
            style={{
              background: "transparent",
              border: "1px solid #243860",
              color: "#506080",
              padding: "10px 20px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 1,
              borderRadius: 3,
            }}
          >
            DEMO  ii–V–I
          </button>
        )}
        {mode !== "idle" && (
          <button
            onClick={stop}
            style={{
              background: "transparent",
              border: "1px solid #602020",
              color: "#905050",
              padding: "10px 20px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 1,
              borderRadius: 3,
            }}
          >
            STOP
          </button>
        )}
      </div>

      {err && (
        <div style={{ color: "#c04040", fontSize: 12, marginBottom: 12 }}>{err}</div>
      )}

      {mode !== "idle" && (
        <div style={{ fontSize: 10, color: "#333368", letterSpacing: 1 }}>
          {mode === "mic"
            ? "● MIC INPUT"
            : "● DEMO — Dm7 → G7 → Cmaj7 (2.5 s each, loops)"}
        </div>
      )}

      {mode === "idle" && (
        <div style={{ marginTop: 32, fontSize: 11, color: "#303068", lineHeight: 1.9, maxWidth: 520 }}>
          <div style={{ color: "#4444a0", marginBottom: 6, letterSpacing: 1 }}>HOW IT WORKS</div>
          <div>FFT → 12-bin chroma vector: pitch-class energy, all octaves summed</div>
          <div>Template-match against 24 major/minor chord templates (weighted dot product)</div>
          <div>Hue = root note — C=red · D=yellow · G=blue · A=violet</div>
          <div>Saturation: major = vivid · minor = muted</div>
          <div style={{ marginTop: 8, color: "#222255" }}>
            Hold a chord for ≥0.5 s for reliable detection. Piano, guitar, voice — any pitched source.
            No ML. Pure signal processing.
          </div>
        </div>
      )}
    </div>
  );
}
