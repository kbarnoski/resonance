"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13568 · Canon Circle — a multi-tab collaborative canon on Karel's REAL piano.
//
//   "What if opening a second browser tab makes you a live second voice in a
//    canon built from Karel's own recorded piano — and the room automatically
//    keeps every voice in the same key and tempo?"
//
//   Every open tab (same origin) is a VOICE. A voice loops a short phrase sliced
//   from one of Karel's real recordings, entering on a chosen beat; several tabs
//   layer into a Reich-style round. Tabs gossip over a BroadcastChannel — no
//   server. The lowest tab-id is elected CONDUCTOR: it broadcasts one shared beat
//   grid { bpm, epochMs } and one consensus key center. Every follower phase-
//   aligns to that grid and is auto-transposed (via detune) so its phrase's root
//   snaps into the shared key — the "harmonic consensus stage" from Shin's
//   tdcommons disclosure, but with real recorded phrases instead of oscillators.
//   With one tab open, 2 ghost voices fill the canon so it's never silent.
//
//   REFS  D. Shin, "Real-Time Collaborative Generative Music Jamming on a Video
//         Sharing Platform," Technical Disclosure Commons, Aug 5 2026 (harmonic
//         consensus stage → one unified key/tempo); Steve Reich, phase / canon.
//   Deterministic: mulberry32 seeded from one performance.now() read; all timing
//   via performance.now() + performance.timeOrigin (a same-machine wall clock
//   comparable across tabs). No Math.random / Date.now / new Date().
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, chordRoot } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32 } from "../_shared/erosion/engine";

const CHANNEL_NAME = "dream-canoncircle";
const LOOP_BEATS = 8; // every voice loops this many shared beats
const FALLBACK_BPM = 72;
const TARGET_VOICES = 3; // ghosts fill up to this many locally-audible voices
const HEARTBEAT_MS = 900;
const PEER_TIMEOUT_MS = 3000;
const BLOOM_MS = 900; // ring bloom-in
const FADE_MS = 1100; // ring fade-out after a tab leaves
const ROT_PERIOD_MS = 96000; // one slow rotation of the whole clock
const GHOST_GAIN = 0.5;

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// A same-machine wall clock, in ms, comparable across tabs of this origin.
// (performance.timeOrigin is fixed per document; +now() tracks it forward.)
function nowWall(): number {
  return performance.timeOrigin + performance.now();
}

// pitch-class root of a key string like "C# minor" / "F major" (chordRoot reads
// the leading note + accidental), or null when unparseable.
function parseKeyPc(key: string | null): number | null {
  if (!key) return null;
  return chordRoot(key);
}

// shortest signed semitone move from → to, in [-6, 6].
function semitoneToward(from: number, to: number): number {
  let d = (((to - from) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

const frac = (x: number) => x - Math.floor(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ── message + model types ────────────────────────────────────────────────────
type PeerMsg =
  | { type: "hello" | "heartbeat" | "state"; id: number; trackId: string; entryBeat: number; gain: number; muted: boolean }
  | { type: "grid"; from: number; bpm: number; epochMs: number; loopBeats: number; consensusPc: number | null }
  | { type: "bye"; id: number };

interface PeerInfo {
  id: number;
  lastSeen: number; // local performance.now() at receipt (for timeout)
  trackId: string;
  entryBeat: number;
  gain: number;
  muted: boolean;
}

interface SenderGrid {
  bpm: number;
  epochMs: number;
  loopBeats: number;
  consensusPc: number | null;
}

interface LocalVoice {
  key: string; // "me" | "ghost0" | "ghost1"
  trackId: string;
  entryBeat: number;
  regionFrac: number; // stable slice offset into the track (0..1)
  gainNode: GainNode | null;
  targetGain: number;
  detuneCents: number;
  nextStartWall: number | null;
}

interface Analysis {
  tempo: number | null;
  pc: number | null;
}

// a per-ring render snapshot (kept for gone rings so they can fade out)
interface RingMeta {
  key: string;
  bornWall: number;
  goneWall: number | null;
  trackIndex: number;
  entryBeat: number;
  gain: number;
  muted: boolean;
  label: string;
  conductor: boolean;
  local: boolean;
}

export default function CanonCirclePage() {
  // ── user-controlled config (mirrored into refs for the interval loops) ──────
  const [myTrack, setMyTrack] = useState<string>(REAL_TRACKS[0].id);
  const [myEntryBeat, setMyEntryBeat] = useState(0);
  const [myGain, setMyGain] = useState(0.85);
  const [myMuted, setMyMuted] = useState(false);
  const [mySolo, setMySolo] = useState(false);

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── surfaced-for-UI state (updated from the rAF loop, only on change) ───────
  const [voiceCount, setVoiceCount] = useState(1);
  const [peerCount, setPeerCount] = useState(0);
  const [isLeader, setIsLeader] = useState(true);
  const [bpm, setBpm] = useState(FALLBACK_BPM);
  const [keyLabel, setKeyLabel] = useState("—");
  const [bcSupported, setBcSupported] = useState(true);
  const [, setTick] = useState(0);

  // ── refs: audio + timing ────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const rafRef = useRef<number>(0);
  const schedRef = useRef<number | null>(null);
  const beatRef = useRef<number | null>(null);
  const rngRef = useRef<() => number>(() => 0.5);
  const activeSrcRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const reducedRef = useRef(false);

  // identity + shared clock
  const myIdRef = useRef<number>(0);
  const myEpochRef = useRef<number>(0);
  const myBpmRef = useRef<number>(FALLBACK_BPM);
  const myPcRef = useRef<number | null>(null);

  // config mirrors
  const trackRef = useRef(myTrack);
  const entryRef = useRef(myEntryBeat);
  const gainRef = useRef(myGain);
  const mutedRef = useRef(myMuted);
  const soloRef = useRef(mySolo);
  const userNudgedRef = useRef(false);

  // network model
  const peersRef = useRef<Map<number, PeerInfo>>(new Map());
  const senderGridsRef = useRef<Map<number, SenderGrid>>(new Map());
  const gridRef = useRef<SenderGrid | null>(null);
  const gridSigRef = useRef<string>("");

  // audio content caches
  const bufferRef = useRef<Map<string, AudioBuffer>>(new Map());
  const analysisRef = useRef<Map<string, Analysis>>(new Map());
  const voicesRef = useRef<LocalVoice[]>([]);

  // visual model
  const ringsRef = useRef<Map<string, RingMeta>>(new Map());
  const levelRef = useRef(0);

  // ── analysis loader (tempo + key pc), cached ────────────────────────────────
  const runLoadAnalysis = useCallback(async (id: string): Promise<Analysis> => {
    const cached = analysisRef.current.get(id);
    if (cached) return cached;
    let a: Analysis = { tempo: null, pc: null };
    try {
      const raw = await loadTrackAnalysis(id);
      if (raw) a = { tempo: raw.tempo, pc: parseKeyPc(raw.key_signature) };
    } catch {
      /* keep fallback */
    }
    analysisRef.current.set(id, a);
    return a;
  }, []);

  // recompute each voice's consensus transpose against the current key center
  const applyConsensus = useCallback((consensusPc: number | null) => {
    for (const v of voicesRef.current) {
      const pc = analysisRef.current.get(v.trackId)?.pc ?? null;
      v.detuneCents = pc == null || consensusPc == null ? 0 : semitoneToward(pc, consensusPc) * 100;
    }
  }, []);

  // pick two sibling tracks for ghost voices, distinct from the given track
  const ghostTrackFor = useCallback((baseId: string, i: number): string => {
    const n = REAL_TRACKS.length;
    const base = Math.max(0, REAL_TRACKS.findIndex((t) => t.id === baseId));
    return REAL_TRACKS[(base + 3 * (i + 1)) % n].id;
  }, []);

  const broadcast = useCallback((msg: PeerMsg) => {
    try {
      channelRef.current?.postMessage(msg);
    } catch {
      /* channel closing */
    }
  }, []);

  const selfMsg = useCallback(
    (type: "hello" | "heartbeat" | "state"): PeerMsg => ({
      type,
      id: myIdRef.current,
      trackId: trackRef.current,
      entryBeat: entryRef.current,
      gain: gainRef.current,
      muted: mutedRef.current,
    }),
    [],
  );

  // ── one scheduled loop of one voice (a fresh buffer source per iteration) ────
  const runScheduleLoop = useCallback(
    (v: LocalVoice, buffer: AudioBuffer, startWall: number, loopSec: number) => {
      const ctx = ctxRef.current;
      if (!ctx || !v.gainNode) return;
      const when = ctx.currentTime + (startWall - nowWall()) / 1000;
      if (when < ctx.currentTime - 0.02) return; // missed the boat

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.detune.value = v.detuneCents;

      const usable = Math.max(0, buffer.duration - loopSec);
      const regionStart = v.regionFrac * usable;

      const env = ctx.createGain();
      env.gain.value = 0;
      const t0 = Math.max(when, ctx.currentTime);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + 0.04);
      env.gain.setValueAtTime(1, t0 + loopSec - 0.06);
      env.gain.linearRampToValueAtTime(0, t0 + loopSec);

      src.connect(env);
      env.connect(v.gainNode);
      try {
        src.start(t0, regionStart);
        src.stop(t0 + loopSec);
      } catch {
        return;
      }
      activeSrcRef.current.add(src);
      src.onended = () => {
        activeSrcRef.current.delete(src);
        try {
          src.disconnect();
          env.disconnect();
        } catch {
          /* noop */
        }
      };
    },
    [],
  );

  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const g = gridRef.current;
    if (!ctx || !g) return;
    const beatMs = 60000 / g.bpm;
    const loopMs = LOOP_BEATS * beatMs;
    const loopSec = loopMs / 1000;
    const horizon = nowWall() + 280;

    for (const v of voicesRef.current) {
      const buffer = bufferRef.current.get(v.trackId);
      if (!buffer || !v.gainNode) continue;
      const phaseMs = (((v.entryBeat % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS) * beatMs;
      if (v.nextStartWall == null) {
        const elapsed = nowWall() - (g.epochMs + phaseMs);
        const k = Math.ceil(elapsed / loopMs);
        v.nextStartWall = g.epochMs + phaseMs + k * loopMs;
      }
      let guard = 0;
      while (v.nextStartWall <= horizon && guard < 4) {
        runScheduleLoop(v, buffer, v.nextStartWall, loopSec);
        v.nextStartWall += loopMs;
        guard += 1;
      }
    }
  }, [runScheduleLoop]);

  // ── the always-on frame loop: elect leader, resolve grid, drive visuals ─────
  const runFrame = useCallback(() => {
    const t = performance.now();

    // prune silent peers
    const peers = peersRef.current;
    for (const [id, p] of peers) {
      if (t - p.lastSeen > PEER_TIMEOUT_MS) {
        peers.delete(id);
        senderGridsRef.current.delete(id);
      }
    }

    // leader = lowest id among me + live peers
    let leaderId = myIdRef.current;
    for (const id of peers.keys()) if (id < leaderId) leaderId = id;
    const meLeads = leaderId === myIdRef.current;

    // effective grid: mine if I lead, else the leader's last broadcast
    const myGrid: SenderGrid = {
      bpm: myBpmRef.current,
      epochMs: myEpochRef.current,
      loopBeats: LOOP_BEATS,
      consensusPc: myPcRef.current,
    };
    const eff = meLeads ? myGrid : senderGridsRef.current.get(leaderId) ?? myGrid;
    const sig = `${eff.bpm.toFixed(2)}|${eff.epochMs.toFixed(0)}|${eff.consensusPc ?? "x"}`;
    if (sig !== gridSigRef.current) {
      gridSigRef.current = sig;
      gridRef.current = eff;
      for (const v of voicesRef.current) v.nextStartWall = null; // re-align
      applyConsensus(eff.consensusPc);
      setBpm(Math.round(eff.bpm));
      setKeyLabel(eff.consensusPc == null ? "—" : `${PC_NAMES[eff.consensusPc]} center`);
    }

    // analyser level for onset glow
    const safe = safeRef.current;
    if (safe) {
      const buf = new Uint8Array(safe.analyser.fftSize);
      safe.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = (buf[i] - 128) / 128;
        sum += d * d;
      }
      levelRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
    }

    // ── rebuild the ring snapshots (live voices + peers), keep gone ones fading
    const rings = ringsRef.current;
    const seen = new Set<string>();
    const soloMask = soloRef.current;

    // my voice
    const myIdx = Math.max(0, REAL_TRACKS.findIndex((x) => x.id === trackRef.current));
    upsertRing(rings, {
      key: "me",
      trackIndex: myIdx,
      entryBeat: entryRef.current,
      gain: mutedRef.current ? 0 : gainRef.current,
      muted: mutedRef.current,
      label: "You",
      conductor: meLeads,
      local: true,
    });
    seen.add("me");

    // ghost voices (only those currently audible)
    const desiredGhosts = clamp(TARGET_VOICES - 1 - peers.size, 0, 2);
    voicesRef.current.forEach((v) => {
      if (v.key === "me") return;
      const gi = Number(v.key.replace("ghost", ""));
      if (gi >= desiredGhosts) return;
      const idx = Math.max(0, REAL_TRACKS.findIndex((x) => x.id === v.trackId));
      upsertRing(rings, {
        key: v.key,
        trackIndex: idx,
        entryBeat: v.entryBeat,
        gain: soloMask ? 0 : GHOST_GAIN,
        muted: soloMask,
        label: "Ghost",
        conductor: false,
        local: true,
      });
      seen.add(v.key);
    });

    // remote peers
    for (const p of peers.values()) {
      const idx = Math.max(0, REAL_TRACKS.findIndex((x) => x.id === p.trackId));
      const k = `peer${p.id}`;
      upsertRing(rings, {
        key: k,
        trackIndex: idx,
        entryBeat: p.entryBeat,
        gain: p.muted ? 0 : p.gain,
        muted: p.muted,
        label: "Live tab",
        conductor: p.id === leaderId,
        local: false,
      });
      seen.add(k);
    }

    // mark gone / cull faded
    const wall = nowWall();
    for (const [k, m] of rings) {
      if (!seen.has(k)) {
        if (m.goneWall == null) m.goneWall = wall;
        else if (wall - m.goneWall > FADE_MS) rings.delete(k);
      } else {
        m.goneWall = null;
      }
    }

    // surface counts / leadership (only on change)
    const vc = 1 + desiredGhosts + peers.size;
    setVoiceCount((v) => (v === vc ? v : vc));
    setPeerCount((v) => (v === peers.size ? v : peers.size));
    setIsLeader((v) => (v === meLeads ? v : meLeads));

    setTick((n) => (n + 1) & 0xffff);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [applyConsensus]);

  // ── mount: identity, channel, timers, frame loop, initial analysis ──────────
  useEffect(() => {
    const seed = (performance.now() * 1000) >>> 0;
    const rng = mulberry32(seed || 1);
    rngRef.current = rng;
    myIdRef.current = Math.floor(rng() * 2_000_000_000) + 1;
    myEpochRef.current = nowWall();
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const hasBC = typeof BroadcastChannel !== "undefined";
    setBcSupported(hasBC);

    let ch: BroadcastChannel | null = null;
    if (hasBC) {
      ch = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (ev: MessageEvent<PeerMsg>) => {
        const m = ev.data;
        if (!m || typeof m !== "object") return;
        if (m.type === "grid") {
          senderGridsRef.current.set(m.from, {
            bpm: m.bpm,
            epochMs: m.epochMs,
            loopBeats: m.loopBeats,
            consensusPc: m.consensusPc,
          });
          return;
        }
        if (m.type === "bye") {
          peersRef.current.delete(m.id);
          senderGridsRef.current.delete(m.id);
          return;
        }
        // hello | heartbeat | state
        const existed = peersRef.current.has(m.id);
        peersRef.current.set(m.id, {
          id: m.id,
          lastSeen: performance.now(),
          trackId: m.trackId,
          entryBeat: m.entryBeat,
          gain: m.gain,
          muted: m.muted,
        });
        // answer a newcomer so it learns about us immediately
        if (m.type === "hello" && !existed) broadcast(selfMsg("heartbeat"));
      };
      broadcast(selfMsg("hello"));
    }

    // heartbeat + (if leading) grid broadcast
    beatRef.current = window.setInterval(() => {
      broadcast(selfMsg("heartbeat"));
      let leaderId = myIdRef.current;
      for (const id of peersRef.current.keys()) if (id < leaderId) leaderId = id;
      if (leaderId === myIdRef.current) {
        broadcast({
          type: "grid",
          from: myIdRef.current,
          bpm: myBpmRef.current,
          epochMs: myEpochRef.current,
          loopBeats: LOOP_BEATS,
          consensusPc: myPcRef.current,
        });
      }
    }, HEARTBEAT_MS);

    rafRef.current = requestAnimationFrame(runFrame);

    // seed the leader's tempo/key from the initial track so the grid is musical
    void runLoadAnalysis(trackRef.current).then((a) => {
      myBpmRef.current = a.tempo ? clamp(a.tempo, 50, 150) : FALLBACK_BPM;
      myPcRef.current = a.pc;
    });

    const bye = () => broadcast({ type: "bye", id: myIdRef.current });
    window.addEventListener("pagehide", bye);

    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
      if (beatRef.current != null) window.clearInterval(beatRef.current);
      if (schedRef.current != null) window.clearInterval(schedRef.current);
      cancelAnimationFrame(rafRef.current);
      try {
        ch?.close();
      } catch {
        /* noop */
      }
      channelRef.current = null;
    };
  }, [broadcast, runFrame, runLoadAnalysis, selfMsg]);

  // ── start audio (needs a user gesture) ──────────────────────────────────────
  const start = useCallback(async () => {
    if (started || starting) return;
    setStarting(true);
    setError(null);
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      ctxRef.current = ctx;
      safeRef.current = safe;

      const rng = rngRef.current;
      const baseId = trackRef.current;
      const voices: LocalVoice[] = [];

      const mkVoice = (key: string, trackId: string, entryBeat: number, targetGain: number): LocalVoice => {
        const gn = ctx.createGain();
        gn.gain.value = targetGain;
        gn.connect(safe.input);
        return { key, trackId, entryBeat, regionFrac: rng() * 0.7, gainNode: gn, targetGain, detuneCents: 0, nextStartWall: null };
      };

      voices.push(mkVoice("me", baseId, entryRef.current, gainRef.current));
      voices.push(mkVoice("ghost0", ghostTrackFor(baseId, 0), 3, GHOST_GAIN));
      voices.push(mkVoice("ghost1", ghostTrackFor(baseId, 1), 5, GHOST_GAIN));
      voicesRef.current = voices;

      // load every distinct buffer + analysis in parallel
      const ids = Array.from(new Set(voices.map((v) => v.trackId)));
      await Promise.all(
        ids.map(async (id) => {
          const { buffer } = await loadRealTrackBuffer(ctx, id);
          bufferRef.current.set(id, buffer);
          await runLoadAnalysis(id);
        }),
      );
      applyConsensus(gridRef.current?.consensusPc ?? myPcRef.current);

      schedRef.current = window.setInterval(runScheduler, 110);
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Karel's audio.");
    } finally {
      setStarting(false);
    }
  }, [applyConsensus, ghostTrackFor, runLoadAnalysis, runScheduler, started, starting]);

  // full teardown of audio on unmount
  useEffect(() => {
    return () => {
      for (const s of activeSrcRef.current) {
        try {
          s.stop();
          s.disconnect();
        } catch {
          /* noop */
        }
      }
      activeSrcRef.current.clear();
      try {
        safeRef.current?.disconnect();
      } catch {
        /* noop */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
      safeRef.current = null;
    };
  }, []);

  // ── config → refs + audio + broadcast ───────────────────────────────────────
  useEffect(() => {
    entryRef.current = myEntryBeat;
    const me = voicesRef.current.find((v) => v.key === "me");
    if (me && me.entryBeat !== myEntryBeat) {
      me.entryBeat = myEntryBeat;
      me.nextStartWall = null;
    }
    if (started) broadcast(selfMsg("state"));
  }, [myEntryBeat, started, broadcast, selfMsg]);

  useEffect(() => {
    gainRef.current = myGain;
    mutedRef.current = myMuted;
    soloRef.current = mySolo;
    const ctx = ctxRef.current;
    const me = voicesRef.current.find((v) => v.key === "me");
    if (ctx && me?.gainNode) me.gainNode.gain.setTargetAtTime(myMuted ? 0 : myGain, ctx.currentTime, 0.05);
    // solo mutes local ghosts
    if (ctx) {
      voicesRef.current.forEach((v) => {
        if (v.key === "me" || !v.gainNode) return;
        v.gainNode.gain.setTargetAtTime(mySolo ? 0 : GHOST_GAIN, ctx.currentTime, 0.05);
      });
    }
    if (started) broadcast(selfMsg("state"));
  }, [myGain, myMuted, mySolo, started, broadcast, selfMsg]);

  // track change: swap my voice's source, re-pick ghosts, reload, re-consensus
  useEffect(() => {
    trackRef.current = myTrack;
    let cancelled = false;
    void (async () => {
      const a = await runLoadAnalysis(myTrack);
      if (cancelled) return;
      myBpmRef.current = a.tempo ? clamp(a.tempo, 50, 150) : FALLBACK_BPM;
      myPcRef.current = a.pc;

      const me = voicesRef.current.find((v) => v.key === "me");
      if (me) {
        me.trackId = myTrack;
        me.nextStartWall = null;
      }
      voicesRef.current.forEach((v) => {
        if (v.key === "me") return;
        const gi = Number(v.key.replace("ghost", ""));
        v.trackId = ghostTrackFor(myTrack, gi);
        v.nextStartWall = null;
      });

      const ctx = ctxRef.current;
      if (ctx) {
        const ids = Array.from(new Set(voicesRef.current.map((v) => v.trackId)));
        await Promise.all(
          ids.map(async (id) => {
            if (!bufferRef.current.has(id)) {
              try {
                const { buffer } = await loadRealTrackBuffer(ctx, id);
                bufferRef.current.set(id, buffer);
              } catch {
                /* leave unscheduled */
              }
            }
            await runLoadAnalysis(id);
          }),
        );
        if (cancelled) return;
        applyConsensus(gridRef.current?.consensusPc ?? myPcRef.current);
      }
      if (started) broadcast(selfMsg("state"));
    })();
    return () => {
      cancelled = true;
    };
  }, [myTrack, started, applyConsensus, ghostTrackFor, runLoadAnalysis, broadcast, selfMsg]);

  // once a real second tab appears, offer a canon-friendly default entry beat
  useEffect(() => {
    if (peerCount > 0 && !userNudgedRef.current && myEntryBeat === 0 && !isLeader) {
      setMyEntryBeat(4);
    }
  }, [peerCount, isLeader, myEntryBeat]);

  // ── render helpers ──────────────────────────────────────────────────────────
  const nudge = (d: number) => {
    userNudgedRef.current = true;
    setMyEntryBeat((b) => ((b + d) % LOOP_BEATS + LOOP_BEATS) % LOOP_BEATS);
  };

  const g = gridRef.current;
  const beatMs = g ? 60000 / g.bpm : 60000 / FALLBACK_BPM;
  const loopMs = LOOP_BEATS * beatMs;
  const rot = reducedRef.current ? 0 : (frac(nowWall() / ROT_PERIOD_MS) * 360);

  const ringList = Array.from(ringsRef.current.values()).sort((a, b) => {
    const rank = (m: RingMeta) => (m.key === "me" ? 0 : m.key.startsWith("ghost") ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.key < b.key ? -1 : 1;
  });

  const cx = 200;
  const cy = 200;
  const baseR = 46;
  const stepR = Math.min(20, (176 - baseR) / Math.max(1, ringList.length));
  const wall = nowWall();

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* design-notes control */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="relative z-0 mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8 sm:px-10">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            ← dream lab
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Canon Circle</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Every open tab is a live voice in a canon spun from Karel&apos;s real recorded piano — the room auto-tunes
            everyone to one shared key and tempo.
          </p>
          <div className="mt-4">
            {!started ? (
              <button
                type="button"
                onClick={start}
                disabled={starting}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {starting ? "Loading Karel's piano…" : "Begin the canon"}
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {isLeader ? "you are the conductor" : "a peer tab is conducting"}
              </span>
            )}
          </div>
        </header>

        {error && <p className="text-base text-destructive">Audio failed to load: {error}</p>}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── the canon clock ── */}
          <div className="flex flex-col items-center">
            <svg viewBox="0 0 400 400" className="aspect-square w-full max-w-[440px]" role="img" aria-label="Rotating canon clock">
              <defs>
                <radialGradient id="cc-bg" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="#160c2b" />
                  <stop offset="100%" stopColor="#04030a" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="400" height="400" fill="url(#cc-bg)" />
              <g transform={`rotate(${rot} ${cx} ${cy})`}>
                {ringList.map((m, i) => {
                  const r = baseR + i * stepR;
                  const C = 2 * Math.PI * r;
                  const elapsed = wall - ((g?.epochMs ?? myEpochRef.current) + m.entryBeat * beatMs);
                  const phase = ((elapsed % loopMs) + loopMs) % loopMs / loopMs;
                  const beatPulse = 1 - frac(((elapsed % beatMs) + beatMs) % beatMs / beatMs);
                  const bright = clamp(0.28 + 0.5 * beatPulse * (0.4 + m.gain) + 0.35 * levelRef.current * m.gain, 0.12, 1);
                  const age = clamp((wall - m.bornWall) / BLOOM_MS, 0, 1);
                  const fade = m.goneWall == null ? 1 : clamp(1 - (wall - m.goneWall) / FADE_MS, 0, 1);
                  const alpha = age * fade;
                  const hue = 258 + (m.trackIndex % 8) * 5;
                  const light = 40 + bright * 34;
                  const stroke = `hsl(${hue} 74% ${light}%)`;
                  const ang = phase * Math.PI * 2 - Math.PI / 2;
                  const px = cx + r * Math.cos(ang);
                  const py = cy + r * Math.sin(ang);
                  const w = m.local ? 3.4 : 2.6;
                  return (
                    <g key={m.key} opacity={alpha} transform={`rotate(-90 ${cx} ${cy})`}>
                      {/* faint full ring */}
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeOpacity={0.14} strokeWidth={w} />
                      {/* swept playhead arc */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={w}
                        strokeLinecap="round"
                        strokeDasharray={`${Math.max(0.01, phase) * C} ${C}`}
                        strokeOpacity={m.muted ? 0.25 : 0.9}
                      />
                      {m.conductor && (
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ddd6fe" strokeOpacity={0.22} strokeWidth={0.8} strokeDasharray="2 6" />
                      )}
                      {/* the note-onset petal at the playhead */}
                      <g transform={`rotate(90 ${cx} ${cy})`}>
                        <circle cx={px} cy={py} r={3 + 5 * beatPulse * (m.muted ? 0 : 1)} fill={stroke} fillOpacity={m.muted ? 0.3 : 0.55} />
                        <circle cx={px} cy={py} r={2.4} fill={m.conductor ? "#ede9fe" : stroke} />
                      </g>
                    </g>
                  );
                })}
              </g>
              {/* center readout (upright, outside rotation) */}
              <text x={cx} y={cy - 6} textAnchor="middle" fontSize="34" fontWeight="600" fill="#ede9fe">{voiceCount}</text>
              <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" letterSpacing="2" fill="#a78bfa">
                {voiceCount === 1 ? "VOICE" : "VOICES"}
              </text>
              <text x={cx} y={cy + 34} textAnchor="middle" fontSize="9.5" letterSpacing="1.5" fill="#8a8a93">
                {isLeader ? "YOU CONDUCT" : "PEER CONDUCTS"}
              </text>
            </svg>

            {!started && (
              <p className="mt-4 max-w-md text-center text-sm text-muted-foreground">
                Press <span className="text-foreground">Begin the canon</span> to hear it. Two ghost voices fill the round
                until a real tab joins.
              </p>
            )}
            {started && (
              <p className="mt-4 max-w-md text-center text-sm text-muted-foreground">
                {peerCount === 0
                  ? "Open this page in a second tab to add a live voice."
                  : `${peerCount} live peer tab${peerCount === 1 ? "" : "s"} in the canon with you.`}
              </p>
            )}
            {!bcSupported && (
              <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                This browser has no BroadcastChannel — running solo with ghost voices only.
              </p>
            )}
          </div>

          {/* ── controls ── */}
          <div className="space-y-6">
            <section className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Consensus</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Shared tempo</span>
                <span className="text-foreground">{bpm} BPM</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Key center</span>
                <span className="text-foreground">{keyLabel}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Conductor</span>
                <span className="text-foreground">{isLeader ? "this tab" : "a peer tab"}</span>
              </div>
            </section>

            <section className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground" htmlFor="cc-track">
                Your voice — track
              </label>
              <select
                id="cc-track"
                value={myTrack}
                onChange={(e) => setMyTrack(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
              >
                {REAL_TRACKS.map((tk) => (
                  <option key={tk.id} value={tk.id}>
                    {tk.title}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Auto-transposed into the shared key — layers stay consonant no matter who joins.
              </p>
            </section>

            <section className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Entry beat</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => nudge(-1)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  − 1 beat
                </button>
                <span className="min-w-[3ch] text-center text-base text-foreground">{myEntryBeat}</span>
                <button
                  type="button"
                  onClick={() => nudge(1)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  + 1 beat
                </button>
                <span className="text-sm text-muted-foreground">of {LOOP_BEATS}</span>
              </div>
              <p className="text-sm text-muted-foreground">Stagger your entry against the others to open the round.</p>
            </section>

            <section className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Your gain</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={myGain}
                  onChange={(e) => setMyGain(parseFloat(e.target.value))}
                  className="w-40 accent-primary"
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMyMuted((v) => !v)}
                  className={`min-h-[44px] flex-1 rounded-md border px-4 text-sm transition-colors ${
                    myMuted
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {myMuted ? "Muted" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={() => setMySolo((v) => !v)}
                  className={`min-h-[44px] flex-1 rounded-md border px-4 text-sm transition-colors ${
                    mySolo
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {mySolo ? "Soloing" : "Solo"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if opening a second browser tab makes you a
                live second voice in a canon built from Karel&apos;s own recorded piano — and the room automatically keeps
                every voice in the same key and tempo?
              </p>
              <p>
                <span className="text-foreground">How to play.</span> Press begin, then open this same page in another
                tab. Each tab becomes a voice looping a phrase from a real recording. Nudge your entry beat and pick your
                track to shape the round.
              </p>
              <p>
                <span className="text-foreground">Mechanism.</span> Tabs gossip over a same-origin BroadcastChannel with no
                server. The lowest tab-id is elected conductor and broadcasts one beat grid (bpm + a shared wall-clock
                epoch) and one consensus key center — Shin&apos;s &ldquo;harmonic consensus stage.&rdquo; Followers phase-align to that
                grid and are auto-transposed via detune so every phrase&apos;s root snaps into the shared key. With one tab,
                two ghost voices fill the canon.
              </p>
              <p>
                <span className="text-foreground">References.</span> D. Shin, &ldquo;Real-Time Collaborative Generative Music
                Jamming on a Video Sharing Platform,&rdquo; Technical Disclosure Commons, Aug 5 2026; Steve Reich, phase /
                canon technique. Audio is Karel&apos;s verified catalog only.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// mutate-or-insert a ring snapshot; preserves bornWall across frames.
function upsertRing(
  map: Map<string, RingMeta>,
  next: Omit<RingMeta, "bornWall" | "goneWall">,
) {
  const prev = map.get(next.key);
  if (prev) {
    prev.trackIndex = next.trackIndex;
    prev.entryBeat = next.entryBeat;
    prev.gain = next.gain;
    prev.muted = next.muted;
    prev.label = next.label;
    prev.conductor = next.conductor;
    prev.local = next.local;
    prev.goneWall = null;
  } else {
    map.set(next.key, { ...next, bornWall: nowWall(), goneWall: null });
  }
}
