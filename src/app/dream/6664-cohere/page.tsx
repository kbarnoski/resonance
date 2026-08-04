"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeChord, PadEngine, type Chord, type Orb } from "./audio";
import { createRenderer, type Renderer } from "./renderer";
import { GhostPeer, RtcPeer, type OrbMsg, type Peer } from "./net";
import { NOTES_MD } from "./notes";

type Role = "A" | "B";
type InviteMode = "closed" | "menu" | "host" | "guest";

/** Render the design-notes string as austere in-page notes (no markdown dep). */
function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <p key={i} className="mt-1 text-base italic text-muted-foreground">
          {line.slice(4)}
        </p>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-primary">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold tracking-tight text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-foreground">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-foreground">
        {line}
      </p>
    );
  });
}

export default function CoherePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const engineRef = useRef<PadEngine | null>(null);
  const rafRef = useRef<number>(0);

  // Shared-instrument state (mutated in the loop, not React state).
  const youRef = useRef<Orb>({ x: 0.32, y: 0.62 });
  const partnerTargetRef = useRef<Orb>({ x: 0.64, y: 0.4 });
  const partnerPosRef = useRef<Orb>({ x: 0.64, y: 0.4 });
  const roleRef = useRef<Role>("A");
  const activePeerRef = useRef<Peer | null>(null);
  const ghostRef = useRef<GhostPeer | null>(null);
  const pendingRtcRef = useRef<RtcPeer | null>(null);
  const lastSendRef = useRef(0);
  const connectedRef = useRef(false);
  const audioOnRef = useRef(false);
  const lastChordPushRef = useRef(0);

  const [audioOn, setAudioOn] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [status, setStatus] = useState("ghost duet — a partner is improvising with you");
  const [chordLabel, setChordLabel] = useState("");
  const [canvasError, setCanvasError] = useState<string | null>(null);

  // Invite / networking UI.
  const [inviteMode, setInviteMode] = useState<InviteMode>("closed");
  const [hostCode, setHostCode] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [guestInput, setGuestInput] = useState("");
  const [guestCode, setGuestCode] = useState("");
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* ----- wire a peer's inbound callbacks into our refs ----- */
  const wirePeer = useCallback((peer: Peer) => {
    peer.onMessage((m: OrbMsg) => {
      partnerTargetRef.current = { x: m.x, y: m.y };
    });
    peer.onStatus((s) => setStatus(s));
  }, []);

  /* ----- start ghost immediately so it is alive on load ----- */
  useEffect(() => {
    const ghost = new GhostPeer(0x6664c0);
    ghostRef.current = ghost;
    activePeerRef.current = ghost;
    wirePeer(ghost);
    return () => ghost.close();
  }, [wirePeer]);

  /* ----- animation + audio loop ----- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = createRenderer(canvas);
    } catch {
      setCanvasError("Canvas2D is unavailable in this browser — audio still plays.");
      return;
    }
    const renderer = rendererRef.current;

    const onResize = () => renderer?.resize();
    renderer.resize();
    window.addEventListener("resize", onResize);

    const loop = () => {
      const now = performance.now();
      const peer = activePeerRef.current;

      if (peer) {
        peer.tick(now);
        // Send my orb as a control signal (~30 Hz).
        if (now - lastSendRef.current >= 33) {
          lastSendRef.current = now;
          const me = youRef.current;
          peer.send({ type: "orb", x: me.x, y: me.y, t: now });
        }
      }

      // Interpolate the partner orb toward its last received position.
      const pt = partnerTargetRef.current;
      const pp = partnerPosRef.current;
      pp.x += (pt.x - pp.x) * 0.18;
      pp.y += (pt.y - pp.y) * 0.18;

      // Assign roles → the shared chord is a function of BOTH orbs.
      const you = youRef.current;
      const a: Orb = roleRef.current === "A" ? you : pp;
      const b: Orb = roleRef.current === "A" ? pp : you;
      const chord: Chord = computeChord(a, b);

      engineRef.current?.update(chord);

      renderer?.draw({
        you,
        partner: pp,
        chord,
        timeMs: now,
        connected: connectedRef.current,
        audioOn: audioOnRef.current,
      });

      // Push the chord label to the DOM readout a few times a second.
      if (now - lastChordPushRef.current > 140) {
        lastChordPushRef.current = now;
        setChordLabel(chord.chordName);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* ----- cleanup audio on unmount ----- */
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      pendingRtcRef.current?.close();
      activePeerRef.current?.close();
    };
  }, []);

  /* ----- pointer: drag YOUR orb ----- */
  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = Math.min(rect.width, rect.height) * 0.82;
    const fx = (rect.width - s) / 2;
    const fy = (rect.height - s) / 2;
    const nx = (clientX - rect.left - fx) / s;
    const ny = (clientY - rect.top - fy) / s;
    youRef.current = {
      x: Math.max(0.02, Math.min(0.98, nx)),
      y: Math.max(0.02, Math.min(0.98, ny)),
    };
  }, []);

  const draggingRef = useRef(false);
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  /* ----- audio: resume only on gesture ----- */
  const startAudio = useCallback(async () => {
    if (engineRef.current) return;
    try {
      const AudioCtor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext ??
        AudioContext;
      const ctx = new AudioCtor();
      if (ctx.state === "suspended") await ctx.resume();
      engineRef.current = new PadEngine(ctx);
      audioOnRef.current = true;
      setAudioOn(true);
    } catch {
      setCanvasError("Audio could not start. Check that sound is enabled, then retry.");
    }
  }, []);

  /* ----- swap ghost → real peer when the channel opens ----- */
  const swapToPeer = useCallback(
    (peer: RtcPeer, role: Role) => {
      roleRef.current = role;
      wirePeer(peer);
      activePeerRef.current = peer;
      connectedRef.current = true;
      ghostRef.current?.close();
      setInviteMode("closed");
    },
    [wirePeer],
  );

  /* ----- HOST flow ----- */
  const startHost = useCallback(async () => {
    setNetBusy(true);
    setNetError(null);
    setInviteMode("host");
    try {
      const { peer, code } = await RtcPeer.host();
      pendingRtcRef.current = peer;
      setHostCode(code);
      peer.onOpen(() => swapToPeer(peer, "A"));
    } catch {
      setNetError("Could not create an invite. You can keep playing with the ghost.");
    } finally {
      setNetBusy(false);
    }
  }, [swapToPeer]);

  const acceptAnswer = useCallback(async () => {
    const peer = pendingRtcRef.current;
    if (!peer || !answerInput.trim()) return;
    setNetBusy(true);
    setNetError(null);
    try {
      await peer.acceptAnswer(answerInput);
      setStatus("reply accepted — waiting for the channel to open…");
    } catch {
      setNetError("That reply code could not be read. Ask for a fresh one.");
    } finally {
      setNetBusy(false);
    }
  }, [answerInput]);

  /* ----- GUEST flow ----- */
  const startGuest = useCallback(async () => {
    if (!guestInput.trim()) return;
    setNetBusy(true);
    setNetError(null);
    try {
      const { peer, code } = await RtcPeer.guest(guestInput);
      pendingRtcRef.current = peer;
      setGuestCode(code);
      peer.onOpen(() => swapToPeer(peer, "B"));
    } catch {
      setNetError("That invite code could not be read. Ask for a fresh one.");
    } finally {
      setNetBusy(false);
    }
  }, [guestInput, swapToPeer]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the textarea is selectable as a fallback */
    }
  }, []);

  const closeInvite = useCallback(() => {
    setInviteMode("closed");
    setNetError(null);
  }, []);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Canvas field */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {canvasError && (
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background/90 px-4 py-3 text-center text-base text-destructive">
          {canvasError}
        </div>
      )}

      {/* Title */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cohere</h1>
        <p className="mt-1 text-base text-muted-foreground">
          A chord that only exists when two of you make it — drag your presence
          through the shared harmonic field.
        </p>
      </div>

      {/* Notes toggle (corner) */}
      <button
        onClick={() => setNotesOpen(true)}
        className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* Controls strip */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-background/70 px-4 py-3 backdrop-blur-sm">
        {!audioOn ? (
          <button
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start
          </button>
        ) : (
          <span className="min-h-[44px] inline-flex items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
            sounding
          </span>
        )}

        <button
          onClick={() => {
            setInviteMode("menu");
            setNetError(null);
          }}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Invite a second player
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {connectedRef.current ? "duet · live" : "duet · ghost"}
          </span>
          <span className="truncate text-sm text-foreground">{status}</span>
        </div>

        <div className="flex flex-col items-end">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            now sounding
          </span>
          <span className="font-mono text-sm text-primary">{chordLabel || "—"}</span>
        </div>
      </div>

      {/* Invite modal */}
      {inviteMode !== "closed" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-w-lg w-full rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Invite a second player
              </h2>
              <button
                onClick={closeInvite}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-base text-muted-foreground">
              Peer-to-peer, no server. Copy a code to your partner and paste
              theirs back. If anything stalls, the ghost keeps playing.
            </p>

            {netError && (
              <p className="mt-3 text-sm text-destructive">{netError}</p>
            )}

            {inviteMode === "menu" && (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={startHost}
                  className="min-h-[44px] flex-1 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Host — create an invite
                </button>
                <button
                  onClick={() => setInviteMode("guest")}
                  className="min-h-[44px] flex-1 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Join — I have an invite
                </button>
              </div>
            )}

            {inviteMode === "host" && (
              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    1 · Send this invite code
                  </p>
                  <textarea
                    readOnly
                    value={netBusy && !hostCode ? "gathering connection…" : hostCode}
                    className="mt-2 h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-xs text-foreground"
                  />
                  <button
                    onClick={() => copy(hostCode)}
                    disabled={!hostCode}
                    className="mt-2 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    {copied ? "copied" : "Copy invite code"}
                  </button>
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    2 · Paste their reply code
                  </p>
                  <textarea
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder="paste reply here"
                    className="mt-2 h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-xs text-foreground"
                  />
                  <button
                    onClick={acceptAnswer}
                    disabled={netBusy || !answerInput.trim()}
                    className="mt-2 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    Connect
                  </button>
                </div>
              </div>
            )}

            {inviteMode === "guest" && (
              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    1 · Paste the invite code
                  </p>
                  <textarea
                    value={guestInput}
                    onChange={(e) => setGuestInput(e.target.value)}
                    placeholder="paste invite here"
                    className="mt-2 h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-xs text-foreground"
                  />
                  <button
                    onClick={startGuest}
                    disabled={netBusy || !guestInput.trim()}
                    className="mt-2 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    Generate reply code
                  </button>
                </div>
                {guestCode && (
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      2 · Send this reply code back to the host
                    </p>
                    <textarea
                      readOnly
                      value={guestCode}
                      className="mt-2 h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-xs text-foreground"
                    />
                    <button
                      onClick={() => copy(guestCode)}
                      className="mt-2 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {copied ? "copied" : "Copy reply code"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes panel */}
      {notesOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex justify-end">
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-2 space-y-1">{renderNotes(NOTES_MD)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
