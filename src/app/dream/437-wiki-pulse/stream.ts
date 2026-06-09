/**
 * stream.ts — Wikimedia EventStreams SSE handler with synthetic fallback.
 *
 * Connects to https://stream.wikimedia.org/v2/stream/recentchange via
 * the browser-native EventSource API. If it fails to connect within
 * CONNECT_TIMEOUT_MS (4s) or errors, it switches to a synthetic event
 * generator that emits realistic fake recentchange-shaped objects.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecentChangeEvent {
  wiki: string;       // e.g. "enwiki", "dewiki", "wikidata"
  type: "edit" | "new" | "log" | "categorize";
  bot: boolean;
  user: string;
  title: string;
  namespace: number;  // 0 = main article
  length?: { old: number; new: number };
  meta: { domain: string };
  timestamp: number;
}

export type StreamStatus = "connecting" | "live" | "demo" | "error";

export interface StreamStats {
  status: StreamStatus;
  editsPerSec: number;
  botFraction: number;
  totalEvents: number;
}

type EventCallback = (evt: RecentChangeEvent) => void;
type StatsCallback = (stats: StreamStats) => void;

// ── Constants ──────────────────────────────────────────────────────────────

const SSE_URL = "https://stream.wikimedia.org/v2/stream/recentchange";
const CONNECT_TIMEOUT_MS = 4000;

// Realistic wiki distribution weights
const DEMO_WIKIS = [
  { id: "enwiki", domain: "en.wikipedia.org", w: 30 },
  { id: "dewiki", domain: "de.wikipedia.org", w: 8 },
  { id: "frwiki", domain: "fr.wikipedia.org", w: 7 },
  { id: "eswiki", domain: "es.wikipedia.org", w: 6 },
  { id: "ruwiki", domain: "ru.wikipedia.org", w: 6 },
  { id: "jawiki", domain: "ja.wikipedia.org", w: 5 },
  { id: "itwiki", domain: "it.wikipedia.org", w: 5 },
  { id: "zhwiki", domain: "zh.wikipedia.org", w: 4 },
  { id: "ptwiki", domain: "pt.wikipedia.org", w: 4 },
  { id: "arwiki", domain: "ar.wikipedia.org", w: 3 },
  { id: "plwiki", domain: "pl.wikipedia.org", w: 3 },
  { id: "nlwiki", domain: "nl.wikipedia.org", w: 2 },
  { id: "svwiki", domain: "sv.wikipedia.org", w: 2 },
  { id: "wikidata", domain: "www.wikidata.org", w: 12 },
  { id: "commonswiki", domain: "commons.wikimedia.org", w: 8 },
];

const DEMO_TITLES = [
  "Python (programming language)", "World War II", "United States",
  "Albert Einstein", "Solar System", "Climate change", "Paris",
  "Quantum mechanics", "Renaissance", "Democracy",
  "Template:Infobox person", "User talk:Example", "File:Sunset.jpg",
  "Category:Living people", "Wikipedia:Administrators",
];

const DEMO_TYPES: RecentChangeEvent["type"][] = ["edit", "edit", "edit", "new", "log", "categorize"];

function pickWeighted<T extends { w: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const item of arr) {
    r -= item.w;
    if (r <= 0) return item;
  }
  return arr[arr.length - 1];
}

function makeSyntheticEvent(): RecentChangeEvent {
  const wiki = pickWeighted(DEMO_WIKIS);
  const type = DEMO_TYPES[Math.floor(Math.random() * DEMO_TYPES.length)];
  const bot = Math.random() < 0.12; // ~12% bot rate
  const isMainNS = Math.random() < 0.6;
  const namespace = isMainNS ? 0 : [1, 2, 4, 6, 10, 14][Math.floor(Math.random() * 6)];
  const title = DEMO_TITLES[Math.floor(Math.random() * DEMO_TITLES.length)];

  // Realistic byte delta distribution: mostly small edits, occasional large
  const r = Math.random();
  let delta: number;
  if (r < 0.5) delta = Math.floor((Math.random() - 0.3) * 200);        // small
  else if (r < 0.8) delta = Math.floor((Math.random() - 0.3) * 1000);  // medium
  else if (r < 0.95) delta = Math.floor((Math.random() - 0.2) * 5000); // large
  else delta = Math.floor((Math.random() - 0.1) * 20000);               // huge (rare)

  const oldLen = 2000 + Math.floor(Math.random() * 40000);
  const newLen = Math.max(0, oldLen + delta);

  const hasLength = type !== "log";

  return {
    wiki: wiki.id,
    type,
    bot,
    user: bot ? `Bot-${Math.floor(Math.random() * 9999)}` : `User-${Math.floor(Math.random() * 999)}`,
    title,
    namespace,
    length: hasLength ? { old: oldLen, new: newLen } : undefined,
    meta: { domain: wiki.domain },
    timestamp: Date.now() / 1000,
  };
}

// ── StreamController ────────────────────────────────────────────────────────

export function createStreamController(
  onEvent: EventCallback,
  onStats: StatsCallback,
) {
  let es: EventSource | null = null;
  let demoTimer: ReturnType<typeof setInterval> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  // Stats tracking
  let totalEvents = 0;
  let botEvents = 0;
  let recentTimestamps: number[] = [];
  let currentStatus: StreamStatus = "connecting";

  const statsInterval = setInterval(() => {
    const now = Date.now();
    // Keep only the last 5s of timestamps for edits/sec calculation
    recentTimestamps = recentTimestamps.filter((t) => now - t < 5000);
    const editsPerSec = recentTimestamps.length / 5;
    const botFraction = totalEvents > 0 ? botEvents / totalEvents : 0;
    onStats({ status: currentStatus, editsPerSec, botFraction, totalEvents });
  }, 1000);

  function handleEvent(raw: RecentChangeEvent) {
    if (stopped) return;
    totalEvents++;
    if (raw.bot) botEvents++;
    recentTimestamps.push(Date.now());
    onEvent(raw);
  }

  function startDemo() {
    if (stopped) return;
    currentStatus = "demo";

    // Emit at ~8-15 events/sec for the synthetic stream (realistic density)
    demoTimer = setInterval(() => {
      // Sometimes emit 2 events close together to simulate burst
      handleEvent(makeSyntheticEvent());
      if (Math.random() < 0.3) handleEvent(makeSyntheticEvent());
    }, 80);
  }

  function stopDemo() {
    if (demoTimer !== null) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
  }

  function connect() {
    if (stopped) return;
    currentStatus = "connecting";

    // Timeout: if no successful message within CONNECT_TIMEOUT_MS, fall back
    connectTimer = setTimeout(() => {
      if (currentStatus === "connecting") {
        if (es) {
          es.close();
          es = null;
        }
        startDemo();
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      es = new EventSource(SSE_URL);

      es.addEventListener("message", (e: MessageEvent) => {
        // First successful message: clear timeout, mark live
        if (connectTimer !== null) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        if (currentStatus !== "live") {
          currentStatus = "live";
          stopDemo(); // stop synthetic if it somehow started
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const data = JSON.parse(e.data as string);
          const evt: RecentChangeEvent = {
            wiki: (data.wiki as string) ?? "unknown",
            type: (data.type as RecentChangeEvent["type"]) ?? "edit",
            bot: Boolean(data.bot),
            user: (data.user as string) ?? "",
            title: (data.title as string) ?? "",
            namespace: typeof data.namespace === "number" ? data.namespace : 0,
            length:
              data.length &&
              typeof (data.length as { old?: unknown }).old === "number" &&
              typeof (data.length as { new?: unknown }).new === "number"
                ? { old: (data.length as { old: number }).old, new: (data.length as { new: number }).new }
                : undefined,
            meta: { domain: (data.meta?.domain as string) ?? "" },
            timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now() / 1000,
          };
          handleEvent(evt);
        } catch {
          // Malformed JSON — skip
        }
      });

      es.addEventListener("error", () => {
        if (connectTimer !== null) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        es?.close();
        es = null;
        if (currentStatus !== "live") {
          // Never connected — fall back to demo
          startDemo();
        } else {
          // Was live, now errored — keep showing last stats but switch status
          currentStatus = "error";
          // Try to reconnect after a pause using demo in the meantime
          startDemo();
          setTimeout(() => {
            if (!stopped && currentStatus !== "live") {
              stopDemo();
              connect();
            }
          }, 8000);
        }
      });
    } catch {
      // EventSource constructor itself threw (very old browser, etc.)
      if (connectTimer !== null) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      startDemo();
    }
  }

  // Start connecting immediately
  connect();

  return {
    stop() {
      stopped = true;
      clearInterval(statsInterval);
      if (connectTimer !== null) clearTimeout(connectTimer);
      stopDemo();
      if (es) {
        es.close();
        es = null;
      }
    },
  };
}
