"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

// Copied from src/lib/journeys/ghost-lora.ts — avoids importing production code.
// Update manually if the LoRA is retrained.
const GHOST_LORA_URL =
  "https://v3b.fal.media/files/b/0a99ac7a/yzeS5s13BwrPr675RBZrh_pytorch_lora_weights.safetensors";

const GHOST_NEGATIVE =
  "bird feathers, bird wings, plumage, additional people, multiple people, crowds, " +
  "text, watermark, signature, illustration, cartoon, painting, anime, " +
  "deformed anatomy, extra limbs, blurry face, low quality, oversaturated";

// Five pre-set Ghost scenes covering the journey narrative arc.
// Prompt A = primary angle; Prompt B = alternate camera/composition.
const SCENES = [
  {
    label: "Stone chamber — threshold",
    promptA:
      "ancient dark stone castle chamber at night, tall arched stone window with cosmic void of faint stars beyond, diagonal silver moonlight shaft across worn cracked stone floor with ancient tree roots, deep dramatic shadows, mysterious ethereal",
    promptB:
      "extreme overhead top-down cinematic view from high stone castle ceiling looking far down into grand chamber below, shafts of natural silver-white light from tall arched window, ancient tree roots cracking the stone floor, grand medieval castle, mysterious ethereal",
  },
  {
    label: "Root portal — descent",
    promptA:
      "natural organic portal of intertwining ancient tree roots descending into dark earth at the end of a grand stone castle chamber, pure white flowers blooming along root edges, dark void pulling inward, wisps of darkness emerging from the portal, mysterious ethereal",
    promptB:
      "looking upward from deep inside an underground earthen tunnel, vast interlocking root network forming the tunnel walls and ceiling, a narrow circle of pale moonlit sky visible far above, white flower petals floating downward, ethereal dark dreamlike",
  },
  {
    label: "Underground pool — luminous water",
    promptA:
      "vast underground cavern with a still luminous pool of water glowing ethereal blue-white from within, ancient stone walls covered in roots, cosmic starlight filtering down through cracks in the cavern ceiling high above, fibonacci spiral particles rising from the water surface, dark and transcendent",
    promptB:
      "view from below the water surface looking up at a shimmering pool ceiling, moonlight refracting through the water above into long diagonal light columns, dark underwater cavern visible at edges, ethereal dreamlike",
  },
  {
    label: "Tiny planet — blooming tree",
    promptA:
      "solitary pure-white-flower tree floating on its own small round planet in infinite deep cosmic space, ancient roots wrapping around the entire small sphere, spiral galaxies and nebulae as backdrop, golden fibonacci particle streams spiraling from the roots into space, transcendent",
    promptB:
      "looking up from the surface of a tiny round planet into infinite open cosmos, the white-flower tree overhead filling the sky, roots curling under the ground visible at the horizon, golden cosmic light from above, spiral galaxies filling the dark sky, transcendent ethereal",
  },
  {
    label: "Cosmic ascension — transcendence",
    promptA:
      "infinite open golden-white cosmic space, golden spiral galaxies and nebulae in all directions, dense fibonacci spiral particle streams converging from every direction toward a single radiant point of pure light, transcendent vast infinite",
    promptB:
      "extreme wide dreamlike cosmic tableau collage — grand castle stone chamber at one edge, root-portal descending into dark earth in another, bloomed white-flower tree on tiny planet in another, all floating in infinite space connected by rivers of white and gold fibonacci particle streams, stars nebulae spiral galaxies backdrop",
  },
];

type Mode = "lora-compare" | "ab-prompts";
type VoteKey = "A" | "B" | "both" | "neither";

interface GenResult {
  image: string | null;
  model: string | null;
  cost: number | null;
  error: string | null;
  loading: boolean;
}

interface VoteTally {
  A: number;
  B: number;
  both: number;
  neither: number;
}

const EMPTY: GenResult = {
  image: null,
  model: null,
  cost: null,
  error: null,
  loading: false,
};

function rng(): number {
  return Math.floor(Math.random() * 999_999_999);
}

function loadTally(): VoteTally {
  try {
    const raw = localStorage.getItem("ghost-lab-votes");
    if (raw) return JSON.parse(raw) as VoteTally;
  } catch {
    /* ignore */
  }
  return { A: 0, B: 0, both: 0, neither: 0 };
}

function saveTally(t: VoteTally): void {
  try {
    localStorage.setItem("ghost-lab-votes", JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export default function GhostLab() {
  const [mode, setMode] = useState<Mode>("lora-compare");

  // lora-compare mode: one shared prompt; ab-prompts mode: two independent prompts
  const [sharedPrompt, setSharedPrompt] = useState(SCENES[0].promptA);
  const [promptA, setPromptA] = useState(SCENES[0].promptA);
  const [promptB, setPromptB] = useState(SCENES[0].promptB);
  const [useLoraA, setUseLoraA] = useState(true);
  const [useLoraB, setUseLoraB] = useState(false);

  const [seedA, setSeedA] = useState(() => rng());
  const [seedB, setSeedB] = useState(() => rng());

  const [resultA, setResultA] = useState<GenResult>(EMPTY);
  const [resultB, setResultB] = useState<GenResult>(EMPTY);

  const [tally, setTally] = useState<VoteTally>(loadTally);
  const [lastVote, setLastVote] = useState<VoteKey | null>(null);

  const handleSceneChange = (idx: number) => {
    if (idx < 0 || idx >= SCENES.length) return;
    const s = SCENES[idx];
    setSharedPrompt(s.promptA);
    setPromptA(s.promptA);
    setPromptB(s.promptB);
  };

  const generate = useCallback(async () => {
    setResultA({ ...EMPTY, loading: true });
    setResultB({ ...EMPTY, loading: true });
    setLastVote(null);

    const pA = mode === "lora-compare" ? sharedPrompt : promptA;
    const pB = mode === "lora-compare" ? sharedPrompt : promptB;
    const loraA = mode === "lora-compare" ? true : useLoraA;
    const loraB = mode === "lora-compare" ? false : useLoraB;

    async function gen(
      prompt: string,
      seed: number,
      useLora: boolean,
      setter: (r: GenResult) => void,
    ) {
      try {
        const body: Record<string, unknown> = {
          prompt,
          negativePrompt: GHOST_NEGATIVE,
          highQuality: true,
          width: 768,
          height: 768,
          seed,
        };
        if (useLora) body.characterLora = GHOST_LORA_URL;

        const res = await fetch("/api/ai-image/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          image?: string;
          model?: string;
          cost?: number;
          error?: string;
        };
        if (data.error) {
          setter({ ...EMPTY, error: data.error });
        } else {
          setter({
            image: data.image ?? null,
            model: data.model ?? null,
            cost: data.cost ?? null,
            error: null,
            loading: false,
          });
        }
      } catch (e: unknown) {
        setter({
          ...EMPTY,
          error: e instanceof Error ? e.message : "Network error",
        });
      }
    }

    await Promise.all([
      gen(pA, seedA, loraA, setResultA),
      gen(pB, seedB, loraB, setResultB),
    ]);
  }, [mode, sharedPrompt, promptA, promptB, seedA, seedB, useLoraA, useLoraB]);

  const vote = (v: VoteKey) => {
    const next: VoteTally = { ...tally, [v]: tally[v] + 1 };
    setTally(next);
    saveTally(next);
    setLastVote(v);
  };

  const isGenerating = resultA.loading || resultB.loading;
  const hasResults = !!(resultA.image || resultB.image || resultA.error || resultB.error);
  const total = tally.A + tally.B + tally.both + tally.neither;

  const labelA =
    mode === "lora-compare" ? "A — with Ghost LoRA (flux-lora)" : "A";
  const labelB =
    mode === "lora-compare" ? "B — no LoRA (flux-dev)" : "B";

  return (
    <div className="min-h-screen bg-black text-foreground font-mono">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl tracking-tight">Ghost LoRA Lab</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
              Compare Ghost image generations side-by-side. Vote to build intuition
              for what works. Requires admin login for Ghost LoRA (flux-lora) quality;
              others get schnell automatically.
            </p>
          </div>
          <Link
            href="/dream"
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground whitespace-nowrap mt-1"
          >
            ← back
          </Link>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1">
          {(["lora-compare", "ab-prompts"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-[11px] tracking-wider border rounded transition ${
                mode === m
                  ? "border-border bg-muted text-foreground"
                  : "border-border text-muted-foreground/70 hover:border-border hover:text-muted-foreground"
              }`}
            >
              {m === "lora-compare" ? "LoRA vs no-LoRA" : "A/B Prompts"}
            </button>
          ))}
        </div>

        {/* Scene picker */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/70 tracking-wider">SCENE</span>
          <select
            onChange={(e) => handleSceneChange(parseInt(e.target.value, 10))}
            className="bg-black border border-border rounded text-[11px] text-muted-foreground px-2 py-1 focus:outline-none focus:border-border"
          >
            {SCENES.map((s, i) => (
              <option key={i} value={i}>
                {s.label}
              </option>
            ))}
            <option value={-1}>Custom (edit below)</option>
          </select>
        </div>

        {/* Prompt inputs */}
        {mode === "lora-compare" ? (
          <div className="space-y-2">
            <span className="text-[10px] text-muted-foreground/70 tracking-wider">PROMPT (shared)</span>
            <textarea
              value={sharedPrompt}
              onChange={(e) => setSharedPrompt(e.target.value)}
              rows={4}
              className="w-full bg-muted border border-border rounded text-[11px] text-foreground p-2 resize-none focus:outline-none focus:border-border leading-relaxed"
            />
            <div className="grid grid-cols-2 gap-4 pt-1">
              <SeedRow label={labelA} seed={seedA} setSeed={setSeedA} />
              <SeedRow label={labelB} seed={seedB} setSeed={setSeedB} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/70 tracking-wider">PROMPT A</span>
                <LoraToggle checked={useLoraA} onChange={setUseLoraA} />
              </div>
              <textarea
                value={promptA}
                onChange={(e) => setPromptA(e.target.value)}
                rows={5}
                className="w-full bg-muted border border-border rounded text-[11px] text-foreground p-2 resize-none focus:outline-none focus:border-border leading-relaxed"
              />
              <SeedRow label="" seed={seedA} setSeed={setSeedA} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/70 tracking-wider">PROMPT B</span>
                <LoraToggle checked={useLoraB} onChange={setUseLoraB} />
              </div>
              <textarea
                value={promptB}
                onChange={(e) => setPromptB(e.target.value)}
                rows={5}
                className="w-full bg-muted border border-border rounded text-[11px] text-foreground p-2 resize-none focus:outline-none focus:border-border leading-relaxed"
              />
              <SeedRow label="" seed={seedB} setSeed={setSeedB} />
            </div>
          </div>
        )}

        {/* Generate button */}
        <div className="flex justify-center">
          <button
            onClick={generate}
            disabled={isGenerating}
            className="px-8 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating…" : "Generate A vs B"}
          </button>
        </div>

        {/* Results */}
        {(hasResults || isGenerating) && (
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                { res: resultA, label: labelA },
                { res: resultB, label: labelB },
              ] as const
            ).map(({ res, label }) => (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/70 tracking-wider">
                    {label.toUpperCase()}
                  </span>
                  {res.model && res.cost != null && (
                    <span className="text-[9px] text-muted-foreground/70">
                      {res.model.split("/").pop()} · ${res.cost.toFixed(3)}
                    </span>
                  )}
                </div>
                <div className="aspect-square bg-muted border border-border rounded overflow-hidden flex items-center justify-center">
                  {res.loading && (
                    <div className="text-[11px] text-muted-foreground/70 animate-pulse">
                      generating…
                    </div>
                  )}
                  {res.error && !res.loading && (
                    <p className="text-[11px] text-violet-300/70 px-6 text-center leading-relaxed">
                      {res.error}
                    </p>
                  )}
                  {res.image && !res.loading && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={res.image}
                      alt={label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vote buttons */}
        {hasResults && !isGenerating && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground/70 text-center tracking-wider">
              WHICH IS BETTER?
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {(["A", "both", "B", "neither"] as VoteKey[]).map((v) => (
                <button
                  key={v}
                  onClick={() => vote(v)}
                  className={`px-4 py-1.5 text-[11px] tracking-wider border rounded transition ${
                    lastVote === v
                      ? "border-border bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:border-border hover:bg-accent"
                  }`}
                >
                  {v === "A"
                    ? "👍 A"
                    : v === "B"
                      ? "👍 B"
                      : v === "both"
                        ? "Both"
                        : "Neither"}
                </button>
              ))}
            </div>
            {lastVote && (
              <p className="text-[10px] text-muted-foreground/70 text-center">
                voted — saved to local history
              </p>
            )}
          </div>
        )}

        {/* Vote tally */}
        {total > 0 && (
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-[10px] text-muted-foreground/70 tracking-wider">
              SESSION TALLY — {total} vote{total !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-6 text-[11px] text-muted-foreground">
              <span>
                👍 A: <strong className="text-foreground">{tally.A}</strong>
              </span>
              <span>
                Both: <strong className="text-foreground">{tally.both}</strong>
              </span>
              <span>
                👍 B: <strong className="text-foreground">{tally.B}</strong>
              </span>
              <span>
                Neither: <strong className="text-foreground">{tally.neither}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 text-[10px] text-muted-foreground/70 flex gap-4">
          <a
            href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/src/app/dream/2-ghost-lab/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground"
          >
            design notes ↗
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Small sub-components ────────────────────────────────────────────────────

function SeedRow({
  label,
  seed,
  setSeed,
}: {
  label: string;
  seed: number;
  setSeed: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[9px] text-muted-foreground/70 truncate max-w-[120px]">
          {label}
        </span>
      )}
      <span className="text-[9px] text-muted-foreground/70 ml-auto">seed</span>
      <input
        type="number"
        value={seed}
        onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
        className="w-28 bg-muted border border-border rounded text-[10px] text-muted-foreground px-2 py-0.5 focus:outline-none focus:border-border"
      />
      <button
        onClick={() => setSeed(Math.floor(Math.random() * 999_999_999))}
        className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground border border-border hover:border-border rounded px-2 py-0.5"
      >
        ↺
      </button>
    </div>
  );
}

function LoraToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
      Ghost LoRA
    </label>
  );
}
