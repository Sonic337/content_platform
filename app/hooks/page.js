"use client";

import { useState } from "react";
import DataTable from "@/components/DataTable";
import { tierColors } from "@/lib/tierColor";
import { supabase } from "@/lib/supabaseClient";

const ALL_EVIDENCE_TIERS = [
  "VERIFIED 3-0",
  "VERIFIED 2-1",
  "SOURCED UNVERIFIED",
  "UNVERIFIED-OBSERVED",
  "UNVERIFIED/MIXED",
  "NOT CONFIRMED",
  "REFUTED",
];

const DEFAULT_EXCLUDED_TIERS = ["NOT CONFIRMED", "REFUTED"];

const TRANSFORM_PLATFORMS = [
  { value: "x", label: "X (Twitter)" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram_reels", label: "Instagram Reels" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "linkedin", label: "LinkedIn" },
];

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };
const serif = { fontFamily: "var(--font-fraunces)" };

export default function HooksPage() {
  // platformSelections: hookId → platform value string
  const [platformSelections, setPlatformSelections] = useState({});
  // transformResults: `${hookId}:${platform}` → { text, tier, loading, error }
  const [transformResults, setTransformResults] = useState({});

  function getResultKey(hookId, platform) {
    return `${hookId}:${platform}`;
  }

  async function handleTransform(row) {
    const hookId = row.id;
    const platform = platformSelections[hookId];
    if (!platform) return;

    const key = getResultKey(hookId, platform);

    // Already have a result (cached in component state) — do nothing
    if (transformResults[key]?.text) return;

    // Mark loading
    setTransformResults((prev) => ({ ...prev, [key]: { loading: true, error: null, text: null, tier: null } }));

    // Check DB cache first
    const { data: cached } = await supabase
      .from("hook_transforms")
      .select("transformed_text")
      .eq("source_hook_id", hookId)
      .eq("target_platform", platform)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.transformed_text) {
      console.log("[transform] cache hit for", key);
      setTransformResults((prev) => ({
        ...prev,
        [key]: { loading: false, error: null, text: cached.transformed_text, tier: row.evidence_tier ?? null, fromCache: true },
      }));
      return;
    }

    // Cache miss — call the API
    console.log("[transform] cache miss, calling API for", key);
    try {
      const res = await fetch("/api/transform-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook_id: hookId, target_platform: platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransformResults((prev) => ({
          ...prev,
          [key]: { loading: false, error: data.error ?? "Transform failed", text: null, tier: null },
        }));
      } else {
        setTransformResults((prev) => ({
          ...prev,
          [key]: { loading: false, error: null, text: data.transformed_text, tier: data.evidence_tier, fromCache: false },
        }));
      }
    } catch (err) {
      setTransformResults((prev) => ({
        ...prev,
        [key]: { loading: false, error: err.message, text: null, tier: null },
      }));
    }
  }

  function renderRowFooter(row) {
    const hookId = row.id;
    const platform = platformSelections[hookId] ?? "";
    const key = platform ? getResultKey(hookId, platform) : null;
    const result = key ? transformResults[key] : null;
    const tc = result?.tier ? tierColors(result.tier) : null;

    return (
      <div style={{ marginTop: "12px", borderTop: "1px solid #1C2329", paddingTop: "10px" }}>
        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ ...mono, fontSize: "10px", color: "#7C8489", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Transform for
          </span>
          <select
            value={platform}
            onChange={(e) =>
              setPlatformSelections((prev) => ({ ...prev, [hookId]: e.target.value }))
            }
            style={{
              ...mono,
              borderRadius: "3px",
              border: "1px solid #232B31",
              backgroundColor: "#10151A",
              padding: "3px 8px",
              fontSize: "11px",
              color: "#E8E6DE",
              cursor: "pointer",
            }}
          >
            <option value="">Platform…</option>
            {TRANSFORM_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            disabled={!platform || result?.loading}
            onClick={() => handleTransform(row)}
            style={{
              ...mono,
              borderRadius: "3px",
              border: `1px solid ${!platform || result?.loading ? "#232B31" : "#4C9A6A"}`,
              backgroundColor: "transparent",
              padding: "3px 10px",
              fontSize: "11px",
              color: !platform || result?.loading ? "#7C8489" : "#5FA97D",
              cursor: !platform || result?.loading ? "not-allowed" : "pointer",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {result?.loading ? "Working…" : result?.text ? "Re-run" : "→ Transform"}
          </button>
          {result?.fromCache && (
            <span style={{ ...mono, fontSize: "10px", color: "#7C8489" }}>cached</span>
          )}
        </div>

        {/* Result */}
        {result?.error && (
          <div style={{ ...mono, fontSize: "11px", color: "#C96158", marginTop: "8px" }}>
            {result.error}
          </div>
        )}
        {result?.text && (
          <div
            style={{
              marginTop: "10px",
              borderLeft: `2px solid ${tc?.border ?? "#232B31"}`,
              paddingLeft: "12px",
            }}
          >
            <div style={{ ...mono, fontSize: "10px", color: "#7C8489", marginBottom: "5px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {TRANSFORM_PLATFORMS.find((p) => p.value === platform)?.label ?? platform}
              {result.tier && (
                <span style={{ color: tc?.text ?? "#7C8489", marginLeft: "8px" }}>{result.tier}</span>
              )}
            </div>
            <div style={{ ...serif, fontSize: "14px", lineHeight: "1.6", color: "#E8E6DE" }}>
              {result.text}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1
        style={{
          marginBottom: "4px",
          fontFamily: "var(--font-ibm-plex-sans)",
          fontSize: "18px",
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: "#E8E6DE",
        }}
      >
        Hook bank
      </h1>
      <p
        style={{
          marginBottom: "28px",
          fontFamily: "var(--font-ibm-plex-mono)",
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Seeded from master_hook_bank.xlsx. Evidence tier tells you whether a
        hook is safe to reuse or still a hypothesis.
      </p>
      <DataTable
        table="hooks"
        bodyKey="hook_text"
        tierKey="evidence_tier"
        getRowColors={(row) => tierColors(row.evidence_tier)}
        tierFilterKey="evidence_tier"
        allTierOptions={ALL_EVIDENCE_TIERS}
        defaultExcludedTiers={DEFAULT_EXCLUDED_TIERS}
        usageKey="times_used"
        usageWarnAt={5}
        columns={[
          { key: "hook_text", label: "Hook" },
          { key: "platform", label: "Platform" },
          { key: "category_pattern", label: "Category" },
          { key: "evidence_tier", label: "Evidence" },
          { key: "times_used", label: "Used", format: (v) => `${v ?? 0}×` },
          {
            key: "last_used_at",
            label: "Last used",
            format: (v) => v ? new Date(v).toLocaleDateString() : "",
          },
        ]}
        formFields={[
          { key: "hook_text", label: "Hook text", type: "textarea" },
          { key: "platform", label: "Platform", type: "text" },
          { key: "category_pattern", label: "Category / pattern", type: "text" },
          { key: "creator_archetype", label: "Creator archetype", type: "text" },
          { key: "mechanism", label: "Mechanism", type: "textarea" },
          {
            key: "evidence_tier",
            label: "Evidence tier",
            type: "select",
            options: ALL_EVIDENCE_TIERS,
          },
          { key: "source_report", label: "Source report", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        renderRowFooter={renderRowFooter}
      />
    </div>
  );
}
