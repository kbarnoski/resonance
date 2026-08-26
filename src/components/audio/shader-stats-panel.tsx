"use client";

import { useState, useMemo } from "react";
import type { ShaderStats } from "./journey-feedback";
import { computeShaderAnalytics } from "@/lib/shader-stats";

interface ShaderStatsPanelProps {
  stats: ShaderStats;
  blocked: Set<string>;
  deleted: Set<string>;
}

// Category tint colors for the bar charts
const CATEGORY_COLORS: Record<string, string> = {
  Visionary: "rgba(168, 85, 247, 0.7)",
  Cosmic: "rgba(96, 165, 250, 0.7)",
  Organic: "rgba(74, 222, 128, 0.7)",
  Geometry: "rgba(251, 191, 36, 0.7)",
  "3D Worlds": "rgba(251, 146, 60, 0.7)",
  Elemental: "rgba(239, 68, 68, 0.7)",
  Dark: "rgba(148, 163, 184, 0.7)",
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "rgba(255, 255, 255, 0.4)";
}

export function ShaderStatsPanel({ stats, blocked, deleted }: ShaderStatsPanelProps) {
  const analytics = useMemo(
    () => computeShaderAnalytics(stats, blocked, deleted),
    [stats, blocked, deleted],
  );

  const [neverUsedExpanded, setNeverUsedExpanded] = useState(false);

  // Group never-used by category
  const neverUsedByCategory = useMemo(() => {
    const groups = new Map<string, { mode: string; label: string }[]>();
    for (const shader of analytics.neverUsed) {
      const list = groups.get(shader.category) ?? [];
      list.push({ mode: shader.mode, label: shader.label });
      groups.set(shader.category, list);
    }
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([category, shaders]) => ({ category, shaders }));
  }, [analytics.neverUsed]);

  const maxTopCount = analytics.topUsed.length > 0 ? analytics.topUsed[0].count : 1;
  const maxLeastCount = analytics.leastUsed.length > 0 ? analytics.leastUsed[analytics.leastUsed.length - 1].count : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero numbers */}
      <div style={{ display: "flex", gap: 16 }}>
        <HeroNumber
          label="Coverage"
          value={`${analytics.coveragePercent}%`}
          detail={`${analytics.usedShaders}/${analytics.activeShaders}`}
        />
        <HeroNumber
          label="Rotation"
          value={`${analytics.rotationScore}`}
          detail="/100"
        />
      </div>

      <Divider />

      {/* Never Used */}
      {analytics.neverUsed.length > 0 && (
        <>
          <div>
            <button
              onClick={() => setNeverUsedExpanded(v => !v)}
              style={{
                ...sectionLabelStyle,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>Never used</span>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>({analytics.neverUsed.length})</span>
              <svg
                width={10} height={10} viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
                style={{ transform: neverUsedExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform var(--duration-instant) ease" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {neverUsedExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {neverUsedByCategory.map(({ category, shaders }) => (
                  <div key={category}>
                    <span style={categoryTagStyle}>
                      {category} ({shaders.length})
                    </span>
                    <div style={{
                      fontFamily: "var(--font-geist-mono)",
                      fontSize: "0.68rem",
                      color: "rgba(255,255,255,0.45)",
                      lineHeight: 1.6,
                      paddingLeft: 4,
                      marginTop: 2,
                    }}>
                      {shaders.map(s => s.label).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Divider />
        </>
      )}

      {/* Category Breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={sectionLabelStyle}>Category breakdown</span>
        {analytics.categoryBreakdown.map(cat => (
          <div key={cat.category} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.68rem",
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.02em",
              }}>
                {cat.category}
              </span>
              <span style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.68rem",
                color: "rgba(255,255,255,0.45)",
              }}>
                {cat.coveragePct}% ({cat.used}/{cat.active})
              </span>
            </div>
            <div style={{
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${cat.coveragePct}%`,
                borderRadius: 2,
                background: getCategoryColor(cat.category),
                transition: "width var(--duration-fast) ease",
              }} />
            </div>
          </div>
        ))}
      </div>

      <Divider />

      {/* Most Used */}
      {analytics.topUsed.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={sectionLabelStyle}>Most used</span>
            {analytics.topUsed.map((shader, i) => (
              <UsageRow
                key={shader.mode}
                rank={i + 1}
                label={shader.label}
                count={shader.count}
                maxCount={maxTopCount}
                color="rgba(168, 85, 247, 0.5)"
              />
            ))}
          </div>
          <Divider />
        </>
      )}

      {/* Least Used */}
      {analytics.leastUsed.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={sectionLabelStyle}>Least used</span>
            {analytics.leastUsed.slice(0, 10).map((shader, i) => (
              <UsageRow
                key={shader.mode}
                rank={i + 1}
                label={shader.label}
                count={shader.count}
                maxCount={maxLeastCount > 0 ? Math.max(maxLeastCount, analytics.leastUsed[Math.min(9, analytics.leastUsed.length - 1)].count) : 1}
                color="rgba(96, 165, 250, 0.4)"
              />
            ))}
          </div>
          <Divider />
        </>
      )}

      {/* Stalest */}
      {analytics.stalest.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={sectionLabelStyle}>Stalest (days since last use)</span>
          {analytics.stalest.map((shader) => (
            <div key={shader.mode} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 22 }}>
              <span style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.68rem",
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}>
                {shader.label}
              </span>
              <span style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.68rem",
                fontWeight: 600,
                color: shader.daysSince > 7 ? "rgba(239, 68, 68, 0.7)" : "rgba(255,255,255,0.4)",
                flexShrink: 0,
                marginLeft: 8,
              }}>
                {shader.daysSince}d
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function HeroNumber({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.68rem",
        fontWeight: 600,
        color: "rgba(255,255,255,0.45)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: "-0.02em",
        }}>
          {value}
        </span>
        <span style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.68rem",
          fontWeight: 500,
          color: "rgba(255,255,255,0.45)",
        }}>
          {detail}
        </span>
      </div>
    </div>
  );
}

function UsageRow({ rank, label, count, maxCount, color }: {
  rank: number;
  label: string;
  count: number;
  maxCount: number;
  color: string;
}) {
  const widthPct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 4;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 20 }}>
      <span style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.68rem",
        fontWeight: 500,
        color: "rgba(255,255,255,0.45)",
        width: 20,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {rank}.
      </span>
      <span style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.68rem",
        fontWeight: 500,
        color: "rgba(255,255,255,0.5)",
        minWidth: 80,
        maxWidth: 100,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.68rem",
        fontWeight: 600,
        color: "rgba(255,255,255,0.45)",
        width: 28,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {count}x
      </span>
      <div style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        background: "rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${widthPct}%`,
          borderRadius: 2,
          background: color,
        }} />
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />;
}

// ── Styles ──

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.68rem",
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.45)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const categoryTagStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.68rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.45)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
