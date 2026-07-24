import { NextRequest } from "next/server";
import { guard } from "../../_shared/api-guard";

// ────────────────────────────────────────────────────────────────────────────
// Server-side proxy for NASA's Deep Space Network live status feed.
//
// The browser cannot fetch eyes.nasa.gov directly (CORS). We fetch the XML
// here, parse it WITHOUT a DOM (Node has no DOMParser) using a small regex
// pass, and hand back clean JSON. On any failure we return 502 + { error }
// so the client can drop to its deterministic synthetic fallback.
// ────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

const SPEED_OF_LIGHT_KM_S = 299_792.458;

interface DsnSignal {
  id: string;
  stationCode: string;
  station: string;
  dish: string;
  activity: string;
  direction: "up" | "down";
  band: string;
  dataRate: number;
  frequency: number;
  power: number;
  spacecraft: string;
  spacecraftId: string;
  /** One-way light time in seconds (derived from rtlt or range). 0 = unknown. */
  lightSeconds: number;
}

interface DsnStation {
  code: string;
  name: string;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function num(v: string | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface TargetInfo {
  rtlt: number;
  downleg: number;
  upleg: number;
}

function runParse(xml: string): { stations: DsnStation[]; signals: DsnSignal[] } {
  const stations: DsnStation[] = [];
  const signals: DsnSignal[] = [];

  // Walk stations and dish blocks in document order. Station tags are
  // self-closing siblings that precede the dishes belonging to them.
  const tokenRe = /<station\b[^>]*>|<dish\b[\s\S]*?<\/dish>/g;
  let currentStation: DsnStation = { code: "unknown", name: "Unknown" };
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(xml)) !== null) {
    const chunk = match[0];

    if (chunk.startsWith("<station")) {
      const code = attr(chunk, "name") ?? "unknown";
      const name = attr(chunk, "friendlyName") ?? code;
      currentStation = { code, name };
      stations.push(currentStation);
      continue;
    }

    // Dish block.
    const openTag = chunk.slice(0, chunk.indexOf(">") + 1);
    const dishName = attr(openTag, "name") ?? "dish";
    const activity = attr(openTag, "activity") ?? "";

    // Collect per-spacecraft target ranges/rtlt.
    const targets = new Map<string, TargetInfo>();
    const targetRe = /<target\b[^>]*\/?>/g;
    let tm: RegExpExecArray | null;
    while ((tm = targetRe.exec(chunk)) !== null) {
      const name = attr(tm[0], "name");
      if (!name) continue;
      targets.set(name, {
        rtlt: num(attr(tm[0], "rtlt")),
        downleg: num(attr(tm[0], "downlegRange")),
        upleg: num(attr(tm[0], "uplegRange")),
      });
    }

    const sigRe = /<(up|down)Signal\b[^>]*\/?>/g;
    let sm: RegExpExecArray | null;
    while ((sm = sigRe.exec(chunk)) !== null) {
      const tag = sm[0];
      if (attr(tag, "active") !== "true") continue;
      const direction = sm[1] as "up" | "down";
      const spacecraft = attr(tag, "spacecraft") ?? "???";
      if (!spacecraft || spacecraft === "DSN" || spacecraft === "TEST") continue;

      const t = targets.get(spacecraft);
      let lightSeconds = 0;
      if (t) {
        if (t.rtlt > 0) lightSeconds = t.rtlt / 2;
        else {
          const range = t.downleg > 0 ? t.downleg : t.upleg;
          if (range > 0) lightSeconds = range / SPEED_OF_LIGHT_KM_S;
        }
      }

      signals.push({
        id: `${currentStation.code}-${dishName}-${direction}-${spacecraft}`,
        stationCode: currentStation.code,
        station: currentStation.name,
        dish: dishName,
        activity,
        direction,
        band: (attr(tag, "band") ?? "X").toUpperCase(),
        dataRate: num(attr(tag, "dataRate")),
        frequency: num(attr(tag, "frequency")),
        power: num(attr(tag, "power")),
        spacecraft,
        spacecraftId: attr(tag, "spacecraftID") ?? "",
        lightSeconds,
      });
    }
  }

  return { stations, signals };
}

export async function POST(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  try {
    const url = `https://eyes.nasa.gov/dsn/data/dsn.xml?r=${Date.now()}`;
    const res = await fetch(url, {
      headers: { Accept: "application/xml,text/xml,*/*" },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json(
        { error: `DSN feed responded ${res.status}` },
        { status: 502 },
      );
    }
    const xml = await res.text();
    const { stations, signals } = runParse(xml);
    return Response.json({ stations, signals, fetchedAt: Date.now() });
  } catch (err) {
    return Response.json(
      { error: `DSN fetch failed: ${String(err)}` },
      { status: 502 },
    );
  }
}
