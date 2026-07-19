# Morning digest — last updated 2026-07-19 (cycle 827, DEEP)

> **Tonight the lab built a room that *remembers where your body was*.** A plain webcam is read as a depth field; you appear as a 3-D point cloud, and wherever you hold still, the room deposits a glowing "memory" that keeps singing a pure-tuned note — walk back through it and it swells. Over a few minutes you *author* a chord of ratios spread through the room's depth. I attacked one concept 3 ways and shipped the strongest.

**Open this first (grant the camera if you can; it's fully alive without it):** https://getresonance.vercel.app/dream/1960-depth-well — press **Start**. With no camera a "ghost" presence drifts, dwells and builds the chord so you hear it immediately. With a camera it renders *you* in depth; hold still ~1.5 s anywhere to drop a memory-node, then move back through it to hear it bloom.

## New since yesterday
- **`/dream/1960-depth-well`** — *a depth room that remembers.* The lab already had two depth rooms (`927`, `942`) but both are purely **reactive** — proximity→timbre, depth→harmony — and **neither remembers anything.** This adds the missing ingredient: **durable, revisitable memory** you deposit by dwelling. Depth is real ML (Depth-Anything-V2) running in your browser via Transformers.js/WebGPU — no depth camera, no server, nothing added to the app. Cold deep-space palette on purpose (last week ran warm-paper-heavy).
- **Honest note:** I first thought "webcam depth" was a lab-first — it isn't (927/942 exist). Corrected in the README + notes. The genuinely fresh move is the **memory**, not the input; it clears the ambition floor on subsystems + named references (Krueger *Videoplace*, Rozin, Lozano-Hemmer), not novelty.
- **2 more explored, banked (IDEAS §827):** **`presence-tide`** ⭐ — the same idea but memory as a **diffusing WebGPU-compute field** that evolves over minutes; lost only because a smeared field reads "where you stood" less clearly than discrete nodes — a natural **field⇄nodes toggle** for a cycle 2. **`dwell-room`** — a **no-ML Canvas2D** version that always works even if the model won't load; keep as the universal fallback.

## Research finding worth a look
- Tonight's strongest *new* find (arXiv:2607.06589, "Extending Xenakis / Philips Pavilion," 13 days old) turned out to be **already shipped** — it's exactly what `1870-metastaseis` built last week. So I pivoted to a fresh *combination* instead. Full note in RESEARCH.md (§827). Takeaway: at 776+ prototypes the lab is saturated enough that even a 2-week-old paper can already be in the archive — the fresh lever is now input×substrate×**stance**, not concept.

## Please feel-verify (headless container — no camera/display/speakers here)
- Does the depth model actually **load on your machine/phone**, and does the point cloud read as genuinely **3-D**? Does **dwelling** land as a musical *deposit*, and **walking back** swell it legibly? These are exactly the things I can't check without a browser.

## Build honesty
- `tsc` passes clean project-wide; the winner lints clean and its route compiles; the first full build ran end-to-end. But this sandbox has a **hard 4096 open-files cap (un-raisable even as root)** that the 878-page static build trips intermittently with `EMFILE` — a limit **Vercel doesn't have** (your live site builds all 878 pages). Shipped on that evidence; if the deploy unexpectedly fails I'll revert next cycle.

## Open question for you (standing, ~24 juries)
- The **≥2-model AI-pipeline chain** (audio→image→video) is still the one genuinely-absent frontier, blocked only on your paid per-prototype budget (rule #6). This cycle re-proved the **in-browser** model path (Transformers.js/WebGPU, CDN-loaded, no paid budget) — an in-browser chain could cash it for **$0**. Worth one scoping cycle? Yes / no?
