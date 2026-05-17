import Link from "next/link";

type Prototype = {
  slug: string;
  title: string;
  status: "skeleton" | "wip" | "demoable" | "polished";
  oneLiner: string;
};

const PROTOTYPES: Prototype[] = [
  {
    slug: "1-live",
    title: "Live Mic Viz",
    status: "demoable",
    oneLiner:
      "Mic input → 6-band FFT → radial color fields blooming from center. Low bass deep violet, highs white-hot.",
  },
  {
    slug: "2-ghost-lab",
    title: "Ghost LoRA Lab",
    status: "skeleton",
    oneLiner:
      "A/B compare Ghost prompts at different LoRA scales. Vote which scenes feel right. Build intuition.",
  },
  {
    slug: "3-fluid",
    title: "Audio-Driven Fluid",
    status: "skeleton",
    oneLiner:
      "Navier-Stokes ink-in-water. Bass = pressure pulses, treble = turbulence, spectral centroid = color.",
  },
  {
    slug: "4-operator",
    title: "Operator Panel (Tauri preview)",
    status: "skeleton",
    oneLiner:
      "Performer view + scene library + MIDI map. What running Resonance live from a booth looks like.",
  },
  {
    slug: "5-arcs",
    title: "Journey Engine v2 — alternate arcs",
    status: "skeleton",
    oneLiner:
      "Pick an arc shape other than the psychedelic 6-phase. EDM build-and-drop, cinematic three-act, ritual, sleep cycle.",
  },
];

const STATUS_STYLES: Record<Prototype["status"], string> = {
  skeleton: "text-white/30 border-white/20",
  wip: "text-amber-300/80 border-amber-300/30",
  demoable: "text-emerald-300 border-emerald-300/40",
  polished: "text-violet-300 border-violet-300/50",
};

export default function DreamIndex() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl mb-2 tracking-tight">Resonance Dream Sandbox</h1>
      <p className="text-sm text-white/50 mb-10 leading-relaxed">
        Prototypes the Dream Agent is building overnight. Some demoable, most
        still skeletons. Open one, play with it, then chat with Claude
        about what to refine. Production Resonance is untouched —
        everything here lives on the <code className="text-white/70">dream/sandbox</code> branch.
      </p>

      <ol className="space-y-3">
        {PROTOTYPES.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/dream/${p.slug}`}
              className={
                "block border rounded-md px-4 py-4 transition " +
                "border-white/10 hover:border-white/30 hover:bg-white/[0.02]"
              }
            >
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-base text-white">
                  <span className="text-white/40 mr-2">{p.slug.split("-")[0]}.</span>
                  {p.title}
                </h2>
                <span
                  className={
                    "text-[10px] uppercase tracking-widest border px-2 py-0.5 rounded " +
                    STATUS_STYLES[p.status]
                  }
                >
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-white/55 leading-relaxed">{p.oneLiner}</p>
            </Link>
          </li>
        ))}
      </ol>

      <footer className="mt-16 text-xs text-white/30 leading-relaxed">
        <p>
          Updated by the Dream Agent each hour. To stop the loop, disable
          the routine at <span className="text-white/50">claude.ai/code/routines</span>.
        </p>
      </footer>
    </div>
  );
}
