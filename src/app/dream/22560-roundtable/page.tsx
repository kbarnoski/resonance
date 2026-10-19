"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 22560-roundtable — the dream lab's first explicitly MULTI-CYCLE build, and
// the first claimed multi-cycle build in the lab's history to reach CYCLE 3.
// CYCLE 1: the skeleton — a real, playable, honest foundation.
// CYCLE 2: attention and overlap now MEAN something.
// CYCLE 3 (this fire): the room survives, completes the piece, and can conduct
// by hand.
//
// The question: what if one of Karel's real piano takes could only be fully
// HEARD when a room of present listeners COLLECTIVELY covered it? The take is
// laid around a RING (angle = position in the piece). A playhead sweeps the
// ring in synced time, the same instant on every peer. Each present listener
// holds a WINDOW — an arc centered on their pointer. The COLLECTIVE coverage is
// the UNION of all arcs. Where the sweeping playhead is INSIDE the covered
// region the take plays at full presence; in an UNCOVERED gap it dims (gain
// ducks, a low-pass closes) — the piece literally thins out where no one is
// attending. A solo listener lights one slice; a full room, spreading out,
// keeps the whole piece alive. Cooperative, not competitive.
//
// CYCLE 2 adds the two things that turn coverage into a social act:
//   • Attention EARNS coverage. Your arc is no longer a fixed fifth — it is
//     narrow when you are restless and WIDENS the longer you settle on one
//     stretch. A room that darts around covers little; a room that each
//     settles into a part keeps more of the piece alive. Earned width is
//     broadcast, so everyone sees everyone's attention.
//   • Overlap EARNS harmony. Where two or more windows stack on the same
//     stretch, the take gains a voice: an octave-up halo of his OWN recording
//     swells in exactly where the playhead crosses a doubly-covered region.
//     Stacking attention doesn't just keep the piece alive — it enriches it.
//   Both are computed identically on every peer (the shared arc set + the
//   shared-clock playhead), so what you SEE lighting is what you HEAR.
//
// CYCLE 3 adds the three things that complete the shared-room arc:
//   • The room SURVIVES. The transport anchor is held by the lowest-id peer;
//     when that host leaves, peerSync re-elects the next peer and the keeper
//     re-broadcasts the SAME anchor, so the take never restarts — the piece
//     keeps playing through the departure. A silence backstop covers an abrupt
//     close that never sends a goodbye. Whoever takes over sees "you're hosting
//     now", so the hand-off is legible, not invisible.
//   • The room COMPLETES the piece. When the union of all windows covers nearly
//     the WHOLE ring, the breathing stops: the take is held at full presence
//     everywhere, a celebratory bloom lights the ring, and the readout says so.
//     It is the reward the whole cooperative thesis was building toward, and —
//     like every other rule — it is computed identically on every peer from the
//     shared arc set, so what you SEE is what you HEAR.
//   • You can CONDUCT your window by HAND. An optional camera layer (MediaPipe
//     one-hand tracking) reaches toward the part of the ring you tend — the
//     catalog audio is unchanged, the hand only moves the same arc the pointer
//     does (the sanctioned camera-as-control-layer pattern). Pointer stays the
//     default and the fallback; tracking state is always labelled on screen.
//
// Transport: _shared/peerSync — BroadcastChannel so two tabs of the SAME
// browser fill the room instantly (the primary demo path), a real WebRTC data
// channel for remote peers, and an NTP-style shared clock over both so the
// playhead angle (derived from that clock) and the audio position match on
// every peer. Solo fully works: your one arc lights its slice, the rest thins.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createPeerSync, type PeerSync, type PeerStatus, type PeerClockInfo } from "../_shared/peerSync";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";

// ── constants ────────────────────────────────────────────────────────────────

const ROOM = "roundtable";
const TAU = Math.PI * 2;
const ARC_WIDTH = TAU * (72 / 360); // default/remote seed width (a fifth of the ring) before earned width is known
const SEND_HZ = 20; // arc broadcast rate
const STALE_MS = 3000; // prune peers whose arc we have not heard from
const COVER_SAMPLES = 360; // samples around the ring for the coverage readout

// cycle 2 — attention earns coverage: a settled window widens, a restless one narrows.
const MIN_WIDTH = TAU * (34 / 360); // a restless listener barely covers a slice
const MAX_WIDTH = TAU * (122 / 360); // a settled listener tends a third of the ring
const DWELL_FULL = 5.5; // seconds of settled attention to reach full width
const DWELL_SEED = 2.3; // initial dwell → first screen opens near the old fixed 72°
const STILL_SPEED = TAU * 0.09; // rad/s below which attention accumulates (~16°/s)
const DWELL_DECAY = 2.2; // restlessness narrows the window faster than stillness widens it

const LIT_GAIN = 1.0;
const GAP_GAIN = 0.22; // the take thins to a veil (clearly dimmed, not near-muted) where no one is attending
const LIT_CUTOFF = 14000;
const GAP_CUTOFF = 720;

// cycle 2 — overlap earns harmony: an octave-up halo of his OWN take swells where arcs stack.
const HARMONY_GAIN = 0.34; // max added gain of the octave voice where the playhead crosses an overlap
const HARMONY_CUTOFF = 5200; // soft — a halo, not a competing melody

// cycle 3 — the room completes the piece: when the union nearly covers the whole
// ring, hold the take at full presence everywhere (hysteresis so it does not flap
// at the boundary). Computed from the shared arc set, so identical on every peer.
const COMPLETE_ON = 0.985; // union coverage at/above which the piece is "completed"
const COMPLETE_OFF = 0.92; // drops back to breathing below this

// cycle 3 — host migration backstop: if no transport anchor has been heard from
// another peer for this long, the lowest LIVE peer re-broadcasts (covers an
// abrupt tab close that never sent a goodbye; the clean path is peerSync's
// re-election on `bye`, which is faster).
const HOST_SILENCE_MS = 5000;

// cycle 3 — hand conducting (optional camera layer). Smoothing time-constant keeps
// gesture → arc immediate but not twitchy; a minimum reach gates out center jitter.
const HAND_SMOOTH_TC = 0.12; // seconds
const HAND_MIN_REACH = 0.12; // |(cx,cy)| below which we hold the last angle
const HAND_LOST_MS = 500; // no hand for this long → fall back to pointer, labelled

// Art palette — violet brand accent for the collective, cool tones per peer.
const SELF_HEX = "#c4b5fd";
const SELF_GLOW = "#a78bfa";
const COVER_HEX = "#8b5cf6";
const HARMONY_HEX = "#ede9fe"; // the brighter seam where windows overlap
const PEER_HEXES = ["#67e8f9", "#5eead4", "#38bdf8", "#818cf8", "#a5b4fc", "#2dd4bf"];
const BG_HEX = "#07060d";

interface Arc {
  angle: number; // center, 0..TAU (0 = top, clockwise)
  width: number; // total angular width
  lastSeen: number; // local performance.now() of last update
}

// ── pure helpers (never prefixed `use`) ──────────────────────────────────────

function norm(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

function angDist(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b)) % TAU;
  return d > Math.PI ? TAU - d : d;
}

// Shortest signed angular step from → to, in (-π, π]. For smooth hand conducting
// around the ring without wrap-around jumps.
function shortestDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Hash a peer id to a stable color so both peers agree on who is which hue.
function peerHex(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PEER_HEXES[h % PEER_HEXES.length];
}

// ── component ────────────────────────────────────────────────────────────────

export default function RoundtablePage() {
  const { immersive, toggle } = useImmersive();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const coverGainRef = useRef<GainNode | null>(null);
  const coverFilterRef = useRef<BiquadFilterNode | null>(null);
  const harmSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const harmGainRef = useRef<GainNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastLitRef = useRef<boolean>(true);
  const lastHarmRef = useRef<boolean>(false);

  // transport
  const syncRef = useRef<PeerSync | null>(null);
  const anchorRef = useRef<{ startAtSharedMs: number; offsetSec: number } | null>(null);
  const enteredRef = useRef(false);
  const startedRef = useRef(false);
  const startingRef = useRef(false);

  // ring state
  const selfArcRef = useRef<Arc>({ angle: 0, width: ARC_WIDTH, lastSeen: 0 });
  const remoteArcsRef = useRef<Map<string, Arc>>(new Map());
  const draggingRef = useRef(false);
  const currentTrackRef = useRef<string>(REAL_TRACKS[0].id);
  const noteAnglesRef = useRef<number[]>([]);

  // cycle 2 — earned-width (attention) tracking
  const dwellRef = useRef<number>(DWELL_SEED);
  const lastAngleRef = useRef<number>(0);
  const lastFrameTRef = useRef<number>(0);

  // cycle 3 — host migration (the room survives the host leaving)
  const lastStartHeardRef = useRef<number>(0); // perf.now of last `start` from ANOTHER peer
  const roomHadPeersRef = useRef<boolean>(false);
  const wasEffHostRef = useRef<boolean>(true); // start true: the original host never shows a hand-off
  const handoffAtRef = useRef<number | null>(null);

  // cycle 3 — the room completes the piece (held full-presence climax)
  const completedRef = useRef<boolean>(false);

  // cycle 3 — hand conducting (optional camera layer over the catalog audio)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handTrackerRef = useRef<HandLandmarkerInst | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camOnRef = useRef<boolean>(false);
  const handAngleRef = useRef<number>(0); // smoothed hand-driven arc target
  const handPresentRef = useRef<boolean>(false);
  const lastHandTRef = useRef<number>(0);

  const actionsRef = useRef<{
    enter: () => void;
    createOffer: () => void;
    acceptAnswer: (code: string) => void;
    acceptOffer: (code: string) => void;
    startCam: () => void;
    stopCam: () => void;
  } | null>(null);

  // UI state
  const [entered, setEntered] = useState(false);
  const [status, setStatus] = useState<PeerStatus>("idle");
  const [backend, setBackend] = useState<string>("solo");
  const [peerCount, setPeerCount] = useState(0);
  const [clock, setClock] = useState<PeerClockInfo>({ offsetMs: 0, rttMs: Infinity });
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [coveredPct, setCoveredPct] = useState(0);
  const [harmonyPct, setHarmonyPct] = useState(0);
  const [attention, setAttention] = useState(DWELL_SEED / DWELL_FULL);
  const [lit, setLit] = useState(false);
  const [present, setPresent] = useState(1);
  const [keyInfo, setKeyInfo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // cycle 3 UI state
  const [completed, setCompleted] = useState(false);
  const [hosting, setHosting] = useState(true);
  const [handoff, setHandoff] = useState(false);
  const [camState, setCamState] = useState<"off" | "loading" | "live" | "lost" | "error">("off");

  // remote-connect panel
  const [showRemote, setShowRemote] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [pasteBox, setPasteBox] = useState("");

  // keep currentTrackRef in sync with the selector
  useEffect(() => {
    currentTrackRef.current = trackId;
    const t = REAL_TRACKS.find((r) => r.id === trackId);
    if (t) setTrackTitle(t.title);
  }, [trackId]);

  // ── mount-once engine ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    // ---- transport wiring -------------------------------------------------
    const refresh = () => {
      const s = syncRef.current;
      if (!s) return;
      setBackend(s.getBackend());
      setPeerCount(s.peers().length);
    };

    const sync = createPeerSync({
      room: ROOM,
      onStatus: (st) => {
        setStatus(st);
        refresh();
      },
      onPeers: () => refresh(),
      onClock: (info) => setClock(info),
      onMessage: (payload, from) => onPeerMessage(payload, from),
    });
    syncRef.current = sync;
    // Zero-click two-tab review path: same-browser tabs sync instantly.
    try {
      sync.startLocal();
    } catch {
      /* no BroadcastChannel → solo still works */
    }
    refresh();

    function onPeerMessage(payload: unknown, from: string): void {
      if (!isRecord(payload)) return;
      const t = payload.t;
      if (t === "arc") {
        const angle = payload.angle;
        const width = payload.width;
        if (typeof angle === "number" && typeof width === "number") {
          remoteArcsRef.current.set(from, {
            angle: norm(angle),
            width,
            lastSeen: performance.now(),
          });
        }
      } else if (t === "start") {
        const S = payload.startAtSharedMs;
        const O = payload.offsetSec;
        if (typeof S === "number" && typeof O === "number") {
          // We heard the transport anchor from another peer → the host is alive,
          // so the migration backstop stays armed but idle (cycle 3).
          lastStartHeardRef.current = performance.now();
          applyAnchor({ startAtSharedMs: S, offsetSec: O });
        }
      }
    }

    // ---- audio ------------------------------------------------------------
    async function ensureBuffer(ctx: AudioContext, id: string): Promise<AudioBuffer | null> {
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        bufRef.current = buffer;
        setTrackTitle(title);
        return buffer;
      } catch {
        setError("Could not load Karel's recording. Check the connection and re-enter the ring.");
        return null;
      }
    }

    function stopSource(): void {
      const src = srcRef.current;
      if (src) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        try {
          src.disconnect();
        } catch {
          /* detached */
        }
        srcRef.current = null;
      }
      const harm = harmSrcRef.current;
      if (harm) {
        try {
          harm.stop();
        } catch {
          /* already stopped */
        }
        try {
          harm.disconnect();
        } catch {
          /* detached */
        }
        harmSrcRef.current = null;
      }
      coverGainRef.current = null;
      coverFilterRef.current = null;
      harmGainRef.current = null;
    }

    function startSource(): void {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      const buf = bufRef.current;
      const a = anchorRef.current;
      const s = syncRef.current;
      if (!ctx || !master || !buf || !a || !s) return;
      if (startedRef.current || startingRef.current) return;
      startingRef.current = true;
      try {
        stopSource();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        // coverage chain: source → low-pass → gain → safeMaster
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = LIT_CUTOFF;
        filter.Q.value = 0.707;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001; // coverage logic ramps this in click-free

        src.connect(filter);
        filter.connect(gain);
        gain.connect(master.input);

        const dur = buf.duration;
        const leadMs = a.startAtSharedMs - s.now();
        let offset = a.offsetSec;
        let when = ctx.currentTime + Math.max(0, leadMs / 1000);
        if (leadMs < 0) offset = a.offsetSec + -leadMs / 1000; // late joiner → jump in
        else when = ctx.currentTime + leadMs / 1000;
        offset = ((offset % dur) + dur) % dur;

        src.start(when, offset);

        // cycle 2 — the overlap harmony voice: the SAME take, one octave up,
        // phase-aligned (octave = 2× rate, so it realigns with the main voice
        // at each loop), soft-filtered, silent until the playhead crosses an
        // overlap. Still his recording (resampled), never a synth tone.
        const harm = ctx.createBufferSource();
        harm.buffer = buf;
        harm.loop = true;
        harm.detune.value = 1200; // +1 octave
        const harmFilter = ctx.createBiquadFilter();
        harmFilter.type = "lowpass";
        harmFilter.frequency.value = HARMONY_CUTOFF;
        harmFilter.Q.value = 0.707;
        const harmGain = ctx.createGain();
        harmGain.gain.value = 0.0001; // overlap logic swells this in click-free
        harm.connect(harmFilter);
        harmFilter.connect(harmGain);
        harmGain.connect(master.input);
        harm.start(when, offset);

        srcRef.current = src;
        coverGainRef.current = gain;
        coverFilterRef.current = filter;
        harmSrcRef.current = harm;
        harmGainRef.current = harmGain;
        lastLitRef.current = false; // force first coverage apply
        lastHarmRef.current = false;
        startedRef.current = true;
        setEntered(true);
      } finally {
        startingRef.current = false;
      }
    }

    function applyAnchor(a: { startAtSharedMs: number; offsetSec: number }): void {
      anchorRef.current = a;
      if (enteredRef.current && !startedRef.current) startSource();
    }

    function hostStart(): void {
      const s = syncRef.current;
      if (!s) return;
      const a = { startAtSharedMs: s.now() + 400, offsetSec: 0 };
      s.send({ t: "start", startAtSharedMs: a.startAtSharedMs, offsetSec: a.offsetSec });
      applyAnchor(a);
    }

    // cycle 3 — who holds the transport anchor. The CLEAN path is peerSync's
    // own election: the lowest-id peer is host, and when the host leaves it
    // sends `bye`, the survivors drop it, and the next-lowest id becomes host —
    // so the keeper below just keeps re-broadcasting the existing anchor and the
    // take never restarts. The BACKSTOP (for an abrupt close that sends no
    // `bye`): if no `start` has been heard from another peer for HOST_SILENCE_MS,
    // the lowest LIVE peer (by heard-recently arc) takes over. Both are pure
    // functions of shared state, so every peer agrees on exactly one keeper.
    function amEffectiveHost(): boolean {
      const s = syncRef.current;
      if (!s) return true;
      if (s.isHost()) return true;
      const now = performance.now();
      if (now - lastStartHeardRef.current <= HOST_SILENCE_MS) return false;
      // elected host has gone silent → am I the lowest id among live peers?
      let lowest = s.selfId;
      for (const [id, arc] of remoteArcsRef.current) {
        if (now - arc.lastSeen <= STALE_MS && id < lowest) lowest = id;
      }
      return lowest === s.selfId;
    }

    // Transport keeper: open the take, and keep re-broadcasting the anchor so a
    // late joiner can align mid-piece AND so the room survives a host departure.
    const keeper = setInterval(() => {
      const s = syncRef.current;
      if (!s || !enteredRef.current) return;
      if (amEffectiveHost()) {
        if (!anchorRef.current) {
          if (s.isHost()) hostStart(); // only the genuine original host starts from 0
        } else {
          const a = anchorRef.current;
          s.send({ t: "start", startAtSharedMs: a.startAtSharedMs, offsetSec: a.offsetSec });
        }
      }
    }, 2000);

    // Stream our own arc at a throttled ~20 Hz (not per pointermove).
    const broadcaster = setInterval(() => {
      const s = syncRef.current;
      if (!s) return;
      const arc = selfArcRef.current;
      s.send({ t: "arc", angle: arc.angle, width: arc.width });
    }, 1000 / SEND_HZ);

    // Prune stale / departed peers; publish readouts to React at ~10 Hz.
    const janitor = setInterval(() => {
      const s = syncRef.current;
      const live = new Set(s ? s.peers() : []);
      const now = performance.now();
      for (const [id, arc] of remoteArcsRef.current) {
        if (!live.has(id) || now - arc.lastSeen > STALE_MS) remoteArcsRef.current.delete(id);
      }
      const arcs = collectArcs();
      setCoveredPct(Math.round(coverageFraction(arcs) * 100));
      setHarmonyPct(Math.round(overlapFraction(arcs) * 100));
      setAttention(DWELL_FULL > 0 ? dwellRef.current / DWELL_FULL : 0);
      setPresent(1 + remoteArcsRef.current.size);

      // cycle 3 — host-migration surfacing. roomHadPeers latches once anyone
      // else has been present, so a solo tab (always its own host) never shows a
      // hand-off. A genuine takeover is a not-host → host transition after we
      // have entered, have an anchor, and the room had peers.
      if (remoteArcsRef.current.size > 0) roomHadPeersRef.current = true;
      const eff = amEffectiveHost();
      setHosting(eff);
      if (
        eff &&
        !wasEffHostRef.current &&
        enteredRef.current &&
        anchorRef.current &&
        roomHadPeersRef.current
      ) {
        handoffAtRef.current = now; // the room just kept the piece going through us
      }
      wasEffHostRef.current = eff;
      const ha = handoffAtRef.current;
      setHandoff(ha !== null && now - ha < 6000);
    }, 100);

    // ---- collective coverage (identical on every peer) --------------------
    function collectArcs(): { angle: number; width: number }[] {
      const out: { angle: number; width: number }[] = [
        { angle: selfArcRef.current.angle, width: selfArcRef.current.width },
      ];
      for (const arc of remoteArcsRef.current.values()) out.push({ angle: arc.angle, width: arc.width });
      return out;
    }

    function coveredAt(angle: number, arcs: { angle: number; width: number }[]): boolean {
      for (const a of arcs) if (angDist(angle, a.angle) <= a.width / 2) return true;
      return false;
    }

    // cycle 2 — how MANY windows cover this angle (≥2 = an overlap → harmony).
    function coverCountAt(angle: number, arcs: { angle: number; width: number }[]): number {
      let n = 0;
      for (const a of arcs) if (angDist(angle, a.angle) <= a.width / 2) n++;
      return n;
    }

    function coverageFraction(arcs: { angle: number; width: number }[]): number {
      let hit = 0;
      for (let i = 0; i < COVER_SAMPLES; i++) {
        if (coveredAt((i / COVER_SAMPLES) * TAU, arcs)) hit++;
      }
      return hit / COVER_SAMPLES;
    }

    function overlapFraction(arcs: { angle: number; width: number }[]): number {
      let hit = 0;
      for (let i = 0; i < COVER_SAMPLES; i++) {
        if (coverCountAt((i / COVER_SAMPLES) * TAU, arcs) >= 2) hit++;
      }
      return hit / COVER_SAMPLES;
    }

    // Playhead angle from the SHARED clock → identical on every peer, and
    // matched to the audio position. Before the anchor exists we sweep a local
    // preview so the ring never looks dead.
    function playheadAngle(): number {
      const s = syncRef.current;
      const buf = bufRef.current;
      const a = anchorRef.current;
      if (s && a && buf) {
        const pos = (a.offsetSec + (s.now() - a.startAtSharedMs) / 1000) % buf.duration;
        return norm((pos / buf.duration) * TAU);
      }
      const dur = buf ? buf.duration : 60;
      return norm(((performance.now() / 1000) % dur / dur) * TAU);
    }

    // ---- actions exposed to the UI ----------------------------------------
    actionsRef.current = {
      enter: () => {
        if (enteredRef.current) return;
        void (async () => {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) {
            setError("Web Audio is unavailable in this browser.");
            return;
          }
          let ctx: AudioContext;
          try {
            ctx = new AC();
            await ctx.resume();
          } catch {
            setError("Could not start audio in this browser.");
            return;
          }
          const master = createSafeMaster(ctx);
          ctxRef.current = ctx;
          masterRef.current = master;
          freqRef.current = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
          const buf = await ensureBuffer(ctx, currentTrackRef.current);
          if (!buf) return;
          enteredRef.current = true;
          setEntered(true);
          const s = syncRef.current;
          if (s?.isHost() && !anchorRef.current) hostStart();
          else if (anchorRef.current) startSource();
        })();
      },
      createOffer: () => {
        void (async () => {
          const s = syncRef.current;
          if (!s) return;
          try {
            const code = await s.createOffer();
            setOfferCode(code);
            refresh();
          } catch {
            setError("Could not create an invite (WebRTC unavailable?).");
          }
        })();
      },
      acceptAnswer: (code: string) => {
        void (async () => {
          const s = syncRef.current;
          if (!s || !code.trim()) return;
          try {
            await s.acceptAnswer(code.trim());
            refresh();
          } catch {
            setError("That reply code could not be read.");
          }
        })();
      },
      acceptOffer: (code: string) => {
        void (async () => {
          const s = syncRef.current;
          if (!s || !code.trim()) return;
          try {
            const ans = await s.acceptOffer(code.trim());
            setAnswerCode(ans);
            refresh();
          } catch {
            setError("That invite code could not be read.");
          }
        })();
      },
      // cycle 3 — optional hand conducting: the camera moves the SAME arc the
      // pointer does. Catalog audio is untouched; the hand is a control layer.
      startCam: () => {
        if (camOnRef.current) return;
        setCamState("loading");
        void (async () => {
          try {
            const video = videoRef.current;
            if (!video) throw new Error("no video element");
            const tracker = await createHandTracker(1);
            handTrackerRef.current = tracker;
            const stream = await startCamera(video);
            camStreamRef.current = stream;
            camOnRef.current = true;
            handPresentRef.current = false;
            // seed the smoothed angle at the current arc so the first frame does
            // not snap across the ring
            handAngleRef.current = selfArcRef.current.angle;
            setCamState("lost"); // "searching for a hand" until the first detection
          } catch {
            camOnRef.current = false;
            try {
              handTrackerRef.current?.close();
            } catch {
              /* already gone */
            }
            handTrackerRef.current = null;
            setCamState("error");
            setError("Camera or hand tracking is unavailable — pointer still conducts your arc.");
          }
        })();
      },
      stopCam: () => {
        camOnRef.current = false;
        handPresentRef.current = false;
        const stream = camStreamRef.current;
        if (stream) for (const tr of stream.getTracks()) tr.stop();
        camStreamRef.current = null;
        try {
          handTrackerRef.current?.close();
        } catch {
          /* already gone */
        }
        handTrackerRef.current = null;
        const video = videoRef.current;
        if (video) video.srcObject = null;
        setCamState("off");
      },
    };

    // ---- pointer: drag around the ring to move your arc -------------------
    let cx = 0;
    let cy = 0;
    let R = 0;

    function pointerAngle(ev: PointerEvent): number {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const ca = Math.atan2(py - cy, px - cx); // canvas angle (y down → clockwise)
      return norm(ca + Math.PI / 2); // shift so 0 = top
    }

    const onDown = (ev: PointerEvent) => {
      draggingRef.current = true;
      selfArcRef.current.angle = pointerAngle(ev);
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        /* capture optional */
      }
    };
    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      selfArcRef.current.angle = pointerAngle(ev);
    };
    const onUp = (ev: PointerEvent) => {
      draggingRef.current = false;
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ---- render loop ------------------------------------------------------
    const ctx2d = canvas.getContext("2d");
    let raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function audioLevel(): number {
      const an = masterRef.current?.analyser;
      const buf = freqRef.current;
      if (!an || !buf) return 0;
      an.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      return sum / (buf.length * 255);
    }

    // ring angle (0=top, clockwise) → canvas angle for arc()/points
    function toCanvas(a: number): number {
      return a - Math.PI / 2;
    }
    function pointOn(a: number, r: number): [number, number] {
      const ca = toCanvas(a);
      return [cx + r * Math.cos(ca), cy + r * Math.sin(ca)];
    }

    function frame(t: number) {
      raf = requestAnimationFrame(frame);
      if (!ctx2d) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      cx = w / 2;
      cy = h / 2;
      R = Math.min(w, h) * 0.33;

      ctx2d.fillStyle = BG_HEX;
      ctx2d.fillRect(0, 0, w, h);

      const breathe = 0.5 + 0.5 * Math.sin(t * 0.0009);
      const level = audioLevel();

      // cycle 2 — attention earns coverage: settling widens your window,
      // restlessness narrows it. Updated BEFORE collecting arcs so the width
      // we broadcast and draw this frame is current.
      const dtF = lastFrameTRef.current ? Math.min(0.05, (t - lastFrameTRef.current) / 1000) : 0;
      lastFrameTRef.current = t;

      // cycle 3 — hand conducting (optional). When the camera is on, a tracked
      // hand reaches toward the part of the ring you tend; the smoothed angle
      // drives the SAME arc the pointer does (catalog audio untouched). Pointer
      // wins while actively dragging; a lost hand falls back to the pointer.
      if (camOnRef.current) {
        const tracker = handTrackerRef.current;
        const video = videoRef.current;
        if (tracker && video && video.readyState >= 2) {
          try {
            const res = tracker.detectForVideo(video, t);
            const lm = res.landmarks?.[0];
            if (lm && lm.length >= 21) {
              const f = computeHandFeatures(lm);
              if (Math.hypot(f.cx, f.cy) > HAND_MIN_REACH) {
                const target = norm(Math.atan2(f.cx, f.cy));
                const alpha = dtF > 0 ? 1 - Math.exp(-dtF / HAND_SMOOTH_TC) : 1;
                handAngleRef.current = norm(
                  handAngleRef.current + shortestDelta(handAngleRef.current, target) * alpha,
                );
              }
              handPresentRef.current = true;
              lastHandTRef.current = t;
            } else if (t - lastHandTRef.current > HAND_LOST_MS) {
              handPresentRef.current = false;
            }
          } catch {
            /* a detection hiccup — hold the last angle */
          }
        }
        if (handPresentRef.current && !draggingRef.current) {
          selfArcRef.current.angle = handAngleRef.current;
        }
        const nextCam = handPresentRef.current ? "live" : "lost";
        setCamState((prev) => (prev === "error" || prev === "off" || prev === "loading" ? prev : nextCam));
      }

      const selfAngleNow = selfArcRef.current.angle;
      const aSpeed = dtF > 0 ? angDist(selfAngleNow, lastAngleRef.current) / dtF : 0;
      lastAngleRef.current = selfAngleNow;
      if (aSpeed < STILL_SPEED) dwellRef.current = Math.min(DWELL_FULL, dwellRef.current + dtF);
      else dwellRef.current = Math.max(0, dwellRef.current - dtF * DWELL_DECAY);
      const attn = DWELL_FULL > 0 ? dwellRef.current / DWELL_FULL : 0;
      const attnSmooth = attn * attn * (3 - 2 * attn);
      selfArcRef.current.width = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * attnSmooth;

      const arcs = collectArcs();
      const ph = playheadAngle();

      // cycle 3 — the room completes the piece. When the union nearly covers the
      // WHOLE ring, hold full presence everywhere (hysteresis so it does not flap
      // at the boundary). Coverage comes from the shared arc set, so this engages
      // and releases on the same frame for every peer → see == hear still holds.
      const cov = coverageFraction(arcs);
      if (!completedRef.current && cov >= COMPLETE_ON) completedRef.current = true;
      else if (completedRef.current && cov < COMPLETE_OFF) completedRef.current = false;
      const complete = completedRef.current;
      setCompleted((prev) => (prev === complete ? prev : complete));

      const phLit = complete || coveredAt(ph, arcs);
      const phHarm = coverCountAt(ph, arcs) >= 2; // playhead crossing an overlap

      // apply the collective → sound rule (click-free, only on state change)
      if (phLit !== lastLitRef.current) {
        lastLitRef.current = phLit;
        const g = coverGainRef.current;
        const f = coverFilterRef.current;
        const ctx = ctxRef.current;
        if (g && f && ctx) {
          g.gain.setTargetAtTime(phLit ? LIT_GAIN : GAP_GAIN, ctx.currentTime, 0.1);
          f.frequency.setTargetAtTime(phLit ? LIT_CUTOFF : GAP_CUTOFF, ctx.currentTime, 0.12);
        }
      }
      // cycle 2 — overlap → harmony: swell the octave halo where the playhead
      // crosses a stretch two or more windows cover (click-free, on change).
      if (phHarm !== lastHarmRef.current) {
        lastHarmRef.current = phHarm;
        const hg = harmGainRef.current;
        const ctx = ctxRef.current;
        if (hg && ctx) hg.gain.setTargetAtTime(phHarm ? HARMONY_GAIN : 0.0001, ctx.currentTime, 0.18);
      }
      setLit((prev) => (prev === phLit ? prev : phLit));

      const ring = R;
      const band = Math.max(10, R * 0.07);

      // 1. base ring — dim, gently breathing
      ctx2d.lineWidth = band;
      ctx2d.strokeStyle = `rgba(124, 110, 170, ${0.12 + 0.05 * breathe})`;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, ring, 0, TAU);
      ctx2d.stroke();

      // 2. Karel's note onsets as faint ticks decorating the ring
      const notes = noteAnglesRef.current;
      if (notes.length) {
        ctx2d.strokeStyle = "rgba(167, 139, 250, 0.16)";
        ctx2d.lineWidth = 1;
        for (let i = 0; i < notes.length; i++) {
          const [x0, y0] = pointOn(notes[i], ring - band * 0.5);
          const [x1, y1] = pointOn(notes[i], ring + band * 0.5);
          ctx2d.beginPath();
          ctx2d.moveTo(x0, y0);
          ctx2d.lineTo(x1, y1);
          ctx2d.stroke();
        }
      }

      // 3. collective coverage — the bright, glowing UNION of all arcs
      ctx2d.save();
      ctx2d.lineWidth = band;
      ctx2d.lineCap = "round";
      ctx2d.shadowColor = COVER_HEX;
      ctx2d.shadowBlur = 14 + 26 * level;
      ctx2d.strokeStyle = `rgba(139, 92, 246, ${0.7 + 0.25 * level})`;
      const SEG = 200;
      let i = 0;
      while (i < SEG) {
        const a0 = (i / SEG) * TAU;
        if (coveredAt(a0, arcs)) {
          let j = i;
          while (j < SEG && coveredAt((j / SEG) * TAU, arcs)) j++;
          const start = toCanvas((i / SEG) * TAU);
          const end = toCanvas((j / SEG) * TAU);
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, ring, start, end);
          ctx2d.stroke();
          i = j + 1;
        } else {
          i++;
        }
      }
      ctx2d.restore();

      // 3b. overlap seam — where TWO or more windows stack, the take gains a
      // voice: a brighter inner band drawn over the union (cycle 2).
      ctx2d.save();
      ctx2d.lineWidth = band * 0.5;
      ctx2d.lineCap = "round";
      ctx2d.shadowColor = HARMONY_HEX;
      ctx2d.shadowBlur = 10 + 22 * level;
      ctx2d.strokeStyle = `rgba(237, 233, 254, ${0.5 + 0.35 * level})`;
      let k = 0;
      while (k < SEG) {
        if (coverCountAt((k / SEG) * TAU, arcs) >= 2) {
          let j = k;
          while (j < SEG && coverCountAt((j / SEG) * TAU, arcs) >= 2) j++;
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, ring, toCanvas((k / SEG) * TAU), toCanvas((j / SEG) * TAU));
          ctx2d.stroke();
          k = j + 1;
        } else {
          k++;
        }
      }
      ctx2d.restore();

      // 4. each present listener's window — self brighter + labelled
      const drawArc = (arc: { angle: number; width: number }, hex: string, self: boolean) => {
        const start = toCanvas(arc.angle - arc.width / 2);
        const end = toCanvas(arc.angle + arc.width / 2);
        ctx2d.save();
        ctx2d.lineCap = "round";
        ctx2d.lineWidth = self ? band * 0.62 : band * 0.42;
        ctx2d.strokeStyle = hex;
        ctx2d.globalAlpha = self ? 0.95 : 0.6;
        if (self) {
          ctx2d.shadowColor = SELF_GLOW;
          ctx2d.shadowBlur = 12 + 22 * attn; // the more settled you are, the brighter your stretch
        }
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, ring, start, end);
        ctx2d.stroke();
        ctx2d.restore();
      };
      for (const [id, arc] of remoteArcsRef.current) drawArc(arc, peerHex(id), false);
      drawArc(selfArcRef.current, SELF_HEX, true);

      // "you" label just outside the self arc
      const [lx, ly] = pointOn(selfArcRef.current.angle, ring + band * 1.4);
      ctx2d.fillStyle = SELF_HEX;
      ctx2d.font = "600 13px ui-sans-serif, system-ui, sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText("you", lx, ly);

      // 5. playhead — bright where lit, dim in a gap
      const [ix, iy] = pointOn(ph, ring - band);
      const [ox, oy] = pointOn(ph, ring + band);
      ctx2d.save();
      ctx2d.lineCap = "round";
      ctx2d.lineWidth = phHarm ? 4 : 3;
      ctx2d.strokeStyle = phLit ? "#ede9fe" : "#4b4470";
      ctx2d.shadowColor = phLit ? "#ddd6fe" : "transparent";
      ctx2d.shadowBlur = phLit ? (phHarm ? 26 : 18) + 20 * level : 0;
      ctx2d.beginPath();
      ctx2d.moveTo(ix, iy);
      ctx2d.lineTo(ox, oy);
      ctx2d.stroke();
      const [hx, hy] = pointOn(ph, ring);
      ctx2d.beginPath();
      ctx2d.fillStyle = phLit ? "#ffffff" : "#6b6494";
      ctx2d.arc(hx, hy, phLit ? (phHarm ? 7 : 5.5) : 4, 0, TAU);
      ctx2d.fill();
      // a second ring when the playhead is in harmony — the voice has bloomed
      if (phHarm) {
        ctx2d.strokeStyle = `rgba(237, 233, 254, ${0.5 + 0.4 * level})`;
        ctx2d.lineWidth = 1.5;
        ctx2d.beginPath();
        ctx2d.arc(hx, hy, 11 + 5 * level, 0, TAU);
        ctx2d.stroke();
      }
      ctx2d.restore();

      // faint center pulse so the stage breathes even at idle
      const cg = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, ring * 0.9);
      cg.addColorStop(0, `rgba(139, 92, 246, ${0.05 + 0.05 * breathe + 0.08 * level})`);
      cg.addColorStop(1, "rgba(139, 92, 246, 0)");
      ctx2d.fillStyle = cg;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, ring * 0.9, 0, TAU);
      ctx2d.fill();

      // cycle 3 — "the room completed the piece": a held, celebratory bloom when
      // the union covers nearly the whole ring. Slow luminance only (no flicker),
      // identical on every peer because `complete` is a function of shared arcs.
      if (complete) {
        const glow = 0.5 + 0.5 * Math.sin(t * 0.0016); // slow, well under any strobe threshold
        ctx2d.save();
        // a bright complete ring over the base
        ctx2d.lineWidth = band * 1.05;
        ctx2d.lineCap = "round";
        ctx2d.shadowColor = COVER_HEX;
        ctx2d.shadowBlur = 24 + 30 * level;
        ctx2d.strokeStyle = `rgba(221, 214, 254, ${0.5 + 0.3 * glow + 0.15 * level})`;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, ring, 0, TAU);
        ctx2d.stroke();
        // a soft radial flare filling the ring
        const fg = ctx2d.createRadialGradient(cx, cy, ring * 0.1, cx, cy, ring * 1.08);
        fg.addColorStop(0, `rgba(167, 139, 250, ${0.1 + 0.08 * glow})`);
        fg.addColorStop(0.7, `rgba(139, 92, 246, ${0.05 + 0.05 * glow})`);
        fg.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx2d.fillStyle = fg;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, ring * 1.08, 0, TAU);
        ctx2d.fill();
        ctx2d.restore();
      }
    }
    raf = requestAnimationFrame(frame);

    // ---- load analysis to decorate the ring (optional) --------------------
    void (async () => {
      const analysis: TrackAnalysis | null = await loadTrackAnalysis(currentTrackRef.current);
      if (!analysis) return;
      const dur = analysis.notes.length
        ? Math.max(...analysis.notes.map((n) => n.time + n.duration))
        : 0;
      if (dur > 0) {
        noteAnglesRef.current = analysis.notes.map((n) => norm((n.time / dur) * TAU));
      }
      if (analysis.key_signature || analysis.tempo) {
        const parts: string[] = [];
        if (analysis.key_signature) parts.push(analysis.key_signature);
        if (analysis.tempo) parts.push(`${Math.round(analysis.tempo)} bpm`);
        setKeyInfo(parts.join(" · "));
      }
    })();

    // ---- cleanup ----------------------------------------------------------
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(keeper);
      clearInterval(broadcaster);
      clearInterval(janitor);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      stopSource();
      // cycle 3 — release the camera + hand tracker
      camOnRef.current = false;
      const cam = camStreamRef.current;
      if (cam) for (const tr of cam.getTracks()) tr.stop();
      camStreamRef.current = null;
      try {
        handTrackerRef.current?.close();
      } catch {
        /* already gone */
      }
      handTrackerRef.current = null;
      try {
        sync.destroy();
      } catch {
        /* already gone */
      }
      const ctx = ctxRef.current;
      if (ctx) {
        masterRef.current?.disconnect();
        void ctx.close().catch(() => {});
      }
      ctxRef.current = null;
      masterRef.current = null;
      syncRef.current = null;
    };
    // Mount-once engine; UI reads/writes go through refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep enteredRef mirrored for the engine closures
  useEffect(() => {
    enteredRef.current = entered;
  }, [entered]);

  // ── derived transport line (honest) ─────────────────────────────────────────
  const live = entered || status !== "idle";
  let transportLine: { text: string; tone: string };
  if (backend === "webrtc" && peerCount === 0) {
    transportLine = { text: "remote · waiting for code", tone: "text-muted-foreground" };
  } else if (status === "connecting") {
    transportLine = { text: "connecting…", tone: "text-muted-foreground" };
  } else if (peerCount > 0) {
    transportLine = { text: `room · ${present} present`, tone: "text-primary" };
  } else {
    transportLine = {
      text: "solo · open a second tab to fill the ring",
      tone: "text-muted-foreground",
    };
  }

  const openSecondTab = () => {
    try {
      window.open(window.location.href, "_blank", "noopener");
    } catch {
      /* popup blocked — the hint text still tells them to open a tab */
    }
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {/* hidden camera feed for optional hand conducting (cycle 3) */}
      <video ref={videoRef} playsInline muted className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden />

      {/* cycle 3 — tracking status: always visible while the camera is on, and a
          lost/error state is clearly distinct from live (works-when-shipped). */}
      {camState !== "off" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4 sm:top-20">
          <span
            className={`pointer-events-none rounded-md border px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] backdrop-blur-sm ${
              camState === "live"
                ? "border-primary/40 bg-background/60 text-primary"
                : camState === "loading"
                  ? "border-border bg-background/60 text-muted-foreground"
                  : "border-destructive/40 bg-background/70 text-destructive"
            }`}
          >
            {camState === "live"
              ? "hand · conducting"
              : camState === "loading"
                ? "camera · starting…"
                : camState === "error"
                  ? "camera off — pointer conducts"
                  : "no hand — reach into frame · pointer still works"}
          </span>
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Roundtable"
        description="One of Karel's real piano takes is laid around a ring; a playhead sweeps it in synced time. Each present listener tends an arc of the piece, and the music plays at full presence only where the room, together, is covering it — in the gaps it thins out. Settle on one stretch and your arc widens; where two listeners' arcs overlap, the take gains an octave-up voice. Cover nearly the whole ring together and the room completes the piece — it holds at full presence. The room survives a listener leaving: whoever is left keeps the piece going. You can also conduct your arc by hand with the camera."
        howTo={[
          "Open room from a second tab to fill the ring",
          "Drag to move your arc, then settle — settling widens it",
          "Bright where the room covers; a brighter seam where arcs overlap blooms a harmony",
          "Cover the whole ring together → the room completes the piece and it holds",
          "Optional: Conduct with hand — reach toward the part of the ring you tend",
        ]}
      />

      {/* top-left: title + readouts (hidden while immersive) */}
      {!immersive && (
        <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-6">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream 22560 · roundtable
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              The room keeps the piece alive
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Karel&apos;s take is wrapped around the ring. The music is only fully heard where the
              room is attending — spread out to cover it together. Settle on a stretch and your arc
              widens; where two arcs overlap, the take gains a voice.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
                {trackTitle}
              </span>
              {keyInfo && (
                <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-muted-foreground">
                  {keyInfo}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* top-center: the collective readout — always visible when live */}
      {live && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-5 sm:p-6">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            <span className={transportLine.tone}>{transportLine.text}</span>
            <span aria-hidden>·</span>
            <span>
              covered: <span className="text-foreground">{coveredPct}%</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              harmony:{" "}
              <span className={harmonyPct > 0 ? "text-primary" : "text-foreground"}>
                {harmonyPct}%
              </span>
            </span>
            <span aria-hidden>·</span>
            <span>
              attention: <span className="text-foreground">{Math.round(attention * 100)}%</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              present: <span className="text-foreground">{present}</span>
            </span>
            <span aria-hidden>·</span>
            <span className={present > 1 ? "text-foreground" : "text-muted-foreground"}>
              {hosting ? "hosting" : "listening"}
            </span>
            <span aria-hidden>·</span>
            {completed ? (
              <span className="text-primary">the room completed the piece</span>
            ) : (
              <span className={lit ? "text-primary" : "text-muted-foreground"}>
                {lit ? "lit" : "in a gap"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* cycle 3 — host hand-off banner: the room kept the piece going */}
      {handoff && (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-4 sm:top-32">
          <span className="pointer-events-none rounded-md border border-primary/40 bg-background/70 px-3 py-1 text-sm text-primary backdrop-blur-sm">
            The room kept the piece going — you&apos;re hosting now.
          </span>
        </div>
      )}

      {/* top-right: design notes link (hidden while immersive) */}
      {!immersive && (
        <div className="pointer-events-none absolute right-0 top-0 p-5 sm:p-6">
          <a
            href="/dream/22560-roundtable/README.md"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </a>
        </div>
      )}

      {/* error notice (functional — shown even while immersive) */}
      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-4">
          <p className="pointer-events-auto rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      {/* bottom controls (hidden while immersive) */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-3">
              {!entered ? (
                <button
                  onClick={() => actionsRef.current?.enter()}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Enter the ring
                </button>
              ) : (
                <span className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
                  Drag around the ring to tend your stretch
                </span>
              )}

              <button
                onClick={openSecondTab}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Open room (second tab)
              </button>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-[0.18em]">take</span>
                <select
                  value={trackId}
                  disabled={entered}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                onClick={() => setShowRemote((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Connect a remote listener
              </button>

              <button
                onClick={() =>
                  camState === "off" || camState === "error"
                    ? actionsRef.current?.startCam()
                    : actionsRef.current?.stopCam()
                }
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {camState === "off" || camState === "error" ? "Conduct with hand" : "Stop camera"}
              </button>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Fastest demo: open this page in a{" "}
              <span className="text-foreground">second tab</span> — it joins the room instantly over
              BroadcastChannel and a second arc appears. Each tab presses{" "}
              <span className="text-foreground">Enter the ring</span> once (one tap per tab to start
              audio). <span className="text-foreground">Settle</span> your arc on one stretch and it
              widens (watch <span className="text-foreground">attention</span>); drag the two tabs&apos;
              arcs so they <span className="text-foreground">overlap</span> and that stretch blooms an
              octave-up voice (watch <span className="text-foreground">harmony</span>). Spread the
              two arcs until <span className="text-foreground">covered</span> nears 100% and the room{" "}
              <span className="text-foreground">completes the piece</span> — it holds at full
              presence. Close one tab and the other{" "}
              <span className="text-foreground">keeps playing</span>, taking over as host. Solo works
              too: your single arc lights its slice while the rest of the piece thins out. Optional:{" "}
              <span className="text-foreground">Conduct with hand</span> turns on the camera so you
              reach toward the stretch you tend — the pointer always still works.
            </p>

            {showRemote && (
              <div className="grid gap-4 rounded-md border border-border bg-muted/40 p-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Host — invite a remote listener
                  </p>
                  <button
                    onClick={() => actionsRef.current?.createOffer()}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    1. Create invite code
                  </button>
                  <textarea
                    readOnly
                    value={offerCode}
                    placeholder="invite code appears here — send it to your friend"
                    className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                  />
                  <input
                    value={pasteBox}
                    onChange={(e) => setPasteBox(e.target.value)}
                    placeholder="2. paste their reply code"
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                  />
                  <button
                    onClick={() => actionsRef.current?.acceptAnswer(pasteBox)}
                    className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    3. Connect
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Guest — join with a code
                  </p>
                  <input
                    value={pasteBox}
                    onChange={(e) => setPasteBox(e.target.value)}
                    placeholder="1. paste the host's invite code"
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                  />
                  <button
                    onClick={() => actionsRef.current?.acceptOffer(pasteBox)}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    2. Generate reply code
                  </button>
                  <textarea
                    readOnly
                    value={answerCode}
                    placeholder="reply code appears here — send it back to the host"
                    className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
