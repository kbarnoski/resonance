"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap a rhythm — the drum echoes it back, then adds one more beat!

const PADS = [
  { hue: 270, scale: 1.00 },  // kick  violet  biggest=lowest (BANDIMAL)
  { hue:  45, scale: 0.72 },  // hihat amber   smallest=highest
  { hue: 340, scale: 0.84 },  // snare rose
  { hue: 175, scale: 0.92 },  // tom   teal
] as const;

const SILENCE_MS = 1500;
const MAX_TAPS   = 8;

type Tap    = { pad: number; ms: number };
type Ripple = { cx: number; cy: number; r: number; hue: number; a: number };
type Spark  = { x: number; y: number; vx: number; vy: number; hue: number; a: number; r: number };
type Phase  = "idle" | "recording" | "echoing";

type St = {
  actx:       AudioContext | null;
  phase:      Phase;
  ripples:    Ripple[];
  sparks:     Spark[];
  flash:      number[];   // user tap flash per pad [0,1]
  echoFlash:  number[];   // echo flash per pad [0,1]
  bonus:      number;     // gold +1 beat flash [0,1]
  bonusPad:   number;
  recorded:   Tap[];
  recStart:   number;     // performance.now() when recording started
  awake:      boolean;
  lastTs:     number;
  silenceHnd: ReturnType<typeof setTimeout> | null;
  echoHnds:   ReturnType<typeof setTimeout>[];
};

function padCtr(pad: number, W: number, H: number): [number, number] {
  return [W * (pad % 2 === 0 ? 0.25 : 0.75), H * (pad < 2 ? 0.25 : 0.75)];
}
function padR(pad: number, minDim: number): number {
  return Math.min(Math.round(minDim * 0.22 * PADS[pad].scale), 130);
}
function hitPad(x: number, y: number, W: number, H: number): number {
  return (x >= W / 2 ? 1 : 0) + (y >= H / 2 ? 2 : 0);
}

function playDrum(actx: AudioContext, pad: number): void {
  const t = actx.currentTime;
  if (pad === 0) {                                          // kick
    const osc = actx.createOscillator(), env = actx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    env.gain.setValueAtTime(0.85, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
    osc.connect(env).connect(actx.destination);
    osc.start(t); osc.stop(t + 0.41);
  } else if (pad === 1) {                                   // hihat
    const len = Math.ceil(actx.sampleRate * 0.07);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() - 0.5) * 2;
    const src = actx.createBufferSource(); src.buffer = buf;
    const hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    const env = actx.createGain();
    env.gain.setValueAtTime(0.42, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp).connect(env).connect(actx.destination); src.start(t);
  } else if (pad === 2) {                                   // snare
    const len = Math.ceil(actx.sampleRate * 0.13);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() - 0.5) * 2;
    const src = actx.createBufferSource(); src.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const nv = actx.createGain();
    nv.gain.setValueAtTime(0.55, t); nv.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp).connect(nv).connect(actx.destination); src.start(t);
    const osc2 = actx.createOscillator(), tv = actx.createGain();
    osc2.frequency.value = 185;
    tv.gain.setValueAtTime(0.35, t); tv.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc2.connect(tv).connect(actx.destination); osc2.start(t); osc2.stop(t + 0.08);
  } else {                                                  // tom
    const osc = actx.createOscillator(), env = actx.createGain();
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.22);
    env.gain.setValueAtTime(0.70, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(env).connect(actx.destination);
    osc.start(t); osc.stop(t + 0.33);
  }
}

function addSparks(st: St, cx: number, cy: number, hue: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 4.5;
    st.sparks.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 1.2,
      hue, a: 1, r: 2 + Math.random() * 4,
    });
  }
}

export default function EchoDrum() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null, phase: "idle",
    ripples: [], sparks: [],
    flash:    [0, 0, 0, 0],
    echoFlash:[0, 0, 0, 0],
    bonus: 0, bonusPad: 0,
    recorded: [], recStart: 0,
    awake: false, lastTs: 0,
    silenceHnd: null, echoHnds: [],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stRef.current;
    let raf = 0;
    let pageLoadTs = 0;

    function clearEchoHnds(): void {
      for (const h of st.echoHnds) clearTimeout(h);
      st.echoHnds = [];
    }

    function scheduleEcho(): void {
      if (st.recorded.length === 0) { st.phase = "idle"; return; }
      const actx = st.actx;
      if (!actx) { st.phase = "idle"; return; }

      st.phase = "echoing";
      const taps = st.recorded.slice();

      // Average inter-tap interval for the +1 beat timing
      let avgMs = 500;
      if (taps.length >= 2) {
        let sum = 0;
        for (let i = 1; i < taps.length; i++) sum += taps[i].ms - taps[i - 1].ms;
        avgMs = Math.max(150, Math.min(sum / (taps.length - 1), 1000));
      }

      // Most-tapped pad for the bonus beat
      const freq = [0, 0, 0, 0];
      for (const tap of taps) freq[tap.pad]++;
      st.bonusPad = freq.indexOf(Math.max(...freq));

      const base = taps[0].ms;

      // Schedule echo of each recorded tap
      for (let i = 0; i < taps.length; i++) {
        const { pad, ms } = taps[i];
        st.echoHnds.push(setTimeout(() => {
          if (!canvas) return;
          const gc = canvas.getContext("2d");
          if (!gc) return;
          playDrum(actx, pad);
          st.echoFlash[pad] = 1;
          const [cx, cy] = padCtr(pad, canvas.width, canvas.height);
          const r = padR(pad, Math.min(canvas.width, canvas.height));
          st.ripples.push({ cx, cy, r: r * 0.5, hue: PADS[pad].hue + 160, a: 0.9 });
        }, ms - base));
      }

      // +1 bonus beat: fires one average interval after the last echo tap
      const bonusDelay = (taps[taps.length - 1].ms - base) + avgMs;
      st.echoHnds.push(setTimeout(() => {
        if (!canvas) return;
        const gc = canvas.getContext("2d");
        if (!gc) return;
        const bp = st.bonusPad;
        playDrum(actx, bp);
        st.bonus = 1;
        st.echoFlash[bp] = 1;
        const [cx, cy] = padCtr(bp, canvas.width, canvas.height);
        const r = padR(bp, Math.min(canvas.width, canvas.height));
        addSparks(st, cx, cy, 52, 24);
        st.ripples.push({ cx, cy, r: r * 0.5, hue: 52, a: 1 });
      }, bonusDelay));

      // Return to idle after echo finishes
      st.echoHnds.push(setTimeout(() => {
        st.phase = "idle";
        st.recorded = [];
      }, bonusDelay + 900));
    }

    function triggerSilence(): void {
      if (st.phase !== "recording") return;
      clearEchoHnds();
      scheduleEcho();
    }

    function handleDown(e: PointerEvent): void {
      e.preventDefault();
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const pad = hitPad(x, y, canvas.width, canvas.height);

      if (!st.actx) st.actx = new AudioContext();
      if (st.actx.state === "suspended") st.actx.resume();
      st.awake = true;

      if (st.phase === "echoing") return;   // don't record during echo

      playDrum(st.actx, pad);
      st.flash[pad] = 1;

      const minDim = Math.min(canvas.width, canvas.height);
      const [cx, cy] = padCtr(pad, canvas.width, canvas.height);
      st.ripples.push({ cx, cy, r: padR(pad, minDim) * 0.5, hue: PADS[pad].hue, a: 1 });

      const now = performance.now();
      if (st.phase === "idle") {
        st.phase = "recording";
        st.recorded = [{ pad, ms: 0 }];
        st.recStart = now;
      } else if (st.recorded.length < MAX_TAPS) {
        st.recorded.push({ pad, ms: now - st.recStart });
        if (st.recorded.length >= MAX_TAPS) {
          if (st.silenceHnd) clearTimeout(st.silenceHnd);
          triggerSilence();
          return;
        }
      }

      if (st.silenceHnd) clearTimeout(st.silenceHnd);
      st.silenceHnd = setTimeout(triggerSilence, SILENCE_MS);
    }

    canvas.addEventListener("pointerdown", handleDown, { passive: false });

    function drawFrame(ts: number): void {
      if (!canvas) return;
      const gc = canvas.getContext("2d");
      if (!gc) return;

      if (pageLoadTs === 0) pageLoadTs = ts;
      const dt = Math.min((ts - st.lastTs) / 1000, 0.05);
      st.lastTs = ts;

      const W = canvas.width, H = canvas.height;
      const minDim = Math.min(W, H);

      gc.fillStyle = "#09090f";
      gc.fillRect(0, 0, W, H);

      // Draw 4 pads
      for (let p = 0; p < 4; p++) {
        const [cx, cy] = padCtr(p, W, H);
        const r = padR(p, minDim);
        const hue = PADS[p].hue;
        const f  = st.flash[p];
        const ef = st.echoFlash[p];

        // Ambient glow
        const glow = gc.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.55);
        glow.addColorStop(0, `hsla(${hue}, 65%, 55%, ${0.14 + f * 0.26 + ef * 0.20})`);
        glow.addColorStop(1, `hsla(${hue}, 65%, 30%, 0)`);
        gc.fillStyle = glow;
        gc.beginPath(); gc.arc(cx, cy, r * 1.55, 0, Math.PI * 2); gc.fill();

        // Main pad circle
        gc.beginPath(); gc.arc(cx, cy, r, 0, Math.PI * 2);
        gc.fillStyle = `hsla(${hue}, 68%, ${36 + f * 34}%, 0.90)`;
        gc.fill();
        gc.strokeStyle = `hsla(${hue}, 80%, 72%, ${0.28 + f * 0.52 + ef * 0.38})`;
        gc.lineWidth = 2.5;
        gc.stroke();

        // Echo overlay: cool cyan tint = "drum's voice"
        if (ef > 0.01) {
          gc.beginPath(); gc.arc(cx, cy, r, 0, Math.PI * 2);
          gc.fillStyle = `hsla(195, 88%, 76%, ${ef * 0.48})`;
          gc.fill();
        }

        // Bonus ring: gold = "+1 beat!"
        if (st.bonus > 0.01 && p === st.bonusPad) {
          gc.beginPath(); gc.arc(cx, cy, r + st.bonus * 16, 0, Math.PI * 2);
          gc.strokeStyle = `hsla(52, 100%, 76%, ${st.bonus})`;
          gc.lineWidth = 3 + st.bonus * 6;
          gc.stroke();
        }

        st.flash[p]    = Math.max(0, f  - dt * 5);
        st.echoFlash[p]= Math.max(0, ef - dt * 5);
      }

      st.bonus = Math.max(0, st.bonus - dt * 2.2);

      // Ripples
      for (let i = st.ripples.length - 1; i >= 0; i--) {
        const rp = st.ripples[i];
        rp.r += minDim * 0.22 * dt;
        rp.a -= dt * 2.2;
        if (rp.a <= 0) { st.ripples.splice(i, 1); continue; }
        gc.beginPath(); gc.arc(rp.cx, rp.cy, rp.r, 0, Math.PI * 2);
        gc.strokeStyle = `hsla(${rp.hue}, 78%, 70%, ${rp.a})`;
        gc.lineWidth = 2;
        gc.stroke();
      }

      // Sparkles
      for (let i = st.sparks.length - 1; i >= 0; i--) {
        const sp = st.sparks[i];
        sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.09;
        sp.a -= dt * 2.6;
        if (sp.a <= 0) { st.sparks.splice(i, 1); continue; }
        gc.beginPath(); gc.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        gc.fillStyle = `hsla(${sp.hue}, 95%, 72%, ${sp.a})`;
        gc.fill();
      }

      // Phase indicator at canvas center (between the 4 pads)
      const midX = W / 2, midY = H / 2;
      if (st.phase === "recording") {
        // Pulsing red dot = "recording"
        const pulse = 0.62 + 0.38 * Math.sin(ts * 0.007);
        gc.beginPath(); gc.arc(midX, midY, 9, 0, Math.PI * 2);
        gc.fillStyle = `rgba(255, 75, 75, ${pulse})`;
        gc.fill();
        // Colored tap-count dots orbiting the center
        const n = st.recorded.length;
        for (let i = 0; i < n; i++) {
          const a = (i / MAX_TAPS) * Math.PI * 2 - Math.PI / 2;
          gc.beginPath();
          gc.arc(midX + Math.cos(a) * 23, midY + Math.sin(a) * 23, 4.5, 0, Math.PI * 2);
          gc.fillStyle = `hsla(${PADS[st.recorded[i].pad].hue}, 80%, 72%, 0.92)`;
          gc.fill();
        }
      } else if (st.phase === "echoing") {
        // Pulsing cyan dot = "drum talking"
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(ts * 0.009));
        gc.beginPath(); gc.arc(midX, midY, 9, 0, Math.PI * 2);
        gc.fillStyle = `rgba(70, 180, 255, ${pulse})`;
        gc.fill();
      }

      // Hint text (fades 5→7.5s; hidden after first tap)
      const hintAge = ts - pageLoadTs;
      if (!st.awake && hintAge < 7500) {
        const alpha = hintAge < 5000 ? 0.82 : 0.82 * (1 - (hintAge - 5000) / 2500);
        gc.font = `bold ${Math.round(minDim * 0.046)}px ui-sans-serif, system-ui, sans-serif`;
        gc.textAlign = "center";
        gc.textBaseline = "alphabetic";
        gc.fillStyle = `rgba(255,255,255,${alpha})`;
        gc.fillText("Tap a rhythm! 🥁", W / 2, H * 0.93);
      }

      raf = requestAnimationFrame(drawFrame);
    }

    function resize(): void {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(canvas.offsetWidth  * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    raf = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", handleDown);
      if (st.silenceHnd) clearTimeout(st.silenceHnd);
      clearEchoHnds();
      st.actx?.close();
    };
  }, []);

  return (
    <main style={{
      background: "#09090f",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px 8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#fff", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
            Echo Drum
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "0.875rem", color: "rgba(255,255,255,0.72)", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
            Tap a rhythm · hear it back · plus one more beat!
          </p>
        </div>
        <Link href="/dream" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.48)", textDecoration: "none" }}>
          ← dream lab
        </Link>
      </div>
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: "block", touchAction: "none", width: "100%", minHeight: 0 }}
      />
    </main>
  );
}
