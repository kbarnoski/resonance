// Snowflake Standard — shared thresholds + shot-list / literalness lenses.
// Used by scripts/audit-snowflake-standard.mjs and the mv-rollout tools
// (scripts/mv-rollout/*) so a shot list is checked BEFORE it is applied.
// See docs/snowflake-standard.md.
// ══════════════════════ THE STANDARD (thresholds) ══════════════════════
// Derived from Snowflake's measured take + Karel's laws; documented in
// docs/snowflake-standard.md. Change both together.
export const STD = {
  S1_distinctShots: 12,      // ≥12 genuinely different shots (Snowflake: 6 phases + 12 curated particle stills)
  S2_registers: 4,           // spec law 2: ≥4 scale registers
  S3_alternation: 0.6,       // ≥60% of adjacent shots change register (micro↔macro)
  S4_placeLock: 3,           // no place noun in more than 3 phases (spec law 5)
  S5_cosmic: 1,              // ≥1 cosmic/abstract escape
  S6_camera: 0.25,           // ≥25% of shots carry camera/POV travel language
  S7_sparseOpen: 1,          // the opening shot is a sparse one-subject-on-dark frame
  L1_literal: 0.15,          // ≤15% of shots literal (Karel 2026-10-05: visionary + surreal, never literal)
  H1_distinct: 10,           // ≥10 distinct shaders on screen (Snowflake take: 14)
  H2_maxShare: 0.35,         // no shader on screen >35% of the track (lead excepted up to H3)
  H3_leadShare: 0.5,         // the single lead ≤50%
  H4_maxRun: 0.25,           // no shader continuously on screen >25% of the track (~one phase)
  H5_layers: 1.8,            // mean live shader layers ≤1.8 (Snowflake ≈1.2: one voice, the dual is earned)
  P1_dupRate: 0.2,           // ≤20% of distinct stills are near-duplicates (16px zero-mean correlation ≥0.85) of another
  P2_centred: 0.35,          // ≤35% of stills put their subject dead centre
  P3_negSpace: 0.45,         // median dark-pixel share ≥45% (room to layer on top)
  M1_morphCover: 0.8,        // ≥80% of phase boundaries have a travel morph
  C1_stillsPerMin: 3.5,      // measured ≥3.5 new stills/min (Snowflake ≈4.3)
  C2_repeatRate: 0.1,
  C3_presence: 0.35,         // measured: no shader on screen (any layer) >35% of a real kiosk run (Snowflake: 23%)        // ≤10% of still pushes re-show an image already shown this run
};

// ══════════════════════ helpers ══════════════════════
const STOP = new Set("a an the of and in into on at to from with its it is as by for at across over under through one each every all this that like than then while their them there where which who whose is are be been being toward towards against within without only most more very".split(" "));
const BOILER = /(asymmetric off-center composition[^,]*,?|completely uninhabited,?|no text no signatures no watermarks no letters no writing|no figures|no trees no roots( no plants)?|no sun no sky no landscape no figures,?)/gi;
export const norm = (s) => (s ?? "").replace(BOILER, " ").replace(/^(DARK BACKGROUND|PURE WHITE BACKGROUND)\s*[—,:-]\s*/i, "").toLowerCase();
const words = (s) => new Set(norm(s).replace(/[^a-z\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function jaccard(a, b) { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, a.size + b.size - i); }
// Register classifier — first match by precedence over the shot's HEAD
// (the first ~140 chars carry the framing; tails are decoration).
const REG = [
  ["micro", /\b(extreme macro|macro|microscop\w*|close study|closest range|extreme close|cell|cells|membrane|grain|grains|droplet|dewdrop|filament|spore|pollen grain|facet)\b/],
  ["cosmic", /\b(cosmic|cosmos|galax\w*|nebula\w*|constellation\w*|deep space|star ?field|starlight|universe|celestial|infinite (dark|void|space)|void)\b/],
  ["aerial", /\b(aerial|from (directly )?above|overhead|bird'?s.eye|looking (straight )?down|high above|planetary|atmospher\w*|from orbit)\b/],
  ["abstract", /\b(abstract|mandala|fractal|lattice|geometr\w*|interference|pattern|kaleidoscop\w*)\b/],
  ["interior", /\b(interior|inside|within the|riding|tunnel|chamber|beneath the surface|under(water| the surface))\b/],
  ["intimate", /\b(close|a single|single|one (small|lone|last)|lone|small|tiny)\b/],
  ["landscape", /\b(wide|landscape|meadow|field|valley|shore|forest|horizon|plain|river|lake|sea|ocean|canyon|hills?|mountain\w*|desert|marsh|grove|garden|island|coast|prairie|tundra|dunes?)\b/],
];
export function register(shot) { const h = norm(shot).slice(0, 140); for (const [r, re] of REG) if (re.test(h)) return r; return "unclassed"; }
const PLACES = ["meadow", "field", "valley", "shore", "forest", "sky", "river", "lake", "sea", "ocean", "canyon", "cave", "desert", "garden", "island", "room", "hall", "cathedral", "tunnel", "plain", "prairie", "hill", "cliff", "beach", "marsh", "grove", "mountain", "harbor", "harbour", "bay", "glade", "orchard", "vineyard", "chapel", "church", "barn", "cabin", "porch", "road", "track", "station", "city", "village"];
const CAMERA = /\b(through|into|toward|towards|descend\w*|rising|rises|diving|dives|flying|fly|riding|rides|passing|emerg\w*|approach\w*|pull(ing|s)? back|push(ing|es)? in|enter\w*|plung\w*|soar\w*|glid\w*|travel\w*|camera|following|drawn (in|toward)|sweeping past|falling (through|toward))\b/;
// LITERALNESS (Karel 2026-10-05: "i never want these to look too literal.
// these are visionary and surreal ... not literal"). A shot is literal
// when it names an everyday object/structure/creature, or a plain
// nature scene, without transfiguring it (light-made, impossible scale
// or physics, fractal/kaleidoscopic structure, cosmic dissolve).
const LIT_OBJECT = /\b(room|house|home|window|door|table|chair|piano|keys|instrument|guitar|violin|bells?|building|street|road|car|train|barn|cabin|porch|church|chapel|cathedral|lantern|candle|lamp|cup|book|boat|ship|bridge|fence|wall|stairs|kitchen|bed|clock|photograph|horses?|birds?|deer|wolf|wolves|fish|butterfl\w*|bees?|grapes?|vines?|wine|bottle|glass of)\b/;
const LIT_SCENE = /\b(meadow|field|forest|woods|valley|shore|beach|lake|river|mountains?|sunset|sunrise|trees?|grass\w*|flowers?|hills?|coast|vineyard|orchard|garden|thistle\w*|dandelion|wheat|redwoods?|clouds?|rain|storm|ocean|sea|water)\b/;
const TRANSFIGURE = /\b(made (only )?of light|of pure light|luminous|impossible|fractal|kaleidoscop\w*|surreal|dreamlike|otherworldly|visionary|cosmic|galax\w*|nebula\w*|dissolv\w*|particles?|glitter|prismatic|worlds? within|inside (a|an|the) (single|tiny)|suspended in (the )?void|abstract|mandala|spiral\w*|fibonacci|infinite|translucent|weightless|inverted|upside|floating island|light-threads?)\b/g;
export function literal(shot) {
  const t = norm(shot);
  const marks = (t.match(TRANSFIGURE) ?? []).length;
  if (LIT_OBJECT.test(t)) return marks < 2;
  if (LIT_SCENE.test(t)) return marks < 1 || (/photoreal/.test(t) && marks < 2);
  return false;
}
const SPARSE = /\b(single|one (small|lone|last|tiny)|lone|tiny|almost nothing|vast (dark|black|silence|negative)|negative space|nearly the entire frame|small in|dark background)\b/i;

export function shotsOf(phases) {
  const out = [];
  for (const p of phases) {
    const seq = p.aiPromptSequence?.length ? p.aiPromptSequence : p.aiPrompt ? [p.aiPrompt] : [];
    for (const s of seq) out.push({ phase: p.id, text: s });
  }
  return out;
}

export function auditShots(phases) {
  const shots = shotsOf(phases);
  const W = shots.map((s) => words(s.text));
  // distinct = greedy clustering at Jaccard ≥ 0.5
  const reps = [];
  for (let i = 0; i < shots.length; i++) if (!reps.some((r) => jaccard(W[r], W[i]) >= 0.5)) reps.push(i);
  const regs = shots.map((s) => register(s.text));
  let changes = 0; for (let i = 1; i < regs.length; i++) if (regs[i] !== regs[i - 1]) changes++;
  const placeCount = {};
  for (const p of phases) {
    const txt = norm([p.aiPrompt, ...(p.aiPromptSequence ?? [])].join(" "));
    for (const pl of PLACES) if (new RegExp(`\\b${pl}s?\\b`).test(txt)) placeCount[pl] = (placeCount[pl] ?? 0) + 1;
  }
  const [lockNoun, lockN] = Object.entries(placeCount).sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  const first = shots[0]?.text ?? "";
  return {
    shots: shots.length,
    distinct: reps.length,
    registers: [...new Set(regs.filter((r) => r !== "unclassed"))],
    regSeq: regs,
    alternation: regs.length > 1 ? changes / (regs.length - 1) : 0,
    placeLock: { noun: lockNoun, phases: lockN },
    cosmic: regs.filter((r) => r === "cosmic" || r === "abstract").length,
    camera: shots.filter((s) => CAMERA.test(norm(s.text))).length / Math.max(1, shots.length),
    sparseOpen: SPARSE.test(first) ? 1 : 0,
    literal: shots.filter((s) => literal(s.text)).length / Math.max(1, shots.length),
    literalShots: shots.filter((s) => literal(s.text)).map((s) => `${s.phase}: ${norm(s.text).slice(0, 90)}`),
  };
}

