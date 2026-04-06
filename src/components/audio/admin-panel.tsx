"use client";

import { useState, useEffect, useCallback, useRef, forwardRef } from "react";
import { MODE_META } from "@/lib/shaders";
import { getProfile } from "@/lib/journeys/adaptive-engine";
import {
  getBlockedShaders,
  getDeletedShaders,
  getLovedShaders,
  getShaderStats,
  blockShader,
  unblockShader,
  deleteShader,
  undeleteShader,
} from "./journey-feedback";

// ── Types ──

interface GroupedShaders {
  category: string;
  shaders: { mode: string; label: string }[];
}

// ── Helpers ──

function groupByCategory(modes: string[]): GroupedShaders[] {
  const groups = new Map<string, { mode: string; label: string }[]>();
  for (const mode of modes) {
    const meta = MODE_META.find((m) => m.mode === mode);
    const category = meta?.category ?? "Unknown";
    const label = meta?.label ?? mode;
    const list = groups.get(category) ?? [];
    list.push({ mode, label });
    groups.set(category, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, shaders]) => ({
      category,
      shaders: shaders.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

// ── Component ──

interface AdminPanelProps {
  visible: boolean;
  onClose: () => void;
  currentShader?: string;
}

type Tab = "library" | "blocked" | "deleted" | "loved" | "stats";

export function AdminPanel({ visible, onClose, currentShader }: AdminPanelProps) {
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [visible, onClose]);

  // Auto-scroll to active shader when it changes
  useEffect(() => {
    if (!visible || !currentShader || activeTab !== "library") return;
    // Small delay to let the DOM update
    const t = setTimeout(() => {
      activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    return () => clearTimeout(t);
  }, [currentShader, visible, activeTab]);

  // Read state (re-reads on revision bump)
  const blocked = Array.from(getBlockedShaders());
  const deleted = Array.from(getDeletedShaders());
  const loved = getLovedShaders();
  const profile = getProfile();
  const stats = getShaderStats();

  // Suppress unused var warning — revision drives re-render
  void revision;

  const allShaders = MODE_META.filter((m) => m.category !== "AI Imagery");
  const totalShaders = allShaders.length;
  const blockedSet = new Set(blocked);
  const deletedSet = new Set(deleted);
  const lovedSet = new Set(loved);
  const activeShaders = allShaders.filter((m) => !blockedSet.has(m.mode) && !deletedSet.has(m.mode));
  const activeCount = activeShaders.length;
  const activeRules = profile.rules.filter((r) => r.confidence >= 0.3).length;

  // Group all shaders by category for the library view
  const allGrouped = groupByCategory(allShaders.map((m) => m.mode));

  const handleUnblock = useCallback((mode: string) => {
    unblockShader(mode);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback((mode: string) => {
    deleteShader(mode);
    refresh();
  }, [refresh]);

  const handleBlock = useCallback((mode: string) => {
    blockShader(mode);
    refresh();
  }, [refresh]);

  const handleRestore = useCallback((mode: string) => {
    undeleteShader(mode);
    refresh();
  }, [refresh]);

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        bottom: 16,
        width: 320,
        zIndex: 70,
        pointerEvents: visible ? "auto" : "none",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-24px)",
        transition: "opacity 200ms ease, transform 200ms ease",
      }}
    >
      <div
        style={{
          height: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "rgba(0, 0, 0, 0.80)",
          backdropFilter: "blur(20px) saturate(1.1)",
          WebkitBackdropFilter: "blur(20px) saturate(1.1)",
          borderRadius: 14,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={headerStyle}>Admin</span>
          <button onClick={onClose} style={closeBtnStyle} title="Close (A)">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {([
            ["library", `All (${activeCount})`],
            ["blocked", `Blocked (${blocked.length})`],
            ["deleted", `Deleted (${deleted.length})`],
            ["loved", `Loved (${loved.length})`],
            ["stats", "Stats"],
          ] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.55rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: activeTab === tab ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.30)",
                background: activeTab === tab ? "rgba(255,255,255,0.10)" : "none",
                border: `1px solid ${activeTab === tab ? "rgba(255,255,255,0.15)" : "transparent"}`,
                borderRadius: 5,
                padding: "4px 8px",
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <Divider />

        {/* Library — all shaders with status + actions */}
        {activeTab === "library" && allGrouped.map((group) => (
          <CategoryGroup key={group.category} category={group.category}>
            {group.shaders.map(({ mode, label }) => {
              const isBlocked = blockedSet.has(mode);
              const isDeleted = deletedSet.has(mode);
              const isLoved = lovedSet.has(mode);
              const isActive = mode === currentShader;
              return (
                <ShaderRow key={mode} ref={isActive ? activeRowRef : undefined} label={label} stats={stats[mode]} status={isDeleted ? "deleted" : isBlocked ? "blocked" : isLoved ? "loved" : undefined} active={isActive}>
                  {isDeleted ? (
                    <SmallButton onClick={() => handleRestore(mode)} color="blue">Restore</SmallButton>
                  ) : isBlocked ? (
                    <>
                      <SmallButton onClick={() => handleUnblock(mode)} color="green">Unblock</SmallButton>
                      <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>
                    </>
                  ) : (
                    <>
                      <SmallButton onClick={() => handleBlock(mode)} color="yellow">Block</SmallButton>
                      <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>
                    </>
                  )}
                </ShaderRow>
              );
            })}
          </CategoryGroup>
        ))}

        {/* Blocked Shaders */}
        {activeTab === "blocked" && (blocked.length === 0 ? (
          <EmptyText>No blocked shaders</EmptyText>
        ) : (
          groupByCategory(blocked).map((group) => (
            <CategoryGroup key={group.category} category={group.category}>
              {group.shaders.map(({ mode, label }) => (
                <ShaderRow key={mode} label={label} stats={stats[mode]}>
                  <SmallButton onClick={() => handleUnblock(mode)} color="green">Unblock</SmallButton>
                  <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>
                </ShaderRow>
              ))}
            </CategoryGroup>
          ))
        ))}

        {/* Deleted Shaders */}
        {activeTab === "deleted" && (deleted.length === 0 ? (
          <EmptyText>No deleted shaders</EmptyText>
        ) : (
          groupByCategory(deleted).map((group) => (
            <CategoryGroup key={group.category} category={group.category}>
              {group.shaders.map(({ mode, label }) => (
                <ShaderRow key={mode} label={label} stats={stats[mode]}>
                  <SmallButton onClick={() => handleRestore(mode)} color="blue">Restore</SmallButton>
                </ShaderRow>
              ))}
            </CategoryGroup>
          ))
        ))}

        {/* Loved Shaders */}
        {activeTab === "loved" && (loved.length === 0 ? (
          <EmptyText>No loved shaders</EmptyText>
        ) : (
          groupByCategory(loved).map((group) => (
            <CategoryGroup key={group.category} category={group.category}>
              {group.shaders.map(({ mode, label }) => (
                <ShaderRow key={mode} label={label} stats={stats[mode]} />
              ))}
            </CategoryGroup>
          ))
        ))}

        {/* Stats */}
        {activeTab === "stats" && (
          <Section title="stats">
            <StatLine label="Active shaders" value={`${activeCount} / ${totalShaders}`} />
            <StatLine label="Blocked" value={String(blocked.length)} />
            <StatLine label="Deleted" value={String(deleted.length)} />
            <StatLine label="Loved" value={String(loved.length)} />
            <StatLine label="Adaptive rules" value={String(activeRules)} />
            <StatLine label="Snapshots processed" value={String(profile.totalProcessed)} />
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={sectionLabelStyle}>
        {title}
        {count != null && <span style={{ color: "rgba(255,255,255,0.45)", marginLeft: 6 }}>({count})</span>}
      </span>
      {children}
    </div>
  );
}

function CategoryGroup({ category, children }: { category: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 4 }}>
      <span style={categoryTagStyle}>{category}</span>
      {children}
    </div>
  );
}

const ShaderRow = forwardRef<HTMLDivElement, {
  label: string;
  stats?: { usageCount: number; lovedCount: number; blockedCount: number };
  status?: "blocked" | "deleted" | "loved";
  active?: boolean;
  children?: React.ReactNode;
}>(function ShaderRow({ label, stats, status, active, children }, ref) {
  const statusColors: Record<string, string> = {
    blocked: "rgba(239, 68, 68, 0.6)",
    deleted: "rgba(239, 68, 68, 0.4)",
    loved: "rgba(74, 222, 128, 0.6)",
  };
  return (
    <div ref={ref} style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      minHeight: 28,
      paddingLeft: 8,
      opacity: status === "deleted" ? 0.45 : status === "blocked" ? 0.6 : 1,
      background: active ? "rgba(255,255,255,0.08)" : undefined,
      borderRadius: active ? 6 : undefined,
      transition: "background 200ms ease",
    }}>
      <span style={{
        ...shaderLabelStyle,
        color: active ? "rgba(255,255,255,0.95)" : shaderLabelStyle.color,
        fontWeight: active ? 600 : shaderLabelStyle.fontWeight,
      }}>{label}</span>
      {status && (
        <span style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.45rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: statusColors[status],
          flexShrink: 0,
        }}>
          {status === "loved" ? "\u2665" : status}
        </span>
      )}
      {stats && stats.usageCount > 0 && (
        <span style={usageStyle} title={`Used ${stats.usageCount}x`}>{stats.usageCount}x</span>
      )}
      <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
});

function SmallButton({ onClick, color, children }: {
  onClick: () => void;
  color: "green" | "red" | "blue" | "yellow";
  children: React.ReactNode;
}) {
  const colors = {
    green: { bg: "rgba(74, 222, 128, 0.12)", border: "rgba(74, 222, 128, 0.25)", text: "rgba(74, 222, 128, 0.85)" },
    red: { bg: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.25)", text: "rgba(239, 68, 68, 0.85)" },
    blue: { bg: "rgba(96, 165, 250, 0.12)", border: "rgba(96, 165, 250, 0.25)", text: "rgba(96, 165, 250, 0.85)" },
    yellow: { bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.25)", text: "rgba(251, 191, 36, 0.85)" },
  };
  const c = colors[color];
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: c.text,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 5,
        padding: "3px 7px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 22 }}>
      <span style={statLabelStyle}>{label}</span>
      <span style={statValueStyle}>{value}</span>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: "var(--font-geist-mono)",
      fontSize: "0.65rem",
      color: "rgba(255,255,255,0.25)",
      fontStyle: "italic",
      paddingLeft: 4,
    }}>
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />;
}

// ── Styles ──

const headerStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.6)",
};

const closeBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 6,
  cursor: "pointer",
  padding: 0,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.6rem",
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.30)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const categoryTagStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.55rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.20)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  paddingLeft: 4,
};

const shaderLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.7rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.55)",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

const usageStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.55rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.20)",
  flexShrink: 0,
};

const statLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.65rem",
  fontWeight: 500,
  color: "rgba(255,255,255,0.40)",
  letterSpacing: "0.02em",
};

const statValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.65rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.65)",
  letterSpacing: "0.02em",
};
