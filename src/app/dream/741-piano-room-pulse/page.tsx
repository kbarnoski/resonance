"use client";

/*
 * PIANO ROOM PULSE — 741
 * "Two phones on the same room code are ~80–150ms apart over the network —
 *  too far apart to play tight rhythm by raw reflex. What if both devices
 *  estimated their clock offset (NTP-style) and gently locked BOTH players
 *  onto ONE shared, slowly-drifting pulse — so a real ensemble LOCK emerges
 *  across the room despite the latency?"
 *
 * Transport = Supabase Realtime Broadcast (genuine cross-device WebSocket
 * pub/sub). The distinguishing subsystem is a SHARED-CLOCK SYNC: ping/pong
 * timestamp exchange estimates clock offset + RTT, both devices derive the
 * SAME breathing metronome, and every struck note is gently QUANTIZED onto
 * the nearest shared sub-beat — so the two pianos interlock instead of smear.
 * Inspired by Ableton Link. See README.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  degreeToMidi,
  makeEngine,
  snapToDorian,
  type PianoEngine,
  type Who,
} from "./audio";
import {
  envReady,
  joinRoom,
  normalizeCode,
  randomRoomCode,
  type NoteEvent,
  type Room,
  type RoomStatus,
} from "./room";
import { SharedClock, type ClockState } from "./clock";
import { PulseScene } from "./scene";

// ── computer-keyboard → D-Dorian scale-degree map (module-level pure data) ──
// home row = scale; w e t y u o = passing tones; z/x = octave down/up.
const KEY_DEGREES: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, k: 7, l: 8,
  // passing notes sit "between" by chromatic snap (degreeToMidi+snap handles tuning)
  w: 0, e: 1, t: 3, y: 4, u: 5, o: 7,
};
const PASSING = new Set(["w", "e", "t", "y", "u", "o"]);

// on-screen piano: one octave + a bit of D Dorian, as scale degrees.
const KEYS: { degree: number; label: string }[] = [
  { degree: 0, label: "D" },
  { degree: 1, label: "E" },
  { degree: 2, label: "F" },
  { degree: 3, label: "G" },
  { degree: 4, label: "A" },
  { degree: 5, label: "B" },
  { degree: 6, label: "C" },
  { degree: 7, label: "D" },
  { degree: 8, label: "E" },
  { degree: 9, label: "F" },
];

const MIDI_LO = 50;
const MIDI_HI = 86;
function pitch01(midi: number): number {
  return Math.min(1, Math.max(0, (midi - MIDI_LO) / (MIDI_HI - MIDI_LO)));
}

type MidiState = "unsupported" | "idle" | "ready";

export default function PianoRoomPulse() {
  const [started, setStarted] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState<RoomStatus>("solo");
  const [notice, setNotice] = useState<string | null>(null);
  const [midiState, setMidiState] = useState<MidiState>("idle");
  const [midiName, setMidiName] = useState<string | null>(null);
  const [clock, setClock] = useState<ClockState>({
    offset: 0, rtt: 0, samples: 0, locked: false,
  });
  const [ghostActive, setGhostActive] = useState(true);
  const [useCanvas2d, setUseCanvas2d] = useState(false);

  // refs that live across renders / inside callbacks
  const engineRef = useRef<PianoEngine | null>(null);
  const roomRef = useRef<Room | null>(null);
  const clockRef = useRef<SharedClock>(new SharedClock());
  const sceneRef = useRef<PulseScene | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const lastLocalActivityRef = useRef<number>(0); // for ghost idle detection
  const partnerPresentRef = useRef<boolean>(false);
  const octaveRef = useRef<number>(0);

  // auto room code on mount (client only)
  useEffect(() => {
    const initial = randomRoomCode();
    setRoomCode(initial);
    setCodeInput(initial);
  }, []);

  // ── schedule a note onto the shared grid + bloom it visually ──
  const playOnGrid = useCallback(
    (midiRaw: number, vel: number, who: Who, sharedTargetMs: number) => {
      const eng = engineRef.current;
      const ck = clockRef.current;
      if (!eng) return;
      const midi = snapToDorian(midiRaw);
      const localMs = ck.sharedToLocal(sharedTargetMs);
      const whenCtx = eng.localMsToCtx(localMs);
      const struck = eng.strikeAtCtx(midi, vel, who, whenCtx);
      // bloom slightly ahead so the visual lands with the sound
      const delay = Math.max(0, (struck.whenCtx - eng.ctx.currentTime) * 1000);
      window.setTimeout(() => {
        sceneRef.current?.addBloom(pitch01(midi), vel, who === "me");
      }, delay);
    },
    [],
  );

  // ── local strike: quantize → sound locally → broadcast to partner ──
  const strikeLocal = useCallback(
    (midiRaw: number, vel: number) => {
      const eng = engineRef.current;
      const ck = clockRef.current;
      if (!eng) return;
      lastLocalActivityRef.current = performance.now();
      const midi = snapToDorian(midiRaw);
      // schedule slightly into the future so quantization can pull EITHER way,
      // then snap to the nearest shared sub-beat with a soft humanize.
      const desiredShared = ck.sharedNow() + 70;
      const sharedT = ck.quantizeShared(desiredShared, 11);
      const beat = ck.beatAt(sharedT);
      playOnGrid(midi, vel, "me", sharedT);
      roomRef.current?.sendNote({ note: midi, vel, beat, sharedT });
    },
    [playOnGrid],
  );

  // ── partner note arrives: schedule on the SAME shared grid ──
  const onPartnerNote = useCallback(
    (e: NoteEvent) => {
      partnerPresentRef.current = true;
      setGhostActive(false);
      const ck = clockRef.current;
      // if the partner's target is already in the past for us (high latency),
      // bump it to the next equivalent sub-beat so it still lands ON the grid.
      let target = e.sharedT;
      const now = ck.sharedNow();
      while (target < now + 30) target += (60_000 / 68) / 2; // one sub-beat
      playOnGrid(e.note, e.vel, "them", target);
    },
    [playOnGrid],
  );

  // ── START: unlock audio (iOS), build engine, scene, join room ──
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);
    try {
      engineRef.current = await makeEngine();
    } catch {
      setNotice("Audio could not start on this device.");
      return;
    }

    // three.js scene, or Canvas2D fallback
    if (hostRef.current) {
      try {
        sceneRef.current = new PulseScene(hostRef.current);
      } catch {
        sceneRef.current = null; // page falls back to Canvas2D ring
        setUseCanvas2d(true);
      }
    }

    // join the room (or stay solo)
    if (envReady()) {
      const room = joinRoom(roomCode, {
        onNote: onPartnerNote,
        onPing: (p) => {
          // reply so the asker can estimate offset/rtt
          roomRef.current?.sendPong(clockRef.current.makePong(p, room?.myId ?? "me"));
        },
        onPong: (p) => {
          clockRef.current.ingestPong(p);
          setClock(clockRef.current.state());
        },
        onStatus: (s, detail) => {
          setStatus(s);
          partnerPresentRef.current = s === "duet";
          if (s === "duet") setGhostActive(false);
          if (s === "solo" && detail) setNotice(`Solo mode — ${detail}.`);
          else if (s !== "solo") setNotice(null);
        },
      });
      roomRef.current = room;
      if (!room) setStatus("solo");
    } else {
      setStatus("solo");
      setNotice("Solo mode — no room server configured. Open on a friend's phone with a key set to play a real duet.");
    }
  }, [started, roomCode, onPartnerNote]);

  // ── ping loop for clock sync (only meaningful in a duet, harmless solo) ──
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      const room = roomRef.current;
      if (room && partnerPresentRef.current) {
        room.sendPing(clockRef.current.makePing(room.myId));
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [started]);

  // ── animation loop: drive the scene phase + Canvas2D fallback ──
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const tick = () => {
      const ck = clockRef.current;
      const phase = ck.beatPhase(ck.sharedNow());
      const locked = !partnerPresentRef.current || ck.state().locked;
      if (sceneRef.current) {
        sceneRef.current.setPhase(phase, locked);
        sceneRef.current.render();
      } else if (canvas2dRef.current) {
        drawFallbackRing(canvas2dRef.current, phase, locked);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [started]);

  // ── GHOST partner: when alone + idle, auto-play D-Dorian phrases on grid ──
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let timer = 0;
    const phrase = [0, 2, 4, 3, 4, 6, 5, 4, 2, 0];
    let idx = 0;

    const step = () => {
      if (cancelled) return;
      const idle =
        performance.now() - lastLocalActivityRef.current > 2500;
      const alone = !partnerPresentRef.current;
      if (started && alone && idle && ghostActive) {
        const ck = clockRef.current;
        const deg = phrase[idx % phrase.length] + 7; // up an octave from root
        idx++;
        const midi = degreeToMidi(deg);
        const vel = 0.35 + Math.random() * 0.35;
        // ghost lands ON the next shared sub-beat, cool/partner color
        const sharedT = ck.quantizeShared(ck.sharedNow() + 90, 9);
        playOnGrid(midi, vel, "them", sharedT);
      }
      // schedule next ghost note ~ on the half-beat groove
      const beatMs = 60_000 / 68;
      timer = window.setTimeout(step, beatMs * (idx % 2 === 0 ? 1 : 0.75));
    };
    timer = window.setTimeout(step, 2600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [started, ghostActive, playOnGrid]);

  // ── computer keyboard input ──
  useEffect(() => {
    if (!started) return;
    const down = (ev: KeyboardEvent) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (k === "z") {
        octaveRef.current = Math.max(-1, octaveRef.current - 1);
        return;
      }
      if (k === "x") {
        octaveRef.current = Math.min(2, octaveRef.current + 1);
        return;
      }
      if (k in KEY_DEGREES) {
        ev.preventDefault();
        const deg = KEY_DEGREES[k] + octaveRef.current * 7;
        let midi = degreeToMidi(deg);
        if (PASSING.has(k)) midi += 1; // a touch of color, then snapped to scale
        strikeLocal(midi, 0.7);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [started, strikeLocal]);

  // ── Web MIDI input ──
  useEffect(() => {
    if (!started) return;
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (!nav.requestMIDIAccess) {
      setMidiState("unsupported");
      return;
    }
    let access: MIDIAccess | null = null;
    const handlers: Array<{ input: MIDIInput; fn: (e: MIDIMessageEvent) => void }> = [];

    const wire = (acc: MIDIAccess) => {
      handlers.length = 0;
      let any = false;
      acc.inputs.forEach((input) => {
        any = true;
        setMidiName(input.name ?? "MIDI device");
        const fn = (e: MIDIMessageEvent) => {
          const data = e.data;
          if (!data || data.length < 3) return;
          const cmd = data[0] & 0xf0;
          const note = data[1];
          const velRaw = data[2];
          if (cmd === 0x90 && velRaw > 0) {
            strikeLocal(note, Math.max(0.1, velRaw / 127));
          }
          // note-off 0x80 / 0x90 vel0 — voice self-releases, nothing to do
        };
        input.addEventListener("midimessage", fn as EventListener);
        handlers.push({ input, fn });
      });
      setMidiState(any ? "ready" : "idle");
    };

    nav
      .requestMIDIAccess()
      .then((acc) => {
        access = acc;
        wire(acc);
        acc.onstatechange = () => wire(acc);
      })
      .catch(() => setMidiState("unsupported"));

    return () => {
      for (const h of handlers) {
        try {
          h.input.removeEventListener("midimessage", h.fn as EventListener);
        } catch {
          /* ignore */
        }
      }
      if (access) access.onstatechange = null;
    };
  }, [started, strikeLocal]);

  // ── teardown everything on unmount ──
  useEffect(() => {
    return () => {
      try {
        roomRef.current?.leave();
      } catch {
        /* ignore */
      }
      try {
        sceneRef.current?.dispose();
      } catch {
        /* ignore */
      }
      try {
        engineRef.current?.dispose();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const onScreenStrike = (degree: number) => {
    strikeLocal(degreeToMidi(degree + octaveRef.current * 7), 0.7);
  };

  const statusLine = (() => {
    if (status === "duet")
      return { text: "partner in the room — locked & live", cls: "text-emerald-300" };
    if (status === "connected")
      return { text: "in the room — waiting for a partner", cls: "text-white/75" };
    if (status === "connecting")
      return { text: "reaching the room…", cls: "text-white/55" };
    return { text: "solo — a ghost partner keeps the pulse", cls: "text-white/75" };
  })();

  return (
    <main className="min-h-dvh bg-[#0d0a14] text-white">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/55">
            dream / 741
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Piano Room Pulse
          </h1>
          <p className="mt-2 max-w-2xl text-base text-white/75">
            Two phones on one room code, ~80–150ms apart. They estimate their
            clock offset NTP-style and lock onto ONE slowly-drifting pulse — a
            real ensemble emerges across the latency.
          </p>
        </header>

        {/* visual stage */}
        <div className="relative mb-5 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a0710]">
          <div ref={hostRef} className="absolute inset-0" />
          {/* Canvas2D fallback (only drawn if WebGL/scene unavailable) */}
          <canvas
            ref={canvas2dRef}
            width={640}
            height={400}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ display: useCanvas2d ? "block" : "none" }}
          />
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0710]/80 px-6 text-center">
              <p className="max-w-md text-base text-white/75">
                Warm dark piano room. Tap start to wake the sound (also unlocks
                audio on iOS), then play a real keyboard, your computer keys, or
                the on-screen piano.
              </p>
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-full bg-amber-300 px-6 py-2.5 text-base font-semibold text-[#1a1208] transition hover:bg-amber-200"
              >
                Start the room
              </button>
            </div>
          )}
        </div>

        {/* room + status */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label className="font-mono text-xs uppercase tracking-widest text-white/55">
              room
            </label>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
              onBlur={() => {
                const c = codeInput || randomRoomCode();
                setCodeInput(c);
                if (!started) setRoomCode(c);
              }}
              maxLength={4}
              disabled={started}
              className="w-24 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-white disabled:opacity-60"
            />
            {!started && (
              <button
                onClick={() => {
                  const c = randomRoomCode();
                  setCodeInput(c);
                  setRoomCode(c);
                }}
                className="min-h-[44px] rounded-full border border-white/15 px-4 py-2.5 text-base text-white/75 transition hover:bg-white/5"
              >
                shuffle
              </button>
            )}
          </div>
          <p className={`text-base ${statusLine.cls}`}>{statusLine.text}</p>
        </div>

        {/* clock readout */}
        {started && (
          <div className="mb-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 font-mono text-sm">
            <div>
              <div className="text-white/55">offset</div>
              <div className="text-base text-white/95">
                {clock.samples > 0 ? `${clock.offset.toFixed(0)} ms` : "—"}
              </div>
            </div>
            <div>
              <div className="text-white/55">rtt</div>
              <div className="text-base text-white/95">
                {clock.samples > 0 ? `${clock.rtt.toFixed(0)} ms` : "—"}
              </div>
            </div>
            <div>
              <div className="text-white/55">pulse</div>
              <div
                className={`text-base ${clock.locked && status === "duet" ? "text-emerald-300" : "text-amber-300/95"}`}
              >
                {status === "duet"
                  ? clock.locked
                    ? "LOCKED"
                    : "syncing…"
                  : "solo grid"}
              </div>
            </div>
          </div>
        )}

        {/* notice */}
        {notice && (
          <p className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-base text-amber-300/95">
            {notice}
          </p>
        )}

        {/* on-screen piano */}
        {started && (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-base text-white/75">
                On-screen piano · D Dorian
              </p>
              <p className="font-mono text-sm text-white/55">
                octave {octaveRef.current >= 0 ? "+" : ""}
                {octaveRef.current} · z / x
              </p>
            </div>
            <div className="flex gap-1.5">
              {KEYS.map((k, i) => (
                <button
                  key={i}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onScreenStrike(k.degree);
                  }}
                  className="flex min-h-[64px] flex-1 items-end justify-center rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] pb-2 text-sm text-white/75 transition active:from-amber-300/40 active:to-amber-300/10"
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* input badges */}
        {started && (
          <div className="mb-6 flex flex-wrap gap-2 text-sm">
            <span
              className={`rounded-full border px-3 py-1.5 ${
                midiState === "ready"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.03] text-white/55"
              }`}
            >
              MIDI:{" "}
              {midiState === "ready"
                ? (midiName ?? "connected")
                : midiState === "unsupported"
                  ? "not supported"
                  : "plug in a keyboard"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-white/55">
              keys: a s d f g h j k l (· w e t y u o)
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-white/55">
              z / x octave
            </span>
          </div>
        )}

        <footer className="border-t border-white/10 pt-4 text-sm">
          <Link
            href="/dream/741-piano-room-pulse/README.md"
            className="text-white/55 underline decoration-white/20 underline-offset-4 transition hover:text-white/75"
          >
            Read the design notes
          </Link>
        </footer>
      </div>
    </main>
  );
}

// ── minimal Canvas2D pulse ring so the glance is never blank without WebGL ──
function drawFallbackRing(
  canvas: HTMLCanvasElement,
  phase: number,
  locked: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const swell = Math.pow(1 - phase, 2.2);
  const r = Math.min(w, h) * 0.32 * (1 + swell * 0.12);
  ctx.lineWidth = 2 + swell * 4;
  ctx.strokeStyle = locked
    ? `rgba(120, 230, 170, ${0.4 + swell * 0.5})`
    : `rgba(255, 190, 120, ${0.4 + swell * 0.5})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 210, 170, ${0.1 + swell * 0.4})`;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.07 * (0.8 + swell * 0.7), 0, Math.PI * 2);
  ctx.fill();
}
