"use client";

import { useEffect, useState } from "react";
import DataTable from "@/components/DataTable";
import { supabase } from "@/lib/supabaseClient";

const mono = { fontFamily: "var(--font-ibm-plex-mono)" };
const sans = { fontFamily: "var(--font-ibm-plex-sans)" };

const COLUMNS = [
  { key: "platform", label: "Platform" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "posted_at", label: "Posted" },
];

const FORM_FIELDS = [
  { key: "platform", label: "Platform", type: "text" },
  { key: "post_url", label: "Post URL", type: "text" },
  { key: "posted_at", label: "Posted at (YYYY-MM-DD)", type: "text" },
  { key: "views", label: "Views", type: "numeric" },
  { key: "likes", label: "Likes", type: "numeric" },
  { key: "comments", label: "Comments", type: "numeric" },
  { key: "shares", label: "Shares", type: "numeric" },
  { key: "saves", label: "Saves", type: "numeric" },
  { key: "avg_watch_time_sec", label: "Avg watch time (sec)", type: "numeric" },
  { key: "retention_pct", label: "Retention %", type: "numeric" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const selectStyle = {
  borderRadius: "3px",
  border: "1px solid #232B31",
  backgroundColor: "#171D21",
  padding: "7px 10px",
  fontSize: "13px",
  color: "#E8E6DE",
  fontFamily: "var(--font-ibm-plex-mono)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export default function AnalyticsPage() {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [tableKey, setTableKey] = useState(0);

  useEffect(() => {
    async function loadRuns() {
      const { data } = await supabase
        .from("pipeline_runs")
        .select("id, selected_title, script, target_platform, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setRuns(data || []);
    }
    loadRuns();
  }, []);

  function runLabel(run) {
    const title =
      run.selected_title ||
      (run.script ? run.script.slice(0, 60) + (run.script.length > 60 ? "…" : "") : null);
    const platform = run.target_platform ? ` [${run.target_platform}]` : "";
    const date = run.created_at ? ` — ${run.created_at.slice(0, 10)}` : "";
    return title ? `${title}${platform}${date}` : `Run ${run.id}${platform}${date}`;
  }

  const extraPayload = selectedRunId
    ? { pipeline_run_id: Number(selectedRunId) }
    : {};

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
        Analytics
      </h1>
      <p
        style={{
          marginBottom: "24px",
          ...mono,
          fontSize: "12px",
          color: "#7C8489",
        }}
      >
        Post performance — manual entry only.
      </p>

      {/* Pipeline run selector */}
      <div style={{ marginBottom: "24px", maxWidth: "480px" }}>
        <label
          style={{
            ...mono,
            display: "block",
            marginBottom: "6px",
            fontSize: "10px",
            color: "#7C8489",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Link to pipeline run (optional)
        </label>
        <select
          value={selectedRunId}
          onChange={(e) => setSelectedRunId(e.target.value)}
          style={selectStyle}
        >
          <option value="">— No linked run —</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {runLabel(run)}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        key={tableKey}
        table="analytics"
        filterKey="platform"
        columns={COLUMNS}
        formFields={FORM_FIELDS}
        extraPayload={extraPayload}
        getRowColors={() => ({ border: "#7C8489", text: "#7C8489" })}
        bodyKey="platform"
      />
    </div>
  );
}
