"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * 680 — Night Boat
 * A nocturne/barcarolle lullaby in F major, 6/8 rocking feel.
 * Rock the tablet like a cradle; the music drifts toward "home".
 * A phrase state machine drives REAL functional harmony: phrases build
 * toward a cadence, sometimes landing DECEPTIVE (V->vi, almost-home),
 * finally resolving AUTHENTIC (V->I, truly home).
 * Everything important is in the EARS. Screen is near-black; one boat glows.
 */

// ---------------------------------------------------------------------------
// Harmony — F major. Triads as frequency triples (root position, mid register).
// Real chords, smooth voice-leading via setTargetAtTime. NOT a pentatonic toy.
// ---------------------------------------------------------------------------

type ChordName = "I" | "IV" | "V" | "vi" | "ii";

// F major scale degree frequencies, octave ~ F3..F4 range for the pad.
const HZ = {
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
};

// Triads (3 voices). Chosen for smooth common-tone voice-leading.
const CHORDS: Record<ChordName, number[]> = {
  I: [HZ.F3, HZ.A3, HZ.C4], // F major  (1 3 5)
  IV: [HZ.F3, HZ.Bb3, HZ.D4], // Bb major (over F-ish) -> using Bb D F voicing
  V: [HZ.G3, HZ.C4, HZ.E4], // C major  (5 of F) -> C E G voiced as G C E for VL
  vi: [HZ.A3, HZ.D4, HZ.F4], // D minor  (vi) -> D F A voiced A D F
  ii: [HZ.G3, HZ.Bb3, HZ.D4], // G minor  (ii) -> G Bb D
};

// Melody notes (lullaby line) per chord — a singable resolving tendency.
const MELODY: Record<ChordName, number> = {
  I: HZ.C5, // sol -> rest on the 5th, calm
  IV: HZ.D5, // gentle lift
  V: HZ.D5, // tension tone (the 2/the leading area)
  vi: HZ.F4, // dip, darker (minor third of vi)
  ii: HZ.Bb4,
};

// ---------------------------------------------------------------------------
// Phrase state machine.
// A phrase = a short journey of chords ending in a cadence.
// We bias the ENDING: early phrases tend to deceive (V->vi); steady rocking
// "lulls" the piece and increases the chance the next cadence lands home (V->I).
// ---------------------------------------------------------------------------

type CadenceKind = "deceptive" | "authentic";

interface Phrase {
  chords: ChordName[]; // the harmonic progression for this phrase
  cadence: CadenceKind; // how the final V resolves
}

// Build a phrase. `homeBias` 0..1 — higher means more likely to truly resolve.
function makePhrase(homeBias: number, forceHome: boolean): Phrase {
  // Pre-cadence material — calm wandering through the diatonic set.
  const intros: ChordName[][] = [
    ["I", "IV", "ii", "V"],
    ["I", "vi", "IV", "V"],
    ["I", "IV", "I", "V"],
    ["vi", "IV", "ii", "V"],
  ];
  const chords = intros[Math.floor(Math.random() * intros.length)].slice();
  // Cadence decision: the final chord is always V (dominant tension).
  // It either deceives (-> vi) or comes home (-> I).
  const land = forceHome || Math.random() < homeBias;
  const cadence: CadenceKind = land ? "authentic" : "deceptive";
  chords.push(cadence === "authentic" ? "I" : "vi");
  return { chords, cadence };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NightBoat() {
  const [started, setStarted] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [fellBack, setFellBack] = useState(false);

  // Visual state that the React tree reads (slow-changing only).
  const [glow, setGlow] = useState({
    bloom: 0.4, // 0..1 warmth / brightness from cadence
    tilt: 0, // boat rock angle (deg)
    dip: 0, // 0..1 deceptive dip
  });

  // Refs for fast-changing state (avoid re-render storms).
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Rocking signal (shared between sensor / fallback / auto-demo).
  const rockRef = useRef({
    angle: 0, // current tilt deg (-30..30)
    velocity: 0, // smoothed |angular velocity| -> "rocking energy"
    lastAngle: 0,
    energy: 0, // 0..1 smoothed rocking energy
    auto: true, // auto-demo driving until real input takes over
    sawRealInput: false,
  });

  // -------- BEGIN: unlock audio inside the user gesture --------
  const begin = async () => {
    if (started) return;
    type WAC = typeof AudioContext;
    const Ctor: WAC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: WAC }).webkitAudioContext;
    const ac = new Ctor();
    acRef.current = ac;
    try {
      await ac.resume();
    } catch {
      /* ignore */
    }

    // iOS motion permission MUST be requested inside this gesture.
    let motionGranted = false;
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
      }
    ).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        motionGranted = res === "granted";
        if (!motionGranted) {
          setStatusMsg("Motion was not allowed — drag up and down to rock the boat.");
          setFellBack(true);
        }
      } catch {
        setStatusMsg("Motion is unavailable — drag up and down to rock the boat.");
        setFellBack(true);
      }
    } else {
      motionGranted = true; // non-iOS: just listen
    }

    setStarted(true);
    startEngine(ac, motionGranted);
  };

  // -------- AUDIO + LOOP ENGINE --------
  const startEngine = (ac: AudioContext, listenForMotion: boolean) => {
    // ---- Master chain: gain -> lowpass(<=7.5k) -> compressor -> dest ----
    const master = ac.createGain();
    master.gain.value = 0.0; // fade in
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500; // safe, no harsh highs
    lp.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ac.destination);

    // gentle bring-up of the master to a conservative ceiling
    master.gain.setTargetAtTime(0.34, ac.currentTime, 1.2);

    // ---- Always-on pad: 3 detuned sine voices, retuned per chord ----
    const padGain = ac.createGain();
    padGain.gain.value = 0.5;
    padGain.connect(master);
    const padVoices = [0, 1, 2].map((i) => {
      const g = ac.createGain();
      g.gain.value = 0.33;
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = CHORDS.I[i];
      o.detune.value = (i - 1) * 4; // slight chorus
      o.connect(g);
      g.connect(padGain);
      o.start();
      return o;
    });

    // a soft sub for warmth (root, one octave down)
    const subGain = ac.createGain();
    subGain.gain.value = 0.18;
    subGain.connect(master);
    const sub = ac.createOscillator();
    sub.type = "sine";
    sub.frequency.value = CHORDS.I[0] / 2;
    sub.connect(subGain);
    sub.start();

    // ---- Pluck/bell for melody (soft triangle through its own gentle filter) ----
    const playNote = (hz: number, when: number, vel: number, dur: number) => {
      const g = ac.createGain();
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2200;
      const o = ac.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz;
      o.connect(f);
      f.connect(g);
      g.connect(master);
      const a = 0.04;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vel), when + a);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.start(when);
      o.stop(when + dur + 0.05);
      o.onended = () => {
        o.disconnect();
        f.disconnect();
        g.disconnect();
      };
    };

    // sparkle for the authentic "bloom home" moment
    const playSparkle = (when: number) => {
      [HZ.C5, HZ.E4 * 2, HZ.G4 * 2].forEach((hz, i) => {
        const g = ac.createGain();
        const o = ac.createOscillator();
        o.type = "sine";
        o.frequency.value = hz;
        o.connect(g);
        g.connect(master);
        const t = when + i * 0.06;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.start(t);
        o.stop(t + 1.2);
        o.onended = () => {
          o.disconnect();
          g.disconnect();
        };
      });
    };

    // ---- retune the pad to a chord with smooth voice-leading ----
    const applyChord = (name: ChordName, atTime: number) => {
      const freqs = CHORDS[name];
      padVoices.forEach((o, i) => {
        o.frequency.setTargetAtTime(freqs[i], atTime, 0.18);
      });
      sub.frequency.setTargetAtTime(freqs[0] / 2, atTime, 0.18);
    };

    // ---- Scheduler: 6/8 barcarolle. One chord per bar, rocking eighths. ----
    // tempo nudged by rocking rate.
    let baseBeatMs = 520; // dotted-quarter pulse-ish; tweaked by energy
    let phrase = makePhrase(0.15, false);
    let chordIdx = 0;
    let deceptionsSinceHome = 0;
    let homeBias = 0.12;
    const lullabyStart = ac.currentTime; // for the long fade
    const FADE_TOTAL = 11 * 60; // ~11 min slow lullaby fade

    // visual targets (read by rAF -> setState throttled)
    const vis = { bloom: 0.4, tilt: 0, dip: 0 };

    const stepBar = () => {
      const t = ac.currentTime;
      const name = phrase.chords[chordIdx];
      applyChord(name, t);

      const isCadenceChord = chordIdx === phrase.chords.length - 1;
      const isDominantBefore = chordIdx === phrase.chords.length - 2;

      // melody: gentle two-note rocking figure per bar (the barcarolle lilt).
      // Down-beat = the chord's melody tone; off-beat = a softer 3rd of the
      // chord, an octave-down rocking-back note. Real chord tones throughout.
      const mHz = MELODY[name];
      const vel = 0.12 + rockRef.current.energy * 0.05;
      playNote(mHz, t + 0.02, vel, 0.9);
      const offHz = CHORDS[name][1]; // the chord third, mid register
      playNote(offHz, t + baseBeatMs / 1000 / 2, vel * 0.6, 0.7);

      // ---- cadence visual + audio rewards ----
      if (isDominantBefore) {
        // tension swell
        vis.dip = 0;
      }
      if (isCadenceChord) {
        if (phrase.cadence === "deceptive") {
          // V -> vi : the boat dips, dimmer, bittersweet
          vis.bloom = 0.28;
          vis.dip = 1;
          deceptionsSinceHome += 1;
          // each deception increases the pull toward home next time
          homeBias = Math.min(0.92, homeBias + 0.4);
        } else {
          // V -> I : warm bloom, sparkle, boat settles
          vis.bloom = 1;
          vis.dip = 0;
          playSparkle(t + 0.05);
          deceptionsSinceHome = 0;
          homeBias = 0.12; // reset the journey
        }
      }

      // advance
      chordIdx += 1;
      if (chordIdx >= phrase.chords.length) {
        chordIdx = 0;
        // steady rocking strongly biases toward an authentic landing,
        // and force a home cadence if we've deceived a couple times.
        const force = deceptionsSinceHome >= 2;
        const energyBias = rockRef.current.energy * 0.5;
        phrase = makePhrase(Math.min(0.95, homeBias + energyBias), force);
      }
    };

    // schedule loop using setTimeout chained, tempo follows rocking
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      stepBar();
      // rocking rate nudges tempo: more energy -> slightly faster lilt,
      // but stays gentle. Lulling (low energy) slows it toward sleep.
      const e = rockRef.current.energy;
      baseBeatMs = 600 - e * 140; // 600ms calm .. 460ms when actively rocking
      timer = setTimeout(tick, baseBeatMs);
    };
    timer = setTimeout(tick, 300);

    // ---- INPUT: device motion ----
    const onOrient = (ev: DeviceOrientationEvent) => {
      if (ev.gamma == null && ev.beta == null) return;
      rockRef.current.sawRealInput = true;
      rockRef.current.auto = false;
      // gamma = left-right tilt; use it as the rock axis.
      const g = ev.gamma ?? 0;
      rockRef.current.angle = Math.max(-30, Math.min(30, g));
    };
    const onMotion = (ev: DeviceMotionEvent) => {
      const rot = ev.rotationRate;
      if (!rot) return;
      const r = rot.gamma ?? rot.beta ?? 0;
      if (Math.abs(r) > 0.5) {
        rockRef.current.sawRealInput = true;
        rockRef.current.auto = false;
      }
    };
    if (listenForMotion) {
      window.addEventListener("deviceorientation", onOrient);
      window.addEventListener("devicemotion", onMotion);
    }

    // ---- FALLBACK detection: no motion within 1.5s -> drag mode ----
    const fallbackTimer = setTimeout(() => {
      if (!rockRef.current.sawRealInput) {
        setFellBack(true);
        if (!statusMsg) {
          setStatusMsg("No rocking sensed — drag up and down to rock the boat.");
        }
      }
    }, 1500);

    // ---- AUTO-DEMO: rock by itself until real input arrives ----
    let demoPhase = 0;

    // ---- visual rAF: derive tilt/energy, throttle setState ----
    let lastEmit = 0;
    let smoothTilt = 0;
    const loop = (ts: number) => {
      const rk = rockRef.current;

      if (rk.auto) {
        // gentle self-rocking sine
        demoPhase += 0.018;
        rk.angle = Math.sin(demoPhase) * 16;
      }

      // angular velocity -> rocking energy
      const dv = Math.abs(rk.angle - rk.lastAngle);
      rk.lastAngle = rk.angle;
      rk.velocity = rk.velocity * 0.9 + dv * 0.1;
      // energy: presence of consistent rocking (0..1)
      const targetE = Math.min(1, rk.velocity * 0.6);
      rk.energy = rk.energy * 0.96 + targetE * 0.04;

      smoothTilt = smoothTilt * 0.85 + rk.angle * 0.15;

      // long lullaby fade after enough "home" time
      const elapsed = ac.currentTime - lullabyStart;
      if (elapsed > 30) {
        const fadeT = Math.min(1, (elapsed - 30) / FADE_TOTAL);
        master.gain.setTargetAtTime(0.34 * (1 - fadeT * 0.85), ac.currentTime, 4);
      }

      // ease the visual reward values back to rest
      vis.bloom += (0.45 - vis.bloom) * 0.012;
      vis.dip += (0 - vis.dip) * 0.02;

      if (ts - lastEmit > 60) {
        lastEmit = ts;
        setGlow({
          bloom: vis.bloom,
          tilt: smoothTilt,
          dip: vis.dip,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ---- POINTER fallback: drag up/down to rock ----
    let dragging = false;
    let dragStartY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      dragStartY = e.clientY;
      rockRef.current.auto = false;
      rockRef.current.sawRealInput = true;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - dragStartY;
      rockRef.current.angle = Math.max(-30, Math.min(30, dy / 6));
    };
    const onUp = () => {
      dragging = false;
      // let it drift back to center
      rockRef.current.angle *= 0.5;
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // ---- CLEANUP ----
    cleanupRef.current = () => {
      if (timer) clearTimeout(timer);
      clearTimeout(fallbackTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        master.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      } catch {
        /* ignore */
      }
      padVoices.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* ignore */
        }
      });
      try {
        sub.stop();
        sub.disconnect();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        ac.close().catch(() => {});
      }, 400);
    };
  };

  // unmount cleanup
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // ---- RENDER (minimal inline SVG, near-black) ----
  const bloom = glow.bloom;
  const dip = glow.dip;
  // boat sits on the "sea"; tilt rocks it; dip lowers + dims on deceptive.
  const moonGlow = 0.25 + bloom * 0.75;
  const boatY = 4 + dip * 10;
  const warmHue = 38 + bloom * 8; // warm amber when home
  const seaLift = glow.tilt * 0.6;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* The single glowing scene */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg
          viewBox="0 0 400 400"
          className="h-full w-full max-h-[100vh] max-w-[100vw]"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="moon" cx="50%" cy="42%" r="40%">
              <stop
                offset="0%"
                stopColor={`hsl(${warmHue} 80% 88%)`}
                stopOpacity={moonGlow}
              />
              <stop
                offset="55%"
                stopColor={`hsl(${warmHue} 70% 60%)`}
                stopOpacity={moonGlow * 0.35}
              />
              <stop offset="100%" stopColor="hsl(220 60% 8%)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(220 50% 10%)" />
              <stop offset="100%" stopColor="hsl(225 60% 4%)" />
            </linearGradient>
            <filter id="soft">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
          </defs>

          {/* faint moon halo (breathing bloom) */}
          <circle cx="200" cy="168" r="150" fill="url(#moon)" />

          {/* the sea */}
          <rect x="0" y="250" width="400" height="150" fill="url(#sea)" />

          {/* moon reflection shimmer on water */}
          <ellipse
            cx="200"
            cy={280 + seaLift * 0.2}
            rx={34 + bloom * 18}
            ry="6"
            fill={`hsl(${warmHue} 80% 80%)`}
            opacity={moonGlow * 0.35}
            filter="url(#soft)"
          />

          {/* the boat — rocks with tilt, dips on deceptive, blooms on home */}
          <g
            transform={`translate(200 ${262 + boatY}) rotate(${glow.tilt})`}
            filter="url(#soft)"
          >
            {/* hull */}
            <path
              d="M -30 0 Q 0 18 30 0 L 22 -6 L -22 -6 Z"
              fill={`hsl(${warmHue} 50% ${22 + bloom * 14}%)`}
            />
            {/* warm cabin light — the heart that blooms when home */}
            <circle
              cx="0"
              cy="-9"
              r={4 + bloom * 4}
              fill={`hsl(${warmHue} 90% ${60 + bloom * 25}%)`}
              opacity={0.55 + bloom * 0.45}
            />
            {/* little mast */}
            <line
              x1="0"
              y1="-6"
              x2="0"
              y2="-26"
              stroke={`hsl(${warmHue} 40% 45%)`}
              strokeWidth="1.5"
            />
          </g>
        </svg>
      </div>

      {/* Text overlay */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-5">
        <header className="max-w-md">
          <h1 className="font-mono text-2xl tracking-tight text-foreground">
            Night Boat
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Rock the tablet like a cradle. Close your eyes and listen for the
            music to come home.
          </p>
        </header>

        <div className="flex flex-col items-center gap-4 pb-4">
          {!started && (
            <button
              onClick={begin}
              className="min-h-[64px] min-w-[200px] rounded-full bg-muted px-8 py-4 font-mono text-xl text-foreground ring-1 ring-border transition hover:bg-accent"
            >
              ▶ Begin
            </button>
          )}

          {started && fellBack && (
            <p className="max-w-sm text-center text-base text-violet-300">
              {statusMsg ||
                "Drag up and down anywhere to rock the boat."}
            </p>
          )}

          {started && !fellBack && (
            <p className="text-center text-base text-muted-foreground">
              Rock gently… the boat is sailing home.
            </p>
          )}

          <Link
            href="/dream/680-kids-night-boat/README.md"
            className="font-mono text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </Link>
        </div>
      </div>
    </main>
  );
}
