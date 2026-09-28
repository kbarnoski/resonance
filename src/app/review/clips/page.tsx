"use client";

/**
 * Clip review station (Karel 2026-09-28): plays every hero clip and
 * travel morph RAW — a bare <video> element, no canvas, no Ken Burns,
 * no scaling beyond object-contain — so a dropped frame here is IN THE
 * GENERATED FILE, and a clip that's clean here but stutters in a
 * journey points at playback compositing instead.
 *
 * Keys:  G = good · B = bad · U = clear verdict · ←/→ = prev/next
 * Verdicts persist to docs/clip-review.json via /api/review/clips.
 * Kiosk/dev only (the Vercel deployments have no pack).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Clip = { key: string; url: string };
type JourneyClips = { id: string; name: string; clips: Clip[] };
type Verdicts = Record<string, { verdict: string; at: string }>;

export default function ClipReviewPage() {
  const [journeys, setJourneys] = useState<JourneyClips[] | null>(null);
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [idx, setIdx] = useState(0);
  const [journeyFilter, setJourneyFilter] = useState<string>("all");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [nativeSize, setNativeSize] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/review/clips")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} — this page runs on the kiosk server (OFFLINE_PACK) or dev only`))))
      .then((d) => { setJourneys(d.journeys); setVerdicts(d.verdicts ?? {}); })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const queue = useMemo(() => {
    if (!journeys) return [];
    const all = journeys.flatMap((j) =>
      j.clips.map((c) => ({ journeyId: j.id, journeyName: j.name, ...c, vid: `${j.id}/${c.key}` })));
    return all.filter((c) =>
      (journeyFilter === "all" || c.journeyId === journeyFilter) &&
      (!onlyUnreviewed || !verdicts[c.vid]));
  }, [journeys, journeyFilter, onlyUnreviewed, verdicts]);

  const current = queue[Math.min(idx, Math.max(0, queue.length - 1))];
  // Anchor: when the queue recomputes (verdict cleared while filtered,
  // filter toggled off, etc.), stay on the same clip instead of letting
  // the index land on a different one (Karel 2026-09-28: "I hit U and
  // clips play one after another").
  const anchorVid = current?.vid;
  useEffect(() => {
    if (!anchorVid) return;
    const at = queue.findIndex((c) => c.vid === anchorVid);
    if (at >= 0 && at !== idx) setIdx(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);
  const total = useMemo(() => journeys?.reduce((n, j) => n + j.clips.length, 0) ?? 0, [journeys]);
  const reviewed = Object.keys(verdicts).length;
  const bad = Object.values(verdicts).filter((v) => v.verdict === "bad").length;

  const setVerdict = useCallback((verdict: "good" | "bad" | null) => {
    if (!current) return;
    const vid = current.vid;
    setVerdicts((prev) => {
      const next = { ...prev };
      if (verdict === null) delete next[vid];
      else next[vid] = { verdict, at: new Date().toISOString() };
      return next;
    });
    void fetch("/api/review/clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journeyId: current.journeyId, clipKey: current.key, verdict }),
    });
    if (verdict !== null) setIdx((i) => Math.min(i + 1, queue.length - 1));
  }, [current, queue.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "g" || e.key === "G") setVerdict("good");
      else if (e.key === "b" || e.key === "B") setVerdict("bad");
      else if (e.key === "u" || e.key === "U") setVerdict(null);
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, queue.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setVerdict, queue.length]);

  useEffect(() => { setIdx(0); }, [journeyFilter, onlyUnreviewed]);

  if (error) return <div style={{ padding: 40, color: "#f88", fontFamily: "monospace" }}>{error}</div>;
  if (!journeys) return <div style={{ padding: 40, color: "#888", fontFamily: "monospace" }}>loading pack…</div>;

  const v = current ? verdicts[current.vid]?.verdict : undefined;

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0d0a", color: "#e8ede6", fontFamily: "ui-monospace, monospace", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #1e241c", flexWrap: "wrap", fontSize: 13 }}>
        <strong>clip review</strong>
        <span style={{ color: "#8a948a" }}>{reviewed}/{total} reviewed · <span style={{ color: bad ? "#e87a6a" : "#8a948a" }}>{bad} bad</span></span>
        <select value={journeyFilter} onChange={(e) => setJourneyFilter(e.target.value)}
          style={{ background: "#10140f", color: "#e8ede6", border: "1px solid #1e241c", padding: "4px 8px" }}>
          <option value="all">all journeys</option>
          {journeys.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} ({j.clips.filter((c) => verdicts[`${j.id}/${c.key}`]).length}/{j.clips.length})
            </option>
          ))}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#8a948a" }}>
          <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} />
          unreviewed only
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#8a948a" }}>
          <input type="checkbox" checked={nativeSize} onChange={(e) => setNativeSize(e.target.checked)} />
          1:1 pixels
        </label>
        <span style={{ marginLeft: "auto", color: "#8a948a" }}>G good · B bad · U undo · ←/→ move</span>
      </header>

      {current ? (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20 }}>
          <div style={{ fontSize: 14, color: "#8a948a" }}>
            {idx + 1}/{queue.length} — <span style={{ color: "#e8ede6" }}>{current.journeyName}</span> · {current.key.startsWith("t") ? `travel morph ${current.key}` : `hero phase-${current.key}`}
            {v && <span style={{ marginLeft: 10, color: v === "good" ? "#9fd86a" : "#e87a6a" }}>● {v}</span>}
          </div>
          <div style={{ overflow: nativeSize ? "auto" : "hidden", maxWidth: "96vw", maxHeight: "72vh", border: "1px solid #1e241c" }}>
            {/* RAW playback: bare video element, no transforms — a stutter
                here is in the file itself. */}
            <video
              key={current.url}
              src={current.url}
              autoPlay
              loop
              muted
              playsInline
              style={nativeSize
                ? { display: "block" }
                : { display: "block", maxWidth: "96vw", maxHeight: "72vh", objectFit: "contain" }}
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setIdx((i) => Math.max(i - 1, 0))} style={btn("#1e241c")}>← prev</button>
            <button onClick={() => setVerdict("good")} style={btn("#2c4a1e", "#9fd86a")}>good (G)</button>
            <button onClick={() => setVerdict("bad")} style={btn("#4a221e", "#e87a6a")}>bad (B)</button>
            <button onClick={() => setVerdict(null)} style={btn("#1e241c")}>undo (U)</button>
            <button onClick={() => setIdx((i) => Math.min(i + 1, queue.length - 1))} style={btn("#1e241c")}>next →</button>
          </div>
        </main>
      ) : (
        <main style={{ flex: 1, display: "grid", placeItems: "center", color: "#9fd86a" }}>
          nothing left in this filter — every clip reviewed 🎉
        </main>
      )}
    </div>
  );
}

function btn(bg: string, color = "#e8ede6"): React.CSSProperties {
  return { background: bg, color, border: "1px solid #1e241c", padding: "10px 18px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
}
