// feed.ts — abstracts the Wikimedia recentchange event source.
//
// Tries the real, keyless, CORS-enabled Wikimedia EventStreams SSE feed:
//   https://stream.wikimedia.org/v2/stream/recentchange
// If it errors, never connects within ~3s, or EventSource is unavailable,
// it transparently switches to a synthetic edit generator so the piece
// ALWAYS rings and blooms (the build container & many review devices block SSE).

export type EditEvent = {
  type: string; // "edit" | "new" | "categorize" | "log" ...
  wiki: string; // e.g. "enwiki"
  domain: string; // e.g. "en.wikipedia.org"
  title: string;
  delta: number; // length.new - length.old (edit magnitude, can be negative)
  bot: boolean;
  newUser: boolean; // brand-new account (user_is_new) or anonymous creation heuristic
  user: string;
};

export type FeedMode = "live" | "demo";

export type FeedStatus = {
  mode: FeedMode;
  label: string; // human-facing badge text
};

export type FeedHandle = {
  stop: () => void;
};

const SSE_URL = "https://stream.wikimedia.org/v2/stream/recentchange";
const CONNECT_TIMEOUT_MS = 3000;

// A small list of plausible wikis for the synthetic generator + position hashing.
const DEMO_WIKIS: Array<{ wiki: string; domain: string }> = [
  { wiki: "enwiki", domain: "en.wikipedia.org" },
  { wiki: "dewiki", domain: "de.wikipedia.org" },
  { wiki: "frwiki", domain: "fr.wikipedia.org" },
  { wiki: "eswiki", domain: "es.wikipedia.org" },
  { wiki: "jawiki", domain: "ja.wikipedia.org" },
  { wiki: "ruwiki", domain: "ru.wikipedia.org" },
  { wiki: "zhwiki", domain: "zh.wikipedia.org" },
  { wiki: "itwiki", domain: "it.wikipedia.org" },
  { wiki: "ptwiki", domain: "pt.wikipedia.org" },
  { wiki: "commonswiki", domain: "commons.wikimedia.org" },
  { wiki: "wikidatawiki", domain: "www.wikidata.org" },
  { wiki: "nlwiki", domain: "nl.wikipedia.org" },
  { wiki: "plwiki", domain: "pl.wikipedia.org" },
  { wiki: "arwiki", domain: "ar.wikipedia.org" },
  { wiki: "fawiki", domain: "fa.wikipedia.org" },
];

const DEMO_TITLES = [
  "List of lighthouses",
  "Carillon",
  "Atlas (cartography)",
  "Generative music",
  "Bell founding",
  "Public domain",
  "Tidal island",
  "Meridian arc",
  "Folk taxonomy",
  "Glacial erratic",
  "Civic square",
  "Marginalia",
  "Almanac",
  "Cartouche",
  "Quiet study",
];

// Pure helper: turn a raw recentchange JSON object into our EditEvent (or null).
function parseRecentChange(raw: unknown): EditEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const type = typeof o.type === "string" ? o.type : "";
  // We sonify content changes; skip log/categorize noise.
  if (type !== "edit" && type !== "new") return null;

  const wiki = typeof o.wiki === "string" ? o.wiki : "unknown";
  const title = typeof o.title === "string" ? o.title : "(untitled)";
  const bot = o.bot === true;
  const user = typeof o.user === "string" ? o.user : "";

  let domain = "";
  const meta = o.meta;
  if (typeof meta === "object" && meta !== null) {
    const d = (meta as Record<string, unknown>).domain;
    if (typeof d === "string") domain = d;
  }
  if (!domain) domain = wiki;

  let delta = 0;
  const length = o.length;
  if (typeof length === "object" && length !== null) {
    const l = length as Record<string, unknown>;
    const nw = typeof l.new === "number" ? l.new : 0;
    const old = typeof l.old === "number" ? l.old : 0;
    delta = nw - old;
  }
  // New page creation reads as a big positive swell.
  if (type === "new" && delta === 0 && typeof length === "object" && length !== null) {
    const nw = (length as Record<string, unknown>).new;
    if (typeof nw === "number") delta = nw;
  }

  // Heuristic for "brand-new editor": a creation, or an anonymous (IP) user.
  const looksAnon = /^\d+\.\d+\.\d+\.\d+$/.test(user) || /:/.test(user);
  const newUser = type === "new" || looksAnon;

  return { type, wiki, domain, title, delta, bot, newUser, user };
}

// ─── Synthetic generator ─────────────────────────────────────────────────────
// Poisson-ish timing: exponentially distributed inter-arrival gaps.
function nextGapMs(meanMs: number): number {
  const u = Math.max(1e-6, Math.random());
  return -Math.log(u) * meanMs;
}

function makeSyntheticEdit(): EditEvent {
  const w = DEMO_WIKIS[Math.floor(Math.random() * DEMO_WIKIS.length)];
  const title = DEMO_TITLES[Math.floor(Math.random() * DEMO_TITLES.length)];
  const r = Math.random();
  // Heavy-tailed-ish edit size: many small, a few large.
  let delta: number;
  if (r < 0.55) delta = Math.round((Math.random() - 0.45) * 120);
  else if (r < 0.9) delta = Math.round((Math.random() - 0.3) * 900);
  else delta = Math.round((Math.random() - 0.1) * 9000);

  const bot = Math.random() < 0.28;
  const newUser = !bot && Math.random() < 0.14;
  const type = newUser && Math.random() < 0.5 ? "new" : "edit";

  return {
    type,
    wiki: w.wiki,
    domain: w.domain,
    title,
    delta,
    bot,
    newUser,
    user: bot ? "ExampleBot" : newUser ? "203.0.113.7" : "Editor",
  };
}

/**
 * Connect to the live feed (preferred) or fall back to the synthetic generator.
 * Always calls onStatus exactly once with the resolved mode, then onEdit per event.
 */
export function connectFeed(
  onEdit: (e: EditEvent) => void,
  onStatus: (s: FeedStatus) => void,
): FeedHandle {
  let stopped = false;
  let es: EventSource | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let demoTimer: ReturnType<typeof setTimeout> | null = null;
  let resolved = false;

  const startDemo = () => {
    if (stopped) return;
    if (!resolved) {
      resolved = true;
      onStatus({ mode: "demo", label: "demo stream (offline)" });
    }
    const tick = () => {
      if (stopped) return;
      onEdit(makeSyntheticEdit());
      // mean ~280ms → a lively but musical ~3-4 events/sec before throttling
      demoTimer = setTimeout(tick, nextGapMs(280));
    };
    demoTimer = setTimeout(tick, nextGapMs(280));
  };

  const goLive = () => {
    if (!resolved) {
      resolved = true;
      onStatus({ mode: "live", label: "live: en.wikipedia + 40 wikis" });
    }
  };

  // Guard: if EventSource is missing (SSR or old browser), go straight to demo.
  if (typeof EventSource === "undefined") {
    startDemo();
    return {
      stop: () => {
        stopped = true;
        if (demoTimer) clearTimeout(demoTimer);
      },
    };
  }

  try {
    es = new EventSource(SSE_URL);
  } catch {
    startDemo();
    return {
      stop: () => {
        stopped = true;
        if (demoTimer) clearTimeout(demoTimer);
      },
    };
  }

  connectTimer = setTimeout(() => {
    // Never opened in time → assume blocked, fall back.
    if (!resolved) {
      es?.close();
      es = null;
      startDemo();
    }
  }, CONNECT_TIMEOUT_MS);

  es.onopen = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    goLive();
  };

  es.onmessage = (ev: MessageEvent) => {
    if (stopped) return;
    // If a message arrives, we're certainly live.
    if (!resolved) {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      goLive();
    }
    try {
      const parsed = parseRecentChange(JSON.parse(ev.data as string));
      if (parsed) onEdit(parsed);
    } catch {
      /* ignore malformed line */
    }
  };

  es.onerror = () => {
    // EventSource auto-retries, but if we never resolved, treat as blocked.
    if (!resolved) {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      es?.close();
      es = null;
      startDemo();
    }
  };

  return {
    stop: () => {
      stopped = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (demoTimer) clearTimeout(demoTimer);
      es?.close();
      es = null;
    },
  };
}
