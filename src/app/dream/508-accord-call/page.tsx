'use client';

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import {
  createAccordAudio,
  setVoicePitch,
  applyConsonance,
  disposeAccordAudio,
  type AccordAudio,
} from './audio';
import {
  createRoom,
  joinRoom,
  receiveAnswer,
  sendPitch,
  disposeRTC,
  type AccordRTC,
  type ConnectionState,
} from './webrtc';
import { computeRoughness, makePartials } from './roughness';

// ── constants ──────────────────────────────────────────────────────────────────

const MIN_HZ = 130;
const MAX_HZ = 520;
const SEND_INTERVAL_MS = 50; // ~20×/s

/** Map normalised 0..1 to Hz in the just-intonation-friendly range. */
function normToHz(n: number): number {
  // Exponential mapping so the octave is centred
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, Math.max(0, Math.min(1, n)));
}

/** Map Hz back to normalised 0..1. */
function hzToNorm(hz: number): number {
  return Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
}

/** Map normalised pitch to a Y pixel coordinate in a given height. */
function pitchToY(norm: number, height: number): number {
  return (1 - norm) * height; // top = high pitch, bottom = low pitch
}

// ── bot (practice partner) ────────────────────────────────────────────────────

interface BotState {
  norm: number;
  target: number;
  phase: number; // seconds until next re-target
}

function makeBotState(): BotState {
  return { norm: 0.5, target: 0.5, phase: 0 };
}

/**
 * Advance the bot's pitch simulation by `dt` seconds.
 * The bot wanders and periodically converges toward a consonant interval
 * relative to `myNorm`.
 */
function stepBot(bot: BotState, myNorm: number, dt: number): void {
  bot.phase -= dt;
  if (bot.phase <= 0) {
    // Choose: 60% chance drift toward a consonant interval, 40% free wander
    const roll = Math.random();
    if (roll < 0.6) {
      // Pick a consonant ratio (unison, 5th, 4th, 3rd)
      const intervals = [1, 3 / 2, 4 / 3, 5 / 4, 2];
      const ratio = intervals[Math.floor(Math.random() * intervals.length)];
      const myHz = normToHz(myNorm);
      const targetHz = Math.min(MAX_HZ, Math.max(MIN_HZ, myHz * ratio));
      bot.target = hzToNorm(targetHz);
    } else {
      bot.target = 0.2 + Math.random() * 0.6;
    }
    bot.phase = 1.5 + Math.random() * 3.5;
  }
  // Smooth interpolation toward target
  const speed = 0.8;
  bot.norm += (bot.target - bot.norm) * Math.min(1, speed * dt);
  bot.norm = Math.max(0, Math.min(1, bot.norm));
}

// ── SVG cord path ──────────────────────────────────────────────────────────────

/**
 * Build an SVG path string for the tension cord between two orbs.
 * When roughness is high, it zigzags (jagged). When low, it arcs smoothly.
 */
function buildCordPath(
  x1: number, y1: number,
  x2: number, y2: number,
  roughness: number,
  phase: number,
): string {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  if (roughness < 0.15) {
    // Smooth arc
    const arcBulge = 60 * (1 - roughness / 0.15);
    return `M ${x1} ${y1} Q ${midX + arcBulge} ${midY} ${x2} ${y2}`;
  }

  // Jagged path: N zigzag points
  const N = 8 + Math.floor(roughness * 12);
  const amplitude = roughness * 50;
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const bx = x1 + (x2 - x1) * t;
    const by = y1 + (y2 - y1) * t;
    const offset = amplitude * Math.sin(i * 2.4 + phase * 8);
    // Perpendicular direction
    const dx = -(y2 - y1);
    const dy = x2 - x1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = bx + (dx / len) * offset;
    const py = by + (dy / len) * offset;
    d += ` L ${px} ${py}`;
  }
  d += ` L ${x2} ${y2}`;
  return d;
}

// ── types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'running';
type SignalingStep =
  | 'choose'       // choose caller or joiner
  | 'creating'     // gathering ICE as caller
  | 'offer-ready'  // show offer SDP
  | 'waiting-answer' // pasted answer, waiting for connection
  | 'joining'      // joiner: gathering ICE
  | 'answer-ready' // joiner: show answer SDP
  | 'connected'
  | 'failed';

// ── main component ────────────────────────────────────────────────────────────

export default function AccordCall() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sigStep, setSigStep] = useState<SignalingStep>('choose');
  const [offerBlob, setOfferBlob] = useState('');
  const [answerBlob, setAnswerBlob] = useState('');
  const [pasteOffer, setPasteOffer] = useState('');
  const [pasteAnswer, setPasteAnswer] = useState('');
  const [connState, setConnState] = useState<ConnectionState>('idle');
  const [copyMsg, setCopyMsg] = useState('');
  const [sigError, setSigError] = useState('');

  // Audio + RTC refs
  const audioRef = useRef<AccordAudio | null>(null);
  const rtcRef = useRef<AccordRTC | null>(null);

  // My pitch (normalised 0..1, default middle)
  const myPitchRef = useRef(0.5);
  const remotePitchRef = useRef(0.5);

  // Bot
  const botRef = useRef<BotState>(makeBotState());
  const hasPeerRef = useRef(false);

  // SVG element ref for animation
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const sendTimerRef = useRef<number>(0);

  // Drag state for pitch control
  const dragRef = useRef(false);
  const myHalfRef = useRef<HTMLDivElement>(null);

  // ── handle remote pitch (from peer) ────────────────────────────────────────
  const handleRemotePitch = useCallback((norm: number) => {
    hasPeerRef.current = true;
    remotePitchRef.current = Math.max(0, Math.min(1, norm));
  }, []);

  // ── handle connection state changes ────────────────────────────────────────
  const handleConnState = useCallback((state: ConnectionState) => {
    setConnState(state);
    if (state === 'connected') {
      hasPeerRef.current = true;
      setSigStep('connected');
    } else if (state === 'failed') {
      hasPeerRef.current = false;
      setSigStep('failed');
    }
  }, []);

  // ── start ──────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const audio = createAccordAudio();
    audioRef.current = audio;
    setPhase('running');
  }, []);

  // ── caller: create room ────────────────────────────────────────────────────
  const handleCreateRoom = useCallback(async () => {
    setSigStep('creating');
    setSigError('');
    try {
      const { rtc, getOfferSDP } = await createRoom(handleRemotePitch, handleConnState);
      rtcRef.current = rtc;
      setOfferBlob(getOfferSDP());
      setSigStep('offer-ready');
    } catch (err) {
      setSigError(String(err));
      setSigStep('failed');
    }
  }, [handleRemotePitch, handleConnState]);

  // ── caller: paste answer ───────────────────────────────────────────────────
  const handlePasteAnswer = useCallback(async () => {
    const rtc = rtcRef.current;
    if (!rtc || !pasteAnswer.trim()) return;
    setSigError('');
    try {
      await receiveAnswer(rtc, pasteAnswer.trim());
      setSigStep('waiting-answer');
    } catch (err) {
      setSigError(String(err));
    }
  }, [pasteAnswer]);

  // ── joiner: join room ──────────────────────────────────────────────────────
  const handleJoinRoom = useCallback(async () => {
    if (!pasteOffer.trim()) return;
    setSigStep('joining');
    setSigError('');
    try {
      const { rtc, getAnswerSDP } = await joinRoom(
        pasteOffer.trim(),
        handleRemotePitch,
        handleConnState,
      );
      rtcRef.current = rtc;
      setAnswerBlob(getAnswerSDP());
      setSigStep('answer-ready');
    } catch (err) {
      setSigError(String(err));
      setSigStep('failed');
    }
  }, [pasteOffer, handleRemotePitch, handleConnState]);

  // ── copy helper ────────────────────────────────────────────────────────────
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg('Copied!');
      setTimeout(() => setCopyMsg(''), 1500);
    }).catch(() => {
      setCopyMsg('Select + copy manually');
      setTimeout(() => setCopyMsg(''), 2000);
    });
  }, []);

  // ── pointer drag on my half ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') return;
    const el = myHalfRef.current;
    if (!el) return;

    const applyDrag = (clientY: number) => {
      const rect = el.getBoundingClientRect();
      const norm = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      myPitchRef.current = norm;
    };

    const onDown = (e: PointerEvent) => {
      dragRef.current = true;
      el.setPointerCapture(e.pointerId);
      applyDrag(e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) applyDrag(e.clientY);
    };
    const onUp = () => { dragRef.current = false; };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [phase]);

  // ── main animation + audio loop ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') return;
    const audio = audioRef.current;
    if (!audio) return;
    const svg = svgRef.current;
    if (!svg) return;

    let running = true;

    const tick = (ms: number) => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(tick);

      const dt = Math.min(0.1, (ms - (lastTimeRef.current || ms)) / 1000);
      lastTimeRef.current = ms;

      const myNorm = myPitchRef.current;

      // Bot vs real peer
      let remNorm: number;
      if (hasPeerRef.current) {
        remNorm = remotePitchRef.current;
      } else {
        const bot = botRef.current;
        stepBot(bot, myNorm, dt);
        remNorm = bot.norm;
      }

      // Set audio pitches
      const myHz = normToHz(myNorm);
      const remHz = normToHz(remNorm);
      setVoicePitch(audio.voiceA, myHz, audio.ctx);
      setVoicePitch(audio.voiceB, remHz, audio.ctx);

      // Compute roughness
      const partialsA = makePartials(myHz, 5, 0.8);
      const partialsB = makePartials(remHz, 5, 0.8);
      const roughness = computeRoughness(partialsA, partialsB);
      const consonance = 1 - roughness;
      applyConsonance(audio, consonance);

      // Send my pitch over data channel (throttled)
      sendTimerRef.current += dt * 1000;
      if (sendTimerRef.current >= SEND_INTERVAL_MS) {
        sendTimerRef.current = 0;
        const rtc = rtcRef.current;
        if (rtc) sendPitch(rtc, myNorm);
      }

      // SVG animation — use viewBox coordinates (0..400 wide, 0..500 tall)
      const VW = 400;
      const VH = 500;
      const phase_t = ms / 1000;

      // Orb positions (in viewBox space)
      const myX = VW * 0.25;
      const myY = pitchToY(myNorm, VH);
      const remX = VW * 0.75;
      const remY = pitchToY(remNorm, VH);

      // Update orb A (gold)
      const orbA = svg.getElementById('orb-a');
      if (orbA) {
        orbA.setAttribute('cx', String(myX));
        orbA.setAttribute('cy', String(myY));
      }
      const glowA = svg.getElementById('glow-a');
      if (glowA) {
        glowA.setAttribute('cx', String(myX));
        glowA.setAttribute('cy', String(myY));
      }

      // Update orb B (teal)
      const orbB = svg.getElementById('orb-b');
      if (orbB) {
        orbB.setAttribute('cx', String(remX));
        orbB.setAttribute('cy', String(remY));
      }
      const glowB = svg.getElementById('glow-b');
      if (glowB) {
        glowB.setAttribute('cx', String(remX));
        glowB.setAttribute('cy', String(remY));
      }

      // Tension cord
      const cord = svg.getElementById('cord');
      if (cord) {
        const d = buildCordPath(myX, myY, remX, remY, roughness, phase_t);
        cord.setAttribute('d', d);
        // Color + opacity
        const r = Math.round(255 * roughness);
        const g = Math.round(180 * consonance);
        const strokeColor = roughness > 0.3
          ? `rgba(${r},50,50,0.85)`
          : `rgba(220,${g},40,${0.4 + consonance * 0.5})`;
        cord.setAttribute('stroke', strokeColor);
        cord.setAttribute('stroke-width', String(2 + roughness * 4));
        cord.setAttribute('opacity', String(0.5 + roughness * 0.5));
      }

      // Cord glow (consonant bloom)
      const cordGlow = svg.getElementById('cord-glow');
      if (cordGlow) {
        const d2 = buildCordPath(myX, myY, remX, remY, roughness * 0.3, phase_t);
        cordGlow.setAttribute('d', d2);
        cordGlow.setAttribute('opacity', String(consonance * consonance * 0.6));
        cordGlow.setAttribute('stroke-width', String(8 + consonance * 12));
      }

      // Consonance label
      const consLabel = svg.getElementById('cons-label');
      if (consLabel) {
        const ratio = myHz / remHz;
        const ratioLabel = describeInterval(ratio);
        consLabel.textContent = roughness < 0.15
          ? `consonant · ${ratioLabel}`
          : roughness < 0.4
          ? `approaching · ${ratioLabel}`
          : `dissonant · ${ratioLabel}`;
      }

      // Orb glow radius pulses with roughness / consonance
      const glowAEl = svg.getElementById('glow-a-filter');
      if (glowAEl) {
        const r2 = 18 + consonance * 14 + Math.sin(phase_t * 3.1) * 3;
        glowAEl.setAttribute('stdDeviation', String(r2));
      }
      const glowBEl = svg.getElementById('glow-b-filter');
      if (glowBEl) {
        const r2 = 18 + consonance * 14 + Math.sin(phase_t * 2.7 + 1.2) * 3;
        glowBEl.setAttribute('stdDeviation', String(r2));
      }

      // Frequency labels
      const freqA = svg.getElementById('freq-a');
      if (freqA) freqA.textContent = `${Math.round(myHz)} Hz`;
      const freqB = svg.getElementById('freq-b');
      if (freqB) freqB.textContent = `${Math.round(remHz)} Hz`;
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      const raf = rafRef.current;
      cancelAnimationFrame(raf);
    };
  }, [phase]);

  // ── cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const raf = rafRef.current;
      cancelAnimationFrame(raf);
      const audio = audioRef.current;
      if (audio) disposeAccordAudio(audio);
      const rtc = rtcRef.current;
      if (rtc) disposeRTC(rtc);
    };
  }, []);

  if (phase === 'idle') {
    return <IdleScreen onStart={handleStart} />;
  }

  return (
    <RunningScreen
      svgRef={svgRef}
      myHalfRef={myHalfRef}
      sigStep={sigStep}
      connState={connState}
      offerBlob={offerBlob}
      answerBlob={answerBlob}
      pasteOffer={pasteOffer}
      pasteAnswer={pasteAnswer}
      copyMsg={copyMsg}
      sigError={sigError}
      hasPeer={hasPeerRef.current}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onPasteAnswer={handlePasteAnswer}
      onCopy={copyToClipboard}
      onSetPasteOffer={setPasteOffer}
      onSetPasteAnswer={setPasteAnswer}
      onChooseCaller={() => setSigStep('choose')}
    />
  );
}

// ── interval describer ─────────────────────────────────────────────────────────

function describeInterval(ratio: number): string {
  const r = ratio > 1 ? ratio : 1 / ratio;
  if (r < 1.02) return '1:1 unison';
  if (Math.abs(r - 5 / 4) < 0.04) return '5:4 third';
  if (Math.abs(r - 4 / 3) < 0.04) return '4:3 fourth';
  if (Math.abs(r - 3 / 2) < 0.04) return '3:2 fifth';
  if (Math.abs(r - 2) < 0.06) return '2:1 octave';
  if (Math.abs(r - 5 / 3) < 0.05) return '5:3 sixth';
  if (Math.abs(r - 9 / 8) < 0.04) return '9:8 step';
  return `${r.toFixed(2)} ratio`;
}

// ── idle screen ────────────────────────────────────────────────────────────────

function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-foreground px-6 py-12">
      <div className="max-w-sm w-full text-center space-y-6">
        <div>
          <h1 className="text-3xl font-serif text-foreground tracking-wide">Accord Call</h1>
          <p className="text-violet-300 text-sm font-mono mt-1">508 · together spine</p>
        </div>
        <p className="text-muted-foreground text-base leading-relaxed">
          Two voices. Two browsers. A harmony that neither player can resolve alone.
          Drag your pitch toward the other — only when both move into consonance
          does the dissonance dissolve and the shimmer bloom.
        </p>
        <div className="space-y-2 text-left bg-muted rounded-lg p-4 border border-border">
          <p className="text-muted-foreground text-sm font-mono">how it works</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Real peer-to-peer (WebRTC, no server). Share a copy-pasted SDP blob with
            someone else. Each browser is one voice — a vertical drag sets your
            pitch. Both pitches are synthesised locally using the
            Plomp–Levelt sensory roughness model.
          </p>
        </div>
        <button
          onPointerDown={onStart}
          className="w-full py-3 px-6 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 text-base font-mono rounded-lg transition-colors min-h-[44px]"
        >
          Start →
        </button>
        <p className="text-muted-foreground/70 text-xs">
          headphones recommended · no mic · no camera · no server
        </p>
        <a
          href="#design-notes"
          className="text-muted-foreground/70 text-xs underline underline-offset-2 hover:text-muted-foreground transition-colors"
          onClick={(e) => e.preventDefault()}
        >
          Read the design notes ↓
        </a>
        <div id="design-notes" className="text-left text-muted-foreground text-xs font-mono space-y-2 pt-2 border-t border-border">
          <p><span className="text-violet-300">model:</span> Plomp–Levelt (JASA 1965) / Sethares 1998 — sensory roughness from partial beating</p>
          <p><span className="text-violet-300">signal:</span> RTCDataChannel, manual SDP copy/paste, STUN-assisted ICE</p>
          <p><span className="text-violet-300">reference:</span> Pauline Oliveros — Deep Listening (1988) — mutual attentive tuning as practice</p>
        </div>
      </div>
    </div>
  );
}

// ── running screen ─────────────────────────────────────────────────────────────

interface RunningScreenProps {
  svgRef: RefObject<SVGSVGElement | null>;
  myHalfRef: RefObject<HTMLDivElement | null>;
  sigStep: SignalingStep;
  connState: ConnectionState;
  offerBlob: string;
  answerBlob: string;
  pasteOffer: string;
  pasteAnswer: string;
  copyMsg: string;
  sigError: string;
  hasPeer: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onPasteAnswer: () => void;
  onCopy: (text: string) => void;
  onSetPasteOffer: (v: string) => void;
  onSetPasteAnswer: (v: string) => void;
  onChooseCaller: () => void;
}

function RunningScreen({
  svgRef,
  myHalfRef,
  sigStep,
  connState,
  offerBlob,
  answerBlob,
  pasteOffer,
  pasteAnswer,
  copyMsg,
  sigError,
  hasPeer,
  onCreateRoom,
  onJoinRoom,
  onPasteAnswer,
  onCopy,
  onSetPasteOffer,
  onSetPasteAnswer,
  onChooseCaller,
}: RunningScreenProps) {
  const statusText = (() => {
    if (connState === 'connected') return 'connected ✓';
    if (connState === 'failed') return 'connection failed';
    if (sigStep === 'creating' || sigStep === 'joining') return 'gathering ICE…';
    if (sigStep === 'offer-ready') return 'share offer SDP →';
    if (sigStep === 'answer-ready') return 'share answer SDP →';
    if (sigStep === 'waiting-answer') return 'waiting for peer…';
    return 'not connected';
  })();

  const statusColor = connState === 'connected'
    ? 'text-violet-300/95'
    : connState === 'failed'
    ? 'text-violet-300'
    : 'text-muted-foreground';

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-foreground overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-black/40 border-b border-border">
        <div>
          <span className="text-foreground font-serif text-base">Accord Call</span>
          <span className="text-muted-foreground text-xs font-mono ml-3">drag vertically · find consonance together</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono ${statusColor}`}>{statusText}</span>
          <span className="text-muted-foreground/70 text-xs font-mono">508</span>
        </div>
      </div>

      {/* Main content: SVG stage + signaling panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* SVG Stage — takes most of the space */}
        <div className="flex-1 relative min-w-0">
          {/* My draggable half (left) */}
          <div
            ref={myHalfRef}
            className="absolute left-0 top-0 w-1/2 h-full cursor-ns-resize touch-none z-10"
            style={{ userSelect: 'none' }}
          />
          {/* Remote half (right) — visual only, no drag */}
          <div className="absolute right-0 top-0 w-1/2 h-full pointer-events-none" />

          {/* SVG canvas */}
          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 400 500"
            preserveAspectRatio="none"
            aria-label="Accord Call visual field"
          >
            <defs>
              <filter id="filter-glow-a" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur id="glow-a-filter" stdDeviation="18" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="filter-glow-b" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur id="glow-b-filter" stdDeviation="18" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="filter-cord-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            {/* Vertical axis lines */}
            <line x1="100" y1="0" x2="100" y2="500" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <line x1="300" y1="0" x2="300" y2="500" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <line x1="200" y1="0" x2="200" y2="500" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 8" />

            {/* Pitch axis labels */}
            <text x="8" y="16" fill="rgba(255,255,255,0.25)" fontSize="10" fontFamily="monospace">high</text>
            <text x="8" y="494" fill="rgba(255,255,255,0.25)" fontSize="10" fontFamily="monospace">low</text>

            {/* Half labels */}
            <text x="100" y="24" fill="rgba(255,210,100,0.35)" fontSize="10" fontFamily="monospace" textAnchor="middle">you</text>
            <text x="300" y="24" fill="rgba(80,220,180,0.35)" fontSize="10" fontFamily="monospace" textAnchor="middle">them</text>

            {/* Consonance arc glow */}
            <path
              id="cord-glow"
              d="M 100 250 L 300 250"
              stroke="rgba(220,180,40,0.4)"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              filter="url(#filter-cord-glow)"
              opacity="0"
            />

            {/* Tension cord */}
            <path
              id="cord"
              d="M 100 250 L 300 250"
              stroke="rgba(200,80,80,0.8)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Orb A glow (gold) */}
            <circle
              id="glow-a"
              cx="100" cy="250" r="28"
              fill="rgba(255,200,60,0.18)"
              filter="url(#filter-glow-a)"
            />
            {/* Orb A core */}
            <circle
              id="orb-a"
              cx="100" cy="250" r="14"
              fill="rgba(255,200,60,0.85)"
              stroke="rgba(255,240,180,0.6)"
              strokeWidth="1.5"
            />

            {/* Orb B glow (teal) */}
            <circle
              id="glow-b"
              cx="300" cy="250" r="28"
              fill="rgba(60,210,180,0.18)"
              filter="url(#filter-glow-b)"
            />
            {/* Orb B core */}
            <circle
              id="orb-b"
              cx="300" cy="250" r="14"
              fill="rgba(60,210,180,0.85)"
              stroke="rgba(150,240,220,0.6)"
              strokeWidth="1.5"
            />

            {/* Frequency labels */}
            <text id="freq-a" x="100" y="490" fill="rgba(255,200,60,0.55)" fontSize="10" fontFamily="monospace" textAnchor="middle">— Hz</text>
            <text id="freq-b" x="300" y="490" fill="rgba(60,210,180,0.55)" fontSize="10" fontFamily="monospace" textAnchor="middle">— Hz</text>

            {/* Consonance label */}
            <text id="cons-label" x="200" y="476" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="monospace" textAnchor="middle">listening…</text>
          </svg>

          {/* Bot label overlay — shown when no peer */}
          {!hasPeer && connState !== 'connected' && (
            <div className="absolute bottom-6 left-0 w-full flex justify-center pointer-events-none">
              <span className="text-muted-foreground text-xs font-mono bg-black/50 px-3 py-1 rounded-full">
                practice partner — no one&apos;s connected yet
              </span>
            </div>
          )}
        </div>

        {/* Signaling panel — right side */}
        <div className="w-72 shrink-0 flex flex-col bg-black/30 border-l border-border overflow-y-auto">
          <SignalingPanel
            sigStep={sigStep}
            offerBlob={offerBlob}
            answerBlob={answerBlob}
            pasteOffer={pasteOffer}
            pasteAnswer={pasteAnswer}
            copyMsg={copyMsg}
            sigError={sigError}
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
            onPasteAnswer={onPasteAnswer}
            onCopy={onCopy}
            onSetPasteOffer={onSetPasteOffer}
            onSetPasteAnswer={onSetPasteAnswer}
            onChooseCaller={onChooseCaller}
          />
        </div>
      </div>
    </div>
  );
}

// ── signaling panel ────────────────────────────────────────────────────────────

interface SignalingPanelProps {
  sigStep: SignalingStep;
  offerBlob: string;
  answerBlob: string;
  pasteOffer: string;
  pasteAnswer: string;
  copyMsg: string;
  sigError: string;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onPasteAnswer: () => void;
  onCopy: (text: string) => void;
  onSetPasteOffer: (v: string) => void;
  onSetPasteAnswer: (v: string) => void;
  onChooseCaller: () => void;
}

function SignalingPanel({
  sigStep,
  offerBlob,
  answerBlob,
  pasteOffer,
  pasteAnswer,
  copyMsg,
  sigError,
  onCreateRoom,
  onJoinRoom,
  onPasteAnswer,
  onCopy,
  onSetPasteOffer,
  onSetPasteAnswer,
  onChooseCaller,
}: SignalingPanelProps) {
  const panelBase = 'flex flex-col gap-3 p-4 text-sm';

  if (sigStep === 'connected') {
    return (
      <div className={panelBase}>
        <p className="text-violet-300/95 font-mono font-medium text-base">connected ✓</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Real peer connected. Drag your orb vertically to move your pitch.
          You&apos;ll both hear both voices — find consonance together.
        </p>
        <div className="mt-2 border-t border-border pt-3 space-y-1">
          <p className="text-muted-foreground/70 text-xs font-mono">— drag up for higher pitch</p>
          <p className="text-muted-foreground/70 text-xs font-mono">— consonance blooms shimmer</p>
          <p className="text-muted-foreground/70 text-xs font-mono">— dissonance beats and grinds</p>
        </div>
      </div>
    );
  }

  if (sigStep === 'failed') {
    return (
      <div className={panelBase}>
        <p className="text-violet-300 font-mono text-base">connection failed</p>
        <p className="text-muted-foreground text-xs">
          The peer connection dropped or the SDP was rejected.
        </p>
        <button
          onPointerDown={onChooseCaller}
          className="mt-2 w-full py-2.5 px-4 bg-muted hover:bg-accent border border-border text-muted-foreground text-sm font-mono rounded-lg transition-colors min-h-[44px]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (sigStep === 'choose') {
    return (
      <div className={panelBase}>
        <p className="text-muted-foreground font-mono text-sm font-medium">Connect a peer</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          No server. You&apos;ll copy/paste a signaling blob between two browser tabs or devices.
        </p>
        <button
          onPointerDown={onCreateRoom}
          className="w-full py-2.5 px-4 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 text-sm font-mono rounded-lg transition-colors min-h-[44px]"
        >
          Create room (caller)
        </button>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-zinc-950 px-2 text-muted-foreground/70 font-mono">or</span>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">Paste the caller&apos;s offer below to join:</p>
        <textarea
          value={pasteOffer}
          onChange={(e) => onSetPasteOffer(e.target.value)}
          placeholder="Paste offer SDP here…"
          className="w-full h-24 p-2 bg-black/40 border border-border text-muted-foreground text-xs font-mono rounded resize-none placeholder-muted-foreground focus:outline-none focus:border-border"
        />
        <button
          onPointerDown={() => { if (pasteOffer.trim()) onJoinRoom(); }}
          disabled={!pasteOffer.trim()}
          className="w-full py-2.5 px-4 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 text-sm font-mono rounded-lg transition-colors min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Join room (joiner)
        </button>
        <p className="text-muted-foreground/70 text-xs font-mono text-center pt-1">practice partner active until connected</p>
      </div>
    );
  }

  if (sigStep === 'creating') {
    return (
      <div className={panelBase}>
        <p className="text-muted-foreground font-mono text-sm">Gathering ICE candidates…</p>
        <p className="text-muted-foreground/70 text-xs">STUN: stun.l.google.com:19302 · up to 8s</p>
        <div className="animate-pulse h-2 bg-violet-500/30 rounded" />
      </div>
    );
  }

  if (sigStep === 'offer-ready') {
    return (
      <div className={panelBase}>
        <p className="text-muted-foreground font-mono text-sm font-medium">Step 1 of 2</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Copy this offer blob and send it to your peer (text, chat, email…).
          They paste it into &ldquo;Join room&rdquo;.
        </p>
        <div className="relative">
          <textarea
            readOnly
            value={offerBlob}
            className="w-full h-28 p-2 bg-black/50 border border-border text-muted-foreground text-xs font-mono rounded resize-none focus:outline-none"
          />
          <button
            onPointerDown={() => onCopy(offerBlob)}
            className="absolute top-1.5 right-1.5 px-2 py-1 bg-violet-500/30 hover:bg-violet-500/50 border border-violet-500/40 text-violet-300 text-xs font-mono rounded transition-colors"
          >
            {copyMsg || 'Copy'}
          </button>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-muted-foreground text-xs mb-2">
            Step 2: paste their answer SDP here once they give it to you:
          </p>
          <textarea
            value={pasteAnswer}
            onChange={(e) => onSetPasteAnswer(e.target.value)}
            placeholder="Paste answer SDP here…"
            className="w-full h-24 p-2 bg-black/40 border border-border text-muted-foreground text-xs font-mono rounded resize-none placeholder-muted-foreground focus:outline-none focus:border-border"
          />
          <button
            onPointerDown={() => { if (pasteAnswer.trim()) onPasteAnswer(); }}
            disabled={!pasteAnswer.trim()}
            className="mt-2 w-full py-2.5 px-4 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 text-sm font-mono rounded-lg transition-colors min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Complete connection
          </button>
        </div>
        {sigError && <p className="text-violet-300 text-xs font-mono">{sigError}</p>}
      </div>
    );
  }

  if (sigStep === 'joining') {
    return (
      <div className={panelBase}>
        <p className="text-muted-foreground font-mono text-sm">Gathering ICE candidates…</p>
        <p className="text-muted-foreground/70 text-xs">Creating answer · STUN · up to 8s</p>
        <div className="animate-pulse h-2 bg-violet-500/30 rounded" />
      </div>
    );
  }

  if (sigStep === 'answer-ready') {
    return (
      <div className={panelBase}>
        <p className="text-muted-foreground font-mono text-sm font-medium">Your answer SDP</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Copy this blob and send it back to the caller. Once they paste it,
          the connection will open.
        </p>
        <div className="relative">
          <textarea
            readOnly
            value={answerBlob}
            className="w-full h-28 p-2 bg-black/50 border border-border text-muted-foreground text-xs font-mono rounded resize-none focus:outline-none"
          />
          <button
            onPointerDown={() => onCopy(answerBlob)}
            className="absolute top-1.5 right-1.5 px-2 py-1 bg-violet-500/30 hover:bg-violet-500/50 border border-violet-500/40 text-violet-300 text-xs font-mono rounded transition-colors"
          >
            {copyMsg || 'Copy'}
          </button>
        </div>
        <p className="text-muted-foreground/70 text-xs font-mono">Waiting for caller to paste answer…</p>
        {sigError && <p className="text-violet-300 text-xs font-mono">{sigError}</p>}
      </div>
    );
  }

  if (sigStep === 'waiting-answer') {
    return (
      <div className={panelBase}>
        <p className="text-muted-foreground font-mono text-sm">Waiting for peer…</p>
        <p className="text-muted-foreground/70 text-xs">
          Answer received. The data channel will open once both ICE agents agree on a path.
        </p>
        <div className="animate-pulse h-2 bg-violet-500/20 rounded" />
        {sigError && <p className="text-violet-300 text-xs font-mono">{sigError}</p>}
      </div>
    );
  }

  return null;
}
