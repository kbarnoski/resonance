#!/usr/bin/env node
/**
 * JOURNEY REVIEW — RULE CHECKER. Every law Karel has set (memory:
 * project_particle_engine.md 2026-10-07 section + feedback memories: zero
 * glitch, transitions never abrupt, imaging always progresses …) as a machine
 * check over a record.mjs run.
 *
 *   node scripts/journey-review/check.mjs <runId>            check everything recorded
 *   node scripts/journey-review/check.mjs <runId> --watch    check each journey as its
 *                                                            DONE marker lands; exits
 *                                                            after RUN_DONE
 * Out: runs/<runId>/<journey>/violations.json, runs/<runId>/violations.json
 *      (all, ranked), runs/<runId>/report.md
 *
 * Severity: error = a law is broken (must fix) · warn = suspicious, look at the
 * evidence frames · info = not a verdict (timing on a contended run, heuristics).
 * Frame-timing rules are verdicts ONLY on --perf runs (summary.contended=false);
 * otherwise they are reported as info. Frame gaps that overlap the rig's own
 * screenshot readback are attributed to the rig and ignored.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../..");
const runId = process.argv[2];
if (!runId) { console.error("usage: check.mjs <runId> [--watch]"); process.exit(1); }
if (!process.argv.includes("--watch") && !fs.existsSync(path.join(HERE, "runs", runId))) { console.error(`no run ${runId}`); process.exit(1); }
const RUN = path.join(HERE, "runs", runId);
const WATCH = process.argv.includes("--watch");

// ── reference data ──
const CALM = new Set(["first-snow", "ghost", "inferno"]);
const PROFILES = {};
{
  const s = fs.readFileSync(path.join(ROOT, "src/lib/journeys/particle-profiles.generated.ts"), "utf8");
  for (const m of s.matchAll(/^\s*"([^"]+)": (\{.*\}),?$/gm)) { try { PROFILES[m[1]] = JSON.parse(m[2]); } catch { /* */ } }
}
const TAGS = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/journey-imagery-tags.json"), "utf8"));
const FLORAL = (jid, i) => (TAGS[`${jid}#${i}`]?.motifs ?? []).some((x) => ["petals", "blossoms", "flowers"].includes(x.m));
const phaseAt = (jid, ct) => (PROFILES[jid]?.phaseBounds ?? []).filter((b) => b <= ct).length;

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

async function checkJourney(dirId) {
  const D = path.join(RUN, dirId);
  const S = JSON.parse(fs.readFileSync(path.join(D, "summary.json"), "utf8"));
  // dirs outside a slice are named <id>~slice… — the rules key on the real journey id
  const jid = S.id;
  const tl = readJsonl(path.join(D, "timeline.jsonl"));
  const ev = readJsonl(path.join(D, "events.jsonl"));
  const frames = readJsonl(path.join(D, "frames.jsonl"));
  const errs = readJsonl(path.join(D, "errors.jsonl"));
  const V = [];
  const contended = S.contended !== false;
  const name = S.name;
  const nearestFrames = (ct, n = 2) => frames.filter((f) => f.ct !== null).sort((a, b) => Math.abs(a.ct - ct) - Math.abs(b.ct - ct)).slice(0, n).map((f) => path.join(dirId, f.file)).sort();
  const add = (severity, rule, ct, detail, extra = {}) => V.push({ severity, rule, journey: jid, dir: dirId, name, ct: ct === null || ct === undefined ? null : +(+ct).toFixed(1), detail, evidence: ct === null || ct === undefined ? [] : nearestFrames(ct), ...extra });

  // perf-now → journey clock (ct) via the 1 Hz timeline
  // only rows on this journey's own track (the shared audio element can show the
  // next track's clock for a second before the switch registers)
  // the journey's own track = the src it played MOST (the first sample can be
  // the previous track's, mid-handoff)
  const srcCount = {};
  for (const r of tl) if (r.ct !== null && r.journey === jid && r.src) srcCount[r.src] = (srcCount[r.src] ?? 0) + 1;
  const ownSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const rows = tl.filter((r) => r.ct !== null && r.journey === jid && (!ownSrc || r.src === ownSrc));
  const ctAt = (perf) => {
    if (!rows.length) return null;
    let best = rows[0];
    for (const r of rows) if (Math.abs(r.now - perf) < Math.abs(best.now - perf)) best = r;
    return Math.max(0, best.ct + (best.paused ? 0 : (perf - best.now) / 1000));
  };
  const epochOfPerf = (r, perf) => r.epoch - r.now + perf;
  const shotWins = (S.screenshotWins ?? []).map(([a, b]) => [a - 60, b + 60]);
  const inShot = (epoch) => shotWins.some(([a, b]) => epoch >= a && epoch <= b);
  // duration of the journey's OWN track (the summary's can be the next track's)
  const ownDurs = rows.map((r) => r.dur).filter((d) => d > 0);
  const ownDur = ownDurs.length ? ownDurs.sort((a, b) => ownDurs.filter((x) => x === b).length - ownDurs.filter((x) => x === a).length)[0] : null;
  const dur = ownDur ?? S.audio?.dur ?? PROFILES[jid]?.duration ?? null;
  const jcIn = ev.find((e) => e.type === "journey-change" && String(e.detail).split("->").pop().trim() === jid);
  const jcOut = ev.find((e) => e.type === "journey-change" && String(e.detail).split("->")[0].trim() === jid);
  const evIn = ev.filter((e) => (!jcIn || e.t >= jcIn.t) && (!jcOut || e.t <= jcOut.t));

  // ── completeness / rig ──
  // completeness from the WHOLE timeline (pass1: the summary locked onto the
  // previous track's src from a handoff-time first sample → maxCt 0.09 on 19
  // journeys that played to the end)
  {
    const own = rows.filter((r) => r.journey === jid && typeof r.ct === "number");
    const durs = own.map((r) => r.dur).filter((d) => d > 0);
    const durMode = durs.sort((a, b) => durs.filter((x) => x === b).length - durs.filter((x) => x === a).length)[0];
    const D = dur ?? durMode;
    const maxCt = Math.max(0, ...own.map((r) => r.ct));
    const minCt = Math.min(...own.map((r) => r.ct), 99);
    if (!S.complete && D && maxCt >= D - 4 && minCt < 3) { S.complete = true; S.audio = { ...(S.audio ?? {}), dur: D, maxCt }; }
  }
  if (!S.complete) add(S.inSlice ? "warn" : "info", "rig.incomplete", null, `journey not recorded start→end (firstCt ${S.audio?.firstCt}, maxCt ${S.audio?.maxCt}/${S.audio?.dur})${S.inSlice ? "" : " — handoff tail only"}`);
  for (const e of errs) {
    if (e.pageerror) add("error", "page.error", null, e.pageerror);
    // a missing PACK asset (still, clip, emblem, audio) is a broken journey, not noise
    else if (e.http) add(e.http >= 500 || /^\/(tramokyo-pack|api\/audio)\//.test(e.url) ? "error" : "warn", e.http === 404 && /tramokyo-pack/.test(e.url) ? "pack.asset-missing" : "http.error", null, `${e.http} ${e.url}`);
    else if (e.requestfailed) add("warn", "http.failed", null, `${e.requestfailed} ${e.url}`);
    else if (e.rig) add("warn", "rig.note", null, e.rig);
  }

  // the loop intro (set card, before journey 0) is not a journey: page/rig checks only
  if (jid.startsWith("_")) {
    fs.writeFileSync(path.join(D, "violations.json"), JSON.stringify(V.filter((v) => v.rule !== "rig.incomplete"), null, 1));
    fs.writeFileSync(path.join(D, "CHECKED"), "");
    return V.filter((v) => v.rule !== "rig.incomplete");
  }
  // a TAIL journey (recorded only ~20 s past a slice for its handoff) gets the
  // early-window checks only — no whole-journey verdicts on a fragment
  const TAIL_ONLY = S.inSlice === false;
  // ── AUDIO: plays continuously, 1 s per s ──
  for (const r of rows) {
    // the first 2 s are the media element starting up (pass1: all 48 hits at ct < 0.5)
    if (!TAIL_ONLY && r.ct >= 2 && r.drift !== null && r.drift !== undefined && Math.abs(r.drift) > 0.5) add("error", "audio.drift", r.ct, `media clock moved ${(1 + r.drift).toFixed(2)} s in 1 s`);
    // a jump inside the journey (not at its start/end) is a seek or a restart
    if (r.disc && r.ct > 3 && (!dur || r.ct < dur - 3)) add("error", "audio.jump", r.ct, `audio clock jumped ${r.disc > 0 ? "+" : ""}${r.disc.toFixed(1)} s`);
  }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (b.paused && b.ct > 2 && dur && b.ct < dur - 2) { add("error", "audio.paused", b.ct, "audio paused mid-journey"); break; }
  }

  // ── TIMING (verdict only on --perf) ──
  const tsev = contended ? "info" : "error";
  let gaps = 0, rigGaps = 0;
  for (const r of rows) {
    for (const [perf, dt] of r.frameTimes ?? []) {
      if (dt <= 50) continue;
      if (inShot(epochOfPerf(r, perf))) { rigGaps++; continue; }
      gaps++;
      if (gaps <= 25) add(dt > 80 ? tsev : contended ? "info" : "warn", dt > 80 ? "timing.frame-gap" : "timing.microgap", ctAt(perf), `${dt} ms frame${contended ? " (contended run)" : ""}`);
    }
  }
  if (gaps > 25) add(tsev, "timing.frame-gap", null, `${gaps - 25} more frame gaps >50 ms not listed`);
  if (S.frames?.p95 > 20) add(tsev, "timing.p95", null, `p95 frame ${S.frames.p95} ms (> 20)`);
  for (const r of rows) for (const [st, d] of r.longtasks ?? []) if (d >= 100) add(contended ? "info" : "warn", "timing.longtask", ctAt(st), `long task ${d} ms`);
  for (const e of evIn) if (e.type === "hidden-gap" || (e.type === "visibility" && e.detail === "hidden")) add("error", "page.hidden", ctAt(e.t), `${e.type} ${e.detail ?? ""} — throttled page`);

  // ── PARTICLES ──
  const pl = rows.filter((r) => r.pl && r.pl.journeyId === jid);
  if (rows.some((r) => r.disabled)) add("error", "particles.disabled", rows.find((r) => r.disabled).ct, `particle failsafe tripped: ${rows.find((r) => r.disabled).disabled}`);
  if (rows.length > 20 && pl.length < rows.length * 0.5) add("error", "particles.missing", null, `particle diag present in only ${pl.length}/${rows.length} seconds`);
  // never >10 s without particles (ignoring the first 2 s and the faded last 6 s)
  if (!TAIL_ONLY) {
    let off = null;
    for (const r of pl) {
      const inRange = r.ct > 2 && (!dur || r.ct < dur - 6);
      if (inRange && r.pl.presence < 0.02) { off ??= r.ct; }
      else {
        if (off !== null && r.ct - off > 10.5) add("error", "particles.absent>10s", off, `no particles for ${(r.ct - off).toFixed(0)} s (${off.toFixed(0)}–${r.ct.toFixed(0)} s)`);
        off = null;
      }
    }
    if (off !== null && dur && dur - 6 - off > 10.5) add("error", "particles.absent>10s", off, `no particles from ${off.toFixed(0)} s to the end fade`);
  }
  // once visible, hold ≥5 s
  if (!TAIL_ONLY) {
    let on = null;
    for (const r of pl) {
      if (r.pl.presence > 0.1) { on ??= r.ct; }
      else if (on !== null) {
        const len = r.ct - on;
        if (len < 5 && (!dur || r.ct < dur - 6)) add("error", "particles.too-brief", on, `particles visible only ${len.toFixed(1)} s (min 5)`);
        on = null;
      }
    }
  }
  // forms hold ≥14 s (calm ≥17 s); image forms (motif/echo) count as forms
  if (!TAIL_ONLY) {
    const minHold = CALM.has(jid) ? 17 : 14;
    const changes = evIn.filter((e) => (e.type === "particle-form" && !/\(quiet\)/.test(e.detail ?? "")) || (e.type === "particle-flash" && /^(motif|echo)/.test(e.detail ?? "")));
    for (let i = 1; i < changes.length; i++) {
      const a = ctAt(changes[i - 1].t), b = ctAt(changes[i].t);
      if (a !== null && b !== null && b >= a && b - a < minHold - 0.5) add("error", "particles.form-too-soon", b, `form changed after ${(b - a).toFixed(1)} s (${changes[i - 1].type} ${changes[i - 1].detail} → ${changes[i].type} ${changes[i].detail}; min ${minHold})`);
    }
  }
  // zero-glitch tripwires
  for (const e of evIn) {
    if (e.type === "particle-jump") add("error", "particles.jump", ctAt(e.t), e.detail ?? "");
    if (e.type === "particle-retarget") {
      const m = /shown=([0-9.]+)/.exec(e.detail ?? "");
      // every re-aim of a visible field is logged and GLIDED (5 s cap ramp) —
      // a record, not a glitch; particle-jump is the verdict
      if (m && +m[1] > 0.5) add("info", "particles.retarget-visible", ctAt(e.t), e.detail);
    }
  }
  // emblem under the title, and in the last 17 s
  {
    const em = evIn.filter((e) => e.type === "particle-flash" && /^emblem/.test(e.detail ?? ""));
    const opening = em.find((e) => { const c = ctAt(e.t); return c !== null && c < 6; });
    if (!opening) add("error", "emblem.opening-missing", 0, "no emblem formed under the title (0.8–16 s)");
    if (dur && dur > 40 && S.complete && !TAIL_ONLY) {
      // Ghost's emblem IS the angel: its closing angel signature (held ANGEL_SEC
      // = 22 s, priority over the emblem) covers the last 17 s by design
      const angelClose = jid === "ghost" && evIn.find((e) => e.type === "particle-flash" && /angel signature/.test(e.detail ?? "") && (ctAt(e.t) ?? 0) > dur - 30);
      const closing = angelClose || em.find((e) => { const c = ctAt(e.t); return c !== null && c > dur - 22; });
      if (!closing) add("error", "emblem.closing-missing", dur - 17, "no emblem in the last 17 s");
    }
  }
  // Ghost: blossoms only in floral phases; flashes form the angel
  if (jid === "ghost") {
    for (const e of evIn) {
      if (e.type === "particle-form" && /blossom/.test(e.detail ?? "")) {
        const c = ctAt(e.t);
        const ph = phaseAt(jid, c);
        if (!FLORAL(jid, ph)) add("error", "ghost.blossom-outside-floral", c, `blossom form in phase ${ph} (imagery not floral)`);
      }
    }
    for (const e of evIn.filter((x) => x.type === "bass-flash")) {
      const ok = evIn.some((x) => x.type === "particle-flash" && /gather|angel/.test(x.detail ?? "") && Math.abs(x.t - e.t) < 3000);
      if (!ok) add("error", "ghost.flash-without-angel", ctAt(e.t), "bass flash without the particle angel gather");
    }
  }
  // colour moves: engine hue/sat must vary across the journey
  if (!TAIL_ONLY && pl.length > 30) {
    const hs = pl.filter((r) => r.pl.presence > 0.2).map((r) => r.pl.hue);
    if (hs.length > 20) {
      const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
      const sd = Math.sqrt(hs.reduce((a, b) => a + (b - mean) ** 2, 0) / hs.length);
      if (sd < 0.005) add("warn", "colour.static-hue", null, `engine hue barely moves (sd ${sd.toFixed(4)})`);
    }
  }

  // ── IMAGING: always progressing ──
  if (!TAIL_ONLY) {
    const pushes = evIn.filter((e) => e.type === "still" || e.type === "layer-push-video" || e.type === "clip").map((e) => ({ ct: ctAt(e.t), e }));
    const firstStill = pushes.find((p) => p.e.type === "still");
    if (!firstStill) add("error", "imaging.no-stills", null, "no still ever landed");
    // the boundary freeze protocol holds new stills for the 10.5 s settle BY DESIGN
    else if (firstStill.ct > 13) add("warn", "imaging.first-still-late", firstStill.ct, `first still at ${firstStill.ct.toFixed(1)} s`);
    const videoActiveAt = (c) => rows.some((r) => Math.abs(r.ct - c) < 1 && (r.videos?.length ?? 0) > 0);
    for (let i = 1; i < pushes.length; i++) {
      const a = pushes[i - 1].ct, b = pushes[i].ct;
      if (a === null || b === null) continue;
      if (b - a > 25 && !videoActiveAt((a + b) / 2)) add("error", "imaging.stuck", a, `no new image for ${(b - a).toFixed(0)} s (${a.toFixed(0)}–${b.toFixed(0)} s)`);
    }
    if (pushes.length && dur && S.complete) {
      const lastP = pushes[pushes.length - 1].ct;
      if (lastP !== null && dur * 0.96 - lastP > 25) add("error", "imaging.stuck", lastP, `no new image from ${lastP.toFixed(0)} s to the end`);
    }
    for (const e of evIn) {
      if (e.type === "idle-rescue") { const s = parseInt(e.detail, 10); if (s > 18) add("error", "imaging.idle", ctAt(e.t), `image layer idle ${s} s before rescue`); }
      if (e.type === "still-load-failed") add("error", "imaging.load-failed", ctAt(e.t), e.detail);
    }
    let streak = 0;
    for (const e of evIn) { if (e.type === "push-refused") { if (++streak === 2) add("info", "imaging.push-refused", ctAt(e.t), "push refused twice in a row"); } else if (e.type === "still") streak = 0; }
  }

  // ── HANDOFF: the boundary into this journey ──
  if (jcIn) {
    const c0 = 0;
    for (const r of tl.filter((x) => Math.abs(x.now - jcIn.t) < 4000)) {
      for (const [perf, dt] of r.frameTimes ?? []) if (dt > 80 && Math.abs(perf - jcIn.t) < 3000 && !inShot(epochOfPerf(r, perf))) add(contended ? "warn" : "error", "handoff.frame-gap", c0, `${dt} ms frame ${((perf - jcIn.t) / 1000).toFixed(1)} s from the handoff`);
    }
  }

  // ── FRAMES (heuristics): unexplained big changes; rainbow presence ──
  if (!TAIL_ONLY) {
    const fr = frames.filter((f) => f.ct !== null).sort((a, b) => a.wall - b.wall);
    const stats = [];
    for (const f of fr) {
      try {
        const { data, info } = await sharp(path.join(D, f.file)).resize(80, 50, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
        const px = [];
        let bins = new Array(12).fill(0), sat = 0;
        for (let i = 0; i < data.length; i += info.channels) {
          const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
          px.push(r, g, b);
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
          if (mx > 0.35 && d / mx > 0.45) {
            sat++;
            let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            bins[Math.floor(((h * 60 + 360) % 360) / 30)]++;
          }
        }
        const occupied = sat > 40 ? bins.filter((n) => n / sat > 0.04).length : 0;
        stats.push({ f, px, occupied });
      } catch { /* */ }
    }
    const videoEv = evIn.filter((e) => ["layer-push-video", "clip", "video-ended"].includes(e.type)).map((e) => ctAt(e.t));
    const changeEv = evIn.filter((e) => ["still", "layer-push-still", "layer-push-video", "clip", "shader-primary", "shader-dual", "video-ended", "journey-change", "phase-entry", "bass-flash", "particle-flash"].includes(e.type)).map((e) => ctAt(e.t));
    for (let i = 1; i < stats.length; i++) {
      const a = stats[i - 1], b = stats[i];
      let s = 0;
      for (let k = 0; k < a.px.length; k++) s += Math.abs(a.px[k] - b.px[k]);
      const mad = s / a.px.length;
      if (mad > 0.16) {
        // a morph video FADES IN over ~2-4 s: it explains a change up to 4.5 s after it starts (pass2: Realized/b207 travel-4)
        const explained = changeEv.some((c) => c !== null && c >= a.f.ct - 1 && c <= b.f.ct + 1) || videoEv.some((c) => c !== null && c >= a.f.ct - 4.5 && c <= b.f.ct + 1);
        if (!explained) add("warn", "frames.unexplained-change", b.f.ct, `frame changed ${(mad * 100).toFixed(0)} % between ${a.f.ct.toFixed(1)} s and ${b.f.ct.toFixed(1)} s with no scheduled change`, { evidence: [path.join(dirId, a.f.file), path.join(dirId, b.f.file)] });
      }
    }
    if (jid !== "ghost" && stats.length > 30 && !stats.some((s) => s.occupied >= 6)) add("info", "colour.no-rainbow-seen", null, "no frame with a wide hue spread (heuristic — imagery dominates frames)");
  }

  // ── heap ──
  if (!TAIL_ONLY) {
    const h = rows.map((r) => r.heapMB).filter((x) => x);
    if (h.length > 10 && h[h.length - 1] - h[0] > 120) add("warn", "memory.heap-growth", null, `JS heap grew ${(h[h.length - 1] - h[0]).toFixed(0)} MB across the journey`);
  }

  fs.writeFileSync(path.join(D, "violations.json"), JSON.stringify(V, null, 1));
  fs.writeFileSync(path.join(D, "CHECKED"), "");
  return V;
}

const SEV = { error: 0, warn: 1, info: 2 };
function writeReport() {
  const all = [];
  const journeys = fs.readdirSync(RUN).filter((d) => fs.existsSync(path.join(RUN, d, "violations.json")));
  const per = [];
  for (const j of journeys) {
    const v = JSON.parse(fs.readFileSync(path.join(RUN, j, "violations.json"), "utf8"));
    const s = JSON.parse(fs.readFileSync(path.join(RUN, j, "summary.json"), "utf8"));
    all.push(...v);
    per.push({ j, s, e: v.filter((x) => x.severity === "error").length, w: v.filter((x) => x.severity === "warn").length });
  }
  all.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.rule.localeCompare(b.rule) || a.journey.localeCompare(b.journey) || (a.ct ?? 0) - (b.ct ?? 0));
  fs.writeFileSync(path.join(RUN, "violations.json"), JSON.stringify(all, null, 1));
  const run = fs.existsSync(path.join(RUN, "run.json")) ? JSON.parse(fs.readFileSync(path.join(RUN, "run.json"), "utf8")) : {};
  const byRule = {};
  for (const v of all) { const k = `${v.severity} ${v.rule}`; byRule[k] = (byRule[k] ?? 0) + 1; }
  const md = [
    `# Journey review — run ${runId}`,
    ``,
    `Build ${run.build ?? "?"} · ${run.perf ? "PERF (timing is a verdict)" : "correctness (timing contended → info)"} · parallel ${run.parallel ?? "?"} · ${per.length} journeys checked${fs.existsSync(path.join(RUN, "RUN_DONE")) ? "" : " (run still recording)"}`,
    ``,
    `**${all.filter((v) => v.severity === "error").length} errors · ${all.filter((v) => v.severity === "warn").length} warnings · ${all.filter((v) => v.severity === "info").length} info**`,
    ``,
    `## By rule`,
    ...Object.entries(byRule).sort((a, b) => SEV[a[0].split(" ")[0]] - SEV[b[0].split(" ")[0]] || b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`),
    ``,
    `## Journeys`,
    `| journey | complete | errors | warns | fps | p95 ms | max ms | drift max s |`,
    `|---|---|---|---|---|---|---|---|`,
    ...per.sort((a, b) => b.e - a.e || b.w - a.w).map(({ j, s, e, w }) => `| ${s.name} (${j.slice(0, 8)}) | ${s.complete ? "yes" : "NO"} | ${e} | ${w} | ${s.frames?.fps ?? "-"} | ${s.frames?.p95 ?? "-"} | ${s.frames?.max ?? "-"} | ${s.audio?.driftMax ?? "-"} |`),
    ``,
    `## Errors and warnings`,
    ...all.filter((v) => v.severity !== "info").map((v) => `- **${v.severity}** \`${v.rule}\` — ${v.name}${v.ct !== null ? ` @ ${v.ct}s` : ""}: ${v.detail}${v.evidence?.length ? ` — ${v.evidence.join(", ")}` : ""}`),
    ``,
    `## Info`,
    ...all.filter((v) => v.severity === "info").slice(0, 200).map((v) => `- \`${v.rule}\` — ${v.name}${v.ct !== null ? ` @ ${v.ct}s` : ""}: ${v.detail}`),
  ];
  fs.writeFileSync(path.join(RUN, "report.md"), md.join("\n") + "\n");
  return all;
}

async function pass(force) {
  // --watch: only journeys whose DONE marker landed; a full check takes every recorded dir
  const ds = fs.readdirSync(RUN).filter((d) => fs.existsSync(path.join(RUN, d, "summary.json")) && (!WATCH || fs.existsSync(path.join(RUN, d, "DONE"))));
  let n = 0;
  for (const d of ds) {
    if (!force && fs.existsSync(path.join(RUN, d, "CHECKED"))) continue;
    const v = await checkJourney(d);
    n++;
    console.error(`checked ${d}: ${v.filter((x) => x.severity === "error").length} errors, ${v.filter((x) => x.severity === "warn").length} warnings`);
  }
  if (n) writeReport();
  return n;
}

if (WATCH) {
  // the recorder may not have created the run yet
  while (!fs.existsSync(RUN)) await new Promise((r) => setTimeout(r, 5000));
  for (;;) {
    await pass(false);
    if (fs.existsSync(path.join(RUN, "RUN_DONE"))) { await pass(false); writeReport(); break; }
    await new Promise((r) => setTimeout(r, 15000));
  }
} else {
  await pass(true);
  writeReport();
}
console.error(`report → ${path.relative(ROOT, path.join(RUN, "report.md"))}`);
