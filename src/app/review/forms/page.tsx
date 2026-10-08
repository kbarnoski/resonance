"use client";

/**
 * Particle FORM review station (Karel 2026-10-08: "is there a way you can put
 * all of the forms the particle system makes for emblems but also for all
 * other instances in which i can remove ones i dont want? its like when we
 * did the morph videos"). Modelled on /review/clips.
 *
 * Every form renders LIVE in the real GPU particle engine (one engine, one
 * WebGL context, reused across items, disposed on unmount):
 *   shapes  — every soul (42; the ones journeys cast first, lab-only after)
 *   emblems — every image in the pack's local-emblems.json (+ Ghost's angel tokens)
 *   motifs  — the imagery-family designs (motif-forms.json), palette-tinted
 *   moments — Ghost's blossom-cloud images
 *
 * Keys:  K keep · R remove · U undo · ←/→ prev/next · P palette · F refigure
 * Verdicts persist to docs/form-review.json via /api/review/forms. Nothing
 * changes in journeys until `node scripts/apply-form-removals.mjs` is run.
 * Kiosk/dev only (the Vercel deployments have no pack).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createParticleEngine, type ParticleEngine } from "@/lib/particles/particle-engine";
import { SOULS, type ParticlePalette, type SoulId } from "@/lib/particles/souls";
import { JOURNEY_IMAGE_PALETTES } from "@/lib/particles/journey-palettes.generated";
import { particlePaletteFromImage, particlePaletteFire, particlePaletteGhost, particlePaletteDawn } from "@/lib/journeys/particle-lead";
import { SPECTRUM_FORMS } from "@/lib/journeys/particle-motifs";
import { formCanvas, uvFor } from "./form-images";

type Kind = "shape" | "emblem" | "motif" | "moment";
type Item = {
  id: string; kind: Kind; label: string; src: string; detail: string;
  owners: { id: string; name: string }[]; live: boolean; applied: boolean;
};
type Verdicts = Record<string, { verdict: string; at: string }>;
type PalOpt = { label: string; pal: ParticlePalette | null };

const KINDS: Kind[] = ["shape", "emblem", "motif", "moment"];
const KIND_LABEL: Record<Kind, string> = { shape: "shapes", emblem: "emblems", motif: "motifs", moment: "moments" };
// line-drawn forms wear bigger motes in journeys (layer THIN_LINE_FORMS)
const THIN = new Set<string>(["spirograph", "rose", "lissajous", "harmonics", "rings", "arcs", "orbitals", "knot", "helix", "superformula", "mandala", "girih", "medallion", "kaleido", "threads"]);

function hsv(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) + 1) % 1, mx > 1e-6 ? d / mx : 0, mx];
}
/** +1 warm … −1 cool, area- and saturation-weighted over the image palette. */
function warmth(p: { colors: string[]; weights?: number[] }): number {
  let s = 0;
  p.colors.forEach((c, i) => {
    const [h, sat, v] = hsv(c);
    if (v < 0.12) return;
    const w = (p.weights?.[i] ?? 1 / p.colors.length) * sat;
    if (h < 0.12 || h > 0.9) s += w; else if (h > 0.42 && h < 0.78) s -= w;
  });
  return s;
}

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export default function FormReviewPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [palIdx, setPalIdx] = useState<Record<Kind, number>>({ shape: 0, emblem: 0, motif: 0, moment: 0 });
  const [refigure, setRefigure] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [engineErr, setEngineErr] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(false);
  const [engineReady, setEngineReady] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const tokRef = useRef(0);
  const imageShownRef = useRef(false);

  useEffect(() => {
    fetch("/api/review/forms")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} — this page runs on the kiosk server (OFFLINE_PACK) or dev only`))))
      .then((d) => { setItems(d.items); setVerdicts(d.verdicts ?? {}); setNames(d.journeyNames ?? {}); })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  // ── ONE engine for the whole session (disposed on unmount) ────────────────
  useEffect(() => {
    if (!items) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: ParticleEngine;
    try {
      engine = createParticleEngine(canvas, {
        count: 160_000,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        transparent: false, // black stage
        gain: 1.7, camScale: 1.35, maxSpeed: 2.2, // the journey overlay's staging (shared-engine.ts)
        soul: "vortex",
      });
    } catch (e) {
      setEngineErr(e instanceof Error ? e.message : String(e));
      return;
    }
    engine.setGain(1.45);
    engine.start();
    engineRef.current = engine;
    setEngineReady((n) => n + 1);
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [items]);

  // ── palettes: a few journeys' image palettes (cool + warm) + signatures ───
  const commonPalettes = useMemo<PalOpt[]>(() => {
    const ranked = Object.entries(JOURNEY_IMAGE_PALETTES)
      .filter(([id]) => names[id] && !names[id].includes("unused variant"))
      .map(([id, p]) => ({ id, p, w: warmth(p) }))
      .sort((a, b) => a.w - b.w);
    const cool = ranked.slice(0, 2), warm = ranked.slice(-2).reverse();
    const opt = (x: typeof ranked[number] | undefined, tag: string): PalOpt[] => (x ? [{ label: `${tag} · ${names[x.id]}`, pal: particlePaletteFromImage(x.p, 1) }] : []);
    return [
      ...opt(cool[0], "cool"), ...opt(warm[0], "warm"), ...opt(cool[1], "cool"), ...opt(warm[1], "warm"),
      { label: "fire · Realized", pal: particlePaletteFire(JOURNEY_IMAGE_PALETTES["inferno"], 1) },
      { label: "ghost white", pal: particlePaletteGhost(false, 1) },
      { label: "dawn · First Light", pal: particlePaletteDawn(1) },
      { label: "the form's own palette", pal: null },
    ];
  }, [names]);

  const queue = useMemo(() => {
    if (!items) return [];
    return items.filter((it) => (kindFilter === "all" || it.kind === kindFilter) && (!onlyUnreviewed || !verdicts[it.id]));
  }, [items, kindFilter, onlyUnreviewed, verdicts]);

  const current = queue[Math.min(idx, Math.max(0, queue.length - 1))];
  // anchor on the same form when the queue recomputes (as the clip station does)
  const anchorId = current?.id;
  useEffect(() => {
    if (!anchorId) return;
    const at = queue.findIndex((c) => c.id === anchorId);
    if (at >= 0 && at !== idx) setIdx(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);
  useEffect(() => { setIdx(0); }, [kindFilter, onlyUnreviewed]);

  const palOptions = useMemo<PalOpt[]>(() => {
    if (!current) return commonPalettes;
    if (current.kind === "emblem" || current.kind === "moment") {
      const own = current.owners.find((o) => JOURNEY_IMAGE_PALETTES[o.id]);
      const ghost = current.owners.some((o) => o.id === "ghost") || current.src.startsWith("@");
      const ownPal: PalOpt = ghost
        ? { label: `journey · Ghost`, pal: particlePaletteGhost(current.kind === "moment", 1) }
        : own
          ? { label: `journey · ${own.name}`, pal: own.id === "inferno" ? particlePaletteFire(JOURNEY_IMAGE_PALETTES[own.id], 1) : particlePaletteFromImage(JOURNEY_IMAGE_PALETTES[own.id], 1) }
          : { label: "journey · (no palette)", pal: null };
      return [ownPal, ...commonPalettes];
    }
    return commonPalettes;
  }, [current, commonPalettes]);
  const pal = current ? palOptions[(palIdx[current.kind] ?? 0) % palOptions.length] : undefined;

  // ── drive the engine for the current form ─────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !current) return;
    const tok = ++tokRef.current;
    engine.setPalette(pal?.pal ?? null);
    engine.setOffset(0, 0);
    engine.setInstances(1, 0);
    engine.setImageVariant(false, 0);
    engine.setMotion(1);
    if (current.kind === "shape") {
      imageShownRef.current = false;
      setLoadingImg(false);
      const id = current.src as SoulId;
      const soul = SOULS.find((s) => s.id === id);
      engine.setImageForm(0, 0);
      engine.setImageTint(0);
      engine.setSoul(id, 1.5);
      const h = (k: number) => hash01(`${id}:${refigure}:${k}`);
      engine.setShape([h(1), h(2), h(3), h(4)], refigure === 0);
      engine.setUnfold(id === "blossom");
      engine.setSizeScale(THIN.has(id) ? 1.6 : 1);
      engine.setHueSpread(SPECTRUM_FORMS.has(id) ? 0.8 : 0.15);
      engine.setCamScale(1);
      engine.setDensity(Math.min(0.85, soul?.maxDensity ?? 1));
      return;
    }
    // IMAGE FORMS — as the journey layer forms them (particle-lead-layer.tsx):
    // release the previous image first (never retarget image → image in place)
    const wasImage = imageShownRef.current;
    engine.setImageForm(0, 0);
    setLoadingImg(true);
    const maxSide = current.kind === "moment" ? 640 : 512;
    const releaseMs = wasImage ? 900 : 0;
    const t0 = performance.now();
    void formCanvas(current.src, maxSide).then((img) => {
      const wait = Math.max(0, releaseMs - (performance.now() - t0));
      window.setTimeout(() => {
        if (tok !== tokRef.current || engineRef.current !== engine) return;
        setLoadingImg(false);
        if (!img) { setEngineErr(`could not load ${current.src}`); return; }
        setEngineErr(null);
        engine.setSoul("vortex", 1.5);
        engine.setUnfold(false);
        engine.setHueSpread(0.15);
        engine.setSizeScale(1);
        engine.setCamScale(1);
        engine.loadFormImage(img, img.width / Math.max(1, img.height), uvFor(img, engine.imageSampleCount()), true);
        const ghostTreat = current.kind === "emblem" && current.src.startsWith("@");
        // emblem 0.5 × ~1.1 (angel treatments 0.5 × 1.0) · motif 0.72 × ~0.93 · moment 0.95 × 1.1
        const scale = current.kind === "emblem" ? (ghostTreat ? 0.5 : 0.55) : current.kind === "motif" ? 0.67 : 1.045;
        const literal = current.kind === "emblem" ? (ghostTreat ? 0.8 : 0.97) : current.kind === "motif" ? 0.82 : 0.9;
        engine.setImageScale(scale);
        // motif designs take the palette; emblems / moments keep their own colours
        engine.setImageTint(current.kind === "motif" ? 1 : 0);
        engine.setDensity(1);
        engine.setImageForm(literal, 1);
        imageShownRef.current = true;
      }, wait);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, engineReady, refigure]);

  // palette changes alone just re-target the colour (the engine glides it)
  useEffect(() => { engineRef.current?.setPalette(pal?.pal ?? null); }, [pal]);

  // prefetch the next image forms
  useEffect(() => {
    for (const it of queue.slice(idx + 1, idx + 4)) if (it.kind !== "shape") void formCanvas(it.src, it.kind === "moment" ? 640 : 512);
  }, [queue, idx]);

  const setVerdict = useCallback((verdict: "keep" | "remove" | null) => {
    if (!current) return;
    const id = current.id;
    setVerdicts((prev) => {
      const next = { ...prev };
      if (verdict === null) delete next[id];
      else next[id] = { verdict, at: new Date().toISOString() };
      return next;
    });
    void fetch("/api/review/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, verdict }),
    });
    if (verdict !== null) { setRefigure(0); setIdx((i) => Math.min(i + 1, queue.length - 1)); }
  }, [current, queue.length]);

  const cyclePalette = useCallback(() => {
    if (!current) return;
    const k = current.kind;
    setPalIdx((p) => ({ ...p, [k]: ((p[k] ?? 0) + 1) % palOptions.length }));
  }, [current, palOptions.length]);

  const move = useCallback((d: number) => { setRefigure(0); setIdx((i) => Math.max(0, Math.min(i + d, queue.length - 1))); }, [queue.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "SELECT" || tag === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") setVerdict("keep");
      else if (k === "r") setVerdict("remove");
      else if (k === "u") setVerdict(null);
      else if (k === "p") cyclePalette();
      else if (k === "f" && current?.kind === "shape") setRefigure((n) => n + 1);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setVerdict, cyclePalette, move, current?.kind]);

  const stats = useMemo(() => {
    const out = {} as Record<Kind, { total: number; reviewed: number; removed: number }>;
    for (const k of KINDS) out[k] = { total: 0, reviewed: 0, removed: 0 };
    for (const it of items ?? []) {
      const s = out[it.kind];
      s.total++;
      const v = verdicts[it.id]?.verdict;
      if (v) s.reviewed++;
      if (v === "remove") s.removed++;
    }
    return out;
  }, [items, verdicts]);
  const pendingApply = useMemo(() => (items ?? []).filter((it) => (verdicts[it.id]?.verdict === "remove") !== it.applied).length, [items, verdicts]);

  if (error) return <div style={{ padding: 40, color: "#f88", fontFamily: "monospace" }}>{error}</div>;
  if (!items) return <div style={{ padding: 40, color: "#888", fontFamily: "monospace" }}>loading forms…</div>;

  const v = current ? verdicts[current.id]?.verdict : undefined;
  const ownersText = current?.owners.length
    ? current.owners.length > 6 ? `${current.owners.slice(0, 6).map((o) => o.name).join(", ")} +${current.owners.length - 6} more` : current.owners.map((o) => o.name).join(", ")
    : "";

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0d0a", color: "#e8ede6", fontFamily: "ui-monospace, monospace", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #1e241c", flexWrap: "wrap", fontSize: 13 }}>
        <strong>form review</strong>
        {KINDS.map((k) => (
          <span key={k} style={{ color: "#8a948a" }}>
            {KIND_LABEL[k]} {stats[k].reviewed}/{stats[k].total}
            {" · "}<span style={{ color: stats[k].removed ? "#e87a6a" : "#8a948a" }}>{stats[k].removed} removed</span>
          </span>
        ))}
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as Kind | "all")}
          style={{ background: "#10140f", color: "#e8ede6", border: "1px solid #1e241c", padding: "4px 8px" }}>
          <option value="all">all forms ({items.length})</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]} ({stats[k].total})</option>)}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#8a948a" }}>
          <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} />
          unreviewed only
        </label>
        <span style={{ marginLeft: "auto", color: "#8a948a" }}>K keep · R remove · U undo · ←/→ move · P palette{current?.kind === "shape" ? " · F refigure" : ""}</span>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20 }}>
        {current ? (
          <div style={{ fontSize: 14, color: "#8a948a", textAlign: "center", maxWidth: "90vw", minHeight: 56 }}>
            {idx + 1}/{queue.length} — <span style={{ color: "#e8ede6" }}>{current.label}</span> · {current.kind}
            {v && <span style={{ marginLeft: 10, color: v === "keep" ? "#9fd86a" : "#e87a6a" }}>● {v}</span>}
            {current.applied && <span style={{ marginLeft: 10, color: "#e8b86a" }}>(removal applied)</span>}
            <div style={{ fontSize: 12, marginTop: 4 }}>{current.detail}</div>
            {ownersText && <div style={{ fontSize: 12, marginTop: 2, color: "#6f7a6f" }}>{current.kind === "shape" ? "cast in: " : "used by: "}{ownersText}</div>}
          </div>
        ) : (
          <div style={{ color: "#9fd86a" }}>nothing left in this filter — every form reviewed</div>
        )}
        <div style={{ position: "relative", width: "min(96vw, calc(72vh * 1.6))", aspectRatio: "16 / 10", background: "#000", border: "1px solid #1e241c" }}>
          {/* the canvas stays mounted for the whole session: one WebGL context */}
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
          {(loadingImg || engineErr) && (
            <div style={{ position: "absolute", left: 12, bottom: 10, fontSize: 12, color: engineErr ? "#e87a6a" : "#6f7a6f" }}>
              {engineErr ? `engine: ${engineErr}` : "forming…"}
            </div>
          )}
          {pal && <div style={{ position: "absolute", right: 12, bottom: 10, fontSize: 12, color: "#6f7a6f" }}>palette (P): {pal.label}</div>}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => move(-1)} style={btn("#1e241c")}>← prev</button>
          <button onClick={() => setVerdict("keep")} style={btn("#2c4a1e", "#9fd86a")}>keep (K)</button>
          <button onClick={() => setVerdict("remove")} style={btn("#4a221e", "#e87a6a")}>remove (R)</button>
          <button onClick={() => setVerdict(null)} style={btn("#1e241c")}>undo (U)</button>
          <button onClick={cyclePalette} style={btn("#1e241c")}>palette (P)</button>
          {current?.kind === "shape" && <button onClick={() => setRefigure((n) => n + 1)} style={btn("#1e241c")}>refigure (F)</button>}
          <button onClick={() => move(1)} style={btn("#1e241c")}>next →</button>
        </div>
        {pendingApply > 0 && (
          <div style={{ fontSize: 12, color: "#e8b86a" }}>
            {pendingApply} verdict{pendingApply === 1 ? "" : "s"} not yet applied — run <code>node scripts/apply-form-removals.mjs</code> (journeys are unchanged until then)
          </div>
        )}
      </main>
    </div>
  );
}

function btn(bg: string, color = "#e8ede6"): React.CSSProperties {
  return { background: bg, color, border: "1px solid #1e241c", padding: "10px 18px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
}
