// room.ts — Supabase Realtime Broadcast transport: a genuine cross-device
// WebSocket pub/sub. Two phones that type the same 4-char ROOM CODE share one
// channel = a duet. ONLY tiny events travel — never audio.
//
// Three event kinds ride the channel:
//   • "note"  — { note, vel, who, beat, sharedT } a struck note + its SHARED-clock
//               target time, so the receiver schedules it onto the SAME grid.
//   • "ping"  — { t0, from } a clock-sync probe.
//   • "pong"  — { t0, t1, from } the reply that lets the asker estimate offset/rtt.
//
// No DB writes, no API route — Broadcast is ephemeral pub/sub. Anon key is a
// NEXT_PUBLIC_* value (public by design). Every failure is caught → solo mode.

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { PingMsg, PongMsg } from "./clock";

export interface NoteEvent {
  note: number; // MIDI note number
  vel: number; // 0..1
  who: string; // sender id
  beat: number; // shared continuous beat number it was quantized to
  sharedT: number; // shared-clock ms it should sound at
}

export type RoomStatus =
  | "solo" // no env / failed — solo only
  | "connecting"
  | "connected" // subscribed, alone in room
  | "duet"; // a partner is present

export interface RoomCallbacks {
  onNote: (e: NoteEvent) => void;
  onPing: (p: PingMsg) => void;
  onPong: (p: PongMsg) => void;
  onStatus: (s: RoomStatus, detail?: string) => void;
}

export interface Room {
  sendNote: (e: Omit<NoteEvent, "who">) => void;
  sendPing: (p: PingMsg) => void;
  sendPong: (p: PongMsg) => void;
  leave: () => void;
  myId: string;
}

// Are the public Supabase env vars present? (anon key is meant to be public.)
export function envReady(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

const FRIENDLY = [
  "MOSS", "TIDE", "FERN", "DUSK", "GLOW", "REEF",
  "LARK", "PINE", "WISP", "ECHO", "DAWN", "VEIL",
];

export function randomRoomCode(): string {
  return FRIENDLY[Math.floor(Math.random() * FRIENDLY.length)];
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Join a room. Returns a Room handle, or null if env missing (caller stays solo).
export function joinRoom(roomCode: string, cb: RoomCallbacks): Room | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const myId = makeId();

  if (!url || !key) {
    cb.onStatus("solo", "no room server configured");
    return null;
  }

  let supabase: SupabaseClient;
  let channel: RealtimeChannel;
  try {
    supabase = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 40 } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    channel = supabase.channel(`dream-piano-pulse-${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: myId } },
    });
  } catch {
    cb.onStatus("solo", "couldn't reach the room");
    return null;
  }

  cb.onStatus("connecting");
  let subscribed = false;

  function evalPresence() {
    try {
      const peers = Object.keys(channel.presenceState()).length;
      if (peers > 1) cb.onStatus("duet");
      else cb.onStatus(subscribed ? "connected" : "connecting");
    } catch {
      /* ignore */
    }
  }

  channel.on("broadcast", { event: "note" }, ({ payload }) => {
    const p = payload as Partial<NoteEvent>;
    if (
      typeof p?.note === "number" &&
      typeof p?.vel === "number" &&
      p.who !== myId
    ) {
      cb.onNote({
        note: p.note,
        vel: p.vel,
        who: String(p.who ?? "?"),
        beat: typeof p.beat === "number" ? p.beat : 0,
        sharedT: typeof p.sharedT === "number" ? p.sharedT : Date.now(),
      });
    }
  });

  channel.on("broadcast", { event: "ping" }, ({ payload }) => {
    const p = payload as Partial<PingMsg>;
    if (typeof p?.t0 === "number" && p.from !== myId) {
      cb.onPing({ t0: p.t0, from: String(p.from ?? "?") });
    }
  });

  channel.on("broadcast", { event: "pong" }, ({ payload }) => {
    const p = payload as Partial<PongMsg>;
    // only consume pongs addressed back at us (echoed t0 came from our ping)
    if (
      typeof p?.t0 === "number" &&
      typeof p?.t1 === "number" &&
      p.from !== myId
    ) {
      cb.onPong({ t0: p.t0, t1: p.t1, from: String(p.from ?? "?") });
    }
  });

  channel.on("presence", { event: "sync" }, evalPresence);
  channel.on("presence", { event: "join" }, evalPresence);
  channel.on("presence", { event: "leave" }, evalPresence);

  try {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        channel.track({ id: myId, at: Date.now() }).catch(() => {});
        evalPresence();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        cb.onStatus("solo", "couldn't reach the room");
      }
    });
  } catch {
    cb.onStatus("solo", "couldn't reach the room");
    return null;
  }

  function raw(event: string, payload: unknown) {
    if (!subscribed) return;
    try {
      channel.send({ type: "broadcast", event, payload });
    } catch {
      /* ignore — solo stays musical */
    }
  }

  return {
    myId,
    sendNote: (e) => raw("note", { ...e, who: myId }),
    sendPing: (p) => raw("ping", p),
    sendPong: (p) => raw("pong", p),
    leave: () => {
      try {
        channel.unsubscribe();
      } catch {
        /* ignore */
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    },
  };
}
