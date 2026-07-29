"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import {
  BEAT_MS,
  CHORD_NAMES,
  PROGRESSION,
  beatIndexForElapsed,
  beatPhase,
  chordIndexForBeat,
  clamp,
  fieldFreqs,
  freqToT,
  pullTowardField,
  tToFreq,
} from "./harmony";
import { createCommonsAudio, type CommonsAudio } from "./audio";
import {
  broadcastAvailable,
  makeAutopilot,
  makeCompanion,
  makeLoopback,
  makePeerId,
  makeWebrtc,
  webrtcAvailable,
  type Autopilot,
  type Companion,
  type CommonsEvent,
  type Transport,
  type WebrtcLink,
} from "./net";

// ── Geometry (SVG user units) ────────────────────────────────────────────
const W = 1000;
const H = 560;
const PAD_X = 70;
const PAD_Y = 56;
const FREQ_LO = 130;
const FREQ_HI = 840;

const LOCAL = 0;
const OTHER = 1;

const NUM_GRID = 18;
const NUM_FIL = 22;

const LOCAL_HUE = 273;
const OTHER_HUE = 283;

const AUTOPILOT_IDLE_MS = 3000;

function presenceHsl(idx: 0 | 1, light = 66, alpha = 1): string {
  const h = idx === LOCAL ? LOCAL_HUE : OTHER_HUE;
  return alpha >= 1
    ? `hsl(${h} 72% ${light}%)`
    : `hsl(${h} 72% ${light}% / ${alpha})`;
}

function pitchToY(freq: number): number {
  const t = freqToT(freq, FREQ_LO, FREQ_HI);
  return PAD_Y + (1 - t) * (H - 2 * PAD_Y);
}

function yToFreq(y: number): number {
  const t = 1 - clamp((y - PAD_Y) / (H - 2 * PAD_Y), 0, 1);
  return tToFreq(t, FREQ_LO, FREQ_HI);
}

// ── mutable visual pools ─────────────────────────────────────────────────
interface GridSlot {
  active: boolean;
  freq: number;
  y: number;
  alpha: number;
  alphaTarget: number;
  pulse: number;
}

interface Filament {
  active: boolean;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  born: number;
  hue: number;
}

interface PresenceVis {
  homeX: number;
  homeY: number;
  chaseY: number;
  targetY: number;
  lastContribAt: number;
  pulse: number;
  phase: number;
}

const DESIGN_NOTES = `The one question: what if Resonance were a shared room where two people are simply present together in sound — weaving lines into one drifting harmonic field, with no score, no winner, just company?

How it works: a fixed, deterministic modal chord progression (D Dorian, eight diatonic 7th chords, always sharing tones with their neighbours) drifts on a shared "beat" clock — a small integer both sides agree on rather than a wall-clock timestamp. Anyone present — hum into the mic or tap the field — contributes a tone. That tone is never snapped to a scale; it's only pulled SOFTLY toward the nearest tone of the current chord, so the room always leans consonant while pitch stays continuous, glided (portamento), never gridded. Each contribution pulses your bloom and sends a filament toward the other presence — two lines slowly weaving into one field.

Alone, a synthetic companion joins: it listens, waits a breath, answers with a complementary tone in open space, and occasionally initiates if the room's been quiet. A deterministic self-demo autopilot fills in for you too, once idle, so the piece is alive to watch even with no mic, no click, and no second person.

Connecting a second device is peer-to-peer, no server: Create room produces an invite blob, Join room turns it into an answer, paste that back and an RTCDataChannel carries only tiny {pitch, strength, beat} intents — never audio — so each browser re-synthesises locally.

Reference: NIME 2026 (New Interfaces for Musical Expression, London) and "A Design Space for Live Music Agents" (arXiv:2602.05064) frame ensemble music as a socially embedded practice of trust, timing, and mutual anticipation within a shared harmonic/rhythmic framework. This piece tries to make that shared framework the medium itself, rather than a backdrop for a performance.`;

export default function CommonsPage() {
  const [phase, setPhase] = useState<"idle" | "live">("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<"solo" | "loopback" | "webrtc">("solo");
  const [statusText, setStatusText] = useState("Solo · companion present");
  const [notice, setNotice] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState(CHORD_NAMES[0]);
  const [demoing, setDemoing] = useState(false);

  const [rtcOpen, setRtcOpen] = useState(false);
  const [rtcRole, setRtcRole] = useState<"idle" | "host" | "guest">("idle");
  const [rtcOut, setRtcOut] = useState("");
  const [rtcIn, setRtcIn] = useState("");
  const [rtcHint, setRtcHint] = useState("");

  const mic = useMicAnalyser({ smoothing: 0.8, gain: 1.6, onsetThreshold: 1.5 });

  // engine refs
  const audioRef = useRef<CommonsAudio | null>(null);
  const companionRef = useRef<Companion | null>(null);
  const autopilotRef = useRef<Autopilot | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const webrtcRef = useRef<WebrtcLink | null>(null);
  const rafRef = useRef<number | null>(null);
  const peerIdRef = useRef<string>("");
  const roleRef = useRef<"host" | "guest" | null>(null);

  // shared clock
  const startPerfRef = useRef<number>(0);
  const beatOffsetRef = useRef<number>(0);
  const currentChordRef = useRef<number>(-1);
  const soloModeRef = useRef<boolean>(true);
  const lastRealInputAtRef = useRef<number>(-Infinity);
  const lastMicTriggerRef = useRef<number>(-Infinity);
  const prevAmpRef = useRef<number>(0);
  const lastTapRef = useRef<number>(-Infinity);

  // visual state
  const gridRef = useRef<GridSlot[]>([]);
  const filRef = useRef<Filament[]>([]);
  const filHeadRef = useRef(0);
  const presRef = useRef<PresenceVis[]>([]);

  // DOM element pools
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gridEls = useRef<(SVGLineElement | null)[]>([]);
  const filEls = useRef<(SVGPathElement | null)[]>([]);
  const presEls = useRef<(SVGGElement | null)[]>([]);
  const washRef = useRef<SVGRectElement | null>(null);
  const washStopARef = useRef<SVGStopElement | null>(null);
  const washStopBRef = useRef<SVGStopElement | null>(null);

  // `mic` is a fresh object every render (its `running`/`error` come from
  // useState inside the hook). stepFrame is a long-lived, self-recursive
  // rAF loop — it must read the LATEST mic state via a ref rather than
  // depend on `mic` directly, or it would keep recursing with the stale
  // snapshot captured when the loop started.
  const micRef = useRef(mic);
  useEffect(() => {
    micRef.current = mic;
  }, [mic]);

  // ── init pools once per session ─────────────────────────────────────────
  const initState = useCallback(() => {
    gridRef.current = Array.from({ length: NUM_GRID }, () => ({
      active: false,
      freq: 0,
      y: 0,
      alpha: 0,
      alphaTarget: 0,
      pulse: 0,
    }));
    filRef.current = Array.from({ length: NUM_FIL }, () => ({
      active: false,
      ax: 0,
      ay: 0,
      bx: 0,
      by: 0,
      born: 0,
      hue: LOCAL_HUE,
    }));
    filHeadRef.current = 0;
    presRef.current = [
      {
        homeX: W * 0.3,
        homeY: H / 2,
        chaseY: H / 2,
        targetY: H / 2,
        lastContribAt: -Infinity,
        pulse: 0,
        phase: 0.4,
      },
      {
        homeX: W * 0.7,
        homeY: H / 2,
        chaseY: H / 2,
        targetY: H / 2,
        lastContribAt: -Infinity,
        pulse: 0,
        phase: 2.1,
      },
    ];
    currentChordRef.current = -1;
  }, []);

  // ── chord change: glide the bed + rebuild the gridline pool ─────────────
  const applyChord = useCallback((chordIndex: number) => {
    audioRef.current?.setChord(chordIndex);
    setChordLabel(CHORD_NAMES[chordIndex]);

    const freqs = fieldFreqs(chordIndex, FREQ_LO, FREQ_HI);
    const wanted = new Set(freqs.map((f) => Math.round(f * 100)));
    const slots = gridRef.current;
    const matched = new Set<number>();

    for (const s of slots) {
      if (!s.active) continue;
      const key = Math.round(s.freq * 100);
      if (wanted.has(key)) {
        s.alphaTarget = 1;
        matched.add(key);
      } else {
        s.alphaTarget = 0;
      }
    }
    for (const f of freqs) {
      const key = Math.round(f * 100);
      if (matched.has(key)) continue;
      let slot = slots.find((s) => !s.active);
      if (!slot) slot = slots.find((s) => s.alphaTarget === 0 && s.alpha < 0.05);
      if (!slot) continue;
      slot.active = true;
      slot.freq = f;
      slot.y = pitchToY(f);
      slot.alpha = 0;
      slot.alphaTarget = 1;
      slot.pulse = 0;
    }
  }, []);

  // ── excite: the one path every contribution (local, remote, companion,
  // autopilot) funnels through for its visual consequences ────────────────
  const exciteVisual = useCallback((presence: 0 | 1, freq: number, now: number) => {
    const p = presRef.current[presence];
    if (!p) return;
    p.targetY = pitchToY(freq);
    p.lastContribAt = now;
    p.pulse = 1;

    // Bump the nearest gridline.
    let nearest: GridSlot | null = null;
    let bestDist = Infinity;
    for (const s of gridRef.current) {
      if (!s.active) continue;
      const d = Math.abs(s.freq - freq);
      if (d < bestDist) {
        bestDist = d;
        nearest = s;
      }
    }
    if (nearest) nearest.pulse = 1;

    // Spawn a filament from this presence toward the other one.
    const other = presRef.current[presence === LOCAL ? OTHER : LOCAL];
    if (other) {
      const slot = filRef.current[filHeadRef.current];
      filHeadRef.current = (filHeadRef.current + 1) % NUM_FIL;
      slot.active = true;
      slot.ax = p.homeX;
      slot.ay = p.chaseY;
      slot.bx = other.homeX;
      slot.by = other.chaseY;
      slot.born = now;
      slot.hue = presence === LOCAL ? LOCAL_HUE : OTHER_HUE;
    }
  }, []);

  const contributeOther = useCallback(
    (freq: number, strength: number, now: number) => {
      audioRef.current?.contribute(OTHER, freq, strength);
      exciteVisual(OTHER, freq, now);
    },
    [exciteVisual]
  );

  const contributeLocal = useCallback(
    (rawFreq: number, strength: number, real: boolean) => {
      const now = performance.now() - startPerfRef.current;
      const chordIdx = Math.max(0, currentChordRef.current);
      const target = pullTowardField(rawFreq, chordIdx);
      audioRef.current?.contribute(LOCAL, target, strength);
      exciteVisual(LOCAL, target, now);
      companionRef.current?.noteLocal(target, now);
      if (transportRef.current) {
        const elapsedShared = now + beatOffsetRef.current;
        transportRef.current.send({
          kind: "contribute",
          pitch: target,
          strength,
          beat: beatIndexForElapsed(elapsedShared),
          t: elapsedShared,
        });
      }
      if (real) lastRealInputAtRef.current = now;
    },
    [exciteVisual]
  );

  const handleRemote = useCallback(
    (ev: CommonsEvent) => {
      const now = performance.now() - startPerfRef.current;
      if (ev.kind === "contribute") {
        contributeOther(ev.pitch, ev.strength, now);
      } else if (ev.kind === "sync") {
        const hostElapsed = ev.beat * BEAT_MS + ev.msIntoBeat;
        beatOffsetRef.current = hostElapsed - now;
      }
    },
    [contributeOther]
  );

  // ── animation loop ────────────────────────────────────────────────────
  const stepFrame = useCallback(() => {
    const nowAbs = performance.now();
    const now = nowAbs - startPerfRef.current; // local elapsed (ms)
    const shared = now + beatOffsetRef.current;
    const beat = beatIndexForElapsed(shared);
    const chordIdx = chordIndexForBeat(beat);
    if (chordIdx !== currentChordRef.current) {
      currentChordRef.current = chordIdx;
      applyChord(chordIdx);
    }

    // solo-only agents
    if (soloModeRef.current) {
      companionRef.current?.tick(now, chordIdx, (freq, strength) => {
        contributeOther(freq, strength, now);
      });
      if (now - lastRealInputAtRef.current > AUTOPILOT_IDLE_MS) {
        setDemoing((d) => (d ? d : true));
        autopilotRef.current?.tick(now, chordIdx, (freq, strength) => {
          contributeLocal(freq, strength, false);
        });
      } else {
        setDemoing((d) => (d ? false : d));
      }
    } else {
      setDemoing((d) => (d ? false : d));
    }

    // mic-driven contributions
    if (micRef.current.running) {
      const frame = micRef.current.getFrame();
      if (frame) {
        const rising = frame.amplitude > 0.17 && prevAmpRef.current < 0.1;
        const onset = frame.onset && frame.amplitude > 0.12;
        if ((rising || onset) && now - lastMicTriggerRef.current > 650) {
          lastMicTriggerRef.current = now;
          const centroid = frame.centroid > 40 ? frame.centroid : FREQ_LO * 2;
          contributeLocal(clamp(centroid, FREQ_LO, FREQ_HI), clamp(frame.amplitude * 1.4, 0.3, 1), true);
        }
        prevAmpRef.current = frame.amplitude;
      }
    }

    // gridlines
    for (let i = 0; i < NUM_GRID; i++) {
      const s = gridRef.current[i];
      const el = gridEls.current[i];
      if (!el) continue;
      s.alpha += (s.alphaTarget - s.alpha) * 0.05;
      s.pulse *= 0.91;
      if (s.alphaTarget === 0 && s.alpha < 0.01) {
        s.active = false;
        s.alpha = 0;
      }
      if (!s.active && s.alpha <= 0) {
        el.setAttribute("opacity", "0");
        continue;
      }
      el.setAttribute("x1", String(PAD_X));
      el.setAttribute("x2", String(W - PAD_X));
      el.setAttribute("y1", s.y.toFixed(1));
      el.setAttribute("y2", s.y.toFixed(1));
      el.setAttribute("stroke", `hsl(${276} 45% 68%)`);
      el.setAttribute("opacity", (s.alpha * (0.16 + s.pulse * 0.5)).toFixed(3));
      el.setAttribute("stroke-width", (1 + s.pulse * 2.2).toFixed(2));
    }

    // presences
    for (let p = 0; p < 2; p++) {
      const pv = presRef.current[p];
      const el = presEls.current[p];
      if (!pv || !el) continue;
      const driftX = pv.homeX + Math.sin(now * 0.00019 + pv.phase) * 26;
      const idleY = pv.homeY + Math.cos(now * 0.00014 + pv.phase * 1.3) * 18;
      const sinceContrib = now - pv.lastContribAt;
      const goalY = sinceContrib < 5000 ? pv.targetY : idleY;
      pv.chaseY += (goalY - pv.chaseY) * 0.045;
      pv.pulse *= 0.945;

      const r = 20 + pv.pulse * 16;
      el.setAttribute(
        "transform",
        `translate(${driftX.toFixed(1)} ${pv.chaseY.toFixed(1)})`
      );
      const glow = el.firstElementChild as SVGCircleElement | null;
      const core = el.lastElementChild as SVGCircleElement | null;
      if (glow) glow.setAttribute("r", r.toFixed(1));
      if (core) core.setAttribute("r", (6 + pv.pulse * 4).toFixed(1));
    }

    // filaments
    for (let k = 0; k < NUM_FIL; k++) {
      const f = filRef.current[k];
      const el = filEls.current[k];
      if (!el) continue;
      if (!f.active) {
        el.setAttribute("opacity", "0");
        continue;
      }
      const age = now - f.born;
      const life = 4200;
      if (age > life) {
        f.active = false;
        el.setAttribute("opacity", "0");
        continue;
      }
      const t = age / life;
      const mx = (f.ax + f.bx) / 2 + Math.sin(age * 0.0032 + f.born * 0.001) * 22;
      const my = (f.ay + f.by) / 2 + Math.cos(age * 0.0027 + f.born * 0.001) * 22;
      el.setAttribute(
        "d",
        `M ${f.ax.toFixed(1)} ${f.ay.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${f.bx.toFixed(1)} ${f.by.toFixed(1)}`
      );
      el.setAttribute("stroke", `hsl(${f.hue} 75% 70%)`);
      el.setAttribute("opacity", ((1 - t) * 0.4).toFixed(3));
      el.setAttribute("stroke-width", (0.8 + (1 - t) * 1.4).toFixed(2));
    }

    // background wash — hue drifts with the chord, opacity breathes gently
    const wash = washRef.current;
    const stopA = washStopARef.current;
    const stopB = washStopBRef.current;
    if (wash && stopA && stopB) {
      const hue = 271 + (chordIdx / Math.max(1, PROGRESSION.length - 1)) * 12;
      const breath = 0.5 + 0.5 * Math.sin(beatPhase(shared) * Math.PI * 2);
      stopA.setAttribute("stop-color", `hsl(${hue.toFixed(1)} 55% 22% / ${(0.5 + breath * 0.14).toFixed(3)})`);
      stopB.setAttribute("stop-color", `hsl(${(hue + 8).toFixed(1)} 60% 10% / 0)`);
    }

    rafRef.current = requestAnimationFrame(stepFrame);
  }, [applyChord, contributeLocal, contributeOther]);

  // ── pointer input ────────────────────────────────────────────────────
  const onFieldTap = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "live") return;
      const svg = svgRef.current;
      if (!svg) return;
      const now = performance.now() - startPerfRef.current;
      if (now - lastTapRef.current < 260) return;
      lastTapRef.current = now;
      const rect = svg.getBoundingClientRect();
      const svgY = ((e.clientY - rect.top) / rect.height) * H;
      const freq = yToFreq(svgY);
      contributeLocal(freq, 0.72, true);
    },
    [phase, contributeLocal]
  );

  // ── Start ────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase === "live") return;
    initState();
    startPerfRef.current = performance.now();
    beatOffsetRef.current = 0;
    lastRealInputAtRef.current = -Infinity;
    peerIdRef.current = makePeerId();

    const audio = createCommonsAudio();
    await audio.resume();
    audioRef.current = audio;
    companionRef.current = makeCompanion(0x3504);
    autopilotRef.current = makeAutopilot(0x2607);
    soloModeRef.current = true;
    setMode("solo");
    setStatusText("Solo · companion present");
    setChordLabel(CHORD_NAMES[0]);
    setPhase("live");
    rafRef.current = requestAnimationFrame(stepFrame);
  }, [phase, initState, stepFrame]);

  // ── Tier: local duet across two tabs ──────────────────────────────────
  const startLoopback = useCallback(() => {
    if (!broadcastAvailable()) {
      setNotice("BroadcastChannel unavailable — staying solo with the companion.");
      return;
    }
    transportRef.current?.close();
    const t = makeLoopback({
      selfId: peerIdRef.current,
      onEvent: handleRemote,
      onPeer: (connected) => {
        soloModeRef.current = !connected;
        setStatusText(connected ? "Local duet · linked" : "Local duet · waiting");
        setNotice(connected ? null : "Open this page in a second tab to link the two.");
      },
    });
    transportRef.current = t;
    setMode("loopback");
    soloModeRef.current = true;
    setStatusText("Local duet · waiting");
    setNotice("Open this page in a second tab to link the two.");
  }, [handleRemote]);

  // ── Tier: manual-SDP WebRTC (real second device, no server) ────────────
  const ensureWebrtc = useCallback((): WebrtcLink | null => {
    if (!webrtcAvailable()) {
      setNotice("WebRTC unavailable on this browser — staying solo with the companion.");
      return null;
    }
    if (webrtcRef.current) return webrtcRef.current;
    const link = makeWebrtc({
      onEvent: handleRemote,
      onOpen: () => {
        soloModeRef.current = false;
        setMode("webrtc");
        setStatusText("Room linked");
        setRtcHint("Linked — hum or tap, and it joins the shared field on both sides.");
        setNotice(null);
        if (roleRef.current === "host") {
          const now = performance.now() - startPerfRef.current;
          transportRef.current?.send({
            kind: "sync",
            beat: beatIndexForElapsed(now),
            msIntoBeat: now % BEAT_MS,
            t: now,
          });
        }
      },
      onClose: () => {
        soloModeRef.current = true;
        setStatusText("Solo · companion present");
        setMode("solo");
      },
    });
    webrtcRef.current = link;
    transportRef.current = link;
    return link;
  }, [handleRemote]);

  const createRoom = useCallback(async () => {
    const link = ensureWebrtc();
    if (!link) return;
    roleRef.current = "host";
    setRtcRole("host");
    setRtcHint("Generating invite…");
    const offer = await link.createInvite();
    setRtcOut(offer);
    setRtcHint("Copy this invite to the other device, then paste their answer below.");
    try {
      await navigator.clipboard.writeText(offer);
      setRtcHint("Invite copied to clipboard. Paste the other device's answer below.");
    } catch {
      /* clipboard blocked — textarea still holds it */
    }
  }, [ensureWebrtc]);

  const joinRoom = useCallback(async () => {
    const link = ensureWebrtc();
    if (!link || !rtcIn.trim()) return;
    roleRef.current = "guest";
    setRtcRole("guest");
    setRtcHint("Building answer…");
    try {
      const answer = await link.acceptInvite(rtcIn.trim());
      setRtcOut(answer);
      setRtcHint("Copy this answer back to the host device.");
      try {
        await navigator.clipboard.writeText(answer);
        setRtcHint("Answer copied. Paste it into the host's box.");
      } catch {
        /* clipboard blocked */
      }
    } catch {
      setRtcHint("Could not read that invite — check the pasted text.");
    }
  }, [ensureWebrtc, rtcIn]);

  const hostAcceptAnswer = useCallback(async () => {
    const link = webrtcRef.current;
    if (!link || !rtcIn.trim()) return;
    try {
      await link.acceptAnswer(rtcIn.trim());
      setRtcHint("Answer accepted — connecting…");
    } catch {
      setRtcHint("Could not read that answer — check the pasted text.");
    }
  }, [rtcIn]);

  const copyOut = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rtcOut);
      setRtcHint("Copied.");
    } catch {
      setRtcHint("Clipboard blocked — select the text and copy manually.");
    }
  }, [rtcOut]);

  const enableMic = useCallback(() => {
    void mic.start();
  }, [mic]);

  // ── teardown ─────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    transportRef.current?.close();
    transportRef.current = null;
    webrtcRef.current?.close();
    webrtcRef.current = null;
    audioRef.current?.close();
    audioRef.current = null;
    companionRef.current = null;
    autopilotRef.current = null;
    mic.stop();
    roleRef.current = null;
    setPhase("idle");
    setMode("solo");
    setStatusText("Solo · companion present");
    setNotice(null);
    setDemoing(false);
    setRtcOpen(false);
    setRtcRole("idle");
    setRtcOut("");
    setRtcIn("");
    setRtcHint("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      transportRef.current?.close();
      webrtcRef.current?.close();
      audioRef.current?.close();
      mic.stop();
    };
    // Mount-once teardown: intentionally only runs on unmount, reading the
    // latest refs/mic.stop (stable identity) at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Design notes
      </button>
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Dreams
      </Link>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-4 py-16">
        <header className="mb-6 max-w-2xl text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Commons
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            A shared room where presence is the point. Hum or tap to add a
            tone to one slowly drifting field — no score, no winner, just
            company.
          </p>
        </header>

        {phase === "idle" ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              A synthetic companion joins right away, so the room is never
              empty — even before anyone else arrives.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: presenceHsl(OTHER, 66) }}
                />
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {statusText}
                  {demoing ? " · self-demo" : ""}
                </span>
              </span>
              <span className="rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {chordLabel}
              </span>
              <button
                type="button"
                onClick={enableMic}
                disabled={mic.running}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {mic.running ? "Mic on" : "Enable mic"}
              </button>
              <button
                type="button"
                onClick={startLoopback}
                disabled={mode === "loopback"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                Local duet
              </button>
              <button
                type="button"
                onClick={() => setRtcOpen((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Connect a room
              </button>
              <button
                type="button"
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </div>

            {mic.error ? (
              <p className="mb-3 text-center text-sm text-destructive">{mic.error}</p>
            ) : null}
            {notice ? (
              <p className="mb-3 text-center text-sm text-muted-foreground">{notice}</p>
            ) : null}

            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full max-w-4xl touch-none rounded-lg border border-border bg-[hsl(270_46%_6%)]"
              onPointerDown={onFieldTap}
            >
              <defs>
                <radialGradient id="commons-wash" cx="50%" cy="46%" r="75%">
                  <stop ref={washStopARef} offset="0%" stopColor="hsl(272 55% 22% / 0.5)" />
                  <stop ref={washStopBRef} offset="100%" stopColor="hsl(280 60% 10% / 0)" />
                </radialGradient>
                <radialGradient id="commons-glow-local" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={presenceHsl(LOCAL, 72, 0.55)} />
                  <stop offset="100%" stopColor={presenceHsl(LOCAL, 60, 0)} />
                </radialGradient>
                <radialGradient id="commons-glow-other" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={presenceHsl(OTHER, 72, 0.55)} />
                  <stop offset="100%" stopColor={presenceHsl(OTHER, 60, 0)} />
                </radialGradient>
              </defs>

              <rect ref={washRef} x={0} y={0} width={W} height={H} fill="url(#commons-wash)" />

              {Array.from({ length: NUM_GRID }, (_, i) => (
                <line
                  key={i}
                  ref={(el) => {
                    gridEls.current[i] = el;
                  }}
                  opacity={0}
                  strokeLinecap="round"
                />
              ))}

              {Array.from({ length: NUM_FIL }, (_, k) => (
                <path
                  key={k}
                  ref={(el) => {
                    filEls.current[k] = el;
                  }}
                  fill="none"
                  opacity={0}
                  strokeLinecap="round"
                />
              ))}

              {([LOCAL, OTHER] as const).map((p) => (
                <g
                  key={p}
                  ref={(el) => {
                    presEls.current[p] = el;
                  }}
                >
                  <circle r={20} fill={`url(#commons-glow-${p === LOCAL ? "local" : "other"})`} />
                  <circle r={6} fill={presenceHsl(p, 74)} />
                </g>
              ))}
            </svg>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              You are{" "}
              <span style={{ color: presenceHsl(LOCAL, 72) }}>violet</span>; the
              room&apos;s other presence is{" "}
              <span style={{ color: presenceHsl(OTHER, 72) }}>magenta-violet</span>.
              Tap anywhere in the field, or enable the mic and hum.
            </p>

            {rtcOpen ? (
              <div className="mt-5 w-full max-w-2xl rounded-lg border border-border bg-background/60 p-5">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Connect a room
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={createRoom}
                    className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Create room
                  </button>
                  <button
                    type="button"
                    onClick={joinRoom}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Join room
                  </button>
                  {rtcRole === "host" ? (
                    <button
                      type="button"
                      onClick={hostAcceptAnswer}
                      className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Accept answer
                    </button>
                  ) : null}
                </div>

                <label className="mt-4 block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Paste from the other device
                </label>
                <textarea
                  value={rtcIn}
                  onChange={(e) => setRtcIn(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                  placeholder="Paste invite (to join) or answer (to accept) here…"
                />

                {rtcOut ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Your {rtcRole === "guest" ? "answer" : "invite"} — send this over
                      </label>
                      <button
                        type="button"
                        onClick={copyOut}
                        className="rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Copy
                      </button>
                    </div>
                    <textarea
                      value={rtcOut}
                      readOnly
                      rows={3}
                      className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                    />
                  </div>
                ) : null}

                {rtcHint ? <p className="mt-3 text-sm text-muted-foreground">{rtcHint}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {showNotes ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Commons
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {DESIGN_NOTES}
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
