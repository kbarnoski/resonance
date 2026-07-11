"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * Button Garden — a game-controller instrument for the smallest hands.
 * Mash the big buttons; a garden of light blooms and sings.
 *
 * Voices = a warm JUST-INTONATION chord (NOT pentatonic):
 *   ratios over the current root — 1/1, 5/4, 3/2, 15/8 (root, major third,
 *   fifth, major seventh). The d-pad transposes the root and shifts the
 *   "season" palette. Triggers swell a wind pad. Left stick sways the field.
 */

// Just-intonation ratios for the four face voices (over the active root).
const VOICE_RATIOS = [1 / 1, 5 / 4, 3 / 2, 15 / 8];

// Four "seasons" — each is a root frequency + a palette mood.
interface Season {
  name: string;
  root: number; // Hz of the 1/1 voice
  sky: string; // background base
  voiceColors: [string, string, string, string];
}

const SEASONS: Season[] = [
  {
    name: "spring",
    root: 174.61, // F3
    sky: "#05140f",
    voiceColors: ["#a3e635", "#34d399", "#5eead4", "#bef264"],
  },
  {
    name: "summer",
    root: 196.0, // G3
    sky: "#140a05",
    voiceColors: ["#fbbf24", "#fb923c", "#f472b6", "#fde047"],
  },
  {
    name: "autumn",
    root: 146.83, // D3
    sky: "#14080a",
    voiceColors: ["#fb7185", "#f97316", "#facc15", "#fca5a5"],
  },
  {
    name: "winter",
    root: 130.81, // C3
    sky: "#070b16",
    voiceColors: ["#818cf8", "#60a5fa", "#67e8f9", "#c4b5fd"],
  },
];

const KEY_LABELS = ["A", "S", "D", "F"];

// Idle auto-demo kicks in after this many seconds of no real input.
const IDLE_MS = 2000;

interface Flower {
  id: number;
  x: number;
  y: number;
  voice: number;
  born: number; // seconds (audio-context-independent perf time)
  bloomT: number; // 0 -> 1 grow
  sustained: boolean; // held button -> breathes & stays
  fade: number; // 1 -> 0 when released
  gain: GainNode | null;
  stop: ((t: number) => void) | null;
  baseR: number;
}

let _gid = 0;

function drawFlower(
  ctx: CanvasRenderingContext2D,
  f: Flower,
  color: string,
  now: number,
  sway: number,
) {
  if (f.fade <= 0) return;
  const breathe = f.sustained ? 1 + 0.09 * Math.sin(now * 2.4 + f.id) : 1;
  const r = f.baseR * f.bloomT * breathe;
  const alpha = f.fade;
  const x = f.x + sway * 26 * (0.4 + (f.y / 1000));
  const y = f.y;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);

  // soft outer halo
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
  grad.addColorStop(0, color + "cc");
  grad.addColorStop(0.4, color + "55");
  grad.addColorStop(1, color + "00");
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // petals — six glowing lobes
  const petals = 6;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate((i / petals) * Math.PI * 2 + now * 0.15);
    const pg = ctx.createRadialGradient(0, -r * 1.1, 0, 0, -r * 1.1, r * 0.9);
    pg.addColorStop(0, color);
    pg.addColorStop(1, color + "00");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.1, r * 0.5, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // bright core
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.5, r * 0.42), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function KidsButtonGarden() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [hasPad, setHasPad] = useState(false);
  const [seasonName, setSeasonName] = useState(SEASONS[0].name);
  const [usingDemo, setUsingDemo] = useState(true);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ---- AudioContext (built inside the gesture that set started) ----
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const actx = new Ctx();
    void actx.resume();

    // Kid-safe master chain: gain -> lowpass -> brick-wall limiter -> out
    const master = actx.createGain();
    master.gain.value = 0.8;
    const lp = actx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 8000;
    const limiter = actx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(lp).connect(limiter).connect(actx.destination);

    // ---- Drone: root + fifth, swelled by triggers ----
    let seasonIdx = 0;
    const droneGain = actx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.connect(master);
    const droneOscs: OscillatorEither[] = [];
    type OscillatorEither = { osc: OscillatorNode; mul: number };
    const buildDrone = () => {
      const root = SEASONS[seasonIdx].root / 2; // an octave down for body
      [1, 1.5].forEach((mul) => {
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = root * mul;
        const g = actx.createGain();
        g.gain.value = mul === 1 ? 0.6 : 0.35;
        osc.connect(g).connect(droneGain);
        osc.start();
        droneOscs.push({ osc, mul });
      });
    };
    buildDrone();
    const retuneDrone = () => {
      const root = SEASONS[seasonIdx].root / 2;
      const t = actx.currentTime;
      for (const d of droneOscs) {
        d.osc.frequency.linearRampToValueAtTime(root * d.mul, t + 0.6);
      }
    };

    // Soft filtered-noise wind layered on the drone (triggers swell it).
    const noiseBuf = actx.createBuffer(
      1,
      actx.sampleRate * 2,
      actx.sampleRate,
    );
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const windSrc = actx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    const windFilter = actx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.7;
    const windGain = actx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(master);
    windSrc.start();

    // ---- Canvas sizing ----
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const flowers: Flower[] = [];

    // ---- Voice synthesis ----
    const bloomVoice = (voice: number): { gain: GainNode; stop: (t: number) => void } => {
      const hz = SEASONS[seasonIdx].root * VOICE_RATIOS[voice];
      const now = actx.currentTime;
      const vGain = actx.createGain();
      vGain.gain.setValueAtTime(0.0001, now);
      vGain.gain.linearRampToValueAtTime(0.22, now + 0.12); // soft attack
      vGain.connect(master);

      const o1 = actx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = hz;
      const o2 = actx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = hz * 2.001; // gentle detune for shimmer
      const g2 = actx.createGain();
      g2.gain.value = 0.18;
      o1.connect(vGain);
      o2.connect(g2).connect(vGain);
      o1.start(now);
      o2.start(now);

      const stop = (relStart: number) => {
        const t = Math.max(actx.currentTime, relStart);
        vGain.gain.cancelScheduledValues(t);
        vGain.gain.setValueAtTime(vGain.gain.value, t);
        vGain.gain.linearRampToValueAtTime(0.0001, t + 1.6); // long release
        o1.stop(t + 1.7);
        o2.stop(t + 1.7);
      };
      return { gain: vGain, stop };
    };

    // ---- Haptics (feature-detected, never required) ----
    const rumble = (pad: Gamepad | null, dur: number, weak: number, strong: number) => {
      if (!pad) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const va = (pad as any).vibrationActuator;
      if (!va || typeof va.playEffect !== "function") return;
      try {
        va.playEffect("dual-rumble", {
          duration: dur,
          weakMagnitude: weak,
          strongMagnitude: strong,
        });
      } catch {
        /* haptics unavailable — silently ignore */
      }
    };

    // ---- Bloom a flower (real input or demo) ----
    const bloom = (voice: number, sustained: boolean, pad: Gamepad | null): Flower => {
      // limit live flowers
      const live = flowers.filter((f) => f.fade > 0);
      if (live.length > 22) {
        // retire the oldest non-sustained flower
        const victim = live.find((f) => !f.sustained) || live[0];
        if (victim.stop) victim.stop(actx.currentTime);
        victim.sustained = false;
        victim.fade = Math.min(victim.fade, 0.6);
      }
      const { gain, stop } = bloomVoice(voice);
      const margin = 90;
      const f: Flower = {
        id: _gid++,
        x: margin + Math.random() * (w - margin * 2),
        y: margin + Math.random() * (h - margin * 2),
        voice,
        born: performance.now() / 1000,
        bloomT: 0,
        sustained,
        fade: 1,
        gain,
        stop,
        baseR: 26 + Math.random() * 22,
      };
      flowers.push(f);
      rumble(pad, 140, 0.35, 0.55);
      return f;
    };

    // ---- Gamepad polling state ----
    const prevButtons: boolean[] = [];
    const heldFlower: (Flower | null)[] = [null, null, null, null];
    let prevDpadUp = false;
    let prevDpadDown = false;
    let prevDpadLeft = false;
    let prevDpadRight = false;
    let lastInput = performance.now();
    let demoMode = true;
    let swayTarget = 0;
    let sway = 0;

    const markInput = () => {
      lastInput = performance.now();
      if (demoMode) {
        demoMode = false;
        setUsingDemo(false);
      }
    };

    const shiftSeason = (dir: number, pad: Gamepad | null) => {
      seasonIdx = (seasonIdx + dir + SEASONS.length) % SEASONS.length;
      setSeasonName(SEASONS[seasonIdx].name);
      retuneDrone();
      rumble(pad, 220, 0.2, 0.3);
    };

    // Face-button indices (standard mapping): 0=A 1=B 2=X 3=Y
    // We map them to the four voices in a pleasant order.
    const FACE = [0, 1, 2, 3];

    const pollPad = (pad: Gamepad) => {
      // face buttons -> voices (edge-triggered)
      for (let v = 0; v < 4; v++) {
        const bi = FACE[v];
        const btn = pad.buttons[bi];
        const pressed = !!btn && (btn.pressed || btn.value > 0.5);
        const was = prevButtons[bi] || false;
        if (pressed && !was) {
          markInput();
          heldFlower[v] = bloom(v, true, pad);
        } else if (!pressed && was) {
          const f = heldFlower[v];
          if (f) {
            f.sustained = false;
            if (f.stop) f.stop(actx.currentTime);
            f.fade = Math.min(f.fade, 0.85);
            heldFlower[v] = null;
          }
        }
        prevButtons[bi] = pressed;
      }

      // d-pad (12 up, 13 down, 14 left, 15 right) -> season
      const up = !!pad.buttons[12]?.pressed;
      const down = !!pad.buttons[13]?.pressed;
      const left = !!pad.buttons[14]?.pressed;
      const right = !!pad.buttons[15]?.pressed;
      if (up && !prevDpadUp) {
        markInput();
        shiftSeason(1, pad);
      }
      if (down && !prevDpadDown) {
        markInput();
        shiftSeason(-1, pad);
      }
      if (right && !prevDpadRight) {
        markInput();
        shiftSeason(1, pad);
      }
      if (left && !prevDpadLeft) {
        markInput();
        shiftSeason(-1, pad);
      }
      prevDpadUp = up;
      prevDpadDown = down;
      prevDpadLeft = left;
      prevDpadRight = right;

      // triggers (6 LT, 7 RT) -> wind swell
      const lt = pad.buttons[6]?.value ?? 0;
      const rt = pad.buttons[7]?.value ?? 0;
      const trig = Math.max(lt, rt);
      if (trig > 0.05) markInput();
      const targetWind = trig * 0.16;
      windGain.gain.setTargetAtTime(targetWind, actx.currentTime, 0.15);
      droneGain.gain.setTargetAtTime(0.12 + trig * 0.1, actx.currentTime, 0.3);

      // left stick (axes 0 x, 1 y) -> sway parallax
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.18) {
        markInput();
        swayTarget = ax;
      } else {
        swayTarget = 0;
      }
    };

    // ---- Keyboard fallback ----
    const keyVoiceMap: Record<string, number> = {
      a: 0,
      s: 1,
      d: 2,
      f: 3,
      j: 0,
      k: 1,
      l: 2,
      ";": 3,
    };
    const keyHeld: (Flower | null)[] = [null, null, null, null];
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keyVoiceMap) {
        if (e.repeat) return;
        markInput();
        const v = keyVoiceMap[k];
        if (!keyHeld[v]) keyHeld[v] = bloom(v, true, null);
        e.preventDefault();
      } else if (k === "arrowup" || k === "arrowright") {
        markInput();
        shiftSeason(1, null);
        e.preventDefault();
      } else if (k === "arrowdown" || k === "arrowleft") {
        markInput();
        shiftSeason(-1, null);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in keyVoiceMap) {
        const v = keyVoiceMap[k];
        const f = keyHeld[v];
        if (f) {
          f.sustained = false;
          if (f.stop) f.stop(actx.currentTime);
          f.fade = Math.min(f.fade, 0.85);
          keyHeld[v] = null;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // On-screen tappable buttons -> custom events from the React layer
    const onScreenTap = (e: Event) => {
      const detail = (e as CustomEvent).detail as { voice: number } | undefined;
      if (!detail) return;
      markInput();
      const f = bloom(detail.voice, false, null);
      // auto-release shortly after for a tap
      window.setTimeout(() => {
        f.sustained = false;
        if (f.stop) f.stop(actx.currentTime);
        f.fade = Math.min(f.fade, 0.85);
      }, 260);
    };
    const onScreenSeason = (e: Event) => {
      const detail = (e as CustomEvent).detail as { dir: number } | undefined;
      if (!detail) return;
      markInput();
      shiftSeason(detail.dir, null);
    };
    window.addEventListener("bg-tap", onScreenTap as EventListener);
    window.addEventListener("bg-season", onScreenSeason as EventListener);

    // gamepad connect/disconnect
    const onConnect = () => setHasPad(true);
    const onDisconnect = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      setHasPad(Array.from(pads).some((p) => !!p));
    };
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    // initial check
    {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      if (Array.from(pads).some((p) => !!p)) setHasPad(true);
    }

    // ---- Idle auto-demo scheduler ----
    let demoNextBloom = 0;
    let demoSeasonNext = performance.now() + 9000;
    const runDemoStep = (nowMs: number, firstPad: Gamepad | null) => {
      if (nowMs >= demoNextBloom) {
        const v = Math.floor(Math.random() * 4);
        const f = bloom(v, false, firstPad);
        // gentle self-release
        window.setTimeout(() => {
          f.sustained = false;
          if (f.stop) f.stop(actx.currentTime);
          f.fade = Math.min(f.fade, 0.9);
        }, 1400 + Math.random() * 1200);
        demoNextBloom = nowMs + 900 + Math.random() * 900;
        // breathe the wind a little so the muted glance still moves
        windGain.gain.setTargetAtTime(0.05, actx.currentTime, 0.4);
        droneGain.gain.setTargetAtTime(0.13, actx.currentTime, 0.5);
      }
      if (nowMs >= demoSeasonNext) {
        shiftSeasonSilent();
        demoSeasonNext = nowMs + 9000 + Math.random() * 4000;
      }
    };
    const shiftSeasonSilent = () => {
      seasonIdx = (seasonIdx + 1) % SEASONS.length;
      setSeasonName(SEASONS[seasonIdx].name);
      retuneDrone();
    };

    // ---- Main loop ----
    let raf = 0;
    const tick = (nowMs: number) => {
      const now = nowMs / 1000;

      // poll gamepads
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let firstPad: Gamepad | null = null;
      for (const p of pads) {
        if (p) {
          if (!firstPad) firstPad = p;
          pollPad(p);
        }
      }

      // idle -> demo
      if (nowMs - lastInput > IDLE_MS) {
        if (!demoMode) {
          demoMode = true;
          setUsingDemo(true);
        }
        runDemoStep(nowMs, firstPad);
      }

      // sway easing
      sway += (swayTarget - sway) * 0.05;

      // background — season sky with soft trails
      const sky = SEASONS[seasonIdx].sky;
      // hex -> rgb for translucent fill
      const r = parseInt(sky.slice(1, 3), 16);
      const g = parseInt(sky.slice(3, 5), 16);
      const b = parseInt(sky.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
      ctx.fillRect(0, 0, w, h);

      // ground glow at bottom
      const gg = ctx.createLinearGradient(0, h * 0.6, 0, h);
      gg.addColorStop(0, "rgba(0,0,0,0)");
      gg.addColorStop(1, SEASONS[seasonIdx].voiceColors[0] + "10");
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, w, h);

      // update + draw flowers
      const colors = SEASONS[seasonIdx].voiceColors;
      for (let i = flowers.length - 1; i >= 0; i--) {
        const f = flowers[i];
        f.bloomT = Math.min(1, f.bloomT + 0.06);
        if (!f.sustained) {
          f.fade -= 0.012;
        }
        if (f.fade <= 0) {
          flowers.splice(i, 1);
          continue;
        }
        drawFlower(ctx, f, colors[f.voice], now, sway);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("bg-tap", onScreenTap as EventListener);
      window.removeEventListener("bg-season", onScreenSeason as EventListener);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      void actx.close();
    };
  }, [started]);

  // ---- Pre-start gate (creates AudioContext inside the gesture) ----
  if (!started) {
    return (
      <div className="min-h-screen bg-[#05140f] flex flex-col items-center justify-center text-foreground px-6">
        <div className="max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="text-5xl">🎮 🌷 🌼</div>
          <h1 className="text-3xl font-bold text-foreground">Button Garden</h1>
          <p className="text-base text-foreground leading-relaxed">
            Hold a game controller and mash the big buttons. A garden of light
            blooms and sings — no screen-tapping needed. No controller? Press{" "}
            <span className="font-mono text-foreground">A S D F</span> on the
            keyboard, or use the on-screen buttons.
          </p>
          <button
            onPointerDown={() => setStarted(true)}
            className="mt-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground font-semibold text-lg rounded-2xl px-8 py-4 min-h-[64px] min-w-[220px] transition-colors"
          >
            Open the garden
          </button>
        </div>
        <Link
          href="/dream"
          className="absolute bottom-6 text-muted-foreground text-base hover:text-foreground transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    );
  }

  const tapVoice = (v: number) =>
    window.dispatchEvent(new CustomEvent("bg-tap", { detail: { voice: v } }));
  const tapSeason = (dir: number) =>
    window.dispatchEvent(new CustomEvent("bg-season", { detail: { dir } }));

  return (
    <div className="relative min-h-screen bg-[#05140f] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full touch-none"
        style={{ background: "#05140f" }}
      />

      {/* Status strip */}
      <div className="fixed top-4 left-0 right-0 flex justify-center pointer-events-none px-4">
        <span className="text-muted-foreground text-base font-mono bg-black/40 px-3 py-1.5 rounded-full">
          season: <span className="text-foreground">{seasonName}</span>
          {usingDemo ? " · auto-demo (press anything)" : ""}
        </span>
      </div>

      {/* No-controller prompt — clearly visible, never dimmed */}
      {!hasPad && (
        <div className="fixed top-16 left-0 right-0 flex justify-center pointer-events-none px-4">
          <span className="text-violet-300/95 text-base text-center bg-black/45 px-4 py-2 rounded-xl max-w-md">
            Plug in a game controller and press the big buttons — or use{" "}
            <span className="font-mono">A S D F</span> / the buttons below.
          </span>
        </div>
      )}

      {/* On-screen fallback controls */}
      <div className="fixed bottom-6 left-0 right-0 flex flex-col items-center gap-3 px-4">
        <div className="flex gap-3 flex-wrap justify-center">
          {KEY_LABELS.map((label, v) => (
            <button
              key={label}
              onPointerDown={(e) => {
                e.preventDefault();
                tapVoice(v);
              }}
              className="min-h-[56px] min-w-[56px] px-4 py-2.5 rounded-2xl bg-muted hover:bg-accent active:bg-muted text-foreground text-xl font-mono font-bold transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              tapSeason(-1);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-muted hover:bg-accent active:bg-muted text-foreground text-base font-mono transition-colors"
          >
            ◀ season
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              tapSeason(1);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-muted hover:bg-accent active:bg-muted text-foreground text-base font-mono transition-colors"
          >
            season ▶
          </button>
        </div>
      </div>

      {/* Design notes */}
      <details className="fixed top-4 right-4 max-w-xs text-foreground bg-black/55 rounded-xl px-3 py-2 pointer-events-auto">
        <summary className="cursor-pointer text-base text-foreground font-mono">
          Design notes
        </summary>
        <p className="mt-2 text-base text-muted-foreground leading-relaxed">
          A controller-first instrument for the smallest hands. Face buttons are
          four warm just-intonation voices (root, 3rd, 5th, 7th); each press
          blooms a glowing flower and sings. The d-pad shifts the season
          (palette + root). Triggers swell the wind; the left stick sways the
          field; gentle rumble thumps on each bloom when the pad supports it.
        </p>
      </details>

      <Link
        href="/dream"
        className="fixed bottom-2 left-4 text-muted-foreground text-base hover:text-foreground transition-colors z-10"
      >
        ← dream lab
      </Link>
    </div>
  );
}
