"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────────
   3720 · relay — a one-take recording desk played from a real MIDI controller.
   Timing is the stake: notes on the click ring clean and gild the take; notes
   off the click visibly SCAR it; the take seals when the commit budget hits 0.
   Web MIDI note-in (+ QWERTY + AUTO fallback) · micro-timing vs a running click.
   ──────────────────────────────────────────────────────────────────────────── */

// ── art-layer palette (raw hex is exempt — chrome uses semantic tokens) ───────
const BG = "#0a0a0d";
const GRID_FAINT = "rgba(180,185,200,0.06)";
const GRID_BEAT = "rgba(180,185,200,0.16)";
const GRID_DOWN = "rgba(200,205,220,0.30)";
const VIOLET = "#a78bfa"; // clean / on-beat
const VIOLET_DIM = "rgba(167,139,250,0.35)";
const RED = "#f0505a"; // scar / off-beat (meaningful — genuine timing error)
const RED_DIM = "rgba(240,80,90,0.30)";

// ── musical constants ─────────────────────────────────────────────────────────
const LOOP_BEATS = 8; // the take is a 2-bar loop
const SUBDIV = 0.5; // eighth-note grid
const WINDOW_MS = 55; // tight on-beat window → clean; outside → scar
const BUDGET = 20; // finite commits per take
const MIDI_LO = 48;
const MIDI_HI = 84;
const LOOKAHEAD = 0.12; // scheduler lookahead (s)
const TICK_MS = 25;

type Mode = "idle" | "midi" | "qwerty" | "auto";

interface TakeNote {
  phase: number; // beats into the loop (snapped if clean, real if scarred)
  midi: number;
  vel: number; // 0..1
  errBeats: number; // signed timing error in beats (0 for clean-snapped)
  errMs: number; // signed timing error in ms (as played)
  clean: boolean;
  bornBeat: number; // absolute beat it was committed (avoids same-cycle re-trigger)
  flash: number; // 0..1 visual retrigger glow
}

// QWERTY → chromatic run from MIDI 60, home row + upper row for sharps.
const KEYMAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73,
  l: 74, p: 75, ";": 76,
};

const midiToFreq = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Seeded AUTO phrase: deliberately mixes tight on-grid hits (clean) with
// pushed/dragged hits (~90ms off → scar) so a headless reviewer sees BOTH the
// reward and the scar mechanic, and the take sealing, with sound.
function buildAutoEvents(): { beat: number; midi: number; vel: number }[] {
  const scale = [60, 62, 64, 67, 69, 72, 71, 67, 64, 62];
  const ev: { beat: number; midi: number; vel: number }[] = [];
  let beat = 2; // let one bar of click establish first
  for (let i = 0; i < BUDGET; i++) {
    const grid = Math.round(beat / SUBDIV) * SUBDIV;
    // every 3rd note is deliberately rushed off the grid → a scar
    const push = i % 3 === 2 ? 0.135 : 0;
    ev.push({
      beat: grid + push,
      midi: scale[i % scale.length] + (i >= 10 ? 12 : 0) - (i % 4 === 3 ? 5 : 0),
      vel: 0.55 + 0.35 * (i % 2),
    });
    beat += i % 4 === 0 ? 1 : 0.75;
  }
  return ev;
}

export default function RelayPage() {
  // ── react state (UI only) ───────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [deviceName, setDeviceName] = useState<string>("");
  const [commits, setCommits] = useState(BUDGET);
  const [sealed, setSealed] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [cleanCount, setCleanCount] = useState(0);
  const [scarCount, setScarCount] = useState(0);
  const [lastOffset, setLastOffset] = useState<number | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // ── audio / transport refs ──────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const delaySendRef = useRef<GainNode | null>(null);
  const clickGainRef = useRef<GainNode | null>(null);

  const bpmRef = useRef(90);
  const anchorTimeRef = useRef(0); // ctx time at the beat anchor
  const beatBaseRef = useRef(0); // beat value at the anchor
  const nextBeatRef = useRef(0); // scheduler cursor (beats)
  const nextClickRef = useRef(0); // next integer beat to click

  const notesRef = useRef<TakeNote[]>([]);
  const sealedRef = useRef(false);
  const commitsRef = useRef(BUDGET);

  const autoActiveRef = useRef(false);
  const autoEventsRef = useRef<{ beat: number; midi: number; vel: number }[]>([]);
  const autoIdxRef = useRef(0);

  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const heldKeysRef = useRef<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const schedTimerRef = useRef<number | null>(null);

  // ── beat clock (continuous across BPM changes) ────────────────────────────────
  const beatAt = useCallback(
    (t: number) => beatBaseRef.current + (t - anchorTimeRef.current) * (bpmRef.current / 60),
    [],
  );

  // ── one voice: continuous-pitch, velocity → brightness/amplitude ─────────────
  const playVoice = useCallback(
    (midi: number, vel: number, when: number, clean: boolean) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      const send = delaySendRef.current;
      if (!ctx || !master) return;
      const freq = midiToFreq(midi);
      const t = Math.max(when, ctx.currentTime);
      const dur = 0.55;

      const g = ctx.createGain();
      const peak = 0.06 + vel * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(700 + vel * 3600, t);
      filt.Q.value = clean ? 0.7 : 1.4;

      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = freq;
      o1.connect(filt);

      const o2 = ctx.createOscillator();
      o2.type = "sawtooth";
      // clean → soft octave sheen (gilding); scar → detuned roughness
      o2.frequency.value = clean ? freq * 2 : freq;
      o2.detune.value = clean ? 0 : 22;
      const o2g = ctx.createGain();
      o2g.gain.value = clean ? 0.10 : 0.16;
      o2.connect(o2g).connect(filt);

      filt.connect(g);
      g.connect(master);
      if (send) g.connect(send);

      o1.start(t);
      o2.start(t);
      o1.stop(t + dur + 0.05);
      o2.stop(t + dur + 0.05);

      // scars bake a grain of noise into the take on every pass
      if (!clean) {
        const n = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.09), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        n.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.05 + vel * 0.05, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        const nf = ctx.createBiquadFilter();
        nf.type = "bandpass";
        nf.frequency.value = freq * 2;
        n.connect(nf).connect(ng).connect(master);
        n.start(t);
        n.stop(t + 0.1);
      }
    },
    [],
  );

  const playClick = useCallback((when: number, accent: boolean) => {
    const ctx = ctxRef.current;
    const bus = clickGainRef.current;
    if (!ctx || !bus) return;
    const t = Math.max(when, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = accent ? 1600 : 1050;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.09 : 0.05, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.06);
  }, []);

  // ── commit a played note into the take (measures timing vs the click) ─────────
  const commitNote = useCallback(
    (midi: number, vel: number, phaseRaw: number, atBeat: number, when: number) => {
      if (sealedRef.current || commitsRef.current <= 0) return;

      let phase = ((phaseRaw % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
      const snap = Math.round(phase / SUBDIV) * SUBDIV;
      let err = phase - snap; // beats
      if (err > SUBDIV / 2) err -= SUBDIV;
      if (err < -SUBDIV / 2) err += SUBDIV;
      const errMs = err * (60 / bpmRef.current) * 1000;
      const clean = Math.abs(errMs) <= WINDOW_MS;
      // clean notes lock to the grid (reward); scars keep their real offset
      phase = clean ? ((snap % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS : phase;

      const note: TakeNote = {
        phase,
        midi,
        vel,
        errBeats: clean ? 0 : err,
        errMs,
        clean,
        bornBeat: atBeat,
        flash: 1,
      };
      notesRef.current.push(note);

      commitsRef.current -= 1;
      setCommits(commitsRef.current);
      setLastOffset(errMs);
      if (clean) setCleanCount((c) => c + 1);
      else setScarCount((c) => c + 1);

      playVoice(midi, vel, when, clean);

      if (commitsRef.current <= 0) {
        sealedRef.current = true;
        setSealed(true);
        autoActiveRef.current = false;
      }
    },
    [playVoice],
  );

  // ── live human note-on (immediate monitor + commit) ───────────────────────────
  const handleLiveNote = useCallback(
    (midi: number, vel: number) => {
      const ctx = ctxRef.current;
      if (!ctx || sealedRef.current) return;
      if (ctx.state === "suspended") ctx.resume();
      const beat = beatAt(ctx.currentTime);
      commitNote(midi, vel, beat, beat, ctx.currentTime);
    },
    [beatAt, commitNote],
  );

  // ── the scheduler: clicks + committed-note loop + AUTO events ──────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const bpmv = bpmRef.current;
    const beatToTime = (b: number) => anchorTimeRef.current + (b - beatBaseRef.current) * (60 / bpmv);
    const targetBeat = beatAt(ctx.currentTime + LOOKAHEAD);
    const fromBeat = nextBeatRef.current;

    // steady click on every integer beat
    while (nextClickRef.current < targetBeat) {
      const b = nextClickRef.current;
      const inLoop = ((b % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
      playClick(beatToTime(b), inLoop === 0 || inLoop === 4);
      nextClickRef.current += 1;
    }

    // AUTO performer feeds deterministic events into the take
    if (autoActiveRef.current && !sealedRef.current) {
      const ev = autoEventsRef.current;
      while (autoIdxRef.current < ev.length && ev[autoIdxRef.current].beat < targetBeat) {
        const e = ev[autoIdxRef.current];
        autoIdxRef.current += 1;
        if (sealedRef.current) break;
        commitNote(e.midi, e.vel, e.beat, e.beat, beatToTime(e.beat));
      }
    }

    // loop every committed note on each subsequent cycle
    const notes = notesRef.current;
    for (let i = 0; i < notes.length; i++) {
      const nt = notes[i];
      const lb = Math.max(fromBeat, nt.bornBeat + 0.0001);
      const k = Math.ceil((lb - nt.phase) / LOOP_BEATS);
      const occ = nt.phase + k * LOOP_BEATS;
      if (occ >= fromBeat && occ < targetBeat) {
        playVoice(nt.midi, nt.vel, beatToTime(occ), nt.clean);
      }
    }

    nextBeatRef.current = targetBeat;
  }, [beatAt, commitNote, playClick, playVoice]);

  // ── canvas render loop ────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padX = 18;
    const padY = 22;
    const W = cw - padX * 2;
    const H = ch - padY * 2;
    const xForPhase = (p: number) => padX + (p / LOOP_BEATS) * W;
    const yForMidi = (m: number) => padY + (1 - (m - MIDI_LO) / (MIDI_HI - MIDI_LO)) * H;

    g.fillStyle = BG;
    g.fillRect(0, 0, cw, ch);

    // metronome grid
    const subs = Math.round(LOOP_BEATS / SUBDIV);
    for (let i = 0; i <= subs; i++) {
      const b = i * SUBDIV;
      const x = xForPhase(b);
      const isBeat = Number.isInteger(b);
      const isDown = b % 4 === 0;
      g.strokeStyle = isDown ? GRID_DOWN : isBeat ? GRID_BEAT : GRID_FAINT;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, padY);
      g.lineTo(x, padY + H);
      g.stroke();
    }
    // faint octave rules
    g.strokeStyle = GRID_FAINT;
    for (let m = MIDI_LO; m <= MIDI_HI; m += 12) {
      const y = yForMidi(m);
      g.beginPath();
      g.moveTo(padX, y);
      g.lineTo(padX + W, y);
      g.stroke();
    }

    const playBeat = ctx ? ((beatAt(ctx.currentTime) % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS : 0;
    const playX = xForPhase(playBeat);

    // notes
    const notes = notesRef.current;
    for (let i = 0; i < notes.length; i++) {
      const nt = notes[i];
      const x = xForPhase(nt.phase);
      const y = yForMidi(nt.midi);

      // retrigger glow: light up as the playhead sweeps over it
      const d = Math.abs(nt.phase - playBeat);
      if (Math.min(d, LOOP_BEATS - d) < 0.06) nt.flash = 1;
      nt.flash *= 0.9;
      const glow = nt.flash;

      if (nt.clean) {
        const r = 4 + nt.vel * 5 + glow * 4;
        g.fillStyle = VIOLET_DIM;
        g.beginPath();
        g.arc(x, y, r + 4 + glow * 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = VIOLET;
        g.globalAlpha = 0.6 + glow * 0.4;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      } else {
        // scar: draw the offset from the grid line it missed
        const gridPhase = Math.round(nt.phase / SUBDIV) * SUBDIV;
        const gx = xForPhase(gridPhase);
        g.strokeStyle = RED_DIM;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(gx, y);
        g.lineTo(x, y);
        g.stroke();
        g.fillStyle = "rgba(200,205,220,0.25)";
        g.fillRect(gx - 0.5, y - 5, 1, 10); // the beat it should have hit
        const r = 4 + nt.vel * 5 + glow * 4;
        g.fillStyle = RED_DIM;
        g.beginPath();
        g.arc(x, y, r + 3 + glow * 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = RED;
        g.globalAlpha = 0.65 + glow * 0.35;
        g.beginPath();
        g.moveTo(x, y - r);
        g.lineTo(x + r, y);
        g.lineTo(x, y + r);
        g.lineTo(x - r, y);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
      }
    }

    // playhead
    g.strokeStyle = sealedRef.current ? "rgba(167,139,250,0.5)" : "rgba(233,237,243,0.55)";
    g.lineWidth = sealedRef.current ? 1 : 1.5;
    g.beginPath();
    g.moveTo(playX, padY);
    g.lineTo(playX, padY + H);
    g.stroke();

    // frame
    g.strokeStyle = sealedRef.current ? VIOLET_DIM : "rgba(180,185,200,0.12)";
    g.lineWidth = 1;
    g.strokeRect(padX, padY, W, H);
  }, [beatAt]);

  // ── START: init audio, wire MIDI, arm AUTO/QWERTY ─────────────────────────────
  const start = useCallback(async () => {
    if (started) return;
    let ctx: AudioContext;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch {
      setAudioError("Web Audio unavailable in this browser.");
      return;
    }
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
    masterRef.current = master;

    // feedback delay (tasteful space)
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = (60 / bpmRef.current) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    const send = ctx.createGain();
    send.gain.value = 0.22;
    const dlpf = ctx.createBiquadFilter();
    dlpf.type = "lowpass";
    dlpf.frequency.value = 2600;
    send.connect(delay);
    delay.connect(dlpf);
    dlpf.connect(fb);
    fb.connect(delay);
    dlpf.connect(wet);
    wet.connect(master);
    delaySendRef.current = send;

    const clickBus = ctx.createGain();
    clickBus.gain.value = 0.9;
    clickBus.connect(master);
    clickGainRef.current = clickBus;

    // anchor the transport
    anchorTimeRef.current = ctx.currentTime + 0.1;
    beatBaseRef.current = 0;
    nextBeatRef.current = 0;
    nextClickRef.current = 0;

    setStarted(true);

    // try real MIDI hardware — the still-unused wire
    let gotDevice = false;
    const nav = navigator as Navigator & {
      requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess === "function") {
      try {
        const access = await nav.requestMIDIAccess({ sysex: false });
        midiAccessRef.current = access;
        const attach = (input: MIDIInput) => {
          input.onmidimessage = (ev: MIDIMessageEvent) => {
            const data = ev.data;
            if (!data || data.length < 3) return;
            const status = data[0] & 0xf0;
            if (status === 0x90 && data[2] > 0) {
              handleLiveNote(data[1], data[2] / 127);
              if (autoActiveRef.current) {
                autoActiveRef.current = false;
                setMode("midi");
              }
            }
          };
        };
        let name = "";
        access.inputs.forEach((input) => {
          gotDevice = true;
          if (!name) name = input.name || "controller";
          attach(input);
        });
        access.onstatechange = () => {
          access.inputs.forEach((input) => attach(input));
        };
        if (gotDevice) {
          setMode("midi");
          setDeviceName(name);
        }
      } catch {
        /* denied → fall through to AUTO */
      }
    }

    // no hardware → guarantee a self-demo: seeded AUTO performer
    if (!gotDevice) {
      autoEventsRef.current = buildAutoEvents();
      autoIdxRef.current = 0;
      autoActiveRef.current = true;
      setMode("auto");
    }

    schedTimerRef.current = window.setInterval(runScheduler, TICK_MS);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [started, drawFrame, runScheduler, handleLiveNote]);

  // ── reset to a brand-new blank take ───────────────────────────────────────────
  const reset = useCallback(() => {
    notesRef.current = [];
    sealedRef.current = false;
    commitsRef.current = BUDGET;
    setSealed(false);
    setCommits(BUDGET);
    setCleanCount(0);
    setScarCount(0);
    setLastOffset(null);
    const ctx = ctxRef.current;
    if (ctx) {
      anchorTimeRef.current = ctx.currentTime + 0.1;
      beatBaseRef.current = 0;
      nextBeatRef.current = 0;
      nextClickRef.current = 0;
    }
    // re-arm AUTO only if we're not on a real device
    if (mode === "auto" || (mode === "qwerty" && !midiAccessRef.current)) {
      autoEventsRef.current = buildAutoEvents();
      autoIdxRef.current = 0;
      autoActiveRef.current = true;
      setMode("auto");
    }
  }, [mode]);

  // ── BPM change: re-anchor clock so the take stays continuous ───────────────────
  const changeBpm = useCallback((next: number) => {
    const ctx = ctxRef.current;
    if (ctx) {
      const t = ctx.currentTime;
      beatBaseRef.current = beatAt(t);
      anchorTimeRef.current = t;
    }
    bpmRef.current = next;
    setBpm(next);
  }, [beatAt]);

  // ── QWERTY fallback + single setup/cleanup effect ─────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!ctxRef.current || sealedRef.current) return;
      const key = e.key.toLowerCase();
      if (!(key in KEYMAP)) return;
      if (heldKeysRef.current.has(key)) return;
      heldKeysRef.current.add(key);
      e.preventDefault();
      handleLiveNote(KEYMAP[key], 0.8);
      if (autoActiveRef.current) {
        autoActiveRef.current = false;
        setMode("qwerty");
      } else if (!midiAccessRef.current) {
        setMode("qwerty");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current !== null) clearInterval(schedTimerRef.current);
      const access = midiAccessRef.current;
      if (access) access.inputs.forEach((input) => (input.onmidimessage = null));
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
    };
  }, [handleLiveNote]);

  // ── UI ────────────────────────────────────────────────────────────────────────
  const badge =
    mode === "midi"
      ? `MIDI: ${deviceName || "controller"}`
      : mode === "qwerty"
        ? "QWERTY"
        : mode === "auto"
          ? "AUTO"
          : "—";

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">relay</h1>
            <p className="mt-1 max-w-xl text-base text-muted-foreground">
              A one-take recording desk played from a real MIDI controller — hit the click and your
              notes ring clean; miss it and they scar the take, permanently, until the budget seals it.
            </p>
          </div>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {/* readouts */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="rounded-md bg-primary/20 px-2 py-1 text-primary">{badge}</span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
            commits <span className={commits === 0 ? "text-primary" : "text-foreground"}>{commits}</span>/{BUDGET}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
            {bpm} BPM
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-primary">
            clean {cleanCount}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-destructive">
            scars {scarCount}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
            {lastOffset === null
              ? "offset —"
              : `${lastOffset > 0 ? "+" : ""}${lastOffset.toFixed(0)}ms ${
                  Math.abs(lastOffset) <= WINDOW_MS ? "clean" : lastOffset > 0 ? "late" : "early"
                }`}
          </span>
          {sealed && (
            <span className="rounded-md bg-primary/20 px-2 py-1 text-primary">SEALED — looping</span>
          )}
        </div>

        {/* hero canvas */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-[#0a0a0d]">
          <canvas ref={canvasRef} className="h-full w-full" />
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
              <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
                Start the desk. Play a MIDI controller or the home-row keys in time with the click.
                With no hardware, an AUTO take self-performs and seals within ~30s.
              </p>
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start take
              </button>
              {audioError && <p className="text-sm text-destructive">{audioError}</p>}
            </div>
          )}
        </div>

        {/* transport */}
        {started && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={reset}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Reset — new blank take
            </button>
            <label className="flex items-center gap-3 text-sm text-muted-foreground">
              BPM
              <input
                type="range"
                min={60}
                max={140}
                step={1}
                value={bpm}
                onChange={(e) => changeBpm(Number(e.target.value))}
                className="h-1 w-40 cursor-pointer accent-[color:var(--primary)]"
              />
              <span className="font-mono text-xs text-foreground">{bpm}</span>
            </label>
            <span className="text-sm text-muted-foreground">
              Keys: <span className="font-mono text-xs">A W S E D F T G Y H U J K</span> → chromatic run
            </span>
          </div>
        )}
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
          <div className="mt-8 max-w-2xl rounded-lg border border-border bg-background p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">relay — design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if Resonance could be played
                from a real MIDI controller in the browser — a one-take desk where timing is the stake?
              </p>
              <p>
                <span className="text-foreground">Input</span> is the Web MIDI API — the lab&apos;s first
                hardware-instrument wire, in service of live performance. Every note-on becomes a
                continuous-pitch voice ({" "}
                <span className="font-mono text-xs">440·2^((n−69)/12)</span>), velocity → brightness. No
                pitch snapping: the desk judges your <em>timing</em>, not your notes.
              </p>
              <p>
                <span className="text-foreground">Technique:</span> each note&apos;s micro-timing is
                measured against the running click. Land inside ±{WINDOW_MS}ms and the note locks to the
                grid as a clean violet mark and gilds the take with an octave sheen. Miss and it stays
                where you played it — a red scar offset from the grid by its real error, roughening the
                loop with detune and noise.
              </p>
              <p>
                <span className="text-foreground">The stakes:</span> you get {BUDGET} commits. The counter
                only falls. At zero the take <span className="text-primary">seals</span> and loops forever —
                clean where you were tight, scarred where you rushed or dragged. It models nothing; the
                consequence is your own performance. Reset starts a brand-new blank take.
              </p>
              <p>
                <span className="text-foreground">AUTO:</span> with no controller connected, a seeded
                performer plays the take for you — deliberately hitting some notes clean and pushing
                others off the beat — so the reward / scar / seal is always visible and audible.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
