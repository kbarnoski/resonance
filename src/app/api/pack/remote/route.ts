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
}

const bus: RemoteBus = ((globalThis as { __packRemoteBus?: RemoteBus }).__packRemoteBus ??= {
  commands: [],
  status: null,
  statusAt: 0,
});

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
    return NextResponse.json({ commands: bus.commands.splice(0) });
  }

  if (typeof body.command === "string" && body.command.length > 0 && body.command.length < 200) {
    bus.commands.push(body.command);
    if (bus.commands.length > 20) bus.commands.splice(0, bus.commands.length - 20);
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
  return NextResponse.json({
    status: bus.status,
    statusAgeMs: bus.status ? Date.now() - bus.statusAt : null,
    pendingCommands: bus.commands.length,
  });
}
