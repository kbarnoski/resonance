/**
 * WebRTC peer-to-peer signaling helpers for Accord Call.
 *
 * Flow (manual copy/paste, NO server):
 *   Caller:
 *     1. createRoom()  → creates RTCPeerConnection + RTCDataChannel
 *     2. waits for ICE gathering to complete
 *     3. exposes the full SDP offer blob (single copy, no trickle)
 *
 *   Joiner:
 *     1. joinRoom(offerSDP) → creates RTCPeerConnection, sets remote, creates answer
 *     2. waits for ICE gathering to complete
 *     3. exposes the full SDP answer blob
 *
 *   Caller:
 *     4. receiveAnswer(answerSDP) → setRemoteDescription → connection established
 *
 * Data channel messages: JSON { pitch: number } (normalised 0..1), sent ~20×/s
 */

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type ConnectionState = "idle" | "gathering" | "offer-ready" | "answer-ready" | "connected" | "failed";

export interface AccordRTC {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  role: "caller" | "joiner";
  state: ConnectionState;
}

/** Wait for ICE gathering to reach "complete". */
function waitForGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    // Timeout fallback after 8 s — some networks / STUN are slow
    setTimeout(resolve, 8000);
  });
}

/**
 * Caller side: create room.
 * Returns the RTCPeerConnection; call getOfferSDP() after resolving to get the blob.
 */
export async function createRoom(
  onRemotePitch: (normPitch: number) => void,
  onStateChange: (state: ConnectionState) => void,
): Promise<{ rtc: AccordRTC; getOfferSDP: () => string }> {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  const dc = pc.createDataChannel("accord", { ordered: false, maxRetransmits: 0 });

  const rtc: AccordRTC = { pc, dc, role: "caller", state: "gathering" };

  dc.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as { pitch: number };
      onRemotePitch(msg.pitch);
    } catch { /* malformed */ }
  };

  dc.onopen = () => {
    rtc.state = "connected";
    onStateChange("connected");
  };

  dc.onclose = () => {
    if (rtc.state === "connected") {
      rtc.state = "failed";
      onStateChange("failed");
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      rtc.state = "failed";
      onStateChange("failed");
    }
  };

  onStateChange("gathering");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForGatheringComplete(pc);

  rtc.state = "offer-ready";
  onStateChange("offer-ready");

  const getOfferSDP = () => pc.localDescription?.sdp ?? "";

  return { rtc, getOfferSDP };
}

/**
 * Joiner side: join room with the caller's SDP offer.
 * Returns the RTCPeerConnection; call getAnswerSDP() to get the blob.
 */
export async function joinRoom(
  offerSDP: string,
  onRemotePitch: (normPitch: number) => void,
  onStateChange: (state: ConnectionState) => void,
): Promise<{ rtc: AccordRTC; getAnswerSDP: () => string }> {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  const rtc: AccordRTC = { pc, dc: null, role: "joiner", state: "gathering" };

  pc.ondatachannel = (ev) => {
    rtc.dc = ev.channel;
    ev.channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { pitch: number };
        onRemotePitch(msg.pitch);
      } catch { /* malformed */ }
    };
    ev.channel.onopen = () => {
      rtc.state = "connected";
      onStateChange("connected");
    };
    ev.channel.onclose = () => {
      if (rtc.state === "connected") {
        rtc.state = "failed";
        onStateChange("failed");
      }
    };
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      rtc.state = "failed";
      onStateChange("failed");
    }
  };

  onStateChange("gathering");

  await pc.setRemoteDescription({ type: "offer", sdp: offerSDP });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForGatheringComplete(pc);

  rtc.state = "answer-ready";
  onStateChange("answer-ready");

  const getAnswerSDP = () => pc.localDescription?.sdp ?? "";

  return { rtc, getAnswerSDP };
}

/**
 * Caller side: receive the joiner's SDP answer to complete the handshake.
 */
export async function receiveAnswer(rtc: AccordRTC, answerSDP: string): Promise<void> {
  await rtc.pc.setRemoteDescription({ type: "answer", sdp: answerSDP });
}

/** Send normalised pitch (0..1) over the data channel. */
export function sendPitch(rtc: AccordRTC, normPitch: number): void {
  const dc = rtc.dc;
  if (!dc || dc.readyState !== "open") return;
  try {
    dc.send(JSON.stringify({ pitch: normPitch }));
  } catch { /* ignore — channel may be closing */ }
}

export function disposeRTC(rtc: AccordRTC): void {
  try { rtc.dc?.close(); } catch { /* ok */ }
  try { rtc.pc.close(); } catch { /* ok */ }
}
