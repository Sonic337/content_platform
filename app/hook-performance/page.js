"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { tierColors } from "@/lib/tierColor";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };
const serif = { fontFamily: "var(--font-fraunces)" };
const sans = { fontFamily: "var(--font-ibm-plex-sans)" };

const labelStyle = {
  ...mono,
  display: "block",
  marginBottom: "5px",
  fontSize: "10px",
  color: "#7C8489",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

function tierRank(tier) {
  if (!tier) return 99;
  const s = tier.toUpperCase();
  if (s.startsWith("VERIFIED 3")) return 0;
  if (s.startsWith("VERIFIED 2")) return 1;
  if (s.startsWith("VERIFIED")) return 2;
  if (s.includes("SOURCED")) return 3;
  if (s.includes("UNVERIFIED")) return 4;
  if (s.includes("NOT CONFIRMED")) return 5;
  if (s.includes("REFUTED")) return 6;
  return 99;
}

function fmt(n) {
  if (n == null) return null;
  return n.toLocaleString();
}

export default function HookPerformancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // 1. Approved / published runs that have a selected hook
      const { data: runs, error: runsErr } = await supabase
        .from("pipeline_runs")
        .select("id, selected_hook, selected_title, target_platform, status, created_at")
        .in("status", ["approved", "published"])
        .not("selected_hook", "is", null)
        .order("created_at", { ascending: false });

      if (runsErr) { setError(runsErr.message); setLoading(false); return; }
      if (!runs?.length) { setRows([]); setLoading(false); return; }

      // 2. All hooks — build a Map for exact-match lookup (hook_text → evidence_tier)
      const { data: hooks } = await supabase
        .from("hooks")
        .select("hook_text, evidence_tier")
        .limit(2000);

      const hookMap = new Map((hooks ?? []).map((h) => [h.hook_text, h.evidence_tier]));

      // 3. Analytics for these run IDs
      const runIds = runs.map((r) => r.id);
      const { data: analytics } = await supabase
        .from("analytics")
        .select("pipeline_run_id, views, likes, comments, shares, saves")
        .in("pipeline_run_id", runIds);

      // Group analytics by run ID; aggregate totals
      const analyticsMap = new Map();
      for (const a of analytics ?? []) {
        if (!analyticsMap.has(a.pipeline_run_id)) {
          analyticsMap.set(a.pipeline_run_id, { views: 0, likes: 0, comments: 0, entries: 0 });
        }
        const acc = analyticsMap.get(a.pipeline_run_id);
        acc.views += a.views ?? 0;
        acc.likes += a.likes ?? 0;
        acc.comments += a.comments ?? 0;
        acc.entries += 1;
      }

      // 4. Join and sort by tier rank
      const joined = runs.map((run) => {
        const exactMatch = hookMap.has(run.selected_hook);
        const evidence_tier = exactMatch ? hookMap.get(run.selected_hook) : null;
        const perf = analyticsMap.get(run.id) ?? null;
        return { ...run, evidence_tier, exactMatch, perf };
      });

      joined.sort((a, b) => tierRank(a.evidence_tier) - tierRank(b.evidence_tier));
      setRows(joined);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <h1
        style={{
          marginBottom: "4px",
          ...sans,
          fontSize: "18px",
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: "#E8E6DE",
        }}
      >
        Hook performance
      </h1>
      <p style={{ marginBottom: "28px", ...mono, fontSize: "12px", color: "#7C8489" }}>
        Approved and published runs — hook text matched against the bank for evidence tier, joined to any logged analytics.
      </p>

      {loading && (
        <div style={{ ...mono, fontSize: "12px", color: "#7C8489" }}>Loading…</div>
      )}
      {error && (
        <div style={{ ...mono, fontSize: "12px", color: "#C96158", border: "1px solid #B4483F", borderRadius: "3px", padding: "8px 12px" }}>
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ ...mono, fontSize: "12px", color: "#7C8489", padding: "32px", textAlign: "center", border: "1px solid #232B31", borderRadius: "3px" }}>
          No approved or published runs with a selected hook yet.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Column header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 130px 180px 140px",
              gap: "12px",
              padding: "6px 16px",
              ...mono,
              fontSize: "10px",
              color: "#7C8489",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              borderBottom: "1px solid #232B31",
              marginBottom: "0",
            }}
          >
            <span>Hook text</span>
            <span>Evidence tier</span>
            <span>Platform</span>
            <span>Analytics</span>
            <span>Approved</span>
          </div>

          <div style={{ borderTop: "1px solid #232B31" }}>
            {rows.map((row) => {
              const tc = row.evidence_tier ? tierColors(row.evidence_tier) : { border: "#232B31", text: "#7C8489" };
              const approvedDate = row.created_at
                ? new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—";

              let tierLabel;
              if (row.exactMatch && row.evidence_tier) {
                tierLabel = (
                  <span style={{ ...mono, fontSize: "11px", color: tc.text }}>
                    {row.evidence_tier}
                  </span>
                );
              } else if (row.exactMatch && !row.evidence_tier) {
                tierLabel = (
                  <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>bank match, no tier</span>
                );
              } else {
                tierLabel = (
                  <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>generated, no tier</span>
                );
              }

              let analyticsCell;
              if (!row.perf) {
                analyticsCell = (
                  <span style={{ ...mono, fontSize: "11px", color: "#7C8489" }}>no analytics logged yet</span>
                );
              } else {
                const parts = [];
                if (row.perf.views) parts.push(`${fmt(row.perf.views)} views`);
                if (row.perf.likes) parts.push(`${fmt(row.perf.likes)} likes`);
                if (row.perf.comments) parts.push(`${fmt(row.perf.comments)} comments`);
                analyticsCell = (
                  <span style={{ ...mono, fontSize: "11px", color: "#E8E6DE" }}>
                    {parts.length ? parts.join(" · ") : "logged, no metrics"}
                    {row.perf.entries > 1 && (
                      <span style={{ color: "#7C8489" }}> ({row.perf.entries} entries)</span>
                    )}
                  </span>
                );
              }

              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 130px 180px 140px",
                    gap: "12px",
                    alignItems: "start",
                    padding: "14px 16px",
                    borderLeft: `3px solid ${tc.border}`,
                    borderBottom: "1px solid #232B31",
                    backgroundColor: "#171D21",
                  }}
                >
                  {/* Hook text */}
                  <div>
                    <div style={{ ...serif, fontSize: "13px", lineHeight: "1.55", color: "#E8E6DE", marginBottom: "4px" }}>
                      {row.selected_hook.length > 120
                        ? row.selected_hook.slice(0, 117) + "…"
                        : row.selected_hook}
                    </div>
                    {row.selected_title && (
                      <div style={{ ...mono, fontSize: "10px", color: "#7C8489" }}>
                        {row.selected_title.length > 80 ? row.selected_title.slice(0, 77) + "…" : row.selected_title}
                      </div>
                    )}
                  </div>

                  {/* Evidence tier */}
                  <div style={{ paddingTop: "2px" }}>{tierLabel}</div>

                  {/* Platform */}
                  <div style={{ ...mono, fontSize: "11px", color: "#7C8489", paddingTop: "2px" }}>
                    {row.target_platform}
                    <br />
                    <span style={{ color: row.status === "published" ? "#5FA97D" : "#D9A257" }}>
                      {row.status}
                    </span>
                  </div>

                  {/* Analytics */}
                  <div style={{ paddingTop: "2px" }}>{analyticsCell}</div>

                  {/* Date */}
                  <div style={{ ...mono, fontSize: "11px", color: "#7C8489", paddingTop: "2px" }}>
                    {approvedDate}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
