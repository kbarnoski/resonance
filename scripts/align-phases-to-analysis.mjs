// Align every album journey's 6 phase boundaries to its track's REAL
// energy arc, computed from the studio analysis (note density ×
// velocity envelope). The transcendence window sits on the true
// musical peak; the peak-forward image allocation and the phase-aware
// player then concentrate imagery exactly where the music climaxes.
// (Karel 2026-09-20: "use the musical analysis as inspiration for all")
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SBL = JSON.parse((await import("node:fs")).readFileSync("scripts/sbl-output.json", "utf8")).journeys
  .map((j) => ({ journeyId: j.journeyId, recordingId: j.recordingId, name: j.cleanTitle }));
const WH = [
  ["27f52cf0-5fad-420f-8324-8017c414f1f8", "d57cfae6-f234-4d24-85fe-72a8ad93a44a", "Interplay"],
  ["a5b5f0cf-9a6b-451a-8293-3d98f3904342", "eba95845-cdbf-41d8-9c5d-8679686811ad", "Bath"],
  ["79e33115-7f1e-44bc-b950-7adf5055dd55", "8dafed88-4761-4dd3-a0f4-93f310441093", "Welcome Home"],
  ["00fcca2b-bc1e-461a-8dcd-3fff74587f3e", "aaaa7e9a-a3ac-4cad-9390-6720555f00a7", "The Knife"],
  ["eb79818b-c7e8-45a7-886c-2a432fe83332", "1f0a541e-df60-44a9-b839-5dc69a007d9f", "2019"],
  ["5a3beb75-4788-4448-a024-4bfae30040c3", "72151c23-f1a0-460f-b2ba-8909b8278e43", "The Knife (Jam)"],
  ["5a3e5044-9da5-404e-b3d6-c0c4fc757a5b", "7816dc66-794b-4fb1-8796-c2ef00c3f943", "Playa"],
  ["08f4c26e-4185-440a-a25c-2440e8e7ae47", "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", "Isolation"],
  ["8997623d-8770-41ce-863d-f359d1a213c4", "788fc202-db77-4f36-a7ff-dd0b6702ca20", "Rebound"],
  ["cd517f5a-c4eb-4d50-8a53-044aa668d087", "c3ae569c-bda3-47b2-8f8d-63cd708e2c2f", "Stir Crazy"],
  ["38daff92-ae34-4448-8868-5f1df6029b94", "d2eeee58-832b-4872-a4be-8fbf030b981d", "Rolling"],
  ["019e1e1d-c7e2-4609-a9c6-364a2755b115", "8a67fc03-181f-46a8-beaa-65468506c920", "Quarantine"],
  ["b207b557-e984-4a06-ae71-83124bcd80d5", "eda30871-c82c-45c4-b352-b158c00528fa", "All Together"],
].map(([journeyId, recordingId, name]) => ({ journeyId, recordingId, name }));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function computeBoundaries(notes, duration) {
  if (!Array.isArray(notes) || notes.length < 40 || !duration) return null;
  const BIN = 0.5;
  const n = Math.ceil(duration / BIN);
  const e = new Array(n).fill(0);
  for (const nt of notes) {
    const i = Math.floor(nt.time / BIN);
    if (i >= 0 && i < n) e[i] += (nt.velocity ?? 64) / 127;
  }
  // smooth (moving average over ~6s)
  const W = Math.max(2, Math.round(6 / BIN));
  const sm = e.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += e[k]; c++; }
    return s / c;
  });
  const max = Math.max(...sm);
  if (max <= 0) return null;
  const norm = sm.map((v) => v / max);
  const frac = (i) => (i * BIN) / duration;

  // Peak center: strongest bin in the middle 15–88% of the piece.
  let tp = 0, best = -1;
  for (let i = Math.floor(0.15 * n); i < Math.floor(0.88 * n); i++) if (norm[i] > best) { best = norm[i]; tp = i; }
  // Transcendence window: contiguous ≥ 0.72 around the peak.
  let a = tp, b = tp;
  while (a > 0 && norm[a - 1] >= 0.72) a--;
  while (b < n - 1 && norm[b + 1] >= 0.72) b++;
  let t2 = clamp(frac(a), 0.16, 0.55);
  let t3 = clamp(frac(b + 1), t2 + 0.12, 0.72);
  // Threshold end: first sustained rise above 0.28.
  let r = 0;
  while (r < n && norm[r] < 0.28) r++;
  let t1 = clamp(frac(r), 0.05, Math.min(0.16, t2 - 0.06));
  // Illumination end: energy falls under 0.5 after the peak window.
  let f = b;
  while (f < n - 1 && norm[f] >= 0.5) f++;
  let t4 = clamp(frac(f), t3 + 0.06, 0.84);
  // Return end: fixed-ish glide, integration gets the real tail.
  let t5 = clamp(t4 + (1 - t4) * 0.55, t4 + 0.05, 0.92);
  const bounds = [0, t1, t2, t3, t4, t5, 1];
  // enforce monotonic + min width 0.05
  for (let i = 1; i < 6; i++) if (bounds[i] < bounds[i - 1] + 0.05) bounds[i] = bounds[i - 1] + 0.05;
  if (bounds[5] > 0.95) bounds[5] = 0.95;
  return bounds;
}

for (const t of [...SBL, ...WH]) {
  const { data: an } = await supabase.from("analyses").select("notes").eq("recording_id", t.recordingId).single();
  const { data: rec } = await supabase.from("recordings").select("duration").eq("id", t.recordingId).single();
  const bounds = computeBoundaries(an?.notes, rec?.duration);
  if (!bounds) { console.log(`~ ${t.name}: no usable envelope, keeping template`); continue; }
  const { data: row } = await supabase.from("journeys").select("phases").eq("id", t.journeyId).single();
  const phases = row.phases.map((p, i) => ({ ...p, start: Number(bounds[i].toFixed(3)), end: Number(bounds[i + 1].toFixed(3)) }));
  const { error } = await supabase.from("journeys").update({ phases }).eq("id", t.journeyId);
  console.log(`${error ? "✗" : "✓"} ${t.name.padEnd(20)} ${phases.map((p) => p.start.toFixed(2)).join(" ")}→1.00`);
}
console.log("done");
