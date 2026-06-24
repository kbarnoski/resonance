"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ *
 * Balance Band — a kids seesaw where a wrong note tips the beam and
 * STAYS tipped (sour buzzing chord) until the child hangs a balancing
 * consonant creature to earn the calm back. Canvas2D + Web Audio.
 * ------------------------------------------------------------------ */

// --- Creature palette: each maps to a scale degree of C major (MIDI) ---
// The "spicy" creatures are intentionally dissonant against the C root.
type CreatureDef = {
  id: string;
  emoji: string;
  midi: number; // pitch when hung
  hue: number; // base color hue
  spicy: boolean; // dissonant against the root?
};

const PALETTE: CreatureDef[] = [
  { id: "do", emoji: "\u{1F535}", midi: 60, hue: 210, spicy: false }, // C  blue
  { id: "mi", emoji: "\u{1F7E2}", midi: 64, hue: 140, spicy: false }, // E  green
  { id: "so", emoji: "\u{1F7E1}", midi: 67, hue: 50, spicy: false }, // G  yellow
  { id: "spice", emoji: "\u{1F608}", midi: 66, hue: 320, spicy: true }, // F# tritone
  { id: "grump", emoji: "\u{1F47E}", midi: 61, hue: 0, spicy: true }, // Db minor-2nd
];

const ROOT_MIDI = 60; // C4 — harmonic root we judge intervals against
const MAX_ANGLE = (28 * Math.PI) / 180; // clamp tilt
const SLOTS_PER_ARM = 3; // discrete hang positions per side
const SLOT_GAP = 88; // px between fulcrum and first slot, and between slots

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Interval (in semitones, mod 12) consonance against the root.
// Returns true if the pitch class is consonant relative to ROOT.
function isConsonantPC(midi: number): boolean {
  const semis = ((midi - ROOT_MIDI) % 12 + 12) % 12;
  // consonant set: unison, M3, P4, P5, M6, octave-ish
  return [0, 3, 4, 5, 7, 8, 9].includes(semis);
}

// ----- canvas geometry helpers (shared by draw + hit-test) -----
function layout(W: number, H: number) {
  return { cx: W / 2, cy: H * 0.46 };
}

// slot world position given side/slot at current beam angle
function slotPos(
  cx: number,
  cy: number,
  angle: number,
  side: -1 | 1,
  slot: number
) {
  const along = side * (slot + 1) * SLOT_GAP;
  return {
    x: cx + Math.cos(angle) * along,
    y: cy + Math.sin(angle) * along,
  };
}

// --- A hung creature instance ---
type Hung = {
  uid: number;
  def: CreatureDef;
  side: -1 | 1; // -1 left, +1 right
  slot: number; // 0..SLOTS_PER_ARM-1 (0 nearest fulcrum)
  bornAt: number;
};

// --- A live audio voice for one hung creature ---
type Voice = {
  uid: number;
  osc: OscillatorNode;
  partial: OscillatorNode;
  sour: OscillatorNode; // detuned beating voice (only audible when dissonant)
  saw: OscillatorNode; // gentle shimmer for grumpiness
  gain: GainNode;
  sourGain: GainNode;
  sawGain: GainNode;
};

export default function BalanceBandPage() {
  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [selected, setSelected] = useState<string>(PALETTE[0].id);
  const [tipped, setTipped] = useState(false); // for the on-screen hint

  // Refs that the animation/audio loops read without re-rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const hungRef = useRef<Hung[]>([]);
  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const angleRef = useRef(0); // current eased beam angle (rad)
  const targetRef = useRef(0); // target torque-derived angle (rad)
  const rafRef = useRef<number | null>(null);
  const uidRef = useRef(1);
  const selectedRef = useRef(selected);
  const lastInteractRef = useRef(0);
  const demoedRef = useRef(false);

  selectedRef.current = selected;

  // ----- compute torque target + dissonance state from hung creatures -----
  const recompute = useCallback(() => {
    const hung = hungRef.current;
    let torque = 0;
    for (const h of hung) {
      const mass = h.def.spicy ? 1.7 : 1.0; // dissonant creatures are heavier/grumpier
      const dist = (h.slot + 1) * SLOT_GAP; // leverage grows outward
      torque += h.def.spicy
        ? h.side * mass * dist * 1.0 // spicy pulls its own side down harder
        : h.side * mass * dist;
    }
    // map torque (px*mass) to angle; normalize so a couple creatures fill range
    const norm = torque / (SLOTS_PER_ARM * SLOT_GAP * 2.0);
    let target = norm * MAX_ANGLE;
    if (target > MAX_ANGLE) target = MAX_ANGLE;
    if (target < -MAX_ANGLE) target = -MAX_ANGLE;
    targetRef.current = target;

    const anySpicy = hung.some((h) => h.def.spicy);
    setTipped(anySpicy && Math.abs(target) > 0.02);
  }, []);

  // ----- start audio (gesture-gated) -----
  const start = useCallback(() => {
    setStarted(true);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setAudioFailed(true);
        return;
      }
      const ctx = new AC();
      ctxRef.current = ctx;
      void ctx.resume();

      // master -> lowpass -> compressor -> destination
      const master = ctx.createGain();
      master.gain.value = 0.26;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 6;
      comp.ratio.value = 20;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;
      master.connect(lp).connect(comp).connect(ctx.destination);
      masterRef.current = master;

      // always-on soft drone: open fifth C2 + G2
      [36, 43].forEach((m) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = midiToFreq(m);
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(g).connect(master);
        o.start();
        g.gain.setTargetAtTime(0.09, ctx.currentTime, 1.2);
      });
    } catch {
      setAudioFailed(true);
    }
  }, []);

  // ----- evaluate whole chord; if consonant, glide sour voices away (BLOOM) -----
  const settleChord = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const hung = hungRef.current;
    const anySpicy = hung.some((h) => h.def.spicy);
    // chord reaches "earned calm" when torque is near level (a balancing
    // consonant creature was added on the lighter side) OR nothing is spicy.
    const balanced = Math.abs(targetRef.current) < 0.06;
    const calm = !anySpicy || balanced;

    for (const h of hung) {
      const v = voicesRef.current.get(h.uid);
      if (!v) continue;
      const dissonant = (!isConsonantPC(h.def.midi) || h.def.spicy) && !calm;
      if (dissonant) {
        v.sourGain.gain.setTargetAtTime(0.12, now, 0.18);
        v.sawGain.gain.setTargetAtTime(0.03, now, 0.25);
      } else {
        // warm bloom: sour & shimmer glide to silence
        v.sourGain.gain.setTargetAtTime(0.0, now, 0.5);
        v.sawGain.gain.setTargetAtTime(0.0, now, 0.6);
      }
    }
  }, []);

  // ----- create a live voice for a hung creature -----
  const makeVoice = useCallback((h: Hung) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const f = midiToFreq(h.def.midi);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    // warm fundamental
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start();

    // soft octave partial
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = f * 2;
    const pg = ctx.createGain();
    pg.gain.value = 0.18;
    partial.connect(pg).connect(gain);
    partial.start();

    // sour beating voice (audible only when this creature is dissonant)
    const sour = ctx.createOscillator();
    sour.type = "sine";
    sour.frequency.value = f;
    sour.detune.value = 14; // ~14 cents -> slow beating
    const sourGain = ctx.createGain();
    sourGain.gain.value = 0;
    sour.connect(sourGain).connect(gain);
    sour.start();

    // grumpy shimmer
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = f;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0;
    saw.connect(sawGain).connect(gain);
    saw.start();

    // soft attack (>=40ms)
    gain.gain.setTargetAtTime(h.def.spicy ? 0.13 : 0.16, now, 0.06);

    // if dissonant against root, bring up the sour + shimmer (persists!)
    const dissonant = !isConsonantPC(h.def.midi) || h.def.spicy;
    if (dissonant) {
      sourGain.gain.setTargetAtTime(0.12, now, 0.18);
      sawGain.gain.setTargetAtTime(0.03, now, 0.25);
    }

    voicesRef.current.set(h.uid, {
      uid: h.uid,
      osc,
      partial,
      sour,
      saw,
      gain,
      sourGain,
      sawGain,
    });

    // After any change, re-evaluate the whole chord's consonance and either
    // keep the sour buzz or, if the chord is now consonant, bloom it away.
    settleChord();
  }, [settleChord]);

  // ----- hang a creature on a side at the next free slot -----
  const hangCreature = useCallback(
    (side: -1 | 1, defId: string) => {
      const def = PALETTE.find((p) => p.id === defId) ?? PALETTE[0];
      const hung = hungRef.current;
      const used = new Set(
        hung.filter((h) => h.side === side).map((h) => h.slot)
      );
      let slot = -1;
      for (let s = 0; s < SLOTS_PER_ARM; s++) {
        if (!used.has(s)) {
          slot = s;
          break;
        }
      }
      if (slot < 0) return; // arm full
      const h: Hung = {
        uid: uidRef.current++,
        def,
        side,
        slot,
        bornAt: performance.now(),
      };
      hung.push(h);
      makeVoice(h);
      recompute();
      lastInteractRef.current = performance.now();
    },
    [makeVoice, recompute]
  );

  // ----- start over: clear the beam -----
  const clearAll = useCallback(() => {
    const ctx = ctxRef.current;
    const now = ctx?.currentTime ?? 0;
    for (const v of voicesRef.current.values()) {
      try {
        v.gain.gain.setTargetAtTime(0, now, 0.15);
        v.osc.stop(now + 0.6);
        v.partial.stop(now + 0.6);
        v.sour.stop(now + 0.6);
        v.saw.stop(now + 0.6);
      } catch {
        /* ignore */
      }
    }
    voicesRef.current.clear();
    hungRef.current = [];
    recompute();
    lastInteractRef.current = performance.now();
  }, [recompute]);

  // ----- pointer handling on canvas: tap a slot to hang the selected creature -----
  const onCanvasPointer = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (cv.width / rect.width);
      const py = (e.clientY - rect.top) * (cv.height / rect.height);
      const { cx, cy } = layout(cv.width, cv.height);
      const angle = angleRef.current;

      // find nearest slot within radius
      let best: { side: -1 | 1; slot: number; d: number } | null = null;
      for (const side of [-1, 1] as const) {
        for (let s = 0; s < SLOTS_PER_ARM; s++) {
          const { x, y } = slotPos(cx, cy, angle, side, s);
          const d = Math.hypot(px - x, py - y);
          if (!best || d < best.d) best = { side, slot: s, d };
        }
      }
      if (best && best.d < 70) {
        hangCreature(best.side, selectedRef.current);
      }
    },
    [hangCreature]
  );

  // ----- main loop: physics ease + Canvas2D render -----
  useEffect(() => {
    if (!started) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    fit();
    window.addEventListener("resize", fit);

    const draw = () => {
      const W = cv.width;
      const H = cv.height;
      const t = performance.now();

      // self-demo: after ~2s idle with empty beam, auto-hang a creature or two
      if (
        !demoedRef.current &&
        hungRef.current.length === 0 &&
        t - lastInteractRef.current > 2000
      ) {
        demoedRef.current = true;
        hangCreature(-1, "mi");
        setTimeout(() => hangCreature(1, "so"), 700);
      }

      // physics: ease angle toward torque target (gentle overshoot/settle)
      const target = targetRef.current;
      const cur = angleRef.current;
      angleRef.current = cur + (target - cur) * 0.08;

      const { cx, cy } = layout(W, H);
      const angle = angleRef.current;
      const anySpicy = hungRef.current.some((h) => h.def.spicy);
      const calm = !anySpicy || Math.abs(target) < 0.06;

      // background
      g.clearRect(0, 0, W, H);
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#140a2e");
      bg.addColorStop(1, "#0a0716");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // soft "calm" halo behind beam, warms when balanced
      const halo = g.createRadialGradient(cx, cy, 10, cx, cy, W * 0.5);
      halo.addColorStop(
        0,
        calm ? "rgba(160,255,210,0.10)" : "rgba(255,120,150,0.10)"
      );
      halo.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      // fulcrum (triangle)
      g.fillStyle = "#8b7bd8";
      g.beginPath();
      g.moveTo(cx, cy + 6);
      g.lineTo(cx - 34, cy + 90);
      g.lineTo(cx + 34, cy + 90);
      g.closePath();
      g.fill();

      // beam
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      const beamLen = (SLOTS_PER_ARM + 0.6) * SLOT_GAP;
      const grad = g.createLinearGradient(-beamLen, 0, beamLen, 0);
      grad.addColorStop(0, "#6d5ec9");
      grad.addColorStop(0.5, "#b8a8ff");
      grad.addColorStop(1, "#6d5ec9");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(-beamLen, -10, beamLen * 2, 20, 10);
      g.fill();
      // slot pegs
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (const side of [-1, 1] as const) {
        for (let s = 0; s < SLOTS_PER_ARM; s++) {
          const ax = side * (s + 1) * SLOT_GAP;
          g.beginPath();
          g.arc(ax, 0, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();

      // draw hung creatures hanging below their slots
      for (const h of hungRef.current) {
        const { x, y } = slotPos(cx, cy, angle, h.side, h.slot);
        const hang = 46;
        const wob = h.def.spicy
          ? Math.sin(t / 110 + h.uid) * 6 // spiky/wobbly
          : Math.sin(t / 320 + h.uid) * 2; // gentle bob
        const ccx = x + wob;
        const ccy = y + hang + Math.abs(wob) * 0.3;
        // string
        g.strokeStyle = "rgba(255,255,255,0.28)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(ccx, ccy - 22);
        g.stroke();

        const age = Math.min(1, (t - h.bornAt) / 280);
        const r = 22 * age;
        const dissonant = h.def.spicy || !isConsonantPC(h.def.midi);
        const showSour = dissonant && !calm;
        // glow
        g.shadowBlur = showSour ? 4 : 18;
        g.shadowColor = `hsla(${h.def.hue},80%,60%,0.9)`;
        if (showSour) {
          // spiky star body
          g.fillStyle = `hsl(${h.def.hue},75%,58%)`;
          g.beginPath();
          const spikes = 9;
          for (let i = 0; i < spikes * 2; i++) {
            const rr = i % 2 === 0 ? r : r * 0.55;
            const a = (i / (spikes * 2)) * Math.PI * 2 + t / 400;
            const sx = ccx - 22 + Math.cos(a) * rr;
            const sy = ccy - 22 + Math.sin(a) * rr;
            if (i === 0) g.moveTo(sx, sy);
            else g.lineTo(sx, sy);
          }
          g.closePath();
          g.fill();
        } else {
          // round glowing body
          g.fillStyle = `hsl(${h.def.hue},75%,60%)`;
          g.beginPath();
          g.arc(ccx, ccy - 22, r, 0, Math.PI * 2);
          g.fill();
        }
        g.shadowBlur = 0;
        // emoji face
        g.font = `${Math.round(r * 1.3)}px serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(h.def.emoji, ccx, ccy - 22);
      }

      // tap-target hints on empty slots (pulsing rings)
      const used = new Set(
        hungRef.current.map((h) => `${h.side}:${h.slot}`)
      );
      for (const side of [-1, 1] as const) {
        for (let s = 0; s < SLOTS_PER_ARM; s++) {
          if (used.has(`${side}:${s}`)) continue;
          const { x, y } = slotPos(cx, cy, angle, side, s);
          const pulse = 32 + Math.sin(t / 500 + s) * 5;
          g.strokeStyle = "rgba(255,255,255,0.16)";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y + 24, pulse, 0, Math.PI * 2);
          g.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", fit);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, hangCreature]);

  // re-settle the chord whenever torque/dissonance state changes
  useEffect(() => {
    if (!started) return;
    settleChord();
  }, [tipped, started, settleChord]);

  // full teardown
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const v of voicesRef.current.values()) {
        try {
          v.osc.stop();
          v.partial.stop();
          v.sour.stop();
          v.saw.stop();
        } catch {
          /* ignore */
        }
      }
      voicesRef.current.clear();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0716] text-white flex flex-col items-center px-4 py-6 relative overflow-hidden">
      <Link
        href="/dream"
        className="absolute left-4 top-4 text-base text-white/55 hover:text-white/90 transition-colors"
      >
        ← lab
      </Link>

      <header className="text-center mt-6 mb-4 max-w-xl">
        <h1 className="font-serif text-3xl sm:text-4xl text-white/95">
          Balance Band
        </h1>
        <p className="mt-2 text-base text-white/75">
          Hang singing creatures on the seesaw. A spicy note tips the beam and
          buzzes — add a friendly creature on the high side to balance it back
          to calm.
        </p>
      </header>

      {!started ? (
        <button
          onClick={start}
          className="mt-10 px-10 py-6 text-2xl rounded-3xl bg-violet-500/20 border border-violet-300/40 text-violet-100 hover:bg-violet-500/30 transition-colors"
          style={{ minWidth: 200, minHeight: 96 }}
        >
          ☁️ Start playing
        </button>
      ) : (
        <>
          {audioFailed && (
            <p className="text-rose-300 text-base mb-2">
              Sound is unavailable on this device — you can still play with the
              seesaw.
            </p>
          )}

          {/* canvas stage */}
          <div className="w-full max-w-3xl aspect-[3/2] rounded-2xl overflow-hidden border border-white/10">
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointer}
              className="w-full h-full touch-none block"
            />
          </div>

          {/* status line */}
          <p
            className={`mt-3 text-base ${
              tipped ? "text-rose-300" : "text-emerald-300/95"
            }`}
            aria-live="polite"
          >
            {tipped
              ? "Uh oh — it's tipping and buzzing. Add a friendly creature on the high side!"
              : "Nice and balanced — the band sounds sweet."}
          </p>

          {/* creature palette */}
          <div className="mt-4 flex flex-wrap gap-3 justify-center">
            {PALETTE.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                aria-pressed={selected === p.id}
                className={`rounded-2xl border transition-colors flex items-center justify-center ${
                  selected === p.id
                    ? "border-violet-300 bg-violet-500/25"
                    : "border-white/15 bg-white/5 hover:bg-white/10"
                }`}
                style={{ minWidth: 72, minHeight: 72, fontSize: 34 }}
                title={p.spicy ? "spicy creature" : "friendly creature"}
              >
                <span>{p.emoji}</span>
              </button>
            ))}
          </div>

          <p className="mt-2 text-base text-white/55 text-center max-w-md">
            Pick a creature, then tap a glowing ring on the beam to hang it.
          </p>

          <button
            onClick={clearAll}
            className="mt-4 px-6 py-3 text-lg rounded-2xl bg-white/5 border border-white/15 text-white/75 hover:bg-white/10 transition-colors"
            style={{ minHeight: 56 }}
          >
            ↺ Start over
          </button>
        </>
      )}

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 text-base text-white/55 hover:text-white/90 transition-colors"
      >
        {showNotes ? "close" : "design notes"}
      </button>
      {showNotes && (
        <div className="absolute right-4 top-12 z-10 w-80 max-w-[88vw] max-h-[70vh] overflow-auto rounded-2xl border border-white/15 bg-[#160d33] p-4 text-base text-white/75 shadow-xl">
          <h2 className="text-xl text-white/95 mb-2 font-serif">
            Design notes
          </h2>
          <p className="mb-2">
            A 2D rigid-lever seesaw (Canvas2D). Each hung creature adds torque =
            mass × distance from the fulcrum; the sum eases into a beam angle
            with gentle settle.
          </p>
          <p className="mb-2">
            The hung creatures form a chord judged against a C root. A{" "}
            <span className="text-rose-300">spicy</span> (dissonant) creature is
            heavier and grumpier: the beam tips toward it and a sour, beating
            voice persists — it does <em>not</em> auto-resolve.
          </p>
          <p className="mb-2">
            The child earns the calm by hanging a friendly creature on the high
            arm: torque levels out and the sour voice blooms away to a warm,
            consonant chord.
          </p>
          <p className="text-white/55">
            Audio: every voice → master(0.26) → lowpass(6kHz) → compressor
            → out. Soft attacks; even dissonance is gentle and wobbly, never
            harsh. Full notes in README.md.
          </p>
        </div>
      )}
    </main>
  );
}
