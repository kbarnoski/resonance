import { NextResponse } from "next/server";
import { isOfflinePack } from "@/lib/offline/pack";

// Offline kiosk only — in-memory command bus between the phone remote
// (/remote on the hotspot LAN) and the kiosk display. Single-process
// `next start` on the installation laptop, so module state is the bus;
// globalThis keeps it alive across dev HMR. Online this 404s.

interface RemoteBus {
  commands: string[];
  status: Record<string, unknown> | null;
  statusAt: number;
  /** kiosk long-polls parked until a command arrives (phone taps land at once) */
  waiters?: Array<() => void>;
  /** the kiosk's set + track lists change rarely: the phone fetches them only when this moves */
  programsJson?: string;
  programsRev?: number;
}

const bus: RemoteBus = ((globalThis as { __packRemoteBus?: RemoteBus }).__packRemoteBus ??= {
  commands: [],
  status: null,
  statusAt: 0,
});
bus.waiters ??= [];

/** The longest a kiosk long-poll is parked (it re-posts its status after). */
const KIOSK_WAIT_MAX_MS = 1_500;

// Optional shared key (maturity pass 2026-09-26, audit M-3): the hotspot
// is open, so anyone joining it could drive the show. Set
// TRAMOKYO_REMOTE_KEY in the kiosk env to require ?key= / x-remote-key
// on every bus call; unset keeps today's open behavior.
function keyOk(request: Request): boolean {
  const required = process.env.TRAMOKYO_REMOTE_KEY;
  if (!required) return true;
  const url = new URL(request.url);
  const given = request.headers.get("x-remote-key") ?? url.searchParams.get("key");
  return given === required;
}

export async function POST(request: Request) {
  if (!isOfflinePack()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!keyOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    role?: string;
    status?: Record<string, unknown>;
    command?: string;
  };

  if (body.role === "kiosk") {
    bus.status = body.status ?? null;
    bus.statusAt = Date.now();
    const pj = JSON.stringify(bus.status?.programs ?? null);
    if (pj !== bus.programsJson) {
      bus.programsJson = pj;
      bus.programsRev = (bus.programsRev ?? 0) + 1;
    }
    // LONG-POLL (?wait=1, phone responsiveness 2026-10-13): with nothing queued
    // the kiosk's request is parked until a command arrives (or 1.5 s), so a
    // tap reaches the kiosk in milliseconds instead of up to a 2 s poll —
    // with no more requests than before.
    const wait = new URL(request.url).searchParams.get("wait") === "1";
    if (wait && bus.commands.length === 0) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(t); resolve(); };
        const t = setTimeout(() => {
          bus.waiters = (bus.waiters ?? []).filter((w) => w !== done);
          resolve();
        }, KIOSK_WAIT_MAX_MS);
        (bus.waiters ??= []).push(done);
      });
    }
    return NextResponse.json({ commands: bus.commands.splice(0) });
  }

  if (typeof body.command === "string" && body.command.length > 0 && body.command.length < 200) {
    bus.commands.push(body.command);
    if (bus.commands.length > 20) bus.commands.splice(0, bus.commands.length - 20);
    // wake the parked kiosk poll: the command leaves now
    const ws = bus.waiters ?? [];
    bus.waiters = [];
    for (const w of ws) w();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}

export async function GET(request: Request) {
  if (!isOfflinePack()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!keyOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // the phone polls fast (500 ms while visible): it sends the lists' rev it
  // holds and gets the ~10 KB of set + track lists only when they changed
  const have = Number(new URL(request.url).searchParams.get("have"));
  const rev = bus.programsRev ?? 0;
  const status = bus.status && have === rev && rev > 0 ? { ...bus.status, programs: undefined } : bus.status;
  return NextResponse.json(
    {
      status,
      programsRev: rev,
      statusAgeMs: bus.status ? Date.now() - bus.statusAt : null,
      pendingCommands: bus.commands.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
