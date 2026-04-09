"use client";

import { useState, useEffect, useCallback, useRef, forwardRef } from "react";
import { MODE_META, type ModeMeta } from "@/lib/shaders";
import { getProfile } from "@/lib/journeys/adaptive-engine";
import { useShaderPreferences } from "@/lib/shader-preferences";
import { getShaderStats } from "./journey-feedback";

function isNewShader(meta: ModeMeta): boolean {
  if (!meta.addedDate) return false;
  const added = new Date(meta.addedDate);
  const now = new Date();
  const diffDays = (now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 14;
}

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
  isAdmin?: boolean;
  onSwitchShader?: (mode: string) => void;
  onPrevShader?: () => void;
  onNextShader?: () => void;
}

type Tab = "library" | "new" | "blocked" | "deleted" | "loved" | "stats";

export function AdminPanel({ visible, onClose, currentShader, isAdmin = false, onSwitchShader, onPrevShader, onNextShader }: AdminPanelProps) {
  const prefs = useShaderPreferences();
  const [activeTab, setActiveTab] = useState<Tab>("library");
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

  // Read state from Zustand store (auto-rerenders on change)
  const blocked = Array.from(prefs.blocked);
  const deleted = Array.from(prefs.deleted);
  const loved = Array.from(prefs.loved);
  const profile = getProfile();
  const stats = getShaderStats();

  const allShaders = MODE_META.filter((m) => m.category !== "AI Imagery");
  const validModes: Set<string> = new Set(allShaders.map((m) => m.mode));
  const totalShaders = allShaders.length;
  // Filter out stale entries for shaders that no longer exist in the codebase
  const blockedSet = new Set(blocked.filter((m) => validModes.has(m)));
  const deletedSet = new Set(deleted.filter((m) => validModes.has(m)));
  const lovedSet = new Set(loved.filter((m) => validModes.has(m)));
  const activeShaders = allShaders.filter((m) => !blockedSet.has(m.mode) && !deletedSet.has(m.mode));
  const activeCount = activeShaders.length;
  const activeRules = profile.rules.filter((r) => r.confidence >= 0.3).length;
  const newShaders = allShaders.filter(isNewShader);
  const newCount = newShaders.length;

  // Group all shaders by category for the library view
  const allGrouped = groupByCategory(allShaders.map((m) => m.mode));
  const newGrouped = groupByCategory(newShaders.map((m) => m.mode));

  const handleUnblock = useCallback((mode: string) => {
    prefs.unblockShader(mode);
  }, [prefs]);

  const handleDelete = useCallback((mode: string) => {
    prefs.deleteShader(mode);
  }, [prefs]);

  const handleBlock = useCallback((mode: string) => {
    prefs.blockShader(mode);
  }, [prefs]);

  const handleRestore = useCallback((mode: string) => {
    prefs.undeleteShader(mode);
  }, [prefs]);

  const handleFavorite = useCallback((mode: string) => {
    if (prefs.loved.has(mode)) {
      prefs.unloveShader(mode);
    } else {
      prefs.loveShader(mode);
    }
  }, [prefs]);

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

        {/* Current shader with prev/next arrows */}
        {currentShader && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "6px 0",
          }}>
            <button
              onClick={onPrevShader}
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 5,
                cursor: "pointer",
                color: "rgba(255,255,255,0.4)",
                padding: 0,
                flexShrink: 0,
              }}
              title="Previous shader"
            >
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.02em",
              textAlign: "center",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {MODE_META.find((m) => m.mode === currentShader)?.label ?? currentShader}
            </span>
            <button
              onClick={onNextShader}
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 5,
                cursor: "pointer",
                color: "rgba(255,255,255,0.4)",
                padding: 0,
                flexShrink: 0,
              }}
              title="Next shader"
            >
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {([
            ["library", `All (${activeCount})`],
            ...(newCount > 0 ? [["new", `New (${newCount})`]] : []),
            ["blocked", `Blocked (${blockedSet.size})`],
            ...(isAdmin ? [["deleted", `Deleted (${deletedSet.size})`]] : []),
            ["loved", `Fav (${lovedSet.size})`],
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
              const metaEntry = MODE_META.find((m) => m.mode === mode);
              const shaderIsNew = metaEntry ? isNewShader(metaEntry) : false;
              return (
                <ShaderRow key={mode} ref={isActive ? activeRowRef : undefined} label={label} stats={stats[mode]} status={isDeleted ? "deleted" : isBlocked ? "blocked" : isLoved ? "loved" : undefined} isNew={shaderIsNew} active={isActive} onClick={onSwitchShader ? () => onSwitchShader(mode) : undefined}>
                  {isDeleted ? (
                    isAdmin && <SmallButton onClick={() => handleRestore(mode)} color="blue">Restore</SmallButton>
                  ) : isBlocked ? (
                    <>
                      <SmallButton onClick={() => handleUnblock(mode)} color="green">Unblock</SmallButton>
                      {isAdmin && <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>}
                    </>
                  ) : (
                    <>
                      <FavButton active={isLoved} onClick={() => handleFavorite(mode)} />
                      <SmallButton onClick={() => handleBlock(mode)} color="yellow">Block</SmallButton>
                      {isAdmin && <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>}
                    </>
                  )}
                </ShaderRow>
              );
            })}
          </CategoryGroup>
        ))}

        {/* New Shaders */}
        {activeTab === "new" && (newCount === 0 ? (
          <EmptyText>No new shaders</EmptyText>
        ) : (
          newGrouped.map((group) => (
            <CategoryGroup key={group.category} category={group.category}>
              {group.shaders.map(({ mode, label }) => {
                const isBlocked = blockedSet.has(mode);
                const isDeleted = deletedSet.has(mode);
                const isLoved = lovedSet.has(mode);
                const isActive = mode === currentShader;
                return (
                  <ShaderRow key={mode} ref={isActive ? activeRowRef : undefined} label={label} stats={stats[mode]} status={isDeleted ? "deleted" : isBlocked ? "blocked" : isLoved ? "loved" : undefined} isNew active={isActive} onClick={onSwitchShader ? () => onSwitchShader(mode) : undefined}>
                    {isDeleted ? (
                      isAdmin && <SmallButton onClick={() => handleRestore(mode)} color="blue">Restore</SmallButton>
                    ) : isBlocked ? (
                      <>
                        <SmallButton onClick={() => handleUnblock(mode)} color="green">Unblock</SmallButton>
                        {isAdmin && <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>}
                      </>
                    ) : (
                      <>
                        <FavButton active={isLoved} onClick={() => handleFavorite(mode)} />
                        <SmallButton onClick={() => handleBlock(mode)} color="yellow">Block</SmallButton>
                        {isAdmin && <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>}
                      </>
                    )}
                  </ShaderRow>
                );
              })}
            </CategoryGroup>
          ))
        ))}

        {/* Blocked Shaders */}
        {activeTab === "blocked" && (blockedSet.size === 0 ? (
          <EmptyText>No blocked shaders</EmptyText>
        ) : (
          groupByCategory([...blockedSet]).map((group) => (
            <CategoryGroup key={group.category} category={group.category}>
              {group.shaders.map(({ mode, label }) => (
                <ShaderRow key={mode} label={label} stats={stats[mode]}>
                  <SmallButton onClick={() => handleUnblock(mode)} color="green">Unblock</SmallButton>
                  {isAdmin && <SmallButton onClick={() => handleDelete(mode)} color="red">Delete</SmallButton>}
                </ShaderRow>
              ))}
            </CategoryGroup>
          ))
        ))}

        {/* Deleted Shaders */}
        {activeTab === "deleted" && (deletedSet.size === 0 ? (
          <EmptyText>No deleted shaders</EmptyText>
        ) : (
          groupByCategory([...deletedSet]).map((group) => (
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
        {activeTab === "loved" && (lovedSet.size === 0 ? (
          <EmptyText>No favorite shaders</EmptyText>
        ) : (
          groupByCategory([...lovedSet]).map((group) => (
            <CategoryGroup key={group.category} category={group.category}>
              {group.shaders.map(({ mode, label }) => (
                <ShaderRow key={mode} label={label} stats={stats[mode]} status="loved">
                  <FavButton active onClick={() => handleFavorite(mode)} />
                </ShaderRow>
              ))}
            </CategoryGroup>
          ))
        ))}

        {/* Stats */}
        {activeTab === "stats" && (
          <Section title="stats">
            <StatLine label="Active shaders" value={`${activeCount} / ${totalShaders}`} />
            <StatLine label="Blocked" value={String(blockedSet.size)} />
            <StatLine label="Deleted" value={String(deletedSet.size)} />
            <StatLine label="Loved" value={String(lovedSet.size)} />
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
  isNew?: boolean;
  active?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}>(function ShaderRow({ label, stats, status, isNew, active, onClick, children }, ref) {
  const statusColors: Record<string, string> = {
    blocked: "rgba(239, 68, 68, 0.6)",
    deleted: "rgba(239, 68, 68, 0.4)",
    loved: "rgba(251, 191, 36, 0.7)",
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
      <span
        onClick={onClick}
        style={{
          ...shaderLabelStyle,
          color: active ? "rgba(255,255,255,0.95)" : shaderLabelStyle.color,
          fontWeight: active ? 600 : shaderLabelStyle.fontWeight,
          cursor: onClick ? "pointer" : undefined,
        }}
      >{label}</span>
      {isNew && (
        <span style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.45rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "rgba(168, 85, 247, 0.9)",
          background: "rgba(168, 85, 247, 0.12)",
          border: "1px solid rgba(168, 85, 247, 0.25)",
          borderRadius: 3,
          padding: "1px 4px",
          flexShrink: 0,
        }}>
          NEW
        </span>
      )}
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
          {status === "loved" ? "\u2605" : status}
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

function FavButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? "Remove from favorites" : "Add to favorites"}
      style={{
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "rgba(251, 191, 36, 0.15)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(251, 191, 36, 0.30)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 5,
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "all 150ms ease",
      }}
    >
      <svg width={11} height={11} viewBox="0 0 24 24" fill={active ? "rgba(251, 191, 36, 0.9)" : "none"} stroke={active ? "rgba(251, 191, 36, 0.9)" : "rgba(255,255,255,0.25)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}

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
