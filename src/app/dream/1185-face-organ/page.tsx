"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1185-face-organ — "sing" a shimmering choir with your face, hands-free.
//
//   MediaPipe FaceLandmarker (CDN, VIDEO mode, blendshapes) → a formant vocal
//   synth. Open your mouth and the choir sings; smile/pucker morph the vowel;
//   raise your brows to climb a pentatonic scale; tilt your head to pan; blink
//   for a soft accent. Camera denied or model down → the same engine plays from
//   on-screen vowel pads. Bright, high-key luminous mask throughout.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildFormantEngine, type FormantEngine } from "./formant";
import { startFace, type FaceRig } from "./face";
import { drawFrame } from "./render";

type Phase = "idle" | "starting" | "running";
type Mode = "face" | "pads";

const PADS: { name: string; front: number }[] = [
  { name: "U", front: 0 },
  { name: "O", front: 0.25 },
  { name: "A", front: 0.5 },
  { name: "E", front: 0.75 },
  { name: "I", front: 1 },
];

export default function FaceOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxAudioRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<FormantEngine | null>(null);
  const rigRef = useRef<FaceRig | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastBlinkRef = useRef<number>(0);
  const hudCounterRef = useRef<number>(0);

  // Fallback (pads) control values, read live inside the loop.
  const padGateRef = useRef<number>(0);
  const padFrontRef = useRef<number>(0.5);
  const padPitchRef = useRef<number>(0.4);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("face");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [activePad, setActivePad] = useState<string | null>(null);
  const [padPitch, setPadPitch] = useState(0.4);
  const [hud, setHud] = useState({ vowel: "A", note: "A3", level: 0 });

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    engineRef.current?.stop();
    engineRef.current = null;
    rigRef.current?.stop();
    rigRef.current = null;
    const ctx = ctxAudioRef.current;
    ctxAudioRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 400);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !engine || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const time = (performance.now() - startTimeRef.current) / 1000;

    const rig = rigRef.current;
    let gate: number;
    let frontness: number;
    let pitch: number;
    let roll = 0;
    let blink = 0;
    let landmarks = null;
    let video: HTMLVideoElement | null = null;

    if (rig) {
      const f = rig.read();
      video = rig.video;
      landmarks = f.present ? f.landmarks : null;
      gate = f.gate;
      frontness = f.frontness;
      pitch = f.pitch;
      roll = f.roll;
      blink = f.blink;
    } else {
      gate = padGateRef.current;
      frontness = padFrontRef.current;
      pitch = padPitchRef.current;
    }

    // Rising-edge blink → soft accent.
    if (blink > 0.7 && lastBlinkRef.current <= 0.7) engine.accent();
    lastBlinkRef.current = blink;

    engine.update({
      gate,
      frontness,
      pitch,
      pan: roll,
      bend: roll,
    });

    const level = engine.level();
    drawFrame({
      ctx,
      w,
      h,
      time,
      video,
      landmarks,
      gate,
      frontness,
      level,
      roll,
    });

    // Throttle HUD updates (~10 Hz).
    hudCounterRef.current += 1;
    if (hudCounterRef.current % 6 === 0) {
      setHud({
        vowel: engine.currentVowel(),
        note: engine.currentNote(),
        level,
      });
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const begin = useCallback(
    async (wantCamera: boolean) => {
      if (phase === "starting" || phase === "running") return;
      setPhase("starting");
      setNotice(null);

      resizeCanvas();

      // Audio must start from this user gesture.
      let ctx: AudioContext;
      try {
        ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
      } catch {
        setPhase("idle");
        setNotice("Web Audio is unavailable on this device.");
        return;
      }
      ctxAudioRef.current = ctx;
      engineRef.current = buildFormantEngine(ctx);

      if (wantCamera) {
        const { rig, fallbackReason } = await startFace();
        if (rig) {
          rigRef.current = rig;
          setMode("face");
        } else {
          setMode("pads");
          setNotice(fallbackReason);
        }
      } else {
        setMode("pads");
      }

      startTimeRef.current = performance.now();
      lastBlinkRef.current = 0;
      setPhase("running");
      rafRef.current = requestAnimationFrame(runLoop);
    },
    [phase, resizeCanvas, runLoop],
  );

  const pressPad = useCallback((name: string, front: number) => {
    setActivePad(name);
    padFrontRef.current = front;
    padGateRef.current = 1;
  }, []);

  const releasePad = useCallback(() => {
    setActivePad(null);
    padGateRef.current = 0;
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbeee0] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-3xl bg-black/45 p-8 backdrop-blur-md ring-1 ring-white/15">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Face Organ
            </h1>
            <p className="mt-3 text-base leading-relaxed text-white/80">
              Your face is the instrument — no hands, no keys. Open your mouth
              and a shimmering choir sings; smile or pucker to shape the vowel,
              raise your brows to climb the scale, tilt your head to pan, and
              blink for a soft accent.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => begin(true)}
                disabled={phase === "starting"}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white px-4 py-2.5 text-base font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
              >
                {phase === "starting" ? "Warming up the choir…" : "Start camera · sing"}
              </button>
              <button
                type="button"
                onClick={() => begin(false)}
                disabled={phase === "starting"}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/15 px-4 py-2.5 text-base font-medium text-white ring-1 ring-white/25 transition hover:bg-white/25 disabled:opacity-60"
              >
                No camera — use vowel pads
              </button>
            </div>

            {notice && <p className="mt-4 text-base text-rose-300">{notice}</p>}

            <p className="mt-5 text-base text-white/75">
              The camera runs entirely in your browser — nothing is recorded or
              sent anywhere. Use headphones; audio starts only when you press a
              button. No strobing.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ─────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-6 top-6 select-none">
            <h1 className="text-2xl font-semibold text-white drop-shadow-[0_1px_6px_rgba(120,60,20,0.55)]">
              Face Organ
            </h1>
            {mode === "face" ? (
              <p className="mt-1 text-base text-emerald-300/95 drop-shadow-[0_1px_4px_rgba(80,40,10,0.6)]">
                ● live face · open your mouth to sing
              </p>
            ) : (
              <p className="mt-1 text-base text-amber-300/95 drop-shadow-[0_1px_4px_rgba(80,40,10,0.6)]">
                ● vowel pads · hold a pad to sing
              </p>
            )}
            {notice && (
              <p className="mt-2 max-w-xs text-base text-rose-300">{notice}</p>
            )}
          </div>

          {/* Live readout */}
          <div className="pointer-events-none absolute right-6 top-6 select-none text-right">
            <div className="text-6xl font-bold text-white drop-shadow-[0_2px_10px_rgba(120,60,20,0.6)]">
              {hud.vowel}
            </div>
            <div className="mt-1 text-2xl font-semibold text-white/95 drop-shadow-[0_1px_6px_rgba(120,60,20,0.55)]">
              {hud.note}
            </div>
            <div className="mt-2 ml-auto h-2 w-40 overflow-hidden rounded-full bg-black/25 ring-1 ring-white/25">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-300 transition-[width] duration-100"
                style={{ width: `${Math.round(hud.level * 100)}%` }}
              />
            </div>
          </div>

          {/* Fallback vowel pads + pitch */}
          {mode === "pads" && (
            <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-4 px-6">
              <div className="flex gap-3">
                {PADS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pressPad(p.name, p.front);
                    }}
                    onPointerUp={releasePad}
                    onPointerLeave={releasePad}
                    onPointerCancel={releasePad}
                    className={`inline-flex min-h-[64px] min-w-[64px] items-center justify-center rounded-2xl px-4 py-2.5 text-2xl font-bold ring-1 backdrop-blur-md transition ${
                      activePad === p.name
                        ? "bg-white text-black ring-white"
                        : "bg-black/35 text-white ring-white/25 hover:bg-black/45"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-black/35 px-4 py-2.5 ring-1 ring-white/20 backdrop-blur-md">
                <span className="text-base font-medium text-white/80">pitch</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={padPitch}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPadPitch(v);
                    padPitchRef.current = v;
                  }}
                  className="h-2 flex-1 cursor-pointer accent-rose-400"
                  aria-label="pitch"
                />
                <button
                  type="button"
                  onClick={() => engineRef.current?.accent()}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/15 px-4 py-2.5 text-base font-medium text-white ring-1 ring-white/25 transition hover:bg-white/25"
                >
                  Shimmer
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Design notes ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-6 right-6 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-black/45 px-4 py-2.5 text-base text-white/90 ring-1 ring-white/20 backdrop-blur-md transition hover:text-white"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/80 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-white/80">
            <h2 className="text-2xl font-semibold text-white">Face Organ — design notes</h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-white">The question.</span> What if your face
              were a hands-free vocal instrument — could you &ldquo;sing&rdquo; a
              shimmering choir with your expressions alone?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-white">Technique.</span> A real formant synth:
              a sawtooth glottal source plus a whisper of breath noise runs
              through three parallel bandpass filters tuned to the first three
              formants F1/F2/F3. Sweeping those centre frequencies between the
              Peterson &amp; Barney (1952) vowel targets turns the buzz into sung
              vowels. A small unison stack plus a vibrato LFO gives the choral
              shimmer; pitch is quantised to a major-pentatonic scale so it stays
              consonant.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-white">Mapping.</span> jawOpen → gate +
              openness · smile ↔ pucker → vowel front/back · brow raise → pitch ·
              head roll → pan &amp; bend · blink → accent.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-white">Inspiration.</span> The facial-
              performance instruments of Zach Lieberman and Daito Manabe.
            </p>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              Full notes, mapping table and fallback behaviour live in this
              prototype&rsquo;s README.md.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
