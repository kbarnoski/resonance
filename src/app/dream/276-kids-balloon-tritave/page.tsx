"use client";
import { useRef, useEffect, useState } from "react";

/* ---------------------------------------------------------------------------
   276 - Balloon Tritave  (kids 4+)
   First non-octave tuning in the lab: equal-tempered Bohlen-Pierce.
   Repeat interval = tritave (3:1). 13 equal divisions of the tritave.
   Step ratio = 3^(1/13) ~= 1.08818  (~146.3 cents per step).
   note(k) = BASE * 3^(k/13).
   --------------------------------------------------------------------------- */

const BASE = 220; // warm A3

// BP scale degree for each balloon. Degrees 0, 6, 10 approximate the 3:5:7
// triad (BP "root" chord), so several balloons sit on a rooted chord.
// 5/3 ~= 884c ~= step 6 ; 7/3 ~= 1467c ~= step 10.
const BALLOONS = [
  { deg: 0, color: "#f43f5e", x: 0.16, y: 0.30, r: 0.085 }, // rose   (root, 3)
  { deg: 6, color: "#f59e0b", x: 0.40, y: 0.62, r: 0.095 }, // amber  (5)
  { deg: 10, color: "#10b981", x: 0.68, y: 0.26, r: 0.090 }, // emerald(7)
  { deg: 3, color: "#06b6d4", x: 0.84, y: 0.55, r: 0.080 }, // cyan
  { deg: 4, color: "#8b5cf6", x: 0.28, y: 0.80, r: 0.078 }, // violet
  { deg: 13, color: "#ec4899", x: 0.58, y: 0.78, r: 0.082 }, // pink (tritave above root)
  { deg: 7, color: "#eab308", x: 0.90, y: 0.84, r: 0.072 }, // gold
];

function bpFreq(deg: number): number {
  return BASE * Math.pow(3, deg / 13);
}

interface BalloonState {
  bob: number; // phase for idle bob
  swell: number; // 0..1 reaction amount, decays
  lastHit: number; // timestamp of last sing
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 -> 0
  color: string;
  id: number;
}

/* --- odd-harmonic clarinet-like BP voice ---------------------------------- */
function singNote(
  actx: AudioContext,
  dest: AudioNode,
  freq: number,
) {
  const now = actx.currentTime;
  // clarinet-ish: mostly ODD partials with decreasing gain (1,3,5,7,9)
  const partials: Array<[number, number]> = [
    [1, 0.5],
    [3, 0.26],
    [5, 0.15],
    [7, 0.08],
    [9, 0.04],
  ];
  const voice = actx.createGain();
  voice.gain.value = 0.9;

  // gentle low-pass so nothing is piercing above ~1.6kHz
  const lp = actx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1600;
  lp.Q.value = 0.4;

  for (const [mult, g] of partials) {
    const f = freq * mult;
    if (f > 5000) continue; // safety: never synthesize harsh highs
    const osc = actx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const env = actx.createGain();
    // soft attack, gentle decay (toddler-safe, click-free)
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(g, now + 0.05);
    env.gain.setTargetAtTime(0.0001, now + 0.18, 0.9);
    osc.connect(env);
    env.connect(voice);
    osc.start(now);
    osc.stop(now + 2.6);
  }
  voice.connect(lp);
  lp.connect(dest);
}

export default function BalloonTritave() {
  const svgRef = useRef<SVGSVGElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const droneRef = useRef<GainNode | null>(null);

  // creature physics (normalized 0..1 coords)
  const posRef = useRef({ x: 0.5, y: 0.5 });
  const velRef = useRef({ x: 0, y: 0 });
  const tiltRef = useRef({ ax: 0, ay: 0 }); // steering acceleration

  const balloonStateRef = useRef<BalloonState[]>(
    BALLOONS.map(() => ({ bob: Math.random() * Math.PI * 2, swell: 0, lastHit: 0 })),
  );
  const balloonElsRef = useRef<Array<SVGGElement | null>>([]);
  const creatureRef = useRef<SVGGElement | null>(null);
  const confettiRef = useRef<Confetti[]>([]);
  const confettiLayerRef = useRef<SVGGElement | null>(null);
  const confettiIdRef = useRef(0);
  const startTimeRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [inputMode, setInputMode] = useState<"tilt" | "move">("move");

  function handleStart() {
    const actx = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.0;
    master.gain.setTargetAtTime(0.85, actx.currentTime, 0.6);
    master.connect(actx.destination);

    // gentle global limiter-ish soft clip via compressor (no sudden loud)
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.disconnect();
    master.connect(comp);
    comp.connect(actx.destination);

    // ---- always-on drone bed: BP root + tritave above, low level ----
    const drone = actx.createGain();
    drone.gain.value = 0.0;
    drone.gain.setTargetAtTime(0.12, actx.currentTime, 1.2);
    const droneLp = actx.createBiquadFilter();
    droneLp.type = "lowpass";
    droneLp.frequency.value = 900;
    drone.connect(droneLp);
    droneLp.connect(master);
    [bpFreq(0), bpFreq(13), bpFreq(0) * 2.0].forEach((f, i) => {
      const o = actx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = actx.createGain();
      g.gain.value = i === 0 ? 0.6 : 0.3;
      // very slow detuned shimmer for warmth
      const lfo = actx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.03;
      const lfoG = actx.createGain();
      lfoG.gain.value = 0.4;
      lfo.connect(lfoG);
      lfoG.connect(o.detune);
      o.connect(g);
      g.connect(drone);
      o.start();
      lfo.start();
    });

    actxRef.current = actx;
    masterRef.current = master;
    droneRef.current = drone;
    startTimeRef.current = actx.currentTime;

    // ---- tilt permission (iOS 13+) ----
    const DOE = (typeof window !== "undefined"
      ? (window.DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        })
      : undefined);
    const attachTilt = () => {
      window.addEventListener("deviceorientation", onOrient);
      setInputMode("tilt");
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((state) => {
          if (state === "granted") attachTilt();
        })
        .catch(() => {
          /* fall back to move */
        });
    } else if (typeof window !== "undefined" && "ondeviceorientation" in window) {
      attachTilt();
    }

    setStarted(true);
  }

  function onOrient(e: DeviceOrientationEvent) {
    // gamma = left/right (-90..90), beta = front/back (-180..180)
    const g = e.gamma ?? 0;
    const b = e.beta ?? 0;
    if (e.gamma !== null || e.beta !== null) {
      // confirm a real sensor is feeding us
      setInputMode("tilt");
    }
    // map tilt to steering acceleration (clamped, gentle)
    tiltRef.current.ax = Math.max(-1, Math.min(1, g / 35));
    tiltRef.current.ay = Math.max(-1, Math.min(1, (b - 35) / 35));
  }

  useEffect(() => {
    if (!started) return;
    const svg = svgRef.current;
    if (!svg) return;

    let raf = 0;
    let prev = performance.now();

    // pointer fallback steering: pointer position -> target accel
    const onPointer = (clientX: number, clientY: number) => {
      const rect = svg.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      tiltRef.current.ax = Math.max(-1, Math.min(1, (px - posRef.current.x) * 4));
      tiltRef.current.ay = Math.max(-1, Math.min(1, (py - posRef.current.y) * 4));
    };
    const onMouseMove = (e: MouseEvent) => onPointer(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      const actx = actxRef.current;
      const t = actx ? actx.currentTime - startTimeRef.current : 0;

      // ---- gentle session lifecycle: after ~14min fade toward lullaby ----
      if (actx && masterRef.current && droneRef.current) {
        if (t > 14 * 60) {
          masterRef.current.gain.setTargetAtTime(0.18, actx.currentTime, 8);
          droneRef.current.gain.setTargetAtTime(0.08, actx.currentTime, 8);
        }
      }

      // ---- physics drift ----
      const ACC = 0.55; // steering strength
      const DRAG = 1.8;
      const vel = velRef.current;
      const pos = posRef.current;
      vel.x += tiltRef.current.ax * ACC * dt;
      vel.y += tiltRef.current.ay * ACC * dt;
      vel.x -= vel.x * DRAG * dt;
      vel.y -= vel.y * DRAG * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      // soft walls (bounce gently, never stuck)
      if (pos.x < 0.04) { pos.x = 0.04; vel.x = Math.abs(vel.x) * 0.4; }
      if (pos.x > 0.96) { pos.x = 0.96; vel.x = -Math.abs(vel.x) * 0.4; }
      if (pos.y < 0.05) { pos.y = 0.05; vel.y = Math.abs(vel.y) * 0.4; }
      if (pos.y > 0.95) { pos.y = 0.95; vel.y = -Math.abs(vel.y) * 0.4; }

      const W = 1000;
      const H = 1000;
      const cx = pos.x * W;
      const cy = pos.y * H;
      if (creatureRef.current) {
        const lean = Math.max(-14, Math.min(14, vel.x * 220));
        creatureRef.current.setAttribute(
          "transform",
          `translate(${cx} ${cy}) rotate(${lean})`,
        );
      }

      // ---- balloons: idle bob + swell decay + collision/brush ----
      const states = balloonStateRef.current;
      for (let i = 0; i < BALLOONS.length; i++) {
        const b = BALLOONS[i];
        const st = states[i];
        st.bob += dt * (0.6 + i * 0.05);
        st.swell += (0 - st.swell) * Math.min(1, dt * 3.2); // decay

        const bx = b.x * W;
        const by = b.y * H + Math.sin(st.bob) * 10;
        const br = b.r * W;

        // brush detection: creature radius ~ 42
        const dx = cx - bx;
        const dy = cy - by;
        const dist = Math.hypot(dx, dy);
        if (dist < br + 42 && now - st.lastHit > 300) {
          st.lastHit = now;
          st.swell = 1;
          if (actx && masterRef.current) {
            singNote(actx, masterRef.current, bpFreq(b.deg));
          }
          // confetti puff
          for (let p = 0; p < 7; p++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 120;
            confettiRef.current.push({
              x: cx,
              y: cy,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 40,
              life: 1,
              color: b.color,
              id: confettiIdRef.current++,
            });
          }
        }

        const el = balloonElsRef.current[i];
        if (el) {
          const scale = 1 + st.swell * 0.22;
          const yoff = -st.swell * 14;
          el.setAttribute(
            "transform",
            `translate(${bx} ${by + yoff}) scale(${scale})`,
          );
        }
      }

      // ---- confetti integrate + render (reuse DOM children) ----
      const layer = confettiLayerRef.current;
      if (layer) {
        const arr = confettiRef.current;
        for (let i = arr.length - 1; i >= 0; i--) {
          const c = arr[i];
          c.life -= dt * 0.9;
          c.vy += 220 * dt; // gravity
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          if (c.life <= 0) arr.splice(i, 1);
        }
        // sync children count
        while (layer.childNodes.length < arr.length) {
          const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          r.setAttribute("width", "14");
          r.setAttribute("height", "14");
          r.setAttribute("rx", "3");
          layer.appendChild(r);
        }
        while (layer.childNodes.length > arr.length) {
          layer.removeChild(layer.lastChild as ChildNode);
        }
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          const r = layer.childNodes[i] as SVGRectElement;
          r.setAttribute("fill", c.color);
          r.setAttribute("opacity", String(Math.max(0, c.life)));
          r.setAttribute(
            "transform",
            `translate(${c.x - 7} ${c.y - 7}) rotate(${c.x * 0.6} 7 7)`,
          );
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("deviceorientation", onOrient);
      const actx = actxRef.current;
      if (actx) {
        try {
          masterRef.current?.gain.setTargetAtTime(0, actx.currentTime, 0.2);
        } catch {
          /* ignore */
        }
        const ref = actx;
        setTimeout(() => {
          ref.close().catch(() => {});
        }, 400);
      }
      actxRef.current = null;
    };
  }, [started]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1a1230] text-foreground select-none">
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-label="A dusk sky full of singing paper balloons"
      >
        <defs>
          {/* dusk gradient sky */}
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1230" />
            <stop offset="60%" stopColor="#241640" />
            <stop offset="100%" stopColor="#2a1840" />
          </linearGradient>
          {/* cut-paper lift: soft drop shadow, NO glow */}
          <filter id="paperLift" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="9"
              floodColor="#0a0618"
              floodOpacity="0.55"
            />
          </filter>
          {/* subtle paper grain */}
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
              result="n"
            />
            <feColorMatrix in="n" type="saturate" values="0" />
            <feComponentTransfer result="g">
              <feFuncA type="linear" slope="0.05" intercept="0" />
            </feComponentTransfer>
            <feComposite in="g" in2="SourceGraphic" operator="over" />
          </filter>
        </defs>

        <rect x="0" y="0" width="1000" height="1000" fill="url(#sky)" />
        {/* soft paper clouds (non-luminous, low contrast) */}
        <g opacity="0.10" filter="url(#paperLift)">
          <ellipse cx="200" cy="160" rx="150" ry="46" fill="#fff" />
          <ellipse cx="760" cy="120" rx="120" ry="40" fill="#fff" />
          <ellipse cx="520" cy="930" rx="200" ry="58" fill="#fff" />
        </g>

        {/* balloons */}
        {BALLOONS.map((b, i) => {
          const br = b.r * 1000;
          return (
            <g
              key={i}
              ref={(el) => {
                balloonElsRef.current[i] = el;
              }}
              filter="url(#paperLift)"
            >
              {/* string */}
              <path
                d={`M0 ${br * 0.95} q ${br * 0.25} ${br * 0.9} 0 ${br * 1.7}`}
                stroke="#0d0820"
                strokeWidth="3"
                fill="none"
                opacity="0.5"
              />
              {/* basket */}
              <path
                d={`M${-br * 0.18} ${br * 0.95} h ${br * 0.36} l ${-br * 0.05} ${br * 0.34} h ${-br * 0.26} z`}
                fill="#7a4a1f"
              />
              {/* balloon body (cut-paper, matte) */}
              <path
                d={`M0 ${-br} C ${br * 1.15} ${-br} ${br * 1.0} ${br * 0.75} 0 ${br * 0.98}
                    C ${-br * 1.0} ${br * 0.75} ${-br * 1.15} ${-br} 0 ${-br} Z`}
                fill={b.color}
              />
              {/* paper highlight panel */}
              <path
                d={`M0 ${-br} C ${br * 0.5} ${-br} ${br * 0.55} ${br * 0.1} ${br * 0.12} ${br * 0.6}
                    C ${-br * 0.1} ${br * 0.2} ${-br * 0.2} ${-br * 0.6} 0 ${-br} Z`}
                fill="#ffffff"
                opacity="0.16"
              />
            </g>
          );
        })}

        {/* paper bird/cloud creature */}
        <g
          ref={creatureRef}
          filter="url(#paperLift)"
          transform="translate(500 500)"
        >
          {/* body cloud */}
          <ellipse cx="0" cy="0" rx="46" ry="34" fill="#fdf6e3" />
          <ellipse cx="-26" cy="6" rx="22" ry="18" fill="#fdf6e3" />
          <ellipse cx="26" cy="6" rx="22" ry="18" fill="#fdf6e3" />
          {/* wings */}
          <path d="M-30 -6 q -34 -26 -52 2 q 30 6 52 10 z" fill="#ffe7a8" />
          <path d="M30 -6 q 34 -26 52 2 q -30 6 -52 10 z" fill="#ffe7a8" />
          {/* eyes */}
          <circle cx="-12" cy="-6" r="5" fill="#2a1840" />
          <circle cx="12" cy="-6" r="5" fill="#2a1840" />
          {/* beak */}
          <path d="M-6 4 l 12 0 l -6 9 z" fill="#f59e0b" />
        </g>

        {/* confetti layer (filled imperatively) */}
        <g ref={confettiLayerRef} />

        {/* full-canvas grain overlay (very subtle) */}
        <rect
          x="0"
          y="0"
          width="1000"
          height="1000"
          filter="url(#grain)"
          opacity="0.5"
          pointerEvents="none"
        />
      </svg>

      {/* start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#1a1230]/85 px-6 text-center">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Balloon Sky
          </h1>
          <p className="mt-3 max-w-md text-base text-muted-foreground">
            Tilt your tablet to float the little bird across the sky. Brush a
            balloon to make it sing.
          </p>
          <button
            onClick={handleStart}
            className="mt-7 flex items-center gap-3 rounded-full bg-violet-500 px-8 py-5 text-xl font-semibold text-foreground shadow-lg active:scale-95"
            style={{ minWidth: 64, minHeight: 64 }}
          >
            <span aria-hidden className="text-2xl">🎈</span>
            Tap to begin
          </button>
        </div>
      )}

      {/* status + design notes */}
      {started && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 p-3 font-mono text-base text-muted-foreground">
          {inputMode === "tilt" ? "Tilt to steer" : "Move to steer (no tilt sensor)"}
        </div>
      )}
      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/276-kids-balloon-tritave/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-0 right-0 z-10 p-3 font-mono text-base text-muted-foreground underline decoration-muted-foreground underline-offset-2"
      >
        design notes
      </a>
    </div>
  );
}
